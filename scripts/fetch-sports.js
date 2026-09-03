#!/usr/bin/env node
/**
 * LE RADAR — Agrégateur résultats sportifs étudiants (RSEQ)
 *
 * Lit sports-leagues.json, appelle l’API diffusion S1 (GetLeagueDiffusion),
 * écrit un sports.json mince pour le site statique.
 *
 * Source : https://s1.rseq.ca/api/LeagueApi/GetLeagueDiffusion/?leagueId=
 * (collégial + universitaire QC ; les unis RSEQ = conférence U Sports locale)
 *
 * Usage:
 *   node scripts/fetch-sports.js           # dry-run résumé
 *   node scripts/fetch-sports.js --update  # écrit sports.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const LEAGUES_PATH = path.join(ROOT, 'sports-leagues.json');
const OUT_PATH = path.join(ROOT, 'sports.json');
const API = 'https://s1.rseq.ca/api/LeagueApi/GetLeagueDiffusion/?leagueId=';
const SCORE_NONE = -999;

const {
  loadSportsTeamsRegistry,
  resolveSportsTeam,
  applyRegistryToTeam,
  codeFromName: registryCodeFromName,
} = require('./sports-teams-lib');

const SportsFreshness = require('./sports-freshness-lib');
const SportsLive = require('./sports-live-lib');
const { buildSportsMastheadPayload } = require('./sports-masthead-lib');
const { preserveHarvestCatalogStats } = require('./harvest-freshness-lib');

const update = process.argv.includes('--update');
const liveOnly = process.argv.includes('--live');
const GAME_API = 'https://s1.rseq.ca/api/GameApi/GetGameDiffusion/?gameId=';

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'le-radar.ca sports-bot/1.0 (https://le-radar.ca)',
        },
        timeout: 25000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          getJson(res.headers.location).then(resolve, reject);
          res.resume();
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`timeout ${url}`));
    });
  });
}

function codeFromName(name) {
  return registryCodeFromName(name);
}

function hasScore(game) {
  const h = game.HomeTeamScore;
  const v = game.VisitingTeamScore;
  return Number.isFinite(h) && Number.isFinite(v) && h !== SCORE_NONE && v !== SCORE_NONE;
}

function gameDate(game) {
  return game.GameDateFormatted || game.GameDateText || (game.GameDate || '').slice(0, 10) || '';
}

function allGames(league) {
  return []
    .concat(league.PreSeasonGames || [])
    .concat(league.RegularSeasonGames || [])
    .concat(league.PostSeasonGames || [])
    .concat(league.ChampionshipGames || [])
    .concat(league.ConferenceChampionshipGames || []);
}

async function liveDetailsForGames(games) {
  const map = {};
  const ids = [...new Set(
    (games || [])
      .filter((g) => SportsLive.isLiveRaw(g))
      .map((g) => g.GameId)
      .filter(Boolean),
  )];
  for (const id of ids) {
    try {
      map[id] = await getJson(GAME_API + id);
    } catch (err) {
      process.stderr.write(`(live ${String(id).slice(0, 8)}: ${err.message}) `);
    }
  }
  return map;
}

function gamePageUrl(gameId, leagueId) {
  if (gameId) {
    return `https://diffusion.rseq.ca/Default.aspx?Type=Game&GameId=${gameId}`;
  }
  if (leagueId) {
    return `https://diffusion.rseq.ca/?Type=League&LeagueId=${leagueId}`;
  }
  return 'https://www.rseq-stats.ca/';
}

function normalizeGame(game, teamId, meta, reg) {
  const home = game.HomeTeamId === teamId;
  const rawOppName = home ? game.VisitingTeamName : game.HomeTeamName;
  const rawOppCode =
    (home ? game.VisitingTeamCode : game.HomeTeamCode) || codeFromName(rawOppName);
  const opp = resolveSportsTeam(reg, {
    name: rawOppName,
    code: rawOppCode,
    sector: meta.sector,
    rseqTeamId: home ? game.VisitingTeamId : game.HomeTeamId,
  });
  const scoreFor = home ? game.HomeTeamScore : game.VisitingTeamScore;
  const scoreAgainst = home ? game.VisitingTeamScore : game.HomeTeamScore;
  let result = 'D';
  if (scoreFor > scoreAgainst) result = 'W';
  else if (scoreFor < scoreAgainst) result = 'L';
  const gameId = game.GameId || null;
  const out = {
    date: gameDate(game),
    time: game.GameTimeFormatted || '',
    opponent: opp.shortName || rawOppName || '',
    opponentCode: opp.code || String(rawOppCode || '').toUpperCase().slice(0, 4),
    home,
    scoreFor,
    scoreAgainst,
    result,
    sport: meta.sport,
    competition: meta.label,
    gameId,
    url: gamePageUrl(gameId, meta.id),
  };
  if (opp.fullName) out.opponentFullName = opp.fullName;
  if (opp.nickname) out.opponentNickname = opp.nickname;
  if (opp.registryId) out.opponentRegistryId = opp.registryId;
  return out;
}

/** Prochains matchs bruts (avant prune fraîcheur B). Inclut les matchs en cours. */
function nextGamesForTeam(games, teamId, meta, reg, liveById = {}) {
  const today = SportsLive.torontoDayKey();
  const now = Date.now();
  return games
    .filter((g) => g.HomeTeamId === teamId || g.VisitingTeamId === teamId)
    .map((g) => SportsLive.overlayLiveDetail(g, liveById[g.GameId]))
    .filter((g) => !SportsLive.isFinalRaw(g, now))
    .filter((g) => {
      const day = gameDate(g);
      if (!day) return true;
      if (day >= today) return true;
      return SportsLive.isLiveRaw(g, now);
    })
    .sort((a, b) => gameDate(a).localeCompare(gameDate(b)))
    .map((g) => {
      const home = g.HomeTeamId === teamId;
      const rawOppName = home ? g.VisitingTeamName : g.HomeTeamName;
      const rawOppCode = (home ? g.VisitingTeamCode : g.HomeTeamCode) || codeFromName(rawOppName);
      const opp = resolveSportsTeam(reg, {
        name: rawOppName,
        code: rawOppCode,
        sector: meta.sector,
        rseqTeamId: home ? g.VisitingTeamId : g.HomeTeamId,
      });
      const gameId = g.GameId || null;
      const out = {
        date: gameDate(g),
        time: g.GameTimeFormatted || '',
        opponent: opp.shortName || rawOppName || '',
        opponentCode: opp.code || String(rawOppCode || '').toUpperCase().slice(0, 4),
        home,
        sport: meta.sport,
        competition: meta.label,
        gameId,
        url: gamePageUrl(gameId, meta.id),
      };
      if (opp.fullName) out.opponentFullName = opp.fullName;
      if (opp.nickname) out.opponentNickname = opp.nickname;
      if (opp.registryId) out.opponentRegistryId = opp.registryId;
      SportsLive.annotateNextGame(out, g, { home, sport: meta.sport, now });
      return out;
    });
}

function nextGameForTeam(games, teamId, meta, reg) {
  return nextGamesForTeam(games, teamId, meta, reg)[0] || null;
}

/** Résultats passés bruts (scores *finaux*), plus récent d’abord — prune B ensuite. */
function pastGamesForTeam(games, teamId, meta, reg, liveById = {}) {
  const now = Date.now();
  return games
    .filter((g) => g.HomeTeamId === teamId || g.VisitingTeamId === teamId)
    .map((g) => SportsLive.overlayLiveDetail(g, liveById[g.GameId]))
    .filter((g) => SportsLive.isFinalRaw(g, now) && SportsLive.rseqHasScore(g))
    .map((g) => normalizeGame(g, teamId, meta, reg))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function lastGameForTeam(games, teamId, meta, reg) {
  return pastGamesForTeam(games, teamId, meta, reg)[0] || null;
}

function standingForTeam(standings, teamId) {
  const row = (standings || []).find((s) => s.TeamId === teamId);
  if (!row) return null;
  const w = row.Wins || 0;
  const l = row.Losses || 0;
  const d = row.Draws || 0;
  return {
    wins: w,
    losses: l,
    draws: d,
    played: row.GamesPlayed || w + l + d,
    label: d ? `${w}-${l}-${d}` : `${w}-${l}`,
  };
}

/**
 * Hockey RSEQ (Spordle / rseqhockey.com) — pas sur l’API S1.
 * On lit le scoreboard SSR (__NEXT_DATA__) des pages publiques collégial + universitaire.
 */
const HOCKEY_SOURCES = [
  {
    sector: 'collegial',
    url: 'https://collegial.rseqhockey.com/fr',
    site: 'https://collegial.rseqhockey.com/fr',
  },
  {
    sector: 'universitaire',
    url: 'https://universitaire.rseqhockey.com/fr',
    site: 'https://universitaire.rseqhockey.com/fr',
  },
];

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent':
            'Mozilla/5.0 (compatible; LE-RADAR-SportsBot/1.0; +https://le-radar.ca) Chrome/122.0.0.0',
          'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8',
        },
        timeout: 30000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          res.resume();
          fetchText(next).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`timeout ${url}`));
    });
  });
}

function parseHockeyScoreboard(html, { sector, site }) {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!m) throw new Error('__NEXT_DATA__ introuvable');
  const data = JSON.parse(m[1]);
  const games = data?.props?.pageProps?.scoreboardMatches || [];
  const teams = {};
  const now = Date.now();

  for (const g of games) {
    const cat = g.category || {};
    const catName = cat.nameFr || cat.name || 'Hockey RSEQ';
    const sex = String(cat.gender || '').toLowerCase().startsWith('f') ? 'F' : 'M';
    const division = cat.class?.shortName || cat.class?.name || null;
    const startMs = g.startTime ? Date.parse(g.startTime) : NaN;
    const isPast = Number.isFinite(startMs) && startMs < now;
    const time = g.startTime && g.startTime.length >= 16
      ? g.startTime.slice(11, 16)
      : '';

    const stats = Array.isArray(g.teamStats) ? g.teamStats : [];
    const scoreMap = new Map();
    for (const st of stats) {
      const tid = st.teamId ?? st.id;
      if (tid == null) continue;
      const sc = st.score ?? st.goals;
      if (sc != null) scoreMap.set(tid, sc);
    }

    for (const [side, other] of [['homeTeam', 'awayTeam'], ['awayTeam', 'homeTeam']]) {
      const tmeta = g[side] || {};
      const ometa = g[other] || {};
      const name = tmeta.name || tmeta.shortName;
      if (!name) continue;
      const teamId = String(
        tmeta.externalId
        || g[side === 'homeTeam' ? 'homeTeamId' : 'awayTeamId']
        || name,
      );
      const key = `hockey:${sector}:${teamId}`;
      if (!teams[key]) {
        teams[key] = {
          id: key,
          rseqTeamId: teamId,
          leagueId: `spordle-${sector}`,
          name,
          code: codeFromName(tmeta.shortName || name),
          sector,
          sport: 'hockey',
          sportLabel: 'Hockey',
          sex,
          division,
          usports: sector === 'universitaire',
          leagueLabel: catName,
          lastGame: null,
          nextGame: null,
          results: [],
          nextGames: [],
          record: null,
          source: 'spordle-rseqhockey',
        };
      }

      const myId = g[side === 'homeTeam' ? 'homeTeamId' : 'awayTeamId'];
      const oppId = g[side === 'homeTeam' ? 'awayTeamId' : 'homeTeamId'];
      const myScore = scoreMap.get(myId);
      const oppScore = scoreMap.get(oppId);
      const oppName = ometa.shortName || ometa.name || '';
      const entry = {
        date: g.date || (g.startTime || '').slice(0, 10),
        time,
        opponent: oppName,
        opponentCode: codeFromName(oppName),
        home: side === 'homeTeam',
        sport: 'hockey',
        competition: catName,
        gameId: g.id != null ? String(g.id) : null,
        url: site,
      };

      if (myScore != null && oppScore != null) {
        entry.scoreFor = myScore;
        entry.scoreAgainst = oppScore;
        entry.result = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'D';
        if (isPast) {
          teams[key].results.push(entry);
          const cur = teams[key].lastGame;
          if (!cur || String(entry.date) >= String(cur.date || '')) {
            teams[key].lastGame = entry;
          }
        }
      } else if (!isPast) {
        teams[key].nextGames.push(entry);
        const cur = teams[key].nextGame;
        if (!cur || String(entry.date || '9999') < String(cur.date || '9999')) {
          teams[key].nextGame = entry;
        }
      }
    }
  }
  return teams;
}

async function fetchHockeyTeams(reg) {
  const out = {};
  const errors = [];
  for (const src of HOCKEY_SOURCES) {
    process.stderr.write(`sports: hockey ${src.sector} (Spordle)… `);
    try {
      const html = await fetchText(src.url);
      const batch = parseHockeyScoreboard(html, src);
      for (const team of Object.values(batch)) {
        applyRegistryToTeam(team, reg);
      }
      Object.assign(out, batch);
      process.stderr.write(`${Object.keys(batch).length} équipes\n`);
    } catch (err) {
      process.stderr.write(`ERREUR ${err.message}\n`);
      errors.push({
        leagueId: `spordle-${src.sector}`,
        label: `Hockey ${src.sector}`,
        error: String(err.message || err),
      });
    }
  }
  return { teams: out, errors };
}

/**
 * Voile campus — Québec seulement (sports-sailing.json).
 * ICSA = scores réels ; watchlist = clubs QC sans feed encore (UdeM, Sherbrooke, Laval…).
 */
const SAILING_CFG_PATH = path.join(ROOT, 'sports-sailing.json');

function loadSailingConfig() {
  try {
    return JSON.parse(fs.readFileSync(SAILING_CFG_PATH, 'utf8'));
  } catch {
    return { schools: [], watchlist: [] };
  }
}

const MONTH_MAP = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0?39;/g, "'");
}

function parseSailingDate(label, seasonHint = '') {
  // "Apr 19" / "Mar 08" — année depuis le saison s26 → 2026, f25 → 2025
  const m = String(label || '').trim().match(/^([A-Za-z]+)\s+(\d{1,2})/);
  if (!m) return null;
  const mon = MONTH_MAP[m[1].toLowerCase()];
  if (!mon) return null;
  let year = new Date().getFullYear();
  const sm = String(seasonHint).match(/([fs])(\d{2})/i);
  if (sm) {
    year = 2000 + parseInt(sm[2], 10);
    // Fall: Aug–Dec ; Spring: Jan–Jun — si mois d’automne et saison spring, année-1 rare
  }
  const day = parseInt(m[2], 10);
  return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseSailingSchoolPage(html, school) {
  const seasonHint = (html.match(/\/schools\/[^/]+\/([fs]\d{2})\//i) || [])[1]
    || (html.match(/Spring\s+(20\d{2})|Fall\s+(20\d{2})/i) || [])[0]
    || 's26';
  // Prefer explicit season in title: "Spring 2026"
  let year = null;
  const ty = html.match(/(?:Spring|Fall)\s+(20\d{2})/i);
  if (ty) year = parseInt(ty[1], 10);

  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(html))) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => {
      const raw = c[1];
      const href = (raw.match(/href="([^"]+)"/) || [])[1] || '';
      const text = decodeHtmlEntities(raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      return { text, href };
    });
    if (cells.length < 6) continue;
    if (/^Name$/i.test(cells[0].text)) continue;
    const event = cells[0].text;
    const host = cells[1].text;
    const type = cells[2].text;
    const dateLabel = cells[4].text;
    const status = cells[5].text;
    const placeRaw = cells[6] ? cells[6].text : '';
    const placeM = placeRaw.match(/(\d+)\s*\/\s*(\d+)/);
    let date = parseSailingDate(dateLabel, seasonHint);
    if (date && year) date = `${year}-${date.slice(5)}`;
    const href = cells[0].href
      ? (cells[0].href.startsWith('http')
        ? cells[0].href
        : `https://scores.collegesailing.org${cells[0].href}`)
      : `https://scores.collegesailing.org/schools/${school.slug}/`;
    rows.push({
      event,
      host,
      type,
      date,
      status,
      place: placeM ? parseInt(placeM[1], 10) : null,
      field: placeM ? parseInt(placeM[2], 10) : null,
      url: href,
    });
  }
  if (!rows.length) return null;

  const today = new Date().toISOString().slice(0, 10);
  // Official results first as lastGame candidates; pending as nextGame
  // (mais une date déjà passée n’est jamais « À venir », même si ICSA dit Pending).
  const official = rows.filter((r) => /official/i.test(r.status) && r.place != null);
  const pending = rows.filter((r) => {
    if (!/pending|scheduled|upcoming/i.test(r.status)) return false;
    if (r.date && r.date < today) return false;
    return true;
  });
  // Régates « pending » datées dans le passé avec place → traiter comme résultats.
  for (const r of rows) {
    if (r.date && r.date < today && r.place != null && !official.includes(r)) {
      official.push(r);
    }
  }
  official.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  pending.sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));

  const toEntry = (r, withScore) => {
    const entry = {
      date: r.date || null,
      time: '',
      // Régate : nom d’événement (+ hôte), pas un « adversaire » unique.
      opponent: r.event || r.host || 'Régate',
      opponentFullName: r.host && r.event && r.host !== r.event
        ? `${r.event} · ${r.host}`
        : (r.host || r.event || ''),
      opponentCode: codeFromName(r.host || r.event).slice(0, 4),
      // Pas de domicile/extérieur en régate multi-équipages.
      home: null,
      sport: 'sailing',
      scoreKind: 'place',
      competition: `ICSA ${school.conference || ''} · ${r.type || 'Regatta'}`.trim(),
      url: r.url,
    };
    if (withScore && r.place != null && r.field != null) {
      entry.scoreFor = r.place;
      entry.scoreAgainst = r.field;
      // Podium / top 3 → V ; sinon place dans la 1ʳᵉ moitié → N ; bas de tableau → D
      if (r.place <= 3) entry.result = 'W';
      else if (r.place <= Math.ceil(r.field / 2)) entry.result = 'D';
      else entry.result = 'L';
    }
    return entry;
  };

  const key = `sailing:universitaire:${school.slug}`;
  const team = {
    id: key,
    rseqTeamId: school.code,
    leagueId: 'icsa-collegesailing',
    name: school.clubName || school.shortName || school.name,
    code: school.code,
    sector: school.sector || 'universitaire',
    sport: 'sailing',
    sportLabel: 'Voile',
    sex: null,
    division: school.conference || 'ICSA',
    usports: false,
    leagueLabel: school.kind === 'association-etudiante'
      ? `ICSA · association étudiante · ${school.conference || 'College sailing'}`
      : `ICSA · ${school.conference || 'College sailing'}`,
    lastGame: official[0] ? toEntry(official[0], true) : null,
    nextGame: (pending.find((r) => !r.date || r.date >= today)
      ? toEntry(pending.find((r) => !r.date || r.date >= today), false)
      : null),
    record: official.length
      ? {
        wins: official.filter((r) => r.place <= Math.ceil(r.field / 2)).length,
        losses: official.filter((r) => r.place > Math.ceil(r.field / 2)).length,
        draws: 0,
        played: official.length,
        label: `${official.filter((r) => r.place <= Math.ceil(r.field / 2)).length}-${official.filter((r) => r.place > Math.ceil(r.field / 2)).length}`,
      }
      : null,
    source: 'icsa-collegesailing',
    fullName: school.name,
    province: school.province || 'QC',
    registryId: school.registryId || null,
    kind: school.kind || null,
  };
  if (school.note) team.clubNote = school.note;
  if (school.url) team.url = school.url;
  // Si pas de next mais des résultats : garder last uniquement
  if (!team.nextGame && !team.lastGame && rows[0]) {
    team.nextGame = toEntry(rows[0], false);
  }
  return team;
}

/**
 * Voile campus : souvent une **association étudiante** (ULaVoile, PolyVoile,
 * McGill Sailing), pas le programme d’excellence (Rouge et Or, Carabins…).
 * name = nom du club ; fullName = établissement hôte ; pas de nickname varsity.
 */
function applySailingClubIdentity(team, clubOrSchool) {
  const isAssoc = clubOrSchool.kind === 'association-etudiante'
    || clubOrSchool.notAthletics
    || Boolean(clubOrSchool.clubName);
  if (!isAssoc) return team;
  const clubName = clubOrSchool.clubName || clubOrSchool.shortName || team.name;
  team.name = clubName;
  team.nickname = null; // ne pas coller Rouge et Or / Redbirds sur un club voile
  if (clubOrSchool.name) team.fullName = clubOrSchool.name;
  team.kind = 'association-etudiante';
  team.division = clubOrSchool.status === 'upcoming'
    ? 'Association · à venir'
    : clubOrSchool.status === 'icsa'
      ? (clubOrSchool.conference || 'ICSA')
      : 'Association étudiante';
  team.leagueLabel = 'Voile · association étudiante QC';
  if (clubOrSchool.note) team.clubNote = clubOrSchool.note;
  if (clubOrSchool.url) team.url = clubOrSchool.url;
  return team;
}

function sailingWatchlistTeam(club, reg) {
  const rid = club.registryId || club.code || club.shortName;
  const key = `sailing:universitaire:watch:${rid}`;
  const team = {
    id: key,
    rseqTeamId: club.code || rid,
    leagueId: 'sailing-qc-watchlist',
    name: club.clubName || club.shortName || club.name,
    code: club.code || '',
    sector: club.sector || 'universitaire',
    sport: 'sailing',
    sportLabel: 'Voile',
    sex: null,
    division: club.status === 'upcoming' ? 'Association · à venir' : 'Association étudiante',
    usports: false,
    leagueLabel: 'Voile · association étudiante QC',
    lastGame: null,
    nextGame: null,
    record: null,
    source: 'sailing-watchlist',
    status: club.status || 'club',
    clubNote: club.note || 'Association étudiante de voile — scores ICSA à venir.',
    fullName: club.name,
    registryId: club.registryId || null,
    province: 'QC',
    kind: club.kind || 'association-etudiante',
  };
  if (club.url) team.url = club.url;
  applyRegistryToTeam(team, reg);
  // Après le registre : réimposer l’identité club (pas le surnom varsity).
  applySailingClubIdentity(team, club);
  return team;
}

async function fetchSailingTeams(reg) {
  const cfg = loadSailingConfig();
  const schools = (cfg.schools || []).filter((s) => !s.province || s.province === 'QC');
  const watchlist = (cfg.watchlist || []).filter((s) => !s.province || s.province === 'QC');
  const out = {};
  const errors = [];

  for (const school of schools) {
    process.stderr.write(`sports: voile ${school.slug} (ICSA QC)… `);
    try {
      const html = await fetchText(`https://scores.collegesailing.org/schools/${school.slug}/`);
      if (/not found|404/i.test(html.slice(0, 400)) && html.length < 5000) {
        process.stderr.write('absent\n');
        continue;
      }
      const team = parseSailingSchoolPage(html, school);
      if (!team) {
        process.stderr.write('sans régates\n');
        continue;
      }
      team.province = 'QC';
      if (school.registryId) team.registryId = school.registryId;
      applyRegistryToTeam(team, reg);
      // McGill Sailing etc. : association étudiante, pas Redbirds/varsity.
      applySailingClubIdentity(team, school);
      out[team.id] = team;
      process.stderr.write(`ok (${team.lastGame ? 'last' : '-'}/${team.nextGame ? 'next' : '-'})\n`);
    } catch (err) {
      process.stderr.write(`ERREUR ${err.message}\n`);
      errors.push({
        leagueId: `icsa-${school.slug}`,
        label: `Voile ${school.shortName}`,
        error: String(err.message || err),
      });
    }
  }

  // Clubs QC sans ICSA (UdeM, Sherbrooke, Laval…) — cartes campus, pas de scores hors province.
  for (const club of watchlist) {
    const team = sailingWatchlistTeam(club, reg);
    out[team.id] = team;
    process.stderr.write(`sports: voile watchlist ${team.name} (${team.status})\n`);
  }

  return { teams: out, errors };
}

/**
 * Conserve lastGame / results encore frais du sports.json précédent quand
 * l’API S1 ne renvoie que le calendrier à venir (scores -999, saison basculée).
 */
function mergePreservedPast(entry, previousTeams) {
  if (!entry || !previousTeams) return entry;
  const prev = previousTeams[entry.id];
  if (!prev) return entry;
  const hasNewPast = (entry.results && entry.results.length) || entry.lastGame;
  if (hasNewPast) return entry;
  const out = { ...entry };
  if (Array.isArray(prev.results) && prev.results.length) {
    out.results = prev.results.map((g) => ({ ...g }));
  }
  if (prev.lastGame) {
    out.lastGame = { ...prev.lastGame };
  }
  if (prev.lastGamePriorSeason != null) {
    out.lastGamePriorSeason = prev.lastGamePriorSeason;
  }
  return out;
}

function loadPreviousPayload() {
  try {
    if (!fs.existsSync(OUT_PATH)) return null;
    const prev = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
    return prev && typeof prev === 'object' ? prev : null;
  } catch {
    return null;
  }
}

function loadPreviousTeams() {
  const prev = loadPreviousPayload();
  return prev && prev.teams && typeof prev.teams === 'object' ? prev.teams : {};
}

/**
 * Réinjecte les formations du run précédent quand une source est en panne
 * (null, HTTP, timeout). Mieux vaut un score encore valide que des cartes
 * qui disparaissent — la fraîcheur B continue de purger l’obsolète.
 *
 * @param {Record<string, object>} previousTeams
 * @param {(team: object, id: string) => boolean} predicate
 * @param {string} reason
 * @returns {Record<string, object>}
 */
function preservePreviousTeams(previousTeams, predicate, reason) {
  const out = {};
  if (!previousTeams || typeof previousTeams !== 'object') return out;
  for (const [id, team] of Object.entries(previousTeams)) {
    if (!team || typeof team !== 'object') continue;
    if (!predicate(team, id)) continue;
    out[id] = {
      ...team,
      staleSource: true,
      staleReason: reason || 'source-unavailable',
    };
  }
  return out;
}

function preserveByLeagueId(previousTeams, leagueId, reason) {
  const lid = String(leagueId);
  return preservePreviousTeams(
    previousTeams,
    (team, id) => String(team.leagueId || '') === lid
      || String(id).includes(`:${lid}:`),
    reason,
  );
}

function preserveBySource(previousTeams, source, reason) {
  const src = String(source);
  return preservePreviousTeams(
    previousTeams,
    (team) => String(team.source || '') === src,
    reason,
  );
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(LEAGUES_PATH, 'utf8'));
  const previousPayload = loadPreviousPayload();
  const previousTeams = previousPayload && previousPayload.teams && typeof previousPayload.teams === 'object'
    ? previousPayload.teams
    : {};
  let leagues = catalog.leagues || [];
  if (liveOnly) {
    const ids = new Set(SportsLive.findLiveLeagueIds(previousTeams));
    leagues = leagues.filter((l) => ids.has(l.id));
    if (!leagues.length) {
      console.error('sports: --live aucun match en fenêtre — pas d’écriture.');
      process.exit(0);
    }
    process.stderr.write(`sports: --live ${leagues.length} ligue(s)\n`);
  }
  const reg = loadSportsTeamsRegistry();
  const teams = {};
  if (liveOnly) {
    for (const [id, team] of Object.entries(previousTeams)) {
      if (team && typeof team === 'object') teams[id] = { ...team };
    }
  }
  const errors = [];
  let registryHits = 0;
  let leaguesWithTeams = 0;
  let preservedPast = 0;
  let leaguesOk = 0;
  let leaguesFailed = 0;
  let teamsPreservedOnError = 0;
  const sportsFetched = new Set();

  for (const meta of leagues) {
    process.stderr.write(`sports: ${meta.label}… `);
    try {
      const data = await getJson(API + meta.id);
      if (!data || data === null) {
        // API vide : garder le snapshot précédent de la ligue (pas d’effacement).
        const kept = preserveByLeagueId(previousTeams, meta.id, 's1-null');
        const n = Object.keys(kept).length;
        if (n) {
          Object.assign(teams, kept);
          teamsPreservedOnError += n;
          leaguesWithTeams += 1;
          process.stderr.write(`null → conservé ${n} équipes\n`);
        } else {
          process.stderr.write('null\n');
        }
        sportsFetched.add(meta.sport);
        leaguesOk += 1; // réponse reçue (vide), pas une panne réseau
        continue;
      }
      const games = allGames(data);
      const liveById = await liveDetailsForGames(games);
      const standings = data.Standings || [];
      let teamCount = 0;
      for (const t of data.Teams || []) {
        const id = t.TeamId;
        if (!id) continue;
        const rawName = t.TeamName || 'Équipe';
        const rawCode = (t.TeamCode || codeFromName(rawName)).toUpperCase().slice(0, 4);
        const resolved = resolveSportsTeam(reg, {
          name: rawName,
          code: rawCode,
          sector: meta.sector,
          rseqTeamId: id,
        });
        if (resolved.matched) registryHits += 1;
        // Clé stable : ligue + équipe (évite collision multi-divisions).
        const key = `${meta.sector}:${meta.sport}:${meta.id}:${id}`;
        const results = pastGamesForTeam(games, id, meta, reg, liveById);
        const nextGames = nextGamesForTeam(games, id, meta, reg, liveById);
        const record = standingForTeam(standings, id);
        // Sexe : méta ligue, sinon inféré de SexType S1.
        let sex = meta.sex || null;
        if (!sex && data.SexTypeName) {
          const sn = String(data.SexTypeName).toLowerCase();
          if (sn.startsWith('f')) sex = 'F';
          else if (sn.startsWith('m') && !sn.includes('ix')) sex = 'M';
          else if (sn.includes('mix')) sex = 'X';
        }
        let entry = {
          id: key,
          rseqTeamId: id,
          leagueId: meta.id,
          name: resolved.shortName || rawName,
          code: resolved.code || rawCode,
          sector: meta.sector,
          sport: meta.sport,
          sportLabel: meta.sportLabel || data.SportName || meta.sport,
          sex,
          division: meta.division || data.DivisionName || null,
          usports: Boolean(meta.usports),
          leagueLabel: meta.label || data.LeagueName || meta.sport,
          results,
          lastGame: results[0] || null,
          nextGames: nextGames.slice(0, 12),
          nextGame: nextGames[0] || null,
          record,
          source: 'rseq-s1',
          priority: resolved.priority,
        };
        if (resolved.fullName) entry.fullName = resolved.fullName;
        if (resolved.nickname) entry.nickname = resolved.nickname;
        if (resolved.registryId) entry.registryId = resolved.registryId;
        const beforePast = Boolean(entry.lastGame || (entry.results && entry.results.length));
        entry = mergePreservedPast(entry, previousTeams);
        if (!beforePast && (entry.lastGame || (entry.results && entry.results.length))) {
          preservedPast += 1;
        }
        // Fraîcheur B : fenêtre sessions + 1 lastGame hors saison max + next horizon.
        entry = SportsFreshness.pruneSportsTeam(entry);
        teams[key] = entry;
        teamCount += 1;
      }
      if (teamCount) leaguesWithTeams += 1;
      sportsFetched.add(meta.sport);
      leaguesOk += 1;
      process.stderr.write(`${teamCount} équipes · ${games.length} matchs\n`);
    } catch (err) {
      process.stderr.write(`ERREUR ${err.message}\n`);
      errors.push({ leagueId: meta.id, label: meta.label, error: String(err.message || err) });
      sportsFetched.add(meta.sport);
      leaguesFailed += 1;
      // Ne jamais effacer une ligue entière sur panne ponctuelle.
      const kept = preserveByLeagueId(previousTeams, meta.id, `s1-error:${err.message || err}`);
      const n = Object.keys(kept).length;
      if (n) {
        Object.assign(teams, kept);
        teamsPreservedOnError += n;
        leaguesWithTeams += 1;
        process.stderr.write(`sports: ${meta.label} → conservé ${n} équipes (run précédent)\n`);
      }
    }
  }

  // Hockey / voile : ignorés en --live (S1 seulement, pour rester sous la minute).
  const hockey = liveOnly ? { teams: {}, errors: [] } : await fetchHockeyTeams(reg);
  if (Object.keys(hockey.teams).length) {
    for (const [key, team] of Object.entries(hockey.teams)) {
      if (Array.isArray(team.results)) {
        team.results.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      }
      if (Array.isArray(team.nextGames)) {
        team.nextGames.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
        if (!team.nextGame && team.nextGames[0]) team.nextGame = team.nextGames[0];
      }
      let entry = mergePreservedPast(team, previousTeams);
      if (!team.lastGame && !((team.results || []).length) && (entry.lastGame || (entry.results || []).length)) {
        preservedPast += 1;
      }
      teams[key] = SportsFreshness.pruneSportsTeam(entry);
    }
  } else if (hockey.errors.length) {
    const kept = preserveBySource(previousTeams, 'spordle-rseqhockey', 'hockey-spordle-failed');
    const n = Object.keys(kept).length;
    if (n) {
      Object.assign(teams, kept);
      teamsPreservedOnError += n;
      process.stderr.write(`sports: hockey Spordle en panne → conservé ${n} équipes\n`);
    }
  }
  errors.push(...hockey.errors);
  sportsFetched.add('hockey');

  // Voile campus QC (ICSA + watchlist) — sport hors S1.
  const sailing = liveOnly ? { teams: {}, errors: [] } : await fetchSailingTeams(reg);
  if (Object.keys(sailing.teams).length) {
    for (const [key, team] of Object.entries(sailing.teams)) {
      let entry = mergePreservedPast(team, previousTeams);
      if (!team.lastGame && entry.lastGame) preservedPast += 1;
      teams[key] = SportsFreshness.pruneSportsTeam(entry);
    }
  } else if (sailing.errors.length) {
    const kept = {
      ...preserveBySource(previousTeams, 'icsa-collegesailing', 'sailing-failed'),
      ...preserveBySource(previousTeams, 'sailing-watchlist', 'sailing-failed'),
    };
    const n = Object.keys(kept).length;
    if (n) {
      Object.assign(teams, kept);
      teamsPreservedOnError += n;
      process.stderr.write(`sports: voile en panne → conservé ${n} équipes\n`);
    }
  }
  errors.push(...sailing.errors);
  sportsFetched.add('sailing');

  // Filet registre (adversaires + champs) sur tout le payload.
  for (const team of Object.values(teams)) {
    applyRegistryToTeam(team, reg);
  }

  // Seconde passe fraîcheur (registre peut avoir muté lastGame).
  const prunedTeams = {};
  for (const [id, team] of Object.entries(teams)) {
    prunedTeams[id] = SportsFreshness.pruneSportsTeam(team);
  }

  const sportsCovered = [...new Set(Object.values(prunedTeams).map((t) => t.sport))].sort();
  const catalogSports = [...new Set(leagues.map((l) => l.sport).filter(Boolean))].sort();
  const missingSports = catalogSports.filter((s) => !sportsCovered.includes(s));

  const withResults = Object.values(prunedTeams).filter((t) => (t.results && t.results.length) || t.lastGame).length;
  const priorSeason = Object.values(prunedTeams).filter((t) => t.lastGamePriorSeason || t.lastGame?.priorSeason).length;
  const teamCount = Object.keys(prunedTeams).length;
  const fetchedAt = new Date().toISOString();
  const prevCount = Object.keys(previousTeams).length;

  // Garde-fous : ne jamais publier un payload catastrophique (cartes vides / panne massive).
  // --live fusionne le snapshot précédent : ces seuils ne s’appliquent qu’au crawl complet.
  const failRatio = leagues.length
    ? leaguesFailed / leagues.length
    : 0;
  if (!liveOnly) {
    if (teamCount < 50) {
      console.error(
        `sports: ABORT — trop peu d’équipes (${teamCount}). Refus d’écraser sports.json.`,
      );
      process.exit(1);
    }
    if (prevCount >= 100 && teamCount < prevCount * 0.5) {
      console.error(
        `sports: ABORT — chute d’équipes ${prevCount} → ${teamCount} (>50 %). Refus d’écraser.`,
      );
      process.exit(1);
    }
    if (leaguesFailed > 0 && failRatio > 0.5) {
      console.error(
        `sports: ABORT — majorité des ligues S1 en erreur (${leaguesFailed}/${leagues.length}).`,
      );
      process.exit(1);
    }
  }

  let payload = SportsFreshness.pruneSportsPayload({
    updated: fetchedAt,
    fetchedAt,
    source: 'rseq-s1-all+spordle-hockey+sailing-qc',
    note: 'Tous sports RSEQ S1 sans exclusion + hockey Spordle + voile ICSA QC. Fraîcheur B (session en cours + 2 préc. ; next ≤ session suivante). Sources en panne : snapshot précédent conservé.',
    sportsFreshness: { rule: 'B', referenceDate: fetchedAt },
    registry: 'sports-teams.json',
    registryMatched: registryHits,
    leagueCatalog: catalog.leagueCount || leagues.length,
    leaguesWithTeams,
    leaguesOk,
    leaguesFailed,
    teamsPreservedOnError: teamsPreservedOnError || undefined,
    sportsCovered,
    sportsCatalog: catalogSports,
    sportsFetched: [...sportsFetched].sort(),
    sportsMissing: missingSports.length ? missingSports : undefined,
    teamCount,
    errors: errors.length ? errors : undefined,
    teams: prunedTeams,
  });
  if (liveOnly) {
    payload = preserveHarvestCatalogStats(payload, previousPayload);
  }

  console.log(
    JSON.stringify(
      {
        teams: payload.teamCount,
        registryMatched: registryHits,
        withLastGame: Object.values(prunedTeams).filter((t) => t.lastGame).length,
        withNextGame: Object.values(prunedTeams).filter((t) => t.nextGame).length,
        withResults,
        priorSeasonLastGame: priorSeason,
        preservedPastFromPrevious: preservedPast,
        teamsPreservedOnError,
        leaguesOk,
        leaguesFailed,
        sportsCovered,
        sportsMissing: missingSports,
        errors: errors.length,
        update,
      },
      null,
      2,
    ),
  );

  if (update) {
    fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    const mastheadPath = path.join(ROOT, 'sports-masthead.json');
    fs.writeFileSync(
      mastheadPath,
      `${JSON.stringify(buildSportsMastheadPayload(payload), null, 2)}\n`,
      'utf8',
    );
    console.error(`sports: écrit ${path.relative(ROOT, OUT_PATH)} (${teamCount} équipes, ${leaguesFailed} erreurs ligue)`);
  } else {
    console.error('sports: dry-run (passe --update pour écrire)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Hockey universitaire RSEQ — calendriers campus publics.
 *
 * Spordle (rseqhockey.com) est derrière un challenge Cloudflare. S1 n’a pas
 * les matchs (surtout les hors-concours). Les sites d’équipe, si :
 *   - UQAC Inuk : Tribe Events JSON
 *   - UQO Torrents : tableau HTML saison régulière
 *
 * Ligue D2 M 2026-27 : UQAC, UQO, ÉTS, Sherbrooke.
 * Féminin D1 : Stingers, Gaiters/McGill Sidearm, Carabins, Rouge et Or.
 */

'use strict';

const https = require('https');
const { applyRegistryToTeam, codeFromName } = require('./sports-teams-lib');

const UQO_SCHEDULE_URL = 'https://uqo.ca/les-torrents/hockey-masculin/horaire-et-admission';
const UQAC_EVENTS_URL = 'https://www.uqac.ca/inuk/wp-json/tribe/events/v1/events?categories=hockey-masculin&per_page=50';
const STINGERS_W_URL = 'https://stingers.ca/whockey/results.php';
const GAITERS_W_URL = 'https://gaiters.ca/sports/womens-ice-hockey/schedule/2026-27';
const MCGILL_W_URL = 'https://mcgillathletics.ca/sports/womens-ice-hockey/schedule/2026-27';
const CARABINS_W_URL = 'https://carabins.umontreal.ca/hockey-feminin/calendrier/';
const LAVAL_W_URL = 'https://rougeetor.ulaval.ca/sports/hockey/calendrier/';

const FR_MONTHS = {
  janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, décembre: 12,
};

const NICK_TO_REGISTRY = [
  [/torrents|\buqo\b/i, 'uqo', 'UQO'],
  [/inuk|\buqac\b/i, 'uqac', 'UQAC'],
  [/piranhas|\bets\b|\béts\b/i, 'ets', 'ÉTS'],
  [/vert[\s-]*et[\s-]*or|\buds\b|usherbrooke|\bsherbrooke\b/i, 'usherbrooke', 'Sherbrooke'],
  [/\bconcordia\b|\bstingers\b/i, 'concordia', 'Concordia'],
  [/\bmontr[eé]al\b|\bcarabins\b|\budem\b/i, 'udem', 'Montréal'],
  [/\bbishop|\bgaiters\b/i, 'bishops', "Bishop's"],
  [/\bmcgill\b|\bmartlets\b/i, 'mcgill', 'McGill'],
  [/\blaval\b|\brouge et or\b|\bulaval\b/i, 'ulaval', 'Laval'],
];

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&rsquo;/g, "'").replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
}

function resolveNick(raw) {
  const text = String(raw || '');
  for (const [re, registryId, name] of NICK_TO_REGISTRY) {
    if (re.test(text)) return { registryId, name };
  }
  return null;
}

function parseFrDateTime(raw) {
  const t = stripTags(raw).toLowerCase().replace(/\s+/g, ' ');
  const m = t.match(/(\d{1,2})\s+([a-zéûô]+)\s+(\d{4})(?:\s+(\d{1,2})\s*h(?:\s*(\d{2}))?)?/i);
  if (!m) return null;
  const month = FR_MONTHS[m[2]];
  if (!month) return null;
  const day = Number(m[1]);
  const year = Number(m[3]);
  const hour = m[4] != null ? Number(m[4]) : 0;
  const min = m[5] != null ? Number(m[5]) : 0;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const mi = String(min).padStart(2, '0');
  return { date: `${year}-${mm}-${dd}`, time: m[4] != null ? `${hh}:${mi}` : '' };
}

function parseScoreCell(raw) {
  const t = stripTags(raw);
  const m = t.match(/^(\d+)\s*[-–:]\s*(\d+)$/);
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

function parseUqoScheduleHtml(html) {
  const games = [];
  const tables = String(html || '').match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const table of tables) {
    const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    for (const row of rows) {
      const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => stripTags(c[1]));
      if (cells.length < 3) continue;
      if (/date\s*\/\s*heure/i.test(cells[0])) continue;
      const when = parseFrDateTime(cells[0]);
      if (!when) continue;
      const matchup = cells[2] || '';
      const vs = matchup.split(/\s+vs\s+/i);
      if (vs.length < 2) continue;
      const home = resolveNick(vs[0]);
      const away = resolveNick(vs[1]);
      if (!home || !away) continue;
      const score = parseScoreCell(cells[3] || '');
      games.push({
        date: when.date,
        time: when.time,
        homeRegistryId: home.registryId,
        homeName: home.name,
        awayRegistryId: away.registryId,
        awayName: away.name,
        competition: 'Hockey universitaire masculin D2',
        url: UQO_SCHEDULE_URL,
        scoreHome: score ? score.home : null,
        scoreAway: score ? score.away : null,
        sex: 'M',
        division: 'D2',
        source: 'campus-uqo',
      });
    }
  }
  return games;
}

function parseUqacEventsJson(payload) {
  const events = payload && Array.isArray(payload.events) ? payload.events : [];
  const games = [];
  for (const ev of events) {
    const title = String(ev.title || '');
    if (!/hockey/i.test(title)) continue;
    const vs = title.match(/:\s*(.+?)\s+vs\s+(.+)$/i);
    if (!vs) continue;
    const left = resolveNick(vs[1]);
    const right = resolveNick(vs[2]);
    if (!left || !right) continue;
    const slugs = (ev.categories || []).map((c) => String(c.slug || ''));
    const atHome = slugs.includes('a-domicile');
    const home = atHome
      ? { registryId: 'uqac', name: 'UQAC' }
      : (left.registryId === 'uqac' ? right : left);
    const away = atHome
      ? (left.registryId === 'uqac' ? right : left)
      : { registryId: 'uqac', name: 'UQAC' };
    const start = String(ev.start_date || '').replace(' ', 'T');
    const date = start.slice(0, 10);
    const time = start.length >= 16 ? start.slice(11, 16) : '';
    if (!date) continue;
    games.push({
      date,
      time,
      homeRegistryId: home.registryId,
      homeName: home.name,
      awayRegistryId: away.registryId,
      awayName: away.name,
      competition: /hors concours/i.test(title)
        ? 'Hockey universitaire masculin D2 (hors concours)'
        : 'Hockey universitaire masculin D2',
      url: ev.url || UQAC_EVENTS_URL,
      scoreHome: null,
      scoreAway: null,
      sex: 'M',
      division: 'D2',
      source: 'campus-uqac',
    });
  }
  return games;
}

function gameKey(g) {
  const a = [g.homeRegistryId, g.awayRegistryId].sort().join('|');
  return `${g.date}|${g.time || ''}|${a}`;
}

function mergeGames(lists) {
  const map = new Map();
  for (const list of lists) {
    for (const g of list || []) {
      const k = gameKey(g);
      const prev = map.get(k);
      if (!prev) {
        map.set(k, g);
        continue;
      }
      if (prev.scoreHome == null && g.scoreHome != null) map.set(k, g);
    }
  }
  return [...map.values()];
}

function teamsFromGames(games, { now = Date.now(), reg = null } = {}) {
  const teams = {};
  for (const g of games) {
    for (const side of ['home', 'away']) {
      const registryId = g[`${side}RegistryId`];
      const name = g[`${side}Name`];
      const oppId = g[side === 'home' ? 'awayRegistryId' : 'homeRegistryId'];
      const oppName = g[side === 'home' ? 'awayName' : 'homeName'];
      const sex = g.sex === 'F' ? 'F' : 'M';
      const division = g.division || (sex === 'F' ? 'D1' : 'D2');
      const key = `hockey:universitaire:campus:${registryId}:${sex}`;
      if (!teams[key]) {
        const team = {
          id: key,
          rseqTeamId: registryId,
          leagueId: sex === 'F' ? 'campus-universitaire-f-d1' : 'campus-universitaire-m-d2',
          name,
          code: codeFromName(name),
          sector: 'universitaire',
          sport: 'hockey',
          sportLabel: 'Hockey',
          sex,
          division,
          usports: true,
          leagueLabel: sex === 'F' ? 'Hockey universitaire féminin D1' : 'Hockey universitaire masculin D2',
          lastGame: null,
          nextGame: null,
          results: [],
          nextGames: [],
          record: null,
          source: 'campus-hockey',
          registryId,
        };
        if (reg) applyRegistryToTeam(team, reg);
        teams[key] = team;
      }
      const startMs = Date.parse(`${g.date}T${g.time || '00:00'}:00-04:00`);
      const scored = g.scoreHome != null && g.scoreAway != null;
      const myScore = scored ? (side === 'home' ? g.scoreHome : g.scoreAway) : null;
      const oppScore = scored ? (side === 'home' ? g.scoreAway : g.scoreHome) : null;
      const isPast = Number.isFinite(startMs) && startMs < now && scored;
      const entry = {
        date: g.date,
        time: g.time || '',
        opponent: oppName,
        opponentCode: codeFromName(oppName),
        home: side === 'home',
        sport: 'hockey',
        competition: g.competition,
        gameId: null,
        url: g.url,
        opponentRegistryId: oppId,
        opponentSector: 'universitaire',
        sex: g.sex || 'M',
      };
      if (scored) {
        entry.scoreFor = myScore;
        entry.scoreAgainst = oppScore;
        entry.result = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'D';
      }
      const team = teams[key];
      if (isPast) {
        team.results.push(entry);
        if (!team.lastGame || String(entry.date) >= String(team.lastGame.date || '')) {
          team.lastGame = entry;
        }
      } else if (!scored || (Number.isFinite(startMs) && startMs >= now)) {
        team.nextGames.push(entry);
      }
    }
  }
  for (const team of Object.values(teams)) {
    team.nextGames.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    team.results.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    team.nextGame = team.nextGames[0] || null;
    if (!team.lastGame && team.results[0]) team.lastGame = team.results[0];
  }
  return teams;
}

const EN_MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function parseEnTime(raw) {
  const t = String(raw || '').trim();
  const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!m) return '';
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function womenGame(partial) {
  return {
    scoreHome: null,
    scoreAway: null,
    sex: 'F',
    division: 'D1',
    competition: partial.competition || 'Hockey universitaire féminin D1',
    ...partial,
  };
}

function parseStingersResultsHtml(html) {
  const yearM = String(html || '').match(/20(\d{2})\s*[-–]\s*20(\d{2})/);
  const startY = yearM ? 2000 + Number(yearM[1]) : 2026;
  const games = [];
  const blocks = String(html || '').split(/<ul>/i);
  for (const block of blocks) {
    const lis = [...block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((x) => stripTags(x[1]));
    if (lis.length < 3) continue;
    const dateLi = lis.find((s) => /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(s));
    const timeLi = lis.find((s) => /\d{1,2}(?::\d{2})?\s*(AM|PM)/i.test(s));
    const oppLi = lis.find((s) => /^(@|vs\.?)/i.test(s));
    if (!dateLi || !oppLi) continue;
    const dm = dateLi.match(/([A-Za-z]+)\.?\s+(\d{1,2})/);
    if (!dm) continue;
    const month = EN_MONTHS[dm[1].toLowerCase()];
    if (!month) continue;
    const year = month >= 9 ? startY : startY + 1;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(Number(dm[2])).padStart(2, '0')}`;
    const awayGame = /^@/.test(oppLi);
    const opp = resolveNick(oppLi.replace(/^(@|vs\.?)\s*/i, ''));
    const us = resolveNick('Concordia');
    if (!opp || !us || opp.registryId === us.registryId) continue;
    games.push(womenGame({
      date,
      time: parseEnTime(timeLi || ''),
      homeRegistryId: awayGame ? opp.registryId : us.registryId,
      homeName: awayGame ? opp.name : us.name,
      awayRegistryId: awayGame ? us.registryId : opp.registryId,
      awayName: awayGame ? us.name : opp.name,
      url: STINGERS_W_URL,
      source: 'campus-stingers-w',
    }));
  }
  return games;
}

function parseSidearmJsonLd(html, pageUrl, sourceId) {
  const games = [];
  const blocks = String(html || '').match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi) || [];
  for (const block of blocks) {
    const inner = block.replace(/^[\s\S]*?<script[^>]*>/i, '').replace(/<\/script>\s*$/i, '');
    let data;
    try { data = JSON.parse(inner); } catch { continue; }
    const events = Array.isArray(data) ? data : (data['@graph'] || [data]);
    for (const ev of events) {
      if (!ev || ev['@type'] !== 'SportsEvent') continue;
      const start = String(ev.startDate || '');
      if (!start) continue;
      const name = String(ev.name || '');
      const homeMeta = resolveNick((ev.homeTeam && ev.homeTeam.name) || '');
      const awayMeta = resolveNick((ev.awayTeam && ev.awayTeam.name) || '');
      if (!homeMeta || !awayMeta) continue;
      let home = homeMeta;
      let away = awayMeta;
      if (/\bat\b/i.test(name) && homeMeta && awayMeta) {
        home = awayMeta;
        away = homeMeta;
      }
      games.push(womenGame({
        date: start.slice(0, 10),
        time: start.length >= 16 ? start.slice(11, 16) : '',
        homeRegistryId: home.registryId,
        homeName: home.name,
        awayRegistryId: away.registryId,
        awayName: away.name,
        url: pageUrl,
        source: sourceId,
      }));
    }
  }
  return games;
}

function parseCarabinsTable(html) {
  const games = [];
  const rows = String(html || '').match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const us = resolveNick('Carabins');
  if (!us) return games;
  for (const row of rows) {
    if (!/calendar-table__col--date/i.test(row)) continue;
    const dateCell = stripTags((row.match(/calendar-table__col--date[\s\S]*?<\/td>/i) || [''])[0]);
    const when = parseFrDateTime(dateCell.replace('/', ' '));
    if (!when) continue;
    const alts = [...row.matchAll(/alt="([^"]+)"/gi)].map((m) => m[1]);
    const oppAlt = alts.find((a) => !/carabins|udem/i.test(a));
    const opp = resolveNick(oppAlt || '');
    if (!opp || opp.registryId === us.registryId) continue;
    const venue = stripTags(row);
    const atHome = /cepsum/i.test(venue);
    games.push(womenGame({
      date: when.date,
      time: when.time,
      homeRegistryId: atHome ? us.registryId : opp.registryId,
      homeName: atHome ? us.name : opp.name,
      awayRegistryId: atHome ? opp.registryId : us.registryId,
      awayName: atHome ? opp.name : us.name,
      url: CARABINS_W_URL,
      source: 'campus-carabins-w',
    }));
  }
  return games;
}

function parseLavalCalendarHtml(html) {
  const games = [];
  const items = String(html || '').split(/<li>/i);
  const us = resolveNick('Laval');
  if (!us) return games;
  for (const item of items) {
    if (!/sport-tag/i.test(item) || !/hockey/i.test(item)) continue;
    const dateM = stripTags(item).match(/(\d{1,2})\s+([A-Za-zéûô]+)\s+(\d{4})/);
    const hourM = item.match(/class="hour">\s*(\d{1,2}):(\d{2})/i)
      || stripTags(item).match(/(\d{1,2}):(\d{2})/);
    if (!dateM) continue;
    const when = parseFrDateTime(`${dateM[1]} ${dateM[2]} ${dateM[3]} ${hourM ? `${hourM[1]} h ${hourM[2]}` : ''}`);
    if (!when) continue;
    const titles = [...item.matchAll(/data-title="([^"]+)"/gi)].map((m) => m[1]);
    if (titles.length < 2) continue;
    const a = resolveNick(titles[0]);
    const b = resolveNick(titles[1]);
    if (!a || !b) continue;
    const visits = /<span>\s*visite\s*<\/span>/i.test(item);
    const home = visits ? b : a;
    const away = visits ? a : b;
    games.push(womenGame({
      date: when.date,
      time: when.time,
      homeRegistryId: home.registryId,
      homeName: home.name,
      awayRegistryId: away.registryId,
      awayName: away.name,
      url: LAVAL_W_URL,
      source: 'campus-laval-w',
    }));
  }
  return games;
}

function overlayCampusHockey(existingTeams, campusTeams) {
  if (!campusTeams || !Object.keys(campusTeams).length) return { attached: 0, added: 0 };
  const byReg = new Map();
  for (const team of Object.values(existingTeams)) {
    if (team && team.sport === 'hockey' && team.registryId) {
      const k = `${team.registryId}:${team.sex || 'M'}:${team.sector || ''}`;
      if (!byReg.has(k)) byReg.set(k, []);
      byReg.get(k).push(team);
    }
  }
  let attached = 0;
  let added = 0;
  for (const camp of Object.values(campusTeams)) {
    const k = `${camp.registryId}:${camp.sex || 'M'}:${camp.sector || ''}`;
    const targets = byReg.get(k) || [];
    if (!targets.length) {
      existingTeams[camp.id] = camp;
      added += 1;
      continue;
    }
    for (const team of targets) {
      const empty = !(team.nextGames && team.nextGames.length) && !team.nextGame;
      if (empty && camp.nextGames && camp.nextGames.length) {
        team.nextGames = camp.nextGames;
        team.nextGame = camp.nextGame;
        team.source = `${team.source || 'rseq-s1'}+campus-hockey`;
        attached += 1;
      } else if (camp.nextGames && camp.nextGames.length && team.nextGames && team.nextGames.length < camp.nextGames.length) {
        team.nextGames = camp.nextGames;
        team.nextGame = camp.nextGame;
        team.source = `${team.source || 'rseq-s1'}+campus-hockey`;
        attached += 1;
      }
    }
  }
  return { attached, added };
}

function fetchHttps(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'text/html,application/json',
          'User-Agent': 'le-radar.ca sports-bot/1.0 (https://le-radar.ca)',
          'Accept-Language': 'fr-CA,fr;q=0.9',
        },
        timeout: 20000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          res.resume();
          fetchHttps(next).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} ${url}`));
            return;
          }
          resolve(body);
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

async function fetchOptional(url, label, leagueId) {
  try {
    return { body: await fetchHttps(url), error: null };
  } catch (err) {
    return {
      body: '',
      error: { leagueId, label, error: String(err.message || err) },
    };
  }
}

async function fetchCampusHockey({ reg = null, now = Date.now() } = {}) {
  const errors = [];
  const [
    uqo, uqac, stingers, gaiters, mcgill, carabins, laval,
  ] = await Promise.all([
    fetchOptional(UQO_SCHEDULE_URL, 'UQO Torrents horaire', 'campus-uqo'),
    fetchOptional(UQAC_EVENTS_URL, 'UQAC Inuk events', 'campus-uqac'),
    fetchOptional(STINGERS_W_URL, 'Concordia Stingers F', 'campus-stingers-w'),
    fetchOptional(GAITERS_W_URL, "Bishop's Gaiters F", 'campus-gaiters-w'),
    fetchOptional(MCGILL_W_URL, 'McGill Martlets F', 'campus-mcgill-w'),
    fetchOptional(CARABINS_W_URL, 'Carabins F', 'campus-carabins-w'),
    fetchOptional(LAVAL_W_URL, 'Rouge et Or F', 'campus-laval-w'),
  ]);
  for (const part of [uqo, uqac, stingers, gaiters, mcgill, carabins, laval]) {
    if (part.error) errors.push(part.error);
  }
  let uqacJson = null;
  if (uqac.body) {
    try { uqacJson = JSON.parse(uqac.body); } catch { /* ignore */ }
  }
  const games = mergeGames([
    uqo.body ? parseUqoScheduleHtml(uqo.body) : [],
    uqacJson ? parseUqacEventsJson(uqacJson) : [],
    stingers.body ? parseStingersResultsHtml(stingers.body) : [],
    gaiters.body ? parseSidearmJsonLd(gaiters.body, GAITERS_W_URL, 'campus-gaiters-w') : [],
    mcgill.body ? parseSidearmJsonLd(mcgill.body, MCGILL_W_URL, 'campus-mcgill-w') : [],
    carabins.body ? parseCarabinsTable(carabins.body) : [],
    laval.body ? parseLavalCalendarHtml(laval.body) : [],
  ]);
  const teams = teamsFromGames(games, { now, reg });
  return { teams, games, errors };
}

module.exports = {
  UQO_SCHEDULE_URL,
  UQAC_EVENTS_URL,
  resolveNick,
  parseFrDateTime,
  parseUqoScheduleHtml,
  parseUqacEventsJson,
  parseStingersResultsHtml,
  parseSidearmJsonLd,
  parseCarabinsTable,
  parseLavalCalendarHtml,
  mergeGames,
  teamsFromGames,
  overlayCampusHockey,
  fetchCampusHockey,
};

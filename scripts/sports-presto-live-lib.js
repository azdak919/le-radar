/**
 * LE-RADAR — pointages en cours de match via les sites de statistiques
 * PrestoSports officiels : U SPORTS (en.usports.ca, universitaire) et
 * RSEQ Direct (rseqdirect.ca, collégial D1).
 *
 * L’API RSEQ S1 ne donne aucun score pendant un match (-999 jusqu’au rapport).
 * Ces deux sites publient, eux, le pointage, la période et l’horloge en direct
 * (vérifié le 17 oct. 2026 : Western–Laval, Brébeuf–Champlain St-Lambert).
 *
 * Règles :
 *  - lecture côté bot seulement (pas de CORS) : une page « composite » par
 *    jour et par site couvre tous les sports (2 requêtes par passe) ;
 *  - on ne touche qu’aux matchs RSEQ de la fenêtre live, pas encore versés ;
 *  - le résultat officiel RSEQ l’emporte toujours (le bot reconstruit chaque
 *    match depuis S1 à chaque passe ; ce module ne remplit que les trous) ;
 *  - les fausses entrées « en cours » (ex. « Start of 2nd 0–0 » 15 min avant
 *    le coup d’envoi) sont écartées ;
 *  - toute panne de source dégrade en silence (aucune exception ne remonte).
 *
 * Affichage : « En direct » + pointage + période (pas de mention
 * « non officiel » : décision du mainteneur, 17 oct. 2026).
 */
'use strict';

const https = require('https');
const SportsLive = require('./sports-live-lib');

const SOURCES = [
  { id: 'usports', base: 'https://en.usports.ca', sector: 'universitaire' },
  { id: 'rseqdirect', base: 'https://rseqdirect.ca', sector: 'collegial' },
];

/** Code PrestoSports → sport le-radar + sexe. Sports sans direct ignorés. */
const SPORT_CODES = {
  fball: { sport: 'football', sex: 'M' },
  mbkb: { sport: 'basketball', sex: 'M' },
  wbkb: { sport: 'basketball', sex: 'F' },
  mice: { sport: 'hockey', sex: 'M' },
  wice: { sport: 'hockey', sex: 'F' },
  msoc: { sport: 'soccer', sex: 'M' },
  wsoc: { sport: 'soccer', sex: 'F' },
  mvball: { sport: 'volleyball', sex: 'M' },
  wvball: { sport: 'volleyball', sex: 'F' },
};

/**
 * Temps réel minimal (min) d’une période, pour écarter un « 3rd » affiché
 * 10 min après le coup d’envoi. Bas exprès : on ne veut rater aucun vrai match.
 */
const MIN_PERIOD_MIN = { basketball: 12, hockey: 18, soccer: 40, football: 15, volleyball: 12 };
const PERIOD_COUNT = { basketball: 4, hockey: 3, soccer: 2, football: 4, volleyball: 3 };
/** Tolérance sur l’heure de coup d’envoi RSEQ (match lancé un peu tôt). */
const EARLY_START_MS = 5 * 60 * 1000;

const FETCH_TIMEOUT_MS = 12000;
const CRAWL_DELAY_MS = 10000;
const MAX_BYTES = 4 * 1024 * 1024;

const FEED_FIELDS = ['liveFeed'];

// ── Texte ─────────────────────────────────────────────────────────────────

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+)(acute|grave|circ|uml|cedil);/gi, (m, l, k) => {
      const map = { acute: '\u0301', grave: '\u0300', circ: '\u0302', uml: '\u0308', cedil: '\u0327' };
      return (l + map[k.toLowerCase()]).normalize('NFC');
    })
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function stripTags(s) {
  return decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const STOPWORDS = new Set([
  'cegep', 'college', 'collegial', 'campus', 'universite', 'university', 'univ', 'u',
  'of', 'the', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'en', 'et',
  'prive', 'regional', 'school', 'ecole',
]);
const TOKEN_MAP = { st: 'saint', ste: 'sainte', mtl: 'montreal' };

/** Jetons significatifs d’un nom d’établissement (sans accents ni mots vides). */
function nameTokens(name) {
  const plain = decodeEntities(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’`]/g, "'");
  return plain
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => TOKEN_MAP[t] || t)
    .filter((t) => !STOPWORDS.has(t));
}

function nameKey(name) {
  return nameTokens(name).slice().sort().join(' ');
}

/**
 * Noms PrestoSports qui ne se ramènent pas aux alias du registre par les
 * jetons (sigles, graphies anglaises). Clé = nameKey(nom Presto).
 */
const PRESTO_ALIASES = {
  uqam: 'uqam',
  uqtr: 'uqtr',
  uqac: 'uqac',
  uqar: 'uqar',
  uqo: 'uqo',
  ets: 'ets',
  bishop: 'bishops',
  bishops: 'bishops',
  montreal: 'udem',
  rmc: 'college-militaire-royal',
  'heritage': 'heritage',
};

/** Index registre : nameKey(alias) → Set(registryId), par secteur. */
function buildRegistryIndex(registry) {
  const index = { universitaire: new Map(), collegial: new Map() };
  const teams = (registry && Array.isArray(registry.teams)) ? registry.teams : [];
  for (const t of teams) {
    if (!t || !t.id) continue;
    const bucket = index[t.sector] || (index[t.sector] = new Map());
    const names = [t.shortName, t.fullName].concat(Array.isArray(t.aliases) ? t.aliases : []);
    for (const n of names) {
      const k = nameKey(n);
      if (!k) continue;
      if (!bucket.has(k)) bucket.set(k, new Set());
      bucket.get(k).add(t.id);
    }
  }
  return index;
}

function registryIdsFor(name, sector, index) {
  const k = nameKey(name);
  const out = new Set();
  if (!k) return out;
  const bucket = index && index[sector];
  if (bucket && bucket.has(k)) for (const id of bucket.get(k)) out.add(id);
  if (PRESTO_ALIASES[k]) out.add(PRESTO_ALIASES[k]);
  return out;
}

// ── Parse de la page composite ────────────────────────────────────────────

function parseScore(html) {
  const txt = stripTags(html);
  if (!/^\d{1,3}$/.test(txt)) return null;
  return Number(txt);
}

/**
 * Cartes d’une page /composite?d=YYYY-MM-DD.
 * @returns {Array<{ code, sport, sex, state, statusText, away, home, neutral, boxscore }>}
 *   state : 'live' | 'final' | 'scheduled'. away/home : { name, score|null }.
 */
function parseCompositeHtml(html) {
  const out = [];
  const parts = String(html || '').split(/(?=<div class="card w-100 event-row)/);
  for (const card of parts.slice(1)) {
    try {
      const cls = (card.match(/^<div class="([^"]*)"/) || [])[1] || '';
      const codeM = card.match(/href="\/sports\/([a-z]+)\//);
      const code = codeM ? codeM[1] : '';
      const meta = SPORT_CODES[code];
      if (!meta) continue;
      const rows = card.split(/<div class="list-events-participants\b/).slice(1);
      if (rows.length !== 2) continue;
      const sides = rows.map((row) => {
        const nameM = row.match(/class="team-name"\s+title="([^"]*)"/);
        const resM = row.match(/class="event-result[^"]*"[^>]*>([\s\S]*?)<\/div>/);
        return {
          name: nameM ? decodeEntities(nameM[1]).trim() : '',
          score: resM ? parseScore(resM[1]) : null,
        };
      });
      if (!sides[0].name || !sides[1].name) continue;
      const statusM = card.match(/class="cal-status[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
      const inProgM = card.match(/class="inProgress"[^>]*>([\s\S]*?)<\/div>/);
      const statusText = stripTags(inProgM ? inProgM[1] : (statusM ? statusM[1] : ''));
      let state = 'scheduled';
      if (/\bin-progress\b/.test(cls) || inProgM) state = 'live';
      else if (/^final\b/i.test(statusText)) state = 'final';
      const boxM = card.match(/href="(\/sports\/[a-z]+\/[^"]*boxscores\/[^"]+\.xml)"/);
      out.push({
        code,
        sport: meta.sport,
        sex: meta.sex,
        state,
        statusText,
        neutral: /\bneutral\b/.test(cls),
        away: sides[0],
        home: sides[1],
        boxscore: boxM ? boxM[1] : null,
      });
    } catch {
      /* carte illisible : ignorée */
    }
  }
  return out;
}

// ── Période / horloge ────────────────────────────────────────────────────

function ordinalNumber(s) {
  const m = String(s || '').trim().match(/^(\d+)(?:st|nd|rd|th)?$/i);
  return m ? Number(m[1]) : null;
}

function frOrdinal(n, feminine) {
  if (n === 1) return feminine ? '1re' : '1er';
  return `${n}e`;
}

function periodNoun(sport) {
  if (sport === 'hockey') return { word: 'période', fem: true };
  if (sport === 'soccer') return { word: 'mi-temps', fem: true };
  if (sport === 'volleyball') return { word: 'manche', fem: true };
  return { word: 'quart', fem: false };
}

function cleanClock(c) {
  const m = String(c || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  return `${Number(m[1])}:${m[2]}`;
}

/**
 * « 4th - 02:55 » → { n: 4, label: '4e quart 2:55' } ; « Start of 2nd »,
 * « End of 1st », « Halftime », « OT - 03:00 », volleyball « 25-18,23-22 ».
 * n = numéro de période (null si inconnu) ; endOf = période terminée.
 */
function parseLiveStatus(statusText, sport) {
  const raw = String(statusText || '').replace(/\s+/g, ' ').trim();
  const noun = periodNoun(sport);
  if (!raw) return { n: null, label: '' };

  if (sport === 'volleyball' && /^\d+-\d+(\s*,\s*\d+-\d+)*$/.test(raw)) {
    const sets = raw.split(/\s*,\s*/);
    const n = sets.length;
    const cur = sets[n - 1].replace('-', '–');
    return { n, label: `${frOrdinal(n, true)} manche ${cur}` };
  }
  if (/^half\s*time$|^halftime$|^half$/i.test(raw)) {
    // Soccer : 1 demie jouée ; basket / football : 2 quarts joués.
    return { n: sport === 'soccer' ? 1 : 2, endOf: true, label: 'Mi-temps' };
  }
  let m = raw.match(/^(start|end) of (?:the )?(\w+)(?: half| quarter| period| set)?$/i);
  if (m) {
    const which = m[2];
    const ot = /^(\d*)ot$/i.exec(which);
    const n = ot ? null : ordinalNumber(which);
    const what = ot ? 'la prolongation' : (n ? `${frOrdinal(n, noun.fem)} ${noun.word}` : which);
    const start = /^start$/i.test(m[1]);
    return {
      n: ot ? (PERIOD_COUNT[sport] || 0) + 1 : n,
      endOf: !start,
      label: `${start ? 'Début' : 'Fin'} ${what}`.replace(/^(Début|Fin) (\d)/, '$1 de la $2')
        .replace(/de la (\d+(?:er|re|e) quart)/, 'du $1'),
    };
  }
  m = raw.match(/^(\w+)(?: half| quarter| period| set)?\s*-\s*(\d{1,2}:\d{2})$/i)
    || raw.match(/^(\w+)(?: half| quarter| period| set)?$/i);
  if (m) {
    const which = m[1];
    const clock = cleanClock(m[2]);
    const ot = /^(\d*)ot$/i.exec(which);
    if (ot) {
      const k = ot[1] ? Number(ot[1]) : 1;
      return {
        n: (PERIOD_COUNT[sport] || 0) + k,
        label: [k > 1 ? `${k}e prolongation` : 'Prolongation', clock].filter(Boolean).join(' '),
      };
    }
    if (/^so$/i.test(which)) return { n: (PERIOD_COUNT[sport] || 0) + 1, label: 'Tirs de barrage' };
    const n = ordinalNumber(which);
    if (n) return { n, label: [`${frOrdinal(n, noun.fem)} ${noun.word}`, clock].filter(Boolean).join(' ') };
  }
  return { n: null, label: '' };
}

// ── Plausibilité (fausses entrées) ───────────────────────────────────────

/**
 * Faux « en cours » / « final » : le site affiche parfois un gabarit
 * (« Start of 2nd 0–0 ») avant le coup d’envoi. On exige :
 *  - coup d’envoi RSEQ passé (marge 5 min) ;
 *  - assez de temps écoulé pour la période annoncée ;
 *  - pour un final, assez de temps pour un match complet.
 */
function isPlausible(event, rseqGame, now = Date.now()) {
  const t = SportsLive.gameMs(rseqGame);
  if (!Number.isFinite(t)) return false;
  if (now < t - EARLY_START_MS) return false;
  if (!SportsLive.inLiveWindow(rseqGame, now)) return false;
  const elapsedMin = (now - t) / 60000;
  const per = MIN_PERIOD_MIN[event.sport] || 10;
  if (event.state === 'final') {
    return elapsedMin >= per * (PERIOD_COUNT[event.sport] || 2);
  }
  const st = parseLiveStatus(event.statusText, event.sport);
  if (st.n) {
    const done = st.endOf ? st.n : st.n - 1;
    if (elapsedMin < done * per) return false;
  }
  return true;
}

// ── Correspondance avec les matchs RSEQ ──────────────────────────────────

function tokenSubset(a, b) {
  if (!a.length || !b.length) return false;
  const [small, big] = a.length <= b.length ? [a, b] : [b, a];
  const set = new Set(big);
  return small.every((t) => set.has(t)) && small.some((t) => t.length >= 3);
}

/**
 * Score de correspondance d’un nom Presto avec une formation RSEQ.
 * 3 = même registryId · 2 = même clé de nom · 1 = jetons inclus · 0 = non.
 */
function sideScore(prestoName, sector, cand, index) {
  const ids = registryIdsFor(prestoName, sector, index);
  if (cand.registryId && ids.has(cand.registryId)) return 3;
  if (cand.registryId && ids.size) return 0;
  const pk = nameKey(prestoName);
  const pt = nameTokens(prestoName);
  let best = 0;
  for (const n of cand.names) {
    if (!n) continue;
    if (nameKey(n) === pk) return 2;
    if (tokenSubset(pt, nameTokens(n))) best = Math.max(best, 1);
  }
  return best;
}

function teamGames(team) {
  const list = [];
  const seen = new Set();
  for (const g of [team.nextGame].concat(Array.isArray(team.nextGames) ? team.nextGames : [])) {
    if (g && typeof g === 'object' && !seen.has(g)) {
      seen.add(g);
      list.push(g);
    }
  }
  return list;
}

function faceKey(team, g) {
  if (g.gameId) return `id:${g.gameId}`;
  const pair = [team.registryId || team.name, g.opponentRegistryId || g.opponent].map(String).sort().join('|');
  return `pair:${g.date}|${g.time}|${team.sport}|${team.sex}|${pair}`;
}

/**
 * Matchs RSEQ candidats (fenêtre live, pas encore versés), groupés par match :
 * key → { date, sector, sport, sex, faces: [{ team, game }] }.
 */
function collectCandidates(teams, now = Date.now()) {
  const byKey = new Map();
  for (const team of Object.values(teams || {})) {
    if (!team || typeof team !== 'object') continue;
    if (!SOURCES.some((s) => s.sector === team.sector)) continue;
    for (const g of teamGames(team)) {
      if (g.final === true) continue;
      if (!SportsLive.inLiveWindow(g, now)) continue;
      const key = faceKey(team, g);
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          date: SportsLive.gameDay(g),
          sector: team.sector,
          sport: team.sport,
          sex: team.sex,
          faces: [],
        });
      }
      byKey.get(key).faces.push({ team, game: g });
    }
  }
  return byKey;
}

function faceSides(face) {
  const { team, game } = face;
  const us = {
    registryId: team.registryId || null,
    names: [team.fullName, team.name],
  };
  const them = {
    registryId: game.opponentRegistryId || null,
    names: [game.opponentFullName, game.opponent],
  };
  return game.home ? { home: us, away: them } : { home: them, away: us };
}

/** Meilleure correspondance (unique) d’un événement Presto parmi les candidats. */
function matchEvent(event, sector, candidates, index) {
  let best = null;
  let bestScore = 0;
  let tie = false;
  for (const cand of candidates.values()) {
    if (cand.sector !== sector || cand.sport !== event.sport) continue;
    if (cand.sex && event.sex && cand.sex !== event.sex) continue;
    if (event.date && cand.date && cand.date !== event.date) continue;
    const sides = faceSides(cand.faces[0]);
    const direct = Math.min(
      sideScore(event.home.name, sector, sides.home, index),
      sideScore(event.away.name, sector, sides.away, index),
    );
    let score = direct;
    let swapped = false;
    if (event.neutral || !direct) {
      const rev = Math.min(
        sideScore(event.home.name, sector, sides.away, index),
        sideScore(event.away.name, sector, sides.home, index),
      );
      // Site neutre : domicile/visiteur peuvent être inversés entre les sources.
      if (event.neutral && rev > score) {
        score = rev;
        swapped = true;
      }
    }
    if (!score) continue;
    if (score > bestScore) {
      best = { cand, swapped };
      bestScore = score;
      tie = false;
    } else if (score === bestScore) {
      tie = true;
    }
  }
  return tie ? null : best;
}

// ── Application au payload ───────────────────────────────────────────────

function clearFeedFields(g) {
  if (!g || !g.liveFeed) return;
  delete g.scoreFor;
  delete g.scoreAgainst;
  delete g.period;
  delete g.liveFeed;
}

function resultLetter(a, b) {
  if (a > b) return 'W';
  if (a < b) return 'L';
  return 'D';
}

/**
 * Colle les pointages Presto sur les matchs RSEQ correspondants.
 *  - en cours : nextGame.live = true, scoreFor/scoreAgainst, period ;
 *  - final Presto, RSEQ pas encore versé : le match passe en résultat
 *    (results/lastGame), comme un résultat RSEQ, jusqu’au rapport officiel.
 * Un match déjà pointé par RSEQ (score S1) n’est jamais touché.
 *
 * @param {Record<string, object>} teams  payload.teams (muté)
 * @param {Array<{ source, sector, date, events }>} feeds
 * @returns {{ live: number, final: number, dropped: number, unmatched: number }}
 */
function applyPrestoLive(teams, feeds, { registry, now = Date.now() } = {}) {
  const stats = { live: 0, final: 0, dropped: 0, unmatched: 0, matched: [] };
  const index = buildRegistryIndex(registry);
  const candidates = collectCandidates(teams, now);
  const okSectors = new Set((feeds || []).filter((f) => f && f.ok).map((f) => f.sector));
  // Source lue avec succès : on repart de zéro (le site fait foi pour l’état courant).
  for (const cand of candidates.values()) {
    if (!okSectors.has(cand.sector)) continue;
    for (const f of cand.faces) {
      clearFeedFields(f.game);
      // Résultat provisoire d’une passe précédente, match revenu en « prochain »
      // (S1 sans score) : on le retire, il sera recollé si la source le confirme.
      const gid = f.game.gameId;
      if (gid && Array.isArray(f.team.results) && f.team.results.some((r) => r && r.liveFeed && r.gameId === gid)) {
        f.team.results = f.team.results.filter((r) => !(r && r.liveFeed && r.gameId === gid));
        f.team.lastGame = f.team.results[0] || null;
      }
    }
  }
  const used = new Set();
  for (const feed of feeds || []) {
    if (!feed || !feed.ok) continue;
    for (const ev of feed.events || []) {
      if (ev.state === 'scheduled') continue;
      if (ev.home.score == null || ev.away.score == null) continue;
      const event = { ...ev, date: feed.date };
      const hit = matchEvent(event, feed.sector, candidates, index);
      if (!hit) {
        stats.unmatched += 1;
        continue;
      }
      const { cand, swapped } = hit;
      if (used.has(cand.key)) continue;
      const ref = cand.faces[0].game;
      // RSEQ a déjà un pointage (rapport déposé) : il fait foi.
      if (cand.faces.some((f) => SportsLive.rseqHasScore(f.game) && !f.game.liveFeed)) continue;
      if (!isPlausible(event, ref, now)) {
        stats.dropped += 1;
        continue;
      }
      used.add(cand.key);
      const homeScore = swapped ? ev.away.score : ev.home.score;
      const awayScore = swapped ? ev.home.score : ev.away.score;
      const period = event.state === 'live' ? parseLiveStatus(ev.statusText, ev.sport).label : '';
      for (const { team, game } of cand.faces) {
        const sf = game.home ? homeScore : awayScore;
        const sa = game.home ? awayScore : homeScore;
        if (event.state === 'live') {
          game.live = true;
          game.scoreFor = sf;
          game.scoreAgainst = sa;
          if (period) game.period = period;
          else delete game.period;
          game.liveFeed = feed.source;
        } else {
          promoteToResult(team, game, sf, sa, feed.source);
        }
      }
      if (event.state === 'live') stats.live += 1;
      else stats.final += 1;
      stats.matched.push(`${ev.sport} ${ev.away.name} @ ${ev.home.name} ${ev.away.score}-${ev.home.score} ${event.state === 'live' ? (period || 'en cours') : 'final'}`);
    }
  }
  return stats;
}

/** Final Presto : nextGame → résultat (même forme qu’un résultat RSEQ). */
function promoteToResult(team, game, sf, sa, source) {
  const res = { ...game };
  delete res.live;
  delete res.period;
  delete res.final;
  res.scoreFor = sf;
  res.scoreAgainst = sa;
  res.result = resultLetter(sf, sa);
  res.liveFeed = source;
  const same = (g) => g === game || (game.gameId && g && g.gameId === game.gameId);
  if (Array.isArray(team.nextGames)) team.nextGames = team.nextGames.filter((g) => !same(g));
  if (team.nextGame && same(team.nextGame)) team.nextGame = (team.nextGames && team.nextGames[0]) || null;
  const results = (Array.isArray(team.results) ? team.results : []).filter((g) => !same(g));
  results.push(res);
  results.sort((a, b) => `${b.date || ''}T${b.time || ''}`.localeCompare(`${a.date || ''}T${a.time || ''}`));
  team.results = results;
  team.lastGame = results[0] || null;
}

/**
 * Source en panne pendant cette passe : on recolle le dernier pointage connu
 * (snapshot précédent) sur les matchs encore sans score, pour éviter un
 * clignotement vers 0–0. Rien n’est inventé : seulement l’état d’il y a 3 min.
 */
function carryPreviousFeed(teams, previousTeams, okSectors, now = Date.now()) {
  let carried = 0;
  for (const [id, team] of Object.entries(teams || {})) {
    if (!team || okSectors.has(team.sector)) continue;
    const prev = previousTeams && previousTeams[id];
    if (!prev) continue;
    const prevGames = new Map();
    for (const g of teamGames(prev)) if (g.liveFeed && g.gameId) prevGames.set(g.gameId, g);
    for (const g of (prev.results || [])) if (g && g.liveFeed && g.gameId) prevGames.set(g.gameId, g);
    if (!prevGames.size) continue;
    for (const g of teamGames(team)) {
      const p = g.gameId && prevGames.get(g.gameId);
      if (!p || g.final === true || SportsLive.rseqHasScore(g)) continue;
      if (!SportsLive.inLiveWindow(g, now)) continue;
      if (p.result) {
        promoteToResult(team, g, p.scoreFor, p.scoreAgainst, p.liveFeed);
      } else {
        g.live = true;
        g.scoreFor = p.scoreFor;
        g.scoreAgainst = p.scoreAgainst;
        if (p.period) g.period = p.period;
        g.liveFeed = p.liveFeed;
      }
      carried += 1;
    }
  }
  return carried;
}

// ── Réseau ───────────────────────────────────────────────────────────────

function fetchText(url, { timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, v) => { if (!done) { done = true; fn(v); } };
    const req = https.get(url, {
      headers: {
        // Identifié, mais sans « bot » : le pare-feu PrestoSports renvoie 403 à
        // tout UA contenant « bot » (17 oct. 2026). robots.txt autorise
        // /composite (seul /action/ est interdit — on n’y touche pas).
        'User-Agent': 'le-radar.ca/1.0 (+https://le-radar.ca)',
        Accept: 'text/html',
      },
      timeout: timeoutMs,
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        finish(reject, new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_BYTES) {
          req.destroy();
          finish(reject, new Error('trop gros'));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => finish(resolve, Buffer.concat(chunks).toString('utf8')));
      res.on('error', (e) => finish(reject, e));
    });
    req.on('timeout', () => { req.destroy(); finish(reject, new Error('timeout')); });
    req.on('error', (e) => finish(reject, e));
    setTimeout(() => { req.destroy(); finish(reject, new Error('timeout')); }, timeoutMs + 2000).unref();
  });
}

/** Jours civils (Toronto) et secteurs des matchs en fenêtre live. */
function liveNeeds(teams, now = Date.now()) {
  const need = new Map();
  for (const cand of collectCandidates(teams, now).values()) {
    if (!cand.date) continue;
    if (!need.has(cand.sector)) need.set(cand.sector, new Set());
    need.get(cand.sector).add(cand.date);
  }
  return need;
}

/**
 * Lit les pages composite nécessaires. Ne lève jamais : une source en panne
 * revient { ok: false }.
 */
async function fetchPrestoFeeds(teams, {
  now = Date.now(), fetchImpl = fetchText, log = () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  const need = liveNeeds(teams, now);
  const feeds = [];
  for (const src of SOURCES) {
    const days = need.get(src.sector);
    if (!days || !days.size) continue;
    let first = true;
    for (const date of [...days].sort()) {
      // robots.txt : Crawl-Delay 10 entre deux pages du même site.
      if (!first) await sleep(CRAWL_DELAY_MS);
      first = false;
      // Paramètre supplémentaire : contourne le cache de 5 min de la page.
      const url = `${src.base}/composite?d=${date}&_=${Math.floor(now / 60000)}`;
      try {
        const html = await fetchImpl(url);
        const events = parseCompositeHtml(html);
        feeds.push({ source: src.id, sector: src.sector, date, ok: true, events });
        log(`${src.id} ${date}: ${events.length} matchs, ${events.filter((e) => e.state === 'live').length} en cours`);
      } catch (err) {
        feeds.push({ source: src.id, sector: src.sector, date, ok: false, events: [], error: String(err.message || err) });
        log(`${src.id} ${date}: indisponible (${err.message || err})`);
      }
    }
  }
  return feeds;
}

/**
 * Point d’entrée du bot : lit les sources et colle les pointages. Ne lève
 * jamais ; en cas de pépin, le payload RSEQ reste tel quel.
 */
async function overlayPrestoLive(teams, {
  registry, previousTeams, now = Date.now(), fetchImpl, log = () => {}, sleep,
} = {}) {
  try {
    const feeds = await fetchPrestoFeeds(teams, { now, fetchImpl, log, sleep });
    if (!feeds.length) return { skipped: true };
    const okSectors = new Set();
    const badSectors = new Set();
    for (const f of feeds) (f.ok ? okSectors : badSectors).add(f.sector);
    for (const s of badSectors) okSectors.delete(s);
    const stats = applyPrestoLive(teams, feeds.filter((f) => okSectors.has(f.sector)), { registry, now });
    stats.carried = carryPreviousFeed(teams, previousTeams, okSectors, now);
    stats.failed = feeds.filter((f) => !f.ok).map((f) => `${f.source} ${f.error}`);
    return stats;
  } catch (err) {
    log(`erreur ignorée (${err.message || err})`);
    return { error: String(err.message || err) };
  }
}

module.exports = {
  SOURCES,
  SPORT_CODES,
  FEED_FIELDS,
  nameTokens,
  nameKey,
  buildRegistryIndex,
  registryIdsFor,
  parseCompositeHtml,
  parseLiveStatus,
  isPlausible,
  sideScore,
  collectCandidates,
  matchEvent,
  applyPrestoLive,
  carryPreviousFeed,
  liveNeeds,
  fetchPrestoFeeds,
  overlayPrestoLive,
};

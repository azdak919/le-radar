/**
 * LE-RADAR — classification « en cours » des matchs RSEQ (bot + tests).
 *
 * L’API S1 n’expose pas un statut live fiable : les scores restent à -999
 * jusqu’au rapport, puis deviennent officiels. On distingue :
 *  - upcoming : hors fenêtre visuelle
 *  - live     : coup d’envoi −15 min / +3 h, pas encore final
 *  - final    : classements / rapport, ou score hors fenêtre
 *
 * Jour civil et heure de coup d’envoi : America/Toronto. GitHub Actions est
 * en UTC ; un `toISOString().slice(0, 10)` à 20:00 EDT ferait disparaître
 * les matchs du jour encore sans score.
 */
'use strict';

const SCORE_NONE = -999;
const TZ = 'America/Toronto';
const LIVE_LEAD_MS = 15 * 60 * 1000;
const LIVE_TAIL_MS = 3 * 3600 * 1000;
const ZERO_GUID = '00000000-0000-0000-0000-000000000000';

function torontoDayKey(msOrDate = Date.now()) {
  const d = msOrDate instanceof Date ? msOrDate : new Date(msOrDate);
  if (!Number.isFinite(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Instant UTC d’une date civile + heure « HH:MM » lues comme heure de Québec.
 * (17:00 le 23 août 2026 → 21:00 UTC en EDT.)
 */
function zonedTimeToMs(ymd, hhmm, timeZone = TZ) {
  const day = String(ymd || '').slice(0, 10);
  const m = String(hhmm || '12:00').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !m) return NaN;
  const hh = String(Math.min(23, Number(m[1]))).padStart(2, '0');
  const mm = m[2];
  const utc = Date.parse(`${day}T${hh}:${mm}:00Z`);
  if (!Number.isFinite(utc)) return NaN;
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return utc;
  }
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(utc)).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.parse(
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
  );
  if (!Number.isFinite(asUtc)) return utc;
  return utc - (asUtc - utc);
}

function gameDay(game) {
  if (!game) return '';
  const raw = game.date
    || game.GameDateFormatted
    || game.GameDateText
    || String(game.GameDate || '').slice(0, 10);
  const day = String(raw || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}

function gameTime(game) {
  if (!game) return '';
  return String(game.time || game.GameTimeFormatted || '').trim();
}

function gameMs(game, timeZone = TZ) {
  return zonedTimeToMs(gameDay(game), gameTime(game) || '12:00', timeZone);
}

function isScoreValue(n) {
  return Number.isFinite(n) && n !== SCORE_NONE;
}

function rseqHasScore(game) {
  if (!game) return false;
  if (isScoreValue(game.HomeTeamScore) && isScoreValue(game.VisitingTeamScore)) return true;
  return isScoreValue(Number(game.scoreFor)) && isScoreValue(Number(game.scoreAgainst));
}

function isZeroGuid(id) {
  const s = String(id || '').trim().toLowerCase();
  return !s || s === ZERO_GUID;
}

function rseqIsSubmitted(game) {
  if (!game) return false;
  if (game.IsSubmittedForStandings === true || game.final === true) return true;
  if (!isZeroGuid(game.HomeTeamGameReportId) || !isZeroGuid(game.VisitingTeamGameReportId)) {
    return true;
  }
  return false;
}

function inLiveWindow(game, now = Date.now()) {
  const t = gameMs(game);
  if (!Number.isFinite(t)) return false;
  return t <= now + LIVE_LEAD_MS && t >= now - LIVE_TAIL_MS;
}

/** En cours : fenêtre visuelle, pas encore versé aux classements. */
function isLiveRaw(game, now = Date.now()) {
  if (!game || rseqIsSubmitted(game) || game.live === false) return false;
  if (game.live === true && inLiveWindow(game, now)) return true;
  return inLiveWindow(game, now) && !rseqIsSubmitted(game);
}

/**
 * Terminé : rapport / classements, ou score hors fenêtre live.
 * Un 0-0 encore dans la fenêtre (rapport pas déposé) reste live.
 */
function isFinalRaw(game, now = Date.now()) {
  if (!game) return false;
  if (rseqIsSubmitted(game) || game.final === true) return true;
  if (rseqHasScore(game) && !inLiveWindow(game, now)) return true;
  return false;
}

function formatLivePeriod(game, sport) {
  if (!game) return '';
  const raw = String(game.TimeLeftPeriod || game.period || '').trim();
  const clock = String(game.TimeLeftFormatted || game.clock || '').trim();
  if (!raw && !clock) return '';
  const n = parseInt(raw, 10);
  let label = raw;
  const sp = String(sport || game.sport || '').toLowerCase();
  if (Number.isFinite(n) && String(n) === raw) {
    if (sp === 'soccer' || sp === 'soccer-interieur' || sp === 'futsal') {
      label = n === 1 ? '1re mi-temps' : n === 2 ? '2e mi-temps' : `période ${n}`;
    } else if (sp === 'hockey') {
      label = n === 1 ? '1re période' : n === 2 ? '2e période' : n === 3 ? '3e période' : `période ${n}`;
    } else {
      label = n === 1 ? '1re' : `${n}e`;
    }
  }
  return [label, clock].filter(Boolean).join(' ').trim();
}

function overlayLiveDetail(game, detail) {
  if (!game) return game;
  if (!detail || typeof detail !== 'object') return game;
  const out = { ...game };
  const keys = [
    'HomeTeamScore',
    'VisitingTeamScore',
    'TimeLeftPeriod',
    'TimeLeftMinutes',
    'TimeLeftSeconds',
    'TimeLeftFormatted',
    'IsSubmittedForStandings',
    'IsPartialResults',
    'HomeTeamScoreFormatted',
    'VisitingTeamScoreFormatted',
    'HomeTeamGameReportId',
    'VisitingTeamGameReportId',
  ];
  for (const k of keys) {
    if (detail[k] != null && detail[k] !== '') out[k] = detail[k];
  }
  return out;
}

/**
 * Annote un nextGame normalisé (payload sports.json).
 * @param {object} out
 * @param {object} rseqGame  objet S1 (éventuellement overlay GameDiffusion)
 * @param {{ home: boolean, sport?: string, now?: number }} opts
 */
function annotateNextGame(out, rseqGame, opts = {}) {
  if (!out) return out;
  const now = opts.now || Date.now();
  const home = !!opts.home;
  const live = isLiveRaw(rseqGame || out, now) && !isFinalRaw(rseqGame || out, now);
  if (live) out.live = true;
  else delete out.live;
  const src = rseqGame || out;
  if (rseqHasScore(src)) {
    if (src.HomeTeamScore != null && src.VisitingTeamScore != null) {
      out.scoreFor = home ? src.HomeTeamScore : src.VisitingTeamScore;
      out.scoreAgainst = home ? src.VisitingTeamScore : src.HomeTeamScore;
    }
  }
  const period = formatLivePeriod(src, opts.sport || out.sport);
  if (period) out.period = period;
  else delete out.period;
  if (isFinalRaw(src, now)) {
    out.final = true;
    out.live = false;
  }
  return out;
}

function findLiveLeagueIds(teams, now = Date.now()) {
  const ids = new Set();
  if (!teams || typeof teams !== 'object') return [];
  for (const team of Object.values(teams)) {
    if (!team || !team.leagueId) continue;
    const games = [team.nextGame].concat(Array.isArray(team.nextGames) ? team.nextGames : []);
    for (const g of games) {
      if (g && isLiveRaw(g, now)) ids.add(String(team.leagueId));
    }
  }
  return [...ids];
}

function liveGameIdsFromTeams(teams, now = Date.now()) {
  const ids = new Set();
  if (!teams || typeof teams !== 'object') return [];
  for (const team of Object.values(teams)) {
    const games = [team.nextGame].concat(Array.isArray(team.nextGames) ? team.nextGames : []);
    for (const g of games) {
      if (g && isLiveRaw(g, now) && g.gameId) ids.add(String(g.gameId));
    }
  }
  return [...ids];
}

module.exports = {
  SCORE_NONE,
  TZ,
  LIVE_LEAD_MS,
  LIVE_TAIL_MS,
  torontoDayKey,
  zonedTimeToMs,
  gameDay,
  gameTime,
  gameMs,
  rseqHasScore,
  rseqIsSubmitted,
  inLiveWindow,
  isLiveRaw,
  isFinalRaw,
  formatLivePeriod,
  overlayLiveDetail,
  annotateNextGame,
  findLiveLeagueIds,
  liveGameIdsFromTeams,
};

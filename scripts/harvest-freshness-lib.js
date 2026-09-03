/**
 * LE-RADAR — gardien de fraîcheur des récoltes (news / sports / radio / ligues).
 *
 * GitHub lâche les crons fréquents de ce dépôt. Les bots métier gardent leurs
 * créneaux ; ce module dit *quand* un filet doit relancer une passe, et
 * conserve les stats de catalogue d’un crawl complet après un --live.
 *
 * SLAs (minutes, civil America/Toronto) :
 *   news   : 75 min 6 h–22 h QC ; 12 h la nuit
 *   sports : 90 min dès 12 h QC ; 6 h le matin
 *   radio  : 45 min toute la journée
 *   ligues : 21 jours
 */

'use strict';

const TZ = 'America/Toronto';

const FEEDS = {
  news: {
    id: 'news',
    slaDayMin: 75,
    slaNightMin: 720,
    dayStartHour: 6,
    dayEndHour: 22,
  },
  sports: {
    id: 'sports',
    slaDayMin: 90,
    slaNightMin: 360,
    dayStartHour: 12,
    dayEndHour: 24,
  },
  radio: {
    id: 'radio',
    slaDayMin: 45,
    slaNightMin: 45,
    dayStartHour: 0,
    dayEndHour: 24,
  },
  leagues: {
    id: 'leagues',
    slaDayMin: 21 * 24 * 60,
    slaNightMin: 21 * 24 * 60,
    dayStartHour: 0,
    dayEndHour: 24,
  },
};

function torontoHour(msOrDate = Date.now()) {
  const d = msOrDate instanceof Date ? msOrDate : new Date(msOrDate);
  if (!Number.isFinite(d.getTime())) return 0;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d);
    return Number((parts.find((p) => p.type === 'hour') || {}).value) || 0;
  } catch {
    return d.getUTCHours();
  }
}

function parseStamp(value) {
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

function ageMinutes(stamp, now = Date.now()) {
  const t = parseStamp(stamp);
  if (!t) return Number.POSITIVE_INFINITY;
  return Math.floor((now - t) / 60000);
}

function slaMinutes(feed, hour) {
  const h = Number(hour);
  const inDay = h >= feed.dayStartHour && h < feed.dayEndHour;
  return inDay ? feed.slaDayMin : feed.slaNightMin;
}

function sportsHtmlStamp(html) {
  const raw = String(html || '');
  const m = raw.match(/class="sports-board-meta__time"[^>]*datetime="([^"]+)"/i)
    || raw.match(/datetime="([^"]+)"[^>]*class="sports-board-meta__time"/i);
  return m ? m[1] : '';
}

function feedState(feed, stamp, hour, now) {
  const sla = slaMinutes(feed, hour);
  const age = ageMinutes(stamp, now);
  return {
    id: feed.id,
    stamp: stamp || null,
    ageMin: Number.isFinite(age) ? age : null,
    slaMin: sla,
    stale: age > sla,
  };
}

/**
 * @param {{
 *   now?: number,
 *   newsUpdated?: string,
 *   sportsUpdated?: string,
 *   radioUpdated?: string,
 *   leaguesGenerated?: string,
 *   sportsHtmlDatetime?: string,
 * }} input
 */
function evaluateHarvest(input = {}) {
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  const hour = torontoHour(now);
  const feeds = [
    feedState(FEEDS.news, input.newsUpdated, hour, now),
    feedState(FEEDS.sports, input.sportsUpdated, hour, now),
    feedState(FEEDS.radio, input.radioUpdated, hour, now),
    feedState(FEEDS.leagues, input.leaguesGenerated, hour, now),
  ];
  const byId = Object.fromEntries(feeds.map((f) => [f.id, f]));
  const actions = [];
  if (byId.leagues.stale) actions.push('leagues');
  if (byId.sports.stale || byId.leagues.stale) actions.push('sports-full');
  const htmlStamp = String(input.sportsHtmlDatetime || '').trim();
  const sportsStamp = String(input.sportsUpdated || '').trim();
  if (
    sportsStamp
    && htmlStamp
    && htmlStamp !== sportsStamp
    && parseStamp(htmlStamp)
    && parseStamp(htmlStamp) < parseStamp(sportsStamp)
    && !actions.includes('sports-full')
  ) {
    actions.push('sports-html');
  }
  if (!htmlStamp && sportsStamp && !actions.includes('sports-full')) {
    actions.push('sports-html');
  }
  if (byId.radio.stale) actions.push('radio');
  if (byId.news.stale) actions.push('news');
  return { hour, feeds, actions };
}

const CATALOG_KEYS = [
  'leagueCatalog',
  'leaguesWithTeams',
  'leaguesOk',
  'leaguesFailed',
  'sportsCatalog',
  'sportsCovered',
  'sportsMissing',
  'registryMatched',
  'note',
  'source',
];

/**
 * Un --live ne doit pas publier leaguesOk=1 / sportsCatalog=['soccer']
 * alors que le crawl complet est encore dans teams.
 */
function preserveHarvestCatalogStats(payload, previous) {
  if (!payload || typeof payload !== 'object') return payload;
  if (!previous || typeof previous !== 'object') return payload;
  const prevOk = Number(previous.leaguesOk) || 0;
  const nextOk = Number(payload.leaguesOk) || 0;
  if (prevOk <= nextOk) return payload;
  const out = { ...payload };
  for (const key of CATALOG_KEYS) {
    if (previous[key] != null) out[key] = previous[key];
  }
  const prevFetched = Array.isArray(previous.sportsFetched) ? previous.sportsFetched : [];
  const nowFetched = Array.isArray(payload.sportsFetched) ? payload.sportsFetched : [];
  out.sportsFetched = [...new Set([...prevFetched, ...nowFetched])].sort();
  if (previous.teamsPreservedOnError != null && payload.teamsPreservedOnError == null) {
    out.teamsPreservedOnError = previous.teamsPreservedOnError;
  }
  return out;
}

module.exports = {
  TZ,
  FEEDS,
  torontoHour,
  parseStamp,
  ageMinutes,
  slaMinutes,
  sportsHtmlStamp,
  evaluateHarvest,
  preserveHarvestCatalogStats,
};

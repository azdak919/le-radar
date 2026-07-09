/**
 * Source retention — shared rules for all LE RADAR news bots.
 *
 * Fraîcheur des articles : règle universelle dans session-freshness-lib.js
 * (bots + UI). Ce module ajoute registre, cache, drop de sources, etc.
 *
 * Registry field `botHints` (optional, per source in news-sources.json):
 *   { "fetch": {}, "authors": {}, "images": {}, "excerpts": {}, "credits": {} }
 */

const fs = require('fs');
const path = require('path');
const sessionFreshness = require('./session-freshness-lib');

const {
  FRESHNESS_SESSION_COUNT,
  CONTINGENCY_MAX_SESSIONS_BACK,
  getCurrentUniversitySessionStart,
  getUniversitySessionStart,
  getUniversitySessionBand,
  isSeptemberAutumnGrace,
  freshnessMaxSessionsBack,
  isPublishedOnOrBefore,
  isWithinUniversitySessionBand,
  isWithinFreshnessWindow,
  filterFreshItems,
  pruneToFreshWindow,
  freshnessWindowStart,
} = sessionFreshness;

const NEWS_PATH = path.join(__dirname, '..', 'news.json');
const SOURCES_PATH = path.join(__dirname, '..', 'news-sources.json');

// === Article / source grouping ===============================================

function groupItemsBySource(items = []) {
  const map = new Map();
  for (const item of items) {
    const src = item.source || '';
    if (!src) continue;
    if (!map.has(src)) map.set(src, []);
    map.get(src).push(item);
  }
  return map;
}

function latestItemDate(items = []) {
  let best = 0;
  for (const item of items) {
    const t = Date.parse(item.date || '');
    if (Number.isFinite(t) && t > best) best = t;
  }
  return best ? new Date(best).toISOString() : null;
}

function sourceHasFreshContent(items = [], referenceDate = new Date()) {
  return filterFreshItems(items, referenceDate).length > 0;
}

function retainablePriorArticles(priorItems = [], referenceDate = new Date()) {
  return filterFreshItems(priorItems, referenceDate);
}

/**
 * Strip source-level fields so cached rows can be re-wrapped by fetch-news.
 */
function articlePayloadFromPrior(item) {
  const {
    source,
    institution,
    region,
    type,
    lang,
    _retainedFromCache,
    ...rest
  } = item;
  return rest;
}

function markRetainedArticles(items) {
  return items.map((item) => ({
    ...articlePayloadFromPrior(item),
    _retainedFromCache: true,
  }));
}

// === Registry / news.json helpers ============================================

function readNewsJson() {
  try {
    return JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
  } catch {
    return { items: [] };
  }
}

function readNewsItems() {
  return readNewsJson().items || [];
}

/** name → registry entry (active sources only). */
function loadSourceRegistryMap() {
  const registry = readRegistry();
  return new Map((registry.active || []).filter((s) => s._status !== 'dead').map((s) => [s.name, s]));
}

function readRegistry() {
  try {
    return JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
  } catch {
    return { active: [], candidates: [] };
  }
}

function writeRegistry(registry) {
  fs.writeFileSync(SOURCES_PATH, JSON.stringify(registry, null, 2) + '\n');
}

function findRegistrySource(registry, name) {
  return (registry.active || []).find((s) => s.name === name) || null;
}

/**
 * Per-bot instructions from news-sources.json → botHints.<bot>.
 * Example:
 *   "botHints": {
 *     "authors": { "verifyPage": true },
 *     "images": { "rejectPathPatterns": ["lapige_web"] }
 *   }
 */
function getBotHints(src = {}, bot = '') {
  if (!src || !bot) return {};
  const hints = src.botHints;
  if (!hints || typeof hints !== 'object') return {};
  const block = hints[bot];
  return block && typeof block === 'object' ? block : {};
}

/**
 * Whether a source may be dropped from news.json / marked dead.
 * Requires no fresh articles in cache AND no fresh _lastItemDate in registry.
 */
function shouldDropSource({
  sourceName,
  priorItems = [],
  registryEntry = null,
  referenceDate = new Date(),
}) {
  const freshPrior = retainablePriorArticles(priorItems, referenceDate);
  if (freshPrior.length > 0) return false;

  const lastRegistry = registryEntry?._lastItemDate;
  if (lastRegistry) {
    const t = Date.parse(lastRegistry);
    if (Number.isFinite(t) && t >= freshnessWindowStart(referenceDate).getTime()) {
      return false;
    }
  }

  return true;
}

/**
 * Update registry entry after a fetch-news run for one source.
 */
function applyFetchRegistryUpdate(src, {
  fetchOk = false,
  usedStaleCache = false,
  items = [],
  referenceDate = new Date(),
}) {
  if (!src) return;
  src._lastChecked = new Date().toISOString();

  const lastArticle = latestItemDate(items);
  if (lastArticle) src._lastItemDate = lastArticle;

  if (fetchOk && !usedStaleCache) {
    src._failCount = 0;
    src._lastFetchOk = src._lastChecked;
    if (src._status === 'dead') src._status = 'ok';
    return;
  }

  if (usedStaleCache) {
    src._failCount = (src._failCount || 0) + 1;
    src._status = 'stale';
    return;
  }

  src._failCount = (src._failCount || 0) + 1;
  const fresh = sourceHasFreshContent(items, referenceDate);
  if (!fresh && src._failCount >= 4) {
    src._status = 'dead';
  } else if (src._status !== 'dead') {
    src._status = fresh ? 'ok' : 'stale';
  }
}

const DAY_MS = 86400000;
const OK_DAYS = 270;

/** Classify a feed by latest item date using the 3-session UI window. */
function classifyFeedFreshness(lastItemMs, referenceDate = new Date()) {
  if (lastItemMs == null || !Number.isFinite(lastItemMs)) {
    return { status: 'stale', lastItemDate: null };
  }
  const windowStart = freshnessWindowStart(referenceDate).getTime();
  let status = 'ok';
  if (lastItemMs < windowStart) status = 'dead';
  else if ((referenceDate.getTime() - lastItemMs) / DAY_MS > OK_DAYS) status = 'stale';
  return { status, lastItemDate: new Date(lastItemMs).toISOString() };
}

function buildSourceRunMeta({
  sourceName,
  fetchOk,
  usedStaleCache,
  items = [],
  referenceDate = new Date(),
}) {
  const freshCount = filterFreshItems(items, referenceDate).length;
  return {
    fetchOk,
    stale: usedStaleCache,
    articleCount: items.length,
    freshArticleCount: freshCount,
    lastArticle: latestItemDate(items),
    lastFetchOk: fetchOk && !usedStaleCache ? new Date().toISOString() : null,
  };
}

module.exports = {
  // Règle universelle (session-freshness-lib)
  FRESHNESS_SESSION_COUNT,
  CONTINGENCY_MAX_SESSIONS_BACK,
  freshnessWindowStart,
  freshnessMaxSessionsBack,
  isSeptemberAutumnGrace,
  getCurrentUniversitySessionStart,
  getUniversitySessionStart,
  getUniversitySessionBand,
  isWithinFreshnessWindow,
  isWithinUniversitySessionBand,
  isPublishedOnOrBefore,
  filterFreshItems,
  pruneToFreshWindow,
  // Registre / news.json
  groupItemsBySource,
  latestItemDate,
  sourceHasFreshContent,
  retainablePriorArticles,
  markRetainedArticles,
  articlePayloadFromPrior,
  readNewsJson,
  readNewsItems,
  loadSourceRegistryMap,
  readRegistry,
  writeRegistry,
  findRegistrySource,
  getBotHints,
  shouldDropSource,
  applyFetchRegistryUpdate,
  buildSourceRunMeta,
  classifyFeedFreshness,
  OK_DAYS,
};
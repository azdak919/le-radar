/**
 * Pages source disparues — le flux RSS peut encore annoncer un article
 * dont le permalien public répond 404 (McGill Daily, 2026-10-05).
 *
 * On ne retire que ce qui est confirmé disparu. Un timeout, un 403,
 * un 5xx ou une page « un instant » Cloudflare ne retire rien : le fil
 * garde l'article jusqu'à une preuve de disparition.
 */
const fs = require('fs');
const path = require('path');
const { isChallengeOrInterstitialPage } = require('./source-retention-lib');

const LEDGER_PATH = path.join(__dirname, '..', 'data', 'live-link-health.json');
const MISSING_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const CHECK_REFRESH_MS = 24 * 60 * 60 * 1000;

function emptyLedger() {
  return { schemaVersion: 1, updated: null, entries: {} };
}

function articleLinkKey(link = '') {
  try {
    const url = new URL(String(link).trim());
    url.search = '';
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return String(link || '').split('?')[0].split('#')[0].replace(/\/+$/, '');
  }
}

function decodeBasic(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pageTitleFromHtml(html) {
  const source = String(html || '').slice(0, 80_000);
  const og = source.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || source.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (og) return decodeBasic(og[1]);
  const title = source.match(/<title[^>]*>([^<]*)<\/title>/i);
  return title ? decodeBasic(title[1]) : '';
}

function fold(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Le titre de la page contient encore le titre de l'article (pas une page 404). */
function titleMatchesArticle(pageTitle, articleTitle) {
  const article = fold(articleTitle);
  const page = fold(pageTitle);
  if (article.length < 16 || page.length < 16) return false;
  return page.includes(article.slice(0, 40));
}

function isHomepageRedirect(originUrl, finalUrl) {
  if (!originUrl || !finalUrl) return false;
  try {
    const origin = new URL(originUrl);
    const final = new URL(finalUrl);
    if (origin.hostname.replace(/^www\./, '') !== final.hostname.replace(/^www\./, '')) return false;
    const originPath = origin.pathname.replace(/\/+$/, '');
    const finalPath = final.pathname.replace(/\/+$/, '');
    return originPath.length > 0 && finalPath.length === 0;
  } catch {
    return false;
  }
}

function isNotFoundPath(finalUrl) {
  try {
    const pathname = new URL(finalUrl).pathname.toLowerCase();
    return pathname === '/404' || pathname === '/404/'
      || pathname.includes('/not-found')
      || pathname.includes('/page-introuvable');
  } catch {
    return false;
  }
}

/**
 * Classe une réponse déjà suivie (redirections résolues).
 * `missing` retire l'article. `suspect` et `unreachable` le laissent.
 */
function classifyFetched({
  originUrl = '',
  statusCode = null,
  finalUrl = '',
  pageTitle = '',
  articleTitle = '',
  body = '',
} = {}) {
  const code = Number.isFinite(statusCode) ? statusCode : null;
  if (isChallengeOrInterstitialPage(body)) {
    return { status: 'unreachable', reason: 'challenge', statusCode: code };
  }
  if (isHomepageRedirect(originUrl, finalUrl)) {
    return { status: 'missing', reason: 'homepage_redirect', statusCode: code };
  }
  if (isNotFoundPath(finalUrl)) {
    return { status: 'missing', reason: 'not_found_path', statusCode: code };
  }
  if (code == null) return { status: 'unreachable', reason: 'network', statusCode: null };
  if (code === 404 || code === 410) {
    if (titleMatchesArticle(pageTitle, articleTitle)) {
      return { status: 'suspect', reason: 'missing_status_but_title_matches', statusCode: code };
    }
    return { status: 'missing', reason: `http_${code}`, statusCode: code };
  }
  if (code === 401 || code === 403 || code === 429 || code >= 500) {
    return { status: 'unreachable', reason: `http_${code}`, statusCode: code };
  }
  if (code >= 200 && code < 300) {
    return { status: 'available', reason: 'http_ok', statusCode: code };
  }
  return { status: 'unreachable', reason: `http_${code}`, statusCode: code };
}

function readLedger() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.entries || typeof parsed.entries !== 'object') {
      return emptyLedger();
    }
    return parsed;
  } catch {
    return emptyLedger();
  }
}

function writeLedger(ledger) {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
}

function confirmedMissingUrlSet(ledger = emptyLedger(), now = Date.now()) {
  const missing = new Set();
  const entries = ledger.entries || {};
  for (const [url, entry] of Object.entries(entries)) {
    if (entry?.status !== 'missing') continue;
    const checked = Date.parse(entry.checkedAt || '');
    if (!Number.isFinite(checked) || now - checked > MISSING_TTL_MS) continue;
    const key = articleLinkKey(url);
    if (key) missing.add(key);
  }
  return missing;
}

function omitMissingItems(items = [], ledger = emptyLedger(), now = Date.now()) {
  const missing = confirmedMissingUrlSet(ledger, now);
  if (!missing.size) return { items, removed: [] };
  const kept = [];
  const removed = [];
  for (const item of items) {
    const key = articleLinkKey(item?.link);
    if (key && missing.has(key)) removed.push(item);
    else kept.push(item);
  }
  return { items: kept, removed };
}

function entryUnchanged(prev, next, nowMs) {
  if (!prev || prev.status !== 'missing') return false;
  if (prev.statusCode !== next.statusCode || prev.reason !== next.reason) return false;
  const checked = Date.parse(prev.checkedAt || '');
  return Number.isFinite(checked) && nowMs - checked < CHECK_REFRESH_MS;
}

/**
 * Met à jour le registre. Un 200 efface une disparition. Un échec réseau
 * ne crée pas d'entrée et n'efface pas une disparition déjà confirmée.
 * `changed` reste faux si la seule nouveauté serait un horodatage < 24 h.
 */
function applyLedger(ledger = emptyLedger(), probes = [], nowIso = new Date().toISOString()) {
  const nowMs = Date.parse(nowIso);
  const next = {
    schemaVersion: 1,
    updated: nowIso,
    entries: { ...(ledger.entries || {}) },
  };
  let changed = false;
  for (const probe of probes) {
    const key = articleLinkKey(probe.url || probe.link || '');
    if (!key) continue;
    if (probe.status === 'available') {
      if (next.entries[key]) {
        delete next.entries[key];
        changed = true;
      }
      continue;
    }
    if (probe.status !== 'missing') continue;
    const entry = {
      status: 'missing',
      statusCode: probe.statusCode ?? null,
      reason: probe.reason || 'missing',
      pageTitle: probe.pageTitle || '',
      articleTitle: probe.articleTitle || next.entries[key]?.articleTitle || '',
      source: probe.source || next.entries[key]?.source || '',
      checkedAt: nowIso,
    };
    if (entryUnchanged(next.entries[key], entry, nowMs)) continue;
    next.entries[key] = entry;
    changed = true;
  }
  for (const [key, entry] of Object.entries(next.entries)) {
    const checked = Date.parse(entry?.checkedAt || '');
    if (!Number.isFinite(checked) || nowMs - checked > MISSING_TTL_MS) {
      delete next.entries[key];
      changed = true;
    }
  }
  if (!changed) next.updated = ledger.updated || null;
  return { ledger: next, changed };
}

module.exports = {
  LEDGER_PATH,
  MISSING_TTL_MS,
  CHECK_REFRESH_MS,
  emptyLedger,
  articleLinkKey,
  pageTitleFromHtml,
  titleMatchesArticle,
  isHomepageRedirect,
  classifyFetched,
  readLedger,
  writeLedger,
  confirmedMissingUrlSet,
  omitMissingItems,
  applyLedger,
};

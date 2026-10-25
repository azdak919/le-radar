#!/usr/bin/env node
/**
 * LE RADAR News Source Bot
 *
 * Maintains news-sources.json so the news feed keeps working over time:
 *
 *  1. Health-checks every ACTIVE feed (still reachable? still publishing?)
 *     and tags it _status = ok | stale | dead, with _lastItemDate /
 *     _lastChecked / _failCount.
 *  2. Retire les sources listées dans data/source-blocklist.json (retrait
 *     manuel définitif : elles ne reviennent jamais).
 *  3. Découverte : sonde les candidats du registre + data/student-media-seeds.json
 *     et AJOUTE AUTOMATIQUEMENT ceux qui passent les critères stricts de
 *     scripts/source-admission-lib.js (configuration complète, couleur, repli
 *     photo du campus de l'établissement). Journal : data/news-discovery.md,
 *     recopié dans une seule issue bot permanente.
 *
 * A dead active feed stays in the registry and is re-probed (fetch-news +
 * this health check). A Cloudflare interstitial must not freeze it as dead.
 *
 * No external dependencies.
 *
 * Usage:
 *   node scripts/discover-news-sources.js           # dry run, prints report
 *   node scripts/discover-news-sources.js --update  # writes news-sources.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { isAllowedFetchUrl } = require('./url-security-lib');
const {
  isHtmlListSource,
  classifyHtmlList,
  countHtmlListItems,
} = require('./html-list-fetcher');
const { isFirebaseSource, classifyFirebaseSource } = require('./firebase-list-fetcher');
const {
  groupItemsBySource,
  sourceHasFreshContent,
  latestItemDate: latestCachedItemDate,
  classifyFeedFreshness,
  looksLikeRssOrAtom,
  isChallengeOrInterstitialPage,
  applyUnreachableRegistryUpdate,
} = require('./source-retention-lib');

const SOURCES_PATH = path.join(__dirname, '..', 'news-sources.json');
const INSTITUTIONS_PATH = path.join(__dirname, '..', 'institutions.json');
const NEWS_PATH = path.join(__dirname, '..', 'news.json');
const TIMEOUT = 15000;
const SEEDS_PATH = path.join(__dirname, '..', 'data', 'student-media-seeds.json');
const BLOCKLIST_PATH = path.join(__dirname, '..', 'data', 'source-blocklist.json');
const DISCOVERY_LOG_PATH = path.join(__dirname, '..', 'data', 'news-discovery.md');
const BRAND_PATH = path.join(__dirname, '..', 'brand-colors.json');
const admission = require('./source-admission-lib');
const { authorFromArticleHtml } = require('./author-lib');
const { extractPhotoCreditFromHtml } = require('./article-photo-credit-lib');
const campusBank = require('./campus-photo-bank');

function readJsonSafe(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

// Couleur de pastille : garde l'officielle si elle existe, sinon une teinte stable.
function ensureBrandColor(institution) {
  const brand = readJsonSafe(BRAND_PATH, null);
  if (!brand || !brand.institutions || brand.institutions[institution]) return;
  brand.institutions[institution] = { color: admission.autoColor(institution), source: 'auto — discover-news-sources (à remplacer par la couleur officielle)' };
  if (process.argv.includes('--update')) fs.writeFileSync(BRAND_PATH, JSON.stringify(brand, null, 2) + '\n');
}

const DAY = 86400000;
const MAX_FAILS = 4;       // consecutive fetch failures before marking dead (if no fresh cache)

// Feed paths tried on a candidate site (most common first).
const FEED_PATHS = ['feed/', 'feed', '?feed=rss2', 'rss/', 'rss', 'index.xml', 'atom.xml'];

// Placeholders inventés par scan-media (portails institutionnels, pas journaux étudiants).
const INSTITUTIONAL_PLACEHOLDER = /^m[eé]dia\s*[—–\-:]/i;
const WEAK_NEWS_LABEL = /^(actualit[eé]s?|nouvelles?|news|communiqu[eé]s?|presse|media|média|publications?)$/i;

// === HTTP ====================================================================
const { fetchViaRelay } = require('./feed-relay-lib');
/** Direct, puis relais si (et seulement si) le direct échoue réseau/HTTP. */
const CHALLENGE_BLOCKED = 'challenge-blocked';
const CHALLENGE_RE = /sgcaptcha|cf-chl|captcha|challenge-platform|just a moment/i;
async function fetchFeedWithRelay(url) {
  const direct = await fetchText(url);
  if (direct.ok && direct.body && isFeed(direct.body)) return { ...direct, relayed: false };
  const seen = String(direct.body || direct.errorBody || '').slice(0, 20000);
  // Page anti-robot (même en 4xx) : on s'arrête là, jamais de relais.
  if (seen && (isChallengeOrInterstitialPage(seen) || CHALLENGE_RE.test(seen))) {
    return { ok: !!direct.ok, body: direct.body || seen, challenge: true, relayed: false };
  }
  const body = await fetchViaRelay(url);
  return body ? { ok: true, body, relayed: true } : { ...direct, relayed: false };
}

function fetchText(url, redirects = 4) {
  if (!isAllowedFetchUrl(url)) {
    console.warn('discover-news: URL bloquée (sécurité):', url);
    return Promise.resolve({ ok: false, body: '' });
  }
  return new Promise((resolve) => {
    let req;
    try {
      req = https.get(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LE-RADAR-NewsBot/1.0)',
            Accept: 'application/rss+xml, application/xml, text/xml, */*',
          },
          timeout: TIMEOUT,
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
            res.resume();
            const next = new URL(res.headers.location, url).toString();
            return resolve(fetchText(next, redirects - 1));
          }
          if (res.statusCode >= 400) {
            // Corps conservé (borné) : sert seulement à reconnaître une page anti-robot.
            let err = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { if (err.length < 20000) err += c; });
            res.on('end', () => resolve({ ok: false, body: '', errorBody: err, status: res.statusCode }));
            return undefined;
          }
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ ok: true, body: data }));
        }
      );
    } catch {
      return resolve({ ok: false, body: '' });
    }
    req.on('error', () => resolve({ ok: false, body: '' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, body: '' });
    });
  });
}

// === Feed inspection =========================================================
function isFeed(xml) {
  return looksLikeRssOrAtom(xml);
}

function latestItemDate(xml) {
  const dates = [];
  const re = /<(?:pubDate|dc:date|published|updated)>([^<]+)<\//gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const d = Date.parse(m[1].trim());
    if (!isNaN(d)) dates.push(d);
  }
  return dates.length ? Math.max(...dates) : null;
}

function countItems(xml) {
  return (xml.match(/<item[\s>]/gi) || xml.match(/<entry[\s>]/gi) || []).length;
}

// Returns { status, lastItemDate } for a fetched feed body (3-session window).
function classify(xml) {
  if (!isFeed(xml) || countItems(xml) === 0) return { status: 'dead', lastItemDate: null };
  const last = latestItemDate(xml);
  return classifyFeedFreshness(last);
}

function loadCachedBySource() {
  try {
    const data = JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
    return groupItemsBySource(data.items || []);
  } catch {
    return new Map();
  }
}

function hasFreshCachedArticles(src, cachedBySource, referenceDate = new Date()) {
  const cached = cachedBySource.get(src.name) || [];
  return sourceHasFreshContent(cached, referenceDate);
}

// === Maintenance =============================================================
async function checkActive(src, cachedBySource) {
  const before = src._status;
  src._lastChecked = new Date().toISOString();
  const referenceDate = new Date();

  if (isFirebaseSource(src)) {
    const { status, lastItemDate, count } = await classifyFirebaseSource(src);
    src._status = status;
    src._failCount = 0;
    if (lastItemDate) src._lastItemDate = lastItemDate;
    return {
      name: src.name,
      result: `${count} items (firebase), latest ${lastItemDate ? lastItemDate.slice(0, 10) : '?'}`,
      before,
      after: status,
    };
  }

  const { ok, body } = isHtmlListSource(src) ? await fetchText(src.url) : await fetchFeedWithRelay(src.url);
  const freshCache = hasFreshCachedArticles(src, cachedBySource, referenceDate);
  const lastCached = latestCachedItemDate(cachedBySource.get(src.name) || []);
  const interstitial = isChallengeOrInterstitialPage(body);
  const htmlList = isHtmlListSource(src);
  const notAFeed = !htmlList && ok && body && !isFeed(body);

  if (!ok || interstitial || notAFeed) {
    applyUnreachableRegistryUpdate(src, {
      cachedFresh: freshCache,
      lastItemDate: lastCached,
      referenceDate,
      maxFails: MAX_FAILS,
    });
    const why = !ok ? 'unreachable' : (interstitial ? 'challenge-page' : 'non-feed-body');
    const note = freshCache ? ', cache frais conservé' : '';
    return {
      name: src.name,
      result: `${why} (${src._failCount}/${MAX_FAILS})${note}`,
      before,
      after: src._status,
    };
  }

  src._failCount = 0;
  const { status, lastItemDate } = isHtmlListSource(src)
    ? classifyHtmlList(body, src.url)
    : classify(body);
  src._status = status;
  if (lastItemDate) src._lastItemDate = lastItemDate;
  const count = isHtmlListSource(src) ? countHtmlListItems(body, src.url) : countItems(body);
  const mode = isHtmlListSource(src) ? 'html-list' : 'rss';
  return {
    name: src.name,
    result: `${count} items (${mode}), latest ${lastItemDate ? lastItemDate.slice(0, 10) : '?'}`,
    before,
    after: status,
  };
}

/**
 * Sonde un candidat : premier flux RSS/Atom valide parmi url / site + FEED_PATHS,
 * plus le texte de la page d'accueil (signal « journal étudiant »).
 */
async function probeCandidate(cand) {
  cand._lastChecked = new Date().toISOString();
  const site = cand.site || cand.url;
  if (!site) return { feedUrl: null, isFeed: false, items: 0, lastItemMs: null, pageText: '' };
  const base = site.endsWith('/') ? site : site + '/';
  const tries = [];
  if (cand.url) tries.push(cand.url);
  if (/feed\/?$|\.xml$|feed=rss/i.test(site)) tries.push(site);
  else FEED_PATHS.forEach((p) => tries.push(base + p));
  let best = null;
  let challenge = false;
  for (const url of [...new Set(tries)]) {
    const { ok, body, relayed, challenge: ch } = await fetchFeedWithRelay(url);
    if (relayed) console.log(`  ↪ relais utilisé pour ${url}`);
    if (ch) challenge = true;
    if (ok && body && (isChallengeOrInterstitialPage(body) || /sgcaptcha|cf-chl|captcha/i.test(body.slice(0, 2000)))) challenge = true;
    if (!ok || !body || !isFeed(body) || countItems(body) === 0) continue;
    best = { feedUrl: url, isFeed: true, items: countItems(body), lastItemMs: latestItemDate(body), feedHead: body.slice(0, 3000), body };
    break;
  }
  let pageText = '';
  if (best) {
    const home = await fetchText(base);
    pageText = `${home.ok ? String(home.body || '').slice(0, 200000) : ''}\n${best.feedHead}`;
  }
  // Règle 10 : échantillon de 3 articles du flux passés dans les mêmes
  // extracteurs que le pipeline (auteur + crédit de l'image vedette).
  let creditSamples = [];
  if (best) creditSamples = await sampleFeedCredits(best.body || '', cand);
  if (best) delete best.body;
  if (!best) cand._failCount = (cand._failCount || 0) + 1;
  else cand._failCount = 0;
  return { ...(best || { feedUrl: null, isFeed: false, items: 0, lastItemMs: null }), challenge, pageText, creditSamples };
}

async function sampleFeedCredits(xml = '', cand = {}) {
  const links = [...xml.matchAll(/<item\b[\s\S]*?<link>\s*(?:<!\[CDATA\[)?([^<\]]+)/gi)].map((m) => m[1].trim()).slice(0, 3);
  const lang = cand.lang === 'en' ? 'en' : 'fr';
  const out = [];
  for (const link of links) {
    try {
      const page = await fetchText(link);
      if (!page.ok || !page.body) continue;
      const html = String(page.body);
      const og = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || [])[1] || '';
      const credit = og ? extractPhotoCreditFromHtml(html, og, lang) : null;
      out.push({
        link,
        author: authorFromArticleHtml(html, lang, {}, cand.name || ''),
        creditLine: credit?.creditLine || '',
        creator: credit?.creator || '',
      });
    } catch { /* échantillon non bloquant */ }
  }
  return out;
}

function markChallengeBlocked(registry, cand) {
  const key = admission.norm(cand.name);
  let c = registry.candidates.find((x) => admission.norm(x.name) === key);
  if (!c) { c = { name: cand.name, institution: cand.institution, region: cand.region, site: cand.site, lang: cand.lang }; registry.candidates.push(c); }
  c._status = CHALLENGE_BLOCKED;
  c._statusLabel = 'bloqué par une page anti-robot';
  c._lastChecked = new Date().toISOString();
  delete c._retiredReason;
}

// === Coverage report (cross-reference institutions.json) =====================
function norm(s = '') {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Core tokens that identify an institution (full name + parenthetical acronym).
function instKeys(name) {
  const keys = [norm(name).replace(/\(.*?\)/g, '').trim()];
  const acro = name.match(/\(([^)]+)\)/);
  if (acro) keys.push(norm(acro[1]));
  return keys.filter(Boolean);
}

function reportCoverage(registry) {
  let catalogue;
  try {
    catalogue = JSON.parse(fs.readFileSync(INSTITUTIONS_PATH, 'utf8'));
  } catch {
    console.log('\n▸ Coverage: institutions.json not found — skipping.');
    return;
  }
  const covered = registry.active
    .filter((s) => s._status !== 'dead')
    .map((s) => norm(s.institution || ''));

  const isCovered = (inst) =>
    instKeys(inst.name).some((k) => covered.some((c) => c.includes(k) || k.includes(c)));

  const insts = catalogue.institutions || [];
  const gapsU = insts.filter((i) => i.type === 'universite' && !isCovered(i));
  const gapsC = insts.filter((i) => i.type === 'cegep' && !isCovered(i));
  const nU = insts.filter((i) => i.type === 'universite').length;
  const nC = insts.filter((i) => i.type === 'cegep').length;

  console.log('\n▸ Coverage vs institutions.json');
  console.log(`  Universités : ${nU - gapsU.length}/${nU} avec une source`);
  console.log(`  Cégeps      : ${nC - gapsC.length}/${nC} avec une source`);
  if (gapsU.length) {
    console.log(`  Universités sans source (${gapsU.length}): ${gapsU.map((i) => i.name).join(', ')}`);
  }
  console.log(`  Cégeps sans source : ${gapsC.length} (voir institutions.json pour candidats potentiels)`);
}

// === Main ====================================================================
async function main() {
  const doUpdate = process.argv.includes('--update');
  const registry = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
  registry.active = registry.active || [];
  registry.candidates = registry.candidates || [];

  console.log('LE RADAR News Source Bot\n========================\n');

  const cachedBySource = loadCachedBySource();

  // 1. Purge active institutional placeholders (scan-media bug legacy)
  const purged = [];
  registry.active = registry.active.filter((src) => {
    const name = String(src.name || '').trim();
    if (INSTITUTIONAL_PLACEHOLDER.test(name) || WEAK_NEWS_LABEL.test(name)) {
      purged.push(name);
      return false;
    }
    return true;
  });
  if (purged.length) {
    console.log('▸ Purged non-student active sources');
    purged.forEach((n) => console.log(`  ✗ ${n}`));
    console.log('');
  }

  // 2. Health-check active feeds
  console.log('▸ Active feeds');
  for (const src of registry.active) {
    const r = await checkActive(src, cachedBySource);
    const flag = r.after === 'dead' ? '✗' : r.after === 'stale' ? '~' : '✓';
    console.log(`  ${flag} ${r.name.padEnd(20)} ${r.result}${r.before && r.before !== r.after ? `  [${r.before}→${r.after}]` : ''}`);
  }

  // 3. Liste de blocage : une source retirée à la main sort du fil et ne revient pas.
  const blocklist = admission.loadBlocklist(readJsonSafe(BLOCKLIST_PATH, { entries: [] }));
  registry.active = registry.active.filter((src) => {
    const hit = admission.isBlocked(src, blocklist);
    if (!hit) return true;
    console.log(`  ⛔ ${src.name} retiré (liste de blocage : ${hit.reason || 'sans raison'})`);
    registry.candidates.push({ ...src, _status: 'retired', _note: `Liste de blocage : ${hit.reason || ''}`.trim() });
    return false;
  });

  // 4. Découverte : candidats du registre + graines, admission automatique stricte.
  console.log('\n▸ Découverte (admission automatique)');
  const institutions = (readJsonSafe(INSTITUTIONS_PATH, { institutions: [] }).institutions) || [];
  const seeds = (readJsonSafe(SEEDS_PATH, { seeds: [] }).seeds) || [];
  const pending = admission.dedupeCandidates([
    ...registry.candidates.filter((c) => c._status !== 'retired' && c._status !== 'rejected'),
    ...seeds,
  ]);
  const ctxBase = {
    registry, institutions, blocklist,
    hasCampusPhoto: (...names) => names.some((n) => campusBank.bankEntriesFor(n).length >= 2), // gate campus-source-mapping : ≥ 2 photos
  };
  const added = [];
  const rejected = [];
  for (const cand of pending) {
    const stat = admission.staticRejection(cand, ctxBase);
    let verdict;
    let probe = {};
    if (stat) verdict = { admit: false, reason: stat };
    else {
      probe = await probeCandidate(cand);
      verdict = admission.evaluateAdmission(cand, probe, ctxBase);
    }
    if (verdict.admit) {
      const entry = admission.buildSourceConfig(cand, probe, verdict.institution);
      registry.active.push(entry);
      ensureBrandColor(entry.institution);
      added.push(entry);
      console.log(`  ⬆ ${cand.name.padEnd(22)} AJOUTÉ → ${entry.url}`);
    } else {
      // Les doublons de sources actives ne sont pas du bruit à journaliser.
      if (!/^doublon — déjà actif/.test(verdict.reason)) {
        rejected.push({ name: cand.name, institution: cand.institution, site: cand.site || cand.url, reason: verdict.reason });
      }
      console.log(`  ·  ${String(cand.name).padEnd(22)} ${verdict.reason}`);
      // Vrai média bloqué par une page anti-robot : statut dédié, re-sondé
      // chaque semaine, admis seul si le flux redevient accessible. Jamais de
      // relais pour lui (le Worker refuse ce statut) — aucun contournement.
      if (probe.challenge) markChallengeBlocked(registry, cand);
    }
  }
  const addedNames = new Set(added.map((a) => admission.norm(a.name)));
  registry.candidates = registry.candidates.filter((c) => !addedNames.has(admission.norm(c.name)));
  const promotedCount = added.length;
  const log = admission.renderDiscoveryLog({ added, rejected, activeCount: registry.active.length });
  if (doUpdate) {
    fs.mkdirSync(path.dirname(DISCOVERY_LOG_PATH), { recursive: true });
    fs.writeFileSync(DISCOVERY_LOG_PATH, log);
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `added=${added.length}\n`);

  // 3. Coverage report against the institutions catalogue
  reportCoverage(registry);

  registry._lastRun = new Date().toISOString();

  const live = registry.active.filter((s) => s._status !== 'dead').length;
  console.log(`\nSummary: ${live}/${registry.active.length} active feeds live, ${promotedCount} promoted, ${registry.candidates.length} candidates remaining.`);

  if (doUpdate) {
    fs.writeFileSync(SOURCES_PATH, JSON.stringify(registry, null, 2) + '\n');
    console.log(`✅ Wrote ${SOURCES_PATH}`);
  } else {
    console.log('Dry-run complete. Use --update to write news-sources.json.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

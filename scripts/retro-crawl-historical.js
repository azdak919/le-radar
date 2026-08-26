#!/usr/bin/env node
/**
 * Rétro-crawl historique, volontairement lent et reprenable.
 *
 * Il lit uniquement des listes publiques paginées. Il ne télécharge jamais le
 * corps des articles, leurs images, ni des pages une à une. Les résultats vont
 * dans news-archive.json, jamais dans news.json : un article ancien ne peut
 * donc pas réintégrer le fil vivant par cet outil.
 *
 * Exemples :
 *   node scripts/retro-crawl-historical.js
 *   node scripts/retro-crawl-historical.js --update
 *   node scripts/retro-crawl-historical.js --update --source="La Pige" --pages-per-source=1
 *   node scripts/retro-crawl-historical.js --update --restart --source="La Pige"
 */
const fs = require('fs');
const path = require('path');
const { mergeHistoricalCatalog, serializeHistoricalCatalog } = require('./historical-catalog-lib');
const {
  wordpressApiBase,
  wordpressComApiBase,
  wordpressPostToItem,
  wordpressComPostToItem,
  sourceKey,
  selectRetroSources,
  progressAfterPage,
  progressAfterFailure,
} = require('./historical-retro-crawl-lib');
const { isFirebaseSource, fetchFirebaseArchive } = require('./firebase-list-fetcher');
const { isAllowedFetchUrl } = require('./url-security-lib');

const ROOT = path.join(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'news-sources.json');
const ARCHIVE_PATH = path.join(ROOT, 'news-archive.json');
const CONFIG_PATH = path.join(ROOT, 'historical-catalog.config.json');
const STATE_PATH = path.join(ROOT, 'historical-crawl-state.json');
const USER_AGENT = 'LE-RADAR-HistoryCrawler/1.0 (+https://le-radar.ca/)';

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function parseNumberFlag(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  const value = Number(raw?.slice(prefix.length));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function stringFlag(name) {
  const prefix = `--${name}=`;
  return (process.argv.find((arg) => arg.startsWith(prefix)) || '').slice(prefix.length).trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function sourceItems(items, source) {
  return items.map((item) => ({
    ...item,
    source: source.name,
    institution: source.institution,
    region: source.region,
    type: source.type,
    lang: source.lang,
  }));
}

async function wordpressPage(source, page, perPage, afterIso) {
  const base = wordpressApiBase(source);
  // `_fields` est intentionnel : l'API WordPress renverrait autrement
  // `content.rendered`, soit le corps complet d'un article externe. L'extrait
  // et la fiche d'auteur suffisent au catalogue d'agrégation.
  const endpoint = `${base}/posts?per_page=${perPage}&page=${page}&_embed=author&_fields=id,date,date_gmt,link,title,excerpt,_embedded&context=view&after=${encodeURIComponent(afterIso)}`;
  if (!isAllowedFetchUrl(endpoint)) return { ok: false, unsupported: true, reason: 'unsafe_or_missing_wordpress_endpoint' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(endpoint, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      redirect: 'follow', signal: controller.signal,
    });
    const totalPages = Number(response.headers.get('x-wp-totalpages'));
    if (response.status === 400 && page > 1) return { ok: true, posts: [], totalPages: Number.isFinite(totalPages) ? totalPages : page - 1 };
    if (!response.ok && (response.status === 401 || response.status === 403 || response.status === 404)) {
      const fallback = await wordpressComPage(source, page, perPage, afterIso);
      if (fallback) return fallback;
    }
    if (!response.ok) return {
      ok: false,
      unsupported: response.status === 401 || response.status === 403 || response.status === 404,
      reason: `wordpress_http_${response.status}`,
    };
    const posts = await response.json();
    if (!Array.isArray(posts)) return { ok: false, reason: 'wordpress_invalid_payload' };
    return { ok: true, posts, totalPages: Number.isFinite(totalPages) ? totalPages : null };
  } catch (error) {
    return { ok: false, reason: error?.name === 'AbortError' ? 'wordpress_timeout' : 'wordpress_network_error' };
  } finally {
    clearTimeout(timeout);
  }
}

/** WordPress.com ne sert pas toujours /wp-json/wp/v2 aux sites hébergés. */
async function wordpressComPage(source, page, perPage, afterIso) {
  const base = wordpressComApiBase(source);
  if (!base) return null;
  const endpoint = `${base}?number=${perPage}&page=${page}&after=${encodeURIComponent(afterIso)}&fields=ID,date,URL,title,excerpt,author`;
  if (!isAllowedFetchUrl(endpoint)) return { ok: false, unsupported: true, reason: 'unsafe_wordpress_com_endpoint' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(endpoint, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, redirect: 'follow', signal: controller.signal,
    });
    if (response.status === 400 && page > 1) return { ok: true, posts: [], totalPages: page - 1, wordpressCom: true };
    if (!response.ok) return { ok: false, unsupported: response.status === 401 || response.status === 403 || response.status === 404, reason: `wordpress_com_http_${response.status}` };
    const payload = await response.json();
    const posts = Array.isArray(payload?.posts) ? payload.posts : [];
    const found = Number(payload?.found);
    const totalPages = Number.isFinite(found) ? Math.ceil(found / perPage) : null;
    return { ok: true, posts, totalPages, wordpressCom: true };
  } catch (error) {
    return { ok: false, reason: error?.name === 'AbortError' ? 'wordpress_com_timeout' : 'wordpress_com_network_error' };
  } finally {
    clearTimeout(timeout);
  }
}

async function crawlWordpress(source, prior, options) {
  const at = new Date().toISOString();
  const page = Math.max(1, Number(prior?.nextPage) || 1);
  const result = await wordpressPage(source, page, options.postsPerPage, options.afterIso);
  if (!result.ok) {
    return {
      items: [],
      progress: progressAfterFailure(prior, {
        at, reason: result.reason, retryDays: result.unsupported ? 30 : options.retryAfterDays, unsupported: result.unsupported,
      }),
      fetched: 0,
    };
  }
  const items = result.posts.map((post) => (result.wordpressCom ? wordpressComPostToItem(post, source) : wordpressPostToItem(post, source))).filter(Boolean);
  const reachedCeiling = page >= options.maxPagesPerSource;
  return {
    items,
    progress: progressAfterPage({ ...prior, strategy: result.wordpressCom ? 'wordpress-com-rest' : prior.strategy }, {
      page, totalPages: result.totalPages, received: result.posts.length, at,
      completed: reachedCeiling,
    }),
    fetched: result.posts.length,
  };
}

async function crawlFirebase(source, prior, options) {
  const at = new Date().toISOString();
  try {
    const raw = await fetchFirebaseArchive(source, {
      maxItems: options.maxRecordsPerSource,
      pageSize: options.postsPerPage,
      maxPages: options.maxPagesPerSource,
    });
    const items = sourceItems(raw, source);
    return {
      items,
      progress: progressAfterPage({ ...prior, strategy: 'firestore-rest' }, {
        page: 1, totalPages: 1, received: raw.length, at, completed: true,
      }),
      fetched: raw.length,
    };
  } catch {
    return {
      items: [],
      progress: progressAfterFailure(prior, { at, reason: 'firestore_network_error', retryDays: options.retryAfterDays }),
      fetched: 0,
    };
  }
}

function resetStateFor(state, sourceName) {
  if (sourceName) {
    const key = sourceKey({ name: sourceName });
    delete state.sources[key];
  } else {
    state.sources = {};
  }
}

async function main() {
  const doUpdate = process.argv.includes('--update');
  const restart = process.argv.includes('--restart');
  const requestedSource = stringFlag('source');
  const config = readJson(CONFIG_PATH, {});
  const policy = config.retroCrawl || {};
  const options = {
    sourcesPerRun: parseNumberFlag('sources-per-run', policy.sourcesPerRun || 2),
    pagesPerSource: parseNumberFlag('pages-per-source', policy.pagesPerSource || 2),
    postsPerPage: Math.min(100, parseNumberFlag('posts-per-page', policy.postsPerPage || 50)),
    maxPagesPerSource: parseNumberFlag('max-pages-per-source', policy.maxPagesPerSource || 120),
    maxRecordsPerSource: parseNumberFlag('max-records-per-source', policy.maxRecordsPerSource || 6000),
    requestDelayMs: parseNumberFlag('request-delay-ms', policy.requestDelayMs || 900),
    retryAfterDays: parseNumberFlag('retry-after-days', policy.retryAfterDays || 14),
  };
  const retentionYears = Math.max(1, Number(policy.windowYears) || Number(config?.age?.conservationYears) || 3);
  options.afterIso = new Date(Date.now() - retentionYears * 365.25 * 86400000).toISOString();
  const sourceFile = readJson(SOURCES_PATH, { active: [] });
  const sources = Array.isArray(sourceFile.active) ? sourceFile.active : [];
  const originalCatalog = readJson(ARCHIVE_PATH, { schemaVersion: 1, records: [] });
  const state = readJson(STATE_PATH, { schemaVersion: 1, updated: null, sources: {} });
  state.sources = state.sources || {};
  if (restart) resetStateFor(state, requestedSource);
  const selected = selectRetroSources(sources, state, { limit: options.sourcesPerRun, source: requestedSource });

  console.log('LE-RADAR — rétro-crawl historique (métadonnées seulement)');
  console.log(`Mode : ${doUpdate ? 'écriture' : 'simulation'} · ${selected.length} source(s) · ${options.pagesPerSource} page(s)/source · depuis ${options.afterIso.slice(0, 10)}`);
  if (!selected.length) {
    console.log('Aucune source à traiter : elles sont terminées ou en délai de reprise.');
    return;
  }

  let catalog = originalCatalog;
  let added = 0;
  let updated = 0;
  for (const source of selected) {
    const key = sourceKey(source);
    // Changer la fenêtre (p. ex. 10 ans → 3 ans après revue SEO) invalide la
    // pagination précédente : repartir de la première page est sûr, les URLs
    // sont dédupliquées par le catalogue.
    let progress = state.sources[key] || {};
    if (Number(progress.windowYears) !== retentionYears) progress = {};
    let sourceAdded = 0;
    let sourceUpdated = 0;
    for (let step = 0; step < options.pagesPerSource && !progress.completedAt; step += 1) {
      const crawl = isFirebaseSource(source)
        ? await crawlFirebase(source, progress, options)
        : await crawlWordpress(source, progress, options);
      progress = crawl.progress;
      if (crawl.items.length) {
        const merged = mergeHistoricalCatalog(catalog, crawl.items, new Date().toISOString(), {
          firstDiscoveredAt: new Date().toISOString(), ingestedAt: new Date().toISOString(),
        }, { maxRecords: config.storage?.maxRecords });
        catalog = merged.catalog;
        added += merged.added;
        updated += merged.updated;
        sourceAdded += merged.added;
        sourceUpdated += merged.updated;
      }
      if (progress.error || progress.completedAt || isFirebaseSource(source)) break;
      await sleep(options.requestDelayMs);
    }
    state.sources[key] = { ...progress, windowStart: options.afterIso, windowYears: retentionYears };
    const stateLabel = progress.completedAt ? 'terminée' : (progress.error ? `reportée (${progress.error})` : `reprendra à la page ${progress.nextPage}`);
    console.log(`- ${source.name} : +${sourceAdded} / ~${sourceUpdated} — ${stateLabel}`);
  }
  state.updated = new Date().toISOString();
  if (!doUpdate) {
    console.log(`Simulation : ${added} ajout(s), ${updated} mise(s) à jour; aucun fichier écrit. Ajoutez --update pour conserver l’avancement.`);
    return;
  }
  fs.writeFileSync(ARCHIVE_PATH, serializeHistoricalCatalog(catalog, config).text, 'utf8');
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  console.log(`Terminé : ${added} ajout(s), ${updated} mise(s) à jour. Le fil vivant n’a pas été modifié.`);
}

main().catch((error) => {
  console.error(`Rétro-crawl interrompu : ${error?.message || error}`);
  process.exitCode = 1;
});

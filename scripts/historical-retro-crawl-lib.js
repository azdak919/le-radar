/**
 * Utilitaires purs du rétro-crawl historique.
 *
 * Le bot ne télécharge ni corps complet, ni image, ni page individuelle : il
 * ne lit que les listes publiques paginées (WordPress / Firestore). Cela garde
 * le crawl poli, reprenable et compatible avec le rôle d’agrégateur.
 */
const { decodeHtmlEntities } = require('./html-entities-lib');
const { cleanText, slugify } = require('./historical-catalog-lib');
const { normalizeAuthor } = require('./author-lib');

function wordpressApiBase(source = {}) {
  const declared = String(source.historyApiBase || '').trim();
  if (declared) return declared.replace(/\/+$/, '');
  try {
    const url = new URL(String(source.url || ''));
    return `${url.protocol}//${url.host}/wp-json/wp/v2`;
  } catch {
    return '';
  }
}

function wordpressComApiBase(source = {}) {
  try {
    const host = String(source.historyWordpressComSite || new URL(String(source.url || '')).hostname).trim();
    if (!/(?:^|\.)wordpress\.com$/i.test(host)) return '';
    return `https://public-api.wordpress.com/rest/v1.1/sites/${encodeURIComponent(host)}/posts/`;
  } catch {
    return '';
  }
}

function wordpressDate(value) {
  const raw = String(value || '').trim();
  if (!raw || /^0{4}-0{2}-0{2}/.test(raw)) return null;
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw) ? `${raw}Z` : raw;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function wordpressPostToItem(post = {}, source = {}) {
  const title = cleanText(decodeHtmlEntities(post?.title?.rendered || ''));
  const link = String(post?.link || '').trim();
  if (!title || !link) return null;
  const author = normalizeAuthor(cleanText(decodeHtmlEntities(post?._embedded?.author?.[0]?.name || '')));
  const excerpt = cleanText(decodeHtmlEntities(
    post?.excerpt?.rendered || post?.yoast_head_json?.description || '',
  )).slice(0, 520);
  const image = String(
    post?.yoast_head_json?.og_image?.[0]?.url
    || post?._embedded?.['wp:featuredmedia']?.[0]?.source_url
    || '',
  ).trim();
  return {
    source: source.name || '', institution: source.institution || '', region: source.region || '',
    type: source.type || '', lang: source.lang || 'fr', title, link, author, excerpt, image,
    date: wordpressDate(post.date_gmt || post.date),
    categories: [],
  };
}

function wordpressComPostToItem(post = {}, source = {}) {
  return wordpressPostToItem({
    title: { rendered: post?.title || '' },
    link: post?.URL || '',
    date: post?.date || '',
    excerpt: { rendered: post?.excerpt || '' },
    _embedded: { author: [{ name: post?.author?.name || '' }] },
  }, source);
}

function sourceKey(source = {}) {
  return slugify(source.name || source.url || 'source');
}

function retryDue(progress = {}, now = Date.now()) {
  const retryAt = Date.parse(progress.retryAt || '');
  return !Number.isFinite(retryAt) || retryAt <= now;
}

/**
 * Round-robin : les sources jamais vues passent d'abord (date 0), puis la
 * moins récemment interrogée. Une publication volumineuse ne peut donc pas
 * monopoliser les passes pendant que les autres attendent.
 */
function selectRetroSources(sources = [], state = {}, { limit = 2, source = '', now = Date.now() } = {}) {
  const desired = String(source || '').trim().toLocaleLowerCase('fr-CA');
  return sources
    .filter((entry) => entry?.name && entry?._status !== 'dead')
    .filter((entry) => !desired || entry.name.toLocaleLowerCase('fr-CA') === desired || sourceKey(entry) === desired)
    .filter((entry) => {
      const progress = state?.sources?.[sourceKey(entry)] || {};
      return !progress.completedAt && retryDue(progress, now);
    })
    .sort((a, b) => {
      const pa = state?.sources?.[sourceKey(a)] || {};
      const pb = state?.sources?.[sourceKey(b)] || {};
      const lastAttempt = (progress) => Date.parse(progress.lastAttemptAt || '') || 0;
      if (lastAttempt(pa) !== lastAttempt(pb)) return lastAttempt(pa) - lastAttempt(pb);
      return String(a.name).localeCompare(String(b.name), 'fr');
    })
    .slice(0, Math.max(0, limit));
}

function progressAfterPage(previous = {}, { page, totalPages, received, at, completed = false } = {}) {
  const finalPage = completed || !received || (Number.isFinite(totalPages) && page >= totalPages);
  return {
    ...previous,
    strategy: previous.strategy || 'wordpress-rest',
    nextPage: finalPage ? null : page + 1,
    totalPages: Number.isFinite(totalPages) ? totalPages : (previous.totalPages || null),
    lastAttemptAt: at,
    lastSuccessAt: at,
    ...(finalPage ? { completedAt: at } : {}),
    retryAt: null,
    error: null,
  };
}

function progressAfterFailure(previous = {}, { at, reason, retryDays = 14, unsupported = false } = {}) {
  const retryAt = new Date(Date.parse(at) + retryDays * 86400000).toISOString();
  return {
    ...previous,
    strategy: unsupported ? 'unsupported' : (previous.strategy || 'wordpress-rest'),
    lastAttemptAt: at,
    error: reason || 'request_failed',
    retryAt,
  };
}

module.exports = {
  wordpressApiBase,
  wordpressComApiBase,
  wordpressPostToItem,
  wordpressComPostToItem,
  sourceKey,
  selectRetroSources,
  progressAfterPage,
  progressAfterFailure,
};

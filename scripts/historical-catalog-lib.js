/**
 * LE-RADAR — registre historique indépendant de la fraîcheur du fil.
 *
 * Le registre retient les métadonnées découvertes par les bots — y compris le
 * rétro-crawl de listes publiques — même lorsqu'un article sort du fil
 * principal. Il ne conserve jamais le corps complet d’un article externe.
 */

const crypto = require('crypto');

function cleanText(value = '') {
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value = '') {
  return String(value).normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'source';
}

function normalizeOriginalUrl(value = '') {
  try {
    const url = new URL(String(value));
    if (!/^https?:$/.test(url.protocol)) return '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch {
    return '';
  }
}

function stableId(source, originalUrl) {
  return `history-${crypto.createHash('sha256').update(`${cleanText(source).toLowerCase()}\0${normalizeOriginalUrl(originalUrl)}`).digest('hex').slice(0, 24)}`;
}

function dateOrNull(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function fingerprint(item) {
  const data = [item.title, item.author, item.date, item.excerpt].map((value) => cleanText(value)).join('\0');
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 32);
}

function categoriesFrom(item) {
  const values = Array.isArray(item.categories) ? item.categories : (item.category ? [item.category] : []);
  return values.map((value) => cleanText(value)).filter(Boolean).slice(0, 8);
}

function recordFromItem(item, now, provenance = {}) {
  const originalUrl = normalizeOriginalUrl(item?.link || item?.originalUrl);
  if (!item?.source || !item?.title || !originalUrl) return null;
  const excerpt = cleanText(item.excerpt).slice(0, 520);
  return {
    id: stableId(item.source, originalUrl),
    fingerprint: fingerprint(item),
    source: cleanText(item.source),
    sourceSlug: slugify(item.source),
    institution: cleanText(item.institution),
    region: cleanText(item.region),
    type: cleanText(item.type),
    language: cleanText(item.lang),
    title: cleanText(item.title).slice(0, 360),
    author: cleanText(item.author).slice(0, 180),
    publishedAt: dateOrNull(item.date),
    originalUrl,
    canonicalOriginalUrl: originalUrl,
    excerpt,
    categories: categoriesFrom(item),
    image: {
      status: item.image ? 'not-retained-unknown-license' : 'absent',
      originalUrl: item.image ? normalizeOriginalUrl(item.image) || null : null,
    },
    firstDiscoveredAt: provenance.firstDiscoveredAt || null,
    ingestedAt: provenance.ingestedAt || null,
    importedAt: provenance.importedAt || null,
    lastSeenAt: now,
    lastVerifiedAt: provenance.lastVerifiedAt || null,
    link: {
      status: 'unknown',
      checkedAt: null,
      statusCode: null,
      resolvedUrl: null,
    },
    indexing: { status: 'pending', reason: 'requires_verified_original_link' },
  };
}

function mergeHistoricalCatalog(previous, items, observedAt = new Date().toISOString(), provenance = {}, options = {}) {
  const records = Array.isArray(previous?.records) ? previous.records : [];
  const byId = new Map(records.map((record) => [record.id, record]));
  let added = 0;
  let updated = 0;
  for (const item of items) {
    const next = recordFromItem(item, observedAt, provenance);
    if (!next) continue;
    const prior = byId.get(next.id);
    if (!prior) {
      byId.set(next.id, next);
      added += 1;
      continue;
    }
    // La découverte initiale, les contrôles de lien et une éventuelle licence
    // connue sont des faits historiques : le RSS ne peut pas les effacer.
    const merged = {
      ...prior,
      ...next,
      firstDiscoveredAt: prior.firstDiscoveredAt || next.firstDiscoveredAt || null,
      ingestedAt: prior.ingestedAt || next.ingestedAt || null,
      importedAt: prior.importedAt || next.importedAt || null,
      image: { ...next.image, ...(prior.image?.license ? { license: prior.image.license } : {}) },
      link: { ...next.link, ...(prior.link || {}) },
      indexing: prior.indexing || next.indexing,
    };
    byId.set(next.id, merged);
    updated += 1;
  }
  let nextRecords = [...byId.values()].sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
  const maxRecords = Number(options.maxRecords) || 0;
  let dropped = 0;
  if (maxRecords > 0 && nextRecords.length > maxRecords) {
    dropped = nextRecords.length - maxRecords;
    nextRecords = nextRecords.slice(0, maxRecords);
  }
  return {
    catalog: { schemaVersion: 1, updated: observedAt, records: nextRecords },
    added,
    updated,
    dropped,
  };
}

function verifyable(record, now, config) {
  const partial = config?.partial || {};
  const minimumExcerptCharacters = Number(partial.minimumExcerptCharacters) || 90;
  const verifiedWithinDays = Number(partial.verifiedWithinDays) || 35;
  if (!record?.title || !record?.originalUrl || String(record.excerpt || '').length < minimumExcerptCharacters) return false;
  if (!['available', 'redirected'].includes(record.link?.status)) return false;
  const checked = Date.parse(record.link?.checkedAt || '');
  return Number.isFinite(checked) && now - checked <= verifiedWithinDays * 86400000;
}

/**
 * Le catalogue peut préserver des décennies de métadonnées sans les pousser
 * toutes vers les moteurs. L'âge est calculé sur la publication originale,
 * jamais sur l'ingestion — un rétro-crawl ne rend pas un article « frais ».
 */
function ageBand(record, config, now = Date.now()) {
  const policy = config?.age || {};
  const indexableYears = Math.max(1, Number(policy.indexableYears) || 5);
  const conservationYears = Math.max(indexableYears, Number(policy.conservationYears) || 10);
  const published = Date.parse(record?.publishedAt || '');
  if (!Number.isFinite(published)) return 'undated';
  const age = Math.max(0, now - published);
  if (age <= indexableYears * 365.25 * 86400000) return 'indexable';
  if (age <= conservationYears * 365.25 * 86400000) return 'conservation';
  return 'preserved';
}

function partialPublicSample(records, config, now = Date.now()) {
  if (config.mode === 'off') return { records: [], eligible: 0, verified: 0, conservation: [], reference: [] };
  const verified = records.filter((record) => verifyable(record, now, config));
  const eligible = verified.filter((record) => ageBand(record, config, now) === 'indexable');
  const conservation = verified.filter((record) => ageBand(record, config, now) === 'conservation');
  const reference = verified.filter((record) => ageBand(record, config, now) === 'preserved');
  if (config.mode === 'full') return { records: eligible, eligible: eligible.length, verified: verified.length, conservation, reference };
  const max = Math.max(0, Number(config?.partial?.maxRecords) || 0);
  const chosen = [];
  const used = new Set();
  // Premier tour : une entrée par publication afin que le test reste
  // représentatif même si un flux est beaucoup plus prolifique que les autres.
  for (const record of eligible) {
    if (chosen.length >= max || used.has(record.source)) continue;
    used.add(record.source);
    chosen.push(record);
  }
  for (const record of eligible) {
    if (chosen.length >= max || chosen.includes(record)) continue;
    chosen.push(record);
  }
  return { records: chosen, eligible: eligible.length, verified: verified.length, conservation, reference };
}

function serializeHistoricalCatalog(catalog, config = {}) {
  const maxRecords = Number(config.storage?.maxRecords) || 0;
  const maxBytes = Number(config.storage?.maxFileBytes) || 0;
  let records = Array.isArray(catalog?.records) ? catalog.records : [];
  if (maxRecords > 0 && records.length > maxRecords) records = records.slice(0, maxRecords);
  let payload = { ...catalog, records };
  let text = `${JSON.stringify(payload)}\n`;
  while (maxBytes > 0 && Buffer.byteLength(text) > maxBytes && payload.records.length > 120) {
    payload = { ...payload, records: payload.records.slice(0, payload.records.length - 200) };
    text = `${JSON.stringify(payload)}\n`;
  }
  return { text, catalog: payload };
}

module.exports = {
  cleanText,
  slugify,
  normalizeOriginalUrl,
  stableId,
  recordFromItem,
  mergeHistoricalCatalog,
  serializeHistoricalCatalog,
  ageBand,
  partialPublicSample,
};

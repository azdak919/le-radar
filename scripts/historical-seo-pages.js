/** Pages HTML du catalogue historique : métadonnées riches, jamais le corps externe. */
const { escapeHtml, renderPage, slugify } = require('./seo-pages-lib');
const { partialPublicSample } = require('./historical-catalog-lib');

function localDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date inconnue';
  return date.toLocaleString('fr-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
}

function recordHtml(record) {
  const metadata = [
    record.author ? `Par ${record.author}` : '',
    record.publishedAt ? localDate(record.publishedAt) : '',
    record.categories?.length ? record.categories.join(', ') : '',
  ].filter(Boolean).join(' · ');
  const status = record.link?.status === 'redirected' ? 'Lien original redirigé et vérifié.' : 'Lien original vérifié.';
  return `      <article class="seo-archive-record">
        <p class="seo-archive-record__source">${escapeHtml(record.source)}</p>
        <h2><a href="${escapeHtml(record.originalUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(record.title)}</a></h2>
        ${metadata ? `<p class="seo-archive-record__meta">${escapeHtml(metadata)}</p>` : ''}
        ${record.excerpt ? `<p>${escapeHtml(record.excerpt)}</p>` : ''}
        <p class="seo-archive-record__origin"><a href="${escapeHtml(record.originalUrl)}" target="_blank" rel="noopener noreferrer">Lire l’article original sur ${escapeHtml(record.source)}</a> · ${status}</p>
      </article>`;
}

function unavailableReferences(records) {
  if (!records.length) return '';
  const rows = records.slice(0, 10).map((record) => `          <li><strong>${escapeHtml(record.title)}</strong>${record.publishedAt ? ` <span>(${escapeHtml(localDate(record.publishedAt))})</span>` : ''} — lien original signalé indisponible lors de la dernière vérification.</li>`);
  return `\n      <section class="seo-archive-unavailable"><h2>Références devenues indisponibles</h2><p>LE-RADAR.ca conserve ces métadonnées factuelles sans reproduire le contenu disparu.</p><ul>\n${rows.join('\n')}\n      </ul></section>`;
}

function collectionJsonLd({ siteBase, path, title, records }) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    url: `${siteBase}/${path}`,
    isPartOf: { '@type': 'WebSite', name: 'LE-RADAR.ca', url: `${siteBase}/` },
    provider: { '@type': 'Organization', name: 'LE-RADAR.ca' },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: records.length,
      itemListElement: records.map((record, index) => ({
        '@type': 'ListItem', position: index + 1, url: record.originalUrl,
        item: {
          '@type': 'CreativeWork', name: record.title, url: record.originalUrl,
          ...(record.author ? { author: { '@type': 'Person', name: record.author } } : {}),
          ...(record.publishedAt ? { datePublished: record.publishedAt } : {}),
          ...(record.source ? { publisher: { '@type': 'Organization', name: record.source } } : {}),
        },
      })),
    },
  }).replace(/</g, '\\u003c');
}

function buildHistoricalArchivePages({ catalog, config, siteBase }) {
  const initialSample = partialPublicSample(catalog?.records || [], config);
  const sample = { ...initialSample, records: initialSample.records.slice() };
  if (!sample.records.length) return { pages: [], sourcePaths: new Map(), sample };
  const bySource = new Map();
  for (const record of sample.records) {
    if (!bySource.has(record.source)) bySource.set(record.source, []);
    bySource.get(record.source).push(record);
  }
  const pages = [];
  const sourcePaths = new Map();
  const maxPages = Math.max(1, Number(config?.partial?.maxPages) || 1);
  const sources = [...bySource.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'fr'))
    .slice(0, Math.max(0, maxPages - 1));
  const included = new Set(sources.map(([source]) => source));
  sample.records = sample.records.filter((record) => included.has(record.source));
  const hubRows = [];
  const missingBySource = new Map();
  for (const record of catalog?.records || []) {
    if (record?.link?.status !== 'missing') continue;
    if (!missingBySource.has(record.source)) missingBySource.set(record.source, []);
    missingBySource.get(record.source).push(record);
  }

  for (const [source, records] of sources) {
    const slug = slugify(source);
    const path = `archives/${slug}/`;
    sourcePaths.set(source, path);
    const years = [...new Set(records.map((record) => new Date(record.publishedAt || 0).getUTCFullYear()).filter(Number.isFinite))].sort((a, b) => b - a);
    const grouped = years.map((year) => `<section class="seo-archive-year"><h2>${year}</h2>${records.filter((record) => new Date(record.publishedAt || 0).getUTCFullYear() === year).map(recordHtml).join('\n')}</section>`).join('\n');
    const title = `Archives vérifiées de ${source} | LE-RADAR.ca`;
    pages.push({
      path,
      changefreq: 'monthly', priority: '0.4', lastmod: records.map((record) => record.lastVerifiedAt).sort().at(-1) || null,
      html: renderPage({
        lang: 'fr', path, altPath: path, title,
        description: `Catalogue historique expérimental des articles de ${source}, avec attribution et lien vers chaque publication originale.`,
        h1: `Archives historiques — ${source}`, eyebrow: 'Catalogue expérimental',
        crumbs: [{ label: 'Accueil', href: '../../' }, { label: 'Archives historiques', href: '../' }, { label: source }],
        bodyHtml: `      <p class="seo-lead">Articles historiques vérifiés de ${escapeHtml(source)}. LE-RADAR.ca les référence; le contenu complet demeure sur le site du média.</p>\n${grouped}${unavailableReferences(missingBySource.get(source) || [])}`,
        jsonLd: collectionJsonLd({ siteBase, path, title, records }), siteBase, alternate: false,
        updated: records.map((record) => record.lastVerifiedAt).sort().at(-1),
      }),
    });
    hubRows.push(`        <li><a href="${slug}/">${escapeHtml(source)}</a> <span>${records.length} article${records.length > 1 ? 's' : ''} vérifié${records.length > 1 ? 's' : ''}</span></li>`);
  }

  const hubPath = 'archives/';
  const hubTitle = 'Archives historiques de médias étudiants | LE-RADAR.ca';
  pages.unshift({
    path: hubPath, changefreq: 'weekly', priority: '0.5', lastmod: sample.records.map((record) => record.lastVerifiedAt).sort().at(-1) || null,
    html: renderPage({
      lang: 'fr', path: hubPath, altPath: hubPath, title: hubTitle,
      description: 'Catalogue historique expérimental d’articles de médias étudiants du Québec, avec attribution et liens vérifiés vers les publications originales.',
      h1: 'Archives historiques des médias étudiants', eyebrow: 'Catalogue expérimental',
      crumbs: [{ label: 'Accueil', href: '../' }, { label: 'Archives historiques' }],
      bodyHtml: `      <p class="seo-lead">Cette sélection publique est volontairement limitée et vérifiée. Les articles anciens restent exclus du fil d’actualité; chaque entrée renvoie clairement vers son média d’origine.</p>\n      <section class="seo-section"><h2>Publications incluses</h2><ul class="seo-archive-sources">\n${hubRows.join('\n')}\n      </ul></section>`,
      jsonLd: collectionJsonLd({ siteBase, path: hubPath, title: hubTitle, records: sample.records }), siteBase, alternate: false,
      updated: sample.records.map((record) => record.lastVerifiedAt).sort().at(-1),
    }),
  });
  return { pages, sourcePaths, sample };
}

module.exports = { buildHistoricalArchivePages };

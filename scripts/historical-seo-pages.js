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
  return `      <article class="seo-archive-record">
        <h2><a href="${escapeHtml(record.originalUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(record.title)}</a></h2>
        ${metadata ? `<p class="seo-archive-record__meta">${escapeHtml(metadata)}</p>` : ''}
        ${record.excerpt ? `<p>${escapeHtml(record.excerpt)}</p>` : ''}
        <p class="seo-archive-record__origin"><a href="${escapeHtml(record.originalUrl)}" target="_blank" rel="noopener noreferrer">Lire la suite →</a></p>
      </article>`;
}

function unavailableReferences(records) {
  if (!records.length) return '';
  const rows = records.slice(0, 10).map((record) => `          <li><strong>${escapeHtml(record.title)}</strong>${record.publishedAt ? ` <span>(${escapeHtml(localDate(record.publishedAt))})</span>` : ''} — lien original signalé indisponible lors de la dernière vérification.</li>`);
  return `\n      <section class="seo-archive-unavailable"><h2>Références devenues indisponibles</h2><p>LE-RADAR.ca conserve les informations disponibles sans reproduire le contenu disparu.</p><ul>\n${rows.join('\n')}\n      </ul></section>`;
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

function groupedRecords(records) {
  const years = [...new Set(records.map((record) => new Date(record.publishedAt || 0).getUTCFullYear()).filter(Number.isFinite))]
    .sort((a, b) => b - a);
  return years.map((year) => `<section class="seo-archive-year"><h2>${year}</h2>${records
    .filter((record) => new Date(record.publishedAt || 0).getUTCFullYear() === year)
    .map(recordHtml).join('\n')}</section>`).join('\n');
}

function bySource(records, perSource = Infinity) {
  const groups = new Map();
  for (const record of records) {
    if (!groups.has(record.source)) groups.set(record.source, []);
    if (groups.get(record.source).length < perSource) groups.get(record.source).push(record);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'));
}

function buildHistoricalArchivePages({ catalog, config, siteBase }) {
  const initialSample = partialPublicSample(catalog?.records || [], config);
  const sample = {
    ...initialSample,
    records: initialSample.records.slice(),
    conservation: (initialSample.conservation || []).slice(),
    reference: (initialSample.reference || []).slice(),
  };
  if (!sample.records.length && !sample.conservation.length && !sample.reference.length) return { pages: [], sourcePaths: new Map(), sample };
  const pages = [];
  const sourcePaths = new Map();
  const maxPages = Math.max(1, Number(config?.partial?.maxPages) || 1);
  const maxSourcePages = Math.max(0, maxPages - 1);
  const sources = bySource(sample.records).slice(0, maxSourcePages);
  const included = new Set(sources.map(([source]) => source));
  sample.records = sample.records.filter((record) => included.has(record.source));
  // Les métadonnées au-delà de l’année indexable restent consultables, sans devenir un
  // second sitemap massif. Les pages ne sont jamais indexées automatiquement.
  const conservationLimit = Math.max(1, Number(config?.partial?.conservationRecordsPerSource) || 20);
  const conservationSources = bySource(sample.conservation, conservationLimit).slice(0, maxSourcePages);
  const conservationBySource = new Map(conservationSources);
  const displayedConservation = conservationSources.flatMap(([, records]) => records);
  const referenceLimit = Math.max(1, Number(config?.partial?.referenceRecordsPerSource) || 20);
  const referenceSources = bySource(sample.reference, referenceLimit).slice(0, maxSourcePages);
  const referenceBySource = new Map(referenceSources);
  const displayedReference = referenceSources.flatMap(([, records]) => records);
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
    const grouped = groupedRecords(records);
    const conservationLink = conservationBySource.has(source)
      ? `\n      <p class="seo-archive-record__origin"><a href="../conservation/${slug}/">Consulter les archives historiques</a></p>`
      : '';
    const referenceLink = referenceBySource.has(source)
      ? `\n      <p class="seo-archive-record__origin"><a href="../reference/${slug}/">Consulter les archives de référence</a></p>`
      : '';
    const title = `Archives vérifiées de ${source} | LE-RADAR.ca`;
    pages.push({
      path,
      changefreq: 'monthly', priority: '0.4', lastmod: records.map((record) => record.lastVerifiedAt).sort().at(-1) || null,
      html: renderPage({
        lang: 'fr', path, altPath: path, title,
        description: `Catalogue historique expérimental des articles de ${source}, avec attribution et lien vers chaque publication originale.`,
        h1: `Archives historiques — ${source}`, eyebrow: 'Catalogue expérimental',
        crumbs: [{ label: 'Accueil', href: '../../' }, { label: 'Archives historiques', href: '../' }, { label: source }],
        bodyHtml: `      <p class="seo-lead">Articles historiques vérifiés de ${escapeHtml(source)}. LE-RADAR.ca les référence; le contenu complet demeure sur le site du média.</p>${conservationLink}${referenceLink}\n${grouped}${unavailableReferences(missingBySource.get(source) || [])}`,
        jsonLd: collectionJsonLd({ siteBase, path, title, records }), siteBase, alternate: false,
        updated: records.map((record) => record.lastVerifiedAt).sort().at(-1),
      }),
    });
    hubRows.push(`        <li><a href="${slug}/">${escapeHtml(source)}</a> <span>${records.length} article${records.length > 1 ? 's' : ''} vérifié${records.length > 1 ? 's' : ''}</span></li>`);
  }

  const conservationRows = [];
  for (const [source, records] of conservationSources) {
    const slug = slugify(source);
    const path = `archives/conservation/${slug}/`;
    const title = `Archives — ${source} | LE-RADAR.ca`;
    pages.push({
      path, changefreq: 'yearly', priority: '0.1', indexable: false,
      lastmod: records.map((record) => record.lastVerifiedAt).sort().at(-1) || null,
      html: renderPage({
        lang: 'fr', path, altPath: path, title,
        description: `Articles historiques de ${source}, avec attribution et lien vers la publication originale.`,
        h1: `Archives — ${source}`,
        crumbs: [{ label: 'Accueil', href: '../../../' }, { label: 'Archives historiques', href: '../../' }, { label: source }],
        bodyHtml: `      <p class="seo-lead">Une sélection d’articles de ${escapeHtml(source)}, avec leur date, leur auteur lorsqu’il est indiqué et un lien vers la publication originale.</p>\n${groupedRecords(records)}`,
        jsonLd: collectionJsonLd({ siteBase, path, title, records }), siteBase, alternate: false,
        robots: 'noindex,follow', updated: records.map((record) => record.lastVerifiedAt).sort().at(-1),
      }),
    });
    conservationRows.push(`        <li><a href="${slug}/">${escapeHtml(source)}</a> <span>${records.length} article${records.length > 1 ? 's' : ''}</span></li>`);
    if (!sourcePaths.has(source)) sourcePaths.set(source, path);
  }

  if (conservationRows.length) {
    const path = 'archives/conservation/';
    const title = 'Archives par publication | LE-RADAR.ca';
    pages.push({
      path, changefreq: 'yearly', priority: '0.1', indexable: false,
      lastmod: displayedConservation.map((record) => record.lastVerifiedAt).sort().at(-1) || null,
      html: renderPage({
        lang: 'fr', path, altPath: path, title,
        description: 'Archives d’articles de médias étudiants du Québec, classées par publication.',
        h1: 'Archives par publication',
        crumbs: [{ label: 'Accueil', href: '../../' }, { label: 'Archives historiques', href: '../' }, { label: 'Archives par publication' }],
        bodyHtml: `      <p class="seo-lead">Ces archives restent consultables pour la continuité documentaire et ne réinjectent jamais d’articles dans le fil vivant.</p>\n      <section class="seo-section"><h2>Publications</h2><ul class="seo-archive-sources">\n${conservationRows.join('\n')}\n      </ul></section>`,
        jsonLd: collectionJsonLd({ siteBase, path, title, records: displayedConservation }), siteBase, alternate: false,
        robots: 'noindex,follow', updated: displayedConservation.map((record) => record.lastVerifiedAt).sort().at(-1),
      }),
    });
  }

  const referenceRows = [];
  for (const [source, records] of referenceSources) {
    const slug = slugify(source);
    const path = `archives/reference/${slug}/`;
    const title = `Archives — ${source} | LE-RADAR.ca`;
    pages.push({
      path, changefreq: 'yearly', priority: '0.1', indexable: false,
      lastmod: records.map((record) => record.lastVerifiedAt).sort().at(-1) || null,
      html: renderPage({
        lang: 'fr', path, altPath: path, title,
        description: `Articles historiques de ${source}, avec attribution et lien vers chaque publication originale.`,
        h1: `Archives — ${source}`,
        crumbs: [{ label: 'Accueil', href: '../../../' }, { label: 'Archives historiques', href: '../../' }, { label: source }],
        bodyHtml: `      <p class="seo-lead">Une sélection d’articles de ${escapeHtml(source)}, avec leur date, leur auteur lorsqu’il est indiqué et un lien vers la publication originale.</p>\n${groupedRecords(records)}`,
        jsonLd: collectionJsonLd({ siteBase, path, title, records }), siteBase, alternate: false,
        robots: 'noindex,follow', updated: records.map((record) => record.lastVerifiedAt).sort().at(-1),
      }),
    });
    referenceRows.push(`        <li><a href="${slug}/">${escapeHtml(source)}</a> <span>${records.length} article${records.length > 1 ? 's' : ''}</span></li>`);
    if (!sourcePaths.has(source)) sourcePaths.set(source, path);
  }

  // Une publication sans article indexable peut être répartie entre les
  // bandes internes de conservation. Sa fiche ne doit jamais cacher une
  // partie de ses archives derrière ces détails de pipeline : une route
  // unifiée, hors index, rassemble tous ses articles accessibles.
  const nonIndexBySource = new Map();
  for (const record of [...displayedConservation, ...displayedReference]) {
    if (included.has(record.source)) continue;
    if (!nonIndexBySource.has(record.source)) nonIndexBySource.set(record.source, []);
    nonIndexBySource.get(record.source).push(record);
  }
  for (const [source, records] of nonIndexBySource) {
    const slug = slugify(source);
    const path = `archives/${slug}/`;
    const allRecords = records.sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
    const title = `Archives — ${source} | LE-RADAR.ca`;
    pages.push({
      path, changefreq: 'yearly', priority: '0.1', indexable: false,
      lastmod: allRecords.map((record) => record.lastVerifiedAt).sort().at(-1) || null,
      html: renderPage({
        lang: 'fr', path, altPath: path, title,
        description: `Articles historiques de ${source}, avec attribution et lien vers chaque publication originale.`,
        h1: `Archives — ${source}`,
        crumbs: [{ label: 'Accueil', href: '../../' }, { label: 'Archives historiques', href: '../' }, { label: source }],
        bodyHtml: `      <p class="seo-lead">Une sélection d’articles de ${escapeHtml(source)}, avec leur date, leur auteur lorsqu’il est indiqué et un lien vers la publication originale.</p>\n${groupedRecords(allRecords)}`,
        jsonLd: collectionJsonLd({ siteBase, path, title, records: allRecords }), siteBase, alternate: false,
        robots: 'noindex,follow', updated: allRecords.map((record) => record.lastVerifiedAt).sort().at(-1),
      }),
    });
    sourcePaths.set(source, path);
  }

  if (referenceRows.length) {
    const path = 'archives/reference/';
    const title = 'Archives par publication | LE-RADAR.ca';
    pages.push({
      path, changefreq: 'yearly', priority: '0.1', indexable: false,
      lastmod: displayedReference.map((record) => record.lastVerifiedAt).sort().at(-1) || null,
      html: renderPage({
        lang: 'fr', path, altPath: path, title,
        description: 'Archives d’articles de médias étudiants du Québec, classées par publication.',
        h1: 'Archives par publication',
        crumbs: [{ label: 'Accueil', href: '../../' }, { label: 'Archives historiques', href: '../' }, { label: 'Archives par publication' }],
        bodyHtml: `      <p class="seo-lead">Ces archives rendent les publications historiques consultables sans les confondre avec l’actualité.</p>\n      <section class="seo-section"><h2>Publications</h2><ul class="seo-archive-sources">\n${referenceRows.join('\n')}\n      </ul></section>`,
        jsonLd: collectionJsonLd({ siteBase, path, title, records: displayedReference }), siteBase, alternate: false,
        robots: 'noindex,follow', updated: displayedReference.map((record) => record.lastVerifiedAt).sort().at(-1),
      }),
    });
  }

  const hubPath = 'archives/';
  const hubTitle = 'Archives historiques de médias étudiants | LE-RADAR.ca';
  if (sample.records.length) pages.unshift({
    path: hubPath, changefreq: 'weekly', priority: '0.5', lastmod: sample.records.map((record) => record.lastVerifiedAt).sort().at(-1) || null,
    html: renderPage({
      lang: 'fr', path: hubPath, altPath: hubPath, title: hubTitle,
      description: 'Catalogue historique expérimental d’articles de médias étudiants du Québec, avec attribution et liens vérifiés vers les publications originales.',
      h1: 'Archives historiques des médias étudiants', eyebrow: 'Catalogue expérimental',
      crumbs: [{ label: 'Accueil', href: '../' }, { label: 'Archives historiques' }],
      bodyHtml: `      <p class="seo-lead">Cette sélection publique est volontairement limitée et vérifiée. Les articles anciens restent exclus du fil d’actualité; chaque entrée renvoie clairement vers son média d’origine.</p>${conservationRows.length ? '\n      <p class="seo-archive-record__origin"><a href="conservation/">Consulter les archives par publication</a></p>' : ''}${referenceRows.length ? '\n      <p class="seo-archive-record__origin"><a href="reference/">Consulter les autres archives par publication</a></p>' : ''}\n      <section class="seo-section"><h2>Publications incluses</h2><ul class="seo-archive-sources">\n${hubRows.join('\n')}\n      </ul></section>`,
      jsonLd: collectionJsonLd({ siteBase, path: hubPath, title: hubTitle, records: sample.records }), siteBase, alternate: false,
      updated: sample.records.map((record) => record.lastVerifiedAt).sort().at(-1),
    }),
  });
  return { pages, sourcePaths, sample };
}

module.exports = { buildHistoricalArchivePages };

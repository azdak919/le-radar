/** Pages HTML du catalogue historique : métadonnées riches, jamais le corps externe. */
const {
  escapeHtml,
  renderPage,
  slugify,
  factsList,
  frOf,
  canonicalInstitution,
} = require('./seo-pages-lib');
const { partialPublicSample } = require('./historical-catalog-lib');

const CRUMB_ARCHIVES = 'Archives';

function localDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date inconnue';
  return date.toLocaleString('fr-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

function localDateOnly(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function langLabel(code) {
  if (code === 'en') return 'Anglais';
  if (code === 'fr') return 'Français';
  return '';
}

function latestPublishedAt(records = []) {
  let best = 0;
  for (const record of records) {
    const t = Date.parse(record?.publishedAt || 0);
    if (Number.isFinite(t) && t > best) best = t;
  }
  return best || 0;
}

function noteLatest(map, source, records) {
  const t = latestPublishedAt(records);
  if (!map.has(source) || t > map.get(source)) map.set(source, t);
}

function sourceMeta(records = [], registry = null) {
  const sample = records[0] || {};
  return {
    institution: sample.institution || registry?.institution || '',
    region: sample.region || registry?.region || '',
    language: sample.language || registry?.lang || '',
    site: registry?.site || '',
  };
}

/** Chapeau + fiches (établissement, langue…) alignés sur les pages journaux. */
function sourceHeader({ source, records, registry, depth = 2 }) {
  const meta = sourceMeta(records, registry);
  const inst = meta.institution ? canonicalInstitution(meta.institution) : null;
  const up = '../'.repeat(depth);
  const lead = meta.institution
    ? `${source} est le journal étudiant ${frOf(meta.institution)}. Archives d’articles référencés sur LE-RADAR.ca, avec date, auteur lorsqu’il est indiqué et lien vers chaque publication originale.`
    : `Une sélection d’articles de ${source}, avec leur date, leur auteur lorsqu’il est indiqué et un lien vers la publication originale.`;
  const description = meta.institution
    ? `Archives de ${source}, journal étudiant ${frOf(meta.institution)}${meta.language ? ` (${langLabel(meta.language)})` : ''}. Articles avec date, auteur et lien vers la publication originale.`
    : `Articles de ${source}, avec attribution et lien vers chaque publication originale.`;
  const facts = factsList([
    {
      label: 'Établissement',
      value: meta.institution,
      href: inst ? `${up}etablissements/${inst.slug}/` : null,
    },
    { label: 'Région', value: meta.region },
    { label: 'Langue', value: langLabel(meta.language) },
    {
      label: 'Site officiel',
      value: meta.site,
      href: meta.site || null,
      external: Boolean(meta.site),
    },
  ]);
  return { lead, description, factsHtml: facts, meta };
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

function collectionJsonLd({ siteBase, path, title, records, description }) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    url: `${siteBase}/${path}`,
    ...(description ? { description } : {}),
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
          ...(record.language ? { inLanguage: record.language } : {}),
          ...(record.institution
            ? { about: { '@type': 'CollegeOrUniversity', name: record.institution } }
            : {}),
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

function directoryRow(source, path, latestMs) {
  const relativePath = path.startsWith('archives/') ? path.slice('archives/'.length) : path;
  const dateLabel = latestMs ? localDateOnly(latestMs) : '';
  const meta = dateLabel ? ` <span>Dernier article : ${escapeHtml(dateLabel)}</span>` : '';
  return `        <li><a href="${escapeHtml(relativePath)}">${escapeHtml(source)}</a>${meta}</li>`;
}

function sortByFreshness(entries, latestMap) {
  return [...entries].sort((a, b) => {
    const sourceA = Array.isArray(a) ? a[0] : a.source;
    const sourceB = Array.isArray(b) ? b[0] : b.source;
    const left = latestMap.get(sourceA) || 0;
    const right = latestMap.get(sourceB) || 0;
    if (right !== left) return right - left;
    return sourceA.localeCompare(sourceB, 'fr');
  });
}

function buildHistoricalArchivePages({ catalog, config, siteBase, sources = [] }) {
  const sourceRegistry = new Map((sources || []).map((entry) => [entry.name, entry]));
  const initialSample = partialPublicSample(catalog?.records || [], config);
  const sample = {
    ...initialSample,
    records: initialSample.records.slice(),
    conservation: (initialSample.conservation || []).slice(),
    reference: (initialSample.reference || []).slice(),
  };
  if (!sample.records.length && !sample.conservation.length && !sample.reference.length) {
    return { pages: [], sourcePaths: new Map(), sample };
  }
  const pages = [];
  const sourcePaths = new Map();
  const sourceLatest = new Map();
  const maxPages = Math.max(1, Number(config?.partial?.maxPages) || 1);
  const maxSourcePages = Math.max(0, maxPages - 1);
  const sourcesListed = bySource(sample.records).slice(0, maxSourcePages);
  const included = new Set(sourcesListed.map(([source]) => source));
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
  const missingBySource = new Map();
  for (const record of catalog?.records || []) {
    if (record?.link?.status !== 'missing') continue;
    if (!missingBySource.has(record.source)) missingBySource.set(record.source, []);
    missingBySource.get(record.source).push(record);
  }

  for (const [source, records] of sourcesListed) {
    const slug = slugify(source);
    const path = `archives/${slug}/`;
    sourcePaths.set(source, path);
    noteLatest(sourceLatest, source, records);
    const grouped = groupedRecords(records);
    const registry = sourceRegistry.get(source) || null;
    const header = sourceHeader({ source, records, registry, depth: 2 });
    const conservationLink = conservationBySource.has(source)
      ? `\n      <p class="seo-archive-record__origin"><a href="../conservation/${slug}/">Consulter d’autres archives</a></p>`
      : '';
    const referenceLink = referenceBySource.has(source)
      ? `\n      <p class="seo-archive-record__origin"><a href="../reference/${slug}/">Consulter les archives de référence</a></p>`
      : '';
    const title = `Archives — ${source} | LE-RADAR.ca`;
    pages.push({
      path,
      changefreq: 'monthly', priority: '0.4', lastmod: records.map((record) => record.lastVerifiedAt).sort().at(-1) || null,
      html: renderPage({
        lang: 'fr', path, altPath: path, title,
        description: header.description,
        h1: `Archives — ${source}`,
        crumbs: [{ label: 'Accueil', href: '../../' }, { label: CRUMB_ARCHIVES, href: '../' }, { label: source }],
        bodyHtml: `      <p class="seo-lead">${escapeHtml(header.lead)}</p>\n${header.factsHtml}${conservationLink}${referenceLink}\n${grouped}${unavailableReferences(missingBySource.get(source) || [])}`,
        jsonLd: collectionJsonLd({ siteBase, path, title, records, description: header.description }), siteBase, alternate: false,
        updated: records.map((record) => record.lastVerifiedAt).sort().at(-1),
      }),
    });
  }

  const conservationLatest = new Map();
  for (const [src, recs] of conservationSources) noteLatest(conservationLatest, src, recs);
  const conservationRows = [];
  for (const [source, records] of sortByFreshness(conservationSources, conservationLatest)) {
    const slug = slugify(source);
    const path = `archives/conservation/${slug}/`;
    const registry = sourceRegistry.get(source) || null;
    const header = sourceHeader({ source, records, registry, depth: 3 });
    noteLatest(sourceLatest, source, records);
    const title = `Archives — ${source} | LE-RADAR.ca`;
    pages.push({
      path, changefreq: 'yearly', priority: '0.1', indexable: false,
      lastmod: records.map((record) => record.lastVerifiedAt).sort().at(-1) || null,
      html: renderPage({
        lang: 'fr', path, altPath: path, title,
        description: header.description,
        h1: `Archives — ${source}`,
        crumbs: [{ label: 'Accueil', href: '../../../' }, { label: CRUMB_ARCHIVES, href: '../../' }, { label: source }],
        bodyHtml: `      <p class="seo-lead">${escapeHtml(header.lead)}</p>\n${header.factsHtml}${groupedRecords(records)}`,
        jsonLd: collectionJsonLd({ siteBase, path, title, records, description: header.description }), siteBase, alternate: false,
        robots: 'noindex,follow', updated: records.map((record) => record.lastVerifiedAt).sort().at(-1),
      }),
    });
    conservationRows.push(directoryRow(source, `${slug}/`, latestPublishedAt(records)));
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
        description: 'Archives d’articles de journaux étudiants du Québec, classées par publication.',
        h1: 'Archives par publication',
        crumbs: [{ label: 'Accueil', href: '../../' }, { label: CRUMB_ARCHIVES, href: '../' }, { label: 'Archives par publication' }],
        bodyHtml: `      <p class="seo-lead">Ces archives restent consultables pour la continuité documentaire et ne réinjectent jamais d’articles dans le fil vivant.</p>\n      <section class="seo-section"><h2>Publications</h2><ul class="seo-archive-sources">\n${conservationRows.join('\n')}\n      </ul></section>`,
        jsonLd: collectionJsonLd({ siteBase, path, title, records: displayedConservation }), siteBase, alternate: false,
        robots: 'noindex,follow', updated: displayedConservation.map((record) => record.lastVerifiedAt).sort().at(-1),
      }),
    });
  }

  const referenceLatest = new Map();
  for (const [src, recs] of referenceSources) noteLatest(referenceLatest, src, recs);
  const referenceRows = [];
  for (const [source, records] of sortByFreshness(referenceSources, referenceLatest)) {
    const slug = slugify(source);
    const path = `archives/reference/${slug}/`;
    const registry = sourceRegistry.get(source) || null;
    const header = sourceHeader({ source, records, registry, depth: 3 });
    noteLatest(sourceLatest, source, records);
    const title = `Archives — ${source} | LE-RADAR.ca`;
    pages.push({
      path, changefreq: 'yearly', priority: '0.1', indexable: false,
      lastmod: records.map((record) => record.lastVerifiedAt).sort().at(-1) || null,
      html: renderPage({
        lang: 'fr', path, altPath: path, title,
        description: header.description,
        h1: `Archives — ${source}`,
        crumbs: [{ label: 'Accueil', href: '../../../' }, { label: CRUMB_ARCHIVES, href: '../../' }, { label: source }],
        bodyHtml: `      <p class="seo-lead">${escapeHtml(header.lead)}</p>\n${header.factsHtml}${groupedRecords(records)}`,
        jsonLd: collectionJsonLd({ siteBase, path, title, records, description: header.description }), siteBase, alternate: false,
        robots: 'noindex,follow', updated: records.map((record) => record.lastVerifiedAt).sort().at(-1),
      }),
    });
    referenceRows.push(directoryRow(source, `${slug}/`, latestPublishedAt(records)));
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
    const registry = sourceRegistry.get(source) || null;
    const header = sourceHeader({ source, records: allRecords, registry, depth: 2 });
    noteLatest(sourceLatest, source, allRecords);
    const title = `Archives — ${source} | LE-RADAR.ca`;
    pages.push({
      path, changefreq: 'yearly', priority: '0.1', indexable: false,
      lastmod: allRecords.map((record) => record.lastVerifiedAt).sort().at(-1) || null,
      html: renderPage({
        lang: 'fr', path, altPath: path, title,
        description: header.description,
        h1: `Archives — ${source}`,
        crumbs: [{ label: 'Accueil', href: '../../' }, { label: CRUMB_ARCHIVES, href: '../' }, { label: source }],
        bodyHtml: `      <p class="seo-lead">${escapeHtml(header.lead)}</p>\n${header.factsHtml}${groupedRecords(allRecords)}`,
        jsonLd: collectionJsonLd({ siteBase, path, title, records: allRecords, description: header.description }), siteBase, alternate: false,
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
        description: 'Archives d’articles de journaux étudiants du Québec, classées par publication.',
        h1: 'Archives par publication',
        crumbs: [{ label: 'Accueil', href: '../../' }, { label: CRUMB_ARCHIVES, href: '../' }, { label: 'Archives par publication' }],
        bodyHtml: `      <p class="seo-lead">Ces archives rendent les publications consultables sans les confondre avec l’actualité.</p>\n      <section class="seo-section"><h2>Publications</h2><ul class="seo-archive-sources">\n${referenceRows.join('\n')}\n      </ul></section>`,
        jsonLd: collectionJsonLd({ siteBase, path, title, records: displayedReference }), siteBase, alternate: false,
        robots: 'noindex,follow', updated: displayedReference.map((record) => record.lastVerifiedAt).sort().at(-1),
      }),
    });
  }

  // L’entrée des archives est un annuaire : les choix de conservation et
  // d’indexation restent des détails internes. Une source ayant seulement des
  // archives hors index y figure donc au même titre que les autres.
  // Tri par date du dernier article (plus récent en tête).
  const archiveDirectoryRows = sortByFreshness(
    [...sourcePaths.entries()].map(([source, path]) => ({ source, path })),
    sourceLatest,
  ).map(({ source, path }) => directoryRow(source, path, sourceLatest.get(source) || 0));

  const hubPath = 'archives/';
  const hubTitle = 'Archives des journaux étudiants | LE-RADAR.ca';
  if (sample.records.length || archiveDirectoryRows.length) {
    pages.unshift({
      path: hubPath,
      changefreq: 'weekly',
      priority: '0.5',
      lastmod: [...sample.records, ...displayedConservation, ...displayedReference]
        .map((record) => record.lastVerifiedAt)
        .filter(Boolean)
        .sort()
        .at(-1) || null,
      html: renderPage({
        lang: 'fr', path: hubPath, altPath: hubPath, title: hubTitle,
        description: 'Archives d’articles de journaux étudiants du Québec, classées par publication et liées à leur média d’origine.',
        h1: 'Archives des journaux étudiants',
        crumbs: [{ label: 'Accueil', href: '../' }, { label: CRUMB_ARCHIVES }],
        bodyHtml: `      <p class="seo-lead">Consultez les archives par publication, de la plus récente à la plus ancienne. Chaque article renvoie vers le site du média.</p>\n      <section class="seo-section"><h2>Publications</h2><ul class="seo-archive-sources">\n${archiveDirectoryRows.join('\n')}\n      </ul></section>`,
        jsonLd: collectionJsonLd({
          siteBase,
          path: hubPath,
          title: hubTitle,
          records: sample.records.length
            ? sample.records
            : [...displayedConservation, ...displayedReference].slice(0, 25),
        }),
        siteBase,
        alternate: false,
        updated: [...sample.records, ...displayedConservation, ...displayedReference]
          .map((record) => record.lastVerifiedAt)
          .filter(Boolean)
          .sort()
          .at(-1),
      }),
    });
  }
  return { pages, sourcePaths, sample };
}

module.exports = { buildHistoricalArchivePages };

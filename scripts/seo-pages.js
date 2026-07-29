/**
 * LE-RADAR.ca — Construction des pages d'entités (FR + EN).
 *
 * Assemble, à partir des registres maintenus par les bots :
 *   /radios/<id>/            /en/radios/<id>/
 *   /journaux/<slug>/        /en/newspapers/<slug>/
 *   /etablissements/<slug>/  /en/institutions/<slug>/
 *   /medias/                 /en/media/
 *   /horaires/               /en/schedules/
 *
 * Voir scripts/seo-pages-lib.js pour le gabarit et les chaînes bilingues,
 * et docs/referencement.md pour le pourquoi.
 */

const {
  T, escapeHtml, slugify, normKey, canonicalInstitution, localizedInstitutionName, isoDay,
  fill, frOf, frAt, plural, renderPage, factsList, headlineList, cardGrid, scheduleTable,
} = require('./seo-pages-lib');

const HEADLINES_PER_PAPER = 12;

/**
 * Date affichée en pied de page — propre à CHAQUE page.
 *
 * Une date globale (« dernière passe des bots ») rendait les 67 pages
 * différentes chaque jour alors que leur contenu était identique : un commit
 * quotidien de 67 fichiers pour rien. Avec une date tirée des données de la
 * page, un fichier ne change que si son contenu change — et `git` fait alors
 * lui-même la détection des vraies mises à jour, sans bot ni Worker.
 *
 * Les pages d'annuaire n'en portent pas : elles n'ont pas de fraîcheur propre.
 */
function paperUpdated(paper) {
  // headlines est déjà trié du plus récent au plus ancien (buildModel).
  return isoDay(paper.headlines?.[0]?.date);
}

function radioUpdated(radio, ctx) {
  return isoDay(ctx.schedules?.[radio.id]?.checkedAt);
}

function institutionUpdated(group, ctx) {
  const dates = [
    ...group.papers.map((p) => paperUpdated(p)),
    ...group.radios.map((r) => radioUpdated(r, ctx)),
  ].filter(Boolean);
  return dates.length ? dates.sort().at(-1) : null;
}

/** Chemins jumeaux FR/EN d'un même contenu. */
const ROUTES = {
  directory: { fr: 'medias/', en: 'en/media/' },
  schedules: { fr: 'horaires/', en: 'en/schedules/' },
  radio: { fr: (s) => `radios/${s}/`, en: (s) => `en/radios/${s}/` },
  paper: { fr: (s) => `journaux/${s}/`, en: (s) => `en/newspapers/${s}/` },
  institution: { fr: (s) => `etablissements/${s}/`, en: (s) => `en/institutions/${s}/` },
  home: { fr: '', en: 'en/' },
};

function typeLabel(type, t) {
  if (type === 'cegep') return t.cegep;
  if (type === 'universite' || type === 'university') return t.university;
  return '';
}

function langLabel(code, t) {
  if (code === 'en') return t.english;
  if (code === 'fr') return t.french;
  return '';
}

// ═══════════════════════════════════════════════════════════════════════════
//  Modèle : on regroupe tout par établissement canonique
// ═══════════════════════════════════════════════════════════════════════════

function buildModel({ radios, sources, news, institutions }) {
  const instIndex = new Map();
  for (const inst of institutions || []) {
    instIndex.set(normKey(inst.name), inst);
  }

  const groups = new Map();
  const ensure = (rawName) => {
    const canon = canonicalInstitution(rawName);
    if (!canon) return null;
    if (!groups.has(canon.slug)) {
      const official = instIndex.get(normKey(canon.name)) || null;
      groups.set(canon.slug, { ...canon, official, radios: [], papers: [] });
    }
    return groups.get(canon.slug);
  };

  const radioEntries = (radios || []).map((r) => {
    const group = ensure(r.institution);
    const entry = { ...r, slug: slugify(r.id || r.name), group };
    if (group) group.radios.push(entry);
    return entry;
  });

  const newsBySource = new Map();
  for (const item of news || []) {
    if (!item.source || !item.title || !item.link) continue;
    if (!newsBySource.has(item.source)) newsBySource.set(item.source, []);
    newsBySource.get(item.source).push(item);
  }

  const paperEntries = (sources || []).map((s) => {
    const group = ensure(s.institution);
    const entry = {
      ...s,
      slug: slugify(s.name),
      group,
      headlines: (newsBySource.get(s.name) || []).slice(0, HEADLINES_PER_PAPER),
    };
    if (group) group.papers.push(entry);
    return entry;
  });

  return { radioEntries, paperEntries, groups: [...groups.values()] };
}

// ═══════════════════════════════════════════════════════════════════════════
//  Pages
// ═══════════════════════════════════════════════════════════════════════════

function radioPage(radio, lang, ctx) {
  const t = T[lang];
  const name = radio.fullName || radio.name;
  const instName = localizedInstitutionName(radio.group || radio.institution, lang);
  // Le nom et la fréquence restent le repère principal, suivis du slogan sur
  // la même ligne : l'identité de la station est visible sans sacrifier son
  // accroche éditoriale.
  const h1 = radio.slogan ? `${name} — ${radio.slogan}` : name;
  const title = lang === 'fr'
    ? `${name} — radio étudiante ${frOf(instName)} | LE-RADAR.ca`
    : `${name} — ${instName} campus radio | LE-RADAR.ca`;
  const description = radio.description
    ? String(radio.description).slice(0, 300)
    : (lang === 'fr'
      ? `${name}, la radio étudiante ${frOf(instName)} à ${radio.city}. Écoute en direct et grille horaire.`
      : `${name}, the campus radio station of ${instName} in ${radio.city}. Listen live and see the schedule.`);

  const path = ROUTES.radio[lang](radio.slug);
  const altPath = ROUTES.radio[lang === 'fr' ? 'en' : 'fr'](radio.slug);
  const up = '../'.repeat(path.split('/').filter(Boolean).length);

  let body = '';
  if (radio.description) body += `      <p class="seo-lead">${escapeHtml(radio.description)}</p>\n`;

  body += factsList([
    { label: t.frequency, value: radio.frequency },
    { label: t.institution, value: instName, href: radio.group ? `${up}${ROUTES.institution[lang](radio.group.slug)}` : null },
    { label: t.city, value: radio.city },
    { label: t.region, value: radio.region },
    { label: t.officialSite, value: radio.website, href: radio.website, external: true },
  ]);

  body += `      <p class="seo-cta"><a href="${up}${ROUTES.schedules[lang]}">${escapeHtml(t.browseSchedules)}</a></p>\n`;
  body += scheduleTable(ctx.schedules?.[radio.id]?.grid, t, {
    checkedAt: ctx.schedules?.[radio.id]?.checkedAt,
    verifiedWeekOf: ctx.schedules?.[radio.id]?.verifiedWeekOf,
  });

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'RadioStation',
    name,
    ...(radio.description ? { description: radio.description } : {}),
    ...(radio.website ? { url: radio.website } : {}),
    ...(radio.frequency ? { broadcastFrequency: radio.frequency } : {}),
    ...(radio.city ? { areaServed: { '@type': 'City', name: radio.city } } : {}),
    ...(instName ? { parentOrganization: { '@type': 'CollegeOrUniversity', name: instName } } : {}),
    inLanguage: lang === 'fr' ? 'fr-CA' : 'en-CA',
  }).replace(/</g, '\\u003c');

  return {
    path,
    html: renderPage({
      lang, path, altPath, title, description, h1,
      eyebrow: t.radios,
      // Le hub horaires est dans le fil : sans lien entrant, une page générée
      // est mal explorée (même raisonnement que les liens de pied de page).
      crumbs: [
        { label: t.home, href: up },
        { label: t.directory, href: `${up}${ROUTES.directory[lang]}` },
        { label: t.schedules, href: `${up}${ROUTES.schedules[lang]}` },
        { label: name },
      ],
      bodyHtml: body, jsonLd, siteBase: ctx.siteBase, updated: radioUpdated(radio, ctx),
    }),
    changefreq: 'weekly',
    priority: '0.8',
    lastmod: radioUpdated(radio, ctx),
  };
}

function paperPage(paper, lang, ctx) {
  const t = T[lang];
  const instName = localizedInstitutionName(paper.group || paper.institution, lang);
  const h1 = `${paper.name} — ${fill(t.paperOf, { name: instName, of: frOf(instName) })}`;
  const title = lang === 'fr'
    ? `${paper.name} — journal étudiant ${frOf(instName)} | LE-RADAR.ca`
    : `${paper.name} — ${instName} student newspaper | LE-RADAR.ca`;
  const description = lang === 'fr'
    ? `${paper.name}, le journal étudiant ${frOf(instName)}. Les derniers articles, avec un lien vers chaque texte original.`
    : `${paper.name}, the student newspaper of ${instName}. Latest articles, each linking to the original piece.`;

  const path = ROUTES.paper[lang](paper.slug);
  const altPath = ROUTES.paper[lang === 'fr' ? 'en' : 'fr'](paper.slug);
  const up = '../'.repeat(path.split('/').filter(Boolean).length);

  let body = `      <p class="seo-lead">${escapeHtml(
    lang === 'fr'
      ? `${paper.name} est le journal étudiant ${frOf(instName)}${paper.region ? ` (${paper.region})` : ''}. LE-RADAR.ca en agrège le fil et renvoie vers les articles d’origine.`
      : `${paper.name} is the student newspaper of ${instName}${paper.region ? ` (${paper.region})` : ''}. LE-RADAR.ca aggregates its feed and links back to the original articles.`,
  )}</p>\n`;

  body += factsList([
    { label: t.institution, value: instName, href: paper.group ? `${up}${ROUTES.institution[lang](paper.group.slug)}` : null },
    { label: t.region, value: paper.region },
    { label: t.language, value: langLabel(paper.lang, t) },
    { label: t.officialSite, value: paper.site, href: paper.site, external: true },
  ]);

  body += `      <section class="seo-section">\n        <h2>${escapeHtml(t.latestHeadlines)}</h2>\n`;
  body += headlineList(paper.headlines, t);
  body += '      </section>\n';

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'NewsMediaOrganization',
    name: paper.name,
    ...(paper.site ? { url: paper.site } : {}),
    ...(instName ? { parentOrganization: { '@type': 'CollegeOrUniversity', name: instName } } : {}),
    ...(paper.lang ? { inLanguage: paper.lang } : {}),
    ...(paper.headlines.length
      ? {
        subjectOf: {
          '@type': 'ItemList',
          numberOfItems: paper.headlines.length,
          itemListElement: paper.headlines.map((h, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: h.link,
            name: h.title,
          })),
        },
      }
      : {}),
  }).replace(/</g, '\\u003c');

  return {
    path,
    html: renderPage({
      lang, path, altPath, title, description, h1,
      eyebrow: t.newspapers,
      crumbs: [
        { label: t.home, href: up },
        { label: t.directory, href: `${up}${ROUTES.directory[lang]}` },
        { label: paper.name },
      ],
      bodyHtml: body, jsonLd, siteBase: ctx.siteBase, updated: paperUpdated(paper),
    }),
    changefreq: 'daily',
    priority: '0.8',
    lastmod: paperUpdated(paper),
  };
}

function institutionPage(group, lang, ctx) {
  const t = T[lang];
  const instName = localizedInstitutionName(group, lang);
  const h1 = fill(t.mediaOf, { name: instName, of: frOf(instName) });
  const title = `${h1} | LE-RADAR.ca`;
  const description = fill(t.mediaOfDesc, { name: instName, of: frOf(instName) });

  const path = ROUTES.institution[lang](group.slug);
  const altPath = ROUTES.institution[lang === 'fr' ? 'en' : 'fr'](group.slug);
  const up = '../'.repeat(path.split('/').filter(Boolean).length);

  const counts = lang === 'fr'
    ? `${plural(group.papers.length, 'journal étudiant', 'journaux étudiants')} et ${plural(group.radios.length, 'radio de campus', 'radios de campus')}`
    : `${plural(group.papers.length, 'student newspaper', 'student newspapers')} and ${plural(group.radios.length, 'campus radio station', 'campus radio stations')}`;

  let body = `      <p class="seo-lead">${escapeHtml(
    lang === 'fr'
      ? `LE-RADAR.ca recense ${counts} ${frAt(instName)}.`
      : `LE-RADAR.ca lists ${counts} at ${instName}.`,
  )}</p>\n`;

  body += factsList([
    { label: t.type, value: typeLabel(group.official?.type, t) },
    { label: t.region, value: group.official?.region },
    { label: t.officialSite, value: group.official?.website, href: group.official?.website, external: true },
  ]);

  body += `      <section class="seo-section">\n        <h2>${escapeHtml(t.newspapers)}</h2>\n`;
  body += group.papers.length
    ? cardGrid(group.papers.map((p) => ({
      name: p.name,
      meta: [p.region, langLabel(p.lang, t)].filter(Boolean).join(' · '),
      href: `${up}${ROUTES.paper[lang](p.slug)}`,
    })))
    : `      <p class="seo-empty">${escapeHtml(t.noPaper)}</p>\n`;
  body += '      </section>\n';

  body += `      <section class="seo-section">\n        <h2>${escapeHtml(t.radios)}</h2>\n`;
  body += group.radios.length
    ? cardGrid(group.radios.map((r) => ({
      name: r.fullName || r.name,
      meta: [r.frequency, r.city].filter(Boolean).join(' · '),
      href: `${up}${ROUTES.radio[lang](r.slug)}`,
    })))
    : `      <p class="seo-empty">${escapeHtml(t.noRadio)}</p>\n`;
  body += '      </section>\n';

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollegeOrUniversity',
    name: instName,
    ...(group.official?.website ? { url: group.official.website } : {}),
    address: {
      '@type': 'PostalAddress',
      addressRegion: 'QC',
      addressCountry: 'CA',
      ...(group.official?.region ? { addressLocality: group.official.region } : {}),
    },
    subOrganization: [
      ...group.papers.map((p) => ({ '@type': 'NewsMediaOrganization', name: p.name, ...(p.site ? { url: p.site } : {}) })),
      ...group.radios.map((r) => ({ '@type': 'RadioStation', name: r.fullName || r.name, ...(r.website ? { url: r.website } : {}) })),
    ],
  }).replace(/</g, '\\u003c');

  return {
    path,
    html: renderPage({
      lang, path, altPath, title, description, h1,
      eyebrow: t.institutions,
      crumbs: [
        { label: t.home, href: up },
        { label: t.directory, href: `${up}${ROUTES.directory[lang]}` },
        { label: instName },
      ],
      bodyHtml: body, jsonLd, siteBase: ctx.siteBase, updated: institutionUpdated(group, ctx),
    }),
    changefreq: 'weekly',
    priority: '0.7',
    lastmod: institutionUpdated(group, ctx),
  };
}

function directoryPage(model, lang, ctx) {
  const t = T[lang];
  const path = ROUTES.directory[lang];
  const altPath = ROUTES.directory[lang === 'fr' ? 'en' : 'fr'];
  const up = '../'.repeat(path.split('/').filter(Boolean).length);

  const description = fill(t.directoryDesc, {
    n: model.paperEntries.length,
    r: model.radioEntries.length,
  });

  let body = `      <p class="seo-lead">${escapeHtml(description)}</p>\n`;

  body += `      <section class="seo-section">\n        <h2>${escapeHtml(t.institutions)}</h2>\n`;
  body += cardGrid(model.groups
    .slice()
    .sort((a, b) => localizedInstitutionName(a, lang).localeCompare(localizedInstitutionName(b, lang), lang))
    .map((g) => ({
      name: localizedInstitutionName(g, lang),
      meta: lang === 'fr'
        ? `${plural(g.papers.length, 'journal', 'journaux')} · ${plural(g.radios.length, 'radio', 'radios')}`
        : `${plural(g.papers.length, 'newspaper', 'newspapers')} · ${plural(g.radios.length, 'radio', 'radios')}`,
      href: `${up}${ROUTES.institution[lang](g.slug)}`,
    })));
  body += '      </section>\n';

  body += `      <section class="seo-section">\n        <h2>${escapeHtml(t.newspapers)}</h2>\n`;
  body += cardGrid(model.paperEntries
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    .map((p) => ({
      name: p.name,
      meta: [p.group ? p.group.short : localizedInstitutionName(p.institution, lang), langLabel(p.lang, t)].filter(Boolean).join(' · '),
      href: `${up}${ROUTES.paper[lang](p.slug)}`,
    })));
  body += '      </section>\n';

  body += `      <section class="seo-section">\n        <h2>${escapeHtml(t.radios)}</h2>\n`;
  body += cardGrid(model.radioEntries
    .slice()
    .sort((a, b) => (a.fullName || a.name).localeCompare(b.fullName || b.name, 'fr'))
    .map((r) => ({
      name: r.fullName || r.name,
      meta: [r.group ? r.group.short : localizedInstitutionName(r.institution, lang), r.city].filter(Boolean).join(' · '),
      href: `${up}${ROUTES.radio[lang](r.slug)}`,
    })));
  body += '      </section>\n';

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t.directoryH1,
    description,
    inLanguage: lang === 'fr' ? 'fr-CA' : 'en-CA',
    about: {
      '@type': 'ItemList',
      numberOfItems: model.paperEntries.length + model.radioEntries.length,
      itemListElement: [
        ...model.paperEntries.map((p, i) => ({
          '@type': 'ListItem', position: i + 1, name: p.name,
          url: `${ctx.siteBase}/${ROUTES.paper[lang](p.slug)}`,
        })),
        ...model.radioEntries.map((r, i) => ({
          '@type': 'ListItem', position: model.paperEntries.length + i + 1,
          name: r.fullName || r.name,
          url: `${ctx.siteBase}/${ROUTES.radio[lang](r.slug)}`,
        })),
      ],
    },
  }).replace(/</g, '\\u003c');

  return {
    path,
    html: renderPage({
      lang, path, altPath,
      title: `${t.directoryTitle}`,
      description,
      h1: t.directoryH1,
      eyebrow: null,
      crumbs: [{ label: t.home, href: up }, { label: t.directory }],
      bodyHtml: body, jsonLd, siteBase: ctx.siteBase, updated: null,
    }),
    changefreq: 'weekly',
    priority: '0.9',
  };
}

/**
 * Hub des horaires — une entrée par station vers sa grille complète.
 *
 * Le syntoniseur renvoie déjà vers `/radios/<id>/#horaire` quand on clique sur
 * « À l'antenne », mais rien ne permettait de parcourir les grilles sans
 * d'abord syntoniser un poste. Cette page est le point d'entrée manquant ;
 * elle ne duplique pas les grilles, elle y mène.
 *
 * Les données viennent de `radio-schedules.json`, seule source alimentée par
 * les bots — cette page en est une vue, pas une source.
 */
function schedulesHubPage(model, lang, ctx) {
  const t = T[lang];
  const path = ROUTES.schedules[lang];
  const altPath = ROUTES.schedules[lang === 'fr' ? 'en' : 'fr'];
  const up = '../'.repeat(path.split('/').filter(Boolean).length);

  // Une station n'apparaît que si elle a réellement une grille : une carte
  // vide promettrait un horaire inexistant.
  const withGrid = model.radioEntries
    .map((r) => ({ radio: r, station: ctx.schedules?.[r.id] || null }))
    .filter((e) => Array.isArray(e.station?.grid) && e.station.grid.length)
    .sort((a, b) => (a.radio.fullName || a.radio.name)
      .localeCompare(b.radio.fullName || b.radio.name, 'fr'));

  const description = fill(t.schedulesDesc, { r: withGrid.length });

  let body = `      <p class="seo-lead">${escapeHtml(t.schedulesLead)}</p>\n`;

  if (!withGrid.length) {
    body += `      <p class="seo-empty">${escapeHtml(t.schedulesEmpty)}</p>\n`;
  } else {
    body += cardGrid(withGrid.map(({ radio, station }) => {
      const count = station.grid.length;
      const slots = `${count} ${count > 1 ? t.slotsCount : t.slotsCountOne}`;
      const collected = isoDay(station.checkedAt);
      return {
        name: radio.fullName || radio.name,
        meta: [
          radio.group ? radio.group.short : localizedInstitutionName(radio.institution, lang),
          slots,
          collected ? `${t.collectedOn} ${collected}` : '',
        ].filter(Boolean).join(' · '),
        href: `${up}${ROUTES.radio[lang](radio.slug)}#horaire`,
      };
    }));
  }

  body += `      <p class="seo-note">${escapeHtml(t.schedulesNote)}</p>\n`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t.schedulesH1,
    description,
    inLanguage: lang === 'fr' ? 'fr-CA' : 'en-CA',
    about: {
      '@type': 'ItemList',
      numberOfItems: withGrid.length,
      itemListElement: withGrid.map(({ radio }, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: radio.fullName || radio.name,
        url: `${ctx.siteBase}/${ROUTES.radio[lang](radio.slug)}#horaire`,
      })),
    },
  }).replace(/</g, '\\u003c');

  return {
    path,
    html: renderPage({
      lang, path, altPath,
      title: `${t.schedulesTitle} | LE-RADAR.ca`,
      description,
      h1: t.schedulesH1,
      eyebrow: t.radios,
      crumbs: [{ label: t.home, href: up }, { label: t.schedules }],
      bodyHtml: body, jsonLd, siteBase: ctx.siteBase, updated: null,
    }),
    changefreq: 'weekly',
    priority: '0.7',
  };
}

/** Page d'accueil du volet anglais : présentation du projet, pas le fil. */
function englishHomePage(model, ctx) {
  const t = T.en;
  const path = ROUTES.home.en;
  const altPath = ROUTES.home.fr;
  const up = '../';

  const title = 'LE-RADAR.ca — Québec student newspapers and campus radio';
  const description = `Student newspapers and campus radio stations from Québec CEGEPs and universities, gathered in one feed. ${model.paperEntries.length} publications, ${model.radioEntries.length} stations.`;

  let body = `      <p class="seo-lead">LE-RADAR.ca gathers the student newspapers and the campus radio stations of Québec’s CEGEPs and universities on a single page: a live radio tuner, and a continuously updated feed of student journalism.</p>\n`;

  body += `      <p>Articles stay on the site that published them. LE-RADAR.ca shows the headline, the byline and a short excerpt, then links straight to the original piece — so the newsroom that did the work gets the visit.</p>\n`;

  body += `      <p>Most student media in Québec publish in French, and a few publish in English (The Tribune at McGill, The Link and The Concordian at Concordia, The Plant at Dawson). The site includes an optional translation menu, so you can read the feed in your own language; clicking through still takes you to the article in its original language.</p>\n`;

  body += `      <p class="seo-cta"><a href="${up}">Open the live feed and radio tuner</a></p>\n`;

  body += `      <section class="seo-section">\n        <h2>${escapeHtml(t.institutions)}</h2>\n`;
  body += cardGrid(model.groups
    .slice()
    .sort((a, b) => localizedInstitutionName(a, 'en').localeCompare(localizedInstitutionName(b, 'en'), 'en'))
    .map((g) => ({
      name: localizedInstitutionName(g, 'en'),
      meta: `${plural(g.papers.length, 'newspaper', 'newspapers')} · ${plural(g.radios.length, 'radio', 'radios')}`,
      href: `${up}${ROUTES.institution.en(g.slug)}`,
    })));
  body += `      <p class="seo-cta"><a href="${up}${ROUTES.directory.en}">${escapeHtml(t.seeAll)}</a></p>\n`;
  body += '      </section>\n';

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    inLanguage: 'en-CA',
    isPartOf: { '@type': 'WebSite', name: 'LE-RADAR.ca', url: `${ctx.siteBase}/` },
    about: {
      '@type': 'Organization',
      name: 'LE-RADAR.ca',
      areaServed: { '@type': 'AdministrativeArea', name: 'Québec' },
    },
  }).replace(/</g, '\\u003c');

  return {
    path,
    html: renderPage({
      lang: 'en', path, altPath, title, description,
      h1: 'Québec student media, in English',
      eyebrow: null,
      crumbs: [{ label: t.home, href: up }, { label: 'English' }],
      bodyHtml: body, jsonLd, siteBase: ctx.siteBase, updated: null,
    }),
    changefreq: 'weekly',
    priority: '0.6',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  Entrée
// ═══════════════════════════════════════════════════════════════════════════

function buildEntityPages({ radios, sources, news, institutions, schedules, siteBase }) {
  const model = buildModel({ radios, sources, news, institutions });
  const ctx = { siteBase, schedules: schedules || {} };
  const pages = [];

  for (const lang of ['fr', 'en']) {
    pages.push(directoryPage(model, lang, ctx));
    pages.push(schedulesHubPage(model, lang, ctx));
    for (const radio of model.radioEntries) pages.push(radioPage(radio, lang, ctx));
    for (const paper of model.paperEntries) pages.push(paperPage(paper, lang, ctx));
    for (const group of model.groups) pages.push(institutionPage(group, lang, ctx));
  }
  pages.push(englishHomePage(model, ctx));

  return { pages, model };
}

module.exports = { buildEntityPages, ROUTES };

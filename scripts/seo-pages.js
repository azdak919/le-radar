/**
 * LE-RADAR.ca — Construction des pages d'entités (FR + EN).
 *
 * Assemble, à partir des registres maintenus par les bots :
 *   /radios/<id>/            /en/radios/<id>/
 *   /journaux/<slug>/        /en/newspapers/<slug>/
 *   /etablissements/<slug>/  /en/institutions/<slug>/
 *   /medias/                 /en/media/
 *   /horaires/               /en/schedules/
 *   /sports/                 /en/sports/
 *
 * Voir scripts/seo-pages-lib.js pour le gabarit et les chaînes bilingues,
 * et docs/referencement.md pour le pourquoi.
 */

const {
  T, escapeHtml, slugify, normKey, canonicalInstitution, localizedInstitutionName, isoDay,
  sportsUpdatedStamp,
  fill, frOf, frAt, plural, renderPage, factsList, headlineList, cardGrid, scheduleTable,
  scheduleContext, scheduleTodayDay,
} = require('./seo-pages-lib');
const { pruneSportsTeam } = require('./sports-freshness-lib');
const { resolveCurrentSlot, resolveNextSlot } = require('./radio-schedule-lib');

const HEADLINES_PER_PAPER = 12;
const STALE_SOURCE_NOTICE_MS = 14 * 24 * 60 * 60 * 1000;

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

/**
 * Une publication peut ne pas avoir publié depuis longtemps sans que son fil
 * soit délaissé. `_lastFetchOk` est écrit seulement après une vraie collecte
 * réussie (jamais après l'emploi d'un cache périmé), ce qui en fait la bonne
 * donnée à montrer séparément de la date du dernier article.
 */
function paperLastSuccessfulCheck(paper) {
  const checked = paper?._lastFetchOk;
  return checked && !Number.isNaN(new Date(checked).getTime()) ? checked : null;
}

function latestArticleTimestamp(paper) {
  const value = paper?.headlines?.[0]?.date;
  const timestamp = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function shouldExplainStaleSource(paper, checkedAt) {
  const latest = latestArticleTimestamp(paper);
  const checked = checkedAt ? new Date(checkedAt).getTime() : NaN;
  return Number.isFinite(latest)
    && Number.isFinite(checked)
    && checked - latest >= STALE_SOURCE_NOTICE_MS;
}

function localDateTime(value, lang) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const locale = lang === 'en' ? 'en-CA' : 'fr-CA';
  const label = new Intl.DateTimeFormat(locale, {
    timeZone: 'America/Toronto',
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
  return lang === 'fr' ? label.replace(',', ' à') : label;
}

function localDateOnly(value, lang) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-CA' : 'fr-CA', {
    timeZone: 'America/Toronto',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** Dernier article connu : manchette du fil, sinon date de registre. */
function paperLatestRaw(paper) {
  return paper?.headlines?.[0]?.date || paper?._lastItemDate || null;
}

function paperLatestMs(paper) {
  const t = Date.parse(paperLatestRaw(paper) || 0);
  return Number.isFinite(t) ? t : 0;
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

function directoryUpdated(model, ctx) {
  const dates = [
    ...model.paperEntries.map((p) => isoDay(paperLatestRaw(p))),
    ...model.radioEntries.map((r) => radioUpdated(r, ctx)),
  ].filter(Boolean);
  return dates.length ? dates.sort().at(-1) : null;
}

function institutionKind(group) {
  const type = group?.official?.type || group?.type || '';
  if (type === 'universite' || type === 'university') return 'university';
  if (type === 'cegep' || type === 'college') return 'cegep';
  // Repli sur le nom : certains groupes n’ont pas encore de type officiel.
  const name = `${group?.name || ''} ${group?.nameFr || ''}`;
  if (/c[ée]gep|coll[eè]ge|college|dawson|champlain|vanier|ahuntsic/i.test(name)) return 'cegep';
  return 'university';
}

/** Chemins jumeaux FR/EN d'un même contenu. */
const ROUTES = {
  directory: { fr: 'medias/', en: 'en/media/' },
  schedules: { fr: 'horaires/', en: 'en/schedules/' },
  sports: { fr: 'sports/', en: 'en/sports/' },
  radio: { fr: (s) => `radios/${s}/`, en: (s) => `en/radios/${s}/` },
  paper: { fr: (s) => `journaux/${s}/`, en: (s) => `en/newspapers/${s}/` },
  institution: { fr: (s) => `etablissements/${s}/`, en: (s) => `en/institutions/${s}/` },
  home: { fr: '', en: 'en/' },
};

/*
 * Glyphes sport — priorite pratiquants :
 * l’emoji « métier » du sport d’abord (même s’il se répète un peu).
 * Soccer / intérieur / futsal → ⚽ ; athlé / cross → 🏃.
 * La différenciation se fait par libellé + couleur de section, pas par un
 * symbole abstrait (🏟️ 🌲 🥅) peu reconnu sur le terrain.
 */
const SPORT_GLYPH = {
  hockey: '🏒',
  football: '🏈',
  soccer: '⚽',
  'soccer-interieur': '⚽',
  basketball: '🏀',
  volleyball: '🏐',
  rugby: '🏉',
  'flag-football': '🚩',
  futsal: '⚽',
  baseball: '⚾',
  sailing: '⛵',
  badminton: '🏸',
  athletisme: '🏃',
  'cross-country': '🏃',
  natation: '🏊',
  golf: '⛳',
  cheerleading: '📣',
  ultimate: '🥏',
  tennis: '🎾',
  ski: '⛷️',
  'ski-de-fond': '⛷️',
  handball: '🤾',
};
const SPORT_TONE = {
  hockey: '#0b3d91',
  football: '#6b4f2a',
  soccer: '#1a7a4c',
  'soccer-interieur': '#15803d',
  basketball: '#c45c26',
  volleyball: '#6c2163',
  rugby: '#7c2d12',
  'flag-football': '#854d0e',
  futsal: '#166534',
  baseball: '#9a3412',
  sailing: '#0e7490',
  badminton: '#0f766e',
  athletisme: '#b45309',
  'cross-country': '#92400e',
  natation: '#0369a1',
  golf: '#15803d',
  cheerleading: '#be185d',
  ultimate: '#7c3aed',
};
/* Popularité campus QC (cégep/univ.) — sports d’équipe vitrine d’abord, puis autres disciplines RSEQ. */
const SPORT_ORDER = [
  'hockey',
  'football',
  'soccer',
  'basketball',
  'volleyball',
  'rugby',
  'flag-football',
  'soccer-interieur',
  'futsal',
  'baseball',
  'badminton',
  'natation',
  'athletisme',
  'cross-country',
  'golf',
  'cheerleading',
  'ultimate',
  'sailing',
];

// Liens de repérage local : une seule table évite de répéter des URL dans les
// registres des médias et reste utilisable quand une nouvelle radio arrive.
// Les régions administratives et touristiques ne coïncident pas toujours :
// l'URL pointe donc vers l'organisme touristique mandaté pour le territoire.
const GEO_LINKS = {
  city: {
    'Montréal': { fr: 'https://montreal.ca/', en: 'https://montreal.ca/en' },
    'Québec': { fr: 'https://www.ville.quebec.qc.ca/?lang=fr', en: 'https://www.ville.quebec.qc.ca/?lang=en' },
    'Sherbrooke': { fr: 'https://www.sherbrooke.ca/fr/', en: 'https://www.sherbrooke.ca/en/' },
  },
  region: {
    'Abitibi-Témiscamingue': { fr: 'https://www.tourismeabitibi-temiscamingue.org/', en: 'https://www.tourismeabitibi-temiscamingue.org/en/' },
    'Bas-Saint-Laurent': { fr: 'https://www.tourismebsl.com/', en: 'https://www.tourismebsl.com/en/' },
    'Capitale-Nationale': { fr: 'https://www.quebec-cite.com/fr', en: 'https://www.quebec-cite.com/en' },
    'Centre-du-Québec': { fr: 'https://www.tourismecentreduquebec.com/', en: 'https://www.tourismecentreduquebec.com/en/' },
    'Chaudière-Appalaches': { fr: 'https://www.tourismechaudiereappalaches.com/', en: 'https://www.tourismechaudiereappalaches.com/en/' },
    'Côte-Nord': { fr: 'https://www.tourismecote-nord.com/', en: 'https://www.tourismecote-nord.com/en/' },
    'Estrie': { fr: 'https://www.cantonsdelest.com/', en: 'https://www.easterntownships.org/' },
    'Gaspésie–Îles-de-la-Madeleine': { fr: 'https://www.tourisme-gaspesie.com/', en: 'https://www.tourisme-gaspesie.com/en/' },
    'Lanaudière': { fr: 'https://lanaudiere.ca/', en: 'https://lanaudiere.ca/en/' },
    'Laurentides': { fr: 'https://www.laurentides.com/', en: 'https://www.laurentides.com/en/' },
    'Laval': { fr: 'https://www.tourismelaval.com/', en: 'https://www.tourismelaval.com/en/' },
    'Mauricie': { fr: 'https://www.tourismemauricie.com/', en: 'https://www.tourismemauricie.com/en/' },
    'Montréal': { fr: 'https://www.mtl.org/fr', en: 'https://www.mtl.org/en' },
    'Montérégie': { fr: 'https://www.tourisme-monteregie.qc.ca/', en: 'https://www.tourisme-monteregie.qc.ca/en/' },
    'Outaouais': { fr: 'https://www.tourismeoutaouais.com/', en: 'https://www.tourismeoutaouais.com/en/' },
    'Saguenay–Lac-Saint-Jean': { fr: 'https://www.saguenaylacsaintjean.ca/', en: 'https://www.saguenaylacsaintjean.ca/en/' },
  },
};

function geoFact(kind, value, lang, label) {
  const href = GEO_LINKS[kind]?.[value]?.[lang];
  if (!href) return { label, value };
  const destination = kind === 'city'
    ? (lang === 'fr' ? `Ville de ${value} — site officiel` : `City of ${value} — official website`)
    : (lang === 'fr' ? `Tourisme ${value} — site officiel` : `${value} tourism — official website`);
  return { label, value, href, external: true, ariaLabel: destination };
}

/**
 * Un nouveau média ne doit pas produire silencieusement une fiche avec une
 * ville ou une région devenue du texte mort. Les robots peuvent ajouter des
 * entrées aux registres; cette garde bloque la génération tant que le lien
 * officiel correspondant n'a pas été choisi et inscrit dans GEO_LINKS.
 */
function assertGeoLinkCoverage(model, institutions = []) {
  const missing = [];
  const requiresBothLanguages = (kind, value, label) => {
    if (!value) return;
    const link = GEO_LINKS[kind]?.[value];
    if (!link?.fr || !link?.en) missing.push(`${label} (${value})`);
  };

  for (const radio of model.radioEntries) {
    requiresBothLanguages('city', radio.city, `ville de ${radio.fullName || radio.name}`);
    requiresBothLanguages('region', radio.region, `région de ${radio.fullName || radio.name}`);
  }
  for (const paper of model.paperEntries) {
    requiresBothLanguages('region', paper.region, `région de ${paper.name}`);
  }
  for (const group of model.groups) {
    requiresBothLanguages('region', group.official?.region, `région de ${group.name}`);
  }
  for (const institution of institutions) {
    requiresBothLanguages('region', institution.region, `région de ${institution.name}`);
  }

  if (missing.length) {
    throw new Error(
      `Liens géographiques manquants dans GEO_LINKS : ${missing.join(', ')}. `
      + 'Ajouter les URL officielles FR et EN avant de générer les pages.',
    );
  }
}

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
    geoFact('city', radio.city, lang, t.city),
    geoFact('region', radio.region, lang, t.region),
    { label: t.officialSite, value: radio.website, href: radio.website, external: true },
  ]);

  body += `      <p class="seo-cta"><a href="${up}${ROUTES.schedules[lang]}">${escapeHtml(t.browseSchedules)}</a></p>\n`;
  body += scheduleTable(ctx.schedules?.[radio.id]?.grid, t, {
    checkedAt: ctx.schedules?.[radio.id]?.checkedAt,
    verifiedWeekOf: ctx.schedules?.[radio.id]?.verifiedWeekOf,
    stationId: radio.id,
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
  // Un journal n'a pas nécessairement de slogan public. Le qualificatif
  // générique du gabarit n'en est pas un et ne doit surtout pas se greffer au
  // nom propre, encore moins dans une autre langue que celle du média.
  const h1 = paper.name;
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
      ? `${paper.name} est le journal étudiant ${frOf(instName)}.`
      : `${paper.name} is the student newspaper of ${instName}.`,
  )}</p>\n`;

  body += factsList([
    { label: t.institution, value: instName, href: paper.group ? `${up}${ROUTES.institution[lang](paper.group.slug)}` : null },
    geoFact('region', paper.region, lang, t.region),
    { label: t.language, value: langLabel(paper.lang, t) },
    { label: t.officialSite, value: paper.site, href: paper.site, external: true },
  ]);

  const latestLabel = localDateTime(paper.headlines?.[0]?.date, lang);
  const lastCheck = paperLastSuccessfulCheck(paper);
  const lastCheckLabel = localDateTime(lastCheck, lang);
  const sourceHome = `${up}${lang === 'en' ? 'en/' : ''}?source=${encodeURIComponent(paper.name)}#news-list`;
  const archivePath = ctx.archivePaths?.get(paper.name);
  const hasRecentHeadlines = Array.isArray(paper.headlines) && paper.headlines.length > 0;
  // Même squelette pour toutes les sources : « Derniers articles », puis soit
  // la liste, soit un vide qui cite la fenêtre de fraîcheur (3 sessions univ.),
  // puis une rangée de CTA (récents et/ou archives).
  body += `      <section class="seo-section">\n        <h2>${escapeHtml(t.latestHeadlines)}</h2>\n`;
  if (hasRecentHeadlines) {
    body += (latestLabel ? `        <p class="seo-headlines__status">${escapeHtml(fill(t.latestArticleStatus, { date: latestLabel }))}`
      + (lastCheckLabel && shouldExplainStaleSource(paper, lastCheck)
        ? ` · ${escapeHtml(fill(t.sourceStaleStatus, { date: lastCheckLabel }))}`
        : '')
      + '</p>\n' : '');
    body += headlineList(paper.headlines, t);
  } else {
    body += `        <p class="seo-empty">${escapeHtml(t.noRecentInWindow)}</p>\n`;
  }
  if (hasRecentHeadlines || archivePath) {
    body += '        <div class="seo-source-actions">\n';
    if (hasRecentHeadlines) {
      body += `          <p class="seo-cta seo-cta--source"><a href="${escapeHtml(sourceHome)}" data-news-source="${escapeHtml(paper.name)}">${escapeHtml(t.allRecentArticles)}</a></p>\n`;
    }
    if (archivePath) {
      const archiveClass = hasRecentHeadlines
        ? 'seo-cta seo-cta--secondary seo-cta--source'
        : 'seo-cta seo-cta--source';
      body += `          <p class="${archiveClass}"><a href="${up}${escapeHtml(archivePath)}">${escapeHtml(t.viewArchives)}</a></p>\n`;
    }
    body += '        </div>\n';
  }
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
    geoFact('region', group.official?.region, lang, t.region),
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

function sortPapersByFreshness(papers) {
  return papers.slice().sort((a, b) => {
    const delta = paperLatestMs(b) - paperLatestMs(a);
    if (delta) return delta;
    return a.name.localeCompare(b.name, 'fr');
  });
}

function paperDirectoryCard(paper, lang, t, up) {
  const latest = localDateOnly(paperLatestRaw(paper), lang);
  const meta = [
    paper.group ? paper.group.short : localizedInstitutionName(paper.institution, lang),
    langLabel(paper.lang, t),
    latest ? fill(t.latestArticleStatus, { date: latest }) : null,
  ].filter(Boolean).join(' · ');
  return {
    name: paper.name,
    meta,
    href: `${up}${ROUTES.paper[lang](paper.slug)}`,
  };
}

function institutionDirectoryCard(group, lang, t, up) {
  return {
    name: localizedInstitutionName(group, lang),
    meta: lang === 'fr'
      ? `${plural(group.papers.length, 'journal', 'journaux')} · ${plural(group.radios.length, 'radio', 'radios')}`
      : `${plural(group.papers.length, 'newspaper', 'newspapers')} · ${plural(group.radios.length, 'radio', 'radios')}`,
    href: `${up}${ROUTES.institution[lang](group.slug)}`,
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

  const papersFr = sortPapersByFreshness(model.paperEntries.filter((p) => p.lang !== 'en'));
  const papersEn = sortPapersByFreshness(model.paperEntries.filter((p) => p.lang === 'en'));
  const groupsUni = model.groups
    .filter((g) => institutionKind(g) === 'university')
    .sort((a, b) => localizedInstitutionName(a, lang).localeCompare(localizedInstitutionName(b, lang), lang));
  const groupsCegep = model.groups
    .filter((g) => institutionKind(g) === 'cegep')
    .sort((a, b) => localizedInstitutionName(a, lang).localeCompare(localizedInstitutionName(b, lang), lang));

  let body = `      <p class="seo-lead">${escapeHtml(description)}</p>\n`;

  body += `      <nav class="seo-toc" aria-label="${escapeHtml(t.directoryToc)}">\n`
    + `        <p class="seo-toc__label">${escapeHtml(t.directoryToc)}</p>\n`
    + '        <ul class="seo-toc__list">\n'
    + `          <li><a href="#journaux">${escapeHtml(t.newspapers)}</a></li>\n`
    + `          <li><a href="#radios">${escapeHtml(t.radios)}</a></li>\n`
    + `          <li><a href="#etablissements">${escapeHtml(t.institutions)}</a></li>\n`
    + `          <li><a href="#archives">${escapeHtml(t.archives)}</a></li>\n`
    + '        </ul>\n'
    + '      </nav>\n';

  // ── Journaux (par langue, tri fraîcheur) ──
  body += `      <section class="seo-section" id="journaux">\n        <h2>${escapeHtml(t.newspapers)}</h2>\n`;
  body += `        <p class="seo-section__lead">${escapeHtml(t.directoryNewspapersLead)}</p>\n`;
  if (papersFr.length) {
    body += `        <h3>${escapeHtml(t.french)}</h3>\n`;
    body += cardGrid(papersFr.map((p) => paperDirectoryCard(p, lang, t, up)));
  }
  if (papersEn.length) {
    body += `        <h3>${escapeHtml(t.english)}</h3>\n`;
    body += cardGrid(papersEn.map((p) => paperDirectoryCard(p, lang, t, up)));
  }
  body += '      </section>\n';

  // ── Radios ──
  body += `      <section class="seo-section" id="radios">\n        <h2>${escapeHtml(t.radios)}</h2>\n`;
  body += `        <p class="seo-section__lead">${escapeHtml(t.directoryRadiosLead)}</p>\n`;
  body += `        <p class="seo-cta"><a href="${up}${ROUTES.schedules[lang]}">${escapeHtml(t.browseSchedulesCta)}</a></p>\n`;
  body += cardGrid(model.radioEntries
    .slice()
    .sort((a, b) => (a.fullName || a.name).localeCompare(b.fullName || b.name, 'fr'))
    .map((r) => ({
      name: r.fullName || r.name,
      meta: [
        r.group ? r.group.short : localizedInstitutionName(r.institution, lang),
        r.frequency || null,
        r.city,
      ].filter(Boolean).join(' · '),
      href: `${up}${ROUTES.radio[lang](r.slug)}`,
    })));
  body += '      </section>\n';

  // ── Établissements (universités / cégeps) ──
  body += `      <section class="seo-section" id="etablissements">\n        <h2>${escapeHtml(t.institutions)}</h2>\n`;
  body += `        <p class="seo-section__lead">${escapeHtml(t.directoryInstitutionsLead)}</p>\n`;
  if (groupsUni.length) {
    body += `        <h3>${escapeHtml(t.universities)}</h3>\n`;
    body += cardGrid(groupsUni.map((g) => institutionDirectoryCard(g, lang, t, up)));
  }
  if (groupsCegep.length) {
    body += `        <h3>${escapeHtml(t.cegepsColleges)}</h3>\n`;
    body += cardGrid(groupsCegep.map((g) => institutionDirectoryCard(g, lang, t, up)));
  }
  body += '      </section>\n';

  // ── Archives ──
  body += `      <section class="seo-section" id="archives">\n        <h2>${escapeHtml(t.archives)}</h2>\n`;
  body += `        <p class="seo-section__lead">${escapeHtml(t.directoryArchivesLead)}</p>\n`;
  body += `        <p class="seo-cta"><a href="${up}archives/">${escapeHtml(t.browseArchivesCta)}</a></p>\n`;
  body += '      </section>\n';

  // JSON-LD : journaux par fraîcheur globale, puis radios.
  const papersOrdered = sortPapersByFreshness(model.paperEntries);
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
        ...papersOrdered.map((p, i) => ({
          '@type': 'ListItem', position: i + 1, name: p.name,
          url: `${ctx.siteBase}/${ROUTES.paper[lang](p.slug)}`,
        })),
        ...model.radioEntries.map((r, i) => ({
          '@type': 'ListItem', position: papersOrdered.length + i + 1,
          name: r.fullName || r.name,
          url: `${ctx.siteBase}/${ROUTES.radio[lang](r.slug)}`,
        })),
      ],
    },
  }).replace(/</g, '\\u003c');

  const updated = directoryUpdated(model, ctx);
  return {
    path,
    html: renderPage({
      lang, path, altPath,
      title: `${t.directoryTitle}`,
      description,
      h1: t.directoryH1,
      eyebrow: null,
      crumbs: [{ label: t.home, href: up }, { label: t.directory }],
      bodyHtml: body, jsonLd, siteBase: ctx.siteBase, updated,
    }),
    changefreq: 'daily',
    priority: '0.9',
    lastmod: updated,
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
function formatHubRange(slot) {
  if (!slot?.start) return '';
  return slot.end
    ? `${slot.start}<span class="seo-slot__dash" aria-hidden="true">–</span>${slot.end}`
    : escapeHtml(slot.start);
}

function formatHubWhen(slot, todayDay, t) {
  const range = formatHubRange(slot);
  if (!range || slot.day === todayDay) return range;
  const raw = t.days[slot.day] || '';
  const dayName = t.lang === 'fr-CA' ? raw.toLowerCase() : raw;
  return dayName ? `${escapeHtml(dayName)} ${range}` : range;
}

/**
 * Cartes du hub horaires : campus + émission en cours ou à venir.
 * Le volume de créneaux et la date ISO n'aident pas à choisir une radio.
 */
function scheduleHubCards(entries, t, lang, up) {
  const todayDay = scheduleTodayDay();
  const items = entries.map(({ radio, station }) => {
    const name = radio.fullName || radio.name;
    const campus = radio.group
      ? radio.group.short
      : localizedInstitutionName(radio.institution, lang);
    const freq = radio.frequency || '';
    const showFreq = freq && !String(name).includes(freq);
    const place = [showFreq ? freq : null, campus, radio.city].filter(Boolean).join(' · ');
    const live = resolveCurrentSlot(station.grid);
    const next = live ? null : resolveNextSlot(station.grid);
    const air = live || next;
    const liveState = live ? 'live' : (next ? 'upcoming' : '');
    const kicker = live ? t.scheduleLive : (next ? t.scheduleUpcoming : '');
    const href = `${up}${ROUTES.radio[lang](radio.slug)}#horaire`;
    let airHtml = '';
    if (air) {
      airHtml = `<span class="seo-radio-card__now" data-schedule-air data-air-state="${liveState}">`
        + `<span class="seo-radio-card__kicker">${escapeHtml(kicker)}</span>`
        + `<span class="seo-radio-card__show">${escapeHtml(air.title)}</span>`
        + `<span class="seo-radio-card__when">${formatHubWhen(air, todayDay, t)}</span>`
        + '</span>';
    }
    return `        <li class="seo-radio-card"${radio.id ? ` data-schedule-station="${escapeHtml(radio.id)}"` : ''}${liveState ? ` data-air-state="${liveState}"` : ''}>\n`
      + `          <a href="${escapeHtml(href)}">`
      + `<span class="seo-radio-card__name">${escapeHtml(name)}</span>`
      + (place ? `<span class="seo-radio-card__place">${escapeHtml(place)}</span>` : '')
      + airHtml
      + '</a>\n        </li>';
  });
  return `      <ul class="seo-radio-cards">\n${items.join('\n')}\n      </ul>\n`;
}

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
    const latestChecked = withGrid.reduce((max, { station }) => {
      const stamp = station.checkedAt;
      if (!stamp) return max;
      return !max || stamp > max ? stamp : max;
    }, null);
    body += scheduleContext(latestChecked, null, t);
    body += scheduleHubCards(withGrid, t, lang, up);
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

function formatSportsDate(iso, lang) {
  if (!iso) return '';
  try {
    const d = new Date(`${iso}T12:00:00`);
    const year = d.getFullYear();
    const nowY = new Date().getFullYear();
    // Année affichée si ≠ année civile courante (évite « 25 avr. » ambigu hors saison).
    const opts = {
      timeZone: 'America/Toronto',
      day: 'numeric',
      month: 'short',
    };
    if (year !== nowY) opts.year = 'numeric';
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-CA' : 'fr-CA', opts).format(d);
  } catch {
    return iso;
  }
}

/** Libellés sport localisés (filtres + meta carte). */
const SPORT_LABEL_I18N = {
  fr: {
    hockey: 'Hockey',
    football: 'Football',
    soccer: 'Soccer',
    'soccer-interieur': 'Soccer intérieur',
    basketball: 'Basketball',
    volleyball: 'Volleyball',
    rugby: 'Rugby',
    'flag-football': 'Flag-football',
    futsal: 'Futsal',
    baseball: 'Baseball',
    badminton: 'Badminton',
    natation: 'Natation',
    athletisme: 'Athlétisme',
    'cross-country': 'Cross-country',
    golf: 'Golf',
    cheerleading: 'Cheerleading',
    ultimate: 'Ultimate',
    sailing: 'Voile',
  },
  en: {
    hockey: 'Hockey',
    football: 'Football',
    soccer: 'Soccer',
    'soccer-interieur': 'Indoor soccer',
    basketball: 'Basketball',
    volleyball: 'Volleyball',
    rugby: 'Rugby',
    'flag-football': 'Flag football',
    futsal: 'Futsal',
    baseball: 'Baseball',
    badminton: 'Badminton',
    natation: 'Swimming',
    athletisme: 'Track & field',
    'cross-country': 'Cross-country',
    golf: 'Golf',
    cheerleading: 'Cheerleading',
    ultimate: 'Ultimate',
    sailing: 'Sailing',
  },
};

function sportsSportLabel(teamOrSport, t, lang) {
  const sport = typeof teamOrSport === 'string'
    ? teamOrSport
    : (teamOrSport?.sport || '');
  if (sport === 'hockey') return t.sportsHockeyLabel;
  if (sport === 'sailing') return t.sportsSailingLabel;
  const table = SPORT_LABEL_I18N[lang === 'en' ? 'en' : 'fr'] || {};
  if (table[sport]) return table[sport];
  if (typeof teamOrSport === 'object' && teamOrSport?.sportLabel) {
    return teamOrSport.sportLabel;
  }
  return sport;
}

function formatSportsClock(time, lang) {
  if (!time) return '';
  return String(time).replace(':', lang === 'en' ? ':' : ' h ');
}

/** HTML date (+ heure empilée) pour aligner les colonnes avec les lignes de score. */
function formatSportsTimeHtml(date, time, lang) {
  const day = formatSportsDate(date, lang) || date || '';
  const clock = formatSportsClock(time, lang);
  if (clock) {
    return `<span class="sports-result__day">${escapeHtml(day)}</span><span class="sports-result__clock">${escapeHtml(clock)}</span>`;
  }
  return escapeHtml(day);
}

/** Normalise sex → 'F' | 'M' | 'X' | '' */
function sportsSexKey(sex) {
  const s = String(sex || '').toUpperCase().trim();
  if (s === 'F' || s === 'W' || s === 'WOMEN' || s === 'FEMININ' || s === 'FÉMININ') return 'F';
  if (s === 'M' || s === 'MEN' || s === 'MASCULIN') return 'M';
  if (
    s === 'X'
    || s === 'MIXTE'
    || s === 'MIXED'
    || s === 'COED'
    || s === 'CO-ED'
    || s === 'OPEN'
    || s === 'OUVERT'
  ) return 'X';
  return '';
}

/**
 * Sexe effectif d’une formation pour filtres / data-sex.
 * Voile campus QC (ICSA, associations) : équipages ouverts — pas de tableau F/M RSEQ.
 * (focus-group 2026-07-30 : catégorie Mixte + voile vérifiée.)
 */
function sportsEffectiveSexKey(team) {
  const key = sportsSexKey(team?.sex);
  if (key) return key;
  if (String(team?.sport || '').toLowerCase() === 'sailing') return 'X';
  return '';
}

/** Libellé lisible (pas seulement « F » / « M » — trop facile à rater). */
function sportsSexLabel(sex, t, lang) {
  const key = sportsSexKey(sex) || (sex === 'X' ? 'X' : '');
  if (key === 'F') return t.sportsWomen;
  if (key === 'M') return t.sportsMen;
  if (key === 'X') return t.sportsMixed;
  if (!sex) return '';
  return String(sex);
}

function sportsSectorLabel(sector, t) {
  if (sector === 'collegial') return t.sportsCollegial;
  if (sector === 'universitaire') return t.sportsUniversity;
  return sector || '';
}

/**
 * Catégorie mise en avant par sport (popularité campus QC).
 * Sources : culture médiatique QC + effectifs RSEQ typiques.
 *  - hockey : masculin (largement plus suivi ; ~3× plus d’équipes)
 *  - football : masculin (discipline varsity H)
 *  - basketball : masculin légèrement devant (effectifs + vitrine)
 *  - soccer : féminin au moins aussi fort en collégial/univ. (souvent plus d’équipes)
 *  - volleyball : féminin (effectifs + médiatisation campus)
 *  - rugby : masculin par tradition (parité d’équipes)
 *  - flag-football : féminin (RSEQ = F)
 * null = décider selon l’effectif du payload (auto).
 */
const SPORT_SEX_LEAD = {
  hockey: 'M',
  football: 'M',
  basketball: 'M',
  soccer: 'F',
  'soccer-interieur': 'F',
  volleyball: 'F',
  rugby: 'M',
  'flag-football': 'F',
  futsal: 'M',
  baseball: 'M',
  sailing: null,
  badminton: null, // souvent mixte
  athletisme: 'M',
  'cross-country': 'M',
  natation: 'F',
  golf: 'M',
  cheerleading: null, // mixte
  ultimate: null,
};

/** Catégorie en tête pour un sport (override + auto sur effectifs). */
function sportsSexLead(sport, teamsForSport = []) {
  const fixed = SPORT_SEX_LEAD[sport];
  if (fixed === 'F' || fixed === 'M') return fixed;
  let f = 0;
  let m = 0;
  for (const team of teamsForSport) {
    const k = sportsSexKey(team.sex);
    if (k === 'F') f += 1;
    else if (k === 'M') m += 1;
  }
  if (f > m) return 'F';
  if (m > f) return 'M';
  // Égalité / inconnu : masculin par défaut (sauf sports 100 % F déjà couverts).
  return 'M';
}

/** Rang de tri sexe dans un sport : 0 = catégorie la plus populaire, 1 = l’autre, 2 = n.d. */
function sportsSexSortRank(sex, lead = 'M') {
  const key = sportsSexKey(sex);
  if (!key) return 2;
  if (key === lead) return 0;
  return 1;
}

/** Ordre des sous-groupes F/M pour un sport. */
function sportsSexGroupOrder(lead) {
  return lead === 'F' ? ['F', 'M', ''] : ['M', 'F', ''];
}

/** Fenêtre visuelle « en cours » — mêmes bornes que app.js (CTA). */
const SPORTS_LIVE_VISUAL_LEAD_MS = 15 * 60 * 1000;
const SPORTS_LIVE_VISUAL_TAIL_MS = 3 * 3600 * 1000;

function sportsNextIsLive(game, now = Date.now()) {
  if (!game) return false;
  if (game.live === true) return true;
  const ts = sportsNextGameTs({ nextGame: game });
  if (!Number.isFinite(ts) || ts === Number.POSITIVE_INFINITY) return false;
  return ts <= now + SPORTS_LIVE_VISUAL_LEAD_MS && ts >= now - SPORTS_LIVE_VISUAL_TAIL_MS;
}

/** Timestamp prochain match (ms) — Infinity si aucun (va en bas). */
function sportsNextGameTs(team) {
  const g = team?.nextGame;
  if (!g || !g.date) return Number.POSITIVE_INFINITY;
  const rawTime = String(g.time || '23:59').replace(/\s*h\s*/i, ':').replace(/[^\d:]/g, '');
  const parts = rawTime.split(':').map((n) => parseInt(n, 10));
  const hh = Number.isFinite(parts[0]) ? parts[0] : 23;
  const mm = Number.isFinite(parts[1]) ? parts[1] : 59;
  const iso = `${g.date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : Number.POSITIVE_INFINITY;
}

/** Timestamp dernier match (ms) — -Infinity si aucun (après les « à venir »). */
function sportsLastGameTs(team) {
  const g = team?.lastGame;
  if (!g || !g.date) return Number.NEGATIVE_INFINITY;
  const ts = Date.parse(`${g.date}T12:00:00`);
  return Number.isFinite(ts) ? ts : Number.NEGATIVE_INFINITY;
}

/**
 * Tri des cartes dans un sport (vue « Tous ») :
 * 1. Prochain match le plus proche en premier (H/F indifférent)
 * 2. Sinon résultat le plus récent
 * 3. Nom
 */
function compareSportsTeamsBySchedule(a, b) {
  const na = sportsNextGameTs(a);
  const nb = sportsNextGameTs(b);
  if (na !== nb) return na - nb;
  const la = sportsLastGameTs(a);
  const lb = sportsLastGameTs(b);
  if (la !== lb) return lb - la; // plus récent d’abord
  return String(a.name || '').localeCompare(String(b.name || ''), 'fr');
}

function sportsResultRows(team, t, lang) {
  const rows = [];
  const isSailing = team.sport === 'sailing';
  /** Adversaire : surnom en 1ʳᵉ si connu (identité d’équipe), sinon nom court. */
  const formatOpp = (game) => {
    const short = game.opponent || game.opponentCode || '—';
    const full = game.opponentFullName && game.opponentFullName !== short
      ? game.opponentFullName
      : '';
    const nick = game.opponentNickname && game.opponentNickname !== short
      ? game.opponentNickname
      : '';
    let html;
    if (nick) {
      html = `<span class="sports-result__opp">${escapeHtml(nick)}</span>`
        + ` <span class="sports-result__opp-school">${escapeHtml(short)}</span>`;
    } else {
      html = `<span class="sports-result__opp">${escapeHtml(short)}</span>`;
    }
    if (full && full !== short && full !== nick) {
      html += `<span class="sports-result__opp-full">${escapeHtml(full)}</span>`;
    }
    return html;
  };
  const formatTitle = (game, opp, venueHtml = '') => {
    const href = game.url && /^https?:\/\//i.test(game.url) ? game.url : '';
    const tip = [game.opponent, game.opponentFullName, t.sportsOpenGame].filter(Boolean).join(' — ');
    const vs = isSailing
      ? `<span class="sports-result__vs">${escapeHtml(t.sportsRegatta)}</span>`
      : '<span class="sports-result__vs">vs</span>';
    const inner = `${vs} ${opp}${venueHtml}`;
    return href
      ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(tip)}">${inner}</a>`
      : inner;
  };
  const last = team.lastGame;
  if (last) {
    const badge = last.result === 'W' ? 'V' : last.result === 'L' ? 'D' : 'N';
    const label = last.result === 'W' ? t.sportsWin : last.result === 'L' ? t.sportsLoss : t.sportsDraw;
    const opp = formatOpp(last);
    const placeKind = last.scoreKind === 'place' || isSailing;
    const score = placeKind && last.scoreFor != null && last.scoreAgainst != null
      ? `${last.scoreFor}/${last.scoreAgainst}`
      : `${last.scoreFor}–${last.scoreAgainst}`;
    const scoreAria = placeKind
      ? `${t.sportsPlace} ${last.scoreFor} / ${last.scoreAgainst} · ${label}`
      : label;
    const when = formatSportsDate(last.date, lang);
    const prior = !!(last.priorSeason || team.lastGamePriorSeason);
    const priorClass = prior ? ' sports-result--prior-season' : '';
    const priorMeta = prior
      ? `\n  <span class="sports-result__season-meta">${escapeHtml(t.sportsPriorSeason)}</span>`
      : '';
    rows.push(`<li class="sports-result sports-result--${escapeHtml(last.result || 'D')}${priorClass}" data-result="${escapeHtml(last.result || 'D')}"${prior ? ' data-prior-season="1"' : ''}>
  <time class="sports-result__time" datetime="${escapeHtml(last.date || '')}">${escapeHtml(when)}</time>
  <span class="sports-result__score" aria-label="${escapeHtml(scoreAria)}">${escapeHtml(score)}</span>
  <span class="sports-result__title">${formatTitle(last, opp)}</span>
  <span class="sports-result__badge" title="${escapeHtml(label)}">${badge}</span>${priorMeta}
</li>`);
  }
  const next = team.nextGame;
  if (next) {
    const live = sportsNextIsLive(next);
    const timeHtml = live && next.period
      ? `<span class="sports-result__day">${escapeHtml(formatSportsDate(next.date, lang) || next.date || '')}</span><span class="sports-result__clock">${escapeHtml(next.period)}</span>`
      : formatSportsTimeHtml(next.date, next.time, lang);
    const opp = formatOpp(next);
    const venue = next.home === false
      ? `<span class="sports-result__venue">${escapeHtml(t.sportsAway)}</span>`
      : next.home
        ? `<span class="sports-result__venue">${escapeHtml(t.sportsHome)}</span>`
        : '';
    if (live) {
      const liveLabel = t.sportsLive || 'En cours';
      const hasScore = next.scoreFor != null && next.scoreAgainst != null;
      const scoreText = hasScore ? `${next.scoreFor}–${next.scoreAgainst}` : liveLabel;
      const scoreClass = hasScore
        ? 'sports-result__score'
        : 'sports-result__score sports-result__score--live';
      rows.push(`<li class="sports-result sports-result--live">
  <time class="sports-result__time" datetime="${escapeHtml(next.date || '')}">${timeHtml}</time>
  <span class="${scoreClass}" aria-label="${escapeHtml(liveLabel)}">${escapeHtml(scoreText)}</span>
  <span class="sports-result__title">${formatTitle(next, opp, venue)}</span>
  <span class="sports-result__badge" title="${escapeHtml(liveLabel)}"></span>
</li>`);
    } else {
      rows.push(`<li class="sports-result sports-result--next">
  <time class="sports-result__time" datetime="${escapeHtml(next.date || '')}">${timeHtml}</time>
  <span class="sports-result__score sports-result__score--next" aria-label="${escapeHtml(t.sportsUpcoming)}">${escapeHtml(t.sportsUpcoming)}</span>
  <span class="sports-result__title">${formatTitle(next, opp, venue)}</span>
  <span class="sports-result__badge sports-result__badge--next" title="${escapeHtml(t.sportsUpcoming)}">→</span>
</li>`);
    }
  }
  if (!rows.length) {
    if (team.clubNote || team.status === 'club' || team.status === 'upcoming') {
      const note = team.clubNote || t.sportsClubPending;
      return `<p class="sports-panel__empty sports-panel__empty--club">${escapeHtml(note)}</p>`;
    }
    return `<p class="sports-panel__empty">${escapeHtml(t.sportsEmpty)}</p>`;
  }
  return `<ul class="sports-panel__list">${rows.join('\n')}</ul>`;
}

/**
 * Outils flottants de la page SPORTS Étudiants :
 * flèche haut hors contenu à gauche + loupe hors contenu à droite
 * (CSS : gutter autour de --maxw ; safe-area sur mobile).
 */
function sportsPageToolsHtml(t) {
  return `      <div class="sports-page-tools" id="sports-page-tools" data-sports-tools>
        <button
          type="button"
          class="sports-page-tools__fab sports-page-tools__top"
          id="sports-scroll-top"
          aria-label="${escapeHtml(t.sportsScrollTop)}"
          title="${escapeHtml(t.sportsScrollTop)}"
          hidden
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>
          </svg>
        </button>
        <div class="sports-search" id="sports-search">
          <div
            id="sports-search-panel"
            class="sports-search__panel"
            role="search"
            hidden
            aria-hidden="true"
          >
            <label class="sr-only" for="sports-search-input">${escapeHtml(t.sportsSearchLabel)}</label>
            <div class="sports-search__field">
              <svg class="sports-search__field-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>
              </svg>
              <input
                id="sports-search-input"
                class="sports-search__input"
                type="search"
                enterkeyhint="search"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
                placeholder="${escapeHtml(t.sportsSearchPlaceholder)}"
              />
              <button
                type="button"
                id="sports-search-clear"
                class="sports-search__clear hidden"
                aria-label="${escapeHtml(t.sportsSearchClear)}"
                title="${escapeHtml(t.sportsSearchClear)}"
              >×</button>
            </div>
            <p id="sports-search-hint" class="sports-search__hint">${escapeHtml(t.sportsSearchHint)}</p>
          </div>
          <button
            type="button"
            id="sports-search-toggle"
            class="sports-search__fab"
            aria-label="${escapeHtml(t.sportsSearchLabel)}"
            aria-expanded="false"
            aria-controls="sports-search-panel"
            title="${escapeHtml(t.sportsSearchTitle)}"
          >
            <svg class="sports-search__fab-loupe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>
            </svg>
            <svg class="sports-search__fab-close hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18"/>
            </svg>
          </button>
        </div>
      </div>\n`;
}

function sportsPanelHtml(team, t, lang) {
  const sport = team.sport || '';
  const glyph = SPORT_GLYPH[sport] || '🏅';
  const tone = SPORT_TONE[sport] || 'var(--accent)';
  const sexKey = sportsEffectiveSexKey(team);
  const sexLabel = sexKey ? sportsSexLabel(sexKey === 'X' && !team.sex ? 'X' : team.sex || sexKey, t, lang) : '';
  const sexBadge = sexLabel
    ? ` <span class="sports-panel__sex sports-panel__sex--${sexKey === 'F' ? 'f' : sexKey === 'M' ? 'm' : 'x'}"${sexKey === 'X' ? ' title="Mixte"' : ''}>${escapeHtml(sexLabel)}</span>`
    : '';
  const liveNow = sportsNextIsLive(team.nextGame);
  const livePill = team.nextGame
    ? ` <span class="sports-panel__live"${liveNow ? '' : ' hidden'}>${escapeHtml(t.sportsLive || 'En cours')}</span>`
    : '';
  // Associations de voile (ULaVoile, PolyVoile, McGill Sailing) : jamais le surnom varsity.
  const isSailingClub = sport === 'sailing'
    && (team.kind === 'association-etudiante'
      || team.source === 'sailing-watchlist'
      || team.source === 'icsa-collegesailing');
  const nick = isSailingClub ? '' : String(team.nickname || '').trim();
  const shortName = String(team.name || '').trim() || 'Équipe';
  const code = String(team.code || '').trim();
  // Sigle d'équipe (THE, SL, OUT, LAF…) : jamais traduit. Ce sont des codes
  // RSEQ, pas des mots — sans garde, un moteur MT rend « THE » par « LE »
  // et « OUT » par « DEHORS ». `notranslate` couvre translate.js,
  // `translate="no"` la traduction native du navigateur.
  const codeHtml = code
    ? ` <span class="sports-panel__code notranslate" translate="no">${escapeHtml(code)}</span>`
    : '';
  /*
   * Hiérarchie « focus group » stats univ. :
   *  - le surnom (Cougars, Carabins…) est l’identité d’équipe → titre H3
   *  - l’établissement court + code se placent en sous-marque
   *  - le nom légal complet reste en 3ᵉ ligne
   * Sans surnom : shortName reste le titre (code discret à côté).
   * Exception voile club : nom du club uniquement (pas Redbirds / Rouge et Or).
   */
  let nameBlock;
  if (nick && nick.toLowerCase() !== shortName.toLowerCase()) {
    nameBlock = `<h3 class="sports-panel__name sports-panel__name--branded"><span class="sports-panel__brand">${escapeHtml(nick)}</span>${sexBadge}${livePill}</h3>\n`
      + `      <p class="sports-panel__program"><span class="sports-panel__name-text">${escapeHtml(shortName)}</span>${codeHtml}</p>`;
  } else {
    nameBlock = `<h3 class="sports-panel__name"><span class="sports-panel__brand">${escapeHtml(shortName)}</span>${codeHtml}${sexBadge}${livePill}</h3>`;
  }
  const schoolHtml = team.fullName && team.fullName !== shortName && team.fullName !== nick
    ? `<p class="sports-panel__school">${escapeHtml(team.fullName)}</p>`
    : '';
  const meta = [
    sportsSportLabel(team, t, lang),
    team.division,
    sportsSectorLabel(team.sector, t),
    team.record?.label ? `${t.sportsRecord} ${team.record.label}` : '',
  ].filter(Boolean).join(' · ');
  const regAttr = team.registryId ? ` data-registry="${escapeHtml(team.registryId)}"` : '';
  const effectiveSex = sportsEffectiveSexKey(team) || sexKey;
  const sexAttr = effectiveSex ? ` data-sex="${effectiveSex.toLowerCase()}"` : ' data-sex=""';
  const nextTs = sportsNextGameTs(team);
  const nextAttr = Number.isFinite(nextTs) && nextTs < Number.POSITIVE_INFINITY
    ? ` data-next-ts="${nextTs}"`
    : ' data-next-ts=""';
  const lastTs = sportsLastGameTs(team);
  const lastAttr = Number.isFinite(lastTs) && lastTs > Number.NEGATIVE_INFINITY
    ? ` data-last-ts="${lastTs}"`
    : ' data-last-ts=""';
  /* Index local pour la loupe (équipe, institution, sport, codes…). */
  const searchHay = [
    team.name, shortName, nick, team.fullName, team.code, team.institution,
    team.school, team.division, team.sector, sport, sportsSportLabel(team, t, lang),
    sexLabel, team.league, team.conference,
  ].filter(Boolean).join(' ');
  const searchAttr = searchHay
    ? ` data-search="${escapeHtml(searchHay)}"`
    : '';
  const liveClass = liveNow ? ' sports-panel--live' : '';
  const liveAttr = liveNow ? ' data-live="1"' : '';
  return `<section class="sports-panel${liveClass}" data-sport="${escapeHtml(sport)}" data-sector="${escapeHtml(team.sector || '')}" data-team="${escapeHtml(team.id || '')}"${sexAttr}${nextAttr}${lastAttr}${liveAttr}${regAttr}${searchAttr} style="--sports-panel-c:${escapeHtml(tone)}">
  <header class="sports-panel__head">
    <span class="sports-panel__glyph" aria-hidden="true">${glyph}</span>
    <div class="sports-panel__identity">
      ${nameBlock}
      ${schoolHtml}
      <p class="sports-panel__meta">${escapeHtml(meta)}</p>
    </div>
  </header>
  ${sportsResultRows(team, t, lang)}
</section>`;
}

/** Sous-titre Féminin / Masculin dans une section sport. */
function sportsSexGroupHeading(sexKey, t, count) {
  const label = sexKey === 'F' ? t.sportsWomen : sexKey === 'M' ? t.sportsMen : t.sportsMixed;
  const mod = sexKey === 'F' ? 'f' : sexKey === 'M' ? 'm' : 'x';
  return `<h4 class="sports-sex-group" data-sex-group="${escapeHtml(sexKey.toLowerCase() || 'x')}">
  <span class="sports-sex-group__label sports-sex-group__label--${mod}">${escapeHtml(label)}</span>
  <span class="sports-sex-group__count">${count}</span>
</h4>`;
}

/**
 * Sports hors feed scores (ou secours fetch) : carte informative + liens officiels.
 * Préfère le payload `externalBoards` de sports.json ; secours hardcodé hockey/voile.
 */
function externalSportPanelHtml(sport, t, board) {
  const fallback = {
    hockey: {
      sportLabel: t.sportsHockeyLabel,
      why: t.sportsHockeyWhy,
      links: [
        { href: 'https://collegial.rseqhockey.com/fr/', label: t.sportsHockeyColl },
        { href: 'https://oua.hockeytech.com/men/stats/schedule/all-teams/170/all-months?league=5&gametype=-1', label: t.sportsHockeyUniM },
        { href: 'https://www.rseq-stats.ca/universitaire/hockey-f', label: t.sportsHockeyUniF },
      ],
    },
    sailing: {
      sportLabel: t.sportsSailingLabel,
      why: t.sportsSailingWhy,
      links: [
        { href: 'https://scores.collegesailing.org/', label: t.sportsSailingIcsa },
        { href: 'https://mcgillathletics.ca/sports/sailing', label: t.sportsSailingMcgill },
        { href: 'https://neisa.collegesailing.org/', label: t.sportsSailingNeisa },
      ],
    },
  };
  const src = board && Array.isArray(board.links) && board.links.length
    ? board
    : fallback[sport];
  if (!src) return '';
  const label = src.sportLabel || fallback[sport]?.sportLabel || sport;
  const why = src.why || '';
  const glyph = SPORT_GLYPH[sport] || '🏅';
  const tone = SPORT_TONE[sport] || 'var(--accent)';
  const open = t.sportsHockeyOpen;
  const list = src.links.map((l) => (
    `<li class="sports-result sports-result--next">
  <span class="sports-result__time" aria-hidden="true">${glyph}</span>
  <span class="sports-result__score sports-result__score--next">${escapeHtml(open)}</span>
  <span class="sports-result__title"><a href="${escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a></span>
  <span class="sports-result__badge sports-result__badge--next" aria-hidden="true">→</span>
</li>`
  )).join('\n');
  const sector = src.sector || '';
  return `<section class="sports-panel sports-panel--external" data-sport="${escapeHtml(sport)}" data-sector="${escapeHtml(sector)}" data-team="${escapeHtml(sport)}-external" style="--sports-panel-c:${escapeHtml(tone)}">
  <header class="sports-panel__head">
    <span class="sports-panel__glyph" aria-hidden="true">${glyph}</span>
    <div class="sports-panel__identity">
      <h3 class="sports-panel__name">${escapeHtml(label)}</h3>
      ${why ? `<p class="sports-panel__meta">${escapeHtml(why)}</p>` : ''}
    </div>
  </header>
  <ul class="sports-panel__list">
${list}
  </ul>
</section>`;
}

/**
 * Hub « SPORTS Étudiants » — scores RSEQ collégial + universitaire.
 * Contenu 100 % statique (sports.json) ; filtres en progressive enhancement.
 */
function sportsHubPage(lang, ctx) {
  const t = T[lang];
  const path = ROUTES.sports[lang];
  const altPath = ROUTES.sports[lang === 'fr' ? 'en' : 'fr'];
  const up = '../'.repeat(path.split('/').filter(Boolean).length);
  const sports = ctx.sports || {};
  // Focus-group B : prune sessions (réf. = maintenant au build).
  const teamsRaw = Object.values(sports.teams || {})
    .map((team) => pruneSportsTeam(team, new Date()))
    .filter((team) => team && (team.lastGame || team.nextGame || team.name
      || (Array.isArray(team.results) && team.results.length)
      || team.status === 'club' || team.status === 'upcoming'));
  // Compteurs F/M par sport (pastilles titre) — n’influence plus l’ordre des cartes.
  const sexLeadBySport = {};
  for (const sport of [...new Set(teamsRaw.map((t) => t.sport).filter(Boolean))]) {
    sexLeadBySport[sport] = sportsSexLead(
      sport,
      teamsRaw.filter((t) => t.sport === sport),
    );
  }
  // Ordre : sport (popularité) → prochain match le plus proche (H/F mélangés) → nom.
  const teams = teamsRaw.slice().sort((a, b) => {
    const sa = SPORT_ORDER.indexOf(a.sport);
    const sb = SPORT_ORDER.indexOf(b.sport);
    const so = (sa < 0 ? 99 : sa) - (sb < 0 ? 99 : sb);
    if (so) return so;
    return compareSportsTeamsBySchedule(a, b);
  });

  const sportsPresent = [...new Set(teams.map((team) => team.sport).filter(Boolean))];
  sportsPresent.sort((a, b) => {
    const ia = SPORT_ORDER.indexOf(a);
    const ib = SPORT_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const sectorsPresent = [...new Set(teams.map((team) => team.sector).filter(Boolean))];
  const sexesPresent = [...new Set(
    teams.map((team) => sportsEffectiveSexKey(team)).filter((s) => s === 'F' || s === 'M' || s === 'X'),
  )];

  const sportLabelOf = (sport) => {
    const sample = teams.find((team) => team.sport === sport);
    return sportsSportLabel(sample || sport, t, lang);
  };

  const description = fill(t.sportsDesc, { n: teams.length });
  // Horodatage exact (date + heure + fuseau QC) : un jour civil seul ne permet
  // pas de savoir si les scores de la soirée sont déjà entrés.
  const stamp = sportsUpdatedStamp(sports.updated, lang);
  const updated = stamp?.label || null;
  const hasContent = teams.length > 0;

  // Focus-group le-radar-sports-page-title : pas de lead ; meta = Mise à jour seule.
  let body = '';
  if (t.sportsLead) {
    body += `      <p class="seo-lead">${escapeHtml(t.sportsLead)}</p>\n`;
  }
  if (stamp) {
    const prefix = t.sportsMeta
      ? `${escapeHtml(t.sportsMeta)} · ${escapeHtml(t.updated)} `
      : `${escapeHtml(t.updated)} `;
    body += `      <p class="sports-board-meta">${prefix}<time class="sports-board-meta__time" datetime="${escapeHtml(stamp.machine)}">${escapeHtml(stamp.label)}</time></p>\n`;
  } else if (t.sportsMeta) {
    body += `      <p class="sports-board-meta">${escapeHtml(t.sportsMeta)}</p>\n`;
  }

  if (!hasContent) {
    body += `      <p class="seo-empty">${escapeHtml(t.sportsEmpty)}</p>\n`;
  } else {
    body += `      <div class="sports-board-root" data-sports-board>\n`;
    body += `        <div class="sports-filters" role="group" aria-label="${escapeHtml(t.sports)}">\n`;
    body += `          <div class="sports-filters__row">\n`;
    body += `            <span class="sports-filters__label">${escapeHtml(t.sportsFilterSport)}</span>\n`;
    body += `            <button type="button" class="sports-filter is-active" data-filter-sport="all" aria-pressed="true">${escapeHtml(t.sportsAll)}</button>\n`;
    for (const sport of sportsPresent) {
      body += `            <button type="button" class="sports-filter" data-filter-sport="${escapeHtml(sport)}" aria-pressed="false">${escapeHtml(sportLabelOf(sport))}</button>\n`;
    }
    body += '          </div>\n';
    if (sexesPresent.length > 1) {
      body += `          <div class="sports-filters__row">\n`;
      body += `            <span class="sports-filters__label">${escapeHtml(t.sportsFilterSex)}</span>\n`;
      body += `            <button type="button" class="sports-filter is-active" data-filter-sex="all" aria-pressed="true">${escapeHtml(t.sportsAll)}</button>\n`;
      if (sexesPresent.includes('F')) {
        body += `            <button type="button" class="sports-filter" data-filter-sex="f" aria-pressed="false">${escapeHtml(t.sportsWomen)}</button>\n`;
      }
      if (sexesPresent.includes('M')) {
        body += `            <button type="button" class="sports-filter" data-filter-sex="m" aria-pressed="false">${escapeHtml(t.sportsMen)}</button>\n`;
      }
      /* Mixte / ouvert (ultimate, badminton X, voile campus…) — puce courte. */
      if (sexesPresent.includes('X')) {
        body += `            <button type="button" class="sports-filter" data-filter-sex="x" aria-pressed="false">${escapeHtml(t.sportsMixedShort || t.sportsMixed)}</button>\n`;
      }
      body += '          </div>\n';
    }
    if (sectorsPresent.length > 1) {
      body += `          <div class="sports-filters__row">\n`;
      body += `            <span class="sports-filters__label">${escapeHtml(t.sportsFilterSector)}</span>\n`;
      body += `            <button type="button" class="sports-filter is-active" data-filter-sector="all" aria-pressed="true">${escapeHtml(t.sportsAll)}</button>\n`;
      if (sectorsPresent.includes('collegial')) {
        body += `            <button type="button" class="sports-filter" data-filter-sector="collegial" aria-pressed="false">${escapeHtml(t.sportsCollegial)}</button>\n`;
      }
      if (sectorsPresent.includes('universitaire')) {
        body += `            <button type="button" class="sports-filter" data-filter-sector="universitaire" aria-pressed="false">${escapeHtml(t.sportsUniversity)}</button>\n`;
      }
      body += '          </div>\n';
    }
    /* Période : semaine / semaine prochaine / mois / session univ. QC. */
    body += `          <div class="sports-filters__row" data-filter-period-row>\n`;
    body += `            <span class="sports-filters__label">${escapeHtml(t.sportsFilterPeriod)}</span>\n`;
    body += `            <button type="button" class="sports-filter is-active" data-filter-period="all" aria-pressed="true">${escapeHtml(t.sportsPeriodAll || t.sportsAll)}</button>\n`;
    body += `            <button type="button" class="sports-filter" data-filter-period="live" aria-pressed="false">${escapeHtml(t.sportsPeriodLive || t.sportsLive)}</button>\n`;
    body += `            <button type="button" class="sports-filter" data-filter-period="week" aria-pressed="false">${escapeHtml(t.sportsPeriodWeek)}</button>\n`;
    body += `            <button type="button" class="sports-filter" data-filter-period="next-week" aria-pressed="false">${escapeHtml(t.sportsPeriodNextWeek)}</button>\n`;
    body += `            <button type="button" class="sports-filter" data-filter-period="month" aria-pressed="false">${escapeHtml(t.sportsPeriodMonth)}</button>\n`;
    body += `            <button type="button" class="sports-filter" data-filter-period="session" aria-pressed="false">${escapeHtml(t.sportsPeriodSession)}</button>\n`;
    body += '          </div>\n';
    body += '        </div>\n';
    body += `        <p class="sports-board-status" data-sports-status>${teams.length} ${teams.length > 1 ? t.sportsTeams : t.sportsTeamOne}</p>\n`;

    for (const sport of sportsPresent) {
      const group = teams.filter((team) => team.sport === sport);
      const label = sportLabelOf(sport);
      const glyph = SPORT_GLYPH[sport] || '🏅';
      const countLabel = String(group.length);
      const fCount = group.filter((team) => sportsEffectiveSexKey(team) === 'F').length;
      const mCount = group.filter((team) => sportsEffectiveSexKey(team) === 'M').length;
      const xCount = group.filter((team) => sportsEffectiveSexKey(team) === 'X').length;
      // <details open> : repliable au clic sur le titre, lisible sans JS.
      body += `        <details class="sports-sport-block" data-sport="${escapeHtml(sport)}" id="sport-${escapeHtml(sport)}" open>\n`;
      body += `          <summary class="sports-sport-block__title">\n`;
      body += `            <span class="sports-sport-block__glyph" aria-hidden="true">${glyph}</span>\n`;
      body += `            <span class="sports-sport-block__label">${escapeHtml(label)}</span>\n`;
      const sexLead = sexLeadBySport[sport] || sportsSexLead(sport, group);
      if (fCount || mCount) {
        body += `            <span class="sports-sport-block__sex-split" aria-label="${escapeHtml(t.sportsWomen)} ${fCount}, ${escapeHtml(t.sportsMen)} ${mCount}">`;
        for (const sk of sportsSexGroupOrder(sexLead)) {
          if (sk === 'F' && fCount) {
            body += `<span class="sports-sport-block__sex sports-sport-block__sex--f">${escapeHtml(t.sportsWomenShort)} ${fCount}</span>`;
          }
          if (sk === 'M' && mCount) {
            body += `<span class="sports-sport-block__sex sports-sport-block__sex--m">${escapeHtml(t.sportsMenShort)} ${mCount}</span>`;
          }
        }
        body += '</span>\n';
      }
      body += `            <span class="sports-sport-block__count">${escapeHtml(countLabel)}</span>\n`;
      body += `            <span class="sports-sport-block__chevron" aria-hidden="true"></span>\n`;
      body += '          </summary>\n';
      body += `          <div class="sports-board" role="list" data-sports-schedule-sort>\n`;
      if (group.length) {
        // Liste plate triée par prochain match (H/F mélangés) — pas de sous-blocs genre.
        body += group.map((team) => sportsPanelHtml(team, t, lang)).join('\n');
      } else {
        body += `            <p class="sports-panel__empty">${escapeHtml(t.sportsEmpty)}</p>\n`;
      }
      body += '\n          </div>\n        </details>\n';
    }
    body += '      </div>\n';
  }

  /* Note sources retirée (inutile en bas de page) — les liens de match restent
   * la source officielle au clic. Outils : flèche haut (gauche) + loupe sports. */
  body += sportsPageToolsHtml(t);

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t.sportsH1,
    description,
    inLanguage: lang === 'fr' ? 'fr-CA' : 'en-CA',
    about: {
      '@type': 'ItemList',
      numberOfItems: teams.length,
      itemListElement: sportsPresent.map((sport, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: sportLabelOf(sport),
        url: `${ctx.siteBase}/${path}#sport-${sport}`,
      })),
    },
  }).replace(/</g, '\\u003c');

  return {
    path,
    html: renderPage({
      lang,
      path,
      altPath,
      title: `${t.sportsTitle} | LE-RADAR.ca`,
      description,
      h1: t.sportsH1,
      // Clic sur le titre = rechargement propre sans filtres (?sport=…, ?sex=…).
      h1Href: './',
      // Pas d’eyebrow : même libellé que le h1 (« SPORTS Étudiants »).
      eyebrow: null,
      crumbs: [
        { label: t.home, href: up },
        { label: t.sportsFooter || t.sports, href: './', reset: true },
      ],
      bodyHtml: body,
      jsonLd,
      siteBase: ctx.siteBase,
      updated,
      extraScripts: ['sports-board.js'],
      wireClass: 'seo-wire--sports',
      chromeCurrent: 'sports',
      // Seul le volet français est une app installable : il porte le
      // manifeste et le service worker de portée /sports/. Le volet anglais
      // vit sous /en/sports/, hors de cette portée ; depuis là, « Installer »
      // renvoie vers /sports/?install=1 (voir installApp() côté client).
      standaloneApp: lang === 'fr',
    }),
    changefreq: 'daily',
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

function buildEntityPages({ radios, sources, news, institutions, schedules, sports, siteBase, archivePaths }) {
  const model = buildModel({ radios, sources, news, institutions });
  assertGeoLinkCoverage(model, institutions);
  const ctx = {
    siteBase,
    schedules: schedules || {},
    sports: sports || {},
    archivePaths: archivePaths || new Map(),
  };
  const pages = [];

  for (const lang of ['fr', 'en']) {
    pages.push(directoryPage(model, lang, ctx));
    pages.push(schedulesHubPage(model, lang, ctx));
    pages.push(sportsHubPage(lang, ctx));
    for (const radio of model.radioEntries) pages.push(radioPage(radio, lang, ctx));
    for (const paper of model.paperEntries) pages.push(paperPage(paper, lang, ctx));
    for (const group of model.groups) pages.push(institutionPage(group, lang, ctx));
  }
  pages.push(englishHomePage(model, ctx));

  return { pages, model };
}

module.exports = { buildEntityPages, ROUTES };

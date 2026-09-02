#!/usr/bin/env node
/**
 * LE-RADAR.ca — Artefacts de référencement (moteurs + assistants IA).
 *
 * Produit, à partir des registres déjà maintenus par les bots :
 *   • sitemap.xml — pages indexables
 *   • llms.txt    — fiche de contexte lisible par un assistant IA
 *   • index.html  — prérendu du fil + JSON-LD ItemList (entre marqueurs)
 *
 * POURQUOI LE PRÉRENDU
 * Les robots des assistants IA (GPTBot, ClaudeBot, PerplexityBot) n'exécutent
 * pas JavaScript. Sans prérendu, ils indexent une page vide : mesuré le
 * 2026-07-25, 694 caractères de texte et « Aucun article pour le moment »,
 * contre 68 000 caractères pour un navigateur.
 *
 * POURQUOI ÇA NE CASSE RIEN
 * Le prerendu est masqué visuellement (squelette magazine) jusqu’à
 * `#news-list[data-ready]` posé par `renderNews()`. Les robots sans JS
 * voient le HTML (et le `<noscript>` lève le masque). Dès que app.js tourne,
 * le conteneur est remplacé par le magazine.
 *
 *   node scripts/generate-seo.js            # dry-run (n'écrit rien)
 *   node scripts/generate-seo.js --update   # écrit les fichiers
 *   node scripts/generate-seo.js --update --sports-only
 *     # seulement /sports/ et /en/sports/ (bot scores, sans purge du reste)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { decodeHtmlEntities } = require('./html-entities-lib');
const { buildEntityPages } = require('./seo-pages');
const { renderSiteFooter, renderMastheadActions, renderSectionNav } = require('./seo-pages-lib');
const { buildHistoricalArchivePages } = require('./historical-seo-pages');

const ROOT = path.join(__dirname, '..');
/** Domaine canonique (Pages + custom domain). Surcharge : RADAR_SITE_URL. */
const SITE_BASE = (process.env.RADAR_SITE_URL || 'https://le-radar.ca').replace(/\/$/, '');
const BRAND = 'LE-RADAR.ca';

const NEWS_PATH = path.join(ROOT, 'news.json');
const SOURCES_PATH = path.join(ROOT, 'news-sources.json');
const RADIOS_PATH = path.join(ROOT, 'radios.json');
const INDEX_PATH = path.join(ROOT, 'index.html');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const ARCHIVE_SITEMAP_PATH = path.join(ROOT, 'sitemap-archives.xml');
const LLMS_PATH = path.join(ROOT, 'llms.txt');
const INSTITUTIONS_PATH = path.join(ROOT, 'institutions.json');
const SCHEDULES_PATH = path.join(ROOT, 'radio-schedules.json');
const SPORTS_PATH = path.join(ROOT, 'sports.json');
const ARCHIVE_PATH = path.join(ROOT, 'news-archive.json');
const ARCHIVE_CONFIG_PATH = path.join(ROOT, 'historical-catalog.config.json');

/**
 * Dossiers entièrement reconstruits à chaque passe : on les efface d'abord
 * pour qu'une entité retirée des données ne laisse pas de page orpheline.
 *
 * `sports/` en est volontairement absent. Depuis qu'il est installable, il
 * contient des fichiers écrits à la main que le générateur ne produit pas —
 * `site.webmanifest`, `sw.js` et les douze icônes PWA. Les effacer à chaque
 * `seo:update` casserait l'installation. Le dossier n'a de toute façon qu'une
 * seule page générée (`sports/index.html`), qui est simplement réécrite.
 */
const GENERATED_DIRS = ['radios', 'journaux', 'etablissements', 'medias', 'horaires', 'en', 'archives'];

/** Nombre de manchettes prérendues. Assez pour être substantiel, assez peu
 *  pour que le diff des bots horaires reste lisible. */
const PRERENDER_MAX = 20;

/** Pages indexables. Étendre ici (pages d'entités, volet /en/…). */
const PAGES = [
  { loc: '/', changefreq: 'hourly', priority: '1.0', file: 'index.html' },
  { loc: '/feeds.html', changefreq: 'monthly', priority: '0.5', file: 'feeds.html' },
  { loc: '/kit-media/', changefreq: 'monthly', priority: '0.4', file: 'kit-media/index.html' },
  { loc: '/affiches/', changefreq: 'monthly', priority: '0.4', file: 'affiches/index.html' },
  { loc: '/iframes/', changefreq: 'monthly', priority: '0.4', file: 'iframes/index.html' },
  { loc: '/en/media-kit/', changefreq: 'monthly', priority: '0.3', file: 'en/media-kit/index.html' },
  { loc: '/en/iframes/', changefreq: 'monthly', priority: '0.3', file: 'en/iframes/index.html' },
  { loc: '/pomo/', changefreq: 'monthly', priority: '0.3', file: 'pomo/index.html' },
  { loc: '/solitaire/', changefreq: 'monthly', priority: '0.3', file: 'solitaire/index.html' },
];

const MARKERS = {
  jsonld: ['<!-- RADAR:SEO:JSONLD:START -->', '<!-- RADAR:SEO:JSONLD:END -->'],
  feed: ['<!-- RADAR:SEO:FEED:START -->', '<!-- RADAR:SEO:FEED:END -->'],
  footer: ['<!-- RADAR:FOOTER:START -->', '<!-- RADAR:FOOTER:END -->'],
  actions: ['<!-- RADAR:CHROME:ACTIONS:START -->', '<!-- RADAR:CHROME:ACTIONS:END -->'],
  sections: ['<!-- RADAR:CHROME:SECTIONS:START -->', '<!-- RADAR:CHROME:SECTIONS:END -->'],
};

/**
 * Pages écrites à la main qui reçoivent le pied de page partagé.
 *
 * Les 69 pages d'entités l'obtiennent directement par `renderPage()`. Ces
 * trois-là ne passent pas par le gabarit : elles déclarent des marqueurs
 * `RADAR:FOOTER` et le générateur y injecte exactement le même bloc. C'est ce
 * qui garantit qu'il n'existe plus qu'une seule définition du pied de page.
 *
 * `home` pose aria-current sur Accueil (le lien reste pour scroll + refresh).
 * `indent` doit correspondre à l'indentation du marqueur dans le fichier.
 */
const FOOTER_PAGES = [
  { file: 'index.html', lang: 'fr', up: './', home: true, altPath: 'en/', indent: '      ' },
  { file: 'feeds.html', lang: 'fr', up: './', altPath: 'en/', indent: '      ' },
  { file: 'kit-media/index.html', lang: 'fr', up: '../', altPath: 'en/media-kit/', indent: '      ' },
  { file: 'en/media-kit/index.html', lang: 'en', up: '../../', altPath: 'kit-media/', indent: '      ' },
  { file: 'offline.html', lang: 'fr', up: './', altPath: 'en/', indent: '    ', variant: 'maintenance' },
];

/**
 * Pages écrites à la main qui reçoivent la rangée d'actions du mât.
 *
 * Même principe que `FOOTER_PAGES`, un cran plus haut dans la page. Les 107
 * pages générées obtiennent la rangée par `renderPage()`; ces deux-là par les
 * marqueurs `RADAR:CHROME:ACTIONS`. `offline.html` en est absente : la page de
 * maintenance ne propose volontairement aucune navigation.
 *
 * `current` pose `aria-current="page"` sur la pastille de la page courante.
 */
const ACTIONS_PAGES = [
  { file: 'index.html', lang: 'fr', up: './', current: 'home', indent: '          ' },
  { file: 'feeds.html', lang: 'fr', up: './', current: 'rss', indent: '          ' },
];

// ═══════════════════════════════════════════════════════════════════════════
//  Utilitaires
// ═══════════════════════════════════════════════════════════════════════════

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function escapeXml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * JSON sûr dans un <script> : neutralise </script> et les séparateurs U+2028/9.
 * Compact volontairement : le bloc est régénéré à chaque passe des bots, et
 * une seule ligne qui change vaut mieux qu'un diff de 500 lignes dans
 * index.html à chaque heure.
 */
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function cleanText(text = '') {
  return decodeHtmlEntities(String(text))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Date du dernier commit touchant un fichier — stable en CI, contrairement
 *  au mtime que `actions/checkout` remet à l'heure du run. */
function lastCommitDate(relPath) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', relPath], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function isoDay(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function articleCardDateTime(value, lang = 'fr') {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    const isEnglish = lang === 'en';
    const locale = isEnglish ? 'en-CA' : 'fr-CA';
    const date = d.toLocaleDateString(locale, {
      timeZone: 'America/Toronto', day: 'numeric', month: 'short', year: 'numeric',
    });
    const clock = d.toLocaleTimeString(locale, isEnglish
      ? { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit', hour12: true }
      : { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return `${date} · ${clock}`;
  } catch {
    return isoDay(d) || '';
  }
}

/**
 * Remplace le contenu entre deux marqueurs. Idempotent : rejouer le script
 * produit exactement le même fichier. Lève si les marqueurs sont absents ou
 * mal ordonnés — on ne réécrit jamais index.html à l'aveugle.
 */
function injectBetween(source, [start, end], payload, label, file = 'index.html') {
  const from = source.indexOf(start);
  const to = source.indexOf(end);
  if (from === -1 || to === -1) {
    throw new Error(`Marqueurs « ${label} » introuvables dans ${file} — injection annulée.`);
  }
  if (to < from) {
    throw new Error(`Marqueurs « ${label} » inversés dans ${file} — injection annulée.`);
  }
  return source.slice(0, from + start.length) + payload + source.slice(to);
}

/** Injecte le pied de page partagé entre les marqueurs d'une page statique. */
function injectFooter(html, page) {
  const { file, indent, ...opts } = page;
  const footer = renderSiteFooter({ ...opts, indent });
  return injectBetween(html, MARKERS.footer, `\n${indent}${footer}\n${indent}`, 'FOOTER', file);
}

/**
 * Injecte le menu de sections. L'accueil seul le porte : les pages d'entités
 * ont déjà un fil d'Ariane au même endroit, qui situe en plus la page dans
 * l'arborescence.
 */
function injectSections(html, { file, indent, ...opts }) {
  const nav = renderSectionNav({ ...opts, indent });
  return injectBetween(html, MARKERS.sections, `\n${indent}${nav}\n${indent}`, 'CHROME:SECTIONS', file);
}

/** Injecte la rangée d'actions du mât entre les marqueurs d'une page statique. */
function injectActions(html, page) {
  const { file, indent, ...opts } = page;
  const actions = renderMastheadActions({ ...opts, indent });
  return injectBetween(html, MARKERS.actions, `\n${indent}${actions}\n${indent}`, 'CHROME:ACTIONS', file);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Données
// ═══════════════════════════════════════════════════════════════════════════

function loadNewsItems() {
  const data = readJson(NEWS_PATH, { items: [] });
  const items = Array.isArray(data) ? data : (data.items || []);
  return items
    .filter((it) => it && it.title && it.link)
    .slice()
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function loadSources() {
  const registry = readJson(SOURCES_PATH, { active: [] });
  return (registry.active || []).filter((s) => s && s.name);
}

function loadRadios() {
  const data = readJson(RADIOS_PATH, []);
  return (Array.isArray(data) ? data : []).filter((r) => r && r.name);
}

// ═══════════════════════════════════════════════════════════════════════════
//  sitemap.xml
// ═══════════════════════════════════════════════════════════════════════════

function buildSitemap(newsUpdated, entityPages = []) {
  const generated = entityPages.map((p) => ({
    loc: `/${p.path}`,
    changefreq: p.changefreq,
    priority: p.priority,
    // Date propre à la page (dernier article du journal, collecte de la grille
    // de la station…), pas la date de la passe des bots : sinon le sitemap
    // annoncerait 67 pages modifiées chaque jour alors que rien n'a bougé.
    // `null` → la ligne <lastmod> est simplement omise.
    lastmod: p.lastmod || null,
  }));

  const urls = [...PAGES, ...generated].map((page) => {
    // L'accueil bouge à chaque passe des bots : sa date vient de news.json.
    const lastmod = page.lastmod !== undefined
      ? page.lastmod
      : (page.loc === '/'
        ? isoDay(newsUpdated || Date.now())
        : isoDay(lastCommitDate(page.file)));
    return [
      '  <url>',
      `    <loc>${escapeXml(SITE_BASE + page.loc)}</loc>`,
      lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
      `    <changefreq>${page.changefreq}</changefreq>`,
      `    <priority>${page.priority}</priority>`,
      '  </url>',
    ].filter(Boolean).join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Généré par scripts/generate-seo.js — ne pas éditer à la main. -->',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

/** Sitemap séparé : le test historique reste mesurable et réversible sans
 * gonfler le sitemap principal ni prétendre que tout le cache est indexable. */
function buildArchiveSitemap(pages = []) {
  const urls = pages.filter((page) => page.indexable !== false).map((page) => [
    '  <url>',
    `    <loc>${escapeXml(`${SITE_BASE}/${page.path}`)}</loc>`,
    page.lastmod ? `    <lastmod>${escapeXml(isoDay(page.lastmod) || '')}</lastmod>` : null,
    `    <changefreq>${page.changefreq || 'monthly'}</changefreq>`,
    `    <priority>${page.priority || '0.4'}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n'));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Catalogue historique expérimental, généré par scripts/generate-seo.js. -->',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
//  llms.txt — fiche de contexte pour les assistants IA
// ═══════════════════════════════════════════════════════════════════════════

function buildLlmsTxt(sources, radios, items, newsUpdated, model, historicalSample = 0) {
  // Chaque entité pointe vers SA page sur le site : c'est l'URL qu'un
  // assistant peut citer, et elle est lisible sans JavaScript.
  const pageFor = (kind, slug) => `${SITE_BASE}/${kind}/${slug}/`;

  const radioLines = (model?.radioEntries || []).map((r) => {
    const inst = r.group ? r.group.name : r.institution;
    const bits = [r.fullName || r.name, inst, r.city].filter(Boolean).join(' — ');
    return `- ${bits} : ${pageFor('radios', r.slug)}${r.website ? ` (site officiel : ${r.website})` : ''}`;
  });

  const sourceLines = (model?.paperEntries || []).map((s) => {
    const inst = s.group ? s.group.name : s.institution;
    const bits = [s.name, inst, s.region].filter(Boolean).join(' — ');
    return `- ${bits} : ${pageFor('journaux', s.slug)}${s.site ? ` (site officiel : ${s.site})` : ''}`;
  });

  const instLines = (model?.groups || [])
    .slice()
    .sort((x, y) => x.name.localeCompare(y.name, 'fr'))
    .map((g) => `- ${g.name} : ${pageFor('etablissements', g.slug)}`
      + ` (${g.papers.length} ${g.papers.length > 1 ? 'journaux' : 'journal'},`
      + ` ${g.radios.length} ${g.radios.length > 1 ? 'radios' : 'radio'})`);

  return `# ${BRAND}

> Annuaire et agrégateur des médias étudiants des cégeps et universités du
> Québec (Canada) : ${sources.length} journaux étudiants et ${radios.length} radios de campus,
> réunis sur une seule page. Le fil est mis à jour plusieurs fois par jour.

## Ce qu'est LE-RADAR.ca

LE-RADAR.ca (${SITE_BASE}) recense les journaux étudiants et les radios
étudiantes des établissements d'enseignement supérieur du Québec. Le site
agrège les titres, les brèves et les images des publications étudiantes, et
renvoie systématiquement vers l'article original sur le site du média source.
Il diffuse aussi en direct les radios de campus dont le flux est public.

LE-RADAR.ca est un projet indépendant et non officiel. Il n'est affilié à aucun
des médias, établissements ou associations étudiantes qu'il recense. Les
contenus appartiennent à leurs publications d'origine.

Public visé : les personnes étudiantes des cégeps et universités du Québec,
y compris les étudiantes et étudiants internationaux qui étudient au Québec.

Langues : français (langue principale) et anglais, selon la publication
d'origine. Les articles ne sont pas traduits à la source ; un module de
traduction facultatif est offert dans l'interface.

## Radios étudiantes recensées (${radios.length})

${radioLines.join('\n') || '- (aucune)'}

## Journaux étudiants recensés (${sources.length})

${sourceLines.join('\n') || '- (aucun)'}

## Établissements couverts (${(model?.groups || []).length})

${instLines.join('\n') || '- (aucun)'}

## Pages de référence

- ${SITE_BASE}/medias/ : annuaire complet, par établissement
- ${SITE_BASE}/horaires/ : grilles des radios étudiantes
- ${SITE_BASE}/sports/ : tableau des scores RSEQ (collégial et universitaire)
- ${SITE_BASE}/en/ : présentation en anglais (pour les personnes étudiantes internationales au Québec)
- ${SITE_BASE}/en/media/ : annuaire en anglais
- ${SITE_BASE}/en/sports/ : scoreboard in English
${historicalSample ? `- ${SITE_BASE}/archives/ : catalogue historique expérimental (${historicalSample} entrées vérifiées, sans republication intégrale)` : ''}

## Données ouvertes (sans JavaScript, directement analysables)

- ${SITE_BASE}/news.json : fil agrégé complet (${items.length} articles), avec source, établissement, région, langue, autrice ou auteur, date et lien d'origine
- ${SITE_BASE}/radios.json : registre des radios étudiantes (fréquence, établissement, ville, flux)
- ${SITE_BASE}/news-sources.json : registre des journaux étudiants suivis
- ${SITE_BASE}/institutions.json : catalogue des établissements d'enseignement supérieur du Québec
- ${SITE_BASE}/sports.json : formations et matchs RSEQ (collégial + universitaire)
- ${SITE_BASE}/feed.xml : flux RSS du fil étudiant
- ${SITE_BASE}/sitemap.xml : plan du site
${historicalSample ? `- ${SITE_BASE}/sitemap-archives.xml : sitemap séparé du catalogue historique expérimental` : ''}

## Citation

Pour citer le site comme source : « LE-RADAR.ca, agrégateur des
médias étudiants du Québec ». Pour un article précis, citer la publication
étudiante d'origine, pas LE-RADAR.ca.

Dernière mise à jour du fil : ${newsUpdated || 'inconnue'}
`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Prérendu du fil (HTML) + JSON-LD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Reprend les classes de `renderNews()` (app.js) pour que la fraction de
 * seconde précédant l'exécution du JS reste fidèle au design — et pour que la
 * page sans JavaScript soit lisible telle quelle.
 */
function buildFeedHtml(items) {
  if (!items.length) return '\n      ';

  const rows = items.map((item) => {
    const title = cleanText(item.title);
    const brief = cleanText(item.excerpt || '').slice(0, 300);
    const byLabel = item.lang === 'en' ? 'By' : 'Par';
    const author = cleanText(item.author || '');
    const date = articleCardDateTime(item.date, item.lang);

    const meta = [
      item.source ? `<span class="article-source notranslate" translate="no">${escapeHtml(item.source)}</span>` : '',
      item.institution ? `<span class="article-inst">${escapeHtml(item.institution)}</span>` : '',
    ].filter(Boolean).join('');

    return [
      `        <a class="article article--text" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">`,
      `          <div class="article-meta"><span class="article-meta__lead">${meta}</span>`
        + (date ? `<time class="article-time" datetime="${escapeHtml(item.date || '')}">${escapeHtml(date)}</time>` : '')
        + '</div>',
      `          <h3 class="article-title">${escapeHtml(title)}</h3>`,
      // Espace réel entre le libellé et l'autrice ou l'auteur : à l'écran il
      // vient d'un margin CSS, mais un extracteur de texte (crawler d'IA) lirait
      // « ParMédéric Dens » sans lui.
      author
        ? `          <p class="article-byline"><span class="article-byline__label">${byLabel}</span> <strong class="article-author notranslate" translate="no">${escapeHtml(author)}</strong></p>`
        : '',
      brief
        ? `          <p class="article-brief"><span class="article-brief-text">${escapeHtml(brief)}</span></p>`
        : '',
      '        </a>',
    ].filter(Boolean).join('\n');
  });

  return `\n${rows.join('\n')}\n      `;
}

function buildItemListJsonLd(items) {
  const list = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Le fil étudiant — LE-RADAR.ca',
    description: 'Dernières manchettes des journaux étudiants des cégeps et universités du Québec.',
    numberOfItems: items.length,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: item.link,
      item: {
        '@type': 'NewsArticle',
        headline: cleanText(item.title).slice(0, 110),
        url: item.link,
        ...(item.date ? { datePublished: item.date } : {}),
        ...(item.excerpt ? { description: cleanText(item.excerpt).slice(0, 300) } : {}),
        ...(item.image ? { image: item.image } : {}),
        ...(item.lang ? { inLanguage: item.lang } : {}),
        ...(item.author ? { author: { '@type': 'Person', name: cleanText(item.author) } } : {}),
        ...(item.source
          ? {
            publisher: {
              '@type': 'NewsMediaOrganization',
              name: item.source,
              ...(item.institution ? { parentOrganization: { '@type': 'CollegeOrUniversity', name: item.institution } } : {}),
            },
          }
          : {}),
      },
    })),
  };

  return `\n    <script type="application/ld+json">\n${jsonForScript(list)}\n    </script>\n    `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════════════════════

function isSportsHubPath(pagePath) {
  const rel = String(pagePath || '').replace(/\/$/, '');
  return rel === 'sports' || rel === 'en/sports';
}

function main() {
  const doUpdate = process.argv.includes('--update');
  const sportsOnly = process.argv.includes('--sports-only');

  const newsRaw = readJson(NEWS_PATH, {});
  const newsUpdated = newsRaw.updated || null;
  const items = loadNewsItems();
  const sources = loadSources();
  const radios = loadRadios();
  const archiveConfig = readJson(ARCHIVE_CONFIG_PATH, { mode: 'off', partial: {} });
  const historicalCatalog = readJson(ARCHIVE_PATH, { records: [] });
  const archive = buildHistoricalArchivePages({
    catalog: historicalCatalog,
    config: archiveConfig,
    siteBase: SITE_BASE,
    sources,
  });
  const prerendered = items.slice(0, PRERENDER_MAX);

  console.log(`${BRAND} — artefacts de référencement`);
  console.log('==========================================\n');
  console.log(`Site      : ${SITE_BASE}`);
  console.log(`Articles  : ${items.length} (prérendu : ${prerendered.length})`);
  const archivePublicPages = archive.pages.filter((page) => page.indexable !== false);
  const archiveNoindexPages = archive.pages.length - archivePublicPages.length;
  console.log(`Archives  : ${archivePublicPages.length} page(s) indexables + ${archiveNoindexPages} hors index (${archive.sample.records.length}/${archive.sample.eligible} entrées vérifiées)`);
  console.log(`Journaux  : ${sources.length}   Radios : ${radios.length}\n`);

  const written = [];

  // ── Pages d'entités (FR + EN) ──
  const { pages: entityPages, model } = buildEntityPages({
    radios,
    sources,
    news: items,
    institutions: readJson(INSTITUTIONS_PATH, {}).institutions || [],
    schedules: readJson(SCHEDULES_PATH, {}).stations || {},
    sports: readJson(SPORTS_PATH, {}),
    siteBase: SITE_BASE,
    archivePaths: archive.sourcePaths,
  });

  const sportsPages = entityPages.filter((page) => isSportsHubPath(page.path));
  if (doUpdate) {
    if (sportsOnly) {
      // Bot scores : réécrire seulement le tableau, sans toucher journaux/radios.
      for (const page of sportsPages) {
        const out = path.join(ROOT, page.path, 'index.html');
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, page.html, 'utf8');
      }
    } else {
      // Purge d'abord : un journal retiré du registre ne doit pas laisser une
      // page orpheline indexée derrière lui.
      // `en/` est généré, mais `en/media-kit/` est écrit à la main (miroir EN
      // de kit-media/) — le garder hors de la purge.
      const handmadeUnderGenerated = ['en/media-kit/index.html', 'en/iframes/index.html'];
      const stashedHandmade = [];
      for (const rel of handmadeUnderGenerated) {
        const p = path.join(ROOT, rel);
        if (fs.existsSync(p)) stashedHandmade.push({ rel, content: fs.readFileSync(p, 'utf8') });
      }
      for (const dir of GENERATED_DIRS) {
        fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
      }
      for (const { rel, content } of stashedHandmade) {
        const out = path.join(ROOT, rel);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, content, 'utf8');
      }
      for (const page of entityPages) {
        const out = path.join(ROOT, page.path, 'index.html');
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, page.html, 'utf8');
      }
      for (const page of archive.pages) {
        const out = path.join(ROOT, page.path, 'index.html');
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, page.html, 'utf8');
      }
    }
  }
  if (sportsOnly) {
    written.push({
      file: 'pages sports',
      note: `${sportsPages.length} page(s) — /sports/ + /en/sports/ depuis sports.json`,
    });
  } else {
    written.push({
      file: 'pages d’entités',
      note: `${entityPages.length} pages — ${model.groups.length} établissements, `
        + `${model.paperEntries.length} journaux, ${model.radioEntries.length} radios (FR + EN)`,
    });
    written.push({ file: 'catalogue historique', note: `${archivePublicPages.length} page(s) indexable(s), ${archiveNoindexPages} hors index, ${archive.sample.records.length} entrée(s) vérifiée(s)` });
  }

  if (sportsOnly) {
    console.log('\nÉcrit :');
    for (const row of written) console.log(`  ${row.file}  ${row.note}`);
    return;
  }

  // ── sitemap.xml ──
  const sitemap = buildSitemap(newsUpdated, entityPages);
  if (doUpdate) fs.writeFileSync(SITEMAP_PATH, sitemap, 'utf8');
  written.push({ file: 'sitemap.xml', note: `${PAGES.length + entityPages.length} URL` });

  const archiveSitemap = buildArchiveSitemap(archive.pages);
  if (doUpdate) fs.writeFileSync(ARCHIVE_SITEMAP_PATH, archiveSitemap, 'utf8');
  written.push({ file: 'sitemap-archives.xml', note: `${archivePublicPages.length} URL indexable(s)` });

  // ── llms.txt ──
  const llms = buildLlmsTxt(sources, radios, items, newsUpdated, model, archive.sample.records.length);
  if (doUpdate) fs.writeFileSync(LLMS_PATH, llms, 'utf8');
  written.push({ file: 'llms.txt', note: `${sources.length} journaux, ${radios.length} radios` });

  // ── index.html : prérendu + JSON-LD + pied de page ──
  // Une seule écriture pour les trois injections : relire le fichier entre
  // deux passes perdrait celles qui ne sont pas encore sur le disque.
  const indexPage = FOOTER_PAGES.find((p) => p.file === 'index.html');
  const before = fs.readFileSync(INDEX_PATH, 'utf8');
  let html = before;
  html = injectBetween(html, MARKERS.jsonld, buildItemListJsonLd(prerendered), 'JSONLD');
  html = injectBetween(html, MARKERS.feed, buildFeedHtml(prerendered), 'FEED');
  html = injectFooter(html, indexPage);
  html = injectActions(html, ACTIONS_PAGES.find((p) => p.file === 'index.html'));
  html = injectSections(html, { file: 'index.html', lang: 'fr', up: './', indent: '    ' });

  if (doUpdate && html !== before) fs.writeFileSync(INDEX_PATH, html, 'utf8');
  written.push({
    file: 'index.html',
    note: html === before ? 'inchangé' : `prérendu de ${prerendered.length} manchettes + pied de page`,
  });

  // ── pied de page partagé : autres pages écrites à la main ──
  for (const page of FOOTER_PAGES.filter((p) => p.file !== 'index.html')) {
    const target = path.join(ROOT, page.file);
    const original = fs.readFileSync(target, 'utf8');
    let updatedHtml = injectFooter(original, page);
    // La même passe porte la rangée d'actions quand la page en déclare une :
    // relire le fichier entre deux écritures perdrait la première injection.
    const actionsPage = ACTIONS_PAGES.find((p) => p.file === page.file);
    if (actionsPage) updatedHtml = injectActions(updatedHtml, actionsPage);
    if (doUpdate && updatedHtml !== original) fs.writeFileSync(target, updatedHtml, 'utf8');
    written.push({
      file: page.file,
      note: updatedHtml === original ? 'chrome partagé inchangé' : 'chrome partagé mis à jour',
    });
  }

  if (!doUpdate) {
    console.log('Dry-run — aucun fichier écrit. Utilisez --update.\n');
    written.forEach((w) => console.log(`   ${w.file} (${w.note})`));
    return;
  }

  console.log('✅ Artefacts de référencement publiés :');
  written.forEach((w) => console.log(`   ${w.file} (${w.note})`));
}

main();

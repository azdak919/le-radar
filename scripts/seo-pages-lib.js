/**
 * LE-RADAR.ca — Génération des pages d'entités (référencement).
 *
 * POURQUOI CES PAGES
 * Le site ne comptait que 4 URL indexables. Une personne qui cherche
 * « radio étudiante Université Laval » ou « McGill student newspaper » ne
 * pouvait tomber que sur l'accueil, qui ne répond pas précisément à sa
 * question. Ces pages statiques donnent une réponse par entité, lisible sans
 * JavaScript — donc citable par les assistants IA.
 *
 * PRINCIPES
 *  - Aucune republication d'article : titres + liens vers la source d'origine.
 *  - Aucun JavaScript requis pour lire la page (seul un micro-script applique
 *    le thème enregistré, comme sur le reste du site).
 *  - Volet anglais pour les personnes étudiantes internationales déjà au
 *    Québec : `hreflang` fr-CA / en-CA, `x-default` → français, et **aucune
 *    redirection automatique** (les règles de translate.js gardent la main).
 */

const SITE_NAME = 'LE-RADAR.ca';
const TAGLINE_FR = 'Les journaux et les radios étudiantes du Québec, réunis au même endroit';
const TAGLINE_EN = 'Québec student newspapers and campus radio, all in one place';

// ═══════════════════════════════════════════════════════════════════════════
//  Utilitaires
// ═══════════════════════════════════════════════════════════════════════════

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Date ISO courte (AAAA-MM-JJ), ou null si la valeur n'est pas une date. */
function isoDay(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Clé de comparaison tolérante aux accents, à la casse et aux parenthèses. */
function normKey(name = '') {
  return String(name)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Établissements canoniques.
 *
 * Les registres n'écrivent pas les noms de la même façon (« UQAM » et
 * « Université du Québec à Montréal », « Université McGill » et « McGill
 * University »). Sans cette table, on générerait deux pages concurrentes pour
 * le même établissement — exactement le contenu dupliqué qu'on cherche à
 * éviter. `app.js` a une table d'acronymes équivalente pour l'affichage ;
 * celle-ci sert au regroupement et aux URL.
 */
const INSTITUTIONS = [
  { slug: 'universite-de-montreal', name: 'Université de Montréal', short: 'UdeM' },
  { slug: 'universite-du-quebec-a-montreal', name: 'Université du Québec à Montréal', short: 'UQAM', aliases: ['UQAM'] },
  { slug: 'mcgill-university', name: 'McGill University', short: 'McGill', aliases: ['Université McGill'] },
  { slug: 'concordia-university', name: 'Concordia University', short: 'Concordia' },
  { slug: 'universite-du-quebec-a-trois-rivieres', name: 'Université du Québec à Trois-Rivières', short: 'UQTR' },
  { slug: 'universite-laval', name: 'Université Laval', short: 'ULaval' },
  { slug: 'universite-de-sherbrooke', name: 'Université de Sherbrooke', short: 'UdeS' },
  { slug: 'cegep-du-vieux-montreal', name: 'Cégep du Vieux Montréal', short: 'Cégep Vieux-Montréal' },
  { slug: 'cegep-de-jonquiere', name: 'Cégep de Jonquière', short: 'Cégep de Jonquière' },
  { slug: 'polytechnique-montreal', name: 'Polytechnique Montréal', short: 'Polytechnique' },
  { slug: 'bishops-university', name: "Bishop's University", short: "Bishop's" },
  { slug: 'dawson-college', name: 'Dawson College', short: 'Dawson' },
];

const INSTITUTION_BY_KEY = new Map();
for (const entry of INSTITUTIONS) {
  for (const alias of [entry.name, ...(entry.aliases || [])]) {
    INSTITUTION_BY_KEY.set(normKey(alias), entry);
  }
}

/** Résout un nom brut vers son établissement canonique (ou en fabrique un). */
function canonicalInstitution(rawName = '') {
  const key = normKey(rawName);
  if (!key) return null;
  const known = INSTITUTION_BY_KEY.get(key);
  if (known) return known;
  // Repli : un établissement apparu dans les registres après cette table.
  // On le publie quand même plutôt que de le perdre silencieusement.
  const cleaned = String(rawName).replace(/\s*\([^)]*\)\s*$/, '').trim();
  return { slug: slugify(cleaned), name: cleaned, short: cleaned };
}

// ═══════════════════════════════════════════════════════════════════════════
//  Chaînes bilingues
// ═══════════════════════════════════════════════════════════════════════════

const T = {
  fr: {
    lang: 'fr-CA',
    tagline: TAGLINE_FR,
    home: 'Accueil',
    directory: 'Les médias étudiants',
    directoryTitle: 'Les médias étudiants du Québec — journaux et radios de campus',
    directoryDesc: 'Annuaire des journaux étudiants et des radios de campus des cégeps et universités du Québec : {n} publications et {r} stations, par établissement.',
    directoryH1: 'Les médias étudiants du Québec',
    radios: 'Radios étudiantes',
    newspapers: 'Journaux étudiants',
    institutions: 'Établissements',
    listenLive: 'Écouter en direct sur LE-RADAR.ca',
    officialSite: 'Site officiel',
    frequency: 'Fréquence',
    institution: 'Établissement',
    city: 'Ville',
    region: 'Région',
    language: 'Langue',
    type: 'Type',
    university: 'Université',
    cegep: 'Cégep',
    french: 'Français',
    english: 'Anglais',
    latestHeadlines: 'Derniers articles',
    readOnSource: 'Chaque titre renvoie à l’article original, sur le site du média.',
    noHeadlines: 'Aucun article récent au moment de la dernière mise à jour.',
    schedule: 'À l’antenne cette semaine',
    scheduleNote: 'Grille colligée automatiquement à partir du site de la station ; elle peut varier.',
    mediaOf: 'Les médias étudiants {of}',
    mediaOfDesc: 'Les journaux étudiants et la radio de campus {of} : qui ils sont, où les lire et les écouter.',
    radioOf: 'la radio étudiante {of}',
    paperOf: 'le journal étudiant {of}',
    seeAll: 'Voir tous les médias étudiants du Québec',
    backHome: 'Retour à l’accueil de LE-RADAR.ca',
    unofficial: 'LE-RADAR.ca est un projet indépendant et non officiel. Il n’est affilié à aucun des médias ni des établissements recensés. Les contenus appartiennent à leurs publications d’origine.',
    updated: 'Mise à jour',
    otherLang: 'English',
    noRadio: 'Aucune radio de campus recensée pour cet établissement.',
    noPaper: 'Aucun journal étudiant recensé pour cet établissement.',
    days: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
  },
  en: {
    lang: 'en-CA',
    tagline: TAGLINE_EN,
    home: 'Home',
    directory: 'Student media',
    directoryTitle: 'Québec student media — campus newspapers and radio stations',
    directoryDesc: 'Directory of student newspapers and campus radio stations at Québec CEGEPs and universities: {n} publications and {r} stations, listed by institution.',
    directoryH1: 'Student media in Québec',
    radios: 'Campus radio stations',
    newspapers: 'Student newspapers',
    institutions: 'Institutions',
    listenLive: 'Listen live on LE-RADAR.ca',
    officialSite: 'Official website',
    frequency: 'Frequency',
    institution: 'Institution',
    city: 'City',
    region: 'Region',
    language: 'Language',
    type: 'Type',
    university: 'University',
    cegep: 'CEGEP',
    french: 'French',
    english: 'English',
    latestHeadlines: 'Latest articles',
    readOnSource: 'Every headline links to the original article on the publication’s own site.',
    noHeadlines: 'No recent articles as of the last update.',
    schedule: 'On air this week',
    scheduleNote: 'Schedule collected automatically from the station’s website; it may change.',
    mediaOf: 'Student media at {name}',
    mediaOfDesc: 'The student newspapers and campus radio of {name}: who they are, where to read and listen to them.',
    radioOf: 'the campus radio station of {name}',
    paperOf: 'the student newspaper of {name}',
    seeAll: 'Browse all student media in Québec',
    backHome: 'Back to the LE-RADAR.ca home page',
    unofficial: 'LE-RADAR.ca is an independent, unofficial project. It is not affiliated with any of the media outlets or institutions listed. All content belongs to its original publisher.',
    updated: 'Updated',
    otherLang: 'Français',
    noRadio: 'No campus radio station listed for this institution.',
    noPaper: 'No student newspaper listed for this institution.',
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  },
};

function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (values[k] ?? ''));
}

/**
 * Contractions françaises devant un nom d'établissement.
 *
 * « de » + « Université Laval » donne « de l'Université Laval », pas
 * « de Université Laval » ; « Cégep » est masculin et prend « du » / « au ».
 * Les noms propres anglais (McGill University, Dawson College) restent nus.
 */
function frOf(name = '') {
  const n = String(name).trim();
  if (/^Universit[ée]/i.test(n)) return `de l’${n}`;
  if (/^(École|Ecole|Institut)/i.test(n)) return `de l’${n}`;
  if (/^C[ée]gep/i.test(n)) return `du ${n}`;
  return `de ${n}`;
}

/**
 * Accord en nombre. « journal » fait « journaux », pas « journalux » : les
 * pluriels irréguliers doivent être donnés en entier, pas fabriqués par
 * concaténation de suffixe.
 */
function plural(n, one, many) {
  return `${n} ${n > 1 ? many : one}`;
}

function frAt(name = '') {
  const n = String(name).trim();
  if (/^Universit[ée]/i.test(n)) return `à l’${n}`;
  if (/^(École|Ecole|Institut)/i.test(n)) return `à l’${n}`;
  if (/^C[ée]gep/i.test(n)) return `au ${n}`;
  return `à ${n}`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Gabarit
// ═══════════════════════════════════════════════════════════════════════════

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' "
  + 'https://fonts.googleapis.com; font-src \'self\' https://fonts.gstatic.com; '
  + "img-src 'self' data: https:; connect-src 'none'; frame-src 'none'; "
  + "object-src 'none'; base-uri 'self'; form-action 'none'";

/**
 * Rend une page complète.
 *
 * `path` est relatif à la racine du site et se termine par `/` (ex.
 * `radios/chyz/`). La profondeur en découle et donne le préfixe des liens
 * relatifs — les pages doivent fonctionner aussi bien sur GitHub Pages que
 * derrière le domaine.
 */
function renderPage({
  lang, path, altPath, title, description, h1, eyebrow, crumbs = [],
  bodyHtml, jsonLd, siteBase, updated,
}) {
  const t = T[lang];
  const depth = path.split('/').filter(Boolean).length;
  const up = depth === 0 ? './' : '../'.repeat(depth);
  const canonical = `${siteBase}/${path}`;
  const altUrl = `${siteBase}/${altPath}`;
  const frUrl = lang === 'fr' ? canonical : altUrl;

  const crumbHtml = crumbs.length
    ? `<nav class="seo-crumbs" aria-label="${lang === 'fr' ? 'Fil d’Ariane' : 'Breadcrumb'}">`
      + crumbs.map((c) => (c.href
        ? `<a href="${escapeHtml(c.href)}">${escapeHtml(c.label)}</a>`
        : `<span aria-current="page">${escapeHtml(c.label)}</span>`)).join('<span class="seo-crumbs__sep" aria-hidden="true">›</span>')
      + '</nav>'
    : '';

  return `<!doctype html>
<html lang="${t.lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />
    <title>${escapeHtml(title)}</title>
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <link rel="alternate" hreflang="fr-CA" href="${escapeHtml(lang === 'fr' ? canonical : altUrl)}" />
    <link rel="alternate" hreflang="en-CA" href="${escapeHtml(lang === 'en' ? canonical : altUrl)}" />
    <!-- x-default → français : c'est la langue principale du projet. -->
    <link rel="alternate" hreflang="x-default" href="${escapeHtml(frUrl)}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:locale" content="${lang === 'fr' ? 'fr_CA' : 'en_CA'}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${siteBase}/assets/og-cover.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${siteBase}/assets/og-cover.png" />

    <link rel="icon" href="${up}assets/icon-32.png" type="image/png" sizes="32x32" />
    <link rel="icon" href="${up}assets/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="${up}assets/icon-192.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="${up}style.css" />
    <link rel="stylesheet" href="${up}seo-pages.css" />
    <script src="${up}seo-page-theme.js"></script>
${jsonLd ? `    <script type="application/ld+json">${jsonLd}</script>\n` : ''}  </head>
  <body>
    <header class="masthead">
      <div class="masthead-inner">
        <div class="masthead-brand">
          <a href="${up}" class="wordmark">
            <span class="wordmark-mark"><img class="wordmark-logo" src="${up}assets/icon.svg" width="48" height="48" alt="" aria-hidden="true"><span class="wordmark-brand notranslate" translate="no">LE-RADAR.ca</span></span>
            <span class="wordmark-full">${escapeHtml(t.tagline)}</span>
          </a>
        </div>
      </div>
    </header>

    <main class="wire seo-wire">
      ${crumbHtml}
      ${eyebrow ? `<p class="seo-eyebrow">${escapeHtml(eyebrow)}</p>` : ''}
      <h1 class="seo-title">${escapeHtml(h1)}</h1>
${bodyHtml}
      <footer class="site-foot">
        <p>${escapeHtml(t.unofficial)}</p>
        <p><a href="${up}">${escapeHtml(t.backHome)}</a></p>
        <p class="seo-foot-meta">
          <a href="${up}${altPath}" hreflang="${lang === 'fr' ? 'en-CA' : 'fr-CA'}">${escapeHtml(t.otherLang)}</a>${updated ? ` · ${escapeHtml(t.updated)} ${escapeHtml(updated)}` : ''}
        </p>
      </footer>
    </main>
  </body>
</html>
`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Fragments de contenu
// ═══════════════════════════════════════════════════════════════════════════

function factsList(rows) {
  const items = rows.filter((r) => r && r.value).map((r) => {
    const value = r.href
      ? `<a href="${escapeHtml(r.href)}"${r.external ? ' rel="noopener"' : ''}>${escapeHtml(r.value)}</a>`
      : escapeHtml(r.value);
    return `          <div class="seo-fact"><dt>${escapeHtml(r.label)}</dt><dd>${value}</dd></div>`;
  });
  return items.length ? `      <dl class="seo-facts">\n${items.join('\n')}\n      </dl>\n` : '';
}

function headlineList(items, t) {
  if (!items.length) return `      <p class="seo-empty">${escapeHtml(t.noHeadlines)}</p>\n`;
  const rows = items.map((it) => {
    const date = it.date ? new Date(it.date) : null;
    const iso = date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '';
    return `          <li class="seo-headline">`
      + `<a href="${escapeHtml(it.link)}" rel="noopener">${escapeHtml(it.title)}</a>`
      + (iso ? `<time datetime="${iso}">${iso}</time>` : '')
      + (it.author ? `<span class="seo-headline__by">${escapeHtml(it.author)}</span>` : '')
      + '</li>';
  });
  return `      <ul class="seo-headlines">\n${rows.join('\n')}\n      </ul>\n`
    + `      <p class="seo-note">${escapeHtml(t.readOnSource)}</p>\n`;
}

function cardGrid(cards) {
  if (!cards.length) return '';
  const items = cards.map((c) => `          <li class="seo-card">`
    + `<a href="${escapeHtml(c.href)}"><span class="seo-card__name">${escapeHtml(c.name)}</span>`
    + (c.meta ? `<span class="seo-card__meta">${escapeHtml(c.meta)}</span>` : '')
    + '</a></li>').join('\n');
  return `      <ul class="seo-cards">\n${items}\n      </ul>\n`;
}

function scheduleTable(grid, t) {
  if (!grid || !grid.length) return '';
  const byDay = new Map();
  for (const slot of grid) {
    if (!byDay.has(slot.day)) byDay.set(slot.day, []);
    byDay.get(slot.day).push(slot);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const blocks = days.map((day) => {
    const slots = byDay.get(day)
      .slice()
      .sort((a, b) => String(a.start).localeCompare(String(b.start)))
      .slice(0, 8)
      .map((s) => `            <li><time>${escapeHtml(s.start)}</time> ${escapeHtml(s.title || '')}</li>`)
      .join('\n');
    return `        <div class="seo-day">\n          <h3>${escapeHtml(t.days[day] || '')}</h3>\n          <ul>\n${slots}\n          </ul>\n        </div>`;
  });
  return `      <section class="seo-section">\n        <h2>${escapeHtml(t.schedule)}</h2>\n`
    + `      <div class="seo-schedule">\n${blocks.join('\n')}\n      </div>\n`
    + `      <p class="seo-note">${escapeHtml(t.scheduleNote)}</p>\n      </section>\n`;
}

module.exports = {
  SITE_NAME,
  T,
  escapeHtml,
  slugify,
  normKey,
  isoDay,
  canonicalInstitution,
  INSTITUTIONS,
  fill,
  frOf,
  plural,
  frAt,
  renderPage,
  factsList,
  headlineList,
  cardGrid,
  scheduleTable,
};

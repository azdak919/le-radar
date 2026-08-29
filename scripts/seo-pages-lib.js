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
const TAGLINE_FR = 'Journaux, radios et sports étudiants du Québec, réunis au même endroit';
const TAGLINE_EN = 'Québec student newspapers, campus radio and sports, all in one place';
/** Coupure bureau : 2ᵉ ligne = « réunis… » / « all in one place » seul. */
const TAGLINE_FR_LEAD = 'Journaux, radios et sports étudiants du Québec,';
const TAGLINE_FR_TAG = 'réunis au même endroit';
const TAGLINE_EN_LEAD = 'Québec student newspapers, campus radio and sports,';
const TAGLINE_EN_TAG = 'all in one place';

/** Marque publique et signature institutionnelle du pied de page.
 *  La signature reste en français sur le volet anglais : c'est un nom propre. */
const BRAND_NAME = 'LE-RADAR.ca';
const BRAND_SIGNATURE = 'Le Réseau Académique de Découverte et d’Agrégation de Ressources';

const LICENSE_URL = 'https://www.gnu.org/licenses/old-licenses/gpl-2.0.html';
const COFFEE_URL = 'https://www.buymeacoffee.com/azdak';
const CONTACT_MAIL = 'azdak-qc@proton.me';
const CONTACT_URL = `mailto:${CONTACT_MAIL}`;

/** Le tuner natif a une seule source : le balisage de l'accueil.
 * Les pages SEO le recopient à la génération, jamais dans un iframe. */
/**
 * CSS critique du synthé (copie de index.html) — FOUC sur pages SEO sans ce bloc.
 * Sans lui, la colonne « À l'antenne » peut rester figée / mal calée avant style.css.
 */
const WIDE_LAYOUT_ASSET_V = 'wide-auto-e99';

function renderWideLayoutAssets(up) {
  return `    <link rel="stylesheet" href="${up}dev/midwidth-preview.css?v=${WIDE_LAYOUT_ASSET_V}" />
    <link rel="stylesheet" href="${up}dev/wide-desktop-preview.css?v=${WIDE_LAYOUT_ASSET_V}" />
    <script src="${up}dev/midwidth-preview.js?v=${WIDE_LAYOUT_ASSET_V}"></script>
    <script src="${up}dev/wide-desktop-preview.js?v=${WIDE_LAYOUT_ASSET_V}"></script>
`;
}

function renderTunerCriticalCss() {
  return `    <!--
      CSS critique du synthé bureau : réserve « À l'antenne » + volume compact
      dès le premier paint (avant le CSS mis en cache / le JS async).
    -->
    <style>
      @media (min-width: 1100px) {
        .tuner-inner {
          display: grid !important;
          grid-template-columns: minmax(0, 1.15fr) minmax(300px, 370px) !important;
          gap: 0 !important;
          align-items: center !important;
          max-width: 1180px;
        }
        .tuner-controls { grid-column: 1; min-width: 0; }
        .tuner-actions { margin-left: 0 !important; flex-shrink: 0; }
        .tuner-nowair {
          grid-column: 2;
          display: flex !important;
          flex-direction: row !important;
          align-items: flex-start !important;
          gap: 10px;
          width: 100% !important;
          min-width: 0;
          padding-left: 20px;
          border-left: none !important;
          opacity: 1 !important;
          pointer-events: auto !important;
          box-sizing: border-box;
        }
        .tuner-nowair-body {
          flex: 1 1 auto !important;
          min-width: 0 !important;
          opacity: 1 !important;
        }
        .tuner-vol {
          flex: 0 0 auto !important;
          max-width: 168px !important;
          min-width: 0 !important;
        }
        .tuner-vol-slot {
          display: flex !important;
          align-items: center;
          max-width: 120px !important;
        }
        .tuner-vol-track {
          width: 112px !important;
          max-width: 112px !important;
          min-width: 96px !important;
          flex: 0 0 112px !important;
        }
      }
    </style>
`;
}

function renderNativeTuner() {
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const source = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  const start = source.indexOf('    <div id="tuner" class="tuner">');
  const end = source.indexOf('\n\n    <!-- Repli mobile', start);
  if (start < 0 || end < 0) throw new Error('Fragment du tuner natif introuvable dans index.html');
  // Audio hors fragment d’accueil : requis pour le même cycle « À l'antenne » / lecture.
  const audio = '    <!-- Lecteur natif : requis pour la lecture en arrière-plan (écran verrouillé). -->\n'
    + '    <audio id="radar-player" class="sr-only" preload="none" playsinline webkit-playsinline x-webkit-airplay="allow" aria-hidden="true"></audio>\n';
  return `${source.slice(start, end)}\n\n${audio}`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Utilitaires
// ═══════════════════════════════════════════════════════════════════════════

/** Attributs des liens hors site : nouvel onglet + isolation tabnabbing. */
const EXTERNAL_LINK_ATTRS = ' target="_blank" rel="noopener noreferrer"';

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

/**
 * Horodatage exact (date + heure + fuseau) à l’heure du Québec.
 * Les lecteurs de tableaux sportifs univ. (athlètes, parents, journalistes campus)
 * exigent de savoir si le refresh nocturne a déjà pris les scores de la soirée —
 * un jour civil seul ne suffit pas. `machine` = ISO pour <time datetime>.
 */
function sportsUpdatedStamp(value, lang = 'fr') {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const isEn = lang === 'en' || lang === 'en-CA';
  const locale = isEn ? 'en-CA' : 'fr-CA';
  const day = date.toLocaleDateString(locale, {
    timeZone: 'America/Toronto',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const clock = date.toLocaleTimeString(locale, isEn
    ? {
      timeZone: 'America/Toronto',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }
    : {
      timeZone: 'America/Toronto',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short',
    });
  // fr-CA peut rendre « 22:27 » ou « 22 h 27 » selon le runtime : normaliser.
  const renderedClock = isEn ? clock : clock.replace(/(\d{1,2}):(\d{2})/, '$1 h $2');
  return {
    machine: date.toISOString(),
    label: `${day} · ${renderedClock}`,
  };
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
 * Établissements canoniques — D10 : dérivés de institutions.json
 * (scripts/institution-labels-lib.js). Les registres n'écrivent pas les noms
 * de la même façon ; sans regroupement on générerait des pages concurrentes.
 */
const { buildSeoInstitutions } = require('./institution-labels-lib');
const INSTITUTIONS = buildSeoInstitutions();

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

/** Nom adapté à la langue de la page, sans modifier les données sources.
 * Une page EN garde toujours la forme officielle anglaise ; en FR, seuls les
 * établissements dont le nom source est anglais reçoivent leur forme usuelle
 * française. */
function localizedInstitutionName(institution, lang = 'fr') {
  const entry = typeof institution === 'object' && institution
    ? institution
    : canonicalInstitution(institution);
  if (!entry) return '';
  return lang === 'fr' ? (entry.nameFr || entry.name) : entry.name;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Chaînes bilingues
// ═══════════════════════════════════════════════════════════════════════════

const T = {
  fr: {
    lang: 'fr-CA',
    tagline: TAGLINE_FR,
    taglineLead: TAGLINE_FR_LEAD,
    taglineTag: TAGLINE_FR_TAG,
    home: 'Accueil',
    directory: 'Les médias étudiants',
    directoryTitle: 'Les médias étudiants du Québec — journaux et radios de campus',
    directoryDesc: 'Annuaire des journaux étudiants et des radios de campus des cégeps et universités du Québec : {n} publications et {r} stations, classés par langue et mis à jour automatiquement.',
    directoryH1: 'Les médias étudiants du Québec',
    directoryToc: 'Sur cette page',
    directoryNewspapersLead: 'Publications classées par langue, de la plus récemment active à la plus ancienne. La date du dernier article est recalculée à chaque collecte.',
    directoryRadiosLead: 'Stations de campus recensées. Les grilles horaires sont colligées automatiquement.',
    directoryInstitutionsLead: 'Établissements qui abritent au moins un journal ou une radio recensés sur LE-RADAR.ca.',
    directoryArchivesLead: 'Articles plus anciens, classés par publication, avec lien vers le site d’origine.',
    browseSchedulesCta: 'Voir les horaires des radios',
    browseArchivesCta: 'Consulter les archives des journaux',
    universities: 'Universités',
    cegepsColleges: 'Cégeps et collèges',
    radios: 'Radios étudiantes',
    newspapers: 'Journaux étudiants',
    institutions: 'Établissements',
    browseSchedules: 'Choisir une autre radio',
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
    latestArticleStatus: 'Dernier article : {date}',
    sourceStaleStatus: 'Vérifiée le {date}',
    byline: 'Par',
    readMore: 'Lire la suite →',
    /** CTA fil vivant (fenêtre de fraîcheur : session en cours + 2 précédentes). */
    allRecentArticles: 'Voir les articles les plus récents',
    viewArchives: 'Voir les archives',
    noRecentInWindow: 'Aucun article publié dans la fenêtre de fraîcheur (session universitaire en cours et les deux précédentes).',
    noHeadlines: 'Aucun article récent au moment de la dernière mise à jour.',
    schedule: 'À l’antenne cette semaine',
    scheduleLive: 'À l’antenne',
    scheduleUpcoming: 'À venir',
    scheduleNote: 'Grille colligée automatiquement à partir du site de la station ; elle peut varier.',
    schedulesNote: 'Les grilles viennent des sites des stations ; elles peuvent changer.',
    scheduleWeek: 'Semaine du',
    scheduleUpdated: 'MAJ le',
    overnight: 'de nuit',
    noSlots: 'Aucune émission annoncée.',
    schedules: 'Les horaires des radios étudiantes',
    schedulesTitle: 'Horaires des radios étudiantes du Québec — grilles de la semaine',
    schedulesDesc: 'Les grilles horaires des {r} radios étudiantes des cégeps et universités du Québec, colligées automatiquement et réunies au même endroit.',
    schedulesH1: 'Les horaires des radios étudiantes du Québec',
    schedulesLead: 'Ce qui joue cette semaine sur les radios de campus, à l’heure du Québec.',
    schedulesEmpty: 'Aucune grille horaire disponible au moment de la dernière mise à jour.',
    sports: 'Sports',
    /** Pied de page seulement (focus-group le-radar-footer-sports) — pas le H1/CTA. */
    sportsFooter: 'Sports',
    sportsTitle: 'Sports collégiaux et universitaires du Québec',
    sportsDesc: 'Scores et prochains matchs de {n} formations collégiales et universitaires du Québec (catalogue RSEQ) : hockey, football, soccer, basketball, volleyball, badminton, natation et plus.',
    sportsH1: 'Sports collégiaux et universitaires du Québec',
    sportsLead: '',
    sportsEmpty: 'Aucun résultat sportif disponible au moment de la dernière mise à jour.',
    sportsClubPending: 'Association étudiante de voile — scores à venir.',
    sportsMeta: '',
    sportsScrollTop: 'Haut de page',
    sportsPriorSeason: 'Saison précédente',
    sportsSearchLabel: 'Rechercher une équipe, un établissement, un sport…',
    sportsSearchTitle: 'Rechercher',
    sportsSearchPlaceholder: 'Équipe, institution, sport, code…',
    sportsSearchClear: 'Effacer la recherche',
    sportsSearchHint: 'Recherche locale : noms d’équipes, institutions, sports, codes et secteurs.',
    sportsHockeyLabel: 'Hockey',
    sportsHockeyWhy: 'Le hockey collégial et universitaire se consulte sur les calendriers officiels RSEQ Hockey et, pour le masculin universitaire, sur l’OUA (U Sports).',
    sportsHockeyColl: 'Hockey collégial (RSEQ)',
    sportsHockeyUniM: 'Hockey universitaire masculin (OUA / U Sports)',
    sportsHockeyUniF: 'Hockey universitaire féminin (RSEQ stats)',
    sportsHockeyOpen: 'Ouvrir le site officiel',
    sportsSailingLabel: 'Voile',
    sportsSailingWhy: 'La voile universitaire au Québec (McGill et clubs campus) se dispute surtout en régates ICSA / NEISA. Les équipages hors Québec ne sont pas affichés.',
    sportsSailingIcsa: 'Scores College Sailing (ICSA)',
    sportsSailingMcgill: 'Voile McGill Athletics',
    sportsSailingNeisa: 'Conférence NEISA',
    sportsRegatta: 'régate',
    sportsPlace: 'Place',
    sportsBoardsOnly: 'Tableaux officiels (liens)',
    sportsFilterSport: 'Sport',
    sportsFilterSector: 'Secteur',
    sportsFilterSex: 'Catégorie',
    sportsFilterPeriod: 'Période',
    sportsPeriodAll: 'Toutes',
    sportsPeriodLive: 'En direct',
    sportsLive: 'En direct',
    sportsPeriodWeek: 'Cette semaine',
    sportsPeriodNextWeek: 'Semaine prochaine',
    sportsPeriodMonth: 'Ce mois-ci',
    sportsPeriodSession: 'Cette session',
    sportsEmptyLive: 'Aucun match en direct.',
    sportsEmptyWeek: 'Aucun match cette semaine.',
    sportsEmptyNextWeek: 'Aucun match la semaine prochaine.',
    sportsEmptyMonth: 'Aucun match ce mois-ci.',
    sportsEmptySession: 'Aucun match cette session.',
    sportsWomen: 'Féminin',
    sportsMen: 'Masculin',
    sportsWomenShort: 'Fém.',
    sportsMenShort: 'Masc.',
    sportsMixed: 'Ouvert / mixte',
    sportsMixedShort: 'Mixte',
    sportsAll: 'Tous',
    sportsCollegial: 'Collégial',
    sportsUniversity: 'Universitaire',
    sportsTeams: 'entrées',
    sportsTeamOne: 'entrée',
    sportsUpcoming: 'À venir',
    sportsToday: 'Aujourd’hui',
    sportsYesterday: 'Hier',
    sportsTomorrow: 'Demain',
    sportsGold: 'Or',
    sportsSilver: 'Argent',
    sportsBronze: 'Bronze',
    sportsWin: 'Victoire',
    sportsLoss: 'Défaite',
    sportsDraw: 'Nul',
    sportsHome: 'domicile',
    sportsAway: 'extérieur',
    sportsRecord: 'Fiche',
    sportsOpenGame: 'Ouvrir la source officielle',
    slotsCount: 'créneaux',
    slotsCountOne: 'créneau',
    collectedOn: 'MAJ le',
    mediaOf: 'Les médias étudiants {of}',
    mediaOfDesc: 'Les journaux étudiants et la radio de campus {of} : qui ils sont, où les lire et les écouter.',
    radioOf: 'la radio étudiante {of}',
    paperOf: 'le journal étudiant {of}',
    seeAll: 'Voir tous les médias étudiants du Québec',
    backHome: 'Retour à l’accueil de LE-RADAR.ca',
    unofficial: 'LE-RADAR.ca est un projet indépendant et non officiel. Il n’est affilié à aucun des médias ni des établissements recensés. Les contenus appartiennent à leurs publications d’origine.',
    updated: 'Mise à jour',
    otherLang: 'English',
    footerNav: 'Liens de pied de page',
    footerDetails: 'À propos de LE-RADAR.ca',
    footerDirectory: 'Médias',
    footerNewspapers: 'Journaux',
    footerSchedules: 'Radios',
    archives: 'Archives',
    kitMedia: 'Kit média',
    licenseIntro: 'Ce projet est distribué sous',
    licenseName: 'licence publique générale GNU, version 2',
    sourceCode: 'Code source (GitHub)',
    creditMade: 'Conçu avec',
    creditBy: 'par',
    creditYear: 'en 2026',
    creditHeart: 'Ouvrir l’easter egg',
    creditCoffee: 'Offrir un café — Buy me a coffee',
    contactLabel: 'Nous joindre',
    contactAria: 'Nous joindre par courriel',
    legalNote: 'Code libre utilisé conformément aux licences applicables; contenus et médias crédités à leurs auteurs respectifs.',
    botNote: 'Agrégateur automatisé de contenus.',
    noRadio: 'Aucune radio de campus recensée pour cet établissement.',
    noPaper: 'Aucun journal étudiant recensé pour cet établissement.',
    days: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
  },
  en: {
    lang: 'en-CA',
    tagline: TAGLINE_EN,
    taglineLead: TAGLINE_EN_LEAD,
    taglineTag: TAGLINE_EN_TAG,
    home: 'Home',
    directory: 'Student media',
    directoryTitle: 'Québec student media — campus newspapers and radio stations',
    directoryDesc: 'Directory of student newspapers and campus radio stations at Québec CEGEPs and universities: {n} publications and {r} stations, grouped by language and updated automatically.',
    directoryH1: 'Student media in Québec',
    directoryToc: 'On this page',
    directoryNewspapersLead: 'Publications grouped by language, from the most recently active to the oldest. The latest-article date is recalculated on every feed collection.',
    directoryRadiosLead: 'Listed campus stations. Schedules are collected automatically.',
    directoryInstitutionsLead: 'Institutions that host at least one newspaper or radio station listed on LE-RADAR.ca.',
    directoryArchivesLead: 'Older articles, listed by publication, each linking back to the original site.',
    browseSchedulesCta: 'Browse radio schedules',
    browseArchivesCta: 'Browse newspaper archives',
    universities: 'Universities',
    cegepsColleges: 'CEGEPs and colleges',
    radios: 'Campus radio stations',
    newspapers: 'Student newspapers',
    institutions: 'Institutions',
    browseSchedules: 'Choose another station',
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
    latestArticleStatus: 'Latest article: {date}',
    sourceStaleStatus: 'Checked {date}',
    byline: 'By',
    readMore: 'Read more →',
    allRecentArticles: 'View the most recent articles',
    viewArchives: 'View the archives',
    noRecentInWindow: 'No articles published in the freshness window (current university term and the two before it).',
    noHeadlines: 'No recent articles as of the last update.',
    schedule: 'On air this week',
    scheduleLive: 'On air',
    scheduleUpcoming: 'Up next',
    scheduleNote: 'Schedule collected automatically from the station’s website; it may change.',
    schedulesNote: 'Grids come from each station’s website; they may change.',
    scheduleWeek: 'Week of',
    scheduleUpdated: 'Updated',
    overnight: 'overnight',
    noSlots: 'No scheduled shows.',
    schedules: 'Campus radio schedules',
    schedulesTitle: 'Québec campus radio schedules — this week’s line-up',
    schedulesDesc: 'Weekly schedules for the {r} campus radio stations at Québec CEGEPs and universities, collected automatically and gathered in one place.',
    schedulesH1: 'Québec campus radio schedules',
    schedulesLead: 'What’s on this week at the campus stations, in Québec time.',
    schedulesEmpty: 'No schedule available as of the last update.',
    sports: 'Sports',
    /** Footer only (same decision as FR sportsFooter). */
    sportsFooter: 'Sports',
    sportsTitle: 'Québec CEGEP and university sports',
    sportsDesc: 'Scores and upcoming games for {n} CEGEP and university teams in Québec (RSEQ catalog): hockey, football, soccer, basketball, volleyball, badminton, swimming and more.',
    sportsH1: 'Québec CEGEP and university sports',
    sportsLead: '',
    sportsEmpty: 'No sports results available as of the last update.',
    sportsClubPending: 'Student sailing association — scores coming soon.',
    sportsMeta: '',
    sportsScrollTop: 'Back to top',
    sportsPriorSeason: 'Previous season',
    sportsSearchLabel: 'Search teams, institutions, sports…',
    sportsSearchTitle: 'Search',
    sportsSearchPlaceholder: 'Team, school, sport, code…',
    sportsSearchClear: 'Clear search',
    sportsSearchHint: 'Local search: team names, institutions, sports, codes and sectors.',
    sportsHockeyLabel: 'Hockey',
    sportsHockeyWhy: 'CEGEP and university hockey schedules live on RSEQ Hockey and, for men’s university hockey, on the OUA (U Sports).',
    sportsHockeyColl: 'CEGEP hockey (RSEQ)',
    sportsHockeyUniM: 'Men’s university hockey (OUA / U Sports)',
    sportsHockeyUniF: 'Women’s university hockey (RSEQ stats)',
    sportsHockeyOpen: 'Open official site',
    sportsSailingLabel: 'Sailing',
    sportsSailingWhy: 'University sailing in Québec (McGill and campus clubs) is mainly ICSA / NEISA. Non-Québec crews are not shown.',
    sportsSailingIcsa: 'College Sailing scores (ICSA)',
    sportsSailingMcgill: 'McGill Athletics sailing',
    sportsSailingNeisa: 'NEISA conference',
    sportsRegatta: 'regatta',
    sportsPlace: 'Place',
    sportsBoardsOnly: 'Official boards (links)',
    sportsFilterSport: 'Sport',
    sportsFilterSector: 'Sector',
    sportsFilterSex: 'Category',
    sportsFilterPeriod: 'Period',
    sportsPeriodAll: 'All',
    sportsPeriodLive: 'Live',
    sportsLive: 'Live',
    sportsPeriodWeek: 'This week',
    sportsPeriodNextWeek: 'Next week',
    sportsPeriodMonth: 'This month',
    sportsPeriodSession: 'This term',
    sportsEmptyLive: 'No games in progress.',
    sportsEmptyWeek: 'No games this week.',
    sportsEmptyNextWeek: 'No games next week.',
    sportsEmptyMonth: 'No games this month.',
    sportsEmptySession: 'No games this term.',
    sportsWomen: 'Women’s',
    sportsMen: 'Men’s',
    sportsWomenShort: 'W',
    sportsMenShort: 'M',
    sportsMixed: 'Open / mixed',
    sportsMixedShort: 'Mixed',
    sportsAll: 'All',
    sportsCollegial: 'CEGEP',
    sportsUniversity: 'University',
    sportsTeams: 'entries',
    sportsTeamOne: 'entry',
    sportsUpcoming: 'Upcoming',
    sportsToday: 'Today',
    sportsYesterday: 'Yesterday',
    sportsTomorrow: 'Tomorrow',
    sportsGold: 'Gold',
    sportsSilver: 'Silver',
    sportsBronze: 'Bronze',
    sportsWin: 'Win',
    sportsLoss: 'Loss',
    sportsDraw: 'Draw',
    sportsHome: 'home',
    sportsAway: 'away',
    sportsRecord: 'Record',
    sportsOpenGame: 'Open official source',
    slotsCount: 'slots',
    slotsCountOne: 'slot',
    collectedOn: 'updated',
    mediaOf: 'Student media at {name}',
    mediaOfDesc: 'The student newspapers and campus radio of {name}: who they are, where to read and listen to them.',
    radioOf: 'the campus radio station of {name}',
    paperOf: 'the student newspaper of {name}',
    seeAll: 'Browse all student media in Québec',
    backHome: 'Back to the LE-RADAR.ca home page',
    unofficial: 'LE-RADAR.ca is an independent, unofficial project. It is not affiliated with any of the media outlets or institutions listed. All content belongs to its original publisher.',
    updated: 'Updated',
    otherLang: 'Français',
    footerNav: 'Footer links',
    footerDetails: 'About LE-RADAR.ca',
    footerDirectory: 'Media',
    footerNewspapers: 'Newspapers',
    footerSchedules: 'Radio',
    archives: 'Archives',
    kitMedia: 'Media kit',
    licenseIntro: 'This project is distributed under the',
    licenseName: 'GNU General Public License, version 2',
    sourceCode: 'Source code (GitHub)',
    creditMade: 'Made with',
    creditBy: 'by',
    creditYear: 'in 2026',
    creditHeart: 'Open the easter egg',
    creditCoffee: 'Buy me a coffee',
    contactLabel: 'Contact us',
    contactAria: 'Contact us by email',
    legalNote: 'Open-source code used in accordance with the applicable licences; content and media credited to their respective authors.',
    botNote: 'Automated content aggregator.',
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

// Aligné sur l'accueil pour le lecteur natif : sans media-src, default-src
// 'self' bloque les flux Icecast/Shoutcast HTTPS → play silencieux sur les
// fiches SEO. gstatic = Cast SDK optionnel (cast.js).
const CSP = "default-src 'self'; "
  + "script-src 'self' https://www.gstatic.com blob:; "
  + "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
  + "font-src 'self' https://fonts.gstatic.com; "
  + "img-src 'self' data: https:; "
  + "media-src 'self' https: blob:; "
  + "connect-src 'self' blob: https://le-radar-weather.azdak.workers.dev https://le-radar-nowplaying.azdak.workers.dev https://le-radar-bg-rotation.azdak.workers.dev https://cloud.umami.is https://gateway.umami.is https://translate.googleapis.com https://api.mymemory.translated.net; "
  + "frame-src 'self' https://chyz.ca https://cism893.ca https://ckut.ca https://www.cjlo.com https://www.cfak.ca https://www.choq.ca; "
  + "object-src 'none'; base-uri 'self'; form-action 'none'";

/**
 * Rangée d'actions du mât — SOURCE DE VÉRITÉ UNIQUE.
 *
 * POURQUOI ICI
 * Même raison que le pied de page, un cran plus haut dans la page. La rangée
 * existait en trois versions : `index.html` et `feeds.html` la portaient à la
 * main avec six pastilles, tandis que les pages d'entités n'avaient que la
 * bascule de thème. Ajouter une icône demandait donc trois modifications, et
 * les 107 pages générées restaient systématiquement en arrière.
 *
 * Les pages générées l'obtiennent par `renderPage()`; `index.html` et
 * `feeds.html` via les marqueurs `RADAR:CHROME:ACTIONS` que `generate-seo.js`
 * remplit — exactement le mécanisme déjà en place pour `RADAR:FOOTER`.
 *
 * `current` marque la page courante (`home`, `rss`, `sports`…) pour poser
 * `aria-current="page"`. `compact` sert aux pages d'entités, dont la rangée
 * est positionnée en absolu et n'a ni date ni météo à côté d'elle.
 */
const CHROME_T = {
  fr: {
    home: 'Accueil',
    homeAria: 'Accueil — LE-RADAR.ca',
    rss: 'Flux RSS',
    rssAria: 'S’abonner au flux RSS de LE-RADAR.ca',
    pomo: 'Pomodoro — minuteur focus',
    solitaire: 'Solitaire',
    sports: 'Sports — scores collégiaux et universitaires',
    coffee: 'Offrir un café',
    coffeeAria: 'Offrir un café — Buy me a coffee',
    theme: 'Changer de thème',
    themeTitle: 'Mode clair / sombre',
    installMenu: 'Installer une app',
    installMenuAria: 'Installer une app — LE-RADAR, Pomodoro, Solitaire, Sports Étudiants',
    installApp: 'Installer LE-RADAR.ca',
    installAppAria: 'Installer l’app LE-RADAR.ca',
    appRadar: 'LE-RADAR.ca',
    appPomo: 'Pomodoro',
    appSolitaire: 'Solitaire',
    appSports: 'Sports Étudiants',
    appSportsShort: 'Sports',
  },
  en: {
    home: 'Home',
    homeAria: 'Home — LE-RADAR.ca',
    rss: 'RSS feed',
    rssAria: 'Subscribe to the LE-RADAR.ca RSS feed',
    pomo: 'Pomodoro — focus timer',
    solitaire: 'Solitaire',
    sports: 'Sports — Québec college and university scores',
    coffee: 'Buy me a coffee',
    coffeeAria: 'Buy me a coffee',
    theme: 'Change theme',
    themeTitle: 'Light / dark mode',
    installMenu: 'Install an app',
    installMenuAria: 'Install an app — LE-RADAR, Pomodoro, Solitaire, Student Sports',
    installApp: 'Install LE-RADAR.ca',
    installAppAria: 'Install the LE-RADAR.ca app',
    appRadar: 'LE-RADAR.ca',
    appPomo: 'Pomodoro',
    appSolitaire: 'Solitaire',
    appSports: 'Student Sports',
    appSportsShort: 'Sports',
  },
};

/** Les quatre apps installables, dans l'ordre du menu. Doit rester aligné sur
 *  `APPS` de `engage-prompt.js` : même identifiants, même ordre. */
const INSTALL_APPS = [
  { id: 'radar', emoji: 'satellite', key: 'appRadar' },
  { id: 'pomo', emoji: 'tomato', key: 'appPomo' },
  { id: 'solitaire', emoji: 'playing-cards', key: 'appSolitaire' },
  { id: 'sports', emoji: 'trophy', key: 'appSports' },
];

const ICON_SVG = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z"/></svg>',
  rss: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="6.18" cy="17.82" r="2.18"/><path d="M4 4.44v2.83c7.03 0 12.73 5.7 12.73 12.73h2.83C19.56 12.06 12.94 5.44 4 4.44z"/><path d="M4 10.11v2.83c3.9 0 7.07 3.17 7.07 7.07h2.83c0-5.46-4.42-9.9-9.9-9.9z"/></svg>',
  coffee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path fill="none" d="M18 8h1a4 4 0 0 1 0 8h-1"/><path fill="none" d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>'
    + '<line fill="none" x1="6" y1="1" x2="6" y2="4"/><line fill="none" x1="10" y1="1" x2="10" y2="4"/><line fill="none" x1="14" y1="1" x2="14" y2="4"/></svg>',
  install: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
  theme: '<svg class="ico-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>'
    + '<svg class="ico-moon hidden" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
};

/**
 * Menu d'installation multi-apps (déclencheur + panneau).
 *
 * Le panneau est rendu en HTML statique et non construit en JavaScript : sans
 * lui, une personne qui navigue au clavier avec JS coupé verrait un bouton
 * inerte. `engage-prompt.js` ne fait que le câbler.
 *
 * `panelId` doit être unique dans la page — d'où le suffixe passé par les
 * gabarits Pomodoro et Solitaire, qui portent déjà un menu de langue.
 */
/**
 * Menu d'installation — panneau et déclencheur.
 *
 * Le titre visible vient du focus-group `le-radar-install-title` (verdict B) :
 * quatre noms d'apps alignés ne disaient pas qu'on installait. Il reprend mot
 * pour mot l'infobulle du déclencheur — `c.installMenu`, une seule chaîne pour
 * les deux — et sert de nom accessible au panneau via `aria-labelledby`, sinon
 * la lentille d'écran annonce deux fois la même chose.
 */
function renderInstallMenu({ lang = 'fr', up = './', panelId = 'install-menu-panel', toggleClass = 'masthead-icon' } = {}) {
  const c = CHROME_T[lang] || CHROME_T.fr;
  const items = INSTALL_APPS.map((app) => `
          <button type="button" class="install-menu__item" role="menuitem" tabindex="-1" data-install-app="${app.id}">
            <img class="app-emoji" src="${up}assets/emoji/${app.emoji}.png" width="16" height="16" alt="" decoding="async" aria-hidden="true">
            <span>${escapeHtml(c[app.key])}</span>
          </button>`).join('');

  return `<div class="install-menu" data-install-menu>
        <button type="button" class="${toggleClass} install-menu__toggle" data-install-toggle aria-haspopup="menu" aria-expanded="false" aria-controls="${panelId}" title="${escapeHtml(c.installMenu)}" aria-label="${escapeHtml(c.installMenuAria)}">${ICON_SVG.install}</button>
        <div id="${panelId}" class="install-menu__panel" data-install-panel role="menu" aria-labelledby="${panelId}-title" hidden>
          <div class="install-menu__title" id="${panelId}-title">${escapeHtml(c.installMenu)}</div>${items}
        </div>
      </div>`;
}

/**
 * Sections du site — SOURCE DE VÉRITÉ UNIQUE.
 *
 * Le pied de page et le menu de sections de l'accueil tiraient sinon deux
 * listes parallèles, exactement le motif de dérive qu'on vient de corriger
 * ailleurs. `key` pointe vers les libellés courts de `T` (ceux du pied de
 * page) ; les fils d'Ariane gardent les intitulés longs.
 *
 * Accueil figure **à la fois** dans le menu de sections et le pied de page
 * (data-home-nav → scroll + refresh soft sans couper la radio). Ne pas
 * marquer `navOnly` : les bots `seo:update` / prepush réinjectent le pied
 * depuis cette liste — un Accueil nav-only disparaissait à chaque agrégat.
 *
 * `archives` est marquée `footerOnly` : le catalogue historique reste
 * expérimental (dette D19) et n'a pas sa place dans la navigation principale.
 */
const SECTIONS = [
  // Accueil en tête : data-home-nav → app.js scroll + refresh soft du fil
  // sans recharger la page (la radio continue si elle joue).
  { id: 'home', key: 'home', path: { fr: '', en: 'en/' }, attrs: ' data-home-nav' },
  { id: 'medias', key: 'footerDirectory', path: { fr: 'medias/', en: 'en/media/' } },
  // L'annuaire n'a pas de hub « journaux » dédié, mais il porte déjà l'ancre.
  { id: 'journaux', key: 'footerNewspapers', path: { fr: 'medias/#journaux', en: 'en/media/#journaux' } },
  { id: 'radios', key: 'footerSchedules', path: { fr: 'horaires/', en: 'en/schedules/' } },
  // data-sports-reset : depuis /sports/?sport=… recharge sans filtres. Nouvel
  // onglet hors /sports/ pour que la radio continue — sur le tableau,
  // sports-board.js intercepte et reste dans le même onglet.
  {
    id: 'sports',
    key: 'sportsFooter',
    path: { fr: 'sports/', en: 'en/sports/' },
    attrs: ' data-sports-reset target="_blank" rel="noopener noreferrer"',
  },
  { id: 'archives', key: 'archives', path: { fr: 'archives/', en: 'archives/' }, footerOnly: true },
  { id: 'kit', key: 'kitMedia', path: { fr: 'kit-media/', en: 'en/media-kit/' }, footerOnly: true },
];

function sectionLinks({ lang, href, includeFooterOnly = false, includeNavOnly = false, current = null } = {}) {
  const t = T[lang];
  return SECTIONS
    .filter((s) => {
      if (s.footerOnly && !includeFooterOnly) return false;
      if (s.navOnly && !includeNavOnly) return false;
      return true;
    })
    .map((s) => {
      const path = s.path[lang] || s.path.fr || '';
      const cur = current === s.id ? ' aria-current="page"' : '';
      const url = path === '' ? (href('') || './') : href(path);
      return `<a href="${url}"${s.attrs || ''}${cur}>${escapeHtml(t[s.key])}</a>`;
    });
}

/**
 * Menu de sections de l'accueil, sous la barre des scores.
 *
 * Volontairement limité à l'accueil : les pages d'entités portent déjà un fil
 * d'Ariane au même endroit, qui dit en plus la position dans l'arborescence.
 */
function renderSectionNav({ lang = 'fr', up = './', indent = '    ', current = 'home' } = {}) {
  const href = (rel) => (rel ? `${up}${rel}`.replace(/^\.\//, '') : up);
  const sep = '<span class="site-sections__sep" aria-hidden="true">·</span>';
  const items = sectionLinks({ lang, href, includeNavOnly: true, current }).join(`\n${indent}  ${sep}\n${indent}  `);
  const label = lang === 'en' ? 'Site sections' : 'Sections du site';
  return `<nav class="site-sections" aria-label="${label}">
${indent}  ${items}
${indent}</nav>`;
}

function renderMastheadWeather({ lang = 'fr' } = {}) {
  const label = lang === 'en' ? 'Québec weather' : 'Météo du Québec';
  const board = lang === 'en' ? 'Current conditions' : 'Conditions actuelles';
  return `<div id="masthead-weather" class="masthead-weather hidden" aria-label="${escapeHtml(label)}" aria-live="polite">
            <span class="masthead-weather__board" aria-label="${escapeHtml(board)}"></span>
          </div>`;
}

function renderMastheadBoards({ lang = 'fr' } = {}) {
  const sports = lang === 'en'
    ? 'Québec student sports scores'
    : 'Résultats sportifs étudiants du Québec';
  return `    <!-- Repli mobile : quand le masthead n'a plus de place, app.js déplace
         #masthead-weather ici (même carte que sur bureau). -->
    <div id="masthead-weather-dock" class="masthead-weather-dock"></div>

    <!-- Scoreboard RSEQ / unis QC : sous la radio (mobile + bureau). -->
    <div id="masthead-sports-strip" class="masthead-sports-strip" hidden aria-label="${escapeHtml(sports)}" aria-live="polite"></div>
`;
}

function renderMastheadActions({ lang = 'fr', up = './', current = null, indent = '          ' } = {}) {
  const c = CHROME_T[lang] || CHROME_T.fr;
  const p = indent;
  // À la racine `up` vaut './' : on le retire devant un chemin relatif pour
  // écrire « pomo/ » et non « ./pomo/ », la forme attendue par le reste du
  // site et par tests/static-integrity.mjs. Le lien d'accueil garde './'.
  const href = (rel) => (rel ? `${up}${rel}`.replace(/^\.\//, '') : up);
  const cur = (id) => (current === id ? ' aria-current="page"' : '');
  const feedsPath = 'feeds.html';
  const sportsPath = lang === 'fr' ? 'sports/' : 'en/sports/';

  return `<div class="masthead-actions">
${p}  <a href="${href('')}" class="masthead-icon masthead-home" data-home-nav${cur('home')} title="${escapeHtml(c.home)}" aria-label="${escapeHtml(c.homeAria)}">${ICON_SVG.home}</a>
${p}  <a href="${href(feedsPath)}" class="masthead-icon masthead-rss"${cur('rss')} title="${escapeHtml(c.rss)}" aria-label="${escapeHtml(c.rssAria)}">${ICON_SVG.rss}</a>
${p}  <a href="${href('pomo/')}" class="masthead-icon masthead-pomo" title="${escapeHtml(c.pomo)}" aria-label="${escapeHtml(c.pomo)}"><img class="app-emoji" src="${up}assets/emoji/tomato.png" width="16" height="16" alt="" decoding="async" aria-hidden="true"></a>
${p}  <a href="${href('solitaire/')}" class="masthead-icon masthead-solitaire" title="${escapeHtml(c.solitaire)}" aria-label="${escapeHtml(c.solitaire)}"><img class="app-emoji" src="${up}assets/emoji/playing-cards.png" width="16" height="16" alt="" decoding="async" aria-hidden="true"></a>
${p}  <a href="${href(sportsPath)}" class="masthead-icon masthead-sports"${cur('sports')} title="${escapeHtml(c.sports)}" aria-label="${escapeHtml(c.sports)}"><img class="app-emoji" src="${up}assets/emoji/trophy.png" width="16" height="16" alt="" decoding="async" aria-hidden="true"></a>
${p}  <a href="${COFFEE_URL}" class="masthead-icon masthead-coffee" title="${escapeHtml(c.coffee)}" aria-label="${escapeHtml(c.coffeeAria)}" target="_blank" rel="noopener noreferrer">${ICON_SVG.coffee}</a>
${p}  ${renderInstallMenu({ lang, up })}
${p}  <button id="theme-toggle" class="masthead-icon theme-toggle" type="button" aria-label="${escapeHtml(c.theme)}" title="${escapeHtml(c.themeTitle)}">${ICON_SVG.theme}</button>
${p}</div>`;
}

/**
 * Pied de page du site — SOURCE DE VÉRITÉ UNIQUE.
 *
 * POURQUOI ICI
 * Le pied de page existait en quatre versions divergentes : une par page
 * écrite à la main (`index.html`, `feeds.html`, `offline.html`) et une dans ce
 * gabarit pour les pages d'entités. Corriger une mention légale demandait
 * quatre modifications, et la troisième était systématiquement oubliée.
 *
 * Les pages générées l'obtiennent via `renderPage()`; les trois pages
 * statiques via les marqueurs `RADAR:FOOTER` que `generate-seo.js` remplit.
 * Aucun JavaScript de rendu côté navigateur : la garantie « lisible sans JS »
 * des pages d'entités s'applique aussi au pied de page.
 *
 * POURQUOI CES LIENS
 * Annuaire et horaires sont là d'abord pour que les pages générées ne soient
 * pas orphelines : une page sans lien entrant est mal explorée, quoi qu'en
 * dise le sitemap. Le volet anglais n'est jamais choisi automatiquement —
 * translate.js garde la main.
 *
 * `home` pose `aria-current="page"` sur Accueil (le lien reste visible pour
 * scroll + refresh soft via data-home-nav / app.js).
 * `updated` n'est passé que par les pages qui ont une fraîcheur propre.
 */
function renderSiteFooter({
  lang = 'fr', up = './', home = false, altPath = null, updated = null, indent = '      ', variant = 'default',
} = {}) {
  const t = T[lang];
  const p = indent;
  // Les chemins des sections viennent de `SECTIONS` : plus de liste locale.

  // À la racine, `up` vaut './' : on le retire devant un chemin pour écrire
  // « horaires/ » et non « ./horaires/ », la forme que le reste du site et
  // tests/static-integrity.mjs attendent. Seul le lien d'accueil garde './'.
  const href = (rel) => (rel ? `${up}${rel}`.replace(/^\.\//, '') : up);

  // Libellés pris dans CHROME_T et non dans T : les deux volets de langue y
  // sont garantis présents côté source, alors qu'une clé oubliée dans T.en
  // rendrait ici une chaîne vide — donc un bouton sans nom accessible.
  const c = CHROME_T[lang] || CHROME_T.fr;

  const links = [];
  // Accueil en tête (libellé court « Accueil » / « Home ») — même liste que
  // le menu de sections. Plus de phrase longue « Retour à l'accueil… ».
  links.push(...sectionLinks({
    lang,
    href,
    includeFooterOnly: true,
    current: home ? 'home' : null,
  }));
  // `altPath` vaut '' sur /en/ : la version française est la racine du site.
  // Tester la valeur et non sa véracité, sinon le volet anglais perd sa bascule.
  if (altPath !== null && altPath !== undefined) {
    const alt = lang === 'fr' ? 'en-CA' : 'fr-CA';
    links.push(`<a href="${href(altPath)}" hreflang="${alt}">${escapeHtml(t.otherLang)}</a>`);
  }
  // Installer l'app est une destination du pied de page comme les autres, pas
  // un appel à l'action : la pastille pesait plus lourd que les sections
  // qu'elle surplombait. Reste un <button> — c'est une action, pas un lien —
  // mais rendu à l'identique de ses voisins.
  // Pas d'aria-label : le texte visible EST le nom accessible. Un aria-label
  // qui ne contient pas le libellé lu à l'écran casse la commande vocale.
  links.push(
    `<button type="button" class="site-foot__link-btn" data-install-app="radar">`
    + `${escapeHtml(c.installApp)}</button>`,
  );

  const sep = `<span class="site-foot__sep" aria-hidden="true">·</span>`;
  const navFor = (baseIndent) => links.join(`\n${baseIndent}    ${sep}\n${baseIndent}    `);
  const nav = navFor(p);
  const detailsNav = navFor(`${p}    `);

  const meta = updated
    ? `\n${p}  <p class="seo-foot-meta">${escapeHtml(t.updated)} ${escapeHtml(updated)}</p>`
    : '';

  // La page de maintenance doit tenir dans un petit viewport sans perdre les
  // mentions importantes. Le résumé reste toujours visible; le reste du
  // pied de page demeure disponible à la demande, dans le même gabarit que
  // partout ailleurs. Cette variante reste générée, donc `seo:update` ne
  // peut pas la remplacer par un ancien footer complet.
  if (variant === 'maintenance') {
    // La signature est le nom complet du projet : elle appartient au bloc de
    // marque, visible, comme dans tous les autres pieds de page — la replier
    // cachait l'identité même du site. L'avis « projet indépendant » prend sa
    // place dans le dépliant, auprès de la licence et des mentions légales,
    // qui sont de même nature. L'échange laisse la page plus courte qu'avant :
    // le pied de page fermé doit tenir sans barre de défilement (contrôlé par
    // `maintenance : footer compact sans défilement` dans browser-smoke).
    return `<footer class="site-foot site-foot--maintenance">
${p}  <div class="site-foot__brand">
${p}    <p class="site-foot__wordmark notranslate" translate="no"><img class="site-foot__logo" src="${up}assets/icon.svg" width="24" height="24" alt="" aria-hidden="true">${BRAND_NAME}</p>
${p}    <p class="site-foot__signature notranslate" translate="no" lang="fr">${escapeHtml(BRAND_SIGNATURE)}</p>
${p}  </div>
${p}  <p class="site-foot__contact"><a href="${CONTACT_URL}" data-contact-channel="email" aria-label="${escapeHtml(t.contactAria)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>${escapeHtml(t.contactLabel)}</a></p>
${p}  <details class="site-foot__details">
${p}    <summary>${escapeHtml(t.footerDetails)}</summary>
${p}    <div class="site-foot__details-body">
${p}      <p class="site-foot__summary">${escapeHtml(t.unofficial)}</p>
${p}      <nav class="site-foot__links" aria-label="${escapeHtml(t.footerNav)}">
${p}        ${detailsNav}
${p}      </nav>
${p}      <p>${escapeHtml(t.licenseIntro)} <a href="${LICENSE_URL}" target="_blank" rel="noopener noreferrer license">${escapeHtml(t.licenseName)}</a>.</p>
${p}      <div class="site-foot__credit">
${p}        <p class="site-foot__author">
${p}          ${escapeHtml(t.creditMade)} <a href="${href('easter-egg.html')}" class="site-foot__heart" aria-label="${escapeHtml(t.creditHeart)}">♡</a>
${p}          ${escapeHtml(t.creditBy)} <a href="${COFFEE_URL}" class="site-foot__author-link" target="_blank" rel="noopener noreferrer" title="${escapeHtml(t.creditCoffee)}">Azdak</a>
${p}          ${escapeHtml(t.creditYear)}
${p}        </p>
${p}        <p class="site-foot__legal">${escapeHtml(t.legalNote)}</p>
${p}        <p class="site-foot__bot"><span class="site-foot__bot-ico" aria-hidden="true">🤖</span> ${escapeHtml(t.botNote)}</p>
${p}      </div>${meta}
${p}    </div>
${p}  </details>
${p}</footer>`;
  }

  return `<footer class="site-foot">
${p}  <div class="site-foot__brand">
${p}    <p class="site-foot__wordmark notranslate" translate="no"><img class="site-foot__logo" src="${up}assets/icon.svg" width="24" height="24" alt="" aria-hidden="true">${BRAND_NAME}</p>
${p}    <p class="site-foot__signature notranslate" translate="no" lang="fr">${escapeHtml(BRAND_SIGNATURE)}</p>
${p}  </div>
${p}  <p>${escapeHtml(t.unofficial)}</p>
${p}  <nav class="site-foot__links" aria-label="${escapeHtml(t.footerNav)}">
${p}    ${nav}
${p}  </nav>
${p}  <p>${escapeHtml(t.licenseIntro)} <a href="${LICENSE_URL}" target="_blank" rel="noopener noreferrer license">${escapeHtml(t.licenseName)}</a>.</p>
${p}  <div class="site-foot__credit">
${p}    <p class="site-foot__author">
${p}      ${escapeHtml(t.creditMade)} <a href="${href('easter-egg.html')}" class="site-foot__heart" aria-label="${escapeHtml(t.creditHeart)}">♡</a>
${p}      ${escapeHtml(t.creditBy)} <a href="${COFFEE_URL}" class="site-foot__author-link" target="_blank" rel="noopener noreferrer" title="${escapeHtml(t.creditCoffee)}">Azdak</a>
${p}      ${escapeHtml(t.creditYear)}
${p}    </p>
${p}    <p class="site-foot__contact"><a href="${CONTACT_URL}" data-contact-channel="email" aria-label="${escapeHtml(t.contactAria)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>${escapeHtml(t.contactLabel)}</a></p>
${p}    <p class="site-foot__legal">${escapeHtml(t.legalNote)}</p>
${p}    <p class="site-foot__bot"><span class="site-foot__bot-ico" aria-hidden="true">🤖</span> ${escapeHtml(t.botNote)}</p>
${p}  </div>${meta}
${p}</footer>`;
}

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
  bodyHtml, jsonLd, siteBase, updated, robots = 'index,follow', alternate = true,
  extraScripts = [],
  wireClass = '',
  /** Si défini : le h1 devient un lien (ex. reset filtres « Au tableau »). */
  h1Href = null,
  h1Attrs = '',
  /** Pastille du mât à marquer `aria-current` (`home`, `rss`, `sports`…). */
  chromeCurrent = null,
  /**
   * Si vrai : la page déclare son propre manifeste et son propre service
   * worker, donc s'installe comme une app à part entière (cas de /sports/).
   * Sinon elle reçoit le manifeste racine, sans quoi le bouton « Installer »
   * ne pourrait jamais déclencher l'invite native et mentirait à la personne.
   */
  standaloneApp = false,
}) {
  const t = T[lang];
  const depth = path.split('/').filter(Boolean).length;
  const up = depth === 0 ? './' : '../'.repeat(depth);
  const canonical = `${siteBase}/${path}`;
  const altUrl = `${siteBase}/${altPath}`;
  const frUrl = lang === 'fr' ? canonical : altUrl;

  // Manifeste : le sien pour une app autonome, celui du site sinon. Sans ce
  // lien, `beforeinstallprompt` ne se déclenche jamais et le bouton
  // « Installer » retombe systématiquement sur le guide manuel.
  // L'enregistrement du service worker passe par un fichier externe : la CSP
  // de ces pages est `script-src 'self'`, sans `unsafe-inline`.
  const appHeadHtml = standaloneApp
    ? '    <link rel="manifest" href="site.webmanifest" />\n'
      + '    <meta name="mobile-web-app-capable" content="yes" />\n'
      + '    <meta name="apple-mobile-web-app-capable" content="yes" />\n'
      + '    <meta name="apple-mobile-web-app-status-bar-style" content="default" />\n'
      + `    <meta name="apple-mobile-web-app-title" content="${escapeHtml(CHROME_T[lang].appSportsShort)}" />\n`
      + `    <script src="${up}app-sw-register.js" defer></script>\n`
    : `    <link rel="manifest" href="${up}manifest.json" />\n`;

  const crumbHtml = crumbs.length
    ? `<nav class="seo-crumbs" aria-label="${lang === 'fr' ? 'Fil d’Ariane' : 'Breadcrumb'}">`
      + crumbs.map((c) => (c.href
        ? `<a href="${escapeHtml(c.href)}"${c.reset ? ' data-sports-reset' : ''}>${escapeHtml(c.label)}</a>`
        : `<span aria-current="page">${escapeHtml(c.label)}</span>`)).join('<span class="seo-crumbs__sep" aria-hidden="true">›</span>')
      + '</nav>'
    : '';

  const h1Html = h1Href
    ? `<h1 class="seo-title"><a class="seo-title__link" href="${escapeHtml(h1Href)}" data-sports-reset${h1Attrs ? ` ${h1Attrs}` : ''}>${escapeHtml(h1)}</a></h1>`
    : `<h1 class="seo-title">${escapeHtml(h1)}</h1>`;

  return `<!doctype html>
<html lang="${t.lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="${escapeHtml(robots)}" />
    <meta name="theme-color" content="#ffffff" />
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />
    <title>${escapeHtml(title)}</title>
    <link rel="canonical" href="${escapeHtml(canonical)}" />
${alternate ? `    <link rel="alternate" hreflang="fr-CA" href="${escapeHtml(lang === 'fr' ? canonical : altUrl)}" />
    <link rel="alternate" hreflang="en-CA" href="${escapeHtml(lang === 'en' ? canonical : altUrl)}" />
    <!-- x-default → français : c'est la langue principale du projet. -->
    <link rel="alternate" hreflang="x-default" href="${escapeHtml(frUrl)}" />` : ''}

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:locale" content="${lang === 'fr' ? 'fr_CA' : 'en_CA'}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${siteBase}/assets/og-cover.png?v=3" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${siteBase}/assets/og-cover.png?v=3" />

    <link rel="icon" href="${up}assets/icon-32.png" type="image/png" sizes="32x32" />
    <link rel="icon" href="${up}assets/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="${standaloneApp ? 'apple-touch-icon-180x180.png' : `${up}assets/icon-192.png`}" />
${appHeadHtml}    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <script src="${up}seo-page-theme.js"></script>
    <link rel="stylesheet" href="${up}style-masthead.css" />
    <link rel="stylesheet" href="${up}style.css" />
    <link rel="stylesheet" href="${up}style-sports-strip.css" />
    <link rel="stylesheet" href="${up}style-masthead-chrome.css" />
    <link rel="stylesheet" href="${up}style-tuner.css" />
    <link rel="stylesheet" href="${up}style-feed.css" />
    <link rel="stylesheet" href="${up}style-chrome.css" />
    <link rel="stylesheet" href="${up}seo-pages.css" />
${renderWideLayoutAssets(up)}${renderTunerCriticalCss()}
    <script src="${up}nav-shell.js" defer></script>
    <script src="${up}cast.js" defer></script>
    <script src="${up}mobile-playback.js" defer></script>
    <script src="${up}player-sync.js" defer></script>
    <!-- season-lib.js avant la banque : sans lui le filtre saisonnier rend le
         pool tel quel, et une photo d'hiver peut sortir en août. -->
    <script src="${up}scripts/season-lib.js" defer></script>
    <script src="${up}bg-rotation-lib.js" defer></script>
    <script src="${up}photo-bank-data.js" defer></script>
    <script src="${up}quebec-backgrounds-data.js" defer></script>
    <script src="${up}quebec-university-backgrounds-data.js" defer></script>
    <script src="${up}scripts/campus-fallback-lib.js" defer></script>
    <script src="${up}quebec-nations-backgrounds-data.js" defer></script>
    <script src="${up}quebec-favorites-backgrounds-data.js" defer></script>
    <script src="${up}quebec-backgrounds.js" defer></script>
    <script src="${up}institution-acronyms-data.js" defer></script>
    <script src="${up}weather-cities-data.js" defer></script>
    <script src="${up}radar-utils.js" defer></script>
    <script src="${up}radar-state.js" defer></script>
    <script src="${up}radar-weather.js" defer></script>
    <script src="${up}radar-sports-cta.js" defer></script>
    <script src="${up}radar-tuner.js" defer></script>
    <script src="${up}radar-news.js" defer></script>
    <script src="${up}radar-lifecycle.js" defer></script>
    <script src="${up}app.js" defer></script>
    <script src="${up}engage-prompt.js" defer></script>
${(Array.isArray(extraScripts) ? extraScripts : []).map((src) => `    <script src="${up}${escapeHtml(src)}" defer></script>`).join('\n')}${Array.isArray(extraScripts) && extraScripts.length ? '\n' : ''}${jsonLd ? `    <script type="application/ld+json">${jsonLd}</script>\n` : ''}  </head>
  <body>
    <header class="masthead">
      <!-- Fond photo (banque du Québec) — même bloc que l'accueil : la couche,
           le voile, le crédit et le bouton de rotation. Sans lui, ces pages
           affichaient un mât nu alors que leur CSP whiteliste déjà le worker
           de rotation : la chrome était prévue pour l'avoir, elle ne l'avait
           jamais reçue. -->
      <div id="bg-photo-layer" aria-hidden="true"></div>
      <div class="bg-photo-scrim" aria-hidden="true"></div>
      <div class="bg-photo-credit" id="bg-photo-credit"></div>
      <div id="masthead-shuffle-slot" class="masthead-shuffle-slot">
        <button id="masthead-bg-shuffle" class="masthead-icon masthead-bg-shuffle" type="button" aria-label="${lang === 'en' ? 'Change the masthead photo' : 'Changer la photo du mât'}" title="${lang === 'en' ? 'Change the masthead photo' : 'Changer la photo du mât'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 4 4-4 4"/><path d="M20 7H9a5 5 0 0 0-5 5v1"/><path d="m8 21-4-4 4-4"/><path d="M4 17h11a5 5 0 0 0 5-5v-1"/></svg>
        </button>
      </div>
      <div class="masthead-inner">
        <div class="masthead-top">
          <!-- Date et heure hors du moteur de traduction : ce sont des données,
               formatées par Intl dans la langue active (voir mastheadLocale dans
               app.js). Traduites mot à mot, elles revenaient en « THURSDAY
               AUGUST 6, 20 » — mauvaise casse et longueur non mesurée. -->
          <span class="masthead-date notranslate" translate="no">
            <span id="today-date"></span>
            <time id="today-time" class="masthead-time" aria-label="${lang === 'en' ? 'Current time' : 'Heure actuelle'}"></time>
          </span>
          ${renderMastheadWeather({ lang })}
          ${renderMastheadActions({ lang, up, current: chromeCurrent, indent: '          ' })}
        </div>
        <div class="masthead-brand">
          <a href="${up}" class="wordmark">
            <span class="wordmark-mark"><img class="wordmark-logo" src="${up}assets/icon.svg" width="48" height="48" alt="" aria-hidden="true"><span class="wordmark-brand notranslate" translate="no">LE-RADAR.ca</span></span>
            <span class="wordmark-full"><span class="wordmark-full__lead">${escapeHtml(t.taglineLead)}</span> <span class="wordmark-full__tag">${escapeHtml(t.taglineTag)}</span></span>
          </a>
        </div>
      </div>
    </header>

${renderNativeTuner()}
${renderMastheadBoards({ lang })}
    <main class="wire seo-wire${wireClass ? ` ${escapeHtml(wireClass)}` : ''}">
      ${crumbHtml}
${eyebrow ? `      <p class="seo-eyebrow">${escapeHtml(eyebrow)}</p>\n` : ''}      ${h1Html}
${bodyHtml}
    </main>
    ${renderSiteFooter({ lang, up, home: depth === 0, altPath, updated, indent: '    ' })}
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
      ? `<a href="${escapeHtml(r.href)}"${r.external ? EXTERNAL_LINK_ATTRS : ''}${r.ariaLabel ? ` aria-label="${escapeHtml(r.ariaLabel)}"` : ''}>${escapeHtml(r.value)}</a>`
      : escapeHtml(r.value);
    return `          <div class="seo-fact"><dt>${escapeHtml(r.label)}</dt><dd>${value}</dd></div>`;
  });
  return items.length ? `      <dl class="seo-facts">\n${items.join('\n')}\n      </dl>\n` : '';
}

/* Une fiche SEO peut donner un peu plus de contexte qu'une carte compacte de
 * l'accueil, sans devenir une copie de l'article. Les crédits photo, utiles à
 * proximité d'une image, ne sont pas du contenu éditorial : on les retire
 * seulement ici, avant le découpage. */
const SEO_STANDARD_BRIEF_LIMIT = 360;

function endsHeadlineSentence(text = '') {
  return /[.!?»"')\]]\s*$/u.test(String(text).trim());
}

function cleanHeadlineBrief(value) {
  let text = String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\]\]>/g, '')
    .replace(/\s*L['’]article\b[\s\S]*?est apparu en premier sur[\s\S]*$/i, '')
    .replace(/\s*The\s+post\b[\s\S]*?appeared first on[\s\S]*$/i, '');

  // « (Crédit photo : Nom, source). » et les variantes sans parenthèses.
  text = text
    .replace(/\s*\(\s*(?:crédit(?:\s+(?:photo|image|photographie))?|photo|image)\s*:\s*[^)]{1,220}\)\.?\s*/gi, ' ')
    .replace(/\s*(?:crédit(?:\s+(?:photo|image|photographie))?|photo|image)\s*:\s*[^.]{1,180}\.\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function headlineBrief(value, maxLength = SEO_STANDARD_BRIEF_LIMIT) {
  const text = cleanHeadlineBrief(value);
  // Plusieurs flux ne livrent qu'un extrait sans ponctuation finale. Même s'il
  // tient dans le budget, l'ellipse doit alors annoncer honnêtement sa coupe.
  if (!text || text.length <= maxLength) {
    return { text, truncated: !!text && !endsHeadlineSentence(text) };
  }

  let cut = text.slice(0, maxLength);
  // Même règle de fin de phrase que les cartes standard de l'accueil : jusqu'à
  // 100 caractères de souplesse évitent une phrase amputée sans gonfler la carte.
  const sentenceEnd = text.slice(maxLength).search(/[.!?»"')\]](?:\s|$)/);
  if (sentenceEnd >= 0 && sentenceEnd < 100) {
    cut = text.slice(0, maxLength + sentenceEnd + 1);
  } else {
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.5) cut = cut.slice(0, lastSpace);
  }
  return { text: cut.replace(/[,;:\s]+$/u, '').trimEnd(), truncated: true };
}

function headlineDateTime(value, lang) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  const clock = new Intl.DateTimeFormat(lang === 'en-CA' ? 'en-CA' : 'fr-CA', {
    timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit',
    hour12: lang === 'en-CA',
  }).format(date);
  const renderedClock = lang === 'en-CA' ? clock : clock.replace(':', ' h ');
  return { machine: date.toISOString(), label: `${day} · ${renderedClock}` };
}

function headlineList(items, t) {
  if (!items.length) return `      <p class="seo-empty">${escapeHtml(t.noHeadlines)}</p>\n`;
  const rows = items.map((it) => {
    const published = headlineDateTime(it.date, t.lang);
    const { text: brief, truncated } = headlineBrief(it.leadExcerpt || it.excerpt);
    return `          <li class="seo-headline">`
      + `<a class="seo-headline__title" href="${escapeHtml(it.link)}"${EXTERNAL_LINK_ATTRS}>${escapeHtml(it.title)}</a>`
      + `<p class="seo-headline__meta">`
      + (published ? `<time datetime="${escapeHtml(published.machine)}">${escapeHtml(published.label)}</time>` : '')
      + (it.author ? `<span class="seo-headline__by">${escapeHtml(t.byline)} ${escapeHtml(it.author)}</span>` : '')
      + '</p>'
      + (brief ? `<p class="seo-headline__brief">${escapeHtml(brief)}${truncated ? ' …' : ''} ` : '<p class="seo-headline__brief">')
      + `<a class="seo-headline__more" href="${escapeHtml(it.link)}"${EXTERNAL_LINK_ATTRS}>${escapeHtml(t.readMore)}</a></p>`
      + '</li>';
  });
  return `      <ul class="seo-headlines">\n${rows.join('\n')}\n      </ul>\n`;
}

function cardGrid(cards) {
  if (!cards.length) return '';
  const items = cards.map((c) => `          <li class="seo-card">`
    + `<a href="${escapeHtml(c.href)}"><span class="seo-card__name">${escapeHtml(c.name)}</span>`
    + (c.meta ? `<span class="seo-card__meta">${escapeHtml(c.meta)}</span>` : '')
    + '</a></li>').join('\n');
  return `      <ul class="seo-cards">\n${items}\n      </ul>\n`;
}

/** "HH:MM" → minutes depuis minuit, ou null. Tri numérique, pas lexical. */
function slotMinutes(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Grille hebdomadaire complète.
 *
 * Pas de troncature : ces pages sont la vue de référence de l'horaire (le
 * syntoniseur y renvoie depuis « À l'antenne »), et couper à 8 créneaux
 * cachait près de la moitié de la semaine de CKUT. La plage complète
 * `début – fin` est affichée parce qu'elle est déjà dans la donnée, et qu'une
 * heure de début seule ne dit pas si l'émission dure 30 minutes ou 6 heures.
 */
/**
 * Lundi 12:00 UTC de la semaine calendrier Québec (lun–dim).
 * Affiché comme « Semaine du … », indépendamment du tampon de collecte.
 */
function quebecWeekStartDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  if (![year, month, day].every(Number.isFinite)) return null;
  const local = new Date(Date.UTC(year, month - 1, day, 12));
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  return local;
}

function scheduleContext(checkedAt, _verifiedWeekOf, t) {
  const checked = checkedAt ? new Date(checkedAt) : null;
  // Semaine courante à Québec, pas la semaine du tampon. La date MAJ dit
  // si la grille a été relue aujourd'hui ou conservée d'une passe plus vieille.
  const week = quebecWeekStartDate();
  const format = (date, timeZone = 'UTC') => new Intl.DateTimeFormat(t.lang, {
    timeZone, day: 'numeric', month: 'long', year: 'numeric',
  }).format(date);
  const items = [];
  if (week && !Number.isNaN(week.getTime())) {
    items.push(`<span>${escapeHtml(t.scheduleWeek)} ${escapeHtml(format(week))}</span>`);
  }
  if (checked && !Number.isNaN(checked.getTime())) {
    items.push(`<span>${escapeHtml(t.scheduleUpdated)} ${escapeHtml(format(checked, 'America/Toronto'))}</span>`);
  }
  if (!items.length) return '';
  return `      <p class="seo-schedule-meta">${items.join('<span aria-hidden="true">·</span>')}</p>\n`;
}

/** Jour actuel à Québec. Même une grille ancienne reste plus facile à lire
 * quand son mercredi, jeudi, etc. est repérable d'un coup d'œil; sa fraîcheur
 * est déjà explicitement indiquée juste au-dessus par la date de collecte. */
function scheduleTodayDay() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  if (![year, month, day].every(Number.isFinite)) return null;
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Heure actuelle à Québec, dans le même référentiel que les grilles. */
function scheduleCurrentMinute() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  const hour = get('hour');
  const minute = get('minute');
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

/**
 * Marque l'émission censée être à l'antenne d'après la grille et, lorsqu'il
 * y a un trou, la prochaine. La source peut être ancienne : ces classes
 * facilitent alors la lecture sans prétendre que la collecte vient d'avoir
 * lieu (la date, affichée séparément, reste la source de vérité sur fraîcheur).
 */
function scheduleSlotStates(grid) {
  const nowDay = scheduleTodayDay();
  const nowMinute = scheduleCurrentMinute();
  const state = new Map();
  if (nowDay == null || nowMinute == null) return state;

  const slots = grid.filter((slot) => slot && slot.title && slotMinutes(slot.start) != null);
  const active = slots.filter((slot) => {
    const start = slotMinutes(slot.start);
    const end = slotMinutes(slot.end);
    if (end == null) return slot.day === nowDay && nowMinute >= start;
    if (end > start) return slot.day === nowDay && nowMinute >= start && nowMinute < end;
    // 23:00–00:00 et les émissions qui franchissent minuit.
    return (slot.day === nowDay && nowMinute >= start)
      || (slot.day === (nowDay + 6) % 7 && nowMinute < end);
  });
  if (active.length) {
    // En cas de chevauchement éditorial, privilégier le créneau commencé le
    // plus récemment : c'est généralement la mise à jour la plus précise.
    active.sort((a, b) => (slotMinutes(b.start) ?? 0) - (slotMinutes(a.start) ?? 0));
    state.set(active[0], 'live');
    return state;
  }

  let next = null;
  let nextDistance = Infinity;
  for (const slot of slots) {
    const start = slotMinutes(slot.start);
    let distance = ((slot.day - nowDay + 7) % 7) * 1440 + start - nowMinute;
    if (distance < 0) distance += 7 * 1440;
    if (distance < nextDistance) {
      nextDistance = distance;
      next = slot;
    }
  }
  if (next) state.set(next, 'upcoming');
  return state;
}

function scheduleTable(grid, t, { checkedAt = null, verifiedWeekOf = null, stationId = '' } = {}) {
  if (!grid || !grid.length) return '';
  const byDay = new Map();
  for (const slot of grid) {
    if (!slot || !slot.title) continue;
    if (!byDay.has(slot.day)) byDay.set(slot.day, []);
    byDay.get(slot.day).push(slot);
  }
  if (!byDay.size) return '';

  // Les sept jours, toujours. Une colonne qui disparaît ne dit pas si la
  // station ne diffuse rien ce jour-là ou si la collecte a échoué ; un jour
  // explicitement vide, si.
  //
  // Ordre lundi → dimanche (et non l'index 0-6 des données, qui commence le
  // dimanche) : sur cinq colonnes, la première rangée est alors la semaine et
  // la seconde le week-end, au lieu de couper samedi et dimanche en deux.
  const days = [1, 2, 3, 4, 5, 6, 0];
  const todayDay = scheduleTodayDay();
  const slotStates = scheduleSlotStates(grid);
  const blocks = days.map((day) => {
    const todayClass = day === todayDay ? ' seo-day--today' : '';
    if (!byDay.has(day)) {
      return `        <div class="seo-day seo-day--empty${todayClass}" data-schedule-day="${day}"${day === todayDay ? ' data-current-day="true"' : ''}>\n          <h3>${escapeHtml(t.days[day] || '')}</h3>\n`
        + `          <p class="seo-day__none">${escapeHtml(t.noSlots)}</p>\n        </div>`;
    }
    const slots = byDay.get(day)
      .slice()
      .sort((a, b) => (slotMinutes(a.start) ?? 0) - (slotMinutes(b.start) ?? 0))
      .map((s) => {
        const start = slotMinutes(s.start);
        const end = slotMinutes(s.end);
        // Traverse réellement minuit (23:00 → 01:00). `end === 0` s'arrête *à*
        // minuit : c'est déjà lisible tel quel, la mention serait du bruit.
        const overnight = start != null && end != null && end < start && end > 0;
        const range = s.end
          ? `${escapeHtml(s.start)}<span class="seo-slot__dash" aria-hidden="true">–</span>${escapeHtml(s.end)}`
          : escapeHtml(s.start);
        const title = escapeHtml(s.title || '');
        const label = s.url
          ? `<a href="${escapeHtml(s.url)}"${EXTERNAL_LINK_ATTRS}>${title}</a>`
          : title;
        const state = slotStates.get(s);
        const classes = [overnight && 'seo-slot--overnight', state && `seo-slot--${state}`]
          .filter(Boolean)
          .join(' ');
        const stateLabel = state === 'live' ? t.scheduleLive : (state === 'upcoming' ? t.scheduleUpcoming : '');
        return `            <li${classes ? ` class="${classes}"` : ''} data-schedule-start="${escapeHtml(s.start)}" data-schedule-end="${escapeHtml(s.end || '')}"${stateLabel ? ` aria-label="${escapeHtml(stateLabel)} : ${title}"` : ''}>`
          + `<time class="seo-slot__time">${range}</time>`
          + `<span class="seo-slot__title">${label}</span>`
          + (overnight ? `<span class="seo-slot__note">${escapeHtml(t.overnight)}</span>` : '')
          + '</li>';
      })
      .join('\n');
    return `        <div class="seo-day${todayClass}" data-schedule-day="${day}"${day === todayDay ? ' data-current-day="true"' : ''}>\n          <h3>${escapeHtml(t.days[day] || '')}</h3>\n          <ul>\n${slots}\n          </ul>\n        </div>`;
  });

  return `      <section class="seo-section" id="horaire"${stationId ? ` data-schedule-station="${escapeHtml(stationId)}"` : ''}>\n        <h2>${escapeHtml(t.schedule)}</h2>\n`
    + scheduleContext(checkedAt, verifiedWeekOf, t)
    + `      <div class="seo-schedule-scroll">\n      <div class="seo-schedule">\n${blocks.join('\n')}\n      </div>\n      </div>\n`
    + `      <p class="seo-note">${escapeHtml(t.scheduleNote)}</p>\n      </section>\n`;
}

module.exports = {
  SITE_NAME,
  T,
  escapeHtml,
  slugify,
  normKey,
  isoDay,
  sportsUpdatedStamp,
  canonicalInstitution,
  localizedInstitutionName,
  INSTITUTIONS,
  fill,
  frOf,
  plural,
  frAt,
  renderPage,
  renderSiteFooter,
  renderMastheadActions,
  renderMastheadWeather,
  renderMastheadBoards,
  renderSectionNav,
  SECTIONS,
  renderInstallMenu,
  CHROME_T,
  INSTALL_APPS,
  renderNativeTuner,
  factsList,
  headlineList,
  cardGrid,
  slotMinutes,
  scheduleTable,
  scheduleContext,
  quebecWeekStartDate,
  scheduleTodayDay,
  scheduleCurrentMinute,
  scheduleSlotStates,
};

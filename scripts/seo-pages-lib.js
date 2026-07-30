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
  // `name` est la forme anglaise officielle. `nameFr` est uniquement une
  // adaptation de l'interface française : les pages anglaises ne francisent
  // jamais un nom d'établissement déjà français.
  { slug: 'mcgill-university', name: 'McGill University', nameFr: 'Université McGill', short: 'McGill', aliases: ['Université McGill'] },
  { slug: 'concordia-university', name: 'Concordia University', nameFr: 'Université Concordia', short: 'Concordia' },
  { slug: 'universite-du-quebec-a-trois-rivieres', name: 'Université du Québec à Trois-Rivières', short: 'UQTR' },
  { slug: 'universite-laval', name: 'Université Laval', short: 'ULaval' },
  { slug: 'universite-de-sherbrooke', name: 'Université de Sherbrooke', short: 'UdeS' },
  { slug: 'cegep-du-vieux-montreal', name: 'Cégep du Vieux Montréal', short: 'Cégep Vieux-Montréal' },
  { slug: 'cegep-de-jonquiere', name: 'Cégep de Jonquière', short: 'Cégep de Jonquière' },
  { slug: 'polytechnique-montreal', name: 'Polytechnique Montréal', short: 'Polytechnique' },
  { slug: 'bishops-university', name: "Bishop's University", nameFr: "Université Bishop's", short: "Bishop's" },
  { slug: 'dawson-college', name: 'Dawson College', nameFr: 'Collège Dawson', short: 'Dawson' },
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
    schedulesNote: 'Grilles colligées automatiquement à partir des sites des stations ; elles peuvent varier.',
    scheduleWeek: 'Semaine du',
    scheduleUpdated: 'Dernière collecte réussie le',
    overnight: 'de nuit',
    noSlots: 'Aucune émission annoncée.',
    schedules: 'Les horaires des radios étudiantes',
    schedulesTitle: 'Horaires des radios étudiantes du Québec — grilles de la semaine',
    schedulesDesc: 'Les grilles horaires des {r} radios étudiantes des cégeps et universités du Québec, colligées automatiquement et réunies au même endroit.',
    schedulesH1: 'Les horaires des radios étudiantes du Québec',
    schedulesLead: 'Une grille par station, mise à jour automatiquement à partir du site de chaque radio. Toutes les heures sont données à l’heure du Québec.',
    schedulesEmpty: 'Aucune grille horaire disponible au moment de la dernière mise à jour.',
    sports: 'Au tableau',
    sportsTitle: 'Au tableau — scores collégiaux et universitaires du Québec',
    sportsDesc: 'Scores et prochains matchs de {n} formations collégiales et universitaires du Québec (catalogue RSEQ) : hockey, football, soccer, basketball, volleyball, badminton, natation et plus.',
    sportsH1: 'Au tableau',
    sportsLead: 'Scores et prochains matchs des formations collégiales et universitaires du Québec. Filtrez par sport, par secteur ou par catégorie pour trouver une équipe.',
    sportsEmpty: 'Aucun résultat sportif disponible au moment de la dernière mise à jour.',
    sportsClubPending: 'Club campus québécois — scores à venir (pas encore sur le circuit ICSA).',
    sportsMeta: 'Catalogue RSEQ collégial + universitaire · hockey Spordle · voile QC · mise à jour automatique',
    sportsNote: 'Toutes les ligues collégiales et universitaires provinciales du RSEQ sont agrégées via l’API S1. Hockey : Spordle. Voile : équipes campus du Québec seulement (ICSA + clubs à surveiller). Un clic ouvre la source officielle.',
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
    sportsWomen: 'Féminin',
    sportsMen: 'Masculin',
    sportsWomenShort: 'Fém.',
    sportsMenShort: 'Masc.',
    sportsMixed: 'Ouvert / mixte',
    sportsAll: 'Tous',
    sportsCollegial: 'Collégial',
    sportsUniversity: 'Universitaire',
    sportsTeams: 'formations',
    sportsTeamOne: 'formation',
    sportsUpcoming: 'À venir',
    sportsWin: 'Victoire',
    sportsLoss: 'Défaite',
    sportsDraw: 'Nul',
    sportsHome: 'domicile',
    sportsAway: 'extérieur',
    sportsRecord: 'Fiche',
    sportsOpenGame: 'Ouvrir la source officielle',
    slotsCount: 'créneaux',
    slotsCountOne: 'créneau',
    collectedOn: 'colligé le',
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
    footerDirectory: 'Tous les médias étudiants du Québec',
    archives: 'Archives',
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
    schedulesNote: 'Schedules collected automatically from each station’s website; they may change.',
    scheduleWeek: 'Week of',
    scheduleUpdated: 'Last successful collection',
    overnight: 'overnight',
    noSlots: 'No scheduled shows.',
    schedules: 'Campus radio schedules',
    schedulesTitle: 'Québec campus radio schedules — this week’s line-up',
    schedulesDesc: 'Weekly schedules for the {r} campus radio stations at Québec CEGEPs and universities, collected automatically and gathered in one place.',
    schedulesH1: 'Québec campus radio schedules',
    schedulesLead: 'One grid per station, updated automatically from each station’s own website. All times are Québec time.',
    schedulesEmpty: 'No schedule available as of the last update.',
    sports: 'Scoreboard',
    sportsTitle: 'Scoreboard — Québec CEGEP and university sports results',
    sportsDesc: 'Scores and upcoming games for {n} CEGEP and university teams in Québec (RSEQ catalog): hockey, football, soccer, basketball, volleyball, badminton, swimming and more.',
    sportsH1: 'Scoreboard',
    sportsLead: 'Scores and upcoming games for CEGEP and university teams in Québec. Filter by sport, sector or category to find a team.',
    sportsEmpty: 'No sports results available as of the last update.',
    sportsClubPending: 'Québec campus club — scores pending (not yet on the ICSA circuit).',
    sportsMeta: 'RSEQ CEGEP + university catalog · Spordle hockey · QC sailing · updated automatically',
    sportsNote: 'All provincial CEGEP and university RSEQ leagues are aggregated via the S1 API. Hockey: Spordle. Sailing: Québec campus crews only (ICSA + watchlisted clubs). Clicks open the official source.',
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
    sportsWomen: 'Women’s',
    sportsMen: 'Men’s',
    sportsWomenShort: 'W',
    sportsMenShort: 'M',
    sportsMixed: 'Open / mixed',
    sportsAll: 'All',
    sportsCollegial: 'CEGEP',
    sportsUniversity: 'University',
    sportsTeams: 'teams',
    sportsTeamOne: 'team',
    sportsUpcoming: 'Upcoming',
    sportsWin: 'Win',
    sportsLoss: 'Loss',
    sportsDraw: 'Draw',
    sportsHome: 'home',
    sportsAway: 'away',
    sportsRecord: 'Record',
    sportsOpenGame: 'Open official source',
    slotsCount: 'slots',
    slotsCountOne: 'slot',
    collectedOn: 'collected',
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
    footerDirectory: 'All Québec student media',
    archives: 'Archives',
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
  + "connect-src 'self' https:; "
  + "frame-src 'self' https://chyz.ca https://cism893.ca https://ckut.ca https://www.cjlo.com https://www.cfak.ca https://www.choq.ca; "
  + "object-src 'none'; base-uri 'self'; form-action 'none'";

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
 * `home` supprime le lien « retour à l'accueil » sur l'accueil lui-même.
 * `updated` n'est passé que par les pages qui ont une fraîcheur propre.
 */
function renderSiteFooter({
  lang = 'fr', up = './', home = false, altPath = null, updated = null, indent = '      ', variant = 'default',
} = {}) {
  const t = T[lang];
  const p = indent;
  const dirPath = lang === 'fr' ? 'medias/' : 'en/media/';
  const schedPath = lang === 'fr' ? 'horaires/' : 'en/schedules/';
  const sportsPath = lang === 'fr' ? 'sports/' : 'en/sports/';
  // Le catalogue est actuellement francophone, mais son libellé est neutre et
  // l’archive reste utile depuis le volet anglais.
  const archivePath = 'archives/';

  // À la racine, `up` vaut './' : on le retire devant un chemin pour écrire
  // « horaires/ » et non « ./horaires/ », la forme que le reste du site et
  // tests/static-integrity.mjs attendent. Seul le lien d'accueil garde './'.
  const href = (rel) => (rel ? `${up}${rel}`.replace(/^\.\//, '') : up);

  const links = [];
  if (!home) links.push(`<a href="${href('')}">${escapeHtml(t.backHome)}</a>`);
  links.push(`<a href="${href(dirPath)}">${escapeHtml(t.footerDirectory)}</a>`);
  links.push(`<a href="${href(schedPath)}">${escapeHtml(t.schedules)}</a>`);
  // data-sports-reset : depuis /sports/?sport=… recharge sans filtres.
  links.push(`<a href="${href(sportsPath)}" data-sports-reset>${escapeHtml(t.sports)}</a>`);
  links.push(`<a href="${href(archivePath)}">${escapeHtml(t.archives)}</a>`);
  // `altPath` vaut '' sur /en/ : la version française est la racine du site.
  // Tester la valeur et non sa véracité, sinon le volet anglais perd sa bascule.
  if (altPath !== null && altPath !== undefined) {
    const alt = lang === 'fr' ? 'en-CA' : 'fr-CA';
    links.push(`<a href="${href(altPath)}" hreflang="${alt}">${escapeHtml(t.otherLang)}</a>`);
  }

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
    return `<footer class="site-foot site-foot--maintenance">
${p}  <div class="site-foot__brand">
${p}    <p class="site-foot__wordmark notranslate" translate="no"><img class="site-foot__logo" src="${up}assets/icon.svg" width="24" height="24" alt="" aria-hidden="true">${BRAND_NAME}</p>
${p}  </div>
${p}  <p class="site-foot__summary">${escapeHtml(t.unofficial)}</p>
${p}  <p class="site-foot__contact"><a href="${CONTACT_URL}" data-contact-channel="email" aria-label="${escapeHtml(t.contactAria)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>${escapeHtml(t.contactLabel)}</a></p>
${p}  <details class="site-foot__details">
${p}    <summary>${escapeHtml(t.footerDetails)}</summary>
${p}    <div class="site-foot__details-body">
${p}      <p class="site-foot__signature" lang="fr">${escapeHtml(BRAND_SIGNATURE)}</p>
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
${p}    <p class="site-foot__signature" lang="fr">${escapeHtml(BRAND_SIGNATURE)}</p>
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
${renderTunerCriticalCss()}    <script src="${up}seo-page-theme.js"></script>
    <script src="${up}nav-shell.js" defer></script>
    <script src="${up}cast.js" defer></script>
    <script src="${up}mobile-playback.js" defer></script>
    <script src="${up}player-sync.js" defer></script>
    <script src="${up}app.js" defer></script>
${(Array.isArray(extraScripts) ? extraScripts : []).map((src) => `    <script src="${up}${escapeHtml(src)}" defer></script>`).join('\n')}${Array.isArray(extraScripts) && extraScripts.length ? '\n' : ''}${jsonLd ? `    <script type="application/ld+json">${jsonLd}</script>\n` : ''}  </head>
  <body>
    <header class="masthead">
      <div class="masthead-inner">
        <div class="seo-masthead-actions">
          <button id="theme-toggle" class="masthead-icon theme-toggle" type="button" aria-label="Changer de thème" title="Mode clair / sombre">
            <svg class="ico-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
            <svg class="ico-moon hidden" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7.21 7.21 0 0 0 21 12.79z"/></svg>
          </button>
        </div>
        <div class="masthead-brand">
          <a href="${up}" class="wordmark">
            <span class="wordmark-mark"><img class="wordmark-logo" src="${up}assets/icon.svg" width="48" height="48" alt="" aria-hidden="true"><span class="wordmark-brand notranslate" translate="no">LE-RADAR.ca</span></span>
            <span class="wordmark-full">${escapeHtml(t.tagline)}</span>
          </a>
        </div>
      </div>
    </header>

${renderNativeTuner()}

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
function scheduleContext(checkedAt, verifiedWeekOf, t) {
  const checked = checkedAt ? new Date(checkedAt) : null;
  const week = verifiedWeekOf ? new Date(`${verifiedWeekOf}T12:00:00Z`) : null;
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
  renderNativeTuner,
  factsList,
  headlineList,
  cardGrid,
  slotMinutes,
  scheduleTable,
  scheduleContext,
  scheduleTodayDay,
  scheduleCurrentMinute,
  scheduleSlotStates,
};

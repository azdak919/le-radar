// LE-RADAR — références DOM et état partagé (var = visible des autres scripts)
// Script classique (pas type=module). Les liaisons partagées vivent dans
// radar-state.js (var) ; les function declarations sont globales.

// ─── DOM refs ────────────────────────────────────────────────────────────────
var IS_TUNER_EMBED = document.documentElement.dataset.embed === 'tuner';
// app.js est aussi chargé depuis les fiches SEO imbriquées : les données
// restent ancrées à la racine du site, jamais au dossier courant de la fiche.
var APP_BASE_URL = new URL('.', document.currentScript?.src || location.href);
var TUNER          = document.getElementById('tuner');
/*
 * Coiffe « zone sûre » du synthé (app installée iOS) — la mécanique et le
 * pourquoi sont dans style.css (.tuner-safe-cap). Purement décorative : on
 * l'injecte ici plutôt que de l'écrire dans le mât de chaque page générée.
 * Sans JS, la classe reste absente : la barre garde son ancrage `top: 0`.
 */
if (TUNER && !IS_TUNER_EMBED && !document.querySelector('.tuner-safe-cap')) {
  const safeCap = document.createElement('div');
  safeCap.className = 'tuner-safe-cap';
  safeCap.setAttribute('aria-hidden', 'true');
  TUNER.before(safeCap);
  document.documentElement.classList.add('has-tuner-safe-cap');
}
var TUNER_SELECT   = document.getElementById('tuner-select');
var TUNER_PREV     = document.getElementById('tuner-prev');
var TUNER_NEXT     = document.getElementById('tuner-next');
var TUNER_PLAY     = document.getElementById('tuner-play');
var TUNER_NAME     = document.getElementById('tuner-now-name');
var TUNER_SUB      = document.getElementById('tuner-now-sub');
var TUNER_SUB_AIR  = document.getElementById('tuner-now-sub-air');
var TUNER_SUB_ROTATE_MQ = window.matchMedia?.('(max-width: 1099.98px)');
// < 600 px = vrai téléphone. Demi-écran laptop (≈680–960) reste tablette.
var TUNER_DIAL_PHONE_MQ = window.matchMedia?.('(max-width: 599.98px)');
var TUNER_SUB_ROTATE_NARROW_MQ = window.matchMedia?.('(max-width: 479.98px)');
var TUNER_SUB_ROTATE_VERY_NARROW_MQ = window.matchMedia?.('(max-width: 359.98px)');
/**
 * Formats mid preview 768 / 900 (tablette / demi-écran) : assez de place pour
 * nom d’institution complet + horaire dans le carré — pas le téléphone (&lt;768)
 * ni le bureau avec panneau (≥1100).
 */
var TUNER_DIAL_MID_MQ = window.matchMedia?.('(min-width: 768px) and (max-width: 1099.98px)');
/** Embed : panneau latéral « À l'antenne » masqué (voir embed.css @media max-width 639.98px). */
var TUNER_EMBED_NOWAIR_HIDDEN_MQ = window.matchMedia?.('(max-width: 639.98px)');
/** Même seuil que seo-page-theme / data-wide-preview (shell E). */
var WIDE_TUNER_MQ = window.matchMedia?.('(min-width: 1281px)');
var TUNER_VOLUME   = document.getElementById('tuner-volume');
var TUNER_VOL      = document.getElementById('tuner-vol');
var TUNER_VOL_TOGGLE = document.getElementById('tuner-vol-toggle');
var TUNER_VOL_MUTE   = document.getElementById('tuner-vol-mute');
var VOL_COMPACT    = window.matchMedia('(max-width: 1099.98px)');
/** Embed étroit (iPhone) : la barre inline déborde du cadre → popover. */
var EMBED_VOL_POPOVER_MQ = window.matchMedia?.('(max-width: 559.98px)');
/** Embed iframe : volume en ligne, icône = mute (pas de popover) — sauf étroit. */
function isVolCompactMode() {
  if (IS_TUNER_EMBED) return !!EMBED_VOL_POPOVER_MQ?.matches;
  return VOL_COMPACT.matches;
}

/**
 * Embed étroit (pomo/solitaire mobile) : le panneau latéral est display:none,
 * donc l’antenne doit remonter dans la 2ᵉ ligne du dial + marquee.
 */
function isEmbedNowAirInDial() {
  return IS_TUNER_EMBED && !!TUNER_EMBED_NOWAIR_HIDDEN_MQ?.matches;
}
var TUNER_NOWAIR = document.getElementById('tuner-nowair');
var TUNER_NOWAIR_LABEL = TUNER_NOWAIR?.querySelector?.('.tuner-nowair-label') || null;
var TUNER_NOWAIR_TITLE = document.getElementById('tuner-nowair-title');
var TUNER_NOWAIR_SUB = document.getElementById('tuner-nowair-sub');
var ORIGINAL_ENGLISH_SCHEDULES = new Set(['cjlo', 'ckut']);

function nowAirSchedulePath(radio, { focus = 'live' } = {}) {
  if (!radio?.id) return null;
  const prefix = ORIGINAL_ENGLISH_SCHEDULES.has(radio.id) ? 'en/' : '';
  const hash = focus === 'upcoming' ? '#horaire-avenir' : '#horaire';
  return `/${prefix}radios/${encodeURIComponent(radio.id)}/${hash}`;
}

function nowAirScheduleFocusFromEvent(event) {
  const t = event?.target?.closest?.('.tuner-wide-slot--next, .tuner-wide-slot--live, #tuner-nowair');
  if (t?.classList.contains('tuner-wide-slot--next')) return 'upcoming';
  if (t?.classList.contains('tuner-wide-slot--live')) return 'live';
  if (TUNER_NOWAIR?.classList.contains('is-upcoming')) return 'upcoming';
  return 'live';
}

function pulseNowAirSlotFromEvent(event) {
  const wrap = document.getElementById('tuner-nowair-wide');
  const slot = event?.target?.closest?.('.tuner-wide-slot');
  wrap?.querySelectorAll('.tuner-wide-slot.is-pressed').forEach((el) => {
    el.classList.remove('is-pressed');
  });
  if (!slot || (wrap && !wrap.contains(slot))) return;
  // Relancer l’anim même si on re-clique le même slot.
  void slot.offsetWidth;
  slot.classList.add('is-pressed');
  window.setTimeout(() => slot.classList.remove('is-pressed'), 480);
}

function openNowAirSchedule(event) {
  pulseNowAirSlotFromEvent(event);
  const radio = currentStation || (isNowAirPanelPreviewMode() ? nowAirPreviewRadio : null);
  const path = nowAirSchedulePath(radio, { focus: nowAirScheduleFocusFromEvent(event) });
  if (!path) return;

  // Toujours résoudre sur l’origine de CE document (le-radar.ca), même quand
  // l’iframe est embarquée en cross-origin (Kiosque sur github.io, etc.).
  // `window.top.open('/radios/…')` résolvait le chemin relatif sur l’origine
  // du parent → 404 hors le-radar.ca, ou silence si le top bloque l’accès.
  // Nouvel onglet + absolute URL : le flux audio de l’iframe continue.
  const url = new URL(path, window.location.origin).href;
  window.open(url, '_blank', 'noopener,noreferrer');
}

TUNER_NOWAIR?.addEventListener('click', openNowAirSchedule);
TUNER_NOWAIR?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openNowAirSchedule(event);
  }
});
var ICO_PLAY       = TUNER_PLAY.querySelector('.ico-play');
var ICO_PAUSE      = TUNER_PLAY.querySelector('.ico-pause');
var ICO_EXTERNAL   = TUNER_PLAY.querySelector('.ico-external');

var NEWS_LIST      = document.getElementById('news-list');
var FILTERS_PANEL  = document.getElementById('news-filters-panel');

/** Premier paint stable d’une zone (anti-CLS) : révéler seulement alors. */
function markUiReady(el) {
  if (!el || el.dataset.ready === '1') return;
  el.dataset.ready = '1';
}
var NEWS_FILTERS   = document.getElementById('news-filters');
var FILTERS_TOGGLE = document.getElementById('filters-toggle');
var FILTERS_COMPACT = document.getElementById('filters-compact');
// Aligné sur le CSS : mode filtres « téléphone » seulement < 600 px.
var FILTERS_MOBILE = window.matchMedia('(max-width: 599.98px)');
var NEWS_COUNT     = document.getElementById('news-count');
var NEWS_UPDATED   = document.getElementById('news-updated');
var NEWS_EMPTY     = document.getElementById('news-empty');
var NEWS_SEARCH       = document.getElementById('news-search');
var NEWS_SEARCH_TOGGLE = document.getElementById('news-search-toggle');
var NEWS_SEARCH_PANEL  = document.getElementById('news-search-panel');
var NEWS_SEARCH_INPUT  = document.getElementById('news-search-input');
var NEWS_SEARCH_CLEAR  = document.getElementById('news-search-clear');
var NEWS_SEARCH_HINT   = document.getElementById('news-search-hint');
var TODAY_DATE     = document.getElementById('today-date');
var TODAY_TIME     = document.getElementById('today-time');
/** Dernier libellé date (sans heure) — pour ne re-fit météo que si le texte change.
 *  DOIT être avant `init()` : renderTodayDate lit/écrit cette clé au bootstrap
 *  (sinon TDZ → init failed → météo/sports morts). */
var mastheadDateLabelKey = '';

/**
 * Formats de date du mât, du plus complet au plus court.
 *
 * POURQUOI UNE CASCADE
 * La case de la date partage sa ligne avec huit pastilles d'actions. Une date
 * longue — « Thursday, August 6, 2026 » sur /en/ ou en traduction — dépassait
 * de 22 px à 393 px et passait SOUS les icônes. L'ellipse est le filet de
 * sécurité, pas l'objectif : « Thursday, August 6,… » n'est pas une date. On
 * retire donc de l'information dans l'ordre où elle compte le moins — le jour
 * de la semaine d'abord, le mois abrégé ensuite — jusqu'à ce que ça tienne.
 *
 * Même idiome que les noms de villes météo (`is-compact`) et que la cascade de
 * collapse du bandeau sports : mesurer, puis compacter.
 */
var MASTHEAD_DATE_FORMATS = [
  { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  { day: 'numeric', month: 'long', year: 'numeric' },
  { day: 'numeric', month: 'short', year: 'numeric' },
  { dateStyle: 'short' },
  // Repli mobile étroit (date+heure 1 ligne + icônes) : encore plus court.
  { month: 'short', day: 'numeric', year: '2-digit' },
  { month: 'numeric', day: 'numeric', year: '2-digit' },
  // Dernier filet ≤360 EN (Tuesday… trop large même en short) : mois/jour seuls.
  { month: 'numeric', day: 'numeric' },
];

var MASTHEAD_WEATHER = document.getElementById('masthead-weather');
var MASTHEAD_WEATHER_DOCK = document.getElementById('masthead-weather-dock');
var MASTHEAD_SPORTS_STRIP = document.getElementById('masthead-sports-strip');
var MASTHEAD_ACTIONS = document.querySelector('.masthead-actions');
var MASTHEAD_BG_SHUFFLE = document.getElementById('masthead-bg-shuffle');
var MASTHEAD_BG_SHUFFLE_HOME = document.getElementById('masthead-shuffle-slot');
var TOAST_EL       = document.getElementById('toast');
var THEME_TOGGLE   = document.getElementById('theme-toggle');
var EXTERNAL_MODAL = document.getElementById('external-listen');
var EXTERNAL_TITLE = document.getElementById('external-listen-title');
var EXTERNAL_SUB   = document.getElementById('external-listen-sub');
var EXTERNAL_STATUS = document.getElementById('external-listen-status');
var EXTERNAL_STATUS_TEXT = document.getElementById('external-listen-status-text');
var EXTERNAL_FRAME_WRAP = document.getElementById('external-listen-frame-wrap');
var EXTERNAL_FRAME = document.getElementById('external-listen-frame');
var EXTERNAL_HINT  = document.getElementById('external-listen-hint');
var EXTERNAL_REOPEN = document.getElementById('external-listen-reopen');
var EXTERNAL_TAB   = document.getElementById('external-listen-tab');
var EXTERNAL_LOGO  = document.getElementById('external-listen-logo');

// ─── State ───────────────────────────────────────────────────────────────────
var radios = [];          // ordered list backing the tuner
var news = [];
var newsSourcesByName = {};
var newsSourceFilter = 'all';
/** Recherche locale (titre / auteur / source / extrait / crédits) — jamais de fetch distant. */
var newsSearchQuery = '';
var newsSearchOpen = false;
var newsSearchDebounce = null;
var currentStation = null; // radio object selected in tuner
/** Choix explicite (menu / prev-next / play). Le restore session ne le pose pas. */
var userPickedStation = false;
/** Another same-origin tab/page owns the real audio (Phase 1 multi-page sync). */
var syncRemotePlaying = false;
/**
 * True only after a *live* peer announced itself (BroadcastChannel state/yield).
 * localStorage alone can leave a ghost `playing: true` after the leader tab died;
 * without this flag the UI shows ⏸ and the first click only clears the ghost
 * instead of starting audio — silence until a second press.
 */
var remoteLeaderConfirmed = false;
var audio = null;
// Lecture demandée, mais aucun son confirmé par l'événement `playing`.
var isBuffering = false;
var bufferingSafetyTimer = null;
var suppressAudioError = false;
// Amplification optionnelle via Web Audio : permet de dépasser 100 % pour les
// flux trop faibles (ex. CKUT). Les postes sans en-tête CORS ne peuvent pas être
// amplifiés ; on retombe alors en lecture native plafonnée à 100 %.
// UI 0–200 % sur tous les appareils qui supportent Web Audio. Sur mobile, le
// graphe n'est branché qu'au-dessus de 100 % afin de garder la lecture native
// (plus fiable à l'écran verrouillé) pour le cas courant ≤ 100 %.
var audioCtx = null;
var gainNode = null;
var compressorNode = null;
var analyserNode = null;
var mediaSource = null;
var boostWired = false;             // graphe Web Audio branché sur l'élément courant
var boostCtxLifecycleBound = false;  // listeners visibility/focus pour reprendre l'AudioContext
var webAudioSupported = !!(window.AudioContext || window.webkitAudioContext);
// Stratégie de persistance d'écoute (Media Session, reconnexion, keepalive iOS).
var MOBILE_PLAYBACK = window.matchMedia('(hover: none) and (pointer: coarse)').matches
  || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
// iOS (y compris iPadOS qui se présente comme macOS) : `audio.volume` est en
// lecture seule — seul le gain Web Audio permet de régler le niveau.
var IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
var userPaused = false;
var mobilePlayback = null;
var playerListenersAttached = new WeakSet();
// 100 % est la référence commune : le volume ne doit pas sembler réduit au
// premier chargement, quel que soit le contexte (site, Pomo ou Solitaire).
var DEFAULT_GAIN = 1;
var currentGain = DEFAULT_GAIN;
var volumeMuted = false;
var gainBeforeMute = DEFAULT_GAIN;
var MAX_GAIN = 2;                 // jusqu'à 200 %
var VOLUME_PREF_VERSION_KEY = 'radar-player-vol-version';
/** Mute explicite — survit au rechargement (en plus de la session multi-onglets). */
var VOLUME_MUTE_KEY = 'radar-player-muted';
var VOLUME_PREF_VERSION = '3';
var STATION_TRIMS_KEY = 'radar-player-station-trims-v1';
var stationTrims = new Map();
var loudnessProbeTimer = null;
var loudnessProbeStationId = null;
// Curseur 0–200 % dès que Web Audio existe — y compris mobile / tablette.
var GAIN_UI_MAX = webAudioSupported ? MAX_GAIN : 1;
var VOL_THUMB_PX = 16;
var volumeSliderDragging = false;
var boostUnavailable = new Set(); // ids des postes sans CORS
// Réglages de lecture par poste. CFAK (Sherbrooke) a de petites coupures : on
// précharge davantage et on reconnecte automatiquement quand le flux décroche.
// CHYZ (Centova/Shoutcast) : lecture native seule — Web Audio + crossOrigin casse le flux.
var STATION_PLAYBACK = {
  cfak: { resilient: true },
  chyz: { resilient: true, noBoost: true },
};
var reconnectTries = 0;
var listenWindow = null;
var listenWindowId = null;
var radioNowPlaying = { stations: {}, updatedAt: null };
var radioSchedules = { stations: {}, timezone: 'America/Toronto' };
var nowPlayingPollTimer = null;
var nowPlayingRefreshPromise = null;
var nowAirTick = null;
var nowAirPreviewTimer = null;
var nowAirPreviewRadio = null;
var lastNowAirPreviewId = null;
var lastDialCarouselText = '';
var lastNowAir = { title: null, sub: null, empty: null, previewId: null, kind: null, stationId: null, shell: null };
var tunerSubMeta = '';
var tunerSubAirText = '';
var tunerSubRotateTimer = null;
/** Quel créneau du dial est actif (false = A, true = B). */
var dialRotateSlotB = false;
/**
 * Rotation de l'antenne : index dans `airRotationPhases()`.
 * Une seule horloge le fait avancer — le tick du dial en compact, le timer du
 * panneau sur bureau. Les deux surfaces sont exclusives (le panneau est
 * `display:none` sous 1100 px), donc jamais deux cadences concurrentes.
 */
var airPhaseIndex = 0;
/** Timer du panneau bureau uniquement (le dial a le sien). */
var airPanelRotateTimer = null;
/** Demander un fondu sur le prochain render (bascule de phase ou de poste). */
var nowAirCrossfadePending = false;
/** Incrémenté à chaque fondu pour annuler les timeouts obsolètes. */
var nowAirFadeGen = 0;
// La lecture audio continue en arrière-plan; seules les animations de
// présentation sont figées. Sans cette séparation, les navigateurs qui
// suspendent leurs timers font « rattraper » le synthétiseur au retour.
var tunerPresentationPaused = false;
var tunerPresentationNeedsRefresh = false;
var tunerPresentationResumePromise = null;
var tunerPresentationResumeGeneration = 0;
// L’iframe du Pomodoro est un espace de concentration : laisser chaque
// station / émission lisible plus longtemps avant de passer à la suivante.
// La page Radar conserve son rythme plus vif.
var TUNER_SUB_ROTATE_MS = IS_TUNER_EMBED ? 14000 : 8000;
/** Carrousel postes au repos : délai fixe (évite le flip à toute allure). */
var NOW_AIR_PREVIEW_DWELL_MS = 8000;
var TUNER_SUB_ROTATE_NARROW_MS = 14000;
var TUNER_SUB_ROTATE_VERY_NARROW_MS = 18000;
var AIR_PANEL_ROTATE_MS = 8000;
/**
 * Marquee site-wide (dial, à l’antenne, sports, météo, embed) :
 * 1) délai de lecture au repos  2) aller L→R puis retour à l’origine
 * 3) si ce tour est trop court pour lire, un 2ᵉ aller-retour
 * 4) pause au repos  5) seulement alors changer le texte.
 * Jamais `infinite`.
 */
/** Pause initiale avant le 1er pixel de scroll (CSS animation-delay). */
var MARQUEE_READ_DELAY_MS = 1600;
/** Un aller-retour = `alternate` × 2 (pas infinite). */
var MARQUEE_ROUND_TRIPS = 2;
/** Plafond : 2 aller-retour (4 itérations) si le premier tour est trop vite. */
var MARQUEE_TRIPS_MAX = 4;
/** Pause de lecture après le retour, avant de changer de texte. */
var MARQUEE_REST_MS = 2000;

/**
 * Itérations `alternate` : toujours 1 aller-retour (×2).
 * Un 2ᵉ tour collé ferait l’impasse sur la pause à l’origine.
 */
function marqueeAlternateCount() {
  return MARQUEE_ROUND_TRIPS;
}

function marqueeCycleMs(oneWayMs, trips) {
  const n = Number(trips) >= 2 ? Number(trips) : MARQUEE_ROUND_TRIPS;
  return MARQUEE_READ_DELAY_MS + Math.max(0, Number(oneWayMs) || 0) * n + MARQUEE_REST_MS;
}
/** L'émission en ondes reste plus longtemps que les autres phases. */
var AIR_LIVE_DWELL_FACTOR = 2;
var NOW_AIR_CROSSFADE_MS = 700;
/** Bascule du contenu du panneau antenne (fondu CSS de 0,3 s). */
var NOW_AIR_PANEL_SWAP_MS = 280;
var PREFERS_REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)');
var sourceColors = {};     // source name → accent colour
var brandColors = { institutions: {}, fallback_palette: ['#003DA5', '#6C2163', '#047857'] };
var filtersExpanded = false;
/** Suite du fil : repli après NEWS_TAIL_VISIBLE articles (toutes plateformes). */
var newsTailExpanded = false;
var NEWS_TAIL_VISIBLE = 10;
/**
 * Rangée « peek » sous le fondu (titres partiels avant « Plus d'articles »).
 * 2 = max colonnes de la grille (.news-tail-body ≥ 600 px) — ces cartes
 * restent en is-tail-overflow (hors max-height) mais doivent être traduites.
 */
var NEWS_TAIL_PEEK_TRANSLATE = 2;
var volSliderResizeObs = null;
var marqueeTextByEl = new WeakMap();
var marqueeObservedEls = new WeakSet();
var marqueeResizeObs = null;
var marqueeResizeScheduled = false;
var filterMarqueeResyncTimer = null;
var FILTER_MARQUEE_RESYNC_MS = 480;

/** Rangées visibles avant « Plus de sources » — 1 partout, + un aperçu du
 *  titre de la rangée suivante (--filters-peek) ; jamais un bout de 3e rangée. */
var FILTERS_COLLAPSED_ROWS_DESKTOP = 1;
var FILTERS_COLLAPSED_ROWS_COMPACT = 1;
var FILTERS_COMPACT_MQ = window.matchMedia(
  '(max-width: 1099.98px) and (orientation: portrait)',
);
var FILTERS_ROW_CAPACITY = 3;
var FILTERS_COLS_NARROW = 420;
/** Max colonnes bureau (grand écran). */
var FILTERS_DESKTOP_MAX_COLS = 5;
var FILTERS_DESKTOP_WIDE_MIN = 960;
var FILTERS_DESKTOP_DEFAULT_COLS = FILTERS_DESKTOP_MAX_COLS;

var GENERIC_AUTHORS = /^(admin|administrator|administrateur|editor|éditeur|editeur|rédaction|redaction|staff|wordpress|webmaster|collectif|tribune|link|daily|coordinating|exemplaire|quartier libre|zone campus|la pige|le délit|le delit|the link|the tribune|the mcgill daily)$/i;


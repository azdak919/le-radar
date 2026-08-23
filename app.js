// LE RADAR — Les médias étudiants du Québec
// Page unique : un syntoniseur radio en haut, un fil d'articles (texte) en dessous.

// Proxy CORS optionnel pour les flux HTTP→HTTPS (déployer proxy/cloudflare-worker.js).
// Désactivé volontairement : un proxy audio ferait exploser le free tier CF.
const PROXY_BASE = '';
// Cache + repli météo partagés (workers/weather-cache). le-radar.ca n'est pas
// sur Cloudflare (DNS chez WHC) : pas de domaine personnalisé possible, donc
// sous-domaine workers.dev de compte.
const WEATHER_API_BASE = 'https://le-radar-weather.azdak.workers.dev';
// Métadonnées « à l'antenne » (JSON/XML only — pas l'audio). Cache edge ~60 s.
// workers/nowplaying-cache — évite CORS / 429 sur Triton & co. côté navigateur.
const NOWPLAYING_API_BASE = 'https://le-radar-nowplaying.azdak.workers.dev';

function safeHttpUrl(url, { allowHttp = false } = {}) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol === 'https:') return u.href;
    if (allowHttp && u.protocol === 'http:') return u.href;
    return null;
  } catch {
    return null;
  }
}

/** Écoute 'change' d'une MediaQueryList avec repli addListener (Safari ≤ 13). */
function onMediaQueryChange(mq, handler) {
  if (!mq) return;
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', handler);
  else if (typeof mq.addListener === 'function') mq.addListener(handler);
}

function safeCssColor(color) {
  if (!color || typeof color !== 'string') return null;
  const c = color.trim();
  if (c === 'var(--accent)') return c;
  if (/^#[0-9A-Fa-f]{3,8}$/.test(c)) return c;
  return null;
}

function getPlayableStream(radio) {
  if (!radio?.stream) return null;
  const url = radio.stream;
  if (url.startsWith('http:') && location.protocol === 'https:' && !PROXY_BASE) return null;
  if (!PROXY_BASE) return url;
  return `${PROXY_BASE}/?url=${encodeURIComponent(url)}`;
}

function getListenUrl(radio) {
  return radio?.listenUrl || radio?.website || null;
}

function isExternalListen(radio) {
  return !!radio && !getPlayableStream(radio) && !!getListenUrl(radio);
}

function isSecurePageUrl(url = '') {
  return !!safeHttpUrl(url);
}

const EXTERNAL_LISTEN_LOAD_MS = 14000;
const EXTERNAL_POPUP_SIZE = 400;

let externalListenTimer = null;
let externalListenPopupWatch = null;

function setExternalListenStatus(mode, text) {
  if (!EXTERNAL_STATUS || !EXTERNAL_STATUS_TEXT) return;
  EXTERNAL_STATUS.classList.remove('is-ready', 'is-error');
  if (mode) EXTERNAL_STATUS.classList.add(mode);
  EXTERNAL_STATUS_TEXT.textContent = text;
}

function clearExternalListenTimers() {
  if (externalListenTimer) {
    clearTimeout(externalListenTimer);
    externalListenTimer = null;
  }
  if (externalListenPopupWatch) {
    clearInterval(externalListenPopupWatch);
    externalListenPopupWatch = null;
  }
}

function closeExternalListen() {
  clearExternalListenTimers();
  if (EXTERNAL_MODAL) {
    EXTERNAL_MODAL.classList.add('hidden');
    EXTERNAL_MODAL.hidden = true;
    EXTERNAL_MODAL.setAttribute('aria-hidden', 'true');
  }
  if (EXTERNAL_FRAME) EXTERNAL_FRAME.removeAttribute('src');
  if (EXTERNAL_FRAME_WRAP) EXTERNAL_FRAME_WRAP.classList.add('hidden');
  document.body.classList.remove('external-listen-open');
}

function bindExternalListen() {
  if (!EXTERNAL_MODAL) return;
  EXTERNAL_MODAL.querySelectorAll('[data-external-close]').forEach((el) => {
    el.addEventListener('click', closeExternalListen);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && EXTERNAL_MODAL && !EXTERNAL_MODAL.hidden) closeExternalListen();
  });
  EXTERNAL_REOPEN?.addEventListener('click', () => {
    if (currentStation && isExternalListen(currentStation)) {
      openExternalListenPopup(currentStation, { focus: true });
    }
  });
}

function openExternalListenPopup(radio, { focus = true } = {}) {
  const url = safeHttpUrl(getListenUrl(radio), { allowHttp: true });
  if (!url) return false;

  const name = `radar-listen-${radio.id}`;
  const features = [
    'popup=yes',
    `width=${EXTERNAL_POPUP_SIZE}`,
    `height=${EXTERNAL_POPUP_SIZE}`,
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'scrollbars=yes',
    'resizable=yes',
  ].join(',');

  if (listenWindow && !listenWindow.closed && listenWindowId === radio.id) {
    if (focus) listenWindow.focus();
    setExternalListenStatus('is-ready', 'Fenêtre du lecteur ouverte — appuyez sur ▶ si besoin.');
    return true;
  }

  listenWindow = window.open(url, name, features);
  listenWindowId = radio.id;

  if (!listenWindow) {
    setExternalListenStatus('is-error', 'Fenêtre bloquée par le navigateur. Utilisez le bouton ci-dessous.');
    EXTERNAL_REOPEN?.classList.remove('hidden');
    return false;
  }

  try { listenWindow.opener = null; } catch { /* cross-origin */ }

  setExternalListenStatus('is-ready', 'Fenêtre du lecteur ouverte — appuyez sur ▶ si la lecture ne démarre pas.');
  EXTERNAL_REOPEN?.classList.remove('hidden');

  clearExternalListenTimers();
  externalListenPopupWatch = setInterval(() => {
    if (!listenWindow || listenWindow.closed) {
      clearInterval(externalListenPopupWatch);
      externalListenPopupWatch = null;
      setExternalListenStatus('is-error', 'Fenêtre fermée. Rouvrez le lecteur avec le bouton ci-dessous.');
    }
  }, 800);

  return true;
}

function openExternalListenIframe(radio) {
  const url = safeHttpUrl(getListenUrl(radio));
  if (!url || !EXTERNAL_FRAME || !EXTERNAL_FRAME_WRAP) return;

  EXTERNAL_FRAME_WRAP.classList.remove('hidden');
  EXTERNAL_REOPEN?.classList.add('hidden');
  setExternalListenStatus('', 'Chargement de la page du poste…');

  let settled = false;
  const onReady = () => {
    if (settled) return;
    settled = true;
    clearExternalListenTimers();
    setExternalListenStatus('is-ready', 'Page chargée — appuyez sur ▶ dans le cadre si la lecture ne démarre pas.');
  };
  const onFail = () => {
    if (settled) return;
    settled = true;
    clearExternalListenTimers();
    EXTERNAL_FRAME.removeAttribute('src');
    EXTERNAL_FRAME_WRAP.classList.add('hidden');
    setExternalListenStatus('is-error', 'La page n\'a pas pu se charger ici. Ouvrez le lecteur dans une fenêtre séparée.');
    openExternalListenPopup(radio, { focus: true });
  };

  EXTERNAL_FRAME.onload = onReady;
  EXTERNAL_FRAME.onerror = onFail;
  EXTERNAL_FRAME.src = url;

  externalListenTimer = setTimeout(() => {
    if (!settled) onFail();
  }, EXTERNAL_LISTEN_LOAD_MS);
}

function openListenWindow(radio) {
  const url = getListenUrl(radio);
  if (!url) {
    showToast('Aucun site d\'écoute disponible pour ce poste.');
    return false;
  }

  if (!EXTERNAL_MODAL) {
    return openExternalListenPopup(radio);
  }

  clearExternalListenTimers();

  const hint = radio.listenHint
    || 'Si la lecture ne démarre pas automatiquement, appuyez sur le bouton de lecture (▶) dans le cadre ci-dessus.';
  const inst = shortInstitution(radio.institution, radio.type);

  EXTERNAL_TITLE.textContent = radio.fullName || radio.name;
  EXTERNAL_SUB.textContent = `${radio.frequency || 'Web'} · ${inst}`;
  if (EXTERNAL_HINT) EXTERNAL_HINT.textContent = hint;
  if (EXTERNAL_TAB) EXTERNAL_TAB.href = safeHttpUrl(url, { allowHttp: true }) || '#';

  if (EXTERNAL_LOGO) {
    if (radio.logo) {
      EXTERNAL_LOGO.src = radio.logo;
      EXTERNAL_LOGO.alt = radio.name;
      EXTERNAL_LOGO.classList.remove('hidden');
    } else {
      EXTERNAL_LOGO.classList.add('hidden');
      EXTERNAL_LOGO.removeAttribute('src');
    }
  }

  EXTERNAL_MODAL.classList.remove('hidden');
  EXTERNAL_MODAL.hidden = false;
  EXTERNAL_MODAL.setAttribute('aria-hidden', 'false');
  document.body.classList.add('external-listen-open');

  if (isSecurePageUrl(url)) {
    openExternalListenIframe(radio);
  } else {
    EXTERNAL_FRAME_WRAP?.classList.add('hidden');
    if (EXTERNAL_FRAME) EXTERNAL_FRAME.removeAttribute('src');
    EXTERNAL_REOPEN?.classList.remove('hidden');
    setExternalListenStatus('', 'Ouverture du lecteur dans une fenêtre séparée…');
    const opened = openExternalListenPopup(radio, { focus: true });
    if (!opened) {
      setExternalListenStatus('is-error', 'Impossible d\'ouvrir la fenêtre. Utilisez « Ouvrir dans un onglet ».');
    }
  }

  return true;
}

// ─── DOM refs ────────────────────────────────────────────────────────────────
const IS_TUNER_EMBED = document.documentElement.dataset.embed === 'tuner';
// app.js est aussi chargé depuis les fiches SEO imbriquées : les données
// restent ancrées à la racine du site, jamais au dossier courant de la fiche.
const APP_BASE_URL = new URL('.', document.currentScript?.src || location.href);
const appAsset = (path) => new URL(path, APP_BASE_URL).href;
const TUNER          = document.getElementById('tuner');
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
const TUNER_SELECT   = document.getElementById('tuner-select');
const TUNER_PREV     = document.getElementById('tuner-prev');
const TUNER_NEXT     = document.getElementById('tuner-next');
const TUNER_PLAY     = document.getElementById('tuner-play');
const TUNER_NAME     = document.getElementById('tuner-now-name');
const TUNER_SUB      = document.getElementById('tuner-now-sub');
const TUNER_SUB_AIR  = document.getElementById('tuner-now-sub-air');
const TUNER_SUB_ROTATE_MQ = window.matchMedia?.('(max-width: 1099.98px)');
// < 600 px = vrai téléphone. Demi-écran laptop (≈680–960) reste tablette.
const TUNER_DIAL_PHONE_MQ = window.matchMedia?.('(max-width: 599.98px)');
const TUNER_SUB_ROTATE_NARROW_MQ = window.matchMedia?.('(max-width: 479.98px)');
const TUNER_SUB_ROTATE_VERY_NARROW_MQ = window.matchMedia?.('(max-width: 359.98px)');
/**
 * Formats mid preview 768 / 900 (tablette / demi-écran) : assez de place pour
 * nom d’institution complet + horaire dans le carré — pas le téléphone (&lt;768)
 * ni le bureau avec panneau (≥1100).
 */
const TUNER_DIAL_MID_MQ = window.matchMedia?.('(min-width: 768px) and (max-width: 1099.98px)');
/** Embed : panneau latéral « À l'antenne » masqué (voir embed.css @media max-width 639.98px). */
const TUNER_EMBED_NOWAIR_HIDDEN_MQ = window.matchMedia?.('(max-width: 639.98px)');
/** Même seuil que seo-page-theme / data-wide-preview (shell E). */
const WIDE_TUNER_MQ = window.matchMedia?.('(min-width: 1281px)');
const TUNER_VOLUME   = document.getElementById('tuner-volume');
const TUNER_VOL      = document.getElementById('tuner-vol');
const TUNER_VOL_TOGGLE = document.getElementById('tuner-vol-toggle');
const TUNER_VOL_MUTE   = document.getElementById('tuner-vol-mute');
const VOL_COMPACT    = window.matchMedia('(max-width: 1099.98px)');
/** Embed étroit (iPhone) : la barre inline déborde du cadre → popover. */
const EMBED_VOL_POPOVER_MQ = window.matchMedia?.('(max-width: 559.98px)');
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
const TUNER_NOWAIR = document.getElementById('tuner-nowair');
const TUNER_NOWAIR_LABEL = TUNER_NOWAIR?.querySelector?.('.tuner-nowair-label') || null;
const TUNER_NOWAIR_TITLE = document.getElementById('tuner-nowair-title');
const TUNER_NOWAIR_SUB = document.getElementById('tuner-nowair-sub');
const ORIGINAL_ENGLISH_SCHEDULES = new Set(['cjlo', 'ckut']);

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
const ICO_PLAY       = TUNER_PLAY.querySelector('.ico-play');
const ICO_PAUSE      = TUNER_PLAY.querySelector('.ico-pause');
const ICO_EXTERNAL   = TUNER_PLAY.querySelector('.ico-external');

const NEWS_LIST      = document.getElementById('news-list');
const FILTERS_PANEL  = document.getElementById('news-filters-panel');

/** Premier paint stable d’une zone (anti-CLS) : révéler seulement alors. */
function markUiReady(el) {
  if (!el || el.dataset.ready === '1') return;
  el.dataset.ready = '1';
}
const NEWS_FILTERS   = document.getElementById('news-filters');
const FILTERS_TOGGLE = document.getElementById('filters-toggle');
const FILTERS_COMPACT = document.getElementById('filters-compact');
// Aligné sur le CSS : mode filtres « téléphone » seulement < 600 px.
const FILTERS_MOBILE = window.matchMedia('(max-width: 599.98px)');
const NEWS_COUNT     = document.getElementById('news-count');
const NEWS_UPDATED   = document.getElementById('news-updated');
const NEWS_EMPTY     = document.getElementById('news-empty');
const NEWS_SEARCH       = document.getElementById('news-search');
const NEWS_SEARCH_TOGGLE = document.getElementById('news-search-toggle');
const NEWS_SEARCH_PANEL  = document.getElementById('news-search-panel');
const NEWS_SEARCH_INPUT  = document.getElementById('news-search-input');
const NEWS_SEARCH_CLEAR  = document.getElementById('news-search-clear');
const NEWS_SEARCH_HINT   = document.getElementById('news-search-hint');
const TODAY_DATE     = document.getElementById('today-date');
const TODAY_TIME     = document.getElementById('today-time');
/** Dernier libellé date (sans heure) — pour ne re-fit météo que si le texte change.
 *  DOIT être avant `init()` : renderTodayDate lit/écrit cette clé au bootstrap
 *  (sinon TDZ → init failed → météo/sports morts). */
let mastheadDateLabelKey = '';

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
const MASTHEAD_DATE_FORMATS = [
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

let MASTHEAD_WEATHER = document.getElementById('masthead-weather');
let MASTHEAD_WEATHER_DOCK = document.getElementById('masthead-weather-dock');
let MASTHEAD_SPORTS_STRIP = document.getElementById('masthead-sports-strip');
const MASTHEAD_ACTIONS = document.querySelector('.masthead-actions');
const MASTHEAD_BG_SHUFFLE = document.getElementById('masthead-bg-shuffle');
const MASTHEAD_BG_SHUFFLE_HOME = document.getElementById('masthead-shuffle-slot');
const TOAST_EL       = document.getElementById('toast');
const THEME_TOGGLE   = document.getElementById('theme-toggle');
const EXTERNAL_MODAL = document.getElementById('external-listen');
const EXTERNAL_TITLE = document.getElementById('external-listen-title');
const EXTERNAL_SUB   = document.getElementById('external-listen-sub');
const EXTERNAL_STATUS = document.getElementById('external-listen-status');
const EXTERNAL_STATUS_TEXT = document.getElementById('external-listen-status-text');
const EXTERNAL_FRAME_WRAP = document.getElementById('external-listen-frame-wrap');
const EXTERNAL_FRAME = document.getElementById('external-listen-frame');
const EXTERNAL_HINT  = document.getElementById('external-listen-hint');
const EXTERNAL_REOPEN = document.getElementById('external-listen-reopen');
const EXTERNAL_TAB   = document.getElementById('external-listen-tab');
const EXTERNAL_LOGO  = document.getElementById('external-listen-logo');

// ─── State ───────────────────────────────────────────────────────────────────
let radios = [];          // ordered list backing the tuner
let news = [];
let newsSourcesByName = {};
let newsSourceFilter = 'all';
/** Recherche locale (titre / auteur / source / extrait / crédits) — jamais de fetch distant. */
let newsSearchQuery = '';
let newsSearchOpen = false;
let newsSearchDebounce = null;
let currentStation = null; // radio object selected in tuner
/** Choix explicite (menu / prev-next / play). Le restore session ne le pose pas. */
let userPickedStation = false;
/** Another same-origin tab/page owns the real audio (Phase 1 multi-page sync). */
let syncRemotePlaying = false;
/**
 * True only after a *live* peer announced itself (BroadcastChannel state/yield).
 * localStorage alone can leave a ghost `playing: true` after the leader tab died;
 * without this flag the UI shows ⏸ and the first click only clears the ghost
 * instead of starting audio — silence until a second press.
 */
let remoteLeaderConfirmed = false;
let audio = null;
// Lecture demandée, mais aucun son confirmé par l'événement `playing`.
let isBuffering = false;
let bufferingSafetyTimer = null;
let suppressAudioError = false;
// Amplification optionnelle via Web Audio : permet de dépasser 100 % pour les
// flux trop faibles (ex. CKUT). Les postes sans en-tête CORS ne peuvent pas être
// amplifiés ; on retombe alors en lecture native plafonnée à 100 %.
// UI 0–200 % sur tous les appareils qui supportent Web Audio. Sur mobile, le
// graphe n'est branché qu'au-dessus de 100 % afin de garder la lecture native
// (plus fiable à l'écran verrouillé) pour le cas courant ≤ 100 %.
let audioCtx = null;
let gainNode = null;
let compressorNode = null;
let analyserNode = null;
let mediaSource = null;
let boostWired = false;             // graphe Web Audio branché sur l'élément courant
let boostCtxLifecycleBound = false;  // listeners visibility/focus pour reprendre l'AudioContext
let webAudioSupported = !!(window.AudioContext || window.webkitAudioContext);
// Stratégie de persistance d'écoute (Media Session, reconnexion, keepalive iOS).
const MOBILE_PLAYBACK = window.matchMedia('(hover: none) and (pointer: coarse)').matches
  || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
// iOS (y compris iPadOS qui se présente comme macOS) : `audio.volume` est en
// lecture seule — seul le gain Web Audio permet de régler le niveau.
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let userPaused = false;
let mobilePlayback = null;
const playerListenersAttached = new WeakSet();
// 100 % est la référence commune : le volume ne doit pas sembler réduit au
// premier chargement, quel que soit le contexte (site, Pomo ou Solitaire).
const DEFAULT_GAIN = 1;
let currentGain = DEFAULT_GAIN;
let volumeMuted = false;
let gainBeforeMute = DEFAULT_GAIN;
const MAX_GAIN = 2;                 // jusqu'à 200 %
const VOLUME_PREF_VERSION_KEY = 'radar-player-vol-version';
/** Mute explicite — survit au rechargement (en plus de la session multi-onglets). */
const VOLUME_MUTE_KEY = 'radar-player-muted';
const VOLUME_PREF_VERSION = '3';
const STATION_TRIMS_KEY = 'radar-player-station-trims-v1';
const stationTrims = new Map();
let loudnessProbeTimer = null;
let loudnessProbeStationId = null;
// Curseur 0–200 % dès que Web Audio existe — y compris mobile / tablette.
const GAIN_UI_MAX = webAudioSupported ? MAX_GAIN : 1;
const VOL_THUMB_PX = 16;
let volumeSliderDragging = false;
const boostUnavailable = new Set(); // ids des postes sans CORS
// Réglages de lecture par poste. CFAK (Sherbrooke) a de petites coupures : on
// précharge davantage et on reconnecte automatiquement quand le flux décroche.
// CHYZ (Centova/Shoutcast) : lecture native seule — Web Audio + crossOrigin casse le flux.
const STATION_PLAYBACK = {
  cfak: { resilient: true },
  chyz: { resilient: true, noBoost: true },
};
let reconnectTries = 0;
let listenWindow = null;
let listenWindowId = null;
let radioNowPlaying = { stations: {}, updatedAt: null };
let radioSchedules = { stations: {}, timezone: 'America/Toronto' };
let nowPlayingPollTimer = null;
let nowPlayingRefreshPromise = null;
let nowAirTick = null;
let nowAirPreviewTimer = null;
let nowAirPreviewRadio = null;
let lastNowAirPreviewId = null;
let lastDialCarouselText = '';
let lastNowAir = { title: null, sub: null, empty: null, previewId: null, kind: null, stationId: null, shell: null };
let tunerSubMeta = '';
let tunerSubAirText = '';
let tunerSubRotateTimer = null;
/** Quel créneau du dial est actif (false = A, true = B). */
let dialRotateSlotB = false;
/**
 * Rotation de l'antenne : index dans `airRotationPhases()`.
 * Une seule horloge le fait avancer — le tick du dial en compact, le timer du
 * panneau sur bureau. Les deux surfaces sont exclusives (le panneau est
 * `display:none` sous 1100 px), donc jamais deux cadences concurrentes.
 */
let airPhaseIndex = 0;
/** Timer du panneau bureau uniquement (le dial a le sien). */
let airPanelRotateTimer = null;
/** Demander un fondu sur le prochain render (bascule de phase ou de poste). */
let nowAirCrossfadePending = false;
/** Incrémenté à chaque fondu pour annuler les timeouts obsolètes. */
let nowAirFadeGen = 0;
// La lecture audio continue en arrière-plan; seules les animations de
// présentation sont figées. Sans cette séparation, les navigateurs qui
// suspendent leurs timers font « rattraper » le synthétiseur au retour.
let tunerPresentationPaused = false;
let tunerPresentationNeedsRefresh = false;
let tunerPresentationResumePromise = null;
let tunerPresentationResumeGeneration = 0;
// L’iframe du Pomodoro est un espace de concentration : laisser chaque
// station / émission lisible plus longtemps avant de passer à la suivante.
// La page Radar conserve son rythme plus vif.
const TUNER_SUB_ROTATE_MS = IS_TUNER_EMBED ? 14000 : 8000;
/** Carrousel postes au repos : délai fixe (évite le flip à toute allure). */
const NOW_AIR_PREVIEW_DWELL_MS = 8000;
const TUNER_SUB_ROTATE_NARROW_MS = 14000;
const TUNER_SUB_ROTATE_VERY_NARROW_MS = 18000;
const AIR_PANEL_ROTATE_MS = 8000;
/**
 * Marquee site-wide (dial, à l’antenne, sports, météo, embed) :
 * 1) délai de lecture au repos  2) aller L→R puis retour à l’origine
 * 3) si ce tour est trop court pour lire, un 2ᵉ aller-retour
 * 4) pause au repos  5) seulement alors changer le texte.
 * Jamais `infinite`.
 */
/** Pause initiale avant le 1er pixel de scroll (CSS animation-delay). */
const MARQUEE_READ_DELAY_MS = 1600;
/** Un aller-retour = `alternate` × 2 (pas infinite). */
const MARQUEE_ROUND_TRIPS = 2;
/** Plafond : 2 aller-retour (4 itérations) si le premier tour est trop vite. */
const MARQUEE_TRIPS_MAX = 4;
/** Pause de lecture après le retour, avant de changer de texte. */
const MARQUEE_REST_MS = 2000;

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
const AIR_LIVE_DWELL_FACTOR = 2;
const NOW_AIR_CROSSFADE_MS = 700;
/** Bascule du contenu du panneau antenne (fondu CSS de 0,3 s). */
const NOW_AIR_PANEL_SWAP_MS = 280;
const PREFERS_REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)');
let sourceColors = {};     // source name → accent colour
let brandColors = { institutions: {}, fallback_palette: ['#003DA5', '#6C2163', '#047857'] };
let filtersExpanded = false;
/** Suite du fil : repli après NEWS_TAIL_VISIBLE articles (toutes plateformes). */
let newsTailExpanded = false;
const NEWS_TAIL_VISIBLE = 10;
/**
 * Rangée « peek » sous le fondu (titres partiels avant « Plus d'articles »).
 * 2 = max colonnes de la grille (.news-tail-body ≥ 600 px) — ces cartes
 * restent en is-tail-overflow (hors max-height) mais doivent être traduites.
 */
const NEWS_TAIL_PEEK_TRANSLATE = 2;
let volSliderResizeObs = null;
const marqueeTextByEl = new WeakMap();
const marqueeObservedEls = new WeakSet();
let marqueeResizeObs = null;
let marqueeResizeScheduled = false;
let filterMarqueeResyncTimer = null;
const FILTER_MARQUEE_RESYNC_MS = 480;

/** Rangées visibles avant « Plus de sources » — 1 partout, + un aperçu du
 *  titre de la rangée suivante (--filters-peek) ; jamais un bout de 3e rangée. */
const FILTERS_COLLAPSED_ROWS_DESKTOP = 1;
const FILTERS_COLLAPSED_ROWS_COMPACT = 1;
const FILTERS_COMPACT_MQ = window.matchMedia(
  '(max-width: 1099.98px) and (orientation: portrait)',
);
const FILTERS_ROW_CAPACITY = 3;
const FILTERS_COLS_NARROW = 420;
/** Max colonnes bureau (grand écran). */
const FILTERS_DESKTOP_MAX_COLS = 5;
const FILTERS_DESKTOP_WIDE_MIN = 960;
const FILTERS_DESKTOP_DEFAULT_COLS = FILTERS_DESKTOP_MAX_COLS;

const GENERIC_AUTHORS = /^(admin|administrator|administrateur|editor|éditeur|editeur|rédaction|redaction|staff|wordpress|webmaster|collectif|tribune|link|daily|coordinating|exemplaire|quartier libre|zone campus|la pige|le délit|le delit|the link|the tribune|the mcgill daily)$/i;

// ─── Bootstrap ───────────────────────────────────────────────────────────────
init().catch((e) => console.error('init failed', e));

async function init() {
  initTheme();
  // Thème bandeau radio bureau (sessions univ. QC).
  // RadarSessionFreshness (script defer avant app.js) l’applique déjà au load ;
  // rappel idempotent ici pour les chemins qui ne passent pas par le lib.
  try {
    if (typeof RadarSessionFreshness !== 'undefined') {
      RadarSessionFreshness.applyUniversitySessionTheme();
    }
  } catch (_) { /* ignore */ }
  initMastheadActions();
  renderTodayDate();
  syncSeoScheduleNow();
  initSeoScheduleHashScroll();
  // Date déjà visible sans attendre la photo. Rejouer la cascade au .loaded
  // (chrome 1-ligne / largeur) — sinon un format long hors photo peut ellipser.
  const bgPhotoLayer = document.getElementById('bg-photo-layer');
  if (bgPhotoLayer && typeof MutationObserver !== 'undefined') {
    const photoDateMo = new MutationObserver(() => {
      if (bgPhotoLayer.classList.contains('loaded')) {
        renderTodayDate();
        // La puce date gagne padding/bordure au loaded : refit météo même
        // si le texte de date n’a pas changé (sinon dernière ville clipée).
        window.setTimeout(() => scheduleMastheadWeatherLayout(), 0);
      }
    });
    photoDateMo.observe(bgPhotoLayer, { attributes: true, attributeFilter: ['class'] });
  }
  // L'heure du mât est décorative, mais doit rester juste sans recharger la page.
  window.setInterval(() => {
    renderTodayDate();
    syncSeoScheduleNow();
    syncSeoScheduleHub();
  }, 30_000);
  // Changement de langue : la date se reformate elle-même (elle est hors du
  // moteur de traduction, voir `mastheadLocale`). La cascade d'ajustement se
  // rejoue du même coup, une langue n'ayant pas la longueur d'une autre.
  window.addEventListener('radar:translate-mode', () => renderTodayDate());
  // La cascade dépend de la largeur disponible : une rotation d'écran doit la
  // rejouer tout de suite, pas au prochain tic de 30 s. Groupé en rAF comme la
  // mise en page météo, pour ne pas mesurer à chaque pixel du redimensionnement.
  let todayDateFitPending = false;
  window.addEventListener('resize', () => {
    if (todayDateFitPending) return;
    todayDateFitPending = true;
    window.requestAnimationFrame(() => {
      todayDateFitPending = false;
      renderTodayDate();
    });
  }, { passive: true });
  // Polices web : la cascade date mesure avec la fonte système d’abord, puis
  // la webfont élargit le glyphe → scrollWidth > clientWidth (CI Linux surtout).
  // Rejouer après fonts.ready (parité bandeau météo).
  try {
    const fonts = document.fonts;
    if (fonts?.ready && typeof fonts.ready.then === 'function') {
      fonts.ready.then(() => {
        if (!TODAY_DATE?.isConnected) return;
        renderTodayDate();
      }).catch(() => { /* ignore */ });
    }
  } catch { /* document.fonts absent */ }
  // Les constantes météo sont déclarées plus bas dans ce script : microtask
  // = après l'évaluation complète du fichier, sans retarder le reste du site.
  queueMicrotask(() => {
    ensureMastheadBoards();
    void initMastheadWeather();
    void initMastheadSports();
  });
  window.setTimeout(() => {
    if (MASTHEAD_WEATHER?.querySelector('.masthead-weather__city.is-active')) {
      markUiReady(MASTHEAD_WEATHER);
    }
    if (MASTHEAD_SPORTS_STRIP && !MASTHEAD_SPORTS_STRIP.classList.contains('is-empty')
        && MASTHEAD_SPORTS_STRIP.querySelector('.sports-chip')) {
      markUiReady(MASTHEAD_SPORTS_STRIP);
    }
    markUiReady(FILTERS_PANEL);
  }, 4500);
  setupAudio();
  bindTuner();
  bindExternalListen();
  bindFiltersPanel();
  bindNewsSearch();
  initPageScrollTop();
  initHomeNavRefresh();

  try {
    const brandData = await fetch(appAsset('brand-colors.json')).then((r) => r.json());
    if (brandData?.institutions) brandColors = brandData;
  } catch (e) {
    console.warn('Failed to load brand-colors.json', e);
  }

  try {
    const sourcesRegistry = await fetch(appAsset('news-sources.json'))
      .then((r) => r.json())
      .catch(() => ({ active: [] }));
    newsSourcesByName = Object.fromEntries(
      (sourcesRegistry?.active || []).map((s) => [s.name, s]),
    );
  } catch {
    newsSourcesByName = {};
  }

  const [radiosData, nowPlayingData, schedulesData] = await Promise.allSettled([
    fetch(appAsset('radios.json')).then((r) => r.json()),
    fetch(appAsset('radio-nowplaying.json')).then((r) => r.json()),
    fetch(appAsset('radio-schedules.json')).then((r) => r.json()),
    ...(IS_TUNER_EMBED ? [] : [loadNews()]),
  ]);

  radios = radiosData.status === 'fulfilled'
    ? sortRadios(radiosData.value).filter((r) => getPlayableStream(r))
    : [];
  wideDialFixedPx = 0;
  radioNowPlaying = nowPlayingData.status === 'fulfilled'
    ? decodeNowPlayingPayload(nowPlayingData.value)
    : { stations: {} };
  radioSchedules = schedulesData.status === 'fulfilled' && schedulesData.value?.stations
    ? schedulesData.value
    : { stations: {}, timezone: 'America/Toronto' };
  syncSeoScheduleHub();
  buildTunerOptions();
  // Volume/mute avant toute selectStation : celle-ci peut écrire la session
  // partagée (stationId) et ne doit pas republier le gain par défaut 100 %
  // par-dessus un mute mémorisé (embed Kiosque, rechargement).
  restoreVolume();
  // Surface publique versionnée du Kiosque : la station demandée est
  // appliquée seulement après le chargement de radios.json. Auparavant le
  // paramètre était présent dans l'URL mais ignoré, donc chaque journal
  // affichait le sélecteur vide.
  if (IS_TUNER_EMBED) {
    const requestedStation = new URLSearchParams(window.location.search).get('station');
    if (requestedStation && radios.some((radio) => radio.id === requestedStation)) {
      TUNER_SELECT.value = requestedStation;
      selectStation(requestedStation, { autoplay: false, openExternal: false });
    }
  }
  tunerSubMeta = TUNER_SUB?.textContent?.trim() || 'Radios étudiantes en direct';
  initTunerSubRotateListeners();
  initMarqueeResizeListeners();
  // Pré-semer l’aperçu compact (B) avant le 1er render — évite une frame
  // « Syntoniser un poste » après le chargement de radios.json.
  if (!currentStation && isNowAirPanelPreviewMode()) {
    pickNowAirPreviewRadio();
    if (nowAirPreviewRadio && (isDialCompactLayout() || isMobileIdleDialPreview())) {
      setTunerNameText(compactDialTitleLine(nowAirPreviewRadio));
      const story = idleDialStoryLine(nowAirPreviewRadio);
      if (story && TUNER_SUB) applyMarquee(TUNER_SUB, story);
      markTunerDialReady();
    }
  }
  // Antenne tout de suite (grilles + nowplaying déjà là) pour stabiliser le
  // layout du synthé — pas d'attente des APIs live, qui ne font qu'affiner.
  renderTunerNowAir();
  // API live navigateur (CISM…) : second passage quand dispo.
  refreshStationLiveApis().finally(() => {
    renderTunerNowAir();
  });
  startNowAirTick();
  initTunerPresentationLifecycle();
  initContentFreshnessLifecycle();
  initPlayerSync();
  registerServiceWorker();
}

/**
 * Phase 1 — multi-page / multi-tab player sync (same origin).
 * Leader owns <audio>; followers mirror station + play UI and yield on claim.
 */
function initPlayerSync() {
  const Sync = window.RadarPlayerSync;
  if (!Sync) return;

  Sync.init({
    onYield() {
      // Another context is taking the stream — free the audio device here.
      softStopLocalAudio({ clearRemoteFlag: false });
      syncRemotePlaying = true;
      remoteLeaderConfirmed = true;
      updatePlayUI();
    },
    onRemoteState(state) {
      if (!state || Sync.isApplyingRemote?.()) {
        /* still apply — guard is set by Sync around this call */
      }

      // Volume / mute partagés — y compris depuis un onglet suiveur (SEO, Pomo…).
      applyRemoteVolumeState(state);

      const iAmLeader = Sync.isLeader(state);

      // Changement de poste demandé par un autre onglet (suiveur) : le leader
      // doit basculer le flux ici. Auparavant autoplay était toujours false, donc
      // le menu changeait d’UI sans jamais changer l’audio.
      if (state.stationId && state.stationId !== currentStation?.id) {
        const exists = radios.some((r) => r.id === state.stationId);
        if (exists) {
          selectStation(state.stationId, {
            autoplay: !!(iAmLeader && state.playing),
            openExternal: false,
            fromSync: true,
          });
        }
      }

      if (state.playing && !iAmLeader) {
        softStopLocalAudio({ clearRemoteFlag: false });
        syncRemotePlaying = true;
        // Channel/storage event from another context = a living peer, not a ghost.
        remoteLeaderConfirmed = true;
        userPaused = false;
        updatePlayUI();
        return;
      }

      if (!state.playing) {
        const wasRemote = syncRemotePlaying;
        syncRemotePlaying = false;
        remoteLeaderConfirmed = false;
        if (!iAmLeader && wasRemote) {
          // Global pause from another tab — keep station, show ▶
          updatePlayUI();
        } else if (iAmLeader && audio && !audio.paused) {
          // Unusual: we think we're leader but state says paused — trust local
          updatePlayUI();
        } else {
          updatePlayUI();
        }
      } else if (state.playing && iAmLeader) {
        syncRemotePlaying = false;
        remoteLeaderConfirmed = false;
        // If we just became leader via our own claim, play() is already running.
        // If state was restored and we're leader of a dead tab id, tab ids never match
        // after reload — so this branch is only for live leaders.
        updatePlayUI();
      }
    },
  });

  // Hydrate from last session (other tab or previous page)
  const boot = Sync.readState();
  if (boot) {
    if (Number.isFinite(boot.volume) || boot.muted) {
      applyRemoteVolumeState(boot);
    }

    if (boot.stationId && radios.some((r) => r.id === boot.stationId)) {
      selectStation(boot.stationId, {
        autoplay: false,
        openExternal: false,
        fromSync: true,
      });
    }

    if (boot.playing) {
      // Phase 2a: best-effort resume if this tab already had a play gesture (session armed).
      // Otherwise wait for a live peer's hello reply before mirroring "en lecture".
      // localStorage alone is not proof — a closed tab leaves playing:true forever.
      syncRemotePlaying = true;
      remoteLeaderConfirmed = false;
      updatePlayUI();
      scheduleSessionResume(boot);
      scheduleOrphanRemoteCleanup(boot);
    }
  }

  // bfcache / back-forward: try to continue after page restore
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    const s = Sync.readState();
    if (s?.playing) scheduleSessionResume(s, { fromBfcache: true });
  });
}

const PLAYER_ARMED_KEY = 'radar-player-armed';

function isPlayerSessionArmed() {
  try {
    return sessionStorage.getItem(PLAYER_ARMED_KEY) === '1';
  } catch {
    return false;
  }
}

function armPlayerSession() {
  try {
    sessionStorage.setItem(PLAYER_ARMED_KEY, '1');
  } catch { /* private mode */ }
  document.documentElement.dataset.radarPlaying = '1';
}

function disarmPlayerSessionPlayingFlag() {
  document.documentElement.dataset.radarPlaying = '0';
}

/**
 * Phase 2a — try to resume stream after same-tab navigation / bfcache.
 * Only if sessionStorage is armed (user already pressed play in this tab).
 * Never steals from a live peer: brief wait for yield/state, then claim+play.
 */
let sessionResumeTimer = null;
function scheduleSessionResume(boot, { fromBfcache = false } = {}) {
  if (sessionResumeTimer) {
    clearTimeout(sessionResumeTimer);
    sessionResumeTimer = null;
  }
  if (!boot?.playing || !boot.stationId) return;
  if (!isPlayerSessionArmed() && !fromBfcache) {
    // Cold tab (no prior gesture here): stay as follower UI only.
    return;
  }

  // Let BroadcastChannel peers announce themselves first.
  sessionResumeTimer = window.setTimeout(() => {
    sessionResumeTimer = null;
    trySessionResume(boot);
  }, fromBfcache ? 40 : 120);
}

async function trySessionResume(boot) {
  const Sync = window.RadarPlayerSync;
  if (!Sync || !boot?.stationId) return;
  if (userPaused) return;
  // Another live leader already pushed remote state — do not steal.
  if (syncRemotePlaying && isPlaying()) return;
  if (isPlaying()) return;

  const radio = radios.find((r) => r.id === boot.stationId);
  if (!radio || !getPlayableStream(radio)) {
    syncRemotePlaying = true;
    updatePlayUI();
    return;
  }

  // If a peer just claimed leadership after our hello, onRemoteState set syncRemotePlaying.
  // Only resume when we still look like the orphaned "playing" session (dead leader id).
  const live = Sync.readState();
  if (live && live.playing && live.leaderId && live.leaderId !== Sync.getTabId()) {
    // Live peer confirmed over the channel: stay follower, do not steal.
    if (remoteLeaderConfirmed && !isPlayerSessionArmed()) {
      syncRemotePlaying = true;
      updatePlayUI();
      return;
    }
    // Armed same-tab navigation: claimPlay will yield a live peer (OK: user moved here).
    // Unconfirmed leader id may be a ghost from a closed tab — resume when armed.
    if (!isPlayerSessionArmed() && !remoteLeaderConfirmed) {
      // Cold tab, no peer hello yet: wait — orphan cleanup will drop the mirror
      // if nobody answers; a late hello will set remoteLeaderConfirmed.
      syncRemotePlaying = true;
      updatePlayUI();
      return;
    }
  }

  syncRemotePlaying = false;
  remoteLeaderConfirmed = false;
  try {
    await play(radio);
    if (!isPlaying()) {
      // Autoplay blocked or stream not up yet: keep mirror so UI can show remote/armed state.
      syncRemotePlaying = true;
      updatePlayUI();
    }
  } catch {
    syncRemotePlaying = true;
    updatePlayUI();
  }
}

/** Pause local media without publishing pause (used when yielding leadership). */
function softStopLocalAudio({ clearRemoteFlag = true } = {}) {
  mobilePlayback?.onPlayStop?.();
  setBuffering(false);
  if (audio) {
    suppressAudioError = true;
    try { audio.pause(); } catch { /* */ }
    suppressAudioError = false;
  }
  if (clearRemoteFlag) {
    syncRemotePlaying = false;
    remoteLeaderConfirmed = false;
  }
}

/**
 * After boot, a live leader answers `hello` with a state rebroadcast (~ms).
 * If nobody confirms, only relax the *local* "en lecture ailleurs" mirror so ▶
 * is shown and one click starts audio.
 *
 * Critical: never write `playing: false` into the shared session here.
 * A follower page (nav-shell iframe / SEO) that ran this cleanup used to
 * publish a global pause and kill continuity on the host that still owned
 * the real <audio>. Same-tab resume (session armed) must also be left alone.
 */
let orphanRemoteTimer = null;
function scheduleOrphanRemoteCleanup(boot) {
  if (orphanRemoteTimer) {
    clearTimeout(orphanRemoteTimer);
    orphanRemoteTimer = null;
  }
  if (!boot?.playing) return;
  // Continuity Phase 2a: this tab will claim+play shortly — not a ghost.
  if (isPlayerSessionArmed()) return;

  orphanRemoteTimer = window.setTimeout(() => {
    orphanRemoteTimer = null;
    if (remoteLeaderConfirmed || isPlaying() || isCasting() || userPaused) return;
    if (isPlayerSessionArmed() || isBuffering) return;
    if (!syncRemotePlaying) return;
    // Local UI only — shared localStorage stays intact so a live host
    // (or a later armed resume) is not paused from a cold follower tab.
    syncRemotePlaying = false;
    remoteLeaderConfirmed = false;
    updatePlayUI();
  }, 800);
}

/**
 * Un flux LIVE peut ne jamais répondre (ou une page suiveuse peut recevoir un
 * événement tardif). Le bouton ne doit alors jamais rester en boucle : il
 * redevient un bouton lecture après un court délai, toujours annulable avant.
 */
function setBuffering(next) {
  isBuffering = !!next;
  if (bufferingSafetyTimer) {
    clearTimeout(bufferingSafetyTimer);
    bufferingSafetyTimer = null;
  }
  if (isBuffering) {
    bufferingSafetyTimer = setTimeout(() => {
      bufferingSafetyTimer = null;
      if (!isBuffering) return;
      isBuffering = false;
      updatePlayUI();
    }, 12_000);
  }
}

function registerServiceWorker() {
  if (IS_TUNER_EMBED || !('serviceWorker' in navigator)) return;
  // Recharge uniquement après une *mise à jour* (pas la 1ʳᵉ prise de contrôle SW),
  // sinon la page charge → SW claim → controllerchange → reload = double flash.
  // Ne jamais recharger pendant une écoute (déploiement coupait la radio).
  const hadControllerOnLoad = !!navigator.serviceWorker.controller;
  let reloading = false;
  const reloadUnlessListening = () => {
    if (reloading) return;
    if (!hadControllerOnLoad) return; // 1ʳᵉ activation : rester sur cette page
    if (isPlaybackActive()) return;
    reloading = true;
    window.location.reload();
  };
  // Toujours depuis la racine de l’app (app.js), pas le chemin de la page :
  // sinon /sports/ enregistre /sports/sw.js (404) et casse le lecteur SEO.
  navigator.serviceWorker.register(appAsset('sw.js')).then((reg) => {
    // waiting déjà prêt (onglet ouvert pendant deploy) → activer sans double-écoute
    if (reg.waiting && hadControllerOnLoad) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        // Laisser controllerchange gérer le reload (une seule fois).
        if (worker.state === 'installed' && reg.waiting && hadControllerOnLoad) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
  }).catch((e) => {
    console.warn('Service worker registration failed', e);
  });
  // update() en arrière-plan — ne force pas de reload immédiat
  checkForAppUpdate();
  navigator.serviceWorker.addEventListener('controllerchange', reloadUnlessListening);
}

/**
 * Demande au navigateur de revérifier le service worker.
 *
 * Appelé au chargement, puis à chaque retour dans l'app : une PWA installée
 * n'est jamais « rechargée » au sens habituel, donc sans cette relance elle
 * peut servir le shell du jour de son installation pendant des semaines.
 * Le rechargement, lui, reste piloté par `controllerchange` — qui ne coupe
 * jamais une écoute en cours.
 */
function checkForAppUpdate() {
  if (IS_TUNER_EMBED || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations?.().then((regs) => {
    regs.forEach((reg) => reg.update());
  }).catch(() => {});
}

/** Évite que hover/focus laissent un bouton masthead « engagé » après un tap ou clic. */
function initMastheadActions() {
  document.querySelectorAll('.masthead-actions .masthead-icon').forEach((el) => {
    const release = () => {
      requestAnimationFrame(() => {
        if (document.activeElement === el) el.blur();
      });
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('click', release);
  });
}

// ─── Theme (clair / sombre) ────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('radar-theme');
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
  THEME_TOGGLE?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem('radar-theme', next);
    applyTheme(next);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark';
  // Icône = action (ce qu’on active au clic), pas l’état courant :
  // sombre → soleil (passer en clair) ; clair → lune (passer en sombre).
  THEME_TOGGLE?.querySelector('.ico-sun')?.classList.toggle('hidden', !isDark);
  THEME_TOGGLE?.querySelector('.ico-moon')?.classList.toggle('hidden', isDark);
  if (THEME_TOGGLE) {
    const label = isDark ? 'Passer en mode clair' : 'Passer en mode sombre';
    THEME_TOGGLE.setAttribute('aria-label', label);
    THEME_TOGGLE.setAttribute('title', label);
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#0e0f12' : '#ffffff');
}

// ─── Today date (masthead) ─────────────────────────────────────────────────────

/**
 * Locale d'affichage du mât : le mode de traduction actif s'il y en a un,
 * sinon la langue du document.
 *
 * POURQUOI PAS LE MOTEUR DE TRADUCTION
 * Une date est une donnée, pas de la prose. Passée au traducteur, « jeudi
 * 6 août 2026 » revenait en « THURSDAY AUGUST 6, 20 » — mauvaise casse, ordre
 * anglo-américain, et une longueur que personne n'avait mesurée. `Intl` rend
 * l'ordre et la casse justes pour chacun des modes du sélecteur, sans appel
 * réseau. Les balises `translate="no"` du mât tiennent le moteur à l'écart.
 */
function mastheadLocale() {
  let tag = null;
  try {
    const mode = window.RadarTranslate?.getMode?.();
    if (mode && mode !== 'original') tag = mode === 'fr' ? 'fr-CA' : mode === 'en' ? 'en-CA' : mode;
  } catch { /* traduction absente : on garde la langue du document */ }
  if (!tag) {
    tag = (document.documentElement.lang || 'fr').toLowerCase().startsWith('en') ? 'en-CA' : 'fr-CA';
  }
  // `iu`, `iu-latn`… : sans données Intl, la locale par défaut du navigateur
  // prendrait la main et sortirait une date dans une troisième langue. On
  // préfère le français du document à cette surprise.
  try {
    if (!Intl.DateTimeFormat.supportedLocalesOf(tag).length) return 'fr-CA';
  } catch { return 'fr-CA'; }
  return tag;
}

/**
 * True si la puce date est lisible : pas d’ellipse sur #today-date, heure
 * entière, puce à gauche des icônes. Le test scrollWidth seul rate le cas
 * mobile 430 : date longue « tient », l’heure est clipée par overflow:hidden.
 */
function mastheadDateChipFits() {
  if (!TODAY_DATE) return true;
  // Texte plus large que la boîte visible → format trop long (ellipse / clip).
  // Tolérance 1 px : sub-pixel webfonts CI Linux.
  if (TODAY_DATE.scrollWidth > TODAY_DATE.clientWidth + 1) return false;
  const host = TODAY_DATE.closest('.masthead-date');
  if (!host) return true;
  const hostBox = host.getBoundingClientRect();
  // Invisible / pas encore posé : ne pas valider un format long.
  if (hostBox.width < 1) return false;
  if (MASTHEAD_ACTIONS) {
    const actionsBox = MASTHEAD_ACTIONS.getBoundingClientRect();
    if (actionsBox.width > 0 && hostBox.right > actionsBox.left + 1) return false;
  }
  if (TODAY_TIME) {
    const timeBox = TODAY_TIME.getBoundingClientRect();
    if (timeBox.width > 1 && timeBox.right > hostBox.right + 1) return false;
    if (TODAY_TIME.scrollWidth > TODAY_TIME.clientWidth + 1) return false;
  }
  return true;
}

function renderTodayDate() {
  if (!TODAY_DATE && !TODAY_TIME) return;
  const now = new Date();
  // La date du mât existe désormais aussi sur les pages d'entités, volet
  // anglais compris : la locale suit donc `lang` du document. En dur sur
  // `fr-CA`, /en/ affichait « lundi 3 août 2026 » sous un titre anglais.
  const locale = mastheadLocale();
  const isEnglish = locale.toLowerCase().startsWith('en');
  // Heure d’abord : sur photo date+heure partagent une puce flex. Si la
  // cascade date tourne avant l’heure, #today-date prend toute la largeur,
  // le format long « tient », puis l’heure arrive et l’ellipse coupe la date.
  // FR : « 15 h 03 » (typographie QC). EN : « 15:03 » (évite « 3:03 p.m. » large).
  if (TODAY_TIME) {
    TODAY_TIME.dateTime = now.toTimeString().slice(0, 5);
    const rawClock = now.toLocaleTimeString(isEnglish ? 'en-CA' : 'fr-CA', {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    if (isEnglish) {
      TODAY_TIME.textContent = rawClock
        .replace(/\s*h\s*/iu, ':')
        .replace(/(\d{1,2})\s*[:.]\s*(\d{2})/, '$1:$2')
        .trim();
    } else {
      // Normaliser colon / « h » navigateur → « 15 h 03 ».
      TODAY_TIME.textContent = rawClock
        .replace(/(\d{1,2})\s*[:.]\s*(\d{2})/, '$1 h $2')
        .replace(/\s*h\s*/iu, ' h ')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }
  if (TODAY_DATE) {
    const dateHostPre = TODAY_DATE.closest('.masthead-date');
    if (dateHostPre) dateHostPre.style.minWidth = '';
    for (const options of MASTHEAD_DATE_FORMATS) {
      TODAY_DATE.textContent = now.toLocaleDateString(locale, options);
      // Forcer reflow avant mesure (sinon clientWidth encore au format précédent).
      void TODAY_DATE.offsetWidth;
      if (mastheadDateChipFits()) break;
    }
  }
  // Si le libellé date change (format / jour), largeur météo peut bouger.
  // Focus-group le-radar-sports-weather-fit A : sports indépendants de la météo
  // (plus de resync parité). On ne re-fit que le bandeau météo.
  const dateKey = TODAY_DATE?.textContent || '';
  const dateChanged = dateKey !== mastheadDateLabelKey;
  mastheadDateLabelKey = dateKey;
  // Différé : `init()` appelle renderTodayDate() au milieu du fichier, avant
  // les `let` météo (mastheadWeatherResizeFrame…). setTimeout(0) laisse finir
  // le top-level pour éviter un TDZ.
  if (dateChanged) {
    window.setTimeout(() => scheduleMastheadWeatherLayout(), 0);
  }
  const dateHost = TODAY_DATE?.closest?.('.masthead-date');
  const photoLayer = document.getElementById('bg-photo-layer');
  const photoReady = !photoLayer || photoLayer.classList.contains('loaded');
  if (dateHost && photoReady && mastheadDateChipFits()) {
    const dw = Math.ceil(dateHost.getBoundingClientRect().width);
    if (dw > 40) dateHost.style.minWidth = `${dw}px`;
  }
}

/** Heure et jour à Québec, même si la personne consulte le site ailleurs. */
function seoScheduleMoment() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const n = (type) => Number(parts.find((part) => part.type === type)?.value);
  const year = n('year');
  const month = n('month');
  const day = n('day');
  const hour = n('hour');
  const minute = n('minute');
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  return {
    day: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    minute: hour * 60 + minute,
  };
}

function seoScheduleMinute(value = '') {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 24 && minute < 60 ? hour * 60 + minute : null;
}

/**
 * Clic / ancre : un seul créneau pulse.
 * `#horaire` → à l'antenne ; `#horaire-avenir` → à venir ; sinon live s'il
 * y a une émission, à venir s'il y a un trou.
 */
function seoSchedulePulsePref() {
  const hash = String(location.hash || '').toLowerCase();
  if (hash === '#horaire-avenir') return 'upcoming';
  if (hash === '#horaire') return 'live';
  return 'auto';
}

function pickSeoSchedulePulse(active, upcoming, pref) {
  if (pref === 'upcoming') return upcoming || active || null;
  if (pref === 'live') return active || upcoming || null;
  return active || upcoming || null;
}

/**
 * Les pages SEO sont statiques pour rester lisibles sans JavaScript, mais
 * leur repère temporel ne doit pas rester bloqué au jour de génération.
 * Cette amélioration progressive actualise le jour et les teintes live /
 * à venir. Un seul créneau pulse : celui du clic (ancre) ou, sans ancre,
 * l'émission en ondes, sinon la prochaine.
 */
function syncSeoScheduleNow() {
  const days = [...document.querySelectorAll('.seo-day[data-schedule-day]')];
  if (!days.length) return;
  const now = seoScheduleMoment();
  if (!now) return;
  const slots = [];
  for (const dayEl of days) {
    const day = Number(dayEl.dataset.scheduleDay);
    const isToday = day === now.day;
    dayEl.classList.toggle('seo-day--today', isToday);
    if (isToday) dayEl.dataset.currentDay = 'true';
    else delete dayEl.dataset.currentDay;
    for (const el of dayEl.querySelectorAll('li[data-schedule-start]')) {
      el.classList.remove('seo-slot--live', 'seo-slot--upcoming', 'seo-slot--playing', 'seo-slot--pulse');
      el.removeAttribute('aria-label');
      const start = seoScheduleMinute(el.dataset.scheduleStart);
      const end = seoScheduleMinute(el.dataset.scheduleEnd);
      if (start != null) slots.push({ el, day, start, end });
    }
  }
  const active = slots.filter((slot) => {
    if (slot.end == null) return slot.day === now.day && now.minute >= slot.start;
    if (slot.end > slot.start) return slot.day === now.day && now.minute >= slot.start && now.minute < slot.end;
    return (slot.day === now.day && now.minute >= slot.start)
      || (slot.day === (now.day + 6) % 7 && now.minute < slot.end);
  }).sort((a, b) => b.start - a.start)[0];

  let upcoming = null;
  let distance = Infinity;
  for (const slot of slots) {
    if (slot.el === active?.el) continue;
    let delta = ((slot.day - now.day + 7) % 7) * 1440 + slot.start - now.minute;
    if (delta <= 0) delta += 7 * 1440;
    if (delta < distance) { distance = delta; upcoming = slot; }
  }

  const en = document.documentElement.lang.startsWith('en');
  if (active) {
    active.el.classList.add('seo-slot--live');
    active.el.setAttribute('aria-label', `${en ? 'On air' : 'À l’antenne'}: ${active.el.textContent.trim()}`);
  }
  if (upcoming) {
    upcoming.el.classList.add('seo-slot--upcoming');
    upcoming.el.setAttribute('aria-label', `${en ? 'Up next' : 'À venir'}: ${upcoming.el.textContent.trim()}`);
  }
  const pulse = pickSeoSchedulePulse(active, upcoming, seoSchedulePulsePref());
  pulse?.el.classList.add('seo-slot--pulse');
  if (!active && !upcoming) {
    syncSeoSchedulePlayback();
    return;
  }
  syncSeoSchedulePlayback();
}

/**
 * Clic « à l'antenne » / ancre #horaire : amener la grille au jour en cours
 * (carte .seo-day--today) et au créneau live/à venir — pas seulement le
 * titre de section en haut de page.
 */
function scrollSeoScheduleToNow({ smooth = true } = {}) {
  const hash = String(location.hash || '').toLowerCase();
  const wantUpcoming = hash === '#horaire-avenir';
  if (hash && hash !== '#horaire' && !wantUpcoming) return false;
  const hasSchedule = document.querySelector('.seo-day[data-schedule-day], #horaire[data-schedule-station]');
  if (!hasSchedule) return false;
  const target = document.querySelector('.seo-slot--pulse')
    || (wantUpcoming
      ? document.querySelector('.seo-slot--upcoming')
      : document.querySelector('.seo-slot--live'))
    || document.querySelector('.seo-slot--upcoming, .seo-slot--live')
    || document.querySelector('.seo-day--today')
    || document.getElementById('horaire');
  if (!target) return false;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  try {
    target.scrollIntoView({
      behavior: smooth && !reduce ? 'smooth' : 'auto',
      block: 'center',
      inline: 'nearest',
    });
  } catch {
    try { target.scrollIntoView(true); } catch { /* ignore */ }
  }
  return true;
}

function pickHubAirFromGrid(grid, now) {
  const slots = [];
  for (const slot of grid || []) {
    if (!slot || !slot.title) continue;
    const start = seoScheduleMinute(slot.start);
    const end = seoScheduleMinute(slot.end);
    if (start == null) continue;
    slots.push({
      title: slot.title,
      day: slot.day,
      start,
      end,
      startLabel: slot.start,
      endLabel: slot.end || '',
    });
  }
  const active = slots.filter((slot) => {
    if (slot.end == null) return slot.day === now.day && now.minute >= slot.start;
    if (slot.end > slot.start) return slot.day === now.day && now.minute >= slot.start && now.minute < slot.end;
    return (slot.day === now.day && now.minute >= slot.start)
      || (slot.day === (now.day + 6) % 7 && now.minute < slot.end);
  }).sort((a, b) => b.start - a.start)[0];
  if (active) return { live: true, slot: active };
  let upcoming = null;
  let distance = Infinity;
  for (const slot of slots) {
    let delta = ((slot.day - now.day + 7) % 7) * 1440 + slot.start - now.minute;
    if (delta <= 0) delta += 7 * 1440;
    if (delta < distance) { distance = delta; upcoming = slot; }
  }
  return upcoming ? { live: false, slot: upcoming } : null;
}

function formatHubAirWhen(slot, nowDay, en) {
  const range = slot.endLabel
    ? `${slot.startLabel}\u2013${slot.endLabel}`
    : slot.startLabel;
  if (slot.day === nowDay) return range;
  const days = en
    ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    : ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const dayName = days[slot.day] || '';
  return dayName ? `${dayName} ${range}` : range;
}

/** Hub /horaires/ : actualiser « à l'antenne / à venir » après chargement des grilles. */
function syncSeoScheduleHub() {
  const cards = document.querySelectorAll('.seo-radio-card[data-schedule-station]');
  if (!cards.length) return;
  const now = seoScheduleMoment();
  if (!now) return;
  const stations = radioSchedules?.stations;
  if (!stations) return;
  const en = document.documentElement.lang.startsWith('en');
  for (const card of cards) {
    const picked = pickHubAirFromGrid(stations[card.dataset.scheduleStation]?.grid, now);
    const air = card.querySelector('[data-schedule-air]');
    if (!picked || !air) continue;
    const state = picked.live ? 'live' : 'upcoming';
    card.dataset.airState = state;
    air.dataset.airState = state;
    const kicker = air.querySelector('.seo-radio-card__kicker');
    const show = air.querySelector('.seo-radio-card__show');
    const when = air.querySelector('.seo-radio-card__when');
    if (kicker) kicker.textContent = picked.live
      ? (en ? 'On air' : 'À l’antenne')
      : (en ? 'Up next' : 'À venir');
    if (show) show.textContent = picked.slot.title;
    if (when) when.textContent = formatHubAirWhen(picked.slot, now.day, en);
  }
}

function initSeoScheduleHashScroll() {
  const run = () => {
    syncSeoScheduleNow();
    // Double rAF : laisse le layout (grille + classes today) se poser.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollSeoScheduleToNow({ smooth: true }));
    });
  };
  if (/^#horaire(-avenir)?$/.test(String(location.hash || '').toLowerCase())) {
    // Après paint initial (fonts / images mât peuvent décaler le offset).
    if (document.readyState === 'complete') setTimeout(run, 50);
    else window.addEventListener('load', () => setTimeout(run, 50), { once: true });
  }
  window.addEventListener('hashchange', () => {
    if (/^#horaire(-avenir)?$/.test(String(location.hash || '').toLowerCase())) run();
  });
}

/** Un créneau présent est bleu; il ne devient rouge que si cette station joue ici. */
function syncSeoSchedulePlayback() {
  const stationId = document.querySelector('[data-schedule-station]')?.dataset.scheduleStation;
  const playingThisStation = Boolean(
    stationId
    && currentStation?.id === stationId
    && isPlaybackActive()
    && !isBuffering,
  );
  document.querySelectorAll('.seo-slot--live').forEach((slot) => {
    slot.classList.toggle('seo-slot--playing', playingThisStation);
  });
}

// ─── Météo des principaux campus (desktop / tablette) ────────────────────────
const WEATHER_CACHE_KEY = 'le_radar_masthead_weather_v2';
const WEATHER_CACHE_MS = 15 * 60 * 1000;
const WEATHER_CITIES = [
  { id: 'montreal', name: 'Montréal', compactName: 'MTL', lat: 45.5017, lon: -73.5673 },
  { id: 'quebec', name: 'Québec', compactName: 'QC', lat: 46.8139, lon: -71.2080 },
  { id: 'sherbrooke', name: 'Sherbrooke', lat: 45.4000, lon: -71.9000 },
  { id: 'trois-rivieres', name: 'Trois-Rivières', lat: 46.3432, lon: -72.5430 },
  { id: 'saguenay', name: 'Saguenay', lat: 48.4284, lon: -71.0680 },
  // Saguenay–Lac-Saint-Jean : la météo de Chicoutimi ne résume pas le Lac.
  { id: 'alma', name: 'Alma', region: 'Saguenay–Lac-Saint-Jean', lat: 48.5500, lon: -71.6500 },
  { id: 'roberval', name: 'Roberval', region: 'Saguenay–Lac-Saint-Jean', lat: 48.5200, lon: -72.2300 },
  { id: 'dolbeau-mistassini', name: 'Dolbeau-Mistassini', region: 'Saguenay–Lac-Saint-Jean', lat: 48.8800, lon: -72.2300 },
  { id: 'saint-felicien', name: 'Saint-Félicien', region: 'Saguenay–Lac-Saint-Jean', lat: 48.6500, lon: -72.4500 },
  { id: 'rimouski', name: 'Rimouski', lat: 48.4488, lon: -68.5230 },
  { id: 'riviere-du-loup', name: 'Rivière-du-Loup', region: 'Bas-Saint-Laurent', lat: 47.8300, lon: -69.5300 },
  { id: 'matane', name: 'Matane', region: 'Bas-Saint-Laurent', lat: 48.8500, lon: -67.5300 },
  { id: 'baie-comeau', name: 'Baie-Comeau', region: 'Côte-Nord', lat: 49.2200, lon: -68.1500 },
  { id: 'sept-iles', name: 'Sept-Îles', region: 'Côte-Nord', lat: 50.2000, lon: -66.3800 },
  { id: 'fermont', name: 'Fermont', region: 'Côte-Nord', lat: 52.7900, lon: -67.0800 },
  { id: 'gaspe', name: 'Gaspé', region: 'Gaspésie–Îles-de-la-Madeleine', lat: 48.8300, lon: -64.4800 },
  { id: 'carleton-sur-mer', name: 'Carleton-sur-Mer', region: 'Gaspésie–Îles-de-la-Madeleine', lat: 48.1000, lon: -66.1300 },
  { id: 'sainte-anne-des-monts', name: 'Sainte-Anne-des-Monts', region: 'Gaspésie–Îles-de-la-Madeleine', lat: 49.1200, lon: -66.4900 },
  { id: 'cap-aux-meules', name: 'Cap-aux-Meules', region: 'Gaspésie–Îles-de-la-Madeleine', lat: 47.3800, lon: -61.8600 },
  { id: 'shawinigan', name: 'Shawinigan', region: 'Mauricie', lat: 46.5400, lon: -72.7500 },
  { id: 'la-tuque', name: 'La Tuque', region: 'Mauricie', lat: 47.4400, lon: -72.7800 },
  { id: 'drummondville', name: 'Drummondville', region: 'Centre-du-Québec', lat: 45.8800, lon: -72.4800 },
  { id: 'victoriaville', name: 'Victoriaville', region: 'Centre-du-Québec', lat: 46.0500, lon: -71.9600 },
  { id: 'saint-georges', name: 'Saint-Georges', region: 'Chaudière-Appalaches', lat: 46.1200, lon: -70.6700 },
  { id: 'thetford-mines', name: 'Thetford Mines', region: 'Chaudière-Appalaches', lat: 46.0900, lon: -71.3000 },
  { id: 'maniwaki', name: 'Maniwaki', region: 'Outaouais', lat: 46.3800, lon: -75.9700 },
  { id: 'chibougamau', name: 'Chibougamau', region: 'Nord-du-Québec', lat: 49.9200, lon: -74.3700 },
  { id: 'gatineau', name: 'Gatineau', lat: 45.4765, lon: -75.7013 },
  { id: 'rouyn-noranda', name: 'Rouyn-Noranda', lat: 48.2366, lon: -79.0231 },
  // Abitibi–Témiscamingue : plusieurs pôles distincts plutôt qu'une seule ville.
  // Slug MM = val-dor (pas val-d-or) — apostrophe typographique sinon mauvaise URL.
  { id: 'val-dor', name: 'Val-d’Or', region: 'Abitibi–Témiscamingue', lat: 48.1000, lon: -77.7800, weatherSlug: 'val-dor' },
  { id: 'amos', name: 'Amos', region: 'Abitibi–Témiscamingue', lat: 48.5700, lon: -78.1200 },
  { id: 'la-sarre', name: 'La Sarre', region: 'Abitibi–Témiscamingue', lat: 48.8000, lon: -79.2000 },
  { id: 'ville-marie', name: 'Ville-Marie', region: 'Abitibi–Témiscamingue', lat: 47.3300, lon: -79.4300 },
  { id: 'levis', name: 'Lévis', lat: 46.8033, lon: -71.1779 },
  // Ville centre (pas le MRC Vaudreuil–Soulanges) — slug MM = vaudreuil-dorion.
  { id: 'vaudreuil-dorion', name: 'Vaudreuil-Dorion', compactName: 'V-Dorion', region: 'Vaudreuil–Soulanges', lat: 45.4000, lon: -74.0300, weatherSlug: 'vaudreuil-dorion' },
  { id: 'saint-ignace-de-loyola', name: 'Saint-Ignace-de-Loyola', region: 'Lanaudière', lat: 46.0800, lon: -73.0200 },
  // Collectivités (1 / nation) — noms d’usage préférés ; URL MM QC vérifiées.
  // « manawan » sur MétéoMédia → réserve en Saskatchewan : lien = manouane.
  { id: 'odanak', name: 'Odanak', nation: 'W8banaki · Abénakis', lat: 46.0723, lon: -72.8181, weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/odanak-12/actuelle' },
  { id: 'kitigan-zibi', name: 'Kitigan Zibi', nation: 'Anishinabeg', lat: 46.3825, lon: -75.9879, weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/kitigan-zibi/actuelle' },
  { id: 'manawan', name: 'Manawan', nation: 'Atikamekw', lat: 47.2203, lon: -74.3822, weatherSlug: 'manouane', weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/manouane/actuelle' },
  { id: 'nemaska', name: 'Nemaska', nation: 'Eeyou Istchee', lat: 51.2022, lon: -76.1906, weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/nemaska/actuelle' },
  { id: 'wendake', name: 'Wendake', nation: 'Huron-Wendat', lat: 46.8550, lon: -71.3567, weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/wendake/actuelle' },
  // ITUM — Uashat 27 + Mani-Utenam (Maliotenam).
  { id: 'uashat', name: 'Uashat mak Mani-Utenam', compactName: 'Uashat', nation: 'Innu', lat: 50.2300, lon: -66.3800, weatherSlug: 'uashat', weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/uashat/actuelle' },
  { id: 'kuujjuaq', name: 'Kuujjuaq', nation: 'Inuit · Nunavik', lat: 58.1000, lon: -68.4200, weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/kuujjuaq/actuelle' },
  { id: 'cacouna', name: 'Cacouna', nation: 'Wolastoqiyik Wahsipekuk', lat: 47.9204, lon: -69.5147, weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/cacouna/actuelle' },
  { id: 'gesgapegiag', name: 'Gesgapegiag', nation: 'Mi’gmaq', lat: 48.2125, lon: -65.9961, weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/gesgapegiag-2/actuelle' },
  // Orthographe Kanien’kéha ; page MM = Kahnawake 14.
  { id: 'kahnawake', name: 'Kahnawà:ke', nation: 'Kanien’kehá:ka', lat: 45.4000, lon: -73.7500, weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/kahnawake-14/actuelle' },
  { id: 'kawawachikamach', name: 'Kawawachikamach', compactName: 'Kawawa', nation: 'Naskapi', lat: 55.3400, lon: -66.8500, weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/kawawachikamach/actuelle' },
];

// Radar principal : variante remplie et animée. Le Pomo pointe explicitement
// vers /assets/meteocons/ pour rester statique et discret.
const METEOCONS_BASE = '/assets/meteocons/animated/';
function weatherIcon(code, isDay = 1) {
  const day = !!isDay;
  let name = day ? 'overcast-day' : 'overcast-night';
  if (code === 0) name = day ? 'clear-day' : 'clear-night';
  else if ([1, 2].includes(code)) name = day ? 'partly-cloudy-day' : 'partly-cloudy-night';
  else if ([45, 48].includes(code)) name = day ? 'fog-day' : 'fog-night';
  else if ([51, 53, 55, 56, 57].includes(code)) name = 'drizzle';
  else if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) name = 'rain';
  else if ([71, 73, 75, 77, 85, 86].includes(code)) name = 'snow';
  else if ([95, 96, 99].includes(code)) name = day ? 'thunderstorms-day' : 'thunderstorms-night';
  return `<img class="weather-icon-meteocon" src="${METEOCONS_BASE}${name}.svg" alt="" aria-hidden="true">`;
}

function weatherTone(code) {
  if (code === 0 || [1, 2].includes(code)) return 'sun';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'storm';
  return 'cloud';
}

let mastheadWeatherTimer = null;
const mastheadWeatherDecks = { campus: [], nation: [] };
let mastheadWeatherSlots = [];
let mastheadWeatherNextSlot = 0;
// La carte principale reste exclusivement réservée à Montréal et Québec.
const MASTHEAD_WEATHER_PRIMARY_SEQUENCE = ["montreal", "quebec"];
const MASTHEAD_WEATHER_PRIMARY_IDS = new Set(MASTHEAD_WEATHER_PRIMARY_SEQUENCE);
// Les cartes régionales suivent l’importance démographique universitaire.
const MASTHEAD_WEATHER_REGIONAL_PRIORITY = [
  "sherbrooke", "trois-rivieres", "gatineau", "saguenay",
  "rimouski", "rouyn-noranda",
];
const MASTHEAD_WEATHER_REGIONAL_RANK = new Map(
  MASTHEAD_WEATHER_REGIONAL_PRIORITY.map((id, index) => [id, index]),
);
let mastheadWeatherPrimaryIndex = 0;
let mastheadWeatherCompactSecondaryIndex = 0;
let mastheadWeatherNationSlot = 1;
let mastheadWeatherQueueIndex = 0;
let mastheadWeatherLastBoardCount = 0;
let mastheadWeatherFitCount = null;
let weatherOverlapFitDepth = 0;
let weatherAvailTrim = 0;
let mastheadWeatherTooNarrow = false;
let mastheadWeatherResizeFrame = 0;
let mastheadWeatherDocked = false;
// Emplacement d'origine (masthead) : mémorisé pour pouvoir ramener le
// bandeau à sa place quand la largeur redevient suffisante.
let mastheadWeatherHomeParent = MASTHEAD_WEATHER?.parentNode || null;
let mastheadWeatherHomeNextSibling = MASTHEAD_WEATHER?.nextSibling || null;
// Tablette + mobile (≤1023) : météo sous le syntoniseur — libère le mât pour
// date + icônes (lab 768 / 900). Bureau ≥1024 : météo dans le mât.
const MASTHEAD_WEATHER_PHONE_MQ = window.matchMedia('(max-width: 1023.98px)');

function syncMastheadShuffleButton() {
  if (!MASTHEAD_BG_SHUFFLE || !MASTHEAD_BG_SHUFFLE_HOME) return;
  const showInMobileMenu = mastheadWeatherDocked && !MASTHEAD_WEATHER?.classList.contains('hidden');
  if (showInMobileMenu && MASTHEAD_ACTIONS) {
    MASTHEAD_ACTIONS.append(MASTHEAD_BG_SHUFFLE);
  } else if (!mastheadWeatherDocked) {
    MASTHEAD_BG_SHUFFLE_HOME.append(MASTHEAD_BG_SHUFFLE);
  }
  MASTHEAD_BG_SHUFFLE.hidden = mastheadWeatherDocked && !showInMobileMenu;
}

/**
 * Sur mobile, quand le masthead n'a plus de place pour la météo, on la
 * déplace sous la barre du syntoniseur (même carte que sur bureau, pas le
 * style Pomo) plutôt que de la faire disparaître.
 */
function setMastheadWeatherDocked(docked) {
  if (!MASTHEAD_WEATHER || !MASTHEAD_WEATHER_DOCK || docked === mastheadWeatherDocked) return;
  mastheadWeatherDocked = docked;
  MASTHEAD_WEATHER.classList.toggle('masthead-weather--docked', docked);
  if (docked) {
    MASTHEAD_WEATHER_DOCK.append(MASTHEAD_WEATHER);
  } else if (mastheadWeatherHomeParent) {
    mastheadWeatherHomeParent.insertBefore(MASTHEAD_WEATHER, mastheadWeatherHomeNextSibling);
  }
  // Le contexte a changé de largeur : tout réévaluer depuis zéro.
  mastheadWeatherFitCount = null;
  mastheadWeatherTooNarrow = false;
  mastheadWeatherLastBoardCount = 0;
  MASTHEAD_WEATHER.classList.remove('is-too-narrow');
  syncMastheadShuffleButton();
  // La colonne date change de largeur (3 → 2 pistes) : rejouer la cascade.
  renderTodayDate();
}

function weatherLocationSlug(city) {
  return String(city.weatherSlug || city.name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019\u0027`]/g, "")
    .replace(/[–—]/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .split("-").filter(Boolean).join("-");
}

function weatherForecastUrl(city) {
  if (city.weatherUrl) return city.weatherUrl;
  return "https://www.meteomedia.com/fr/ville/ca/quebec/" + weatherLocationSlug(city) + "/actuelle";
}

function weatherForecastProvider() {
  return "MétéoMédia";
}

function refreshMastheadWeatherLinks() {
  if (!MASTHEAD_WEATHER) return;
  WEATHER_CITIES.forEach((city) => {
    const el = MASTHEAD_WEATHER.querySelector(`[data-weather-city="${city.id}"]`);
    if (el) el.href = weatherForecastUrl(city);
  });
}

function buildMastheadWeatherBoard() {
  const board = MASTHEAD_WEATHER?.querySelector('.masthead-weather__board');
  if (!board || board.children.length) return;
  const fragment = document.createDocumentFragment();
  WEATHER_CITIES.forEach((city) => {
    const el = document.createElement('a');
    el.className = 'masthead-weather__city';
    el.dataset.weatherCity = city.id;
    el.dataset.weatherGroup = city.nation ? 'nation' : 'campus';
    el.setAttribute('aria-hidden', 'true');
    const context = city.nation ? `${city.name} — ${city.nation}` : city.name;
    el.href = weatherForecastUrl(city);
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    const provider = weatherForecastProvider(city);
    el.title = `Prévisions de ${provider} — ${context}`;
    el.setAttribute("aria-label", `Prévisions de ${provider} pour ${context}`);
    el.innerHTML = '<span class="masthead-weather__icon" aria-hidden="true">·</span><span class="masthead-weather__name"><span class="masthead-weather__name-text"><span class="masthead-weather__name-full"></span><span class="masthead-weather__name-compact" aria-hidden="true"></span></span></span><span class="masthead-weather__temp">—</span>';
    el.querySelector('.masthead-weather__name-full').textContent = city.name;
    el.querySelector('.masthead-weather__name-compact').textContent = city.compactName || city.name;
    fragment.append(el);
  });
  board.append(fragment);
}

/** Largeur utile du ruban météo (place restante, pas le contenu qui déborde). */
function weatherBoardAvailWidth() {
  const slack = 20;
  if (!mastheadWeatherDocked) {
    const top = document.querySelector('.masthead-top');
    const date = document.querySelector('.masthead-date');
    const actions = document.querySelector('.masthead-actions');
    const cell = MASTHEAD_WEATHER?.clientWidth || 0;
    let leftover = 0;
    if (top && date && actions) {
      const cs = getComputedStyle(top);
      const gap = parseFloat(cs.columnGap || cs.gap) || 8;
      leftover = top.clientWidth
        - date.getBoundingClientRect().width
        - actions.getBoundingClientRect().width
        - gap * 2
        - slack;
    }
    // Case 1fr déjà contrainte = vérité. Si elle a gonflé (contenu), le
    // reliquat date/icônes est plus sûr. On prend le plus étroit.
    const trim = Math.max(0, weatherAvailTrim);
    if (cell >= 40 && leftover >= 40) return Math.max(40, Math.min(cell, leftover) - trim);
    if (leftover >= 40) return Math.max(40, leftover - trim);
    if (cell >= 40) return Math.max(40, cell - slack - trim);
  }
  let width = MASTHEAD_WEATHER?.clientWidth || 0;
  if (width < 40) {
    width = MASTHEAD_WEATHER?.querySelector('.masthead-weather__board')?.clientWidth || 0;
  }
  if (width < 40) {
    width = MASTHEAD_WEATHER_DOCK?.clientWidth || 0;
  }
  if (width < 40 && mastheadWeatherDocked) {
    width = document.documentElement.clientWidth || 0;
  }
  return width > slack ? width - slack : width;
}

function weatherActiveCount() {
  return MASTHEAD_WEATHER?.querySelectorAll('.masthead-weather__city.is-active').length || 0;
}

/** True si une carte météo (ou la date) passe sous les icônes du mât. */
function weatherRibbonOverlapsChrome() {
  if (!MASTHEAD_WEATHER || mastheadWeatherDocked) return false;
  const actions = document.querySelector('.masthead-actions');
  if (!actions) return false;
  const limit = actions.getBoundingClientRect().left;
  const date = document.querySelector('.masthead-date');
  if (date && date.getBoundingClientRect().right > limit + 0.5) return true;
  return [...MASTHEAD_WEATHER.querySelectorAll('.masthead-weather__city.is-active')]
    .some((el) => el.getBoundingClientRect().right > limit + 0.5);
}

/** Docké (≤1023) : les cartes ne doivent pas sortir du dock. */
function weatherRibbonOverflowsDock() {
  if (!MASTHEAD_WEATHER || !mastheadWeatherDocked) return false;
  const host = MASTHEAD_WEATHER_DOCK || MASTHEAD_WEATHER;
  const box = host.getBoundingClientRect();
  if (box.width < 8) return false;
  return [...MASTHEAD_WEATHER.querySelectorAll('.masthead-weather__city.is-active')]
    .some((el) => {
      const card = el.getBoundingClientRect();
      return card.right > box.right + 1 || card.left < box.left - 1;
    });
}

function weatherRibbonNeedsDrop() {
  return weatherRibbonOverlapsChrome() || weatherRibbonOverflowsDock();
}

function weatherRibbonOverflowPx() {
  if (!MASTHEAD_WEATHER || mastheadWeatherDocked) return 0;
  const actions = document.querySelector('.masthead-actions');
  if (!actions) return 0;
  const limit = actions.getBoundingClientRect().left;
  let overflow = 0;
  const date = document.querySelector('.masthead-date');
  if (date) overflow = Math.max(overflow, date.getBoundingClientRect().right - limit);
  for (const el of MASTHEAD_WEATHER.querySelectorAll('.masthead-weather__city.is-active')) {
    overflow = Math.max(overflow, el.getBoundingClientRect().right - limit);
  }
  return overflow;
}

/** Rétrécit les slots plutôt que de tout remplir un reliquat surestimé. */
function shrinkWeatherSlotsToClearChrome() {
  const overflow = weatherRibbonOverflowPx();
  if (overflow <= 1) return false;
  weatherAvailTrim = Math.max(weatherAvailTrim, Math.ceil(overflow) + 8);
  const actives = [...(MASTHEAD_WEATHER?.querySelectorAll('.masthead-weather__city.is-active') || [])];
  if (!actives.length) return false;
  const each = Math.max(1, Math.ceil((overflow + 6) / actives.length));
  let changed = false;
  actives.forEach((el) => {
    const cur = Math.floor(el.getBoundingClientRect().width);
    const next = Math.max(72, cur - each);
    if (next >= cur) return;
    el.style.setProperty('flex', `0 0 ${next}px`, 'important');
    el.style.setProperty('width', `${next}px`, 'important');
    el.style.setProperty('min-width', `${next}px`, 'important');
    el.style.setProperty('max-width', `${next}px`, 'important');
    changed = true;
  });
  return changed;
}

function clearWeatherSlotInlineStyles() {
  const board = MASTHEAD_WEATHER?.querySelector('.masthead-weather__board');
  board?.style.removeProperty('--weather-secondary-w');
  board?.style.removeProperty('--weather-primary-w');
  board?.style.removeProperty('--weather-slot-w');
  MASTHEAD_WEATHER?.querySelectorAll('.masthead-weather__city').forEach((el) => {
    el.style.removeProperty('flex');
    el.style.removeProperty('width');
    el.style.removeProperty('min-width');
    el.style.removeProperty('max-width');
  });
}

function dropWeatherCardForFit() {
  const painted = weatherActiveCount();
  const floor = mastheadWeatherDocked ? 1 : (weatherWideDualPrimary() ? 2 : 1);
  if (painted <= floor || weatherOverlapFitDepth > 10) return false;
  weatherOverlapFitDepth += 1;
  mastheadWeatherFitCount = painted - 1;
  mastheadWeatherLastBoardCount = 0;
  mastheadWeatherSlots = [];
  try {
    showMastheadWeatherBoard();
  } finally {
    weatherOverlapFitDepth = Math.max(0, weatherOverlapFitDepth - 1);
  }
  return true;
}

/**
 * Grand écran (wide / super-wide) — défaut prod dès 1281 px :
 * - pas de marquee
 * - pas de clip / nom compact : les conteneurs s’ajustent ; si ça ne rentre
 *   pas, on retire une carte (fit), on n’ampute pas le texte.
 * ⛔ Inactif ≤1280 (téléphone, mid, bureau compact 1280).
 *    `?wide=off` / data-wide-preview=off = témoin lab de l’ancien shell.
 * Voir data-wide-preview.
 */
function isWideNoMarqueeMode() {
  try {
    const id = document.documentElement.dataset.widePreview;
    if (id === 'off' || id === 'a') return false;
    return window.matchMedia('(min-width: 1281px)').matches;
  } catch {
    return false;
  }
}

/** Wide E + bureau confortable (≥1440) : noms complets, −1 carte plutôt que troncature. */
function isWideDesktopComfort() {
  try {
    return isWideNoMarqueeMode() && window.matchMedia('(min-width: 1440px)').matches;
  } catch {
    return false;
  }
}

/** QHD et plus (2560 / 3440 / 4K) : une carte météo de plus que la règle 1440–1920. */
function isWideQhdPlus() {
  try {
    return isWideNoMarqueeMode() && window.matchMedia('(min-width: 2560px)').matches;
  } catch {
    return false;
  }
}

/**
 * Parité scores : 2 ancres (MTL+QC) + 1 carte par puce sports.
 * ≥2560 : +1 ; ≥3440 : +2 (3 CTA sports, plus d’air météo).
 */
function weatherSportsParityBonus() {
  try {
    if (!isWideNoMarqueeMode()) return 0;
    const w = document.documentElement.clientWidth || window.innerWidth || 0;
    if (w >= 3440) return 2;
    if (w >= 2560) return 1;
    return 0;
  } catch {
    return 0;
  }
}

function weatherSportsParityCount() {
  const extras = sportsMatchChipCount();
  if (extras < 1) return 0;
  return 2 + extras + weatherSportsParityBonus();
}

/** Alias sémantique : layout synthé grand écran (E). */
function isWideTunerLayout() {
  return isWideNoMarqueeMode();
}

/** Clé de coque du synthé — un resize qui la change doit tout repeindre. */
function tunerShellLayoutKey() {
  if (isWideTunerLayout()) return 'wide';
  if (isDialCompactLayout()) return isTunerDialMidLayout() ? 'mid' : 'compact';
  return 'desktop';
}

/** Bureau : titre « À l'antenne » sur deux lignes, pas de marquee. */
function isNowAirTwoLineMode() {
  try {
    return window.matchMedia('(min-width: 1100px)').matches;
  } catch {
    return false;
  }
}

/** Offset sticky du rail sources = hauteur réelle du synthé (+ petit entrefer). */
function syncWideStickyTop() {
  try {
    if (!isWideTunerLayout()) {
      document.documentElement.style.removeProperty('--wide-sticky-top');
      return;
    }
    const tuner = document.getElementById('tuner');
    const h = tuner ? Math.ceil(tuner.getBoundingClientRect().height) : 0;
    // 8 px d’air entre le bas du synthé et « Le Radar »
    const top = Math.max(64, h + 8);
    document.documentElement.style.setProperty('--wide-sticky-top', `${top}px`);
  } catch { /* ignore */ }
}


/** Institution en toutes lettres pour le dial wide (pas d’acronyme forcé). */
function tunerFullInstitutionLabel(radio) {
  if (!radio) return '';
  const full = String(radio.institution || '').trim();
  if (full) return full;
  return tunerDialInstitutionLabel(radio) || '';
}

/** Ligne institution au-dessus du nom de poste (créée une fois). */
function ensureWideDialInstEl() {
  const box = document.querySelector('.tuner-now');
  if (!box) return null;
  let el = document.getElementById('tuner-now-inst');
  if (!el) {
    el = document.createElement('span');
    el.id = 'tuner-now-inst';
    el.className = 'tuner-now-inst';
    el.hidden = true;
    const name = document.getElementById('tuner-now-name');
    if (name) box.insertBefore(el, name);
    else box.prepend(el);
  }
  return el;
}

/** Largeur fixe du carré dial (max de tous les postes). Ne change pas à chaque flip. */
let wideDialFixedPx = 0;

function measureWideDialNeedPx() {
  const name = document.getElementById('tuner-now-name');
  const sub = document.getElementById('tuner-now-sub');
  const padX = 11 + 22 + 6;
  const nameCs = name ? getComputedStyle(name) : null;
  const subNode = sub?.querySelector?.('.tuner-now-sub-text') || sub;
  const subCs = subNode ? getComputedStyle(subNode) : null;
  if (!measureWideDialNeedPx._ctx) {
    measureWideDialNeedPx._ctx = document.createElement('canvas').getContext('2d');
  }
  const ctx = measureWideDialNeedPx._ctx;
  const lineW = (text, cs) => {
    if (!text || !cs) return 0;
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const ls = parseFloat(cs.letterSpacing) || 0;
    const t = String(text);
    return Math.ceil(ctx.measureText(t).width + ls * Math.max(0, t.length - 1) + 4);
  };
  let maxLine = 160;
  const list = Array.isArray(radios) ? radios : [];
  for (const radio of list) {
    const inst = tunerFullInstitutionLabel(radio) || '';
    const station = stationDisplayName(radio) || String(radio.name || '').trim() || '';
    const slogan = radioSlogan(radio) || String(radio.frequency || '').trim() || '';
    const line2 = [station, slogan].filter(Boolean).join(' · ');
    maxLine = Math.max(
      maxLine,
      lineW(inst || station, nameCs),
      lineW(line2, subCs),
    );
  }
  return Math.ceil(maxLine + padX);
}

/**
 * Pose une fois la largeur du carré = plus longue L1/L2 de tous les postes.
 * Recalcule seulement si `force` (resize / 1er paint).
 */
function clearWideDialInlineSize() {
  wideDialFixedPx = 0;
  const dial = document.querySelector('.tuner-dial');
  const now = document.querySelector('.tuner-now');
  if (dial) {
    dial.style.minWidth = '';
    dial.style.width = '';
  }
  if (now) now.style.width = '';
}

function fitWideDialWidth({ force = false } = {}) {
  if (!isWideTunerLayout()) {
    clearWideDialInlineSize();
    return;
  }
  const dial = document.querySelector('.tuner-dial');
  const now = document.querySelector('.tuner-now');
  if (!dial || !now) return;

  if (!force && wideDialFixedPx > 0) {
    dial.style.minWidth = `${wideDialFixedPx}px`;
    dial.style.width = `${wideDialFixedPx}px`;
    now.style.width = '100%';
    return;
  }

  const need = measureWideDialNeedPx();
  const w = Math.max(280, need + 24);
  wideDialFixedPx = w;
  dial.style.minWidth = `${w}px`;
  dial.style.width = `${w}px`;
  now.style.width = '100%';
}

/**
 * Dial wide : **2 lignes seulement** (même épaisseur barre que prod).
 * L1 = institution au complet
 * L2 = poste + slogan complet (espace horizontal, pas de 3e ligne)
 * Plus de « Syntoniser un poste » tant qu’un poste existe.
 * @returns {boolean} true si le rendu wide a été appliqué
 */
function paintWideDial(radio) {
  const instEl = ensureWideDialInstEl();
  // Jamais de 3e ligne dans le carré (épaissit la barre).
  if (instEl) {
    instEl.hidden = true;
    instEl.textContent = '';
  }
  if (!isWideTunerLayout()) {
    clearWideDialInlineSize();
    return false;
  }
  if (!radio) {
    setTunerNameText('Radios étudiantes');
    setTunerSubText('Choisissez un poste pour écouter');
    requestAnimationFrame(() => fitWideDialWidth({ force: wideDialFixedPx === 0 }));
    // Sans ça le CSS `.tuner:not(.is-dial-ready)` laisse L1/L2 à opacity: 0.
    markTunerDialReady();
    return true;
  }
  const inst = tunerFullInstitutionLabel(radio);
  const station = stationDisplayName(radio) || String(radio.name || '').trim() || '';
  const slogan = radioSlogan(radio) || String(radio.frequency || '').trim() || '';
  // L1 institution ; L2 « CHOQ.ca · slogan… » — largeur mesurée après paint.
  setTunerNameText(inst || station || 'Radios étudiantes');
  const line2 = [station, slogan].filter(Boolean).join(' · ');
  setTunerSubText(line2 || slogan || station);
  requestAnimationFrame(() => {
    fitWideDialWidth({ force: wideDialFixedPx === 0 });
  });
  markTunerDialReady();
  return true;
}

/**
 * Wide : EQ (4 barres) sous le wordmark — axe du trio play · EQ · mute.
 * Gauche = dial + play ; droite = volume + antenne.
 */
function unwrapWideTunerBalance() {
  const controls = document.querySelector('.tuner-controls');
  if (!controls) return;
  const left = controls.querySelector('.tuner-wide-left');
  const right = controls.querySelector('.tuner-wide-right');
  const actions = document.querySelector('.tuner-actions');
  const play = document.getElementById('tuner-play');
  const eq = document.getElementById('tuner-eq');
  const cast = document.getElementById('tuner-cast');
  const castMob = document.getElementById('tuner-cast-mob');
  if (left) {
    while (left.firstChild) controls.insertBefore(left.firstChild, left);
    left.remove();
  }
  if (actions) {
    const restore = [play, cast, castMob, eq].filter(Boolean);
    restore.forEach((el) => {
      if (el.parentElement !== actions) actions.insertBefore(el, actions.firstChild);
    });
    // Reposer l’ordre DOM d’origine : play → cast → cast-mob → eq → vol
    if (play) actions.insertBefore(play, actions.firstChild);
    if (cast && play) actions.insertBefore(cast, play.nextSibling);
    if (castMob && (cast || play)) {
      actions.insertBefore(castMob, (cast || play).nextSibling);
    }
    if (eq) {
      const vol = document.getElementById('tuner-vol');
      actions.insertBefore(eq, vol || null);
    }
  }
  if (right) {
    const nowair = document.getElementById('tuner-nowair-wide');
    const inner = controls.parentElement;
    if (nowair && inner) inner.insertBefore(nowair, controls.nextSibling);
    while (right.firstChild) controls.appendChild(right.firstChild);
    right.remove();
  }
}

function ensureWideTunerBalance() {
  const controls = document.querySelector('.tuner-controls');
  const inner = document.querySelector('.tuner-inner');
  const actions = document.querySelector('.tuner-actions');
  const eq = document.getElementById('tuner-eq');
  if (!controls || !inner || !actions || !eq) return;
  if (!isWideTunerLayout()) {
    unwrapWideTunerBalance();
    return;
  }
  let left = controls.querySelector('.tuner-wide-left');
  if (!left) {
    left = document.createElement('div');
    left.className = 'tuner-wide-left';
    while (controls.firstElementChild && controls.firstElementChild !== actions) {
      left.appendChild(controls.firstElementChild);
    }
    controls.insertBefore(left, actions);
  }
  // Play + Cast restent à gauche de l’EQ (l’EQ est l’axe, pas le play).
  if (eq.parentElement === actions) {
    while (actions.firstElementChild && actions.firstElementChild !== eq) {
      left.appendChild(actions.firstElementChild);
    }
    controls.insertBefore(eq, actions);
  } else if (eq.parentElement !== controls) {
    controls.insertBefore(eq, actions);
  }
  let right = controls.querySelector('.tuner-wide-right');
  if (!right) {
    right = document.createElement('div');
    right.className = 'tuner-wide-right';
    controls.appendChild(right);
    right.appendChild(actions);
  }
  const nowair = document.getElementById('tuner-nowair-wide');
  if (nowair && nowair.parentElement !== right) right.appendChild(nowair);
}

/**
 * Paire « À l'antenne » | « À venir » (wide E).
 * Classes `tuner-wide-slot` (pas `.tuner-nowair`) : le CSS critique index.html
 * force display/grid-column sur tout `.tuner-nowair` et doublait le panneau.
 */
function ensureWideNowAirPair() {
  const host = TUNER_NOWAIR?.parentElement;
  if (!host || !TUNER_NOWAIR) return null;

  // Nettoyer d’anciens doublons (bug précédent)
  const extras = host.querySelectorAll('#tuner-nowair-wide');
  if (extras.length > 1) {
    extras.forEach((el, i) => { if (i > 0) el.remove(); });
  }

  let wrap = document.getElementById('tuner-nowair-wide');
  if (!isWideTunerLayout()) {
    if (wrap) wrap.hidden = true;
    unwrapWideTunerBalance();
    TUNER_NOWAIR.classList.remove('tuner-nowair--legacy-slot');
    TUNER_NOWAIR.hidden = false;
    TUNER_NOWAIR.removeAttribute('aria-hidden');
    return null;
  }

  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'tuner-nowair-wide';
    wrap.className = 'tuner-nowair-wide';
    wrap.setAttribute('aria-label', 'Antenne et à venir');
    wrap.innerHTML = [
      '<div class="tuner-wide-slot tuner-wide-slot--live" aria-live="polite">',
      '  <span class="tuner-wide-slot__label">À l\'antenne</span>',
      '  <div class="tuner-wide-slot__body">',
      '    <p class="tuner-wide-slot__title" data-wide-live-title></p>',
      '    <p class="tuner-wide-slot__sub" data-wide-live-sub></p>',
      '  </div>',
      '</div>',
      '<div class="tuner-wide-slot tuner-wide-slot--next" aria-live="polite">',
      '  <span class="tuner-wide-slot__label">À venir</span>',
      '  <div class="tuner-wide-slot__body">',
      '    <p class="tuner-wide-slot__title" data-wide-next-title></p>',
      '    <p class="tuner-wide-slot__sub" data-wide-next-sub></p>',
      '  </div>',
      '</div>',
    ].join('');
    host.insertBefore(wrap, TUNER_NOWAIR.nextSibling);
    wrap.addEventListener('click', openNowAirSchedule);
    wrap.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const slot = event.target?.closest?.('.tuner-wide-slot');
      if (!slot) return;
      event.preventDefault();
      openNowAirSchedule(event);
    });
    wrap.querySelectorAll('.tuner-wide-slot').forEach((slot) => {
      slot.setAttribute('role', 'link');
      slot.setAttribute('tabindex', '0');
    });
  }

  wrap.hidden = false;
  ensureWideTunerBalance();
  // Masquer le panneau single (legacy) — classes + attributs (CSS critique).
  TUNER_NOWAIR.classList.add('tuner-nowair--legacy-slot');
  TUNER_NOWAIR.hidden = true;
  TUNER_NOWAIR.setAttribute('aria-hidden', 'true');
  return wrap;
}

/**
 * Remplit live + upcoming à partir des phases d’un poste.
 * Largeur des slots = contenu (CSS flex packé). Si le texte change : fade out
 * → swap → fade in pour que le resserrement/élargissement se fasse hors vue.
 * @returns {boolean} true si la paire wide a été peinte
 */
/**
 * Émission en cours si elle existe, piste en sous-ligne.
 * Sans émission (CHOQ hors grille, etc.) : la piste seule suffit.
 * @param {{ title?: string, sub?: string, kind?: string }[]} phases
 */
function liveCopyFromPhases(phases = []) {
  const list = Array.isArray(phases) ? phases : [];
  const show = list.find((p) => p.kind === 'live' && !String(p.title).startsWith('♪')) || null;
  const track = list.find((p) => p.kind === 'live' && String(p.title).startsWith('♪')) || null;
  if (show && track) {
    return { liveTitle: show.title, liveSub: track.title };
  }
  if (show) {
    return { liveTitle: show.title, liveSub: show.sub || '' };
  }
  if (track) {
    return { liveTitle: String(track.title).replace(/^♪\s*/, ''), liveSub: '' };
  }
  return { liveTitle: '', liveSub: '' };
}

/**
 * CHOQ hors grille : la piste arrive en « Artiste — Titre » (tiret cadratin).
 * On remplace ce trait par un vrai saut de ligne (titre + sous-ligne) pour
 * que le slot « À l'antenne » n'empiète plus sur « À venir ».
 */
function splitChoqSongLines(track) {
  const raw = String(track || '').replace(/^♪\s*/, '').trim();
  if (!raw) return { title: '', sub: '' };
  const parts = raw.split(/\s+[—–]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { title: parts[0], sub: parts.slice(1).join(' — ') };
  }
  return { title: raw, sub: '' };
}

function applyChoqLiveSongLines(radio, liveTitle, liveSub, phases = []) {
  const title = String(liveTitle || '');
  const sub = String(liveSub || '');
  if (radio?.id !== 'choq') {
    return { liveTitle: title, liveSub: sub, songSplit: false };
  }
  const list = Array.isArray(phases) ? phases : [];
  const hasShow = list.some((p) => p.kind === 'live' && !String(p.title || '').startsWith('♪'));
  const hasTrack = list.some((p) => p.kind === 'live' && String(p.title || '').startsWith('♪'));
  if (!hasTrack || hasShow) {
    return { liveTitle: title, liveSub: sub, songSplit: false };
  }
  const split = splitChoqSongLines(title);
  if (!split.sub) {
    return { liveTitle: split.title || title, liveSub: sub, songSplit: false };
  }
  return { liveTitle: split.title, liveSub: split.sub, songSplit: true };
}

/**
 * Phases affichables : une seule phase live (émission + piste), puis à venir.
 * On ne remplace plus l’émission par le titre de piste en rotation.
 */
function composedAirPhases(radio, { withSlogan = false } = {}) {
  const raw = airRotationPhases(radio, { withSlogan });
  const copy = liveCopyFromPhases(raw);
  const { liveTitle, liveSub } = applyChoqLiveSongLines(
    radio, copy.liveTitle, copy.liveSub, raw,
  );
  const out = [];
  if (liveTitle) out.push({ title: liveTitle, sub: liveSub, kind: 'live' });
  const upcoming = raw.find((p) => p.kind === 'upcoming');
  if (upcoming) out.push(upcoming);
  for (const p of raw) {
    if (p.kind === 'idle') out.push(p);
  }
  return out.length ? out : raw;
}

/**
 * Lignes du slot « À l'antenne » (wide) : émission si elle existe,
 * piste en sous-ligne ; sinon la piste seule (ex. CHOQ hors grille).
 */
function wideNowAirLiveCopy(radio) {
  const phases = radio ? airRotationPhases(radio, { withSlogan: false }) : [];
  const raw = liveCopyFromPhases(phases);
  const { liveTitle, liveSub, songSplit } = applyChoqLiveSongLines(
    radio, raw.liveTitle, raw.liveSub, phases,
  );
  const upcoming = phases.find((p) => p.kind === 'upcoming') || null;
  const hasLive = !!liveTitle;
  return {
    liveTitle: hasLive ? liveTitle : '',
    liveSub: hasLive ? liveSub : '',
    songSplit: !!songSplit && hasLive,
    hideLive: !hasLive,
    nextTitle: upcoming?.title || (radio ? 'Rien de programmé' : '—'),
    nextSub: upcoming?.sub || '',
    hasUpcoming: !!upcoming,
  };
}

function paintWideNowAirPair(radio) {
  const wrap = ensureWideNowAirPair();
  if (!wrap || !isWideTunerLayout()) return false;

  const liveTitle = wrap.querySelector('[data-wide-live-title]');
  const liveSub = wrap.querySelector('[data-wide-live-sub]');
  const nextTitle = wrap.querySelector('[data-wide-next-title]');
  const nextSub = wrap.querySelector('[data-wide-next-sub]');
  const liveSlot = wrap.querySelector('.tuner-wide-slot--live');
  const nextSlot = wrap.querySelector('.tuner-wide-slot--next');

  const applyEmpty = () => {
    if (liveSlot) {
      liveSlot.hidden = false;
      liveSlot.classList.remove('is-wide-absent');
    }
    wrap.classList.remove('is-live-absent');
    if (liveTitle) liveTitle.textContent = 'Choisissez un poste';
    if (liveSub) {
      liveSub.textContent = 'Les radios étudiantes jouent en direct, 24/7';
      liveSub.hidden = false;
    }
    if (nextTitle) nextTitle.textContent = '—';
    if (nextSub) {
      nextSub.textContent = '';
      nextSub.hidden = true;
    }
    liveSlot?.classList.add('is-empty-slot');
    liveSlot?.classList.remove('tuner-wide-slot--song-split');
    nextSlot?.classList.add('is-empty-slot');
  };

  const applyRadio = () => {
    const copy = wideNowAirLiveCopy(radio);
    const hideLive = !!copy.hideLive;

    if (liveSlot) {
      liveSlot.hidden = hideLive;
      liveSlot.classList.toggle('is-wide-absent', hideLive);
    }
    wrap.classList.toggle('is-live-absent', hideLive);

    if (liveTitle) liveTitle.textContent = hideLive ? '' : (copy.liveTitle || '');
    if (liveSub) {
      liveSub.textContent = hideLive ? '' : (copy.liveSub || '');
      liveSub.hidden = hideLive || !copy.liveSub;
    }
    liveSlot?.classList.toggle('is-empty-slot', hideLive);
    liveSlot?.classList.toggle('tuner-wide-slot--song-split', !!copy.songSplit && !hideLive);

    if (nextTitle) nextTitle.textContent = copy.nextTitle;
    if (nextSub) {
      nextSub.textContent = copy.nextSub || '';
      nextSub.hidden = !copy.nextSub;
    }
    nextSlot?.classList.toggle('is-empty-slot', !copy.hasUpcoming);
  };

  // Texte cible (pour détecter un vrai changement)
  let nextLiveT = 'Choisissez un poste';
  let nextNextT = '—';
  let nextHideLive = false;
  if (radio) {
    const copy = wideNowAirLiveCopy(radio);
    nextHideLive = !!copy.hideLive;
    nextLiveT = nextHideLive ? '' : (copy.liveTitle || '');
    nextNextT = copy.nextTitle;
  }
  const changing = (liveTitle?.textContent || '') !== nextLiveT
    || (nextTitle?.textContent || '') !== nextNextT
    || (!!liveSlot?.hidden) !== nextHideLive;

  const paint = () => {
    if (!radio) applyEmpty();
    else applyRadio();
  };

  // Fade out → swap (largeur se recalcule hors vue) → fade in
  if (
    changing
    && wrap.isConnected
    && !PREFERS_REDUCED_MOTION?.matches
    && (liveTitle?.textContent || nextTitle?.textContent)
  ) {
    liveSlot?.classList.add('is-wide-fading');
    nextSlot?.classList.add('is-wide-fading');
    window.setTimeout(() => {
      paint();
      liveSlot?.classList.remove('is-wide-fading');
      nextSlot?.classList.remove('is-wide-fading');
    }, 150);
  } else {
    paint();
  }

  markUiReady(wrap);
  return true;
}

/**
 * Wide / super-wide : MTL et QC sont deux ancres **indépendantes et persistantes**
 * (pas d’alternance sur un seul slot). Les autres cartes tournent à côté.
 */
function weatherWideDualPrimary() {
  return typeof isWideNoMarqueeMode === 'function' && isWideNoMarqueeMode();
}

function weatherPrimaryCityById(id) {
  return WEATHER_CITIES.find((city) => city.id === id) || null;
}

function weatherBoardCount() {
  const width = weatherBoardAvailWidth();
  let count = 1;
  // Lab wide E : plus de slots quand le ruban grossit (largeur réelle masthead).
  // ≥1440 : noms complets, largeur secondaire = plus long toponyme → moins de cartes.
  // <1440 : slots CSS à parts égales (ellipsis si besoin).
  if (weatherWideDualPrimary()) {
    // Plancher 2 = MTL + QC toujours visibles ; au-delà = secondaires rotatives.
    if (isWideDesktopComfort()) {
      // 170 px / carte : plancher réaliste (nom + icône + °). Le fit post-paint
      // recoupe encore si Rouyn-Noranda / sidebar ne rentrent pas.
      const byWidth = Math.max(2, Math.min(12, Math.floor(width / 170)));
      const parity = weatherSportsParityCount();
      if (parity > 0) count = Math.min(parity, byWidth);
      else count = Math.min(12, Math.max(4, byWidth) + weatherSportsParityBonus());
    } else if (width >= 1800) count = 8;
    else if (width >= 1200) count = 7;
    else if (width >= 900) count = 6;
    else if (width >= 700) count = 5;
    else if (width >= 520) count = 4;
    else if (width >= 360) count = 3;
    else count = 2;
  } else {
    // Modèle : 1 ancre MTL/QC + secondaires. Bureau 1280 board ~650 px → 3 cartes
    // (4 serraient les secondaires → marquee). 4 seulement si board vraiment large.
    if (width >= 780) count = 4;
    else if (width >= 400) count = 3;
    else if (width >= 240) count = 2;
  }
  // Docké (768/900) : même plafond 3 pour lisibilité.
  if (mastheadWeatherDocked && count > 3) count = 3;
  // Wide dual : ne jamais descendre sous MTL+QC (fit inclus).
  // La parité sports est un *cible*, jamais un plancher : un panneau latéral
  // (Firefox, Chrome, Edge, Arc…) doit pouvoir retirer des cartes.
  if (weatherWideDualPrimary()) {
    const floor = 2;
    if (mastheadWeatherFitCount === null) return Math.max(floor, count);
    return Math.max(floor, Math.min(count, mastheadWeatherFitCount));
  }
  return mastheadWeatherFitCount === null ? count : Math.min(count, mastheadWeatherFitCount);
}

function nextWeatherCity(group, usedIds) {
  const eligible = WEATHER_CITIES.filter((city) => {
    if (usedIds.has(city.id)) return false;
    if (group === 'nation') return !!city.nation;
    return !city.nation && !MASTHEAD_WEATHER_PRIMARY_IDS.has(city.id);
  });
  if (!eligible.length) return null;
  let deck = mastheadWeatherDecks[group];
  deck = deck.filter((city) => eligible.some((candidate) => candidate.id === city.id));
  if (!deck.length) {
    if (group === 'nation') {
      deck = shuffleWeatherCities(eligible);
    } else {
      const priority = eligible.filter((city) => MASTHEAD_WEATHER_REGIONAL_RANK.has(city.id));
      const remaining = eligible.filter((city) => !MASTHEAD_WEATHER_REGIONAL_RANK.has(city.id));
      // Les six pôles régionaux (Gatineau compris) passent tous devant le
      // reste : brassés entre eux pour éviter une séquence figée, mais sans
      // jamais être noyés dans le grand bassin des petites municipalités.
      deck = [...shuffleWeatherCities(priority), ...shuffleWeatherCities(remaining)];
    }
  }
  const city = deck.shift();
  mastheadWeatherDecks[group] = deck;
  return city;
}

/** File secondaire wide : pôles, autres campus, nations — ordre stable. */
function weatherWideSecondaryPool() {
  const campuses = WEATHER_CITIES.filter((city) => (
    !city.nation && !MASTHEAD_WEATHER_PRIMARY_IDS.has(city.id)
  ));
  const nations = WEATHER_CITIES.filter((city) => city.nation);
  const priority = campuses
    .filter((city) => MASTHEAD_WEATHER_REGIONAL_RANK.has(city.id))
    .sort((a, b) => MASTHEAD_WEATHER_REGIONAL_RANK.get(a.id) - MASTHEAD_WEATHER_REGIONAL_RANK.get(b.id));
  const rest = campuses.filter((city) => !MASTHEAD_WEATHER_REGIONAL_RANK.has(city.id));
  return [...priority, ...rest, ...nations];
}

function nextWideSecondaryCity(usedIds) {
  const pool = weatherWideSecondaryPool();
  if (!pool.length) return null;
  const n = pool.length;
  const start = ((mastheadWeatherQueueIndex % n) + n) % n;
  for (let i = 0; i < n; i += 1) {
    const city = pool[(start + i) % n];
    if (usedIds.has(city.id)) continue;
    mastheadWeatherQueueIndex = (start + i + 1) % n;
    return city;
  }
  return null;
}

function advanceWideWeatherSlot(slot, n) {
  if (n <= 2) return 2;
  const next = slot + 1;
  return next >= n ? 2 : next;
}

function shuffleWeatherCities(cities) {
  const shuffled = [...cities];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

function weatherSecondaryGroup(slot, count) {
  // Wide dual : slots 0–1 = MTL/QC fixes ; nation parmi les secondaires (2+).
  if (weatherWideDualPrimary() && count > 2) {
    const nationSlot = mastheadWeatherNationSlot < 2
      ? 2
      : mastheadWeatherNationSlot;
    return slot === nationSlot ? 'nation' : 'campus';
  }
  if (count > 2) return slot === mastheadWeatherNationSlot ? 'nation' : 'campus';
  if (slot !== 1) return 'campus';
  return mastheadWeatherCompactSecondaryIndex % 3 === 2 ? 'nation' : 'campus';
}

function showMastheadWeatherBoard() {
  if (!MASTHEAD_WEATHER) return;
  if (MASTHEAD_WEATHER_PHONE_MQ.matches) {
    if (!mastheadWeatherDocked) {
      setMastheadWeatherDocked(true);
      // Après move DOM → attendre le layout pour mesurer le board (sinon count=1).
      window.requestAnimationFrame(() => {
        mastheadWeatherFitCount = null;
        showMastheadWeatherBoard();
      });
      return;
    }
  } else if (mastheadWeatherDocked) {
    setMastheadWeatherDocked(false);
    window.requestAnimationFrame(() => {
      mastheadWeatherFitCount = null;
      showMastheadWeatherBoard();
    });
    return;
  }
  if (mastheadWeatherTooNarrow) {
    MASTHEAD_WEATHER.classList.add('is-too-narrow');
    return;
  }
  MASTHEAD_WEATHER.classList.remove('is-too-narrow');
  const cities = [...MASTHEAD_WEATHER.querySelectorAll('.masthead-weather__city')];
  if (!cities.length) return;
  const count = Math.min(weatherBoardCount(), cities.length);
  const dualPrimary = weatherWideDualPrimary() && count >= 2;
  if (count !== mastheadWeatherLastBoardCount) {
    // Nation slot parmi les secondaires uniquement en dual (pas sur MTL/QC).
    if (dualPrimary && count > 2) {
      mastheadWeatherNationSlot = 2 + Math.floor(Math.random() * (count - 2));
    } else {
      mastheadWeatherNationSlot = count > 2 ? 1 + Math.floor(Math.random() * (count - 1)) : 1;
    }
    // Largeur change : garder les ancres, regénérer les secondaires, vague à gauche.
    mastheadWeatherSlots = mastheadWeatherSlots.slice(0, dualPrimary ? 2 : 1);
    mastheadWeatherLastBoardCount = count;
    if (dualPrimary) {
      mastheadWeatherNextSlot = 2;
      mastheadWeatherQueueIndex = 0;
    }
  }
  MASTHEAD_WEATHER.querySelector('.masthead-weather__board')?.setAttribute('data-weather-count', String(count));
  if (dualPrimary) {
    MASTHEAD_WEATHER.querySelector('.masthead-weather__board')?.setAttribute('data-weather-dual-primary', '1');
  } else {
    MASTHEAD_WEATHER.querySelector('.masthead-weather__board')?.removeAttribute('data-weather-dual-primary');
  }
  if (dualPrimary) {
    // Deux ancres persistantes en tête : Montréal + Québec (jamais rotées).
    const mtl = weatherPrimaryCityById('montreal');
    const qc = weatherPrimaryCityById('quebec');
    const secondaries = mastheadWeatherSlots
      .filter((c) => c && !MASTHEAD_WEATHER_PRIMARY_IDS.has(c.id));
    mastheadWeatherSlots = [mtl, qc].filter(Boolean).concat(secondaries).slice(0, count);
  } else {
    // Prod : slot 0 = ancre unique MTL ↔ QC (rotation).
    mastheadWeatherSlots = mastheadWeatherSlots.slice(0, count);
    const anchor = WEATHER_CITIES.find(
      (city) => city.id === MASTHEAD_WEATHER_PRIMARY_SEQUENCE[mastheadWeatherPrimaryIndex],
    );
    if (anchor && mastheadWeatherSlots[0]?.id !== anchor.id) mastheadWeatherSlots[0] = anchor;
  }

  const usedIds = new Set(
    mastheadWeatherSlots.filter(Boolean).map((city) => city.id),
  );
  // Dual : primaires toujours réservées
  if (dualPrimary) {
    usedIds.add('montreal');
    usedIds.add('quebec');
  }
  while (mastheadWeatherSlots.length < count) {
    const slot = mastheadWeatherSlots.length;
    let city = null;
    if (dualPrimary) {
      if (slot === 0) city = weatherPrimaryCityById('montreal');
      else if (slot === 1) city = weatherPrimaryCityById('quebec');
      else city = nextWideSecondaryCity(usedIds);
    } else {
      city = slot === 0
        ? WEATHER_CITIES.find(
          (c) => c.id === MASTHEAD_WEATHER_PRIMARY_SEQUENCE[mastheadWeatherPrimaryIndex],
        )
        : nextWeatherCity(weatherSecondaryGroup(slot, count), usedIds);
    }
    if (!city) break;
    usedIds.add(city.id);
    mastheadWeatherSlots.push(city);
  }
  // Filet dual : forcer MTL/QC même si le while a mal rempli
  if (dualPrimary) {
    const mtl = weatherPrimaryCityById('montreal');
    const qc = weatherPrimaryCityById('quebec');
    if (mtl) mastheadWeatherSlots[0] = mtl;
    if (qc) mastheadWeatherSlots[1] = qc;
  }
  cities.forEach((city) => {
    city.classList.remove('is-active', 'is-leaving', 'is-arriving');
    city.setAttribute('aria-hidden', 'true');
    city.style.pointerEvents = '';
  });
  mastheadWeatherSlots.forEach((selectedCity, slot) => {
    const city = MASTHEAD_WEATHER.querySelector(`[data-weather-city="${selectedCity.id}"]`);
    city?.classList.add('is-active');
    if (city) city.style.order = String(slot);
    city?.setAttribute('aria-hidden', 'false');
  });
  // Sports indépendants (FG weather-fit A) — pas de resync parité ici.
  if (refreshWeatherNameScroll()) return;
  if (weatherRibbonOverflowPx() > 1) {
    shrinkWeatherSlotsToClearChrome();
    if (weatherRibbonNeedsDrop() && dropWeatherCardForFit()) return;
  } else if (weatherRibbonNeedsDrop() && dropWeatherCardForFit()) return;
  window.requestAnimationFrame(() => {
    if (weatherRibbonOverflowPx() > 1) shrinkWeatherSlotsToClearChrome();
  });
  const primary = MASTHEAD_WEATHER.querySelector('.masthead-weather__city.is-active[data-weather-city="montreal"], .masthead-weather__city.is-active[data-weather-city="quebec"]');
  const primaryViewport = primary?.querySelector('.masthead-weather__name');
  const primaryText = primary?.querySelector('.masthead-weather__name-text');
  if (!primary || !primaryViewport || !primaryText
    || primary.clientWidth < 1 || primaryViewport.clientWidth < 1) return;
  // Mesurer le TEXTE, pas la fenêtre : `.masthead-weather__name-text` porte
  // `max-width: 100%`, donc le scrollWidth du parent peut déjà être borné et
  // masquer le débordement (même source de vérité que refreshWeatherNameScroll).
  const primaryOverflowing = () => primaryText.scrollWidth > primaryViewport.clientWidth + 0.5;
  // Ancre MTL/QC : nom complet d’abord. On ampute les secondaires avant compact.
  primary.classList.remove('is-compact');
  let primaryOverflows = primaryOverflowing();
  if (primaryOverflows && count > 1) {
    // Hors wide : ne pas descendre sous 3 cartes si la colonne a de la place
    // (le shrink-wrap du board faisait faussement déborder MONTRÉAL).
    const avail = weatherBoardAvailWidth();
    const floor = (!weatherWideDualPrimary() && avail >= 400) ? 3 : 1;
    if (count > floor) {
      mastheadWeatherFitCount = count - 1;
      mastheadWeatherLastBoardCount = 0;
      mastheadWeatherSlots = [];
      showMastheadWeatherBoard();
      return;
    }
  }
  if (primaryOverflows) {
    primary.classList.add('is-compact');
    primaryOverflows = primaryOverflowing();
  }
  if (!primaryOverflows) return;
  // Seule en MTL/QC et trop étroit dans le mât → dock sous le syntoniseur.
  if (!mastheadWeatherDocked) {
    setMastheadWeatherDocked(true);
    showMastheadWeatherBoard();
    return;
  }
  mastheadWeatherTooNarrow = true;
  MASTHEAD_WEATHER.classList.add('is-too-narrow');
}

/** Synchro style-masthead.css `weather-name-scroll` (5.5s × alternate × 2). */
const WEATHER_SCROLL_ONE_WAY_MS = 5500;
/** Pause lecture avant le 1er pixel (CSS animation-delay 0.8s). */
const WEATHER_SCROLL_READ_DELAY_MS = 800;
/** Rotation météo sans défilement — assez pour lire ville + °. */
const WEATHER_ROTATE_BASE_MS = 7000;
/**
 * Pause au repos **après** le retour du marquee, avant de changer de carte.
 * Plus courte que MARQUEE_REST_MS (dial/sports) : le bandeau météo n’a qu’un
 * toponyme à relire ; 2 s laissait un « trou » trop long (feedback 2026-08-11).
 */
const WEATHER_SCROLL_POST_PAUSE_MS = 700;
/** Synchro style-masthead.css `weather-tile-arrive` / `weather-tile-leave`. */
const WEATHER_ARRIVE_MS = 460;
const WEATHER_LEAVE_MS = 280;
/**
 * Vague L→R des cartes qui tournent, puis pause lecture, puis une
 * nouvelle vague. Pas un flip isolé (bandeau « vide »).
 * Step ≈ leave + début d’arrive — assez lent pour suivre la cascade.
 * Tous les écrans : mêmes timings ; seuls les slots rotatifs changent
 * (wide = secondaires ; ailleurs = ancre MTL/QC + secondaires).
 */
const WEATHER_CASCADE_STEP_MS = 440;
const WEATHER_BOARD_HOLD_MS = 10000;

function weatherMotionOk() {
  return !(sportsReducedMotion || PREFERS_REDUCED_MOTION?.matches);
}

/**
 * Entrée gare météo : rejoue l’anim (reflow) et ne retire `is-arriving` qu’à la fin.
 * Bug historique : un rAF retirait la classe à ~16 ms → anim invisible sur tous formats.
 */
function playWeatherCityArrive(el) {
  if (!el || !weatherMotionOk()) return;
  el.classList.remove('is-arriving', 'is-leaving');
  void el.offsetWidth;
  el.classList.add('is-arriving');
  const clear = () => {
    el.classList.remove('is-arriving');
    el.removeEventListener('animationend', onEnd);
  };
  const onEnd = (event) => {
    const name = String(event.animationName || '');
    if (name && !name.includes('weather-tile-arrive')) return;
    clear();
  };
  el.addEventListener('animationend', onEnd);
  window.setTimeout(clear, WEATHER_ARRIVE_MS + 80);
}

let weatherComfortFitDepth = 0;

/** Largeur-cible d’un slot secondaire : tient « Saint-Félicien » + icône + °. */
const WEATHER_SLOT_FIT_NAME = 'Saint-Félicien';

function weatherMeasureStringPx(el, text) {
  const node = el?.querySelector('.masthead-weather__name-full') || el;
  if (!node) return Math.ceil(String(text).length * 7.5);
  const cs = getComputedStyle(node);
  if (!weatherMeasureStringPx._ctx) {
    weatherMeasureStringPx._ctx = document.createElement('canvas').getContext('2d');
  }
  const ctx = weatherMeasureStringPx._ctx;
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const ls = parseFloat(cs.letterSpacing) || 0;
  const t = String(text || '');
  return Math.ceil(ctx.measureText(t).width + ls * Math.max(0, t.length - 1) + 2);
}

function weatherCityNaturalWidth(el) {
  if (!el) return 0;
  const prevWidth = el.style.width;
  const prevMin = el.style.minWidth;
  const prevMax = el.style.maxWidth;
  const prevFlex = el.style.flex;
  el.style.width = 'max-content';
  el.style.minWidth = 'max-content';
  el.style.maxWidth = 'none';
  el.style.flex = '0 0 auto';
  const w = Math.ceil(el.getBoundingClientRect().width);
  el.style.width = prevWidth;
  el.style.minWidth = prevMin;
  el.style.maxWidth = prevMax;
  el.style.flex = prevFlex;
  return w;
}

/**
 * ≥1440 : largeur fixe par carte (tient un nom type « Saint-Félicien »).
 * Les noms plus longs défilent. −1 carte si le ruban déborde.
 * @returns {boolean} true si un re-render a été lancé
 */
function fitWideWeatherSecondarySlots() {
  if (!isWideDesktopComfort() || !MASTHEAD_WEATHER) return false;
  if (weatherComfortFitDepth > 10) return false;
  const board = MASTHEAD_WEATHER.querySelector('.masthead-weather__board');
  if (!board) return false;
  const actives = [...board.querySelectorAll('.masthead-weather__city.is-active')];
  const secondaries = actives.filter((el) => {
    const id = el.getAttribute('data-weather-city');
    return id && !MASTHEAD_WEATHER_PRIMARY_IDS.has(id);
  });
  if (!secondaries.length) {
    board.style.removeProperty('--weather-secondary-w');
    return false;
  }
  const mtl = actives.find((el) => el.getAttribute('data-weather-city') === 'montreal');
  const qc = actives.find((el) => el.getAttribute('data-weather-city') === 'quebec');
  const mtlW = weatherCityNaturalWidth(mtl) || 128;
  const qcW = weatherCityNaturalWidth(qc) || 112;
  const primaryW = Math.max(mtlW, qcW);
  const gap = 4;
  const avail = weatherBoardAvailWidth();
  if (avail < 40) return false;
  const MIN_SEC = isWideQhdPlus() ? 152 : 168;
  const minPrimary = Math.max(
    118,
    (mtl || qc)
      ? 52 + weatherMeasureStringPx(mtl || qc, 'MONTRÉAL')
      : 118,
  );
  const uniformAll = window.matchMedia('(min-width: 1920px)').matches;
  const applyW = (el, w) => {
    if (!el) return;
    el.style.setProperty('flex', `0 0 ${w}px`, 'important');
    el.style.setProperty('width', `${w}px`, 'important');
    el.style.setProperty('min-width', `${w}px`, 'important');
    el.style.setProperty('max-width', `${w}px`, 'important');
  };
  const dropTo = (nTotal) => {
    weatherComfortFitDepth += 1;
    mastheadWeatherFitCount = Math.max(weatherWideDualPrimary() ? 2 : 1, nTotal);
    mastheadWeatherLastBoardCount = 0;
    try {
      showMastheadWeatherBoard();
    } finally {
      weatherComfortFitDepth = Math.max(0, weatherComfortFitDepth - 1);
    }
    return true;
  };

  if (uniformAll) {
    let n = actives.length;
    while (n > 3 && n * MIN_SEC + gap * (n - 1) > avail + 1) n -= 1;
    if (n < actives.length) return dropTo(n);
    const slotW = Math.max(MIN_SEC, Math.floor((avail - gap * Math.max(0, n - 1)) / n));
    board.style.setProperty('--weather-slot-w', `${slotW}px`);
    board.style.setProperty('--weather-secondary-w', `${slotW}px`);
    board.style.setProperty('--weather-primary-w', `${slotW}px`);
    actives.forEach((el) => applyW(el, slotW));
    return false;
  }

  let nSec = secondaries.length;
  let pW = primaryW;
  const gapsFor = (n) => gap * (n + 1);
  while (nSec > 1 && pW * 2 + nSec * MIN_SEC + gapsFor(nSec) > avail + 1) {
    const shrink = Math.floor((avail - nSec * MIN_SEC - gapsFor(nSec)) / 2);
    if (shrink >= minPrimary && shrink < pW) {
      pW = shrink;
      break;
    }
    nSec -= 1;
  }
  if (nSec < secondaries.length) return dropTo(2 + nSec);
  const room = avail - pW * 2 - gap * Math.max(0, actives.length - 1);
  const slotW = Math.max(MIN_SEC, Math.floor(room / Math.max(1, nSec)));
  board.style.setProperty('--weather-secondary-w', `${slotW}px`);
  board.style.setProperty('--weather-primary-w', `${pW}px`);
  secondaries.forEach((el) => applyW(el, slotW));
  applyW(mtl, pW);
  applyW(qc, pW);
  const painted = actives.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0)
    + gap * Math.max(0, actives.length - 1);
  if (painted > avail + 1 && actives.length > 2) return dropTo(actives.length - 1);
  return false;
}

function measureWeatherNameOverflows() {
  MASTHEAD_WEATHER?.querySelectorAll('.masthead-weather__city.is-active').forEach((el) => {
    const viewport = el.querySelector('.masthead-weather__name');
    const name = el.querySelector('.masthead-weather__name-text');
    const full = el.querySelector('.masthead-weather__name-full');
    if (!viewport || !name) return;

    const prevMax = name.style.maxWidth;
    const prevOv = name.style.overflow;
    name.style.maxWidth = 'none';
    name.style.overflow = 'visible';
    const textW = Math.max(name.scrollWidth || 0, full?.scrollWidth || 0);
    const viewW = viewport.clientWidth || 0;
    name.style.maxWidth = prevMax;
    name.style.overflow = prevOv;
    const overflow = viewW > 0 ? Math.max(0, textW - viewW) : 0;
    const needs = overflow > 2;
    const had = el.classList.contains('is-overflowing');
    const prev = (el.style.getPropertyValue('--weather-scroll') || '').trim();
    const next = `${overflow}px`;
    if (!needs) {
      if (had) {
        el.classList.remove('is-overflowing');
        el.style.removeProperty('--weather-scroll');
        el.style.removeProperty('--weather-scroll-trips');
      }
      return;
    }
    const trips = marqueeAlternateCount(WEATHER_SCROLL_ONE_WAY_MS, WEATHER_ROTATE_BASE_MS);
    el.style.setProperty('--weather-scroll-trips', String(trips));
    el.style.setProperty('--weather-scroll', next);
    const prevN = parseFloat(prev) || 0;
    if (had && Math.abs(prevN - overflow) < 6) return;
    el.classList.remove('is-overflowing');
    void name.offsetWidth;
    el.classList.add('is-overflowing');
  });
}

function refreshWeatherNameScroll() {
  if (isWideDesktopComfort() && MASTHEAD_WEATHER) {
    if (fitWideWeatherSecondarySlots()) return true;
    window.requestAnimationFrame(() => measureWeatherNameOverflows());
    return false;
  }
  if (isWideNoMarqueeMode() && !isWideDesktopComfort() && MASTHEAD_WEATHER) {
    window.requestAnimationFrame(() => measureWeatherNameOverflows());
    return false;
  }
  measureWeatherNameOverflows();
  return false;
}

/** Dwell météo : lire → 1 aller-retour si overflow → repos → changer. */
function weatherBoardDwellMs() {
  const base = isWideNoMarqueeMode()
    ? Math.max(WEATHER_ROTATE_BASE_MS, 9000)
    : WEATHER_ROTATE_BASE_MS;
  if (sportsReducedMotion || PREFERS_REDUCED_MOTION?.matches) return base;
  const anyOverflow = !!MASTHEAD_WEATHER?.querySelector(
    '.masthead-weather__city.is-active.is-overflowing',
  );
  if (!anyOverflow) return base;
  const trips = parseFloat(
    MASTHEAD_WEATHER.querySelector('.masthead-weather__city.is-active.is-overflowing')
      ?.style.getPropertyValue('--weather-scroll-trips'),
  ) || MARQUEE_ROUND_TRIPS;
  const n = trips >= 2 ? trips : MARQUEE_ROUND_TRIPS;
  return Math.max(
    base,
    WEATHER_SCROLL_READ_DELAY_MS + WEATHER_SCROLL_ONE_WAY_MS * n + WEATHER_SCROLL_POST_PAUSE_MS,
  );
}

function weatherCardDwellMs(el) {
  const base = isWideNoMarqueeMode() ? 9000 : WEATHER_ROTATE_BASE_MS;
  if (!el || sportsReducedMotion || PREFERS_REDUCED_MOTION?.matches) return base;
  if (!el.classList.contains('is-overflowing')) return base;
  const trips = parseFloat(el.style.getPropertyValue('--weather-scroll-trips')) || MARQUEE_ROUND_TRIPS;
  return Math.max(
    base,
    WEATHER_SCROLL_READ_DELAY_MS
      + WEATHER_SCROLL_ONE_WAY_MS * trips
      + WEATHER_SCROLL_POST_PAUSE_MS
      + 160,
  );
}

function clearMastheadWeatherTimer() {
  if (!mastheadWeatherTimer) return;
  clearTimeout(mastheadWeatherTimer);
  clearInterval(mastheadWeatherTimer);
  mastheadWeatherTimer = null;
}

/**
 * Slots qui tournent dans la vague.
 * Wide dual : 0–1 = MTL/QC persistants ; 2+ = secondaires.
 * Ailleurs : toutes les cartes (slot 0 = ancre MTL ↔ QC).
 */
function weatherCascadeSlots() {
  const n = mastheadWeatherSlots.length;
  if (n < 1) return [];
  if (weatherWideDualPrimary()) {
    if (n <= 2) return [];
    const slots = [];
    for (let i = 2; i < n; i += 1) slots.push(i);
    return slots;
  }
  const slots = [];
  for (let i = 0; i < n; i += 1) slots.push(i);
  return slots;
}

/** Pause lecture après une vague : assez pour balayer toute la rangée. */
function weatherBoardHoldMs() {
  const n = Math.max(1, weatherCascadeSlots().length);
  let hold = Math.min(14000, Math.max(WEATHER_BOARD_HOLD_MS, 1200 * n));
  // Hors wide : un nom qui défile doit finir son cycle pendant le hold.
  if (!isWideNoMarqueeMode()) {
    hold = Math.max(hold, weatherBoardDwellMs());
  }
  return hold;
}

/**
 * Cascade L→R des cartes rotatives, puis pause, puis une nouvelle vague.
 * Particularités conservées dans rotateOneMastheadWeatherCard (ancres
 * duales, MTL↔QC, index compact campus/nation).
 */
function scheduleWeatherCascade({ firstHold = true } = {}) {
  clearMastheadWeatherTimer();
  if (!MASTHEAD_WEATHER || MASTHEAD_WEATHER.classList.contains('hidden')) return;
  const slots = weatherCascadeSlots();
  if (!slots.length) return;

  const stepMs = (sportsReducedMotion || PREFERS_REDUCED_MOTION?.matches)
    ? 80
    : WEATHER_CASCADE_STEP_MS;

  const step = (index) => {
    const live = weatherCascadeSlots();
    if (!live.length) return;
    if (index >= live.length) {
      mastheadWeatherTimer = window.setTimeout(() => {
        mastheadWeatherTimer = null;
        scheduleWeatherCascade({ firstHold: false });
      }, weatherBoardHoldMs());
      return;
    }
    rotateOneMastheadWeatherCard(live[index]);
    mastheadWeatherTimer = window.setTimeout(() => {
      mastheadWeatherTimer = null;
      step(index + 1);
    }, stepMs);
  };

  if (firstHold) {
    mastheadWeatherTimer = window.setTimeout(() => {
      mastheadWeatherTimer = null;
      step(0);
    }, weatherBoardHoldMs());
    return;
  }
  step(0);
}

function scheduleMastheadWeatherRotate() {
  clearMastheadWeatherTimer();
  if (!MASTHEAD_WEATHER || MASTHEAD_WEATHER.classList.contains('hidden')) return;
  // Tous les écrans : vague + pause. Rien à faire si seules les ancres tiennent.
  if (!weatherCascadeSlots().length) return;
  scheduleWeatherCascade({ firstHold: true });
}

function rotateOneMastheadWeatherCard(forcedSlot) {
  if (!mastheadWeatherSlots.length || !MASTHEAD_WEATHER) return;
  const n = mastheadWeatherSlots.length;
  const dualPrimary = weatherWideDualPrimary() && n >= 2;
  // Wide dual : ne jamais tourner les slots 0–1 (MTL + QC persistants).
  if (dualPrimary && n <= 2) return;
  let slot = Number.isInteger(forcedSlot) ? forcedSlot : (mastheadWeatherNextSlot % n);
  if (dualPrimary) {
    if (slot < 2) slot = 2;
    if (slot >= n) slot = 2;
  }
  const previous = mastheadWeatherSlots[slot];
  const usedIds = new Set(
    mastheadWeatherSlots.filter((_, index) => index !== slot).map((city) => city.id),
  );
  // Primaires toujours « utilisées » pour ne pas les réinjecter en secondaire
  if (dualPrimary) {
    usedIds.add('montreal');
    usedIds.add('quebec');
  }
  let replacement;
  if (!dualPrimary && slot === 0) {
    // Prod : carte spéciale alterne exclusivement Montréal ↔ Québec.
    mastheadWeatherPrimaryIndex = (mastheadWeatherPrimaryIndex + 1)
      % MASTHEAD_WEATHER_PRIMARY_SEQUENCE.length;
    replacement = WEATHER_CITIES.find(
      (city) => city.id === MASTHEAD_WEATHER_PRIMARY_SEQUENCE[mastheadWeatherPrimaryIndex],
    );
  } else {
    if (!dualPrimary && slot === 1 && n <= 2) {
      mastheadWeatherCompactSecondaryIndex = (mastheadWeatherCompactSecondaryIndex + 1) % 3;
    }
    replacement = dualPrimary
      ? nextWideSecondaryCity(usedIds)
      : nextWeatherCity(
        weatherSecondaryGroup(slot, n),
        usedIds,
      );
  }
  if (!replacement) return;
  // Même ville (deck vide / un seul candidat) : avancer le curseur sans anim fantôme.
  if (previous?.id === replacement.id) {
    mastheadWeatherNextSlot = dualPrimary ? advanceWideWeatherSlot(slot, n) : (slot + 1) % n;
    if (dualPrimary && mastheadWeatherNextSlot < 2) mastheadWeatherNextSlot = 2;
    return;
  }

  const applyBoardWithArrive = () => {
    mastheadWeatherSlots[slot] = replacement;
    mastheadWeatherNextSlot = dualPrimary
      ? advanceWideWeatherSlot(slot, mastheadWeatherSlots.length)
      : (slot + 1) % mastheadWeatherSlots.length;
    if (dualPrimary && mastheadWeatherNextSlot < 2) mastheadWeatherNextSlot = 2;
    showMastheadWeatherBoard();
    const arriving = MASTHEAD_WEATHER.querySelector(
      `.masthead-weather__city.is-active[data-weather-city="${replacement.id}"]`,
    );
    if (!arriving) return;
    arriving.classList.remove('is-overflowing');
    playWeatherCityArrive(arriving);
    // Mesure marquee après paint (double rAF : grille + fontes).
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => refreshWeatherNameScroll());
    });
  };

  const oldEl = previous
    ? MASTHEAD_WEATHER.querySelector(
      `.masthead-weather__city.is-active[data-weather-city="${previous.id}"]`,
    )
    : null;

  // Sortie → entrée (tous formats : mât bureau + dock 390–900).
  if (oldEl && weatherMotionOk()) {
    if (oldEl._weatherLeaveTimer) {
      clearTimeout(oldEl._weatherLeaveTimer);
      oldEl._weatherLeaveTimer = null;
    }
    oldEl.classList.remove('is-arriving');
    oldEl.classList.add('is-leaving');
    oldEl.style.pointerEvents = 'none';
    oldEl._weatherLeaveTimer = window.setTimeout(() => {
      oldEl._weatherLeaveTimer = null;
      oldEl.classList.remove('is-leaving');
      oldEl.style.pointerEvents = '';
      applyBoardWithArrive();
    }, WEATHER_LEAVE_MS);
    return;
  }

  applyBoardWithArrive();
}

function scheduleMastheadWeatherLayout() {
  window.cancelAnimationFrame(mastheadWeatherResizeFrame);
  mastheadWeatherResizeFrame = window.requestAnimationFrame(() => {
    const nowW = document.documentElement.clientWidth || 0;
    const prevW = scheduleMastheadWeatherLayout._w;
    scheduleMastheadWeatherLayout._w = nowW;
    // Premier passage : ne pas traiter 0→viewport comme un « élargissement »
    // (fonts.ready re-montrait trop de cartes). Panneau qui s’ouvre = rétrécit
    // (garder le plafond). Fermeture = élargit (re-autoriser des cartes).
    if (prevW != null && nowW > prevW + 8) {
      mastheadWeatherFitCount = null;
      weatherAvailTrim = 0;
    }
    mastheadWeatherTooNarrow = false;
    weatherOverlapFitDepth = 0;
    MASTHEAD_WEATHER?.classList.remove('is-too-narrow');
    clearWeatherSlotInlineStyles();
    // showMastheadWeatherBoard réévalue lui-même le dockage (masthead vs
    // sous le syntoniseur) selon la largeur actuelle.
    mastheadWeatherResizeFrame = window.requestAnimationFrame(showMastheadWeatherBoard);
  });
}

function bindMastheadWeatherLayoutWatchers() {
  if (bindMastheadWeatherLayoutWatchers._bound) return;
  bindMastheadWeatherLayoutWatchers._bound = true;
  window.addEventListener('resize', scheduleMastheadWeatherLayout, { passive: true });
  try {
    window.visualViewport?.addEventListener('resize', scheduleMastheadWeatherLayout, { passive: true });
  } catch { /* ignore */ }
  [
    MASTHEAD_WEATHER_PHONE_MQ,
    window.matchMedia('(min-width: 1281px)'),
    window.matchMedia('(min-width: 1440px)'),
    window.matchMedia('(min-width: 1920px)'),
    window.matchMedia('(min-width: 2560px)'),
    window.matchMedia('(min-width: 3440px)'),
  ].forEach((mq) => onMediaQueryChange(mq, scheduleMastheadWeatherLayout));
  if (typeof ResizeObserver === 'undefined') return;
  const watch = (el) => {
    if (!el) return;
    let lastW = el.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (Math.abs(w - lastW) < 2) return;
      lastW = w;
      scheduleMastheadWeatherLayout();
    });
    ro.observe(el);
  };
  watch(document.querySelector('.masthead-top'));
  watch(MASTHEAD_WEATHER_DOCK);
}

function startMastheadWeatherBoard() {
  if (!MASTHEAD_WEATHER) return;
  showMastheadWeatherBoard();
  // Re-fit après fontes : 1ʳᵉ mesure trop tôt → fitCount=1 figé (1 carte au lieu de 2).
  const fonts = document.fonts;
  if (fonts?.ready && typeof fonts.ready.then === 'function') {
    fonts.ready.then(() => {
      if (!MASTHEAD_WEATHER?.isConnected) return;
      mastheadWeatherFitCount = null;
      scheduleMastheadWeatherLayout();
    }).catch(() => { /* ignore */ });
  }
  // Chaîne setTimeout (pas interval fixe) : le dwell suit le marquee réel.
  if (!mastheadWeatherTimer) scheduleMastheadWeatherRotate();
  bindMastheadWeatherLayoutWatchers();
}

function renderMastheadWeather(entries) {
  if (!MASTHEAD_WEATHER || !Array.isArray(entries)) return;
  buildMastheadWeatherBoard();
  WEATHER_CITIES.forEach((city, index) => {
    const current = entries[index]?.current;
    const el = MASTHEAD_WEATHER.querySelector(`[data-weather-city="${city.id}"]`);
    if (!el || !current || !Number.isFinite(current.temperature_2m)) return;
    el.querySelector('.masthead-weather__icon').innerHTML = weatherIcon(current.weather_code, current.is_day);
    el.querySelector('.masthead-weather__temp').textContent = `${Math.round(current.temperature_2m)}°`;
    el.dataset.weatherTone = weatherTone(current.weather_code);
  });
  MASTHEAD_WEATHER.classList.remove('hidden');
  syncMastheadShuffleButton();
  startMastheadWeatherBoard();
  window.requestAnimationFrame(() => {
    if (MASTHEAD_WEATHER?.querySelector('.masthead-weather__city.is-active')) {
      markUiReady(MASTHEAD_WEATHER);
    }
  });
}

window.addEventListener('radar:translate-mode', refreshMastheadWeatherLinks);

// Changer de langue redimensionne le mât : la colonne date est en max-content
// (style-masthead.css) et « Thursday, August 6, 2026 » est plus large que
// « jeudi 6 août 2026 ». La cellule météo perd donc ~40 px sans que personne
// ne le recalcule — la carte primaire débordait jusqu'au prochain tick de
// rotation, qui retirait une ville. On replanifie la mise en page comme on le
// fait déjà au resize, pour la même raison : la largeur disponible a changé.
window.addEventListener('radar:translate-mode', scheduleMastheadWeatherLayout);

function readWeatherCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || 'null');
    if (cached?.at && Date.now() - cached.at < WEATHER_CACHE_MS && Array.isArray(cached.entries)) return cached.entries;
  } catch { /* cache absent ou invalide */ }
  return null;
}

/** Lab local (python http.server / vite) — pas de météo en prod sans API. */
function isLocalWeatherLabHost() {
  try {
    const h = String(location.hostname || '');
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Repli lab : temps plausibles QC pour juger layout / parité sports sans
 * dépendre du Worker (CORS non déployé, offline, timeout). Jamais en prod.
 */
function weatherLabFixtureEntries() {
  const hour = new Date().getHours();
  const isDay = hour >= 6 && hour < 21 ? 1 : 0;
  return WEATHER_CITIES.map((city, i) => {
    // Légère variation nord/sud + index pour que la rotation change de ton.
    const base = 16 + ((i * 3) % 11);
    const latNudge = Number.isFinite(city.lat) ? (48 - city.lat) * 0.35 : 0;
    return {
      current: {
        temperature_2m: Math.round((base - latNudge) * 10) / 10,
        weather_code: [0, 1, 2, 3, 61, 0, 1, 80][i % 8],
        is_day: isDay,
      },
    };
  });
}

/**
 * Accueil seulement dans le HTML historique : les fiches SEO / hub n'avaient
 * pas les coquilles. On les pose dès qu'un mât existe (pas pomo / solitaire /
 * maintenance) pour que météo et scores soient les mêmes partout.
 */
function ensureMastheadBoards() {
  const top = document.querySelector('.masthead-top');
  if (!top) return;

  const en = document.documentElement.lang.startsWith('en');
  if (!MASTHEAD_WEATHER) {
    const weather = document.createElement('div');
    weather.id = 'masthead-weather';
    weather.className = 'masthead-weather hidden';
    weather.setAttribute('aria-label', en ? 'Québec weather' : 'Météo du Québec');
    weather.setAttribute('aria-live', 'polite');
    weather.innerHTML = `<span class="masthead-weather__board" aria-label="${en ? 'Current conditions' : 'Conditions actuelles'}"></span>`;
    const date = top.querySelector('.masthead-date');
    const actions = top.querySelector('.masthead-actions');
    if (date?.nextSibling) top.insertBefore(weather, date.nextSibling);
    else if (actions) top.insertBefore(weather, actions);
    else top.appendChild(weather);
    MASTHEAD_WEATHER = weather;
  }

  if (!MASTHEAD_WEATHER_DOCK) {
    const dock = document.createElement('div');
    dock.id = 'masthead-weather-dock';
    dock.className = 'masthead-weather-dock';
    MASTHEAD_WEATHER_DOCK = dock;
  }

  if (!MASTHEAD_SPORTS_STRIP) {
    const strip = document.createElement('div');
    strip.id = 'masthead-sports-strip';
    strip.className = 'masthead-sports-strip';
    strip.hidden = true;
    strip.setAttribute('aria-label', en
      ? 'Québec student sports scores'
      : 'Résultats sportifs étudiants du Québec');
    strip.setAttribute('aria-live', 'polite');
    MASTHEAD_SPORTS_STRIP = strip;
  }

  const main = document.querySelector('main');
  const tuner = document.getElementById('tuner');
  const mountParent = main?.parentNode || tuner?.parentNode || document.body;
  const beforeMain = main || null;
  if (!MASTHEAD_WEATHER_DOCK.parentNode) {
    mountParent.insertBefore(MASTHEAD_WEATHER_DOCK, beforeMain);
  }
  if (!MASTHEAD_SPORTS_STRIP.parentNode) {
    if (MASTHEAD_WEATHER_DOCK.nextSibling) {
      mountParent.insertBefore(MASTHEAD_SPORTS_STRIP, MASTHEAD_WEATHER_DOCK.nextSibling);
    } else {
      mountParent.insertBefore(MASTHEAD_SPORTS_STRIP, beforeMain);
    }
  }

  mastheadWeatherHomeParent = MASTHEAD_WEATHER.parentNode;
  mastheadWeatherHomeNextSibling = MASTHEAD_WEATHER.nextSibling;
}

async function initMastheadWeather() {
  // Sous le seuil du masthead, la météo se déplace sous le syntoniseur
  // (setMastheadWeatherDocked) plutôt que d'être masquée : la charger
  // reste utile à toutes les largeurs.
  if (!MASTHEAD_WEATHER) return;
  const cached = readWeatherCache();
  if (cached) renderMastheadWeather(cached);
  try {
    const params = new URLSearchParams({
      latitude: WEATHER_CITIES.map((city) => city.lat).join(','),
      longitude: WEATHER_CITIES.map((city) => city.lon).join(','),
      current: 'temperature_2m,weather_code,is_day',
      temperature_unit: 'celsius',
      timezone: 'America/Toronto',
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    // Passe par le cache partagé (workers/weather-cache) plutôt qu'Open-Meteo
    // directement : à l'échelle, chaque visiteur qui appelle l'API anonyme
    // épuisait son quota gratuit et coupait la météo pour tout le monde.
    const response = await fetch(`${WEATHER_API_BASE}/v1/forecast?${params}`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`weather ${response.status}`);
    const data = await response.json();
    const entries = Array.isArray(data) ? data : [data];
    if (entries.length !== WEATHER_CITIES.length) throw new Error('weather length');
    try { localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ at: Date.now(), entries })); } catch { /* quota */ }
    renderMastheadWeather(entries);
  } catch {
    // Lab local : afficher un bandeau même si le Worker refuse localhost
    // (CORS) ou est offline — nécessaire pour juger météo ∥ sports.
    if (!cached && isLocalWeatherLabHost()) {
      renderMastheadWeather(weatherLabFixtureEntries());
    }
    /* prod : module discret — absent si la météo est indisponible */
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SPORTS STRIP (RSEQ collégial + universitaire QC) — sous la radio
//  Rotation carte-par-carte (comme la météo), tons par sport / résultat.
// ═══════════════════════════════════════════════════════════════════════════
const SPORTS_FAV_KEY = 'radar-sports-favorites-v1';
/**
 * Boost éditorial doux (fallback si sports.json n’a pas encore `priority`
 * du registre sports-teams.json). Après favoris + imminence.
 */
const SPORTS_DEFAULT_CODES = ['LAV', 'MCG', 'UCON', 'MTL', 'UQAM', 'USHE', 'BIS', 'GAR', 'LIM', 'VAN'];
/** Palette par sport (évite le tout-rouge des prochains matchs). */
const SPORTS_SPORT_TONES = {
  football: '#c45c2a',
  basketball: '#d88a0a',
  soccer: '#3d9a6a',
  'soccer-interieur': '#15803d',
  futsal: '#166534',
  volleyball: '#3b82c4',
  hockey: '#5498bb',
  sailing: '#0e7490',
  rugby: '#7c2d12',
  badminton: '#0f766e',
  baseball: '#9a3412',
  'flag-football': '#854d0e',
  athletisme: '#b45309',
  'cross-country': '#92400e',
  natation: '#0369a1',
  golf: '#15803d',
  cheerleading: '#be185d',
  ultimate: '#7c3aed',
  default: '#66839e',
};
/*
 * Fenêtres d’urgence (ms) — parité scoreboards ESPN / apps scores.
 *
 * Attention aux noms : ils se lisent à l’envers du code qu’ils servent. Le test
 * de `sportsUrgency` est `t >= now - SPORTS_LIVE_BEFORE_MS`, ce qui retient un
 * match dont le coup d’envoi date de **moins de 2 h**, et
 * `t <= now + SPORTS_LIVE_AFTER_MS`, un coup d’envoi dans **moins de 3 h**.
 * La fenêtre réelle est donc [coup d’envoi − 3 h ; coup d’envoi + 2 h].
 * On ne renomme pas : ces bornes pilotent le tri, pas l’affichage. Le registre
 * visuel « en direct » a ses propres bornes, plus serrées (SPORTS_LIVE_VISUAL_*).
 */
const SPORTS_LIVE_BEFORE_MS = 2 * 3600 * 1000;
const SPORTS_LIVE_AFTER_MS = 3 * 3600 * 1000;
const SPORTS_IMMINENT_MS = 7 * 24 * 3600 * 1000; /* 7 jours */
/** Focus-group le-radar-sports-left-pool : gate D (7 j) + exclude priorSeason. */
const SPORTS_RECENT_RESULT_MS = 7 * 24 * 3600 * 1000; /* résultats < 7 j — cartes de gauche */
/**
 * « Chaud » pour la *voie de gauche* / détection saison (pas le pool CTA).
 * La CTA suit le-radar-cta-sports-window : journée lead + résultats aujourd’hui/hier.
 */
const SPORTS_CTA_UPCOMING_MS = 14 * 24 * 3600 * 1000;
/**
 * Marquee puces match (2 lignes, noms longs) — plus lent que la CTA (5,5 s).
 * Un overflow dense (voile / place / événement) à 5,5 s se lisait en zapping.
 */
const SPORTS_MATCH_SCROLL_ONE_WAY_MS = 8000;
/** Plafond faces CTA (jour lead + filet aujourd’hui/hier) — le-radar-cta-sports-window F. */
const SPORTS_CTA_MAX_POOL = 16;
/**
 * Hors saison (aucun résultat aujourd’hui/hier) : alterner le **premier match**
 * de chacun des **7 premiers jours civils** d’action à partir du jour lead
 * (ex. 19→25 août), pas un seul match collé toute la semaine.
 */
const SPORTS_CTA_OFFSEASON_LEAD_DAYS = 7;
/*
 * Registre d’alerte de la carte CTA — focus-group le-radar-sports-first-glance
 * (garde-fou `registre-alerte-reserve`) et le-radar-cta-sports-badge.
 *
 * La pastille rouge et le point live sont **gagnés** par un match en cours, pas
 * allumés par défaut : un point qui pulse pour un match dans douze jours est une
 * promesse fausse. Bornes serrées, indépendantes de celles du tri.
 */
const SPORTS_LIVE_VISUAL_LEAD_MS = 15 * 60 * 1000; /* 15 min avant le coup d’envoi */
const SPORTS_LIVE_VISUAL_TAIL_MS = 3 * 3600 * 1000; /* 3 h après le coup d’envoi */
/**
 * Filet résultats CTA : **jours civils Toronto** « aujourd’hui » + « hier »
 * (plus de fenêtre 48 h glissante — gate mainteneur 2026-08-11).
 * Les prochains du **jour lead** restent en appoint (le-radar-cta-sports-window F).
 */
/**
 * Accroches CTA **uniquement** quand il n’y a ni match chaud (≤14 j)
 * ni aucun match à venir en grille. Pas de puces grises à gauche pour
 * ces messages — elles se confondaient avec des scores (régression UX
 * 2026-07-30 : « Hors saison » à côté de vrais prochains matchs).
 */
const SPORTS_CTA_IDLE_LABELS = [
  'Scores collégiaux et universitaires',
  'Voir le tableau des scores',
];
let sportsData = null;
let sportsSlides = [];
/** Slides actuellement affichées (1 par slot), comme mastheadWeatherSlots. */
let sportsVisible = [];
/** @deprecated remplacé par des timers par slot (indépendants). */
let sportsNextSlot = 0;
/** Un timeout par slot : chaque puce tourne à son rythme (marquee inclus). */
let sportsSlotTimers = [];
let sportsWaveTimer = 0;
let sportsWaveSlot = 0;
/** Rotation de la CTA suspendue (survol ou focus) — garde-fou `pause-survol-focus`. */
let sportsCtaPaused = false;
/**
 * La rotation n’existe que là où un mécanisme de pause existe (garde-fou
 * `rotation-pointeur-fin`). Souris : survol/focus. Téléphone (≤700 px) : doigt
 * posé sur la carte (pointerdown). Sans ça l’accroche défilait sans jamais
 * changer sur tactile.
 * ⚠️ Doit être déclaré **avant** l’init de `sportsCtaRotateMq` (sinon TDZ →
 * matchMedia avalé par try/catch → mq null → CTA jamais en rotation).
 */
const SPORTS_CTA_ROTATE_MEDIA = '(hover: hover) and (pointer: fine), (max-width: 700px)';
/** Surfaces où un mécanisme de pause existe réellement (souris, pas doigt). */
let sportsCtaRotateMq = null;
try {
  sportsCtaRotateMq = window.matchMedia
    ? window.matchMedia(SPORTS_CTA_ROTATE_MEDIA)
    : null;
} catch { /* ignore */ }
/**
 * Plafond mesuré après paint (parité météo `mastheadWeatherFitCount`).
 * null = pas encore contraint ; sinon min(base largeur, fit).
 * On retire une carte score à la fois tant que le bandeau est à l’étroit ;
 * le dernier chip restant est toujours la CTA « SPORTS ».
 */
let sportsFitCount = null;
/** Garde-fou récursion fit (max 4 → 1). */
let sportsFitDepth = 0;
let sportsReducedMotion = false;
try {
  sportsReducedMotion = !!(window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
} catch { /* ignore */ }
/**
 * Temps d’affichage des puces sports (gauche) — calibré pour *lire* l’info
 * (glyphe + équipes + date + heure), pas un flip nerveux type gare météo.
 *
 * Feedback prod 2026-08-11 : 4,8–8 s faisait « trop vide » (3 slots qui
 * tournent en parallèle → sensation de bandeau qui se vide sans cesse).
 * Sans défilement : ~9–14 s selon la longueur du libellé.
 * Avec marquee : ≥ 1 aller-retour CSS + pause au repos pour relire le début
 *   (même esprit que MARQUEE_REST_MS du dial radio).
 */
const SPORTS_READ_MIN_MS = 9000;
const SPORTS_READ_PER_CHAR_MS = 42;
const SPORTS_READ_MAX_MS = 14000;
/**
 * Une voie du marquee CSS `sports-chip-scroll` (style.css) — tenir synchro
 * avec `--sports-scroll-duration`. `alternate` → aller-retour = 2 ×.
 */
/** Synchro style.css `--sports-scroll-duration` (marquee L→R). */
const SPORTS_SCROLL_ONE_WAY_MS = 5500;
const SPORTS_SCROLL_ROUND_TRIP_MS = SPORTS_SCROLL_ONE_WAY_MS * 2;
/** Délai lecture avant scroll — aligné MARQUEE_READ_DELAY_MS / CSS --sports-scroll-delay. */
const SPORTS_SCROLL_READ_DELAY_MS = MARQUEE_READ_DELAY_MS;
/** Pause au repos après le retour (re-ack du début de ligne). */
const SPORTS_SCROLL_POST_PAUSE_MS = MARQUEE_REST_MS;
/** Décalage initial entre slots pour éviter un flip simultané au 1er paint. */
const SPORTS_SLOT_STAGGER_MS = 1100;
/**
 * Vague de toutes les puces (scores + texte CTA), puis pause lecture.
 * Tous les écrans : même principe ; CTA inchangée si tactile / motion réduite.
 * Step assez lent pour suivre la cascade ; hold assez long pour relire le ruban.
 */
const SPORTS_CASCADE_STEP_MS = 520;
const SPORTS_BOARD_HOLD_MS = 11000;
/** Entrée d’une puce score (CSS sports-chip-arrive) — plus long = moins brutal. */
const SPORTS_ARRIVE_MS = 640;
/**
 * CTA du mât : pastille « SPORTS » + accroche datée + sous-ligne.
 *
 * Trois verdicts focus-group se superposent ici :
 * · `le-radar-sports-first-glance` — lead = résultat aujourd’hui/hier (civil QC)
 *   sinon prochain du jour lead ; alerte réservée au direct.
 * · `le-radar-cta-sports-motion` — override humain 2026-08-17 : le
 *   renouvellement de l’accroche rejoue la **même** sortie/entrée que les
 *   puces scores (`is-leaving` / `is-arriving` sur la carte entière), plus
 *   un roulement interne du texte seul.
 * · `le-radar-cta-sports-badge` — le mot de la pastille reste « Sports » au
 *   repos ; seul le direct le remplace (override mainteneur 2026-08-09).
 */
const SPORTS_CTA_TAG = 'Sports';
/** Pastille pendant un match en cours — le seul cas qui remplace la rubrique. */
const SPORTS_CTA_TAG_LIVE = 'En cours';
/** Repli idle (creux total, pas de match) ; sinon ton du sport via sportsCtaTone. Rouge = direct. */
const SPORTS_CTA_REST_TONE = '#6a7580';
const SPORTS_CTA_LIVE_TONE = '#c8102e';
/** Durée du roulement vertical A↑B (une seule phase, jamais de trou vide). */
const SPORTS_CTA_ROLL_MS = 280;
/**
 * Rythme de la carte CTA — un peu plus lent que les puces scores, mais pas
 * figé. Feedback prod 2026-08-11 : 24 s laissait l’accroche « collée » alors
 * que la gauche tournait trop vite. Cible ~12 s (proche des scores stables,
 * toujours un cran plus posé). Survol = pause (garde-fou rotation-pointeur-fin).
 */
const SPORTS_CTA_DWELL_MS = 12000;
/** Sortie douce d’une puce score avant replaceWith (synchro CSS is-leaving). */
const SPORTS_CHIP_LEAVE_MS = 420;
/** Popularité sports étudiants QC (aligné page /sports/). */
const SPORTS_POPULARITY = [
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
const SPORTS_CTA_KEY = 'cta:board';
/** Curseur d’accroche CTA (un sport à la fois, par popularité). */
let sportsCtaLabelIndex = 0;
/** Curseur circulaire dans le pool de gauche (résultats ou next). */
let sportsLeftCursor = 0;

/**
 * Glyphes — d’abord reconnaissables par les pratiquants.
 * Variantes (intérieur, futsal, cross) partagent l’emoji « métier » ;
 * le libellé + la teinte de section font la distinction.
 */
function sportsGlyph(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('basket')) return '🏀';
  if (s.includes('hockey')) return '🏒';
  if (s.includes('sail') || s.includes('voile')) return '⛵';
  if (s.includes('badminton')) return '🏸';
  if (s.includes('baseball') || s.includes('base-ball')) return '⚾';
  if (s.includes('ultimate') || s.includes('frisbee')) return '🥏';
  if (s.includes('rugby')) return '🏉';
  if (s.includes('volley')) return '🏐';
  // Soccer extérieur, intérieur et futsal → ballon (identité terrain).
  if (
    s.includes('futsal')
    || s.includes('soccer')
    || s.includes('interieur')
    || s.includes('intérieur')
    || (s.includes('foot') && !s.includes('flag') && !s.includes('football'))
  ) return '⚽';
  if (s.includes('flag')) return '🚩';
  if (s.includes('football')) return '🏈';
  if (s.includes('natat') || s.includes('swim')) return '🏊';
  if (s.includes('golf')) return '⛳';
  // Athlé + cross-country course → coureur (pas un arbre abstrait).
  if (s.includes('cross') || s.includes('athlet')) return '🏃';
  if (s.includes('cheer')) return '📣';
  if (s.includes('tennis')) return '🎾';
  if (s.includes('handball')) return '🤾';
  if (s.includes('ski')) return '⛷️';
  return '🏅';
}

function sportsResultTone(result) {
  if (result === 'W') return '#3d9a6a';
  if (result === 'L') return '#c45c5c';
  if (result === 'D' || result === 'T') return '#8fa3b0';
  return SPORTS_SPORT_TONES.default;
}

/** Pastille V / D / N — puces scores et CTA. */
function sportsResultBadgeSpec(game) {
  const r = String(game?.result || '');
  if (r === 'W') return { letter: 'V', mod: 'w' };
  if (r === 'L') return { letter: 'D', mod: 'l' };
  if (r === 'D' || r === 'T') return { letter: 'N', mod: 'd' };
  return { letter: 'N', mod: 'd' };
}

function sportsResultBadgeEl(game) {
  const spec = sportsResultBadgeSpec(game);
  const el = document.createElement('span');
  el.className = `sports-chip__badge sports-chip__badge--${spec.mod}`;
  el.textContent = spec.letter;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function sportsSportTone(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('basket')) return SPORTS_SPORT_TONES.basketball;
  if (s.includes('hockey')) return SPORTS_SPORT_TONES.hockey;
  if (s.includes('sail') || s.includes('voile')) return SPORTS_SPORT_TONES.sailing;
  if (s.includes('badminton')) return SPORTS_SPORT_TONES.badminton;
  if (s.includes('baseball') || s.includes('base-ball')) return SPORTS_SPORT_TONES.baseball;
  if (s.includes('ultimate')) return SPORTS_SPORT_TONES.ultimate;
  if (s.includes('rugby')) return SPORTS_SPORT_TONES.rugby;
  if (s.includes('volley')) return SPORTS_SPORT_TONES.volleyball;
  if (s.includes('futsal')) return SPORTS_SPORT_TONES.futsal;
  if (s.includes('interieur') || s.includes('intérieur')) return SPORTS_SPORT_TONES['soccer-interieur'];
  if (s.includes('soccer')) return SPORTS_SPORT_TONES.soccer;
  if (s.includes('flag')) return SPORTS_SPORT_TONES['flag-football'];
  if (s.includes('football')) return SPORTS_SPORT_TONES.football;
  if (s.includes('natat') || s.includes('swim')) return SPORTS_SPORT_TONES.natation;
  if (s.includes('golf')) return SPORTS_SPORT_TONES.golf;
  if (s.includes('cheer')) return SPORTS_SPORT_TONES.cheerleading;
  if (s.includes('cross')) return SPORTS_SPORT_TONES['cross-country'];
  if (s.includes('athlet')) return SPORTS_SPORT_TONES.athletisme;
  return SPORTS_SPORT_TONES.default;
}

function sportsSlideTone(slide) {
  if (!slide) return SPORTS_SPORT_TONES.default;
  if (slide.mode === 'result' && slide.game?.result) {
    return sportsResultTone(slide.game.result);
  }
  return sportsSportTone(slide.game?.sport || slide.team?.sport);
}

function readSportsFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(SPORTS_FAV_KEY) || '[]');
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch {
    return [];
  }
}

function sportsIsFavorite(team, favSet) {
  if (!team || !favSet?.size) return false;
  return favSet.has(team.id) || favSet.has(team.code)
    || favSet.has(String(team.code || '').toUpperCase());
}

/** Instant du match (ms) — date ISO + time « HH:MM » (fuseau du navigateur / QC). */
function sportsGameMs(game) {
  if (!game?.date) return NaN;
  const rawTime = String(game.time || '12:00').trim();
  const m = rawTime.match(/^(\d{1,2}):(\d{2})/);
  const hh = m ? String(Math.min(23, Number(m[1]))).padStart(2, '0') : '12';
  const mm = m ? m[2] : '00';
  const t = Date.parse(`${game.date}T${hh}:${mm}:00`);
  return Number.isFinite(t) ? t : NaN;
}

/** Jour civil America/Toronto (YYYY-MM-DD) — frontière « hier / aujourd’hui ».
 *  Sert aux matchs comme aux articles : le jour de référence est celui du
 *  Québec, pas celui du fuseau de la personne qui lit. */
function torontoDayKey(msOrDate = Date.now()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(msOrDate));
  } catch {
    return new Date(msOrDate).toISOString().slice(0, 10);
  }
}

/** true si le match est le jour civil d’aujourd’hui (QC). */
function sportsGameIsToday(game) {
  const ms = sportsGameMs(game);
  if (!Number.isFinite(ms)) {
    // Fallback date seule
    if (!game?.date) return false;
    return game.date === torontoDayKey();
  }
  return torontoDayKey(ms) === torontoDayKey();
}

/** YYYY-MM-DD ± n jours civils (arithmétique UTC sur la date seule). */
function sportsCivilDayShift(yyyyMmDd, deltaDays) {
  const m = String(yyyyMmDd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3] + deltaDays);
  return new Date(utc).toISOString().slice(0, 10);
}

/**
 * Résultat admissible sur la CTA : jour civil Toronto = aujourd’hui **ou** hier.
 * (Remplace l’ancien filet glissant 48 h.)
 */
function sportsCtaResultIsTodayOrYesterday(game, now = Date.now()) {
  let day = '';
  const ms = sportsGameMs(game);
  if (Number.isFinite(ms)) day = torontoDayKey(ms);
  else if (game?.date && /^\d{4}-\d{2}-\d{2}$/.test(game.date)) day = game.date;
  if (!day) return false;
  const today = torontoDayKey(now);
  const yesterday = sportsCivilDayShift(today, -1);
  return day === today || day === yesterday;
}

/** Résultat CTA : aujourd’hui / hier (pastilles dédiées) **ou** < 7 j (pastille Sports). */
function sportsCtaResultIsRecent(game, now = Date.now()) {
  if (sportsCtaResultIsTodayOrYesterday(game, now)) return true;
  const age = sportsResultAgeMs(game, now);
  return Number.isFinite(age) && age >= 0 && age <= SPORTS_RECENT_RESULT_MS;
}

/**
 * Match réellement en cours *maintenant* — prédicat visuel, recalculé à chaque
 * rendu (contrairement à `slide.urgency`, figé à la construction des slides).
 *
 * C’est lui, et lui seul, qui autorise le registre d’alerte de la carte CTA :
 * pastille rouge et point live. Fenêtre serrée autour du coup d’envoi, pas la
 * fenêtre large du tri.
 */
function sportsGameIsLive(game, now = Date.now()) {
  const t = sportsGameMs(game);
  if (!Number.isFinite(t)) return false;
  return t <= now + SPORTS_LIVE_VISUAL_LEAD_MS && t >= now - SPORTS_LIVE_VISUAL_TAIL_MS;
}

/** Âge d’un résultat en ms (négatif si le match est à venir). */
function sportsResultAgeMs(game, now = Date.now()) {
  const t = sportsGameMs(game);
  return Number.isFinite(t) ? now - t : Number.POSITIVE_INFINITY;
}

/**
 * Palier d’urgence (plus bas = plus prioritaire), style scoreboards populaires :
 *  0 live (proxy) · 1 aujourd’hui / ≤7 j · 2 résultat récent · 3 à venir plus tard
 *  · 4 vieux résultat · 5 rien
 * @returns {{ tier: number, sortMs: number }}
 */
function sportsUrgency(mode, game, now = Date.now()) {
  const t = sportsGameMs(game);
  if (!Number.isFinite(t)) return { tier: 5, sortMs: Number.POSITIVE_INFINITY };

  if (mode === 'next') {
    // Proxy « en direct » : fenêtre autour du coup d’envoi (tant que l’API
    // S1 n’expose pas un statut live fiable).
    if (t <= now + SPORTS_LIVE_AFTER_MS && t >= now - SPORTS_LIVE_BEFORE_MS) {
      return { tier: 0, sortMs: t };
    }
    if (t >= now && t - now <= SPORTS_IMMINENT_MS) {
      return { tier: 1, sortMs: t }; // bientôt : le plus proche d’abord
    }
    if (t >= now) {
      return { tier: 3, sortMs: t }; // plus loin
    }
    // nextGame dans le passé hors fenêtre live → traiter comme peu urgent
    return { tier: 4, sortMs: -t };
  }

  // Résultat
  const age = now - t;
  if (age >= 0 && age <= SPORTS_RECENT_RESULT_MS) {
    return { tier: 2, sortMs: -t }; // plus récent d’abord
  }
  return { tier: 4, sortMs: -t };
}

function sportsEditorialRank(teamOrCode) {
  if (teamOrCode && typeof teamOrCode === 'object') {
    if (Number.isFinite(teamOrCode.priority)) return teamOrCode.priority;
    return sportsEditorialRank(teamOrCode.code);
  }
  const i = SPORTS_DEFAULT_CODES.indexOf(String(teamOrCode || '').toUpperCase());
  return i === -1 ? 99 : i;
}

/** Slide résultat passé pour une équipe (null si aucun lastGame). */
function sportsResultSlide(team, now = Date.now()) {
  if (!team?.lastGame) return null;
  const u = sportsUrgency('result', team.lastGame, now);
  return {
    mode: 'result',
    team,
    game: team.lastGame,
    key: `r:${team.id}:${team.lastGame.date}`,
    urgency: u,
  };
}

/** Slide match à venir pour une équipe (null si aucun nextGame). */
function sportsNextSlide(team, now = Date.now()) {
  if (!team?.nextGame) return null;
  const u = sportsUrgency('next', team.nextGame, now);
  return {
    mode: 'next',
    team,
    game: team.nextGame,
    key: `n:${team.id}:${team.nextGame.date}`,
    urgency: u,
  };
}

/**
 * Ancien « meilleur signal » par équipe — conservé pour la CTA (urgence).
 * Un résultat récent (SPORTS_RECENT_RESULT_MS) prime sur un prochain lointain ;
 * un prochain imminent prime sur un vieux score.
 */
function sportsPickTeamSlide(team, now = Date.now()) {
  const candidates = [sportsResultSlide(team, now), sportsNextSlide(team, now)].filter(Boolean);
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (a.urgency.tier !== b.urgency.tier) return a.urgency.tier - b.urgency.tier;
    if (a.urgency.sortMs !== b.urgency.sortMs) return a.urgency.sortMs - b.urgency.sortMs;
    return a.mode === 'result' ? -1 : 1;
  });
  return candidates[0];
}

/** Largeur utile du bandeau sports (contenu, hors padding). */
function sportsStripAvailWidth() {
  const strip = MASTHEAD_SPORTS_STRIP;
  if (strip) {
    const w = strip.clientWidth || strip.getBoundingClientRect().width;
    if (w > 0) {
      const cs = getComputedStyle(strip);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      // 8 px de filet : évite que la dernière carte dépasse le cadre.
      return Math.max(0, w - padL - padR - 8);
    }
  }
  return document.documentElement.clientWidth || 360;
}

/** Nombre de cartes sports hors CTA (scores). */
function sportsMatchChipCount() {
  const fromState = (typeof sportsVisible !== 'undefined' && Array.isArray(sportsVisible))
    ? sportsVisible.filter((slide) => slide && slide.mode !== 'cta').length
    : 0;
  if (fromState > 0) return fromState;
  const strip = MASTHEAD_SPORTS_STRIP;
  if (!strip || strip.hidden) return 0;
  return strip.querySelectorAll('.sports-chip--match').length;
}

function syncWeatherCountToSports() {
  if (!isWideDesktopComfort() || !MASTHEAD_WEATHER) return;
  const want = weatherSportsParityCount();
  if (want < 3) return;
  const byWidth = Math.max(2, Math.min(12, Math.floor(weatherBoardAvailWidth() / 170)));
  const target = Math.min(want, byWidth);
  const ceiling = mastheadWeatherFitCount == null
    ? target
    : Math.min(target, mastheadWeatherFitCount);
  if (mastheadWeatherLastBoardCount === ceiling) {
    fitWideWeatherSecondarySlots();
    return;
  }
  mastheadWeatherFitCount = ceiling;
  mastheadWeatherLastBoardCount = 0;
  showMastheadWeatherBoard();
}

/**
 * Wide : nombre de cartes CTA (1–3) selon largeur + taille du pool.
 * Plusieurs CTAs = matchs / accroches **distincts** (pas la même info).
 */
function isWideDualSportsCta() {
  try {
    return isWideDesktopComfort() && window.matchMedia('(min-width: 1921px)').matches;
  } catch {
    return false;
  }
}

function isWideTripleSportsCta() {
  try {
    return isWideDesktopComfort() && window.matchMedia('(min-width: 3440px)').matches;
  } catch {
    return false;
  }
}

function sportsWideCtaCount(boardCount = 0) {
  if (typeof isWideNoMarqueeMode !== 'function' || !isWideNoMarqueeMode()) return 1;
  const poolN = Math.max(
    sportsCtaCandidateSlides()?.length || 0,
    sportsCtaLabelPool()?.length || 0,
  );
  // ≥3440 : 3 CTA. >1920 : 2. ≤1920 : 1, gabarit 1280.
  if (isWideDesktopComfort()) {
    let want = 1;
    if (isWideTripleSportsCta() && poolN >= 3) want = 3;
    else if (isWideDualSportsCta() && poolN >= 2) want = 2;
    const cap = boardCount > 0 ? boardCount : 11;
    return Math.max(1, Math.min(want, poolN || 1, cap));
  }
  const avail = sportsStripAvailWidth();
  let want = 1;
  if (avail >= 2000 && poolN >= 3) want = 3;
  else if (avail >= 1300 && poolN >= 2) want = 2;
  // Ne pas dépasser le board ni le pool (au moins 1)
  const cap = boardCount > 0 ? boardCount : 9;
  return Math.max(1, Math.min(want, poolN || 1, cap));
}

/**
 * Focus-group le-radar-sports-weather-fit A :
 * Plafond sports = largeur seule (max 3 scores + CTA). Météo indépendante.
 * Wide : place pour 2–3 CTAs + scores autour.
 */
function sportsBoardCountBase() {
  const avail = sportsStripAvailWidth();
  const wide = isWideNoMarqueeMode();
  const comfort = isWideDesktopComfort();
  const gap = 6;
  // ≥1440 : CTA gabarit 900/1280 ; scores plus larges (pas de troncature).
  // Wide étroit : slots flex égaux, plus de puces.
  const minScore = comfort ? 200 : (wide ? 120 : 128);
  const minCta = comfort ? 424 : (wide ? 140 : 152);
  let maxN = 4;
  if (comfort) {
    // Remplir le bandeau : 3 CTA dès 3440, 2 dès 1920.
    if (avail >= 3000) maxN = 13;
    else if (avail >= 2200) maxN = 11;
    else if (avail >= 1700) maxN = 9;
    else maxN = 7;
  } else if (wide) {
    if (avail >= 2200) maxN = 11;
    else if (avail >= 1800) maxN = 9;
    else if (avail >= 1400) maxN = 7;
    else maxN = 5;
  }

  // Estimer le nb de CTA pour le budget largeur
  const roughCta = comfort
    ? (isWideTripleSportsCta() ? 3 : (isWideDualSportsCta() ? 2 : 1))
    : (wide
      ? (avail >= 2000 ? 3 : avail >= 1300 ? 2 : 1)
      : 1);

  let n = 1;
  for (let tryN = maxN; tryN >= 2; tryN -= 1) {
    const ctaN = wide ? Math.min(roughCta, tryN) : 1;
    const scores = Math.max(0, tryN - ctaN);
    const need = scores * minScore + ctaN * minCta + gap * (tryN - 1);
    if (avail >= need) {
      n = tryN;
      break;
    }
  }
  // Wide 1 CTA historique : totaux impairs pour équilibre L/R.
  // Multi-CTA : pas d’obligation d’impair (cluster CTA au centre).
  if (wide && roughCta <= 1 && n >= 4 && n % 2 === 0) {
    const up = n + 1;
    const scoresUp = up - 1;
    const needUp = scoresUp * minScore + minCta + gap * (up - 1);
    if (avail >= needUp && up <= maxN) n = up;
    else n = Math.max(3, n - 1);
  }
  return n;
}


/**
 * Nombre de chips cible : largeur × fit post-paint (overflow texte = −1).
 * Jamais de plafond météo (A). On descend 4 → 3 → 2 → 1 (CTA seule).
 */
function sportsBoardCount() {
  const base = sportsBoardCountBase();
  return sportsFitCount === null ? base : Math.min(base, sportsFitCount);
}

/**
 * CTA « Au tableau » épinglée à droite dès qu’il y a 2+ chips.
 * À 1 chip : CTA seule (plus d’alternance score ↔ CTA).
 */
function sportsCtaPinned() {
  return sportsBoardCount() >= 2;
}

/**
 * True si une puce **score** a titre ou sous-ligne qui déborde
 * (focus-group A : overflow → retirer une puce, jamais marquee scores).
 */
function sportsMatchChipTextOverflows(chip) {
  if (!chip || chip.classList.contains('sports-chip--cta')) return false;
  const viewport = chip.querySelector('.sports-chip__line');
  const inner = chip.querySelector('.sports-chip__line-inner');
  if (viewport && inner && sportsMeasureOverflow(viewport, inner, false) > 1) {
    return true;
  }
  const subView = chip.querySelector('.sports-chip__sub');
  const subInner = chip.querySelector('.sports-chip__sub-text');
  return !!(subView && subInner && sportsMeasureOverflow(subView, subInner, false) > 1);
}

/** CTA : titre ou sous-ligne trop long pour la largeur peinte (wide = −1 carte). */
function sportsCtaTextOverflows(chip) {
  if (!chip?.classList?.contains('sports-chip--cta')) return false;
  const layer = typeof sportsCtaActiveLabel === 'function'
    ? sportsCtaActiveLabel(chip)
    : chip;
  const titleView = layer?.querySelector?.('.sports-chip__cta-line')
    || chip.querySelector('.sports-chip__cta-line');
  const titleInner = layer?.querySelector?.('.sports-chip__cta-text')
    || chip.querySelector('.sports-chip__cta-text');
  if (titleView && titleInner && sportsMeasureOverflow(titleView, titleInner, false) > 1) {
    return true;
  }
  const subView = layer?.querySelector?.('.sports-chip__cta-sub')
    || chip.querySelector('.sports-chip__cta-sub');
  const subInner = layer?.querySelector?.('.sports-chip__cta-sub-text')
    || chip.querySelector('.sports-chip__cta-sub-text');
  return !!(subView && subInner && sportsMeasureOverflow(subView, subInner, false) > 1);
}

/**
 * Le bandeau est-il trop étroit / texte illisible pour les chips peints ?
 * - CTA écrasée (tag) ou texte CTA overflow → −1 score
 * - Puce score trop étroite OU titre/sous-ligne overflow → −1 score
 * Wide : **jamais** marquee ni clip — on retire une carte tant que le texte
 * ne tient pas en entier (design inchangé, juste moins de puces).
 */
function sportsStripCramped() {
  const strip = MASTHEAD_SPORTS_STRIP;
  if (!strip || strip.hidden) return false;
  const chips = [...strip.querySelectorAll('.sports-chip')];
  if (chips.length <= 1) return false;

  const wide = isWideNoMarqueeMode();
  const comfort = isWideDesktopComfort();
  const minScore = comfort ? 0 : (wide ? 100 : 118);
  const minCta = comfort ? 400 : (wide ? 120 : 148);

  const cta = strip.querySelector('.sports-chip--cta');
  if (!cta) return true;
  if (!comfort && cta.clientWidth + 0.5 < minCta) return true;
  if (!wide) {
    const tag = cta.querySelector('.sports-chip__cta-tag');
    if (tag && tag.scrollWidth > tag.clientWidth + 1) return true;
  }

  if (comfort) {
    // Ne pas utiliser strip.scrollWidth : le texte marquee de la CTA l’enfle.
    for (const chip of chips) {
      if (chip.classList.contains('sports-chip--cta')) continue;
      if (sportsMatchChipTextOverflows(chip)) return true;
    }
    const gap = 6;
    const used = chips.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0)
      + gap * Math.max(0, chips.length - 1);
    return used > sportsStripAvailWidth() + 2;
  }

  for (const chip of chips) {
    if (chip.classList.contains('sports-chip--cta')) continue;
    if (chip.clientWidth + 0.5 < minScore) return true;
    if (!wide && sportsMatchChipTextOverflows(chip)) return true;
  }
  return false;
}

/** Wide : purge toute classe marquee sports (sécurité après paint / rotation). */
function clearWideSportsMarqueeClasses() {
  if (!isWideNoMarqueeMode() || !MASTHEAD_SPORTS_STRIP) return;
  // ≥1440 : marquee L→R autorisé si un peu de texte reste masqué.
  if (isWideDesktopComfort()) return;
  MASTHEAD_SPORTS_STRIP.querySelectorAll('.is-overflowing, .is-sub-overflowing').forEach((el) => {
    el.classList.remove('is-overflowing', 'is-sub-overflowing');
    el.style.removeProperty('--sports-scroll');
    el.style.removeProperty('--sports-scroll-sub');
  });
}

function sportsMatchNaturalWidth(chip) {
  if (!chip) return 0;
  const prev = {
    width: chip.style.width,
    minWidth: chip.style.minWidth,
    maxWidth: chip.style.maxWidth,
    flex: chip.style.flex,
  };
  chip.style.width = 'max-content';
  chip.style.minWidth = 'max-content';
  chip.style.maxWidth = 'none';
  chip.style.flex = '0 0 auto';
  const w = Math.ceil(chip.getBoundingClientRect().width);
  chip.style.width = prev.width;
  chip.style.minWidth = prev.minWidth;
  chip.style.maxWidth = prev.maxWidth;
  chip.style.flex = prev.flex;
  return w;
}

/** ≥1440 : scores à la largeur du plus long nom ; le reliquat remplit les bouts. */
function fitWideSportsMatchSlots({ fill = false } = {}) {
  if (!isWideDesktopComfort() || !MASTHEAD_SPORTS_STRIP) return;
  const strip = MASTHEAD_SPORTS_STRIP;
  const matches = [...strip.querySelectorAll('.sports-chip--match')];
  const ctas = [...strip.querySelectorAll('.sports-chip--cta')];
  if (!matches.length) {
    strip.style.removeProperty('--sports-match-w');
    return;
  }
  let maxW = 0;
  matches.forEach((chip) => {
    chip.style.removeProperty('flex');
    chip.style.removeProperty('width');
    chip.style.removeProperty('min-width');
    chip.style.removeProperty('max-width');
    maxW = Math.max(maxW, sportsMatchNaturalWidth(chip));
  });
  if (maxW <= 0) return;
  let slotW = maxW;
  if (fill) {
    const gap = 6;
    const ctaW = ctas.reduce((sum, el) => sum + Math.ceil(el.getBoundingClientRect().width), 0);
    const n = matches.length + ctas.length;
    const room = sportsStripAvailWidth() - ctaW - gap * Math.max(0, n - 1);
    if (room > 0) {
      slotW = Math.max(maxW, Math.floor(room / matches.length));
    }
  }
  strip.style.setProperty('--sports-match-w', `${slotW}px`);
  matches.forEach((chip) => {
    chip.style.setProperty('flex', `0 0 ${slotW}px`, 'important');
    chip.style.setProperty('width', `${slotW}px`, 'important');
    chip.style.setProperty('min-width', `${slotW}px`, 'important');
    chip.style.setProperty('max-width', `${slotW}px`, 'important');
  });
}

/**
 * Après paint : retirer une carte score si étroit ou texte overflow,
 * jusqu’à CTA seule. Max 3 passes (focus-group A) ; 5 en wide (plafond plus haut).
 */
function fitSportsStripAfterPaint() {
  if (!MASTHEAD_SPORTS_STRIP || MASTHEAD_SPORTS_STRIP.hidden) return;
  // Wide : d’abord couper tout marquee résiduel, puis fit par −1 carte.
  clearWideSportsMarqueeClasses();
  fitWideSportsMatchSlots({ fill: false });
  const count = sportsVisible.length;
  if (count <= 1) {
    fitWideSportsMatchSlots({ fill: true });
    refreshSportsChipScroll();
    syncWeatherCountToSports();
    return;
  }
  if (!sportsStripCramped()) {
    fitWideSportsMatchSlots({ fill: true });
    refreshSportsChipScroll();
    syncWeatherCountToSports();
    return;
  }
  const wide = isWideNoMarqueeMode();
  const comfort = isWideDesktopComfort();
  const maxPasses = wide ? 6 : 3;
  if (sportsFitDepth >= maxPasses) {
    fitWideSportsMatchSlots({ fill: true });
    syncWeatherCountToSports();
    return;
  }
  sportsFitDepth += 1;
  // Wide étroit : totaux impairs (CTA centrée). ≥1440 : juste −1 (garder le remplissage).
  let next = count - 1;
  if (!comfort && wide && next >= 4 && next % 2 === 0) next -= 1;
  sportsFitCount = Math.max(1, next);
  try {
    renderSportsStrip();
  } finally {
    sportsFitDepth = Math.max(0, sportsFitDepth - 1);
  }
}

/** Remplacement pour le mode mobile (1 slot) — respecte la voie de gauche. */
function sportsRandomResultSlide(usedKeys) {
  return nextSportsSlide(usedKeys, { avoidSport: '' });
}

/**
 * Codes / écoles hors focus LE-RADAR (RSEQ invitees hors Québec, etc.).
 * On garde les matchs QC ↔ Ottawa vus **depuis** l’équipe québécoise
 * (« UdeM reçoit uOttawa »), pas le point de vue « uOttawa à UdeM ».
 */
const SPORTS_OUT_OF_PROVINCE_CODES = new Set([
  'OTT', // University of Ottawa
  'CAR', // Carleton
  'DAL', // Dalhousie
  'UNB', // New Brunswick
  'CMR', // Collège militaire royal (Kingston)
]);

/**
 * Équipe « nôtre » pour le mât : campus / cégep du Québec seulement.
 * province=QC si présent ; sinon denylist codes + heuristique de nom.
 */
function sportsTeamIsQuebecFocus(team) {
  if (!team) return false;
  if (team.province) return team.province === 'QC';
  const code = String(team.code || '').toUpperCase();
  if (SPORTS_OUT_OF_PROVINCE_CODES.has(code)) return false;
  const blob = `${team.fullName || ''} ${team.name || ''} ${team.school || ''} ${team.institution || ''}`;
  if (/University of Ottawa|Carleton University|Dalhousie|University of New Brunswick|Royal Military College/i.test(blob)) {
    return false;
  }
  return true;
}

/**
 * Construit le pool de slides mât :
 *  - tous les résultats passés (lastGame)
 *  - tous les matchs à venir (nextGame)
 * Les puces de GAUCHE n’utilisent que les résultats en saison ;
 * hors saison elles basculent sur next + infos (voir sportsLeftLaneState).
 * La CTA (droite) continue de piocher via sportsCtaCandidateSlides.
 */
function buildSportsSlides(data) {
  const teams = Object.values(data?.teams || {});
  if (!teams.length) return [];
  const now = Date.now();

  // Focus Québec : pas de puces « uOttawa reçoit… » ; l’inverse (QC vs OTT)
  // reste via l’équipe québécoise. Voile : hors QC. Clubs watchlist : hors strip.
  const eligible = teams.filter((team) => {
    if (!sportsTeamIsQuebecFocus(team)) return false;
    if (team.sport === 'sailing') {
      if (team.province && team.province !== 'QC') return false;
      if (team.status === 'club' || team.status === 'upcoming') return false;
      if (team.source === 'sailing-watchlist') return false;
    }
    return true;
  });

  const results = [];
  const nexts = [];
  for (const team of eligible) {
    const r = sportsResultSlide(team, now);
    if (r) results.push(r);
    const n = sportsNextSlide(team, now);
    if (n) nexts.push(n);
  }

  // Résultats : plus récents d’abord (fraîcheur d’affichage).
  results.sort((a, b) => {
    const ma = sportsGameMs(a.game) || 0;
    const mb = sportsGameMs(b.game) || 0;
    if (mb !== ma) return mb - ma;
    return sportsEditorialRank(a.team) - sportsEditorialRank(b.team);
  });
  // À venir : plus proches d’abord.
  nexts.sort((a, b) => {
    const ma = sportsGameMs(a.game) || Number.POSITIVE_INFINITY;
    const mb = sportsGameMs(b.game) || Number.POSITIVE_INFINITY;
    if (ma !== mb) return ma - mb;
    return sportsEditorialRank(a.team) - sportsEditorialRank(b.team);
  });

  return [...results, ...nexts].map((slide) => {
    slide.tone = sportsSlideTone(slide);
    return slide;
  });
}

/** Résultats passés triés (plus récent → plus vieux). */
function sportsResultSlidesSorted() {
  return sportsSlides
    .filter((s) => s && s.mode === 'result')
    .slice()
    .sort((a, b) => (sportsGameMs(b.game) || 0) - (sportsGameMs(a.game) || 0));
}

/** Matchs à venir triés (plus proche → plus loin). */
function sportsNextSlidesSorted() {
  const now = Date.now();
  return sportsSlides
    .filter((s) => s && s.mode === 'next')
    .filter((s) => {
      const ms = sportsGameMs(s.game);
      return Number.isFinite(ms) && ms >= now - SPORTS_LIVE_AFTER_MS;
    })
    .slice()
    .sort((a, b) => (sportsGameMs(a.game) || 0) - (sportsGameMs(b.game) || 0));
}

/**
 * État de la voie de gauche :
 *  - « results » : saison active (résultats passés + activité CTA chaude)
 *    → uniquement résultats, ordre fraîcheur desc.
 *  - « offseason » : creux (pas de résultats chauds)
 *    → matchs à venir par proximité, **sans** puces grises « Hors saison… »
 *      (celles-ci n’apparaissaient qu’en filet total — voir CTA idle).
 */
function sportsLeftLaneState() {
  const results = sportsResultSlidesSorted();
  const nexts = sportsNextSlidesSorted();
  const now = Date.now();
  // Focus-group le-radar-sports-left-pool (gate D + exclude priorSeason) :
  // résultats < 7 j seulement ; jamais le musée lastGame via « CTA chaude ».
  const recentResults = results.filter((s) => {
    if (s?.game?.priorSeason || s?.team?.lastGamePriorSeason) return false;
    const age = sportsResultAgeMs(s.game, now);
    return Number.isFinite(age) && age >= 0 && age <= SPORTS_RECENT_RESULT_MS;
  });
  // « Chaud » = score récent ou prochain ≤ 14 j (détection saison / appoint).
  let hasHot = recentResults.length > 0;
  if (!hasHot) {
    try {
      for (const s of nexts) {
        const ms = sportsGameMs(s.game);
        if (Number.isFinite(ms) && ms >= now - SPORTS_LIVE_AFTER_MS
          && ms <= now + SPORTS_CTA_UPCOMING_MS) {
          hasHot = true;
          break;
        }
      }
    } catch { /* ignore */ }
  }

  if (recentResults.length) {
    // Résultats chauds d’abord, calendrier en appoint pour remplir 3 puces.
    const seen = new Set(recentResults.map((s) => s.key));
    const pool = recentResults.concat(nexts.filter((s) => !seen.has(s.key)));
    return { kind: 'results', pool };
  }
  // Hors saison / creux : calendrier à venir seulement (pas de musée d’avril).
  // Filet ultime : un seul plus récent lastGame si vraiment zéro next.
  if (nexts.length) return { kind: 'offseason', pool: nexts };
  const staleFilet = results.slice(0, 1);
  return { kind: 'offseason', pool: staleFilet };
}

/**
 * Accroche info — **désactivée dans la voie de gauche** (conservée pour
 * tests / repli extrême si un appel force encore mode info).
 * Les messages creux vivent uniquement sur la CTA rouge.
 */
function sportsInfoSlide(index = 0) {
  const labels = SPORTS_CTA_IDLE_LABELS;
  const idx = ((index % labels.length) + labels.length) % labels.length;
  return {
    mode: 'info',
    key: `info:${idx}:${index}`,
    label: labels[idx],
    labelIndex: idx,
    tone: '#5a6570',
    team: { sport: 'board', name: 'Info', code: 'QC' },
    game: { sport: 'board' },
  };
}

function formatSportsWhen(iso, time) {
  if (!iso) return '';
  let label = iso;
  try {
    label = new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short' })
      .format(new Date(`${iso}T12:00:00`));
  } catch { /* keep iso */ }
  if (time) label += ` · ${String(time).replace(':', ' h ')}`;
  return label;
}

/** Lien diffusion RSEQ (match joué, à venir, ou page ligue en repli). */
function sportsGameHref(slide) {
  const g = slide?.game || {};
  if (g.url && /^https?:\/\//i.test(g.url)) return g.url;
  if (g.gameId) {
    return `https://diffusion.rseq.ca/Default.aspx?Type=Game&GameId=${encodeURIComponent(g.gameId)}`;
  }
  const leagueId = slide?.team?.leagueId;
  if (leagueId) {
    return `https://diffusion.rseq.ca/?Type=League&LeagueId=${encodeURIComponent(leagueId)}`;
  }
  return 'https://www.rseq-stats.ca/';
}

/**
 * Page SEO « Au tableau » — sport + équipe (deep-link).
 * sports-board.js filtre le sport, ouvre la section, surbrille et scroll
 * jusqu’à la carte formation (parité sélection d’une station radio).
 */
function sportsBoardHref(slide) {
  const base = new URL('sports/', window.location.href).pathname;
  // CTA avec match en accroche : deep-link vers ce match / sport.
  if (slide?.mode === 'cta') {
    const from = slide.ctaFrom;
    if (from?.team || from?.game) {
      const sport = String(from.game?.sport || from.team?.sport || '').toLowerCase();
      const teamId = String(from.team?.id || '').trim();
      const params = new URLSearchParams();
      if (sport) params.set('sport', sport);
      if (teamId) params.set('team', teamId);
      const q = params.toString();
      return q ? `${base}?${q}` : base;
    }
    return base;
  }
  const sport = String(slide?.game?.sport || slide?.team?.sport || '').toLowerCase();
  const teamId = String(slide?.team?.id || '').trim();
  const params = new URLSearchParams();
  if (sport) params.set('sport', sport);
  if (teamId) params.set('team', teamId);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

/**
 * Nouvel onglet pour les liens « Au tableau » / puces sports.
 * Même règle que les articles du fil : ne pas décharger la page où la radio joue
 * (sinon le flux et la synchro lecteurs se coupent).
 */
function markSportsBoardLink(a) {
  if (!a || a.tagName !== 'A') return a;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/**
 * Meilleure carte (déjà triée : urgence / fraîcheur) par sport.
 * Sert à la diversité des chips scores (pas la CTA).
 */
function sportsBestSlidesBySport() {
  const map = new Map();
  for (const s of sportsSlides) {
    if (!s || s.mode === 'cta') continue;
    const sp = String(s.team?.sport || s.game?.sport || '').toLowerCase();
    if (!sp || map.has(sp)) continue;
    map.set(sp, s);
  }
  return map;
}

/** Sports triés par popularité QC, puis le reste alpha. */
function sportsOrderedKeys(bestMap) {
  const keys = [...bestMap.keys()];
  const rank = (sp) => {
    const i = SPORTS_POPULARITY.indexOf(sp);
    return i < 0 ? 100 + sp.localeCompare('') : i;
  };
  return keys.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'fr'));
}

/**
 * Suffixes de couleur d’équipe (CNDF rugby F Bleu/Jaune, etc.) — **ne jamais
 * retirer** : ce n’est pas un ornement, c’est l’identité de la formation.
 */
const SPORTS_TEAM_COLOR_SUFFIX_RE = /\s+(Bleu(?:e)?|Jaune|Noir(?:e)?|Blanc(?:he)?|Rouge|Vert(?:e)?|Or)\s*$/i;

/**
 * Abréviations cryptiques issues du flux RSEQ / vieux registre — élargies à
 * l’affichage même si sports.json n’a pas encore été re-sync.
 */
const SPORTS_CRYPTIC_SHORT_EXPAND = {
  'Ch.-St-Lambert': 'Champlain St-Lambert',
  'Ch.-Lennoxville': 'Champlain Lennoxville',
  'Ch.-St-Lawrence': 'Champlain St-Lawrence',
  'Abitibi-Témisc.': 'Abitibi-Témiscamingue',
  'Ch. Saint-Lambert': 'Champlain St-Lambert',
  'Ch. St-Lambert': 'Champlain St-Lambert',
  'Ch. Lennoxville': 'Champlain Lennoxville',
  'Ch. St-Lawrence': 'Champlain St-Lawrence',
};

/**
 * Accronymes univ. (ULaval, UdeM…) — table `institution-acronyms-data.js`
 * déjà chargée sur l’accueil. Repli codes RSEQ si la table manque.
 */
/**
 * Codes RSEQ **universitaires** seulement → acronyme.
 * SHE = Cégep de Sherbrooke (collégial) — **jamais** UdeS (c’est USHE).
 */
const SPORTS_UNI_CODE_ACRONYM = {
  LAV: 'ULaval',
  MTL: 'UdeM',
  MCG: 'McGill',
  UCON: 'Concordia',
  CON: 'Concordia',
  USHE: 'UdeS',
  UQAM: 'UQAM',
  UQTR: 'UQTR',
  UQAC: 'UQAC',
  UQO: 'UQO',
  UQAR: 'UQAR',
  UQAT: 'UQAT',
  ETS: 'ÉTS',
  ÉTS: 'ÉTS',
  BIS: "Bishop's",
  OTT: 'uOttawa',
  POLY: 'Poly',
  HEC: 'HEC',
  CAR: 'Carleton',
  DAL: 'Dalhousie',
  UNB: 'UNB',
  CMR: 'CMR',
};

/** Codes collégiaux qui ne doivent **jamais** recevoir un acronyme univ. */
const SPORTS_COLLEGIAL_CODES = new Set([
  'SHE', // Cégep de Sherbrooke — pas USHE / UdeS
  'SLA', 'LEN', 'SLC', 'LAF', 'NDF', 'NDFB', 'NDFJ', 'CLG', 'GAR', 'LIM',
  'VAN', 'DAW', 'JAC', 'CVM', 'AHU', 'OUT', 'CSF', 'TRV', 'VIC', 'STH',
  'RIM', 'CHI', 'CAT', // Rimouski / Chicoutimi / Abitibi — pas UQAR / UQAC / UQAT
]);

/**
 * Toponymes collégiaux **ambigus** avec une univ. (réseau UQ / UdeS).
 * Short = nom de ville seul → le lecteur croit à l’université (ex. « Trois-Rivières »
 * pour UQTR). Puces + CTA : préfixe « Cégep … » compact (marquee si long).
 * Clé = code RSEQ collégial.
 */
const SPORTS_COLLEGIAL_CITY_DISAMBIG = {
  TRV: 'Cégep Trois-Rivières', // ≠ UQTR
  RIM: 'Cégep Rimouski', // ≠ UQAR
  CHI: 'Cégep Chicoutimi', // ≠ UQAC
  OUT: 'Cégep Outaouais', // ≠ UQO
  SHE: 'Cégep Sherbrooke', // ≠ UdeS (USHE)
  CAT: "Cégep Abitibi-Témiscamingue", // ≠ UQAT
};

/** Shorts collégiaux (sans code) qui collident avec une ville d’université. */
const SPORTS_COLLEGIAL_CITY_SHORT_DISAMBIG = {
  'trois-rivieres': 'Cégep Trois-Rivières',
  'trois-rivières': 'Cégep Trois-Rivières',
  rimouski: 'Cégep Rimouski',
  chicoutimi: 'Cégep Chicoutimi',
  outaouais: 'Cégep Outaouais',
  sherbrooke: 'Cégep Sherbrooke', // seulement si collégial déjà établi
  'abitibi-temiscamingue': "Cégep Abitibi-Témiscamingue",
  'abitibi-témiscamingue': "Cégep Abitibi-Témiscamingue",
};

/**
 * Libellé collégial désambiguïsé, ou '' si non applicable.
 * Ne s’applique **jamais** au secteur universitaire (UQTR reste UQTR).
 */
function sportsCollegialCityDisambig({ shortName, fullName, code, sector } = {}) {
  if (!sportsLooksCollegial({ fullName, shortName, sector, code })) return '';
  const c = String(code || '').toUpperCase();
  if (SPORTS_COLLEGIAL_CITY_DISAMBIG[c]) return SPORTS_COLLEGIAL_CITY_DISAMBIG[c];
  const short = String(shortName || '').trim();
  if (!short || /^C[eé]gep\b/i.test(short)) return '';
  const key = short
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/\s+/g, '-');
  if (SPORTS_COLLEGIAL_CITY_SHORT_DISAMBIG[key]) {
    return SPORTS_COLLEGIAL_CITY_SHORT_DISAMBIG[key];
  }
  // fullName « Cégep de X » + short = X (ou proche) pour villes UQ.
  const full = String(fullName || '');
  const m = full.match(/^C[eé]gep\s+(?:de\s+(?:l['’]\s*)?)?(.+)$/i);
  if (m && /Trois-Rivi|Rimouski|Chicoutimi|Outaouais|Sherbrooke|Abitibi/i.test(m[1])) {
    const place = m[1].replace(/^l['’]\s*/i, '').trim();
    return place ? `Cégep ${place}` : '';
  }
  return '';
}

function sportsInstitutionAcronymMap() {
  try {
    return (typeof window !== 'undefined' && window.RadarInstitutionAcronyms) || {};
  } catch {
    return {};
  }
}

function sportsLookupInstitutionAcronym(...candidates) {
  const map = sportsInstitutionAcronymMap();
  for (const raw of candidates) {
    const k = String(raw || '').trim();
    if (!k) continue;
    if (map[k]) return String(map[k]);
    const bare = k.replace(/\s*\([^)]*\)\s*$/u, '').trim();
    if (bare && bare !== k && map[bare]) return String(map[bare]);
  }
  return '';
}

/** true si le fullName / code indique clairement le collégial. */
function sportsLooksCollegial({ fullName, shortName, sector, code } = {}) {
  if (String(sector || '').toLowerCase() === 'collegial') return true;
  const c = String(code || '').toUpperCase();
  if (SPORTS_COLLEGIAL_CODES.has(c)) return true;
  const f = `${fullName || ''} ${shortName || ''}`;
  // Cégep / Collège / Campus / Champlain College — pas « Université … »
  if (/C[eé]gep|Coll[eè]ge(?!\s+militaire)|Campus\s|Champlain\s+College/i.test(f)
    && !/Universit[eé]|University/i.test(f)) {
    return true;
  }
  return false;
}

/**
 * Université seulement si collégial exclu.
 * Ne pas déduire UdeS depuis le short « Sherbrooke » seul (ambigu SHE/USHE).
 */
function sportsLooksUniversity({ fullName, shortName, sector, code } = {}) {
  if (sportsLooksCollegial({ fullName, shortName, sector, code })) return false;
  if (String(sector || '').toLowerCase() === 'universitaire') return true;
  const f = String(fullName || '');
  if (/Universit[eé]|University/i.test(f)) return true;
  const c = String(code || '').toUpperCase();
  // Code univ. explicite seulement (USHE oui, SHE non)
  if (SPORTS_UNI_CODE_ACRONYM[c]) return true;
  // Acronyme table **seulement** si fullName d’université (pas short seul)
  if (f) {
    const ac = sportsLookupInstitutionAcronym(f);
    return !!(ac && /^(U|ÉTS|ETS|HEC|McGill|Concordia|Bishop|Poly|uOttawa)/i.test(ac));
  }
  return false;
}

/**
 * Nom d’établissement en clair — garde-fou `noms-lisibles`
 * (focus-group le-radar-sports-first-glance). CTA / tooltips : forme lisible.
 * **Jamais** de troncature `…` — marquee L→R si trop long.
 */
function sportsPlainTeamName(team) {
  return sportsDisplaySideName({
    shortName: team?.name,
    fullName: team?.fullName,
    code: team?.code,
    sector: team?.sector,
    fallback: 'Équipe',
    preferAcronym: false,
  });
}

function sportsPlainOpponentName(game) {
  return sportsDisplaySideName({
    shortName: game?.opponent,
    fullName: game?.opponentFullName,
    code: game?.opponentCode,
    fallback: 'adversaire',
    preferAcronym: false,
  });
}

/**
 * Libellé d’une face (équipe ou adversaire).
 * - Garde « Notre-Dame Bleu / Jaune ».
 * - `preferAcronym` (puces gauche) : univ → ULaval / UdeM / McGill…
 * - Sinon mono-token → fullName établissement (CTA plus aérée).
 */
function sportsDisplaySideName({
  shortName, fullName, code, sector, fallback = 'Équipe', preferAcronym = false,
} = {}) {
  let short = String(shortName || '').trim();
  let full = String(fullName || '').trim();
  const codeU = String(code || '').toUpperCase();

  // Déplier « Ch.-St-Lambert » → « Champlain St-Lambert » (etc.)
  if (short && SPORTS_CRYPTIC_SHORT_EXPAND[short]) {
    short = SPORTS_CRYPTIC_SHORT_EXPAND[short];
  }
  if (full && (full.startsWith('Cégep de Ch.') || full.includes('Témisc.') || full.includes('Ch.-'))) {
    if (codeU === 'SLC' || /St-?Lawrence/i.test(full) || /St-?Lawrence/i.test(short)) {
      full = 'Champlain College St. Lawrence';
    } else if (codeU === 'SLA' || /St-?Lambert/i.test(full) || /St-?Lambert/i.test(short)) {
      full = 'Champlain College Saint-Lambert';
    } else if (codeU === 'LEN' || /Lennoxville/i.test(full) || /Lennoxville/i.test(short)) {
      full = 'Champlain College Lennoxville';
    } else if (codeU === 'CAT' || /Abitibi/i.test(full)) {
      full = "Cégep de l'Abitibi-Témiscamingue";
    }
  }

  if (short && SPORTS_TEAM_COLOR_SUFFIX_RE.test(short)) return short;

  // Acronyme univ. **uniquement** si ce n’est pas du collégial (bloque UdeS pour SHE).
  if (
    preferAcronym
    && !sportsLooksCollegial({ fullName: full, shortName: short, sector, code: codeU })
    && sportsLooksUniversity({ fullName: full, shortName: short, sector, code: codeU })
  ) {
    // Préférer fullName pour la table d’acronymes ; code USHE en repli.
    // Ne pas passer le short « Sherbrooke » seul (collision cégep / univ).
    const ac = sportsLookupInstitutionAcronym(full)
      || SPORTS_UNI_CODE_ACRONYM[codeU]
      || '';
    if (ac) return ac;
    if (short && short.length <= 6 && /^[A-ZÉÙÛÂÊÎÔ0-9]{2,6}$/i.test(short)) return short;
  }

  // Ville seule = ambigu cégep vs univ (Trois-Rivières / UQTR, Rimouski / UQAR…).
  // Avant le return multi-parties « Trois-Rivières » (hyphen) qui court-circuitait le fullName.
  const cityDis = sportsCollegialCityDisambig({
    shortName: short, fullName: full, code: codeU, sector,
  });
  if (cityDis) {
    // CTA / tooltip : fullName officiel si déjà « Cégep … »
    if (!preferAcronym && full && /^C[eé]gep\b/i.test(full)) return full;
    return cityDis;
  }

  // Multi-parties déjà distinctives (Lionel-Groulx, Vieux Montréal…)
  if (short && /[\s-]/.test(short) && short.replace(/-/g, '').length >= 5) return short;

  // Mono-token : fullName si CTA ; sur puce étroite sans acronyme → short
  if (full && short && !/[\s-]/.test(short) && full.length > short.length) {
    if (preferAcronym) return short;
    return full;
  }
  if (short) return short;
  if (full) return full;
  return String(code || fallback).trim() || fallback;
}

/**
 * Nom d’équipe pour **puce gauche** (largeur restreinte) :
 * univ → acronyme ; collégial → short ; voile → sans suffixe « Sailing ».
 */
function sportsChipTeamShort(team) {
  let name = sportsDisplaySideName({
    shortName: team?.name,
    fullName: team?.fullName,
    code: team?.code,
    sector: team?.sector,
    preferAcronym: true,
    fallback: 'Équipe',
  });
  const sport = String(team?.sport || '').toLowerCase();
  if (sport === 'sailing' || sport === 'voile') {
    name = name.replace(/\s+(sailing|voile)\s*$/i, '').trim() || name;
  }
  return name;
}

/** Adversaire sur puce gauche — acronyme si université (jamais si cégep). */
function sportsChipOpponentLabel(game) {
  const full = String(game?.opponentFullName || '');
  const code = String(game?.opponentCode || '').toUpperCase();
  // Secteur implicite depuis fullName / code collégial connu
  let sector = '';
  if (sportsLooksCollegial({ fullName: full, shortName: game?.opponent, code })) {
    sector = 'collegial';
  } else if (sportsLooksUniversity({ fullName: full, shortName: game?.opponent, code })) {
    sector = 'universitaire';
  }
  return sportsDisplaySideName({
    shortName: game?.opponent,
    fullName: game?.opponentFullName,
    code: game?.opponentCode,
    sector,
    preferAcronym: sector === 'universitaire',
    fallback: 'adversaire',
  });
}

/** Événement / compétition pour place (régates) — texte entier, marquee si long. */
function sportsPlaceEventShort(game) {
  const comp = String(game?.competition || '').trim();
  if (comp) return comp;
  const opp = sportsPlainOpponentName(game);
  return opp;
}

/** Verbe de rencontre — domicile « reçoit », extérieur « à » (ton presse). */
function sportsMatchVerb(game, lang = 'fr') {
  if (game?.home === false) return lang === 'en' ? 'at' : 'à';
  return lang === 'en' ? 'hosts' : 'reçoit';
}

/** Domicile / extérieur — tooltip / sous-ligne optionnelle. */
function sportsVenueLabel(game, lang = 'fr') {
  if (game?.home === false) return lang === 'en' ? 'away' : 'extérieur';
  if (game?.home === true) return lang === 'en' ? 'home' : 'domicile';
  return '';
}

function sportsIsPlaceResult(game, sport) {
  return game?.scoreKind === 'place'
    || sport === 'sailing'
    || game?.sport === 'sailing';
}

/** Jour + date + heure, écrits pour être situés sans compter : « jeu. 20 août, 20 h 30 ». */
function sportsWhenLong(iso, time) {
  if (!iso) return '';
  let label = iso;
  try {
    label = new Intl.DateTimeFormat('fr-CA', {
      weekday: 'short', day: 'numeric', month: 'long',
    }).format(new Date(`${iso}T12:00:00`));
  } catch { /* keep iso */ }
  if (time) label += `, ${String(time).replace(':', ' h ')}`;
  return label;
}

/** Âge lisible d’un fait daté — « il y a 14 h », « hier », « il y a 3 j ». */
function sportsRelativeAge(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return '';
  const delta = Math.max(0, now - ms);
  const min = Math.round(delta / 60000);
  if (min < 2) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const hours = Math.round(delta / 3600000);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(delta / 86400000);
  return days <= 1 ? 'hier' : `il y a ${days} j`;
}

/** Échéance lisible — passé : « il y a 5 h » ; futur : « dans 3 h », « demain ». */
function sportsRelativeWhen(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return '';
  if (ms <= now) return sportsRelativeAge(ms, now);
  const min = Math.round((ms - now) / 60000);
  if (min < 2) return 'imminent';
  if (min < 60) return `dans ${min} min`;
  const hours = Math.round((ms - now) / 3600000);
  if (hours < 24) return `dans ${hours} h`;
  const days = Math.round((ms - now) / 86400000);
  if (days <= 1) return 'demain';
  return `dans ${days} j`;
}

/**
 * Horodatage de la banque, **rendu dans la carte** — garde-fou
 * `fraicheur-visible`. Il n’existait que dans `title`/`aria-label` : au doigt il
 * n’y a pas de survol, donc sur téléphone personne ne l’a jamais vu.
 */
function sportsUpdatedShort() {
  const raw = sportsData?.updated;
  if (!raw) return '';
  try {
    const when = new Intl.DateTimeFormat('fr-CA', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto',
    }).format(new Date(raw));
    return `mis à jour à ${when.replace(':', ' h ')}`;
  } catch {
    return '';
  }
}

/** Libellé de compétition, ou repli sport + secteur. */
function sportsCompetitionLabel(slide) {
  const comp = String(slide?.game?.competition || '').trim();
  if (comp) return comp;
  const sport = sportsSportLabelFr(slide?.team?.sport || slide?.game?.sport || '');
  const sector = slide?.team?.sector === 'universitaire' ? 'universitaire' : 'collégial';
  return sport ? `${sport} ${sector}` : '';
}

/**
 * Sous-ligne des puces scores (gauche) — parité CTA :
 * date/heure · compétition · [saison précédente].
 * La compétition (ex. « Hockey collégial masculin D2 ») est la même info
 * qu’à droite de la date sur la carte CTA (`sportsCtaSubLine`).
 */
function sportsMatchSubLine(slide) {
  const g = slide?.game || {};
  const when = formatSportsWhen(g.date, g.time);
  const prior = !!(g.priorSeason || slide?.team?.lastGamePriorSeason);
  const placeKind = sportsIsPlaceResult(g, slide?.team?.sport || g.sport);
  // Régate / place : l’événement de place prime (souvent = competition).
  const meta = placeKind
    ? (sportsPlaceEventShort(g) || sportsCompetitionLabel(slide))
    : sportsCompetitionLabel(slide);
  return [when, meta, prior ? 'Saison précédente' : ''].filter(Boolean).join(' · ');
}

/**
 * Accroche principale de la CTA — noms en clair, score lisible, sans sigle.
 * Le marqueur temporel vit à part (`sportsCtaEyebrow`) pour rester hors de la
 * zone qui défile (garde-fou `marqueur-non-tronque`).
 */
function sportsCtaLabelFromSlide(slide) {
  if (!slide?.team || !slide.game) return '';
  const g = slide.game;
  const glyph = sportsGlyph(slide.team.sport || g.sport);
  const home = sportsChipTeamShort(slide.team);
  const opp = sportsPlainOpponentName(g);

  if (slide.mode === 'next') {
    return `${glyph} ${home} ${sportsMatchVerb(g)} ${opp}`;
  }
  if (slide.mode === 'result') {
    const placeKind = sportsIsPlaceResult(g, slide.team.sport);
    const score = placeKind
      ? `${g.scoreFor}e/${g.scoreAgainst}`
      : `${g.scoreFor}–${g.scoreAgainst}`;
    return placeKind
      ? `${glyph} ${home} ${score}`
      : `${glyph} ${home} ${score} ${opp}`;
  }
  return `${glyph} ${home}`;
}

/**
 * Plus de marqueur à côté / au-dessus de la pastille : Prochain / Hier /
 * Aujourd’hui vivent **dans** la pastille (`sportsCtaTagLabel`).
 */
function sportsCtaEyebrow(_slide, _state) {
  return '';
}

/** Pastille d’un résultat : Aujourd’hui, Hier, Avant-hier, sinon date courte. */
function sportsCtaResultTag(src) {
  const day = sportsSlideDayKey(src);
  if (!day) return SPORTS_CTA_TAG;
  const today = torontoDayKey();
  if (day === today) return 'Aujourd’hui';
  if (day === sportsCivilDayShift(today, -1)) return 'Hier';
  if (day === sportsCivilDayShift(today, -2)) return 'Avant-hier';
  const iso = src?.game?.date || day;
  try {
    return new Intl.DateTimeFormat('fr-CA', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'America/Toronto',
    }).format(new Date(`${iso}T12:00:00`));
  } catch {
    return iso;
  }
}

/**
 * Pastille CTA : Prochain / En cours / Hier / Aujourd’hui / date.
 * « Sports » seulement en creux idle.
 */
function sportsCtaTagLabel(slide, state) {
  const st = state || sportsCtaState(slide);
  if (st === 'live') return SPORTS_CTA_TAG_LIVE;
  if (st === 'next') return 'Prochain';
  if (st === 'result') return sportsCtaResultTag(slide?.ctaFrom || slide);
  return SPORTS_CTA_TAG;
}

/** Couleur du voyant : live / today (rouge) · next (ambre) · past (vert). */
function sportsCtaLamp(slide, state) {
  const st = state || sportsCtaState(slide);
  if (st === 'live') return 'live';
  if (st === 'next') return 'next';
  if (st === 'result') {
    const src = slide?.ctaFrom || slide;
    const day = sportsSlideDayKey(src);
    if (day && day === torontoDayKey()) return 'today';
    return 'past';
  }
  return 'idle';
}

/**
 * Sous-ligne CTA : d’abord le relatif (« il y a 5 h », « dans 3 h »),
 * puis la compétition. La pastille porte déjà Hier / Prochain / la date :
 * on ne répète pas le même mot. Prochain lointain : relatif + jour/heure.
 */
function sportsCtaSubLine(slide, state) {
  const comp = sportsCompetitionLabel(slide);
  const g = slide?.game;
  const ms = sportsGameMs(g);
  const rel = sportsRelativeWhen(ms);
  const tag = sportsCtaTagLabel(slide, state);
  const relShown = rel && rel.toLowerCase() !== String(tag || '').toLowerCase();
  if (state === 'next') {
    const when = sportsWhenLong(g?.date, g?.time);
    const near = Number.isFinite(ms) && Math.abs(ms - Date.now()) < 36 * 3600 * 1000;
    if (near) return [relShown ? rel : '', comp].filter(Boolean).join(' · ');
    return [relShown ? rel : '', when, comp].filter(Boolean).join(' · ');
  }
  if (state === 'live' || state === 'result') {
    return [relShown ? rel : '', comp].filter(Boolean).join(' · ');
  }
  return [comp, sportsUpdatedShort()].filter(Boolean).join(' · ');
}

/**
 * Teinte lavis de la CTA : sport du match (ou résultat W/L), rouge live,
 * ardoise seulement en creux idle (pas de match à montrer).
 */
function sportsCtaTone(slide) {
  const state = slide?.ctaState || sportsCtaState(slide);
  if (state === 'live') return SPORTS_CTA_LIVE_TONE;
  const src = slide?.ctaFrom;
  if (src?.game || src?.team) return sportsSlideTone(src);
  if (slide?.tone && slide.tone !== SPORTS_CTA_REST_TONE) return slide.tone;
  return SPORTS_CTA_REST_TONE;
}

/**
 * Clé de dédup d’un match pour la CTA (focus-group le-radar-cta-sports-transition).
 * Priorité gameId ; sinon date + sport + paire d’équipes triée (miroir A↔B).
 */
function sportsMatchDedupeKey(slide) {
  const g = slide?.game || {};
  if (g.gameId != null && String(g.gameId).trim()) {
    return `gid:${String(g.gameId).trim()}`;
  }
  const sport = String(slide?.team?.sport || g.sport || '').toLowerCase();
  const a = String(slide?.team?.code || '').toUpperCase().slice(0, 4);
  const b = String(g.opponentCode || g.opponent || '').toUpperCase().slice(0, 4);
  const pair = [a, b].filter(Boolean).sort().join('|');
  return `pair:${g.date || ''}|${g.time || ''}|${sport}|${pair}`;
}

/**
 * Face éditoriale d’un match miroir : domicile → favori → rang éditorial.
 * (Un match = une accroche CTA.)
 */
function sportsPreferMatchFace(a, b) {
  if (!a) return b;
  if (!b) return a;
  let favSet = null;
  try {
    favSet = new Set(readSportsFavorites());
  } catch { favSet = new Set(); }
  const score = (s) => {
    let n = 0;
    if (s.game?.home === true) n += 100;
    if (s.game?.home === false) n -= 10;
    if (sportsIsFavorite(s.team, favSet)) n += 50;
    n += Math.max(0, 40 - sportsEditorialRank(s.team));
    return n;
  };
  return score(a) >= score(b) ? a : b;
}

/** Une entrée par match (gameId / paire) — garde la face préférée. */
function sportsDedupeMatchSlides(slides) {
  const map = new Map();
  for (const s of slides) {
    if (!s) continue;
    const key = sportsMatchDedupeKey(s);
    if (!key || key === 'pair:|||') {
      // Sans ancre de match : garder tel quel (clé slide).
      map.set(s.key || `solo:${map.size}`, s);
      continue;
    }
    map.set(key, sportsPreferMatchFace(map.get(key), s));
  }
  return [...map.values()];
}

/**
 * Clés d’occupation d’une slide (clé face + dédup match miroir).
 * Empêche « même match » à gauche et dans la CTA (faces QC opposées).
 */
function sportsSlideOccupyKeys(slide) {
  const keys = new Set();
  if (!slide) return keys;
  if (slide.mode === 'cta' && slide.ctaFrom) {
    if (slide.ctaFrom.key) keys.add(slide.ctaFrom.key);
    const dk = sportsMatchDedupeKey(slide.ctaFrom);
    if (dk && dk !== 'pair:|||') keys.add(dk);
    return keys;
  }
  if (slide.key) keys.add(slide.key);
  const dk = sportsMatchDedupeKey(slide);
  if (dk && dk !== 'pair:|||') keys.add(dk);
  return keys;
}

/** true si la slide est déjà représentée (même face ou miroir) dans `used`. */
function sportsSlideIsUsed(slide, used) {
  if (!slide || !used?.size) return false;
  for (const k of sportsSlideOccupyKeys(slide)) {
    if (used.has(k)) return true;
  }
  return false;
}

/** Union des clés occupées par les slots visibles (sauf exceptSlot). */
function sportsVisibleOccupyKeys(exceptSlot = null) {
  const used = new Set();
  sportsVisible.forEach((s, i) => {
    if (exceptSlot != null && i === exceptSlot) return;
    for (const k of sportsSlideOccupyKeys(s)) used.add(k);
  });
  return used;
}

/**
 * Diversité sport souple après ordre chrono : évite 2× le même sport d’affilée
 * si une alternative existe dans les ~4 prochains slots — sans enterrer le
 * match le plus proche (verdict D, soft vs pure round-robin).
 */
function sportsSoftSportDiversity(slides) {
  if (!Array.isArray(slides) || slides.length < 3) return slides || [];
  const arr = slides.slice();
  const sportOf = (s) => String(s?.team?.sport || s?.game?.sport || '').toLowerCase();
  for (let i = 0; i < arr.length - 1; i += 1) {
    if (sportOf(arr[i]) !== sportOf(arr[i + 1])) continue;
    const same = sportOf(arr[i]);
    let swapAt = -1;
    for (let j = i + 2; j < Math.min(arr.length, i + 5); j += 1) {
      if (sportOf(arr[j]) && sportOf(arr[j]) !== same) {
        swapAt = j;
        break;
      }
    }
    if (swapAt > 0) {
      const [item] = arr.splice(swapAt, 1);
      arr.splice(i + 1, 0, item);
    }
  }
  return arr;
}

/**
 * Partage des rôles bandeau — focus-group `le-radar-cta-sports-window` F
 * + gates mainteneur (civil aujourd’hui/hier ; hors saison 7 j) :
 *
 *  CTA (droite)
 *   • **résultats** : aujourd’hui / hier (pastilles) + autres &lt; 7 j (Sports)
 *   • **en saison** (il y a des résultats frais) : prochains du **jour lead** seul
 *   • **hors saison** (pas de résultat aujourd’hui/hier) : **1er match** de
 *     chacun des **7 premiers jours** d’action à partir du jour lead, en
 *     alternance (rotation CTA) — pas un seul match pendant des jours
 *   • dédup miroir + diversité sport souple ; plafond SPORTS_CTA_MAX_POOL
 *
 *  CARTES GAUCHE — le-radar-sports-left-pool D
 *   • Résultats &lt; 7 j + next appoint ; hors saison : prochains
 */
/** Jour civil America/Toronto d’une slide match (YYYY-MM-DD). */
function sportsSlideDayKey(slide) {
  const ms = sportsGameMs(slide?.game);
  if (Number.isFinite(ms)) return torontoDayKey(ms);
  const d = String(slide?.game?.date || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
}

/**
 * Jour lead CTA : premier jour civil (Toronto) qui a encore un match à venir
 * (ou en fenêtre live). Vide s’il n’y a aucun prochain en grille.
 */
function sportsCtaLeadDayKey(nextSlides = []) {
  if (!nextSlides.length) return '';
  let bestMs = Number.POSITIVE_INFINITY;
  let bestDay = '';
  for (const s of nextSlides) {
    const ms = sportsGameMs(s.game);
    if (!Number.isFinite(ms) || ms >= bestMs) continue;
    const day = sportsSlideDayKey(s);
    if (!day) continue;
    bestMs = ms;
    bestDay = day;
  }
  return bestDay;
}

function sportsCtaCandidateSlides() {
  const now = Date.now();
  const freshResults = [];
  const nexts = [];
  const seen = new Set();

  for (const s of sportsSlides) {
    if (!s || s.mode === 'cta' || !s.game || !s.key || seen.has(s.key)) continue;
    seen.add(s.key);

    if (s.mode === 'result') {
      if (!sportsCtaResultIsRecent(s.game, now)) continue;
      freshResults.push(s);
      continue;
    }

    if (s.mode === 'next') {
      const ms = sportsGameMs(s.game);
      if (!Number.isFinite(ms)) continue;
      // Prochains passés mal classés → ignorer (sauf fenêtre live encore ouverte).
      if (ms < now - SPORTS_LIVE_AFTER_MS) continue;
      nexts.push(s);
    }
  }

  const sportRank = (slide) => {
    const sp = String(slide.team?.sport || slide.game?.sport || '').toLowerCase();
    const i = SPORTS_POPULARITY.indexOf(sp);
    return i < 0 ? 99 : i;
  };

  // Résultats frais : plus récent d’abord.
  freshResults.sort((a, b) => {
    const fa = sportsGameMs(a.game) || 0;
    const fb = sportsGameMs(b.game) || 0;
    if (fb !== fa) return fb - fa;
    return sportRank(a) - sportRank(b);
  });

  // À venir : plus proche d’abord ; même jour = ordre horaire.
  const bySoonest = (a, b) => {
    const fa = sportsGameMs(a.game) || Number.POSITIVE_INFINITY;
    const fb = sportsGameMs(b.game) || Number.POSITIVE_INFINITY;
    if (fa !== fb) return fa - fb;
    return sportRank(a) - sportRank(b);
  };
  nexts.sort(bySoonest);

  // Journée lead = jour civil du prochain match encore à venir (ou live).
  const leadDay = sportsCtaLeadDayKey(nexts);
  const leadDayNexts = leadDay
    ? nexts.filter((s) => sportsSlideDayKey(s) === leadDay)
    : [];

  /**
   * Prochains dans le pool CTA :
   * · Avec résultats frais (aujourd’hui/hier) → jour lead seulement.
   * · Hors saison → 1er match de chaque jour sur 7 jours civils dès le lead,
   *   pour que la carte alterne (ex. 19→25 août) au lieu d’un seul « Prochain ».
   */
  let nextPool = leadDayNexts;
  if (!freshResults.length && leadDay) {
    const endDay = sportsCivilDayShift(leadDay, SPORTS_CTA_OFFSEASON_LEAD_DAYS - 1);
    const windowNexts = nexts.filter((s) => {
      const day = sportsSlideDayKey(s);
      return day && day >= leadDay && day <= endDay;
    });
    // nexts déjà triés bientôt-d’abord → premier vu par jour = premier match du jour
    const firstByDay = new Map();
    for (const s of windowNexts) {
      const day = sportsSlideDayKey(s);
      if (day && !firstByDay.has(day)) firstByDay.set(day, s);
    }
    const weekFirsts = [...firstByDay.values()];
    if (weekFirsts.length) nextPool = weekFirsts;
  }

  // Pool : résultats aujourd’hui/hier d’abord, puis prochains (jour lead ou semaine hors saison).
  const raw = freshResults.concat(nextPool);
  const deduped = sportsDedupeMatchSlides(raw);
  deduped.sort((a, b) => {
    const modeRank = (s) => (s.mode === 'result' ? 0 : 1);
    if (modeRank(a) !== modeRank(b)) return modeRank(a) - modeRank(b);
    if (a.mode === 'result') {
      return (sportsGameMs(b.game) || 0) - (sportsGameMs(a.game) || 0);
    }
    return bySoonest(a, b);
  });
  return sportsSoftSportDiversity(deduped).slice(0, SPORTS_CTA_MAX_POOL);
}

/** Libellés CTA : matchs chauds, sinon messages hors saison / creux. */
function sportsCtaLabelPool() {
  const hot = sportsCtaCandidateSlides()
    .map(sportsCtaLabelFromSlide)
    .filter(Boolean);
  if (hot.length) return hot;
  return SPORTS_CTA_IDLE_LABELS.slice();
}

/**
 * État visuel de la carte CTA. La slide CTA ne porte pas d’`urgency` à sa
 * racine : le match vit dans `ctaFrom`, il faut y descendre.
 */
function sportsCtaState(slide) {
  const src = slide?.ctaFrom || slide;
  if (!src?.game || src.mode === 'cta' || src.game.sport === 'board') return 'idle';
  if (sportsGameIsLive(src.game)) return 'live';
  if (src.mode === 'result') return 'result';
  if (src.mode === 'next') return 'next';
  return 'idle';
}

/**
 * Slide CTA — slot de droite.
 * Match « chaud » (aujourd’hui / ≤14 j) ou accroche idle hors saison.
 */
function sportsCtaSlide(labelIndex = sportsCtaLabelIndex) {
  const candidates = sportsCtaCandidateSlides();
  if (!candidates.length) {
    const idle = SPORTS_CTA_IDLE_LABELS;
    const idx = ((labelIndex % idle.length) + idle.length) % idle.length;
    return {
      mode: 'cta',
      // Clé unique par index — plusieurs CTAs idle sans collision DOM
      key: `${SPORTS_CTA_KEY}:${idx}`,
      label: idle[idx],
      labelIndex: idx,
      tone: SPORTS_CTA_REST_TONE,
      team: { sport: 'board', name: 'Sports', code: 'RSEQ' },
      game: { sport: 'board' },
      ctaIdle: true,
      ctaState: 'idle',
      ctaEyebrow: '',
      ctaSub: sportsUpdatedShort(),
      titleExtra: idle[idx],
    };
  }
  const idx = ((labelIndex % candidates.length) + candidates.length) % candidates.length;
  const src = candidates[idx];
  const label = sportsCtaLabelFromSlide(src);
  const state = sportsCtaState({ ctaFrom: src });
  const draft = {
    mode: 'cta',
    key: `${SPORTS_CTA_KEY}:${idx}`,
    label: label || SPORTS_CTA_IDLE_LABELS[0],
    labelIndex: idx,
    team: { sport: 'board', name: 'Sports', code: 'RSEQ' },
    game: { sport: 'board' },
    ctaFrom: src,
    ctaState: state,
    ctaEyebrow: sportsCtaEyebrow(src, state),
    ctaSub: sportsCtaSubLine(src, state),
    titleExtra: src
      ? `${src.team?.fullName || src.team?.name || ''} · ${label}`
      : '',
  };
  draft.tone = sportsCtaTone(draft);
  return draft;
}

/**
 * Pioche `n` slides CTA **sans la même info** (match / idle distincts).
 * @param {number} n
 * @returns {object[]}
 */
function pickDistinctSportsCtas(n) {
  const want = Math.max(1, n | 0);
  const out = [];
  const used = new Set();
  const candidates = sportsCtaCandidateSlides();
  const poolLen = Math.max(1, candidates.length || SPORTS_CTA_IDLE_LABELS.length);

  for (let i = 0; i < poolLen && out.length < want; i += 1) {
    const slide = sportsCtaSlide(i);
    if (sportsSlideIsUsed(slide, used)) continue;
    // Idle sans ctaFrom : dédup par labelIndex / label
    if (slide.ctaIdle) {
      const idleKey = `idle:${slide.labelIndex}:${slide.label}`;
      if (used.has(idleKey)) continue;
      used.add(idleKey);
    }
    for (const k of sportsSlideOccupyKeys(slide)) used.add(k);
    used.add(slide.key);
    out.push(slide);
  }
  // Filet : au moins une CTA
  if (!out.length) out.push(sportsCtaSlide(0));
  sportsCtaLabelIndex = out[0]?.labelIndex ?? 0;
  return out;
}

/** Tooltip + aria de la CTA SPORTS (sans reconstruire le DOM). */
function sportsCtaA11y(slide) {
  const updated = sportsData?.updated
    ? (() => {
      try {
        return new Intl.DateTimeFormat('fr-CA', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'America/Toronto',
        }).format(new Date(sportsData.updated));
      } catch {
        return String(sportsData.updated).slice(0, 16);
      }
    })()
    : '';
  let title;
  if (slide?.ctaFrom?.team) {
    title = [sportsChipTitle({ ...slide.ctaFrom, mode: slide.ctaFrom.mode || 'next' }), updated ? `MAJ ${updated}` : '']
      .filter(Boolean).join(' · ');
  } else {
    const detail = slide?.titleExtra || slide?.label || 'Scores collégiaux et universitaires';
    title = [`Sports · ${detail}`, updated ? `MAJ ${updated}` : ''].filter(Boolean).join(' · ');
  }
  const aria = `Sports : ${slide?.label || 'résultats sportifs étudiants du Québec'} (nouvel onglet)`;
  return { title, aria };
}

/**
 * Label CTA visible (couche front) — pour marquee / dwell / a11y.
 */
function sportsCtaActiveLabel(chip) {
  if (!chip) return null;
  return chip.querySelector('.sports-chip__cta-label.is-front')
    || chip.querySelector('.sports-chip__cta-label');
}

/**
 * Construit le contenu d’une couche d’accroche : marqueur, glyphe, texte, sous-ligne.
 * · Marqueur (PROCHAIN / Aujourd’hui…) : fixe, hors marquee
 *   (garde-fou `marqueur-non-tronque`).
 * · Glyphe sport (⚽…) : fixe, frère de la fenêtre de défilement — **ne défile pas**.
 * · Titre (`.sports-chip__cta-text`) et sous-ligne (`.sports-chip__cta-sub-text`)
 *   défilent L→R s’ils débordent — **jamais** d’ellipsis « … » (clip + marquee).
 */
function fillSportsCtaLayer(layer, slide) {
  layer.replaceChildren();
  // Ligne 1 : marqueur + glyphe (fixes) + fenêtre de défilement des noms.
  // Même structure que les puces gauche (glyphe hors `.sports-chip__body`).
  const head = document.createElement('span');
  head.className = 'sports-chip__cta-head';
  const eyebrow = slide.ctaEyebrow || '';
  if (eyebrow) {
    const el = document.createElement('span');
    el.className = 'sports-chip__cta-eyebrow sports-chip__cta-eyebrow--head';
    el.textContent = eyebrow;
    head.append(el);
  }
  const src = slide?.ctaFrom;
  const sportKey = src?.team?.sport || src?.game?.sport || '';
  const glyph = (src?.team || src?.game) && sportKey && sportKey !== 'board'
    ? sportsGlyph(sportKey)
    : '';
  if (glyph) {
    const gEl = document.createElement('span');
    gEl.className = 'sports-chip__cta-glyph';
    gEl.setAttribute('aria-hidden', 'true');
    gEl.textContent = glyph;
    head.append(gEl);
  }
  if (src?.mode === 'result' && src.game) {
    head.append(sportsResultBadgeEl(src.game));
  }
  const line = document.createElement('span');
  line.className = 'sports-chip__cta-line';
  const text = document.createElement('span');
  text.className = 'sports-chip__cta-text';
  // Noms / score seulement dans la zone qui défile (pas le glyphe).
  if (src?.mode === 'next' && src.team && src.game) {
    const g = src.game;
    const home = sportsChipTeamShort(src.team);
    const opp = sportsPlainOpponentName(g);
    const verb = sportsMatchVerb(g);
    text.innerHTML = `<span class="sports-chip__name">${escapeHtml(home)}</span> `
      + `<span class="sports-chip__vs">${escapeHtml(verb)}</span> `
      + `<span class="sports-chip__name sports-chip__opp">${escapeHtml(opp)}</span>`;
  } else if (src?.mode === 'result' && src.team && src.game) {
    const g = src.game;
    const home = sportsChipTeamShort(src.team);
    const opp = sportsPlainOpponentName(g);
    const placeKind = sportsIsPlaceResult(g, src.team.sport);
    if (placeKind) {
      const placeTxt = `${g.scoreFor}e/${g.scoreAgainst}`;
      text.innerHTML = `<span class="sports-chip__name">${escapeHtml(home)}</span> `
        + `<span class="sports-chip__score">${escapeHtml(placeTxt)}</span>`;
    } else {
      const scoreTxt = `${g.scoreFor}–${g.scoreAgainst}`;
      text.innerHTML = `<span class="sports-chip__name">${escapeHtml(home)}</span> `
        + `<span class="sports-chip__score">${escapeHtml(scoreTxt)}</span> `
        + `<span class="sports-chip__name sports-chip__opp">${escapeHtml(opp)}</span>`;
    }
  } else {
    // Idle / repli : pas de glyphe sport — libellé entier dans la fenêtre.
    text.textContent = slide.label || 'Scores étudiants QC';
  }
  line.append(text);
  head.append(line);
  layer.append(head);

  const sub = slide.ctaSub || '';
  if (sub) {
    const el = document.createElement('span');
    el.className = 'sports-chip__cta-sub';
    const subText = document.createElement('span');
    subText.className = 'sports-chip__cta-sub-text';
    subText.textContent = sub;
    el.append(subText);
    layer.append(el);
  }
  const chip = layer.closest?.('.sports-chip--cta');
  if (chip) syncSportsCtaRail(chip, slide);
  return layer;
}

/** Marqueur PROCHAIN sur le rail (390/430 : au-dessus de SPORTS).
 *  Hier / Aujourd’hui vivent dans la pastille, pas ici. */
function syncSportsCtaRail(chip, slide) {
  const railEb = chip?.querySelector('.sports-chip__cta-eyebrow--rail');
  if (!railEb) return;
  const text = String(slide?.ctaEyebrow || '').trim();
  railEb.textContent = text;
  railEb.hidden = !text;
}

/**
 * La carte CTA a-t-elle le droit de tourner ? — focus-group
 * `le-radar-cta-sports-rhythm` D, garde-fou `rotation-pointeur-fin`.
 *
 * WCAG 2.2.2 réclame un mécanisme de pause pour tout contenu qui se met à jour
 * seul au-delà de 5 s. Souris : survol/focus. Téléphone : doigt posé sur la
 * carte. Sans pause tactile l’accroche restait figée, et le marquee donnait
 * l’impression que l’info allait changer après le défilement.
 */
function sportsCtaMayRotate() {
  if (sportsReducedMotion) return false;
  // Lazy re-init : si l’init top-level a raté (TDZ, iframe, etc.), retenter.
  if (!sportsCtaRotateMq && typeof window !== 'undefined' && window.matchMedia) {
    try {
      sportsCtaRotateMq = window.matchMedia(SPORTS_CTA_ROTATE_MEDIA);
    } catch { /* ignore */ }
  }
  if (!sportsCtaRotateMq?.matches) return false;
  return sportsCtaLabelPool().length > 1;
}

/** Texte qui défile dans une couche (ou la couche elle-même en repli). */
function sportsCtaScrollTarget(layer) {
  return layer?.querySelector('.sports-chip__cta-text') || layer;
}

/** Signature d’une accroche — évite de rouler pour un contenu identique. */
function sportsCtaSignature(slide) {
  return [slide?.ctaEyebrow || '', slide?.label || '', slide?.ctaSub || ''].join('\u0001');
}

/**
 * Roulement vertical de l’accroche CTA — focus-group `le-radar-cta-sports-motion`
 * (verdict C), rythme fixé par `le-radar-cta-sports-rhythm`.
 *
 * Le fondu croisé qu’il remplace était un idiome d’image : sur du texte de
 * 11 px, deux chaînes de longueurs différentes coexistaient à mi-opacité
 * pendant ~250 ms — illisible, et sans direction. Ici l’ancienne couche monte
 * et sort pendant que la nouvelle entre par le bas : une seule phase, jamais de
 * trou vide, et **jamais deux textes lisibles à la fois** (c’est le cadre qui
 * coupe, pas l’alpha).
 */
function rollSportsCtaLabel(chip, slide) {
  if (!chip || !slide) return;
  chip.href = sportsBoardHref(slide);
  const { title, aria } = sportsCtaA11y(slide);
  chip.title = title;
  chip.setAttribute('aria-label', aria);
  applySportsCtaState(chip, slide);

  const stack = chip.querySelector('.sports-chip__cta-stack');
  const front = sportsCtaActiveLabel(chip);
  if (!front || !stack) return;
  if (front.dataset.ctaSig === sportsCtaSignature(slide)) return;

  if (chip._ctaRollTimer) {
    clearTimeout(chip._ctaRollTimer);
    chip._ctaRollTimer = null;
  }
  // Nettoyer une couche fantôme d’un roulement interrompu.
  chip.querySelectorAll('.sports-chip__cta-label.is-rolling-out')
    .forEach((el) => { if (el !== front) el.remove(); });
  front.classList.remove('is-rolling-in', 'is-rolling-out');
  front.classList.add('is-front');

  if (sportsReducedMotion) {
    fillSportsCtaLayer(front, slide);
    front.dataset.ctaSig = sportsCtaSignature(slide);
    chip.classList.remove('is-overflowing', 'is-sub-overflowing');
    chip.style.removeProperty('--sports-scroll');
    chip.style.removeProperty('--sports-scroll-sub');
    refreshSportsChipScroll(chip);
    return;
  }

  // Couper le marquee pendant le roulement : les deux transforms vivent sur des
  // nœuds différents, mais mesurer une couche en mouvement n’a pas de sens.
  chip.classList.remove('is-overflowing', 'is-sub-overflowing');
  chip.style.removeProperty('--sports-scroll');
  chip.style.removeProperty('--sports-scroll-sub');

  const back = document.createElement('span');
  back.className = 'sports-chip__cta-label is-rolling-in';
  back.setAttribute('aria-hidden', 'true');
  fillSportsCtaLayer(back, slide);
  back.dataset.ctaSig = sportsCtaSignature(slide);
  stack.append(back);

  // Reflow avant d’animer, sinon les deux couches démarrent au même endroit.
  void back.offsetWidth;
  front.classList.add('is-rolling-out');
  front.classList.remove('is-front');
  front.setAttribute('aria-hidden', 'true');
  back.classList.add('is-front');

  chip._ctaRollTimer = window.setTimeout(() => {
    chip._ctaRollTimer = null;
    if (front.isConnected) front.remove();
    back.classList.remove('is-rolling-in');
    back.classList.add('is-front');
    back.removeAttribute('aria-hidden');
    refreshSportsChipScroll(chip);
  }, SPORTS_CTA_ROLL_MS);
}

/**
 * Registre visuel de la carte CTA — focus-group `le-radar-sports-first-glance`
 * (garde-fou `registre-alerte-reserve`) et `le-radar-cta-sports-badge`.
 *
 * Au repos : lavis du sport du match + contour pourpre (parité chip-look).
 * Rouge, pastille « En cours » et point live **uniquement** pendant un match.
 * Le point était créé sans condition et pulsait toute l’année, y compris pour
 * un match à quinze jours : une promesse fausse.
 */
function applySportsCtaState(chip, slide) {
  if (!chip) return;
  const state = slide?.ctaState || sportsCtaState(slide);
  chip.dataset.ctaState = state;
  chip.style.setProperty('--sports-tone', sportsCtaTone({ ...slide, ctaState: state }));

  const tag = chip.querySelector('.sports-chip__cta-tag');
  if (!tag) return;
  const wanted = sportsCtaTagLabel(slide, state);
  if (tag.dataset.ctaTag !== wanted) {
    tag.dataset.ctaTag = wanted;
    tag.replaceChildren();
    tag.append(document.createTextNode(wanted));
  }
  tag.dataset.ctaLamp = sportsCtaLamp(slide, state);
  syncSportsCtaRail(chip, slide);
}

/**
 * Pause de la rotation au survol et au focus — garde-fou `pause-survol-focus`
 * (WCAG 2.2.2). N’est posée que sur les surfaces où la rotation existe : sur
 * tactile, l’accroche est figée et il n’y a rien à mettre en pause.
 */
function bindSportsCtaPause(chip) {
  if (!chip || chip._ctaPauseBound) return;
  chip._ctaPauseBound = true;
  const hold = () => { sportsCtaPaused = true; };
  const release = () => {
    sportsCtaPaused = false;
    // Relire le ruban, puis une nouvelle vague complète (scores + CTA).
    scheduleSportsWave({ fromSlot: 0, firstWait: true });
  };
  chip.addEventListener('pointerenter', hold, { passive: true });
  chip.addEventListener('pointerleave', release, { passive: true });
  chip.addEventListener('pointerdown', hold, { passive: true });
  chip.addEventListener('pointerup', release, { passive: true });
  chip.addEventListener('pointercancel', release, { passive: true });
  chip.addEventListener('focusin', hold);
  chip.addEventListener('focusout', release);
}

/**
 * Mesure un couple viewport/inner : overflow en px (0 si tout tient).
 * Toujours lever max-width le temps de la mesure (même si is-overflowing est
 * déjà posé) : certains moteurs gardent un scrollWidth plafonné tant que la
 * contrainte CSS est active, ce qui laissait l’ellipsis figée sur le titre.
 * On ne touche pas aux classes d’animation (évite de relancer le marquee).
 */
function sportsMeasureOverflow(viewport, inner, _hadOverflow) {
  if (!viewport || !inner) return 0;
  const prevMax = inner.style.maxWidth;
  inner.style.maxWidth = 'none';
  // scrollWidth du texte à largeur naturelle vs fenêtre de clip.
  const overflow = Math.max(0, inner.scrollWidth - viewport.clientWidth);
  inner.style.maxWidth = prevMax;
  return overflow;
}

/**
 * Applique / retire un marquee sur une puce (classe + --sports-scroll*).
 * Ne relance PAS l’animation si le décalage est inchangé.
 */
function sportsApplyScrollState(chip, {
  flag,
  prop,
  overflow,
} = {}) {
  if (!chip || !flag || !prop) return;
  // Wide étroit (1281–1439) : pas de marquee. ≥1440 : fallback si texte masqué.
  if (isWideNoMarqueeMode() && !isWideDesktopComfort()) {
    chip.classList.remove(flag);
    chip.style.removeProperty(prop);
    return;
  }
  const had = chip.classList.contains(flag);
  const needs = overflow > 2;
  if (!needs) {
    if (had) {
      chip.classList.remove(flag);
      chip.style.removeProperty(prop);
    }
    return;
  }
  const next = `${overflow}px`;
  const prev = (chip.style.getPropertyValue(prop) || '').trim();
  if (had && prev === next) return;
  chip.style.setProperty(prop, next);
  if (!had) chip.classList.add(flag);
}

/**
 * Défilement L→R du texte trop long (scores + accroche CTA titre + sous-ligne).
 * @param {Element|null} [chipOrRoot] une puce, le bandeau, ou null (= tout le bandeau).
 * Ne relance PAS l’animation CSS des puces déjà stables (évite le « tous
 * se rafraîchissent » quand une seule change).
 */
function refreshSportsChipScroll(chipOrRoot = null) {
  if (!MASTHEAD_SPORTS_STRIP && !chipOrRoot) return;
  const root = chipOrRoot || MASTHEAD_SPORTS_STRIP;
  if (!root) return;
  // Wide étroit : aucun marquee. ≥1440 : mesurer et défiler si ça dépasse.
  if (isWideNoMarqueeMode() && !isWideDesktopComfort()) {
    clearWideSportsMarqueeClasses();
    return;
  }
  const chips = root.classList?.contains('sports-chip')
    ? [root]
    : Array.from(root.querySelectorAll?.('.sports-chip') || []);
  chips.forEach((chip) => {
    const isCta = chip.classList.contains('sports-chip--cta');
    // CTA : le roulement déplace la couche (translateY), le marquee déplace le
    // texte (translateX). Deux nœuds distincts, sinon les transforms se
    // marchent dessus — c’est ce qui rendait l’ancien fondu saccadé.
    const layer = isCta ? sportsCtaActiveLabel(chip) : null;
    // Pendant un roulement : ne pas mesurer une couche en mouvement.
    if (
      isCta
      && layer
      && (
        layer.classList.contains('is-rolling-in')
        || chip.querySelector('.sports-chip__cta-label.is-rolling-out')
      )
    ) {
      return;
    }

    if (!isCta) {
      if (isWideDesktopComfort()) {
        const titleView = chip.querySelector('.sports-chip__line');
        const titleInner = chip.querySelector('.sports-chip__line-inner');
        const subView = chip.querySelector('.sports-chip__sub');
        const subInner = chip.querySelector('.sports-chip__sub-text');
        const titleOverflow = (titleView && titleInner)
          ? sportsMeasureOverflow(titleView, titleInner, chip.classList.contains('is-overflowing'))
          : 0;
        const subOverflow = (subView && subInner)
          ? sportsMeasureOverflow(subView, subInner, chip.classList.contains('is-sub-overflowing'))
          : 0;
        sportsApplyScrollState(chip, {
          flag: 'is-overflowing',
          prop: '--sports-scroll',
          overflow: titleOverflow,
        });
        sportsApplyScrollState(chip, {
          flag: 'is-sub-overflowing',
          prop: '--sports-scroll-sub',
          overflow: subOverflow,
        });
        return;
      }
      // Prod : puces scores = jamais marquee. Le fit retire une carte.
      chip.classList.remove('is-overflowing', 'is-sub-overflowing');
      chip.style.removeProperty('--sports-scroll');
      chip.style.removeProperty('--sports-scroll-sub');
      return;
    }

    // ── CTA : titre + sous-ligne mesurés séparément ──
    const titleView = layer?.querySelector('.sports-chip__cta-line');
    const titleInner = sportsCtaScrollTarget(layer);
    const subView = layer?.querySelector('.sports-chip__cta-sub');
    const subInner = layer?.querySelector('.sports-chip__cta-sub-text');

    if (!titleView || !titleInner) {
      chip.classList.remove('is-overflowing', 'is-sub-overflowing');
      chip.style.removeProperty('--sports-scroll');
      chip.style.removeProperty('--sports-scroll-sub');
      return;
    }

    const hadTitle = chip.classList.contains('is-overflowing');
    const hadSub = chip.classList.contains('is-sub-overflowing');
    const titleOverflow = sportsMeasureOverflow(titleView, titleInner, hadTitle);
    // Sous-ligne : viewport = .cta-sub, contenu = .cta-sub-text
    const subOverflow = (subView && subInner)
      ? sportsMeasureOverflow(subView, subInner, hadSub)
      : 0;

    sportsApplyScrollState(chip, {
      flag: 'is-overflowing',
      prop: '--sports-scroll',
      overflow: titleOverflow,
    });
    sportsApplyScrollState(chip, {
      flag: 'is-sub-overflowing',
      prop: '--sports-scroll-sub',
      overflow: subOverflow,
    });
    if (titleOverflow > 2 || subOverflow > 2) {
      const label = [titleInner?.textContent || '', subInner?.textContent || '']
        .filter(Boolean)
        .join(' · ');
      const trips = marqueeAlternateCount(
        SPORTS_SCROLL_ONE_WAY_MS,
        sportsLabelReadingMs(label),
      );
      chip.style.setProperty('--sports-scroll-trips', String(trips));
    } else {
      chip.style.removeProperty('--sports-scroll-trips');
    }
  });
}

/**
 * Libellé tooltip d’une formation — focus group stats :
 * une identité claire, pas le dump « court · surnom · établissement ».
 * Préfère surnom (Cougars) + court entre parenthèses si utile.
 */
function sportsTooltipTeamLabel({ name, nickname, fullName, code } = {}) {
  const short = String(name || code || '').trim();
  const nick = String(nickname || '').trim();
  if (nick && short && nick.toLowerCase() !== short.toLowerCase()) {
    return `${nick} (${short})`;
  }
  if (short) return short;
  if (nick) return nick;
  const full = String(fullName || '').trim();
  return full || 'Équipe';
}

function sportsSportLabelFr(sport) {
  const s = String(sport || '').toLowerCase();
  const map = {
    hockey: 'Hockey',
    football: 'Football',
    soccer: 'Soccer',
    'soccer-interieur': 'Soccer intérieur',
    futsal: 'Futsal',
    basketball: 'Basketball',
    volleyball: 'Volleyball',
    rugby: 'Rugby',
    'flag-football': 'Flag-football',
    baseball: 'Baseball',
    badminton: 'Badminton',
    natation: 'Natation',
    athletisme: 'Athlétisme',
    'cross-country': 'Cross-country',
    golf: 'Golf',
    cheerleading: 'Cheerleading',
    ultimate: 'Ultimate',
    sailing: 'Voile',
  };
  return map[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
}

/**
 * Tooltip / title d’une puce score — scannable en un coup d’œil :
 * Statut · Sport · Équipe vs Adversaire · [score] · Quand
 * (sans « voir le tableau… » redondant — le clic est déjà le CTA).
 */
function sportsChipTitle(slide) {
  if (!slide?.team || !slide.game) return 'Sports — scores étudiants';
  const team = slide.team;
  const g = slide.game;
  const sport = sportsSportLabelFr(g.sport || team.sport);
  // Mêmes libellés que les puces (Bleu/Jaune, fullName si mono-token).
  const home = sportsChipTeamShort(team);
  const opp = sportsPlainOpponentName(g);
  const when = formatSportsWhen(g.date, g.time);
  const host = String(team.fullName || '').trim();

  if (slide.mode === 'result') {
    const issue = g.result === 'W' ? 'Victoire' : g.result === 'L' ? 'Défaite' : 'Match nul';
    const placeKind = sportsIsPlaceResult(g, team.sport);
    const score = placeKind
      ? `place ${g.scoreFor}/${g.scoreAgainst}`
      : `${g.scoreFor}–${g.scoreAgainst}`;
    const line = placeKind ? `${home} ${score}` : `${home} ${score} ${opp}`;
    return [issue, sport, line, when, host].filter(Boolean).join(' · ');
  }

  // next / live proxy (urgency.tier 0 = fenêtre « en cours »)
  const status = slide.urgency?.tier === 0 ? 'En cours' : 'Prochain match';
  const verb = sportsMatchVerb(g);
  return [status, sport, `${home} ${verb} ${opp}`, when, host].filter(Boolean).join(' · ');
}

function paintSportsChip(slide, animate = false) {
  if (!slide) return document.createElement('span');

  /* ── Info hors saison (gauche) : accroche calendrier / tableau, ton ardoise ── */
  if (slide.mode === 'info') {
    const a = document.createElement('a');
    a.className = 'sports-chip sports-chip--info';
    a.href = new URL('sports/', window.location.href).pathname;
    markSportsBoardLink(a);
    if (animate && !sportsReducedMotion) a.classList.add('is-arriving');
    a.dataset.sportsKey = slide.key || 'info';
    a.dataset.sportsMode = 'info';
    a.dataset.sportsSport = 'board';
    a.style.setProperty('--sports-tone', slide.tone || '#5a6570');
    a.title = slide.label || 'Sports';
    a.setAttribute('aria-label', slide.label || 'Voir le tableau des scores (nouvel onglet)');
    const line = document.createElement('span');
    line.className = 'sports-chip__line';
    const inner = document.createElement('span');
    inner.className = 'sports-chip__line-inner sports-chip__info-label';
    inner.textContent = slide.label || 'Calendrier à venir';
    line.append(inner);
    a.append(line);
    if (animate && !sportsReducedMotion) {
      window.setTimeout(() => a.classList.remove('is-arriving'), SPORTS_ARRIVE_MS);
    }
    return a;
  }

  /* ── CTA « SPORTS » — pastille + accroche ; même leave/arrive que les scores ── */
  if (slide.mode === 'cta') {
    const a = document.createElement('a');
    a.className = 'sports-chip sports-chip--cta';
    a.href = sportsBoardHref(slide);
    markSportsBoardLink(a);
    if (animate && !sportsReducedMotion) a.classList.add('is-arriving');
    a.dataset.sportsKey = slide.key || SPORTS_CTA_KEY;
    a.dataset.sportsMode = 'cta';
    a.dataset.sportsSport = 'board';
    if (slide.labelIndex != null) a.dataset.ctaLabelIndex = String(slide.labelIndex);
    const { title, aria } = sportsCtaA11y(slide);
    a.title = title;
    a.setAttribute('aria-label', aria);

    // Pastille : Sports / En cours / Hier / Aujourd’hui (jour du résultat).
    const tag = document.createElement('span');
    tag.className = 'sports-chip__cta-tag';
    tag.setAttribute('aria-hidden', 'true');
    const rail = document.createElement('span');
    rail.className = 'sports-chip__cta-rail';
    const railEyebrow = document.createElement('span');
    railEyebrow.className = 'sports-chip__cta-eyebrow sports-chip__cta-eyebrow--rail';
    railEyebrow.setAttribute('aria-hidden', 'true');
    rail.append(railEyebrow, tag);

    const line = document.createElement('span');
    line.className = 'sports-chip__line';
    const stack = document.createElement('span');
    stack.className = 'sports-chip__cta-stack';
    const layer = document.createElement('span');
    layer.className = 'sports-chip__cta-label is-front';
    fillSportsCtaLayer(layer, slide);
    layer.dataset.ctaSig = sportsCtaSignature(slide);
    stack.append(layer);
    line.append(stack);

    a.append(rail, line);
    applySportsCtaState(a, slide);
    bindSportsCtaPause(a);
    if (animate && !sportsReducedMotion) {
      window.setTimeout(() => a.classList.remove('is-arriving'), SPORTS_ARRIVE_MS);
    }
    return a;
  }

  const team = slide.team;
  const g = slide.game || {};
  const sport = g.sport || team.sport || '';
  const tone = slide.tone || sportsSlideTone(slide);
  // Clic principal → page SEO locale (nouvel onglet, radio intacte).
  const href = sportsBoardHref(slide);
  const a = document.createElement('a');
  a.className = 'sports-chip sports-chip--match';
  a.href = href;
  markSportsBoardLink(a);
  if (animate && !sportsReducedMotion) a.classList.add('is-arriving');
  a.dataset.sportsKey = slide.key || '';
  a.dataset.sportsMode = slide.mode || '';
  a.dataset.sportsSport = sport || '';
  a.style.setProperty('--sports-tone', tone);

  const glyph = document.createElement('span');
  glyph.className = 'sports-chip__glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = sportsGlyph(sport);

  /*
   * Deux lignes comme la CTA, largeur chip :
   *   haut  — noms (acronymes univ. à gauche) + vs / score
   *   bas   — date · compétition (même méta que sous-ligne CTA)
   * Marquee L→R si overflow — **jamais** de troncature « … ».
   */
  const body = document.createElement('span');
  body.className = 'sports-chip__body';
  const line = document.createElement('span');
  line.className = 'sports-chip__line';
  const inner = document.createElement('span');
  inner.className = 'sports-chip__line-inner';
  const sub = document.createElement('span');
  sub.className = 'sports-chip__sub';
  const subText = document.createElement('span');
  subText.className = 'sports-chip__sub-text';

  const home = sportsChipTeamShort(team);
  // Puce étroite : acronymes univ. (ULaval, UdeM…) — CTA garde les formes longues.
  const opp = sportsChipOpponentLabel(g);
  const subLine = sportsMatchSubLine(slide);

  if (slide.mode === 'result') {
    a.append(glyph, sportsResultBadgeEl(g));
    const placeKind = sportsIsPlaceResult(g, sport);
    const prior = g.priorSeason || team.lastGamePriorSeason;
    if (placeKind) {
      // Régate / place : ne pas coller « McGill Sailing 7/12 ICSA Regional… »
      // en une ligne. Haut = équipe + place ; bas = date · compétition.
      const placeTxt = `${g.scoreFor}e/${g.scoreAgainst}`;
      inner.innerHTML = `<span class="sports-chip__name">${escapeHtml(home)}</span> `
        + `<span class="sports-chip__score">${escapeHtml(placeTxt)}</span>`;
    } else {
      const scoreTxt = `${g.scoreFor}–${g.scoreAgainst}`;
      inner.innerHTML = `<span class="sports-chip__name">${escapeHtml(home)}</span> `
        + `<span class="sports-chip__score">${escapeHtml(String(scoreTxt))}</span> `
        + `<span class="sports-chip__name sports-chip__opp">${escapeHtml(opp)}</span>`;
    }
    subText.textContent = subLine;
    if (prior) a.classList.add('sports-chip--prior-season');
    a.title = sportsChipTitle(slide) + (prior ? ' · Saison précédente' : '');
    a.setAttribute('aria-label', `${a.title}. Ouvrir le tableau des scores (nouvel onglet).`);
  } else {
    a.append(glyph);
    // « reçoit » / « à » — même ton presse que la CTA ; verbe en .sports-chip__vs (gris).
    const verb = sportsMatchVerb(g);
    inner.innerHTML = `<span class="sports-chip__name">${escapeHtml(home)}</span> `
      + `<span class="sports-chip__vs">${escapeHtml(verb)}</span> `
      + `<span class="sports-chip__name sports-chip__opp">${escapeHtml(opp)}</span>`;
    subText.textContent = subLine;
    a.title = sportsChipTitle(slide);
    a.setAttribute('aria-label', `${a.title}. Ouvrir le tableau des scores (nouvel onglet).`);
  }
  line.append(inner);
  sub.append(subText);
  body.append(line, sub);
  a.append(body);
  if (animate && !sportsReducedMotion) {
    window.setTimeout(() => a.classList.remove('is-arriving'), SPORTS_ARRIVE_MS);
  }
  return a;
}

/**
 * Prochaine carte de GAUCHE.
 * Saison : résultats passés uniquement, ordre fraîcheur (plus récent d’abord),
 * curseur circulaire + diversité de sport.
 * Hors saison : matchs à venir uniquement (prochains par proximité).
 * Jamais de puce grise « Hors saison / Calendrier… » ici.
 */
function nextSportsSlide(usedKeys, opts = {}) {
  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys || []);
  // Exclure tous les matchs déjà en CTA (1–3 cartes wide).
  sportsVisible.forEach((s) => {
    if (s?.mode !== 'cta') return;
    for (const k of sportsSlideOccupyKeys(s)) used.add(k);
  });
  const lane = sportsLeftLaneState();
  const avoidSport = String(opts.avoidSport || '').toLowerCase();
  const usedSports = opts.usedSports instanceof Set
    ? opts.usedSports
    : new Set(
      sportsVisible
        .filter((s) => s && s.mode !== 'cta' && s.mode !== 'info')
        .map((s) => String(s.team?.sport || '').toLowerCase())
        .filter(Boolean),
    );

  // ── Hors saison : prochains matchs seulement (pas d’accroches info) ──
  if (lane.kind === 'offseason') {
    // forceMode 'info' ignoré : les slogans ne vont plus à gauche.
    if (!lane.pool.length) return null;
    const pool = lane.pool;
    // Diversité sport puis curseur (pool déjà trié plus proche → plus loin).
    for (let i = 0; i < pool.length; i += 1) {
      const s = pool[(sportsLeftCursor + i) % pool.length];
      if (sportsSlideIsUsed(s, used)) continue;
      const sp = String(s.team?.sport || '').toLowerCase();
      if (sp && usedSports.has(sp) && usedSports.size < pool.length) continue;
      if (avoidSport && sp === avoidSport) continue;
      sportsLeftCursor = (sportsLeftCursor + i + 1) % pool.length;
      return s;
    }
    for (let i = 0; i < pool.length; i += 1) {
      const s = pool[(sportsLeftCursor + i) % pool.length];
      if (!sportsSlideIsUsed(s, used)) {
        sportsLeftCursor = (sportsLeftCursor + i + 1) % pool.length;
        return s;
      }
    }
    // Tout déjà affiché (hors CTA) : ne pas recycler le match CTA.
    for (let i = 0; i < pool.length; i += 1) {
      const s = pool[(sportsLeftCursor + i) % pool.length];
      if (sportsSlideIsUsed(s, used)) continue;
      sportsLeftCursor = (sportsLeftCursor + i + 1) % pool.length;
      return s;
    }
    return null;
  }

  // ── Saison : résultats passés seulement ──
  const pool = lane.pool;
  if (!pool.length) return null;

  // 1) Sport pas encore dans le bandeau
  for (let i = 0; i < pool.length; i += 1) {
    const s = pool[(sportsLeftCursor + i) % pool.length];
    if (sportsSlideIsUsed(s, used)) continue;
    const sp = String(s.team?.sport || '').toLowerCase();
    if (sp && !usedSports.has(sp)) {
      sportsLeftCursor = (sportsLeftCursor + i + 1) % pool.length;
      return s;
    }
  }
  // 2) Sport ≠ slot remplacé
  if (avoidSport) {
    for (let i = 0; i < pool.length; i += 1) {
      const s = pool[(sportsLeftCursor + i) % pool.length];
      if (sportsSlideIsUsed(s, used)) continue;
      if (String(s.team?.sport || '').toLowerCase() !== avoidSport) {
        sportsLeftCursor = (sportsLeftCursor + i + 1) % pool.length;
        return s;
      }
    }
  }
  // 3) Suivant non utilisé dans l’ordre de fraîcheur
  for (let i = 0; i < pool.length; i += 1) {
    const s = pool[(sportsLeftCursor + i) % pool.length];
    if (!sportsSlideIsUsed(s, used)) {
      sportsLeftCursor = (sportsLeftCursor + i + 1) % pool.length;
      return s;
    }
  }
  // 4) Plus de candidats hors CTA
  return null;
}

/**
 * Wide E : cluster CTA au centre (1–3), scores à gauche et à droite.
 * Prod : une CTA à droite (historique).
 * @param {object[]} contentSlides
 * @param {object|object[]} ctaOrList
 */
function arrangeSportsVisible(contentSlides, ctaOrList) {
  const ctas = (Array.isArray(ctaOrList) ? ctaOrList : [ctaOrList]).filter(Boolean);
  if (!ctas.length) return contentSlides.slice();
  if (!contentSlides.length) return ctas.slice();
  if (typeof isWideNoMarqueeMode === 'function' && isWideNoMarqueeMode()) {
    const leftN = Math.floor(contentSlides.length / 2);
    return [
      ...contentSlides.slice(0, leftN),
      ...ctas,
      ...contentSlides.slice(leftN),
    ];
  }
  // Prod : une seule CTA en fin de bandeau
  return [...contentSlides, ctas[0]];
}

function sportsCtaSlotIndex(visible = sportsVisible) {
  const i = visible.findIndex((s) => s?.mode === 'cta');
  return i >= 0 ? i : Math.max(0, visible.length - 1);
}

/** Indices de toutes les CTAs visibles (wide multi). */
function sportsCtaSlotIndices(visible = sportsVisible) {
  const out = [];
  visible.forEach((s, i) => {
    if (s?.mode === 'cta') out.push(i);
  });
  return out;
}

/**
 * Première peinture.
 * ≥ 2 chips : scores + CTA(s) (droite en prod ; **centrée·s en wide E**).
 * Wide : jusqu’à 3 CTAs distinctes.
 * 1 chip : CTA « Au tableau » seule (fin de la cascade de fit, parité météo).
 */
function pickInitialSportsVisible(count) {
  // CTA : démarrer au plus récent / plus proche (pool trié), cycle 0→1→2…
  sportsCtaLabelIndex = 0;
  sportsLeftCursor = 0;

  // Dernier cran de largeur / fit : uniquement l’ancre « Au tableau ».
  if (count <= 1) return [sportsCtaSlide(0)];

  const ctaN = sportsWideCtaCount(count);
  const ctas = pickDistinctSportsCtas(ctaN);
  const contentCount = Math.max(0, count - ctas.length);
  const picked = [];
  const usedKeys = new Set();
  ctas.forEach((c) => {
    for (const k of sportsSlideOccupyKeys(c)) usedKeys.add(k);
    usedKeys.add(c.key);
  });
  const usedSports = new Set();

  // sportsVisible temporaire pour que nextSportsSlide voie les CTAs.
  const prevVisible = sportsVisible;
  sportsVisible = ctas.slice();
  try {
    while (picked.length < contentCount) {
      const slide = nextSportsSlide(usedKeys, { usedSports, avoidSport: '' });
      if (!slide || slide.mode === 'info') break;
      if (sportsSlideIsUsed(slide, usedKeys)) break;
      picked.push(slide);
      for (const k of sportsSlideOccupyKeys(slide)) usedKeys.add(k);
      if (slide.team?.sport) usedSports.add(String(slide.team.sport).toLowerCase());
    }
  } finally {
    sportsVisible = prevVisible;
  }

  return arrangeSportsVisible(picked, ctas);
}

/** Remplit / recalcule les slots visibles (resize ou 1er paint). */
function renderSportsStrip() {
  if (!MASTHEAD_SPORTS_STRIP || !sportsSlides.length) {
    if (MASTHEAD_SPORTS_STRIP) {
      MASTHEAD_SPORTS_STRIP.hidden = true;
      MASTHEAD_SPORTS_STRIP.classList.add('is-empty');
      MASTHEAD_SPORTS_STRIP.replaceChildren();
    }
    sportsVisible = [];
    return;
  }
  const board = sportsBoardCount();
  // Réserver 1–3 CTAs (wide) ; le reste = scores.
  const count = Math.min(board, Math.max(1, sportsSlides.length + 3));
  const pinned = count >= 2;
  const ctaN = sportsWideCtaCount(count);
  const contentSlots = pinned ? Math.max(0, count - ctaN) : 0;

  // Resize / fit : si le mode pin ou le nb de slots change, re-semer.
  const wideCentered = typeof isWideNoMarqueeMode === 'function' && isWideNoMarqueeMode();
  const ctaIdxsPrev = sportsCtaSlotIndices(sportsVisible);
  const wasPinned = sportsVisible.length >= 2
    && ctaIdxsPrev.length >= 1;
  const wasCtaOnly = sportsVisible.length === 1 && sportsVisible[0]?.mode === 'cta';
  const prevCtaN = ctaIdxsPrev.length || 0;
  const slideStillValid = (s) => {
    if (!s || s.mode === 'cta') return false;
    // Anciennes puces « info » : purger au prochain paint (plus dans la gauche).
    if (s.mode === 'info') return false;
    return sportsSlides.some((x) => x.key === s.key);
  };
  const canReuse = pinned
    && sportsVisible.some((s) => s && s.mode !== 'cta' && slideStillValid(s));
  if (
    !canReuse
    || sportsVisible.length !== count
    || wasPinned !== pinned
    || prevCtaN !== ctaN
    || (count === 1 && !wasCtaOnly)
  ) {
    sportsVisible = pickInitialSportsVisible(count);
  } else {
    // Garder les CTAs existantes si encore distinctes / valides, sinon re-piocher.
    const prevCtas = sportsVisible.filter((s) => s?.mode === 'cta');
    let ctasKeep = prevCtas.slice(0, ctaN);
    if (ctasKeep.length < ctaN) {
      ctasKeep = pickDistinctSportsCtas(ctaN);
    } else {
      // Revalider distinctness
      const seen = new Set();
      const ok = [];
      for (const c of ctasKeep) {
        if (sportsSlideIsUsed(c, seen)) continue;
        for (const k of sportsSlideOccupyKeys(c)) seen.add(k);
        seen.add(c.key);
        ok.push(c);
      }
      if (ok.length < ctaN) ctasKeep = pickDistinctSportsCtas(ctaN);
      else ctasKeep = ok;
    }
    const used = new Set();
    ctasKeep.forEach((c) => {
      for (const k of sportsSlideOccupyKeys(c)) used.add(k);
      used.add(c.key);
    });
    const nextVisible = [];
    // Reprendre les scores existants (tous slots sauf CTAs), ordre L→R.
    for (let i = 0; i < sportsVisible.length; i += 1) {
      if (ctaIdxsPrev.includes(i)) continue;
      const prev = sportsVisible[i];
      if (
        prev
        && prev.mode !== 'cta'
        && prev.mode !== 'info'
        && !sportsSlideIsUsed(prev, used)
        && slideStillValid(prev)
        && nextVisible.length < contentSlots
      ) {
        nextVisible.push(prev);
        for (const k of sportsSlideOccupyKeys(prev)) used.add(k);
      }
    }
    const usedSports = new Set(
      nextVisible
        .map((s) => String(s.team?.sport || '').toLowerCase())
        .filter(Boolean),
    );
    // Compléter avec scores / prochains (hors matchs CTA).
    const prevVis = sportsVisible;
    sportsVisible = [...ctasKeep, ...nextVisible];
    try {
      while (nextVisible.length < contentSlots) {
        const slide = nextSportsSlide(used, { usedSports });
        if (!slide || slide.mode === 'info') break;
        if (sportsSlideIsUsed(slide, used)) break;
        nextVisible.push(slide);
        for (const k of sportsSlideOccupyKeys(slide)) used.add(k);
        if (slide.team?.sport) usedSports.add(String(slide.team.sport).toLowerCase());
      }
    } finally {
      sportsVisible = prevVis;
    }
    // Wide : CTAs au centre ; prod : CTA à droite.
    sportsVisible = arrangeSportsVisible(nextVisible, ctasKeep);
  }
  // Marqueur CSS pour le style « CTA centre » + nombre de CTAs
  if (MASTHEAD_SPORTS_STRIP) {
    const nCta = sportsCtaSlotIndices(sportsVisible).length;
    MASTHEAD_SPORTS_STRIP.dataset.ctaLayout = wideCentered && count >= 2 ? 'center' : 'end';
    MASTHEAD_SPORTS_STRIP.dataset.ctaCount = String(nCta);
  }

  // Rotation L→R : toujours repartir du slot le plus à gauche après un re-paint.
  sportsNextSlot = 0;
  const frag = document.createDocumentFragment();
  sportsVisible.forEach((slide) => frag.append(paintSportsChip(slide, false)));
  MASTHEAD_SPORTS_STRIP.replaceChildren(frag);
  MASTHEAD_SPORTS_STRIP.hidden = false;
  MASTHEAD_SPORTS_STRIP.classList.remove('is-empty');
  MASTHEAD_SPORTS_STRIP.dataset.count = String(sportsVisible.length);
  MASTHEAD_SPORTS_STRIP.dataset.ctaPinned = pinned ? '1' : '0';
  // Fit anti-marquee (A) + marquee CTA seulement, après layout stable.
  window.requestAnimationFrame(() => {
    refreshSportsChipScroll();
    window.requestAnimationFrame(() => {
      fitSportsStripAfterPaint();
      markUiReady(MASTHEAD_SPORTS_STRIP);
      // Polices webfont : re-fit une fois prêtes (mesure titre/sous-ligne juste).
      const fonts = document.fonts;
      if (fonts?.ready && typeof fonts.ready.then === 'function') {
        fonts.ready.then(() => {
          if (!MASTHEAD_SPORTS_STRIP?.isConnected) return;
          fitSportsStripAfterPaint();
          refreshSportsChipScroll();
        }).catch(() => { /* ignore */ });
      }
    });
  });
}

/**
 * Temps de lecture estimé d’un libellé de puce (scan compact FR).
 * Ex. « CLG vs OUT · 19 août · 23 h 40 » ≈ 9–11 s ; accroche plus longue → plus.
 */
function sportsLabelReadingMs(text) {
  const len = String(text || '').replace(/\s+/g, ' ').trim().length;
  if (!len) return SPORTS_READ_MIN_MS;
  return Math.min(
    SPORTS_READ_MAX_MS,
    Math.max(SPORTS_READ_MIN_MS, 4200 + len * SPORTS_READ_PER_CHAR_MS),
  );
}

/**
 * True si la puce a besoin d’un marquee (dwell allongé).
 * Focus-group A : puces **scores** → toujours false (pas de marquee).
 * CTA : titre ou sous-ligne overflow (marquee encore toléré).
 */
function sportsChipNeedsMarquee(chip) {
  if (!chip || sportsReducedMotion) return false;
  // Scores : anti-marquee — overflow géré par −1 puce, pas par scroll.
  if (!chip.classList.contains('sports-chip--cta')) return false;
  if (
    chip.classList.contains('is-overflowing')
    || chip.classList.contains('is-sub-overflowing')
  ) {
    return true;
  }
  const layer = sportsCtaActiveLabel(chip);
  if (!layer) return false;
  const titleView = layer.querySelector('.sports-chip__cta-line');
  const titleInner = sportsCtaScrollTarget(layer);
  if (titleView && titleInner && sportsMeasureOverflow(titleView, titleInner, false) > 2) {
    return true;
  }
  const subView = layer.querySelector('.sports-chip__cta-sub');
  const subInner = layer.querySelector('.sports-chip__cta-sub-text');
  if (subView && subInner && sportsMeasureOverflow(subView, subInner, false) > 2) {
    return true;
  }
  return false;
}

/**
 * Temps d’affichage d’un slot avant rotation — assez long pour *apprécier*
 * la carte et enregistrer l’info.
 * · Texte entier visible : dwell = lecture estimée (puces ~9–14 s ; CTA ~12 s).
 * · Texte qui défile : **toujours** 1 aller-retour marquee + pause repos
 *   (ne jamais changer la carte au milieu du scroll).
 */
function sportsSlotDwellMs(slot) {
  const chip = MASTHEAD_SPORTS_STRIP?.querySelectorAll('.sports-chip')?.[slot];
  const isCta = !!chip?.classList?.contains('sports-chip--cta');
  const labelEl = isCta
    ? sportsCtaScrollTarget(sportsCtaActiveLabel(chip))
    : chip?.querySelector('.sports-chip__line-inner');
  const subEl = isCta
    ? sportsCtaActiveLabel(chip)?.querySelector('.sports-chip__cta-sub-text')
    : chip?.querySelector('.sports-chip__sub-text');
  const label = [labelEl?.textContent || '', subEl?.textContent || '']
    .filter(Boolean)
    .join(' · ');
  const readMs = sportsLabelReadingMs(label);
  if (sportsReducedMotion) return readMs;
  if (!chip) return SPORTS_READ_MIN_MS;
  // CTA : plancher propre (un cran plus posé que les scores, sans 24 s collants).
  const floor = isCta ? SPORTS_CTA_DWELL_MS : readMs;
  if (sportsChipNeedsMarquee(chip)) {
    const oneWay = chip.classList.contains('sports-chip--match')
      ? SPORTS_MATCH_SCROLL_ONE_WAY_MS
      : SPORTS_SCROLL_ONE_WAY_MS;
    const trips = parseFloat(chip.style.getPropertyValue('--sports-scroll-trips')) || marqueeAlternateCount(oneWay, floor);
    const n = trips >= 2 ? trips : MARQUEE_ROUND_TRIPS;
    return Math.max(
      floor,
      SPORTS_SCROLL_READ_DELAY_MS + oneWay * n + SPORTS_SCROLL_POST_PAUSE_MS,
    );
  }
  return floor;
}

/** Délai après rotateSportsSlot avant de re-mesurer / re-planifier le dwell. */
function sportsSlotSettleMs(slot, replacement) {
  if (sportsReducedMotion) return 80;
  // Scores, prochains et CTA : même sortie + entrée carte entière.
  return SPORTS_CHIP_LEAVE_MS + SPORTS_ARRIVE_MS + 100;
}

function clearSportsSlotTimers() {
  for (let i = 0; i < sportsSlotTimers.length; i += 1) {
    if (sportsSlotTimers[i]) clearTimeout(sportsSlotTimers[i]);
  }
  sportsSlotTimers = [];
  if (typeof clearSportsWave === 'function') clearSportsWave();
}

/**
 * Rotation d’un seul slot — indépendante des voisines.
 * ≥ 2 chips : CTA(s) fixe(s) (droite en prod, **centre en wide E**) ; scores autour.
 * Wide multi-CTA : chaque CTA cycle sans reprendre le match d’une voisine.
 * 1 chip : CTA seule.
 */
function rotateSportsSlot(slot) {
  if (!MASTHEAD_SPORTS_STRIP || sportsVisible.length < 1 || sportsSlides.length < 1) return;
  const n = sportsVisible.length;
  if (slot < 0 || slot >= n) return;
  const pinned = n >= 2;
  const ctaSlots = sportsCtaSlotIndices(sportsVisible);
  const isCtaSlot = ctaSlots.includes(slot);
  // Occupation = clés faces + dédup match (miroir CTA ↔ scores).
  const used = sportsVisibleOccupyKeys(slot);
  const usedSports = new Set(
    sportsVisible
      .filter((_, i) => i !== slot && sportsVisible[i]?.mode !== 'cta')
      .map((s) => String(s.team?.sport || '').toLowerCase())
      .filter(Boolean),
  );

  let replacement = null;
  if (!pinned || isCtaSlot) {
    // CTA : cycle pool en évitant les matchs déjà portés par d’autres CTAs.
    const poolLen = Math.max(1, sportsCtaCandidateSlides().length || sportsCtaLabelPool().length);
    const curIdx = Number(sportsVisible[slot]?.labelIndex) || 0;
    let found = null;
    for (let step = 1; step <= poolLen; step += 1) {
      const idx = (curIdx + step) % poolLen;
      const cand = sportsCtaSlide(idx);
      if (sportsSlideIsUsed(cand, used)) continue;
      // Idle : éviter le même label qu’une autre CTA
      if (cand.ctaIdle) {
        const otherLabels = sportsVisible
          .filter((s, i) => i !== slot && s?.mode === 'cta')
          .map((s) => s.label);
        if (otherLabels.includes(cand.label)) continue;
      }
      found = cand;
      break;
    }
    replacement = found || sportsCtaSlide((curIdx + 1) % poolLen);
    sportsCtaLabelIndex = replacement.labelIndex ?? ((curIdx + 1) % poolLen);
  } else {
    // Scores (gauche ou droite des CTAs) : résultats ou prochains.
    const cur = sportsVisible[slot];
    const avoid = String(cur?.team?.sport || '').toLowerCase();
    replacement = nextSportsSlide(used, { usedSports, avoidSport: avoid });
    if (replacement?.mode === 'cta' || replacement?.mode === 'info') {
      replacement = nextSportsSlide(used, { usedSports, avoidSport: avoid, forceMode: 'next' });
    }
  }

  if (!replacement) return;
  // Même match déjà affiché : forcer le curseur suivant puis retenter une fois.
  if (
    replacement.mode !== 'cta'
    && replacement.mode !== 'info'
    && sportsSlideIsUsed(replacement, used)
  ) {
    const avoid = String(sportsVisible[slot]?.team?.sport || '').toLowerCase();
    sportsLeftCursor = (sportsLeftCursor + 1) % Math.max(1, sportsLeftLaneState().pool.length || 1);
    replacement = nextSportsSlide(used, { usedSports, avoidSport: avoid });
    if (!replacement || sportsSlideIsUsed(replacement, used)) return;
  }

  sportsVisible[slot] = replacement;

  // Après rotation CTA : si une puce score montre le même match, la remplacer.
  if (replacement.mode === 'cta' && replacement.ctaFrom) {
    const ctaKeys = sportsSlideOccupyKeys(replacement);
    for (let i = 0; i < n; i += 1) {
      if (i === slot) continue;
      const left = sportsVisible[i];
      if (!left || left.mode === 'cta') continue;
      if (!sportsSlideIsUsed(left, ctaKeys)) continue;
      const avoid = String(left.team?.sport || '').toLowerCase();
      const leftUsed = sportsVisibleOccupyKeys(i);
      const alt = nextSportsSlide(leftUsed, { usedSports, avoidSport: avoid });
      if (alt && alt.mode !== 'cta' && !sportsSlideIsUsed(alt, leftUsed)) {
        sportsVisible[i] = alt;
        const chips = MASTHEAD_SPORTS_STRIP.querySelectorAll('.sports-chip');
        const oldLeft = chips[i];
        if (oldLeft) {
          const painted = paintSportsChip(alt, !sportsReducedMotion);
          oldLeft.replaceWith(painted);
          window.requestAnimationFrame(() => refreshSportsChipScroll(painted));
        }
      }
    }
  }
  sportsNextSlot = (slot + 1) % n;
  const chips = MASTHEAD_SPORTS_STRIP.querySelectorAll('.sports-chip');
  const oldChip = chips[slot];

  // Scores, prochains et CTA : sortie carte entière → entrée carte entière.
  const newChip = paintSportsChip(replacement, !sportsReducedMotion);
  if (!oldChip) {
    MASTHEAD_SPORTS_STRIP.append(newChip);
    window.requestAnimationFrame(() => refreshSportsChipScroll(newChip));
    return sportsSlotSettleMs(slot, replacement);
  }
  if (sportsReducedMotion) {
    oldChip.replaceWith(newChip);
    window.requestAnimationFrame(() => refreshSportsChipScroll(newChip));
    return 80;
  }
  // Annuler une sortie en cours sur ce slot.
  if (oldChip._leaveTimer) {
    clearTimeout(oldChip._leaveTimer);
    oldChip._leaveTimer = null;
  }
  oldChip.classList.remove('is-arriving');
  oldChip.classList.add('is-leaving');
  oldChip.style.pointerEvents = 'none';
  oldChip._leaveTimer = window.setTimeout(() => {
    oldChip._leaveTimer = null;
    if (!oldChip.isConnected) return;
    oldChip.replaceWith(newChip);
    // Uniquement cette puce — ne pas relancer le marquee des voisines.
    window.requestAnimationFrame(() => refreshSportsChipScroll(newChip));
  }, SPORTS_CHIP_LEAVE_MS);
  return sportsSlotSettleMs(slot, replacement);
}

/** Compat tests / appels historiques : un tick = slot 0 (ou le prochain round-robin). */
function rotateOneSportsCard() {
  if (!sportsVisible.length) return;
  const slot = sportsNextSlot % sportsVisible.length;
  rotateSportsSlot(slot);
}

/**
 * Programme un timeout pour un slot, puis se re-planifie après rotation.
 * Dwell = lecture, ou **aller-retour marquee complet + pause** si overflow.
 * Après rotation : attendre la fin du fondu, mesurer le marquee, puis dwell.
 */
function scheduleSportsSlot(slot, { initialStagger = 0 } = {}) {
  if (!MASTHEAD_SPORTS_STRIP) return;
  if (sportsSlotTimers[slot]) {
    clearTimeout(sportsSlotTimers[slot]);
    sportsSlotTimers[slot] = null;
  }
  const n = sportsVisible.length;
  if (slot < 0 || slot >= n) return;
  // La carte CTA ne tourne que là où on peut l’arrêter, et pas pendant qu’on la
  // survole ou qu’elle a le focus (garde-fous `rotation-pointeur-fin` et
  // `pause-survol-focus`). Ailleurs, l’accroche reste celle du chargement.
  if (sportsVisible[slot]?.mode === 'cta' && (!sportsCtaMayRotate() || sportsCtaPaused)) return;
  // Mesurer le marquee avant de fixer le dwell (classe peut être absente un instant).
  const chipNow = MASTHEAD_SPORTS_STRIP.querySelectorAll('.sports-chip')?.[slot];
  if (chipNow) refreshSportsChipScroll(chipNow);
  const delay = Math.max(0, sportsSlotDwellMs(slot) + initialStagger);
  sportsSlotTimers[slot] = window.setTimeout(() => {
    sportsSlotTimers[slot] = null;
    // Ne pas couper un marquee en cours : si overflow encore actif et temps
    // écoulé trop court, le dwell a déjà inclus l’aller-retour ; on rotate.
    const settleMs = rotateSportsSlot(slot) || 80;
    // Attendre sortie+entrée, puis mesurer overflow sur la *nouvelle* carte
    // avant de reprogrammer le prochain dwell (sinon lecture seule trop courte).
    sportsSlotTimers[slot] = window.setTimeout(() => {
      sportsSlotTimers[slot] = null;
      const chip = MASTHEAD_SPORTS_STRIP?.querySelectorAll('.sports-chip')?.[slot];
      if (chip) refreshSportsChipScroll(chip);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => scheduleSportsSlot(slot));
      });
    }, settleMs);
  }, delay);
}

function clearSportsWave() {
  if (sportsWaveTimer) {
    clearTimeout(sportsWaveTimer);
    sportsWaveTimer = 0;
  }
}

/** Pause lecture après une vague sports (scores + accroches CTA). */
function sportsBoardHoldMs() {
  const n = Math.max(1, sportsVisible.length);
  let hold = Math.min(16000, Math.max(SPORTS_BOARD_HOLD_MS, 1800 * n));
  sportsVisible.forEach((slide, i) => {
    if (slide?.mode === 'cta') hold = Math.max(hold, sportsSlotDwellMs(i));
  });
  // Hors wide : un libellé qui défile doit finir son cycle pendant le hold.
  if (!isWideNoMarqueeMode()) {
    sportsVisible.forEach((_, i) => {
      hold = Math.max(hold, sportsSlotDwellMs(i));
    });
    hold = Math.min(16000, hold);
  }
  return hold;
}

/**
 * Vague L→R de toutes les cartes (y compris le texte CTA), puis pause,
 * puis une nouvelle vague. Tous les écrans.
 * CTA sautée si tactile, motion réduite, survol ou focus (WCAG 2.2.2).
 */
function scheduleSportsWave({ fromSlot = 0, firstWait = true } = {}) {
  clearSportsSlotTimers();
  clearSportsWave();
  const n = sportsVisible.length;
  if (n < 1) return;
  const lane = sportsLeftLaneState();
  const canSpin = lane.pool.length > 1
    || lane.kind === 'offseason'
    || n > 1
    || sportsCtaMayRotate();
  if (!canSpin) return;
  sportsWaveSlot = ((fromSlot % n) + n) % n;

  const stepMs = sportsReducedMotion ? 80 : SPORTS_CASCADE_STEP_MS;
  const step = (index) => {
    const liveN = sportsVisible.length;
    if (liveN < 1) return;
    if (index >= liveN) {
      sportsWaveTimer = window.setTimeout(() => {
        sportsWaveTimer = 0;
        scheduleSportsWave({ fromSlot: 0, firstWait: false });
      }, sportsBoardHoldMs());
      return;
    }
    const slot = index;
    const slide = sportsVisible[slot];
    if (slide?.mode === 'cta' && (!sportsCtaMayRotate() || sportsCtaPaused)) {
      sportsWaveTimer = window.setTimeout(() => step(index + 1), stepMs);
      return;
    }
    rotateSportsSlot(slot);
    const chip = MASTHEAD_SPORTS_STRIP?.querySelectorAll('.sports-chip')?.[slot];
    if (chip) {
      window.requestAnimationFrame(() => refreshSportsChipScroll(chip));
    }
    sportsWaveTimer = window.setTimeout(() => step(index + 1), stepMs);
  };
  if (firstWait) {
    sportsWaveTimer = window.setTimeout(() => {
      sportsWaveTimer = 0;
      step(sportsWaveSlot);
    }, sportsBoardHoldMs());
    return;
  }
  step(sportsWaveSlot);
}

function scheduleSportsRotate() {
  // Vague unique L→R, tous les écrans (CTA sautée si elle ne peut pas tourner).
  scheduleSportsWave({ fromSlot: 0, firstWait: true });
}

async function initMastheadSports() {
  if (!MASTHEAD_SPORTS_STRIP) return;
  try {
    const res = await fetch(appAsset('sports.json'), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    /* Focus-group B : même fenêtre de sessions que les articles + filet hors saison. */
    sportsData = (typeof RadarSportsFreshness !== 'undefined'
      && typeof RadarSportsFreshness.pruneSportsPayload === 'function')
      ? RadarSportsFreshness.pruneSportsPayload(raw)
      : raw;
    sportsSlides = buildSportsSlides(sportsData);
    sportsVisible = [];
    sportsNextSlot = 0;
    sportsFitCount = null;
    sportsFitDepth = 0;
    renderSportsStrip();
    scheduleSportsRotate();
    if (!initMastheadSports._resizeBound) {
      initMastheadSports._resizeBound = true;
      initMastheadSports._lastWidth = MASTHEAD_SPORTS_STRIP.clientWidth || 0;
      const onSportsLayout = (source = 'resize') => {
        if (initMastheadSports._rz) clearTimeout(initMastheadSports._rz);
        // Léger debounce pour enchaîner 4→3→2→1 pendant le drag de fenêtre.
        // Comme la météo : on annule le plafond mesuré et on re-fit depuis zéro.
        // Ignore les RO purement internes (reflow des chips) : seule une vraie
        // variation de largeur du bandeau doit resetter le fit.
        initMastheadSports._rz = setTimeout(() => {
          const w = MASTHEAD_SPORTS_STRIP?.clientWidth || 0;
          if (
            source === 'ro'
            && Math.abs(w - (initMastheadSports._lastWidth || 0)) < 2
          ) {
            return;
          }
          initMastheadSports._lastWidth = w;
          const prev = sportsVisible.length;
          sportsFitCount = null;
          sportsFitDepth = 0;
          renderSportsStrip();
          scheduleSportsRotate();
          // Si le nombre de chips a changé, le scroll texte doit se recalculer.
          if (sportsVisible.length !== prev) {
            window.requestAnimationFrame(() => refreshSportsChipScroll());
          }
        }, 40);
      };
      window.addEventListener('resize', () => onSportsLayout('resize'), { passive: true });
      try {
        window.visualViewport?.addEventListener('resize', () => onSportsLayout('vv'), { passive: true });
      } catch { /* ignore */ }
      if (typeof ResizeObserver !== 'undefined' && MASTHEAD_SPORTS_STRIP) {
        initMastheadSports._ro = new ResizeObserver(() => onSportsLayout('ro'));
        initMastheadSports._ro.observe(MASTHEAD_SPORTS_STRIP);
      }
    }
  } catch (err) {
    console.warn('Le Radar: sports indisponibles', err);
    if (MASTHEAD_SPORTS_STRIP) {
      MASTHEAD_SPORTS_STRIP.hidden = true;
      MASTHEAD_SPORTS_STRIP.classList.add('is-empty');
      MASTHEAD_SPORTS_STRIP.replaceChildren();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  TUNER
// ═══════════════════════════════════════════════════════════════════════════
/** Ordre d’affichage dans le menu du syntoniseur (universités en tête). */
const TUNER_STATION_ORDER = ['chyz', 'choq', 'cism', 'ckut'];

function tunerStationRank(radio = {}) {
  const idx = TUNER_STATION_ORDER.indexOf(radio.id);
  return idx >= 0 ? idx : 100 + radioPopularityRank(radio);
}

function sortRadios(list) {
  const order = { universite: 0, cegep: 1 };
  return [...list].sort((a, b) => {
    const t = (order[a.type] ?? 9) - (order[b.type] ?? 9);
    if (t !== 0) return t;
    const aNative = getPlayableStream(a) ? 0 : 1;
    const bNative = getPlayableStream(b) ? 0 : 1;
    if (aNative !== bNative) return aNative - bNative;
    const rankDiff = tunerStationRank(a) - tunerStationRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.name.localeCompare(b.name, 'fr');
  });
}

/** Une session live est détenue par un autre onglet/page (pair confirmé). */
function isRemoteSessionActive() {
  if (isPlaying() || isCasting()) return false;
  if (!remoteLeaderConfirmed) return false;
  try {
    const s = window.RadarPlayerSync?.readState?.();
    if (!s?.playing || !s.leaderId) return false;
    return s.leaderId !== window.RadarPlayerSync.getTabId();
  } catch {
    return false;
  }
}

/** Mode radio : enchaîner les flux natifs après un poste externe (prev/next ou menu). */
function tunerShouldAutoplayNative(next) {
  if (!next || !getPlayableStream(next)) return false;
  if (isPlaying()) return true;
  // Suiveur : prev/next doit aussi demander le changement au leader.
  if (isRemoteSessionActive()) return true;
  return !!(currentStation && isExternalListen(currentStation));
}

function radioPopularityRank(radio = {}) {
  return typeof radio.popularity === 'number' ? radio.popularity : 50;
}

function radioSlogan(radio = {}) {
  return String(radio.slogan || '').trim()
    || String(radio.description || '').split('.')[0]?.trim()
    || '';
}

function nowPlayingEntry(radio) {
  return radio?.id ? radioNowPlaying.stations?.[radio.id] : null;
}

/**
 * Les APIs des stations servent du HTML échappé : Airtime (CKUT) renvoie
 * « Utopia&#039;s Paradise ». Le bot décode déjà à la source, mais le JSON
 * publié peut dater d'avant ce correctif et les sondes navigateur (CISM,
 * Triton) tapent les APIs en direct. On décode donc **une fois** à l'arrivée
 * de la charge utile, pas à chaque rendu (l'antenne se redessine toutes les
 * secondes).
 */
function decodeAirShow(show) {
  if (!show || typeof show !== 'object') return show;
  const title = decodeHtmlEntities(String(show.title || ''));
  const host = decodeHtmlEntities(String(show.host || ''));
  if (title === show.title && host === (show.host || '')) return show;
  return { ...show, title, ...(show.host != null ? { host } : {}) };
}

function decodeNowPlayingStation(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  return {
    ...entry,
    current: decodeAirShow(entry.current),
    next: decodeAirShow(entry.next),
    track: decodeHtmlEntities(String(entry.track || '')),
    showTitle: decodeHtmlEntities(String(entry.showTitle || '')),
    host: decodeHtmlEntities(String(entry.host || '')),
  };
}

function decodeNowPlayingPayload(payload) {
  const stations = payload?.stations;
  if (!stations || typeof stations !== 'object') return payload || { stations: {} };
  const out = {};
  for (const [id, entry] of Object.entries(stations)) out[id] = decodeNowPlayingStation(entry);
  return { ...payload, stations: out };
}

function normLoose(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * true / false si la plage start–end (fuseau grille) couvre l'instant présent ;
 * null si aucune horloge exploitable (on fait confiance au bot).
 * end exclusive — à 15:00 pile, l'émission 14:00–15:00 est terminée.
 */
function airSlotIsLive(slot) {
  if (!slot) return null;
  const start = scheduleTimeToMin(slot.start);
  const end = scheduleTimeToMin(slot.end);
  if (start == null && end == null) return null;
  const { minutes: now } = scheduleZonedNow();
  if (start != null && end != null) {
    // Nuit : end <= start (ex. 22:00 → 02:00)
    if (end <= start) return now >= start || now < end;
    return now >= start && now < end;
  }
  if (end != null) return now < end;
  // start seul : en cours dès le début (le bot next / la grille corrigeront la fin)
  return now >= start;
}

/** true si le créneau a un start dans le futur (pas encore commencé aujourd'hui). */
function airSlotIsFuture(slot) {
  if (!slot) return false;
  const start = scheduleTimeToMin(slot.start);
  if (start == null) return false;
  const { minutes: now } = scheduleZonedNow();
  const end = scheduleTimeToMin(slot.end);
  // Nuit 22:00→02:00 : « futur » seulement avant le début le soir
  if (end != null && end <= start) return now < start && now >= end;
  return now < start;
}

/** Émission en cours / à venir : d'abord le bot (radio-nowplaying.json), puis grille locale. */
function botCurrentShow(radio) {
  const entry = nowPlayingEntry(radio);
  const cur = entry?.current;
  if (cur?.title && String(cur.title).trim().length >= 3) {
    const live = airSlotIsLive(cur);
    if (live === true) {
      // Une entrée issue de la grille peut être dépassée par une émission
      // spéciale : la grille locale résout alors le créneau le plus récent.
      if (cur.source === 'schedule') return scheduleCurrentSlot(radio) || cur;
      return cur;
    }
    if (live === false) {
      // Créneau pas commencé ou déjà fini — ne jamais l'afficher comme « en ondes »
    } else {
      // live === null : pas d'horaire exploitable
      // Ne pas traiter comme live si un next est clairement en cours
      const next = entry?.next;
      if (!(next?.title && airSlotIsLive(next) === true)) return cur;
    }
  } else {
    // Repli legacy showTitle seulement s'il n'y a pas de current horodaté expiré
    const legacy = String(entry?.showTitle || '').trim();
    if (legacy.length >= 3) {
      return {
        title: legacy,
        host: entry?.host || '',
        source: entry?.source || '',
      };
    }
  }
  // Promouvoir next quand son créneau a commencé (bot pas encore rafraîchi)
  const next = entry?.next;
  if (next?.title && String(next.title).trim().length >= 3 && airSlotIsLive(next) === true) {
    return next;
  }
  return null;
}

function botNextShow(radio) {
  const entry = nowPlayingEntry(radio);
  // Émission déjà résolue en ondes (peut provenir de entry.next promu).
  // Sert à ne pas recycler un `current` périmé en « à venir ».
  const liveShow = botCurrentShow(radio);
  // current futur (bot a mis l'émission dans current trop tôt) → à venir
  const cur = entry?.current;
  if (cur?.title && String(cur.title).trim().length >= 3) {
    if (airSlotIsLive(cur) === false && airSlotIsFuture(cur)) {
      /*
       * Piège minuit (CISM Mix anglo 22:00–00:00) : après la fin, airSlotIsFuture
       * reste vrai toute la journée (fenêtre « ce soir »), alors que l’entrée
       * bot est encore le current d’hier. Si une autre émission est en ondes
       * (ou a été promue depuis next), ne pas annoncer l’ancienne en « à venir ».
       */
      if (!liveShow || normLoose(liveShow.title) === normLoose(cur.title)) return cur;
    }
  }
  const next = entry?.next;
  if (!next?.title || String(next.title).trim().length < 3) return null;
  // Déjà en ondes (promu current) ou terminé (bot retardataire) : ce n'est
  // plus « à venir ». Dans ce dernier cas, le repli de grille trouvera le
  // prochain vrai créneau au lieu de conserver l'émission expirée.
  const nextLive = airSlotIsLive(next);
  if (nextLive === true || (nextLive === false && !airSlotIsFuture(next))) return null;
  if (liveShow && normLoose(liveShow.title) === normLoose(next.title)) return null;
  return next;
}

/**
 * Minutes jusqu’au prochain début de `show` (0–7×1440).
 * Jour de grille via `show.day` ou la grille locale ; sans jour, heuristique
 * « aujourd’hui si l’heure est encore devant, sinon demain ».
 */
function showUpcomingDeltaMin(radio, show) {
  if (!show?.title) return Infinity;
  const WEEK = 7 * 1440;
  const { day, minutes } = scheduleZonedNow();
  const nowAbs = day * 1440 + minutes;
  const slot = radio ? scheduleSlotForTitle(radio, show.title) : null;
  const start = scheduleTimeToMin(show.start || slot?.start);
  if (start == null) return Infinity;
  const showDay = show.day != null ? Number(show.day) : (slot?.day ?? null);
  if (showDay == null || Number.isNaN(showDay)) {
    let delta = start - minutes;
    if (delta <= 0) delta += 1440;
    return delta;
  }
  let delta = showDay * 1440 + start - nowAbs;
  if (delta <= 0) delta += WEEK;
  return delta;
}

/**
 * Prochaine émission à afficher : le plus tôt entre le bot et la grille.
 * La grille hebdo gagne quand l’API annonce une émission plus lointaine
 * (ex. CHOQ GraphQL saute un créneau du jour → « Opération… » vendredi
 * alors qu’Intervenir ensemble est jeudi 11 h).
 */
function resolveUpcomingShow(radio) {
  if (!radio) return null;
  // Plancher : ce qui est en ondes pour de vrai évince ce que la grille
  // annonçait dans le même intervalle (émission spéciale / hors programmation).
  const airLeft = authoritativeAirLeftMin(radio);
  let bot = botNextShow(radio);
  if (airLeft != null && bot?.title && showUpcomingDeltaMin(radio, bot) < airLeft) bot = null;
  const sched = scheduleNextSlot(radio, airLeft || 0);
  if (!bot?.title && !sched) return null;
  if (!bot?.title && sched) {
    return { title: sched.title, start: sched.start, end: sched.end, day: sched.day, source: 'schedule' };
  }
  if (bot?.title && !sched) {
    const slot = scheduleSlotForTitle(radio, bot.title);
    return {
      title: bot.title,
      start: bot.start || slot?.start || '',
      end: bot.end || slot?.end || '',
      day: bot.day != null ? bot.day : (slot?.day ?? null),
      source: bot.source || 'api-live',
    };
  }
  const dBot = showUpcomingDeltaMin(radio, bot);
  const dSched = showUpcomingDeltaMin(radio, {
    title: sched.title,
    start: sched.start,
    end: sched.end,
    day: sched.day,
  });
  if (dSched < dBot) {
    return { title: sched.title, start: sched.start, end: sched.end, day: sched.day, source: 'schedule' };
  }
  const slot = scheduleSlotForTitle(radio, bot.title);
  return {
    title: bot.title,
    start: bot.start || slot?.start || '',
    end: bot.end || (slot && slot.start === (bot.start || slot.start) ? slot.end : '') || '',
    day: bot.day != null ? bot.day : (slot?.day ?? null),
    source: bot.source || 'api-live',
  };
}

function nowAirShowTitle(radio) {
  return String(botCurrentShow(radio)?.title || '').trim();
}

// ─── Repli grille locale (si bot absent ou incomplet) ───────────────────────────

/** Jour (0-6) + minutes depuis minuit dans le fuseau de la grille. */
function scheduleZonedNow(date = new Date()) {
  const tz = radioNowPlaying.timezone || radioSchedules.timezone || 'America/Toronto';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = parseInt(map.hour, 10);
  if (hour === 24 || Number.isNaN(hour)) hour = 0;
  const minute = parseInt(map.minute, 10) || 0;
  return { day: wd[map.weekday] ?? 0, minutes: hour * 60 + minute };
}

const SCHEDULE_DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/**
 * Jour de grille (0-6) d'une émission d'après son titre, si elle y figure.
 * Une émission peut revenir plusieurs fois par semaine (ex. Capitales de
 * Québec le dim/ven/sam) : on prend l'occurrence la plus proche dans le
 * temps plutôt que la première du tableau, sinon le jour renvoyé peut être
 * complètement décorrélé du créneau réellement à venir.
 */
function scheduleSlotForTitle(radio, title) {
  const grid = radio?.id ? radioSchedules.stations?.[radio.id]?.grid : null;
  if (!Array.isArray(grid) || !title) return null;
  const target = normLoose(title);
  const WEEK = 7 * 1440;
  const { day, minutes } = scheduleZonedNow();
  const nowAbs = day * 1440 + minutes;
  let best = null;
  let bestDelta = WEEK;
  for (const slot of grid) {
    if (!slot.title || normLoose(slot.title) !== target) continue;
    const start = scheduleTimeToMin(slot.start);
    if (start == null) continue;
    let delta = (slot.day * 1440 + start) - nowAbs;
    if (delta <= 0) delta += WEEK;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = slot;
    }
  }
  return best;
}

function scheduleDayForTitle(radio, title) {
  return scheduleSlotForTitle(radio, title)?.day ?? null;
}

/**
 * « Demain », le nom du jour, ou '' si c'est aujourd'hui — pour éviter
 * qu'un « à venir » dont l'heure est déjà passée aujourd'hui (ex. 22 h vu à
 * 23 h 47) ne paraisse être une émission manquée alors qu'elle est demain.
 */
function scheduleRelativeDayLabel(day) {
  if (day == null) return '';
  const today = scheduleZonedNow().day;
  if (day === today) return '';
  const diff = (day - today + 7) % 7;
  if (diff === 1) return 'Demain';
  return SCHEDULE_DAY_NAMES[day].replace(/^./, (c) => c.toUpperCase());
}

function scheduleTimeToMin(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/** Plage horaire couvrant l'instant présent (gère les émissions de nuit). */
function scheduleCurrentSlot(radio) {
  const grid = radio?.id ? radioSchedules.stations?.[radio.id]?.grid : null;
  if (!Array.isArray(grid) || !grid.length) return null;
  const WEEK = 7 * 1440;
  const { day, minutes } = scheduleZonedNow();
  const nowAbs = day * 1440 + minutes;
  let current = null;
  let currentStartAbs = -Infinity;
  for (const slot of grid) {
    const start = scheduleTimeToMin(slot.start);
    const end = scheduleTimeToMin(slot.end);
    if (start == null || end == null || !slot.title) continue;
    const startAbs = slot.day * 1440 + start;
    const endAbs = slot.day * 1440 + (end <= start ? end + 1440 : end);
    const isLive = (nowAbs >= startAbs && nowAbs < endAbs)
      || (nowAbs + WEEK >= startAbs && nowAbs + WEEK < endAbs);
    if (!isLive) continue;

    // En cas de chevauchement, la diffusion commencée le plus récemment
    // prévaut (ex. une émission spéciale remplace la grille régulière).
    const effectiveStart = startAbs > nowAbs ? startAbs - WEEK : startAbs;
    if (effectiveStart > currentStartAbs) {
      current = slot;
      currentStartAbs = effectiveStart;
    }
  }
  return current;
}

/**
 * Prochaine émission planifiée (utile entre deux créneaux, ex. CHYZ l'après-midi).
 *
 * `minDelta` écarte les créneaux qui commencent avant une échéance : de quoi
 * sauter ceux qu'une diffusion spéciale recouvre déjà (voir
 * `authoritativeAirLeftMin`) et proposer le premier créneau réellement libre.
 */
function scheduleNextSlot(radio, minDelta = 0) {
  const grid = radio?.id ? radioSchedules.stations?.[radio.id]?.grid : null;
  if (!Array.isArray(grid) || !grid.length) return null;
  const WEEK = 7 * 1440;
  const { day, minutes } = scheduleZonedNow();
  const nowAbs = day * 1440 + minutes;
  let best = null;
  let bestDelta = WEEK;
  for (const slot of grid) {
    const start = scheduleTimeToMin(slot.start);
    if (start == null || !slot.title) continue;
    const startAbs = slot.day * 1440 + start;
    let delta = startAbs - nowAbs;
    if (delta <= 0) delta += WEEK;
    if (delta < minDelta) continue;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = slot;
    }
  }
  return best;
}

/** true si le bot a une source « live » fiable (API station). */
function isAuthoritativeLiveShow(radio) {
  const cur = botCurrentShow(radio);
  const src = String(cur?.source || nowPlayingEntry(radio)?.source || '');
  return src === 'api-live';
}

/**
 * Sources plus fraîches que la grille hebdo embarquée : l'API de la station,
 * et sa page horaire relue à l'instant par le bot (`schedule-live`). Voir
 * `sourceRank` dans radio-nowplaying-lib.js — garder les deux alignés.
 */
const FRESH_AIR_SOURCES = new Set(['api-live', 'schedule-live']);

/**
 * Minutes restantes de l'émission en ondes quand sa source bat la grille
 * embarquée, sinon null.
 *
 * Une diffusion hors programmation — un match dont l'heure a bougé le jour même
 * — recouvre des créneaux que la grille hebdo, collectée aux deux semaines,
 * continue d'annoncer. Le site montrait ainsi « À venir · Capitales de Québec ·
 * 18:50 » pendant que CHYZ diffusait ce même match depuis 16:50. Rien ne peut
 * commencer avant la fin de ce qui joue : cette durée sert de plancher au
 * « à venir ».
 *
 * La grille embarquée n'ouvre jamais ce veto — elle ne peut pas se corriger
 * elle-même — et un `current` déjà terminé (fenêtre dépassée) ne barre plus rien.
 */
function authoritativeAirLeftMin(radio) {
  const cur = botCurrentShow(radio);
  if (!FRESH_AIR_SOURCES.has(String(cur?.source || ''))) return null;
  const start = scheduleTimeToMin(cur?.start);
  const end = scheduleTimeToMin(cur?.end);
  if (start == null || end == null) return null;
  const wraps = end <= start;
  const endAbs = wraps ? end + 1440 : end;
  const { minutes } = scheduleZonedNow();
  const nowAbs = wraps && minutes < start ? minutes + 1440 : minutes;
  if (nowAbs < start || nowAbs >= endAbs) return null;
  return endAbs - nowAbs;
}

/** Créneau horaire « HH:MM – HH:MM », préfixé de « Demain »/jour si ce n'est pas aujourd'hui. */
function upcomingTimeRange(upcoming, radio) {
  if (!upcoming) return '';
  // Les APIs station ne donnent pas toujours la fin (CISM n'expose qu'un
  // horodatage de début) : la grille locale la complète, sinon « À venir »
  // s'affiche sans heure de fin, voire sans heure du tout.
  const slot = scheduleSlotForTitle(radio, upcoming.title);
  const start = upcoming.start || slot?.start || '';
  // N'apparier une fin venue de la grille qu'avec le même début : une émission
  // revient plusieurs fois par semaine, et coller la fin d'une autre diffusion
  // afficherait une plage qui n'a jamais existé.
  const end = upcoming.end || (slot && slot.start === start ? slot.end : '') || '';
  const range = start && end ? `${start} – ${end}` : (start || '');
  const day = upcoming.day != null ? upcoming.day : (slot?.day ?? null);
  const dayLabel = scheduleRelativeDayLabel(day);
  if (!dayLabel) return range;
  return range ? `${dayLabel} · ${range}` : dayLabel;
}

/**
 * Piste CHOQ « aberrante » (slug fichier, épisode collé, etc.)
 * Ex. « S1 — E6intervenir-ensemble28-novAmv1 » → ignorer, garder l’émission.
 */
function isGarbageChoqTrack(track, relatedTitles = []) {
  let raw = String(track || '').replace(/^♪\s*/, '').trim();
  if (raw.length < 2) return true;

  const compact = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '');

  // Codes épisode / saison collés au texte (S1 E6…, E6intervenir…)
  if (/\bs\d+\b/i.test(raw) && /\be\d+/i.test(raw)) return true;
  if (/e\d+[a-z]{4,}/i.test(compact)) return true;

  // Extension de fichier littérale (ex. « Bloc Pub 21 juillet.mp3 ») : sur
  // `raw`, avant que `compact` n'efface le point et ne recolle le mot d'avant
  // à l'extension (juillet.mp3 → juilletmp3, qui ne matche plus le test ci-
  // dessous faute de séparateur devant « mp3 »).
  if (/\.(mp3|wav|flac|aiff?|m4a|ogg|wma|aac)$/i.test(raw)) return true;

  // Extensions / masters / versions fichier
  if (/(^|[^a-z])(amv|wav|mp3|flac|aiff|master|mixdown|edit)\d*$/i.test(compact)) return true;
  if (/\d{1,2}[a-z]{3,4}\d*/i.test(compact) && /v\d|amv|nov|jan|fev|mar|avr|mai|jun|jul|aou|sep|oct|dec/i.test(compact)) {
    return true;
  }

  // Peu d’espaces + tirets/underscores → nom de fichier
  const spaces = (raw.match(/\s/g) || []).length;
  if (raw.length >= 18 && spaces <= 2 && /[-_]/.test(raw) && /[a-z]\d|\d[a-z]/i.test(raw)) {
    return true;
  }

  // Contient le slug d’une émission liée sans espaces (intervenirensemble…)
  for (const title of relatedTitles) {
    const slug = String(title || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '');
    if (slug.length >= 8 && compact.includes(slug) && compact !== slug) return true;
  }

  return false;
}

/** Arrête le timer de rotation du panneau bureau. */
function stopAirPanelRotate() {
  if (airPanelRotateTimer) {
    clearTimeout(airPanelRotateTimer);
    airPanelRotateTimer = null;
  }
}

/** Passe à la phase suivante et demande un fondu au prochain rendu. */
function advanceAirPhase(phaseCount) {
  if (!(phaseCount > 1)) return;
  airPhaseIndex = (airPhaseIndex + 1) % phaseCount;
  nowAirCrossfadePending = true;
  lastNowAir = { title: null, sub: null, empty: null, previewId: null, kind: null, stationId: null, shell: null };
}

/**
 * Rotation du panneau « À l'antenne » — **bureau, poste syntonisé seulement**.
 *
 * Une seule horloge à la fois, dans les deux sens :
 *  - sous 1100 px le panneau est `display:none` et c'est le tick du dial qui
 *    fait avancer la phase, à sa cadence adaptée à la longueur du texte ;
 *  - au repos (aucun poste choisi), c'est le carrousel de postes qui rythme
 *    l'affichage, et le panneau montre toujours la première phase du poste
 *    présenté. Y superposer ce timer ne changeait donc aucun texte, mais
 *    forçait un fondu du panneau toutes les 8 s sur un contenu identique.
 */
function syncAirPanelRotate(radio) {
  const phases = composedAirPhases(radio, { withSlogan: false });
  if (isTunerPresentationPaused() || !currentStation || phases.length < 2 || isTunerSubRotateMode()) {
    stopAirPanelRotate();
    return;
  }
  if (airPanelRotateTimer) return;
  scheduleAirPanelRotateTick();
}

/**
 * Chaîne de `setTimeout` plutôt qu'un `setInterval` fixe : la durée dépend de
 * la phase affichée. L'émission en ondes reste deux fois plus longtemps que la
 * piste ou le « à venir », et un titre qui déborde a le temps de faire son
 * aller-retour complet avant d'être remplacé — la même règle que le dial.
 */
function scheduleAirPanelRotateTick() {
  stopAirPanelRotate();
  if (isTunerPresentationPaused() || !currentStation || isTunerSubRotateMode()) return;

  const phases = composedAirPhases(currentStation, { withSlogan: false });
  if (phases.length < 2) return;

  const phase = phases[airPhaseIndex % phases.length];

  whenMarqueeSettled(TUNER_NOWAIR_TITLE, () => {
    if (isTunerPresentationPaused() || !currentStation || isTunerSubRotateMode() || airPanelRotateTimer) return;
    const delay = Math.max(
      airPhaseDwellMs(phase, AIR_PANEL_ROTATE_MS),
      marqueeRoundTripMs(TUNER_NOWAIR_TITLE),
      marqueeRoundTripMs(TUNER_NOWAIR_SUB),
    );
    airPanelRotateTimer = setTimeout(() => {
      airPanelRotateTimer = null;
      const live = composedAirPhases(currentStation, { withSlogan: false });
      if (isTunerPresentationPaused() || !currentStation || live.length < 2 || isTunerSubRotateMode()) return;
      advanceAirPhase(live.length);
      // `renderTunerNowAir()` réarme le cycle via `syncAirPanelRotate()` :
      // ne pas replanifier ici, on programmerait deux fois.
      renderTunerNowAir();
    }, delay);
  });
}

/**
 * Métadonnée technique plutôt qu'un contenu : ce que l'automate émet entre
 * deux émissions. Le bot filtre déjà à la source (radio-nowplaying-lib.js),
 * mais le JSON publié peut dater d'avant ce filtre — d'où le double garde.
 * Vaut pour tous les postes, pas seulement CKUT/McGill.
 */
const AIR_TECHNICAL_RE = /^(?:off ?line|off ?air|dead ?air|silence(?: detected)?|station ?id|airtime!?|liquidsoap(?:\s+radio!?)?|no name|unknown|unspecified|n\/a)$/i;

/**
 * Piste affichable (CHOQ : ignore les slugs fichier / métadonnées pourries).
 */
function trackForAirDisplay(radio, track, relatedTitles = []) {
  const t = decodeHtmlEntities(String(track || '')).replace(/^♪\s*/, '').trim();
  if (!t) return '';
  if (AIR_TECHNICAL_RE.test(t)) return '';
  // « ♪ CKUT 90,3 » ou « ♪ <slogan> » : le nom du poste n'est pas un morceau.
  const low = normLoose(t);
  if (low === normLoose(radio?.name) || low === normLoose(radioSlogan(radio || {}))) return '';
  if (radio?.id === 'choq' && isGarbageChoqTrack(t, relatedTitles)) return '';
  return t;
}

/**
 * Phases de la ligne d'antenne, dans l'ordre d'affichage.
 *
 * Une **liste** plutôt qu'une alternance à deux temps : c'est ce qui rend
 * « À venir » visible. Auparavant la prochaine émission n'était atteignable
 * que si aucune émission n'était en ondes — c'est-à-dire presque jamais.
 *
 *   1. émission en cours   2. à venir   3. piste   4. slogan (mobile seulement)
 *
 * Le slogan ferme le cycle sur mobile et n'y figure pas sur bureau, où il
 * occupe déjà la ligne 2 du syntoniseur (`tunerDesktopSubLine`) — l'ajouter
 * l'afficherait deux fois au même écran.
 *
 * @returns {{ title: string, sub: string, kind: 'live'|'upcoming'|'idle' }[]}
 */
function airRotationPhases(radio, { withSlogan = false } = {}) {
  if (!radio) return [];
  const slogan = radioSlogan(radio);
  const entry = nowPlayingEntry(radio);
  const botCur = botCurrentShow(radio);
  const schedCur = scheduleCurrentSlot(radio);
  const upcomingResolved = resolveUpcomingShow(radio);
  const relatedTitles = [
    botCur?.title,
    schedCur?.title,
    upcomingResolved?.title,
  ].filter(Boolean);
  // CHOQ : ne jamais afficher une piste « fichier » (titre ni sous-titre)
  const track = trackForAirDisplay(radio, entry?.track, relatedTitles);

  const phases = [];
  const seen = new Set();
  const push = (title, sub, kind) => {
    const t = String(title || '').trim();
    if (!t) return;
    const key = normLoose(t);
    if (!key || seen.has(key)) return;
    seen.add(key);
    phases.push({ title: t, sub: String(sub || '').trim(), kind });
  };

  // 1) Émission en cours — bot (api > grille) puis repli grille locale
  const cur = (botCur?.title && botCur) || (schedCur?.title && schedCur) || null;
  if (cur) {
    const host = String(cur.host || entry?.host || '').trim();
    const start = cur.start || schedCur?.start || '';
    const end = cur.end || schedCur?.end || '';
    const timeRange = start && end ? `${start} – ${end}` : (start || '');
    // La piste a sa propre phase : inutile de la répéter en sous-titre.
    const sub = timeRange
      || (host && normLoose(host) !== normLoose(cur.title) ? `avec ${host}` : '');
    push(cur.title, sub, 'live');
  }

  // 2) À venir — désormais affiché même pendant qu'une émission est en ondes.
  // resolveUpcomingShow arbitrage bot vs grille (le plus tôt gagne).
  if (upcomingResolved?.title) {
    push(upcomingResolved.title, upcomingTimeRange(upcomingResolved, radio), 'upcoming');
  }

  // 3) Piste en cours
  if (track) push(`♪ ${track}`, '', 'live');

  // 4) Slogan : ferme le cycle sur mobile, jamais seul en tête
  if (withSlogan && slogan && phases.length) push(slogan, '', 'idle');

  // Rien à annoncer : le slogan (ou un repli) devient la seule phase.
  if (!phases.length) push(slogan || `Vous écoutez ${radio.name}`, '', 'idle');

  return phases;
}

/**
 * Phase courante d'un poste. Le poste écouté suit l'index de rotation ;
 * un poste seulement prévisualisé montre sa phase la plus informative.
 * @returns {{ title: string, sub: string, kind: 'live'|'upcoming'|'idle' }}
 */
function nowAirLines(radio) {
  const phases = composedAirPhases(radio, { withSlogan: isTunerSubRotateMode() });
  if (!phases.length) {
    return { title: `Vous écoutez ${radio?.name || ''}`.trim(), sub: '', kind: 'idle' };
  }
  const index = radio && currentStation && radio.id === currentStation.id
    ? airPhaseIndex % phases.length
    : 0;
  return phases[index];
}

/** Libellé du panneau bureau : « À l'antenne » (live/idle) ou « À venir ». */
function nowAirPanelLabel(kind = 'idle') {
  return kind === 'upcoming' ? 'À venir' : "À l'antenne";
}

/**
 * Une seule ligne pour la rotation du sous-titre du dial (mobile / compact).
 * Sur bureau le libellé panneau porte déjà « À venir » ; ici on le préfixe
 * quand kind === upcoming (le panneau est masqué sous 1100px).
 */
function formatNowAirSubLine(title, sub, empty, kind = 'idle', { liveLabel = false } = {}) {
  if (empty) return 'Les radios étudiantes jouent en direct, 24/7';
  const t = String(title || '').trim();
  const s = String(sub || '').trim();
  // Ne pas juxtaposer deux fois la même information : « ♪ Rotten · Rotten »
  // ou « Mutations · Mutations (reprise) » se lisent comme un bégaiement.
  const lowT = normLoose(t);
  const lowS = normLoose(s);
  const redundant = !!lowS && !!lowT && (lowT.includes(lowS) || lowS.includes(lowT));
  const core = s && !redundant ? `${t} · ${s}` : (t || s);
  if (!core) return '';
  if (kind === 'upcoming') return `À venir · ${core}`;
  // « À l'antenne » sous 1100 px (panneau latéral masqué) : distingue l'émission
  // en cours de « À venir ». Aussi en aperçu idle mode B : L1 porte le poste,
  // L2 doit porter le statut (focus-group le-radar-tuner-dial-info-900).
  // Le ♪ d'une piste se suffit à lui-même.
  if (liveLabel && kind === 'live' && !t.startsWith('♪')) return `À l'antenne · ${core}`;
  return core;
}

/**
 * true si la ligne antenne n'apporte rien de plus que la ligne méta (slogan).
 * Faire alterner deux lignes équivalentes donne l'impression que l'affichage
 * hésite, alors qu'il n'a qu'une chose à dire — on n'alterne pas dans ce cas.
 */
function isRedundantAirLine(airLine, metaLine) {
  const air = normLoose(airLine);
  const meta = normLoose(metaLine);
  if (!air) return true;
  if (air === meta) return true;
  if (!meta) return false;
  const rest = air.split('·').map((p) => p.trim()).filter((p) => p && p !== meta);
  return rest.length === 0;
}

/**
 * Surface de test. La mise en forme de la ligne d'antenne est de la logique
 * pure : l'exposer permet de vérifier les règles anti-répétition sans dépendre
 * de ce que les stations diffusent au moment du test (donc sans test
 * instable). Lecture seule, aucune incidence sur l'exécution — voir
 * tests/now-air-lines.spec.mjs.
 */
window.RadarAir = {
  _pure: {
    formatNowAirSubLine,
    isRedundantAirLine,
    airRotationPhases,
    dialPhaseLinesForRadio,
    dialPhasesForRadio,
    idleDialStoryLine,
    previewDialLine,
    compactDialTitleLine,
    isTunerDialMidLayout,
    stationBandedName,
    airPhaseDwellMs,
    marqueeRoundTripMs,
    getTunerSubRotateDelayMs,
    marqueeAlternateCount,
    trackForAirDisplay,
    liveCopyFromPhases,
    splitChoqSongLines,
    applyChoqLiveSongLines,
    composedAirPhases,
    wideNowAirLiveCopy,
    isGarbageChoqTrack,
    botCurrentShow,
    botNextShow,
    resolveUpcomingShow,
    scheduleNextSlot,
    scheduleCurrentSlot,
    authoritativeAirLeftMin,
    showUpcomingDeltaMin,
    airSlotIsLive,
    airSlotIsFuture,
  },
};

function nowAirInterestScore(radio) {
  if (botCurrentShow(radio) && isAuthoritativeLiveShow(radio)) return 4;
  if (botCurrentShow(radio) || scheduleCurrentSlot(radio)?.title) return 3;
  if (botNextShow(radio) || scheduleNextSlot(radio)?.title) return 2;
  if (nowPlayingEntry(radio)?.track) return 1;
  return 0;
}

function nowAirPreviewPool() {
  const interesting = radios.filter((r) => nowAirInterestScore(r) > 0);
  return interesting.length ? interesting : radios;
}

function pickNowAirPreviewRadio() {
  const pool = nowAirPreviewPool();
  if (!pool.length) {
    nowAirPreviewRadio = null;
    return null;
  }
  let pick = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && pick.id === lastNowAirPreviewId) {
    const others = pool.filter((r) => r.id !== lastNowAirPreviewId);
    pick = others[Math.floor(Math.random() * others.length)];
  }
  nowAirPreviewRadio = pick;
  lastNowAirPreviewId = pick.id;
  return pick;
}

function formatStationNowAirLabel(radio) {
  const inst = shortInstitution(radio.institution, radio.type);
  return inst ? `${radio.name} · ${inst}` : radio.name;
}

/* ── Synthoniseur uniquement (#tuner-now-name) — pas articles, filtres ni RSS ── */

/**
 * Téléphone (< 600 px) ou embed étroit (pomo/solitaire mobile) :
 * layout dial compact (ligne antenne dans le sous-titre).
 */
function isTunerDialPhoneLayout() {
  if (IS_TUNER_EMBED) return isEmbedNowAirInDial();
  return !!TUNER_DIAL_PHONE_MQ?.matches;
}

/**
 * Institution dans le syntoniseur : **toujours l’acronyme** (UQAM, UdeM, ULaval…).
 * Évite le marquee inutile en veille (« CHOQ.ca · Université du Québec à Montréal »)
 * et aligne bureau / tablette / téléphone.
 */
function tunerDialInstitutionLabel(radio) {
  if (!radio) return '';
  const raw = shortInstitution(radio.institution, radio.type)
    || resolveInstitutionAcronym(radio.institution)
    || adaptRadarInstitutionLabel(tunerInstitutionLabel(radio.institution));
  // Acronymes neutres (pas de MT) ; forme longue seulement si aucun acronyme.
  return adaptRadarInstitutionLabel(raw);
}

/**
 * Suffixe « FM » / « AM » depuis frequency, si absent du nom
 * (ex. name « CISM 89,3 » + frequency « 89,3 FM » → « CISM 89,3 FM »).
 * Web / sans bande → chaîne vide.
 */
function stationOnAirBandLabel(radio = {}) {
  const name = String(radio.name || '');
  if (/\bFM\b/i.test(name) || /\bAM\b/i.test(name)) return '';
  // 1690AM collé sans espace
  if (/\dAM\b/i.test(name) || /\dFM\b/i.test(name)) return '';
  const freq = String(radio.frequency || '').trim();
  if (/\bFM\b/i.test(freq)) return ' FM';
  if (/\bAM\b/i.test(freq)) return ' AM';
  return '';
}

/** Nom d’antenne affiché : « CISM 89,3 FM », « CJLO 1690AM », « CHOQ.ca ». */
function stationDisplayName(radio = {}) {
  const name = String(radio.name || '').trim();
  if (!name) return '';
  return `${name}${stationOnAirBandLabel(radio)}`;
}

/**
 * Poste **et** sa bande de diffusion : « CISM 89,3 FM », « CJLO 1690AM »,
 * « CHOQ.ca · Web ». `stationOnAirBandLabel()` ne connaît que FM et AM ;
 * un poste sans fréquence hertzienne annonce donc « Web », sans quoi rien
 * n'indiquerait comment il se diffuse.
 */
function stationBandedName(radio = {}) {
  const display = stationDisplayName(radio);
  if (!display) return '';
  // « CJLO 1690AM » porte déjà sa bande, collée au chiffre : `\bAM\b` ne la
  // voyait pas (pas de frontière de mot entre « 0 » et « A »), et on ajoutait
  // « · 1690 AM » derrière.
  if (/(?:\b|\d)(?:FM|AM)\b/i.test(display)) return display;
  const freq = String(radio.frequency || '').trim();
  if (!freq || /^web$/i.test(freq)) return `${display} · Web`;
  return `${display} · ${freq}`;
}

/** Ligne 1 du syntoniseur (vue compacte) : « poste · établissement ». */
function tunerDialTitleLine(radio) {
  if (!radio) return tunerSubMeta || 'Radios étudiantes en direct';
  const inst = tunerDialInstitutionLabel(radio);
  const name = stationDisplayName(radio) || radio.name;
  return inst ? `${name} · ${inst}` : name;
}

/**
 * Ligne 1 du syntoniseur (bureau) : « poste FM · acronyme ».
 * Ex. CISM 89,3 FM · UdeM
 */
function tunerDesktopTitleLine(radio) {
  if (!radio) return 'Syntoniser un poste';
  const name = stationDisplayName(radio) || String(radio.name || '').trim() || 'Syntoniser un poste';
  const inst = shortInstitution(radio.institution, radio.type)
    || adaptRadarInstitutionLabel(tunerInstitutionLabel(radio.institution));
  return inst ? `${name} · ${inst}` : name;
}

/**
 * Ligne 2 du syntoniseur (bureau) : slogan (sinon fréquence / site externe).
 */
function tunerDesktopSubLine(radio, { external = false } = {}) {
  if (!radio) return '';
  const slogan = radioSlogan(radio);
  if (slogan) return slogan;
  if (external) return adaptRadarUiText('Site externe');
  return String(radio.frequency || '').trim();
}

/**
 * Mobile / tablette (< 1100 px) sur le site principal.
 * Embed large : logique « bureau » (panneau latéral À l'antenne).
 * Embed étroit (≤640 px) : même logique compacte que le site mobile
 * (ligne 2 = antenne / à venir + marquee) car le panneau est masqué en CSS.
 */
function isDialCompactLayout() {
  if (IS_TUNER_EMBED) return isEmbedNowAirInDial();
  return !!TUNER_SUB_ROTATE_MQ?.matches;
}

/**
 * Mid 768–900 (jusqu’à 1099.98) : combler le vide du carré avec institution
 * complète + heures. Hors mid (téléphone) : acronyme, pas d’horaire collé.
 * Embed : jamais (barre étroite).
 */
function isTunerDialMidLayout() {
  if (IS_TUNER_EMBED) return false;
  return !!TUNER_DIAL_MID_MQ?.matches && isDialCompactLayout();
}

/**
 * Titre ligne 1 en layout compact :
 *  - téléphone : poste · acronyme
 *  - mid 768/900 : poste · nom complet d’institution (comble le vide)
 */
function compactDialTitleLine(radio) {
  if (!radio) return tunerSubMeta || 'Radios étudiantes en direct';
  const name = stationDisplayName(radio) || radio.name || '';
  const inst = isTunerDialMidLayout()
    ? adaptRadarInstitutionLabel(tunerInstitutionLabel(radio.institution || ''))
    : tunerDialInstitutionLabel(radio);
  if (!name) return inst || '';
  return inst ? `${name} · ${inst}` : name;
}

/**
 * Ligne « méta » du dial compact (sous le titre poste · établissement) :
 * slogan (langue principale de l’institution, sans MT) — alterne avec l’antenne.
 * Fréquence seulement en dernier recours.
 */
function dialCompactMetaLineForRadio(radio) {
  if (!radio) return '';
  if (isExternalListen(radio)) return adaptRadarUiText('Site externe');
  // Slogan original (pas de traduction) = langue principale de l’institution
  const slogan = radioSlogan(radio);
  if (slogan) return slogan;
  return String(radio.frequency || '').trim() || 'Web';
}

/**
 * Phases L2 du dial compact **en écoute** (focus-group
 * `le-radar-tuner-dial-info-900` — mode **E**).
 *
 * Ordre : émission live → piste → à venir → (horaire filet hors mid).
 * Mid 768/900 : horaire collé à l’émission primaire pour combler le vide
 * (`À l'antenne · Titre · 08:00 – 18:30`). Ailleurs : titre seul + filet horaire.
 */
function dialPhasesForRadio(radio) {
  if (!radio) return [];
  const mid = isTunerDialMidLayout();
  const raw = airRotationPhases(radio, { withSlogan: false });
  const liveShows = [];
  const tracks = [];
  const upcomings = [];
  /** @type {{ title: string, sub: string, kind: string }[]} */
  const timeFilet = [];

  for (const phase of raw) {
    const title = String(phase.title || '').trim();
    if (!title) continue;
    const isTrack = title.startsWith('♪');
    if (phase.kind === 'upcoming') {
      upcomings.push(phase);
      continue;
    }
    if (isTrack) {
      tracks.push(phase);
      continue;
    }
    if (phase.kind === 'live') {
      liveShows.push(phase);
      // Hors mid : horaire en filet séparé (pas collé au titre).
      const time = String(phase.sub || '').trim();
      if (!mid && time && /^\d{1,2}:\d{2}/.test(time)) {
        timeFilet.push({ title: time, sub: '', kind: 'idle' });
      }
      continue;
    }
    // Repli idle (slogan seul si aucune grille) : une face utile.
    liveShows.push(phase);
  }

  const ordered = [...liveShows, ...tracks, ...upcomings, ...timeFilet];
  const seen = new Set();
  const out = [];
  for (const phase of ordered) {
    const title = String(phase.title || '').trim();
    const isTrack = title.startsWith('♪');
    const isTimeOnly = phase.kind === 'idle' && /^\d{1,2}:\d{2}/.test(title);
    // Mid : garder l’horaire sur la face primaire live pour remplir le carré.
    const sub = (phase.kind === 'live' && !isTrack && !mid)
      ? ''
      : String(phase.sub || '').trim();
    const line = isTimeOnly
      ? title
      : formatNowAirSubLine(title, sub, false, phase.kind, { liveLabel: true });
    const key = normLoose(line);
    if (!line || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...phase, sub, line });
  }
  return out;
}

/** Les mêmes phases, réduites à leur texte. */
function dialPhaseLinesForRadio(radio) {
  return dialPhasesForRadio(radio).map((p) => p.line);
}

/**
 * L2 du carré dial **hors écoute** (mode **B** — panel élargi).
 * Téléphone : préfixe + titre. Mid 768/900 : + horaire si dispo (comble le vide).
 */
function idleDialStoryLine(radio) {
  if (!radio) return '';
  const phase = airRotationPhases(radio, { withSlogan: false })[0];
  if (!phase) return '';
  const mid = isTunerDialMidLayout();
  const sub = mid ? String(phase.sub || '').trim() : '';
  return formatNowAirSubLine(phase.title, sub, false, phase.kind, { liveLabel: true });
}

/**
 * @deprecated Nom historique — désormais l'histoire L2 idle (B), sans poste.
 * Conservé pour `RadarAir._pure` / tests ; préférer `idleDialStoryLine`.
 */
function previewDialLine(radio) {
  return idleDialStoryLine(radio);
}

function formatPreviewNowAir(radio, { omitStation = false } = {}) {
  const stationLine = formatStationNowAirLabel(radio);
  const { title, sub, kind } = nowAirLines(radio);
  const genericListen = `Vous écoutez ${radio.name}`;
  const slogan = radioSlogan(radio);

  let airDetail = sub || '';
  if (!airDetail || airDetail === genericListen || airDetail === slogan) {
    airDetail = '';
  }

  if (omitStation) {
    if (title === genericListen) {
      const fallback = airDetail || slogan || '';
      return { title: fallback || 'En direct', sub: '', kind: kind || 'idle' };
    }
    return { title, sub: airDetail || '', kind };
  }

  if (title === genericListen) {
    return {
      title: stationLine,
      sub: airDetail || slogan || '',
      kind: kind || 'idle',
    };
  }

  return {
    title,
    sub: airDetail ? `${stationLine} · ${airDetail}` : stationLine,
    kind,
  };
}

function stopNowAirPreview() {
  if (nowAirPreviewTimer) {
    clearTimeout(nowAirPreviewTimer);
    nowAirPreviewTimer = null;
  }
}

/**
 * Temps qu'il faut à un texte qui défile pour : lire → partir → revenir → reposer.
 *
 * L'animation est `alternate` × `--marquee-trips` (2 ou 4) + delay lecture.
 * Un cycle complet = delay + trips × `--marquee-duration` + pause repos.
 *
 * On ne change jamais un texte avant la fin de ses aller-retour.
 */
function marqueeRoundTripMs(el) {
  if (!el?.classList.contains('is-marquee')) return 0;
  const sec = parseFloat(el.style.getPropertyValue('--marquee-duration'));
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  const tripsRaw = parseFloat(el.style.getPropertyValue('--marquee-trips'));
  const trips = Number.isFinite(tripsRaw) && tripsRaw >= 2 ? tripsRaw : MARQUEE_ROUND_TRIPS;
  return Math.ceil(sec * 1000 * trips)
    + MARQUEE_READ_DELAY_MS
    + MARQUEE_REST_MS;
}

/**
 * Combien de temps laisser une phase à l'écran, avant la contrainte de
 * défilement. L'émission en ondes est l'information principale : elle reste
 * deux fois plus longtemps qu'une piste, qu'un « à venir » ou qu'un slogan.
 */
function airPhaseDwellMs(phase, baseMs) {
  const title = String(phase?.title || '');
  const isLiveShow = phase?.kind === 'live' && !title.startsWith('♪');
  return isLiveShow ? Math.round(baseMs * AIR_LIVE_DWELL_FACTOR) : baseMs;
}

/**
 * Délai avant la prochaine alternance du sous-titre.
 *
 * La durée **de base** dépend de la largeur (un écran étroit se lit moins
 * vite) ; la contrainte de défilement, elle, vaut à **toute** largeur — elle
 * était auparavant enfermée dans la garde `< 1100 px`, si bien qu'en embed
 * large une ligne qui défilait pouvait changer en pleine course.
 */
function getTunerSubRotateDelayMs(activeEl, phase = null) {
  let delay = TUNER_SUB_ROTATE_MS;

  if (TUNER_SUB_ROTATE_MQ?.matches) {
    if (TUNER_SUB_ROTATE_VERY_NARROW_MQ?.matches) {
      delay = TUNER_SUB_ROTATE_VERY_NARROW_MS;
    } else if (TUNER_SUB_ROTATE_NARROW_MQ?.matches) {
      delay = TUNER_SUB_ROTATE_NARROW_MS;
    }
  }

  if (phase) delay = airPhaseDwellMs(phase, delay);
  return Math.max(delay, marqueeRoundTripMs(activeEl));
}

/**
 * Attend que la mesure du défilement soit posée avant de calculer le délai.
 *
 * Le budget suit celui de `scheduleMarqueeMeasure()` (2 rAF par tentative,
 * jusqu'à 5) : plus court, on calculait le délai avant que
 * `--marquee-duration` n'existe, la durée retombait à la base et la ligne
 * changeait en plein défilement.
 */
const MARQUEE_MEASURE_FRAMES = 12;

/**
 * Appelle `cb` une fois que `el` sait s'il défile ou non. Partagé par le dial
 * et le panneau : sans cette attente, on calcule un délai à partir d'un
 * `--marquee-duration` qui n'existe pas encore.
 */
function whenMarqueeSettled(el, cb, attempt = 0) {
  const span = el?.querySelector('.tuner-now-sub-text');
  const mightOverflow = span && el?.clientWidth > 0
    && span.scrollWidth > el.clientWidth + 4;

  if (attempt < MARQUEE_MEASURE_FRAMES && mightOverflow && !el?.classList.contains('is-marquee')) {
    requestAnimationFrame(() => whenMarqueeSettled(el, cb, attempt + 1));
    return;
  }
  cb();
}

function planTunerSubRotateDelay(activeEl, attempt, onReady, phase = null) {
  whenMarqueeSettled(activeEl, () => onReady(getTunerSubRotateDelayMs(activeEl, phase)), attempt);
}

function isNowAirPanelPreviewMode() {
  // Au repos (rien en lecture) : les postes alternent au hasard.
  // On verrouille si lecture, pause utilisateur, ou choix explicite d’un poste.
  return !PREFERS_REDUCED_MOTION?.matches
    && radios.length > 0
    && !isPlaybackActive()
    && !userPaused
    && !userPickedStation
    && !isBuffering;
}

/**
 * Compact sans poste : composition B dans le carré dial
 * (L1 identité carrousel, L2 une face). Site &lt;1100 + embed étroit
 * (panneau « À l'antenne » masqué). Embed large : panneau latéral, pas ici.
 */
function isMobileIdleDialPreview() {
  if (!isNowAirPanelPreviewMode()) return false;
  if (IS_TUNER_EMBED) return isEmbedNowAirInDial();
  return !!TUNER_SUB_ROTATE_MQ?.matches;
}

/** Bureau sans poste : faire défiler les radios disponibles dans le sous-titre du dial. */
function isDesktopIdleDialCarousel() {
  return !currentStation
    && !PREFERS_REDUCED_MOTION?.matches
    && (IS_TUNER_EMBED ? !isEmbedNowAirInDial() : !TUNER_SUB_ROTATE_MQ?.matches)
    && radios.length > 0;
}

/** Première composition L1/L2 posée — évite le flash HTML « Syntoniser un poste ». */
function markTunerDialReady() {
  TUNER?.classList.add('is-dial-ready');
}

function applyDialTextCrossfade(el, text, crossfade = false) {
  if (!el) return;
  if (!crossfade || PREFERS_REDUCED_MOTION?.matches) {
    applyMarquee(el, text);
    return;
  }
  el.classList.add('is-crossfading');
  setTimeout(() => {
    applyMarquee(el, text);
    requestAnimationFrame(() => el.classList.remove('is-crossfading'));
  }, NOW_AIR_CROSSFADE_MS);
}

/** Bureau sans poste : titre fixe + postes qui défilent en bas ; « À l'antenne » reste à part. */
function syncDesktopDialPreview(_airTitle, crossfade = false) {
  // Wide E : institution + poste + slogan complets (aperçu ou écoute).
  if (isWideTunerLayout()) {
    const radio = currentStation || nowAirPreviewRadio;
    if (radio) {
      paintWideDial(radio);
      lastDialCarouselText = stationDisplayName(radio) || radio.name || '';
      return;
    }
    paintWideDial(null);
    return;
  }
  // Mode B (site compact / embed étroit) : L1 géré dans syncTunerSubRotate.
  // Ne jamais écrire « Syntoniser un poste » ici — c’était le flash d’une frame.
  if (isMobileIdleDialPreview()) return;

  if (!isDesktopIdleDialCarousel()) {
    // Vrai vide seulement (pas de carrousel d’aperçu).
    if (!currentStation && !isNowAirPanelPreviewMode()) {
      setTunerNameText('Syntoniser un poste');
      markTunerDialReady();
    }
    return;
  }

  if (!nowAirPreviewRadio) {
    setTunerNameText('Syntoniser un poste');
    if (tunerSubMeta) applyMarquee(TUNER_SUB, tunerSubMeta);
    markTunerDialReady();
    return;
  }

  // Acronyme d’établissement (CHOQ.ca · UQAM) — pas le nom long qui force un marquee en veille.
  const stationLine = tunerDialTitleLine(nowAirPreviewRadio);
  const subText = TUNER_SUB?.querySelector('.tuner-now-sub-text')?.textContent;
  if (!crossfade && stationLine === lastDialCarouselText && subText === stationLine) {
    setTunerNameText('Syntoniser un poste');
    markTunerDialReady();
    return;
  }
  lastDialCarouselText = stationLine;

  setTunerNameText('Syntoniser un poste');
  applyDialTextCrossfade(TUNER_SUB, stationLine, crossfade);
  markTunerDialReady();
}

function scheduleNowAirPreviewTick() {
  if (nowAirPreviewTimer) {
    clearTimeout(nowAirPreviewTimer);
    nowAirPreviewTimer = null;
  }
  if (isTunerPresentationPaused() || !isNowAirPanelPreviewMode()) return;

  const wait = IS_TUNER_EMBED ? TUNER_SUB_ROTATE_MS : NOW_AIR_PREVIEW_DWELL_MS;
  nowAirPreviewTimer = setTimeout(() => {
    nowAirPreviewTimer = null;
    if (isTunerPresentationPaused() || !isNowAirPanelPreviewMode()) return;
    pickNowAirPreviewRadio();
    renderTunerNowAir();
    scheduleNowAirPreviewTick();
  }, wait);
}

function startNowAirPreview() {
  if (isTunerPresentationPaused() || nowAirPreviewTimer || !isNowAirPanelPreviewMode()) return;
  if (!nowAirPreviewRadio) pickNowAirPreviewRadio();
  scheduleNowAirPreviewTick();
}

function isTunerSubRotateMode() {
  if (PREFERS_REDUCED_MOTION?.matches) return false;
  // Embed étroit : alternance slogan/fréquence ↔ à l'antenne / à venir dans le dial.
  if (IS_TUNER_EMBED) return isEmbedNowAirInDial();
  return !!TUNER_SUB_ROTATE_MQ?.matches;
}

function stopTunerSubRotate() {
  if (tunerSubRotateTimer) {
    clearTimeout(tunerSubRotateTimer);
    tunerSubRotateTimer = null;
  }
  TUNER_SUB?.parentElement?.classList.remove('is-rotating');
}

/**
 * Écrit `text` dans le créneau qui devient actif, puis bascule.
 *
 * Les deux éléments ne portent plus un rôle figé (slogan d'un côté, antenne de
 * l'autre) : ce sont deux créneaux interchangeables entre lesquels on fait un
 * fondu, et le contenu vient de la liste de phases. C'est ce qui permet
 * d'avoir plus de deux phases.
 */
function setDialRotateSlot(slotB, text) {
  if (!TUNER_SUB || !TUNER_SUB_AIR) return;
  const incoming = slotB ? TUNER_SUB_AIR : TUNER_SUB;
  const outgoing = slotB ? TUNER_SUB : TUNER_SUB_AIR;
  applyMarquee(incoming, text);
  outgoing.classList.remove('is-marquee');
  TUNER_SUB.classList.toggle('is-active', !slotB);
  TUNER_SUB_AIR.classList.toggle('is-active', slotB);
  TUNER_SUB.setAttribute('aria-hidden', String(slotB));
  TUNER_SUB_AIR.setAttribute('aria-hidden', String(!slotB));
  scheduleMarqueeRefresh();
}

/**
 * Garde `lastNowAir` aligné sur la phase courante : sans ça, le prochain
 * `renderTunerNowAir()` (tick 30 s) croit à un changement et refait un fondu.
 */
function syncNowAirCacheToPhase(radio) {
  const { title, sub, kind } = nowAirLines(radio);
  lastNowAir = { ...lastNowAir, title, sub, kind };
}

function scheduleTunerSubRotateTick() {
  if (tunerSubRotateTimer) {
    clearTimeout(tunerSubRotateTimer);
    tunerSubRotateTimer = null;
  }
  if (isTunerPresentationPaused() || !isTunerSubRotateMode() || !currentStation) return;

  const activeEl = dialRotateSlotB ? TUNER_SUB_AIR : TUNER_SUB;
  // Phase actuellement lisible : c'est elle qui décide du temps d'affichage
  // (l'émission en ondes reste plus longtemps que la piste ou le « à venir »).
  const shown = dialPhasesForRadio(currentStation);
  const phase = shown.length ? shown[airPhaseIndex % shown.length] : null;

  planTunerSubRotateDelay(activeEl, 0, (delay) => {
    if (isTunerPresentationPaused() || !isTunerSubRotateMode() || !currentStation) return;
    tunerSubRotateTimer = setTimeout(() => {
      tunerSubRotateTimer = null;
      if (isTunerPresentationPaused() || !isTunerSubRotateMode() || !currentStation) return;
      const phases = dialPhasesForRadio(currentStation);
      if (phases.length < 2) {
        renderTunerNowAir();
        return;
      }
      // La phase n'avance qu'ici, entre deux affichages — jamais pendant
      // qu'on lit la ligne.
      airPhaseIndex = (airPhaseIndex + 1) % phases.length;
      dialRotateSlotB = !dialRotateSlotB;
      setDialRotateSlot(dialRotateSlotB, phases[airPhaseIndex].line);
      syncNowAirCacheToPhase(currentStation);
      scheduleTunerSubRotateTick();
    }, delay);
  }, phase);
}

function restartTunerSubRotateTimer() {
  if (!isTunerPresentationPaused() && TUNER_SUB?.parentElement?.classList.contains('is-rotating') && currentStation) {
    scheduleTunerSubRotateTick();
  }
}

/** Fige l'affichage sur le créneau A (hors rotation). */
function resetDialRotateSlots(text) {
  if (!TUNER_SUB || !TUNER_SUB_AIR) return;
  dialRotateSlotB = false;
  TUNER_SUB.classList.add('is-active');
  TUNER_SUB_AIR.classList.remove('is-active');
  TUNER_SUB.setAttribute('aria-hidden', 'false');
  TUNER_SUB_AIR.setAttribute('aria-hidden', 'true');
  TUNER_SUB_AIR.classList.remove('is-marquee');
  if (text != null) applyMarquee(TUNER_SUB, text);
}

/** Texte du panneau antenne : marquee doux seulement en cas de débordement. */
function applyNowAirPanelText(el, text) {
  if (!el) return;
  const value = String(text ?? '').trim();
  el.classList.remove('hidden');
  if (!value) {
    applyMarquee(el, '');
    el.removeAttribute('title');
    return;
  }
  applyMarquee(el, value);
  el.setAttribute('title', value);
}

/**
 * @param {string} title
 * @param {string} sub
 * @param {{ crossfade?: boolean, panelLabel?: string }} [opts]
 */
function updateNowAirPanel(title, sub, opts = {}) {
  const crossfade = !!opts.crossfade;
  const swapDelayMs = Number.isFinite(opts.swapDelayMs) ? opts.swapDelayMs : NOW_AIR_PANEL_SWAP_MS;
  const panelLabel = opts.panelLabel;
  const onWritten = typeof opts.onWritten === 'function' ? opts.onWritten : null;
  const panel = TUNER_NOWAIR;
  if (!panel) return;

  const write = () => {
    if (panelLabel != null) {
      const labelEl = panel.querySelector('.tuner-nowair-label') || TUNER_NOWAIR_LABEL;
      if (labelEl) labelEl.textContent = panelLabel;
      panel.setAttribute('aria-label', panelLabel);
    }
    applyNowAirPanelText(TUNER_NOWAIR_TITLE, title);
    if (TUNER_NOWAIR_SUB) {
      if (sub) {
        TUNER_NOWAIR_SUB.classList.remove('hidden');
        applyNowAirPanelText(TUNER_NOWAIR_SUB, sub);
      } else {
        TUNER_NOWAIR_SUB.textContent = '';
        TUNER_NOWAIR_SUB.classList.add('hidden');
        TUNER_NOWAIR_SUB.removeAttribute('title');
      }
    }
    onWritten?.();
  };

  const useFade = crossfade && !PREFERS_REDUCED_MOTION?.matches;
  if (!useFade) {
    nowAirFadeGen += 1;
    panel.classList.remove('is-swapping');
    write();
    return;
  }

  // Fondu : fade out → swap contenu → fade in. gen annule les bascules concurrentes.
  const gen = ++nowAirFadeGen;
  panel.classList.add('is-swapping');
  window.setTimeout(() => {
    if (gen !== nowAirFadeGen) return;
    write();
    requestAnimationFrame(() => {
      if (gen !== nowAirFadeGen) return;
      panel.classList.remove('is-swapping');
    });
  }, swapDelayMs);
}

function syncTunerSubRotate(title, sub, empty, crossfade = false, kind = 'idle') {
  if (!TUNER_SUB || !TUNER_SUB_AIR) return;
  const wrapper = TUNER_SUB.parentElement;

  if (isMobileIdleDialPreview()) {
    stopTunerSubRotate();
    wrapper?.classList.remove('is-rotating');
    TUNER_SUB.classList.add('is-active');
    TUNER_SUB_AIR.classList.remove('is-active');
    TUNER_SUB.setAttribute('aria-hidden', 'false');
    TUNER_SUB_AIR.setAttribute('aria-hidden', 'true');
    // Mode B (panel élargi) : L1 = identité poste du carrousel ; L2 = une seule
    // face antenne (pas de soupe poste·label·émission·horaire·campus).
    const preview = nowAirPreviewRadio;
    if (preview) {
      setTunerNameText(compactDialTitleLine(preview), crossfade);
      tunerSubAirText = idleDialStoryLine(preview)
        || formatNowAirSubLine(title, '', empty, kind, { liveLabel: true })
        || 'Radios étudiantes en direct';
    } else {
      setTunerNameText('Syntoniser un poste', crossfade);
      tunerSubAirText = 'Radios étudiantes en direct';
    }
    TUNER_SUB?.parentElement?.classList.toggle('is-empty', !tunerSubAirText);
    applyDialTextCrossfade(TUNER_SUB, tunerSubAirText, crossfade);
    markTunerDialReady();
    return;
  }

  /*
   * Compact + poste sélectionné — mode E (écoute) :
   *  L1 = poste · acronyme
   *  L2 = face primaire (émission) puis filet piste → à venir → horaire
   */
  if (currentStation && isDialCompactLayout()) {
    setTunerNameText(compactDialTitleLine(currentStation), crossfade);
    tunerSubMeta = dialCompactMetaLineForRadio(currentStation);

    const lines = dialPhaseLinesForRadio(currentStation);
    // Une seule phase : rien à faire tourner, on la pose et on s'arrête.
    if (!isTunerSubRotateMode() || lines.length < 2) {
      stopTunerSubRotate();
      wrapper?.classList.remove('is-rotating');
      airPhaseIndex = 0;
      const line = lines[0] || tunerSubMeta;
      tunerSubAirText = line;
      resetDialRotateSlots(null);
      TUNER_SUB?.parentElement?.classList.toggle('is-empty', !line);
      if (crossfade) applyDialTextCrossfade(TUNER_SUB, line, true);
      else applyMarquee(TUNER_SUB, line);
      scheduleMarqueeRefresh();
      markTunerDialReady();
      return;
    }

    wrapper?.classList.add('is-rotating');
    TUNER_SUB?.parentElement?.classList.remove('is-empty');
    // L'index peut dépasser si la liste a rétréci entre deux rendus.
    airPhaseIndex %= lines.length;
    tunerSubAirText = lines[airPhaseIndex];

    if (!tunerSubRotateTimer) {
      airPhaseIndex = 0;
      resetDialRotateSlots(lines[0]);
      scheduleTunerSubRotateTick();
    } else {
      // Rafraîchir la phase visible sans toucher au créneau masqué : le fondu
      // est porté par la bascule de créneau, pas par une réécriture.
      const activeEl = dialRotateSlotB ? TUNER_SUB_AIR : TUNER_SUB;
      applyMarquee(activeEl, lines[airPhaseIndex]);
    }
    scheduleMarqueeRefresh();
    markTunerDialReady();
    return;
  }

  tunerSubAirText = formatNowAirSubLine(title, sub, empty, kind);

  if (!isTunerSubRotateMode()) {
    stopTunerSubRotate();
    TUNER_SUB.classList.add('is-active');
    TUNER_SUB_AIR.classList.remove('is-active');
    TUNER_SUB.setAttribute('aria-hidden', 'false');
    TUNER_SUB_AIR.setAttribute('aria-hidden', 'true');

    if (isDesktopIdleDialCarousel()) {
      return;
    }

    // Compact (site ou embed étroit) : préférer la ligne antenne si dispo.
    const showAirInDialSub = currentStation && (isEmbedNowAirInDial() || (!IS_TUNER_EMBED && TUNER_SUB_ROTATE_MQ?.matches));
    if (showAirInDialSub && tunerSubAirText) {
      applyMarquee(TUNER_SUB, tunerSubAirText);
    } else if (tunerSubMeta) {
      applyMarquee(TUNER_SUB, tunerSubMeta);
    }
    return;
  }

  // Rotation demandée sans poste syntonisé (embed large au repos) : il n'y a
  // pas de liste de phases à faire tourner, on pose la ligne disponible.
  wrapper?.classList.add('is-rotating');
  resetDialRotateSlots(tunerSubAirText || tunerSubMeta);
  scheduleMarqueeRefresh();
}

function onTunerSubRotateLayoutChange() {
  syncTunerShellLayout();
}

/** Repeint le synthé pour la coque courante (wide ↔ bureau ↔ compact). */
function syncTunerShellLayout() {
  ensureWideNowAirPair();
  if (!isWideTunerLayout()) clearWideDialInlineSize();
  lastNowAir = {
    title: null, sub: null, empty: null, previewId: null, kind: null, stationId: null, shell: null,
  };
  renderTunerNowAir();
  scheduleMarqueeRefresh();
  restartTunerSubRotateTimer();
  if (isNowAirPanelPreviewMode()) {
    scheduleNowAirPreviewTick();
  }
  try { updateVolumeUI(); } catch { /* ignore */ }
  try { syncWideStickyTop(); } catch { /* ignore */ }
}

function initTunerSubRotateListeners() {
  onMediaQueryChange(TUNER_SUB_ROTATE_MQ, onTunerSubRotateLayoutChange);
  onMediaQueryChange(TUNER_DIAL_PHONE_MQ, onTunerSubRotateLayoutChange);
  onMediaQueryChange(TUNER_DIAL_MID_MQ, onTunerSubRotateLayoutChange);
  onMediaQueryChange(TUNER_SUB_ROTATE_NARROW_MQ, onTunerSubRotateLayoutChange);
  onMediaQueryChange(TUNER_SUB_ROTATE_VERY_NARROW_MQ, onTunerSubRotateLayoutChange);
  onMediaQueryChange(TUNER_EMBED_NOWAIR_HIDDEN_MQ, onTunerSubRotateLayoutChange);
  onMediaQueryChange(WIDE_TUNER_MQ, onTunerSubRotateLayoutChange);
  onMediaQueryChange(PREFERS_REDUCED_MOTION, onTunerSubRotateLayoutChange);
}

function renderTunerNowAir() {
  if (!TUNER_NOWAIR || isTunerPresentationPaused()) return;

  // Wide E : dual « À l'antenne » + « À venir », dial institution/slogan complets.
  if (isWideTunerLayout()) {
    const previewing = isNowAirPanelPreviewMode();
    if (previewing && !nowAirPreviewRadio) pickNowAirPreviewRadio();
    const radio = previewing
      ? (nowAirPreviewRadio || currentStation)
      : currentStation;
    if (previewing && radio && TUNER_SELECT && TUNER_SELECT.value !== radio.id) {
      TUNER_SELECT.value = radio.id;
    }
    paintWideNowAirPair(radio);
    paintWideDial(radio);
    // La voie wide return avant les markTunerDialReady() du chemin compact :
    // sans cet appel le carré reste opacity: 0 (rectangle vide) sur tout
    // écran ≥ 1281 px — accueil, kit média, fiches.
    markTunerDialReady();
    syncWideStickyTop();
    if (previewing) {
      startNowAirPreview();
      if (radio) syncAirPanelRotate(radio);
    } else if (currentStation) {
      stopNowAirPreview();
      syncAirPanelRotate(currentStation);
    } else {
      stopNowAirPreview();
      stopAirPanelRotate();
    }
    if (currentStation && isPlaybackActive()) {
      const { title, sub } = nowAirLines(currentStation);
      updateMediaSession(currentStation, { title, sub });
    }
    lastNowAir = { ...lastNowAir, shell: 'wide' };
    return;
  }

  // Quitter le mode wide : wrappers + largeur inline, sinon la barre casse
  // jusqu’au prochain refresh (resize 1920 → 1280).
  ensureWideNowAirPair();
  clearWideDialInlineSize();
  const wideWrap = document.getElementById('tuner-nowair-wide');
  if (wideWrap) wideWrap.hidden = true;
  TUNER_NOWAIR.classList.remove('tuner-nowair--legacy-slot');
  TUNER_NOWAIR.hidden = false;
  TUNER_NOWAIR.removeAttribute('aria-hidden');
  const instEl = document.getElementById('tuner-now-inst');
  if (instEl) {
    instEl.hidden = true;
    instEl.textContent = '';
  }

  const previewing = isNowAirPanelPreviewMode();
  let title;
  let sub;
  /** @type {'live'|'upcoming'|'idle'} */
  let kind = 'idle';

  if (previewing) {
    if (!nowAirPreviewRadio) pickNowAirPreviewRadio();
    if (nowAirPreviewRadio) {
      ({ title, sub, kind } = formatPreviewNowAir(nowAirPreviewRadio, {
        omitStation: isDesktopIdleDialCarousel(),
      }));
    } else {
      title = 'Syntoniser un poste';
      sub = 'Les radios étudiantes jouent en direct, 24/7';
      kind = 'idle';
    }
  } else if (currentStation) {
    ({ title, sub, kind } = nowAirLines(currentStation));
  } else {
    title = 'Syntoniser un poste';
    sub = 'Les radios étudiantes jouent en direct, 24/7';
    kind = 'idle';
  }

  const empty = !currentStation && !previewing;
  const previewId = previewing ? (nowAirPreviewRadio?.id ?? null) : null;
  if (empty) kind = 'idle';

  const stationId = previewing
    ? (nowAirPreviewRadio?.id ?? null)
    : (currentStation?.id ?? null);

  // Rien n'a changé : on n'écrase pas le DOM.
  const shell = tunerShellLayoutKey();
  if (lastNowAir.title === title
    && lastNowAir.sub === sub
    && lastNowAir.empty === empty
    && lastNowAir.previewId === previewId
    && lastNowAir.kind === kind
    && lastNowAir.stationId === stationId
    && lastNowAir.shell === shell
    && !nowAirCrossfadePending) {
    if (previewing) startNowAirPreview();
    else stopNowAirPreview();
    if (previewing) syncAirPanelRotate(nowAirPreviewRadio);
    else if (currentStation) syncAirPanelRotate(currentStation);
    return;
  }

  const stationChanged = lastNowAir.stationId != null
    && stationId != null
    && lastNowAir.stationId !== stationId;
  const crossfadePreview = previewing
    && !PREFERS_REDUCED_MOTION?.matches
    && lastNowAir.previewId != null
    && previewId !== lastNowAir.previewId;

  // Fondu uniquement : changement de poste ou bascule CHOQ (pas chaque MAJ de piste)
  const shouldFade = nowAirCrossfadePending || stationChanged;
  nowAirCrossfadePending = false;

  lastNowAir = { title, sub, empty, previewId, kind, stationId, shell };

  // Toujours visible sur bureau (placeholder HTML dès le paint).
  TUNER_NOWAIR.classList.remove('hidden');
  TUNER_NOWAIR.removeAttribute('aria-hidden');
  TUNER_NOWAIR.classList.toggle('is-empty', empty);
  // Couleurs live/upcoming appliquées après le swap (pendant le fade out
  // on garde l’ancienne teinte un instant — OK).
  const applyKindClasses = () => {
    TUNER_NOWAIR.classList.toggle('is-live', kind === 'live');
    TUNER_NOWAIR.classList.toggle('is-upcoming', kind === 'upcoming');
    TUNER_NOWAIR.dataset.airKind = kind;
  };
  if (!shouldFade || PREFERS_REDUCED_MOTION?.matches) applyKindClasses();

  const panelLabel = empty ? "À l'antenne" : nowAirPanelLabel(kind);

  updateNowAirPanel(title, sub, {
    crossfade: (shouldFade || crossfadePreview) && !empty,
    // Carrousel au repos : le panneau et le dial décrivent le MÊME poste, mais
    // leurs fondus n'ont pas la même durée (0,3 s contre 0,7 s). En échangeant
    // chacun à son rythme, le panneau annonçait l'émission du poste suivant
    // pendant que le dial nommait encore le précédent. On aligne l'instant de
    // bascule sur le plus lent des deux ; le panneau est déjà invisible depuis
    // longtemps, l'attente ne se voit pas.
    swapDelayMs: crossfadePreview ? NOW_AIR_CROSSFADE_MS : NOW_AIR_PANEL_SWAP_MS,
    panelLabel,
    onWritten: applyKindClasses,
  });

  syncDesktopDialPreview(title, crossfadePreview);
  syncTunerSubRotate(title, sub, empty, crossfadePreview, kind);
  if (currentStation && isPlaybackActive()) {
    updateMediaSession(currentStation, empty ? {} : { title, sub });
  }

  if (currentStation && !previewing) {
    stopNowAirPreview();
    nowAirPreviewRadio = null;
    lastNowAirPreviewId = null;
    lastDialCarouselText = '';
    // Ne pas réécrire le nom ici si selectStation l’a déjà posé (évite double flash)
    if (!isDialCompactLayout()) {
      /* nom déjà posé par selectStation ; re-sync si besoin */
    }
    if (isWideTunerLayout()) {
      paintWideDial(currentStation);
    } else {
      setTunerNameText(
        isDialCompactLayout()
          ? compactDialTitleLine(currentStation)
          : tunerDesktopTitleLine(currentStation),
      );
    }
    syncAirPanelRotate(currentStation);
    markTunerDialReady();
  } else if (previewing) {
    // Garantir un poste d’aperçu avant le 1er paint B (sinon L1 reste le placeholder HTML).
    if (!nowAirPreviewRadio) pickNowAirPreviewRadio();
    startNowAirPreview();
    syncAirPanelRotate(nowAirPreviewRadio);
    // syncTunerSubRotate (mode B) a déjà posé L1/L2 + is-dial-ready.
    if (!isMobileIdleDialPreview()) markTunerDialReady();
  } else {
    stopNowAirPreview();
    stopAirPanelRotate();
    setTunerNameText('Syntoniser un poste');
    markTunerDialReady();
  }
}

/**
 * Horloge interne : ré-évalue l'émission en cours chaque minute pour que
 * l'affichage bascule tout seul au changement d'émission, sans recharger la
 * page. Le garde-fou de renderTunerNowAir évite de relancer le défilement
 * quand l'émission n'a pas changé.
 */
function startNowAirTick() {
  if (nowAirTick) return;
  nowAirTick = setInterval(renderTunerNowAir, 30000);
}

function isTunerPresentationPaused() {
  return tunerPresentationPaused || document.visibilityState === 'hidden';
}

/** Gèle seulement le visuel : ni l'audio, ni Media Session, ni les polls ne sont touchés. */
function pauseTunerPresentation() {
  if (tunerPresentationPaused) return;
  tunerPresentationPaused = true;
  tunerPresentationNeedsRefresh = true;
  tunerPresentationResumeGeneration += 1;
  document.documentElement.classList.add('is-tuner-presentation-paused');
  stopAirPanelRotate();
  stopTunerSubRotate();
  stopNowAirPreview();
  // Annule tout fondu commencé juste avant l'arrière-plan.
  nowAirFadeGen += 1;
}

/**
 * Retour visible : actualiser d'abord les deux sources live, puis seulement
 * ensuite réécrire le synthétiseur à la première phase (« À l’antenne »).
 * Une promesse partagée absorbe visibilitychange + pageshow + focus, qui
 * arrivent généralement ensemble au retour d'un onglet.
 */
function resumeTunerPresentation() {
  if (document.visibilityState === 'hidden' || !tunerPresentationNeedsRefresh) {
    return tunerPresentationResumePromise || Promise.resolve();
  }
  if (tunerPresentationResumePromise) return tunerPresentationResumePromise;

  const generation = ++tunerPresentationResumeGeneration;
  tunerPresentationResumePromise = refreshNowPlayingCache({ render: false })
    .catch(() => { /* la dernière information fiable reste affichable */ })
    .finally(() => {
      tunerPresentationResumePromise = null;
      if (generation !== tunerPresentationResumeGeneration || document.visibilityState === 'hidden') return;
      tunerPresentationPaused = false;
      tunerPresentationNeedsRefresh = false;
      document.documentElement.classList.remove('is-tuner-presentation-paused');
      // Repartir de la phase la plus utile et d'un marquee neuf, jamais d'un
      // timer vieux de plusieurs minutes qui tenterait de combler son retard.
      airPhaseIndex = 0;
      dialRotateSlotB = false;
      nowAirCrossfadePending = false;
      nowAirFadeGen += 1;
      lastNowAir = { title: null, sub: null, empty: null, previewId: null, kind: null, stationId: null, shell: null };
      renderTunerNowAir();
      scheduleMarqueeRefresh();
    });
  return tunerPresentationResumePromise;
}

function initTunerPresentationLifecycle() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pauseTunerPresentation();
    else resumeTunerPresentation();
  });
  window.addEventListener('pagehide', pauseTunerPresentation);
  window.addEventListener('pageshow', resumeTunerPresentation);
  window.addEventListener('focus', resumeTunerPresentation);
}

// ═══════════════════════════════════════════════════════════════════════════
//  RETOUR DANS L'APP — fraîcheur du contenu
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Une PWA installée n'est jamais « rechargée » au sens d'un onglet : on la
 * quitte, on y revient, et le même document reprend là où il en était — des
 * jours plus tard sur iOS, qui garde l'app en mémoire. Le fil affiché est alors
 * celui de la dernière ouverture, alors que le bot d'articles publie sept fois
 * par jour.
 *
 * Trois régimes, parce qu'un rechargement dur n'est pas gratuit — il coûte la
 * position de lecture, et couperait la radio :
 *
 *   < 5 min    rien. Basculer vers une autre app deux secondes ne doit rien
 *              coûter, et c'est le cas de loin le plus fréquent.
 *   ≥ 5 min    le fil est rechargé **sur place** : pas de clignotement, pas de
 *              perte de position, et surtout compatible avec une écoute.
 *   ≥ 1 h      tout le document est périmé — météo, sports, fond du mât,
 *              horaires — et un rechargement franc est plus honnête qu'une
 *              page à moitié fraîche. Sauf si la radio joue : cette règle-là ne
 *              se négocie pas (un déploiement coupait l'écoute, voir
 *              `reloadUnlessListening`).
 *
 * Dans tous les cas au-delà de 5 min, on redemande aussi le service worker :
 * une version déployée pendant l'absence sera prise au prochain moment sûr.
 */
const CONTENT_REFRESH_AFTER_MS = 5 * 60 * 1000;
const HARD_RELOAD_AFTER_MS = 60 * 60 * 1000;

let appHiddenAt = 0;

/**
 * Que faire au retour, après `awayMs` d'absence. Logique pure : c'est la règle
 * qu'on veut pouvoir vérifier sans simuler un cycle d'arrière-plan iOS.
 * @returns {'none'|'refresh'|'reload'}
 */
function returnRefreshAction(awayMs, { playing = false } = {}) {
  if (!(awayMs > 0)) return 'none';
  if (awayMs < CONTENT_REFRESH_AFTER_MS) return 'none';
  if (awayMs >= HARD_RELOAD_AFTER_MS && !playing) return 'reload';
  return 'refresh';
}

function noteAppHidden() {
  // Ne pas écraser un départ déjà noté : `pagehide` et `visibilitychange`
  // arrivent ensemble, et c'est le **premier** instant d'absence qui compte.
  if (!appHiddenAt) appHiddenAt = Date.now();
}

function refreshContentOnReturn() {
  if (document.visibilityState === 'hidden') return;
  const hiddenAt = appHiddenAt;
  // Consommé une seule fois : visibilitychange, pageshow et resume arrivent
  // souvent en rafale au retour, et trois rechargements du fil pour un seul
  // retour ne diraient rien de plus.
  appHiddenAt = 0;
  if (!hiddenAt) return;

  const action = returnRefreshAction(Date.now() - hiddenAt, { playing: isPlaybackActive() });
  if (action === 'none') return;

  checkForAppUpdate();
  if (action === 'reload') {
    window.location.reload();
    return;
  }
  loadNews({ silent: true }).catch(() => { /* le fil déjà affiché reste valable */ });
}

/**
 * Surface de test. La règle de retour est de la logique pure : l'exposer
 * permet de vérifier les seuils et la garde « radio en écoute » sans mettre
 * réellement une PWA en arrière-plan pendant une heure.
 */
window.RadarLifecycle = {
  _pure: {
    returnRefreshAction,
    CONTENT_REFRESH_AFTER_MS,
    HARD_RELOAD_AFTER_MS,
  },
};

function initContentFreshnessLifecycle() {
  if (IS_TUNER_EMBED) return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') noteAppHidden();
    else refreshContentOnReturn();
  });
  window.addEventListener('pagehide', noteAppHidden);
  // bfcache / retour d'app iOS : le document reprend sans repasser par load.
  window.addEventListener('pageshow', refreshContentOnReturn);
  // Cycle de vie Chrome : un onglet gelé puis réveillé n'émet pas toujours
  // visibilitychange.
  window.addEventListener('freeze', noteAppHidden);
  window.addEventListener('resume', refreshContentOnReturn);
  initPullToRefresh();
}


function isStandaloneDisplay() {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
    if (window.matchMedia('(display-mode: window-controls-overlay)').matches) return true;
    if (navigator.standalone === true) return true;
  } catch { /* ignore */ }
  return false;
}

/** Pull-to-refresh PWA : fil d’actus le plus récent (soft). */
function initPullToRefresh() {
  if (typeof IS_TUNER_EMBED !== 'undefined' && IS_TUNER_EMBED) return;
  if (!isStandaloneDisplay()) return;
  if (document.documentElement.dataset.pullRefresh === '1') return;
  document.documentElement.dataset.pullRefresh = '1';
  const THRESHOLD = 72;
  const MAX_PULL = 110;
  let startY = 0, pulling = false, armed = false, indicator = null;
  let reducedMotion = false;
  try { reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch {}
  function ensureIndicator() {
    if (indicator) return indicator;
    indicator = document.createElement('div');
    indicator.className = 'radar-pull-refresh';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.innerHTML = '<span class="radar-pull-refresh__dot"></span>';
    document.body.appendChild(indicator);
    return indicator;
  }
  function setPull(px) {
    const el = ensureIndicator();
    const p = Math.min(MAX_PULL, Math.max(0, px));
    el.style.setProperty('--pull', p + 'px');
    el.classList.toggle('is-armed', p >= THRESHOLD);
    el.classList.toggle('is-visible', p > 8);
  }
  function releasePull(trigger) {
    const el = indicator;
    if (!el) return;
    if (trigger) {
      el.classList.add('is-refreshing');
      el.classList.remove('is-armed');
      try { checkForAppUpdate(); } catch {}
      loadNews({ silent: true }).catch(() => {}).finally(() => {
        window.setTimeout(() => {
          el.classList.remove('is-refreshing', 'is-visible');
          el.style.setProperty('--pull', '0px');
        }, reducedMotion ? 120 : 420);
      });
      return;
    }
    el.classList.remove('is-armed', 'is-visible', 'is-refreshing');
    el.style.setProperty('--pull', '0px');
  }
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    if ((window.scrollY || document.documentElement.scrollTop || 0) > 2) return;
    startY = e.touches[0].clientY; pulling = true; armed = false;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!pulling || e.touches.length !== 1) return;
    if ((window.scrollY || document.documentElement.scrollTop || 0) > 2) { pulling = false; releasePull(false); return; }
    const dy = e.touches[0].clientY - startY;
    if (dy < 4) return;
    if (dy > 12 && e.cancelable) e.preventDefault();
    setPull(dy * 0.55);
    armed = dy * 0.55 >= THRESHOLD;
  }, { passive: false });
  document.addEventListener('touchend', () => { if (!pulling) return; pulling = false; const go = armed; armed = false; releasePull(go); }, { passive: true });
  document.addEventListener('touchcancel', () => { pulling = false; armed = false; releasePull(false); }, { passive: true });
}

async function refreshNowPlayingCache({ render = true } = {}) {
  if (!nowPlayingRefreshPromise) {
    nowPlayingRefreshPromise = (async () => {
      try {
        radioNowPlaying = decodeNowPlayingPayload(
          await fetch(appAsset('radio-nowplaying.json'), { cache: 'no-store' }).then((r) => r.json()),
        );
      } catch {
        /* Le cache mémoire reste le repli si la collecte échoue. */
      }
      // Re-poll navigateur des APIs CORS signalées par le bot (clientPoll).
      await refreshStationLiveApis();
    })().finally(() => {
      nowPlayingRefreshPromise = null;
    });
  }
  await nowPlayingRefreshPromise;
  if (render && !isTunerPresentationPaused()) renderTunerNowAir();
}

/**
 * Parse une réponse live côté navigateur selon le type d'adaptateur du bot.
 * Types CORS : cism-v1 (émissions), triton-np (piste). Craft/CHOQ /api/live
 * n'a pas de CORS — ne pas l'utiliser ici comme « émission ».
 */
/**
 * « HH:MM » dans le fuseau de la grille, depuis un horodatage Unix (s ou ms)
 * ou une chaîne ISO.
 *
 * CISM n'expose que `datetime` (Unix). Le bot le convertit déjà
 * (`timeFromStamp`, radio-nowplaying-lib.js) ; sans équivalent ici, la sonde
 * navigateur écrasait l'heure calculée par le bot par une chaîne vide — d'où
 * un « À venir » sans heure dès que le poll client passait.
 */
function airClockFromStamp(value) {
  if (value == null || value === '') return '';
  let ms = NaN;
  if (typeof value === 'number' || /^\d{9,}$/.test(String(value))) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '';
    ms = n > 1e12 ? n : n * 1000;
  } else if (/^\d{4}-\d{2}-\d{2}T/.test(String(value))) {
    ms = Date.parse(String(value));
  } else {
    // Déjà « HH:MM » (ou « HH:MM:SS ») : normaliser sans conversion de fuseau.
    const m = /^(\d{1,2}):(\d{2})/.exec(String(value).trim());
    return m ? `${String(Number(m[1])).padStart(2, '0')}:${m[2]}` : '';
  }
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const tz = radioNowPlaying.timezone || radioSchedules.timezone || 'America/Toronto';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(ms));
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  let hour = parseInt(map.hour, 10);
  if (hour === 24 || Number.isNaN(hour)) hour = 0;
  const minute = parseInt(map.minute, 10) || 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseClientLivePayload(type, payload) {
  if (!payload) return null;
  if (type === 'cism-v1' || type === 'cism') {
    const cur = payload?.data?.current || payload?.current;
    const up = payload?.data?.upcoming || payload?.data?.next || payload?.upcoming;
    if (!cur?.title) return null;
    const show = (raw) => ({
      title: String(raw.title).trim(),
      host: String(raw.host || '').trim(),
      source: 'api-live',
      slug: String(raw.slug || '').trim(),
      start: airClockFromStamp(raw.datetime ?? raw.starts ?? raw.start),
      end: airClockFromStamp(raw.end ?? raw.ends),
    });
    return {
      current: show(cur),
      next: up?.title ? show(up) : null,
    };
  }
  // CHOQ / Craft /api/live : title+artist = PISTE uniquement
  if (type === 'craft-live' || type === 'craft' || type === 'choq') {
    const live = payload.live || payload;
    const showTitle = String(live?.show || live?.program || live?.emission || '').trim();
    const trackTitle = String(live?.title || live?.name || '').trim();
    const trackArtist = String(live?.artist || '').trim();
    let track = '';
    if (trackTitle && trackArtist && trackTitle.toLowerCase() !== trackArtist.toLowerCase()) {
      track = `${trackArtist} — ${trackTitle}`;
    } else {
      track = trackTitle || trackArtist;
    }
    if (showTitle) {
      return {
        current: {
          title: showTitle,
          host: String(live.host || live.dj || '').trim(),
          source: 'api-live',
        },
        next: null,
        track: track || '',
      };
    }
    if (!track) return null;
    return { current: null, next: null, track };
  }
  // Triton XML (souvent déjà parsé en texte si fetch renvoie xml — voir ci-dessous)
  if (type === 'triton-np' || type === 'triton') {
    return null; // géré dans fetchClientLivePoll (XML)
  }
  return null;
}

function parseTritonNowPlayingXml(xmlText = '') {
  const text = String(xmlText || '');
  if (!text.includes('nowplaying-info')) return null;
  const prop = (name) => {
    const re = new RegExp(
      `name="${name}"\\s*>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</property>`,
      'i',
    );
    const m = re.exec(text);
    return m ? String(m[1]).replace(/\s+/g, ' ').trim() : '';
  };
  const title = prop('cue_title') || prop('track_title') || prop('title');
  const artist = prop('track_artist_name') || prop('artist_name') || prop('artist');
  let track = '';
  if (title && artist && title.toLowerCase() !== artist.toLowerCase()) {
    track = `${artist} — ${title}`;
  } else {
    track = title || artist;
  }
  if (!track) return null;
  return { current: null, next: null, track };
}

/**
 * URL de re-poll : passe par le Worker de métadonnées (CORS + cache partagé).
 * Repli direct si le Worker est vide / hors service.
 */
function nowplayingFetchUrl(rawUrl) {
  const safe = safeHttpUrl(rawUrl, { allowHttp: true });
  if (!safe) return null;
  if (!NOWPLAYING_API_BASE) return safe;
  try {
    // Toujours HTTPS côté proxy
    const u = new URL(safe);
    if (u.protocol === 'http:') u.protocol = 'https:';
    return `${NOWPLAYING_API_BASE.replace(/\/+$/, '')}/v1/fetch?url=${encodeURIComponent(u.href)}`;
  } catch {
    return safe;
  }
}

async function fetchClientLivePoll(id, poll) {
  if (!poll?.url) return null;
  const isTriton = poll.type === 'triton-np' || poll.type === 'triton'
    || /tritondigital\.com|nowplaying/i.test(poll.url);
  const accept = isTriton ? 'application/xml, text/xml, */*' : 'application/json';

  async function attempt(url) {
    if (!url) return null;
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: accept },
    });
    if (!res.ok) return null;
    // Worker renvoie du JSON d'erreur { error: ... } si upstream KO
    const ctype = (res.headers.get('Content-Type') || '').toLowerCase();
    if (ctype.includes('application/json') && !isTriton) {
      const body = await res.json();
      if (body && body.error) return null;
      return parseClientLivePayload(poll.type, body);
    }
    if (isTriton || ctype.includes('xml') || ctype.includes('text/')) {
      const text = await res.text();
      // Erreur JSON du worker parfois en text/plain
      if (text.trimStart().startsWith('{') && text.includes('"error"')) return null;
      if (isTriton) return parseTritonNowPlayingXml(text);
      try {
        return parseClientLivePayload(poll.type, JSON.parse(text));
      } catch {
        return null;
      }
    }
    return parseClientLivePayload(poll.type, await res.json());
  }

  try {
    // 1) Worker cache + CORS
    let parsed = await attempt(nowplayingFetchUrl(poll.url));
    // 2) Repli direct (si l’API a déjà CORS, ex. certains endpoints)
    if (!parsed && NOWPLAYING_API_BASE) {
      parsed = await attempt(safeHttpUrl(poll.url, { allowHttp: true }));
    }
    if (!parsed) return null;
    if (!parsed.current?.title && !parsed.track) return null;
    return { id, ...parsed, checkedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

async function refreshStationLiveApis() {
  const stations = radioNowPlaying.stations || {};
  const jobs = Object.entries(stations)
    .filter(([, st]) => st?.clientPoll?.url)
    .map(([id, st]) => fetchClientLivePoll(id, st.clientPoll));
  if (!jobs.length) return;
  const results = await Promise.all(jobs);
  for (const raw of results) {
    if (!raw) continue;
    // Sonde navigateur = API station en direct, donc entités possibles.
    const hit = decodeNowPlayingStation(raw);
    const prev = radioNowPlaying.stations[hit.id] || {};
    const nextCurrent = hit.current?.title ? hit.current : (prev.current || null);
    const nextNext = hit.next?.title ? hit.next : (prev.next || null);
    const nextTrack = hit.track != null && hit.track !== ''
      ? hit.track
      : (prev.track || '');
    // Ne pas écraser une émission valide avec un poll piste-only
    radioNowPlaying.stations[hit.id] = {
      ...prev,
      id: hit.id,
      name: prev.name || radios.find((r) => r.id === hit.id)?.name || hit.id,
      current: nextCurrent,
      next: nextNext,
      track: nextTrack,
      showTitle: nextCurrent?.title || prev.showTitle || '',
      host: nextCurrent?.host || prev.host || '',
      source: nextCurrent?.source || prev.source || 'api-live',
      checkedAt: hit.checkedAt,
    };
  }
}

function syncNowPlayingPoll() {
  if (nowPlayingPollTimer) {
    clearInterval(nowPlayingPollTimer);
    nowPlayingPollTimer = null;
  }
  if (currentStation && getPlayableStream(currentStation) && isPlaybackActive()) {
    // 15 s : aligné sur CHOQ (REFRESHRATE 15s) pour la piste Triton CORS ;
    // le fichier bot reste le filet (émissions / grilles).
    nowPlayingPollTimer = setInterval(refreshNowPlayingCache, 15000);
    refreshNowPlayingCache();
  }
}

function buildTunerOptions() {
  TUNER_SELECT.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Syntoniser un poste…';
  placeholder.disabled = true;
  placeholder.selected = true;
  TUNER_SELECT.appendChild(placeholder);

  const groups = [
    { type: 'universite', label: 'Universités' },
    { type: 'cegep', label: 'Cégeps' },
  ];

  groups.forEach(({ type, label }) => {
    const inGroup = radios.filter((r) => r.type === type);
    if (!inGroup.length) return;
    const og = document.createElement('optgroup');
    og.label = label;
    inGroup.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `${r.name} · ${formatInstitutionDisplay(r.institution)}`;
      og.appendChild(opt);
    });
    TUNER_SELECT.appendChild(og);
  });
}

function bindTuner() {
  TUNER_SELECT.addEventListener('change', () => {
    const next = radios.find((r) => r.id === TUNER_SELECT.value);
    selectStation(TUNER_SELECT.value, {
      autoplay: !!getPlayableStream(next),
      openExternal: true,
    });
  });

  TUNER_PREV.addEventListener('click', () => stepStation(-1));
  TUNER_NEXT.addEventListener('click', () => stepStation(1));

  TUNER_PLAY.addEventListener('click', togglePlay);

  const onVolumeInput = (e) => {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) return;
    // Curseur > 0 annule le mute local ; publier pour que le leader suive.
    setSharedVolume(v, {
      muted: v <= 0.001 ? true : false,
      publish: true,
    });
  };
  TUNER_VOLUME.addEventListener('input', onVolumeInput);
  // change : certains navigateurs ne répètent pas input à la fin du glisser.
  TUNER_VOLUME.addEventListener('change', onVolumeInput);

  initVolumeRangeBounds();
  bindVolumePopover();
  bindVolumePopoverMute();
  bindVolumeSliderLayout();
  bindVolumeSliderDrag();
}

/**
 * Sans Web Audio : range 0–100 %, zone boost et repère 200 % masqués.
 * Avec Web Audio (y compris mobile) : curseur 0–200 % toujours visible.
 */
function initVolumeRangeBounds() {
  if (!TUNER_VOLUME || GAIN_UI_MAX >= MAX_GAIN) return;
  TUNER_VOLUME.max = String(GAIN_UI_MAX);
  TUNER_VOLUME.setAttribute('aria-label', 'Volume — 0 % à gauche, 100 % à droite');
  TUNER_VOL?.classList.add('tuner-vol--no-boost');
}

function bindVolumeSliderLayout() {
  const track = TUNER_VOLUME?.closest('.tuner-vol-track');
  if (!track || volSliderResizeObs) return;
  const schedule = () => requestAnimationFrame(() => updateVolumeSliderVisual());
  volSliderResizeObs = new ResizeObserver(schedule);
  volSliderResizeObs.observe(track);
  const inner = track.closest('.tuner-inner');
  if (inner) volSliderResizeObs.observe(inner);
  window.addEventListener('resize', schedule, { passive: true });
  onMediaQueryChange(VOL_COMPACT, schedule);
  schedule();
}

// Sous 1100 px, le curseur est masqué : l'icône ouvre une bulle (libère le synthétiseur).
function bindVolumePopover() {
  if (!TUNER_VOL_TOGGLE) return;
  const close = () => {
    if (!TUNER_VOL.classList.contains('is-open')) return;
    TUNER_VOL.classList.remove('is-open');
    TUNER_VOL_TOGGLE.setAttribute('aria-expanded', 'false');
  };

  TUNER_VOL_TOGGLE.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isVolCompactMode()) {
      const open = TUNER_VOL.classList.toggle('is-open');
      TUNER_VOL_TOGGLE.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        requestAnimationFrame(() => {
          updateVolumeSliderVisual();
          requestAnimationFrame(() => updateVolumeSliderVisual());
        });
      }
      return;
    }
    toggleVolumeMute();
  });

  document.addEventListener('click', (e) => {
    if (volumeSliderDragging) return;
    if (!TUNER_VOL.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  // En repassant en mode large, on referme proprement la bulle.
  const onVolLayoutChange = (e) => {
    if (!e.matches) close();
    updateVolumeUI();
  };
  onMediaQueryChange(IS_TUNER_EMBED ? EMBED_VOL_POPOVER_MQ : VOL_COMPACT, onVolLayoutChange);
}

function bindVolumePopoverMute() {
  if (!TUNER_VOL_MUTE) return;
  TUNER_VOL_MUTE.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleVolumeMute();
  });
}

/** Glissement tactile fiable (le range natif opacity:0 glisse mal au doigt). */
function bindVolumeSliderDrag() {
  const slider = TUNER_VOLUME?.closest('.tuner-vol-slider');
  const track = TUNER_VOLUME?.closest('.tuner-vol-track');
  if (!slider || !track || !TUNER_VOLUME) return;

  const setGainFromClientX = (clientX) => {
    const rect = slider.getBoundingClientRect();
    const thumbPx = getVolThumbPx(track);
    const travel = Math.max(rect.width - thumbPx, 1);
    const x = Math.min(Math.max(clientX - rect.left - thumbPx / 2, 0), travel);
    const ratio = x / travel;
    const stepped = Math.round(ratio * GAIN_UI_MAX / 0.02) * 0.02;
    const clamped = Math.min(GAIN_UI_MAX, Math.max(0, stepped));
    if (Math.abs(parseFloat(TUNER_VOLUME.value) - clamped) < 0.001) return;
    TUNER_VOLUME.value = String(clamped);
    TUNER_VOLUME.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const endDrag = (e) => {
    if (!volumeSliderDragging) return;
    track.classList.remove('is-dragging');
    try { slider.releasePointerCapture(e.pointerId); } catch (_) {}
    // Retarde la fin pour éviter que le clic document referme la bulle.
    setTimeout(() => { volumeSliderDragging = false; }, 80);
  };

  slider.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    volumeSliderDragging = true;
    track.classList.add('is-dragging');
    slider.setPointerCapture(e.pointerId);
    setGainFromClientX(e.clientX);
  }, { passive: false });

  slider.addEventListener('pointermove', (e) => {
    if (!volumeSliderDragging) return;
    setGainFromClientX(e.clientX);
  });

  slider.addEventListener('pointerup', endDrag);
  slider.addEventListener('pointercancel', endDrag);
}

function getVolThumbPx(track) {
  if (!track) return VOL_THUMB_PX;
  const raw = getComputedStyle(track).getPropertyValue('--vol-thumb').trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : VOL_THUMB_PX;
}

function currentIndex() {
  if (!currentStation) return -1;
  return radios.findIndex(r => r.id === currentStation.id);
}

function stepStation(dir) {
  if (!radios.length) return;
  let idx = currentIndex();
  idx = idx === -1 ? (dir > 0 ? 0 : radios.length - 1) : (idx + dir + radios.length) % radios.length;
  const next = radios[idx];
  TUNER_SELECT.value = next.id;
  selectStation(next.id, { autoplay: tunerShouldAutoplayNative(next) });
}

function getMarqueeAvailableWidth(el) {
  if (!el) return 0;
  const style = getComputedStyle(el);
  const padL = parseFloat(style.paddingLeft) || 0;
  const padR = parseFloat(style.paddingRight) || 0;
  return Math.max(0, el.clientWidth - padL - padR);
}

function ensureMarqueeObserved(el) {
  if (!marqueeResizeObs || !el || marqueeObservedEls.has(el)) return;
  marqueeObservedEls.add(el);
  marqueeResizeObs.observe(el);
}

function registerFilterMarqueeObservers() {
  if (!NEWS_FILTERS) return;
  NEWS_FILTERS.querySelectorAll('.filter-btn').forEach((btn) => {
    ensureMarqueeObserved(btn);
    const inst = btn.querySelector('.filter-btn__inst');
    if (inst) ensureMarqueeObserved(inst);
  });
}

function scheduleFilterMarqueeRefresh() {
  scheduleMarqueeRefresh();
  if (filterMarqueeResyncTimer) clearTimeout(filterMarqueeResyncTimer);
  filterMarqueeResyncTimer = setTimeout(() => {
    filterMarqueeResyncTimer = null;
    scheduleMarqueeRefresh();
  }, FILTER_MARQUEE_RESYNC_MS);
}

function getFilterInstMarqueeElements() {
  return NEWS_FILTERS
    ? [...NEWS_FILTERS.querySelectorAll('.filter-btn__inst')]
    : [];
}

function getMarqueeElements() {
  return [
    TUNER_NAME,
    TUNER_SUB,
    TUNER_SUB_AIR,
    TUNER_NOWAIR_TITLE,
    TUNER_NOWAIR_SUB,
    ...getFilterInstMarqueeElements(),
  ].filter(Boolean);
}

/** Adapte un libellé UI à la langue Radar active (glossaire / MT déjà posé). */
function adaptRadarUiText(text = '') {
  if (window.RadarTranslate?.displayUiText) {
    return RadarTranslate.displayUiText(text);
  }
  return text;
}

function adaptRadarInstitutionLabel(text = '') {
  if (window.RadarTranslate?.displayInstitutionLabel) {
    return RadarTranslate.displayInstitutionLabel(text);
  }
  return text;
}

/** Défilement doux sur le libellé d'institution des pastilles sources. */
function applyFilterInstMarquees() {
  if (!NEWS_FILTERS) return;
  NEWS_FILTERS.querySelectorAll('.filter-btn').forEach((btn) => {
    const instEl = btn.querySelector('.filter-btn__inst');
    if (!instEl) return;
    const src = btn.dataset.source;
    if (src === 'all') {
      // UI — se traduit avec la langue active (ne pas figer le FR)
      applyMarquee(instEl, adaptRadarUiText('Toutes les sources'));
      return;
    }
    const { institution, type } = sourceInfo(src);
    const instLabel = filterSourceInstitutionLabel(institution, type, src);
    // Établissement : localisable hors Original/FR/EN ; médias restent notranslate.
    applyMarquee(instEl, adaptRadarInstitutionLabel(instLabel || ''));
  });
}

function measureMarquee(el) {
  if (!el || PREFERS_REDUCED_MOTION?.matches) return;

  const span = el.querySelector('.tuner-now-sub-text');
  if (!span) return;

  // Wide : texte fixe. Bureau ≥1100 : le titre d’antenne passe sur 2 lignes
  // au lieu de défiler (phrases CHOQ / longues émissions).
  const nowAirWrap = el === TUNER_NOWAIR_TITLE || el === TUNER_NOWAIR_SUB;
  if (isWideNoMarqueeMode() || (nowAirWrap && isNowAirTwoLineMode())) {
    el.classList.remove('is-marquee');
    el.style.removeProperty('--marquee-shift');
    el.style.removeProperty('--marquee-duration');
    el.style.removeProperty('--marquee-delay');
    el.style.removeProperty('--marquee-trips');
    return;
  }

  const available = getMarqueeAvailableWidth(el);
  if (!available) return;

  const overflow = span.scrollWidth - available;
  if (overflow <= 2) {
    el.classList.remove('is-marquee');
    el.style.removeProperty('--marquee-shift');
    el.style.removeProperty('--marquee-duration');
    el.style.removeProperty('--marquee-delay');
    el.style.removeProperty('--marquee-trips');
    return;
  }

  // Arrondi au pixel : `available` dérive d'un padding calculé, souvent
  // fractionnaire. Un décalage à la virgule fait reposer le texte entre deux
  // pixels, et le compositeur le rééchantillonne — c'est flou précisément aux
  // deux extrémités, là où l'animation marque une pause pour qu'on lise.
  const distance = Math.round(overflow + 12);
  const duration = Math.max(7, distance / 16);
  const oneWayMs = duration * 1000;
  let readMs = TUNER_SUB_ROTATE_MS;
  if (TUNER_SUB_ROTATE_MQ?.matches) {
    if (TUNER_SUB_ROTATE_VERY_NARROW_MQ?.matches) readMs = TUNER_SUB_ROTATE_VERY_NARROW_MS;
    else if (TUNER_SUB_ROTATE_NARROW_MQ?.matches) readMs = TUNER_SUB_ROTATE_NARROW_MS;
  }
  const trips = marqueeAlternateCount(oneWayMs, readMs);
  el.style.setProperty('--marquee-shift', `-${distance}px`);
  el.style.setProperty('--marquee-duration', `${duration.toFixed(1)}s`);
  el.style.setProperty('--marquee-delay', `${(MARQUEE_READ_DELAY_MS / 1000).toFixed(1)}s`);
  el.style.setProperty('--marquee-trips', String(trips));
  el.classList.add('is-marquee');
}

/** Mesure après layout (double rAF) ; réessaie si la largeur n'est pas encore stable. */
function scheduleMarqueeMeasure(el, attempt = 0) {
  if (!el || attempt > 4) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const span = el.querySelector('.tuner-now-sub-text');
      if (!span || PREFERS_REDUCED_MOTION?.matches) return;

      const available = getMarqueeAvailableWidth(el);
      if (!available) {
        scheduleMarqueeMeasure(el, attempt + 1);
        return;
      }

      measureMarquee(el);

      const overflow = span.scrollWidth - available;
      const shouldMarquee = overflow > 2;
      const hasMarquee = el.classList.contains('is-marquee');
      if (attempt < 4 && shouldMarquee !== hasMarquee) {
        scheduleMarqueeMeasure(el, attempt + 1);
      }
    });
  });
}

function refreshAllMarquees() {
  marqueeResizeScheduled = false;
  getMarqueeElements().forEach((el) => {
    const text = marqueeTextByEl.get(el);
    if (text == null) return;
    if (PREFERS_REDUCED_MOTION?.matches) return;
    if (!el.querySelector('.tuner-now-sub-text')) {
      applyMarquee(el, text);
      return;
    }
    scheduleMarqueeMeasure(el);
  });
}

function scheduleMarqueeRefresh() {
  if (marqueeResizeScheduled) return;
  marqueeResizeScheduled = true;
  requestAnimationFrame(refreshAllMarquees);
}

function initMarqueeResizeListeners() {
  if (marqueeResizeObs || typeof ResizeObserver === 'undefined') return;

  marqueeResizeObs = new ResizeObserver(scheduleMarqueeRefresh);

  const observeTargets = new Set(getMarqueeElements());
  [
    TUNER_SUB?.parentElement,
    TUNER_SUB?.closest('.tuner-now'),
    TUNER_SUB?.closest('.tuner-dial'),
    TUNER?.querySelector('.tuner-inner'),
    TUNER_NOWAIR,
    TUNER_NOWAIR?.querySelector('.tuner-nowair-body'),
    NEWS_FILTERS,
    FILTERS_PANEL,
  ].forEach((el) => { if (el) observeTargets.add(el); });

  observeTargets.forEach((el) => ensureMarqueeObserved(el));
  registerFilterMarqueeObservers();

  NEWS_FILTERS?.addEventListener('transitionend', (e) => {
    const t = e.target;
    if (t?.classList?.contains('filter-btn') && e.propertyName === 'flex-basis') {
      scheduleFilterMarqueeRefresh();
    }
  });

  FILTERS_PANEL?.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'max-height') scheduleFilterMarqueeRefresh();
  });

  window.addEventListener('resize', scheduleMarqueeRefresh, { passive: true });
  onMediaQueryChange(PREFERS_REDUCED_MOTION, () => {
    getMarqueeElements().forEach((el) => {
      const text = marqueeTextByEl.get(el);
      if (text != null) applyMarquee(el, text);
    });
  });
}

/**
 * Affiche un texte sur une seule ligne et, s'il dépasse de son conteneur,
 * l'anime en défilement doux droite → gauche (sinon ellipsis). Réutilisé par
 * le sous-titre du syntoniseur et par le module « À l'antenne ».
 */
function applyMarquee(el, text) {
  if (!el) return;
  const value = String(text ?? '').trim();
  el.classList.remove('is-marquee');
  el.style.removeProperty('--marquee-shift');
  el.style.removeProperty('--marquee-duration');
  el.style.removeProperty('--marquee-delay');
  el.style.removeProperty('--marquee-trips');

  if (!value) {
    marqueeTextByEl.delete(el);
    el.replaceChildren();
    return;
  }

  marqueeTextByEl.set(el, value);

  if (PREFERS_REDUCED_MOTION?.matches) {
    el.textContent = value;
    return;
  }

  const span = document.createElement('span');
  span.className = 'tuner-now-sub-text';
  span.textContent = value;
  el.replaceChildren(span);

  scheduleMarqueeMeasure(el);
}

function setTunerNameText(text, crossfade = false) {
  if (!TUNER_NAME) return;
  if (!crossfade || PREFERS_REDUCED_MOTION?.matches) {
    applyMarquee(TUNER_NAME, text);
    return;
  }
  TUNER_NAME.classList.add('is-crossfading');
  setTimeout(() => {
    applyMarquee(TUNER_NAME, text);
    requestAnimationFrame(() => TUNER_NAME.classList.remove('is-crossfading'));
  }, NOW_AIR_CROSSFADE_MS);
}

/** Sous-titre du syntoniseur (fréquence · institution au complet). */
function setTunerSubText(text) {
  tunerSubMeta = text;
  applyMarquee(TUNER_SUB, text);
}

function selectStation(id, { autoplay = false, openExternal = false, fromSync = false } = {}) {
  const radio = radios.find(r => r.id === id);
  if (!radio) return;

  const prevId = currentStation?.id || null;
  currentStation = radio;
  if (!fromSync) userPickedStation = true;
  // Garder la liste déroulante alignée (hydratation multi-onglets, prev/next, deep-link).
  if (TUNER_SELECT && TUNER_SELECT.value !== radio.id) {
    TUNER_SELECT.value = radio.id;
  }

  // Changement de poste : repartir de la phase 1 (émission en cours) + fondu
  // antenne, sinon le nouveau poste hérite de l'index du précédent.
  stopAirPanelRotate();
  stopTunerSubRotate();
  airPhaseIndex = 0;
  dialRotateSlotB = false;
  if (prevId !== radio.id) {
    cancelLoudnessProbe();
    nowAirCrossfadePending = true;
  }

  const playable = getPlayableStream(radio);
  const external = isExternalListen(radio);

  if (isDialCompactLayout()) {
    // Mobile / embed étroit : L1 = poste · acronyme ; L2 = première phase
    // (l'émission en cours), que renderTunerNowAir() enchaîne juste après.
    setTunerNameText(compactDialTitleLine(radio));
    tunerSubMeta = dialCompactMetaLineForRadio(radio);
    const firstLine = dialPhaseLinesForRadio(radio)[0] || tunerSubMeta;
    TUNER_SUB?.parentElement?.classList.toggle('is-empty', !firstLine);
    resetDialRotateSlots(firstLine);
  } else if (isWideTunerLayout()) {
    // Wide E : institution complète + poste + slogan complet (pas d’acronyme).
    paintWideDial(radio);
  } else {
    // Bureau (+ embed large) : L1 = poste FM · acronyme ; L2 = slogan
    setTunerNameText(tunerDesktopTitleLine(radio));
    setTunerSubText(tunerDesktopSubLine(radio, { external }));
  }

  // Mettre à jour l’antenne tout de suite (avant play async / métadonnées)
  renderTunerNowAir();

  TUNER_PLAY.disabled = !playable && !external;
  TUNER_PLAY.title = playable
    ? 'Écouter'
    : external
      ? 'Écouter sur le site du poste (fenêtre externe)'
      : 'Flux direct indisponible';

  updateMediaSession(radio);

  if (!playable) {
    window.RadarCast?.endSession?.();
    stopPlayback({ keepStation: true });
    updatePlayUI();
    if (external && openExternal) openListenWindow(radio);
    return;
  }

  window.RadarCast?.onStationChange?.();

  if (autoplay) {
    // Autre onglet possède déjà le flux : publier le nouveau poste pour que
    // le leader bascule, sans voler l’audio (sinon silence côté « lecteur
    // principal » et double claim fragiles).
    if (!fromSync && isRemoteSessionActive()) {
      try {
        window.RadarPlayerSync?.publishStation?.(radio.id);
      } catch { /* */ }
      syncRemotePlaying = true;
      updatePlayUI();
    } else {
      play(radio);
    }
  } else {
    updatePlayUI();
  }

  // Keep shared station id in sync when the user picks a post (not remote apply).
  if (!fromSync && !window.RadarPlayerSync?.isApplyingRemote?.()) {
    try {
      const s = window.RadarPlayerSync?.readState?.();
      // En session distante, publishStation (ci-dessus) a déjà posé le stationId.
      if (!s?.playing) {
        window.RadarPlayerSync?.writeState?.({
          stationId: radio.id,
          playing: false,
          volume: currentGain,
          muted: volumeMuted,
          leaderId: window.RadarPlayerSync.getTabId(),
        });
      }
    } catch { /* */ }
  }
}

function togglePlay() {
  if (isNowAirPanelPreviewMode() && nowAirPreviewRadio) {
    selectStation(nowAirPreviewRadio.id, {
      autoplay: !isExternalListen(nowAirPreviewRadio),
      openExternal: isExternalListen(nowAirPreviewRadio),
    });
    return;
  }
  if (!currentStation) {
    const first = radios.find(r => getPlayableStream(r)) || radios[0];
    if (!first) return;
    TUNER_SELECT.value = first.id;
    selectStation(first.id, { autoplay: !isExternalListen(first), openExternal: isExternalListen(first) });
    return;
  }
  if (isExternalListen(currentStation)) {
    openListenWindow(currentStation);
    return;
  }
  // Pendant la connexion, un second appui annule nettement la tentative.
  if (isBuffering) {
    stopPlayback({ keepStation: true });
    return;
  }
  // Cast actif : pause/reprise distante (ne pas relancer le flux local en double).
  if (window.RadarCast?.isChromecasting?.()) {
    if (window.RadarCast.isRemotePlaying?.()) {
      pauseByUser();
    } else {
      userPaused = false;
      window.RadarCast.resumeRemote?.();
      mobilePlayback?.onPlayStart();
      updatePlayUI();
    }
    return;
  }
  // Another tab owns audio: ▶/⏸ control the shared session.
  // Only treat as global pause when a *live* peer was confirmed — otherwise a
  // ghost localStorage session would swallow the first click as "pause".
  if (syncRemotePlaying && !window.RadarPlayerSync?.isLeader?.()) {
    if (isPlaying() || isCasting()) {
      pauseByUser();
    } else if (remoteLeaderConfirmed) {
      pauseByUser();
    } else {
      userPaused = false;
      play(currentStation);
    }
    return;
  }
  if (isPlaybackActive()) {
    pauseByUser();
  } else {
    userPaused = false;
    play(currentStation);
  }
}

async function play(radio) {
  const url = getPlayableStream(radio);
  if (!url) return;
  userPaused = false;
  syncRemotePlaying = false;
  remoteLeaderConfirmed = false;

  // Claim leadership first so other same-origin players mute immediately.
  try {
    window.RadarPlayerSync?.claimPlay?.(radio.id, currentGain, volumeMuted);
  } catch { /* */ }

  // Reprise Cast plutôt que double lecture locale + distante.
  if (window.RadarCast?.isChromecasting?.()) {
    window.RadarCast.resumeRemote?.();
    mobilePlayback?.onPlayStart();
    updatePlayUI();
    return;
  }

  // Branche (ou non) le graphe d'amplification selon le gain demandé et le poste.
  const tuning = STATION_PLAYBACK[radio.id] || {};
  syncBoostWiring({ station: radio, allowUnwire: true });
  reconnectTries = 0;
  mobilePlayback?.resetReconnectTries();
  audio.preload = mobilePlayback?.getMobilePreload(!!tuning.resilient)
    ?? (tuning.resilient ? 'auto' : 'none');
  try {
    if (audioCtx && audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch {} }
    if (audio.src !== url) audio.src = url;
    setBuffering(true);
    updatePlayUI();
    syncMediaSessionPlaybackState();
    syncMediaSessionLivePosition();
    await audio.play();
    mobilePlayback?.onPlayStart();
    syncMediaSessionPlaybackState();
    applyGain();
    armPlayerSession();
    updatePlayUI();
    try {
      window.RadarPlayerSync?.claimPlay?.(radio.id, currentGain, volumeMuted);
    } catch { /* */ }
  } catch {
    // Autoplay / gesture refusée : l’UI play reste inactive ; pas de toast (bruit inutile).
    setBuffering(false);
    updatePlayUI();
  }
}

function stopPlayback({ keepStation = false } = {}) {
  reconnectTries = 0;
  cancelLoudnessProbe();
  userPaused = false;
  setBuffering(false);
  mobilePlayback?.onPlayStop();
  window.RadarCast?.endSession?.();
  if (audio) {
    suppressAudioError = true;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    suppressAudioError = false;
  }
  if (!keepStation) currentStation = null;
  updatePlayUI();
}

function isPlaying() {
  return audio && !audio.paused && !!audio.src;
}

function isCasting() {
  return !!window.RadarCast?.isCasting?.();
}

function isPlaybackActive() {
  // Cast en pause distante : session active mais pas « en lecture ».
  if (window.RadarCast?.isChromecasting?.()) {
    return !!window.RadarCast.isRemotePlaying?.();
  }
  // Follower tab: show as playing only when another *live* context owns the stream.
  // Ghost sessions (localStorage playing, dead leader) must not look active.
  if (syncRemotePlaying && !isPlaying()) return remoteLeaderConfirmed;
  return isPlaying() || isCasting();
}

function updatePlayUI() {
  const active = isPlaybackActive();
  const audible = active && !isBuffering;
  const external = !!currentStation && isExternalListen(currentStation);
  ICO_PLAY.classList.toggle('hidden', audible || external || isBuffering);
  ICO_PAUSE.classList.toggle('hidden', !audible || isBuffering);
  ICO_EXTERNAL?.classList.toggle('hidden', !external || audible || isBuffering);
  TUNER_PLAY.classList.toggle('is-buffering', isBuffering);
  TUNER_PLAY.classList.toggle('is-external', external && !audible && !isBuffering);
  TUNER.classList.toggle('is-playing', audible);
  syncSeoSchedulePlayback();
  TUNER.classList.toggle('is-buffering', isBuffering);
  TUNER.classList.toggle('is-external', external && !audible && !isBuffering);
  if (isBuffering) {
    TUNER_PLAY.title = 'Connexion au flux — appuyer pour annuler';
    TUNER_PLAY.setAttribute('aria-label', 'Connexion au flux — appuyer pour annuler');
  } else {
    const actionLabel = audible ? 'Mettre en pause' : (external ? 'Écouter sur le site du poste' : 'Écouter');
    TUNER_PLAY.title = actionLabel;
    TUNER_PLAY.setAttribute('aria-label', actionLabel);
  }
  // État observable pour tests et shell (indépendant du timing de la classe CSS).
  document.documentElement.dataset.radarBuffering = isBuffering ? '1' : '0';
  // Signal for nav-shell (Phase 2b): local stream actually playing on this page.
  if (isPlaying()) {
    document.documentElement.dataset.radarPlaying = '1';
  } else if (!syncRemotePlaying) {
    disarmPlayerSessionPlayingFlag();
  } else {
    document.documentElement.dataset.radarPlaying = '0';
  }
  renderTunerNowAir();
  syncNowPlayingPoll();
  syncMediaSessionPlaybackState();
  window.RadarCast?.updateButton?.();
}

/**
 * Faut-il brancher le graphe Web Audio (gain > 1 possible) ?
 * - Bureau : oui dès que Web Audio existe (CORS testé au premier play).
 * - Mobile : seulement si le curseur dépasse 100 % — évite de forcer
 *   crossOrigin + AudioContext pour une écoute « normale », tout en
 *   permettant le 200 % sur téléphone / tablette quand l'utilisateur le demande.
 */
function wantsAudioBoost() {
  if (!webAudioSupported) return false;
  // iOS : audio.volume est en lecture seule — l'atténuation (< 100 %) doit
  // aussi passer par le gain Web Audio, sinon le curseur n'a aucun effet.
  if (IS_IOS) return Math.abs(currentGain - 1) > 0.001;
  if (MOBILE_PLAYBACK) return currentGain > 1.001;
  return true;
}

/**
 * Aligne le graphe d'amplification sur le gain / poste courants.
 * Sur mobile, une fois branché on évite de démonter juste parce que le gain
 * redescend ≤ 100 % (rebuild de l'<audio> = perte de session Android).
 */
function syncBoostWiring({ station = currentStation, allowUnwire = false } = {}) {
  if (!station) return;
  const tuning = STATION_PLAYBACK[station.id] || {};
  const wantBoost = wantsAudioBoost()
    && !boostUnavailable.has(station.id)
    && !tuning.noBoost;

  if (wantBoost === boostWired) return;
  // Garder le graphe si on est déjà amplifié et que le démontage n'est pas
  // explicitement autorisé (changement de poste / play()).
  if (boostWired && !wantBoost && !allowUnwire) return;

  const wasPlaying = !!(audio && !audio.paused && audio.src);
  const url = (audio && audio.src)
    || getPlayableStream(station)
    || '';

  rebuildAudio(wantBoost);

  if (!url || !audio) return;
  try {
    if (audio.src !== url) audio.src = url;
    if (wasPlaying) {
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  } catch {}
}

function getPlayerElement() {
  let el = document.getElementById('radar-player');
  if (!el) {
    el = document.createElement('audio');
    el.id = 'radar-player';
    el.preload = 'none';
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    // Android / Chrome : session longue durée (radio live), pas de téléchargement.
    el.setAttribute('x-webkit-airplay', 'allow');
    try { el.disableRemotePlayback = false; } catch {}
    el.controls = false;
    el.classList.add('sr-only');
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  return el;
}

function pauseForCast() {
  if (!audio) return;
  mobilePlayback?.stopKeepalive();
  suppressAudioError = true;
  try { audio.pause(); } catch {}
  suppressAudioError = false;
  updatePlayUI();
}

function pauseByUser() {
  userPaused = true;
  setBuffering(false);
  syncRemotePlaying = false;
  remoteLeaderConfirmed = false;
  // Cast : pause distante (ou fin de session si le LIVE ne gère pas pause).
  // Ne pas appeler endSession ici — le bouton Cast sert à arrêter la diffusion.
  if (window.RadarCast?.isChromecasting?.()) {
    window.RadarCast.pauseRemote?.();
  }
  mobilePlayback?.onUserPause();
  if (audio) {
    suppressAudioError = true;
    try { audio.pause(); } catch {}
    suppressAudioError = false;
  }
  try {
    window.RadarPlayerSync?.publishPause?.(currentStation?.id, currentGain, volumeMuted);
  } catch { /* */ }
  updatePlayUI();
}

function syncMediaSessionPlaybackState() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = isPlaybackActive() ? 'playing' : 'paused';
}

function syncMediaSessionLivePosition() {
  if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
  try {
    navigator.mediaSession.setPositionState({
      duration: Number.POSITIVE_INFINITY,
      playbackRate: 1,
      position: 0,
    });
  } catch {}
}

function initMobilePlayback() {
  if (mobilePlayback || !window.RadarMobilePlayback) return;
  mobilePlayback = RadarMobilePlayback.create({
    getPlayer: () => audio,
    getStation: () => currentStation,
    isUserPaused: () => userPaused,
    isPlaying,
    isExternalListen,
    isCasting,
    isStationResilient: () => !!currentTuning().resilient,
    playStation: play,
    getStreamUrl: getPlayableStream,
    syncMediaSession: () => {
      syncMediaSessionPlaybackState();
      syncMediaSessionLivePosition();
    },
    ensureNativePlayback: () => {
      // Ne plus démonter le graphe d'amplification ici : rebuildAudio() recréait
      // l'<audio>, tuait la Media Session Android et coupait le 200 %.
      // On se contente de relancer l'AudioContext si besoin.
      if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
    },
    resumeAudioCtx: () => {
      if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
    },
    performReconnect: () => mobilePlayback?.attemptReconnect(),
    setSuppressErrors: (v) => { suppressAudioError = v; },
    // Une seule invitation discrète si Android refuse le play() sans geste
    // (pas de spam : le contrôleur mobile gate déjà « une fois / session »).
    onPlayBlocked: () => {
      try {
        const en = window.RadarTranslate?.getMode?.() === 'en';
        showToast(en
          ? 'Tap ▶ to resume the radio (browser paused background audio).'
          : 'Touchez ▶ pour relancer la radio (le navigateur a suspendu l’audio).');
      } catch {
        showToast('Touchez ▶ pour relancer la radio.');
      }
    },
    // Après longue absence : flux rechargé pour coller au live (évite le
    // « rattrapage » décalé du buffer périmé).
    onLiveResync: () => {
      try {
        const en = window.RadarTranslate?.getMode?.() === 'en';
        showToast(en
          ? 'Back on the live stream (synced after background pause).'
          : 'Retour au direct (flux resynchronisé après pause en arrière-plan).');
      } catch {
        showToast('Retour au direct — flux resynchronisé.');
      }
    },
  });
  mobilePlayback.setupLifecycle();
}

// ─── Audio engine ──────────────────────────────────────────────────────────────
function attachAudioListeners(el) {
  if (playerListenersAttached.has(el)) return;
  playerListenersAttached.add(el);
  const enterBuffering = () => {
    // Ces événements ne proviennent d'un <audio> que lorsqu'un flux est en
    // cours de préparation; `currentStation` couvre aussi l'instant où le
    // navigateur normalise l'URL de src.
    if (!userPaused && !syncRemotePlaying && (el.src || currentStation)) {
      setBuffering(true);
      updatePlayUI();
    }
  };
  el.addEventListener('loadstart', enterBuffering);
  el.addEventListener('waiting', enterBuffering);
  el.addEventListener('stalled', enterBuffering);
  el.addEventListener('play',    updatePlayUI);
  el.addEventListener('pause',   () => {
    setBuffering(false);
    updatePlayUI();
  });
  el.addEventListener('ended',   onAudioEnded);
  el.addEventListener('playing', onAudioPlaying);
  el.addEventListener('error',   onAudioError);
  mobilePlayback?.attachToPlayer(el);
}

function currentTuning() {
  return (currentStation && STATION_PLAYBACK[currentStation.id]) || {};
}

function onAudioPlaying() {
  reconnectTries = 0;
  setBuffering(false);
  scheduleLoudnessProbe();
  mobilePlayback?.onPlaying();
  updatePlayUI();
}

function onAudioEnded() {
  setBuffering(false);
  if (mobilePlayback?.shouldHandleEnded() && mobilePlayback.attemptReconnect()) return;
  updatePlayUI();
}

function reconnectResilient() {
  // Reconnexion silencieuse — les toasts « flux instable » étaient des faux positifs.
  mobilePlayback?.attemptReconnect();
  updatePlayUI();
}

function onAudioError() {
  setBuffering(false);
  if (suppressAudioError) { updatePlayUI(); return; }
  // Poste résilient qui jouait déjà : coupure réseau → reconnexion douce
  // (currentTime > 0 distingue une vraie coupure d'un échec CORS au démarrage).
  if (mobilePlayback?.shouldHandleError(audio?.currentTime ?? 0)) {
    reconnectResilient();
    return;
  }
  // En mode amplifié, un flux sans en-tête CORS fait échouer l'élément <audio>
  // « anonymous ». On le note et on retombe une fois en lecture native simple.
  if (boostWired && currentStation && !boostUnavailable.has(currentStation.id)) {
    boostUnavailable.add(currentStation.id);
    if (currentGain > 1.001) {
      showToast('Amplification indisponible pour ce poste — volume plafonné à 100 %.');
    } else if (IS_IOS && currentGain < 0.999) {
      // Sans Web Audio, iOS ignore audio.volume : le niveau reste à 100 %.
      showToast('Volume non réglable pour ce poste sur iPhone/iPad — utilise les boutons physiques.');
    }
    rebuildAudio(false);
    play(currentStation);
    return;
  }
  // Erreur audio : UI mise à jour sans toast — le flux reprend souvent tout seul.
  updatePlayUI();
}

/** Niveau correctif propre à un poste (1 = aucun changement). */
function stationTrim(station = currentStation) {
  if (!station?.id) return 1;
  const value = stationTrims.get(station.id);
  return Number.isFinite(value) ? Math.min(1, Math.max(0.55, value)) : 1;
}

function saveStationTrims() {
  try {
    localStorage.setItem(STATION_TRIMS_KEY, JSON.stringify(Object.fromEntries(stationTrims)));
  } catch { /* stockage indisponible : le réglage reste valable pour la session */ }
}

function loadStationTrims() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATION_TRIMS_KEY) || '{}');
    if (!saved || typeof saved !== 'object') return;
    Object.entries(saved).forEach(([id, value]) => {
      if (Number.isFinite(value) && value >= 0.55 && value <= 1) stationTrims.set(id, value);
    });
  } catch { /* valeur ancienne/corrompue : ignorer */ }
}

function cancelLoudnessProbe() {
  if (loudnessProbeTimer) clearInterval(loudnessProbeTimer);
  loudnessProbeTimer = null;
  loudnessProbeStationId = null;
}

function averageRmsDb(samples) {
  if (!samples.length) return null;
  const meanSquare = samples.reduce((sum, value) => sum + value * value, 0) / samples.length;
  return meanSquare > 0 ? 10 * Math.log10(meanSquare) : null;
}

/**
 * Mesure courte, une seule fois par poste et par session de lecture.
 * On ne fait jamais d'AGC qui pompe : un flux vraiment fort reçoit seulement
 * une réduction durable. Les flux CORS incompatibles restent en lecture native.
 */
function scheduleLoudnessProbe() {
  cancelLoudnessProbe();
  if (!boostWired || !analyserNode || !currentStation?.id || !audio || audio.paused) return;

  const stationId = currentStation.id;
  const values = [];
  const buffer = new Float32Array(analyserNode.fftSize);
  let ticks = 0;
  loudnessProbeStationId = stationId;
  loudnessProbeTimer = setInterval(() => {
    if (!audio || audio.paused || currentStation?.id !== stationId || !analyserNode) {
      cancelLoudnessProbe();
      return;
    }
    analyserNode.getFloatTimeDomainData(buffer);
    let squareSum = 0;
    for (let i = 0; i < buffer.length; i += 1) squareSum += buffer[i] * buffer[i];
    values.push(squareSum / buffer.length);
    ticks += 1;
    // Ne garder qu'une courte fenêtre, après que le flux se soit stabilisé.
    if (ticks < 18) return;
    cancelLoudnessProbe();

    const db = averageRmsDb(values);
    if (!Number.isFinite(db)) return;
    // -16 dBFS et plus fort est déjà très dense. La réduction est graduelle,
    // plafonnée à 45 %, et seulement vers le bas pour respecter l'intention.
    const target = db > -11 ? 0.68 : db > -16 ? 0.80 : db > -20 ? 0.90 : 1;
    const existing = stationTrim(currentStation);
    if (target < existing - 0.015) {
      stationTrims.set(stationId, target);
      saveStationTrims();
      applyGain({ smooth: true });
    }
  }, 350);
}

/** Branche un graphe Web Audio (analyse → limiteur → gain → sortie). */
function wireBoost() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) { webAudioSupported = false; return false; }
  try {
    if (!audio) return false;
    audio.crossOrigin = 'anonymous';
    audioCtx = audioCtx || new Ctx();
    mediaSource = audioCtx.createMediaElementSource(audio);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 1024;
    compressorNode = audioCtx.createDynamicsCompressor();
    // Limiteur léger des crêtes : aucune "remontée" automatique des passages calmes.
    compressorNode.threshold.setValueAtTime(-10, audioCtx.currentTime);
    compressorNode.knee.setValueAtTime(2, audioCtx.currentTime);
    compressorNode.ratio.setValueAtTime(12, audioCtx.currentTime);
    compressorNode.attack.setValueAtTime(0.003, audioCtx.currentTime);
    compressorNode.release.setValueAtTime(0.2, audioCtx.currentTime);
    gainNode = audioCtx.createGain();
    mediaSource.connect(analyserNode).connect(compressorNode).connect(gainNode).connect(audioCtx.destination);
    const resumeIfNeeded = () => {
      if (audioCtx && audioCtx.state === 'suspended' && isPlaying() && !userPaused) {
        audioCtx.resume().catch(() => {});
      }
    };
    audioCtx.onstatechange = resumeIfNeeded;
    // Mobile : l'AudioContext est souvent suspendu en arrière-plan — on reprend
    // dès que la page redevient visible pour que le 200 % continue de sonner.
    if (!boostCtxLifecycleBound) {
      boostCtxLifecycleBound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') resumeIfNeeded();
      });
      window.addEventListener('pageshow', resumeIfNeeded);
      window.addEventListener('focus', resumeIfNeeded);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    boostWired = true;
  } catch {
    boostWired = false;
  }
  return boostWired;
}

/** Recrée l'élément <audio>, avec ou sans graphe d'amplification. */
function rebuildAudio(withBoost) {
  cancelLoudnessProbe();
  if (audio) {
    suppressAudioError = true;
    try { audio.pause(); } catch {}
    suppressAudioError = false;
    // createMediaElementSource est à usage unique — on remplace l'élément au changement de mode.
    if (boostWired || withBoost || mediaSource) {
      audio.remove();
      audio = null;
    } else {
      audio.removeAttribute('src');
      audio.removeAttribute('crossorigin');
      try { audio.load(); } catch {}
    }
  }
  audio = getPlayerElement();
  audio.preload = 'none';
  if (!withBoost) audio.removeAttribute('crossorigin');
  attachAudioListeners(audio);
  // Élément recréé : re-brancher les écouteurs AirPlay (sinon le bouton cast
  // perd la détection de disponibilité après un passage par le mode amplifié).
  window.RadarCast?.attachPlayer?.(audio);
  mediaSource = null;
  gainNode = null;
  compressorNode = null;
  analyserNode = null;
  boostWired = false;
  if (withBoost) wireBoost();
  applyGain();
}

/**
 * Applique gain + mute localement et, si demandé, publie aux autres onglets.
 * Le leader possède le vrai <audio> : sans cette publication, un suiveur
 * (fiche SEO, second onglet) ne changeait que son curseur.
 */
function setSharedVolume(gain, { muted, publish = false } = {}) {
  if (Number.isFinite(gain)) {
    currentGain = Math.min(GAIN_UI_MAX, Math.max(0, gain));
  }
  if (muted !== undefined) {
    if (muted) {
      gainBeforeMute = currentGain > 0.001 ? currentGain : (gainBeforeMute || DEFAULT_GAIN);
      volumeMuted = true;
    } else {
      volumeMuted = false;
      if (currentGain <= 0.001 && gainBeforeMute > 0.001) {
        currentGain = gainBeforeMute;
      }
    }
  } else if (currentGain > 0.001 && volumeMuted) {
    volumeMuted = false;
  }

  if (TUNER_VOLUME) TUNER_VOLUME.value = String(currentGain);
  try {
    localStorage.setItem('radar-player-vol', String(currentGain));
    localStorage.setItem(VOLUME_MUTE_KEY, volumeMuted ? '1' : '0');
  } catch { /* private mode */ }

  // Franchir 100 % côté suiveur doit aussi brancher le graphe sur le leader.
  syncBoostWiring();
  applyGain();
  updateVolumeUI();
  updateVolumeSliderVisual();

  if (publish) {
    try {
      window.RadarPlayerSync?.publishVolume?.(currentGain, volumeMuted);
    } catch { /* */ }
  }
}

/** Applique volume/mute reçus d’un autre contexte (BroadcastChannel / storage). */
function applyRemoteVolumeState(state) {
  if (!state) return;
  const hasVol = Number.isFinite(state.volume);
  const hasMute = state.muted !== undefined && state.muted !== null;
  if (!hasVol && !hasMute) return;

  const nextGain = hasVol ? state.volume : currentGain;
  const nextMuted = hasMute ? !!state.muted : volumeMuted;
  const gainChanged = hasVol && Math.abs(nextGain - currentGain) > 0.005;
  const muteChanged = hasMute && nextMuted !== volumeMuted;
  if (!gainChanged && !muteChanged) return;

  setSharedVolume(nextGain, { muted: nextMuted, publish: false });
}

function setVolumeMuted(muted, { publish = true } = {}) {
  setSharedVolume(currentGain, { muted: !!muted, publish });
}

function toggleVolumeMute() {
  setVolumeMuted(!volumeMuted, { publish: true });
}

function updateVolumeSliderVisual() {
  const track = TUNER_VOLUME?.closest('.tuner-vol-track');
  const slider = track?.querySelector('.tuner-vol-slider');
  if (!track || !slider) return;

  const width = slider.getBoundingClientRect().width || slider.clientWidth || track.clientWidth;
  if (width < 1) return;

  const thumbPx = getVolThumbPx(track);
  const travel = width - thumbPx;
  const xMin = thumbPx / 2;
  const xMid = xMin + travel * 0.5;
  const xMax = xMin + travel;
  const gain = volumeMuted ? 0 : currentGain;
  const ratio = Math.min(Math.max(gain / GAIN_UI_MAX, 0), 1);
  const xThumb = xMin + travel * ratio;

  track.style.setProperty('--vol-x', `${xThumb}px`);
  track.style.setProperty('--vol-x-min', `${xMin}px`);
  track.style.setProperty('--vol-x-mid', `${xMid}px`);
  track.style.setProperty('--vol-x-max', `${xMax}px`);
  track.style.setProperty('--vol-ratio', String(ratio));
  if (GAIN_UI_MAX >= MAX_GAIN) {
    // Deux zones : remplissage bleu 0–100 %, orange 100–200 %.
    track.style.setProperty('--vol-base', `${Math.min(ratio / 0.5, 1) * 100}%`);
    track.style.setProperty('--vol-boost', `${Math.max((ratio - 0.5) / 0.5, 0) * 100}%`);
  } else {
    // Sans amplification : une seule zone pleine largeur.
    track.style.setProperty('--vol-base', `${ratio * 100}%`);
    track.style.setProperty('--vol-boost', '0%');
  }
  track.classList.toggle('is-boost', gain > 1.001);
}

function syncVolumeMuteButton(btn, { pressed = false, icon = 'toggle' } = {}) {
  if (!btn) return;
  const icoVol = btn.querySelector('.ico-vol');
  const icoMute = btn.querySelector('.ico-vol-mute');
  if (icon === 'mute') {
    icoVol?.classList.add('hidden');
    icoMute?.classList.remove('hidden');
  } else if (icon === 'vol') {
    icoVol?.classList.remove('hidden');
    icoMute?.classList.add('hidden');
  } else {
    icoVol?.classList.toggle('hidden', volumeMuted);
    icoMute?.classList.toggle('hidden', !volumeMuted);
  }
  if (pressed) {
    btn.setAttribute('aria-pressed', String(volumeMuted));
    btn.setAttribute(
      'aria-label',
      volumeMuted ? 'Réactiver le son' : 'Couper le son',
    );
    btn.title = volumeMuted ? 'Réactiver le son' : 'Couper le son';
  }
}

function updateVolumeUI() {
  TUNER_VOL?.classList.toggle('is-muted', volumeMuted);
  const compact = isVolCompactMode();
  syncVolumeMuteButton(TUNER_VOL_MUTE, { pressed: true, icon: 'mute' });
  syncVolumeMuteButton(TUNER_VOL_TOGGLE, {
    pressed: !compact,
    icon: compact ? 'vol' : 'toggle',
  });
  if (TUNER_VOL_TOGGLE) {
    if (compact) {
      TUNER_VOL_TOGGLE.removeAttribute('aria-pressed');
      TUNER_VOL_TOGGLE.setAttribute('aria-label', 'Réglages du volume');
      TUNER_VOL_TOGGLE.title = 'Réglages du volume';
    } else {
      TUNER_VOL_TOGGLE.setAttribute(
        'aria-label',
        volumeMuted ? 'Réactiver le son' : 'Couper le son',
      );
      TUNER_VOL_TOGGLE.title = volumeMuted
        ? 'Réactiver le son'
        : 'Couper le son — curseur à droite pour amplifier les flux faibles';
    }
  }
  if (TUNER_VOLUME) {
    const pct = volumeMuted ? 0 : Math.round(currentGain * 100);
    TUNER_VOLUME.setAttribute('aria-valuetext', volumeMuted ? 'Muet' : `${pct} %`);
  }
  updateVolumeSliderVisual();
}

function isOutputSilent() {
  return volumeMuted || currentGain <= 0.001;
}

/** Applique le curseur maître et l'éventuelle correction prudente du poste. */
function applyGain({ smooth = false } = {}) {
  const effective = volumeMuted ? 0 : currentGain * stationTrim();
  const silent = isOutputSilent();

  if (audio) {
    if (boostWired && gainNode) {
      audio.volume = 1;
      try {
        if (audioCtx && smooth) {
          gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
          gainNode.gain.setTargetAtTime(effective, audioCtx.currentTime, 0.35);
        } else if (audioCtx) {
          gainNode.gain.setValueAtTime(effective, audioCtx.currentTime);
        }
        else gainNode.gain.value = effective;
      } catch {
        try { gainNode.gain.value = effective; } catch {}
      }
      // L'élément peut encore fuiter hors du graphe Web Audio (embed iframe, etc.).
      audio.muted = silent;
    } else {
      audio.muted = silent;
      audio.volume = silent ? 0 : Math.min(1, effective);
    }
  }

  // Keepalive mobile (WAV / oscillateur) : arrêt quand muet ou 0 %.
  if (silent) mobilePlayback?.stopKeepalive();
  else if (isPlaybackActive() && !userPaused) mobilePlayback?.startKeepalive();

  TUNER.classList.toggle('is-boosted', !silent && currentGain > 1.001);
  updateVolumeUI();
}

function setupAudio() {
  if (audio) return;
  initMobilePlayback();
  audio = getPlayerElement();
  audio.preload = 'none';
  attachAudioListeners(audio);

  if ('mediaSession' in navigator) {
    // Les handlers Media Session sont privilégiés par Android pour relancer
    // l'audio depuis l'écran de verrouillage / la notification média.
    // On les ré-enregistre aussi après une longue pause (certaines OEM les
    // perdent) via rebindMediaSessionActions si besoin.
    const onMsPlay = () => {
      userPaused = false;
      mobilePlayback?.onPlayStart();
      if (window.RadarCast?.isChromecasting?.()) {
        window.RadarCast.resumeRemote?.();
        updatePlayUI();
        return;
      }
      if (currentStation) {
        if (audio?.src && audio.paused) {
          audio.play().catch(() => play(currentStation));
        } else {
          play(currentStation);
        }
      }
      syncMediaSessionPlaybackState();
      syncMediaSessionLivePosition();
    };
    const onMsPause = () => pauseByUser();
    const onMsStop = () => {
      userPaused = true;
      window.RadarCast?.endSession?.();
      mobilePlayback?.onUserPause();
      if (audio) {
        suppressAudioError = true;
        try { audio.pause(); } catch {}
        suppressAudioError = false;
      }
      updatePlayUI();
    };
    const bindMs = () => {
      try {
        navigator.mediaSession.setActionHandler('play', onMsPlay);
        navigator.mediaSession.setActionHandler('pause', onMsPause);
        navigator.mediaSession.setActionHandler('stop', onMsStop);
        navigator.mediaSession.setActionHandler('previoustrack', () => stepStation(-1));
        navigator.mediaSession.setActionHandler('nexttrack', () => stepStation(1));
        try { navigator.mediaSession.setActionHandler('seekto', null); } catch {}
      } catch { /* Media Session indisponible */ }
    };
    bindMs();
    // Re-lier au retour visible (Deep Doze / OEM) pour que ▶ du lockscreen
    // fonctionne encore après une longue absence.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && currentStation && !userPaused) {
        bindMs();
        syncMediaSessionPlaybackState();
        syncMediaSessionLivePosition();
      }
    });
  }

  window.RadarCast?.init?.({
    getPlayer: () => audio,
    getStation: () => currentStation,
    getStreamUrl: getPlayableStream,
    isExternal: isExternalListen,
    isPlaying,
    isUserPaused: () => userPaused,
    playStation: play,
    pauseLocal: pauseForCast,
    assetUrl,
    formatInstitution: formatInstitutionDisplay,
    getNowAirMeta: (radio) => {
      if (!radio || radio.id !== currentStation?.id) return {};
      if (lastNowAir.title) {
        return { title: lastNowAir.title, sub: lastNowAir.sub || '' };
      }
      return {};
    },
    buildMediaSessionMeta: buildStationMediaMeta,
    showToast,
    onCastStateChange: updatePlayUI,
  });
}

function assetUrl(path) {
  try {
    return new URL(String(path).replace(/^\.\//, ''), window.location.href).href;
  } catch {
    return path;
  }
}

/** Métadonnées lock screen / notification : émission en titre, poste en artiste. */
function buildStationMediaMeta(radio, { title, sub } = {}) {
  const stationLine = formatStationNowAirLabel(radio);
  const airTitle = String(title || '').trim();
  const airSub = String(sub || '').trim();
  const genericListen = `Vous écoutez ${radio.name}`;
  const hasShow = airTitle && airTitle !== genericListen;

  if (hasShow) {
    return {
      title: airTitle,
      artist: stationLine,
      album: airSub || tunerInstitutionLabel(radio.institution) || 'Le Radar',
    };
  }

  return {
    title: radio.fullName || radio.name,
    artist: tunerInstitutionLabel(radio.institution),
    album: airSub || radioSlogan(radio) || 'Le Radar',
  };
}

function updateMediaSession(radio, { title, sub } = {}) {
  if (!('mediaSession' in navigator)) return;
  const meta = buildStationMediaMeta(radio, { title, sub });
  navigator.mediaSession.metadata = new MediaMetadata({
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    artwork: [
      { src: assetUrl('assets/icon-192.png'), sizes: '192x192', type: 'image/png' },
      { src: assetUrl('assets/icon-512.png'), sizes: '512x512', type: 'image/png' },
    ],
  });
}

function restoreVolume() {
  loadStationTrims();
  const raw = localStorage.getItem('radar-player-vol');
  const saved = parseFloat(raw ?? String(DEFAULT_GAIN));
  // Migration douce : 72 % était l'ancien défaut automatique. On ne touche
  // jamais aux personnes qui avaient déjà choisi une autre valeur.
  const oldDefault = localStorage.getItem(VOLUME_PREF_VERSION_KEY) !== VOLUME_PREF_VERSION
    && (raw === null || Math.abs(saved - 0.72) < 0.005 || Math.abs(saved - 1) < 0.005);
  if (oldDefault) localStorage.setItem('radar-player-vol', String(DEFAULT_GAIN));
  try { localStorage.setItem(VOLUME_PREF_VERSION_KEY, VOLUME_PREF_VERSION); } catch {}
  currentGain = oldDefault
    ? DEFAULT_GAIN
    : (Number.isFinite(saved) ? Math.min(GAIN_UI_MAX, Math.max(0, saved)) : DEFAULT_GAIN);
  gainBeforeMute = currentGain > 0.001 ? currentGain : (gainBeforeMute || DEFAULT_GAIN);
  if (TUNER_VOLUME) TUNER_VOLUME.value = String(currentGain);
  // Mute mémorisé (clé dédiée). La session multi-onglets peut encore
  // surcharger juste après via applyRemoteVolumeState(boot).
  let savedMuted = false;
  try { savedMuted = localStorage.getItem(VOLUME_MUTE_KEY) === '1'; } catch { /* */ }
  volumeMuted = savedMuted;
  applyGain();
  updateVolumeUI();
  updateVolumeSliderVisual();
}

// ═══════════════════════════════════════════════════════════════════════════
//  NEWS WIRE
// ═══════════════════════════════════════════════════════════════════════════
/**
 * @param {{ silent?: boolean }} [opts] silent : garder le fil affiché pendant
 *   la requête, au lieu de le remplacer par des squelettes. Sert au
 *   rafraîchissement de retour d'arrière-plan, où un clignotement de la liste
 *   déjà lisible serait un pur inconvénient.
 */
async function loadNews({ silent = false } = {}) {
  if (!NEWS_LIST) return;
  const firstPaint = NEWS_LIST.dataset.ready !== '1';
  if ((!silent || !news.length) && !firstPaint) {
    NEWS_LIST.innerHTML = newsSkeleton(6);
  }
  try {
    const res = await fetch(appAsset('news.json'), { cache: 'no-cache' });
    const data = await res.json();
    news = Array.isArray(data) ? data : (data.items || []);
    news.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    assignSourceColors();
    // Les fiches SEO de journaux ramènent ici avec ?source=… : on valide
    // d'abord contre les données réellement chargées, plutôt que d'afficher
    // un filtre inexistant après une URL ancienne ou bricolée.
    const requestedSource = new URLSearchParams(window.location.search).get('source');
    if (requestedSource && news.some((item) => item.source === requestedSource)) {
      newsSourceFilter = requestedSource;
    }
    if (data.updated) {
      // Heure réelle de la dernière écriture de news.json.
      // updatedSlot (passe planifiée) n'est utilisé que s'il est proche de l'heure
      // réelle — sinon on affichait encore « 12 h 00 » à 15 h 48 après un filet
      // ou une passe manuelle plus récente.
      const actual = new Date(data.updated);
      const slot = data.updatedSlot ? new Date(data.updatedSlot) : null;
      const slotOk = slot
        && !Number.isNaN(slot.getTime())
        && actual - slot >= 0
        && actual - slot <= 45 * 60 * 1000;
      const d = slotOk ? slot : actual;
      NEWS_UPDATED.textContent = `mis à jour ${formatStamp(d)}`;
    }
  } catch (e) {
    console.error('Failed to load news.json', e);
    news = [];
  }
  renderNewsFilters();
  renderNews();
}

function normInstitutionKey(name = '') {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function institutionBrandColor(institution = '') {
  if (!institution) return null;
  const table = brandColors.institutions || {};
  if (table[institution]?.color) return table[institution].color;

  const norm = normInstitutionKey(institution);
  for (const [key, entry] of Object.entries(table)) {
    if (key.startsWith('_')) continue;
    if (normInstitutionKey(key) === norm) return entry.color;
  }
  return null;
}

/** Couleur d'accent d'un article : marque de l'établissement (pastilles, « Lire la suite »). */
function sourceAccentColor(item = {}) {
  const raw = institutionBrandColor(item.institution || '')
    || sourceColors[item.source || '']
    || null;
  return safeCssColor(raw);
}

/** Popularité des filtres UI : lue depuis news-sources.json (champ popularity). */
function sourcePopularityRank(name = '') {
  const fromRegistry = newsSourcesByName[name]?.popularity;
  if (typeof fromRegistry === 'number') return fromRegistry;
  return 100;
}

/** FR d'abord, puis EN, puis le reste (lang depuis news-sources.json). */
function sourceLangRank(name = '') {
  const lang = String(newsSourcesByName[name]?.lang || '').toLowerCase();
  if (lang === 'fr') return 0;
  if (lang === 'en') return 1;
  return 2;
}

/**
 * Tri pastilles sources :
 *  1. Français, puis anglais, puis autres
 *  2. Popularité croissante (1 = plus haut) — y compris The Link
 */
function sortSourcesByPopularity(sources) {
  return [...sources].sort((a, b) => {
    const langDiff = sourceLangRank(a) - sourceLangRank(b);
    if (langDiff !== 0) return langDiff;
    const diff = sourcePopularityRank(a) - sourcePopularityRank(b);
    return diff !== 0 ? diff : a.localeCompare(b, 'fr');
  });
}

function filterInstitutionKey(sourceName = '') {
  const { institution } = sourceInfo(sourceName);
  if (!institution) return sourceName;
  const acronym = resolveInstitutionAcronym(institution);
  if (acronym) return acronym.toLowerCase();
  return normInstitutionKey(institution);
}

/**
 * Tri filtres sources : FR par popularité, puis EN par popularité
 * (The Link inclus normalement selon son rang popularity).
 */
function sortSourcesForFilters(sources) {
  return sortSourcesByPopularity(sources);
}

function assignSourceColors() {
  const palette = brandColors.fallback_palette || ['#003DA5', '#6C2163', '#047857'];
  const sources = sortSourcesByPopularity([...new Set(news.map(n => n.source))]);
  sourceColors = {};

  sources.forEach((src, i) => {
    const item = news.find(n => n.source === src);
    sourceColors[src] = safeCssColor(
      institutionBrandColor(item?.institution || '') || palette[i % palette.length],
    ) || '#003DA5';
  });
}

function newsSkeleton(n) {
  return Array.from({ length: n }).map(() => `
    <div class="article skeleton">
      <div class="sk sk-meta"></div>
      <div class="sk sk-title"></div>
      <div class="sk sk-title2"></div>
      <div class="sk sk-brief"></div>
      <div class="sk sk-brief2"></div>
    </div>`).join('');
}

// D10 : acronymes générés depuis institutions.json
// (institution-acronyms-data.js via scripts/sync-institution-labels.js).
// Repli minimal si le script data n’est pas encore chargé.
const INSTITUTION_ACRONYMS = {
  ...(typeof window !== 'undefined' && window.RadarInstitutionAcronyms
    ? window.RadarInstitutionAcronyms
    : {
        'Université de Montréal': 'UdeM',
        UQAM: 'UQAM',
        'Université du Québec à Montréal': 'UQAM',
        'Université McGill': 'McGill',
        'McGill University': 'McGill',
        'Concordia University': 'Concordia',
        'Université Laval': 'ULaval',
        'Université de Sherbrooke': 'UdeS',
        'Polytechnique Montréal': 'Poly Montréal',
      }),
};

const INSTITUTION_FULL_BY_ACRONYM = {
  ...(typeof window !== 'undefined' && window.RadarInstitutionFullByAcronym
    ? window.RadarInstitutionFullByAcronym
    : {}),
};
if (!Object.keys(INSTITUTION_FULL_BY_ACRONYM).length) {
  for (const [full, acr] of Object.entries(INSTITUTION_ACRONYMS)) {
    const clean = full.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const prev = INSTITUTION_FULL_BY_ACRONYM[acr];
    if (!prev || (clean.includes(' ') && clean.length > prev.length)) {
      INSTITUTION_FULL_BY_ACRONYM[acr] = clean;
    }
  }
}

/**
 * Capitalisation affichage des types d'établissement.
 * Institutions : original en Original/FR/EN ; localisées hors de ces modes
 * (translate.js). Ce filet corrige aussi une casse abîmée (gtx).
 */
function formatInstitutionDisplay(name = '') {
  if (!name) return '';
  // Lookarounds ASCII : `\b` après `é` échoue en JS (é ≠ word char).
  return String(name)
    .replace(/(?<![A-Za-z])université(?![A-Za-z])/giu, 'Université')
    .replace(/(?<![A-Za-z])universite(?![A-Za-z])/giu, 'Université')
    .replace(/(?<![A-Za-z])university(?![A-Za-z])/giu, 'University')
    .replace(/(?<![A-Za-z])universidad(?![A-Za-z])/giu, 'Universidad')
    .replace(/(?<![A-Za-z])universidade(?![A-Za-z])/giu, 'Universidade')
    .replace(/(?<![A-Za-z])universität(?![A-Za-z])/giu, 'Universität')
    .replace(/(?<![A-Za-z])università(?![A-Za-z])/giu, 'Università')
    .replace(/(?<![A-Za-z])cégep(?![A-Za-z])/giu, 'Cégep')
    .replace(/(?<![A-Za-z])cegep(?![A-Za-z])/giu, 'Cégep')
    .replace(/(?<![A-Za-z])college(?![A-Za-z])/giu, 'College')
    .replace(/(?<![A-Za-z])collège(?![A-Za-z])/giu, 'Collège')
    .replace(/(?<![A-Za-z])colegio(?![A-Za-z])/giu, 'Colegio')
    .replace(/(?<![A-Za-z])colégio(?![A-Za-z])/giu, 'Colégio')
    // Noms propres fréquents laissés en minuscules par gtx (Laval, Montréal…)
    .replace(/(?<![A-Za-z])laval(?![A-Za-z])/giu, 'Laval')
    .replace(/(?<![A-Za-z])montr[eé]al(?![A-Za-z])/giu, (m) => (m.includes('é') ? 'Montréal' : 'Montreal'))
    .replace(/(?<![A-Za-z])sherbrooke(?![A-Za-z])/giu, 'Sherbrooke')
    .replace(/(?<![A-Za-z])mcgill(?![A-Za-z])/giu, 'McGill')
    .replace(/(?<![A-Za-z])concordia(?![A-Za-z])/giu, 'Concordia')
    .replace(/(?<![A-Za-z])dawson(?![A-Za-z])/giu, 'Dawson')
    .replace(/(?<![A-Za-z])qu[eé]bec(?![A-Za-z])/giu, (m) => (m.includes('é') ? 'Québec' : 'Quebec'));
}

/** Libellé institution sur les pastilles sources (nom complet, sans suffixe Univ./Cégep). */
function filterSourceInstitutionLabel(institution = '', _type = '', sourceName = '') {
  if (!institution) return '';
  if (sourceName === 'Le Délit') return 'Université McGill';
  return tunerInstitutionLabel(institution);
}

/** Nom d'institution au complet pour le sous-titre du syntoniseur. */
function tunerInstitutionLabel(name = '') {
  if (!name) return '';
  const stripped = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  let label;
  if (/^université|^university|^mcgill|^concordia|^cégep|^collège/i.test(stripped)) {
    label = stripped;
  } else {
    label = INSTITUTION_FULL_BY_ACRONYM[name] || INSTITUTION_FULL_BY_ACRONYM[stripped] || stripped;
  }
  return formatInstitutionDisplay(label);
}

function resolveInstitutionAcronym(name = '') {
  if (!name) return '';
  if (INSTITUTION_ACRONYMS[name]) return INSTITUTION_ACRONYMS[name];

  const norm = normInstitutionKey(name);
  for (const [key, acronym] of Object.entries(INSTITUTION_ACRONYMS)) {
    if (normInstitutionKey(key) === norm) return acronym;
  }

  const paren = name.match(/\((UQ[A-Z]{1,4}|UdeM|ULaval|UdeS|McGill)\)/i);
  if (paren) return paren[1];

  return '';
}

function isQuebecUniversity(name = '', type = '') {
  return type === 'universite'
    || /^université|^university|^mcgill|^concordia$/i.test(name)
    || name === 'UQAM';
}

function stripInstitutionTypePrefix(name = '') {
  return String(name)
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/^Cégep (de |du |d'|des )?/i, '')
    .replace(/^Collège (de |du |d'|des )?/i, '')
    .trim();
}

function isCegepInstitution(name = '', type = '') {
  return type === 'cegep' || /^cégep|^collège/i.test(name);
}

/**
 * Développe un acronyme stocké en base (ex. « UQAM ») vers le nom complet
 * (« Université du Québec à Montréal »). Si le nom est déjà long, le garde.
 */
function expandInstitutionFullName(name = '') {
  if (!name) return '';
  // Réutilise la même logique que le syntoniseur (filtre + cartes).
  return tunerInstitutionLabel(name);
}

/**
 * Libellé institution sur les cartes article.
 * @param {'short'|'full'} form
 *   short — acronyme (ULaval, UdeM, McGill…) pour En bref + Suite du fil
 *   full  — nom complet (À la une + vedettes, tablette+)
 */
function articleInstitutionLabel(name = '', type = '', form = 'short') {
  if (!name) return '';
  if (form === 'full') {
    return expandInstitutionFullName(name);
  }
  // Court : acronyme institutionnel, sinon libellé compact (cégeps, collèges).
  return shortInstitution(name, type)
    || formatInstitutionDisplay(String(name).replace(/\s*\([^)]*\)\s*$/, '').trim());
}

/** HTML meta institution : complet + acronyme pour bascule responsive CSS. */
function articleInstitutionMetaHtml(name = '', type = '', role = 'standard') {
  if (!name) return '';
  const short = articleInstitutionLabel(name, type, 'short');
  const full = articleInstitutionLabel(name, type, 'full');
  // Une + vedettes + En bref + suite du fil : nom complet (dual full/short responsive).
  const spacious = role === 'lead' || role === 'feature' || role === 'standard' || role === 'compact';
  // Pas de notranslate : hors Original/FR/EN, translate.js localise (ES/PT…).
  // En Original / FR / EN : libellés d’origine intacts.
  if (spacious && full && full !== short) {
    return `<span class="article-inst">`
      + `<span class="article-inst__full">${escapeHtml(full)}</span>`
      + `<span class="article-inst__short">${escapeHtml(short)}</span>`
      + `</span>`;
  }
  // Spacious mais full === short (ex. cégep sans acronyme) : afficher full
  if (spacious && full) {
    return `<span class="article-inst">${escapeHtml(full)}</span>`;
  }
  return `<span class="article-inst">${escapeHtml(short || full)}</span>`;
}

function shortInstitution(name = '', type = '') {
  const acronym = resolveInstitutionAcronym(name);
  if (acronym) return acronym;

  const CEGEP_SHORT = {
    'Cégep du Vieux Montréal': 'Cégep Vieux-Montréal',
    'Cégep de Jonquière (ATM – journalisme)': 'Jonquière',
    'Cégep de Jonquière': 'Jonquière',
    'Dawson College': 'Dawson',
    'Collège Dawson': 'Dawson',
  };
  if (CEGEP_SHORT[name]) return CEGEP_SHORT[name];
  const strippedName = String(name).replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (CEGEP_SHORT[strippedName]) return CEGEP_SHORT[strippedName];

  if (isCegepInstitution(name, type)) {
    const stripped = stripInstitutionTypePrefix(name);
    if (stripped) return stripped.length > 24 ? `${stripped.slice(0, 22)}…` : stripped;
  }

  const paren = name.match(/\(([^)]+)\)/);
  if (paren) {
    const inner = paren[1].split(/[–-]/)[0].trim();
    if (inner.length <= 14) return inner;
  }
  if (isQuebecUniversity(name, type)) return formatInstitutionDisplay(name);
  const trimmed = name.length > 24 ? `${name.slice(0, 22)}…` : name;
  return formatInstitutionDisplay(trimmed);
}

function sourceInfo(src) {
  const item = news.find(n => n.source === src);
  const registry = newsSourcesByName[src];
  return {
    institution: item?.institution || registry?.institution || '',
    type: item?.type || registry?.type || '',
    color: sourceColors[src] || 'var(--accent)',
  };
}

function filtersColumnCount() {
  const wideCols = (typeof window.__radarWidePreview?.filtersColumnCount === 'function')
    ? window.__radarWidePreview.filtersColumnCount()
    : null;
  if (typeof wideCols === 'number' && wideCols > 0) return wideCols;
  if (!NEWS_FILTERS) {
    return FILTERS_MOBILE.matches ? FILTERS_ROW_CAPACITY : FILTERS_DESKTOP_DEFAULT_COLS;
  }
  const w = NEWS_FILTERS.clientWidth;
  if (FILTERS_MOBILE.matches) {
    return w < FILTERS_COLS_NARROW ? 2 : 3;
  }
  // Demi-laptop / tablette étroite : 3 colonnes de pastilles (pas le mode compact téléphone).
  if (w < 720) return 3;
  if (w < FILTERS_DESKTOP_WIDE_MIN) return 3;
  return FILTERS_DESKTOP_MAX_COLS;
}

/** Aligné sur style.css --filters-collapsed-rows (1 rangée partout).
 *  Lab grand écran : __radarWidePreview peut forcer 2 rangées (C/D) ou rail (E). */
function filtersCollapsedRows() {
  const wideRows = (typeof window.__radarWidePreview?.filtersCollapsedRows === 'function')
    ? window.__radarWidePreview.filtersCollapsedRows()
    : null;
  if (typeof wideRows === 'number' && wideRows > 0) return wideRows;
  return FILTERS_COMPACT_MQ.matches
    ? FILTERS_COLLAPSED_ROWS_COMPACT
    : FILTERS_COLLAPSED_ROWS_DESKTOP;
}

function syncFiltersColumns() {
  if (!FILTERS_PANEL) return;
  const cols = filtersColumnCount();
  const rows = filtersCollapsedRows();
  FILTERS_PANEL.style.setProperty('--filters-cols', String(cols));
  FILTERS_PANEL.style.setProperty('--filters-collapsed-rows', String(rows));
}

/**
 * Rail wide E : calcule combien de pastilles tiennent sous le titre,
 * pour afficher « Plus de sources » plutôt que de scroller tout le rail.
 * @returns {boolean} true s’il y a débordement
 */
function syncWideRailFiltersFit() {
  if (!FILTERS_PANEL || !NEWS_FILTERS) return false;
  if (typeof isWideNoMarqueeMode !== 'function' || !isWideNoMarqueeMode()) return false;
  const stack = document.getElementById('wide-rail-stack');
  if (!stack) return false;
  const sections = stack.querySelector('.site-sections');
  const head = stack.querySelector('.wire-head');
  const stackTop = stack.getBoundingClientRect().top;
  const fab = document.getElementById('page-scroll-top');
  const fabOn = !!(fab && !fab.hidden && fab.getClientRects().length);
  /* Réserve seulement la flèche réellement visible — pas 72 px dès « Réduire ». */
  const bottomSafe = fabOn ? 72 : 16;
  stack.style.setProperty('--wide-rail-bottom', `${bottomSafe}px`);
  stack.style.setProperty('--wide-stack-from-top', `${Math.max(0, Math.round(stackTop))}px`);
  const visibleH = Math.max(160, (window.innerHeight || 800) - stackTop - bottomSafe);
  const chrome = (sections?.offsetHeight || 0) + (head?.offsetHeight || 0) + 8;
  const toggleH = 46;
  const btn = NEWS_FILTERS.querySelector('.filter-btn');
  const rowH = Math.max(42, Math.ceil((btn?.getBoundingClientRect().height || 44) + 6));
  /* Nom de la source suivante, sans bande smeared trop haute. */
  const instFade = Math.max(20, Math.round(rowH * 0.48));
  const avail = Math.max(120, visibleH - chrome - toggleH - instFade);
  let rows = Math.max(3, Math.floor(avail / rowH));
  if (avail - rows * rowH >= rowH * 0.7) rows += 1;
  const countBtns = NEWS_FILTERS.querySelectorAll('.filter-btn').length;
  rows = Math.min(Math.max(3, rows), Math.max(3, countBtns));
  /* Rangées pleines + peek à part : ne pas rogner la dernière puce visible. */
  const collapsedH = Math.max(rowH, rows * rowH - 6);
  FILTERS_PANEL.style.setProperty('--filters-cols', '1');
  FILTERS_PANEL.style.setProperty('--filters-collapsed-rows', String(rows));
  FILTERS_PANEL.style.setProperty('--filters-collapsed-h', `${collapsedH}px`);
  FILTERS_PANEL.style.setProperty('--filters-peek', `${instFade}px`);
  FILTERS_PANEL.style.setProperty('--filters-title-h', '0px');
  FILTERS_PANEL.style.setProperty('--filters-rail-avail', `${Math.max(120, visibleH - chrome - toggleH)}px`);
  syncWideFiltersToggleWidth();
  return countBtns > rows;
}

/** Plus de sources / Réduire : même largeur et même axe que les pastilles. */
function syncWideFiltersToggleWidth() {
  if (!FILTERS_TOGGLE || !NEWS_FILTERS) return;
  if (typeof isWideNoMarqueeMode !== 'function' || !isWideNoMarqueeMode()) {
    FILTERS_TOGGLE.style.removeProperty('width');
    FILTERS_TOGGLE.style.removeProperty('max-width');
    return;
  }
  const pill = NEWS_FILTERS.querySelector('.filter-btn');
  if (!pill) return;
  const w = Math.round(pill.getBoundingClientRect().width);
  if (w < 40) return;
  FILTERS_TOGGLE.style.width = `${w}px`;
  FILTERS_TOGGLE.style.maxWidth = `${w}px`;
  FILTERS_TOGGLE.style.alignSelf = 'flex-start';
}

function filtersOverflow() {
  if (!NEWS_FILTERS) return false;
  if (typeof isWideNoMarqueeMode === 'function' && isWideNoMarqueeMode()
    && document.getElementById('wide-rail-stack')) {
    return syncWideRailFiltersFit();
  }
  const count = NEWS_FILTERS.querySelectorAll('.filter-btn').length;
  return count > filtersCollapsedRows() * filtersColumnCount();
}

function updateFiltersCompactBar() {
  if (!FILTERS_COMPACT) return;
  const dot = FILTERS_COMPACT.querySelector('.filters-compact__dot');
  const text = FILTERS_COMPACT.querySelector('.filters-compact__text');
  if (newsSourceFilter === 'all') return;

  const { institution, type, color } = sourceInfo(newsSourceFilter);
  const instLabel = filterSourceInstitutionLabel(institution, type, newsSourceFilter);
  FILTERS_COMPACT.style.setProperty('--c', color);
  if (dot) dot.style.setProperty('--c', color);
  if (text) {
    // Média protégé ; établissement traduisible (comme les pastilles sources).
    text.classList.remove('notranslate');
    text.removeAttribute('translate');
    text.replaceChildren();
    const nameSpan = document.createElement('span');
    nameSpan.className = 'notranslate';
    nameSpan.setAttribute('translate', 'no');
    nameSpan.textContent = newsSourceFilter;
    text.appendChild(nameSpan);
    if (instLabel) {
      text.appendChild(document.createTextNode(' · '));
      const instSpan = document.createElement('span');
      instSpan.className = 'filters-compact__inst';
      instSpan.textContent = adaptRadarInstitutionLabel(instLabel);
      text.appendChild(instSpan);
    }
  }
}

function syncFiltersPanel() {
  if (!FILTERS_PANEL) return;
  syncFiltersColumns();

  const isSourceView = newsSourceFilter !== 'all';
  const overflow = filtersOverflow();

  if (FILTERS_MOBILE.matches && isSourceView) {
    FILTERS_PANEL.classList.toggle('has-overflow', true);
    if (filtersExpanded) {
      FILTERS_PANEL.classList.remove('is-compact');
      FILTERS_PANEL.classList.add('is-expanded');
      FILTERS_COMPACT?.setAttribute('hidden', '');
      FILTERS_TOGGLE?.removeAttribute('hidden');
      const label = FILTERS_TOGGLE?.querySelector('.filters-toggle__label');
      if (label) label.textContent = adaptRadarUiText('Réduire');
      FILTERS_TOGGLE?.setAttribute('aria-expanded', 'true');
      FILTERS_COMPACT?.setAttribute('aria-expanded', 'true');
    } else {
      FILTERS_PANEL.classList.add('is-compact');
      FILTERS_PANEL.classList.remove('is-expanded');
      updateFiltersCompactBar();
      FILTERS_COMPACT?.removeAttribute('hidden');
      FILTERS_TOGGLE?.setAttribute('hidden', '');
      FILTERS_COMPACT?.setAttribute('aria-expanded', 'false');
    }
    scheduleFilterMarqueeRefresh();
    return;
  }

  FILTERS_PANEL.classList.remove('is-compact');
  FILTERS_COMPACT?.setAttribute('hidden', '');
  /* Un rail déjà ouvert reste « en débordement » pour garder Réduire,
     même si un scroll agrandit l’espace et que tout tiendrait. */
  const keepWideOpen = !!(filtersExpanded && document.getElementById('wide-rail-stack'));
  FILTERS_PANEL.classList.toggle('has-overflow', overflow || keepWideOpen);

  if (overflow || keepWideOpen) {
    FILTERS_TOGGLE?.removeAttribute('hidden');
    FILTERS_PANEL.classList.toggle('is-expanded', filtersExpanded);
    const label = FILTERS_TOGGLE?.querySelector('.filters-toggle__label');
    if (label) {
      label.textContent = adaptRadarUiText(filtersExpanded ? 'Réduire' : 'Plus de sources');
    }
    FILTERS_TOGGLE?.setAttribute('aria-expanded', filtersExpanded ? 'true' : 'false');
  } else {
    /* Tout tient et l’utilisateur n’a pas ouvert : pas de bouton. */
    FILTERS_PANEL.classList.remove('is-expanded');
    FILTERS_TOGGLE?.setAttribute('hidden', '');
  }

  scheduleFilterMarqueeRefresh();
  if (typeof isWideNoMarqueeMode === 'function' && isWideNoMarqueeMode()) {
    window.requestAnimationFrame(() => syncWideFiltersToggleWidth());
  }
}

/** Après changement de langue : reposer les libellés sources / boutons. */
function onRadarTranslateModeChange() {
  applyFilterInstMarquees();
  syncFiltersPanel();
  scheduleFilterMarqueeRefresh();
  // Reposer l’institution du syntoniseur dans la langue active
  if (currentStation) {
    const radio = currentStation;
    const external = isExternalListen(radio);
    if (isDialCompactLayout()) {
      setTunerNameText(compactDialTitleLine(radio));
      tunerSubMeta = dialCompactMetaLineForRadio(radio);
      // Reposer la phase courante traduite dans le créneau visible seulement.
      // Pas de renderTunerNowAir() ici : un rendu complet relance les marquees
      // et l'observateur de taille, ce qui reflue tout le mât au moment même
      // où l'on change de langue.
      const lines = dialPhaseLinesForRadio(radio);
      const line = lines[airPhaseIndex % Math.max(1, lines.length)] || tunerSubMeta;
      TUNER_SUB?.parentElement?.classList.toggle('is-empty', !line);
      applyMarquee(dialRotateSlotB ? TUNER_SUB_AIR : TUNER_SUB, line);
    } else {
      setTunerNameText(tunerDesktopTitleLine(radio));
      setTunerSubText(tunerDesktopSubLine(radio, { external }));
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('radar:translate-mode', onRadarTranslateModeChange);
}

function bindFiltersPanel() {
  let filtersUserCollapsed = false;
  let filtersUserPinned = false;
  FILTERS_TOGGLE?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    filtersExpanded = !filtersExpanded;
    /* Clic = intention : ne plus ouvrir/fermer tout seul au scroll. */
    filtersUserPinned = filtersExpanded;
    filtersUserCollapsed = !filtersExpanded;
    syncFiltersPanel();
    if ((window.scrollY || document.documentElement.scrollTop || 0) !== y) {
      window.scrollTo({ top: y, left: 0, behavior: 'auto' });
    }
  });

  // Molette sur le rail : défiler les sources sans bouger le magazine.
  document.addEventListener('wheel', (event) => {
    if (typeof isWideNoMarqueeMode !== 'function' || !isWideNoMarqueeMode()) return;
    const stack = document.getElementById('wide-rail-stack');
    if (!stack || !stack.contains(event.target)) return;
    if (!FILTERS_PANEL?.classList.contains('has-overflow')) return;
    const list = NEWS_FILTERS;
    if (!list) return;
    if (!filtersExpanded) {
      filtersExpanded = true;
      filtersUserPinned = (window.scrollY || 0) < 80;
      filtersUserCollapsed = false;
      syncFiltersPanel();
    }
    const max = list.scrollHeight - list.clientHeight;
    if (max <= 1) return;
    const atStart = list.scrollTop <= 0 && event.deltaY < 0;
    const atEnd = list.scrollTop >= max - 1 && event.deltaY > 0;
    if (atStart || atEnd) return;
    event.preventDefault();
    list.scrollTop = Math.min(max, Math.max(0, list.scrollTop + event.deltaY));
  }, { passive: false, capture: true });

  FILTERS_COMPACT?.addEventListener('click', () => {
    filtersExpanded = true;
    filtersUserCollapsed = false;
    filtersUserPinned = (window.scrollY || 0) < 80;
    syncFiltersPanel();
  });

  let filtersScrollTick = false;
  window.addEventListener('scroll', () => {
    if (filtersScrollTick) return;
    filtersScrollTick = true;
    window.requestAnimationFrame(() => {
      filtersScrollTick = false;
      if (typeof isWideNoMarqueeMode !== 'function' || !isWideNoMarqueeMode()) return;
      if (!document.getElementById('wide-rail-stack')) return;
      /* Recalcule seulement l’espace dispo (sticky vs haut de page).
         Plus de sources / Réduire ne change que sur clic. */
      syncWideRailFiltersFit();
    });
  }, { passive: true });

  const onFiltersLayoutChange = () => {
    syncFiltersPanel();
    scheduleFilterMarqueeRefresh();
  };
  window.addEventListener('resize', onFiltersLayoutChange);
  onMediaQueryChange(FILTERS_MOBILE, onFiltersLayoutChange);
  onMediaQueryChange(FILTERS_COMPACT_MQ, onFiltersLayoutChange);

  if (NEWS_FILTERS && typeof ResizeObserver !== 'undefined') {
    const filtersResize = new ResizeObserver(() => {
      syncFiltersPanel();
      scheduleFilterMarqueeRefresh();
    });
    filtersResize.observe(NEWS_FILTERS);
  }

  // Lab grand écran : bascule ?wide= sans reload → re-sync colonnes / rangées,
  // coupe les marquees, recalcule météo (plus de cartes en wide).
  window.addEventListener('radar-wide-preview-change', () => {
    syncFiltersPanel();
    // Purger classes marquee immédiatement (CSS + prochains mesures).
    document.querySelectorAll('.is-marquee').forEach((el) => {
      el.classList.remove('is-marquee');
      el.style.removeProperty('--marquee-shift');
      el.style.removeProperty('--marquee-duration');
      el.style.removeProperty('--marquee-delay');
    });
    document.querySelectorAll('.is-overflowing, .is-sub-overflowing').forEach((el) => {
      el.classList.remove('is-overflowing', 'is-sub-overflowing');
      el.style.removeProperty('--weather-scroll');
      el.style.removeProperty('--sports-scroll');
      el.style.removeProperty('--sports-scroll-sub');
    });
    mastheadWeatherFitCount = null;
    scheduleMastheadWeatherLayout();
    scheduleFilterMarqueeRefresh();
    try {
      sportsFitCount = null;
      sportsFitDepth = 0;
      if (MASTHEAD_SPORTS_STRIP && !MASTHEAD_SPORTS_STRIP.hidden) {
        renderSportsStrip();
        scheduleSportsRotate();
        window.requestAnimationFrame(() => refreshSportsChipScroll());
      }
    } catch { /* ignore */ }
    // Synthé : wrappers wide + largeur inline (sinon barre cassée jusqu’au refresh).
    try {
      syncTunerShellLayout();
    } catch { /* ignore */ }
    try {
      syncWideStickyTop();
      requestAnimationFrame(() => syncWideStickyTop());
    } catch { /* ignore */ }
  });
  window.addEventListener('resize', () => {
    if (isWideTunerLayout()) {
      syncWideStickyTop();
      fitWideDialWidth({ force: true });
    } else {
      clearWideDialInlineSize();
    }
  }, { passive: true });
}

function selectNewsSource(source) {
  newsSourceFilter = source;
  NEWS_FILTERS?.querySelectorAll('.filter-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.source === source));
  // Choisir une source (y compris « Le Radar ») referme le panneau déplié —
  // plus besoin de le laisser ouvert une fois la sélection faite.
  filtersExpanded = false;
  syncFiltersPanel();
  renderNews();
}

// ─── Recherche locale (loupe) ─────────────────────────────────────────────────
/** Normalise pour comparaison insensible aux accents / casse. */
function normalizeSearchText(str = '') {
  return String(str)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    // Apostrophes typographiques (Bishop’s) → espace / lettre adjacente
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Jetons de requête (ET) — chaîne vide → aucun filtre. */
function searchTokens(query = '') {
  const q = normalizeSearchText(query);
  if (!q) return [];
  return q.split(' ').filter((t) => t.length >= 1);
}

/**
 * Variantes légères d'un jeton (pluriel EN/FR simple) pour coller
 * « dancer » ↔ « dancers », « danseur » ↔ « danseurs ».
 */
function searchTokenVariants(token = '') {
  const t = String(token || '');
  if (t.length < 3) return [t];
  const out = new Set([t]);
  if (t.endsWith('ies') && t.length > 4) out.add(`${t.slice(0, -3)}y`);
  if (t.endsWith('y') && t.length > 3) out.add(`${t.slice(0, -1)}ies`);
  if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) out.add(t.slice(0, -1));
  else if (!t.endsWith('s')) out.add(`${t}s`);
  // FR : -eur / -eurs, -euse / -euses (approximation)
  if (t.endsWith('eurs') && t.length > 5) out.add(t.slice(0, -1));
  if (t.endsWith('eur') && t.length > 4) out.add(`${t}s`);
  if (t.endsWith('euses') && t.length > 6) out.add(t.slice(0, -1));
  if (t.endsWith('euse') && t.length > 5) out.add(`${t}s`);
  return [...out];
}

function haystackIncludesToken(hay = '', token = '') {
  if (!token) return true;
  if (hay.includes(token)) return true;
  return searchTokenVariants(token).some((v) => v !== token && hay.includes(v));
}

/**
 * Champs locaux indexés pour la recherche (aucun fetch distant) :
 * titre, auteur, source, établissement, région, extraits, crédits photo.
 */
function articleSearchFields(item = {}) {
  const { author: bylineAuthor, body } = splitByline(item);
  const author = resolveDisplayAuthor(item, bylineAuthor) || item.author || bylineAuthor || '';
  return {
    title: normalizeSearchText(cleanTitle(item.title || '')),
    author: normalizeSearchText(author),
    meta: normalizeSearchText([
      item.source || '',
      item.institution || '',
      item.region || '',
      item.type || '',
    ].join(' ')),
    body: normalizeSearchText([
      item.excerpt || '',
      item.leadExcerpt || '',
      body || '',
    ].join(' ')),
    credits: normalizeSearchText([
      item.imageCreator || '',
      item.sourceImageCreator || '',
      item.imageCredit || '',
      item.sourceImageCredit || '',
      item.imageTitle || '',
    ].join(' ')),
  };
}

function articleSearchHaystack(item = {}) {
  const f = articleSearchFields(item);
  return [f.title, f.author, f.meta, f.body, f.credits].filter(Boolean).join(' ');
}

function articleMatchesSearch(item, tokens) {
  if (!tokens.length) return true;
  const hay = articleSearchHaystack(item);
  return tokens.every((t) => haystackIncludesToken(hay, t));
}

/**
 * Score de pertinence : titre > auteur > source/inst. > extrait > crédits.
 * Utilisé pour classer les résultats (puis date décroissante en filet).
 */
function articleSearchScore(item, tokens) {
  if (!tokens.length) return 0;
  const f = articleSearchFields(item);
  let score = 0;
  for (const t of tokens) {
    if (haystackIncludesToken(f.title, t)) score += 100;
    else if (haystackIncludesToken(f.author, t)) score += 60;
    else if (haystackIncludesToken(f.meta, t)) score += 40;
    else if (haystackIncludesToken(f.body, t)) score += 20;
    else if (haystackIncludesToken(f.credits, t)) score += 10;
    else return 0;
  }
  const ts = Date.parse(item.date || '') || 0;
  // Bonus de fraîcheur très faible pour départager à score égal.
  score += Math.min(ts / 1e15, 0.99);
  return score;
}

function sortSearchResults(items, tokens) {
  return [...items].sort((a, b) => {
    const sb = articleSearchScore(b, tokens);
    const sa = articleSearchScore(a, tokens);
    if (sb !== sa) return sb - sa;
    return (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0);
  });
}

function getNewsSearchQuery() {
  return newsSearchQuery;
}

/*
 * Clavier virtuel : les outils fixed bas de page restent derrière le clavier
 * quand seul le viewport visuel rétrécit. On remonte d'autant (--vk-inset).
 */
function pageToolsRoot() {
  return document.getElementById('page-tools') || NEWS_SEARCH;
}

function updateNewsSearchKeyboardInset() {
  const root = pageToolsRoot();
  if (!root) return;
  const vv = window.visualViewport;
  if (!vv || !newsSearchOpen) {
    root.style.removeProperty('--vk-inset');
    return;
  }
  const occluded = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  if (occluded > 1) {
    root.style.setProperty('--vk-inset', `${Math.round(occluded)}px`);
  } else {
    root.style.removeProperty('--vk-inset');
  }
}

/** Flèche « haut de page » (bas-gauche) — parité page sports. */
function initPageScrollTop() {
  const btn = document.getElementById('page-scroll-top');
  if (!btn) return;
  const SHOW_PX = 360;
  const sync = () => {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const show = y > SHOW_PX;
    btn.hidden = !show;
    btn.setAttribute('aria-hidden', show ? 'false' : 'true');
  };
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  });
  window.addEventListener('scroll', sync, { passive: true });
  sync();
}

/**
 * Liens Accueil (`data-home-nav`) : si on est déjà sur la page cible, scroll
 * en haut + refresh soft du fil (`loadNews` silent) — jamais de reload plein
 * écran, pour ne pas couper la radio en lecture. Sinon, navigation normale.
 */
function initHomeNavRefresh() {
  if (IS_TUNER_EMBED) return;

  const sameDocumentPath = (a, b) => {
    const norm = (p) => {
      let s = String(p || '/');
      if (s.endsWith('/index.html')) s = s.slice(0, -10) || '/';
      if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
      return s || '/';
    };
    return norm(a) === norm(b);
  };

  document.addEventListener('click', (e) => {
    const a = e.target?.closest?.('a[data-home-nav]');
    if (!a || e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    let target;
    try {
      target = new URL(a.href, location.href);
    } catch {
      return;
    }
    if (target.origin !== location.origin) return;
    if (!sameDocumentPath(target.pathname, location.pathname)) return;

    // Déjà sur l'accueil : pas de navigation → audio intact.
    e.preventDefault();
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
    // Refresh soft : reprend news.json sans squelettes clignotants.
    loadNews({ silent: true }).catch(() => { /* fil affiché reste valable */ });
  });
}

function setNewsSearchOpen(open) {
  newsSearchOpen = !!open;
  if (!NEWS_SEARCH || !NEWS_SEARCH_TOGGLE || !NEWS_SEARCH_PANEL) return;

  NEWS_SEARCH.classList.toggle('is-open', newsSearchOpen);
  NEWS_SEARCH_TOGGLE.setAttribute('aria-expanded', newsSearchOpen ? 'true' : 'false');
  NEWS_SEARCH_PANEL.hidden = !newsSearchOpen;
  NEWS_SEARCH_PANEL.setAttribute('aria-hidden', newsSearchOpen ? 'false' : 'true');

  const loupe = NEWS_SEARCH_TOGGLE.querySelector('.news-search__fab-loupe');
  const close = NEWS_SEARCH_TOGGLE.querySelector('.news-search__fab-close');
  loupe?.classList.toggle('hidden', newsSearchOpen);
  close?.classList.toggle('hidden', !newsSearchOpen);

  if (newsSearchOpen) {
    // Focus après paint pour clavier mobile / lecteurs d'écran.
    requestAnimationFrame(() => {
      NEWS_SEARCH_INPUT?.focus({ preventScroll: true });
      NEWS_SEARCH_INPUT?.select?.();
    });
  }
  updateNewsSearchKeyboardInset();
}

function syncNewsSearchChrome() {
  const hasQuery = !!newsSearchQuery;
  NEWS_SEARCH?.classList.toggle('has-query', hasQuery);
  NEWS_SEARCH_CLEAR?.classList.toggle('hidden', !hasQuery);
  NEWS_SEARCH_TOGGLE?.classList.toggle('is-active', hasQuery);
  if (NEWS_SEARCH_HINT) {
    NEWS_SEARCH_HINT.textContent = hasQuery
      ? 'Filtre actif : titres, auteurs, sources, extraits et crédits (données déjà chargées).'
      : 'Recherche locale : titres, auteurs, sources, établissements, extraits et crédits photo.';
  }
}

function setNewsSearchQuery(raw, { render = true } = {}) {
  const next = String(raw || '').trim();
  if (next === newsSearchQuery) {
    syncNewsSearchChrome();
    return;
  }
  newsSearchQuery = next;
  syncNewsSearchChrome();
  if (render) renderNews();
}

/**
 * Efface la requête et restaure le fil complet (sans recharger la page).
 * — Bouton × du champ
 * — Icône X de la loupe quand une recherche est active
 * — Escape
 */
function clearNewsSearch({ keepOpen = true } = {}) {
  // Annuler un debounce encore en vol (sinon l'ancienne requête reviendrait).
  clearTimeout(newsSearchDebounce);
  newsSearchDebounce = null;
  if (NEWS_SEARCH_INPUT) NEWS_SEARCH_INPUT.value = '';
  const hadQuery = !!newsSearchQuery;
  newsSearchQuery = '';
  syncNewsSearchChrome();
  // Toujours re-rendre si on sort d'une recherche (layout une / en bref / suite).
  if (hadQuery) renderNews();
  if (keepOpen) {
    NEWS_SEARCH_INPUT?.focus({ preventScroll: true });
  } else {
    setNewsSearchOpen(false);
  }
}

function bindNewsSearch() {
  if (!NEWS_SEARCH_TOGGLE || !NEWS_SEARCH_INPUT) return;

  NEWS_SEARCH_TOGGLE.addEventListener('click', (e) => {
    e.stopPropagation();
    if (newsSearchOpen) {
      // X de la loupe : effacer la requête (= fin de recherche) + fermer le panneau.
      const hasQuery = !!(newsSearchQuery || String(NEWS_SEARCH_INPUT.value || '').trim());
      if (hasQuery) clearNewsSearch({ keepOpen: false });
      else setNewsSearchOpen(false);
    } else {
      setNewsSearchOpen(true);
    }
  });

  NEWS_SEARCH_INPUT.addEventListener('input', () => {
    const value = NEWS_SEARCH_INPUT.value;
    // Chrome immédiat (bouton ×) ; re-rendu filtré avec léger debounce.
    const trimmed = String(value || '').trim();
    NEWS_SEARCH_CLEAR?.classList.toggle('hidden', !trimmed);
    NEWS_SEARCH?.classList.toggle('has-query', !!trimmed);
    NEWS_SEARCH_TOGGLE?.classList.toggle('is-active', !!trimmed);
    clearTimeout(newsSearchDebounce);
    // Champ vidé à la main (ou via × natif type=search) → clear immédiat.
    if (!trimmed) {
      newsSearchDebounce = null;
      if (newsSearchQuery) {
        newsSearchQuery = '';
        syncNewsSearchChrome();
        renderNews();
      }
      return;
    }
    newsSearchDebounce = setTimeout(() => {
      setNewsSearchQuery(value, { render: true });
    }, 120);
  });

  NEWS_SEARCH_INPUT.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (newsSearchQuery || String(NEWS_SEARCH_INPUT.value || '').trim()) {
        clearNewsSearch({ keepOpen: true });
      } else {
        setNewsSearchOpen(false);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Appliquer tout de suite (sans attendre le debounce).
      clearTimeout(newsSearchDebounce);
      setNewsSearchQuery(NEWS_SEARCH_INPUT.value, { render: true });
      NEWS_SEARCH_INPUT.blur();
    }
  });

  // × dans le champ : effacer la requête, fil complet, panneau reste ouvert.
  NEWS_SEARCH_CLEAR?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearNewsSearch({ keepOpen: true });
  });

  // Clic extérieur : ferme le panneau loupe.
  // Important : un clic sur un résultat (dans #news-list) ne doit PAS effacer la
  // recherche au pointerdown — sinon le nœud <a.article> est détruit avant le click
  // et l'utilisateur n'atteint jamais l'article source.
  document.addEventListener('pointerdown', (e) => {
    if (!newsSearchOpen) return;
    if (NEWS_SEARCH?.contains(e.target)) return;
    // Résultat du fil : laisser le lien s'ouvrir ; on referme seulement le panneau.
    if (NEWS_LIST?.contains(e.target)) {
      setNewsSearchOpen(false);
      return;
    }
    const hasQuery = !!(newsSearchQuery || String(NEWS_SEARCH_INPUT?.value || '').trim());
    if (hasQuery) clearNewsSearch({ keepOpen: false });
    else setNewsSearchOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !newsSearchOpen) return;
    if (e.target === NEWS_SEARCH_INPUT) return; // géré sur l'input
    const hasQuery = !!(newsSearchQuery || String(NEWS_SEARCH_INPUT?.value || '').trim());
    if (hasQuery) clearNewsSearch({ keepOpen: false });
    else setNewsSearchOpen(false);
  });

  // Suivre l'apparition/disparition du clavier virtuel (mobile).
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateNewsSearchKeyboardInset);
    window.visualViewport.addEventListener('scroll', updateNewsSearchKeyboardInset);
  }

  // Raccourci « / » (comme beaucoup de docs) — hors champs de saisie.
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    const tag = t?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
    if (!NEWS_LIST) return; // page sans fil
    e.preventDefault();
    setNewsSearchOpen(true);
  });

  syncNewsSearchChrome();
}

function renderNewsFilters() {
  if (!NEWS_FILTERS) return;
  const sources = sortSourcesForFilters([...new Set(news.map(n => n.source))]);
  [...NEWS_FILTERS.querySelectorAll('[data-source]:not([data-source="all"])')].forEach(b => b.remove());

  sources.forEach(src => {
    const btn = document.createElement('button');
    const { institution, type, color } = sourceInfo(src);
    const instLabel = filterSourceInstitutionLabel(institution, type, src);

    btn.className = 'filter-btn';
    btn.dataset.source = src;
    btn.style.setProperty('--c', color);
    btn.title = institution ? `${src} — ${instLabel || formatInstitutionDisplay(institution)}` : src;
    btn.innerHTML = `
      <span class="filter-btn__row">
        <span class="filter-btn__dot" aria-hidden="true"></span>
        <span class="filter-btn__name notranslate" translate="no">${escapeHtml(src)}</span>
      </span>
      ${instLabel ? '<span class="filter-btn__inst"></span>' : ''}
    `;
    NEWS_FILTERS.appendChild(btn);
  });

  NEWS_FILTERS.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => selectNewsSource(btn.dataset.source);
  });

  NEWS_FILTERS.querySelectorAll('.filter-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.source === newsSourceFilter));

  syncFiltersPanel();
  registerFilterMarqueeObservers();
  applyFilterInstMarquees();
  scheduleFilterMarqueeRefresh();
  markUiReady(FILTERS_PANEL);
}

function renderNews() {
  if (!NEWS_LIST) return;
  const isSourceView = newsSourceFilter !== 'all';
  const tokens = searchTokens(newsSearchQuery);
  const isSearchView = tokens.length > 0;

  let items = isSourceView
    ? news.filter(n => n.source === newsSourceFilter)
    : news;
  if (isSearchView) {
    items = items.filter((n) => articleMatchesSearch(n, tokens));
  }

  NEWS_EMPTY.classList.toggle('hidden', items.length > 0);
  if (NEWS_EMPTY) {
    const emptyP = NEWS_EMPTY.querySelector('p');
    if (emptyP) {
      if (isSearchView && !items.length) {
        emptyP.textContent = `Aucun résultat pour « ${newsSearchQuery} ».`;
      } else {
        emptyP.textContent = 'Aucun article pour le moment.';
      }
    }
  }

  const countLabel = isSearchView
    ? `${items.length} résultat${items.length !== 1 ? 's' : ''}`
    : `${items.length} article${items.length !== 1 ? 's' : ''}`;
  NEWS_COUNT.textContent = countLabel;

  NEWS_LIST.innerHTML = '';
  if (isSearchView) {
    NEWS_LIST.dataset.mode = 'search';
  } else if (isSourceView) {
    NEWS_LIST.dataset.mode = 'source';
  } else {
    NEWS_LIST.removeAttribute('data-mode');
  }

  // Mode recherche (loupe) : liste plate, tous les résultats visibles.
  // Pas de suite du fil ni de « Plus d'articles » — le repli ne s'applique pas.
  if (isSearchView) {
    NEWS_LIST.removeAttribute('data-contingency');
    NEWS_LIST.removeAttribute('data-autumn-grace');
    NEWS_LIST.removeAttribute('data-brief-count');
    NEWS_LIST.removeAttribute('data-hero');
    newsTailExpanded = false;

    if (items.length) {
      const section = document.createElement('div');
      section.className = 'news-search-results';
      const qEsc = escapeHtml(newsSearchQuery);
      section.innerHTML = `<h3 class="news-search-results__title">Résultats pour « ${qEsc} »</h3>`;
      sortSearchResults(items, tokens).forEach((item) => {
        const article = safeCreateArticle(item, 'standard');
        if (article) section.appendChild(article);
      });
      NEWS_LIST.appendChild(section);
    }
    NEWS_LIST.dataset.ready = '1';
    return;
  }

  const hero = document.createElement('div');
  hero.className = 'news-hero';
  const compacts = [];
  const tail = [];

  const partition = isSourceView
    ? partitionSourceFeed(items)
    : partitionNewsFeed(items);
  const { heroItems, briefItems, tailItems, contingencyBand } = partition;

  if (contingencyBand > 0) {
    NEWS_LIST.dataset.contingency = String(contingencyBand);
  } else {
    NEWS_LIST.removeAttribute('data-contingency');
  }
  if (!isSourceView && isAutumnGracePeriod()) {
    NEWS_LIST.dataset.autumnGrace = '1';
  } else {
    NEWS_LIST.removeAttribute('data-autumn-grace');
  }

  // Wide E : 2 unes dès 1920, 3 à 3840 ; prod : 1 une + vedettes.
  const wideDualLead = !isSourceView && isWideDualLeadViewport();
  const leadCount = wideDualLead ? Math.min(wideHeroLeadCount(), heroItems.length) : 1;
  if (wideDualLead) hero.dataset.leads = String(leadCount);
  else hero.removeAttribute('data-leads');
  heroItems.forEach((item, i) => {
    const role = i < leadCount ? 'lead' : 'feature';
    const article = safeCreateArticle(item, role);
    if (article) hero.appendChild(article);
  });

  briefItems.forEach((item) => {
    const article = safeCreateArticle(item, 'compact');
    if (article) compacts.push(article);
  });

  tailItems.forEach((item) => {
    const article = safeCreateArticle(item, 'standard');
    if (article) tail.push(article);
  });

  if (hero.childElementCount) {
    NEWS_LIST.appendChild(hero);
  }
  if (compacts.length) {
    const briefRail = document.createElement('div');
    briefRail.className = 'brief-rail';
    briefRail.innerHTML = '<h3 class="brief-rail-title">En bref</h3>';
    compacts.forEach((article) => briefRail.appendChild(article));
    NEWS_LIST.appendChild(briefRail);
  }

  if (tail.length) {
    const section = document.createElement('div');
    section.className = 'news-tail';
    section.innerHTML = '<h3 class="news-tail-title">Suite du fil</h3><div class="news-tail-body"></div>';
    const body = section.querySelector('.news-tail-body');
    tail.forEach((article) => body.appendChild(article));
    NEWS_LIST.appendChild(section);
  }

  const briefCount = compacts.length;
  if (briefCount) NEWS_LIST.dataset.briefCount = String(briefCount);
  else NEWS_LIST.removeAttribute('data-brief-count');

  // Nouveau rendu : replier la suite sauf si l'utilisateur l'avait déjà ouverte
  // (conservé via newsTailExpanded entre rebalances, reset sur filtre/recherche).
  syncNewsTailCollapse({ preserveExpanded: false });

  updateNewsLayout();
  // Équilibre magazine : combler le vide sous vedettes et/ou sous En bref.
  scheduleMagazineColumnBalance();
  NEWS_LIST.dataset.ready = '1';
}

/** Aperçu de la rangée suivante (titres lisibles), comme --filters-peek. */
const NEWS_TAIL_PEEK_PX = 34;

function ensureNewsTailBody(tail) {
  if (!tail) return null;
  let body = tail.querySelector('.news-tail-body');
  if (body) return body;
  body = document.createElement('div');
  body.className = 'news-tail-body';
  const title = tail.querySelector('.news-tail-title');
  const toggle = tail.querySelector('.news-tail-toggle');
  const loose = [...tail.querySelectorAll(':scope > .article, :scope > a.article')];
  loose.forEach((el) => body.appendChild(el));
  if (toggle) tail.insertBefore(body, toggle);
  else if (title) title.insertAdjacentElement('afterend', body);
  else tail.appendChild(body);
  return body;
}

function getNewsTailCards(tail) {
  const body = ensureNewsTailBody(tail);
  if (!body) return [];
  return [...body.querySelectorAll(':scope > .article, :scope > a.article')];
}

/**
 * Hauteur repliée = bas du 10e article + peek (titres de la rangée d’après).
 */
function measureNewsTailCollapsedHeight(body, cards, visibleCount, peekPx) {
  if (!body || !cards.length) return 0;
  const lastIdx = Math.min(visibleCount, cards.length) - 1;
  const last = cards[lastIdx];
  if (!last) return 0;
  const bodyTop = body.getBoundingClientRect().top;
  const lastBottom = last.getBoundingClientRect().bottom;
  const h = lastBottom - bodyTop + peekPx;
  return Math.max(0, Math.ceil(h));
}

function applyNewsTailCollapsedHeight(tail) {
  const body = tail?.querySelector('.news-tail-body');
  if (!body || !tail.classList.contains('has-overflow') || tail.classList.contains('is-expanded')) {
    body?.style.removeProperty('--news-tail-collapsed-h');
    body?.style.removeProperty('max-height');
    return;
  }
  const cards = getNewsTailCards(tail);
  // Mesure avec tous les articles en layout (pas display:none)
  const h = measureNewsTailCollapsedHeight(body, cards, NEWS_TAIL_VISIBLE, NEWS_TAIL_PEEK_PX);
  if (h > 0) {
    body.style.setProperty('--news-tail-collapsed-h', `${h}px`);
    body.style.maxHeight = `${h}px`;
  }
}

/**
 * Replie la Suite du fil après NEWS_TAIL_VISIBLE articles (comme « Plus de sources »).
 * Aperçu des titres de la rangée suivante + fondu, puis bouton.
 * Ne s'applique jamais à la recherche (liste plate, pas de .news-tail).
 */
function syncNewsTailCollapse({ preserveExpanded = true } = {}) {
  // Recherche loupe : résultats plats, aucun repli.
  if (NEWS_LIST?.dataset.mode === 'search') return;

  const tail = NEWS_LIST?.querySelector('.news-tail');
  if (!tail) return;

  const body = ensureNewsTailBody(tail);
  const cards = getNewsTailCards(tail);
  const overflow = cards.length > NEWS_TAIL_VISIBLE;

  // Overflow : pas de display:none (peek des titres). Marque pour le module
  // de traduction : ne pas MT les cartes *entièrement* hors écran, mais
  // traduire la rangée peek (titres partiels visibles sous le fondu).
  cards.forEach((el, i) => {
    el.classList.remove('news-tail-article--overflow');
    const pastFull = overflow && !newsTailExpanded && i >= NEWS_TAIL_VISIBLE;
    const pastPeek = overflow && !newsTailExpanded
      && i >= NEWS_TAIL_VISIBLE + NEWS_TAIL_PEEK_TRANSLATE;
    el.classList.toggle('is-tail-overflow', pastFull);
    // data-translate-skip = hors zone visible + peek uniquement
    if (pastPeek) el.setAttribute('data-translate-skip', '1');
    else el.removeAttribute('data-translate-skip');
  });

  let toggle = tail.querySelector('.news-tail-toggle');
  if (overflow) {
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'news-tail-toggle';
      toggle.innerHTML = '<span class="news-tail-toggle__label">Plus d\'articles</span>';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        const willExpand = !newsTailExpanded;
        // Mémoriser la position du bouton : à l’ouverture le body s’allonge
        // *au-dessus* du bouton et le navigateur scrolle pour le garder focusé
        // → bas de page. On fige le scroll viewport.
        const yBefore = window.scrollY || window.pageYOffset || 0;
        const toggleTopBefore = toggle.getBoundingClientRect().top;

        newsTailExpanded = willExpand;
        syncNewsTailCollapse({ preserveExpanded: true });

        // Traduire les cartes nouvellement visibles seulement au dépliage
        // (évite de MT toute la suite du fil au choix de langue).
        if (willExpand && typeof window.RadarTranslate?.onNewsTailExpand === 'function') {
          window.setTimeout(() => window.RadarTranslate.onNewsTailExpand(), 0);
        }

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (willExpand) {
              // Contenu s’ouvre vers le bas : rester où on était (ne pas suivre le bouton)
              window.scrollTo({ top: yBefore, left: 0, behavior: 'auto' });
            } else {
              // Repli : garder le bouton à la même place à l’écran
              const delta = toggle.getBoundingClientRect().top - toggleTopBefore;
              if (Math.abs(delta) > 1) {
                window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
              }
            }
          });
        });
      });
      tail.appendChild(toggle);
    }
    tail.classList.add('has-overflow');
    if (!preserveExpanded) newsTailExpanded = false;
    tail.classList.toggle('is-expanded', newsTailExpanded);
    tail.dataset.tailVisible = String(NEWS_TAIL_VISIBLE);
    tail.dataset.tailPeekTranslate = String(NEWS_TAIL_PEEK_TRANSLATE);
    const label = toggle.querySelector('.news-tail-toggle__label');
    const hidden = cards.length - NEWS_TAIL_VISIBLE;
    if (label) {
      label.textContent = newsTailExpanded
        ? 'Réduire'
        : `Plus d'articles (${hidden})`;
    }
    toggle.setAttribute('aria-expanded', newsTailExpanded ? 'true' : 'false');

    // max-height après paint (grille 1 ou 2 colonnes)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (newsTailExpanded) {
          body.style.maxHeight = 'none';
          body.style.removeProperty('--news-tail-collapsed-h');
        } else {
          applyNewsTailCollapsedHeight(tail);
        }
      });
    });
  } else {
    tail.classList.remove('has-overflow', 'is-expanded');
    body.style.maxHeight = 'none';
    body.style.removeProperty('--news-tail-collapsed-h');
    toggle?.remove();
    if (!preserveExpanded) newsTailExpanded = false;
  }
}

function updateNewsLayout() {
  const lead = NEWS_LIST.querySelector('.article--lead');
  if (!lead) {
    NEWS_LIST.removeAttribute('data-hero');
    return;
  }
  NEWS_LIST.dataset.hero = lead.classList.contains('has-image') ? 'image' : 'text';
}

/*
 * Partition magazine — fraîcheur d’abord, aucun article perdu :
 *
 *  A) SNAPSHOT :
 *     - Une + vedettes = les N plus frais (tranche contiguë)
 *     - En bref = 1) une source / établissement, 2) sources sœurs encore
 *       absentes, 3) 2ᵉ titre seulement quand toutes les sources du reste
 *       sont représentées (une ∪ En bref). Suite = tout le reste (rien d’omis).
 *
 *  B) ÉQUILIBRE (magazine 2 col, dès 768 px) — *seulement* En bref :
 *     1) TRIM si trop haute (→ suite)
 *     2) FILL si trop basse (même ordre de priorité, depuis la réserve)
 *     iPad portrait 768–834 : même rail CSS que mid ; sans cet équilibre
 *     la graine bureau (≈10 brèves) laisse un vide sous les vedettes.
 */
const HERO_FEATURE_MIN = 4; /* 4 vedettes + 1 une = 5 (prod) */
const HERO_FEATURE_MAX = 4;
const HERO_SPOTLIGHT_MAX = 1 + HERO_FEATURE_MIN; /* 5 au total prod */
/* Wide E : 2 unes dès 1920 ; 3 unes + 6 vedettes (3 col) à 3840. */
const HERO_WIDE_LEAD_COUNT = 2;
const HERO_WIDE_FEATURE_MIN = 4;
const HERO_UHD_LEAD_COUNT = 3;
const HERO_UHD_FEATURE_MIN = 6;

function isWideDualLeadViewport() {
  try {
    return typeof isWideNoMarqueeMode === 'function'
      && isWideNoMarqueeMode()
      && (window.innerWidth || 0) >= 1920;
  } catch {
    return false;
  }
}

function wideHeroLeadCount() {
  if (!isWideDualLeadViewport()) return 1;
  return (window.innerWidth || 0) >= 3840 ? HERO_UHD_LEAD_COUNT : HERO_WIDE_LEAD_COUNT;
}

function wideHeroFeatureCount() {
  if (!isWideDualLeadViewport()) return HERO_FEATURE_MIN;
  return (window.innerWidth || 0) >= 3840 ? HERO_UHD_FEATURE_MIN : HERO_WIDE_FEATURE_MIN;
}

function wideHeroSpotlightMax() {
  return isWideDualLeadViewport()
    ? wideHeroLeadCount() + wideHeroFeatureCount()
    : HERO_SPOTLIGHT_MAX;
}
const BRIEF_SIDEBAR_SEED_MIN = 4;
const BRIEF_SIDEBAR_SEED_MAX = 12;
const BRIEF_SIDEBAR_MAX = 18;
const BRIEF_SIDEBAR_HARD_MIN = 2; /* plancher trim — au-dessous on accepte le vide */
const BRIEF_SIDEBAR_MIN = BRIEF_SIDEBAR_SEED_MIN;
const AVG_LEAD_CARD_H = 400;
const AVG_FEATURE_CARD_H = 148;
const AVG_BRIEF_CARD_H = 108;
const AVG_BRIEF_TITLE_H = 42;
/*
 * Tolérance d’équité colonnes (hero vs En bref).
 * Doit rester nettement sous une carte En bref (~108 px) : à 96 px, une fiche
 * de trop restait visible sous les vedettes. 40 px = petit spacer OK, 1 carte non.
 */
const COLUMN_HEIGHT_TOL = 40;
/* Vue source : 1 une + jusqu’à 2 vedettes (fraîcheur), puis En bref / suite. */
const SOURCE_FEATURE_MAX = 2;
const SOURCE_HERO_SPOTLIGHT_MAX = 1 + SOURCE_FEATURE_MAX;

function estimateHeroSeedHeight(heroCount) {
  if (heroCount <= 0) return 0;
  const wideDual = isWideDualLeadViewport() && heroCount >= 2;
  if (wideDual) {
    const leads = Math.min(wideHeroLeadCount(), heroCount);
    const feats = Math.max(0, heroCount - leads);
    const leadH = Math.round(AVG_LEAD_CARD_H * (leads >= 3 ? 1.02 : 1.15));
    const featCols = (window.innerWidth || 0) >= 3840 ? 3 : 2;
    const featRows = Math.ceil(feats / featCols);
    return leadH + featRows * AVG_FEATURE_CARD_H;
  }
  return Math.round(AVG_LEAD_CARD_H * 1.2) + Math.max(0, heroCount - 1) * AVG_FEATURE_CARD_H;
}

/** Nombre de colonnes CSS En bref (wide E). */
function briefWideColumnCount() {
  if (typeof isWideNoMarqueeMode !== 'function' || !isWideNoMarqueeMode()) return 1;
  try {
    /* 2 col seulement quand la piste ≈ 2× la largeur En bref de 1920. */
    if ((window.innerWidth || 0) >= 3440) return 2;
  } catch { /* ignore */ }
  return 1;
}

/**
 * Graine En bref ≈ hauteur hero estimée.
 * @param {number} heroCount
 * @param {{ sourceMode?: boolean }} [opts] — vue source : une image + vedettes
 *   sous-estiment souvent la hauteur réelle → graine un peu plus haute.
 */
function briefSeedCountForHero(heroCount, opts = {}) {
  const sourceMode = !!opts.sourceMode;
  const mid = !sourceMode && isMidwidthMagazinePreview();
  const wideE = typeof isWideNoMarqueeMode === 'function' && isWideNoMarqueeMode();
  // Mid : rail 240–280 px → chaque carte En bref est plus haute (titres wrap).
  // Wide multi-col : graine = lignes × colonnes (pas hauteur/cardH qui sous-estime).
  let cardH = mid ? Math.round(AVG_BRIEF_CARD_H * 1.35) : AVG_BRIEF_CARD_H;
  let cols = 1;
  if (wideE) {
    cols = briefWideColumnCount();
    // Hauteur de ligne réelle compact (souvent 160–220 avec image) — graine large.
    cardH = Math.max(140, AVG_BRIEF_CARD_H + 40);
  }
  const target = Math.max(0, estimateHeroSeedHeight(heroCount) - AVG_BRIEF_TITLE_H);
  // Source : un peu au-dessus de l’estimé (images), sans graine trop haute
  // (sinon 1 carte de trop en En bref après paint).
  const mult = sourceMode ? 1.45 : (mid ? 0.85 : (wideE ? 1.35 : 1));
  let n = Math.round((target * mult) / cardH);
  if (wideE && cols > 1) {
    // Remplir des rangées complètes : rows × cols
    const rows = Math.max(3, Math.ceil(n / cols));
    n = rows * cols;
  }
  const min = sourceMode && !wideE
    ? Math.max(BRIEF_SIDEBAR_SEED_MIN, 5)
    : (mid ? 3 : (wideE ? Math.max(BRIEF_SIDEBAR_SEED_MIN, cols * (cols > 1 ? 5 : 3)) : BRIEF_SIDEBAR_SEED_MIN));
  const max = sourceMode && !wideE
    ? Math.min(BRIEF_SIDEBAR_MAX, BRIEF_SIDEBAR_SEED_MAX + 2)
    : (mid ? Math.min(8, BRIEF_SIDEBAR_SEED_MAX)
      : (wideE ? briefSidebarMaxSlots() : BRIEF_SIDEBAR_SEED_MAX));
  return Math.min(max, Math.max(min, n));
}

/** Réserve = suite du fil (date desc) pour le fill B uniquement. */
let magazineReserve = [];
let magazineBalanceTimer = 0;
let magazineBalanceBusy = false;
/** True si un rebalance a été demandé pendant qu'un fill tournait. */
let magazineBalanceQueued = false;
const magazineMeta = {
  heroKeys: new Set(),
  heroSources: new Set(),
  heroInsts: new Set(),
  briefKeys: new Set(),
  briefSources: new Set(),
  briefInsts: new Set(),
};
/**
 * Fraîcheur universelle : scripts/session-freshness-lib.js
 * (même règle bots + UI — automne/hiver/été + grâce septembre).
 */
const _SF = (typeof RadarSessionFreshness !== 'undefined') ? RadarSessionFreshness : null;
const FRESHNESS_SESSION_COUNT = _SF?.FRESHNESS_SESSION_COUNT ?? 3;
const CONTINGENCY_MAX_SESSIONS_BACK = _SF?.CONTINGENCY_MAX_SESSIONS_BACK
  ?? (FRESHNESS_SESSION_COUNT - 1);
/* Stack 1 col / hors magazine : budgets larges (parité Kiosque). */
const BRIEF_LIMITS = { lead: 960, feature: 960, compact: 420, standard: 300 };
/**
 * Magazine 2 colonnes — extraits bornés pour l’équilibre, sans affamer En bref.
 * (compact trop bas → chapôs ridicules + « Lire la suite » trop tôt.)
 */
const BRIEF_LIMITS_DESKTOP_MAG = { lead: 780, feature: 680, compact: 340, standard: 280 };
const BRIEF_LIMITS_MID = { lead: 700, feature: 580, compact: 300, standard: 260 };
const LEAD_BRIEF_MIN_CHARS = 160;
const BRIEF_COMPACT_MIN_CHARS = 150;
const FEATURE_BRIEF_MIN_CHARS = LEAD_BRIEF_MIN_CHARS;
const LEAD_BRIEF_MIN_CHARS_MAG = 120;
const BRIEF_COMPACT_MIN_CHARS_MAG = 130;
const FEATURE_BRIEF_MIN_CHARS_MAG = 110;
const LEAD_BRIEF_MIN_CHARS_MID = 110;
const BRIEF_COMPACT_MIN_CHARS_MID = 120;
const FEATURE_BRIEF_MIN_CHARS_MID = 100;

/** Bureau magazine ≥1100 (hors mid 768–1099). */
function isDesktopMagazineLayout() {
  if (isMidwidthMagazineLayout()) return false;
  try {
    return window.matchMedia('(min-width: 1100px)').matches;
  } catch {
    return false;
  }
}

/** Budgets d’extrait : mid C → desktop mag → stack large. */
function briefLimitForRole(role = 'standard') {
  let table = BRIEF_LIMITS;
  if (isMidwidthMagazinePreview()) table = BRIEF_LIMITS_MID;
  else if (isDesktopMagazineLayout()) table = BRIEF_LIMITS_DESKTOP_MAG;
  return table[role] ?? 170;
}

function briefMinCharsForRole(role = 'standard') {
  if (isMidwidthMagazinePreview()) {
    if (role === 'compact') return BRIEF_COMPACT_MIN_CHARS_MID;
    if (role === 'feature') return FEATURE_BRIEF_MIN_CHARS_MID;
    if (role === 'lead') return LEAD_BRIEF_MIN_CHARS_MID;
  }
  if (isDesktopMagazineLayout()) {
    if (role === 'compact') return BRIEF_COMPACT_MIN_CHARS_MAG;
    if (role === 'feature') return FEATURE_BRIEF_MIN_CHARS_MAG;
    if (role === 'lead') return LEAD_BRIEF_MIN_CHARS_MAG;
  }
  if (role === 'compact') return BRIEF_COMPACT_MIN_CHARS;
  if (role === 'feature') return FEATURE_BRIEF_MIN_CHARS;
  return LEAD_BRIEF_MIN_CHARS;
}

function articleKey(item) {
  return item.link || `${item.source}::${item.date}::${item.title}`;
}

function institutionKey(item) {
  return item.institution || item.source;
}

function sourceKey(item) {
  return item.source;
}

function latestPerKey(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const k = keyFn(item);
    const cur = map.get(k);
    if (!cur || new Date(item.date || 0) > new Date(cur.date || 0)) {
      map.set(k, item);
    }
  }
  return map;
}

function sortByDateDesc(items) {
  return [...items].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

/* --- Calendrier / fraîcheur : délégué à session-freshness-lib (universel) --- */
function getCurrentUniversitySessionStart(referenceDate = new Date()) {
  return _SF
    ? _SF.getCurrentUniversitySessionStart(referenceDate)
    : (() => {
      const y = referenceDate.getFullYear();
      const m = referenceDate.getMonth();
      if (m >= 8) return new Date(y, 8, 1);
      if (m >= 4) return new Date(y, 4, 1);
      return new Date(y, 0, 1);
    })();
}

function getUniversitySessionStart(referenceDate = new Date(), sessionsBack = 0) {
  return _SF
    ? _SF.getUniversitySessionStart(referenceDate, sessionsBack)
    : getCurrentUniversitySessionStart(referenceDate);
}

function getUniversitySessionBand(referenceDate = new Date(), sessionsBack = 0) {
  return _SF
    ? _SF.getUniversitySessionBand(referenceDate, sessionsBack)
    : { start: getCurrentUniversitySessionStart(referenceDate), end: referenceDate };
}

function isWithinUniversitySessionBand(item, referenceDate = new Date(), sessionsBack = 0) {
  return _SF
    ? _SF.isWithinUniversitySessionBand(item, referenceDate, sessionsBack)
    : false;
}

function sessionBandPool(items, referenceDate = new Date(), sessionsBack = 0) {
  return sortByDateDesc(
    items.filter((i) => isWithinUniversitySessionBand(i, referenceDate, sessionsBack)),
  );
}

function isAutumnGracePeriod(referenceDate = new Date()) {
  return _SF
    ? _SF.isAutumnGracePeriod(referenceDate)
    : referenceDate.getMonth() === 8;
}

function freshnessMaxSessionsBack(referenceDate = new Date()) {
  return _SF
    ? _SF.freshnessMaxSessionsBack(referenceDate)
    : CONTINGENCY_MAX_SESSIONS_BACK + (isAutumnGracePeriod(referenceDate) ? 1 : 0);
}

function isWithinFreshnessWindow(item, referenceDate = new Date()) {
  return _SF
    ? _SF.isWithinFreshnessWindow(item, referenceDate)
    : false;
}

function isPublishedOnOrBefore(item, referenceDate = new Date()) {
  return _SF
    ? _SF.isPublishedOnOrBefore(item, referenceDate)
    : (() => {
      const published = new Date(item.date || 0);
      return Number.isFinite(published.getTime()) && published.getTime() <= referenceDate.getTime();
    })();
}

function filterFreshItems(items, referenceDate = new Date()) {
  return _SF
    ? _SF.filterFreshItems(items, referenceDate)
    : items.filter(
      (item) => isPublishedOnOrBefore(item, referenceDate) && isWithinFreshnessWindow(item, referenceDate),
    );
}

function itemHasThumbPhoto(item) {
  return hasUsablePhoto(item, 'feature') || hasStockPhoto(item, 'feature');
}

function isArticlePicked(item, picks) {
  const key = articleKey(item);
  return picks.some((pick) => articleKey(pick) === key);
}

/**
 * À la une + vedettes — **strictement par date** sur le pool déjà filtré frais.
 * (filterFreshItems a déjà appliqué la fenêtre 3 sessions ; pas de bande
 * intermédiaire qui re-trierait autrement.)
 * - Une = sorted[0] (le plus récent de tout le fil)
 * - Vedettes = sorted[1..n] (même source OK)
 * Ainsi on n'aura jamais un 12 mai en une/vedette tant qu'un 10 juil. reste
 * dans la suite du fil.
 */
function pickHeroSpotlight(items, _referenceDate = new Date()) {
  const sorted = sortByDateDesc(items);
  if (!sorted.length) {
    return { items: [], contingencyBand: 0 };
  }
  const wideDual = isWideDualLeadViewport();
  const maxN = wideDual ? wideHeroSpotlightMax() : HERO_SPOTLIGHT_MAX;
  const n = Math.min(maxN, sorted.length);
  // Tranche contiguë des n plus frais. Wide dual : les 2 unes = les 2 plus frais
  // (même institution OK — pas de glissement pour « diversifier »).
  const picked = sorted.slice(0, n);
  return {
    items: picked,
    contingencyBand: 0,
  };
}

/** Sources déjà montrées (une / vedettes / En bref). */
function magazineRepresentedSources(heroItems = [], briefItems = []) {
  const out = new Set();
  for (const item of heroItems) {
    const s = sourceKey(item);
    if (s) out.add(s);
  }
  for (const item of briefItems) {
    const s = sourceKey(item);
    if (s) out.add(s);
  }
  return out;
}

/** Il reste dans `pool` un article d’une source encore absente de `usedSources`. */
function poolHasUncoveredSource(pool, usedSources, skipKeys) {
  for (const item of pool) {
    if (skipKeys.has(articleKey(item))) continue;
    const src = sourceKey(item);
    if (src && !usedSources.has(src)) return true;
  }
  return false;
}

/**
 * En bref, dans l’ordre (toujours date desc à l’intérieur d’une passe) :
 *  1) 1er titre d’un établissement pas encore à la une ni en En bref
 *     (et d’une source pas déjà à la une) — représentativité campus
 *  2) sources sœurs encore absentes (autre journal du même campus)
 *  3) 2ᵉ titre d’une source / institution **seulement** s’il ne reste
 *     aucune source non représentée dans le reste du fil
 *
 * Tout le reste va dans la suite : aucun article n’est omis.
 * @param {number} [maxSlots]
 */
function pickBriefSidebar(allItems, heroItems = [], _referenceDate = new Date(), maxSlots = null) {
  const heroKeys = new Set(heroItems.map(articleKey));
  const heroSources = new Set(heroItems.map(sourceKey).filter(Boolean));
  const heroInsts = new Set(heroItems.map(institutionKey).filter(Boolean));
  const remaining = sortByDateDesc(allItems).filter((item) => !heroKeys.has(articleKey(item)));
  const limit = Math.max(
    1,
    maxSlots == null ? briefSeedCountForHero(heroItems.length) : maxSlots,
  );

  const picks = [];
  const pickedKeys = new Set();
  const briefSources = new Set();
  const briefInsts = new Set();

  const usedSources = () => {
    const s = new Set(heroSources);
    for (const x of briefSources) s.add(x);
    return s;
  };

  const take = (item) => {
    picks.push(item);
    pickedKeys.add(articleKey(item));
    const src = sourceKey(item);
    const inst = institutionKey(item);
    if (src) briefSources.add(src);
    if (inst) briefInsts.add(inst);
  };

  // Passe 1 — un établissement, une source, fraîcheur.
  for (const item of remaining) {
    if (picks.length >= limit) break;
    const src = sourceKey(item);
    const inst = institutionKey(item);
    if (!src) continue;
    if (heroSources.has(src) || briefSources.has(src)) continue;
    if (inst && (heroInsts.has(inst) || briefInsts.has(inst))) continue;
    take(item);
  }

  // Passe 2 — sources encore absentes (journal sœur), toujours fraîcheur.
  if (picks.length < limit) {
    for (const item of remaining) {
      if (picks.length >= limit) break;
      if (pickedKeys.has(articleKey(item))) continue;
      const src = sourceKey(item);
      if (!src || heroSources.has(src) || briefSources.has(src)) continue;
      take(item);
    }
  }

  // Passe 3 — 2ᵉ titre seulement si toutes les sources du reste sont là.
  if (picks.length < limit && !poolHasUncoveredSource(remaining, usedSources(), pickedKeys)) {
    const perSrc = new Map();
    for (const item of [...heroItems, ...picks]) {
      const src = sourceKey(item);
      if (src) perSrc.set(src, (perSrc.get(src) || 0) + 1);
    }
    for (const item of remaining) {
      if (picks.length >= limit) break;
      if (pickedKeys.has(articleKey(item))) continue;
      const src = sourceKey(item);
      if ((perSrc.get(src) || 0) >= 2) continue;
      take(item);
      if (src) perSrc.set(src, (perSrc.get(src) || 0) + 1);
    }
  }

  return {
    items: sortByDateDesc(picks),
    contingencyBand: 0,
  };
}

/**
 * Filet d'invariants après partition / fill :
 * - la une = article le plus frais du pool global
 * - aucune vedette plus ancienne qu'un article encore en suite du fil
 *   qui pourrait la remplacer dans le top-N hero
 * (réordonne hero en tranche contiguë des |hero| plus frais du pool).
 */
function enforceHeroDateOrder(heroItems, allSorted) {
  if (!heroItems?.length || !allSorted?.length) return heroItems || [];
  const wideDual = isWideDualLeadViewport();
  const floor = wideDual ? wideHeroSpotlightMax() : HERO_SPOTLIGHT_MAX;
  const n = Math.min(Math.max(heroItems.length, floor), allSorted.length);
  // Filet : n plus frais, dans l’ordre. Dual une = les 2 dates les plus récentes.
  return allSorted.slice(0, n);
}

function resetMagazineMeta(heroItems = [], briefItems = []) {
  magazineMeta.heroKeys = new Set(heroItems.map(articleKey));
  magazineMeta.heroSources = new Set(heroItems.map(sourceKey));
  magazineMeta.heroInsts = new Set(heroItems.map(institutionKey));
  magazineMeta.briefKeys = new Set(briefItems.map(articleKey));
  magazineMeta.briefSources = new Set(briefItems.map(sourceKey));
  magazineMeta.briefInsts = new Set(briefItems.map(institutionKey));
}

function partitionNewsFeed(items, referenceDate = new Date()) {
  // Pool unique, date desc — seule source de vérité pour l'ordre de fraîcheur.
  const sorted = sortByDateDesc(filterFreshItems(items, referenceDate));
  const { items: rawHero, contingencyBand: heroBand } = pickHeroSpotlight(sorted, referenceDate);
  // Filet : une + vedettes = toujours les |n| plus frais du pool.
  const heroItems = enforceHeroDateOrder(
    ensureHeroLeadHasImage(rawHero, sorted),
    sorted,
  );
  // Graine En bref ≈ hauteur estimée du hero ; le fill ne touche qu'à En bref.
  const briefSeed = briefSeedCountForHero(heroItems.length);
  const { items: briefItems, contingencyBand: briefBand } = pickBriefSidebar(
    sorted,
    heroItems,
    referenceDate,
    briefSeed,
  );
  const heroKeys = new Set(heroItems.map(articleKey));
  const briefClean = briefItems.filter((i) => !heroKeys.has(articleKey(i)));
  const briefKeysClean = new Set(briefClean.map(articleKey));
  const tailItems = sorted.filter(
    (i) => !heroKeys.has(articleKey(i)) && !briefKeysClean.has(articleKey(i)),
  );
  // Réserve pour le fill magazine (phase B)
  magazineReserve = tailItems.slice();
  resetMagazineMeta(heroItems, briefClean);
  const contingencyBand = Math.max(heroBand, briefBand);
  return { heroItems, briefItems: briefClean, tailItems, contingencyBand };
}

/**
 * Magazine 2 col dès 768 px (CSS mid + iPad portrait).
 * · 768–1099 : magazine mid (rail étroit) — iPad mini/Air/Pro 11 portrait
 * · ≥1100 : magazine bureau
 * Le CSS a baissé le seuil de 900 → 768 pour les iPad portrait ; le JS
 * d’équilibre / graine / extraits mid doit suivre, sinon En bref sème
 * trop de cartes (graine bureau) et laisse un vide sous les vedettes.
 * Recherche = liste plate — pas d’équilibre colonnes.
 */
const MAGAZINE_MID_MIN_PX = 768;
const MAGAZINE_MID_MAX_PX = 1099.98;

function canBalanceMagazineColumns() {
  if (!NEWS_LIST) return false;
  if (NEWS_LIST.dataset.mode === 'search') return false;
  const minPx = (typeof window.__radarMidwidthPreview?.magazineMinPx === 'function')
    ? window.__radarMidwidthPreview.magazineMinPx()
    : MAGAZINE_MID_MIN_PX;
  return window.matchMedia(`(min-width: ${minPx}px)`).matches;
}

/**
 * Magazine mid 768–1099 (prod) — même plage que le CSS 2 col étroit.
 * Rail étroit → cartes En bref plus hautes ; budgets d’extrait MID.
 */
function isMidwidthMagazinePreview() {
  try {
    return window.matchMedia(
      `(min-width: ${MAGAZINE_MID_MIN_PX}px) and (max-width: ${MAGAZINE_MID_MAX_PX}px)`,
    ).matches;
  } catch {
    return false;
  }
}

/** Alias sémantique prod (même plage que isMidwidthMagazinePreview). */
function isMidwidthMagazineLayout() {
  return isMidwidthMagazinePreview();
}

function removeTailArticleForItem(item) {
  const tail = NEWS_LIST?.querySelector('.news-tail');
  if (!tail || !item) return;
  const link = safeHttpUrl(item.link);
  const title = cleanTitle(item.title || '');
  const body = ensureNewsTailBody(tail);
  const nodes = body
    ? [...body.querySelectorAll('.article')]
    : [...tail.querySelectorAll('.article')];
  for (const node of nodes) {
    const href = node.getAttribute?.('href') || node.href || '';
    const nodeTitle = node.querySelector('.article-title')?.textContent?.trim() || '';
    if ((link && href === link) || (title && nodeTitle === title)) {
      node.remove();
      break;
    }
  }
  const remaining = (body || tail).querySelectorAll('.article');
  if (!remaining.length) {
    tail.remove();
  } else {
    syncNewsTailCollapse({ preserveExpanded: true });
  }
}

/**
 * Prochain En bref depuis la réserve (date desc) :
 *  1) nouvelle institution + source pas encore à la une
 *  2) source encore absente (journal sœur)
 *  3) 2ᵉ titre (allowExtra) seulement s’il ne reste aucune source découverte
 * Vue source : `allowHeroInstitution` autorise le média filtré à se répéter.
 */
function takeNextBriefFromReserve({ allowExtra = false, allowHeroInstitution = false } = {}) {
  if (!magazineReserve.length) return null;

  const tryPick = (pred) => {
    const idx = magazineReserve.findIndex((item) => {
      const key = articleKey(item);
      if (magazineMeta.heroKeys.has(key) || magazineMeta.briefKeys.has(key)) return false;
      return pred(item);
    });
    if (idx < 0) return null;
    return magazineReserve.splice(idx, 1)[0];
  };

  const srcUsed = (item) => {
    const src = sourceKey(item);
    return src && (magazineMeta.heroSources.has(src) || magazineMeta.briefSources.has(src));
  };
  const instUsed = (item) => {
    const inst = institutionKey(item);
    if (!inst) return false;
    if (magazineMeta.briefInsts.has(inst)) return true;
    if (!allowHeroInstitution && magazineMeta.heroInsts.has(inst)) return true;
    return false;
  };

  const uncovered = poolHasUncoveredSource(
    magazineReserve,
    new Set([...magazineMeta.heroSources, ...magazineMeta.briefSources]),
    new Set([...magazineMeta.heroKeys, ...magazineMeta.briefKeys]),
  );

  // 1) Nouveau campus (source pas déjà à la une)
  const freshInst = tryPick((item) => !srcUsed(item) && !instUsed(item));
  if (freshInst) return freshInst;

  // 2) Source sœur encore absente — avant tout 2ᵉ titre d’un campus déjà là
  const sister = tryPick((item) => !srcUsed(item));
  if (sister) return sister;

  // 3) Extra seulement si toutes les sources du reste sont représentées
  if (allowExtra && !uncovered) {
    return tryPick(() => true);
  }
  return null;
}

/**
 * Prochain vedette : le plus frais de la réserve (même source OK).
 * La réserve est triée date desc → index 0 = plus frais restant.
 */
function takeNextFeatureFromReserve() {
  if (!magazineReserve.length) return null;
  // Toujours le plus frais restant (tête de file).
  while (magazineReserve.length) {
    const item = magazineReserve.shift();
    const key = articleKey(item);
    if (magazineMeta.heroKeys.has(key) || magazineMeta.briefKeys.has(key)) continue;
    return item;
  }
  return null;
}

function markPromotedToHero(item) {
  magazineMeta.heroKeys.add(articleKey(item));
  magazineMeta.heroSources.add(sourceKey(item));
  magazineMeta.heroInsts.add(institutionKey(item));
}

function markPromotedToBrief(item) {
  magazineMeta.briefKeys.add(articleKey(item));
  magazineMeta.briefSources.add(sourceKey(item));
  magazineMeta.briefInsts.add(institutionKey(item));
}

function rebuildBriefMetaFromDom(brief) {
  magazineMeta.briefKeys = new Set();
  magazineMeta.briefSources = new Set();
  magazineMeta.briefInsts = new Set();
  brief?.querySelectorAll('.article--compact').forEach((el) => {
    const item = el.__radarItem;
    if (!item) return;
    magazineMeta.briefKeys.add(articleKey(item));
    magazineMeta.briefSources.add(sourceKey(item));
    magazineMeta.briefInsts.add(institutionKey(item));
  });
}

/** Resync institutions une/vedettes depuis le DOM (évite meta désync après fill). */
function rebuildHeroMetaFromDom(hero) {
  magazineMeta.heroKeys = new Set();
  magazineMeta.heroSources = new Set();
  magazineMeta.heroInsts = new Set();
  hero?.querySelectorAll('.article--lead, .article--feature').forEach((el) => {
    const item = el.__radarItem;
    if (!item) return;
    magazineMeta.heroKeys.add(articleKey(item));
    magazineMeta.heroSources.add(sourceKey(item));
    magazineMeta.heroInsts.add(institutionKey(item));
  });
}

/**
 * Filet : un 2ᵉ titre de la *même source* que la une n’occupe pas En bref
 * tant qu’une source du reste n’a pas eu sa place. Les journaux sœurs
 * (même campus, autre source) restent.
 */
function purgeBriefCardsFromHeroInstitutions(brief) {
  if (!brief || NEWS_LIST?.dataset.mode === 'source') return 0;
  const uncovered = poolHasUncoveredSource(
    magazineReserve,
    new Set([...magazineMeta.heroSources, ...magazineMeta.briefSources]),
    new Set([...magazineMeta.heroKeys, ...magazineMeta.briefKeys]),
  );
  if (!uncovered) return 0;
  let removed = 0;
  const cards = [...brief.querySelectorAll('.article--compact')];
  for (const card of cards) {
    const item = resolveItemFromCard(card);
    if (!item) continue;
    const src = sourceKey(item);
    if (!src || !magazineMeta.heroSources.has(src)) continue;
    if (demoteBriefCardToTail(brief, card)) removed += 1;
  }
  return removed;
}

function clearMagazineSpacers(root) {
  root?.querySelectorAll('.news-hero-spacer, .brief-rail-spacer').forEach((n) => n.remove());
}

function ensureMagazineColumnSpacers(hero, brief) {
  clearMagazineSpacers(hero);
  clearMagazineSpacers(brief);
  const hs = document.createElement('div');
  hs.className = 'news-hero-spacer';
  hs.setAttribute('aria-hidden', 'true');
  hero.appendChild(hs);
  const bs = document.createElement('div');
  bs.className = 'brief-rail-spacer';
  bs.setAttribute('aria-hidden', 'true');
  brief.appendChild(bs);
}

function appendBeforeMagazineSpacer(column, el) {
  if (!column || !el) return;
  const spacer = column.querySelector('.news-hero-spacer, .brief-rail-spacer');
  if (spacer) column.insertBefore(el, spacer);
  else column.appendChild(el);
}

/**
 * Hauteur du *contenu* (hors spacer). Pas offsetHeight de la cellule stretchée.
 * Utilise le bas réel du dernier enfant (max offsetTop+height) pour les grilles
 * multi-colonnes d’En bref : sommer les hauteurs comptait 2–3× le visuel et
 * forçait un trim excessif (vide en bas).
 */
function magazineColumnContentHeight(col) {
  if (!col) return 0;
  let maxBottom = 0;
  let sumFallback = 0;
  for (const child of col.children) {
    if (
      child.classList?.contains('news-hero-spacer')
      || child.classList?.contains('brief-rail-spacer')
    ) {
      continue;
    }
    const style = getComputedStyle(child);
    const mt = parseFloat(style.marginTop) || 0;
    const mb = parseFloat(style.marginBottom) || 0;
    const h = child.offsetHeight + mt + mb;
    sumFallback += h;
    // offsetTop est relatif au padding edge de l’offsetParent (souvent la col).
    const bottom = child.offsetTop + child.offsetHeight + mb;
    if (bottom > maxBottom) maxBottom = bottom;
  }
  const cs = getComputedStyle(col);
  const padB = parseFloat(cs.paddingBottom) || 0;
  // maxBottom déjà depuis le haut du contenu ; + pad bas si besoin
  if (maxBottom > 0) return maxBottom + padB;
  return sumFallback + (parseFloat(cs.paddingTop) || 0) + padB;
}

/** Plafond En bref : plus haut en wide E (2/média + multi-col) pour coller le bas. */
function briefSidebarMaxSlots() {
  if (typeof isWideNoMarqueeMode === 'function' && isWideNoMarqueeMode()) {
    try {
      const w = window.innerWidth || 0;
      if (w >= 3440) return 32; // 2 col En bref
      if (w >= 1920) return 26; // 1 col, une 2-col
      return 26; // 1440–1600 1 col
    } catch { /* ignore */ }
    return 26;
  }
  return BRIEF_SIDEBAR_MAX;
}

/** Retrouve un item news depuis une carte DOM (href / titre). */
function resolveItemFromCard(cardEl) {
  if (!cardEl) return null;
  if (cardEl.__radarItem) return cardEl.__radarItem;
  const href = cardEl.getAttribute?.('href') || cardEl.href || '';
  const title = cardEl.querySelector?.('.article-title')?.textContent?.trim() || '';
  const match = (it) => {
    const link = safeHttpUrl(it.link) || it.link || '';
    return (href && link && href === link)
      || (title && cleanTitle(it.title || '') === title);
  };
  const fromReserve = magazineReserve.find(match);
  if (fromReserve) return fromReserve;
  if (Array.isArray(news)) {
    const fromNews = news.find(match);
    if (fromNews) return fromNews;
  }
  return null;
}

/**
 * Insère une carte dans la suite du fil en respectant l’ordre date desc.
 * (Ne jamais prepend : un trim En bref d’un vieux billet UQTR/mai se
 * retrouvait sinon en tête de suite, au-dessus de juillet.)
 */
function insertTailArticleByDate(body, el, item) {
  if (!body || !el) return;
  const itemTs = Date.parse(item?.date || '') || 0;
  const cards = [...body.querySelectorAll(':scope > .article, :scope > a.article')];
  for (const card of cards) {
    const other = card.__radarItem;
    const otherTs = Date.parse(other?.date || '') || 0;
    if (itemTs > otherTs) {
      body.insertBefore(el, card);
      return;
    }
  }
  body.appendChild(el);
}

/** Réordonne le corps de la suite du fil (date desc) — filet anti-dérive. */
function sortNewsTailBodyByDate(tail) {
  const body = ensureNewsTailBody(tail);
  if (!body) return;
  const cards = [...body.querySelectorAll(':scope > .article, :scope > a.article')];
  if (cards.length < 2) return;
  cards.sort((a, b) => {
    const da = Date.parse(a.__radarItem?.date || '') || 0;
    const db = Date.parse(b.__radarItem?.date || '') || 0;
    if (db !== da) return db - da;
    // Stable-ish : titre en filet
    const ta = a.querySelector?.('.article-title')?.textContent || '';
    const tb = b.querySelector?.('.article-title')?.textContent || '';
    return ta.localeCompare(tb, 'fr');
  });
  cards.forEach((c) => body.appendChild(c));
}

/**
 * Remet un article En bref dans la suite du fil + réserve.
 */
function demoteBriefCardToTail(brief, cardEl) {
  if (!cardEl || !brief) return false;
  const item = resolveItemFromCard(cardEl);
  if (!item) return false;

  cardEl.remove();
  magazineMeta.briefKeys.delete(articleKey(item));
  rebuildBriefMetaFromDom(brief);
  magazineReserve.push(item);
  magazineReserve = sortByDateDesc(magazineReserve);

  let tail = NEWS_LIST.querySelector('.news-tail');
  // La promotion précédente peut avoir vidé « Suite du fil ». Dans ce cas,
  // `removeTailArticleForItem()` détache le conteneur; il ne faut jamais y
  // ajouter ensuite une carte hors DOM, sinon l'article disparaît de la vue
  // source. On recrée/attache le conteneur *après* toute déduplication.
  if (tail) removeTailArticleForItem(item);
  if (!tail || !tail.isConnected) {
    tail = document.createElement('div');
    tail.className = 'news-tail';
    tail.innerHTML = '<h3 class="news-tail-title">Suite du fil</h3>';
    NEWS_LIST.appendChild(tail);
  }
  const el = safeCreateArticle(item, 'standard');
  if (el) {
    const body = ensureNewsTailBody(tail);
    insertTailArticleByDate(body, el, item);
  }
  sortNewsTailBodyByDate(tail);
  syncNewsTailCollapse({ preserveExpanded: true });
  return true;
}

/**
 * Équilibre magazine — uniquement En bref (hero figé snapshot).
 * Ordre strict : TRIM d’abord, puis FILL. Jamais les deux en boucle croisée.
 * Vue source : fill agressif (même institution) pour coller à la une+vedettes.
 */
function balanceMagazineColumns() {
  if (!canBalanceMagazineColumns()) return;
  if (magazineBalanceBusy) {
    magazineBalanceQueued = true;
    return;
  }

  const hero = NEWS_LIST.querySelector('.news-hero');
  const brief = NEWS_LIST.querySelector('.brief-rail');
  if (!hero || !brief) return;

  magazineBalanceBusy = true;
  magazineBalanceQueued = false;
  const isSourceMode = NEWS_LIST.dataset.mode === 'source';
  const mid = !isSourceMode && isMidwidthMagazinePreview();
  const wideE = typeof isWideNoMarqueeMode === 'function' && isWideNoMarqueeMode();
  // Tolérance : un petit spacer est acceptable dans le fil général. En vue
  // d'un seul média hors wide, « En bref » ne doit pas dépasser la une.
  // Wide multi-col : même logique que le fil général (une rangée de plus
  // vaut mieux qu’un vide sous les vedettes).
  const tol = (isSourceMode && !wideE) ? 0 : (mid ? 16 : COLUMN_HEIGHT_TOL);
  const hardMin = isSourceMode ? 2 : (mid ? 1 : BRIEF_SIDEBAR_HARD_MIN);
  // Ne pas « améliorer » un équilibre déjà dans la tolérance produit (~1 carte
  // compacte). Les passes image tardives re-trimaient 6→4 cartes et laissaient
  // un trou de ~110 px alors que l’état antérieur était déjà bon (gap ~40).
  const GOOD_GAP_MAX = mid ? Math.round(AVG_BRIEF_CARD_H * 0.75) : AVG_BRIEF_CARD_H;

  // Toujours resync hero meta avant trim/fill (institutions une/vedettes).
  rebuildHeroMetaFromDom(hero);
  // Filet : pas de 2ᵉ titre de la même source que la une tant qu’une
  // source du reste n’a pas eu sa place.
  purgeBriefCardsFromHeroInstitutions(brief);

  // Multi-col : une carte de trop (nouvelle rangée) vaut mieux qu’un grand vide.
  // Overshoot toléré ≈ hauteur réelle d’une rangée (cartes compactes ~180–230).
  const sampleBriefH = (() => {
    const c = brief.querySelector('.article--compact');
    const h = c?.getBoundingClientRect?.().height;
    return Number.isFinite(h) && h > 40 ? h : AVG_BRIEF_CARD_H + 60;
  })();
  const briefCols = wideE ? briefWideColumnCount() : 1;
  const tightBrief = wideE && briefCols === 1;
  // Multi-col : 20 px, pas ~1 carte. Une rangée de trop (3440/3840)
  // dépassait le hero ; à 3840 il fallait au contraire finir la rangée.
  const wideOvershootTol = tightBrief ? 8 : (wideE ? Math.max(tol, 20) : tol);

  const trimBriefOrphanRow = () => {
    if (briefCols < 2) return;
    const cards = [...brief.querySelectorAll('.article--compact')];
    if (cards.length < hardMin + 1) return;
    if (cards.length % briefCols === 0) return;
    const hH = magazineColumnContentHeight(hero);
    const bH = magazineColumnContentHeight(brief);
    // Rangée incomplète plus haute que le hero → retirer. Sinon on la complète.
    if (bH <= hH + wideOvershootTol) return;
    demoteBriefCardToTail(brief, cards[cards.length - 1]);
  };

  /** Rangée déjà payée en hauteur : remplir les trous (ex. 13/16 à 3840). */
  const completeLastBriefRow = () => {
    if (briefCols < 2) return;
    let guard = 0;
    while (guard < briefCols) {
      guard += 1;
      const cards = brief.querySelectorAll('.article--compact');
      if (cards.length % briefCols === 0) return;
      const hH = magazineColumnContentHeight(hero);
      const bH = magazineColumnContentHeight(brief);
      if (bH > hH + wideOvershootTol) return;
      if (!magazineReserve.length || cards.length >= briefSidebarMaxSlots()) return;
      const item = takeNextBriefFromReserve({
        allowExtra: true,
        allowHeroInstitution: isSourceMode,
      });
      if (!item) return;
      const el = safeCreateArticle(item, 'compact');
      if (!el) return;
      appendBeforeMagazineSpacer(brief, el);
      markPromotedToBrief(item);
      removeTailArticleForItem(item);
    }
  };

  const trimBriefIfTaller = () => {
    let guard = 0;
    while (guard < 28) {
      guard += 1;
      const hH = magazineColumnContentHeight(hero);
      const bH = magazineColumnContentHeight(brief);
      // Wide : tolérer un léger dépassement (évite re-trim qui recrée le vide).
      if (bH <= hH + (wideE ? wideOvershootTol : tol)) break;
      // Vue source : si retirer une carte laisserait un trou > GOOD_GAP_MAX
      // alors que le dépassement actuel est plus petit, s’arrêter (granularité
      // d’une fiche). Impossible de satisfaire brief≤hero et gap≤96 autrement
      // quand la prochaine carte fait ~200 px.
      if (isSourceMode) {
        const cards = brief.querySelectorAll('.article--compact');
        const last = cards[cards.length - 1];
        if (last && cards.length > hardMin) {
          const lastH = last.getBoundingClientRect().height || AVG_BRIEF_CARD_H;
          const overshoot = bH - hH;
          const gapIfRemoved = hH - (bH - lastH);
          if (overshoot > 0 && overshoot <= GOOD_GAP_MAX && gapIfRemoved > GOOD_GAP_MAX) {
            break;
          }
        }
      }
      const cards = brief.querySelectorAll('.article--compact');
      if (cards.length <= hardMin) break;
      if (!demoteBriefCardToTail(brief, cards[cards.length - 1])) break;
    }
  };

  /** Fill En bref jusqu’à coller le bas du hero (multi-col wide inclus). */
  const fillBriefToHero = (maxSteps, overshootMax) => {
    let fillGuard = 0;
    while (fillGuard < maxSteps) {
      fillGuard += 1;
      const hH = magazineColumnContentHeight(hero);
      const bH = magazineColumnContentHeight(brief);
      const gap = hH - bH;
      if (gap <= tol) break;

      const briefCount = brief.querySelectorAll('.article--compact').length;
      const briefCap = briefSidebarMaxSlots();
      if (briefCount >= briefCap || !magazineReserve.length) break;

      const reserveOptions = {
        allowExtra: isSourceMode || wideE,
        allowHeroInstitution: isSourceMode,
      };
      let item = takeNextBriefFromReserve(reserveOptions);
      if (!item) item = takeNextBriefFromReserve({ ...reserveOptions, allowExtra: true });
      if (!item) break;

      const el = safeCreateArticle(item, 'compact');
      if (!el) break;
      appendBeforeMagazineSpacer(brief, el);

      const afterBrief = magazineColumnContentHeight(brief);
      const afterHero = magazineColumnContentHeight(hero);
      const overshoot = afterBrief - afterHero;

      if (overshoot > overshootMax) {
        // Nouvelle rangée plus haute que le hero : seulement si le vide
        // restant était plus grand que le dépassement (net gain).
        if (gap > overshoot) {
          markPromotedToBrief(item);
          removeTailArticleForItem(item);
        } else {
          demoteBriefCardToTail(brief, el);
        }
        break;
      }
      markPromotedToBrief(item);
      removeTailArticleForItem(item);
    }
  };

  try {
    clearMagazineSpacers(hero);
    clearMagazineSpacers(brief);

    // Déjà bien collé : ne pas re-fill/re-trim destructif (passes image).
    // Wide : n’accepter « déjà bon » que si le trou est vraiment petit.
    {
      const hH = magazineColumnContentHeight(hero);
      const bH = magazineColumnContentHeight(brief);
      const goodMax = tightBrief ? 24 : (wideE ? Math.min(GOOD_GAP_MAX, 56) : GOOD_GAP_MAX);
      if (bH <= hH + tol && (hH - bH) <= goodMax && brief.querySelectorAll('.article--compact').length >= hardMin) {
        ensureMagazineColumnSpacers(hero, brief);
        return;
      }
    }

    // --- 1) TRIM : En bref trop haute → retirer la dernière carte ---
    trimBriefIfTaller();

    // --- 2) FILL : En bref trop basse → ajouter (sans trop dépasser) ---
    const maxFill = isSourceMode ? 40 : (wideE ? 48 : 24);
    fillBriefToHero(maxFill, wideE ? wideOvershootTol : tol);

    // --- 3) TRIM final (images / fill ont pu dépasser d’une carte) ---
    trimBriefIfTaller();
    if (purgeBriefCardsFromHeroInstitutions(brief)) trimBriefIfTaller();
    trimBriefOrphanRow();
    completeLastBriefRow();

    // --- 4) Midwidth : priorité = zéro grand vide sous les vedettes.
    // (Le spacer flex sous le hero est très visible en rail étroit.)
    if (mid) {
      const equalizeMid = () => {
        // Trim d’abord : En bref ne doit pas dépasser le hero (+tol).
        let guard = 0;
        while (guard < 16) {
          guard += 1;
          const hH = magazineColumnContentHeight(hero);
          const bH = magazineColumnContentHeight(brief);
          if (bH <= hH + tol) break;
          const cards = brief.querySelectorAll('.article--compact');
          if (cards.length <= hardMin) break;
          if (!demoteBriefCardToTail(brief, cards[cards.length - 1])) break;
        }
        // Fill prudent : trou sous En bref > ½ carte. Overshoot sous vedettes
        // plafonné à COLUMN_HEIGHT_TOL (petit spacer OK, pas de grand vide).
        const fillOvershootMax = COLUMN_HEIGHT_TOL;
        guard = 0;
        while (guard < 8) {
          guard += 1;
          const hH = magazineColumnContentHeight(hero);
          const bH = magazineColumnContentHeight(brief);
          const voidUnderBrief = hH - bH;
          if (voidUnderBrief <= GOOD_GAP_MAX) break;
          if (!magazineReserve.length) break;
          if (brief.querySelectorAll('.article--compact').length >= briefSidebarMaxSlots()) break;
          // Fil général : sources d’abord, 2ᵉ titre ensuite (fraîcheur).
          const item = takeNextBriefFromReserve({
            allowExtra: true,
            allowHeroInstitution: false,
          });
          if (!item) break;
          const el = safeCreateArticle(item, 'compact');
          if (!el) break;
          appendBeforeMagazineSpacer(brief, el);
          const overshoot = magazineColumnContentHeight(brief) - magazineColumnContentHeight(hero);
          if (overshoot > fillOvershootMax) {
            demoteBriefCardToTail(brief, el);
            break;
          }
          markPromotedToBrief(item);
          removeTailArticleForItem(item);
        }
        purgeBriefCardsFromHeroInstitutions(brief);
      };
      equalizeMid();
      ensureMagazineColumnSpacers(hero, brief);
      // Spacer mesuré : si encore un trou sous le hero, re-trim + reposer.
      const hSp = hero.querySelector('.news-hero-spacer')?.offsetHeight || 0;
      if (hSp > tol) {
        clearMagazineSpacers(hero);
        clearMagazineSpacers(brief);
        equalizeMid();
        ensureMagazineColumnSpacers(hero, brief);
      }
    } else {
      // Wide E : 2e passe sur le *contenu* (pas le spacer flex) — multi-col
      // laissait souvent 100–200 px de vide sous la dernière rangée.
      if (wideE) {
        clearMagazineSpacers(hero);
        clearMagazineSpacers(brief);
        const gap2 = magazineColumnContentHeight(hero) - magazineColumnContentHeight(brief);
        if (tightBrief) {
          trimBriefIfTaller();
        } else if (gap2 > Math.max(32, Math.round(sampleBriefH * 0.55)) && magazineReserve.length) {
          fillBriefToHero(36, wideOvershootTol);
          trimBriefIfTaller();
        }
        trimBriefOrphanRow();
        completeLastBriefRow();
      }
      ensureMagazineColumnSpacers(hero, brief);
      if (wideE && tightBrief) {
        const hSp = hero.querySelector('.news-hero-spacer')?.offsetHeight || 0;
        if (hSp > 24) {
          clearMagazineSpacers(hero);
          clearMagazineSpacers(brief);
          trimBriefIfTaller();
          ensureMagazineColumnSpacers(hero, brief);
        }
      }
    }
  } finally {
    window.setTimeout(() => {
      magazineBalanceBusy = false;
      if (magazineBalanceQueued) {
        magazineBalanceQueued = false;
        balanceMagazineColumns();
      }
    }, 120);
  }

  const briefCount = brief.querySelectorAll('.article--compact').length;
  if (briefCount) NEWS_LIST.dataset.briefCount = String(briefCount);
  else NEWS_LIST.removeAttribute('data-brief-count');
  // Filet : après trim/fill, la suite doit rester en date décroissante.
  const tail = NEWS_LIST.querySelector('.news-tail');
  if (tail) sortNewsTailBodyByDate(tail);
  syncNewsTailCollapse({ preserveExpanded: true });
  updateNewsLayout();
  bindMagazineImageBalanceOnce();
}

/** Compteur de passes post-rendu (évite rebalance infini). */
let magazineBalancePasses = 0;
const MAGAZINE_BALANCE_PASS_CAP = 4;

function scheduleMagazineColumnBalance() {
  clearTimeout(magazineBalanceTimer);
  magazineBalancePasses = 0;
  const mid = isMidwidthMagazinePreview();
  magazineBalanceTimer = window.setTimeout(() => {
    magazineBalancePasses = 1;
    balanceMagazineColumns();
    // Passes retardées : layout puis images (vue source = colonnes à coller).
    window.setTimeout(() => {
      magazineBalancePasses = Math.max(magazineBalancePasses, 2);
      balanceMagazineColumns();
    }, 450);
    window.setTimeout(() => {
      magazineBalancePasses = Math.max(magazineBalancePasses, 3);
      balanceMagazineColumns();
    }, 1100);
    // 4e passe tardive : images une/vedettes souvent lentes en vue source.
    window.setTimeout(() => {
      magazineBalancePasses = Math.max(magazineBalancePasses, 4);
      balanceMagazineColumns();
    }, 2200);
    // Midwidth : passes tardives (images + wrap titres En bref en rail étroit).
    if (mid) {
      window.setTimeout(() => {
        magazineBalancePasses = Math.max(magazineBalancePasses, 5);
        balanceMagazineColumns();
      }, 3600);
      window.setTimeout(() => {
        magazineBalancePasses = Math.max(magazineBalancePasses, 6);
        balanceMagazineColumns();
      }, 5200);
    }
  }, 80);
}

function bindMagazineImageBalanceOnce() {
  if (!NEWS_LIST) return;
  NEWS_LIST.querySelectorAll('.news-hero img, .brief-rail img').forEach((img) => {
    if (img.dataset.magazineBalanceBound) return;
    img.dataset.magazineBalanceBound = '1';
    if (img.complete) return;
    const once = () => {
      img.removeEventListener('load', once);
      img.removeEventListener('error', once);
      // Une image distante peut finir bien après les quatre passes initiales
      // (connexion lente, onglet revenu à l'avant-plan). Même si ce plafond
      // est atteint, sa hauteur définitive doit rééquilibrer les colonnes.
      // L'écouteur est à usage unique par image, donc cela ne crée pas de
      // boucle de rebalance.
      clearTimeout(magazineBalanceTimer);
      magazineBalanceTimer = window.setTimeout(() => {
        balanceMagazineColumns();
      }, 180);
    };
    img.addEventListener('load', once);
    img.addEventListener('error', once);
  });
}

/**
 * Pool d'un seul média : le filtre source est explicitement une vue « tous les
 * articles ». Il ne doit donc jamais réappliquer la fenêtre de fraîcheur du
 * fil général, sinon une fiche SEO peut promettre un article que son bouton de
 * retour rend introuvable. Le tri reste chronologique et les futurs articles
 * sont toujours exclus.
 */
function sortSourcePool(items) {
  return sortByDateDesc(items);
}

function collectSourcePool(items, referenceDate = new Date()) {
  const pool = sortSourcePool(items.filter((item) => isPublishedOnOrBefore(item, referenceDate)));
  return { items: pool, contingencyBand: 0 };
}

function leadBriefCharCount(item) {
  const lead = sanitizeBriefBody(String(item.leadExcerpt || ''));
  if (lead.length >= LEAD_BRIEF_MIN_CHARS) return lead.length;
  const excerpt = sanitizeBriefBody(String(item.excerpt || ''));
  if (excerpt.length >= LEAD_BRIEF_MIN_CHARS) return excerpt.length;
  const { body } = splitByline(item);
  return Math.max(lead.length, excerpt.length, sanitizeBriefBody(body).length);
}

function hasSubstantialLeadBrief(item) {
  return leadBriefCharCount(item) >= LEAD_BRIEF_MIN_CHARS;
}

function pickSourceLead(pool) {
  return pool[0] || null;
}

/**
 * Vue d'un seul média (filtre source).
 *
 * Ordre de fraîcheur strict dans chaque section (pool déjà date desc) :
 *  - Une + vedettes = tranche contiguë des plus frais (1 une + ≤2 vedettes)
 *  - En bref = suite chronologique (graine ≈ hauteur hero)
 *  - Suite du fil = le reste
 * Pas de 4 vedettes comme le fil global (évite le « double look » vs En bref
 * sur mobile) ; 1–2 features suffisent sous la une d’un seul média.
 */
function partitionSourceFeed(items, referenceDate = new Date()) {
  const sorted = sortByDateDesc(items);
  const { items: pool, contingencyBand } = collectSourcePool(sorted, referenceDate);
  // Tranche contiguë des plus frais → une = pool[0], vedettes = pool[1..n]
  const heroN = Math.min(SOURCE_HERO_SPOTLIGHT_MAX, pool.length);
  const heroItems = pool.slice(0, heroN);
  const heroKeys = new Set(heroItems.map(articleKey));
  const rest = pool.filter((item) => !heroKeys.has(articleKey(item)));
  // Graine En bref calée sur la hauteur hero (une+vedettes), un peu plus
  // généreuse en vue source pour coller dès le snapshot.
  const briefSeed = briefSeedCountForHero(Math.max(1, heroItems.length), {
    sourceMode: true,
  });
  const briefItems = rest.slice(0, briefSeed);
  const briefKeys = new Set(briefItems.map(articleKey));
  const tailItems = rest.filter((item) => !briefKeys.has(articleKey(item)));
  // Réserve + meta pour le fill/trim En bref (balanceMagazineColumns).
  magazineReserve = tailItems.slice();
  resetMagazineMeta(heroItems, briefItems);
  const lead = heroItems[0] || null;
  const leadHasImage = !!(lead && hasDisplayImage(lead));
  return { heroItems, briefItems, tailItems, contingencyBand, leadHasImage };
}

function safeCreateArticle(item, role = 'standard') {
  try {
    return createArticle(item, role);
  } catch (err) {
    console.error('Le Radar: échec rendu article', item?.source, item?.title, err);
    return null;
  }
}

function createArticle(item, role = 'standard') {
  const link = safeHttpUrl(item.link);
  const a = document.createElement(link ? 'a' : 'div');
  a.className = `article article--${role}`;
  // Référence pour promote/demote magazine (fill / trim En bref)
  a.__radarItem = item;
  if (link) {
    a.href = link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }

  const color = safeCssColor(sourceAccentColor(item)) || 'var(--accent)';
  a.style.setProperty('--c', color);

  const d = item.date ? new Date(item.date) : null;
  const time = d
    ? formatStampCompact(d, item.lang === 'en' ? 'en' : 'fr')
    : '';
  /* Le rouge « frais » couvre toute la journée civile québécoise, et non les
     120 dernières minutes : le fil des journaux étudiants publie par à-coups,
     souvent quelques articles par jour. Une fenêtre de 2 h laissait donc la
     quasi-totalité des parutions du jour en gris, ce que la fenêtre était
     justement censée signaler. */
  const fresh = d ? torontoDayKey(d) === torontoDayKey() : false;
  const { author: rawAuthor, body } = splitByline(item);
  const displayAuthor = resolveDisplayAuthor(item, rawAuthor);
  /* Vedettes : même règles de contenu que la une (leadExcerpt, longueur, minimum). */
  const isLeadLikeBrief = role === 'lead' || role === 'feature';
  const leadBody = isLeadLikeBrief
    ? (item.leadExcerpt || body || item.excerpt || '')
    : body;
  let { text: brief, truncated: briefTruncated } = resolveBrief(item, leadBody, role);
  if (isLeadLikeBrief && !brief) {
    ({ text: brief, truncated: briefTruncated } = resolveBrief(item, item.excerpt || body, role));
  }
  if (isLeadLikeBrief && brief) {
    ({ text: brief, truncated: briefTruncated } = ensureLeadBriefMinLines(
      brief,
      briefTruncated,
      item,
      role === 'feature' ? 'feature' : 'lead',
    ));
    const fullSource = sanitizeBriefBody(leadBody);
    if (fullSource.length > brief.length + 12 || (brief.length >= 100 && item.link)) {
      briefTruncated = true;
    }
  }
  if (role === 'compact' && brief) {
    ({ text: brief, truncated: briefTruncated } = ensureCompactBriefMinLines(brief, briefTruncated, item));
  }
  if (rawAuthor && brief) {
    brief = stripLeadingByline(brief, rawAuthor);
  }
  if (item.link) {
    briefTruncated = true;
  }
  const readMore = item.lang === 'en' ? 'Read more →' : 'Lire la suite →';
  const byLabel = item.lang === 'en' ? 'By' : 'Par';
  /* Vignette à droite pour les vedettes et En bref : photo réelle ou banque
     d'images seulement (le repli SVG serait illisible en petit format). */
  const isThumbRole = ['feature', 'compact'].includes(role);
  const canUseImage = role === 'lead' || isThumbRole;
  /* Vignettes : seuils assouplis (forThumb) — beaucoup d’URL WP ~300–500 px
     étaient rejetées alors qu’elles passent bien en object-fit. */
  const hasImageCandidate = role === 'lead'
    || (isThumbRole && (hasUsablePhoto(item, role) || hasStockPhoto(item, role)));
  if (!hasImageCandidate && canUseImage) a.classList.add('article--text');
  if (isThumbRole && hasImageCandidate) a.classList.add('article--thumb');
  const timeHtml = time
    ? `<time class="article-time${fresh ? ' is-fresh' : ''}" datetime="${escapeHtml(item.date)}">${time}</time>`
    : '';
  const instHtml = item.institution
    ? articleInstitutionMetaHtml(item.institution, item.type, role)
    : '';
  const metaLead = (item.source || item.institution)
    ? `<span class="article-meta__lead">
        ${item.source ? `<span class="article-source notranslate" translate="no">${escapeHtml(item.source)}</span>` : ''}
        ${instHtml}
      </span>`
    : '';
  const metaHtml = (metaLead || timeHtml)
    ? `<div class="article-meta">${metaLead}${timeHtml}</div>`
    : '';
  // Espace insécable + classe : évite « meLire la suite » (margin seule insuffisante
  // quand le chapô est en inline à côté d’une vignette flottante).
  const briefHtml = item.link || brief
    ? `<p class="article-brief${briefTruncated ? ' is-truncated' : ''}"><span class="article-brief-text">${escapeHtml(brief || '')}</span>${briefTruncated ? `<span class="article-more" style="color: ${color}">\u00a0${escapeHtml(readMore)}</span>` : ''}</p>`
    : '';
  // « Par »/« By » se traduit (UI) ; le nom d’auteur reste en original (notranslate).
  // Espace garanti en CSS (.article-author) : la trad du libellé mange l’espace final.
  const bylineHtml = `<p class="article-byline"><span class="article-byline__label">${escapeHtml(byLabel)}</span><strong class="article-author notranslate" translate="no">${escapeHtml(displayAuthor)}</strong></p>`;
  const titleHtml = `<h3 class="article-title">${escapeHtml(cleanTitle(item.title))}</h3>`;
  const mediaHtml = hasImageCandidate ? '<figure class="article-media"></figure>' : '';
  if (role === 'lead') {
    // À la une : l'auteur suit directement le titre, avant la photo.
    a.innerHTML = `
      <span class="article-eyebrow">À la une</span>
      ${metaHtml}
      ${titleHtml}
      ${bylineHtml}
      ${mediaHtml}
      ${briefHtml}
    `;
  } else if (role === 'feature' || (role === 'compact' && hasImageCandidate)) {
    // Vedettes + En bref avec photo : titre + byline puis media (float wrap).
    a.innerHTML = `
      ${metaHtml}
      ${titleHtml}
      ${bylineHtml}
      ${mediaHtml}
      ${briefHtml}
    `;
  } else {
    // Suite du fil / En bref sans photo : media d’abord si présent.
    a.innerHTML = `
      ${metaHtml}
      ${mediaHtml}
      ${titleHtml}
      ${bylineHtml}
      ${briefHtml}
    `;
  }

  if (hasImageCandidate) {
    /* Vignettes (vedettes + En bref) aussi sur mobile, avec crédit photo —
       le CSS adapte la largeur pour éviter l'écrasement du texte. */
    attachArticleImage(a, item, role);
  }

  // Filet : garantir titre avant photo même si un attach restructure le DOM.
  if (role === 'lead' || role === 'feature' || role === 'compact') {
    ensureLeadTitleAboveMedia(a);
  }

  return a;
}

/** Place .article-title juste avant .article-media (une uniquement). */
function ensureLeadTitleAboveMedia(article) {
  if (!article) return;
  const title = article.querySelector(':scope > .article-title');
  const media = article.querySelector(':scope > .article-media');
  if (!title || !media) return;
  // Si le media précède le titre dans le DOM, on remonte le titre.
  if (
    title.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_PRECEDING
  ) {
    media.parentNode.insertBefore(title, media);
  }
}

/** Aligné sur scripts/article-image-lib.js isWeakImageUrl :
 *  ne rejette que les petites vignettes WP (-150x150), pas -930x620. */
const WEAK_IMAGE_PATH = /article-tile|size-article-tile/;

/** Aligné sur scripts/article-image-lib.js GLOBAL_IMAGE_REJECT_RE */
const GLOBAL_IMAGE_REJECT_RE = /(?:logo|avatar|icon|placeholder|default|blank|spacer|profile|author|favicon|gravatar|emoji|smiley|lapige_web|(?:^|\/)article-2\.|campus-logo|campusgraphic|article-tile|size-article-tile|thumbnail|thumb_|recent-posts|wp-block-query|widget|sponsor|banner|social-share|-150x\d+\.|cropped-logo|logoexile|121330814_121456603062023_8783413434532337259_n|(?:^|\/)daily\.png$|editorial[_-]|(?:^|\/)editorial(?:s)?(?:[_./-]|$)|画板|%e7%94%bb%e6%9d%bf|_optimized_optimized_optimized|00\.graphics\.csu\.naya_hachwa)/i;

function isFallbackImageUrl(raw = '') {
  const src = String(raw).trim();
  if (!src) return false;
  if (src.startsWith('data:image/svg')) return true;
  return src.startsWith('./assets/lead-fallbacks/') && src.endsWith('.svg');
}

function resizeFromImageQuery(raw = '') {
  try {
    const u = new URL(raw);
    const resize = u.searchParams.get('resize');
    if (resize) {
      const parts = resize.split(/[,%]/).map((n) => parseInt(n, 10));
      return { width: parts[0] || 0, height: parts[1] || 0 };
    }
    const w = parseInt(u.searchParams.get('w'), 10) || 0;
    const h = parseInt(u.searchParams.get('h'), 10) || 0;
    if (w || h) return { width: w, height: h };
    // Transformations dans le chemin (substackcdn/Cloudinary : « ,w_256,c_limit,… »)
    const pw = u.pathname.match(/[,/]w_(\d+)\b/);
    const ph = u.pathname.match(/[,/]h_(\d+)\b/);
    if (pw || ph) {
      return { width: pw ? parseInt(pw[1], 10) : 0, height: ph ? parseInt(ph[1], 10) : 0 };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function isWeakImagePath(path = '', { forThumb = false } = {}) {
  const p = String(path).toLowerCase();
  // Suffixe WP « -{w}x{h}. » : rejeter les vraies miniatures, garder les
  // formats vedette (ex. Campus2-930x620.jpg sur Le Délit).
  // Vignettes feature / En bref : seuils bas (object-fit ~100–180 px).
  const sized = p.match(/-(\d{2,4})x(\d{2,4})(?=\.[a-z]+$)/);
  if (sized) {
    const w = parseInt(sized[1], 10);
    const h = parseInt(sized[2], 10);
    if (w > 0 && h > 0) {
      if (forThumb) {
        if (Math.max(w, h) < 80 || w * h < 8000) return true;
      } else {
        if (Math.max(w, h) < 400) return true;
        if (w < 640 || h < 360 || w * h < 200000) return true;
      }
    }
  }
  return WEAK_IMAGE_PATH.test(p);
}

/**
 * Hôtes dont les médias sont souvent injoignables (site journal down).
 * On bascule vers la capture Wayback (modificateur id_ = binaire original).
 * L'Exemplaire (ULaval) : 2026-07-30 — connexion refusée sur :80/:443.
 */
const IMAGE_ARCHIVE_FALLBACK_HOSTS = new Set([
  'exemplaire.com.ulaval.ca',
  'www.exemplaire.com.ulaval.ca',
]);

/** Réécrit une URL image vers Internet Archive si l’hôte est en repli. */
function withArchiveImageFallback(href = '') {
  const raw = String(href || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw, typeof location !== 'undefined' ? location.href : 'https://le-radar.ca/');
    if (u.hostname.toLowerCase().includes('web.archive.org')) return u.href;
    if (!IMAGE_ARCHIVE_FALLBACK_HOSTS.has(u.hostname.toLowerCase())) return u.href;
    // 2id_ → dernière capture utile, contenu original (pas la barre Wayback).
    return `https://web.archive.org/web/2id_/${u.href}`;
  } catch {
    return raw;
  }
}

/**
 * @param {string} src
 * @param {{ forThumb?: boolean }} [opts] — seuils assouplis pour feature / En bref
 */
function getCandidateImage(src = '', { forThumb = false } = {}) {
  const raw = String(src).trim();
  if (!raw) return '';

  if (isFallbackImageUrl(raw)) {
    try {
      return new URL(raw, location.href).href;
    } catch {
      return '';
    }
  }

  let url;
  try {
    url = new URL(raw, location.href);
  } catch {
    return '';
  }

  if (!['http:', 'https:'].includes(url.protocol)) return '';
  const path = decodeURIComponent(url.pathname).toLowerCase();
  if (GLOBAL_IMAGE_REJECT_RE.test(path)) return '';
  if (/(?:^|\/)(?:1x1|pixel)\b/.test(path)) return '';
  const minW = forThumb ? 120 : 640;
  const minH = forThumb ? 100 : 360;
  const minPx = forThumb ? 12_000 : 240_000;
  const resize = resizeFromImageQuery(raw);
  if (resize) {
    const { width = 0, height = 0 } = resize;
    if ((width > 0 && width < minW) || (height > 0 && height < minH)) return '';
    if (width > 0 && height > 0 && width * height < minPx) return '';
  }
  if (isWeakImagePath(path, { forThumb })) return '';
  return withArchiveImageFallback(url.href);
}

/**
 * Redimensionne les énormes originaux Wikimedia (8K…) pour l'affichage —
 * surtout les vignettes En bref, qui chargeaient l'original et tombaient
 * dans le timeout 2,5 s → plus de photo.
 */
function displaySizedImageUrl(raw = '', role = 'lead') {
  const src = getCandidateImage(raw) || String(raw || '').trim();
  if (!src || isFallbackImageUrl(src)) return src;
  try {
    const u = new URL(src, location.href);
    const host = u.hostname.toLowerCase();
    const isThumb = role === 'feature' || role === 'compact';
    const maxW = role === 'lead' ? 1400 : (isThumb ? 480 : 960);

    // Déjà un dérivé dimensionné (thumb Wikimedia ou ?width=).
    if (/\/commons\/thumb\//i.test(u.pathname) || u.searchParams.has('width')) {
      return src;
    }

    if (host === 'upload.wikimedia.org' || host.endsWith('.wikimedia.org')) {
      const fileMatch = u.pathname.match(/\/([^/]+\.(?:jpe?g|png|webp|gif))$/i);
      if (fileMatch) {
        const file = decodeURIComponent(fileMatch[1]);
        // Special:FilePath redirige vers un JPEG redimensionné (fiable avec accents).
        return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${maxW}`;
      }
    }
  } catch {
    /* keep original */
  }
  return src;
}

/** Photo mirroirée sur GitHub Pages (assets/news-images/…). */
function hasLocalPhoto(item) {
  const p = String(item?.imageLocal || '').trim();
  return /^assets\/news-images\/[a-z0-9]+\.(?:jpe?g|png|webp|gif)$/i.test(p);
}

function resolveLocalPhotoUrl(item) {
  if (!hasLocalPhoto(item)) return '';
  try {
    return new URL(String(item.imageLocal).trim(), location.href).href;
  } catch {
    return '';
  }
}

function hasUsablePhoto(item, role = 'lead') {
  if (hasLocalPhoto(item)) return true;
  const forThumb = role === 'feature' || role === 'compact';
  return !!getCandidateImage(item?.image, { forThumb });
}

function hasStockPhoto(item, role = 'lead') {
  const forThumb = role === 'feature' || role === 'compact';
  return !!getCandidateImage(item?.stockImage, { forThumb });
}

function hasDisplayImage(item, role = 'lead') {
  return hasUsablePhoto(item, role) || hasStockPhoto(item, role) || isFallbackImageUrl(item?.fallbackImage);
}

function darkenHex(hex, amount = 0.32) {
  const h = String(hex || '#003DA5').replace('#', '');
  if (h.length !== 6) return '#003DA5';
  const r = Math.max(0, Math.round(parseInt(h.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(h.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(h.slice(4, 6), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function wrapTitleLines(text = '', max = 36, lines = 4) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const out = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > max && line) {
      out.push(line);
      line = w;
    } else {
      line = next;
    }
    if (out.length >= lines) break;
  }
  if (line && out.length < lines) out.push(line);
  return out.slice(0, lines);
}

function buildClientFallbackDataUrl(item) {
  const color = safeCssColor(
    institutionBrandColor(item.institution || '') || sourceColors[item.source],
  ) || '#003DA5';
  const dark = darkenHex(color);
  const title = cleanTitle(item.title || 'Article');
  const source = item.source || 'Le Radar';
  const inst = item.institution ? formatInstitutionDisplay(item.institution) : '';
  const lines = wrapTitleLines(title, 36, 4);
  const tspans = lines.map((ln, i) =>
    `<tspan x="64" dy="${i === 0 ? 0 : 36}">${escapeHtml(ln)}</tspan>`,
  ).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800" role="img" aria-label="${escapeHtml(title)}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="${dark}"/></linearGradient></defs>
  <rect width="1280" height="800" fill="url(#bg)"/>
  <text x="64" y="72" fill="rgba(255,255,255,0.92)" font-family="system-ui,sans-serif" font-size="28" font-weight="700">${escapeHtml(source.toUpperCase())}</text>
  ${inst ? `<text x="64" y="108" fill="rgba(255,255,255,0.72)" font-family="system-ui,sans-serif" font-size="20">${escapeHtml(inst)}</text>` : ''}
  <text x="64" y="${inst ? 220 : 200}" fill="#fff" font-family="Georgia,serif" font-size="44" font-weight="700">${tspans}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function shouldPreferStockPhoto(item, role = 'lead') {
  // Jamais remplacer une vraie photo d'article par la banque campus (pavillon).
  if (item.imageProvider === 'campus-bank' && hasUsablePhoto(item, role)) return false;
  // Source absente / rejetée (logo Daily.png, logo Exil, bannière editorial_…) → stock.
  // Le rejet path (GLOBAL_IMAGE_REJECT_RE) fait basculer hasUsablePhoto à false.
  if (hasStockPhoto(item, role) && !hasUsablePhoto(item, role)) return true;
  // Une image source réelle garde priorité, même si le bot l'a jugée un peu
  // sous le seuil de grande vedette. Le navigateur accepte cette photo pour la
  // une dès 200 × 150; cela évite qu'un ancien lien Openverse la remplace par
  // une image cassée ou hors sujet.
  return false;
}

function resolveDisplayImage(item, { preferPhoto = true, role = 'lead' } = {}) {
  const forThumb = role === 'feature' || role === 'compact';
  if (shouldPreferStockPhoto(item, role)) preferPhoto = false;

  // 1) Miroir local (GitHub Pages) — résilient si l’origine journal est down.
  if (preferPhoto && hasLocalPhoto(item)) {
    return { src: resolveLocalPhotoUrl(item), kind: 'photo' };
  }
  // 2) Photo source distante (évent. réécrite Wayback pour hôtes fragiles).
  if (preferPhoto && getCandidateImage(item?.image, { forThumb })) {
    return { src: getCandidateImage(item.image, { forThumb }), kind: 'photo' };
  }
  // 3) Banque libre thématique ; campus bank seulement sans photo source.
  if (hasStockPhoto(item, role)) {
    if (item.imageProvider === 'campus-bank' && hasUsablePhoto(item, role)) {
      const local = resolveLocalPhotoUrl(item);
      if (local) return { src: local, kind: 'photo' };
      return { src: getCandidateImage(item.image, { forThumb }), kind: 'photo' };
    }
    return { src: getCandidateImage(item.stockImage, { forThumb }), kind: 'stock' };
  }
  if (isFallbackImageUrl(item?.fallbackImage)) {
    return { src: getCandidateImage(item.fallbackImage), kind: 'fallback' };
  }
  if (!preferPhoto) {
    const local = resolveLocalPhotoUrl(item);
    if (local) return { src: local, kind: 'photo' };
    if (getCandidateImage(item?.image, { forThumb })) {
      return { src: getCandidateImage(item.image, { forThumb }), kind: 'photo' };
    }
  }
  return { src: '', kind: 'none' };
}

/** Return the other usable source after an image request failed.
 * A stale Openverse URL must never cause us to retry itself and then discard
 * an otherwise valid image supplied by the publication. */
function alternateDisplayImage(item, failedKind, role = 'lead') {
  const forThumb = role === 'feature' || role === 'compact';
  // Miroir local cassé → origin / Wayback.
  if (failedKind === 'photo' && getCandidateImage(item?.image, { forThumb })) {
    return { src: getCandidateImage(item.image, { forThumb }), kind: 'photo' };
  }
  if (failedKind === 'stock' && hasLocalPhoto(item)) {
    return { src: resolveLocalPhotoUrl(item), kind: 'photo' };
  }
  if (failedKind === 'stock' && getCandidateImage(item?.image, { forThumb })) {
    return { src: getCandidateImage(item.image, { forThumb }), kind: 'photo' };
  }
  if (failedKind === 'photo' && hasStockPhoto(item, role)) {
    return { src: getCandidateImage(item.stockImage, { forThumb }), kind: 'stock' };
  }
  return { src: '', kind: 'none' };
}

/**
 * La une reste l'article le plus récent. Ne jamais l'échanger contre un plus
 * ancien pour une photo ou un extrait — attachArticleImage génère un repli SVG
 * côté client si besoin. On s'assure seulement que les features ne dupliquent pas la une.
 */
function ensureHeroLeadHasImage(heroItems, allItems) {
  if (!heroItems.length) return heroItems;
  const lead = heroItems[0];
  const leadKey = articleKey(lead);
  const features = heroItems.slice(1).filter((item) => articleKey(item) !== leadKey);
  return [lead, ...features];
}

function cleanCreatorDisplay(raw = '') {
  let s = String(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const attrIdx = s.search(/\s*(?:["'])\s*(?:width|height|srcset|class|style)\s*=/i);
  if (attrIdx > 0) s = s.slice(0, attrIdx);
  const bareAttr = s.search(/\s+(?:width|height|srcset)\s*=\s*["']/i);
  if (bareAttr > 0) s = s.slice(0, bareAttr);
  s = s.replace(/\\+"/g, '"').replace(/\)\s*["']\s*$/g, ')').replace(/["']\s*$/g, '').trim();
  s = s.replace(/\.mw-parser-output[\s\S]*/i, '').trim();
  // Champ dédoublé à la source (« Unknown authorUnknown author ») :
  // ne garder qu'une occurrence.
  s = s.replace(/^(.{3,}?)\s*\1$/u, '$1').trim();
  if (s.length > 72) {
    const cut = s.slice(0, 72);
    const lastSpace = cut.lastIndexOf(' ');
    s = `${(lastSpace > 36 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
  }
  return s;
}

function parseImageCreditLine(credit = '') {
  const m = String(credit).match(/^Photo\s*:\s*(.+?)\s*\/\s*(.+?)\s*·\s*(.+)$/i);
  if (!m) return null;
  return {
    creator: cleanCreatorDisplay(m[1].trim()),
    license: m[2].trim(),
    via: m[3].trim(),
  };
}

function creditLink(href, label, className = '') {
  const safe = safeHttpUrl(href, { allowHttp: true });
  if (!safe) {
    const span = document.createElement('span');
    span.textContent = label;
    if (className) span.className = className;
    return span;
  }
  const a = document.createElement('a');
  a.href = safe;
  a.target = '_blank';
  a.rel = 'noopener noreferrer license';
  a.textContent = label;
  if (className) a.className = className;
  a.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.open(safe, '_blank', 'noopener,noreferrer');
  });
  return a;
}

function buildSourcePhotoCreditElement(item = {}) {
  const credit = String(item.sourceImageCredit || '').trim();
  if (!credit) return null;

  const cap = document.createElement('figcaption');
  // Crédit photo entier en original (photographe + libellé) — pas de MT.
  cap.className = 'article-media-credit notranslate';
  cap.setAttribute('translate', 'no');
  const url = String(item.sourceImageCreditUrl || item.link || '').trim();
  const en = item.lang === 'en';
  const fromMedia = item.sourceImageCreditFrom === 'media';

  if (fromMedia) {
    // « Crédit photo : The Plant » — média + crédit restent en langue d’origine.
    const mediaName = String(item.source || '').trim();
    const prefixMatch = credit.match(/^(Photo credit|Crédit photo|Photo)\s*:\s*(.+)$/i);
    const name = (prefixMatch ? prefixMatch[2] : credit).trim() || mediaName || credit;
    const prefix = prefixMatch
      ? `${prefixMatch[1].replace(/:$/, '')}: `
      : (en ? 'Photo credit: ' : 'Crédit photo : ');
    cap.appendChild(document.createTextNode(prefix));
    if (url) {
      const a = creditLink(url, name, 'article-media-credit__creator notranslate');
      a.setAttribute('translate', 'no');
      cap.appendChild(a);
    } else {
      const span = document.createElement('span');
      span.className = 'notranslate';
      span.setAttribute('translate', 'no');
      span.textContent = name;
      cap.appendChild(span);
    }
    return cap;
  }

  const creator = cleanCreatorDisplay(item.sourceImageCreator || '');
  const parsed = parseImageCreditLine(credit);
  if (parsed && creator) {
    cap.appendChild(document.createTextNode(en ? 'Photo: ' : 'Photo : '));
    if (url) {
      const a = creditLink(url, creator, 'article-media-credit__creator notranslate');
      a.setAttribute('translate', 'no');
      cap.appendChild(a);
    } else {
      const span = document.createElement('span');
      span.className = 'article-media-credit__creator notranslate';
      span.setAttribute('translate', 'no');
      span.textContent = creator;
      cap.appendChild(span);
    }
    if (parsed.license) cap.appendChild(document.createTextNode(` / ${parsed.license}`));
    if (parsed.via) {
      cap.appendChild(document.createTextNode(' · '));
      cap.appendChild(document.createTextNode(parsed.via));
    }
    return cap;
  }

  const inline = credit.match(/^Photo\s*:\s*(.+)$/i);
  if (inline) {
    cap.appendChild(document.createTextNode(en ? 'Photo: ' : 'Photo : '));
    const label = cleanCreatorDisplay(inline[1].trim());
    if (url && label) {
      const a = creditLink(url, label, 'article-media-credit__creator notranslate');
      a.setAttribute('translate', 'no');
      cap.appendChild(a);
    } else {
      const span = document.createElement('span');
      span.className = 'article-media-credit__creator notranslate';
      span.setAttribute('translate', 'no');
      span.textContent = label;
      cap.appendChild(span);
    }
    return cap;
  }

  if (url) {
    const a = creditLink(url, credit, 'article-media-credit__creator notranslate');
    a.setAttribute('translate', 'no');
    cap.appendChild(a);
  } else {
    cap.textContent = credit;
  }
  return cap;
}

function buildMediaCreditElement(item = {}) {
  const sourceUrl = String(item.imageSourceUrl || '').trim();
  const credit = String(item.imageCredit || '').trim();
  if (!credit && !sourceUrl) return null;

  const cap = document.createElement('figcaption');
  // Crédit banque libre / Openverse : photographe + licence en original.
  cap.className = 'article-media-credit notranslate';
  cap.setAttribute('translate', 'no');
  const en = item.lang === 'en';
  const parsed = credit ? parseImageCreditLine(credit) : null;
  const creator = cleanCreatorDisplay(item.imageCreator || parsed?.creator || '')
    || (en ? 'Unknown photographer' : 'Photographe inconnu');

  if (!parsed) {
    if (sourceUrl) {
      const a = creditLink(
        sourceUrl,
        credit || (en ? 'Photo source' : 'Source de la photo'),
        'article-media-credit__creator notranslate',
      );
      a.setAttribute('translate', 'no');
      cap.appendChild(a);
    } else {
      cap.textContent = credit;
    }
    return cap;
  }

  cap.appendChild(document.createTextNode(en ? 'Photo: ' : 'Photo : '));
  if (sourceUrl) {
    const a = creditLink(sourceUrl, creator, 'article-media-credit__creator notranslate');
    a.setAttribute('translate', 'no');
    cap.appendChild(a);
  } else {
    const span = document.createElement('span');
    span.className = 'article-media-credit__creator notranslate';
    span.setAttribute('translate', 'no');
    span.textContent = creator;
    cap.appendChild(span);
  }
  if (parsed.license) {
    cap.appendChild(document.createTextNode(` / ${parsed.license}`));
  }
  if (parsed.via) {
    cap.appendChild(document.createTextNode(' · '));
    if (sourceUrl) {
      cap.appendChild(creditLink(sourceUrl, parsed.via, 'article-media-credit__source'));
    } else {
      cap.appendChild(document.createTextNode(parsed.via));
    }
  }
  return cap;
}

function showArticleImage(article, media, img, kind, item) {
  media.replaceChildren(img);
  let cap = null;
  if (kind === 'photo') {
    if (item?.sourceImageCredit) {
      cap = buildSourcePhotoCreditElement(item);
    } else if (item?.source) {
      // Photo source sans crédit scrapé (ex. La Pige en En bref) :
      // afficher au moins « Crédit photo : [média] » en attendant le bot.
      const en = item.lang === 'en';
      const mediaName = String(item.source).trim();
      cap = buildSourcePhotoCreditElement({
        ...item,
        sourceImageCredit: en ? `Photo credit: ${mediaName}` : `Crédit photo : ${mediaName}`,
        sourceImageCreditFrom: 'media',
        sourceImageCreditUrl: item.link || item.sourceImageCreditUrl || '',
      });
    }
  } else if ((kind === 'stock' || kind === 'fallback') && (item?.imageCredit || item?.imageSourceUrl)) {
    cap = buildMediaCreditElement(item);
  }
  if (cap) {
    media.appendChild(cap);
    media.removeAttribute('aria-hidden');
  }
  article.classList.add('has-image');
  article.classList.remove('article--text');
  if (kind === 'stock') article.classList.add('article--stock-image');
  else if (kind !== 'photo') article.classList.add('article--fallback-image');
  updateNewsLayout();
}

function dropArticleImage(article, media, role, item) {
  if (role === 'lead' && item && hasStockPhoto(item)) {
    const alt = resolveDisplayImage(item, { preferPhoto: false, role });
    if (alt.kind === 'stock' && alt.src) {
      const img = new Image();
      img.decoding = 'async';
      img.loading = 'eager';
      img.alt = '';
      img.onload = () => showArticleImage(article, media, img, 'stock', item);
      img.onerror = () => {
        media.remove();
        article.classList.add('article--text');
        updateNewsLayout();
      };
      img.src = displaySizedImageUrl(alt.src, role);
      return;
    }
  }
  media.remove();
  article.classList.add('article--text');
  updateNewsLayout();
}

function attachArticleImage(article, item, role) {
  const media = article.querySelector('.article-media');
  if (!media) return;
  article.__radarItem = item;

  const failToText = () => dropArticleImage(article, media, role, item);
  const allowFallback = role === 'lead';
  const isThumb = role === 'feature' || role === 'compact';

  const loadImage = (src, kind, allowRetry = true, { forceRaw = false } = {}) => {
    if (!src || (kind === 'fallback' && !allowFallback)) {
      failToText();
      return;
    }

    const displaySrc = forceRaw ? src : displaySizedImageUrl(src, role);
    const img = new Image();
    img.decoding = 'async';
    /* Pas de loading="lazy" ici : une Image() hors du DOM en lazy ne se
       charge jamais — le délai trop court la faisait basculer en mode texte. */
    if (role === 'lead') img.fetchPriority = 'high';
    img.alt = '';
    let settled = false;

    const settleShow = () => {
      if (settled) return;
      settled = true;
      showArticleImage(article, media, img, kind, item);
      if (role === 'lead') ensureLeadTitleAboveMedia(article);
    };

    img.onload = () => {
      if (kind === 'photo' && !isUsableArticleImage(img, role)) {
        const w = img.naturalWidth || 0;
        const h = img.naturalHeight || 0;
        // Vedette : on accepte une photo imparfaite plutôt que le vide.
        if (role === 'lead' && w >= 200 && h >= 150) {
          settleShow();
          return;
        }
        // En bref / vedettes : object-fit recadre — garder toute photo réelle.
        if (isThumb && w >= 120 && h >= 100) {
          settleShow();
          return;
        }
        if (allowRetry) {
          const alt = alternateDisplayImage(item, kind, role);
          if (alt.src && alt.kind !== 'photo') {
            settled = true;
            loadImage(alt.src, alt.kind, false);
          } else {
            failToText();
          }
        } else {
          failToText();
        }
        return;
      }
      // Stock / campus / photo OK
      settleShow();
    };

    img.onerror = () => {
      if (settled) return;
      // Si l'URL redimensionnée échoue, retenter l'original une fois.
      if (!forceRaw && displaySrc !== src) {
        settled = true;
        loadImage(src, kind, allowRetry, { forceRaw: true });
        return;
      }
      // Miroir local mort → distante/Wayback ; distante morte → Wayback ; puis stock.
      if (allowRetry && kind === 'photo') {
        if (/assets\/news-images\//i.test(src) && item?.image) {
          const remote = getCandidateImage(item.image, { forThumb: isThumb });
          if (remote && remote !== src) {
            settled = true;
            loadImage(remote, 'photo', true, { forceRaw: true });
            return;
          }
        }
        if (!/web\.archive\.org/i.test(src)) {
          const archived = withArchiveImageFallback(String(item?.image || src || '').trim());
          if (archived && archived !== src) {
            settled = true;
            loadImage(archived, kind, false, { forceRaw: true });
            return;
          }
        }
      }
      if (allowRetry && (kind === 'photo' || kind === 'stock')) {
        const alt = alternateDisplayImage(item, kind, role);
        if (alt.src && alt.src !== src) {
          settled = true;
          loadImage(alt.src, alt.kind, false);
        } else {
          failToText();
        }
      } else {
        failToText();
      }
    };

    img.src = displaySrc;

    // Timeout : tenter une alternative, mais ne PAS jeter une image stock
    // encore en cours de chargement (Wikimedia 8K / réseau lent). Même règle
    // pour une photo source : une réponse lente reste préférable à un stock
    // incertain; seul son vrai onerror déclenche le repli.
    const timeoutMs = isThumb ? 10000 : 6000;
    window.setTimeout(() => {
      if (settled || article.classList.contains('has-image') || !media.isConnected) return;
      if (!allowRetry || kind === 'photo') return;
      const alt = alternateDisplayImage(item, kind, role);
      if (alt.src && alt.src !== src && alt.kind !== kind) {
        settled = true;
        loadImage(alt.src, alt.kind, false);
      }
      // Sinon on laisse onload/onerror finir — mieux qu'un vignette vide.
    }, timeoutMs);
  };

  const primary = resolveDisplayImage(item, { preferPhoto: true, role });
  loadImage(primary.src, primary.kind);
}

const LEAD_IMAGE_MIN = { width: 720, height: 405, pixels: 320000 };
const FEATURE_IMAGE_MIN = { width: 640, height: 360, pixels: 240000 };
/* Vignettes (vedettes + En bref) : affichées en ~100 px, on accepte des photos
   plus petites et des cadrages portrait — object-fit recadre de toute façon. */
const THUMB_IMAGE_MIN = { width: 200, height: 150, pixels: 40000 };

function isUsableArticleImage(img, role) {
  const width = img.naturalWidth || 0;
  const height = img.naturalHeight || 0;
  const ratio = width / Math.max(height, 1);
  const isThumb = role === 'feature' || role === 'compact';
  const min = role === 'lead' ? LEAD_IMAGE_MIN : (isThumb ? THUMB_IMAGE_MIN : FEATURE_IMAGE_MIN);
  // Vignettes : très tolérant (object-fit). Stock/campus passent sans ce filtre.
  const [ratioMin, ratioMax] = isThumb ? [0.4, 4.0] : [0.95, 2.6];
  return (
    width >= min.width
    && height >= min.height
    && width * height >= min.pixels
    && ratio >= ratioMin
    && ratio <= ratioMax
  );
}

const BYLINE_ARTICLE_STARTERS = /^(Le|La|Les|L'|L'|Un|Une|The|An|À|A)$/iu;

function editorialFallback(lang = 'fr') {
  return lang === 'en' ? 'The editorial team' : 'La rédaction';
}

function canonicalizeEditorialAuthor(name = '') {
  const a = String(name).replace(/^(?:Par|By)\s+/i, '').replace(/\s+/g, ' ').trim();
  if (/^(?:la\s+|l')\s*rédaction$/i.test(a) || /^redaction$/i.test(a)) return 'La rédaction';
  if (/^editorial\s+(?:team|staff|board)$/i.test(a) || /^the\s+editorial\s+team$/i.test(a)) {
    return 'The editorial team';
  }
  if (/^staff\s+writers?$/i.test(a)) return 'The editorial team';
  return '';
}

function resolveDisplayAuthor(item, rawAuthor = '') {
  return normalizeAuthor(rawAuthor || item.author || '')
    || editorialFallback(item.lang === 'en' ? 'en' : 'fr');
}

const CONTRIBUTOR_BYLINE_RE = /^([\p{Lu}][\p{L}'’.\-]+(?:\s+[\p{Lu}][\p{L}'’.\-]+){0,3})\s*[–—-]\s*(?:Contributor|Staff Writer)\b/iu;

function isJunkAuthorName(name = '') {
  const a = String(name).replace(/\s+/g, ' ').trim();
  if (!a || a.length < 2 || a.length > 80) return true;
  if (/^[,;:.]/.test(a) || /[,;]{2,}/.test(a)) return true;
  if (/\bfunction\s*\(/.test(a) || /[{}\[\]]/.test(a)) return true;
  if (/https?:\/\//i.test(a) || /\.(?:php|js|css)\b/i.test(a)) return true;
  if (/\b(?:wp-content|wp-admin|wp-block|prefetch|selector_matches|splide)\b/i.test(a)) return true;
  if (/\b(?:Recent Posts|Skip to content|Written by|Read more|Lire la suite)\b/i.test(a)) return true;
  if (a.split(/\s+/).length > 6) return true;
  return false;
}

function extractBylineFromExcerpt(excerpt = '') {
  const ex = String(excerpt).trim();
  if (/^(?:Par|By)\s+(?:(?:La|L')\s*)?[Rr]édaction\b/i.test(ex)) {
    return {
      author: 'La rédaction',
      body: ex.replace(/^(?:Par|By)\s+(?:(?:La|L')\s*)?[Rr]édaction\.?\s*/i, '').trim(),
    };
  }
  if (/^(?:Par|By)\s+Editorial\s+(?:team|staff|board)\b/i.test(ex)) {
    return {
      author: 'The editorial team',
      body: ex.replace(/^(?:Par|By)\s+Editorial\s+(?:team|staff|board)\.?\s*/i, '').trim(),
    };
  }

  const contributor = ex.match(CONTRIBUTOR_BYLINE_RE);
  if (contributor) {
    const author = normalizeAuthor(contributor[1]);
    const body = ex.slice(contributor[0].length).trim();
    if (author && body.length >= 8) return { author, body };
  }

  if (!/^(?:Par|By)\s+/i.test(ex)) return { author: '', body: ex };

  const tokens = ex.replace(/^\s*(?:Par|By)\s+/i, '').split(/\s+/);
  const nameParts = [];
  let i = 0;
  for (; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (nameParts.length >= 1 && BYLINE_ARTICLE_STARTERS.test(token)) break;
    if (nameParts.length >= 2) break;
    if (/^[\p{Lu}][\p{L}'’.\-]+$/u.test(token)) nameParts.push(token);
    else break;
  }

  return {
    author: normalizeAuthor(nameParts.join(' ')),
    body: tokens.slice(i).join(' ').trim(),
  };
}

function extractFirstPersonAuthor(excerpt = '') {
  const plain = String(excerpt).trim();
  const m = plain.match(/^(?:Salut,?\s+)?moi,?\s+c['']est\s+([\p{Lu}][\p{L}'’.\-]+)/iu)
    || plain.match(/^je\s+m['']appelle\s+([\p{Lu}][\p{L}'’.\-]+)/iu);
  return m ? normalizeAuthor(m[1]) : '';
}

function splitByline(item) {
  const ex = String(item.excerpt || '');
  const fromExcerpt = extractBylineFromExcerpt(ex);
  let author = normalizeAuthor(item.author);
  let body = ex;

  if (fromExcerpt.author && (CONTRIBUTOR_BYLINE_RE.test(ex) || /^(?:Par|By)\s+/i.test(ex))) {
    author = fromExcerpt.author;
    body = fromExcerpt.body || body;
    return { author, body };
  }

  if (!author) {
    const firstPerson = extractFirstPersonAuthor(ex);
    if (firstPerson) author = firstPerson;
  }

  if (author) {
    const escaped = author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const extended = new RegExp(
      `^\\s*(?:Par|By)\\s+${escaped}(?:\\s+[\\p{Lu}][\\p{L}'’.\\-]+)?(?=\\s+(?:Le|La|Les|L'|L’|Un|Une|À|A|The|An)\\s)`,
      'iu',
    );
    const known = new RegExp(`^\\s*(?:Par|By)\\s+${escaped}\\s*`, 'iu');
    if (extended.test(ex)) body = ex.replace(extended, '').trim();
    else if (known.test(ex)) body = ex.replace(known, '').trim();
  }

  return { author, body };
}

function normalizeAuthor(name = '') {
  let a = String(name).replace(/\s+/g, ' ').trim();
  a = a.replace(/^(?:Par|By)\s+/i, '').trim();
  const editorial = canonicalizeEditorialAuthor(a);
  if (editorial) return editorial;
  if (!a || GENERIC_AUTHORS.test(a) || /@/.test(a) || isJunkAuthorName(a)) return '';
  return a;
}

// ─── Date / time formatting (Québec) ────────────────────────────────────────────
function formatTime(d, lang = 'fr') {
  if (isNaN(d)) return '';
  if (lang === 'en') {
    return d.toLocaleTimeString('en-CA', {
      timeZone: 'America/Toronto',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const part = (type) => parts.find((entry) => entry.type === type)?.value;
  return `${part('hour')} h ${part('minute')}`;
}

function formatCompactCalendarDate(d, lang = 'fr') {
  if (isNaN(d)) return '';
  if (lang === 'en') {
    return d.toLocaleDateString('en-CA', {
      timeZone: 'America/Toronto',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  return d.toLocaleDateString('fr-CA', {
    timeZone: 'America/Toronto', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatStamp(d) {
  if (isNaN(d)) return '';
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;

  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yest.toDateString();
  const time = formatTime(d);

  if (sameDay) return `aujourd'hui, ${time}`;
  if (isYesterday) return `hier, ${time}`;

  const sameYear = d.getFullYear() === now.getFullYear();
  const dateStr = d.toLocaleDateString('fr-CA', {
    day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }),
  });
  return `${dateStr}, ${time}`;
}

/** Date courte pour cartes compactes (En bref, Suite du fil). */
function formatStampCompact(d, lang = 'fr') {
  if (isNaN(d)) return '';
  const now = new Date();
  const diffMin = Math.round((now - d) / 60000);
  const l = lang === 'en' ? 'en' : 'fr';

  if (diffMin < 1) return l === 'en' ? 'just now' : "à l'instant";
  if (diffMin < 60) return l === 'en' ? `${diffMin} min ago` : `il y a ${diffMin} min`;

  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yest.toDateString();
  const clock = formatTime(d, l);

  if (sameDay) {
    if (l === 'en') return clock ? `Today, ${clock}` : 'Today';
    return clock ? `aujourd'hui, ${clock}` : "aujourd'hui";
  }
  if (isYesterday) {
    if (l === 'en') return clock ? `Yesterday, ${clock}` : 'Yesterday';
    return clock ? `hier, ${clock}` : 'hier';
  }

  const date = formatCompactCalendarDate(d, l);
  return [date, clock].filter(Boolean).join(' · ');
}

// ─── Title / brief cleanup ───────────────────────────────────────────────────────
const MC_CATEGORY_PREFIX = /^(?:Photoreportage|Marché aux puces|Cobaye|Incursion|Reportage|Opinion|Entrevue|Critique|Chronique)/;

function stripEmbeddedCss(title = '') {
  let t = String(title).trim();
  if (!/^\.[\w-]+\s*\{/.test(t) && !/@media/i.test(t)) return t;
  const start = t.indexOf('{');
  if (start === -1) return t;
  let depth = 0;
  for (let i = start; i < t.length; i += 1) {
    if (t[i] === '{') depth += 1;
    else if (t[i] === '}') {
      depth -= 1;
      if (depth === 0) return t.slice(i + 1).trim();
    }
  }
  return t;
}

/** Retire puces / symboles en tête, mais garde chiffres et lettres (« 14 bourses… »). */
function stripLeadingNonLetters(title = '') {
  return String(title).replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

/** Aligné sur scripts/html-entities-lib.js — inclut &eacute;, &ccedil;, etc. */
const NAMED_HTML_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: '\u00A0', hellip: '…', mdash: '—', ndash: '–',
  rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201D', ldquo: '\u201C',
  laquo: '«', raquo: '»',
  aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ',
  ccedil: 'ç', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
  ntilde: 'ñ', oacute: 'ó', ograve: 'ò', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
  uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü', yacute: 'ý', yuml: 'ÿ',
  Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ',
  Ccedil: 'Ç', Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Euml: 'Ë',
  Iacute: 'Í', Igrave: 'Ì', Icirc: 'Î', Iuml: 'Ï',
  Ntilde: 'Ñ', Oacute: 'Ó', Ograve: 'Ò', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø',
  Uacute: 'Ú', Ugrave: 'Ù', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý',
  oelig: 'œ', OElig: 'Œ',
};

function decodeNamedHtmlEntities(str = '') {
  return String(str).replace(/&([a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(NAMED_HTML_ENTITIES, name)
      ? NAMED_HTML_ENTITIES[name]
      : match
  ));
}

/** fromCodePoint sûr : couvre les caractères astraux (émojis) sans lever sur un code invalide. */
function safeFromCodePoint(code, fallback) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10FFFF) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

function decodeHtmlEntities(str = '') {
  let s = String(str);
  for (let pass = 0; pass < 3; pass += 1) {
    const prev = s;
    s = s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&#(\d+);/g, (m, n) => safeFromCodePoint(parseInt(n, 10), m))
      .replace(/&#x([0-9a-f]+);/gi, (m, n) => safeFromCodePoint(parseInt(n, 16), m))
      .replace(/&#0?39;/gi, '’');
    s = decodeNamedHtmlEntities(s)
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');
    if (s === prev) break;
  }
  return s;
}

/**
 * Aligné sur scripts/html-entities-lib.js (fixDropCapSpacing).
 * Recolle la lettrine WP détachée par le strip HTML (« L e 18… » → « Le 18… »),
 * sauf quand la majuscule isolée est un mot complet (« À cette fin… ») — sinon
 * on fabriquait « Àcette ».
 */
const STANDALONE_CAPITAL_WORD_RE = /^[AÀÂIÎOÔY]$/u;

function fixDropCapSpacing(text = '') {
  return String(text)
    .replace(/^([\p{Lu}])\s+(['’])/u, '$1$2')
    .replace(/^([\p{Lu}])\s+([\p{Ll}])/u, (match, cap, next) => (
      STANDALONE_CAPITAL_WORD_RE.test(cap) ? match : `${cap}${next}`
    ));
}

function cleanTitle(title = '') {
  let t = decodeHtmlEntities(stripEmbeddedCss(title));
  t = t.replace(/\s+/g, ' ').trim();
  // Suffixes SEO collés aux og:title (Rank Math) — déjà stripés côté bot, mais
  // on nettoie aussi les news.json déjà en cache.
  t = t.replace(/\s*[–—|-]\s*Montréal\s+Campus\s*$/i, '').trim();
  t = t.replace(/\s*[–—|-]\s*Quartier\s+Libre\s*$/i, '').trim();
  t = t.replace(/\s*[–—|-]\s*Le\s+D[eé]lit\s*$/i, '').trim();
  t = t.replace(/\bUde\s+M\b/g, 'UdeM').replace(/\bUde\s+S\b/g, 'UdeS');
  t = t.replace(/\bMc\s+Gill\b/g, 'McGill');
  const prefix = t.match(MC_CATEGORY_PREFIX);
  if (prefix) t = t.slice(prefix[0].length).trim();
  t = stripLeadingNonLetters(t);
  // Titres doubles sans ponctuation (ex. « Magazines à potins En papier… »)
  return t.replace(
    /([\p{Ll}àâäéèêëïîôùûüç'’])\s+(En|Le|La|Les|L'|L'|Un|Une|The|A|An)\s+/gu,
    '$1 — $2 ',
  );
}

function stripLeadingByline(text = '', author = '') {
  if (!text || !author) return text;
  const escaped = author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text).replace(new RegExp(`^(?:Par|By)\\s+${escaped}\\s*`, 'iu'), '').trim();
}

function leadBriefSource(item) {
  const { author, body } = splitByline(item);
  const raw = String(item.leadExcerpt || '').trim()
    || body
    || String(item.excerpt || '');
  return stripLeadingByline(sanitizeBriefBody(raw), author);
}

function compactBriefSource(item) {
  const { author, body } = splitByline(item);
  return stripLeadingByline(sanitizeBriefBody(body || item.excerpt || ''), author);
}

function featureBriefSource(item) {
  /* Aligné sur la une : leadExcerpt en priorité. */
  return leadBriefSource(item);
}

function ensureFeatureBriefMinLines(brief, truncated, item) {
  return ensureLeadBriefMinLines(brief, truncated, item, 'feature');
}

function ensureCompactBriefMinLines(brief, truncated, item) {
  const { author } = splitByline(item);
  brief = stripLeadingByline(brief, author);
  const minChars = briefMinCharsForRole('compact');

  if (brief.length >= minChars) {
    const full = compactBriefSource(item);
    if (full.length > brief.length + 12) truncated = true;
    return { text: brief, truncated };
  }

  const fallback = compactBriefSource(item);
  if (fallback.length > brief.length) {
    const extended = prepareBrief(fallback, 'compact');
    if (extended.text.length > brief.length) {
      brief = stripLeadingByline(extended.text, author);
      truncated = extended.truncated;
    }
  }
  if (fallback.length > brief.length + 12) truncated = true;
  return { text: brief, truncated };
}

function ensureLeadBriefMinLines(brief, truncated, item, role = 'lead') {
  const { author } = splitByline(item);
  brief = stripLeadingByline(brief, author);
  const minChars = briefMinCharsForRole(role === 'feature' ? 'feature' : 'lead');
  const prepRole = role === 'feature' ? 'feature' : 'lead';

  if (brief.length >= minChars) {
    return { text: brief, truncated };
  }

  const fallback = leadBriefSource(item);
  if (fallback.length > brief.length) {
    const extended = prepareBrief(fallback, prepRole);
    if (extended.text.length > brief.length) {
      brief = stripLeadingByline(extended.text, author);
      truncated = extended.truncated;
    }
  }
  if (brief.length >= minChars) {
    return { text: brief, truncated };
  }

  const title = cleanTitle(item.title);
  const pieces = [];
  if (title.length > 8) pieces.push(title);
  if (fallback && !pieces.some((part) => part.includes(fallback.slice(0, 24)))) pieces.push(fallback);
  const inst = articleInstitutionLabel(item.institution, item.type);
  if (item.source) {
    const ctx = item.lang === 'en'
      ? `From ${item.source}${inst ? ` (${inst})` : ''}.`
      : `Dans ${item.source}${inst ? ` (${inst})` : ''}.`;
    pieces.push(ctx);
  }
  const combined = prepareBrief(pieces.join(' '), prepRole);
  if (combined.text.length > brief.length) {
    return {
      text: stripLeadingByline(combined.text, author),
      truncated: combined.truncated,
    };
  }
  return { text: brief, truncated };
}

function sanitizeBriefBody(raw = '') {
  let s = decodeHtmlEntities(String(raw));
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/\]\]>/g, '');
  s = s.replace(/\s*L['’]article\b[\s\S]*?est apparu en premier sur[\s\S]*$/i, '');
  s = s.replace(/\s*The\s+post\b[\s\S]*?appeared first on[\s\S]*$/i, '');
  const li = s.search(/\sL['’]article\s/);
  if (li > 30) s = s.slice(0, li);
  s = s.replace(/\[[^\]]*(?:read more|lire la suite|continue reading)[^\]]*\]/gi, '');
  s = s.replace(/\b(?:read more|lire la suite|continue reading)\b\.?\s*$/i, '');
  s = s.replace(/^(?:Dear Tribune|Dear Editor),?\s*/i, '');
  // Crédits photo collés au chapô RSS (ex. « …Pierre. (Photo : Léa Morin-Letort) L’heure »)
  // — le crédit reste sous la vignette (.article-media-credit), pas dans le corps.
  s = s.replace(/\s*\(\s*(?:Photo(?:\s*credit)?|Crédit(?:\s*photo)?|Credit|Image|Illustration)\s*:\s*[^)]+\)\.?\s*/gi, ' ');
  s = s.replace(/(?:^|[.\s])(?:Photo(?:\s*credit)?|Crédit(?:\s*photo)?|Credit|Image|Illustration)\s*:\s*[^.!?\n(]{2,80}\.?\s*/gi, ' ');
  // Orphelin après une phrase complète (début de phrase suivante coupé par le scrape).
  s = s.replace(/([.!?»"')\]])\s+[\p{L}'’]{1,18}\s*$/u, '$1');
  s = s.replace(/(?:…|\.{3,}|\[…\]|\[\.\.\.\]|\[&hellip;\])/gi, '');
  s = s.replace(/\.\s*\./g, '.');
  s = s.replace(/\s+/g, ' ').trim();
  // WP has-drop-cap dans le flux : « L e 18… » / « L 'identité »
  s = fixDropCapSpacing(s);
  return s;
}

function endsCompleteSentence(text = '') {
  return /[.!?»"')\]]\s*$/.test(String(text).trim());
}

function resolveBrief(item, body, role) {
  for (const raw of [body, String(item.excerpt || '')]) {
    const result = prepareBrief(raw, role);
    if (result.text) {
      if (role === 'compact') {
        const full = sanitizeBriefBody(raw);
        if (full.length > 95 || full.length > result.text.length + 12) {
          result.truncated = true;
        }
      }
      return result;
    }
  }
  return prepareBrief(cleanTitle(item.title), role);
}

function prepareBrief(raw = '', role = 'standard') {
  const limit = briefLimitForRole(role);
  let s = sanitizeBriefBody(raw);
  if (!s || limit === 0 || s.length < 8) return { text: '', truncated: false };

  const minTruncMark = role === 'compact' ? 48 : 80;

  if (s.length <= limit) {
    const truncated = !endsCompleteSentence(s) && s.length >= minTruncMark;
    const text = s.replace(/[,;:\s]+$/u, '').trimEnd() || s;
    return { text, truncated };
  }

  let cut = s.slice(0, limit);
  // Magazine 2 col : ne pas laisser la fin de phrase allonger l’extrait
  // (sinon les cartes varient trop et l’équilibre une|En bref casse).
  const sentenceSlack = isMidwidthMagazinePreview()
    ? 36
    : (isDesktopMagazineLayout() ? 48 : 100);
  const sentenceEnd = s.slice(limit).search(/[.!?»"')\]](?:\s|$)/);
  if (sentenceEnd >= 0 && sentenceEnd < sentenceSlack) {
    cut = s.slice(0, limit + sentenceEnd + 1);
  } else {
    // Préférer une coupure sur ponctuation faible, sinon dernier mot complet
    // (éviter « si je me » + Lire la suite collé).
    const soft = Math.max(
      cut.lastIndexOf('. '),
      cut.lastIndexOf('! '),
      cut.lastIndexOf('? '),
      cut.lastIndexOf(', '),
      cut.lastIndexOf('; '),
      cut.lastIndexOf(' : '),
      cut.lastIndexOf(' — '),
      cut.lastIndexOf(' – '),
    );
    if (soft > limit * 0.55) {
      cut = cut.slice(0, soft + 1);
    } else {
      const lastSpace = cut.lastIndexOf(' ');
      if (lastSpace > limit * 0.5) cut = cut.slice(0, lastSpace);
    }
  }
  cut = cut.replace(/[,;:\s]+$/u, '').trimEnd();
  if (!cut) return { text: '', truncated: false };

  // Points de suspension si la phrase n’est pas terminée (sépare du « Lire la suite »).
  if (!endsCompleteSentence(cut) && !/[…]\s*$/.test(cut)) {
    cut = `${cut}…`;
  }

  return { text: cut, truncated: true };
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  if (!TOAST_EL) return;
  TOAST_EL.textContent = msg;
  TOAST_EL.classList.remove('hidden');
  clearTimeout(TOAST_EL._t);
  TOAST_EL._t = setTimeout(() => TOAST_EL.classList.add('hidden'), 2800);
}

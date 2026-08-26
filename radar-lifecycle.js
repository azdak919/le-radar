// LE-RADAR — bootstrap, thème, date, sync lecteur, toast
// Script classique (pas type=module). Les liaisons partagées vivent dans
// radar-state.js (var) ; les function declarations sont globales.

// ─── Bootstrap ───────────────────────────────────────────────────────────────

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


// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  if (!TOAST_EL) return;
  TOAST_EL.textContent = msg;
  TOAST_EL.classList.remove('hidden');
  clearTimeout(TOAST_EL._t);
  TOAST_EL._t = setTimeout(() => TOAST_EL.classList.add('hidden'), 2800);
}

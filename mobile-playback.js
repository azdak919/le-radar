/**
 * LE RADAR — contrôleur de lecture mobile en arrière-plan.
 *
 * Android (Chrome) — refonte 2026, philosophie « ne pas se battre contre
 * la plateforme » : Chrome garde un <audio> vivant à l'écran verrouillé
 * tant que (1) l'élément joue réellement et (2) la Media Session est
 * active (c'est elle qui porte la notification média et le focus audio).
 * L'ancienne stratégie (salves de reprises différées, battement play()
 * périodique, reconnexions avec démontage src/load() + cache-bust en
 * arrière-plan) détruisait précisément ces deux conditions : chaque
 * démontage faisait perdre la notification et l'autorisation de lecture,
 * et le play() suivant restait bloqué → silence quelques secondes après
 * le verrouillage.
 *
 *   Android — nouvelle stratégie :
 *     1. UN SEUL MediaElement, jamais recréé, jamais de 2e son
 *        (un second flux — même ultrasonique — vole le focus audio)
 *     2. Pause inattendue (OEM au lock, perte de focus passagère) →
 *        play() simple sur le MÊME élément : immédiat dans le handler,
 *        puis backoff doux. Aucun démontage du pipeline sur une pause.
 *     3. Pipeline mort PROUVÉ (error / ended / « playing » mais
 *        currentTime figé / waiting sans fin) → rechargement src+load()
 *        sans retirer l'attribut src ni cache-bust, budget régénérant.
 *     4. Watchdog léger (setTimeout chaîné ~5 s) en filet de sécurité ;
 *        les événements média restent la source primaire de signal.
 *     5. Media Session maintenue (metadata + playbackState) — c'est la
 *        voie privilégiée d'Android pour relancer depuis le lockscreen.
 *
 *   iOS — inchangé (fonctionne) :
 *     1. Boucle WAV quasi-silencieuse (2e MediaElement) — garde la session
 *     2. Watchdog + battement timeupdate sur la boucle
 *     3. Reprise différée avec backoff + reconnexion pipeline
 *
 *   Commun :
 *     - Budget de reconnexions qui se régénère (écoute longue écran éteint)
 */
(function (global) {
  'use strict';

  const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const IS_ANDROID = /Android/i.test(navigator.userAgent);
  const IS_MOBILE = window.matchMedia('(hover: none) and (pointer: coarse)').matches
    || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const DEFAULT_CONFIG = Object.freeze({
    // ── Commun : budget de reconnexions (rechargement du pipeline) ──
    reconnectMaxFg: 4,
    reconnectMaxBg: 12,
    reconnectMinGapMs: 2500,
    // Fenêtre après laquelle le compteur de reconnexions repart à zéro.
    reconnectDecayMs: 45000,

    // ── Android ──
    // Filet de sécurité : vérification chaînée de l'état du lecteur.
    androidWatchdogMs: 5000,
    // « playing » mais currentTime figé au-delà de ce délai = pipeline mort.
    androidFrozenAfterMs: 9000,
    // Backoff des reprises play() après pause inattendue (dernier répété).
    androidResumeStepsMs: [250, 1000, 3000, 8000, 15000, 30000],
    // Deux pauses en moins d'une seconde = focus refusé → backoff, pas de
    // reprise immédiate en boucle (guerre pause/play qui tue la session).
    androidResumeImmediateGapMs: 1000,
    // Après N play() sans reprise effective, tenter un rechargement du flux.
    androidResumeReloadAfter: 4,
    // waiting/stalled prolongé avant intervention (laisser Chrome tamponner).
    androidStallMs: 6000,

    // ── iOS ──
    watchIntervalMs: 2500,
    stallDelayBgMs: 800,
    stallDelayFgMs: 4000,
    resumeInitialMs: 80,
    resumeBackoffBaseMs: 150,
    resumeBackoffFactor: 1.45,
    resumeBackoffMaxMs: 3500,
    // > 5 s évite la classification « contenu court » Chromium.
    keepaliveWavSec: 6,
    keepaliveFreqHz: 19500,
    keepaliveGain: 0.001,
    // Après N play() sans reprise, recharger le pipeline média.
    pausedRecoveryBeforeReload: 3,
  });

  function encodeSilentWav(seconds, freq, gain, sampleRate = 44100) {
    const n = sampleRate * seconds;
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      samples[i] = Math.sin(2 * Math.PI * freq * i / sampleRate) * gain;
    }
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const w = (o, s) => { for (let j = 0; j < s.length; j++) v.setUint8(o + j, s.charCodeAt(j)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE');
    w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true);
    v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(44 + i * 2, (s < 0 ? s * 0x8000 : s * 0x7FFF) | 0, true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  function createMobilePlayback(deps, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    // ── État commun ──
    // Lecture voulue par l'utilisateur (démarrée et jamais arrêtée/pausée par lui).
    let playbackIntended = false;
    let reconnectTries = 0;
    let lastReconnectAt = 0;
    let stallTimer = null;
    let lastStreamProgressAt = 0;
    let lastStreamCurrentTime = 0;

    // ── État Android ──
    let androidWatchdogTimer = null;
    let androidResumeTimer = null;
    let androidResumeAttempt = 0;
    let lastAndroidImmediateResumeAt = 0;

    // ── État iOS ──
    let keepaliveAudio = null;
    let keepaliveBlobUrl = null;
    let keepaliveWanted = false;
    let watchTimer = null;
    let resumeTimer = null;
    let resumeAttempt = 0;
    let pausedRecoveryTries = 0;
    let lastHeartbeatAt = 0;

    function isBackground() {
      return IS_MOBILE && document.visibilityState === 'hidden';
    }

    function isStationResilient() {
      return !!deps.isStationResilient?.();
    }

    function shouldRecover() {
      return isStationResilient() || isBackground();
    }

    function maxReconnectTries() {
      return isBackground() ? cfg.reconnectMaxBg : cfg.reconnectMaxFg;
    }

    function setPlaybackSession() {
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
      } catch {}
    }

    function releasePlaybackSession() {
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'auto';
      } catch {}
    }

    function wantsPlayback() {
      return playbackIntended
        && !deps.isUserPaused()
        && !deps.isCasting?.()
        && !deps.isExternalListen?.();
    }

    // ═════════════════════════════════════════════════════════════════════
    //  ANDROID — reprise douce + watchdog, jamais de démontage sur pause
    // ═════════════════════════════════════════════════════════════════════

    function clearAndroidResume() {
      if (androidResumeTimer) {
        clearTimeout(androidResumeTimer);
        androidResumeTimer = null;
      }
    }

    function stopAndroidWatchdog() {
      if (androidWatchdogTimer) {
        clearTimeout(androidWatchdogTimer);
        androidWatchdogTimer = null;
      }
    }

    function startAndroidWatchdog() {
      if (!IS_ANDROID || androidWatchdogTimer || !playbackIntended) return;
      androidWatchdogTimer = setTimeout(androidWatchdogTick, cfg.androidWatchdogMs);
    }

    function androidWatchdogTick() {
      androidWatchdogTimer = null;
      if (!wantsPlayback()) return;
      const player = deps.getPlayer();
      if (player && player.src) {
        if (player.paused) {
          if (!androidResumeTimer) androidAttemptResume();
        } else if (lastStreamProgressAt
          && Date.now() - lastStreamProgressAt > cfg.androidFrozenAfterMs) {
          // « playing » mais figé = pipeline mort (fréquent après un long lock).
          attemptReconnect();
        }
        if (isBackground()) deps.syncMediaSession?.();
      }
      startAndroidWatchdog();
    }

    /** Reprise play() planifiée avec backoff — un seul timer à la fois. */
    function androidScheduleResume() {
      if (androidResumeTimer || !wantsPlayback()) return;
      const steps = cfg.androidResumeStepsMs;
      const delay = steps[Math.min(androidResumeAttempt, steps.length - 1)];
      androidResumeTimer = setTimeout(() => {
        androidResumeTimer = null;
        androidAttemptResume();
      }, delay);
    }

    /**
     * Reprise Android : play() simple sur le même élément. Pas de teardown —
     * garder l'identité de l'élément préserve la Media Session et le droit
     * de lecture accordé par le geste utilisateur initial.
     */
    function androidAttemptResume() {
      if (!wantsPlayback() || !deps.getStation()) return;
      const player = deps.getPlayer();
      if (!player) return;

      deps.ensureNativePlayback?.();
      deps.resumeAudioCtx?.();
      setPlaybackSession();
      deps.syncMediaSession?.();

      if (!player.src) {
        deps.playStation?.(deps.getStation());
        return;
      }
      if (!player.paused) {
        androidResumeAttempt = 0;
        return;
      }

      androidResumeAttempt += 1;
      // Reprises simples sans effet répétées → le flux est probablement mort.
      if (androidResumeAttempt > cfg.androidResumeReloadAfter && attemptReconnect()) return;

      const playAttempt = player.play();
      if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(() => androidScheduleResume());
      }
    }

    /**
     * Pause non initiée par l'utilisateur. Cas typiques : pause OEM à
     * l'instant du lock (→ reprise immédiate dans le handler), perte de
     * focus audio (appel, autre app → backoff doux, pas de guerre play/pause).
     */
    function androidOnUnexpectedPause() {
      if (!wantsPlayback()) return;
      const now = Date.now();
      if (now - lastAndroidImmediateResumeAt >= cfg.androidResumeImmediateGapMs) {
        lastAndroidImmediateResumeAt = now;
        androidAttemptResume();
      } else {
        androidScheduleResume();
      }
    }

    function androidOnBackgroundEnter() {
      if (!wantsPlayback()) return;
      setPlaybackSession();
      deps.syncMediaSession?.();
      startAndroidWatchdog();
      const player = deps.getPlayer();
      if (player?.paused && player.src) androidAttemptResume();
    }

    function androidOnBackgroundExit() {
      androidResumeAttempt = 0;
      if (!wantsPlayback()) return;
      deps.syncMediaSession?.();
      const player = deps.getPlayer();
      if (player?.paused && player.src) androidAttemptResume();
    }

    /** Progression du flux (timeupdate) : l'horloge de santé du pipeline. */
    function androidOnTimeUpdate() {
      const player = deps.getPlayer();
      if (!player || player.paused) return;
      const t = player.currentTime || 0;
      if (t < lastStreamCurrentTime) {
        // Rechargement : currentTime repart de zéro.
        lastStreamCurrentTime = t;
        lastStreamProgressAt = Date.now();
      } else if (t > lastStreamCurrentTime + 0.05) {
        lastStreamCurrentTime = t;
        lastStreamProgressAt = Date.now();
        androidResumeAttempt = 0;
      }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  iOS — boucle WAV + watchdog (inchangé : fonctionne)
    // ═════════════════════════════════════════════════════════════════════

    // Battement iOS : timeupdate de la boucle WAV (les timers JS sont étranglés).
    function onKeepaliveHeartbeat() {
      if (!isBackground() || !playbackIntended) return;
      const now = Date.now();
      if (now - lastHeartbeatAt < cfg.watchIntervalMs) return;
      lastHeartbeatAt = now;
      tryResumePlayback();
    }

    function onKeepalivePaused() {
      if (keepaliveWanted && playbackIntended && !deps.isUserPaused()) {
        keepaliveAudio?.play().catch(() => {});
      }
    }

    /** iOS uniquement — second MediaElement. Jamais sur Android (vol de focus). */
    function startWavKeepalive() {
      if (IS_ANDROID) return;
      if (!keepaliveBlobUrl) {
        keepaliveBlobUrl = URL.createObjectURL(
          encodeSilentWav(cfg.keepaliveWavSec, cfg.keepaliveFreqHz, cfg.keepaliveGain),
        );
      }
      if (!keepaliveAudio) {
        keepaliveAudio = new Audio(keepaliveBlobUrl);
        keepaliveAudio.id = 'radar-keepalive';
        keepaliveAudio.loop = true;
        keepaliveAudio.volume = 1;
        keepaliveAudio.setAttribute('playsinline', '');
        keepaliveAudio.addEventListener('timeupdate', onKeepaliveHeartbeat);
        keepaliveAudio.addEventListener('pause', onKeepalivePaused);
        keepaliveAudio.addEventListener('ended', onKeepalivePaused);
      }
      if (keepaliveAudio.paused) keepaliveAudio.play().catch(() => {});
    }

    function clearResumeTimer() {
      if (resumeTimer) {
        clearTimeout(resumeTimer);
        resumeTimer = null;
      }
    }

    function clearWatch() {
      if (watchTimer) {
        clearInterval(watchTimer);
        watchTimer = null;
      }
    }

    function resumeBackoffMs() {
      return Math.min(
        cfg.resumeBackoffMaxMs,
        Math.round(cfg.resumeBackoffBaseMs * Math.pow(cfg.resumeBackoffFactor, resumeAttempt)),
      );
    }

    /** Reprise iOS (et filets génériques hors Android). */
    function tryResumePlayback() {
      if (IS_ANDROID) { androidAttemptResume(); return; }
      if (!wantsPlayback() || !deps.getStation()) return;

      deps.ensureNativePlayback?.();
      deps.resumeAudioCtx?.();
      setPlaybackSession();

      const player = deps.getPlayer();
      if (!player) return;

      // Buffering en arrière-plan sans données → reconnexion.
      if (!player.paused && player.src && player.readyState < 2 && isBackground()) {
        if (shouldRecover() && canReconnectNow()) attemptReconnect();
        return;
      }

      if (player.paused && player.src) {
        deps.syncMediaSession?.();
        pausedRecoveryTries += 1;
        if (pausedRecoveryTries >= cfg.pausedRecoveryBeforeReload
          && shouldRecover() && canReconnectNow()) {
          attemptReconnect();
        } else {
          const playAttempt = player.play();
          if (playAttempt && typeof playAttempt.catch === 'function') {
            playAttempt.catch(() => {
              if (shouldRecover() && canReconnectNow()) {
                attemptReconnect();
              } else {
                deps.playStation?.(deps.getStation());
              }
            });
          }
        }
      } else if (!deps.isPlaying()) {
        deps.playStation?.(deps.getStation());
      } else {
        deps.syncMediaSession?.();
      }

      if (deps.isPlaying()) startKeepalive();
    }

    function scheduleResume(delay = cfg.resumeInitialMs) {
      if (deps.isUserPaused() || !deps.getStation() || deps.isExternalListen?.()) return;
      clearResumeTimer();
      resumeTimer = setTimeout(() => {
        resumeTimer = null;
        tryResumePlayback();
        if (isBackground() && !deps.isUserPaused() && !deps.isPlaying()) {
          resumeAttempt += 1;
          scheduleResume(resumeBackoffMs());
        } else {
          resumeAttempt = 0;
        }
      }, delay);
    }

    function startWatch() {
      if (deps.isUserPaused() || !deps.getStation() || deps.isExternalListen?.()) return;
      clearWatch();
      // Filet de secours : timers très ralentis en bg, d'où le battement WAV.
      watchTimer = setInterval(tryResumePlayback, cfg.watchIntervalMs);
    }

    function onBackgroundEnter() {
      if (!wantsPlayback()) return;
      setPlaybackSession();
      deps.syncMediaSession?.();
      if (deps.isPlaying()) {
        startKeepalive();
      } else {
        scheduleResume(cfg.resumeInitialMs);
      }
      startWatch();
    }

    function onBackgroundExit() {
      clearWatch();
      clearResumeTimer();
      resumeAttempt = 0;
      tryResumePlayback();
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Keepalive (point d'entrée commun app.js)
    // ═════════════════════════════════════════════════════════════════════

    function startKeepalive() {
      if (!IS_MOBILE || !deps.isPlaying() || deps.isUserPaused()) return;
      setPlaybackSession();
      deps.syncMediaSession?.();

      // Android : pas de 2e piste audio — le flux live tient la session,
      // le watchdog sert de filet.
      if (IS_ANDROID) {
        startAndroidWatchdog();
        return;
      }

      // iOS : boucle WAV de secours.
      keepaliveWanted = true;
      try { startWavKeepalive(); } catch {}
    }

    function stopKeepalive() {
      keepaliveWanted = false;
      releasePlaybackSession();
      stopAndroidWatchdog();
      clearAndroidResume();
      if (keepaliveAudio) {
        try { keepaliveAudio.pause(); } catch {}
      }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Stalls et reconnexion (commun, budget régénérant)
    // ═════════════════════════════════════════════════════════════════════

    function clearStallTimer() {
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    }

    function canReconnectNow() {
      return Date.now() - lastReconnectAt >= cfg.reconnectMinGapMs;
    }

    function onStall() {
      if (!playbackIntended || deps.isUserPaused()) return;
      // En premier plan hors résilience, laisser le navigateur tamponner.
      if (!isBackground() && !isStationResilient()) return;
      if (stallTimer) return;
      const delay = IS_ANDROID
        ? cfg.androidStallMs
        : (isBackground() ? cfg.stallDelayBgMs : cfg.stallDelayFgMs);
      stallTimer = setTimeout(() => {
        stallTimer = null;
        const player = deps.getPlayer();
        if (!player || !playbackIntended || deps.isUserPaused()) return;
        if (!player.paused && player.readyState >= 3) return;
        if (!attemptReconnect()) {
          if (IS_ANDROID) androidScheduleResume();
          else tryResumePlayback();
        }
      }, delay);
    }

    function decayReconnectTries() {
      if (reconnectTries > 0 && Date.now() - lastReconnectAt >= cfg.reconnectDecayMs) {
        reconnectTries = 0;
      }
    }

    function shouldHandleEnded() {
      decayReconnectTries();
      return shouldRecover() && reconnectTries < maxReconnectTries();
    }

    function shouldHandleError(currentTime) {
      decayReconnectTries();
      return shouldRecover() && currentTime > 0 && reconnectTries < maxReconnectTries();
    }

    /**
     * Rechargement du flux SANS démonter l'élément : pas de
     * removeAttribute('src'), pas de cache-bust, pas de pause() préalable.
     * Conserver l'identité de l'élément garde la Media Session, la
     * notification et l'autorisation de lecture (critique en arrière-plan).
     */
    function attemptReconnect() {
      if (!deps.getStation() || !shouldRecover()) return false;
      decayReconnectTries();
      if (reconnectTries >= maxReconnectTries()) return false;
      if (!canReconnectNow()) return false;

      const player = deps.getPlayer();
      const url = deps.getStreamUrl?.(deps.getStation());
      if (!url || !player) return false;

      reconnectTries += 1;
      lastReconnectAt = Date.now();
      pausedRecoveryTries = 0;
      androidResumeAttempt = 0;
      lastStreamCurrentTime = 0;
      lastStreamProgressAt = Date.now();

      deps.setSuppressErrors?.(true);
      try {
        player.src = url;
        player.load();
      } catch {}
      deps.setSuppressErrors?.(false);

      const playAttempt = player.play();
      if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(() => {
          if (IS_ANDROID) androidScheduleResume();
          else player.play().catch(() => {});
        });
      }
      startKeepalive();
      deps.syncMediaSession?.();
      return true;
    }

    function resetReconnectTries() {
      reconnectTries = 0;
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Cycle de vie page + branchement sur le lecteur
    // ═════════════════════════════════════════════════════════════════════

    function setupLifecycle() {
      if (!IS_MOBILE) return;

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          if (IS_ANDROID) androidOnBackgroundEnter();
          else onBackgroundEnter();
        } else {
          if (IS_ANDROID) androidOnBackgroundExit();
          else onBackgroundExit();
        }
      });

      window.addEventListener('pageshow', (e) => {
        if (e.persisted) tryResumePlayback();
      });

      document.addEventListener('resume', () => {
        if (!IS_ANDROID) clearWatch();
        tryResumePlayback();
      });

      if (!IS_ANDROID) {
        // iOS : pagehide/blur arrivent parfois avant visibilitychange au lock.
        window.addEventListener('pagehide', () => {
          if (!deps.isUserPaused() && playbackIntended) onBackgroundEnter();
        });
        document.addEventListener('freeze', () => {
          if (!deps.isUserPaused() && playbackIntended) {
            deps.syncMediaSession?.();
            // Tenter une dernière reprise avant gel (Page Lifecycle).
            tryResumePlayback();
          }
        });
        window.addEventListener('focus', () => {
          if (playbackIntended && !deps.isUserPaused()) tryResumePlayback();
        });
      }
    }

    function attachToPlayer(el) {
      if (!IS_MOBILE || !el || el.__radarMobilePlayback) return;
      el.__radarMobilePlayback = true;

      el.addEventListener('stalled', () => onStall());
      el.addEventListener('waiting', () => onStall());
      el.addEventListener('playing', () => {
        lastStreamProgressAt = Date.now();
        lastStreamCurrentTime = el.currentTime || 0;
      });

      if (IS_ANDROID) {
        el.addEventListener('timeupdate', androidOnTimeUpdate);
        el.addEventListener('pause', () => androidOnUnexpectedPause());
        // suspend/emptied sont des événements normaux du cycle de buffering
        // Android : ne PAS y réagir (les anciennes salves de reprise sur
        // suspend contribuaient à la guerre play/pause).
        return;
      }

      // iOS : reprise immédiate sur pause + filets sur suspend/emptied.
      const onBgSignal = () => {
        if (!deps.isUserPaused() && deps.getStation() && playbackIntended && isBackground()) {
          scheduleResume(cfg.resumeInitialMs);
        }
      };
      el.addEventListener('pause', () => {
        if (playbackIntended && !deps.isUserPaused() && !deps.isCasting?.()) {
          tryResumePlayback();
          onBgSignal();
        }
      });
      el.addEventListener('suspend', () => onBgSignal());
      el.addEventListener('emptied', () => onBgSignal());
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Hooks appelés par app.js
    // ═════════════════════════════════════════════════════════════════════

    function onPlaying() {
      playbackIntended = true;
      reconnectTries = 0;
      resumeAttempt = 0;
      pausedRecoveryTries = 0;
      androidResumeAttempt = 0;
      clearAndroidResume();
      lastStreamProgressAt = Date.now();
      const player = deps.getPlayer();
      lastStreamCurrentTime = player?.currentTime || 0;
      clearStallTimer();
      startKeepalive();
      deps.syncMediaSession?.();
    }

    function onPlayStart() {
      playbackIntended = true;
      reconnectTries = 0;
      resumeAttempt = 0;
      pausedRecoveryTries = 0;
      androidResumeAttempt = 0;
      lastStreamProgressAt = Date.now();
      startKeepalive();
    }

    function onPlayStop() {
      playbackIntended = false;
      clearWatch();
      clearResumeTimer();
      clearStallTimer();
      clearAndroidResume();
      stopAndroidWatchdog();
      reconnectTries = 0;
      resumeAttempt = 0;
      pausedRecoveryTries = 0;
      androidResumeAttempt = 0;
      lastStreamProgressAt = 0;
      lastStreamCurrentTime = 0;
      stopKeepalive();
    }

    function onUserPause() {
      onPlayStop();
    }

    function getMobilePreload(stationResilient) {
      return IS_MOBILE || stationResilient ? 'auto' : 'none';
    }

    return {
      IS_MOBILE,
      IS_ANDROID,
      IS_IOS,
      isBackground,
      shouldRecover,
      maxReconnectTries,
      getMobilePreload,
      setupLifecycle,
      attachToPlayer,
      startKeepalive,
      stopKeepalive,
      onPlayStart,
      onPlayStop,
      onUserPause,
      onPlaying,
      onStall,
      shouldHandleEnded,
      shouldHandleError,
      attemptReconnect,
      resetReconnectTries,
      getReconnectTries: () => reconnectTries,
      showReconnectFailed: () => !isBackground(),
    };
  }

  global.RadarMobilePlayback = { create: createMobilePlayback, CONFIG: DEFAULT_CONFIG };
})(typeof window !== 'undefined' ? window : globalThis);

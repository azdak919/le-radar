/**
 * LE RADAR — contrôleur de lecture mobile en arrière-plan.
 *
 * Stratégie (stream distant via <audio>) :
 *   iOS
 *     1. Boucle WAV quasi-silencieuse (2e MediaElement) — garde la session audio
 *     2. Watchdog + battement timeupdate sur la boucle
 *   Android (Chrome)
 *     1. UN SEUL MediaElement = le flux live (pas de 2e audio ni d'oscillateur)
 *        — un second son (même ultrasonique) vole le focus audio et coupe le
 *        flux quelques secondes après le verrouillage de l'écran
 *     2. Battement timeupdate sur le lecteur principal (événements média non
 *        étranglés, contrairement aux timers JS en page cachée)
 *     3. Reprise immédiate sur pause/stall/waiting + reconnexion pipeline
 *     4. Media Session maintenue (playbackState + position live)
 *   Commun
 *     - Budget de reconnexions qui se régénère (écoute longue écran éteint)
 *     - Rechargement complet du flux après play() sans effet
 */
(function (global) {
  'use strict';

  const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const IS_ANDROID = /Android/i.test(navigator.userAgent);
  const IS_MOBILE = window.matchMedia('(hover: none) and (pointer: coarse)').matches
    || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const DEFAULT_CONFIG = Object.freeze({
    watchIntervalMs: 2500,
    // Android : heartbeat plus serré via timeupdate du flux (≈250 ms natif)
    streamHeartbeatMs: 2000,
    stallDelayBgMs: 800,
    stallDelayFgMs: 4000,
    resumeInitialMs: 80,
    resumeBackoffBaseMs: 150,
    resumeBackoffFactor: 1.45,
    resumeBackoffMaxMs: 3500,
    reconnectMaxFg: 4,
    reconnectMaxBg: 12,
    reconnectMinGapMs: 1500,
    // Fenêtre après laquelle le compteur de reconnexions repart à zéro.
    reconnectDecayMs: 45000,
    // iOS only — > 5 s évite la classification « contenu court » Chromium.
    keepaliveWavSec: 6,
    keepaliveFreqHz: 19500,
    keepaliveGain: 0.001,
    // Après N play() sans reprise, recharger le pipeline média Android.
    pausedRecoveryBeforeReload: 2,
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

    let keepaliveAudio = null;
    let keepaliveBlobUrl = null;

    let watchTimer = null;
    let resumeTimer = null;
    /** Timers de reprise différée (Android lock : 0,4 s / 1,2 s / 2,8 s). */
    const deferredResumeTimers = new Set();
    let stallTimer = null;
    let resumeAttempt = 0;
    let reconnectTries = 0;
    let lastReconnectAt = 0;
    // Lecture voulue par l'utilisateur (démarrée et jamais arrêtée/pausée par lui).
    let playbackIntended = false;
    // Échecs consécutifs de relance d'un lecteur en pause.
    let pausedRecoveryTries = 0;
    let lastHeartbeatAt = 0;
    let lastStreamProgressAt = 0;
    let lastStreamCurrentTime = 0;
    // iOS only : autorise la boucle WAV à se relancer seule.
    let keepaliveWanted = false;
    let streamHeartbeatAttached = false;

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

    /**
     * Android : le flux principal est l'horloge. Tant qu'il avance, la session
     * média reste vivante ; s'il stagne ou pause, on reprend immédiatement.
     */
    function onStreamHeartbeat() {
      if (!playbackIntended || deps.isUserPaused()) return;
      const player = deps.getPlayer();
      if (!player || !player.src) return;

      const now = Date.now();
      const t = player.currentTime || 0;

      if (!player.paused && t > lastStreamCurrentTime + 0.05) {
        lastStreamCurrentTime = t;
        lastStreamProgressAt = now;
        pausedRecoveryTries = 0;
      }

      if (!isBackground()) return;
      if (now - lastHeartbeatAt < cfg.streamHeartbeatMs) return;
      lastHeartbeatAt = now;

      deps.syncMediaSession?.();

      if (player.paused) {
        tryResumePlayback();
        return;
      }

      // Flux « playing » mais currentTime figé = pipeline mort (fréquent au lock).
      if (lastStreamProgressAt && now - lastStreamProgressAt > cfg.stallDelayBgMs + 500) {
        if (canReconnectNow()) deps.performReconnect?.();
        else tryResumePlayback();
      }
    }

    function attachStreamHeartbeat(el) {
      if (!el || streamHeartbeatAttached) return;
      streamHeartbeatAttached = true;
      el.addEventListener('timeupdate', onStreamHeartbeat);
      // progress/durationchange aident quand timeupdate se raréfie.
      el.addEventListener('progress', onStreamHeartbeat);
    }

    function startKeepalive() {
      if (!IS_MOBILE || !deps.isPlaying() || deps.isUserPaused()) return;
      setPlaybackSession();
      deps.syncMediaSession?.();
      attachStreamHeartbeat(deps.getPlayer());

      // Android : pas de 2e piste audio — le flux live tient la session.
      if (IS_ANDROID) {
        keepaliveWanted = false;
        return;
      }

      // iOS : boucle WAV de secours.
      keepaliveWanted = true;
      try { startWavKeepalive(); } catch {}
    }

    function stopKeepalive() {
      keepaliveWanted = false;
      releasePlaybackSession();
      if (keepaliveAudio) {
        try { keepaliveAudio.pause(); } catch {}
      }
    }

    function clearResumeTimer() {
      if (resumeTimer) {
        clearTimeout(resumeTimer);
        resumeTimer = null;
      }
      for (const t of deferredResumeTimers) clearTimeout(t);
      deferredResumeTimers.clear();
    }

    /** Planifie une reprise sans annuler les autres (filet multi-délais Android). */
    function scheduleDeferredResume(delay) {
      if (deps.isUserPaused() || !playbackIntended) return;
      const id = setTimeout(() => {
        deferredResumeTimers.delete(id);
        tryResumePlayback();
      }, delay);
      deferredResumeTimers.add(id);
    }

    function clearStallTimer() {
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = null;
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

    function canReconnectNow() {
      return Date.now() - lastReconnectAt >= cfg.reconnectMinGapMs;
    }

    function tryResumePlayback() {
      if (deps.isUserPaused() || !deps.getStation() || deps.isExternalListen?.()) return;
      if (!playbackIntended || deps.isCasting?.()) return;

      deps.ensureNativePlayback?.();
      deps.resumeAudioCtx?.();
      setPlaybackSession();

      const player = deps.getPlayer();
      if (!player) return;

      // Buffering en arrière-plan sans données → reconnexion.
      if (!player.paused && player.src && player.readyState < 2 && isBackground()) {
        if (shouldRecover() && canReconnectNow()) deps.performReconnect?.();
        return;
      }

      if (player.paused && player.src) {
        deps.syncMediaSession?.();
        pausedRecoveryTries += 1;
        // Android détruit souvent le pipeline au verrouillage : recharger tôt.
        const reloadAfter = IS_ANDROID
          ? cfg.pausedRecoveryBeforeReload
          : 3;
        if (pausedRecoveryTries >= reloadAfter && shouldRecover() && canReconnectNow()) {
          deps.performReconnect?.();
        } else {
          const playAttempt = player.play();
          if (playAttempt && typeof playAttempt.catch === 'function') {
            playAttempt.catch(() => {
              if (shouldRecover() && canReconnectNow()) {
                deps.performReconnect?.();
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
      // Filet de secours : timers très ralentis en bg, d'où le heartbeat média.
      watchTimer = setInterval(tryResumePlayback, cfg.watchIntervalMs);
    }

    function onBackgroundEnter() {
      if (deps.isUserPaused() || !playbackIntended || deps.isCasting?.()) return;
      setPlaybackSession();
      deps.syncMediaSession?.();
      attachStreamHeartbeat(deps.getPlayer());

      if (deps.isPlaying()) {
        startKeepalive();
        // Android : re-assert play() immédiatement au passage en arrière-plan
        // (certains firmwares mettent le média en pause à l'instant du lock).
        if (IS_ANDROID) {
          const player = deps.getPlayer();
          if (player?.paused && player.src) {
            player.play().catch(() => scheduleResume(cfg.resumeInitialMs));
          }
          // Filet multi-délais : le cut arrive souvent 1–3 s après le lock.
          scheduleDeferredResume(400);
          scheduleDeferredResume(1200);
          scheduleDeferredResume(2800);
        }
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

    function setupLifecycle() {
      if (!IS_MOBILE) return;

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') onBackgroundEnter();
        else onBackgroundExit();
      });

      // Android : blur/pagehide arrivent parfois avant visibilitychange au lock.
      window.addEventListener('pagehide', () => {
        if (!deps.isUserPaused() && playbackIntended) {
          onBackgroundEnter();
        }
      });

      window.addEventListener('pageshow', (e) => {
        if (e.persisted) tryResumePlayback();
      });

      window.addEventListener('blur', () => {
        if (IS_ANDROID && document.visibilityState === 'hidden') onBackgroundEnter();
      });

      document.addEventListener('freeze', () => {
        if (!deps.isUserPaused() && playbackIntended) {
          deps.syncMediaSession?.();
          // Tenter une dernière reprise avant gel (Page Lifecycle).
          tryResumePlayback();
        }
      });

      document.addEventListener('resume', () => {
        clearWatch();
        tryResumePlayback();
      });

      // Certains WebView Android envoient focus/pageshow sans unfreeze propre.
      window.addEventListener('focus', () => {
        if (playbackIntended && !deps.isUserPaused()) tryResumePlayback();
      });
    }

    function attachToPlayer(el) {
      if (!IS_MOBILE || !el || el.__radarMobilePlayback) return;
      el.__radarMobilePlayback = true;

      attachStreamHeartbeat(el);

      const onBgSignal = () => {
        if (!deps.isUserPaused() && deps.getStation() && playbackIntended) {
          // Même en avant-plan : certains OEM mettent en pause au lock sans
          // visibilitychange immédiat — on reprend si la lecture est voulue.
          if (isBackground() || IS_ANDROID) {
            scheduleResume(cfg.resumeInitialMs);
          }
        }
      };

      el.addEventListener('pause', () => {
        if (playbackIntended && !deps.isUserPaused() && !deps.isCasting?.()) {
          // Reprise immédiate (sans attendre le timer) — critique Android lock.
          tryResumePlayback();
          onBgSignal();
        }
      });
      el.addEventListener('suspend', () => onBgSignal());
      el.addEventListener('emptied', () => onBgSignal());
      el.addEventListener('stalled', () => onStall());
      el.addEventListener('waiting', () => onStall());
      el.addEventListener('playing', () => {
        lastStreamProgressAt = Date.now();
        lastStreamCurrentTime = el.currentTime || 0;
      });
    }

    function onStall() {
      if (!playbackIntended || deps.isUserPaused()) return;
      // En premier plan hors résilience, laisser le navigateur tamponner.
      if (!isBackground() && !isStationResilient()) return;
      if (stallTimer) return;
      const delay = isBackground() ? cfg.stallDelayBgMs : cfg.stallDelayFgMs;
      stallTimer = setTimeout(() => {
        stallTimer = null;
        const player = deps.getPlayer();
        if (!player || !playbackIntended || deps.isUserPaused()) return;
        if (!player.paused && player.readyState >= 3) return;
        if (canReconnectNow()) deps.performReconnect?.();
        else tryResumePlayback();
      }, delay);
    }

    function onPlaying() {
      playbackIntended = true;
      reconnectTries = 0;
      resumeAttempt = 0;
      pausedRecoveryTries = 0;
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
      lastStreamProgressAt = Date.now();
      startKeepalive();
    }

    function onPlayStop() {
      playbackIntended = false;
      clearWatch();
      clearResumeTimer();
      clearStallTimer();
      reconnectTries = 0;
      resumeAttempt = 0;
      pausedRecoveryTries = 0;
      lastStreamProgressAt = 0;
      lastStreamCurrentTime = 0;
      stopKeepalive();
    }

    function onUserPause() {
      onPlayStop();
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

      deps.setSuppressErrors?.(true);
      try {
        player.pause();
      } catch {}
      try { player.removeAttribute('src'); } catch {}
      try { player.load(); } catch {}
      deps.setSuppressErrors?.(false);

      // Cache-bust léger : certains reverse-proxy Android gardent un socket mort.
      const sep = url.includes('?') ? '&' : '?';
      const bustUrl = IS_ANDROID ? `${url}${sep}_radar=${Date.now()}` : url;
      player.src = bustUrl;
      player.load();
      const playAttempt = player.play();
      if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(() => {
          // Second essai sans cache-bust.
          player.src = url;
          player.play().catch(() => {});
        });
      }
      startKeepalive();
      deps.syncMediaSession?.();
      return true;
    }

    function resetReconnectTries() {
      reconnectTries = 0;
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

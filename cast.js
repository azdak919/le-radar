/**
 * Le Radar — diffusion distante (AirPlay WebKit + Chromecast).
 */
(function () {
  'use strict';

  let deps = null;
  let castBtns = [];
  let airPlayAvailable = false;
  let chromecastAvailable = false;
  let chromecastSessionActive = false;
  let castFrameworkReady = false;
  let localWasPlaying = false;

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isFirefox = /Firefox/i.test(navigator.userAgent);
  if (isFirefox) document.documentElement.classList.add('is-firefox');

  function guessContentType(url) {
    if (/\.m3u8(\?|$)/i.test(url)) return 'application/vnd.apple.mpegurl';
    if (/\.aac(\?|$)/i.test(url)) return 'audio/aac';
    if (/\.ogg(\?|$)/i.test(url)) return 'audio/ogg';
    return 'audio/mpeg';
  }

  function stationMetadata(radio) {
    const extra = deps.getNowAirMeta?.(radio) || {};
    const built = deps.buildMediaSessionMeta?.(radio, extra);
    if (built) return { title: built.title, artist: built.artist };
    return {
      title: radio.fullName || radio.name,
      artist: deps.formatInstitution?.(radio.institution) || radio.institution || 'Le Radar',
    };
  }

  function isAvailable() {
    return airPlayAvailable || chromecastAvailable;
  }

  function isCasting() {
    const player = deps?.getPlayer?.();
    return chromecastSessionActive || !!player?.webkitCurrentPlaybackTargetIsWireless;
  }

  function notifyCastStateChange() {
    deps?.onCastStateChange?.();
  }

  function updateButton() {
    if (!castBtns.length) return;
    const station = deps?.getStation?.();
    const canUse = !!(station && deps.getStreamUrl?.(station) && !deps.isExternal?.(station));
    const available = isAvailable();
    const showOnFirefox = isFirefox && !available;
    const show = available || showOnFirefox;
    const unavailable = showOnFirefox;
    const player = deps.getPlayer?.();
    const casting = isCasting();
    const activeTitle = casting
      ? 'Arrêter la diffusion externe'
      : 'Diffuser sur un appareil (AirPlay ou Chromecast)';
    const inactiveTitle = 'Diffusion non disponible dans Firefox';
    castBtns.forEach((btn) => {
      btn.classList.toggle('hidden', !show);
      btn.hidden = !show;
      btn.classList.toggle('is-unavailable', unavailable);
      btn.disabled = !canUse || unavailable;
      btn.setAttribute('aria-disabled', String(!canUse || unavailable));
      btn.classList.toggle('is-casting', casting && !unavailable);
      btn.setAttribute('aria-pressed', casting && !unavailable ? 'true' : 'false');
      const title = unavailable ? inactiveTitle : activeTitle;
      const ariaLabel = unavailable ? inactiveTitle : (casting ? 'Arrêter la diffusion externe' : 'Diffuser sur un appareil');
      btn.title = title;
      btn.setAttribute('aria-label', ariaLabel);
    });
  }

  function setupAirPlay(player) {
    player.setAttribute('x-webkit-airplay', 'allow');
    player.addEventListener('webkitplaybacktargetavailabilitychanged', (e) => {
      airPlayAvailable = e.availability === 'available';
      updateButton();
    });
    player.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', () => {
      updateButton();
      notifyCastStateChange();
    });
    if (typeof player.webkitSetPresentationMode === 'function') {
      player.addEventListener('webkitpresentationmodechanged', () => updateButton());
    }
    if (player.webkitPlaybackTargetAvailability === 'available') {
      airPlayAvailable = true;
    }
  }

  function loadCastMedia() {
    const station = deps.getStation?.();
    const url = station && deps.getStreamUrl?.(station);
    if (!url || !castFrameworkReady || !window.cast?.framework) return;

    const ctx = cast.framework.CastContext.getInstance();
    const session = ctx.getCurrentSession();
    if (!session) return;

    const { title, artist } = stationMetadata(station);
    const mediaInfo = new chrome.cast.media.MediaInfo(url, guessContentType(url));
    mediaInfo.streamType = chrome.cast.media.StreamType.LIVE;
    mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
    mediaInfo.metadata.title = title;
    mediaInfo.metadata.artist = artist;
    mediaInfo.metadata.images = [
      new chrome.cast.Image(deps.assetUrl('assets/icon-512.png')),
    ];

    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    session.loadMedia(request).then(
      () => {
        chromecastSessionActive = true;
        updateButton();
        notifyCastStateChange();
      },
      (err) => {
        console.warn('Cast loadMedia failed', err);
        deps.showToast?.('Impossible de diffuser ce flux sur cet appareil.');
      },
    );
  }

  function initCastFramework() {
    if (castFrameworkReady || !window.cast?.framework) return;
    try {
      const ctx = cast.framework.CastContext.getInstance();
      ctx.setOptions({
        receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      });
      ctx.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, () => {
        chromecastAvailable = ctx.getCastState() !== cast.framework.CastState.NO_DEVICES_AVAILABLE;
        updateButton();
      });
      ctx.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (ev) => {
        const st = ev.sessionState;
        if (st === cast.framework.SessionState.SESSION_STARTED) {
          chromecastSessionActive = true;
          localWasPlaying = !!deps.isPlaying?.();
          deps.pauseLocal?.();
          loadCastMedia();
          notifyCastStateChange();
        } else if (st === cast.framework.SessionState.SESSION_ENDED) {
          chromecastSessionActive = false;
          updateButton();
          notifyCastStateChange();
          if (localWasPlaying && !deps.isUserPaused?.()) {
            const s = deps.getStation?.();
            if (s) deps.playStation?.(s);
          }
          localWasPlaying = false;
        }
      });
      castFrameworkReady = true;
      chromecastAvailable = ctx.getCastState() !== cast.framework.CastState.NO_DEVICES_AVAILABLE;
      updateButton();
    } catch (e) {
      console.warn('Cast framework init failed', e);
    }
  }

  window.__onGCastApiAvailable = function (isAvailable) {
    if (isAvailable) initCastFramework();
  };

  function loadCastSdk() {
    if (document.querySelector('script[data-radar-cast]')) return;
    const s = document.createElement('script');
    s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    s.async = true;
    s.dataset.radarCast = '1';
    document.head.appendChild(s);
  }

  function endChromecastSession() {
    if (!castFrameworkReady || !chromecastSessionActive) return;
    try {
      cast.framework.CastContext.getInstance().endCurrentSession(true);
    } catch {}
    chromecastSessionActive = false;
    updateButton();
    notifyCastStateChange();
  }

  async function showPicker() {
    const station = deps.getStation?.();
    if (!station || deps.isExternal?.(station) || !deps.getStreamUrl?.(station)) return;

    if (chromecastSessionActive) {
      endChromecastSession();
      return;
    }

    const player = deps.getPlayer?.();
    if (!deps.isPlaying?.()) {
      await deps.playStation?.(station);
    }

    const preferAirPlay = airPlayAvailable && player?.webkitShowPlaybackTargetPicker
      && (isSafari || !chromecastAvailable || !castFrameworkReady);
    if (preferAirPlay) {
      player.webkitShowPlaybackTargetPicker();
      return;
    }

    if (chromecastAvailable && castFrameworkReady) {
      try {
        await cast.framework.CastContext.getInstance().requestSession();
      } catch (e) {
        const cancelled = e === 'cancel' || e?.code === 'cancel';
        if (!cancelled) deps.showToast?.('Diffusion annulée ou indisponible.');
        if (airPlayAvailable && player?.webkitShowPlaybackTargetPicker) {
          player.webkitShowPlaybackTargetPicker();
        }
      }
      return;
    }

    if (airPlayAvailable && player?.webkitShowPlaybackTargetPicker) {
      player.webkitShowPlaybackTargetPicker();
    }
  }

  function init(options) {
    deps = options;
    castBtns = ['tuner-cast', 'tuner-cast-mob', 'tuner-cast-pop']
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    const player = deps.getPlayer?.();
    if (!castBtns.length || !player) return;

    setupAirPlay(player);
    loadCastSdk();
    castBtns.forEach((btn) => {
      btn.addEventListener('click', () => { showPicker(); });
    });
    updateButton();
  }

  window.RadarCast = {
    init,
    onStationChange() {
      if (chromecastSessionActive) loadCastMedia();
      updateButton();
    },
    updateButton,
    isAvailable,
    endSession: endChromecastSession,
    pauseRemote() {
      endChromecastSession();
      const player = deps?.getPlayer?.();
      if (player && !player.paused) {
        try { player.pause(); } catch {}
      }
    },
    isCasting,
    isChromecasting: () => chromecastSessionActive,
  };
})();
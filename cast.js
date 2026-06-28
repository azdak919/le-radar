/**
 * Le Radar — diffusion distante (AirPlay WebKit + Chromecast).
 */
(function () {
  'use strict';

  let deps = null;
  let castBtn = null;
  let airPlayAvailable = false;
  let chromecastAvailable = false;
  let chromecastSessionActive = false;
  let castFrameworkReady = false;
  let localWasPlaying = false;

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  function guessContentType(url) {
    if (/\.m3u8(\?|$)/i.test(url)) return 'application/vnd.apple.mpegurl';
    if (/\.aac(\?|$)/i.test(url)) return 'audio/aac';
    if (/\.ogg(\?|$)/i.test(url)) return 'audio/ogg';
    return 'audio/mpeg';
  }

  function stationMetadata(radio) {
    const extra = deps.getNowAirMeta?.(radio) || {};
    return {
      title: extra.title || radio.fullName || radio.name,
      artist: extra.sub || deps.formatInstitution?.(radio.institution) || radio.institution || 'Le Radar',
    };
  }

  function isAvailable() {
    return airPlayAvailable || chromecastAvailable;
  }

  function updateButton() {
    if (!castBtn) return;
    const station = deps?.getStation?.();
    const canUse = !!(station && deps.getStreamUrl?.(station) && !deps.isExternal?.(station));
    const show = isAvailable();
    castBtn.classList.toggle('hidden', !show);
    castBtn.hidden = !show;
    castBtn.disabled = !canUse;
    castBtn.setAttribute('aria-disabled', String(!canUse));
    const player = deps.getPlayer?.();
    const casting = chromecastSessionActive || !!player?.webkitCurrentPlaybackTargetIsWireless;
    castBtn.classList.toggle('is-casting', casting);
    castBtn.setAttribute('aria-pressed', casting ? 'true' : 'false');
    castBtn.title = casting
      ? 'Arrêter la diffusion externe'
      : 'Diffuser sur un appareil (AirPlay ou Chromecast)';
    castBtn.setAttribute(
      'aria-label',
      casting ? 'Arrêter la diffusion externe' : 'Diffuser sur un appareil',
    );
  }

  function setupAirPlay(player) {
    player.setAttribute('x-webkit-airplay', 'allow');
    player.addEventListener('webkitplaybacktargetavailabilitychanged', (e) => {
      airPlayAvailable = e.availability === 'available';
      updateButton();
    });
    player.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', () => {
      updateButton();
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
        } else if (st === cast.framework.SessionState.SESSION_ENDED) {
          chromecastSessionActive = false;
          updateButton();
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
    castBtn = document.getElementById('tuner-cast');
    const player = deps.getPlayer?.();
    if (!castBtn || !player) return;

    setupAirPlay(player);
    loadCastSdk();
    castBtn.addEventListener('click', () => { showPicker(); });
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
    },
    isChromecasting: () => chromecastSessionActive,
  };
})();
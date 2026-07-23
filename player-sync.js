/**
 * LE RADAR — Phase 1 player sync (multi-onglets / multi-pages).
 *
 * Same-origin only (accueil, embed Solitaire, embed Pomo).
 * One leader owns the real <audio>; other contexts mirror station/UI and
 * yield when a new leader claims playback.
 *
 * Transport: BroadcastChannel + localStorage (storage event fallback).
 */
(function (global) {
  'use strict';

  const CHANNEL_NAME = 'le-radar-player';
  const STORAGE_KEY = 'req-player-session-v1';
  const TAB_ID = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

  /** @type {BroadcastChannel|null} */
  let channel = null;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    channel = null;
  }

  /** @type {Record<string, Function>} */
  let handlers = {};
  let applyingRemote = false;
  let started = false;

  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || typeof s !== 'object') return null;
      return {
        stationId: s.stationId || null,
        playing: !!s.playing,
        volume: Number.isFinite(s.volume) ? s.volume : null,
        leaderId: s.leaderId || null,
        updatedAt: s.updatedAt || 0,
      };
    } catch {
      return null;
    }
  }

  function writeState(partial) {
    const prev = readState() || {
      stationId: null,
      playing: false,
      volume: null,
      leaderId: null,
      updatedAt: 0,
    };
    const next = {
      stationId: partial.stationId !== undefined ? partial.stationId : prev.stationId,
      playing: partial.playing !== undefined ? !!partial.playing : prev.playing,
      volume: partial.volume !== undefined ? partial.volume : prev.volume,
      leaderId: partial.leaderId !== undefined ? partial.leaderId : prev.leaderId,
      updatedAt: Date.now(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* quota / private mode */
    }
    post({ type: 'state', state: next });
    return next;
  }

  function post(msg) {
    if (!channel) return;
    try {
      channel.postMessage({ ...msg, from: TAB_ID });
    } catch {
      /* closed channel */
    }
  }

  function isLeader(state = readState()) {
    return !!(state && state.leaderId === TAB_ID);
  }

  function isApplyingRemote() {
    return applyingRemote;
  }

  function getTabId() {
    return TAB_ID;
  }

  /**
   * Claim leadership and start (or keep) playing.
   * Other tabs receive yield + state.
   */
  function claimPlay(stationId, volume) {
    post({ type: 'yield', stationId });
    return writeState({
      stationId,
      playing: true,
      volume: volume != null ? volume : readState()?.volume,
      leaderId: TAB_ID,
    });
  }

  /** Local pause published as global pause (only meaningful from leader / explicit pause). */
  function publishPause(stationId, volume) {
    return writeState({
      stationId: stationId != null ? stationId : readState()?.stationId,
      playing: false,
      volume: volume != null ? volume : readState()?.volume,
      leaderId: TAB_ID,
    });
  }

  /** Volume-only update (any tab). */
  function publishVolume(volume) {
    return writeState({ volume });
  }

  /** Station selected while not necessarily playing. */
  function publishStation(stationId) {
    const s = readState();
    return writeState({
      stationId,
      // keep playing flag; leader stays if we were leader
      leaderId: s?.playing ? (isLeader(s) ? TAB_ID : s.leaderId) : (isLeader(s) ? TAB_ID : s?.leaderId),
    });
  }

  function applyRemote(state, meta = {}) {
    if (!state || applyingRemote) return;
    // Ignore our own echoes (BroadcastChannel can deliver to self in some engines — we tag from)
    if (meta.from && meta.from === TAB_ID) return;
    applyingRemote = true;
    try {
      handlers.onRemoteState?.(state, meta);
    } finally {
      applyingRemote = false;
    }
  }

  function onMessage(event) {
    const msg = event?.data;
    if (!msg || msg.from === TAB_ID) return;

    if (msg.type === 'yield') {
      // Another tab is about to own audio — stop local playback immediately.
      handlers.onYield?.(msg);
      return;
    }

    if (msg.type === 'state' && msg.state) {
      applyRemote(msg.state, { from: msg.from, via: 'channel' });
      return;
    }

    if (msg.type === 'hello') {
      // New peer: if we are leader and playing, rebroadcast state.
      const s = readState();
      if (s && isLeader(s) && s.playing) {
        post({ type: 'state', state: s });
      }
    }
  }

  function onStorage(event) {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const state = JSON.parse(event.newValue);
      applyRemote(state, { via: 'storage' });
    } catch {
      /* ignore */
    }
  }

  /**
   * @param {{
   *   onRemoteState?: (state: object, meta?: object) => void,
   *   onYield?: (msg?: object) => void,
   * }} h
   */
  function init(h) {
    if (started) return;
    started = true;
    handlers = h || {};
    channel?.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    post({ type: 'hello' });
  }

  function destroy() {
    channel?.removeEventListener('message', onMessage);
    window.removeEventListener('storage', onStorage);
    try { channel?.close(); } catch { /* */ }
    channel = null;
    started = false;
  }

  global.RadarPlayerSync = {
    STORAGE_KEY,
    init,
    destroy,
    readState,
    writeState,
    claimPlay,
    publishPause,
    publishVolume,
    publishStation,
    isLeader,
    isApplyingRemote,
    getTabId,
  };
})(window);

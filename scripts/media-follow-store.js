/**
 * Suivi des médias dans LE-RADAR — état local, sans compte.
 *
 * Persistance : localStorage `radar-media-follows-v1`.
 * Remplaçable plus tard par un compte + backend : toute l’UI passe par
 * cette API, jamais par localStorage directement.
 *
 * Identifiants = slugify(name) des journaux (même fonction que les fiches
 * `/journaux/<slug>/`). Voir docs/media-channels.md.
 */
'use strict';

(function initMediaFollowStore(global) {
const STORAGE_KEY = 'radar-media-follows-v1';
const LEGACY_KEYS = ['radar-followed-media-v1'];
const VERSION = 1;

let storageOverride = null;
let memoryState = { v: VERSION, ids: [] };
let cache = null;
const listeners = new Set();

function slugify(value = '') {
  if (global.MediaChannels && typeof global.MediaChannels.slugify === 'function') {
    return global.MediaChannels.slugify(value);
  }
  return String(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function mediaIdFromName(name = '') {
  return slugify(name);
}

function emptyState() {
  return { v: VERSION, ids: [] };
}

function getStorage() {
  if (storageOverride) return storageOverride;
  try {
    if (typeof window === 'undefined' || !window) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function setStorageForTests(storage) {
  storageOverride = storage || null;
  cache = null;
  memoryState = emptyState();
}

function normalizeId(id) {
  const slug = slugify(id);
  return slug || '';
}

function uniqueIds(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const id = normalizeId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function parseState(raw) {
  if (!raw) return emptyState();
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return emptyState();
    }
  }
  if (Array.isArray(data)) return { v: VERSION, ids: uniqueIds(data) };
  if (!data || typeof data !== 'object') return emptyState();
  const fromJournals = Array.isArray(data.journals) ? data.journals : [];
  const fromIds = Array.isArray(data.ids) ? data.ids : [];
  return { v: VERSION, ids: uniqueIds([...fromIds, ...fromJournals]) };
}

function readRaw() {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const current = storage.getItem(STORAGE_KEY);
    if (current) return current;
    for (const key of LEGACY_KEYS) {
      const legacy = storage.getItem(key);
      if (legacy) return legacy;
    }
  } catch {
    return null;
  }
  return null;
}

function load() {
  if (cache) return cache;
  const parsed = parseState(readRaw());
  cache = parsed;
  memoryState = parsed;
  return cache;
}

function persist(state) {
  cache = { v: VERSION, ids: uniqueIds(state.ids) };
  memoryState = cache;
  const storage = getStorage();
  if (!storage) return cache;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(cache));
    for (const key of LEGACY_KEYS) {
      try { storage.removeItem(key); } catch { /* ignore */ }
    }
  } catch {
    /* quota / mode privé : l’état mémoire reste */
  }
  return cache;
}

function emit() {
  const ids = list();
  for (const listener of listeners) {
    try { listener(ids); } catch { /* listener isolé */ }
  }
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('radar-media-follow-change', { detail: { ids } }));
    }
  } catch { /* hors navigateur */ }
}

function list() {
  return load().ids.slice();
}

function isFollowed(idOrName) {
  const id = normalizeId(idOrName);
  if (!id) return false;
  return load().ids.includes(id);
}

function follow(idOrName) {
  const id = normalizeId(idOrName);
  if (!id) return false;
  const state = load();
  if (state.ids.includes(id)) return true;
  persist({ ids: [...state.ids, id] });
  emit();
  return true;
}

function unfollow(idOrName) {
  const id = normalizeId(idOrName);
  if (!id) return false;
  const state = load();
  if (!state.ids.includes(id)) return false;
  persist({ ids: state.ids.filter((item) => item !== id) });
  emit();
  return true;
}

function toggle(idOrName) {
  if (isFollowed(idOrName)) {
    unfollow(idOrName);
    return false;
  }
  follow(idOrName);
  return true;
}

function subscribe(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function filterItemsByFollowed(items, getName) {
  const ids = new Set(list());
  if (!ids.size) return [];
  const nameOf = typeof getName === 'function' ? getName : (item) => item && item.source;
  return (items || []).filter((item) => ids.has(mediaIdFromName(nameOf(item) || '')));
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event) => {
    if (event.key && event.key !== STORAGE_KEY && !LEGACY_KEYS.includes(event.key)) return;
    cache = null;
    emit();
  });
}

const api = {
  STORAGE_KEY,
  VERSION,
  mediaIdFromName,
  slugify,
  list,
  isFollowed,
  follow,
  unfollow,
  toggle,
  subscribe,
  filterItemsByFollowed,
  setStorageForTests,
};

if (typeof module === 'object' && module.exports) {
  module.exports = api;
}
if (global) global.MediaFollowStore = api;
}(typeof globalThis === 'object' ? globalThis : this));

/**
 * Horaires radio — collation multi-sources + résolution de l'émission en cours.
 *
 * Partagé par scripts/fetch-radio-schedules.js (le bot). La logique de
 * résolution (resolveCurrentSlot) est volontairement gardée simple et pure
 * pour pouvoir être dupliquée côté navigateur dans app.js.
 *
 * Conventions :
 *   - Jours : 0 = dimanche, 1 = lundi … 6 = samedi (comme Date.getDay()).
 *   - Heures : chaînes "HH:MM" sur 24 h, en heure locale America/Toronto.
 *   - Une plage dont la fin est <= au début traverse minuit (ex. 23:00→01:00).
 */

const { decodeHtmlEntities } = require('./html-entities-lib');

const WEEK_MIN = 7 * 24 * 60;
const DEFAULT_TZ = 'America/Toronto';

const AIRTIME_DAYS = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

// ─── Temps ───────────────────────────────────────────────────────────────────
function timeToMinutes(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

function minutesToTime(total) {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Extrait "HH:MM" d'un timestamp Airtime ("2024-01-01 09:00:00") ou "09:00:00". */
function hhmm(ts) {
  if (!ts) return null;
  const m = /(\d{1,2}):(\d{2})(?::\d{2})?/.exec(String(ts));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// ─── Normalisation des plages ──────────────────────────────────────────────────
function normalizeSlot(slot) {
  if (!slot || typeof slot !== 'object') return null;
  const day = Number(slot.day);
  if (!Number.isInteger(day) || day < 0 || day > 6) return null;

  const start = timeToMinutes(slot.start);
  const end = timeToMinutes(slot.end);
  if (start == null || end == null) return null;

  const title = decodeHtmlEntities(String(slot.title || '')).replace(/\s+/g, ' ').trim();
  if (!title) return null;

  const out = { day, start: minutesToTime(start), end: minutesToTime(end), title };
  const host = decodeHtmlEntities(String(slot.host || '')).replace(/\s+/g, ' ').trim();
  if (host) out.host = host;
  const url = String(slot.url || '').trim();
  if (url) out.url = url;
  return out;
}

function slotKey(s) {
  return `${s.day}|${s.start}|${s.end}|${s.title.toLowerCase()}`;
}

/** Fusionne plusieurs grilles, dédoublonne et trie (jour, début, fin). */
function mergeGrids(...grids) {
  const seen = new Map();
  for (const grid of grids) {
    if (!Array.isArray(grid)) continue;
    for (const raw of grid) {
      const slot = normalizeSlot(raw);
      if (!slot) continue;
      const key = slotKey(slot);
      if (!seen.has(key)) seen.set(key, slot);
    }
  }
  return [...seen.values()].sort(
    (a, b) =>
      a.day - b.day ||
      timeToMinutes(a.start) - timeToMinutes(b.start) ||
      timeToMinutes(a.end) - timeToMinutes(b.end),
  );
}

// ─── Résolution de l'émission en cours ─────────────────────────────────────────
/** Jour (0-6) + minutes depuis minuit dans un fuseau donné. */
function zonedNow(date = new Date(), timeZone = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map = {};
  for (const p of parts) map[p.type] = p.value;

  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = parseInt(map.hour, 10);
  if (hour === 24 || Number.isNaN(hour)) hour = 0;
  const minute = parseInt(map.minute, 10) || 0;
  return { day: wd[map.weekday] ?? 0, minutes: hour * 60 + minute };
}

/**
 * Trouve la plage qui couvre l'instant `date` dans une grille hebdomadaire.
 * Gère les émissions de nuit (fin <= début) et le passage samedi → dimanche.
 * Retourne la plage normalisée, ou null.
 */
function resolveCurrentSlot(grid, date = new Date(), timeZone = DEFAULT_TZ) {
  if (!Array.isArray(grid) || !grid.length) return null;
  const { day, minutes } = zonedNow(date, timeZone);
  const nowAbs = day * 1440 + minutes;

  const slots = grid
    .map(normalizeSlot)
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.day - b.day || timeToMinutes(a.start) - timeToMinutes(b.start),
    );

  for (const slot of slots) {
    const start = timeToMinutes(slot.start);
    const end = timeToMinutes(slot.end);
    const startAbs = slot.day * 1440 + start;
    const endAbs = slot.day * 1440 + (end <= start ? end + 1440 : end);
    // On teste l'instant et son équivalent « semaine suivante » pour couvrir
    // une plage qui démarre samedi soir et finit dimanche matin.
    if (
      (nowAbs >= startAbs && nowAbs < endAbs) ||
      (nowAbs + WEEK_MIN >= startAbs && nowAbs + WEEK_MIN < endAbs)
    ) {
      return slot;
    }
  }
  return null;
}

// ─── Adaptateurs de sources ─────────────────────────────────────────────────────
async function fetchJson(url, { fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch indisponible');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'RADAR-ScheduleBot/1.0', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Convertit la réponse Airtime/LibreTime `/api/week-info` en grille. */
function airtimeWeekToGrid(week) {
  const grid = [];
  if (!week || typeof week !== 'object') return grid;
  for (const [name, day] of Object.entries(AIRTIME_DAYS)) {
    const list = week[name];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const start = hhmm(item.start_timestamp || item.starts || item.start);
      const end = hhmm(item.end_timestamp || item.ends || item.end);
      const title = String(item.name || item.title || '').trim();
      if (!start || !end || !title) continue;
      grid.push({ day, start, end, title, url: item.url || item.show_url || undefined });
    }
  }
  return grid;
}

async function fetchAirtimeGrid(base, deps = {}) {
  const url = `${String(base).replace(/\/+$/, '')}/api/week-info`;
  const json = await fetchJson(url, deps);
  return airtimeWeekToGrid(json);
}

/**
 * Collige la grille d'un poste à partir de ses sources dynamiques + de sa
 * grille manuelle (seed). Les sources injoignables sont ignorées sans erreur.
 * Retourne { grid, sources: [étiquettes utilisées] }.
 */
async function collateStationGrid(cfg = {}, deps = {}) {
  const sources = Array.isArray(cfg.sources) ? cfg.sources : [];
  const collected = [];
  const used = [];

  for (const src of sources) {
    if (!src || !src.type) continue;
    try {
      let grid = null;
      if (src.type === 'airtime' && src.base) {
        grid = await fetchAirtimeGrid(src.base, deps);
      }
      // Extensible : 'spinitron', 'jsonld', 'html'… (ajouter ici).
      if (grid && grid.length) {
        collected.push(grid);
        used.push(src.type + (src.base ? `:${src.base}` : ''));
      }
    } catch (err) {
      if (typeof deps.onError === 'function') deps.onError(src, err);
    }
  }

  if (Array.isArray(cfg.grid) && cfg.grid.length) {
    collected.push(cfg.grid);
    used.push('manual');
  }

  return { grid: mergeGrids(...collected), sources: used };
}

module.exports = {
  WEEK_MIN,
  DEFAULT_TZ,
  timeToMinutes,
  minutesToTime,
  hhmm,
  normalizeSlot,
  mergeGrids,
  zonedNow,
  resolveCurrentSlot,
  fetchJson,
  airtimeWeekToGrid,
  fetchAirtimeGrid,
  collateStationGrid,
};

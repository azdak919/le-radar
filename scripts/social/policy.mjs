// Politique sociale du Radar (data/social/policy.json) : logique pure, testée dans tests/social-policy.mjs.
// Volume réduit pendant 14 jours (date de fin dans la config), budget de mentions X, jour civil Toronto.
import fs from 'node:fs';
import { weightAt, TZ } from './schedule.mjs';

export const POLICY = JSON.parse(fs.readFileSync(new URL('../../data/social/policy.json', import.meta.url), 'utf8'));
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
/** Jour civil America/Toronto (AAAA-MM-JJ) d'un instant. */
export const torontoDay = t => fmt.format(t);
export const torontoHour = t => +new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(t);
/** Jour de la semaine Toronto : 0 = dimanche … 6 = samedi. */
export const torontoWeekday = t => new Date(torontoDay(t) + 'T12:00:00Z').getUTCDay();

/** Volume réduit en vigueur à l'instant `now` ? (active, entre `from` et `until` inclus, jours civils Toronto). */
export function volumeActive(now = Date.now(), policy = POLICY) {
  const v = policy?.volume; if (!v?.active) return false;
  const d = torontoDay(now); return d >= v.from && d <= v.until;
}
/** Réglage du volume réduit pour un réseau, ou null (inactif ou réseau non couvert). */
export function volumeFor(network, now = Date.now(), policy = POLICY) {
  if (!volumeActive(now, policy)) return null;
  const v = policy.volume, perDay = v.perDay?.[network]; if (!perDay) return null;
  return { perDay, perHour: v.perHour?.[network] || perDay, minPerDay: Math.min(v.minPerDay || 0, perDay), perSource: v.perSourcePerDay || 1, fillAfterHour: v.fillAfterHour ?? 17, until: v.until };
}

/** Pas de 15 minutes du jour civil Toronto contenant `now`. */
export function dayStepsOf(now) {
  const k = torontoDay(now), out = [];
  for (let t = Math.floor(now / 9e5) * 9e5 - 26 * 3600e3; t <= now + 26 * 3600e3; t += 9e5) if (torontoDay(t) === k) out.push(t);
  return out;
}
/**
 * Nombre de publications déjà permises à l'instant `now` : `perDay` réparti selon les poids horaires du réseau
 * (posting-windows.json), jamais plus que `perDay`, 0 aux heures calmes avant la première fenêtre.
 */
export function allowedByNow(network, perDay, now, windows) {
  const steps = dayStepsOf(now), w = t => weightAt(network, t, windows);
  const total = steps.reduce((s, t) => s + w(t), 0); if (!(total > 0)) return 0;
  const upTo = steps.filter(t => t <= now).reduce((s, t) => s + w(t), 0);
  return Math.max(0, Math.min(perDay, Math.ceil(perDay * upTo / total - 1e-9)));
}

/** Jour civil Toronto des publications réelles déjà faites (state.sent : entrées avec uri ou url). */
export function postedToday(sent = {}, now = Date.now()) {
  const k = torontoDay(now);
  return Object.values(sent).filter(s => s && s.at && !s.skipped && !s.dedup && (s.uri || s.url) && torontoDay(Date.parse(s.at)) === k);
}

// ── Budget de mentions X ─────────────────────────────────────────────────────
const lc = s => String(s || '').toLowerCase();
/**
 * Registre des mentions déjà prévues : Map jour → Set de handles (minuscules). Sources : entrées d'état avec `mention`
 * (+ `dueAt` ou `at`) et textes déjà en file Buffer qui contiennent un handle connu.
 */
export function mentionLedger({ sent = {}, queued = [], accounts = [] } = {}) {
  const m = new Map(), add = (day, h) => { if (!day || !h) return; if (!m.has(day)) m.set(day, new Set()); m.get(day).add(lc(h)); };
  for (const s of Object.values(sent)) if (s?.mention) for (const h of [].concat(s.mention)) add(torontoDay(Date.parse(s.dueAt || s.at)), h);
  for (const p of queued) for (const a of accounts) if (p.text && lc(p.text).includes(lc(a.handle)) && new RegExp('(^|[^\\w@])' + a.handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!\\w)', 'i').test(p.text)) add(torontoDay(Date.parse(p.dueAt)), a.handle);
  return m;
}
/** Comptes à passer au formateur : sans l'entrée de la source (et de l'auteur) si son @ a déjà servi ce jour-là. */
export function accountsForPost(it, accounts, ledger, day, max = POLICY.mentions?.x?.maxPerSourcePerDay ?? 1) {
  const used = ledger.get(day) || new Set();
  const own = accounts.filter(a => a.cle_flux && (a.cle_flux === it.source || a.cle_flux === it.author));
  const blocked = own.filter(a => used.has(lc(a.handle)) && max <= 1);
  return accounts.filter(a => !blocked.includes(a));
}
/** Handles d'`accounts` présents dans un texte (pour inscrire la mention au registre). */
export const mentionedIn = (text, accounts) => accounts.filter(a => a.cle_flux && new RegExp('(^|[^\\w@])' + a.handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!\\w)', 'i').test(text || '')).map(a => a.handle);
export const noteMention = (ledger, day, handle) => { if (!ledger.has(day)) ledger.set(day, new Set()); ledger.get(day).add(lc(handle)); };

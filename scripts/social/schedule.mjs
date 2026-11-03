// Ordonnanceur pondéré par l'heure (America/Toronto) : fenêtres de data/social/posting-windows.json,
// rodage des nouveaux comptes, anti-rafale et espacement aléatoire. Logique pure, testée.
import fs from 'node:fs';
const WIN = JSON.parse(fs.readFileSync(new URL('../../data/social/posting-windows.json', import.meta.url), 'utf8'));
export const TZ = 'America/Toronto';

export function localParts(now, tz = TZ) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(x => [x.type, x.value]));
  return { hour: +p.hour + +p.minute / 60, weekend: p.weekday === 'Sat' || p.weekday === 'Sun' };
}
/** Poids 0..1 de l'heure pour un réseau (0 = heures calmes). */
export function weightAt(network, now = Date.now(), windows = WIN) {
  const w = windows[network]; if (!w) return 1;
  const { hour, weekend } = localParts(now);
  const row = (weekend ? w.weekend : w.weekday).find(([a, b]) => hour >= a && hour < b);
  return row ? row[2] : 0;
}
/** Rodage : jours 0-2 ×0,4, jours 3-6 ×0,7, ensuite ×1 (depuis la mise en service du compte). */
export function rampAt(liveSince, now = Date.now()) {
  const d = (now - (Date.parse(liveSince) || now)) / 864e5;
  return d < 3 ? 0.4 : d < 7 ? 0.7 : 1;
}
/** Plafonds effectifs de l'instant : jamais au-dessus des plafonds de base ; 0 en heures calmes. */
export function effectiveLimits(limits, { network, liveSince, now = Date.now(), windows = WIN } = {}) {
  // `ramp: false` (rate-limit.mjs) : pas de rodage — tout frais publié sous 24 h (Tumblr, 3 nov. 2026).
  const w = weightAt(network, now, windows), r = limits.ramp === false ? 1 : rampAt(liveSince, now);
  const perHour = w > 0 ? Math.max(1, Math.round(limits.perHour * w * r)) : 0;
  const perDay = Math.max(1, Math.round(limits.perDay * r));
  const perRun = Math.min(limits.perRun, Math.max(perHour ? 1 : 0, Math.ceil(perHour / 2))); // pas de rafale
  return { ...limits, perHour, perDay, perRun, weight: w, ramp: r };
}
/** Espacement aléatoire entre deux publications d'un même passage (×0,7 à ×2,2 du pas de base). */
export const jitterMs = (gapSec, rnd = Math.random) => Math.round(gapSec * (0.7 + 1.5 * rnd()) * 1000);

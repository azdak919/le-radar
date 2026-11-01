// Module commun aux bots sociaux du Radar : plafonds par réseau (fenêtres glissantes),
// espacement, fraîcheur (jamais de rattrapage) et sélection « comme X » quand le réseau limite.
// Réutilisé par Bluesky, puis Mastodon.
import { quality, PER_SOURCE_MAX } from './lib.mjs';

// mastodon : règles de piaille.fr (robots de liens de presse : 5/h, 50/jour).
// bluesky : plafond anti-pourriel interne, très en deçà de l'API (5 000 points/h, 35 000/jour,
// une création = 3 points) — voir docs.bsky.app/docs/advanced-guides/rate-limits.
// tumblr : API officielle = 250 publications/jour/utilisateur, 1 000 appels/h et 5 000/jour par
// clé (tumblr.com/docs/en/api/v2#rate-limits). Plafond interne 10/h, 150/24 h (≤ 60 % du quota
// quotidien, ≤ 4 appels par publication) ; les règles (tumblr.com/policy/en/community) proscrivent
// le pourriel et les étiquettes trompeuses.
export const NETWORKS = {
  tumblr: { perHour: 10, perDay: 150, perRun: 3, gapSec: 90 },
  mastodon: { perHour: 5, perDay: 50, perRun: 1, gapSec: 0 },
  bluesky: { perHour: 10, perDay: 150, perRun: 3, gapSec: 90 },
};
export const MAX_FRESH_H = 24; // jamais d'article plus vieux que 24 h

/** Horodatages (ms) des vraies publications (sautés et doublons exclus). */
export function postedTimes(sent = {}) {
  return Object.values(sent).filter(s => s && s.at && !s.skipped && !s.dedup && (s.uri || s.url)).map(s => Date.parse(s.at)).filter(Number.isFinite);
}

/** Publications restantes dans les fenêtres d'une heure et de 24 h glissantes. */
export function remaining(sent, limits, { now = Date.now() } = {}) {
  const t = postedTimes(sent).filter(x => x <= now);
  const hour = t.filter(x => now - x < 3600e3).length, day = t.filter(x => now - x < 864e5).length;
  const hourLeft = Math.max(0, limits.perHour - hour), dayLeft = Math.max(0, limits.perDay - day);
  return { hour, day, hourLeft, dayLeft, left: Math.min(hourLeft, dayLeft) };
}

/** Articles admissibles : jamais publiés/sautés, ≤ 24 h, publiés après la mise en service. */
export function freshCandidates(items, sent = {}, { liveSince, now = Date.now(), maxH = MAX_FRESH_H } = {}) {
  const since = Math.max(Date.parse(liveSince) || now, now - maxH * 3600e3);
  return items.filter(it => !sent[it.id] && +it.date >= since && +it.date <= now);
}

/** Classement « comme X » : variété (≤ perSource par source sur 24 h, tourniquet), puis qualité, puis récence. */
export function rankLikeX(pool, { recentSources = [], perSource = PER_SOURCE_MAX, accounts = [] } = {}) {
  const count = new Map(); for (const s of recentSources) count.set(s, (count.get(s) || 0) + 1);
  const cmp = (a, b) => quality(b, accounts) - quality(a, accounts) || b.date - a.date;
  const by = new Map(); for (const it of pool) { if (!by.has(it.source)) by.set(it.source, []); by.get(it.source).push(it); }
  for (const q of by.values()) q.sort(cmp);
  const out = [];
  for (let r = 0; r < perSource; r++) {
    const round = [...by.entries()].filter(([s, q]) => q.length && (count.get(s) || 0) < perSource).map(([, q]) => q[0]).sort(cmp);
    if (!round.length) break;
    for (const it of round) { by.get(it.source).shift(); out.push(it); count.set(it.source, (count.get(it.source) || 0) + 1); }
  }
  return out; // les articles hors classement (source déjà à 2) sont exclus
}

/**
 * Plan d'un passage : `now` = publiés maintenant (≤ perRun, ≤ restant), `hold` = gardés pour le
 * passage suivant dans la même heure (frais, pas du rattrapage), `skip` = surplus sauté définitivement.
 */
export function plan(items, sent, { network, liveSince, accounts = [], now = Date.now() } = {}) {
  const limits = NETWORKS[network]; if (!limits) throw new Error(`réseau inconnu : ${network}`);
  const r = remaining(sent, limits, { now });
  const pool = freshCandidates(items, sent, { liveSince, now });
  const recentSources = Object.values(sent).filter(s => s?.source && !s.skipped && now - Date.parse(s.at) < 864e5).map(s => s.source);
  const ranked = rankLikeX(pool, { recentSources, accounts });
  const keep = ranked.slice(0, r.left), go = keep.slice(0, limits.perRun);
  const keepIds = new Set(keep.map(i => i.id));
  return { limits, status: r, now: go, hold: keep.slice(go.length), skip: pool.filter(i => !keepIds.has(i.id)) };
}

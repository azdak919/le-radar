// Module commun aux bots sociaux du Radar : plafonds par réseau (fenêtres glissantes),
// espacement, fraîcheur (jamais de rattrapage) et sélection « comme X » quand le réseau limite.
// Réutilisé par Bluesky, puis Mastodon.
import { quality, PER_SOURCE_MAX, norm } from './lib.mjs';
import { effectiveLimits, weightAt } from './schedule.mjs';

// mastodon : règles de piaille.fr (robots de liens de presse : 5/h, 50/jour).
// bluesky : plafond anti-pourriel interne, très en deçà de l'API (5 000 points/h, 35 000/jour,
// une création = 3 points) — voir docs.bsky.app/docs/advanced-guides/rate-limits.
// tumblr : API officielle = 250 publications/jour/utilisateur, 1 000 appels/h et 5 000/jour par
// clé (tumblr.com/docs/en/api/v2#rate-limits) ; la file native de Tumblr plafonne à 50/jour
// (help.tumblr.com/knowledge-base/queued-posts). Plafond interne 5/h, 50/24 h, comme une file
// humaine ; les règles (tumblr.com/policy/en/community) proscrivent le pourriel et l'automatisation.
// Plafonds de base : l'ordonnanceur (schedule.mjs) les module par heure et pendant le rodage.
export const NETWORKS = {
  // spread : aucune exclusion « variété » ; une même source est étalée (tourniquet), l'excédent attend
  // (hold) au lieu d'être sauté, et le volume suit les poids horaires (pointes) avant l'échéance de 24 h.
  // Volume réel du flux ≈ 40-50/jour.
  tumblr: { perHour: 8, perDay: 120, perRun: 3, gapSec: 120, spread: true }, // < 250/jour (limite officielle)
  mastodon: { perHour: 5, perDay: 50, perRun: 1, gapSec: 60 },
  bluesky: { perHour: 12, perDay: 150, perRun: 4, gapSec: 90, spread: true },
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
  for (let r = 0; r < perSource && r < pool.length; r++) {
    const round = [...by.entries()].filter(([s, q]) => q.length && (count.get(s) || 0) < perSource).map(([, q]) => q[0]).sort(cmp);
    if (!round.length) break;
    for (const it of round) { by.get(it.source).shift(); out.push(it); count.set(it.source, (count.get(it.source) || 0) + 1); }
  }
  return out; // les articles hors classement (source déjà à 2) sont exclus
}

/** Clé de quasi-doublon : titre normalisé (même article repris par deux sources = un seul post). */
export const titleKey = it => norm(it.bare || it.title || '').slice(0, 80);

/**
 * Plan d'un passage. `now` = publiés maintenant (≤ perRun effectif, ≤ restant de l'heure pondérée),
 * `hold` = frais gardés pour un passage suivant (heures calmes ou plafond horaire : ils partent plus tard
 * s'ils ont encore < 24 h, sinon ils expirent sans rattrapage), `skip` = sauté définitivement
 * (variété ≤ 2/source, quasi-doublon, ou au-delà de la capacité restante sur 24 h).
 */
export function plan(items, sent, { network, liveSince, accounts = [], now = Date.now(), schedule = true } = {}) {
  const base = NETWORKS[network]; if (!base) throw new Error(`réseau inconnu : ${network}`);
  const limits = schedule ? effectiveLimits(base, { network, liveSince, now }) : base;
  const r = remaining(sent, limits, { now });
  const recent = Object.values(sent).filter(s => now - Date.parse(s?.at) < 864e5);
  const seenKeys = new Set(recent.map(s => s.k).filter(Boolean)), poolKeys = new Set();
  const all = freshCandidates(items, sent, { liveSince, now });
  const dup = [], pool = [];
  for (const it of all) { const k = titleKey(it); if (k && (seenKeys.has(k) || poolKeys.has(k))) dup.push(it); else { poolKeys.add(k); pool.push(it); } }
  const recentSources = recent.filter(s => s?.source && !s.skipped && !s.dedup).map(s => s.source);
  if (base.spread) {
    const ranked = rankLikeX(pool, { recentSources, accounts, perSource: Infinity });
    const { go, hold } = paceSpread(ranked, { network, now, limits, status: r, maxH: MAX_FRESH_H });
    return { limits, status: r, now: go, hold, skip: dup };
  }
  const ranked = rankLikeX(pool, { recentSources, accounts });
  const keep = ranked.slice(0, r.dayLeft), go = keep.slice(0, Math.min(limits.perRun, r.hourLeft));
  const keepIds = new Set(keep.map(i => i.id));
  return { limits, status: r, now: go, hold: keep.slice(go.length), skip: [...pool.filter(i => !keepIds.has(i.id)), ...dup] };
}

export const RUN_STEP_MS = 30 * 60e3; // passages toutes les 30 min (cron 20,50)

/**
 * Cadence « spread » : chaque article doit partir avant ses 24 h. Il « consomme » la part
 * w(maintenant) / Σ w(passages restants avant son échéance) : le volume se place surtout aux
 * pointes, rien aux heures calmes. Urgent = expirerait avant le prochain passage non calme :
 * il passe en tête et ignore la cadence (pas le plafond horaire ni 24 h).
 */
export function paceSpread(ranked, { network, now = Date.now(), limits, status, maxH = MAX_FRESH_H, windows } = {}) {
  const w = a => weightAt(network, a, windows);
  const wNow = w(now);
  if (!ranked.length || wNow <= 0 || !status.hourLeft || !status.dayLeft) return { go: [], hold: ranked };
  let nextOpen = now + RUN_STEP_MS; while (w(nextOpen) <= 0 && nextOpen < now + 864e5) nextOpen += RUN_STEP_MS;
  const due = it => +it.date + maxH * 3600e3;
  const urgent = ranked.filter(it => due(it) < nextOpen), rest = ranked.filter(it => due(it) >= nextOpen);
  let share = 0;
  for (const it of rest) { let W = 0; for (let t = now; t < due(it); t += RUN_STEP_MS) W += w(t); share += W > 0 ? wNow / W : 1; }
  const cap = Math.min(status.hourLeft, status.dayLeft);
  const nPaced = Math.min(limits.perRun, Math.ceil(share - 1e-9));
  const go = [...urgent, ...rest.slice(0, Math.max(0, nPaced - urgent.length))].slice(0, Math.max(cap > 0 ? 1 : 0, Math.min(cap, Math.max(nPaced, urgent.length))));
  const ids = new Set(go.map(i => i.id));
  return { go, hold: ranked.filter(i => !ids.has(i.id)) };
}

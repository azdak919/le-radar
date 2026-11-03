// Logique pure des Pages Facebook et LinkedIn « LE-RADAR.ca » publiées via Buffer (testée dans
// tests/social-buffer-pages.mjs). Buffer est une file : on programme des heures (dueAt) dans les
// fenêtres de pointe du réseau (data/social/posting-windows.json), jamais en rafale, sans dépasser
// les places libres (10 par canal, forfait gratuit) ni le plafond quotidien (rodage compris).
import { createRequire } from 'node:module';
import { buildText, selectItems, siteLink } from './lib.mjs';
import { weightAt, rampAt, TZ } from './schedule.mjs';
import { titleKey } from './rate-limit.mjs';
const require = createRequire(import.meta.url);
const { articleId } = require('../../mobile/app/js/core.js');

export const ORIGIN = 'https://le-radar.ca';
export const PAGE_MAX_AGE_H = 48;
const dayKey = t => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);

/** Lien du post : fiche le-radar.ca (même identifiant que l'application) ou article du média. */
export function pageLink(it, mode = 'le-radar') {
  return mode === 'source' ? it.link : siteLink(it);
}

/** « Média • Auteur • Titre : extrait », lien, « 📸 crédit ». Jamais de @ (noms en clair). */
export function buildPageText(it, cfg = {}, { credit = '', photo = true, ai = true } = {}) {
  const text = buildText(it, [], cfg.limit || 1500, { credit, photo, len: s => [...s].length, link: true, url: pageLink(it, cfg.link), ai });
  return text.replace(/(^|[\s(])@(?=\w)/g, '$1');
}

/** Poids maximal de la journée locale contenant t. */
function dayMaxWeight(network, t, windows) {
  const k = dayKey(t); let m = 0;
  for (let h = -30; h <= 30; h += 0.25) { const x = t + h * 3600e3; if (dayKey(x) === k) m = Math.max(m, weightAt(network, x, windows)); }
  return m;
}

/** Plafond du jour : perDay × rodage × poids maximal du jour (fin de semaine LinkedIn ≈ 1). */
export function dayCap(cfg, network, t, windows) {
  return Math.round(cfg.perDay * rampAt(cfg.liveSince, t) * dayMaxWeight(network, t, windows));
}

/**
 * Heures de publication à programmer (ISO, triées) : au plus `free`, ≤ plafond de chaque jour
 * (en comptant `taken` : file + envois du jour), dans les créneaux de pointe (poids > moitié du
 * maximum du jour, tirage pondéré), écart ≥ minGapMin avec tout autre post, ≥ 20 min dans le futur.
 */
export function planDues({ network, cfg, now = Date.now(), taken = [], free = 10, horizonDays = 2, rnd = Math.random, windows } = {}) {
  const busy = taken.map(x => typeof x === 'number' ? x : Date.parse(x)).filter(Number.isFinite);
  const perDay = new Map(); for (const t of busy) perDay.set(dayKey(t), (perDay.get(dayKey(t)) || 0) + 1);
  const caps = new Map(), maxW = new Map(), out = [];
  const gap = (cfg.minGapMin || 90) * 60e3, span = horizonDays * 864e5, start = now + 20 * 60e3;
  for (let tries = 0; out.length < free && tries < 4000; tries++) {
    const t = Math.round((start + rnd() * span) / 60e3) * 60e3, k = dayKey(t);
    if (!caps.has(k)) { caps.set(k, dayCap(cfg, network, t, windows)); maxW.set(k, dayMaxWeight(network, t, windows)); }
    if ((perDay.get(k) || 0) >= caps.get(k)) continue;
    const w = weightAt(network, t, windows), m = maxW.get(k);
    if (!(w > 0) || w <= m / 2 || rnd() > w / m) continue;
    if ([...busy, ...out].some(x => Math.abs(x - t) < gap)) continue;
    out.push(t); perDay.set(k, (perDay.get(k) || 0) + 1);
  }
  return out.sort((a, b) => a - b).map(t => new Date(t).toISOString());
}

/** Articles à programmer : non envoyés sur ce réseau, ≤ 48 h, variété (≤ 2/source file comprise), sans quasi-doublon. */
export function selectForPage(items, { sent = {}, queuedSources = [], queuedTexts = [], slots = 0, now = Date.now(), maxAgeH = PAGE_MAX_AGE_H } = {}) {
  const keys = new Set(Object.values(sent).map(s => s?.k).filter(Boolean));
  const pool = [];
  for (const it of items) {
    const k = titleKey(it);
    if (sent[it.id] || (k && keys.has(k)) || queuedTexts.some(t => t.includes(it.link) || t.includes(articleId(it.link)))) continue;
    if (k) keys.add(k); pool.push(it);
  }
  return selectItems(pool, { sentIds: new Set(), queuedSources, slots, maxAgeH, now });
}

/** Erreur Buffer/réseau qui signale un refus du lien ou du post (blocage des nouvelles de Meta, etc.). */
export const isRejection = msg => /news|blocked|block|restrict|not allowed|policy|reject|refus|spam|invalid (link|url)|unavailable in your country|canada/i.test(msg || '');

/** Métadonnées Buffer par réseau (Facebook exige un type : post, story ou reel). */
export const postMetadata = service => service === 'facebook' ? { facebook: { type: 'post' } } : undefined;

// Sélection commune des publications sociales : une note par article, réutilisée par tous les réseaux,
// la règle « pas en double avec La une », et l'attribution des places (meilleur article → meilleure heure).
//
// Note (0 à ~19) :
//  - rang sur la page d'accueil du site (magazine-front-page-lib.js, période « jour ») : jusqu'à 10 points
//    pour les 30 premiers,
//    le meilleur signal éditorial disponible (fraîcheur, variété, sport, ménage déjà appliqués par le site) ;
//  - photo : 4 (vraie photo créditée à une personne) ou 2 (photo du flux), 0 sans photo propre ;
//  - extrait assez long pour donner envie (≥ MIN_EXCERPT) : 2 ;
//  - fraîcheur : 3 (< 12 h), 2 (< 24 h), 1 (< 48 h).
// Les réseaux gardent leur tour de table par média (variété) : la note départage à l'intérieur.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { photoRank, excerpt, MIN_EXCERPT } from './lib.mjs';
import { weightAt } from './schedule.mjs';

const require = createRequire(import.meta.url);
const front = require('../magazine-front-page-lib.js');
/** Le bonus de rang ne vaut que pour le haut de la page d'accueil (1er : 10 points, 15e : 5, 30e et plus : 0). */
export const FRONT_TOP = 30;
export const articleKey = it => front.articleId(it?.link || '') || it?.id || '';

/** Rang de chaque article sur la page d'accueil (0 = premier). Map vide si news.json est absent ou illisible. */
export function frontRanks(news, now = Date.now()) {
  try {
    const raw = Array.isArray(news) ? news : news?.items || [];
    const items = front.selectFrontPage(raw, new Date(now), null, Infinity, 'jour').items || [];
    return new Map(items.map((it, i) => [front.articleId(it.link), i]));
  } catch { return new Map(); }
}

/** news.json du dépôt (les workflows sociaux tournent sur main, où le bot le tient à jour). */
export function loadFrontRanks(file, now = Date.now()) {
  try { return frontRanks(JSON.parse(fs.readFileSync(file, 'utf8')), now); } catch { return new Map(); }
}

export function scoreItem(it, { ranks = new Map(), now = Date.now() } = {}) {
  const r = ranks.get(articleKey(it));
  const rank = r == null ? 0 : Math.max(0, 10 * (1 - r / FRONT_TOP));
  const photo = [0, 2, 4][photoRank(it)];
  const ex = excerpt(it).length >= MIN_EXCERPT ? 2 : 0;
  const ageH = (now - (Number(it.date) || Date.parse(it.date) || now)) / 3600e3;
  const fresh = ageH < 12 ? 3 : ageH < 24 ? 2 : ageH < 48 ? 1 : 0;
  return Math.round((rank + photo + ex + fresh) * 100) / 100;
}

/** Fonction de note prête à passer aux sélecteurs (selectItems, selectDaily, selectForPage, rankLikeX). */
export const scorer = (opts = {}) => it => scoreItem(it, opts);

/**
 * Articles parus dans La une sur `network` depuis `hours` heures (data/social/une-state.json).
 * Ils ne repartent pas seuls sur ce réseau dans ce délai : pas de doublon le même jour.
 */
export function recentUneKeys(uneState = {}, network = '', { now = Date.now(), hours = 24 } = {}) {
  const out = new Set();
  for (const [k, e] of Object.entries(uneState || {})) {
    if (k.startsWith('_') || !e || !Array.isArray(e.ids)) continue;
    const at = Date.parse(e.at || '');
    if (!Number.isFinite(at) || now - at > hours * 3600e3) continue;
    const nets = Array.isArray(e.nets) ? e.nets : Object.keys(e.nets || e.texts || {});
    if (network && nets.length && !nets.includes(network)) continue;
    for (const id of e.ids) out.add(id);
  }
  return out;
}

/** Articles du meilleur au moins bon (la note départage ; à note égale le plus récent). */
export const bestFirst = (items = [], score = () => 0) => [...items].sort((a, b) => score(b) - score(a) || (b.date || 0) - (a.date || 0));
/** Heures de la plus forte audience à la plus faible (posting windows du réseau), à poids égal la plus tôt. */
export const bestSlotsFirst = (dues = [], network, weight = weightAt) => [...dues].sort((a, b) =>
  (b ? weight(network, Date.parse(b)) : 0) - (a ? weight(network, Date.parse(a)) : 0) || Date.parse(a || 0) - Date.parse(b || 0));

/**
 * Attribue les heures aux articles : la meilleure note prend l'heure de plus fort poids
 * (posting windows du réseau), à poids égal la plus tôt. Retourne [{ it, dueAt }] triés par heure.
 */
export function seatByScore(items = [], dues = [], { network, score = () => 0, weight = weightAt } = {}) {
  const byScore = [...items].sort((a, b) => score(b) - score(a));
  const byWeight = dues.map((d, i) => ({ d, i, w: d ? weight(network, Date.parse(d)) : 0 }))
    .sort((a, b) => b.w - a.w || Date.parse(a.d || 0) - Date.parse(b.d || 0));
  const out = byWeight.slice(0, byScore.length).map((s, k) => ({ it: byScore[k], dueAt: s.d }));
  return out.sort((a, b) => Date.parse(a.dueAt || 0) - Date.parse(b.dueAt || 0));
}

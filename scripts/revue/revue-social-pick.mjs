// Articles du carrousel d'une revue (LinkedIn, Facebook, Instagram) : les meilleurs selon la note commune du social
// (scripts/social/selection.mjs : rang sur la page d'accueil, photo, extrait, fraîcheur), au plus SOCIAL_MAX.
// Pour les réseaux seulement : la page de la revue sur le site et ses PDF d'impression restent complets, dans leur ordre.
import fs from 'node:fs';
import path from 'node:path';
import { frontRanks, scoreItem } from '../social/selection.mjs';

/** Couverture + 8 articles + page finale = 10 pages, le maximum d'un carrousel Instagram ou Facebook. */
export const SOCIAL_MAX = 8;

/** Article de revue → forme lue par la note sociale (img, credit, desc). Photo de banque : pas une vraie photo. */
const asSocial = (it) => ({
  title: it.title, link: it.link, source: it.source, date: it.date,
  img: it.image && !it.imageStock ? it.image : '', credit: String(it.credit || '').replace(/^Photo\s*:\s*/i, ''),
  desc: it.excerpt || it.resume || '',
});

/** Les `max` meilleurs articles, du plus fort au plus faible ; à note égale, l'ordre de la revue. */
export function pickSocialItems(items = [], { ranks = new Map(), now = Date.now(), max = SOCIAL_MAX } = {}) {
  return items
    .map((it, i) => ({ it, i, s: scoreItem(asSocial(it), { ranks, now }) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, max)
    .map((x) => x.it);
}

/** Modèle de la revue pour le carrousel : mêmes données, articles choisis (rangs de l'accueil lus dans news.json). */
export function socialModel(model, { root = process.cwd(), max = SOCIAL_MAX } = {}) {
  const now = Date.parse(model.datePublished || '') || Date.now();
  let ranks = new Map();
  try { ranks = frontRanks(JSON.parse(fs.readFileSync(path.join(root, 'news.json'), 'utf8')), now); } catch { /* sans rangs : photo, extrait, fraîcheur */ }
  const items = pickSocialItems(model.items || [], { ranks, now, max });
  // Couverture : la photo de l'article en tête du carrousel (pas celle de la revue complète), sinon celle de la revue.
  const lead = items.find((it) => it.image && !it.imageStock);
  const image = items[0] && lead === items[0] ? { url: lead.image, credit: lead.credit, source: lead.source, title: lead.title } : model.image;
  return { ...model, items, image, totalItems: (model.items || []).length };
}

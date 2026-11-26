// Articles du carrousel d'une revue (LinkedIn, Facebook, Instagram) : les meilleurs selon la note commune du social
// (scripts/social/selection.mjs : rang sur la page d'accueil, photo, extrait, fraîcheur), au plus SOCIAL_MAX.
// Pour les réseaux seulement : la page de la revue sur le site et ses PDF d'impression restent complets, dans leur ordre.
import fs from 'node:fs';
import path from 'node:path';
import { frontRanks, scoreItem } from '../social/selection.mjs';
import { rseqVenue, popularity } from '../social/match-story-lib.mjs';

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
  return { ...model, items, image, totalItems: (model.items || []).length, sports: pickSports(model), radio: pickRadio(model) };
}

/** Salle de chaque match du carrousel (API publique du RSEQ, comme la story Jour de match) ; inconnue : rien. */
export async function withVenues(model, { fetchImpl = fetch } = {}) {
  const add = async (list = []) => Promise.all(list.map(async (g) => (g.venue || !g.gameId ? g : { ...g, venue: await rseqVenue(g.gameId, { fetchImpl }) || '' })));
  const sp = model.sports || {};
  const cut = (list = [], n) => [...list.filter(isSail), ...list.filter((g) => !isSail(g)).slice(0, n)];
  return { ...model, sports: { ...sp, results: await add(cut(sp.results, 2)), next: await add(cut(sp.next, 5)) } };
}

// ── Dernière page : sport et radio choisis par popularité (réseaux seulement) ──────────────────────────────────────

/** Établissement affiché → code de match-story-lib (derby : deux établissements de la même ville). */
const REG = { mcgill: 'mcgill', concordia: 'concordia', udem: 'udem', uqam: 'uqam', ets: 'ets', polytechnique: 'polytechnique', ulaval: 'ulaval', laval: 'ulaval', udes: 'usherbrooke', usherbrooke: 'usherbrooke', bishops: 'bishops' };
const regOf = (inst) => REG[String(inst || '').normalize('NFD').replace(/[^A-Za-z]/g, '').toLowerCase()] || '';
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5) || 0;

/**
 * Popularité d'un match de la revue : barème de la story Jour de match (match-story-lib.mjs → popularity : niveau,
 * sport, derby, grande écoute), moins 5 par jour d'écart avec le premier jour affiché (le plus proche d'abord).
 */
export function sportScore(g, firstDay = g.date) {
  const m = { ...g, division: (String(g.league || '').match(/\bD([123])\b/) || [])[0] || '', teams: (g.teams || []).map((t) => ({ ...t, reg: regOf(t.inst) })) };
  return popularity(m) - 5 * Math.max(0, daysBetween(firstDay || g.date, g.date || firstDay));
}
/** Les plus populaires d'abord, en variant les sports (−10 par match déjà retenu dans le même sport), puis par heure. */
export function rankSports(list = []) {
  const first = list.map((g) => g.date).filter(Boolean).sort()[0];
  const left = [...list], out = [], used = new Map();
  while (left.length) {
    let best = 0, bestScore = -Infinity;
    left.forEach((g, i) => { const sc = sportScore(g, first) - 10 * (used.get(g.sportKey || g.sport) || 0) - (String(g.time || '99:99').replace(':', '') / 1e4); if (sc > bestScore) { bestScore = sc; best = i; } });
    const [g] = left.splice(best, 1); out.push(g); used.set(g.sportKey || g.sport, (used.get(g.sportKey || g.sport) || 0) + 1);
  }
  return out;
}
/** Voile (régate, classement) : exception, comme pour les stories (décision de Charles) — toujours montrée, en tête, hors plafond. */
export const isSail = (g) => g?.sportKey === 'sailing' || /^voile\b/i.test(String(g?.sport || '')) || String(g?.kind || '').startsWith('regatta');
const sailFirst = (list = []) => [...list.filter(isSail), ...rankSports(list.filter((g) => !isSail(g)))];
export function pickSports(model) {
  const sp = model.sports || {};
  return { ...sp, results: sailFirst(sp.results || []), next: sailFirst(sp.next || []) };
}

/**
 * Popularité ESTIMÉE d'une émission de radio étudiante (aucune donnée d'écoute par émission) : barème simple et lisible.
 *  - bande : FM 20, AM 12, web seulement 8 (portée de l'antenne) ;
 *  - moment : en ondes ou commence dans l'heure qui suit la publication de la revue +10, dans les 3 heures +5 ;
 *  - grande écoute radio (6 h – 9 h, 16 h – 19 h) +5 ;
 *  - page d'émission à suivre +3.
 * Une émission par station (la mieux notée), stations triées par note. À remplacer par de vraies mesures quand il y en aura.
 */
const hm = (s) => { const [h, m] = String(s || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : NaN; };
const mtlMinutes = (iso) => {
  const d = new Date(iso); if (!Number.isFinite(d.getTime())) return NaN;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
};
export function showScore(station, show, pubMin = NaN) {
  const band = /\d{2,3},\d$/.test(String(station || '').trim()) ? 20 : /AM$/i.test(String(station || '').trim()) ? 12 : 8;
  const start = hm(show.start), end = hm(show.end) || start + 60;
  let when = 0;
  if (Number.isFinite(pubMin) && Number.isFinite(start)) {
    const onAir = start <= pubMin && pubMin < (end <= start ? end + 1440 : end);
    when = onAir || (start >= pubMin && start - pubMin <= 60) ? 10 : start >= pubMin && start - pubMin <= 180 ? 5 : 0;
  }
  const prime = (start >= 360 && start < 540) || (start >= 960 && start < 1140) ? 5 : 0;
  return band + when + prime + (show.url ? 3 : 0);
}
export function pickRadio(model) {
  const pub = mtlMinutes(model.datePublished);
  return (model.radio || [])
    .map((r, i) => {
      const shows = (r.shows || []).map((s, j) => ({ s, j, sc: showScore(r.station, s, pub) })).sort((a, b) => b.sc - a.sc || a.j - b.j);
      return { r: { ...r, shows: shows.map((x) => x.s) }, i, sc: shows[0]?.sc ?? -1 };
    })
    .filter((x) => x.r.shows.length)
    .sort((a, b) => b.sc - a.sc || a.i - b.i)
    .map((x) => x.r);
}

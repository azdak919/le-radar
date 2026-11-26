// « Story match du jour » : une story 9:16 plein cadre par match étudiant du jour (Facebook et Instagram), sans liste ni radio.
// Sélection pure (testable sans réseau) ; le rendu est dans affiches/social-une.js (format « match-story »), l'envoi dans match-story-run.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { pickSports, frShort, frHour, frDay, torontoMinutes } from './une-lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
/** Dossier des logos d'équipes, déposés à la main (aucun téléchargement automatique) : <registryId>.png|.svg|.webp. */
export const TEAM_LOGO_DIR = 'assets/logos/teams';
/**
 * Logo d'équipe s'il existe localement (chemin relatif à affiches/), sinon ''. Clé : identifiant de registre de l'établissement
 * (sports-masthead.json registryId / opponentRegistryId, ex. « mcgill », « montmorency »). Sans fichier : affiche typographique.
 */
export function teamLogo(reg, { root = ROOT } = {}) {
  const id = String(reg || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!id) return '';
  for (const ext of ['svg', 'png', 'webp']) if (fs.existsSync(path.join(root, TEAM_LOGO_DIR, `${id}.${ext}`))) return `../${TEAM_LOGO_DIR}/${id}.${ext}`;
  return '';
}

/** Jour civil à Montréal (AAAA-MM-JJ). */
export function montrealDay(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

/** « Basketball (F) » → « Basketball féminin » ; (H) → masculin ; voile sans catégorie → mixte (flottes mixtes). */
export function sportLabelFr(label, sportKey = '') {
  const s = String(label || '').trim();
  const m = s.match(/^(.*?)\s*\((F|H|M|mixte)\)$/i);
  if (m) return `${m[1]} ${{ f: 'féminin', h: 'masculin', m: 'masculin', mixte: 'mixte' }[m[2].toLowerCase()]}`;
  return sportKey === 'sailing' && !/mixte/i.test(s) ? `${s} mixte` : s;
}
const slug = (x) => String(x || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/** Clé d'état stable : jour + identifiant RSEQ (repli : équipes et heure) ; régate : jour + épreuve. */
export const matchKey = (m) => m.kind === 'regatta' ? `${m.date}:regate-${slug(m.event)}`
  : `${m.date}:${m.gameId || [m.teams?.[0]?.name, m.teams?.[1]?.name, m.time].join('-').toLowerCase().replace(/[^a-z0-9-]+/g, '')}`;

const mins = (t) => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : 24 * 60; };

/**
 * Matchs du jour (`day`) à deux équipes, universitaire d'abord puis par heure. Les épreuves (voile) sont dans todaysRegattas.
 * `notBefore` (minutes depuis minuit, Montréal) : écarte les matchs déjà commencés. `max` : plafond de stories par jour.
 */
export function todaysMatches(masthead, day, { max = 6, notBefore = -1 } = {}) {
  const { next } = pickSports(masthead, day, { max: 200, days: 0, nextDays: 0 });
  return next
    .filter((r) => r.date === day && r.teams?.length === 2 && !r.event && r.verb && mins(r.time) >= notBefore)
    .sort((a, b) => (b.uni - a.uni) || String(a.time).localeCompare(String(b.time)))
    .slice(0, max);
}

/**
 * Régates du jour (voile, classement par place) : une story par épreuve, avec tous les clubs québécois inscrits.
 * Pas d'heure de départ connue : jamais écartée par `notBefore` (une régate dure la journée).
 */
export function todaysRegattas(masthead, day) {
  const { next } = pickSports(masthead, day, { max: 200, days: 0, nextDays: 0 });
  const by = new Map();
  for (const r of next) {
    if (r.date !== day || !r.event || !r.teams?.length) continue;
    const k = slug(r.event);
    const g = by.get(k) || { kind: 'regatta', date: day, event: r.event, emoji: r.emoji, sport: r.sport, sportKey: r.sportKey, uni: false, time: r.time || '', when: r.when, clubs: [] };
    g.uni = g.uni || !!r.uni; if (r.time && (!g.time || r.time < g.time)) g.time = r.time;
    for (const t of r.teams) if (!g.clubs.some((c) => c.name === t.name)) g.clubs.push(t);
    by.set(k, g);
  }
  return [...by.values()];
}

/** Toutes les stories du jour : matchs et régates, universitaire d'abord puis par heure, au plus `max`. */
export function todaysStories(masthead, day, { max = 6, notBefore = -1 } = {}) {
  return [...todaysMatches(masthead, day, { max: 200, notBefore }), ...todaysRegattas(masthead, day)]
    .sort((a, b) => (b.uni - a.uni) || String(a.time || '99').localeCompare(String(b.time || '99')))
    .slice(0, max);
}

/** Modèle de la page (affiches/social-une.html, format « match-story ») : seulement ce que l'affiche montre. */
export function matchStoryModel(m, { index = 0, total = 1, root = ROOT } = {}) {
  const t = (z) => ({ name: z.name, inst: z.inst || '', color: z.color || '', logo: teamLogo(z.reg, { root }) });
  const common = { emoji: m.emoji || '', sport: sportLabelFr(m.sport, m.sportKey), uni: !!m.uni, hour: frHour(m.time),
    day: frDay(m.date).replace(/^./, (c) => c.toUpperCase()), dayShort: frShort(m.date), index, total };
  if (m.kind === 'regatta') return { match: { ...common, kind: 'regatta', event: m.event, clubs: m.clubs.slice(0, 6).map(t), more: Math.max(0, m.clubs.length - 6) } };
  // « A reçoit B » : A est à domicile ; « A visite B » : B est à domicile. L'équipe à domicile va en bas (convention « visiteur @ hôte »).
  const [x, y] = m.teams;
  const home = m.verb === 'reçoit' ? x : y, away = m.verb === 'reçoit' ? y : x;
  return { match: { ...common, kind: 'match', league: m.league || '', away: t(away), home: t(home),
    where: home.inst ? `Chez les ${home.name} · ${home.inst}` : `Chez les ${home.name}` } };
}

/** Texte alternatif : lisible seul, sans emoji. */
export function matchStoryAlt(m) {
  const { match: s } = matchStoryModel(m);
  const who = (z) => `${z.name}${z.inst ? ` (${z.inst})` : ''}`;
  if (s.kind === 'regatta') return `Affiche Jour de régate du Radar : ${s.sport}, ${s.event}, ${s.day}${s.hour ? ` à ${s.hour}` : ''}, classement par place ; clubs du Québec inscrits : ${s.clubs.map(who).join(', ')}. le-radar.ca`;
  return `Affiche Jour de match du Radar : ${s.sport}, ${who(s.away)} contre ${who(s.home)}, ${s.day}${s.hour ? ` à ${s.hour}` : ''}, ${s.where.replace(/^Chez/, 'chez')}. le-radar.ca`;
}

/**
 * Doit-on tourner maintenant ? Fenêtre d'envoi en heure de Montréal (défaut 9 h – 17 h) ; le matin du match, avant le coup d'envoi.
 * Renvoie { due, why }.
 */
export function storyWindow(now = Date.now(), { from = '09:00', to = '17:00' } = {}) {
  const hm = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
  const t = torontoMinutes(now);
  if (t < hm(from) || t > hm(to)) return { due: false, why: `hors de la fenêtre ${from}–${to} (heure de Montréal)` };
  return { due: true, why: 'dans la fenêtre d’envoi' };
}

/** Garde l'état court (14 jours). */
export function pruneMatchState(state, now = Date.now(), days = 14) {
  const cut = montrealDay(now - days * 864e5);
  for (const k of Object.keys(state)) if (/^\d{4}-\d{2}-\d{2}:/.test(k) && k.slice(0, 10) < cut) delete state[k];
  return state;
}

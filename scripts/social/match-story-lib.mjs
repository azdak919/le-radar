// « Story match du jour » : une story 9:16 plein cadre par match étudiant du jour (Facebook et Instagram), sans liste ni radio.
// Sélection pure (testable sans réseau) ; le rendu est dans affiches/social-une.js (format « match-story »), l'envoi dans match-story-run.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { pickSports, frShort, frHour, frDay, torontoMinutes, institutionColor, institutionSigle } from './une-lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
/** Dossier des logos d'équipes, déposés à la main (aucun téléchargement automatique) : <registryId>.png|.svg|.webp. */
export const TEAM_LOGO_DIR = 'assets/logos/teams';
/**
 * Logo d'équipe s'il existe localement (chemin relatif à affiches/), sinon ''. Clé : identifiant de registre de l'établissement
 * (sports-masthead.json registryId / opponentRegistryId, ex. « mcgill », « montmorency »). Sans fichier : affiche typographique.
 */
const SAILING = new Map();
/** Clubs de voile (sports-sailing.json) : nom du club (« McGill Sailing », « ULaVoile ») par registryId. */
export function sailingClub(reg, { root = ROOT } = {}) {
  if (!SAILING.has(root)) { let m = {}; try { const j = JSON.parse(fs.readFileSync(path.join(root, 'sports-sailing.json'), 'utf8')); m = Object.fromEntries([...(j.schools || []), ...(j.cicsa?.clubs || [])].map((c) => [c.registryId, c])); } catch {} SAILING.set(root, m); }
  return SAILING.get(root)[reg] || null;
}
const SOURCES = new Map();
/** Fiche d'un logo (assets/logos/teams/sources.json) : titulaire (owner) et note éventuelle (autorisation). */
export function logoSource(id, { root = ROOT } = {}) {
  if (!SOURCES.has(root)) { let m = {}; try { m = JSON.parse(fs.readFileSync(path.join(root, TEAM_LOGO_DIR, 'sources.json'), 'utf8')); } catch {} SOURCES.set(root, m); }
  return SOURCES.get(root)[id] || null;
}
/**
 * Crédits du pied, sans rien oublier : source des données (et de la salle / du lieu), titulaires des logos réellement affichés,
 * autorisations particulières. Les polices, la mise en page et l'indépendance sont fixes dans le gabarit.
 */
export function storyCredits(match, { root = ROOT } = {}) {
  const ids = [];
  const idOf = (logo) => (String(logo || '').match(/teams\/([a-z0-9-]+)\.(?:svg|png|webp)$/) || [])[1];
  [match.circuitLogo, match.away?.logo, match.home?.logo, ...(match.clubs || []).map((c) => c.logo), ...(match.rows || []).map((c) => c.logo)].forEach((l) => { const id = idOf(l); if (id && !ids.includes(id)) ids.push(id); });
  const src = ids.map((id) => logoSource(id, { root }) || { owner: id });
  const data = match.kind === 'regatta-results' ? `Résultats${match.where ? ' et lieu' : ''} : CICSA` : match.kind === 'regatta' ? `Calendrier${match.where ? ' et lieu' : ''} : CICSA` : `Calendrier${match.venue ? ' et salle' : ''} : RSEQ`;
  return { data, logos: src.map((x) => x.owner), notes: [...new Set(src.map((x) => x.note).filter(Boolean))] };
}
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
export const matchKey = (m) => m.kind === 'more' ? `${m.date}:aussi-${m.wave}` : m.kind === 'regatta-results' ? `${m.date}:resultats-${slug(m.event)}` : m.kind === 'regatta' ? `${m.date}:regate-${slug(m.event)}`
  : `${m.date}:${m.gameId || [m.teams?.[0]?.name, m.teams?.[1]?.name, m.time].join('-').toLowerCase().replace(/[^a-z0-9-]+/g, '')}`;

const mins = (t) => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : 24 * 60; };

/**
 * Une rencontre = une seule entrée (27 nov. 2026 : le même match de hockey sortait en 7 stories). Chaque équipe a son
 * calendrier : le match y figure deux fois (« reçoit » et « visite », gameId différents), parfois en double et parfois
 * sans heure. Clé : jour, sport, établissements triés, heure ; une entrée sans heure tombe si la rencontre a une heure
 * ailleurs. Garde l'entrée de l'hôte (« reçoit »).
 */
export function dedupeMatches(list) {
  const base = (r) => [r.date, String(r.sportKey || '').toLowerCase(), r.sport || '', ...(r.teams || []).map((t) => t.reg || t.name).sort()].join('|');
  const timed = new Set(list.filter((r) => r.time).map(base));
  const seen = new Map();
  for (const r of list) {
    if (!r.time && timed.has(base(r))) continue;
    const k = base(r) + '|' + (r.time || '');
    const prev = seen.get(k);
    if (!prev || (prev.verb !== 'reçoit' && r.verb === 'reçoit')) seen.set(k, r);
  }
  return list.filter((r) => [...seen.values()].includes(r));
}

/**
 * Matchs du jour (`day`) à deux équipes, universitaire d'abord puis par heure. Les épreuves (voile) sont dans todaysRegattas.
 * `notBefore` (minutes depuis minuit, Montréal) : écarte les matchs déjà commencés. `max` : plafond de stories par jour.
 */
export function todaysMatches(masthead, day, { max = 6, notBefore = -1 } = {}) {
  const { next } = pickSports(masthead, day, { max: 200, days: 0, nextDays: 0 });
  return dedupeMatches(next.filter((r) => r.date === day && r.teams?.length === 2 && !r.event && r.verb))
    .filter((r) => mins(r.time) >= notBefore)
    .sort((a, b) => (b.uni - a.uni) || String(a.time).localeCompare(String(b.time)))
    .slice(0, max);
}

/**
 * Jour sans match (27 nov. 2026, Charles) : on se rabat sur les derniers résultats (`resultDays` jours) et les prochains
 * matchs (`nextDays` jours), chacun en une affiche de liste (même gabarit que « Aussi aujourd'hui »), les plus populaires
 * d'abord (popularity, la voile en tête comme partout). Rien de récent ni d'annoncé : rien (jamais de remplissage).
 */
export function quietDayLists(masthead, day, { resultDays = 3, nextDays = 7, max = 9 } = {}) {
  const { results, next } = pickSports(masthead, day, { max: 1000, days: resultDays, nextDays });
  const sail = (r) => r.sportKey === 'sailing' || /^voile\b/i.test(String(r.sport || ''));
  const rank = (list) => [...list].sort((a, b) => (sail(b) - sail(a)) || (popularity(b) - popularity(a)) || String(a.date + (a.time || '')).localeCompare(String(b.date + (b.time || ''))));
  const res = rank(results.filter((r) => r.date < day || r.date === day)).slice(0, max);
  const up = rank(next.filter((r) => r.date > day && r.teams?.length)).slice(0, max);
  const out = [];
  if (res.length) out.push({ kind: 'more', list: 'resultats', title: 'Résultats récents', date: day, wave: 'resultats', uni: false, time: '', items: res });
  if (up.length) out.push({ kind: 'more', list: 'avenir', title: 'À venir', date: day, wave: 'avenir', uni: false, time: '', items: up });
  return out;
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
    const g = by.get(k) || { kind: 'regatta', date: day, event: r.event, emoji: r.emoji, sport: r.sport, sportKey: r.sportKey, uni: false, time: r.time || '', when: r.when, venue: venueLabel(r.venue), clubs: [] };
    if (!g.venue && r.venue) g.venue = venueLabel(r.venue);
    g.uni = g.uni || !!r.uni; if (r.time && (!g.time || r.time < g.time)) g.time = r.time;
    for (const t of r.teams) if (!g.clubs.some((c) => c.name === t.name)) g.clubs.push(t);
    by.set(k, g);
  }
  return [...by.values()];
}

/** Codes de club hôte CICSA → nom complet (seulement ceux qu'on connaît sûrement ; sinon le code tel quel). */
export const SAILING_VENUES = {
  WVYC: 'West Vancouver Yacht Club', PCYC: 'Pointe-Claire Yacht Club', RCYC: 'Royal Canadian Yacht Club',
  KYC: 'Kingston Yacht Club', RNSYS: 'Royal Nova Scotia Yacht Squadron', RSTLYC: 'Royal St. Lawrence Yacht Club',
};
export const venueLabel = (v) => SAILING_VENUES[String(v || '').trim().toUpperCase()] || String(v || '').trim();
const crewOf = (s) => ((String(s || '').match(/équipage\s+(\S+)/) || [])[1] || '');
const eventOf = (s) => String(s || '').replace(/\s+·\s+équipage\s+\S+$/, '').trim();
const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/** Équipes de voile (CICSA) de sports.json, déjà dépaquetées : seules sources des régates (sports-masthead.json n'en a pas). */
export function sailingTeams(sportsPayload) {
  return Object.fromEntries(Object.entries(sportsPayload?.teams || {}).filter(([, t]) => t && (t.sport === 'sailing' || t.sport === 'voile')));
}

/**
 * Résultats de régate (classement par place) terminés entre `day - days` et `day` : une story par épreuve, les clubs québécois
 * classés du meilleur au moins bon (un club peut aligner plusieurs équipages). Rien d'inventé : place et effectif connus seulement.
 */
export function regattaResults(teams, day, { days = 1 } = {}) {
  const from = addDays(day, -days), by = new Map();
  for (const t of Object.values(teams || {})) {
    if (!t || (t.sport !== 'sailing' && t.sport !== 'voile')) continue;
    for (const r of t.results || []) {
      const place = Number(r.scoreFor), field = Number(r.scoreAgainst);
      if (r.priorSeason || !r.date || r.date < from || r.date > day || !(place >= 1) || !(field >= 1)) continue;
      const event = eventOf(r.opponent), k = `${r.date}:${slug(r.opponentEn ? eventOf(r.opponentEn.replace(/ · crew.*/, '')) : event)}`;
      const parts = String(r.opponentFullName || '').split(/\s+·\s+/);
      const g = by.get(k) || { kind: 'regatta-results', date: r.date, start: r.eventStart || r.date, event, emoji: '⛵', sport: 'Voile', sportKey: 'sailing', uni: false, time: '', field, venue: parts.length > 1 ? venueLabel(parts.at(-1)) : '', rows: [] };
      g.field = Math.max(g.field, field);
      g.rows.push({ reg: t.registryId || '', name: t.name || '', place, field, crew: crewOf(r.opponent) });
      by.set(k, g);
    }
  }
  return [...by.values()].map((g) => ({ ...g, rows: g.rows.sort((a, b) => a.place - b.place) })).sort((a, b) => b.rows.length - a.rows.length || String(b.date).localeCompare(a.date));
}
const ordinal = (n) => (n === 1 ? '1er' : `${n}e`);

/** Toutes les stories du jour : matchs et régates, universitaire d'abord puis par heure, au plus `max`. */
export function todaysStories(masthead, day, { max = 6, notBefore = -1, sailing = {} } = {}) {
  const all = { ...masthead, teams: { ...(masthead?.teams || {}), ...sailing } };
  return [...todaysMatches(all, day, { max: 200, notBefore }), ...todaysRegattas(all, day), ...regattaResults(sailing, day)]
    .sort((a, b) => (b.uni - a.uni) || String(a.time || '99').localeCompare(String(b.time || '99')))
    .slice(0, max);
}

/**
 * Vagues de publication (heure de Montréal). Chaque nouvelle story ramène le compte en tête de la barre des stories (Instagram
 * et Facebook) : deux vagues courtes rapportent plus qu'une rafale. Matin : matchs de la journée (coup d'envoi avant 15 h),
 * régates et résultats de la veille. Fin d'après-midi : matchs de soirée, 2 à 3 h avant le coup d'envoi (après les cours).
 */
// post : heure de Montréal à laquelle Buffer publie les stories de la vague (programmées dès le premier passage du jour,
// 27 nov. 2026 : les crons de 9 h 41 et 15 h 23 n'étaient pas partis, les stories du soir étaient sorties à 17 h 20).
export const WAVES = [
  { id: 'matin', from: '09:00', to: '14:59', post: '09:00', games: [0, 15 * 60] },
  { id: 'soir', from: '15:00', to: '19:30', post: '15:00', games: [15 * 60, 24 * 60] },
];
const hmMin = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
/** Vague d'une story : matchs selon l'heure du coup d'envoi ; voile (toute la journée, résultats) le matin. */
export function waveOf(m, waves = WAVES) {
  if (String(m.kind).startsWith('regatta') || !m.time) return waves[0].id;
  const t = mins(m.time);
  return (waves.find((w) => t >= w.games[0] && t < w.games[1]) || waves.at(-1)).id;
}
/** Vague en cours à l'instant `t` (minutes depuis minuit, Montréal), ou null hors des vagues. */
export function waveAt(t, waves = WAVES) { return waves.find((w) => t >= hmMin(w.from) && t <= hmMin(w.to)) || null; }

/**
 * Plan d'une vague, selon le volume du jour :
 *  - peu de matchs : une story par match, rien d'ajouté (jamais de remplissage) ; aucun match : aucune story ;
 *  - beaucoup : la plus forte d'abord (universitaire, puis voile, puis collégial ; par heure ; un sport différent avant de
 *    répéter), au plus `maxPerWave` affiches, et la dernière place devient « Aussi aujourd'hui » (liste du reste, 3 au moins ;
 *    sinon jusqu'à maxPerWave + 1 affiches).
 * Retourne les stories dans l'ordre de publication, avec index/total de la vague.
 */
/**
 * Popularité ESTIMÉE d'une rencontre (aucune donnée d'audience par équipe n'existe encore) : barème simple et lisible.
 *  - niveau : U SPORTS 60 ; collégial D1 30, D2 18, autre 10 ;
 *  - sport (intérêt du public étudiant au Québec) : football 25, hockey 22, basketball 20, volleyball 14, soccer 12, rugby 10, autres 6 ;
 *  - derby (deux établissements de la même ville : Montréal, Québec, Sherbrooke) +15 ;
 *  - heure de grande écoute (18 h – 21 h) +5.
 * La variété est appliquée au moment du choix (−10 par répétition d'un même sport). À remplacer par de vraies mesures
 * (vues des stories par équipe) quand Buffer / Meta les fourniront.
 */
export const SPORT_INTEREST = { football: 25, hockey: 22, basketball: 20, volleyball: 14, soccer: 12, 'soccer-interieur': 10, rugby: 10 };
const CITY = { mcgill: 'mtl', concordia: 'mtl', udem: 'mtl', uqam: 'mtl', ets: 'mtl', polytechnique: 'mtl', ulaval: 'qc', usherbrooke: 'sher', bishops: 'sher' };
export function popularity(m) {
  if (String(m.kind).startsWith('regatta')) return 75;
  const lvl = m.uni ? 60 : /^D1$/i.test(m.division || '') ? 30 : /^D2$/i.test(m.division || '') ? 18 : 10;
  const sport = SPORT_INTEREST[String(m.sportKey || '').toLowerCase()] ?? 6;
  const [a, b] = (m.teams || []).map((t) => CITY[t.reg]);
  const derby = a && a === b ? 15 : 0;
  const t = mins(m.time), prime = t >= 18 * 60 && t <= 21 * 60 ? 5 : 0;
  return lvl + sport + derby + prime;
}

/**
 * Plan d'une vague, selon le volume du jour :
 *  - peu de matchs : une story par match, rien d'ajouté (jamais de remplissage) ; aucun match : aucune story ;
 *  - beaucoup : les plus populaires d'abord (popularity, un sport différent avant de répéter), au plus `maxPerWave` affiches ;
 *    la dernière place devient « Aussi aujourd'hui » (liste du reste, 3 au moins ; sinon jusqu'à maxPerWave + 1 affiches).
 *  - voile (régate, résultats) : TOUJOURS publiée, en affiche, hors plafond (décision de Charles, 26 nov. 2026).
 * Retourne les stories dans l'ordre de publication (la plus forte en premier : l'attention baisse à chaque story).
 */
export function planWave(stories, { maxPerWave = 4 } = {}) {
  const sail = stories.filter((m) => String(m.kind).startsWith('regatta'));
  const pool = stories.filter((m) => !String(m.kind).startsWith('regatta'));
  // Choix glouton : à chaque tour, la rencontre la plus populaire, pénalisée de 10 par match déjà retenu dans le même sport.
  const ranked = [], used = new Map(), left = [...pool];
  while (left.length) {
    let best = 0, bestScore = -Infinity;
    left.forEach((m, i) => { const sc = popularity(m) - 10 * (used.get(m.sportKey || m.sport) || 0) - mins(m.time) / 10000; if (sc > bestScore) { bestScore = sc; best = i; } });
    const [m] = left.splice(best, 1); ranked.push(m); used.set(m.sportKey || m.sport, (used.get(m.sportKey || m.sport) || 0) + 1);
  }
  const byPop = (list) => list.sort((a, b) => popularity(b) - popularity(a));
  if (ranked.length <= maxPerWave + 1) return byPop([...ranked, ...sail]);
  const keep = ranked.slice(0, maxPerWave - 1), rest = ranked.slice(maxPerWave - 1);
  const day = keep[0]?.date || rest[0]?.date;
  return [...byPop([...keep, ...sail]), { kind: 'more', date: day, wave: waveOf(rest[0]), uni: false, time: '', items: rest.sort((a, b) => String(a.time || '99').localeCompare(String(b.time || '99'))) }];
}

/** Modèle de la page (affiches/social-une.html, format « match-story ») : seulement ce que l'affiche montre. */
export function matchStoryModel(m, { index = 0, total = 1, root = ROOT } = {}) {
  const t = (z) => ({ name: z.name, inst: z.inst || '', color: z.color || '', logo: teamLogo(z.reg, { root }) });
  // Circuit : U SPORTS pour l'universitaire (toutes les équipes universitaires du RSEQ y sont), RSEQ collégial sinon ; CICSA pour la voile.
  const circuit = String(m.kind).startsWith('regatta') ? 'CICSA' : m.uni ? 'U SPORTS' : 'RSEQ collégial';
  const circuitLogo = teamLogo(String(m.kind).startsWith('regatta') ? 'cicsa' : m.uni ? 'usports' : 'rseq', { root });
  // Le logo RSEQ porte déjà « RSEQ » : à côté, « Collégial » suffit.
  const common = { emoji: m.emoji || '', sport: sportLabelFr(m.sport, m.sportKey), circuit, circuitLogo, circuitText: circuitLogo && circuit === 'RSEQ collégial' ? 'Collégial' : circuit, uni: !!m.uni, hour: frHour(m.time),
    day: frDay(m.date).replace(/^./, (c) => c.toUpperCase()), dayShort: frShort(m.date), index, total };
  // Voile : nom du club de voile (pas l'équipe d'excellence de l'établissement) et son propre logo (<registryId>-voile).
  const club = (z) => { const c = sailingClub(z.reg, { root }); return { name: c?.clubName || z.name, inst: c ? (z.inst || institutionSigle(c.name) || c.shortName || z.name) : z.inst || '', color: z.color || institutionColor(c?.name || '') || '', logo: teamLogo(z.reg ? `${z.reg}-voile` : '', { root }) }; };
  const withCredits = (x) => ({ match: { ...x, credits: storyCredits(x, { root }) } });
  if (m.kind === 'more') {
    // Équipe et sigle de l'établissement entre parenthèses : « Carabins (UdeM) » (27 nov. 2026, Charles).
    // Trait d'union insécable : « (Saint‑Jean‑sur‑Richelieu) » passe à la ligne d'un bloc, jamais coupé au tiret.
    const nm = (z) => z?.inst && z.inst !== z.name ? `${z.name} (${z.inst.replace(/-/g, '\u2011')})` : z?.name || '';
    const line = (x) => x.kind === 'regatta' ? { emoji: '⛵', when: 'Journée', text: `Régate : ${x.event}`, sport: 'Voile' }
      : x.kind === 'regatta-results' ? { emoji: '⛵', when: 'Final', text: `Résultats : ${x.event}`, sport: 'Voile' }
      // Jour sans match : résultats (date, pointage) et matchs à venir (date et heure).
      : x.kind === 'resultat' ? { emoji: x.emoji || '', when: frShort(x.date), text: `${nm(x.teams[0])} ${x.teams[0].score}-${x.teams[1].score} ${nm(x.teams[1])}`, sport: sportLabelFr(x.sport, x.sportKey) }
      : x.kind === 'classement' ? { emoji: x.emoji || '', when: frShort(x.date), text: `${nm(x.teams[0])} : ${String(x.place).replace('/', ' sur ')}, ${x.event}`, sport: sportLabelFr(x.sport, x.sportKey) }
      : m.list === 'avenir' ? { emoji: x.emoji || '', when: [frShort(x.date), frHour(x.time)].filter(Boolean).join(' · '), text: x.verb && x.teams?.length === 2 ? `${nm(x.teams[0])} ${x.verb} ${nm(x.teams[1])}` : `${nm(x.teams?.[0])} · ${x.event || ''}`, sport: sportLabelFr(x.sport, x.sportKey) }
      : { emoji: x.emoji || '', when: frHour(x.time) || '', text: `${nm(x.teams[0])} ${x.verb} ${nm(x.teams[1])}`, sport: sportLabelFr(x.sport, x.sportKey) };
    const items = m.items.map(line);
    return { match: { kind: 'more', title: m.title || '', emoji: '🏟️', sport: 'Sport étudiant', circuit: '', circuitLogo: '', count: items.length, items: items.slice(0, 9), extra: Math.max(0, items.length - 9),
      hour: '', day: frDay(m.date).replace(/^./, (c) => c.toUpperCase()), dayShort: frShort(m.date), index, total,
      credits: { data: `${m.list === 'resultats' ? 'Résultats' : 'Calendrier'} : ${m.items.some((x) => String(x.kind).startsWith('regatta') || x.sportKey === 'sailing') ? 'RSEQ et CICSA' : 'RSEQ'}`, logos: [], notes: [] } } };
  }
  if (m.kind === 'regatta-results') {
    const rows = m.rows.slice(0, 6).map((r) => { const c = club({ reg: r.reg, name: r.name }); return { ...c, place: r.place, placeLabel: ordinal(r.place), field: r.field, crew: r.crew ? `Équipage ${r.crew}` : '', podium: r.place <= 3 }; });
    return withCredits({ ...common, kind: 'regatta-results', event: m.event, field: m.field, where: m.venue ? `Lieu : ${m.venue}` : '', rows, more: Math.max(0, m.rows.length - 6),
      day: frDay(m.date).replace(/^./, (c) => c.toUpperCase()), range: m.start && m.start !== m.date ? `${frShort(m.start)} au ${frShort(m.date)}` : '' });
  }
  if (m.kind === 'regatta') return withCredits({ ...common, kind: 'regatta', event: m.event, where: m.venue ? `Lieu : ${m.venue}` : '', clubs: m.clubs.slice(0, 6).map(club), more: Math.max(0, m.clubs.length - 6) });
  // « A reçoit B » : A est à domicile ; « A visite B » : B est à domicile. L'équipe à domicile va en bas (convention « visiteur @ hôte »).
  const [x, y] = m.teams;
  const home = m.verb === 'reçoit' ? x : y, away = m.verb === 'reçoit' ? y : x;
  // Logos : les deux ou aucun (27 nov. 2026, Charles : un seul logo, l'autre absent, déséquilibrait l'affiche).
  const A = t(away), H = t(home);
  if (!(A.logo && H.logo)) { A.logo = ''; H.logo = ''; }
  return withCredits({ ...common, kind: 'match', league: m.league || '', away: A, home: H,
    // « Chez les … » puis la salle (API RSEQ) sur la ligne du dessous.
    where: home.inst ? `Chez les ${home.name} · ${home.inst}` : `Chez les ${home.name}`, venue: m.venue || '' });
}

/** Salle d'un match RSEQ (API publique GameApi, champ SportFacilityDescription) ; '' si inconnue ou injoignable. */
export async function rseqVenue(gameId, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(gameId || ''))) return '';
  try {
    const r = await fetchImpl(`https://s1.rseq.ca/api/GameApi/GetGameDiffusion/?gameId=${gameId}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return '';
    const v = String((await r.json())?.SportFacilityDescription || '').replace(/\s+/g, ' ').trim();
    return v.length <= 60 ? v : '';
  } catch { return ''; }
}

/** Texte alternatif : lisible seul, sans emoji. */
export function matchStoryAlt(m) {
  const { match: s } = matchStoryModel(m);
  const who = (z) => `${z.name}${z.inst ? ` (${z.inst})` : ''}`;
  if (s.kind === 'more') return `Affiche ${s.title || 'Aussi aujourd’hui'} du Radar, ${s.day} : ${s.items.map((x) => `${x.when ? x.when + ', ' : ''}${x.sport}, ${x.text.replace(/\u2011/g, '-')}`).join(' ; ')}${s.extra ? ` ; et ${s.extra} autres sur le-radar.ca/sports` : ''}. le-radar.ca`;
  if (s.kind === 'regatta-results') return `Affiche Résultats de régate du Radar : ${s.event}, ${s.range || s.day}${s.where ? `, ${s.where.replace(/^Lieu/, 'lieu')}` : ''}, classement final sur ${s.field} équipes : ${s.rows.map((r) => `${r.placeLabel} ${r.name}${r.crew ? ` (${r.crew.toLowerCase()})` : ''}`).join(', ')}. le-radar.ca`;
  if (s.kind === 'regatta') return `Affiche Jour de régate du Radar : ${s.sport}, ${s.event}, ${s.day}${s.hour ? ` à ${s.hour}` : ''}, classement par place${s.where ? `, ${s.where.replace(/^Lieu/, 'lieu')}` : ''} ; clubs du Québec inscrits : ${s.clubs.map(who).join(', ')}. le-radar.ca`;
  return `Affiche Jour de match du Radar : ${s.sport}, ${who(s.away)} contre ${who(s.home)}, ${s.day}${s.hour ? ` à ${s.hour}` : ''}, ${s.where.replace(/^Chez/, 'chez')}${s.venue ? `, ${s.venue}` : ''}. le-radar.ca`;
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

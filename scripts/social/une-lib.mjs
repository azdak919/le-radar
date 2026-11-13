// « La une du matin » et « La une du soir » : logique pure (testée dans tests/social-une.mjs).
//  - créneaux en heure de Montréal (America/Toronto, heure d'été et d'hiver gérées par Intl) ;
//  - sélection = la une de l'accueil (scripts/magazine-front-page-lib.js, période « Aujourd'hui », sport pro exclu) ;
//  - anti-doublon : un article déjà publié dans un créneau récent n'est jamais repris ; le soir ne garde que les
//    nouveautés de la journée et saute la publication s'il n'y en a aucune ;
//  - textes par réseau en français, titres + auteurs (tous, sinon le média seul), liens le-radar.ca, hashtags, aucune mention @.
// Aucune publication ici.
import { createRequire } from 'node:module';
import { torontoDay } from './policy.mjs';
import { xlen, SITE } from './lib.mjs';
import { NET_SPEC } from './formats.mjs';
import { institutionTag, sportTagOf } from './hashtags.mjs';
import { detectLang } from './lib.mjs';

const require = createRequire(import.meta.url);
const front = require('../magazine-front-page-lib.js');
let BRAND = {}; try { BRAND = require('../../brand-colors.json').institutions || {}; } catch {}
/** Couleur officielle de l'établissement (brand-colors.json du site, mêmes clés que les pastilles d'articles) ; '' si inconnue. */
const BRAND_ALIAS = { concordia: 'Concordia University', mcgill: 'Université McGill', 'montréal': 'Université de Montréal', udem: 'Université de Montréal', laval: 'Université Laval', sherbrooke: 'Université de Sherbrooke', uqtr: 'Université du Québec à Trois-Rivières', uqac: 'Université du Québec à Chicoutimi (UQAC)', uqar: 'Université du Québec à Rimouski (UQAR)', uqam: 'UQAM', "bishop's": "Bishop's University", 'bishop’s': "Bishop's University", polytechnique: 'Polytechnique Montréal', dawson: 'Dawson College', 'john abbott': 'John Abbott College', maisonneuve: 'Collège de Maisonneuve', montmorency: 'Collège Montmorency', 'lionel-groulx': 'Collège Lionel-Groulx', 'vieux montréal': 'Cégep du Vieux Montréal' };
export function institutionColor(name) {
  const raw = String(name || '').replace(/\s+—\s+.*$/, '').replace(/’/g, "'").trim(); if (!raw) return '';
  const head = raw.split(',')[0].trim();
  const keys = [raw, head, raw.replace(/\s*\([^)]*\)\s*$/, ''), FR_INSTITUTIONS[raw.toLowerCase()] || '', BRAND_ALIAS[head.toLowerCase()] || '', BRAND_ALIAS[head.replace(/^(Université|Cégep|Collège)\s+(de\s+|du\s+|d')?/i, '').toLowerCase()] || ''];
  for (const k of keys) if (k && BRAND[k]?.color) return BRAND[k].color;
  const low = raw.toLowerCase(); const hit = Object.keys(BRAND).find(k => k.toLowerCase() === low); return hit ? BRAND[hit].color : '';
}
const authors = require('../author-lib.js');

export const NETS = ['bluesky', 'mastodon', 'x', 'tumblr', 'facebook', 'linkedin'];
export const SLOTS = {
  matin: { id: 'matin', label: 'La une du matin', emoji: '☀️', target: '07:45', from: '07:30', to: '10:30' },
  soir: { id: 'soir', label: 'La une du soir', emoji: '🌙', target: '19:30', from: '19:15', to: '22:30' },
};
/** Réseaux préparés mais désactivés tant que le compte et l'accès ne sont pas configurés (policy.json formats.une.prepared). */
export const PREPARED_NETS = ['instagram'];
/**
 * Format d'image par réseau (revue du 12 nov. 2026, docs/social-engagement.md) : le portrait 4:5 s'affiche sans recadrage
 * pour une image seule dans les fils mobiles de X, Bluesky (recadre seulement au-delà de 1:2), Mastodon (4.x, ratio natif),
 * LinkedIn, Facebook, Tumblr et Instagram (plage API 4:5 à 1,91:1). Story Instagram : 9:16. Le paysage 16:9 reste rendu en
 * aperçu (repli), sans réseau attitré.
 */
export const IMAGE_FOR = { facebook: 'portrait', tumblr: 'portrait', x: 'portrait', bluesky: 'portrait', mastodon: 'portrait', linkedin: 'portrait', instagram: 'portrait' };
export const STORY_FOR = { instagram: 'story' };
export const IMAGE_SIZES = { portrait: { width: 1080, height: 1350 }, paysage: { width: 1200, height: 675 }, story: { width: 1080, height: 1920 } };
/** Formats à rendre pour une liste de réseaux (aperçu : tous). */
export const formatsFor = (nets, all = false) => all ? ['portrait', 'story', 'paysage']
  : [...new Set(nets.flatMap(n => [IMAGE_FOR[n], STORY_FOR[n]]).filter(Boolean))];
/** Poids maximal d'une image (Bluesky : 976 Ko ; X : 5 Mo ; Mastodon : 8 Mo ; Facebook, LinkedIn, Tumblr : plus). */
export const MAX_IMAGE_BYTES = 950 * 1024;

const hm = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
/** Minutes depuis minuit, heure de Montréal. */
export function torontoMinutes(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(x => [x.type, x.value]));
  return +p.hour * 60 + +p.minute;
}
export const slotKey = (day, slot) => `${day}:${slot}`;
const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/** Créneau dont la fenêtre d'envoi contient `now` (heure de Montréal), sinon null. `slots` : réglages de policy.json. */
export function slotAt(now = Date.now(), slots = SLOTS) {
  const m = torontoMinutes(now), day = torontoDay(now);
  for (const s of Object.values(slots)) if (m >= hm(s.from) && m < hm(s.to)) return { ...SLOTS[s.id], ...s, day, key: slotKey(day, s.id) };
  return null;
}
/** Créneau voulu (forcé par l'essai manuel) pour le jour de `now`. */
export function slotFor(id, now = Date.now(), slots = SLOTS) {
  const s = slots[id] || SLOTS[id]; if (!s) throw new Error(`créneau inconnu : ${id}`);
  const day = torontoDay(now); return { ...SLOTS[id], ...s, day, key: slotKey(day, id) };
}
/** Créneaux précédents à exclure (anti-doublon) : le matin exclut la veille ; le soir exclut le matin du jour et la veille. */
export function previousKeys(slot) {
  const y = addDays(slot.day, -1);
  return slot.id === 'matin' ? [slotKey(y, 'soir'), slotKey(y, 'matin')] : [slotKey(slot.day, 'matin'), slotKey(y, 'soir')];
}
/** Créneau entièrement traité ? (chaque réseau publié, ou abandonné après `maxAttempts`, ou créneau sauté). */
export function slotDone(entry, nets = NETS, maxAttempts = 3) {
  if (!entry) return false;
  if (entry.skipped) return true;
  return nets.every(n => (entry.nets?.[n]?.at && !entry.nets[n].failed) || (entry.nets?.[n]?.attempts || 0) >= maxAttempts);
}

/** Signature : tous les auteurs (« A, B et C »), sinon le média seul. */
export function byline(item) {
  const src = String(item?.source || '').trim();
  const a = authors.sourceAuthor(item?.author || '', src, 'fr');
  if (!a || authors.isEditorialPlaceholder(a, 'fr') || a.toLowerCase() === src.toLowerCase()) return src;
  return src ? `${a} · ${src}` : a;
}
const ymdOf = d => front.mtlYmd(d);
const hasImg = it => Boolean(it && !it._feedNoImage && (it.imageLocal || it.image || it.stockImage));

/**
 * Sélection d'un créneau. `news` = news.json, `state` = data/social/une-state.json.
 * Retourne { items (normalisés), lead, ids, skip?, why, doubts }.
 */
export function selectUne(news, slot, { now = Date.now(), state = {}, max = 4, pool = 9, maxNewsAgeH = 6 } = {}) {
  const raw = Array.isArray(news) ? news : news?.items || [];
  const doubts = [];
  const updated = Date.parse(news?.updated || '');
  if (!Number.isFinite(updated) || (now - updated) / 3600e3 > maxNewsAgeH) doubts.push(`news.json trop ancien ou sans date (${Number.isFinite(updated) ? Math.round((now - updated) / 3600e3) + ' h' : 'inconnu'})`);
  const picked = front.selectFrontPage(raw, new Date(now), null, pool, 'jour').items;
  const seen = new Set(previousKeys(slot).flatMap(k => state[k]?.ids || []));
  let cand = picked.filter(it => { const id = front.articleId(it.link); return id && !seen.has(id) && Date.parse(it.date || 0) <= now; });
  if (slot.id === 'soir') cand = cand.filter(it => ymdOf(it.date) === slot.day);
  cand = cand.slice(0, max);
  const li = cand.findIndex(hasImg); if (li > 0) cand = [cand[li], ...cand.slice(0, li), ...cand.slice(li + 1)];
  const items = cand.map(it => ({ ...front.normalize(it, '..'), lang: it.lang || detectLang({ title: it.title }), place: institutionLabel(it), placeColor: institutionColor(it.institution), sport: sportEmoji(it), byline: byline(it), tag: institutionTag({ source: it.source, title: it.title, desc: it.excerpt || '' }), siteImage: siteImage(it) })).filter(x => x.id);
  const skip = !items.length;
  const why = skip ? (slot.id === 'soir' ? 'rien de nouveau depuis le matin : publication sautée' : 'aucun article nouveau à la une : publication sautée') : `${items.length} article(s)`;
  return { items, lead: items[0] || null, ids: items.map(x => x.id), skip, why, doubts, available: picked.length };
}
/** Établissement en français (publications en français seulement ; aucun logo d'université). */
const FR_INSTITUTIONS = {
  'concordia university': 'Université Concordia', 'mcgill university': 'Université McGill', "bishop's university": "Université Bishop's",
  'dawson college': 'Collège Dawson', 'vanier college': 'Collège Vanier', 'john abbott college': 'Collège John-Abbott', 'champlain college': 'Collège Champlain',
  'université du québec à montréal (uqam)': 'UQAM', 'university of new brunswick': 'Université du Nouveau-Brunswick', 'université du québec à trois-rivières': 'UQTR',
};
export function institutionLabel(it) {
  const raw = String(it?.institution || '').replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const hit = FR_INSTITUTIONS[raw.toLowerCase()];
  if (hit) return hit;
  return /\b(university|college)\b/i.test(raw) ? '' : raw; // nom anglais inconnu : on ne l'affiche pas plutôt que d'afficher de l'anglais
}
/** Émoji du sport étudiant (titre ou extrait) ; '' si l'article n'est pas sportif. */
const SPORT_EMOJI = { '#Football': '🏈', '#Hockey': '🏒', '#Basketball': '🏀', '#Volleyball': '🏐', '#Soccer': '⚽', '#Rugby': '🏉', '#Natation': '🏊', '#Athlétisme': '🏃' };
const D3 = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], M3 = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** « jeu. 12 nov. » (date absolue, jamais « aujourd'hui » ni « hier »). */
export function frShort(ymd) { const [y, m, d] = ymd.split('-').map(Number); return `${D3[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()]} ${d === 1 ? '1er' : d} ${M3[m - 1]}`; }
/** « 19 h », « 19 h 30 ». */
export const frHour = t => { const [h, m] = String(t || '').split(':').map(Number); return Number.isFinite(h) ? `${h} h${m ? ' ' + String(m).padStart(2, '0') : ''}` : ''; };
const SEX = { M: 'H', F: 'F', X: 'mixte' };
const CODE_EMOJI = { football: '🏈', 'flag-football': '🏈', hockey: '🏒', basketball: '🏀', volleyball: '🏐', 'volleyball-plage': '🏐', soccer: '⚽', 'soccer-interieur': '⚽', futsal: '⚽', rugby: '🏉', natation: '🏊', athletisme: '🏃', 'cross-country': '🏃', badminton: '🏸', voile: '⛵', golf: '⛳', tennis: '🎾', ultimate: '🥏', curling: '🥌', ski: '⛷️', baseball: '⚾' };
export const sportCodeEmoji = code => CODE_EMOJI[String(code || '').toLowerCase()] || '🏅';
const SHORT_INST = { 'Université Laval': 'Laval', 'Université de Montréal': 'Montréal', 'Université de Sherbrooke': 'Sherbrooke', 'Université McGill': 'McGill', 'Université Concordia': 'Concordia', "Université Bishop's": "Bishop's", 'Université du Québec à Montréal': 'UQAM', 'Université du Québec à Trois-Rivières': 'UQTR', 'Université du Québec à Chicoutimi': 'UQAC', 'Université du Québec à Rimouski': 'UQAR', 'Université du Québec en Outaouais': 'UQO', 'École de technologie supérieure': 'ÉTS', 'Université du Nouveau-Brunswick': 'UNB' };
export const teamLabelFor = (nick, inst) => teamLabel(nick, inst);
function teamLabel(nick, inst) {
  const sub = ((String(inst || '').match(/\s+—\s+(.*)$/) || [])[1] || '').replace(/^campus\s+/i, ''); // ex. « équipe Blanc » : deux équipes du même cégep
  const i = String(inst || '').replace(/\s+—\s+.*$/, '').trim();
  const fr = FR_INSTITUTIONS[i.toLowerCase()] || i;
  const short = SHORT_INST[fr] || fr.replace(/^(Cégep|Collège) (de |du |d’|d')?/, '').replace(/\s*\b(College|University|Cégep|Collège)\b\s*/gi, ' ').replace(/\s+/g, ' ').trim(); // aucun « College » anglais
  const ap = x => String(x || '').replace(/'/g, '’').trim();
  return { name: ap(nick || short), inst: nick ? ap(short + (sub ? `, ${sub}` : '')) : '', color: institutionColor(inst) || institutionColor(fr) || institutionColor(short) };
}
/**
 * Résultats sportifs étudiants récents (sports-masthead.json du site, RSEQ) : une rencontre par gameId, score connu,
 * saison en cours, jouée dans les `days` jours civils précédant `day` (Montréal). Universitaire d'abord, puis le plus récent.
 * Repli : rencontres prévues aujourd'hui (sans score). Rien d'inventé : sans donnée récente, liste vide.
 */
export function pickSports(masthead, day, { max = 6, days = 2, nextDays = 3, afterToday = false } = {}) {
  const teams = Object.values(masthead?.teams || {}), seen = new Set(), res = [], next = [];
  const from = addDays(day, -days), until = addDays(day, nextDays);
  for (const t of teams) {
    if (!t || !t.sport) continue;
    const me = teamLabel(t.nickname, t.institutionLabel || t.fullName || t.name);
    const label = `${t.sportLabel || t.sport}${SEX[t.sex] ? ` (${SEX[t.sex]})` : ''}`;
    const base = { emoji: sportCodeEmoji(t.sport), sport: label, league: t.leagueLabel || '', uni: t.sector === 'universitaire' };
    for (const g of t.results || []) {
      const id = g.gameId || `${t.id}:${g.date}`;
      if (seen.has(id) || g.priorSeason || g.scoreFor == null || g.scoreAgainst == null || !g.date || g.date < from || g.date > day) continue;
      seen.add(id);
      const op = teamLabel(g.opponentNickname, g.opponentFullName || g.opponent);
      if (!me.name || !op.name) continue;
      const a = { ...me, score: Number(g.scoreFor) }, b = { ...op, score: Number(g.scoreAgainst) };
      res.push({ ...base, kind: 'resultat', gameId: g.gameId || '', date: g.date, when: `Final · ${frShort(g.date)}`, teams: a.score >= b.score ? [a, b] : [b, a], tie: a.score === b.score });
    }
    for (const g of t.nextGames || []) {
      const id = g.gameId || `${t.id}:${g.date}:${g.time}`;
      if (seen.has('n' + id) || !g.date || g.date < day || g.date > until || (afterToday && g.date === day)) continue;
      seen.add('n' + id);
      const op = teamLabel(g.opponentNickname, g.opponentFullName || g.opponent);
      if (!me.name || !op.name) continue;
      // Comme sur le site : « Équipe reçoit Adversaire » à domicile, « Équipe visite Adversaire » à l'étranger.
      next.push({ ...base, kind: 'avenir', gameId: g.gameId || '', date: g.date, when: [frShort(g.date), frHour(g.time)].filter(Boolean).join(' · '), teams: [me, op], verb: g.home ? 'reçoit' : 'visite', time: g.time || '' });
    }
  }
  const vary = list => { const seenL = new Set(), first = [], more = []; for (const r of list) (seenL.has(r.league) ? more : first).push(r), seenL.add(r.league); return [...first, ...more]; };
  const results = vary(res.sort((x, y) => (y.uni - x.uni) || String(y.date).localeCompare(String(x.date)))).slice(0, max);
  const upcoming = vary(next.sort((x, y) => String(x.date).localeCompare(String(y.date)) || (y.uni - x.uni) || String(x.time).localeCompare(String(y.time)))).slice(0, max)
    .sort((x, y) => String(x.date).localeCompare(String(y.date)) || String(x.time).localeCompare(String(y.time)));
  return { results, next: upcoming };
}
const team = t => `${t.name}${t.inst ? ` (${t.inst})` : ''}`;
/** Ligne texte : « 🏀 Basketball (F) · Stingers (Concordia) 55-54 Martlets (McGill) · Final · jeu. 12 nov. ». */
export const sportsLine = r => r.kind === 'resultat'
  ? `${r.emoji} ${r.sport} · ${team(r.teams[0])} ${r.teams[0].score}-${r.teams[1].score} ${team(r.teams[1])} · ${r.when}`
  : `${r.emoji} ${r.sport} · ${team(r.teams[0])} ${r.verb} ${team(r.teams[1])} · ${r.when}`;

// ── Radio étudiante : émissions à venir (radio-schedules.json, grille hebdo, day = 0 dimanche … 6 samedi, heure de Montréal) ──
const seeded = str => { let h = 1779033703 ^ str.length; for (const c of str) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); } return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; };
/**
 * Émissions de radio étudiante à venir, tirées au hasard (graine = date) : matin → émissions du jour après l'heure du créneau,
 * soir → émissions du lendemain. Une par station d'abord, de 7 h à 23 h, sans reprise ni bouche-trou. Rien si aucune grille.
 */
export function pickRadio(schedules, slot, { max = 3 } = {}) {
  const day = slot.id === 'soir' ? addDays(slot.day, 1) : slot.day;
  const [y, m, d] = day.split('-').map(Number), dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  const after = slot.id === 'soir' ? 7 * 60 : Math.max(7 * 60, hm(slot.target || '07:45'));
  const rnd = seeded(`radio:${day}`), byStation = [];
  for (const st of Object.values(schedules?.stations || {})) {
    const shows = (st.grid || []).filter(g => g.day === dow && g.title && hm(g.start) >= after && hm(g.start) <= 23 * 60
      && !/\breprise\b|\brediffusion\b|^(les nuits|late night|.*\blate night\b|musique|programmation musicale)/i.test(g.title) && !/^(CJLO|CKUT|CISM|CHYZ|CFAK|CHOQ)\b.*(late|nuit)/i.test(g.title));
    if (!shows.length || !st.name) continue;
    const pick = shows[Math.floor(rnd() * shows.length)];
    byStation.push({ emoji: '📻', title: pick.title.trim(), station: st.name, date: day, start: pick.start, when: `${frShort(day)} · ${frHour(pick.start)}`, r: rnd() });
  }
  return byStation.sort((a, b) => a.r - b.r).slice(0, max).sort((a, b) => hm(a.start) - hm(b.start)).map(({ r, ...x }) => x);
}
/** « 📻 Punk-o-rama · CHYZ 94,3 · ven. 13 nov. · 11 h ». */
export const radioLine = x => `${x.emoji} ${x.title} · ${x.station} · ${x.when}`;

/** Typographie française pour l'affichage : apostrophe courbe, guillemets « », espaces fines insécables avant ; : ! ? et dans les guillemets. */
export function frTypo(s) {
  return String(s || '').replace(/'/g, '’').replace(/"([^"]+)"/g, '« $1 »')
    .replace(/\s+([;!?»])/g, '\u202F$1').replace(/(\S)([;!?])(?=\s|$)/g, '$1\u202F$2').replace(/\s+:(\s|$)/g, '\u00A0:$1')
    .replace(/«\s*/g, '«\u202F').replace(/\u202F»/g, '\u202F»').replace(/\s+…/g, '…').replace(/ {2,}/g, ' ').trim();
}
export const sportEmoji = it => SPORT_EMOJI[sportTagOf([it?.title, it?.excerpt].filter(Boolean).join(' '))] || '';

/**
 * Français seulement : un article en anglais passe par le module de traduction du Radar (translate.js, injecté par
 * `translate(texte)`) pour son titre et son résumé. Échec, écho de l'original ou résultat encore anglais : l'article est
 * exclu (jamais d'anglais publié). Auteurs et médias inchangés. « week-end » → « fin de semaine ».
 */
export async function frenchOnly(items, translate) {
  const kept = [], excluded = [];
  const ART = { ce: 'cette', le: 'la', un: 'une', du: 'de la', au: 'à la', dernier: 'dernière', prochain: 'prochaine' };
  const fdS = t => String(t || '')
    .replace(/\b(ce|le|un|du|au|dernier|prochain)\s+week-?end\b/gi, (m, a) => { const r = ART[a.toLowerCase()]; return (a[0] === a[0].toUpperCase() ? r[0].toUpperCase() + r.slice(1) : r) + ' fin de semaine'; })
    .replace(/\b(les|des|ces)\s+week-?ends\b/gi, '$1 fins de semaine')
    .replace(/\bweek-?ends?\b/gi, m => /s$/i.test(m) ? 'fins de semaine' : 'fin de semaine');
  for (const x of items) {
    const en = x.lang === 'en' || detectLang({ title: x.title }) === 'en';
    if (!en) { kept.push({ ...x, title: fdS(x.title), hook: fdS(x.hook) }); continue; }
    let title = '', hook = '';
    try {
      title = String(await translate(x.title) || '').trim();
      if (x.hook) { hook = String(await translate(x.hook) || '').trim(); if (!hook || hook === x.hook || detectLang({ title: hook }) === 'en') hook = ''; }
    } catch { title = ''; }
    if (!title || title === x.title.trim() || detectLang({ title }) === 'en') { excluded.push({ id: x.id, title: x.title, why: 'traduction indisponible' }); continue; }
    if (!/[.]$/.test(x.title.trim())) title = title.replace(/\.$/, '');
    kept.push({ ...x, originalTitle: x.title, title: fdS(title), hook: fdS(hook), translated: true, lang: 'fr' });
  }
  return { kept, excluded };
}
/** Au plus `max` articles, la une étant le premier qui a une photo. */
export function finalizeItems(items, max = 4) {
  let out = items.slice(0, max);
  const li = out.findIndex(x => x.image || x.siteImage); if (li > 0) out = [out[li], ...out.slice(0, li), ...out.slice(li + 1)];
  return out;
}

/** Image publique de l'article sur le-radar.ca (repli si l'hébergement de l'affiche échoue). */
export function siteImage(it) {
  const local = String(it?.imageLocal || '');
  if (/^assets\/news-images\//.test(local)) return `${SITE}/${local}`;
  const u = String(it?.image || it?.stockImage || ''); return /^https:\/\//.test(u) ? u : '';
}

const FR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const FR_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
/** « jeudi 12 novembre » (jour civil Montréal). */
export function frDay(ymd) {
  const [y, m, d] = ymd.split('-').map(Number), wd = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return `${FR_DAYS[wd]} ${d === 1 ? '1er' : d} ${FR_MONTHS[m - 1]}`;
}

// ── Textes ───────────────────────────────────────────────────────────────────
export const HOME = `${SITE}/`;
const BASE_TAGS = ['#MédiasÉtudiants', '#Québec'];
/** Hashtags : #MédiasÉtudiants, établissements présents, #Québec ; plafonds de policy.json (hashtags.maxByNetwork). */
export function uneTags(items, max) {
  if (!(max > 0)) return [];
  const inst = [...new Set(items.map(x => x.tag).filter(Boolean))];
  const out = [BASE_TAGS[0], ...inst, BASE_TAGS[1]].filter((t, i, a) => a.indexOf(t) === i);
  if (max >= 2 && out.length > max) return [...out.slice(0, max - 1), BASE_TAGS[1]].filter((t, i, a) => a.indexOf(t) === i).slice(0, max);
  return out.slice(0, max);
}
/** Étiquettes Tumblr (sans #, 10 à 15). */
export function uneTumblrTags(items) {
  const t = ['le radar', 'la une', 'médias étudiants', 'presse étudiante', 'journalisme étudiant', 'québec', 'quebec', 'université', 'vie étudiante', 'actualités'];
  for (const x of items) { t.push(String(x.source || '').toLowerCase()); if (x.tag) t.push(x.tag.slice(1).toLowerCase()); }
  return [...new Set(t.map(s => s.replace(/[#,]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 15);
}
const clip = (s, n) => { const a = [...s]; return a.length <= n ? s : a.slice(0, n - 1).join('').replace(/[\s,;:.–—-]+$/, '') + '…'; };

/**
 * Texte d'un réseau. Réseaux longs (Mastodon, Tumblr, Facebook, LinkedIn) : un lien par article.
 * Réseaux courts (X, Bluesky) : titres + signatures, un seul lien (l'article si un seul titre, sinon l'accueil).
 * Si le texte dépasse la limite : on retire des articles (jamais la une), puis des hashtags, puis on raccourcit les titres.
 */
/** Instagram (préparé, désactivé) : légende ≤ 2200, aucun lien cliquable, « lien en bio ». */
export const IG_SPEC = { limit: 2200, len: s => [...String(s)].length, subheaders: true, nolink: true };
const SPORTS_NETS = new Set(['facebook', 'linkedin', 'tumblr', 'instagram']);
export function buildUneText(model, net, spec = net === 'instagram' ? IG_SPEC : NET_SPEC[net], { tags = [] } = {}) {
  const len = spec.len || xlen, long = !!spec.subheaders;
  const head = `${model.slot.emoji} ${model.slot.label} du Radar · ${frDay(model.slot.day)}`;
  const compose = (items, hash, cut, sports, radio) => {
    const T = x => cut ? clip(x.title, cut) : x.title;
    let body;
    if (spec.nolink) {
      body = items.map((x, i) => `${i + 1}. ${x.sport ? x.sport + ' ' : ''}${T(x)}\n✍️ ${x.byline}`).join('\n\n');
    } else if (long) {
      body = items.map((x, i) => `${i + 1}. ${x.sport ? x.sport + ' ' : ''}${T(x)}\n✍️ ${x.byline}\n${x.pageUrl}`).join('\n\n');
    } else {
      body = items.map(x => `${x.sport || '▪️'} ${T(x)} — ${x.byline}`).join('\n') + '\n\n' + (items.length === 1 ? items[0].pageUrl : HOME);
    }
    if (sports.length) body += '\n\n🏟️ Sport étudiant :\n' + sports.map(sportsLine).join('\n');
    if (radio.length) body += '\n\n📻 À l’écoute (radio étudiante) :\n' + radio.map(x => `${x.title} · ${x.station} · ${x.when}`).join('\n');
    if (spec.nolink) body += '\n\nToute la une : lien en bio (le-radar.ca)';
    else if (long) body += `\n\nToute la une : ${HOME}`;
    return [head, body, hash.join(' ')].filter(Boolean).join('\n\n');
  };
  let items = [...model.items], hash = [...tags], cut = 0, sports = SPORTS_NETS.has(net) ? [...(model.sports?.results || []).slice(0, 3), ...(model.sports?.next || []).slice(0, 2)] : [], radio = SPORTS_NETS.has(net) ? [...(model.radio || [])] : [];
  for (;;) {
    const t = compose(items, hash, cut, sports, radio);
    if (len(t) <= spec.limit) return t;
    if (radio.length) { radio = radio.slice(0, -1); continue; }
    if (sports.length) { sports = sports.slice(0, -1); continue; }
    if (items.length > 1) { items = items.slice(0, -1); continue; }
    if (hash.length > 1) { hash = hash.slice(0, -1); continue; }
    cut = cut ? cut - 10 : 120; if (cut < 30) return null;
  }
}
/** Texte alternatif de l'image (≤ 1000 caractères). */
export function altText(model) {
  const [lead, ...rest] = model.items;
  let s = `Affiche « ${model.slot.label} » du Radar, ${frDay(model.slot.day)}. À la une : ${lead.title}, par ${lead.byline.replace(' · ', ', ')}.`;
  if (rest.length) s += ` Aussi : ${rest.map(x => `${x.title} (${x.byline.replace(' · ', ', ')})`).join(' ; ')}.`;
  return clip(s + ' Lire sur le-radar.ca.', 1000);
}
/** Contrôles avant envoi : limite, aucune mention @, aucun « week-end », lien le-radar.ca, titre de la une présent. */
export function checkUneText(text, net, model, spec = net === 'instagram' ? IG_SPEC : NET_SPEC[net]) {
  const p = [], len = spec.len || xlen;
  if (!text) return ['texte vide'];
  if (len(text) > spec.limit) p.push(`trop long (${len(text)}/${spec.limit})`);
  if (/(^|[\s(])@[\w.]+/.test(text)) p.push('mention @ interdite');
  const own = model.items.reduce((t, x) => t.split(x.title).join(' '), text).replace(/https?:\/\/\S+/g, ' ');
  if (/week-?end/i.test(own)) p.push('« week-end » interdit (écrire « fin de semaine »)');
  if (spec.nolink) { if (/https?:\/\//.test(text)) p.push('lien cliquable interdit (Instagram)'); if (!/lien en bio/.test(text)) p.push('« lien en bio » manquant'); }
  else if (!/https:\/\/le-radar\.ca\//.test(text)) p.push('lien le-radar.ca manquant');
  if (/undefined|NaN|\[object|null/.test(text)) p.push('valeur invalide');
  const leadStart = [...model.items[0].title].slice(0, 20).join('');
  if (!text.includes(leadStart)) p.push('titre de la une absent');
  return p;
}
/** Tous les textes d'un créneau. `maxByNetwork` : plafonds de hashtags. */
export function buildUneAll(model, maxByNetwork = {}) {
  const out = {};
  for (const n of [...NETS, ...PREPARED_NETS]) {
    const spec = n === 'instagram' ? IG_SPEC : NET_SPEC[n], tags = n === 'tumblr' ? [] : uneTags(model.items, maxByNetwork[n] ?? (n === 'instagram' ? 5 : 2));
    const text = buildUneText(model, n, spec, { tags });
    out[n] = { text, tags: n === 'tumblr' ? uneTumblrTags(model.items) : tags, len: text ? spec.len(text) : 0, limit: spec.limit, image: IMAGE_FOR[n] + (STORY_FOR[n] ? ' + ' + STORY_FOR[n] : ''), problems: checkUneText(text, n, model, spec) };
  }
  return out;
}

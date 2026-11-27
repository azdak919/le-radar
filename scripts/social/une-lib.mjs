// « La une du matin » et « La une du soir » : logique pure (testée dans tests/social-une.mjs).
//  - créneaux en heure de Montréal (America/Toronto, heure d'été et d'hiver gérées par Intl) ;
//  - sélection = articles du créneau (pas encore publiés ; le soir, le jour civil seulement), un siège par média.
//    La première carte reste le plus récent. Une rafale ne remplit une carte restante que s'il en reste.
//    Même filtres que l'affiche (fraîcheur, avis de ménage, sport pro), sans son plafond de 9 ni son horizon de 14 jours ;
//  - anti-doublon : un article déjà publié dans un créneau récent n'est jamais repris ; le soir ne garde que les
//    nouveautés de la journée et saute la publication s'il n'y en a aucune ;
//  - textes par réseau en français, titres + auteurs (tous, sinon le média seul), liens le-radar.ca, hashtags, aucune mention @ ;
//  - 2e ligne optionnelle vers l’édition de la revue du jour, seulement si la page publique existe (jamais une carte ni une image).
// Aucune publication ici.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { torontoDay } from './policy.mjs';
import { xlen, SITE, isRevueLink } from './lib.mjs';
import { NET_SPEC } from './formats.mjs';
import { institutionTag, sportTagOf, xArticleTags } from './hashtags.mjs';
import { detectLang } from './lib.mjs';

const require = createRequire(import.meta.url);
const front = require('../magazine-front-page-lib.js');
let BRAND = {}; try { BRAND = require('../../brand-colors.json').institutions || {}; } catch {}
/* Couleur d'établissement : même module que l'outil d'affiches, source unique brand-colors.json (couleurs + alias). */
const IC = require('../institution-color-lib.js');
const INST_LABELS = require('../institution-labels-lib.js');
const ACRONYM_MAP = INST_LABELS.buildAcronymMap();
/** Couleur officielle de l'établissement (brand-colors.json du site) ; '' si inconnue. */
export function institutionColor(name) {
  const raw = String(name || '').trim(); if (!raw) return '';
  return IC.institutionColor(raw, BRAND) || IC.institutionColor(FR_INSTITUTIONS[raw.toLowerCase()] || '', BRAND);
}
const authors = require('../author-lib.js');

export const NETS = ['bluesky', 'mastodon', 'x', 'tumblr', 'facebook', 'linkedin', 'threads'];
export const SLOTS = {
  matin: { id: 'matin', label: 'La une du matin', emoji: '☀️', target: '07:45', from: '07:30', to: '10:30' },
  soir: { id: 'soir', label: 'La une du soir', emoji: '🌙', target: '19:30', from: '19:15', to: '22:30' },
};
/** Réseaux préparés mais désactivés tant que le compte et l'accès ne sont pas configurés (policy.json formats.une.prepared). */
export const PREPARED_NETS = ['instagram'];
/**
 * Format d'image par réseau (revue du 12 nov. 2026, docs/social-engagement.md) : le portrait 4:5 s'affiche sans recadrage
 * pour une image seule dans les fils mobiles de X, Bluesky (recadre seulement au-delà de 1:2), Mastodon (4.x, ratio natif),
 * LinkedIn, Facebook et Tumblr. Instagram : une 3:4 1080×1440 (format grille, modèle B). Jamais de story ni de reel.
 * Le paysage 16:9 reste rendu en aperçu (repli), sans réseau attitré.
 */
export const IMAGE_FOR = { facebook: 'portrait', tumblr: 'portrait', x: 'portrait', bluesky: 'portrait', mastodon: 'portrait', linkedin: 'portrait', instagram: 'grille' };
// Story 9:16 : Facebook par le canal Buffer de la page ; Instagram par son propre canal (passe dédiée de une-run.mjs).
export const STORY_FOR = { facebook: 'story' };
/** Réseaux où la story de La une part (formats.une.story.networks ; défaut : Facebook et Instagram). */
export const storyNets = (cfg) => (Array.isArray(cfg?.story?.networks) ? cfg.story.networks : ['facebook', 'instagram']).filter(n => n === 'facebook' || n === 'instagram');
export const IMAGE_SIZES = { portrait: { width: 1080, height: 1350 }, grille: { width: 1080, height: 1440 }, article: { width: 1080, height: 1440 }, 'article-portrait': { width: 1080, height: 1350 }, paysage: { width: 1200, height: 675 }, story: { width: 1080, height: 1920 }, 'match-story': { width: 1080, height: 1920 } };
/** Post d’un seul article (modèle v6) sur tous les réseaux. Les unes matin/soir automatiques : IMAGE_FOR (portrait 4:5 / grille Instagram 3:4 modèle B). */
export const ARTICLE_IMAGE_FOR = { instagram: 'article', facebook: 'article-portrait', tumblr: 'article-portrait', x: 'article-portrait', bluesky: 'article-portrait', mastodon: 'article-portrait', linkedin: 'article-portrait' };
export const articleFormatsFor = (nets) => [...new Set((nets || []).map((n) => ARTICLE_IMAGE_FOR[n]).filter(Boolean))];
/** Formats à rendre pour une liste de réseaux (aperçu : tous). */
// Story 9:16 : publication DÉSACTIVÉE par défaut (décision de Charles, 13 nov. 2026 : refonte à valider). Seul
// formats.une.story.publish === true dans data/social/policy.json la réactive ; l'aperçu (DRY_RUN) la rend toujours.
export const storyEnabled = (cfg) => cfg?.story?.publish === true;
export const formatsFor = (nets, all = false, { story = false } = {}) => all ? ['portrait', 'story', 'paysage']
  : [...new Set(nets.flatMap(n => [IMAGE_FOR[n], (story && n !== 'instagram') ? STORY_FOR[n] : null]).filter(Boolean))];
/** Poids maximal d'une image (Bluesky : 976 Ko ; X : 5 Mo ; Mastodon : 8 Mo ; Facebook, LinkedIn, Tumblr : plus). */
export const MAX_IMAGE_BYTES = 950 * 1024;

const hm = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
/** Minutes depuis minuit, heure de Montréal. */
export function torontoMinutes(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(x => [x.type, x.value]));
  return +p.hour * 60 + +p.minute;
}
export const slotKey = (day, slot) => `${day}:${slot}`;
/** Instant (ms) d'une heure de Montréal « HH:MM » le jour « AAAA-MM-JJ » (heure normale ou avancée). */
export function montrealInstant(day, hhmm) {
  const [y, m, d] = String(day).split('-').map(Number), [h, mi] = String(hhmm).split(':').map(Number);
  for (const off of [5, 4]) { const t = Date.UTC(y, m - 1, d, h + off, mi); if (torontoMinutes(t) === h * 60 + mi && torontoDay(t) === day) return t; }
  return Date.UTC(y, m - 1, d, h + 5, mi);
}
/** Programmer dans Buffer à `hhmm` (heure encore à venir de plus de 2 min) ou publier tout de suite. */
export function bufferWhen(day, hhmm, now = Date.now()) {
  if (!hhmm) return { now: true };
  const due = montrealInstant(day, hhmm);
  return due - now > 2 * 60e3 ? { dueAt: new Date(due).toISOString() } : { now: true };
}
const isWeekend = (day) => [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
/**
 * Réseaux de La une pour un créneau. `netTimes[créneau][réseau]` : heure de Montréal propre au réseau (programmée dans
 * Buffer), `null` = pas de une ce créneau sur ce réseau (ex. Facebook le soir : la revue la remplace) ; absent = à l'heure
 * du créneau. `weekdaysOnly` : rien le samedi ni le dimanche. L'édition « Jour de match » (ponctuelle) garde tous les réseaux.
 */
export function uneNets(slot, base = [], cfg = {}) {
  if (!slot || String(slot.key || '').endsWith(':jourdematch')) return base;
  const times = cfg.netTimes?.[slot.id] || {};
  return base.filter((n) => times[n] !== null && !(isWeekend(slot.day) && (cfg.weekdaysOnly || []).includes(n)));
}
/** Heure propre d'un réseau pour ce créneau (ou '' = heure du créneau). */
export const uneNetTime = (slot, net, cfg = {}) => (String(slot?.key || '').endsWith(':jourdematch') ? '' : (cfg.netTimes?.[slot?.id] || {})[net] || '');
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

/**
 * Un siège par média (pas par établissement), le plus récent d'abord.
 * Les cartes qui restent vont aux articles suivants, par date. Le résultat est reclassé par date :
 * la première place est donc le plus récent du lot, même s'il n'a pas de photo.
 * `max` non fini : la liste complète, par date.
 */
export function seatBySource(items, max = 4) {
  const sorted = [...items].sort((a, b) => Date.parse(b?.date || 0) - Date.parse(a?.date || 0));
  const cap = Number.isFinite(Number(max)) ? Math.max(0, Number(max)) : sorted.length;
  if (!cap) return [];
  const seen = new Set();
  const primary = [];
  const rest = [];
  for (const it of sorted) {
    const src = String(it?.source || '').trim();
    if (seen.has(src)) rest.push(it);
    else { seen.add(src); primary.push(it); }
  }
  const chosen = primary.slice(0, cap);
  if (chosen.length < cap) chosen.push(...rest.slice(0, cap - chosen.length));
  return chosen.sort((a, b) => Date.parse(b?.date || 0) - Date.parse(a?.date || 0));
}

/**
 * Sélection d'un créneau. `news` = news.json, `state` = data/social/une-state.json.
 * Retourne { items (normalisés), lead, ids, skip?, why, doubts }.
 */
export function selectUne(news, slot, { now = Date.now(), state = {}, max = 4, maxNewsAgeH = 6 } = {}) {
  // La revue n'entre jamais dans la sélection de La une (ni carte, ni image). Un lien texte peut figurer en 2e ligne du post, seulement si l'édition du jour existe (revueEditionLine).
  const raw = (Array.isArray(news) ? news : news?.items || []).filter(it => !isRevueLink(it?.link));
  const doubts = [];
  const updated = Date.parse(news?.updated || '');
  if (!Number.isFinite(updated) || (now - updated) / 3600e3 > maxNewsAgeH) doubts.push(`news.json trop ancien ou sans date (${Number.isFinite(updated) ? Math.round((now - updated) / 3600e3) + ' h' : 'inconnu'})`);
  // Infinity : toute la fenêtre admissible (fraîcheur, ménage, sport pro), pas les 9 plus récents de l'affiche.
  const picked = front.selectFrontPage(raw, new Date(now), null, Infinity, 'jour').items;
  const seen = new Set(previousKeys(slot).flatMap(k => state[k]?.ids || []));
  let cand = picked.filter(it => { const id = front.articleId(it.link); return id && !seen.has(id) && Date.parse(it.date || 0) <= now; });
  if (slot.id === 'soir') cand = cand.filter(it => ymdOf(it.date) === slot.day);
  const available = cand.length;
  cand = seatBySource(cand, max);
  const items = cand.map(it => ({ ...front.normalize(it, '..'), lang: it.lang || detectLang({ title: it.title }), place: unePlaceLabel(it), placeColor: institutionColor(it.institution), sport: sportEmoji(it), byline: byline(it), tag: institutionTag({ source: it.source, title: it.title, desc: it.excerpt || '' }), siteImage: siteImage(it) })).filter(x => x.id);
  const skip = !items.length;
  const why = skip ? (slot.id === 'soir' ? 'rien de nouveau depuis le matin : publication sautée' : 'aucun article nouveau à la une : publication sautée') : `${items.length} article(s)`;
  return { items, lead: items[0] || null, ids: items.map(x => x.id), skip, why, doubts, available };
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
/** Sigle d’établissement pour l’image de La une (UdeM, ULaval, Bishop’s) ; même table que le sport. */
export function unePlaceLabel(it) {
  const full = institutionLabel(it);
  const short = institutionSigle(it?.institution) || institutionSigle(full) || full;
  return String(short || '').replace(/'/g, '’').trim();
}
/** Émoji du sport étudiant (titre ou extrait) ; '' si l'article n'est pas sportif. */
const SPORT_EMOJI = { '#Football': '🏈', '#Hockey': '🏒', '#Basketball': '🏀', '#Volleyball': '🏐', '#Soccer': '⚽', '#Rugby': '🏉', '#Natation': '🏊', '#Athlétisme': '🏃' };
const D3 = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], M3 = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** « jeu. 12 nov. » (date absolue, jamais « aujourd'hui » ni « hier »). */
export function frShort(ymd) { const [y, m, d] = ymd.split('-').map(Number); return `${D3[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()]} ${d === 1 ? '1er' : d} ${M3[m - 1]}`; }
/** « 19 h », « 19 h 30 ». */
export const frHour = t => { const m = String(t || '').trim().match(/^(\d{1,2})(?::(\d{2}))?$/); if (!m) return ''; const min = Number(m[2] || 0); return `${Number(m[1])} h${min ? ' ' + String(min).padStart(2, '0') : ''}`; };
const SEX = { M: 'H', F: 'F', X: 'mixte' };
const CODE_EMOJI = { football: '🏈', 'flag-football': '🏈', hockey: '🏒', basketball: '🏀', volleyball: '🏐', 'volleyball-plage': '🏐', soccer: '⚽', 'soccer-interieur': '⚽', futsal: '⚽', rugby: '🏉', natation: '🏊', athletisme: '🏃', 'cross-country': '🏃', badminton: '🏸', voile: '⛵', sailing: '⛵', golf: '⛳', tennis: '🎾', ultimate: '🥏', curling: '🥌', ski: '⛷️', baseball: '⚾', cheerleading: '📣' };
export const sportCodeEmoji = code => CODE_EMOJI[String(code || '').toLowerCase()] || '🏅';
const foldInst = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/['’]/g, "'").replace(/\s+/g, ' ').trim();
const ACRONYM_FOLD = Object.fromEntries(Object.entries(ACRONYM_MAP).map(([k, v]) => [foldInst(k), v]));
/** Sigle officiel (UdeM, ULaval, UdeS, UNB…) ; table partagée institution-labels-lib.js. */
export function institutionSigle(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  return ACRONYM_MAP[raw] || ACRONYM_FOLD[foldInst(raw)] || ACRONYM_FOLD[foldInst(FR_INSTITUTIONS[raw.toLowerCase()] || '')] || '';
}
export const teamLabelFor = (nick, inst) => teamLabel(nick, inst);
function teamLabel(nick, inst) {
  // Qualificatif d’équipe (« équipe Blanc ») à conserver ; le campus (ex. « campus Fredericton ») ne remplace pas le sigle.
  const rawSub = ((String(inst || '').match(/\s+—\s+(.*)$/) || [])[1] || '').trim();
  const sub = /équipe|team/i.test(rawSub) ? rawSub.replace(/^campus\s+/i, '') : '';
  const i = String(inst || '').replace(/\s+—\s+.*$/, '').trim();
  const fr = FR_INSTITUTIONS[i.toLowerCase()] || i;
  const short = institutionSigle(fr) || institutionSigle(i) || fr.replace(/^(Cégep|Collège) (de |du |d’|d')?/, '').replace(/\s*\b(College|University|Cégep|Collège)\b\s*/gi, ' ').replace(/\s+/g, ' ').trim(); // aucun « College » anglais
  const ap = x => String(x || '').replace(/'/g, '’').trim();
  return { name: ap(nick || short), inst: nick ? ap(short + (sub ? `, ${sub}` : '')) : '', color: institutionColor(inst) || institutionColor(fr) || institutionColor(short) };
}
/** Épreuve (régate, championnat) plutôt qu’un match à domicile ou à l’extérieur. */
function isEventGame(t, g) {
  const sport = String(t?.sport || g?.sport || '').toLowerCase();
  return g?.scoreKind === 'place' || sport === 'sailing' || sport === 'voile';
}
/** Clé de diversité : le code de sport, voile et sailing unifiés. Jamais le libellé « Basketball (H) ». */
function sportKeyOf(t) {
  const k = String(t?.sportKey || t?.sport || '').toLowerCase().replace(/\s*\([^)]*\)\s*$/, '');
  return k === 'voile' ? 'sailing' : k;
}
/** Place d’une régate, même forme que le site : « 1er/12 », « 2e/8 ». Vide si les données manquent. */
function placeText(g) {
  const n = Number(g?.scoreFor), field = Number(g?.scoreAgainst);
  if (!Number.isFinite(n) || n < 1 || !Number.isFinite(field) || field < 1) return '';
  return `${n === 1 ? '1er' : `${n}e`}/${field}`;
}
/** Lieu d’une épreuve (feuille CICSA : « Épreuve · lieu » dans opponentFullName) ; vide si absent. */
function venueOf(g) {
  const parts = String(g?.opponentFullName || '').split(/\s+·\s+/).map((x) => x.trim()).filter(Boolean);
  return parts.length > 1 ? parts.at(-1) : '';
}
/** Nom d’épreuve en français (déjà traduit dans le payload CICSA) ; jamais le sigle de lieu anglais. */
function eventLabel(g) {
  const fr = String(g?.opponent || '').trim();
  const looksEn = /nationals|championships?|regatta|invitational|\binvite\b|fleet race|team race|match race|\bWVYC\b/i;
  if (fr && !looksEn.test(fr)) return fr;
  try {
    const { sailingNameFr } = require('../cicsa-sailing-lib.js');
    const src = String(g?.opponentEn || g?.opponent || g?.opponentFullName || '').split(/\s*·\s*/)[0];
    return sailingNameFr(src) || fr;
  } catch {
    return fr;
  }
}

/**
 * Résultats sportifs étudiants récents (sports-masthead.json du site, RSEQ) : une rencontre par gameId,
 * saison en cours, jouée dans les `days` jours civils précédant `day` (Montréal). Universitaire d'abord, puis le plus récent.
 * Diversité par sport (pas par ligue) : un résultat par sport avant toute répétition ; même règle pour les à-venir.
 * Classement de régate (scoreKind « place », voile) : ligne avec épreuve et place, seulement si les deux sont connus.
 * Rien d'inventé : sans donnée récente, liste vide.
 */
export function pickSports(masthead, day, { max = 6, days = 2, nextDays = 3, afterToday = false } = {}) {
  const teams = Object.values(masthead?.teams || {}), seen = new Set(), res = [], next = [];
  const from = addDays(day, -days), until = addDays(day, nextDays);
  for (const t of teams) {
    if (!t || !t.sport) continue;
    const me = teamLabel(t.nickname, t.institutionLabel || t.fullName || t.name);
    const label = `${t.sportLabel || t.sport}${SEX[t.sex] ? ` (${SEX[t.sex]})` : ''}`;
    const base = { emoji: sportCodeEmoji(t.sport), sport: label, sportKey: sportKeyOf(t), league: t.leagueLabel || '', division: t.division || '', uni: t.sector === 'universitaire' };
    for (const g of t.results || []) {
      const id = g.gameId || `${t.id}:${g.date}`;
      if (seen.has(id) || g.priorSeason || !g.date || g.date < from || g.date > day) continue;
      if (isEventGame(t, g)) {
        const place = placeText(g);
        const event = eventLabel(g);
        if (!place || !event || !me.name) continue;
        seen.add(id);
        res.push({ ...base, kind: 'classement', gameId: g.gameId || '', date: g.date, when: frShort(g.date), teams: [me], event, place, verb: '' });
        continue;
      }
      if (g.scoreFor == null || g.scoreAgainst == null) continue;
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
      const when = [frShort(g.date), frHour(g.time)].filter(Boolean).join(' · ');
      // Régate ou épreuve (voile, classement par place) : pas un match aller-retour, donc pas de « visite ».
      if (isEventGame(t, g)) {
        const event = eventLabel(g);
        if (!me.name || !event) continue;
        next.push({ ...base, kind: 'avenir', gameId: g.gameId || '', date: g.date, when, teams: [{ ...me, reg: t.registryId || t.institutionId || '' }], verb: '', event, time: g.time || '', venue: venueOf(g) });
        continue;
      }
      const op = { ...teamLabel(g.opponentNickname, g.opponentFullName || g.opponent), reg: g.opponentRegistryId || '' };
      if (!me.name || !op.name) continue;
      // Comme sur le site : « Équipe reçoit Adversaire » à domicile, « Équipe visite Adversaire » à l'étranger.
      next.push({ ...base, kind: 'avenir', gameId: g.gameId || '', date: g.date, when, teams: [{ ...me, reg: t.registryId || t.institutionId || '' }, op], verb: g.home ? 'reçoit' : 'visite', time: g.time || '' });
    }
  }
  const vary = list => { const seenS = new Set(), first = [], more = []; for (const r of list) (seenS.has(r.sportKey) ? more : first).push(r), seenS.add(r.sportKey); return [...first, ...more]; };
  const results = vary(res.sort((x, y) => (y.uni - x.uni) || String(y.date).localeCompare(String(x.date)))).slice(0, max);
  // À-venir : tri date / universitaire / heure, puis diversité par sport. Pas de re-tri
  // chronologique ensuite, pour qu’un sport ne se répète pas avant les autres.
  const upcoming = vary(next.sort((x, y) => String(x.date).localeCompare(String(y.date)) || (y.uni - x.uni) || String(x.time).localeCompare(String(y.time)))).slice(0, max);
  return { results, next: upcoming };
}
const team = t => `${t.name}${t.inst ? ` (${t.inst})` : ''}`;
/** Sur Instagram : « Final » sans la date ; pour un match à venir, on garde l’heure et on n’écrit la date que si elle diffère du jour de la une. */
function compactSportsWhen(r, day) {
  if (r.kind === 'resultat') return 'Final';
  const time = r.time ? frHour(r.time) : '';
  if (r.date && day && r.date === day) return time || frShort(r.date);
  return [r.date ? frShort(r.date) : '', time].filter(Boolean).join(' · ') || r.when;
}
/** Ligne texte : « 🏀 Basketball (F) · Stingers (Concordia) 55-54 Martlets (McGill) · Final · jeu. 12 nov. ». */
export const sportsLine = (r, opts = {}) => {
  const when = opts.compact ? compactSportsWhen(r, opts.day) : r.when;
  return r.kind === 'resultat'
    ? `${r.emoji} ${r.sport} · ${team(r.teams[0])} ${r.teams[0].score}-${r.teams[1].score} ${team(r.teams[1])} · ${when}`
    : r.place
      ? `${r.emoji} ${r.sport} · ${team(r.teams[0])} · ${r.event} · ${r.place} · ${when}`
      : r.event || !r.verb
        ? `${r.emoji} ${r.sport} · ${team(r.teams[0])} · ${r.event || team(r.teams[1] || {})} · ${when}`
        : `${r.emoji} ${r.sport} · ${team(r.teams[0])} ${r.verb} ${team(r.teams[1])} · ${when}`;
};
/** Légende Instagram : une ligne par émission, date seulement si ce n’est pas le jour de la une. */
function igRadioLine(x, day) {
  const time = x.start ? frHour(x.start) : '';
  const date = x.date && day && x.date !== day ? frShort(x.date) : '';
  return [x.title, x.station, date, time].filter(Boolean).join(' · ');
}

// ── Radio étudiante : émissions à venir (radio-schedules.json, grille hebdo, day = 0 dimanche … 6 samedi, heure de Montréal) ──
const seeded = str => { let h = 1779033703 ^ str.length; for (const c of str) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); } return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; };
/** Fenêtres d'écoute par édition (heure de Montréal, minutes) : matin = matin et journée ; soir = soirée. */
export const RADIO_WINDOWS = { matin: [5 * 60, 17 * 60], soir: [17 * 60, 24 * 60] };
const NOT_A_SHOW = g => /\breprise\b|\brediffusion\b|^(les nuits|late night|.*\blate night\b|musique|programmation musicale)/i.test(g.title) || /^(CJLO|CKUT|CISM|CHYZ|CFAK|CHOQ)\b.*(late|nuit)/i.test(g.title);
/**
 * Émissions de radio étudiante selon l'édition, tirées au hasard (graine = date et édition), une par station :
 * matin → émissions du matin et de la journée du jour même (5 h – 17 h) à partir de l'heure de publication (ou en ondes) ;
 * soir → émissions de la soirée du jour même (17 h – minuit) encore à venir ou en ondes à l'heure de publication.
 * Repli documenté (`fallback: true`) si l'édition compte moins de `max` stations : pour les stations restantes, l'émission
 * à venir la plus proche de la fenêtre (même jour, puis lendemain avant midi). Sans reprise ni bouche-trou ; rien sans grille.
 */
/** « CHYZ 94,3 » → « CHYZ 94,3 FM » (bande FM) ; « CJLO 1690AM » et « CHOQ.ca » inchangés. */
export const fmLabel = name => { const n = String(name || '').trim(); return /\d{2,3},\d$/.test(n) ? `${n} FM` : n; };
/**
 * Réserve pour remplir l'image : les autres émissions de la journée (toutes les stations, à venir ou en ondes, dans la
 * fenêtre du créneau), par ordre d'heure, sans reprendre celles de `taken` ni deux fois le même titre d'une station.
 */
export function moreRadio(schedules, slot, taken = [], { max = 16 } = {}) {
  const day = slot.day, ed = slot.id === 'soir' ? 'soir' : 'matin', [w0, w1] = RADIO_WINDOWS[ed];
  const now = hm(slot.target || (ed === 'soir' ? '19:30' : '07:45'));
  const [y, m, d] = day.split('-').map(Number), dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  const seen = new Set(taken.map(x => `${x.station}|${String(x.title).trim().toLowerCase()}`)), out = [];
  for (const st of Object.values(schedules?.stations || {})) {
    if (!st.name) continue;
    for (const g of st.grid || []) {
      if (!g.title || NOT_A_SHOW(g) || g.day !== dow || hm(g.start) < w0 || hm(g.start) >= w1) continue;
      if (!(hm(g.start) >= now || (g.end && hm(g.end) > now))) continue;
      const station = fmLabel(st.name), k = `${station}|${g.title.trim().toLowerCase()}`;
      if (seen.has(k)) continue; seen.add(k);
      out.push({ emoji: '📻', title: g.title.trim(), station, date: day, start: g.start, when: `${frShort(day)} · ${frHour(g.start)}`, extra: true });
    }
  }
  return out.sort((a, b) => hm(a.start) - hm(b.start) || a.station.localeCompare(b.station)).slice(0, max);
}
export function pickRadio(schedules, slot, { max = 3 } = {}) {
  const day = slot.day, ed = slot.id === 'soir' ? 'soir' : 'matin', [w0, w1] = RADIO_WINDOWS[ed];
  const now = hm(slot.target || (ed === 'soir' ? '19:30' : '07:45'));
  const dowOf = dd => { const [y, m, d] = dd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); };
  const dow = dowOf(day), next = addDays(day, 1), dowN = dowOf(next);
  const live = g => hm(g.start) >= now || (g.end && hm(g.end) > now && hm(g.start) < now);
  const rnd = seeded(`radio:${day}:${ed}`), main = [], spare = [];
  for (const st of Object.values(schedules?.stations || {})) {
    if (!st.name) continue;
    const ok = (st.grid || []).filter(g => g.title && !NOT_A_SHOW(g));
    const inWin = ok.filter(g => g.day === dow && hm(g.start) >= w0 && hm(g.start) < w1 && live(g));
    if (inWin.length) { const pick = inWin[Math.floor(rnd() * inWin.length)]; main.push({ pick, d: day, r: rnd() }); continue; }
    // Repli : la plus proche de la fenêtre, à venir (même jour hors fenêtre, puis lendemain 7 h – midi).
    const later = [...ok.filter(g => g.day === dow && hm(g.start) >= now).map(g => ({ g, d: day, dist: Math.abs(hm(g.start) - (hm(g.start) < w0 ? w0 : w1)) })),
      ...ok.filter(g => g.day === dowN && hm(g.start) >= 7 * 60 && hm(g.start) < 12 * 60).map(g => ({ g, d: next, dist: 24 * 60 - w1 + hm(g.start) }))].sort((a, b) => a.dist - b.dist);
    if (later.length) spare.push({ pick: later[0].g, d: later[0].d, dist: later[0].dist, fallback: true });
  }
  const chosen = main.sort((a, b) => a.r - b.r).slice(0, max);
  chosen.push(...spare.sort((a, b) => a.dist - b.dist).slice(0, Math.max(0, max - chosen.length)));
  const key = x => (x.d === day ? 0 : 1440) + hm(x.pick.start);
  return chosen.sort((a, b) => key(a) - key(b)).map(x => ({ emoji: '📻', title: x.pick.title.trim(), station: fmLabel(schedules.stations && Object.values(schedules.stations).find(st => (st.grid || []).includes(x.pick)).name), date: x.d, start: x.pick.start, when: `${frShort(x.d)} · ${frHour(x.pick.start)}`, ...(x.fallback ? { fallback: true } : {}) }));
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
/** Au plus `max` articles, dans l'ordre reçu. Une photo ne passe pas devant le plus récent. */
export function finalizeItems(items, max = 4) {
  return items.slice(0, max);
}

/** Image publique de l'article sur le-radar.ca (repli si l'hébergement de l'affiche échoue). */
/** Vrai si la seule image disponible est une photo de banque (pas de photo de l'article). */
export function isStockOnlyImage(it) {
  if (/^https:\/\//.test(String(it?.image || ''))) return false;
  return /^https:\/\//.test(String(it?.stockImage || ''));
}

export function siteImage(it, { allowStock = true } = {}) {
  const local = String(it?.imageLocal || '');
  if (/^assets\/news-images\//.test(local)) {
    if (isStockOnlyImage(it) && !allowStock) return '';
    return `${SITE}/${local}`;
  }
  const real = String(it?.image || '');
  if (/^https:\/\//.test(real)) return real;
  if (!allowStock) return '';
  const u = String(it?.stockImage || '');
  return /^https:\/\//.test(u) ? u : '';
}

const FR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const FR_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
/** « jeudi 12 novembre » (jour civil Montréal). */
export function frDay(ymd) {
  const [y, m, d] = ymd.split('-').map(Number), wd = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return `${FR_DAYS[wd]} ${d === 1 ? '1er' : d} ${FR_MONTHS[m - 1]}`;
}
/** « jeudi 12 novembre 2026 » (jour civil Montréal, avec l’année). */
export function frDayYear(ymd) {
  return `${frDay(ymd)} ${String(ymd).slice(0, 4)}`;
}

// ── Textes ───────────────────────────────────────────────────────────────────
export const HOME = `${SITE}/`;
export const QUIET_LINE = 'Pas de nouvel article depuis la dernière une : place au sport et à la radio étudiante.';
const BASE_TAGS = ['#MédiasÉtudiants', '#Québec'];
/**
 * Hashtags X d'une une : mêmes règles thématiques que les articles (titres + résumés),
 * au plus 3. Sans thématique, repli sur uneTags (les autres réseaux ne passent pas par ici).
 */
export function uneTagsX(items, max = 3) {
  if (!(max > 0) || !items?.length) return [];
  const it = {
    title: items.map(x => x.title || x.bare).filter(Boolean).join(' · '),
    desc: items.map(x => x.excerpt || x.desc || x.hook || '').filter(Boolean).join(' '),
    source: items[0].source,
    bare: items[0].title || items[0].bare,
  };
  return xArticleTags(it, max);
}

/** Hashtags : #MédiasÉtudiants, établissements présents, #Québec ; plafonds de policy.json (hashtags.maxByNetwork). */
export function uneTags(items, max) {
  if (!(max > 0)) return [];
  const inst = [...new Set(items.map(x => x.tag).filter(Boolean))];
  const out = [BASE_TAGS[0], ...inst, BASE_TAGS[1]].filter((t, i, a) => a.indexOf(t) === i);
  if (max >= 2 && out.length > max) return [...out.slice(0, max - 1), BASE_TAGS[1]].filter((t, i, a) => a.indexOf(t) === i).slice(0, max);
  return out.slice(0, max);
}
/** Instagram : 3 à 5 mots-clics ciblés. On complète avec #VieÉtudiante seulement s'il manque un troisième, sans dépasser 5. */
export function instagramHashtags(items, max = 5) {
  const cap = Math.min(5, max > 0 ? max : 5);
  const tags = uneTags(items, cap);
  if (tags.length < 3 && !tags.includes('#VieÉtudiante')) tags.push('#VieÉtudiante');
  return tags.slice(0, cap);
}
/** Étiquettes Tumblr (sans #, 10 à 15). */
export function uneTumblrTags(items) {
  const t = ['le radar', 'la une', 'médias étudiants', 'presse étudiante', 'journalisme étudiant', 'québec', 'quebec', 'université', 'vie étudiante', 'actualités'];
  for (const x of items) { t.push(String(x.source || '').toLowerCase()); if (x.tag) t.push(x.tag.slice(1).toLowerCase()); }
  return [...new Set(t.map(s => s.replace(/[#,]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 15);
}
const clip = (s, n) => { const a = [...s]; return a.length <= n ? s : a.slice(0, n - 1).join('').replace(/[\s,;:.–—-]+$/, '') + '…'; };


/** Chemin public d'une édition (ex. « revues/2026-11-17-soir/ »), ou '' si le créneau n'est ni matin ni soir. */
export function revueEditionHref(slot) {
  const id = slot?.id, day = slot?.day;
  if ((id !== 'matin' && id !== 'soir') || !/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return '';
  return `revues/${day}-${id}/`;
}

/** Vrai seulement si la page publique de l'édition est vraiment là (index.html dans le dépôt). */
export function revueEditionExists(slot, { root = process.cwd(), exists } = {}) {
  const rel = revueEditionHref(slot);
  if (!rel) return false;
  if (typeof exists === 'function') return !!exists(rel);
  return fs.existsSync(path.join(root, rel, 'index.html'));
}

/**
 * Deuxième ligne du texte de La une, seulement si l'édition du même créneau (matin 7 h / soir 19 h 15) existe.
 * Chaîne vide sinon. Sur un réseau sans lien cliquable (Instagram), la phrase validée se termine par « lien en bio ».
 */
export function revueEditionLine(slot, opts = {}) {
  if (!revueEditionExists(slot, opts)) return '';
  const which = slot.id === 'matin' ? 'du matin' : 'du soir';
  const phrase = `Consultez notre revue ${which}, à imprimer avec sudoku et mots cachés :`;
  return opts.nolink ? `${phrase} lien en bio` : `${phrase} ${SITE}/${revueEditionHref(slot)}`;
}

/**
 * Texte d'un réseau. Réseaux longs (Mastodon, Tumblr, Facebook, LinkedIn) : un lien par article.
 * Réseaux courts (X, Bluesky) : titres + signatures, un seul lien (l'article si un seul titre, sinon l'accueil).
 * Si le texte dépasse la limite : on retire radio et sport, puis des articles (jamais la une), puis des hashtags, puis on raccourcit les titres (jamais l’accroche ni les mentions). La 2e ligne vers l’édition de la revue, si elle existe, est retirée en dernier recours.
 */
/** Instagram (préparé, désactivé) : légende ≤ 2200, 5 mots-clics au plus, aucun lien cliquable, « lien en bio », crédit 📸. */
export const IG_SPEC = { limit: 2200, len: s => [...String(s)].length, subheaders: true, nolink: true, maxHashtags: 5 };

/** « 📸 Thekidpossum, CC BY-SA 4.0, Wikimedia Commons ». Jamais « Photo : », jamais de @. */
export function igCreditLine(credit) {
  let c = String(credit || '').replace(/\s+/g, ' ').trim();
  c = c.replace(/^(?:photo|photos|illustration|crédit|credit)s?\s*:\s*/i, '').replace(/^📸\s*/, '').trim();
  if (!c || /@/.test(c)) return '';
  if ([...c].length > 180) c = [...c].slice(0, 179).join('').replace(/[\s,;:.–—-]+$/, '') + '…';
  return `📸 ${c}`;
}

/** Crédit incrusté : 📸 sur la grille Instagram, « Photo : » sur les autres formats. */
export function embeddedCreditLabel(credit, format, nb = '\u00A0') {
  const line = igCreditLine(credit);
  if (!line) return '';
  if (format === 'grille') return line;
  return 'Photo' + nb + ': ' + line.replace(/^📸\s*/, '');
}
const SPORTS_NETS = new Set(['facebook', 'linkedin', 'tumblr', 'instagram']);
export function buildUneText(model, net, spec = net === 'instagram' ? IG_SPEC : NET_SPEC[net], { tags = [], revueExists, root } = {}) {
  const len = spec.len || xlen, long = !!spec.subheaders;
  const head = `${model.slot.emoji} ${model.slot.label} du Radar · ${frDay(model.slot.day)}`;
  const revueOpts = { root, exists: revueExists ?? model.revueExists, nolink: !!spec.nolink };
  const compose = (items, hash, cut, sports, radio, revueLine) => {
    const T = x => cut ? clip(x.title, cut) : x.title;
    let body;
    if (model.quiet) {
      // Une sans article : le titre, une phrase honnête, puis le sport et la radio (sur tous les réseaux), puis le lien.
      body = `${T(items[0])}\n${items[0].line || QUIET_LINE}`;
    } else if (spec.style === 'lead') {
      // Article principal, puis les autres en une ligne (Threads) ou leur nombre (X), puis le lien vers la une.
      const [first, ...rest] = items, more = model.items.length - 1;
      const others = spec.others && rest.length ? `Aussi à la une : ${rest.map(T).join(' · ')}` : more > 0 ? `+ ${more} autre${more > 1 ? 's' : ''} à la une` : '';
      body = [`${first.sport ? first.sport + ' ' : ''}${T(first)}\n✍️ ${first.byline}`, others, HOME].filter(Boolean).join('\n\n');
    } else if (spec.nolink) {
      body = items.map((x, i) => `${i + 1}. ${x.sport ? x.sport + ' ' : ''}${T(x)}\n✍️ ${x.byline}`).join('\n\n');
    } else if (long) {
      body = items.map((x, i) => `${i + 1}. ${x.sport ? x.sport + ' ' : ''}${T(x)}\n✍️ ${x.byline}\n${x.pageUrl}`).join('\n\n');
    } else {
      body = items.map(x => `${x.sport || '▪️'} ${T(x)} — ${x.byline}`).join('\n') + '\n\n' + (items.length === 1 ? items[0].pageUrl : HOME);
    }
    if (sports.length) {
      const lines = sports.map(r => spec.nolink ? sportsLine(r, { compact: true, day: model.slot.day }) : sportsLine(r));
      body += spec.nolink ? '\n\n🏟️ Sport étudiant :\n\n' + lines.join('\n') : '\n\n🏟️ Sport étudiant :\n' + lines.join('\n');
    }
    if (radio.length) {
      const lines = radio.map(x => spec.nolink ? igRadioLine(x, model.slot.day) : `${x.title} · ${x.station} · ${x.when}`);
      body += spec.nolink ? '\n\n📻 À l’écoute (radio étudiante) :\n\n' + lines.join('\n') : '\n\n📻 À l’écoute (radio étudiante) :\n' + lines.join('\n');
    }
    if (model.quiet && !spec.nolink && !long) body += `\n\n${HOME}`;
    if (spec.nolink) {
      body += revueLine ? '\n\nToute la une : le-radar.ca' : '\n\nToute la une : lien en bio (le-radar.ca)';
      const credit = igCreditLine(model.credit || model.items?.[0]?.credit || '');
      if (credit) body += '\n\n' + credit;
    } else if (long) body += `\n\nToute la une : ${HOME}`;
    const lead = [head, revueLine, spec.intro].filter(Boolean).join('\n');
    return [lead, body, hash.join(' ')].filter(Boolean).join('\n\n');
  };
  const withExtras = SPORTS_NETS.has(net) || !!model.quiet; // sans article, le sport et la radio sont le contenu : partout
  let items = [...model.items], hash = [...tags], cut = 0, sports = withExtras ? [...(model.sports?.results || []).slice(0, 3), ...(model.sports?.next || []).slice(0, model.quiet ? 5 : 2)] : [], radio = withExtras ? (model.radio || []).filter(x => !x.extra).slice(0, 5) : []; // réserve de l'image (extra) hors texte
  let withRevue = true;
  for (;;) {
    const revueLine = withRevue ? revueEditionLine(model.slot, revueOpts) : '';
    const t = compose(items, hash, cut, sports, radio, revueLine);
    if (len(t) <= spec.limit) return t;
    if (radio.length) { radio = radio.slice(0, -1); continue; }
    if (sports.length) { sports = sports.slice(0, -1); continue; }
    if (items.length > 1) { items = items.slice(0, -1); continue; }
    const hashFloor = spec.nolink ? 3 : 1;
    if (hash.length > hashFloor) { hash = hash.slice(0, -1); continue; }
    if (cut && cut <= 30 && withRevue && revueLine) { withRevue = false; cut = 0; continue; }
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
  if (spec.nolink) {
    if (/https?:\/\//.test(text)) p.push('lien cliquable interdit (Instagram)');
    if (!/lien en bio/.test(text)) p.push('« lien en bio » manquant');
    if (!/le-radar\.ca/.test(text)) p.push('le-radar.ca en texte manquant');
    const tags = text.match(/#[\p{L}\p{N}_]+/gu) || [];
    if (tags.length > (spec.maxHashtags || 5)) p.push(`trop de mots-clics (${tags.length}/${spec.maxHashtags || 5})`);
    if (tags.length < 3) p.push(`pas assez de mots-clics (${tags.length}/3)`);
    if (/^Photo\s*:/m.test(text)) p.push('crédit « Photo : » interdit');
    const want = igCreditLine(model.credit || model.items?.[0]?.credit || '');
    if (want && !text.includes(want)) p.push('crédit 📸 manquant');
    if (text.split('\n')[0] && [...text.split('\n')[0]].length > 125) p.push('accroche trop longue pour l’aperçu Instagram');
  }
  else if (!/https:\/\/le-radar\.ca\//.test(text)) p.push('lien le-radar.ca manquant');
  if (/undefined|NaN|\[object|null/.test(text)) p.push('valeur invalide');
  const leadStart = [...model.items[0].title].slice(0, 20).join('');
  if (!text.includes(leadStart)) p.push('titre de la une absent');
  return p;
}
/** Tous les textes d'un créneau. `maxByNetwork` : plafonds de hashtags. */
export function buildUneAll(model, maxByNetwork = {}, opts = {}) {
  const out = {};
  for (const n of [...NETS, ...PREPARED_NETS]) {
    const spec = n === 'instagram' ? IG_SPEC : NET_SPEC[n];
    const tags = n === 'tumblr' || n === 'threads' ? [] : n === 'instagram' ? instagramHashtags(model.items, maxByNetwork[n] ?? 5) : n === 'x' ? uneTagsX(model.items, maxByNetwork[n] ?? 3) : uneTags(model.items, maxByNetwork[n] ?? 2);
    const text = buildUneText(model, n, spec, { tags, revueExists: opts.revueExists ?? model.revueExists, root: opts.root });
    out[n] = { text, tags: n === 'tumblr' ? uneTumblrTags(model.items) : tags, len: text ? spec.len(text) : 0, limit: spec.limit, image: IMAGE_FOR[n] || '', problems: checkUneText(text, n, model, spec) };
  }
  return out;
}

// ── Une sans article (aperçu) ────────────────────────────────────────────────
/**
 * Pseudo-« une » d'un créneau sans nouvel article mais avec du sport ou de la radio : photo libre de campus en tête,
 * titre qui dit ce que le créneau met de l'avant, résumé honnête (aucun article). `cover` : { url, credit, title }
 * (photo libre de campus fournie par l'appelant, seulement si aucune affiche graphique n'est possible). Retourne null s'il n'y a ni sport ni radio : le créneau est sauté.
 */
export function quietLead(slot, { sports = {}, radio = [], cover = null, prefer = '' } = {}) {
  const res = (sports.results || []).length, nxt = (sports.next || []).length, rad = (radio || []).length;
  if (!res && !nxt && !rad) return null;
  // Titres courts façon « Game Day » / « Today's Lineup » (affiches sportives et radios universitaires).
  const today = (sports.next || []).some(r => r.date === slot.day);
  // Édition « Jour de match » (déclenchement manuel) : le match du jour en vedette, même s'il y a des articles.
  if (prefer === 'match') {
    if (!today) return null;
    const art = quietArt(slot, { sports, radio, prefer });
    return { id: '', title: 'Les matchs du sport étudiant aujourd’hui', byline: '', source: '', place: '', placeColor: '', sport: '', credit: '', images: [], quiet: true, art,
      hook: 'Les matchs du sport étudiant aujourd’hui et dans les prochains jours, et les émissions des radios étudiantes.',
      line: 'Aujourd’hui sur les terrains du sport étudiant, et à l’écoute des radios étudiantes.',
      stations: stationLogos().map(({ name, logo }) => ({ name, logo })) };
  }
  const title = res ? 'Les résultats du sport étudiant'
    : nxt ? (today ? 'Jour de match' : 'Les prochains matchs')
    : (slot.id === 'soir' ? 'Ce soir à l’antenne' : 'Aujourd’hui à l’antenne');
  // Sans décompte : l'image n'affiche qu'une partie des matchs et des émissions.
  const parts = [res && 'les derniers résultats', nxt && 'les prochains matchs', rad && 'les émissions des radios étudiantes'].filter(Boolean);
  const hook = `Aucun nouvel article des médias étudiants depuis la dernière une. Au programme : ${parts.length > 1 ? parts.slice(0, -1).join(', ') + ' et ' + parts.at(-1) : parts[0]}.`;
  // Couverture graphique (pas de photo) : affiche de match aux couleurs des établissements, ou logos officiels des radios.
  const art = quietArt(slot, { sports, radio });
  const credit = !art && cover ? String(cover.credit || '').replace(/^Photo\s*:\s*/i, '') : '';
  return { id: '', title, byline: '', source: '', place: '', placeColor: '', sport: '', hook, credit, images: art ? [] : [...new Set([cover?.commons, cover?.url].filter(Boolean))], quiet: true, art, stations: stationLogos().map(({ name, logo }) => ({ name, logo })) };
}
let RADIOS = null;
/** Stations de radios.json qui ont un logo officiel (assets/logos/stations/<id>-512.png). */
export function stationLogos(root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')) {
  if (RADIOS) return RADIOS;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'radios.json'), 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw.stations || Object.values(raw));
    RADIOS = list.filter(r => r && r.id && r.name && fs.existsSync(path.join(root, `assets/logos/stations/${r.id}-512.png`)))
      .map(r => ({ id: r.id, name: fmLabel(r.name), freq: r.frequency || '', city: r.city || '', logo: `../assets/logos/stations/${r.id}-512.png` }));
  } catch { RADIOS = []; }
  return RADIOS;
}
/**
 * Visuel d'une une sans article. Sport : la rencontre en vedette (premier résultat, sinon premier match à venir), aux
 * couleurs des deux établissements (brand-colors.json). Radio seule : les logos officiels de toutes les stations,
 * celles à l'antenne dans ce créneau en premier.
 */
export function quietArt(slot, { sports = {}, radio = [], prefer = '' } = {}) {
  const todays = (sports.next || []).filter(x => x.date === slot.day && x.teams?.length === 2);
  const r = (prefer === 'match' && (todays.find(x => x.uni) || todays[0]))
    || (sports.results || []).find(x => x.kind === 'resultat' && x.teams?.length === 2) || (sports.next || []).find(x => x.teams?.length === 2);
  if (r) {
    const t = x => ({ name: x.name, inst: x.inst || '', color: x.color || '' });
    const res = r.kind === 'resultat';
    return { kind: 'match', emoji: r.emoji || '', sport: r.sport, label: res ? 'Résultat' : (r.date === slot.day ? 'Jour de match' : 'Prochain match'),
      when: res ? `Final · ${frShort(r.date)}` : [frShort(r.date), frHour(r.time)].filter(Boolean).join(' · '),
      a: t(r.teams[0]), b: t(r.teams[1]), score: res ? [r.teams[0].score, r.teams[1].score] : null, verb: res ? '' : (r.verb || 'contre') };
  }
  const all = stationLogos();
  if (!(radio || []).length || !all.length) return null;
  const on = new Set(radio.map(x => x.station));
  return { kind: 'radio', stations: [...all.filter(s => on.has(s.name)), ...all.filter(s => !on.has(s.name))].map(s => ({ ...s, on: on.has(s.name) })) };
}

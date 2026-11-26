// « La revue du matin » et « La revue du soir » : logique pure (testée dans tests/revue.mjs).
//  - éditions en heure de Montréal (America/Toronto, heure d'été et d'hiver gérées par Intl) ;
//  - période : matin = la nuit et le matin (depuis 19 h 15 la veille), soir = la journée (depuis 7 h), prolongée jusqu'à la
//    dernière revue publiée si une édition a été sautée (au plus `maxLookbackHours`) ; jamais deux fois le même article ;
//  - articles : news.json (médias étudiants seulement, sport pro exclu), TOUS les auteurs (front.authorNames), média, établissement
//    en français avec son sigle, lien vers l'original, extrait court. Sous le plafond, rien n'est écarté. Au-delà, on coupe
//    d'abord un deuxième titre du même média dans le même thème. « À la une » reste le plus récent de la fenêtre (liste plate
//    par date). Dans chaque thème, un média ne revient qu'une fois que les autres médias du thème ont un titre ;
//  - radio étudiante : émissions originales de la période (radio-schedules.json) ;
//  - sport étudiant : tous les résultats de la période et les prochains matchs (sports-masthead.json, même module que la une) ;
//  - garde-fou : validateReview() refuse toute revue vide ou dont un lien, un auteur, un titre, une émission ou un score ne vient
//    pas des données ; textReject() refuse tout texte d'IA avec un chiffre, un nom ou une date relative absents de la source.
// Aucune écriture ici.
import { createRequire } from 'node:module';
import { pickSports, frDay, frShort, frHour, institutionLabel, institutionSigle, siteImage, isStockOnlyImage, sportEmoji } from '../social/une-lib.mjs';
import { detectLang } from '../social/lib.mjs';
import { chapoExtract, cutAtLastSentence, extraFacts, resumeCoversFact, sentenceCount, sourceHasName, sourceHasNumber, titleSimilarity, TITLE_SIMILARITY_MAX, RESUME_MIN_CHARS, RESUME_MAX_CHARS } from './revue-quality.mjs';

const require = createRequire(import.meta.url);
const front = require('../magazine-front-page-lib.js');
const campusLib = require('../campus-fallback-lib.js');

export const SITE = 'https://le-radar.ca';
export const PUBLISHER = 'Le Radar';
export const EDITIONS = {
  matin: { id: 'matin', label: 'La revue du matin', emoji: '☀️', target: '07:00', from: '06:45', to: '10:30', periodStart: '19:15', periodStartDayOffset: -1 },
  soir: { id: 'soir', label: 'La revue du soir', emoji: '🌙', target: '19:15', from: '19:00', to: '22:30', periodStart: '07:00', periodStartDayOffset: 0 },
};
export const DEFAULT_CONFIG = {
  publish: false, editions: EDITIONS, refresh: { enabled: true, from: '23:00', to: '23:59' }, skipWithoutArticles: true, publishWithoutArticles: true,
  maxLookbackHours: 48, maxArticles: 40, radio: { maxPerStation: 4, windows: { matin: ['07:00', '17:00'], soir: ['19:15', '24:00'] } },
  sports: { upcomingDays: 3, upcomingFallbackDays: 7 }, ai: { enabled: true, maxCallsPerRun: 6, batchSize: 8 }, newsSitemapHours: 48, feedItems: 10,
};
/** Réglages : data/revue/config.json par-dessus les valeurs par défaut (publish reste false sauf true explicite). */
export function mergeConfig(raw = {}) {
  const c = { ...DEFAULT_CONFIG, ...raw };
  c.editions = { matin: { ...EDITIONS.matin, ...(raw.editions?.matin || {}) }, soir: { ...EDITIONS.soir, ...(raw.editions?.soir || {}) } };
  c.radio = { ...DEFAULT_CONFIG.radio, ...(raw.radio || {}), windows: { ...DEFAULT_CONFIG.radio.windows, ...(raw.radio?.windows || {}) } };
  c.sports = { ...DEFAULT_CONFIG.sports, ...(raw.sports || {}) };
  c.ai = { ...DEFAULT_CONFIG.ai, ...(raw.ai || {}) };
  c.refresh = { ...DEFAULT_CONFIG.refresh, ...(raw.refresh || {}) };
  c.publish = raw.publish === true;
  return c;
}

// ── Heure de Montréal ────────────────────────────────────────────────────────
const hm = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
const MTL = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
/** { ymd, minutes, hh, mm } à Montréal pour un instant. */
export function mtl(ts) {
  const p = Object.fromEntries(MTL.formatToParts(new Date(ts)).map(x => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute, hh: +p.hour, mm: +p.minute };
}
export const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/** Instant (ms) d'une heure locale de Montréal (« 19:15 » le 2026-11-16). « 24:00 » = minuit suivant. */
export function mtlInstant(ymd, hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const want = Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10), h, m || 0);
  let t = want + 5 * 3600e3;
  for (let i = 0; i < 3; i++) { const p = mtl(t), got = Date.UTC(+p.ymd.slice(0, 4), +p.ymd.slice(5, 7) - 1, +p.ymd.slice(8, 10), p.hh, p.mm); t += want - got; }
  return t;
}
/** « 7 h 30 » (heure de Montréal) pour un instant. */
export const frTime = ts => { const p = mtl(ts); return frHour(`${p.hh}:${String(p.mm).padStart(2, '0')}`); };
/** « lundi 16 novembre 2026 ». */
export const frDayYear = ymd => `${frDay(ymd)} ${ymd.slice(0, 4)}`;

// ── Éditions ─────────────────────────────────────────────────────────────────
export const reviewId = (day, ed) => `${day}-${ed}`;
export const reviewPath = (day, ed) => `revue/${reviewId(day, ed)}/`;
export const reviewUrl = (day, ed) => `${SITE}/${reviewPath(day, ed)}`;
/** Fin connue d'une revue déjà dans l'index (periodEnd, sinon l'heure cible du créneau). */
function publishedEnd(r) {
  const t = Date.parse(r?.periodEnd || r?.datePublished || '');
  if (Number.isFinite(t) && t > 0) return t;
  const m = String(r?.id || '').match(/^(\d{4}-\d{2}-\d{2})-(matin|soir)$/);
  const ed = m && (EDITIONS[m[2]] || null);
  return ed ? mtlInstant(m[1], ed.target) : 0;
}
/**
 * Créneaux encore dus : la fenêtre ouverte, puis chaque créneau fermé depuis la dernière
 * revue publiée (au plus `maxLookbackHours`). Une page déjà dans l'index ou un saut noté
 * ne revient pas. Le plus ancien d'abord, pour ne pas voler les articles du créneau suivant.
 */
export function owedEditions(now, cfg = DEFAULT_CONFIG, index = [], state = {}) {
  const hours = Number(cfg.maxLookbackHours) > 0 ? Number(cfg.maxLookbackHours) : 48;
  const floor = now - hours * 3600e3;
  const latest = (index || []).reduce((m, r) => Math.max(m, publishedEnd(r)), 0);
  const out = [];
  let ymd = mtl(floor).ymd;
  const last = mtl(now).ymd;
  for (let n = 0; ymd <= last && n < 8; n++) {
    for (const id of ['matin', 'soir']) {
      const e = cfg.editions?.[id];
      if (!e?.from || !e?.to || !e?.target) continue;
      const openAt = mtlInstant(ymd, e.from);
      const closeAt = mtlInstant(ymd, e.to);
      if (!(closeAt > floor) || openAt > now) continue;
      const key = reviewId(ymd, id);
      if ((index || []).some(r => r.id === key)) continue;
      if (state?.[key]?.skipped) continue;
      const open = openAt <= now && now < closeAt;
      if (!open) {
        if (!latest) continue;
        if (mtlInstant(ymd, e.target) <= latest) continue;
      }
      out.push({ id, day: ymd, key, catchup: !open, now: open ? now : mtlInstant(ymd, e.target) });
    }
    ymd = addDays(ymd, 1);
  }
  return out;
}
/** Édition dont la fenêtre de publication contient `now`, sinon null. */
export function editionAt(now, cfg = DEFAULT_CONFIG) {
  const { ymd, minutes } = mtl(now);
  for (const e of Object.values(cfg.editions)) if (minutes >= hm(e.from) && minutes < hm(e.to)) return { ...e, day: ymd, key: reviewId(ymd, e.id) };
  return null;
}
export function editionFor(id, now, cfg = DEFAULT_CONFIG) {
  const e = cfg.editions[id]; if (!e) throw new Error(`édition inconnue : ${id}`);
  const day = mtl(now).ymd; return { ...e, day, key: reviewId(day, id) };
}
/** Fenêtre de mise à jour tardive de la revue du soir (résultats sportifs du jour). */
export function refreshAt(now, cfg = DEFAULT_CONFIG) {
  if (!cfg.refresh?.enabled) return null;
  const { ymd, minutes } = mtl(now);
  return minutes >= hm(cfg.refresh.from) && minutes <= hm(cfg.refresh.to) ? { ...cfg.editions.soir, day: ymd, key: reviewId(ymd, 'soir'), refresh: true } : null;
}
/**
 * Période couverte : [début, fin]. Début = heure de départ de l'édition (la veille 19 h 15 pour le matin, 7 h pour le soir),
 * reculé jusqu'à la fin de la dernière revue publiée si une édition a été sautée, sans dépasser `maxLookbackHours`.
 */
export function periodOf(edition, now, index = [], cfg = DEFAULT_CONFIG, { nominal = false } = {}) {
  let start = mtlInstant(addDays(edition.day, edition.periodStartDayOffset || 0), edition.periodStart);
  // Rattrapage daté : la fenêtre nominale (19 h 15 → 7 h, ou 7 h → 19 h 15), sans reculer
  // dans l’édition voisine qui sera publiée à part.
  if (nominal) return { start, end: now };
  const floor = now - (cfg.maxLookbackHours || 48) * 3600e3;
  const prev = (index || []).filter(r => r.id !== edition.key && Date.parse(r.periodEnd) <= now).sort((a, b) => Date.parse(b.periodEnd) - Date.parse(a.periodEnd))[0];
  if (prev && Date.parse(prev.periodEnd) < start) start = Math.max(Date.parse(prev.periodEnd), floor);
  return { start: Math.max(start, floor), end: now };
}
/** Articles et résultats déjà repris par les revues des 4 derniers jours (anti-doublon). */
export function covered(index = [], exceptId = '', reviews = {}) {
  const ids = new Set(), sports = new Set();
  for (const r of index || []) {
    if (r.id === exceptId) continue;
    for (const id of r.articleIds || []) ids.add(id);
    for (const k of r.sportKeys || reviews[r.id]?.sports?.results?.map(x => x.key) || []) sports.add(k);
  }
  return { ids, sports };
}

// ── Articles ─────────────────────────────────────────────────────────────────
const clean = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
/** Extrait court (≤ max caractères), coupé à la phrase ou au mot. */
export function shortExcerpt(text, max = 200) {
  const s = clean(text); if (!s) return '';
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const m = [...cut.matchAll(/[.!?…](?:[»"”)])?(?=\s|$)/gu)].pop();
  if (m && m.index + m[0].length > max * 0.45) return cut.slice(0, m.index + m[0].length).trim();
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).replace(/[\s,;:–—-]+$/u, '') + '…';
}
/** Sigle seul, comme dans La une (« UdeS », « ULaval », « Concordia ») ; sans sigle connu : nom français (« Cégep de Jonquière ») ;
 * établissement anglais inconnu : rien. Jamais « Nom complet (SIGLE) ». */
export function institutionDisplay(raw) {
  const fr = institutionLabel({ institution: raw });
  const sig = institutionSigle(raw) || institutionSigle(fr);
  return String(sig || fr || '').replace(/'/g, '’').trim();
}
export const THEMES = ['Vie de campus', 'Politique', 'Éducation', 'Société', 'Culture', 'Sport', 'Environnement', 'Santé', 'Science', 'Économie', 'International'];
export const THEME_EMOJI = { 'Vie de campus': '🏫', Politique: '🏛️', Éducation: '🎓', Société: '👥', Culture: '🎭', Sport: '🏟️', Environnement: '🌱', Santé: '🩺', Science: '🔬', Économie: '💼', International: '🌍' };
const THEME_RE = [
  ['Sport', /\b(hockey|football|soccer|basketball|basket|volleyball|rugby|natation|athl[ée]tisme|badminton|stingers|martlets|redbirds|gaiters|carabins|rouge et or|vert (et|&) or|citadins|patriotes|match|saison|s[ée]ries|championnat|championship|playoffs?|coach|entra[îi]neur|tournoi|tournament|game|varsity|rseq|u sports)\b/i],
  ['Politique', /\b(conseil municipal|municipal\w*|mairie|maire|mairesse|city council|protest\w*|manifestation\w*|manifestant\w*|élection|election|gouvernement|government|ministre|minister|premier ministre|caq|pq|plq|qs|liberal|conservat|parlement|parliament|assemblée nationale|politi\w*|vote|budget fédéral|ottawa|legault|carney|poilievre|député|mp|mna|loi \d+|bill \d+|syndicat|union|grève|strike)\b/i],
  ['Éducation', /\b(midterms?|examens?|exams?|mentorat|mentorship|étudiant\w*|student\w*|cours|course|programme|program|ma[îi]trise|master'?s|doctorat|phd|bac(calauréat)?|frais de scolarité|tuition|universit\w*|cégep|college|professeur\w*|professor\w*|enseignant\w*|faculty|faculté|recherche|research|campus|admission|diplôm\w*|graduat\w*)\b/i],
  ['Culture', /\b(grammy\w*|oscars?|gala|opéra|opera|film|cinéma|cinema|théâtre|theatre|theater|musique|music|album|concert|spectacle|show|festival|exposition|exhibit\w*|art|artiste|artist|livre|book|roman|novel|poésie|poetry|danse|dance|critique|review|chanson|song|série|series|humour|comedy)\b/i],
  ['Environnement', /\b(climat|climate|environnement|environment|écolo\w*|ecolog\w*|durable|sustainab\w*|énergie|energy|pollution|biodiversit\w*|carbone|carbon|vert|green|forêt|forest|eau|water)\b/i],
  ['Santé', /\b(santé|health|mental|médecin\w*|medic\w*|doctor|hôpital|hospital|maladie|disease|bien-être|wellness|wellbeing|psycholog\w*|vaccin\w*|soins|care|nutrition|sommeil|sleep)\b/i],
  ['Science', /\b(science\w*|scientifi\w*|technolog\w*|tech|ia|ai|intelligence artificielle|artificial intelligence|physique|physics|chimie|chemistry|biolog\w*|espace|space|robot\w*|données|data|laboratoire|lab|recherche|research|chercheu\w*|researcher\w*)\b/i],
  ['Économie', /\b(revenu\w*|pauvreté|poverty|income|économi\w*|econom\w*|emploi|job|jobs|travail|work|salaire|wage|logement|housing|loyer|rent|inflation|entreprise|business|commerce|marché|market|argent|money|prix|price|coût|cost)\b/i],
  ['International', /\b(international|monde|world|guerre|war|gaza|palestin\w*|isra[ëe]l\w*|ukrain\w*|russi\w*|chine|china|états-unis|united states|trump|europe|afrique|africa|immigra\w*|réfugié\w*|refugee\w*)\b/i],
  ['Société', /\b(société|society|communaut\w*|communit\w*|femmes|women|autochtone\w*|indigenous|racisme|racism|inclusion|diversit\w*|droits|rights|justice|police|sécurité|safety|bénévol\w*|volunteer\w*)\b/i],
];
// \b ne connaît pas les lettres accentuées : bornes Unicode (« élection », « économie »).
const uni = re => new RegExp(re.source.replace(/^\\b\(/, '(?<![\\p{L}\\p{N}])(').replace(/\)\\b$/, ')(?![\\p{L}\\p{N}])'), 'iu');
for (const row of THEME_RE) row[1] = uni(row[1]);
const STUDENT_RE = /(?<![\p{L}])(étudiant|student|campus|asso|association|vie étudiante|student life)/iu;
/** Thème déterministe (mots-clés FR/EN du titre et de l'extrait) ; « Vie de campus » par défaut. */
export function themeOf(it) {
  if (it.sport) return 'Sport';
  const t = `${it.title} ${it.excerpt || ''}`;
  const title = String(it.title || '');
  for (const [k, re] of THEME_RE) if (re.test(title)) return k;
  for (const [k, re] of THEME_RE) if (k !== 'Éducation' && re.test(t)) return k;
  return STUDENT_RE.test(t) ? 'Vie de campus' : (THEME_RE[2][1].test(t) ? 'Éducation' : 'Vie de campus');
}
/**
 * Sport professionnel ou international (jamais dans la revue) : la liste de l'affiche (front.isProSportItem) plus les ligues et
 * compétitions pro vues dans les médias étudiants (NSL, AFC Toronto, Jeux olympiques, championnats du monde, IIHF…).
 */
const REVUE_PRO_RE = /\b(afc toronto|toronto fc|\btfc\b|whitecaps|matheson|northern super league|super ligue du nord|\bnsl\b|iihf|\bfifa\b|\buefa\b|jeux olympiques|olympics?|olympiques?|coupe du monde|world cup|championnats? du monde|world championships?|comp[ée]titions internationales|ligue des champions|champions league|premier league|\bufc\b|\bpga\b|\batp\b|\bwta\b|nascar|tour de france|valkyries|oilers|canucks|senators d['’]ottawa|ottawa senators|bruins|golden knights|lakers|celtics|yankees)\b/i;
export const isProSport = it => front.isProSportItem(it) || REVUE_PRO_RE.test(String(it?.title || ''));
/**
 * Articles de la période (news.json) : date dans ]début, fin], pas encore repris, pas de sport pro, du plus récent au plus ancien.
 * Chaque article garde ses champs d'origine (titre, lien, média, TOUS les auteurs) : rien n'est réécrit.
 * Sous `max`, tout le corps reste. Au-delà, on écarte d'abord un deuxième article du même média dans le même thème
 * (jamais le seul article d'un média dans un thème, tant que ces premiers titres tiennent dans le plafond).
 */
export function selectArticles(news, period, { coveredIds = new Set(), max = 40 } = {}) {
  const raw = Array.isArray(news) ? news : news?.items || [];
  const pool = [], seen = new Set();
  for (const it of [...raw].sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0))) {
    const t = Date.parse(it?.date || '');
    if (!it?.title || !/^https?:\/\//.test(String(it.link || '')) || !Number.isFinite(t) || t <= period.start || t > period.end) continue;
    if (isProSport(it)) continue;
    const c = front.normalize(it, '..'); if (!c?.id || seen.has(c.id) || coveredIds.has(c.id)) continue;
    seen.add(c.id);
    const lang = it.lang === 'en' || it.lang === 'fr' ? it.lang : detectLang({ title: it.title, desc: it.excerpt });
    const item = {
      id: c.id, title: clean(it.title), link: String(it.link).trim(), source: clean(it.source), authors: front.authorNames(it),
      date: new Date(t).toISOString(), lang, institution: institutionDisplay(it.institution), sport: sportEmoji(it),
      excerpt: shortExcerpt(it.leadExcerpt || it.excerpt, 200),
      body: clean(it.leadExcerpt || it.excerpt || '').slice(0, 1200),
      image: siteImage(it, { allowStock: true }), imageStock: isStockOnlyImage(it), credit: front.photoCredit(it) || '',
      pageUrl: c.pageUrl,
    };
    item.theme = themeOf(item);
    pool.push(item);
  }
  return capRevueItems(pool, max);
}
/** Plafond : d'abord le plus récent de chaque média dans chaque thème, puis les répétitions par date. Liste plate par date. */
function capRevueItems(pool, max) {
  const cap = Number(max);
  if (!(cap > 0)) return [];
  if (pool.length <= cap) return pool;
  const seen = new Set();
  const primaries = [];
  const repeats = [];
  for (const x of pool) {
    const key = `${x.theme}\0${String(x.source || '').trim()}`;
    if (seen.has(key)) repeats.push(x);
    else { seen.add(key); primaries.push(x); }
  }
  const kept = primaries.length >= cap ? primaries.slice(0, cap) : primaries.concat(repeats.slice(0, cap - primaries.length));
  return kept.sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
}
/** Dans un thème : un titre par média (le plus récent), puis les suivants par date. */
function themePassOrder(list) {
  const sorted = [...list].sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
  const seen = new Set();
  const first = [];
  const rest = [];
  for (const x of sorted) {
    const src = String(x.source || '').trim();
    if (seen.has(src)) rest.push(x);
    else { seen.add(src); first.push(x); }
  }
  return [...first, ...rest];
}
/** Thèmes dans l'ordre (le plus fourni d'abord, « Vie de campus » en dernier s'il y en a d'autres). */
export function groupByTheme(items) {
  const m = new Map();
  for (const x of items) { const k = THEMES.includes(x.theme) ? x.theme : 'Vie de campus'; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return [...m.entries()].map(([theme, list]) => ({ theme, emoji: THEME_EMOJI[theme] || '📰', items: themePassOrder(list) }))
    .sort((a, b) => (a.theme === 'Vie de campus') - (b.theme === 'Vie de campus') || b.items.length - a.items.length || THEMES.indexOf(a.theme) - THEMES.indexOf(b.theme));
}
/** « Par A, B et C » (tous les auteurs), sinon « Par la rédaction », sinon rien (le média seul). */
export function authorsLine(authors = []) {
  const a = (authors || []).filter(Boolean);
  if (!a.length) return '';
  return `Par ${a.length === 1 ? a[0] : `${a.slice(0, -1).join(', ')} et ${a.at(-1)}`}`;
}

// ── Radio étudiante ──────────────────────────────────────────────────────────
/** Fin d'émission lisible : « 8:59 » → « 9:00 », « 24:00 » → « 0:00 ». */
const endHm = e => { let t = hm(e); if (t % 60 === 59) t += 1; t %= 1440; return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
/** Émissions originales de la période, par station (radio-schedules.json), au plus `maxPerStation` chacune, par heure. */
export function periodRadio(schedules, edition, cfg = DEFAULT_CONFIG) {
  const [w0, w1] = (cfg.radio?.windows || DEFAULT_CONFIG.radio.windows)[edition.id];
  const max = cfg.radio?.maxPerStation || 4;
  const [y, m, d] = edition.day.split('-').map(Number), dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  const out = [];
  for (const [id, st] of Object.entries(schedules?.stations || {})) {
    if (!st?.name) continue;
    const seen = new Set();
    const shows = (st.grid || []).filter(g => g && g.day === dow && g.title && front.radioShowOk(g) && hm(g.start) >= hm(w0) && hm(g.start) < hm(w1))
      .sort((a, b) => hm(a.start) - hm(b.start))
      .filter(g => { const k = g.title.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, max)
      .map(g => ({ title: clean(g.title), start: g.start, end: g.end || '', when: frHour(g.start) + (g.end ? ` à ${frHour(endHm(g.end))}` : ''), url: /^https:\/\//.test(g.url || '') ? g.url : '' }));
    if (shows.length) out.push({ id, station: st.name, page: `${SITE}/radios/${id}/`, shows });
  }
  return out.sort((a, b) => hm(a.shows[0].start) - hm(b.shows[0].start) || a.station.localeCompare(b.station));
}

// ── Sport étudiant ───────────────────────────────────────────────────────────
const teamTxt = t => `${t.name}${t.inst ? ` (${t.inst})` : ''}`;
/** Clé stable d'un résultat : date, équipes triées et pointage (une rencontre vue par les deux équipes n'apparaît qu'une fois). */
export const resultKey = r => r.kind === 'classement' ? `${r.date}|${r.sport}|${r.event}|${teamTxt(r.teams[0])}:${r.place}`
  : `${r.date}|${r.sport}|${r.teams.map(t => `${teamTxt(t)}:${t.score}`).sort().join('|')}`;
const nextKey = r => `${r.date}|${r.time}|${r.sport}|${r.event || ''}|${r.teams.map(teamTxt).sort().join('|')}`;
/**
 * Résultats de la période (matin : la veille et le jour même ; soir : le jour même) pas encore repris, et matchs à venir
 * (matin : du jour même à J+3 ; soir : de J+1 à J+3 ; à défaut, la prochaine semaine). Tout vient de sports-masthead.json.
 */
export function periodSports(masthead, edition, { coveredKeys = new Set(), cfg = DEFAULT_CONFIG, at = '' } = {}) {
  const soir = edition.id === 'soir';
  // Soir : les matchs du jour même qui commencent à l'heure de publication ou après (« ce soir », daté en absolu) puis les jours suivants.
  const keepNext = r => !soir || r.date > edition.day || (r.date === edition.day && !!at && !!r.time && r.time >= at);
  const base = pickSports(masthead, edition.day, { max: 10000, days: soir ? 0 : 1, nextDays: cfg.sports.upcomingDays });
  const seen = new Set(), results = [];
  for (const r of base.results) { const key = resultKey(r); if (seen.has(key) || coveredKeys.has(key)) continue; seen.add(key); results.push({ ...r, key }); }
  let nextList = base.next.filter(keepNext);
  if (!nextList.length) nextList = pickSports(masthead, edition.day, { max: 10000, days: 0, nextDays: cfg.sports.upcomingFallbackDays }).next.filter(keepNext);
  const ns = new Set(), next = [];
  for (const r of nextList) { const key = nextKey(r); if (ns.has(key)) continue; ns.add(key); next.push({ ...r, key }); }
  for (const r of results) r.text = resultText(r);
  for (const r of next) r.text = nextText(r);
  results.sort((a, b) => (b.uni - a.uni) || a.sport.localeCompare(b.sport, 'fr') || String(a.league).localeCompare(String(b.league), 'fr') || String(b.date).localeCompare(String(a.date)));
  next.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)) || (b.uni - a.uni) || a.sport.localeCompare(b.sport, 'fr'));
  return { results, next };
}
/** Résultats groupés par sport (« 🏒 Hockey (F) »), universitaire puis collégial. */
export function groupResults(results) {
  const m = new Map();
  for (const r of results) { const k = `${r.uni ? 'u' : 'c'}|${r.emoji} ${r.sport}`; if (!m.has(k)) m.set(k, { label: `${r.emoji} ${r.sport}`, uni: r.uni, items: [] }); m.get(k).items.push(r); }
  return [...m.values()];
}
/** Matchs à venir groupés par date (« jeu. 19 nov. »). */
export function groupNext(next) {
  const m = new Map();
  for (const r of next) { if (!m.has(r.date)) m.set(r.date, { date: r.date, label: frDayYear(r.date).replace(/^./, c => c.toUpperCase()), items: [] }); m.get(r.date).items.push(r); }
  return [...m.values()];
}
// Régate ou épreuve (voile, #441) : une seule équipe, une place sur un nombre de concurrents (« 3e/12 »), pas de pointage.
export const resultText = r => r.kind === 'classement' ? `${teamTxt(r.teams[0])} : ${String(r.place).replace('/', ' sur ')}, ${r.event}`
  : `${teamTxt(r.teams[0])} ${r.teams[0].score}-${r.teams[1].score} ${teamTxt(r.teams[1])}`;
export const nextText = r => r.event || !r.verb ? `${teamTxt(r.teams[0])} · ${r.event || teamTxt(r.teams[1] || {})}` : `${teamTxt(r.teams[0])} ${r.verb} ${teamTxt(r.teams[1])}`;

// ── Garde-fou des textes d'IA ────────────────────────────────────────────────
const norm = s => String(s || '').normalize('NFC').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ');
const words = s => new Set((String(s || '').normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []));
/** Mots capitalisés admis sans figurer dans la source : vocabulaire français courant d'une revue étudiante. */
const ALLOW_CAPS = new Set(['université', 'universités', 'collège', 'cégep', 'cégeps', 'québec', 'montréal', 'canada', 'canadien', 'canadienne', 'québécois', 'québécoise', 'québécoises', 'québécois', 'sherbrooke', 'laval', 'ottawa']);
const RELATIVE = /\b(demain|hier|aujourd['’]hui|ce soir|ce matin|cette semaine|la semaine prochaine|week-?ends?|tomorrow|yesterday|today|tonight)\b/i;
/**
 * Raison du rejet d'un texte d'IA (null si acceptable) : longueur, guillemets, liens, mention, hashtag, date relative, « week-end »,
 * chiffre ou nom propre absent de la source, langue autre que le français.
 */
const NUMBER_WORDS = Object.fromEntries([
  ['deux', 'two', '2'], ['trois', 'three', '3'], ['quatre', 'four', '4'], ['cinq', 'five', '5'], ['six', 'six', '6'], ['sept', 'seven', '7'],
  ['huit', 'eight', '8'], ['neuf', 'nine', '9'], ['dix', 'ten', '10'], ['onze', 'eleven', '11'], ['douze', 'twelve', '12'], ['quinze', 'fifteen', '15'],
  ['vingt', 'twenty', '20'], ['trente', 'thirty', '30'], ['cent', 'hundred', '100'], ['cents', 'hundreds', '100'], ['mille', 'thousand', '1000'],
  ['million', 'million', 'millions'], ['millions', 'million', 'millions'], ['milliard', 'billion', 'milliards'], ['milliards', 'billion', 'billions'],
  ['dizaine', 'dozen', 'dizaines'], ['dizaines', 'dozens', 'dizaine'], ['centaine', 'hundreds', 'centaines'], ['centaines', 'hundreds', 'centaine'],
].map(([fr, ...v]) => [fr, [fr, ...v]]));
export function textReject(text, source, { min = 40, max = 220 } = {}) {
  const h = String(text || '').replace(/\s+/g, ' ').trim();
  if (h.length < min || h.length > max) return `longueur ${h.length}`;
  if (/[«»"“”#@<>]|https?:|www\./i.test(h)) return 'guillemet, balise, hashtag ou lien';
  if (RELATIVE.test(h)) return 'date relative ou « week-end »';
  const src = words(source);
  // Un chiffre du résumé doit être dans la source. « 11 » est le même fait que « 11e » ou « 11th ».
  for (const n of h.match(/\d+/g) || []) if (!sourceHasNumber(source, n)) return `chiffre absent (${n})`;
  // Nombres en lettres : présents dans la source en lettres (français ou anglais) ou en chiffres.
  for (const w of words(h)) { const n = NUMBER_WORDS[w]; if (n && !n.some(v => src.has(v))) return `nombre absent (${w})`; }
  // Mots capitalisés hors début de phrase : doivent venir de la source (casse, accents, flexion, traduction listée).
  for (const m of h.matchAll(/(?<![.!?:]\s|^)(?<=\s|[(’'-])(\p{Lu}[\p{L}’'-]*)/gu)) {
    const w = m[1].toLowerCase(), base = w.replace(/[’'].*$/, '').replace(/-.*$/, '');
    if (sourceHasName(source, m[1]) || ALLOW_CAPS.has(w) || ALLOW_CAPS.has(base)) continue;
    if (w.split(/[’'-]/).every(p => !p || sourceHasName(source, p) || ALLOW_CAPS.has(p))) continue;
    return `nom absent (${m[1]})`;
  }
  if (detectLang({ title: h }) === 'en') return 'pas en français';
  return null;
}
const TITLE_STOP = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'quand', 'retour', 'pourquoi', 'comment', 'the', 'a', 'an']);
/** Noms propres de plusieurs mots d'un titre français (« Mark Carney », « Elizabeth May ») : le résumé doit les garder. */
export function titleNames(title, lang = 'fr') {
  if (lang !== 'fr') return [];
  const out = [];
  for (const m of String(title || '').matchAll(/(?:\p{Lu}[\p{L}’'-]*)(?:\s+\p{Lu}[\p{L}’'-]*)+/gu)) {
    const parts = m[0].split(/\s+/);
    while (parts.length && TITLE_STOP.has(parts[0].toLowerCase().replace(/[’'].*$/, ''))) parts.shift();
    if (parts.length >= 2) out.push(parts.join(' '));
  }
  return out;
}
const FILLER = /cherche(?:nt|r)? à comprendre|mieux comprendre|souhaite(?:nt)? ainsi|vise(?:nt)? à (?:recueillir|comprendre)|tient(?:nent)? le plus à cœur|quel(?:le)?s?\s+(?:est|sont|était|étaient)|on peut se demander|force est de|il (?:est|serait) (?:important|essentiel|intéressant)|cela (?:montre|illustre|rappelle)\b/i;

/**
 * Garde-fou d'un résumé d'article. Phrases finies, faits du chapô absents du titre, pas de question
 * ni de commentaire. Les noms propres de plusieurs mots du titre restent (pas de confusion de personnes).
 */
export function itemReject(resume, x) {
  const h = String(resume || '').replace(/\s+/g, ' ').trim();
  if (!h) return 'aucun résumé';
  if (!/[.!?…]$/.test(h)) return 'sans point final';
  if (/\?/.test(h) || FILLER.test(h)) return /\?/.test(h) ? 'question' : 'remplissage';
  const why = textReject(h, itemSource(x), { min: RESUME_MIN_CHARS, max: RESUME_MAX_CHARS });
  if (why) return why;
  const low = norm(h);
  const n = sentenceCount(h);
  if (n < 2) return 'trop court';
  if (n > 3) return 'trop de phrases';
  const sim = titleSimilarity(h, x.title);
  if (sim >= TITLE_SIMILARITY_MAX) return `trop proche du titre (${sim.toFixed(2)})`;
  const bare = t => norm(t).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (bare(h) === bare(x.title)) return 'répète le titre';
  const extra = extraFacts(x.body || x.excerpt || '', x.title);
  if (extra.length && !extra.some(f => resumeCoversFact(h, f))) return 'aucun fait hors titre';
  for (const name of titleNames(x.title, x.lang)) if (!low.includes(norm(name))) return `nom du titre absent (${name})`;
  return null;
}
/** Chapô fidèle (français) quand le modèle est refusé ou absent. Vide si la source n’est pas en français. */
export function chapoFallback(x) {
  if (x?.lang === 'en') return '';
  return chapoExtract(x?.body || x?.excerpt || '', x?.title || '');
}
/** Texte source d'un article pour le garde-fou (titre, extrait, média, établissement, auteurs). */
export const itemSource = x => `${x.title} ${x.body || ''} ${x.excerpt || ''} ${x.source} ${x.institution || ''} ${(x.authors || []).join(' ')}`;

// ── Textes déterministes (repli sans IA) ─────────────────────────────────────
const plural = (n, one, many = one + 's') => `${n} ${n > 1 ? many : one}`;
/** Titre d'article cité dans l'amorce : guillemets français, sans point final. */
// Espaces insécables dans les guillemets : « » ne passent jamais seuls à la ligne (écran et papier). Un titre déjà entre
// guillemets est déballé ; des guillemets internes (« Soutenons le journalisme » : …) deviennent “ ” (guillemets de second niveau).
const quoteTitle = t => {
  let s = String(t || '').trim().replace(/[.。]+$/u, '');
  if (/^«[^«»]*»$/u.test(s)) s = s.replace(/^«\s*|\s*»$/gu, '');
  s = s.replace(/«[\s\u00a0\u202f]*/gu, '“').replace(/[\s\u00a0\u202f]*»/gu, '”');
  return `«\u00a0${s}\u00a0»`;
};
const realAuthors = x => (x.authors || []).filter(a => a && a !== 'la rédaction');
const lcFirst = s => String(s || '').replace(/^\p{Lu}(?!\p{Lu}|\))/u, c => c.toLowerCase());
/** Articles mis en avant dans l'amorce : la une (photo) d'abord, puis d'autres médias, titres français de préférence. */
export function highlights(items, max = 3) {
  const out = [], media = new Set();
  const lead = items.find(x => x.image);
  const pool = [...(lead ? [lead] : []), ...items.filter(x => x !== lead && x.lang !== 'en'), ...items.filter(x => x !== lead && x.lang === 'en')];
  for (const x of pool) { if (out.length >= max) break; if (media.has(x.source)) continue; out.push(x); media.add(x.source); }
  for (const x of pool) { if (out.length >= max) break; if (!out.includes(x)) out.push(x); }
  return out;
}
/** Deux phrases d'amorce sur les articles marquants, sans aucun décompte (repli déterministe de l'IA). */
export function ledeNews(model) {
  const [a, b, c] = highlights(model.items || [], 3);
  if (!a) return '';
  const au = realAuthors(a), names = au.length > 1 ? `${au.slice(0, -1).join(', ')} et ${au.at(-1)}` : au[0] || '';
  const by = au.length && au.length <= 3 ? `, sous la plume ${/^[AEIOUYÀÂÉÈÊËÎÏÔÛÜ]/u.test(names) ? 'd’' : 'de '}${names}` : '';
  const open = model.edition?.id === 'soir' ? 'En tête de cette revue du soir' : 'Pour ouvrir la journée';
  const parts = [`${open}, ${a.source} publie ${quoteTitle(a.title)}${by}.`];
  if (b && c && c.source === b.source) parts.push(`À lire aussi : ${quoteTitle(b.title)} et ${quoteTitle(c.title)} dans ${b.source}.`);
  else if (b) parts.push(`À lire aussi : ${quoteTitle(b.title)} dans ${b.source}${c ? `, et ${quoteTitle(c.title)} dans ${c.source}` : ''}.`);
  return parts.join(' ');
}
/** Une phrase sur le sport étudiant (résultat marquant, sinon prochain match) ou, à défaut, la radio étudiante. */
export function ledeSport(model) {
  const r = (model.sports?.results || []).find(x => x.teams?.length === 2);
  if (r) {
    const [x, y] = r.teams;
    return r.tie ? `Sur les terrains, match nul en ${lcFirst(r.sport)} entre ${teamTxt(x)} et ${teamTxt(y)}, ${x.score} à ${y.score}.`
      : `Sur les terrains, en ${lcFirst(r.sport)} : ${teamTxt(x)} ${x.score}, ${teamTxt(y)} ${y.score}.`;
  }
  const n = (model.sports?.next || [])[0];
  if (n) return `Côté sport étudiant, prochain rendez-vous le ${frDay(n.date)}${n.time ? ` à ${frHour(n.time)}` : ''} : ${n.text}.`;
  const st = (model.radio || []).find(s => s.shows?.length);
  if (st) return `À l’antenne, ${st.station} propose ${quoteTitle(st.shows[0].title)}, de ${st.shows[0].when}.`;
  return '';
}
/** Amorce complète : deux phrases sur l'actualité (IA vérifiée ou repli), puis une sur le sport ou la radio. */
export function ledeOf(model) { return [model.chapeau || ledeNews(model) || ledeQuiet(model), ledeSport(model)].filter(Boolean).join(' '); }
/** Édition sans nouvel article : une phrase qui le dit, puis le sport et la radio prennent le relais. */
export function ledeQuiet(model) {
  if ((model.items || []).length) return '';
  const sport = (model.sports?.results || []).length || (model.sports?.next || []).length;
  const radio = (model.radio || []).some(s => s.shows?.length);
  const what = sport && radio ? 'le sport et la radio étudiante' : sport ? 'le sport étudiant' : 'la radio étudiante';
  return `Aucun nouvel article des médias étudiants depuis la dernière revue : cette édition met de l’avant ${what}.`;
}
/** Formules creuses refusées dans une amorce d'IA : on veut des articles précis, pas un survol. */
const GENERIC = /sujets? vari|divers sujets|vari[ée]t[ée] de sujets|abordent|met(tent)? en lumi|au c(œ|oe)ur de|plusieurs articles|les médias étudiants (québécois )?(abordent|traitent|parlent)|cette revue (réunit|rassemble)|\bnous\b|\bvous\b|vers le succès/i;
// Mots pleins (5 lettres et plus, sans accents) pour vérifier qu'un sujet est attribué au bon média.
const fold = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const contentWords = s => new Set((fold(s).match(/\p{L}{5,}/gu) || []));
/** Garde-fou de l'amorce d'IA : textReject + au moins un média cité + pas de formule générique + deux ou trois phrases. */
export function ledeReject(text, items = []) {
  const why = textReject(text, items.map(itemSource).join(' '), { min: 80, max: 380 });
  if (why) return why;
  if (GENERIC.test(text)) return 'formule générique';
  const low = norm(text);
  if (!items.some(x => low.includes(norm(x.source)))) return 'aucun média cité';
  const names = [...new Set(items.map(x => x.source).filter(Boolean))].sort((x, y) => y.length - x.length);
  // Chaque média au plus une fois (« Le Collectif revient…, tandis que Le Collectif raconte… » : lourd).
  for (const m of names) if (low.split(norm(m)).length > 2) return `média répété : ${m}`;
  // Nom de média altéré (« Le Campus » pour The Campus, « Le Link ») : seul le nom exact du fil est permis.
  let rest = String(text);
  for (const m of names) rest = rest.split(m).join(' ');
  const cores = new Set(names.map(m => norm(m.replace(/^(the|le|la|les|l['’])\s*/i, ''))).filter(c => c.length > 2));
  for (const g of rest.matchAll(/\b(?:The|Le|La|Les|L['’])\s*(\p{Lu}[\p{L}’'-]+)/gu)) if (cores.has(norm(g[1]))) return `nom de média altéré : ${g[0]}`;
  // Attribution : après chaque nom de média, un mot plein tiré du titre d'un AUTRE média (et absent des articles du média
  // nommé) signale un sujet prêté au mauvais journal (« La Pige … la génération Z » alors que c'est Quartier Libre).
  const hits = names.flatMap(m => { const out = []; let i = -1; while ((i = String(text).indexOf(m, i + 1)) >= 0) out.push([i, m]); return out; }).sort((x, y) => x[0] - y[0]);
  for (let k = 0; k < hits.length; k++) {
    const [at, m] = hits[k], seg = String(text).slice(at + m.length, k + 1 < hits.length ? hits[k + 1][0] : undefined);
    const own = contentWords(items.filter(x => x.source === m).map(x => `${x.title} ${x.excerpt || ''}`).join(' '));
    const other = contentWords(items.filter(x => x.source !== m).map(x => x.title).join(' '));
    for (const w of contentWords(seg)) if (other.has(w) && !own.has(w)) return `attribution douteuse (${m} : ${w})`;
  }
  // Mots anglais hors noms de médias (« partnership », « students ») : l'amorce est en français.
  if (/\b(the|and|of|with|for|from|students?|partnership|campus life|university)\b/i.test(rest)) return 'mot anglais';
  const n = (String(text).match(/[.!?…](\s|$)/g) || []).length;
  if (n < 1 || n > 3) return `${n} phrase(s)`;
  return null;
}
/** Titre (headline ≤ 110 caractères) et description (≤ 200) : déterministes, à partir des données. */
export function headlineOf(model) { return `${model.edition.label} du ${frDayYear(model.edition.day)}`; }
export function descriptionOf(model) {
  const first = (ledeNews(model) || ledeQuiet(model)).split(/(?<=[.!?»])\s+(?=\p{Lu}|À)/u)[0] || '';
  const d = `${headlineOf(model)}. ${first}`.trim();
  return d.length > 200 ? d.slice(0, 197).replace(/\s+\S*$/, '') + '…' : d;
}

// ── Photo campus (édition sans article) ─────────────────────────────────────
const SEASON_OF_MONTH = ['hiver', 'hiver', 'hiver', 'printemps', 'printemps', 'printemps', 'ete', 'ete', 'ete', 'automne', 'automne', 'automne'];
let CAMPUS_BANK = null;
function campusBank() {
  if (CAMPUS_BANK) return CAMPUS_BANK;
  try { CAMPUS_BANK = require('../../data/quebec-university-backgrounds.json').photos || []; } catch { CAMPUS_BANK = []; }
  return CAMPUS_BANK;
}
let STOCK_LOCAL = null;
/** Miroir local des photos Commons (stock-images-map.js : URL d'origine → assets/stock-images/…). */
function stockLocal() {
  if (STOCK_LOCAL) return STOCK_LOCAL;
  try {
    const src = require('node:fs').readFileSync(new URL('../../stock-images-map.js', import.meta.url), 'utf8');
    STOCK_LOCAL = JSON.parse(src.slice(src.indexOf('{'), src.indexOf('}') + 1));
  } catch { STOCK_LOCAL = {}; }
  return STOCK_LOCAL;
}
/** Vignette Commons 1280 px (l'original fait souvent 4000 px et plus). */
export function commonsThumb(url, width = 0, px = 1280) {
  const m = String(url || '').match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)$/);
  if (!m || (width && width <= px)) return String(url || '');
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${m[3]}/${px}px-${m[3]}`;
}
/**
 * Couverture d'une édition sans photo d'article : photo libre d'un campus (banque du mât, Wikimedia Commons).
 * L'établissement du premier match ou résultat universitaire de l'édition, sinon toute la banque ; saison du jour
 * de préférence, paysage seulement, aucun visage. Choix stable pour une édition donnée.
 */
export function campusCover(edition, { sports = {}, radio = [] } = {}, photos = campusBank()) {
  const ok = p => p && /^https:\/\//.test(p.url || '') && !(p.faces > 0) && (!p.width || !p.height || p.width >= p.height) && !campusLib.isRejectedCampusPhoto?.(p);
  const season = SEASON_OF_MONTH[Number(String(edition.day).slice(5, 7)) - 1];
  const pickFrom = list => {
    const good = list.filter(ok);
    const inSeason = good.filter(p => p.season === season);
    const pool = inSeason.length ? inSeason : good.filter(p => !p.season);
    return pool.length ? pool[campusLib.hashIndex(edition.key || edition.day, pool.length)] : null;
  };
  const all = [...(sports.next || []), ...(sports.results || [])];
  const team = (all.find(r => r.uni) || all[0])?.teams?.[0];
  const inst = team?.inst || team?.name || '';
  const p = (inst && pickFrom(campusLib.filterUniversityPhotos(photos, inst))) || pickFrom(photos);
  if (!p) return null;
  return {
    // Miroir du Radar d'abord (même politique d'images que le site), sinon vignette Commons.
    // `commons` : vignette 1280 px, plus nette pour les images 1080 px des réseaux (le miroir fait 500 px).
    url: (local => (local ? `${SITE}/${local}` : commonsThumb(p.url, p.width)))(stockLocal()[String(p.url).split('?')[0]]),
    commons: commonsThumb(p.url, p.width), credit: `Photo : ${p.credit || 'auteur inconnu'} / ${p.license || 'licence libre'} · Wikimedia Commons`,
    source: '', title: p.title || 'Campus', link: p.link || '', stock: false, campus: true,
  };
}

// ── Modèle complet et validation ─────────────────────────────────────────────
/**
 * Modèle d'une revue (sans IA) : la page, le flux RSS et les sitemaps sont rendus depuis cet objet, stocké dans data/revue/.
 * `ai` (facultatif) : { chapeau, items: { id: { resume, theme } }, model } déjà validé par revue-ai.mjs.
 */
export function buildModel({ edition, period, items, sports, radio, now, ai = null, published = null, previous = null }) {
  const its = items.map(x => {
    const a = ai?.items?.[x.id];
    const theme = a?.theme && THEMES.includes(a.theme) ? a.theme : x.theme;
    let resume = a?.resume || '';
    let resumeBy = a?.resumeBy || (resume ? 'ia' : '');
    if (resume && resumeBy !== 'chapo' && itemReject(resume, x)) { resume = ''; resumeBy = ''; }
    let excerpt = x.excerpt;
    if (!resume) {
      const c = chapoFallback(x);
      if (c) { resume = c; resumeBy = 'chapo'; }
      else {
        const q = chapoExtract(x.body || x.excerpt, x.title);
        if (q) excerpt = q;
      }
    }
    return { ...x, theme, excerpt, resume, resumeBy };
  });
  const lead = its.find(x => x.image && !x.imageStock) || null;
  const cover = lead ? { url: lead.image, credit: lead.credit, source: lead.source, title: lead.title, stock: !!lead.imageStock }
    : (!its.length ? campusCover(edition, { sports, radio }) : null);
  const m = {
    version: 1, id: edition.key, edition: { id: edition.id, label: edition.label, emoji: edition.emoji, day: edition.day },
    path: reviewPath(edition.day, edition.id), url: reviewUrl(edition.day, edition.id),
    period: { start: period.start, end: period.end },
    datePublished: published || new Date(now).toISOString(), dateModified: new Date(now).toISOString(),
    items: its, sports, radio, image: cover,
    chapeau: ai?.chapeau || '', generator: ai && (ai.chapeau || Object.values(ai.items || {}).some(v => v?.resumeBy === 'ia')) ? `ia:${ai.model || 'workers-ai'}` : 'gabarit', previous,
  };
  m.headline = headlineOf(m); m.description = descriptionOf(m); m.intro = ledeOf(m);
  m.articleIds = its.map(x => x.id); m.sportKeys = sports.results.map(r => r.key);
  m.categories = [...new Set(['Revue de presse', 'Médias étudiants', 'Québec', ...groupByTheme(its).map(g => g.theme), ...(sports.results.length || sports.next.length ? ['Sport étudiant'] : []), ...(radio.length ? ['Radio étudiante'] : [])])];
  return m;
}
/**
 * Garde-fou final : la revue ne sort que si tout vient des données.
 * `data` = { news, masthead, schedules } bruts. Retourne la liste des problèmes (vide = publiable).
 */
export function validateReview(model, data) {
  const p = [];
  // Sans article, la revue ne sort que si le sport ou la radio la remplissent (édition « sport et radio »).
  const filler = (model?.sports?.results || []).length || (model?.sports?.next || []).length || (model?.radio || []).some(s => s.shows?.length);
  if (!model?.items?.length && !filler) p.push('revue vide : aucun article, aucun match, aucune émission');
  const byLink = new Map((Array.isArray(data.news) ? data.news : data.news?.items || []).map(it => [String(it.link).trim(), it]));
  for (const x of model.items || []) {
    const it = byLink.get(x.link);
    if (!it) { p.push(`lien absent des données : ${x.link}`); continue; }
    if (clean(it.title) !== x.title) p.push(`titre modifié : ${x.title}`);
    if (clean(it.source) !== x.source) p.push(`média modifié : ${x.source}`);
    const want = front.authorNames(it);
    if (JSON.stringify(want) !== JSON.stringify(x.authors)) p.push(`auteurs différents des données pour « ${x.title} » : ${JSON.stringify(x.authors)} ≠ ${JSON.stringify(want)}`);
    if (x.resume && x.resumeBy === 'chapo') {
      const src = clean(`${it.leadExcerpt || ''} ${it.excerpt || ''} ${x.body || ''}`);
      const needle = clean(x.resume).replace(/…$/u, '').trim();
      if (needle && !src.includes(needle)) p.push(`extrait absent de la source : ${x.title}`);
    } else if (x.resume) { const why = itemReject(x.resume, x); if (why) p.push(`résumé refusé (${why}) : ${x.title}`); }
    if (x.excerpt && !clean(`${it.leadExcerpt || ''} ${it.excerpt || ''}`).includes(x.excerpt.replace(/…$/, '').trim())) p.push(`extrait absent de la source : ${x.title}`);
  }
  if (model.chapeau) { const why = ledeReject(model.chapeau, model.items || []); if (why) p.push(`chapeau refusé (${why})`); }
  // Radio : chaque émission existe telle quelle dans la grille de sa station.
  for (const st of model.radio || []) {
    const grid = data.schedules?.stations?.[st.id]?.grid || [];
    for (const s of st.shows) if (!grid.some(g => clean(g.title) === s.title && g.start === s.start && (!s.url || g.url === s.url))) p.push(`émission absente de la grille : ${st.station} ${s.start} ${s.title}`);
  }
  // Sport : chaque résultat et chaque match à venir est recalculé depuis sports-masthead.json.
  if (model.sports && data.masthead) {
    const ed = { ...model.edition, ...EDITIONS[model.edition.id] };
    const again = pickSports(data.masthead, model.edition.day, { max: 10000, days: ed.id === 'soir' ? 0 : 1, nextDays: 7 });
    const rk = new Set(again.results.map(resultKey)), nk = new Set(again.next.map(nextKey));
    for (const r of model.sports.results || []) if (!rk.has(resultKey(r))) p.push(`résultat absent des données : ${resultText(r)}`);
    for (const r of model.sports.next || []) if (!nk.has(nextKey(r))) p.push(`match absent des données : ${nextText(r)}`);
  }
  return p;
}
/** Liens d'une page rendue qui ne viennent ni des données ni du site (tout href http). */
export function foreignLinks(html, model) {
  const ok = new Set([...(model.items || []).map(x => x.link), ...(model.radio || []).flatMap(s => s.shows.map(x => x.url).filter(Boolean))]);
  const out = [];
  for (const m of String(html).matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    const u = m[1].replace(/&amp;/g, '&');
    if (ok.has(u) || u.startsWith(SITE + '/') || /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|buymeacoffee\.com|www\.buymeacoffee\.com)\b/.test(u)) continue;
    out.push(u);
  }
  return out;
}

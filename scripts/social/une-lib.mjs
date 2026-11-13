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
import { institutionTag } from './hashtags.mjs';

const require = createRequire(import.meta.url);
const front = require('../magazine-front-page-lib.js');
const authors = require('../author-lib.js');

export const NETS = ['bluesky', 'mastodon', 'x', 'tumblr', 'facebook', 'linkedin'];
export const SLOTS = {
  matin: { id: 'matin', label: 'La une du matin', emoji: '☀️', target: '07:45', from: '07:30', to: '10:30' },
  soir: { id: 'soir', label: 'La une du soir', emoji: '🌙', target: '19:30', from: '19:15', to: '22:30' },
};
/** Format d'image par réseau : portrait 4:5 (Facebook, Tumblr), paysage 16:9 (X, Bluesky, Mastodon, LinkedIn). */
export const IMAGE_FOR = { facebook: 'portrait', tumblr: 'portrait', x: 'paysage', bluesky: 'paysage', mastodon: 'paysage', linkedin: 'paysage' };
export const IMAGE_SIZES = { portrait: { width: 1080, height: 1350 }, paysage: { width: 1200, height: 675 } };
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
  const items = cand.map(it => ({ ...front.normalize(it, '..'), byline: byline(it), tag: institutionTag({ source: it.source, title: it.title, desc: it.excerpt || '' }), siteImage: siteImage(it) })).filter(x => x.id);
  const skip = !items.length;
  const why = skip ? (slot.id === 'soir' ? 'rien de nouveau depuis le matin : publication sautée' : 'aucun article nouveau à la une : publication sautée') : `${items.length} article(s)`;
  return { items, lead: items[0] || null, ids: items.map(x => x.id), skip, why, doubts, available: picked.length };
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
export function buildUneText(model, net, spec = NET_SPEC[net], { tags = [] } = {}) {
  const len = spec.len || xlen, long = !!spec.subheaders;
  const head = `${model.slot.emoji} ${model.slot.label} du Radar · ${frDay(model.slot.day)}`;
  const compose = (items, hash, cut) => {
    const T = x => cut ? clip(x.title, cut) : x.title;
    let body;
    if (long) {
      body = items.map((x, i) => `${i + 1}. ${T(x)}\n✍️ ${x.byline}\n${x.pageUrl}`).join('\n\n');
      body += `\n\nToute la une : ${HOME}`;
    } else {
      body = items.map(x => `▪️ ${T(x)} — ${x.byline}`).join('\n') + '\n\n' + (items.length === 1 ? items[0].pageUrl : HOME);
    }
    return [head, body, hash.join(' ')].filter(Boolean).join('\n\n');
  };
  let items = [...model.items], hash = [...tags], cut = 0;
  for (;;) {
    const t = compose(items, hash, cut);
    if (len(t) <= spec.limit) return t;
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
export function checkUneText(text, net, model, spec = NET_SPEC[net]) {
  const p = [], len = spec.len || xlen;
  if (!text) return ['texte vide'];
  if (len(text) > spec.limit) p.push(`trop long (${len(text)}/${spec.limit})`);
  if (/(^|[\s(])@[\w.]+/.test(text)) p.push('mention @ interdite');
  const own = model.items.reduce((t, x) => t.split(x.title).join(' '), text).replace(/https?:\/\/\S+/g, ' ');
  if (/week-?end/i.test(own)) p.push('« week-end » interdit (écrire « fin de semaine »)');
  if (!/https:\/\/le-radar\.ca\//.test(text)) p.push('lien le-radar.ca manquant');
  if (/undefined|NaN|\[object|null/.test(text)) p.push('valeur invalide');
  const leadStart = [...model.items[0].title].slice(0, 20).join('');
  if (!text.includes(leadStart)) p.push('titre de la une absent');
  return p;
}
/** Tous les textes d'un créneau. `maxByNetwork` : plafonds de hashtags. */
export function buildUneAll(model, maxByNetwork = {}) {
  const out = {};
  for (const n of NETS) {
    const spec = NET_SPEC[n], tags = n === 'tumblr' ? [] : uneTags(model.items, maxByNetwork[n] ?? 2);
    const text = buildUneText(model, n, spec, { tags });
    out[n] = { text, tags: n === 'tumblr' ? uneTumblrTags(model.items) : tags, len: text ? spec.len(text) : 0, limit: spec.limit, image: IMAGE_FOR[n], problems: checkUneText(text, n, model, spec) };
  }
  return out;
}

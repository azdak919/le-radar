// Logique pure des publications sociales du Radar (testée dans tests/social-buffer.mjs).
// Limite par réseau (comptage de la plateforme ; liens X = 23). Les @ viennent d'une liste
// PAR réseau (data/social/x-accounts.json pour X) : ne jamais réutiliser les @ X ailleurs.
export const LIMITS = { x: 280, bluesky: 300, mastodon: 500 };
export const X_LIMIT = LIMITS.x;
export const URL_LEN = 23;       // X compte tout lien comme 23 caractères
export const QUEUE_MAX = 10;     // forfait gratuit Buffer : 10 posts planifiés par canal
export const PER_SOURCE_MAX = 2;
export const MAX_AGE_H = 72;

const ent = s => (s || '').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&hellip;/g, '…').replace(/&[lr]squo;/g, '’').replace(/&[lr]dquo;/g, '"').replace(/&amp;/g, '&');
const dec = s => ent((s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim();
const tag = (b, t) => { const m = b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? dec(m[1]) : ''; };
const plain = h => ent(ent((h || '').replace(/<[^>]*>/g, ' '))).replace(/\s+/g, ' ').trim();
export const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
import { createRequire } from 'node:module';
const { articleId } = createRequire(import.meta.url)('../../mobile/app/js/core.js');
export { articleId };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function stripUtm(u) {
  try { const x = new URL(u); for (const k of [...x.searchParams.keys()]) if (/^utm_/i.test(k)) x.searchParams.delete(k); return x.toString().replace(/\?$/, ''); } catch { return u; }
}

/** Crédit de la photo du flux (figcaption de content:encoded) : « Photo: Aidan Raynor » → « Aidan Raynor »,
 * « Illustration : Maud Amoretti » gardé tel quel. Vide si absent. */
export function feedCredit(html = '') {
  const m = String(html).match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i); if (!m) return '';
  let c = dec(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  while (/^photo\s*:\s*/i.test(c)) c = c.replace(/^photo\s*:\s*/i, '');
  c = c.replace(/^illustration\s*:\s*/i, 'Illustration : ');
  // Libellé de rubrique pris pour un crédit (« Photo: Features ») : inutilisable.
  if (/^(features?|news|opinions?|sports?|culture|photos?|illustrations?|crédits?|credits?)$/i.test(c)) return '';
  return c.length >= 2 && c.length <= 120 ? c : '';
}

/** Remplace la ligne 📸 d'un post en file par le crédit actuel du flux, seulement si l'image du post
 * est celle du flux (sinon : banque ou page article, crédit propre à cette image). null = rien à faire. */
export function refreshPhotoLine(text, it, assetUrl = '', limit = X_LIMIT) {
  const lines = String(text || '').split('\n'), i = lines.findIndex(l => l.startsWith('📸'));
  if (!it?.img) return null;
  const k = u => String(u || '').replace(/^https?:\/\//, '').replace(/[?#].*$/, '');
  if (assetUrl && k(assetUrl) !== k(it.img)) return null;
  const want = photoLine(it.credit);
  if (i >= 0) { if (want) lines[i] = want; else lines.splice(i, 1); } else if (want) lines.push(want); else return null;
  // Plafond : raccourcit l'extrait (paragraphe entre deux lignes vides) au mot entier, jamais le lien ni le crédit.
  const e = lines[1] === '' && lines[3] === '' ? 2 : -1;
  while (e > 0 && xlen(lines.join('\n')) > limit && / \S+…?$/.test(lines[e])) lines[e] = lines[e].replace(/[\s,;:.–—-]*\s\S+…?$/, '…');
  const out = lines.join('\n');
  return xlen(out) > limit ? null : out;
}

export function parseFeed(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const b = m[1]; const desc = tag(b, 'description');
    const enc = (b.match(/<enclosure[^>]*url="([^"]+)"/) || [])[1];
    const img = ent(enc || (desc.match(/<img[^>]*src="([^"]+)"/) || [])[1] || (b.match(/<media:(?:thumbnail|content) url="([^"]+)"/) || [])[1] || '');
    const title = tag(b, 'title'), author = tag(b, 'dc:creator'), source = tag(b, 'source');
    const m2 = title.match(/^.*?\s[–-]\s.*?\s?:\s(.+)$/);
    const link = stripUtm(ent(tag(b, 'link')));
    return {
      id: tag(b, 'guid') || link, title, bare: m2 ? m2[1].trim() : title, link, author, source, img,
      date: new Date(tag(b, 'pubDate')), desc: plain(desc),
      categories: [...b.matchAll(/<category>([\s\S]*?)<\/category>/g)].map(x => dec(x[1])),
      credit: feedCredit(tag(b, 'content:encoded')),
    };
  }).sort((a, b) => b.date - a.date);
}

// Visuels récurrents / externes à écarter de l'image du flux.
export const RECUR = /5-infos|cinq-infos|cinq-nouvelles|nouvelles-de-la-semaine|logo|default|placeholder|favicon|avatar|icon/i;
const EXTERNAL = /(^|\.)(staticflickr\.com|flickr\.com)$/i;
export function markImages(items) {
  const seen = new Map();
  for (const it of items) if (it.img) { const k = it.source + '|' + it.img; seen.set(k, (seen.get(k) || 0) + 1); }
  for (const it of items) {
    it.imgDropped = null; if (!it.img) continue;
    let host = '', path = ''; try { host = new URL(it.img).hostname; path = new URL(it.link).pathname; } catch {}
    if (seen.get(it.source + '|' + it.img) > 1) it.imgDropped = 'récurrent';
    else if (RECUR.test(it.img) || RECUR.test(path)) it.imgDropped = 'récurrent';
    else if (EXTERNAL.test(host)) it.imgDropped = 'flickr';
  }
  const repeated = new Map();
  for (const [k, n] of seen) if (n > 1) {
    const i = k.indexOf('|'), src = k.slice(0, i);
    try { const x = new URL(k.slice(i + 1)); if (!repeated.has(src)) repeated.set(src, new Set()); repeated.get(src).add(x.hostname + x.pathname); } catch {}
  }
  return repeated;
}

// Comptage pondéré de X (twitter-text v3) : lien = 23 ; poids 1 pour U+0000–10FF, 2000–200D,
// 2010–201F, 2032–2037 ; tout le reste (•, …, emoji, etc.) = 2.
const W1 = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
export const xlen = s => [...s.replace(/https?:\/\/\S+/g, 'x'.repeat(URL_LEN))].reduce((n, c) => { const k = c.codePointAt(0); return n + (W1.some(([a, b]) => k >= a && k <= b) ? 1 : 2); }, 0);
/** « 📸 Auteur » : auteur·e connu·e de la photo, sinon le nom du média (jamais inventé). */
export const photoLine = credit => String(credit || '').trim() ? `📸 ${String(credit).trim()}` : '';

export function excerpt(it, { ai = false } = {}) {
  if (ai && typeof it.aiHook === 'string' && it.aiHook.trim()) return it.aiHook.trim(); // accroche IA validée (ai-hook.mjs)
  let d = it.desc; if (!d) return '';
  for (const p of [it.title, it.bare]) if (p && d.startsWith(p)) d = d.slice(p.length).replace(/^[\s:–-]+/, '');
  if (it.author) d = d.replace(new RegExp('^(par|by)?\\s*' + esc(it.author) + '[\\s,:–-]*', 'i'), '');
  d = d.replace(/\s*(The post|Cet article|L’article|L'article) .* (appeared first on|est apparu en premier sur) .*$/i, '').replace(/\s*\[(…|\.\.\.)\]\s*$/, '…').trim();
  d = d.replace(/[^.!?…]*\b(cliquer?|cliquez) ici\b[^.!?…]*[.!?…]?/gi, '')
    .replace(/[^.!?…]*\b(click here|lire la suite|read more|continue reading|en savoir plus)\b[^.!?…]*[.!?…]?/gi, '').replace(/\s+/g, ' ').trim();
  if (!d || norm(d) === norm(it.bare) || norm(it.bare).startsWith(norm(d))) return '';
  return d;
}

/** Réseaux sociaux seulement : « Média (@média) • Auteur (@auteur) • Titre » ; @ seulement si cle_flux === nom exact.
 *  Jamais de @ en tête (X le traiterait comme une réponse) : toujours le nom, puis le @ entre parenthèses. */
export function mentionHead(it, accounts = []) {
  const src = accounts.find(a => a.type === 'source' && a.cle_flux && a.cle_flux === it.source);
  const au = it.author && accounts.find(a => a.type === 'auteur' && a.cle_flux && a.cle_flux === it.author);
  const media = src ? `${it.source} (${src.handle})` : it.source;
  const author = it.author && it.author !== it.source ? (au ? `${it.author} (${au.handle})` : it.author) : '';
  const title = it.bare || it.title;
  return [media, author, title].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' • ');
}

/** Ancien en-tête « Média – Auteur : Titre » → « Média • Auteur • Titre ». */
export function bulletHead(line) {
  const m = line.match(/^(.*?)\s[–-]\s(.*?)\s?:\s(.+)$/);
  return m ? [m[1], m[2], m[3]].filter((x, i, a) => x && a.indexOf(x) === i).join(' • ') : line;
}

/** En-tête déjà en file commençant par « @handle • » → « Nom (@handle) • » (nom via la liste, sinon source). */
export function namedHead(line, accounts = [], source = '') {
  const m = line.match(/^(@\w+)(\s.*|$)/);
  if (!m) return line;
  const a = accounts.find(x => x.type === 'source' && x.cle_flux && x.handle.toLowerCase() === m[1].toLowerCase());
  const name = a ? a.cle_flux : source;
  return name ? `${name} (${m[1]})${m[2]}` : line.replace(/^@/, '');
}

/** « Titre : extrait » (fr), « Title: excerpt » (en), simple espace après ? ! … */
const colonEn = t => /[^\s]: /.test(t || '') && !/\s: /.test(t || '');
/** Langue par mots-outils fr/en (titre + extrait) ; égalité → règle du deux-points (« Title: » = en). */
export function detectLang(it) {
  const w = ` ${((it.title || '') + ' ' + (it.desc || '')).toLowerCase().replace(/[^a-zà-ÿœ’']+/g, ' ')} `;
  const n = list => list.reduce((k, x) => k + (w.split(` ${x} `).length - 1), 0);
  const fr = n(['le', 'la', 'les', 'des', 'du', 'de', 'et', 'est', 'une', 'un', 'dans', 'pour', 'que', 'qui', 'au', 'aux', 'sur', 'pas', 'avec', 'en']);
  const en = n(['the', 'and', 'of', 'to', 'is', 'in', 'for', 'that', 'with', 'on', 'are', 'was', 'this', 'from', 'at', 'it', 'their', 'a']);
  return en > fr ? 'en' : fr > en ? 'fr' : colonEn(it.title) ? 'en' : 'fr';
}
export const isEnglish = title => detectLang({ title }) === 'en';
export function joinHead(head, ex, en = isEnglish(head)) {
  if (!ex) return head;
  if (/[?!…]$/.test(head.trim())) return `${head.trim()} ${ex}`;
  return `${head.trim()}${en ? ':' : ' :'} ${ex}`;
}

export const SITE = 'https://le-radar.ca';
/** Lien partagé partout : fiche statique le-radar.ca/article/<id>/ (même identifiant que l'appli). */
export const siteLink = it => { const id = articleId(it?.link || ''); return id ? `${SITE}/article/${id}/` : (it?.link || ''); };
export const SEP = ' · '; // U+00B7, espacé : séparateur unique du format

/** « Média (@média) · Auteur (@auteur) » ; @ seulement si cle_flux === nom exact (liste PAR réseau). */
export function mediaLine(it, accounts = []) {
  const src = accounts.find(a => a.type === 'source' && a.cle_flux && a.cle_flux === it.source);
  const au = it.author && accounts.find(a => a.type === 'auteur' && a.cle_flux && a.cle_flux === it.author);
  const media = (it.source || '').trim() ? (src ? `${it.source.trim()} (${src.handle})` : it.source.trim()) : '';
  const name = (it.author || '').trim();
  const author = name && norm(name) !== norm(it.source) ? (au ? `${name} (${au.handle})` : name) : '';
  return [media, author].filter(Boolean).join(SEP);
}

/** Phrases (fin . ! ? … suivie d'une majuscule, d'un chiffre ou d'un guillemet). */
export const sentences = t => String(t || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?…»"”])\s+(?=[«"“A-ZÀ-ÝŒ0-9])/).filter(Boolean);

/** Extrait coupé en fin de phrase : au plus `max` phrases qui tiennent ; sinon 1re phrase coupée au mot (« … », ≥ 40 car.). */
export function cutExcerpt(ex, fits, max = 2) {
  const ss = sentences(ex); let best = '';
  for (let k = 1; k <= Math.min(max, ss.length); k++) { const c = ss.slice(0, k).join(' '); if (fits(c)) best = c; else break; }
  if (best || !ss.length) return best;
  const words = ss[0].split(' ');
  for (let k = words.length - 1; k > 0; k--) { const c = words.slice(0, k).join(' ').replace(/[\s,;:.–—-]+$/, '') + '…'; if (fits(c)) return c.length >= 40 ? c : ''; }
  return '';
}

/**
 * Format unique des 5 réseaux (lignes, pas de puces) :
 *   Titre
 *   (ligne vide) Extrait, 1-2 phrases entières
 *   (ligne vide) Média (@média) · Auteur
 *   https://le-radar.ca/article/<id>/
 *   📸 Crédit            (seulement si un crédit réel est connu : jamais de doublon du média)
 * Jamais de séparateur vide ni de doublon. Texte contenant « tison » : '' (refusé).
 */
export function buildText(it, accounts = [], limit = X_LIMIT, { credit = '', photo = true, len = xlen, link = true, url = siteLink(it), ai = false } = {}) {
  const pl = photo ? photoLine(credit) : '';
  let title = String(it.bare || it.title || '').replace(/\s+/g, ' ').trim();
  const ml = mediaLine(it, accounts);
  const tail = [ml, link ? url : '', pl].filter(Boolean).join('\n');
  const mk = (t, e) => [t, e, tail].filter(Boolean).join('\n\n');
  const ex = cutExcerpt(excerpt(it, { ai }), e => len(mk(title, e)) <= limit);
  let text = mk(title, ex);
  while (len(text) > limit && title.length > 10) { title = title.slice(0, -2).trimEnd().replace(/[\s,;:.–—-]+$/, '') + '…'; text = mk(title, ''); }
  return /tison/i.test(text) ? '' : text;
}

/**
 * Choix des items : non envoyés, ≤ maxAgeH, round-robin par source (plus récente d'abord),
 * max perSource par source EN COMPTANT ceux déjà en file (queuedSources).
 */
export function selectItems(items, { sentIds = new Set(), queuedSources = [], slots = QUEUE_MAX, perSource = PER_SOURCE_MAX, maxAgeH = MAX_AGE_H, now = Date.now() } = {}) {
  const count = new Map(); for (const s of queuedSources) count.set(s, (count.get(s) || 0) + 1);
  const by = new Map();
  for (const it of items) {
    if (sentIds.has(it.id) || !(now - it.date <= maxAgeH * 3600e3)) continue;
    if (!by.has(it.source)) by.set(it.source, []); by.get(it.source).push(it);
  }
  // variété d'abord, puis récence (jour civil), et à jour égal la vraie photo créditée à une personne.
  // Les articles sans photo propre (repli banque campus) restent publiés, simplement après à égalité.
  const cmpP = (a, b) => (dayOf(a.date) !== dayOf(b.date) ? b.date - a.date : photoRank(b) - photoRank(a) || b.date - a.date);
  const queues = [...by.entries()].map(([s, q]) => ({ s, q: q.sort(cmpP) }))
    .sort((a, b) => (count.get(a.s) || 0) - (count.get(b.s) || 0) || cmpP(a.q[0], b.q[0]));
  const sel = [];
  for (let r = 0; sel.length < slots && r < perSource; r++)
    for (const { s, q } of queues) {
      if (sel.length >= slots) break;
      if ((count.get(s) || 0) >= perSource || !q.length) continue;
      sel.push(q.shift()); count.set(s, (count.get(s) || 0) + 1);
    }
  return sel;
}

/** Sources / auteurs du flux sans compte connu (rapport hebdo). */
export function unknownAccounts(items, accounts) {
  const keys = new Set(accounts.map(a => a.cle_flux).filter(Boolean));
  const src = new Map(), aut = new Map();
  for (const it of items) {
    if (it.source && !keys.has(it.source)) src.set(it.source, (src.get(it.source) || 0) + 1);
    if (it.author && it.author !== it.source && !keys.has(it.author)) aut.set(it.author, it.source);
  }
  return { sources: [...src.keys()].sort(), authors: [...aut.entries()].sort().map(([a, s]) => ({ author: a, source: s })) };
}

/** Créneaux "HH:MM" d'aujourd'hui (fuseau tz) encore à venir → ISO UTC. Gère le changement d'heure. */
export function slotsToday(times, { tz = 'America/Toronto', now = Date.now(), dayOffset = 0 } = {}) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  // dayOffset = 1 : créneaux du lendemain (passe du soir, ≈ 21 h Toronto).
  const day = dayOffset ? new Date(Date.parse(f.format(now) + 'T12:00:00Z') + dayOffset * 864e5).toISOString().slice(0, 10) : f.format(now);
  const off = t => { const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(t).find(x => x.type === 'timeZoneName').value;
    const m = p.match(/([+-])(\d\d):?(\d\d)?/); return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0)) : 0; };
  return times.map(hm => { let t = Date.parse(`${day}T${hm}:00Z`); t -= off(t) * 60e3; t = Date.parse(`${day}T${hm}:00Z`) - off(t) * 60e3; return t; })
    .filter(t => t > now + 10 * 60e3).sort((a, b) => a - b).map(t => new Date(t).toISOString());
}

// ── Sélection nocturne (≈ 3 h, America/Toronto) ──────────────────────────────
// Créneaux X alignés sur les pointes Sprout Social 2026 (mar.-jeu. 12-18 h, heure locale) : 1 le matin, 7 de 11 h 30 à 17 h 30, 2 en soirée.
export const DAILY_SLOTS = ['08:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30', '17:30', '19:00', '21:00'];
export const MIN_EXCERPT = 80;
const dayOf = (t, tz = 'America/Toronto') => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);

/** Crédit photo nommant une personne (« Prénom Nom »), pas un pseudo, une banque ni une mention générique. */
export function personCredit(c) {
  const t = String(c || '').replace(/^(photo|photos|illustration|crédit|credit)s?\s*:\s*/i, '').trim();
  if (!t || /wiki|commons|unsplash|pexels|pixabay|shutterstock|getty|istock|courtoisie|courtesy|archives?|stock|@|https?:|\d/i.test(t)) return false;
  return /^\p{Lu}[\p{L}'’.-]+(?:\s+(?:(?:de|du|des|da|di|van|von|den|der|la|le|el|al|bin)\s+)*\p{Lu}[\p{L}'’.-]+)+$/u.test(t);
}
/** Rang photo : 2 = vraie photo du flux créditée à une personne, 1 = photo du flux, 0 = aucune (banque/repli). */
export const photoRank = it => (it.img && !it.imgDropped ? (personCredit(it.credit) && norm(it.credit) !== norm(it.source) ? 2 : 1) : 0);

/** Note de qualité : vraie photo du flux créditée à une personne > photo du flux > extrait substantiel > @ confirmé. */
export function quality(it, accounts = []) {
  const photo = [0, 4, 6][photoRank(it)];
  const ex = excerpt(it).length >= MIN_EXCERPT ? 2 : 0;
  const at = /(^|\s)@\w/.test(mentionHead(it, accounts)) ? 1 : 0;
  return photo + ex + at;
}

/**
 * Choix nocturne : articles NON envoyés de la veille (jour civil Toronto) ; s'il y a moins
 * de `slots` candidats, élargit à 72 h. Variété d'abord (≤ perSource par source, file comprise,
 * round-robin), puis qualité (photo réelle, extrait, @ confirmé), puis récence.
 */
export function selectDaily(items, { sentIds = new Set(), queuedSources = [], slots = QUEUE_MAX, perSource = PER_SOURCE_MAX, accounts = [], now = Date.now(), tz = 'America/Toronto', maxAgeH = MAX_AGE_H, evening = false } = {}) {
  // veille = jour civil précédent (midi UTC du jour − 24 h : robuste au changement d'heure).
  // Passe du soir : les créneaux sont ceux de demain, la « veille » est donc aujourd'hui.
  const prev = evening ? dayOf(now, tz) : dayOf(Date.parse(dayOf(now, tz) + 'T12:00:00Z') - 864e5, 'UTC');
  const fresh = items.filter(it => !sentIds.has(it.id) && now - it.date <= maxAgeH * 3600e3 && it.date <= now);
  let pool = fresh.filter(it => dayOf(it.date, tz) === prev);
  if (pool.length < slots) pool = fresh;
  const count = new Map(); for (const s of queuedSources) count.set(s, (count.get(s) || 0) + 1);
  const by = new Map();
  for (const it of pool) { it._q = quality(it, accounts); if (!by.has(it.source)) by.set(it.source, []); by.get(it.source).push(it); }
  const cmp = (a, b) => b._q - a._q || b.date - a.date;
  const queues = [...by.entries()].map(([s, q]) => ({ s, q: q.sort(cmp) }))
    .sort((a, b) => (count.get(a.s) || 0) - (count.get(b.s) || 0) || cmp(a.q[0], b.q[0]));
  const sel = [];
  for (let r = 0; sel.length < slots && r < perSource; r++) {
    const round = queues.filter(({ s, q }) => q.length && (count.get(s) || 0) < perSource).map(x => x.q[0]).sort(cmp);
    for (const it of round) {
      if (sel.length >= slots) break;
      const qq = by.get(it.source); qq.shift();
      sel.push(it); count.set(it.source, (count.get(it.source) || 0) + 1);
    }
  }
  return sel;
}

/** Retire les créneaux déjà pris (dueAt en file, à ±5 min). */
export function freeSlots(dues, takenIso = []) {
  const taken = takenIso.filter(Boolean).map(Date.parse);
  return dues.filter(d => !taken.some(t => Math.abs(t - Date.parse(d)) < 5 * 60e3));
}

// Un post publié est-il déjà au format actuel ? Lien vers la fiche le-radar.ca (pas le lien source),
// pas d'ancien séparateur « • » ni de @ en tête, et dernière ligne = « 📸 crédit » si crédit,
// sinon le lien de la fiche (aucune ligne 📸).
export function formatOk(text, it, credit = '') {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 1 && /^(#[\p{L}\p{N}_]+\s*)+$/u.test(lines[lines.length - 1])) lines.pop(); // ligne de hashtags Bluesky
  if (!lines.length) return false;
  const site = siteLink(it);
  if (!lines.includes(site)) return false;
  if (it?.link && it.link !== site && lines.includes(it.link)) return false;
  if (lines[0].startsWith('@') || lines.some(l => l.includes(' • '))) return false;
  const pl = photoLine(credit), last = lines[lines.length - 1];
  return pl ? last === pl : last === site && !lines.some(l => l.startsWith('📸'));
}

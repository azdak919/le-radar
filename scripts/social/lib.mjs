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
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function stripUtm(u) {
  try { const x = new URL(u); for (const k of [...x.searchParams.keys()]) if (/^utm_/i.test(k)) x.searchParams.delete(k); return x.toString().replace(/\?$/, ''); } catch { return u; }
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
export const photoLine = (credit, source) => (credit || source) ? `📸 ${(credit || source).trim()}` : '';

export function excerpt(it) {
  let d = it.desc; if (!d) return '';
  for (const p of [it.title, it.bare]) if (p && d.startsWith(p)) d = d.slice(p.length).replace(/^[\s:–-]+/, '');
  if (it.author) d = d.replace(new RegExp('^(par|by)?\\s*' + esc(it.author) + '[\\s,:–-]*', 'i'), '');
  d = d.replace(/\s*(The post|Cet article|L’article|L'article) .* (appeared first on|est apparu en premier sur) .*$/i, '').replace(/\s*\[(…|\.\.\.)\]\s*$/, '…').trim();
  d = d.replace(/[^.!?…]*\b(cliquer?|cliquez) ici\b[^.!?…]*[.!?…]?/gi, '')
    .replace(/[^.!?…]*\b(click here|lire la suite|read more|continue reading|en savoir plus)\b[^.!?…]*[.!?…]?/gi, '').replace(/\s+/g, ' ').trim();
  if (!d || norm(d) === norm(it.bare) || norm(it.bare).startsWith(norm(d))) return '';
  return d;
}

/** Réseaux sociaux seulement : « Média • Auteur • Titre » ; @ seulement si cle_flux === nom exact. */
export function mentionHead(it, accounts = []) {
  const src = accounts.find(a => a.type === 'source' && a.cle_flux && a.cle_flux === it.source);
  const au = it.author && accounts.find(a => a.type === 'auteur' && a.cle_flux && a.cle_flux === it.author);
  const media = src ? src.handle : it.source;
  const author = it.author && it.author !== it.source ? (au ? au.handle : it.author) : '';
  const title = it.bare || it.title;
  return [media, author, title].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' • ');
}

/** Ancien en-tête « Média – Auteur : Titre » → « Média • Auteur • Titre ». */
export function bulletHead(line) {
  const m = line.match(/^(.*?)\s[–-]\s(.*?)\s?:\s(.+)$/);
  return m ? [m[1], m[2], m[3]].filter((x, i, a) => x && a.indexOf(x) === i).join(' • ') : line;
}

/** « Titre : extrait » (fr), « Title: excerpt » (en), simple espace après ? ! … */
export const isEnglish = title => /[^\s]: /.test(title || '') && !/\s: /.test(title || '');
export function joinHead(head, ex, en = isEnglish(head)) {
  if (!ex) return head;
  if (/[?!…]$/.test(head.trim())) return `${head.trim()} ${ex}`;
  return `${head.trim()}${en ? ':' : ' :'} ${ex}`;
}

export function buildText(it, accounts = [], limit = X_LIMIT, { credit = '', photo = true } = {}) {
  const pl = photo ? photoLine(credit, it.source) : '';
  const head = mentionHead(it, accounts), tail = `\n${it.link}${pl ? '\n' + pl : ''}`, en = isEnglish(it.title);
  const mk = e => `${joinHead(head, e, en)}${tail}`;
  let ex = excerpt(it);
  if (ex && xlen(mk(ex)) > limit) {
    // coupe au dernier mot entier qui tient avec « … » (jamais au milieu d'un mot)
    const words = ex.split(' '); let best = '';
    for (let k = 1; k <= words.length; k++) {
      const c = words.slice(0, k).join(' ').replace(/[\s,;:.–-]+$/, '') + '…';
      if (xlen(mk(c)) <= limit) best = c; else break;
    }
    ex = best.length >= 21 ? best : '';
  }
  let text = mk(ex), t = head;
  while (xlen(text) > limit) { t = t.slice(0, -2).trimEnd() + '…'; text = `${t}${tail}`; }
  return text;
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
  const queues = [...by.entries()].map(([s, q]) => ({ s, q: q.sort((a, b) => b.date - a.date) }))
    .sort((a, b) => (count.get(a.s) || 0) - (count.get(b.s) || 0) || b.q[0].date - a.q[0].date);
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
export function slotsToday(times, { tz = 'America/Toronto', now = Date.now() } = {}) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const day = f.format(now);
  const off = t => { const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(t).find(x => x.type === 'timeZoneName').value;
    const m = p.match(/([+-])(\d\d):?(\d\d)?/); return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0)) : 0; };
  return times.map(hm => { let t = Date.parse(`${day}T${hm}:00Z`); t -= off(t) * 60e3; t = Date.parse(`${day}T${hm}:00Z`) - off(t) * 60e3; return t; })
    .filter(t => t > now + 10 * 60e3).sort((a, b) => a - b).map(t => new Date(t).toISOString());
}

// ── Sélection nocturne (≈ 3 h, America/Toronto) ──────────────────────────────
export const DAILY_SLOTS = ['07:30', '09:00', '10:30', '12:00', '13:00', '15:00', '17:00', '18:30', '20:00', '21:30'];
export const MIN_EXCERPT = 80;
const dayOf = (t, tz = 'America/Toronto') => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);

/** Note de qualité : vraie photo du flux > extrait substantiel > @ confirmé. */
export function quality(it, accounts = []) {
  const photo = it.img && !it.imgDropped ? 4 : 0;
  const ex = excerpt(it).length >= MIN_EXCERPT ? 2 : 0;
  const at = /(^|\s)@\w/.test(mentionHead(it, accounts)) ? 1 : 0;
  return photo + ex + at;
}

/**
 * Choix nocturne : articles NON envoyés de la veille (jour civil Toronto) ; s'il y a moins
 * de `slots` candidats, élargit à 72 h. Variété d'abord (≤ perSource par source, file comprise,
 * round-robin), puis qualité (photo réelle, extrait, @ confirmé), puis récence.
 */
export function selectDaily(items, { sentIds = new Set(), queuedSources = [], slots = QUEUE_MAX, perSource = PER_SOURCE_MAX, accounts = [], now = Date.now(), tz = 'America/Toronto', maxAgeH = MAX_AGE_H } = {}) {
  // veille = jour civil précédent (midi UTC du jour − 24 h : robuste au changement d'heure)
  const prev = dayOf(Date.parse(dayOf(now, tz) + 'T12:00:00Z') - 864e5, 'UTC');
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

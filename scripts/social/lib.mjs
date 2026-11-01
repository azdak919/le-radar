// Logique pure des publications sociales du Radar (testée dans tests/social-buffer.mjs).
export const X_LIMIT = 275;      // marge sous 280
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

export const xlen = s => [...s.replace(/https?:\/\/\S+/g, 'x'.repeat(URL_LEN))].length;

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

/** accounts: [{handle,type,cle_flux}] — mention seulement si cle_flux === nom exact. */
export function mentionHead(it, accounts = []) {
  let head = it.title;
  const src = accounts.find(a => a.type === 'source' && a.cle_flux && a.cle_flux === it.source);
  if (src && head.startsWith(it.source + ' ')) head = src.handle + head.slice(it.source.length);
  const au = it.author && accounts.find(a => a.type === 'auteur' && a.cle_flux && a.cle_flux === it.author);
  if (au) head = head.replace(new RegExp('([–-]\\s)' + esc(it.author) + '(\\s?:)'), `$1${au.handle}$2`);
  return head;
}

export function buildText(it, accounts = [], limit = X_LIMIT) {
  const head = mentionHead(it, accounts), tail = `\n${it.link}`;
  const mk = e => e ? `${head}\n\n${e}${tail}` : `${head}${tail}`;
  let ex = excerpt(it);
  if (ex && xlen(mk(ex)) > limit) {
    const budget = limit - xlen(mk('')) - 3;
    let cut = [...ex].slice(0, Math.max(0, budget)).join(''); const sp = cut.lastIndexOf(' ');
    cut = (sp > 0 ? cut.slice(0, sp) : '').replace(/[\s,;:.–-]+$/, ''); ex = cut.length >= 20 ? cut + '…' : '';
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

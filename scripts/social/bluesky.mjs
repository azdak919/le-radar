// Logique pure Bluesky (testée dans tests/social-bluesky.mjs) : longueur en graphèmes,
// facettes (octets UTF-8), langue, articles dus. Les @ viennent de data/social/bluesky-accounts.json
// (jamais de la liste X).
import { buildText, LIMITS, detectLang, siteLink } from './lib.mjs';
import { bskyTags } from './hashtags.mjs';
export { siteLink };
export { detectLang };

const seg = new Intl.Segmenter('fr', { granularity: 'grapheme' });
export const graphemes = s => [...seg.segment(s || '')].length;
export const BSKY_LIMIT = LIMITS.bluesky;
export const GRACE_H = 2;
const enc = new TextEncoder();
const bytes = s => enc.encode(s).length;

/** Texte Bluesky : format commun (lib.mjs), 300 graphèmes, lien vers la fiche le-radar.ca. */
export function buildBskyText(it, accounts = [], { credit = '', photo = true, tags = true, ai = true } = {}) {
  const line = tags ? bskyTags(it).join(' ') : '';
  const text = buildText(it, accounts, BSKY_LIMIT - (line ? graphemes(line) + 1 : 0), { credit, photo, len: graphemes, link: true, ai });
  return text && line ? `${text}\n${line}` : text;
}

/** Facettes : liens (http…) et @ confirmés Bluesky (dids : Map handle→did). Offsets en octets UTF-8. */
export function facets(text, dids = new Map()) {
  const out = [];
  for (const m of text.matchAll(/https?:\/\/[^\s]+/g)) {
    const s = bytes(text.slice(0, m.index));
    out.push({ index: { byteStart: s, byteEnd: s + bytes(m[0]) }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }] });
  }
  for (const m of text.matchAll(/(^|[\s(])@([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/gi)) {
    const did = dids.get(m[2].toLowerCase()); if (!did) continue;
    const i = m.index + m[1].length, s = bytes(text.slice(0, i));
    out.push({ index: { byteStart: s, byteEnd: s + bytes('@' + m[2]) }, features: [{ $type: 'app.bsky.richtext.facet#mention', did }] });
  }
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_]{1,64})/gu)) {
    if (/^\d+$/.test(m[2])) continue;
    const s = bytes(text.slice(0, m.index + m[1].length));
    out.push({ index: { byteStart: s, byteEnd: s + bytes('#' + m[2]) }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[2] }] });
  }
  return out.sort((a, b) => a.index.byteStart - b.index.byteStart);
}

/** Choix X (data/buffer-sent.json) dont le créneau est passé depuis ≤ graceH, pas encore sur Bluesky. */
export function dueItems(xSent = {}, bskySent = {}, { now = Date.now(), graceH = GRACE_H } = {}) {
  const due = [], late = [];
  for (const [id, s] of Object.entries(xSent)) {
    if (!s?.dueAt || s.shareNow || bskySent[id]) continue;
    const t = Date.parse(s.dueAt); if (!(t <= now)) continue;
    (now - t <= graceH * 3600e3 ? due : late).push({ id, dueAt: s.dueAt, source: s.source });
  }
  const by = (a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt);
  return { due: due.sort(by), late: late.sort(by) };
}

/** Enregistrement app.bsky.feed.post. */
export function postRecord({ text, lang, dids, card, now = new Date() }) {
  const rec = { $type: 'app.bsky.feed.post', text, createdAt: now.toISOString(), langs: [lang] };
  const f = facets(text, dids); if (f.length) rec.facets = f;
  if (card) rec.embed = { $type: 'app.bsky.embed.external', external: { uri: card.uri, title: card.title.slice(0, 300), description: (card.description || '').slice(0, 1000), ...(card.thumb ? { thumb: card.thumb } : {}) } };
  return rec;
}

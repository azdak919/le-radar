// Logique pure Tumblr (testée dans tests/social-tumblr.mjs) : texte « Média • Auteur • Titre : extrait »,
// lien, « 📸 crédit » ; contenu NPF (texte, image réelle, bloc lien), étiquettes pertinentes.
// Aucun @ : aucun blogue Tumblr de média étudiant confirmé (data/social/tumblr-accounts.json vide).
import { buildText, detectLang, siteLink } from './lib.mjs';
import { tumblrTags } from './hashtags.mjs';
export { detectLang };
export const TUMBLR_LIMIT = 1000; // texte court et lisible (NPF n'impose pas de limite stricte)
export const BLOG = 'le-radar-ca.tumblr.com';

export function buildTumblrText(it, accounts = [], { credit = '', photo = true, ai = true } = {}) {
  return buildText(it, accounts, TUMBLR_LIMIT, { credit, photo, len: s => [...s].length, link: true, ai });
}

const tag = s => (s || '').replace(/[#,]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
/** Étiquettes : média, presse étudiante, Québec (+ student press si anglais). Jamais d'étiquette trompeuse. */
export function tagsFor(it, lang = detectLang(it)) {
  return tumblrTags(it, lang);
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
/** Texte brut propre pour NPF : aucune balise HTML, entités décodées, espaces normalisés. */
export const plain = s => String(s || '')
  .replace(/<\/?(p|br|div|li|ul|ol|h[1-6]|blockquote)\b[^>]*>/gi, ' ')
  .replace(/<\/?[a-z][^>]*>/gi, '')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m)
  .replace(/[ \t]+/g, ' ').trim();

/** État de création : « queue » (file native de Tumblr, publication étalée) ; « published » seulement sur demande. */
export const POST_STATE = 'queue';

/** Corps NPF : intertitre (titre), image réelle (si présente), extrait + source en texte brut, bloc lien en dernier. */
export function npfBody(it, text, { image = null, lang = detectLang(it), state = POST_STATE } = {}) {
  const url = siteLink(it), lines = text.split('\n').map(plain).filter(Boolean), content = [];
  for (const [i, l] of lines.entries()) {
    const b = { type: 'text', text: l };
    if (i === 0) b.subtype = 'heading2';
    if (/^https?:\/\/\S+$/.test(l)) b.formatting = [{ start: 0, end: [...l].length, type: 'link', url: l }];
    content.push(b);
  }
  if (image) content.splice(1, 0, { type: 'image', media: [{ url: image.url, ...(image.width ? { width: image.width, height: image.height } : {}) }], alt_text: plain(image.alt || it.bare || it.title).slice(0, 250) });
  const desc = plain(it.desc);
  content.push({ type: 'link', url, title: plain(it.bare || it.title).slice(0, 250), ...(desc ? { description: desc.slice(0, 300) } : {}) });
  return { content, tags: tagsFor(it, lang).join(','), state, source_url: url };
}

/** Liens d'articles présents dans des posts du blogue, publiés ou en file (idempotence). */
export function linksInPosts(posts = []) {
  const out = new Set();
  for (const p of posts) if (p.source_url) out.add(p.source_url);
  for (const p of posts) for (const b of p.content || []) {
    if (b.type === 'link' && b.url) out.add(b.url);
    for (const f of b.formatting || []) if (f.type === 'link' && f.url) out.add(f.url);
  }
  return out;
}

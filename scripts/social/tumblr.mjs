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

/** Corps NPF : texte (lien cliquable via formatting), image réelle (si présente), bloc lien. */
export function npfBody(it, text, { image = null, lang = detectLang(it) } = {}) {
  const url = siteLink(it), lines = text.split('\n').filter(l => l.trim()), content = [];
  for (const [i, l] of lines.entries()) {
    const b = { type: 'text', text: l };
    if (i === 0) b.subtype = 'heading2';
    if (/^https?:\/\/\S+$/.test(l)) b.formatting = [{ start: 0, end: [...l].length, type: 'link', url: l }];
    content.push(b);
  }
  if (image) content.splice(1, 0, { type: 'image', media: [{ url: image.url, ...(image.width ? { width: image.width, height: image.height } : {}) }], alt_text: (it.bare || it.title || '').slice(0, 250) });
  content.push({ type: 'link', url, title: (it.bare || it.title || '').slice(0, 250), ...(it.desc ? { description: it.desc.slice(0, 300) } : {}) });
  return { content, tags: tagsFor(it, lang).join(','), state: 'published', source_url: url };
}

/** Liens d'articles présents dans les derniers posts NPF du blogue (idempotence). */
export function linksInPosts(posts = []) {
  const out = new Set();
  for (const p of posts) for (const b of p.content || []) {
    if (b.type === 'link' && b.url) out.add(b.url);
    for (const f of b.formatting || []) if (f.type === 'link' && f.url) out.add(f.url);
  }
  return out;
}

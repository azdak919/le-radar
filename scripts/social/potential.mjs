// Potentiel gratuit encore éteint (data/social/policy.json → potential.* === false).
// Ce module ne contacte aucun réseau et n'écrit aucune publication.
// Limites : aide Buffer, citée dans docs/social-potential.md. Textes : titres, extraits,
// médias, auteurs et crédits fournis. Rien n'est ajouté comme fait.
import { excerpt, sentences, xlen, siteLink, buildXText } from './lib.mjs';
import { POLICY } from './policy.mjs';

/** Texte alternatif, en caractères Unicode. Aide Buffer « Adding alt text ». */
export const ALT_MAX = { linkedin: 300, x: 1000, facebook: 1000, instagram: 1000, mastodon: 1000, bluesky: 2000 };

/**
 * Images par publication. Aide Buffer « Attaching images, videos, and other media ».
 * Instagram et X ne sont pas envoyés en plusieurs images ici : un autre chantier les traite.
 */
export const IMAGE_MAX = { facebook: 10, linkedin: 20, instagram: 20, x: 4, mastodon: 4, bluesky: 10 };

/** Au plus 25 posts dans un fil X, racine comprise. Aide Buffer « Using X/Twitter ». */
export const X_THREAD_MAX = 25;

const chars = s => [...String(s || '')];

/** Coupe à `max` caractères Unicode, de préférence sur un espace. */
export function clipChars(text, max) {
  const all = chars(String(text || '').replace(/\s+/g, ' ').trim());
  if (all.length <= max) return all.join('');
  let t = all.slice(0, Math.max(0, max - 1)).join('').replace(/\s+\S*$/, '').trim();
  if (chars(t).length < 12) t = all.slice(0, Math.max(0, max - 1)).join('').trim();
  return t.replace(/[\s.]+$/, '') + '…';
}

export function capAlt(text, network) {
  return clipChars(text, ALT_MAX[network] || 1000);
}

/** « Titre ». Média, auteur. Photo : crédit. Seulement les champs présents. */
export function articleAlt(it, network, { credit = '' } = {}) {
  const title = String(it?.bare || it?.title || '').replace(/\s+/g, ' ').trim();
  const source = String(it?.source || '').trim();
  const author = String(it?.author || '').trim();
  const who = [source, author && author !== source ? author : ''].filter(Boolean).join(', ');
  const c = String(credit || '').replace(/^photo\s*:\s*/i, '').trim();
  const parts = [];
  if (title) parts.push(`« ${title} »`);
  if (who) parts.push(who);
  if (c) parts.push(`Photo : ${c}`);
  return capAlt(parts.join('. ').replace(/\.\s*$/, '') + (parts.length ? '.' : ''), network);
}

export function potentialFlags(policy = POLICY) {
  const p = policy?.potential || {};
  const images = (block, network) => (block?.enabled === true ? Math.min(IMAGE_MAX[network], Math.max(0, block.max | 0)) : 0);
  return {
    xThread: p.xThread === true,
    utm: p.utm === true,
    facebookImages: images(p.facebookImages, 'facebook'),
    linkedinImages: images(p.linkedinImages, 'linkedin'),
  };
}

/** Ajoute utm_source / utm_medium / utm_campaign seulement si `on` est vrai. Ne remplace pas un utm déjà présent. */
export function withUtm(url, network, on = false) {
  if (!on || !url) return url;
  try {
    const u = new URL(url);
    if ([...u.searchParams.keys()].some(k => /^utm_/i.test(k))) return url;
    u.searchParams.set('utm_source', String(network || 'social'));
    u.searchParams.set('utm_medium', 'social');
    u.searchParams.set('utm_campaign', 'le-radar');
    return u.toString();
  } catch { return url; }
}

/**
 * Fil X de 2 posts, ou null si l'extrait tient déjà dans le post unique.
 * Le premier post est exactement buildXText. Le second reprend les phrases
 * réelles de l'extrait qui n'y sont pas, sans nouveau lien ni mention.
 */
export function xThread(it, accounts = [], opts = {}) {
  const first = buildXText(it, accounts, opts);
  if (!first) return null;
  const ex = excerpt(it, { ai: !!opts.ai });
  if (!ex || first.includes(ex)) return null;
  let body = '';
  for (const s of sentences(ex)) {
    if (!s || first.includes(s)) continue;
    // « Nov. 16 » est découpé par le point : on ne reprend pas un morceau qui commence par un chiffre.
    if (!/^[«"“A-ZÀ-ÝŒ]/.test(s)) continue;
    if (/\b(Nov|Dec|Déc|Jan|Feb|Fév|Mar|Apr|Avr|Jun|Jul|Aug|Aoû|Sep|Sept|Oct|Mr|Mme|Mlle|Dr|St|Jr|Sr|etc|al)\.$/i.test(s)) continue;
    const head = s.slice(0, 48);
    if (head.length >= 24 && first.includes(head)) continue;
    const next = body ? `${body} ${s}` : s;
    const text = `Extrait · ${it.source || 'média étudiant'}\n\n${next}`;
    if (xlen(text) <= 280) body = next;
    else break;
  }
  if (!body || first.includes(body)) return null;
  const second = `Extrait · ${it.source || 'média étudiant'}\n\n${body}`;
  if (xlen(second) > 280 || /tison/i.test(second)) return null;
  return [{ text: first }, { text: second }];
}

/**
 * Une publication, plusieurs images réelles (Facebook ≤ 10, LinkedIn ≤ 20).
 * Refusée pour X et Instagram. `max` est notre plafond de montée, jamais au-dessus du réseau.
 */
export function galleryFrom(items, { network, limit = 1500, max = 4 } = {}) {
  if (network === 'x' || network === 'instagram' || !IMAGE_MAX[network]) return null;
  const cap = Math.min(IMAGE_MAX[network], max | 0);
  if (cap < 2) return null;
  const rows = [];
  for (const it of items || []) {
    const url = String(it?.image || it?.url || '').trim();
    const title = String(it?.bare || it?.title || '').replace(/\s+/g, ' ').trim();
    if (!url || !title) continue;
    const source = String(it.source || '').trim();
    const author = String(it.author || '').trim();
    rows.push({
      url,
      alt: articleAlt(it, network, { credit: it.credit || '' }),
      title,
      who: [source, author && author !== source ? author : ''].filter(Boolean).join(' · '),
      link: it.pageUrl || siteLink(it),
    });
    if (rows.length >= cap) break;
  }
  if (rows.length < 2) return null;
  const len = s => chars(s).length;
  const compose = list => list.map((r, i) => [`${i + 1}. ${r.title}`, r.who ? `📰 ${r.who}` : '', r.link].filter(Boolean).join('\n')).join('\n\n');
  let use = rows.slice();
  let text = compose(use);
  while (use.length >= 2 && len(text) > limit) {
    use = use.slice(0, -1);
    text = compose(use);
  }
  if (use.length < 2 || len(text) > limit || /tison/i.test(text) || /(^|[\s(])@\w/.test(text)) return null;
  return { text, assets: use.map(r => ({ url: r.url, alt: r.alt })), count: use.length };
}

// Image sociale : texte alternatif et contrôle visuel (Cloudflare Workers AI, niveau gratuit).
// Appelé par les scripts GitHub Actions. Aucune légende n'est rédigée ici : les textes restent
// les titres, médias et crédits réels. Sans CLOUDFLARE_AI_TOKEN ou CLOUDFLARE_ACCOUNT_ID, ou si
// l'appel échoue, dépasse le quota ou rend une sortie invérifiable : repli déterministe, et la
// publication continue. Un refus n'a lieu que pour un cas manifeste (logo, image cassée, pub).
import { aiEnabled, parseAi, hookLang } from './ai-hook.mjs';

export const VISION = '@cf/meta/llama-3.2-11b-vision-instruct';
export const MAX_IMAGE_CALLS = 4;
export const MAX_AI_BYTES = 900_000;
const KINDS = new Set(['article', 'affiche', 'logo', 'casse', 'pub', 'incertain']);
const REJECT = new Set(['logo', 'casse', 'pub']);
const words = s => new Set((String(s || '').normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []));
let calls = 0;
const cache = new Map();

/** Alt déterministe : titre, média, crédit. Rien d'inventé. */
export function articleAlt(it, credit = '') {
  const title = String(it?.bare || it?.title || '').replace(/\s+/g, ' ').trim();
  const source = String(it?.source || '').replace(/\s+/g, ' ').trim();
  const c = String(credit || '').replace(/\s+/g, ' ').trim();
  const bits = [title, source, c].filter(Boolean);
  return (bits.join(', ') || 'Photo d’un article du Radar').slice(0, 180);
}

/** Phrase française courte et vérifiable sur les faits connus. '' si elle invente un chiffre, un nom ou une langue. */
export function factualAlt(alt, facts) {
  const h = String(alt || '').replace(/\s+/g, ' ').trim();
  if ([...h].length < 12 || [...h].length > 180) return '';
  if (/[«»"#@]|https?:/i.test(h)) return '';
  const en = /\b(the|this|that|with|from|and|for|open|later|tonight|students|library)\b/i.test(h);
  const fr = /\b(le|la|les|un|une|des|du|de|et|sur|dans|pour|avec|plus|reste|affiche|photo)\b/i.test(h);
  if (hookLang(h) === 'en' || (en && !fr)) return '';
  const src = words(facts);
  for (const n of h.match(/\d+/g) || []) if (!src.has(n)) return '';
  for (const w of h.match(/(?<=\s)\p{Lu}[\p{L}'’-]+/gu) || []) {
    const k = w.toLowerCase();
    if (!src.has(k) && !src.has(k.replace(/['’].*$/, ''))) return '';
  }
  return h;
}

export function parseVerdict(out) {
  const j = parseAi(out);
  if (!j || typeof j !== 'object') return null;
  const kind = String(j.kind || '').toLowerCase();
  if (!KINDS.has(kind)) return null;
  return { kind, sur: String(j.sur || '').toLowerCase() === 'haute' ? 'haute' : 'basse', alt: typeof j.alt === 'string' ? j.alt : '' };
}

/** Refus seulement si le modèle est sûr et que le cas est un logo, une image cassée ou une pub. */
export function decideImage({ verdict, fallbackAlt, facts, allowReject = true } = {}) {
  const fallback = String(fallbackAlt || '').slice(0, 1000);
  const alt = factualAlt(verdict?.alt, facts) || fallback;
  const reject = !!(allowReject && verdict && verdict.sur === 'haute' && REJECT.has(verdict.kind));
  return { alt: reject ? fallback : alt, reject, reason: reject ? verdict.kind : '', source: !reject && factualAlt(verdict?.alt, facts) ? 'ia' : 'deterministe' };
}

/** Image manifestement inutilisable, sans IA : vide ou minuscule. Une affiche ou une photo d'article passe. */
export function brokenImage(p) {
  if (!p || !(p.bytes > 32)) return 'illisible';
  if (p.w && p.h && (p.w < 120 || p.h < 120)) return 'trop petite';
  return '';
}

/**
 * { alt, reject, reason, source }. allowReject false : affiche générée par le Radar, jamais écartée.
 * fetchImpl et probeImpl injectables. Ne lève pas.
 */
export async function reviewSocialImage({ url, buf, contentType, width, height, facts = '', fallbackAlt = '', allowReject = true, env = process.env, fetchImpl = fetch, probeImpl } = {}) {
  const fallback = String(fallbackAlt || '').slice(0, 1000);
  const keep = (reason, extra = {}) => ({ alt: fallback, reject: false, reason, source: 'deterministe', ...extra });
  let p = null;
  if (buf) {
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    p = { buf: b, bytes: b.length, w: width || 0, h: height || 0, ct: contentType || 'image/jpeg' };
  } else if (url) {
    const probe = probeImpl || (await import('./image-resolve.mjs')).probe;
    try { p = await probe(url); } catch { p = null; }
  }
  const broken = brokenImage(p);
  if (broken) return allowReject ? { alt: fallback, reject: true, reason: broken, source: 'deterministe' } : keep(broken);
  const key = `${aiEnabled(env) ? 'ai' : 'off'}:${allowReject ? 1 : 0}:${url || `buf:${p.bytes}:${p.buf?.[0] || 0}`}`;
  if (cache.has(key)) return cache.get(key);
  if (!aiEnabled(env)) return cache.set(key, keep('IA désactivée')) && cache.get(key);
  if (!p?.buf || p.bytes > MAX_AI_BYTES) return cache.set(key, keep('image trop lourde pour l’IA')) && cache.get(key);
  if (calls >= MAX_IMAGE_CALLS) return keep('plafond d’appels');
  calls++;
  const mime = /^image\/[\w.+-]+/.test(p.ct || '') ? String(p.ct).split(';')[0] : 'image/jpeg';
  const prompt = 'Tu regardes une image pour un média étudiant. Réponds uniquement en JSON {"kind":"article|affiche|logo|casse|pub|incertain","sur":"haute|basse","alt":"…"}. ' +
    'article = photo ou illustration d’article, y compris une affiche de une ou un résultat sportif. affiche = composition de titres. ' +
    'logo = logo, icône ou favicon seul. casse = image vide ou illisible. pub = publicité commerciale. ' +
    'Une affiche ou une photo d’article n’est jamais une pub. sur=haute seulement si le cas est évident. ' +
    'alt = une phrase en français, factuelle, 80 caractères au plus, sans nom, chiffre, slogan ni lien absents de l’image. Sinon alt vide.';
  try {
    const r = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${VISION}`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.CLOUDFLARE_AI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], image: `data:${mime};base64,${p.buf.toString('base64')}`, max_tokens: 160, temperature: 0 }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      const out = keep(`HTTP ${r.status ?? '?'}${r.status === 429 ? ' (quota)' : ''}`);
      cache.set(key, out); return out;
    }
    const body = await r.json();
    const verdict = parseVerdict(body?.result?.response ?? body?.result);
    const out = decideImage({ verdict, fallbackAlt: fallback, facts, allowReject });
    if (!verdict) out.reason = 'réponse illisible';
    cache.set(key, out); return out;
  } catch (e) {
    const out = keep(`appel en échec (${e?.name || 'erreur'})`);
    cache.set(key, out); return out;
  }
}

/** Contrôle d'une photo d'article déjà résolue. Journal sans secret. Ne lève pas. */
export async function gateArticleImage(it, url, { credit = '', allowReject = true, ...opts } = {}) {
  const fallbackAlt = articleAlt(it, credit);
  const facts = [it?.bare, it?.title, it?.source, it?.desc, credit, fallbackAlt].filter(Boolean).join(' ');
  const r = await reviewSocialImage({ url, facts, fallbackAlt, allowReject, ...opts });
  if (r.reject) console.log(`Image écartée (${r.reason}, ${r.source}) : ${url}`);
  else if (r.source === 'ia') console.log(`IA : texte alternatif retenu [${VISION}]`);
  else if (r.reason) console.log(`Texte alternatif déterministe — ${r.reason}`);
  return r;
}

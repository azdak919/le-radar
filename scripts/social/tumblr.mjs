// Module Tumblr UNIQUE du Radar (le-radar-ca.tumblr.com) : tout appel à l'API Tumblr passe ici.
// Gabarit pour les autres réseaux : 1. réglages et interrupteur, 2. client API, 3. format NPF.
//
// 1. TUMBLR_ENABLED=false (variable de dépôt, « false » par défaut dans les workflows) : pause
//    totale, plus aucun appel API (publication, file, likes, bilans, suppressions).
// 2. Client OAuth 1.0a : 3–5 s entre deux appels (gapMs), TumblrError avec le code HTTP ;
//    429 / 401 / 403 = arrêter les appels du passage (isHaltStatus). Posts créés en file native
//    (state « queue ») par défaut ; « created » seulement sur 201 Created.
// 3. NPF en texte brut (aucune balise HTML), étiquettes pertinentes, liens pour l'idempotence.
// Les secrets ne sont jamais journalisés. Aucun @ : aucun blogue de média étudiant confirmé.
import crypto from 'node:crypto';
import { buildText, detectLang, siteLink } from './lib.mjs';
import { tumblrTags } from './hashtags.mjs';
export { detectLang };

// ── 1. Réglages et interrupteur ────────────────────────────────────────────────────────────────
export const BLOG = 'le-radar-ca.tumblr.com';
export const API = 'https://api.tumblr.com/v2';
export const TUMBLR_LIMIT = 1000; // texte court et lisible (NPF n'impose pas de limite stricte)
/** État de création : « queue » (file native de Tumblr, publication étalée) ; « published » seulement sur demande. */
export const POST_STATE = 'queue';
export const PAUSED_MSG = 'Tumblr en pause (TUMBLR_ENABLED=false) : aucun appel à l\'API Tumblr.';
/** Faux seulement si TUMBLR_ENABLED vaut false / 0 / no / off (absent = actif, pour les essais locaux). */
export const tumblrEnabled = (env = process.env) => !/^(false|0|no|off)$/i.test(String(env.TUMBLR_ENABLED ?? '').trim());
export const tumblrKeys = (env = process.env) => ({ ck: env.TUMBLR_CONSUMER_KEY || '', cs: env.TUMBLR_CONSUMER_SECRET || '', tk: env.TUMBLR_TOKEN || '', ts: env.TUMBLR_TOKEN_SECRET || '' });
export const hasTumblrKeys = (env = process.env) => Object.values(tumblrKeys(env)).every(Boolean);
export const tumblrBlog = (env = process.env) => env.TUMBLR_BLOG || BLOG;

// ── 2. Client API ──────────────────────────────────────────────────────────────────────────────
const pct = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/** En-tête Authorization OAuth 1.0a (corps JSON : non signé, comme le prévoit la RFC 5849). */
export function oauthHeader(method, url, { ck, cs, tk, ts }, { nonce = crypto.randomBytes(16).toString('hex'), time = Math.floor(Date.now() / 1000) } = {}) {
  const u = new URL(url), o = { oauth_consumer_key: ck, oauth_nonce: nonce, oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: String(time), oauth_token: tk, oauth_version: '1.0' };
  const params = [...u.searchParams.entries(), ...Object.entries(o)].map(([k, v]) => [pct(k), pct(v)]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1);
  const base = [method.toUpperCase(), pct(u.origin + u.pathname), pct(params.map(([k, v]) => `${k}=${v}`).join('&'))].join('&');
  o.oauth_signature = crypto.createHmac('sha1', `${pct(cs)}&${pct(ts)}`).update(base).digest('base64');
  return 'OAuth ' + Object.entries(o).map(([k, v]) => `${pct(k)}="${pct(v)}"`).join(', ');
}

/** Erreur API Tumblr avec son code HTTP (0 + paused : interrupteur coupé, aucun appel fait). */
export class TumblrError extends Error {
  constructor(message, status, { paused = false } = {}) { super(message); this.name = 'TumblrError'; this.status = status; this.paused = paused; }
}
/** 429 (trop de requêtes) ou 401/403 (jeton refusé, compte restreint) : plus aucun appel ce passage. */
export const isHaltStatus = s => s === 429 || s === 401 || s === 403;

/** gapMs : délai minimal (ms, ou fonction → ms) entre deux appels consécutifs de ce client. */
export function createTumblr({ ck, cs, tk, ts, blog = BLOG, fetchImpl = fetch, gapMs = 0, sleep = ms => new Promise(r => setTimeout(r, ms)), enabled = tumblrEnabled() }) {
  let last = 0;
  async function raw(method, path, { query, body, auth = true } = {}) {
    if (!enabled) throw new TumblrError(PAUSED_MSG, 0, { paused: true });
    const gap = typeof gapMs === 'function' ? gapMs() : gapMs;
    if (last && gap > 0) { const wait = last + gap - Date.now(); if (wait > 0) await sleep(wait); }
    const url = `${API}${path}${query ? '?' + new URLSearchParams(query) : ''}`;
    const headers = { 'user-agent': 'LE-RADAR-Tumblr/1.0 (+https://le-radar.ca/)', ...(body ? { 'content-type': 'application/json' } : {}), ...(auth ? { authorization: oauthHeader(method, url, { ck, cs, tk, ts }) } : {}) };
    try {
      const r = await fetchImpl(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new TumblrError(`Tumblr ${method} ${path} ${r.status} ${JSON.stringify(j.errors || j.meta || {}).slice(0, 300)}`, r.status);
      return { status: r.status, response: j.response };
    } finally { last = Date.now(); }
  }
  /** Appel brut (signé par défaut ; auth:false pour les lectures publiques avec api_key). */
  const request = async (method, path, opts) => (await raw(method, path, opts)).response;
  return {
    blog, enabled, request,
    userInfo: () => request('GET', '/user/info'),
    /** Liens déjà publiés ET déjà en file d'attente (sinon un post en file serait renvoyé). */
    async recentLinks(limit = 50) {
      const r = await request('GET', `/blog/${blog}/posts`, { query: { npf: 'true', limit: String(limit), api_key: ck }, auth: false });
      const out = linksInPosts(r?.posts || []);
      try {
        const q = await request('GET', `/blog/${blog}/posts/queue`, { query: { npf: 'true', limit: String(Math.min(limit, 50)) } });
        for (const u of linksInPosts(q?.posts || [])) out.add(u);
      } catch (e) {
        if (isHaltStatus(e.status)) throw e;
        console.log(`::warning::File Tumblr illisible (${e.message}) : seul l'état local protège des doublons.`);
      }
      return out;
    },
    /** Crée le post (en file par défaut). `created` n'est vrai que sur 201 Created : seul cas à noter dans l'état. */
    async post(body) {
      const { status, response: r } = await raw('POST', `/blog/${blog}/posts`, { body: { state: POST_STATE, ...body } });
      const id = r?.id_string || String(r?.id);
      return { id, url: `https://${blog}/post/${id}`, status, created: status === 201 };
    },
    getPost: id => request('GET', `/blog/${blog}/posts/${id}`, { query: { api_key: ck }, auth: false }),
    deletePost: id => request('POST', `/blog/${blog}/post/delete`, { body: { id } }),
  };
}
/** Client depuis l'environnement (clés, blogue, interrupteur). */
export const tumblrFromEnv = (env = process.env, opts = {}) => createTumblr({ ...tumblrKeys(env), blog: tumblrBlog(env), enabled: tumblrEnabled(env), ...opts });

// ── 3. Format NPF ──────────────────────────────────────────────────────────────────────────────
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
/** Texte brut propre pour NPF : aucune balise HTML, entités décodées, espaces normalisés. */
export const plain = s => String(s || '')
  .replace(/<\/?(p|br|div|li|ul|ol|h[1-6]|blockquote)\b[^>]*>/gi, ' ')
  .replace(/<\/?[a-z][^>]*>/gi, '')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m)
  .replace(/[ \t]+/g, ' ').trim();

export function buildTumblrText(it, accounts = [], { credit = '', photo = true, ai = true } = {}) {
  return buildText(it, accounts, TUMBLR_LIMIT, { credit, photo, len: s => [...s].length, link: true, ai });
}

const tag = s => (s || '').replace(/[#,]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
/** Étiquettes : média, presse étudiante, Québec (+ student press si anglais). Jamais d'étiquette trompeuse. */
export function tagsFor(it, lang = detectLang(it)) {
  return tumblrTags(it, lang);
}

/**
 * Contenu NPF générique depuis un texte multiligne : 1re ligne en intertitre, chaque URL rendue
 * cliquable, image (facultative) en 2e bloc, bloc lien (facultatif) en dernier. Texte brut seulement.
 */
export function npfFromText(text, { image = null, link = null, altMax = 250 } = {}) {
  const content = String(text || '').split('\n').map(plain).filter(Boolean).map((l, i) => {
    const b = { type: 'text', text: l, ...(i === 0 ? { subtype: 'heading2' } : {}) }, f = [];
    for (const m of l.matchAll(/https?:\/\/\S+/g)) { const s = [...l.slice(0, m.index)].length; f.push({ start: s, end: s + [...m[0]].length, type: 'link', url: m[0] }); }
    if (f.length) b.formatting = f;
    return b;
  });
  if (image?.url) content.splice(1, 0, { type: 'image', media: [{ url: image.url, ...(image.type ? { type: image.type } : {}), ...(image.width ? { width: image.width, height: image.height } : {}) }], alt_text: plain(image.alt).slice(0, altMax) });
  if (link?.url) {
    const title = plain(link.title).slice(0, 250), description = plain(link.description).slice(0, 300);
    content.push({ type: 'link', url: link.url, ...(title ? { title } : {}), ...(description ? { description } : {}) });
  }
  return content;
}

/** Corps NPF d'un article : intertitre (titre), image réelle (si présente), extrait + source, bloc lien en dernier. */
export function npfBody(it, text, { image = null, lang = detectLang(it), state = POST_STATE } = {}) {
  const url = siteLink(it);
  const content = npfFromText(text, { image: image && { ...image, alt: image.alt || it.bare || it.title }, link: { url, title: it.bare || it.title, description: it.desc } });
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

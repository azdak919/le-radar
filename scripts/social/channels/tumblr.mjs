// Canal Tumblr (API v2, OAuth 1.0a HMAC-SHA1, gratuit). Les secrets ne sont jamais journalisés.
import crypto from 'node:crypto';
export const API = 'https://api.tumblr.com/v2';
const pct = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/** En-tête Authorization OAuth 1.0a (corps JSON : non signé, comme le prévoit la RFC 5849). */
export function oauthHeader(method, url, { ck, cs, tk, ts }, { nonce = crypto.randomBytes(16).toString('hex'), time = Math.floor(Date.now() / 1000) } = {}) {
  const u = new URL(url), o = { oauth_consumer_key: ck, oauth_nonce: nonce, oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: String(time), oauth_token: tk, oauth_version: '1.0' };
  const params = [...u.searchParams.entries(), ...Object.entries(o)].map(([k, v]) => [pct(k), pct(v)]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1);
  const base = [method.toUpperCase(), pct(u.origin + u.pathname), pct(params.map(([k, v]) => `${k}=${v}`).join('&'))].join('&');
  o.oauth_signature = crypto.createHmac('sha1', `${pct(cs)}&${pct(ts)}`).update(base).digest('base64');
  return 'OAuth ' + Object.entries(o).map(([k, v]) => `${pct(k)}="${pct(v)}"`).join(', ');
}

/** Erreur API Tumblr avec son code HTTP (429 / 401 / 403 : arrêter les appels du passage). */
export class TumblrError extends Error {
  constructor(message, status) { super(message); this.name = 'TumblrError'; this.status = status; }
}
/** 429 (trop de requêtes) ou 401/403 (jeton refusé, compte restreint) : plus aucun appel ce passage. */
export const isHaltStatus = s => s === 429 || s === 401 || s === 403;

/** gapMs : délai minimal (ms, ou fonction → ms) entre deux appels consécutifs de ce client. */
export function createTumblr({ ck, cs, tk, ts, blog, fetchImpl = fetch, gapMs = 0, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  let last = 0;
  async function raw(method, path, { query, body, auth = true } = {}) {
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
  const call = async (...a) => (await raw(...a)).response;
  return {
    userInfo: () => call('GET', '/user/info'),
    /** Liens déjà publiés ET déjà en file d'attente (sinon un post en file serait renvoyé). */
    async recentLinks(limit = 50) {
      const { linksInPosts } = await import('../tumblr.mjs');
      const r = await call('GET', `/blog/${blog}/posts`, { query: { npf: 'true', limit: String(limit), api_key: ck }, auth: false });
      const out = linksInPosts(r?.posts || []);
      try {
        const q = await call('GET', `/blog/${blog}/posts/queue`, { query: { npf: 'true', limit: String(Math.min(limit, 50)) } });
        for (const u of linksInPosts(q?.posts || [])) out.add(u);
      } catch (e) {
        if (isHaltStatus(e.status)) throw e;
        console.log(`::warning::File Tumblr illisible (${e.message}) : seul l'état local protège des doublons.`);
      }
      return out;
    },
    /** Crée le post. `created` n'est vrai que sur 201 Created : seul cas où l'état local doit le noter. */
    async post(body) {
      const { status, response: r } = await raw('POST', `/blog/${blog}/posts`, { body });
      const id = r?.id_string || String(r?.id);
      return { id, url: `https://${blog}/post/${id}`, status, created: status === 201 };
    },
    getPost: id => call('GET', `/blog/${blog}/posts/${id}`, { query: { api_key: ck }, auth: false }),
  };
}

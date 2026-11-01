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

export function createTumblr({ ck, cs, tk, ts, blog, fetchImpl = fetch }) {
  async function call(method, path, { query, body, auth = true } = {}) {
    const url = `${API}${path}${query ? '?' + new URLSearchParams(query) : ''}`;
    const headers = { 'user-agent': 'LE-RADAR-Tumblr/1.0 (+https://le-radar.ca/)', ...(body ? { 'content-type': 'application/json' } : {}), ...(auth ? { authorization: oauthHeader(method, url, { ck, cs, tk, ts }) } : {}) };
    const r = await fetchImpl(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Tumblr ${method} ${path} ${r.status} ${JSON.stringify(j.errors || j.meta || {}).slice(0, 300)}`);
    return j.response;
  }
  return {
    userInfo: () => call('GET', '/user/info'),
    async recentLinks(limit = 50) {
      const { linksInPosts } = await import('../tumblr.mjs');
      const r = await call('GET', `/blog/${blog}/posts`, { query: { npf: 'true', limit: String(limit), api_key: ck }, auth: false });
      return linksInPosts(r?.posts || []);
    },
    async post(body) {
      const r = await call('POST', `/blog/${blog}/posts`, { body });
      const id = r?.id_string || String(r?.id);
      return { id, url: `https://${blog}/post/${id}` };
    },
    getPost: id => call('GET', `/blog/${blog}/posts/${id}`, { query: { api_key: ck }, auth: false }),
  };
}

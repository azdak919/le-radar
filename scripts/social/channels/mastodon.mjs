// Canal Mastodon (API REST, gratuit) : image + description (POST /api/v2/media), puis statut
// (POST /api/v1/statuses) avec Idempotency-Key. Jeton : write:statuses + write:media seulement ;
// les lectures passent par l'API publique (lookup, statuts). Le jeton n'est jamais journalisé.
import crypto from 'node:crypto';

export const MAX_MEDIA = 8 * 1024 * 1024; // piaille.fr / Mastodon 4 : images ≤ 8 Mo
export const idemKey = id => crypto.createHash('sha256').update('le-radar:' + id).digest('hex').slice(0, 40);
const UA = 'LE-RADAR-Mastodon/1.0 (+https://le-radar.ca/)';

export function linksInStatuses(statuses = []) {
  const out = new Set();
  for (const s of statuses) {
    if (s.card?.url) out.add(s.card.url);
    for (const m of String(s.content || '').matchAll(/href="([^"]+)"/g)) out.add(m[1].replace(/&amp;/g, '&'));
  }
  return out;
}

export function createMastodon({ instance, token, acct = 'leradar', fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  const base = String(instance || '').replace(/\/+$/, '');
  async function call(method, p, { body, form, auth = true, headers = {} } = {}) {
    const h = { 'user-agent': UA, ...headers, ...(auth ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) };
    const r = await fetchImpl(base + p, { method, headers: h, body: form || (body ? JSON.stringify(body) : undefined), signal: AbortSignal.timeout(60000) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 429) throw new Error(`Mastodon ${method} ${p} 429 (plafond de taux, reprise ${r.headers.get('x-ratelimit-reset') || '?'})`);
    if (!r.ok) throw new Error(`Mastodon ${method} ${p} ${r.status}: ${String(j.error || '').slice(0, 200)}`);
    return { j, status: r.status };
  }
  return {
    async lookup() { return (await call('GET', `/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`, { auth: false })).j; },
    async recentLinks(limit = 40) {
      const a = await this.lookup();
      const { j } = await call('GET', `/api/v1/accounts/${a.id}/statuses?limit=${limit}&exclude_replies=true`, { auth: false });
      return linksInStatuses(j);
    },
    /** Téléverse l'image du Radar ; null si illisible (l'appelant ne publie pas sans image). */
    async uploadImage(url, description = '') {
      const r = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) }); if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer()), type = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
      if (!/^image\//.test(type) || buf.length > MAX_MEDIA) return null;
      const form = new FormData();
      form.append('file', new Blob([buf], { type }), 'image.' + (type.split('/')[1] || 'jpg'));
      if (description) form.append('description', description.slice(0, 1500));
      let { j } = await call('POST', '/api/v2/media', { form });
      for (let i = 0; !j.url && i < 10; i++) { await sleep(2000); ({ j } = await call('GET', `/api/v1/media/${j.id}`)); } // 202 : traitement
      return j.url ? j.id : null;
    },
    async listStatuses(limit = 40) { const a = await this.lookup(); return (await call('GET', `/api/v1/accounts/${a.id}/statuses?limit=${limit}`, { auth: false })).j; },
    deleteStatus: id => call('DELETE', `/api/v1/statuses/${id}`),
    async post({ status, mediaId, lang, key }) {
      const { j } = await call('POST', '/api/v1/statuses', { headers: { 'Idempotency-Key': key }, body: { status, media_ids: [mediaId], language: lang, visibility: 'public' } });
      return { id: j.id, url: j.url };
    },
  };
}

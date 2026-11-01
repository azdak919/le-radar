// Canal Bluesky (AT Protocol, gratuit) : session, résolution de @, blob, post.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PDS = 'https://bsky.social';
export const MAX_BLOB = 976 * 1024;

export function createBluesky({ handle, password, fetchImpl = fetch, pds = PDS }) {
  let s = null;
  async function x(method, nsid, { body, query, raw, type } = {}) {
    const u = `${pds}/xrpc/${nsid}${query ? '?' + new URLSearchParams(query) : ''}`;
    const headers = { ...(s ? { authorization: `Bearer ${s.accessJwt}` } : {}), ...(body || raw ? { 'content-type': type || 'application/json' } : {}) };
    const r = await fetchImpl(u, { method, headers, body: raw || (body ? JSON.stringify(body) : undefined), signal: AbortSignal.timeout(30000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Bluesky ${nsid} ${r.status}: ${j.error || ''} ${j.message || ''}`.trim());
    return j;
  }
  return {
    async login() { s = await x('POST', 'com.atproto.server.createSession', { body: { identifier: handle, password } }); return s.did; },
    async resolve(h) { try { return (await x('GET', 'com.atproto.identity.resolveHandle', { query: { handle: h } })).did; } catch { return null; } },
    async recentLinks() {
      const j = await x('GET', 'com.atproto.repo.listRecords', { query: { repo: s.did, collection: 'app.bsky.feed.post', limit: '50' } });
      return new Set((j.records || []).map(r => r.value?.embed?.external?.uri).filter(Boolean));
    },
    async uploadImage(url) {
      const r = await fetchImpl(url, { signal: AbortSignal.timeout(30000) }); if (!r.ok) return null;
      let buf = Buffer.from(await r.arrayBuffer()), type = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
      if (buf.length > MAX_BLOB || !/^image\/(jpeg|png|webp)$/.test(type)) {
        const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bsky-')), i = path.join(d, 'in'), o = path.join(d, 'out.jpg');
        try {
          fs.writeFileSync(i, buf);
          for (const [w, q] of [[1600, 82], [1200, 75], [900, 70]]) {
            execFileSync('convert', [i + '[0]', '-resize', `${w}x${w}>`, '-strip', '-quality', String(q), o]);
            buf = fs.readFileSync(o); type = 'image/jpeg'; if (buf.length <= MAX_BLOB) break;
          }
        } catch { return null; } finally { fs.rmSync(d, { recursive: true, force: true }); }
        if (buf.length > MAX_BLOB) return null;
      }
      return (await x('POST', 'com.atproto.repo.uploadBlob', { raw: buf, type })).blob;
    },
    async post(record) {
      const j = await x('POST', 'com.atproto.repo.createRecord', { body: { repo: s.did, collection: 'app.bsky.feed.post', record } });
      return { uri: j.uri, url: `https://bsky.app/profile/${handle}/post/${j.uri.split('/').pop()}` };
    },
  };
}

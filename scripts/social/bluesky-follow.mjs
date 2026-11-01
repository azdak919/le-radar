#!/usr/bin/env node
// Abonnements de @le-radar.bsky.social : data/social/bluesky-follows.json, idempotent et lent
// (MAX_FOLLOWS par passe, DELAY_MS entre chaque, déjà suivis sautés). Sans mot de passe : essai.
import fs from 'node:fs';
import path from 'node:path';
import { PDS } from './channels/bluesky.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/social/bluesky-follows.json'), 'utf8')).follows;
const handle = process.env.BLUESKY_HANDLE || 'le-radar.bsky.social', password = process.env.BLUESKY_APP_PASSWORD || '';
const max = parseInt(process.env.MAX_FOLLOWS || '30', 10), delay = parseInt(process.env.DELAY_MS || '4000', 10);
const pub = 'https://public.api.bsky.app/xrpc';
async function j(u, init) { const r = await fetch(u, { ...init, signal: AbortSignal.timeout(30000) }); const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${u.split('?')[0].split('/').pop()} ${r.status} ${b.error || ''}`); return b; }

const followed = new Map(); let cursor;
do {
  const b = await j(`${pub}/app.bsky.graph.getFollows?actor=${handle}&limit=100${cursor ? '&cursor=' + cursor : ''}`);
  for (const f of b.follows) followed.set(f.did, f.handle); cursor = b.cursor;
} while (cursor);
const extra = [...followed].filter(([d]) => !list.some(x => x.did === d)).map(([, h]) => h);
console.log(`Déjà suivis : ${followed.size}${extra.length ? ' · hors liste : ' + extra.join(', ') : ''}`);
const todo = list.filter(x => !followed.has(x.did));
console.log(`À suivre : ${todo.length} (max ${max} cette passe)`);
if (!password || process.env.DRY_RUN === 'true') { console.log('Essai :', todo.map(x => x.handle).join(', ')); process.exit(0); }
const s = await j(`${PDS}/xrpc/com.atproto.server.createSession`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: handle, password }) });
let n = 0;
for (const x of todo.slice(0, max)) {
  try {
    await j(`${PDS}/xrpc/com.atproto.repo.createRecord`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.accessJwt}` },
      body: JSON.stringify({ repo: s.did, collection: 'app.bsky.graph.follow', record: { $type: 'app.bsky.graph.follow', subject: x.did, createdAt: new Date().toISOString() } }) });
    console.log(`+ ${x.handle} (${x.nom})`); n++;
  } catch (e) { console.log(`::warning::${x.handle} : ${e.message}`); if (/429/.test(e.message)) break; }
  await new Promise(r => setTimeout(r, delay));
}
console.log(`Suivis ajoutés : ${n} · restants : ${todo.length - n}`);

#!/usr/bin/env node
// Supprime UNE publication du Radar (Mastodon, Tumblr ou Buffer en file) QUI CONTIENT un marqueur CDATA.
// Garde-fou : le post est relu avant suppression ; sans marqueur CDATA, rien n'est supprimé.
// Env : NETWORK=mastodon|tumblr|buffer, POST_ID, DRY_RUN (défaut true). Aucun secret journalisé.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { createMastodon } from './channels/mastodon.mjs';
import { oauthHeader } from './channels/tumblr.mjs';
import { BLOG } from './tumblr.mjs';
import { createXBuffer, API, isAuthFailure, AUTH_MSG } from './channels/x-buffer.mjs';
const { hasCdata } = createRequire(import.meta.url)('../cdata-lib.js');

const net = (process.env.NETWORK || '').trim();
const id = (process.env.POST_ID || '').trim();
const dry = process.env.DRY_RUN !== 'false';
if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) throw new Error('POST_ID invalide');
const verdict = (where, text) => {
  if (!hasCdata(text)) { console.log(`REFUS : ${where} ${id} ne contient aucun marqueur CDATA, rien n'est supprimé.`); process.exit(2); }
  console.log(`${where} ${id} contient un marqueur CDATA : ${String(text).replace(/\s+/g, ' ').slice(0, 160)}`);
};

if (net === 'mastodon') {
  const instance = process.env.MASTODON_INSTANCE || 'https://piaille.fr';
  const md = createMastodon({ instance, token: process.env.MASTODON_TOKEN || '' });
  const acct = await md.lookup();
  const r = await fetch(`${instance.replace(/\/+$/, '')}/api/v1/statuses/${id}`, { signal: AbortSignal.timeout(30000) });
  const st = await r.json();
  if (!r.ok || st.account?.id !== acct.id) throw new Error('statut introuvable ou pas du compte du Radar');
  verdict('Mastodon', `${st.content} ${st.card?.description || ''} ${st.spoiler_text || ''}`);
  if (dry) { console.log('Essai : rien supprimé.'); process.exit(0); }
  await md.deleteStatus(id);
  console.log(`Supprimé : ${st.url}`);
} else if (net === 'tumblr') {
  const keys = { ck: process.env.TUMBLR_CONSUMER_KEY, cs: process.env.TUMBLR_CONSUMER_SECRET, tk: process.env.TUMBLR_TOKEN, ts: process.env.TUMBLR_TOKEN_SECRET };
  if (!Object.values(keys).every(Boolean)) throw new Error('clés Tumblr absentes');
  const blog = process.env.TUMBLR_BLOG || BLOG;
  const call = async (method, p, { query, body } = {}) => {
    const url = `https://api.tumblr.com/v2${p}${query ? '?' + new URLSearchParams(query) : ''}`;
    const headers = { 'user-agent': 'LE-RADAR-Tumblr/1.0 (+https://le-radar.ca/)', ...(body ? { 'content-type': 'application/json' } : {}), authorization: oauthHeader(method, url, keys) };
    const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Tumblr ${method} ${p} ${r.status}`);
    return j.response;
  };
  const r = await call('GET', `/blog/${blog}/posts`, { query: { id, npf: 'true' } });
  const post = (r?.posts || []).find(p => (p.id_string || String(p.id)) === id);
  if (!post) throw new Error('post introuvable sur le blogue du Radar');
  verdict('Tumblr', JSON.stringify(post.content || post));
  if (dry) { console.log('Essai : rien supprimé.'); process.exit(0); }
  await call('POST', `/blog/${blog}/post/delete`, { body: { id } });
  console.log(`Supprimé : https://${blog}/post/${id}`);
} else if (net === 'buffer') {
  // Publications EN FILE seulement (l'API Buffer ne retire pas ce qui est déjà publié).
  const key = process.env.BUFFER_API_KEY || '';
  if (!key) throw new Error('BUFFER_API_KEY absente');
  const CFG = JSON.parse(fs.readFileSync(new URL('../../data/social/buffer-pages.json', import.meta.url)));
  const chans = [['x', createXBuffer({ key, fallbackId: process.env.BUFFER_CHANNEL_ID || undefined })],
    ...['facebook', 'linkedin'].filter(n => CFG[n]).map(n => [n, createXBuffer({ key, service: CFG[n].service, channelName: CFG[n].name, fallbackId: null })])];
  let found = null;
  for (const [name, ch] of chans) { const p = (await ch.queued()).find(q => q.id === id); if (p) { found = { name, p }; break; } }
  if (!found) { console.log(`Introuvable dans les files Buffer (déjà publiée ou supprimée) : ${id}`); process.exit(3); }
  verdict(`Buffer ${found.name}`, found.p.text);
  if (dry) { console.log('Essai : rien supprimé.'); process.exit(0); }
  const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ query: 'mutation($i: DeletePostInput!) { deletePost(input: $i) { ... on DeletePostSuccess { id } ... on VoidMutationError { message } } }', variables: { i: { id } } }) });
  const b = await res.json().catch(() => null);
  if (isAuthFailure(res.status, b)) throw new Error(AUTH_MSG);
  if (!b?.data?.deletePost?.id) throw new Error('suppression refusée par Buffer');
  console.log(`Supprimé de la file Buffer (${found.name}) : ${id}`);
} else throw new Error('NETWORK doit valoir mastodon, tumblr ou buffer');

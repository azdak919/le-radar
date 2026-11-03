#!/usr/bin/env node
// Interactions automatiques (Bluesky, Tumblr, Mastodon) : voir engage-lib.mjs. DRY_RUN=true par défaut.
import fs from 'node:fs';
import { createBluesky } from './channels/bluesky.mjs';
import { createTumblr, oauthHeader, API as TAPI } from './channels/tumblr.mjs';
import { BLOG } from './tumblr.mjs';
import { emptyState, budget, spend, seen, mark, okAccount, decide, MAX_PER_POST, MAX_AGE_H } from './engage-lib.mjs';

const STATE = 'data/engage-state.json';
const DRY = process.env.DRY_RUN !== 'false';
const only = (process.env.NETWORKS || 'bluesky,tumblr,mastodon').split(',');
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : emptyState();
const now = new Date(), young = d => (now - new Date(d)) / 36e5 < MAX_AGE_H;
const log = (...a) => console.log(...a);
const report = {};

async function bluesky() {
  const { BLUESKY_HANDLE: handle, BLUESKY_APP_PASSWORD: password } = process.env;
  if (!handle || !password) return log('Bluesky : secrets absents, sauté.');
  const pds = 'https://bsky.social'; let jwt, did;
  const x = async (method, nsid, { query, body } = {}) => {
    const r = await fetch(`${pds}/xrpc/${nsid}${query ? '?' + new URLSearchParams(query) : ''}`, { method, headers: { ...(jwt ? { authorization: `Bearer ${jwt}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`Bluesky ${nsid} ${r.status} ${j.error || ''}`); return j;
  };
  const s = await x('POST', 'com.atproto.server.createSession', { body: { identifier: handle, password } }); jwt = s.accessJwt; did = s.did;
  const feed = (await x('GET', 'app.bsky.feed.getAuthorFeed', { query: { actor: did, limit: '50', filter: 'posts_no_replies' } })).feed || [];
  let posts = 0, acts = 0;
  for (const { post } of feed) {
    if (post.author.did !== did || !young(post.indexedAt) || !post.replyCount) continue; posts++;
    const th = (await x('GET', 'app.bsky.feed.getPostThread', { query: { uri: post.uri, depth: '1' } })).thread;
    const replies = (th.replies || []).filter(r => r.post && r.post.author.did !== did).sort((a, b) => a.post.indexedAt.localeCompare(b.post.indexedAt)).slice(0, MAX_PER_POST);
    for (const { post: rp } of replies) {
      const id = 'bsky:' + rp.uri; if (seen(state, id)) continue;
      if (budget(state, 'bluesky', now) < 2) return report.bluesky = { posts, acts, note: 'plafond quotidien' };
      let prof; try { prof = await x('GET', 'app.bsky.actor.getProfile', { query: { actor: rp.author.did } }); } catch { prof = {}; }
      const okA = okAccount({ followers: prof.followersCount, createdAt: prof.createdAt, posts: prof.postsCount, name: prof.displayName }, now);
      const d = okA ? await decide(rp.record?.text) : null;
      log(`Bluesky ${rp.uri} → ${d ? 'j’aime + ' + (d.emoji || '—') : 'ignoré'}`);
      if (d && !DRY) {
        await x('POST', 'com.atproto.repo.createRecord', { body: { repo: did, collection: 'app.bsky.feed.like', record: { $type: 'app.bsky.feed.like', subject: { uri: rp.uri, cid: rp.cid }, createdAt: new Date().toISOString() } } });
        if (d.emoji) await x('POST', 'com.atproto.repo.createRecord', { body: { repo: did, collection: 'app.bsky.feed.post', record: { $type: 'app.bsky.feed.post', text: d.emoji, createdAt: new Date().toISOString(), reply: { root: { uri: post.uri, cid: post.cid }, parent: { uri: rp.uri, cid: rp.cid } } } } });
        spend(state, 'bluesky', d.emoji ? 2 : 1, now); acts += d.emoji ? 2 : 1;
      }
      if (!DRY) mark(state, id, now);
    }
  }
  report.bluesky = { posts, acts };
}

async function tumblr() {
  const e = process.env, keys = { ck: e.TUMBLR_CONSUMER_KEY, cs: e.TUMBLR_CONSUMER_SECRET, tk: e.TUMBLR_TOKEN, ts: e.TUMBLR_TOKEN_SECRET };
  if (!keys.ck || !keys.tk) return log('Tumblr : secrets absents, sauté.');
  const blog = e.TUMBLR_BLOG || BLOG;
  const call = async (method, path, query, body) => {
    const url = `${TAPI}${path}${query ? '?' + new URLSearchParams(query) : ''}`;
    const r = await fetch(url, { method, headers: { authorization: oauthHeader(method, url, keys), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`Tumblr ${path} ${r.status}`); return j.response;
  };
  const list = (await call('GET', `/blog/${blog}/posts`, { limit: '30', npf: 'true' }))?.posts || [];
  let posts = 0, acts = 0, skippedReplies = 0;
  for (const p of list) {
    if (!young(p.timestamp * 1000) || !(p.note_count > 0)) continue; posts++;
    // L'API v2 ne permet ni d'aimer ni de répondre à une réponse : seuls les reblogs avec commentaire sont aimés.
    const notes = (await call('GET', `/blog/${blog}/notes`, { id: p.id_string, mode: 'conversation' }))?.notes || [];
    skippedReplies += notes.filter(n => n.type === 'reply').length;
    const rbs = notes.filter(n => n.type === 'reblog' && n.reblog_parent_blog_name && n.blog_name !== blog.split('.')[0] && (n.added_text || n.reblog_parent_post_id)).slice(0, MAX_PER_POST);
    for (const n of rbs) {
      const id = 'tumblr:' + n.post_id; if (seen(state, id) || !n.post_id) continue;
      if (budget(state, 'tumblr', now) < 1) return report.tumblr = { posts, acts, note: 'plafond quotidien' };
      let rb; try { rb = (await call('GET', `/blog/${n.blog_name}/posts/${n.post_id}`))?.posts?.[0] || (await call('GET', `/blog/${n.blog_name}/posts`, { id: n.post_id }))?.posts?.[0]; } catch { rb = null; }
      let info; try { info = (await call('GET', `/blog/${n.blog_name}/info`))?.blog; } catch { info = null; }
      const text = n.added_text || (rb?.content || []).map(c => c.text || '').join(' ');
      const okA = info && info.posts >= 3 && (!info.updated || true);
      const d = okA && text ? await decide(text) : null;
      log(`Tumblr reblog ${n.blog_name}/${n.post_id} → ${d ? 'j’aime' : 'ignoré'}`);
      if (d && rb?.reblog_key && !DRY) { await call('POST', '/user/like', null, { id: String(n.post_id), reblog_key: rb.reblog_key }); spend(state, 'tumblr', 1, now); acts++; }
      if (!DRY) mark(state, id, now);
    }
  }
  report.tumblr = { posts, acts, skippedReplies };
}

async function mastodon() {
  const base = (process.env.MASTODON_INSTANCE || 'https://piaille.fr').replace(/\/+$/, ''), token = process.env.MASTODON_TOKEN;
  if (!token) return log('Mastodon : jeton absent, sauté.');
  const g = async p => { const r = await fetch(base + p, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`Mastodon ${p} ${r.status}`); return r.json(); };
  const me = await g('/api/v1/accounts/lookup?acct=leradar');
  const sts = await g(`/api/v1/accounts/${me.id}/statuses?limit=40&exclude_replies=true&exclude_reblogs=true`);
  let posts = 0, acts = 0;
  for (const st of sts) {
    if (!young(st.created_at) || !st.replies_count) continue; posts++;
    const ctx = await g(`/api/v1/statuses/${st.id}/context`);
    const replies = (ctx.descendants || []).filter(r => r.in_reply_to_id === st.id && r.account.id !== me.id).slice(0, MAX_PER_POST);
    for (const r of replies) {
      const id = 'masto:' + r.uri; if (seen(state, id)) continue;
      if (budget(state, 'mastodon', now) < 1) return report.mastodon = { posts, acts, note: 'plafond quotidien' };
      const text = String(r.content || '').replace(/<[^>]+>/g, ' ');
      // Aucune IA sur piaille.fr : filtre déterministe seulement, et seulement le clairement positif.
      const okA = okAccount({ followers: r.account.followers_count, createdAt: r.account.created_at, posts: r.account.statuses_count, name: r.account.display_name }, now) && !r.account.bot;
      const d = okA ? await decide(text, { noAi: true }) : null;
      log(`Mastodon ${r.url} → ${d ? 'favori' : 'ignoré'}`);
      if (d && !DRY) {
        const res = await fetch(`${base}/api/v1/statuses/${r.id}/favourite`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
        if (res.status === 403 || res.status === 401) { report.mastodon = { posts, acts, note: 'jeton sans portée write:favourites' }; return; }
        if (!res.ok) throw new Error(`Mastodon favourite ${res.status}`);
        spend(state, 'mastodon', 1, now); acts++;
      }
      if (!DRY) mark(state, id, now);
    }
  }
  report.mastodon = { posts, acts };
}

let failed = 0;
for (const [n, f] of [['bluesky', bluesky], ['tumblr', tumblr], ['mastodon', mastodon]]) {
  if (!only.includes(n)) continue;
  try { await f(); } catch (err) { failed++; log(`${n} : erreur ${String(err.message).slice(0, 200)}`); report[n] = { error: true }; }
}
if (!DRY) fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
log(`Résumé ${DRY ? '(essai)' : ''} : ${JSON.stringify(report)}`);
if (failed === only.length) process.exit(1);

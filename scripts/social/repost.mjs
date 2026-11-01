#!/usr/bin/env node
// Correction ponctuelle : supprime les publications d'articles précis (URLS) portant un mauvais
// crédit, puis les republie au format normal avec le crédit actuel du flux.
// Bluesky : deleteRecord puis republication immédiate (remplacement, pas doublon).
// Buffer (tous canaux) : posts programmés/en erreur supprimés ; posts déjà envoyés NON supprimables
// par l'API → listés (externalLink) pour suppression manuelle. X : nouveau post programmé à X_DUE.
// États mis à jour (data/bluesky-sent.json, data/buffer-sent.json) : l'article reste « envoyé »,
// le bot ne le republiera jamais une 3e fois. Env : URLS, X_DUE (ISO, même ordre), DRY_RUN, BSKY=true|false.
import fs from 'node:fs';
import path from 'node:path';
import { parseFeed, markImages, buildText, stripUtm, refreshPhotoLine, photoLine } from './lib.mjs';
import { createRequire } from 'node:module';
const { articleId } = createRequire(import.meta.url)('../../mobile/app/js/core.js');
import { resolveImage } from './image-resolve.mjs';
import { buildBskyText, detectLang, postRecord } from './bluesky.mjs';
import { createBluesky } from './channels/bluesky.mjs';
import { createXBuffer, API, isAuthFailure, AUTH_MSG } from './channels/x-buffer.mjs';
import { titleKey } from './rate-limit.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const rd = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const wr = (f, o) => fs.writeFileSync(path.join(ROOT, f), JSON.stringify(o, null, 1) + '\n');
const urls = (process.env.URLS || '').split(',').map(s => s.trim()).filter(Boolean);
const dues = (process.env.X_DUE || '').split(',').map(s => s.trim());
const dry = process.env.DRY_RUN !== 'false';
if (!urls.length) throw new Error('URLS vide');
const tz = d => d ? new Date(d).toLocaleString('fr-CA', { timeZone: 'America/Toronto' }) + ' (Toronto)' : '—';

const items = parseFeed(await (await fetch(process.env.FEED_URL || 'https://le-radar.ca/feed.xml', { signal: AbortSignal.timeout(30000) })).text());
const repeated = markImages(items);
const targets = urls.map(u => items.find(i => i.link === stripUtm(u) || i.id === u));
targets.forEach((t, i) => { if (!t) throw new Error(`absent du flux : ${urls[i]}`); });
const used = new Map(), imgs = new Map();
for (const it of targets) imgs.set(it.id, await resolveImage(it, { used, repeated }));
const photoLineFor = it => { const im = imgs.get(it.id); return im ? photoLine(im.credit, it.source) : ''; };
const has = (text, it) => (text || '').includes(it.link) || (text || '').includes(articleId(it.link));
console.log(`Mode ${dry ? 'ESSAI' : 'RÉEL'} · ${targets.length} article(s)`);
for (const it of targets) console.log(`- ${it.link} · crédit actuel : ${imgs.get(it.id)?.credit || '(aucun → nom du média)'}`);

// ---- Bluesky
if (process.env.BSKY !== 'false' && process.env.BLUESKY_APP_PASSWORD) {
  const handle = process.env.BLUESKY_HANDLE || 'le-radar.bsky.social';
  const bs = createBluesky({ handle, password: process.env.BLUESKY_APP_PASSWORD });
  await bs.login();
  const ACC = rd('data/social/bluesky-accounts.json').accounts, dids = new Map();
  for (const a of ACC) { const h = a.handle.replace(/^@/, '').toLowerCase(), d = await bs.resolve(h); if (d) dids.set(h, d); }
  const st = rd('data/bluesky-sent.json'); st.sent ||= {};
  const posts = await bs.listPosts(100);
  for (const it of targets) {
    const old = posts.filter(p => p.link === it.link || has(p.text, it));
    if (!old.length) { console.log(`Bluesky : aucune publication pour ${it.link}`); continue; }
    const want = photoLineFor(it);
    if (old.every(p => p.text.split('\n').pop() === want)) { console.log(`Bluesky : déjà correct (${want}) ${old.map(p => p.url).join(' ')}`); continue; }
    for (const p of old) { console.log(`Bluesky : suppression ${p.url}\n  ancien : ${p.text.split('\n').pop()}`); if (!dry) await bs.deletePost(p.uri); }
    const im = imgs.get(it.id), text = buildBskyText(it, ACC, { credit: im?.credit, photo: !!im });
    console.log(`Bluesky : republication\n${text}`);
    if (dry) continue;
    let thumb = null; if (im) { try { thumb = await bs.uploadImage(im.url); } catch (e) { console.log(`::warning::image : ${e.message}`); } }
    const r = await bs.post(postRecord({ text, lang: detectLang(it), dids, card: { uri: it.link, title: it.bare || it.title, description: it.desc?.slice(0, 300), thumb } }));
    st.sent[it.id] = { ...(st.sent[it.id] || {}), at: new Date().toISOString(), source: it.source, k: titleKey(it), uri: r.uri, url: r.url, repost: { deleted: old.map(p => p.url), credit: im?.credit || null } };
    wr('data/bluesky-sent.json', st);
    console.log(`→ Bluesky : ${r.url}`);
  }
}

// ---- Buffer (tous canaux)
const key = process.env.BUFFER_API_KEY;
if (key) {
  const gql = async (query, variables = {}) => {
    const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000) });
    const b = await res.json().catch(() => null);
    if (isAuthFailure(res.status, b)) throw new Error(AUTH_MSG);
    if (!res.ok || b?.errors?.length) throw new Error(`Buffer ${res.status}: ${JSON.stringify(b?.errors || b).slice(0, 400)}`);
    return b.data;
  };
  const x = createXBuffer({ key, fallbackId: process.env.BUFFER_CHANNEL_ID || undefined });
  const { organizationId, channelId } = await x.context();
  const chs = (await gql('query($o: OrganizationId!) { channels(input: { organizationId: $o }) { id service name } }', { o: organizationId }))?.channels || [];
  console.log(`Canaux Buffer : ${chs.map(c => c.service + ' ' + c.name).join(', ')}`);
  const edges = [];
  for (const status of ['scheduled', 'sent', 'error']) {
    const d = await gql(`query($o: OrganizationId!, $c: [ChannelId!], $s: [PostStatus!]) { posts(first: 100, input: { organizationId: $o, filter: { channelIds: $c, status: $s } }) { edges { node { id status channelId channelService text dueAt sentAt externalLink } } } }`, { o: organizationId, c: chs.map(c => c.id), s: [status] });
    edges.push(...(d?.posts?.edges || []));
  }
  const d = { posts: { edges } };
  const all = (d?.posts?.edges || []).map(e => e.node);
  console.log(`Buffer : ${all.length} post(s) lus (tous canaux).`);
  const st = rd('data/buffer-sent.json'); st.sent ||= {};
  const ACC = rd('data/social/x-accounts.json').accounts;
  const queuedOk = new Set();
  for (const [n, it] of targets.entries()) {
    for (const p of all.filter(p => has(p.text, it))) {
      const line = `Buffer ${p.channelService} ${p.status} ${p.id} · ${tz(p.sentAt || p.dueAt)} · ${p.externalLink || ''}\n  ancien : ${p.text.split('\n').pop()}`;
      if (p.text.split('\n').pop() === photoLineFor(it)) { console.log(`Déjà correct : ${line}`); if (p.channelService === 'twitter' && /sent|sending|scheduled/.test(p.status)) queuedOk.add(it.id); continue; }
      if (/sent|sending/.test(p.status)) { console.log(`À SUPPRIMER À LA MAIN (API : publié non supprimable) : ${line}`); continue; }
      // En file : crédit corrigé sur place (même id, image, heure) ; supprimé seulement si non corrigeable.
      const fixed = refreshPhotoLine(p.text, it, '', p.channelService === 'twitter' ? 280 : 5000);
      if (fixed && fixed !== p.text && Date.parse(p.dueAt) - Date.now() > 10 * 60e3) {
        console.log(`Crédit corrigé en file : ${line}\n  nouveau : ${fixed.split('\n').pop()}`);
        if (!dry) { await x.editText(p.id, fixed); const s = st.sent[it.id]; if (s) { s.credit = it.credit || it.source; wr('data/buffer-sent.json', st); } }
        if (p.channelService === 'twitter') queuedOk.add(it.id); continue;
      }
      if (fixed === p.text) { console.log(`Déjà correct en file : ${line}`); if (p.channelService === 'twitter') queuedOk.add(it.id); continue; }
      console.log(`Suppression : ${line}`);
      if (!dry) { const r = await gql('mutation($i: DeletePostInput!) { deletePost(input: $i) { ... on DeletePostSuccess { id } ... on VoidMutationError { message } } }', { i: { id: p.id } }); if (!r?.deletePost?.id) throw new Error(`deletePost refusé : ${JSON.stringify(r)}`); }
    }
    if (queuedOk.has(it.id)) continue;
    const due = dues[n];
    if (!due) { console.log(`X : pas de X_DUE pour ${it.link}, pas de republication.`); continue; }
    if (!(Date.parse(due) > Date.now() + 10 * 60e3)) throw new Error(`X_DUE passé ou trop proche : ${due}`);
    const im = imgs.get(it.id), text = buildText(it, ACC, undefined, { credit: im?.credit, photo: !!im });
    console.log(`X : republication programmée ${tz(due)}\n${text}`);
    if (dry) continue;
    const post = await x.add({ text, image: im?.url, dueAt: new Date(due).toISOString() });
    st.sent[it.id] = { ...(st.sent[it.id] || {}), at: new Date().toISOString(), source: it.source, postId: post.id, dueAt: post.dueAt || due, credit: im?.credit || it.source, repost: true };
    wr('data/buffer-sent.json', st);
    console.log(`→ Buffer X : ${post.id} (${tz(post.dueAt)})`);
  }
  console.log('File X actuelle :', (await x.queued()).map(p => tz(p.dueAt)).join(' | '));
}

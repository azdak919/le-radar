#!/usr/bin/env node
// Purge complète des publications du Radar (manuel, approuvée par le propriétaire le 2026-11-01),
// avant le passage au nouveau format (fiches le-radar.ca/article/<id>/).
//   Bluesky : tous les posts du compte supprimés (deleteRecord).
//   Tumblr  : tous les posts du blogue supprimés (/post/delete).
//   Buffer  : posts programmés / en erreur / brouillons supprimés sur X, Facebook et LinkedIn.
//             Posts déjà publiés : l'API Buffer ne les retire pas du réseau → listés (lien) pour
//             suppression à la main.
//   États remis à zéro (sent = {}, liveSince = maintenant : aucun rattrapage en rafale).
// Env : DRY_RUN (défaut true), NETWORKS=bluesky,tumblr,buffer. Aucun secret journalisé.
import fs from 'node:fs';
import path from 'node:path';
import { createBluesky } from './channels/bluesky.mjs';
import { API, isAuthFailure, AUTH_MSG } from './channels/x-buffer.mjs';
import { BLOG } from './tumblr.mjs';
import { createMastodon } from './channels/mastodon.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dry = process.env.DRY_RUN !== 'false';
const nets = new Set((process.env.NETWORKS || 'bluesky,tumblr,buffer').split(',').map(s => s.trim()));
const now = new Date().toISOString();
const wr = (f, o) => { if (!dry) fs.writeFileSync(path.join(ROOT, f), JSON.stringify(o, null, 1) + '\n'); };
const summary = [];
console.log(`Purge ${dry ? 'ESSAI (rien n’est supprimé)' : 'RÉELLE'} · ${[...nets].join(', ')}`);

if (nets.has('mastodon')) {
  if (!process.env.MASTODON_TOKEN) summary.push('Mastodon : jeton absent, sauté.');
  else {
    const md = createMastodon({ instance: process.env.MASTODON_INSTANCE || 'https://piaille.fr', token: process.env.MASTODON_TOKEN });
    let n = 0, guard = 0;
    for (;;) {
      const ss = await md.listStatuses(40); if (!ss.length || guard++ > 50) break;
      for (const p of ss) { console.log(`Mastodon ${dry ? 'à supprimer' : 'supprimé'} : ${p.url}`); if (!dry) { await md.deleteStatus(p.id); await new Promise(r => setTimeout(r, 2000)); } n++; }
      if (dry) break;
    }
    summary.push(`Mastodon : ${n} statut(s) ${dry ? 'à supprimer' : 'supprimé(s)'}.`);
    const st = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/mastodon-sent.json'), 'utf8'));
    wr('data/mastodon-sent.json', { ...st, liveSince: now, sent: {}, purgedAt: now });
  }
}

if (nets.has('bluesky')) {
  if (!process.env.BLUESKY_APP_PASSWORD) summary.push('Bluesky : mot de passe d’application absent, sauté.');
  else {
    const handle = process.env.BLUESKY_HANDLE || 'le-radar.bsky.social';
    const bs = createBluesky({ handle, password: process.env.BLUESKY_APP_PASSWORD });
    await bs.login();
    let n = 0, guard = 0; const seen = new Set();
    for (;;) {
      const posts = (await bs.listPosts(100)).filter(p => !seen.has(p.uri)); posts.forEach(p => seen.add(p.uri));
      if (!posts.length || guard++ > 50) break;
      for (const p of posts) { console.log(`Bluesky ${dry ? 'à supprimer' : 'supprimé'} : ${p.url} · ${p.text.split('\n')[0].slice(0, 80)}`); if (!dry) await bs.deletePost(p.uri); n++; }
      if (dry) break;
    }
    summary.push(`Bluesky : ${n} post(s) ${dry ? 'à supprimer' : 'supprimé(s)'}.`);
    const st = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/bluesky-sent.json'), 'utf8'));
    wr('data/bluesky-sent.json', { ...st, liveSince: now, sent: {}, purgedAt: now });
  }
}

if (nets.has('tumblr')) {
  const keys = { ck: process.env.TUMBLR_CONSUMER_KEY || '', cs: process.env.TUMBLR_CONSUMER_SECRET || '', tk: process.env.TUMBLR_TOKEN || '', ts: process.env.TUMBLR_TOKEN_SECRET || '' };
  if (!Object.values(keys).every(Boolean)) summary.push('Tumblr : clés absentes, sauté.');
  else {
    const blog = process.env.TUMBLR_BLOG || BLOG;
    const call = async (method, p, opt = {}) => {
      const { oauthHeader } = await import('./channels/tumblr.mjs');
      const url = `https://api.tumblr.com/v2${p}${opt.query ? '?' + new URLSearchParams(opt.query) : ''}`;
      const headers = { 'user-agent': 'LE-RADAR-Tumblr/1.0 (+https://le-radar.ca/)', ...(opt.body ? { 'content-type': 'application/json' } : {}), authorization: oauthHeader(method, url, keys) };
      const r = await fetch(url, { method, headers, body: opt.body ? JSON.stringify(opt.body) : undefined, signal: AbortSignal.timeout(30000) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`Tumblr ${method} ${p} ${r.status} ${JSON.stringify(j.errors || j.meta || {}).slice(0, 200)}`);
      return j.response;
    };
    let n = 0; const seen = new Set();
    for (let guard = 0; guard < 50; guard++) {
      const r = await call('GET', `/blog/${blog}/posts`, { query: { limit: '20', npf: 'true' } });
      const posts = (r?.posts || []).filter(p => !seen.has(p.id_string || String(p.id)));
      if (!posts.length) break;
      for (const p of posts) {
        const id = p.id_string || String(p.id); seen.add(id);
        console.log(`Tumblr ${dry ? 'à supprimer' : 'supprimé'} : https://${blog}/post/${id}`);
        if (!dry) await call('POST', `/blog/${blog}/post/delete`, { body: { id } });
        n++;
      }
      if (dry) break;
    }
    summary.push(`Tumblr : ${n} post(s) ${dry ? 'à supprimer' : 'supprimé(s)'}.`);
    const st = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tumblr-sent.json'), 'utf8'));
    wr('data/tumblr-sent.json', { ...st, liveSince: now, sent: {}, purgedAt: now });
  }
}

if (nets.has('buffer')) {
  const key = process.env.BUFFER_API_KEY;
  if (!key) summary.push('Buffer : clé absente, sauté.');
  else {
    const gql = async (query, variables = {}) => {
      const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000) });
      const b = await res.json().catch(() => null);
      if (isAuthFailure(res.status, b)) throw new Error(AUTH_MSG);
      if (!res.ok || b?.errors?.length) throw new Error(`Buffer ${res.status}: ${JSON.stringify(b?.errors || b).slice(0, 400)}`);
      return b.data;
    };
    const orgs = (await gql('query { account { organizations { id } } }'))?.account?.organizations || [];
    const manual = [];
    for (const o of orgs) {
      const chs = (await gql('query($o: OrganizationId!) { channels(input: { organizationId: $o }) { id service name } }', { o: o.id }))?.channels || [];
      for (const ch of chs) {
        let del = 0;
        for (const status of ['scheduled', 'error', 'draft', 'sent']) {
          let d;
          try { d = await gql(`query($o: OrganizationId!, $c: [ChannelId!], $s: [PostStatus!]) { posts(first: 100, input: { organizationId: $o, filter: { channelIds: $c, status: $s } }) { edges { node { id status text dueAt sentAt externalLink } } } }`, { o: o.id, c: [ch.id], s: [status] }); }
          catch (e) { console.log(`(${ch.service} ${status} illisible : ${e.message.slice(0, 120)})`); continue; }
          for (const { node: p } of d?.posts?.edges || []) {
            if (status === 'sent') { manual.push(`${ch.service} « ${ch.name} » : ${p.externalLink || '(lien inconnu)'} · envoyé ${p.sentAt || ''} · ${String(p.text || '').split('\n')[0].slice(0, 70)}`); continue; }
            console.log(`Buffer ${ch.service} ${status} ${dry ? 'à supprimer' : 'supprimé'} : ${p.id} · ${String(p.text || '').split('\n')[0].slice(0, 70)}`);
            if (!dry) { const r = await gql('mutation($i: DeletePostInput!) { deletePost(input: $i) { ... on DeletePostSuccess { id } ... on VoidMutationError { message } } }', { i: { id: p.id } }); if (!r?.deletePost?.id) throw new Error(`deletePost refusé : ${JSON.stringify(r)}`); }
            del++;
          }
        }
        summary.push(`Buffer ${ch.service} « ${ch.name} » : ${del} post(s) en file/erreur ${dry ? 'à supprimer' : 'supprimé(s)'}.`);
      }
    }
    summary.push(`Déjà publiés via Buffer (à retirer du réseau à la main, l'API ne le permet pas) : ${manual.length}`);
    for (const m of manual) summary.push(`  - ${m}`);
    const bs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/buffer-sent.json'), 'utf8'));
    wr('data/buffer-sent.json', { ...bs, sent: {}, purgedAt: now });
    wr('data/buffer-pages-sent.json', { facebook: {}, linkedin: {} });
  }
}
console.log('\n===== Bilan =====\n' + summary.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Purge ${dry ? '(essai)' : '(réelle)'}\n\n${summary.map(s => s.startsWith('  ') ? s : '- ' + s).join('\n')}\n`);

#!/usr/bin/env node
// Ponctuel : supprimer les publications « Résultats du week-end » encore en ligne
// (Bluesky, Mastodon, Tumblr), puis laisser formats-run republier les six réseaux
// avec le titre « fin de semaine ». Aucun secret n'est journalisé.
// Env : DRY_RUN (défaut true), FORCE_WINDOW=true pour ignorer la fenêtre lundi-mardi,
// et les jetons habituels (Mastodon, Bluesky, Tumblr). Les identifiants des anciens
// posts viennent de data/social/formats-state.json sauf surcharge par env.
import fs from 'node:fs';
import path from 'node:path';
import { createBluesky } from './channels/bluesky.mjs';
import { createMastodon, idemKey } from './channels/mastodon.mjs';
import { createTumblr, API as TUMBLR_API, oauthHeader } from './channels/tumblr.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const STATE = path.join(ROOT, 'data/social/formats-state.json');
const dry = process.env.DRY_RUN !== 'false';
const KEY = process.env.WEEKEND_KEY || '2026-11-08';
const MARKER = /week-end|weekend/i;

export function hasOldWording(text) {
  return MARKER.test(String(text || ''));
}

function loadState() {
  return JSON.parse(fs.readFileSync(STATE, 'utf8'));
}
function saveState(state) {
  fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
}

async function publicGone(label, url, { okWhen } = {}) {
  const r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'LE-RADAR/1.0 (+https://le-radar.ca/)' }, signal: AbortSignal.timeout(30000) });
  const body = await r.text().catch(() => '');
  const gone = okWhen ? okWhen(r, body) : (r.status === 404 || r.status === 410);
  console.log(`${label} : HTTP ${r.status} → ${gone ? 'introuvable (ok)' : 'encore en ligne'}`);
  return gone;
}

async function deleteBluesky(rkey, uri) {
  const handle = process.env.BLUESKY_HANDLE || 'le-radar.ca';
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!password) throw new Error('BLUESKY_APP_PASSWORD absente');
  const bs = createBluesky({ handle: /did:plc:/.test(handle) ? 'le-radar.ca' : handle, password });
  await bs.login();
  const posts = await bs.listPosts(50);
  const found = posts.find(p => p.uri.endsWith('/' + rkey) || p.uri === uri);
  if (!found) {
    console.log(`Bluesky ${rkey} : déjà absent du compte.`);
    return { gone: true };
  }
  if (!hasOldWording(found.text)) throw new Error('Bluesky : le post trouvé ne contient pas « week-end », suppression refusée.');
  console.log(`Bluesky à supprimer : ${found.url} (${found.text.split('\n')[0]})`);
  if (dry) return { gone: false, dry: true };
  await bs.deletePost(found.uri);
  const still = (await bs.listPosts(50)).some(p => p.uri.endsWith('/' + rkey));
  if (still) throw new Error('Bluesky : le post est encore dans le compte après suppression.');
  return { gone: true };
}

async function deleteMastodon(id) {
  const instance = (process.env.MASTODON_INSTANCE || 'https://piaille.fr').replace(/\/+$/, '');
  const token = process.env.MASTODON_TOKEN;
  if (!token) throw new Error('MASTODON_TOKEN absente');
  const md = createMastodon({ instance, token, acct: process.env.MASTODON_ACCT || 'leradar' });
  const acct = await md.lookup();
  const r = await fetch(`${instance}/api/v1/statuses/${id}`, { signal: AbortSignal.timeout(30000) });
  if (r.status === 404 || r.status === 410) {
    console.log(`Mastodon ${id} : déjà introuvable.`);
    return { gone: true };
  }
  const st = await r.json();
  if (!r.ok || st.account?.id !== acct.id) throw new Error('Mastodon : statut introuvable ou pas du compte du Radar');
  const text = `${st.content || ''} ${st.plain || ''} ${st.card?.description || ''}`;
  if (!hasOldWording(text) && !hasOldWording(st.spoiler_text || '')) throw new Error('Mastodon : le post trouvé ne contient pas « week-end », suppression refusée.');
  console.log(`Mastodon à supprimer : ${st.url}`);
  if (dry) return { gone: false, dry: true };
  await md.deleteStatus(id);
  let status = 200;
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const check = await fetch(`${instance}/api/v1/statuses/${id}`, { signal: AbortSignal.timeout(30000) });
    status = check.status;
    if (status === 404 || status === 410) return { gone: true };
  }
  throw new Error(`Mastodon : encore en ligne (HTTP ${status}).`);
}

async function deleteTumblr(id) {
  const keys = { ck: process.env.TUMBLR_CONSUMER_KEY, cs: process.env.TUMBLR_CONSUMER_SECRET, tk: process.env.TUMBLR_TOKEN, ts: process.env.TUMBLR_TOKEN_SECRET };
  if (!Object.values(keys).every(Boolean)) throw new Error('clés Tumblr absentes');
  const blog = process.env.TUMBLR_BLOG || 'le-radar-ca.tumblr.com';
  const call = async (method, p, { query, body } = {}) => {
    const url = `${TUMBLR_API}${p}${query ? '?' + new URLSearchParams(query) : ''}`;
    const headers = { 'user-agent': 'LE-RADAR-Tumblr/1.0 (+https://le-radar.ca/)', ...(body ? { 'content-type': 'application/json' } : {}), authorization: oauthHeader(method, url, keys) };
    const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Tumblr ${method} ${p} ${r.status}`);
    return j.response;
  };
  let post;
  try {
    const r = await call('GET', `/blog/${blog}/posts`, { query: { id, npf: 'true' } });
    post = (r?.posts || []).find(p => (p.id_string || String(p.id)) === id);
  } catch (e) {
    if (/404/.test(String(e.message))) {
      console.log(`Tumblr ${id} : déjà introuvable.`);
      return { gone: true };
    }
    throw e;
  }
  if (!post) {
    console.log(`Tumblr ${id} : déjà introuvable.`);
    return { gone: true };
  }
  const blob = JSON.stringify(post.content || post);
  if (!hasOldWording(blob)) throw new Error('Tumblr : le post trouvé ne contient pas « week-end », suppression refusée.');
  console.log(`Tumblr à supprimer : https://${blog}/post/${id}`);
  if (dry) return { gone: false, dry: true };
  await call('POST', `/blog/${blog}/post/delete`, { body: { id } });
  let still = false;
  try {
    const r = await call('GET', `/blog/${blog}/posts`, { query: { id, npf: 'true' } });
    still = (r?.posts || []).some(p => (p.id_string || String(p.id)) === id);
  } catch (e) {
    if (/404/.test(String(e.message))) still = false;
    else throw e;
  }
  if (still) throw new Error('Tumblr : le post est encore dans le blogue après suppression.');
  return { gone: true };
}

async function main() {
  void idemKey;
  const state = loadState();
  const row = state.weekend_results?.[KEY] || {};
  const bsky = row.bluesky || {};
  const rkey = process.env.DELETE_BLUESKY_RKEY || (bsky.uri || bsky.url || '').split('/').pop();
  const mastoId = process.env.DELETE_MASTODON_ID || row.mastodon?.id;
  const tumblrId = process.env.DELETE_TUMBLR_ID || row.tumblr?.id;
  if (!rkey || !mastoId || !tumblrId) throw new Error('identifiants des anciens posts manquants dans formats-state ou l\'environnement');

  console.log(`Mode : ${dry ? 'essai (rien n\'est supprimé ni publié)' : 'réel'}. Clé ${KEY}.`);
  const b = await deleteBluesky(rkey, bsky.uri);
  const m = await deleteMastodon(mastoId);
  const t = await deleteTumblr(tumblrId);

  if (!dry) {
    const bGone = await publicGone('Bluesky public', `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(bsky.uri || `at://did:plc:uxuxieev7fbkiji3xyyhzgae/app.bsky.feed.post/${rkey}`)}`, {
      okWhen: (r, body) => r.status === 404 || r.status === 400 || /not.found|NotFound|not found/i.test(body),
    });
    const mGone = await publicGone('Mastodon public', `https://piaille.fr/api/v1/statuses/${mastoId}`);
    // Tumblr sert souvent un défi anti-bot en public : la confirmation passe par l'API dans deleteTumblr.
    if (!b.gone || !m.gone || !t.gone || !bGone || !mGone) throw new Error('un ancien post est encore en ligne, aucune republication.');
  }

  if (dry) {
    console.log('Essai : formats-state et publications inchangés.');
    return;
  }

  const next = loadState();
  if (next.weekend_results?.[KEY]) next.weekend_results[KEY] = {};
  saveState(next);
  console.log(`État vidé pour weekend_results.${KEY} (republication autorisée une fois).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  await main();
}

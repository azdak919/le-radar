#!/usr/bin/env node
// Bot social du Radar : feed.xml → file Buffer (X). Sans BUFFER_API_KEY : mode essai, sortie 0.
// Usage : node scripts/social/buffer-post.mjs [--dry-run] [--feed fichier.xml]
import fs from 'node:fs';
import path from 'node:path';
import { parseFeed, markImages, buildText, selectItems, xlen, QUEUE_MAX } from './lib.mjs';
import { resolveImage } from './image-resolve.mjs';
import { createXBuffer, AuthError } from './channels/x-buffer.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const STATE = path.join(ROOT, 'data/buffer-sent.json');
const ACCOUNTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/social/x-accounts.json'), 'utf8')).accounts;
const args = process.argv.slice(2);
const key = process.env.BUFFER_API_KEY || '';
let dry = args.includes('--dry-run') || process.env.DRY_RUN === 'true';
if (!key) { console.log('BUFFER_API_KEY absent : mode essai.'); dry = true; }
const feedArg = args.includes('--feed') ? args[args.indexOf('--feed') + 1] : null;

const xml = feedArg ? fs.readFileSync(feedArg, 'utf8')
  : await (await fetch(process.env.FEED_URL || 'https://le-radar.ca/feed.xml', { signal: AbortSignal.timeout(30000) })).text();
const items = parseFeed(xml);
if (!items.length) throw new Error('feed.xml vide ou illisible');
const repeated = markImages(items);
const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
state.sent ||= {};

const channel = key ? createXBuffer({ key, fallbackId: process.env.BUFFER_CHANNEL_ID || undefined }) : null;
let queued = [];
try {
  if (channel) {
    const c = await channel.context();
    console.log(`Canal X : ${c.channelId} (${c.discovered ? 'découvert via channels' : 'id de repli'})`);
    queued = await channel.queued();
  }
} catch (e) { if (e instanceof AuthError) { console.error(`::error::${e.message}`); process.exit(1); } throw e; }

const byPost = new Map(Object.values(state.sent).filter(s => s.postId).map(s => [s.postId, s.source]));
const queuedSources = queued.map(p => byPost.get(p.id) || items.find(i => p.text?.includes(i.link))?.source).filter(Boolean);
const slots = Math.max(0, QUEUE_MAX - queued.length);
console.log(`Flux : ${items.length} items · file actuelle : ${queued.length} · places : ${slots}`);
const sel = selectItems(items, { sentIds: new Set(Object.keys(state.sent)), queuedSources, slots });

const used = new Map(); let n = 0;
for (const it of sel) {
  const text = buildText(it, ACCOUNTS);
  const im = await resolveImage(it, { used, repeated });
  console.log(`\n--- ${++n}. [${it.source}] ${xlen(text)} car. · image ${im ? im.origin + ' ' + im.url : 'AUCUNE'}\n${text}`);
  if (dry) continue;
  try {
    const post = await channel.add({ text, image: im?.url });
    state.sent[it.id] = { at: new Date().toISOString(), source: it.source, postId: post.id, dueAt: post.dueAt || null };
    fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
    console.log(`→ en file Buffer : ${post.id} (${post.dueAt || 'heure auto'})`);
  } catch (e) { if (e instanceof AuthError) { console.error(`::error::${e.message}`); process.exit(1); } throw e; }
}
// Purge de l'état > 30 jours (le flux ne garde que 50 items).
for (const [id, s] of Object.entries(state.sent)) if (Date.now() - new Date(s.at) > 30 * 864e5) delete state.sent[id];
if (!dry) fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
console.log(`\n${dry ? 'ESSAI' : 'RÉEL'} : ${sel.length} publication(s) ${dry ? 'prévues' : 'ajoutées'}, ${new Set(sel.map(s => s.source)).size} source(s).`);

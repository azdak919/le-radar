#!/usr/bin/env node
// Bot Bluesky du Radar : publie les MÊMES choix nocturnes que X (data/buffer-sent.json) quand
// leur créneau est passé (≤ 2 h, sinon sauté). Déclenché par le Worker le-radar-news-trigger
// (aux :05/:35) + cron GitHub de secours. Idempotent : data/bluesky-sent.json + vérification
// des derniers posts du compte. Sans BLUESKY_APP_PASSWORD : essai.
// SHARE_NOW=true : UN article récent au hasard, hors choix X, publié tout de suite.
import fs from 'node:fs';
import path from 'node:path';
import { parseFeed, markImages, MAX_AGE_H } from './lib.mjs';
import { resolveImage } from './image-resolve.mjs';
import { buildBskyText, graphemes, detectLang, dueItems, postRecord, facets, BSKY_LIMIT } from './bluesky.mjs';
import { createBluesky } from './channels/bluesky.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const XSTATE = path.join(ROOT, 'data/buffer-sent.json'), STATE = path.join(ROOT, 'data/bluesky-sent.json');
const ACCOUNTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/social/bluesky-accounts.json'), 'utf8')).accounts;
const handle = process.env.BLUESKY_HANDLE || 'le-radar.bsky.social', password = process.env.BLUESKY_APP_PASSWORD || '';
let dry = process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run');
if (!password) { console.log('BLUESKY_APP_PASSWORD absent : mode essai.'); dry = true; }
const shareNow = process.env.SHARE_NOW === 'true';

const xSent = JSON.parse(fs.readFileSync(XSTATE, 'utf8')).sent || {};
const state = JSON.parse(fs.readFileSync(STATE, 'utf8')); state.sent ||= {};
const { due, late } = dueItems(xSent, state.sent);
for (const l of late) { console.log(`Sauté (créneau ${l.dueAt} dépassé de > 2 h) : ${l.id}`); if (!dry) state.sent[l.id] = { at: new Date().toISOString(), skipped: 'late', dueAt: l.dueAt }; }
// En essai : montre aussi les créneaux à venir aujourd'hui.
const upcoming = dry ? Object.entries(xSent).filter(([id, s]) => s.dueAt && !s.shareNow && !state.sent[id] && Date.parse(s.dueAt) > Date.now() && Date.parse(s.dueAt) - Date.now() < 24 * 3600e3).map(([id, s]) => ({ id, dueAt: s.dueAt, upcoming: true })) : [];
let todo = shareNow ? [] : [...due, ...upcoming];
console.log(`Bluesky ${handle} : ${due.length} dû(s), ${late.length} sauté(s), ${upcoming.length} à venir (essai).`);
if (!todo.length && !shareNow) { if (!dry && late.length) fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n'); process.exit(0); }

const xml = await (await fetch(process.env.FEED_URL || 'https://le-radar.ca/feed.xml', { signal: AbortSignal.timeout(30000) })).text();
const items = parseFeed(xml); if (!items.length) throw new Error('feed.xml vide');
const repeated = markImages(items);
if (shareNow) {
  const pool = items.filter(i => !xSent[i.id] && !state.sent[i.id] && Date.now() - i.date <= MAX_AGE_H * 3600e3);
  const best = [pool.filter(p => p.img && !p.imgDropped), pool].find(l => l.length) || [];
  todo = best.length ? [{ id: best[Math.floor(Math.random() * best.length)].id, shareNow: true }] : [];
}

const bs = createBluesky({ handle, password });
let posted = new Set(); const dids = new Map();
if (!dry) {
  await bs.login(); posted = await bs.recentLinks();
  for (const a of ACCOUNTS) { const h = a.handle.replace(/^@/, '').toLowerCase(), d = await bs.resolve(h); if (d) dids.set(h, d); }
}
const used = new Map(); let n = 0;
for (const t of todo) {
  const it = items.find(i => i.id === t.id);
  if (!it) { console.log(`::warning::${t.id} absent du flux, non publié.`); if (!dry && !t.upcoming) state.sent[t.id] = { at: new Date().toISOString(), skipped: 'absent du flux', dueAt: t.dueAt }; continue; }
  const im = await resolveImage(it, { used, repeated });
  const text = buildBskyText(it, ACCOUNTS, { credit: im?.credit, photo: !!im }), lang = detectLang(it);
  console.log(`\n--- ${++n}.${t.dueAt ? ' ' + new Date(t.dueAt).toLocaleString('fr-CA', { timeZone: 'America/Toronto' }) : ''}${t.upcoming ? ' (à venir)' : ''} [${it.source}] ${graphemes(text)}/${BSKY_LIMIT} graphèmes · ${lang} · image ${im ? im.url : 'AUCUNE'} · facettes ${facets(text).length}\n${text}`);
  if (dry || t.upcoming) continue;
  if (posted.has(it.link)) { console.log('Déjà sur Bluesky (vérifié dans le compte) : noté, pas republié.'); state.sent[it.id] = { at: new Date().toISOString(), dueAt: t.dueAt || null, dedup: true }; fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n'); continue; }
  let thumb = null; if (im) { try { thumb = await bs.uploadImage(im.url); } catch (e) { console.log(`::warning::image non téléversée : ${e.message}`); } }
  const rec = postRecord({ text, lang, dids, card: { uri: it.link, title: it.bare || it.title, description: it.desc?.slice(0, 300), thumb } });
  const p = await bs.post(rec);
  state.sent[it.id] = { at: new Date().toISOString(), source: it.source, dueAt: t.dueAt || null, uri: p.uri, url: p.url, ...(t.shareNow ? { shareNow: true } : {}) };
  fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
  console.log(`→ Bluesky : ${p.url}`);
}
for (const [id, s] of Object.entries(state.sent)) if (Date.now() - new Date(s.at) > 30 * 864e5) delete state.sent[id];
if (!dry) fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
console.log(`\n${dry ? 'ESSAI' : 'RÉEL'} terminé.`);

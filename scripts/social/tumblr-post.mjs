#!/usr/bin/env node
// Bot Tumblr du Radar (leradar-ca.tumblr.com) : même règles que Bluesky. Articles FRAIS du flux
// (≤ 24 h, après state.liveSince : aucun rattrapage), une seule fois, ≤ 3 par passage espacés de
// 90 s. Plafond tumblr de rate-limit.mjs (10/h, 150/24 h) ; au-delà, sélection comme X, surplus
// SAUTÉ. Idempotent : data/tumblr-sent.json + derniers posts du blogue. Sans clés : essai.
// DRY_RUN=true : vérifie l'authentification (/v2/user/info) sans publier.
import fs from 'node:fs';
import path from 'node:path';
import { parseFeed, markImages } from './lib.mjs';
import { resolveImage } from './image-resolve.mjs';
import { buildTumblrText, npfBody, detectLang, BLOG } from './tumblr.mjs';
import { createTumblr } from './channels/tumblr.mjs';
import { plan, freshCandidates, titleKey } from './rate-limit.mjs';
import { jitterMs } from './schedule.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const STATE = path.join(ROOT, 'data/tumblr-sent.json');
const ACCOUNTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/social/tumblr-accounts.json'), 'utf8')).accounts;
const keys = { ck: process.env.TUMBLR_CONSUMER_KEY || '', cs: process.env.TUMBLR_CONSUMER_SECRET || '', tk: process.env.TUMBLR_TOKEN || '', ts: process.env.TUMBLR_TOKEN_SECRET || '' };
const blog = process.env.TUMBLR_BLOG || BLOG;
let dry = process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run');
const hasKeys = Object.values(keys).every(Boolean);
if (!hasKeys) { console.log('Clés Tumblr absentes : mode essai.'); dry = true; }
const shareNow = process.env.SHARE_NOW === 'true';
const save = () => { if (!dry) fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n'); };
const tb = createTumblr({ ...keys, blog });

if (dry && hasKeys) {
  const u = await tb.userInfo();
  const mine = (u?.user?.blogs || []).map(b => b.name);
  console.log(`Authentification Tumblr OK : ${mine.length} blogue(s), ${mine.includes(blog.split('.')[0]) ? blog + ' accessible' : 'BLOGUE ' + blog + ' INTROUVABLE'}.`);
}

const state = JSON.parse(fs.readFileSync(STATE, 'utf8')); state.sent ||= {};
if (!state.liveSince) { state.liveSince = new Date().toISOString(); console.log(`Mise en service : ${state.liveSince} (rien d'antérieur ne sera publié).`); }

const xml = await (await fetch(process.env.FEED_URL || 'https://le-radar.ca/feed.xml', { signal: AbortSignal.timeout(30000) })).text();
const items = parseFeed(xml); if (!items.length) throw new Error('feed.xml vide');
const repeated = markImages(items);
const pl = plan(items, state.sent, { network: 'tumblr', liveSince: state.liveSince, accounts: ACCOUNTS });
const { limits, status } = pl;
console.log(`Tumblr ${blog} : ${status.hour}/${limits.perHour} cette heure, ${status.day}/${limits.perDay} sur 24 h (poids horaire ${limits.weight}, rodage ×${limits.ramp}) · ${pl.now.length} maintenant, ${pl.hold.length} au prochain passage, ${pl.skip.length} sauté(s).`);
for (const it of pl.skip) { console.log(`Sauté (plafond ou variété, jamais rattrapé) : [${it.source}] ${it.id}`); if (!dry) state.sent[it.id] = { at: new Date().toISOString(), skipped: 'cap', source: it.source }; }
let todo = pl.now.map(it => ({ id: it.id }));
if (shareNow) {
  const pool = freshCandidates(items, state.sent, { liveSince: state.liveSince });
  const best = [pool.filter(p => p.img && !p.imgDropped), pool].find(l => l.length) || [];
  todo = status.dayLeft && best.length ? [{ id: best[Math.floor(Math.random() * best.length)].id, shareNow: true }] : [];
}
if (!todo.length) { save(); console.log('Rien de frais à publier.'); process.exit(0); }

const posted = dry ? new Set() : await tb.recentLinks();
const used = new Map(); let n = 0;
for (const t of todo) {
  if (n && !dry) await new Promise(r => setTimeout(r, jitterMs(limits.gapSec)));
  const it = items.find(i => i.id === t.id);
  const im = await resolveImage(it, { used, repeated });
  const text = buildTumblrText(it, ACCOUNTS, { credit: im?.credit, photo: !!im }), lang = detectLang(it);
  const body = npfBody(it, text, { image: im, lang });
  console.log(`\n--- ${++n}. [${it.source}] ${lang} · image ${im ? im.url : 'AUCUNE'} · étiquettes ${body.tags}\n${text}`);
  if (dry) continue;
  if (posted.has(it.link)) { console.log('Déjà sur Tumblr (vérifié dans le blogue) : noté, pas republié.'); state.sent[it.id] = { at: new Date().toISOString(), dedup: true }; save(); continue; }
  const p = await tb.post(body);
  state.sent[it.id] = { at: new Date().toISOString(), source: it.source, k: titleKey(it), id: p.id, url: p.url, ...(t.shareNow ? { shareNow: true } : {}) };
  save();
  console.log(`→ Tumblr : ${p.url}`);
}
for (const [id, s] of Object.entries(state.sent)) if (Date.now() - new Date(s.at) > 30 * 864e5) delete state.sent[id];
save();
console.log(`\n${dry ? 'ESSAI' : 'RÉEL'} terminé.`);

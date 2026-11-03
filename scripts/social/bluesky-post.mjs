#!/usr/bin/env node
// Bot Bluesky du Radar : publie les articles FRAIS du flux à mesure qu'ils sont moissonnés
// (≤ 24 h, jamais avant la mise en service = state.liveSince : aucun rattrapage), une seule fois,
// espacés (≤ perRun par passage, gapSec entre deux). Plafond bluesky de rate-limit.mjs (10/h,
// 150/24 h glissantes) ; au-delà, sélection comme X (variété ≤ 2/source, photo, extrait, @),
// le surplus est SAUTÉ (jamais remis en file). Idempotent : data/bluesky-sent.json + derniers
// posts du compte. Déclenché par le Worker le-radar-news-trigger (:05/:35) + cron de secours.
// Sans BLUESKY_APP_PASSWORD : essai. SHARE_NOW=true : un article frais au hasard, tout de suite.
import fs from 'node:fs';
import path from 'node:path';
import { parseFeed, markImages, stripUtm, siteLink } from './lib.mjs';
import { resolveImage } from './image-resolve.mjs';
import { buildBskyText, graphemes, detectLang, postRecord, facets, BSKY_LIMIT } from './bluesky.mjs';
import { createBluesky } from './channels/bluesky.mjs';
import { plan, freshCandidates, titleKey } from './rate-limit.mjs';
import { jitterMs } from './schedule.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const STATE = path.join(ROOT, 'data/bluesky-sent.json');
const ACCOUNTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/social/bluesky-accounts.json'), 'utf8')).accounts;
const handle = process.env.BLUESKY_HANDLE || 'le-radar.bsky.social', password = process.env.BLUESKY_APP_PASSWORD || '';
let dry = process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run');
if (!password) { console.log('BLUESKY_APP_PASSWORD absent : mode essai.'); dry = true; }
const shareNow = process.env.SHARE_NOW === 'true';
const save = () => { if (!dry) fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n'); };

const state = JSON.parse(fs.readFileSync(STATE, 'utf8')); state.sent ||= {};
if (!state.liveSince) { state.liveSince = new Date().toISOString(); console.log(`Mise en service : ${state.liveSince} (rien d'antérieur ne sera publié).`); }

const xml = await (await fetch(process.env.FEED_URL || 'https://le-radar.ca/feed.xml', { signal: AbortSignal.timeout(30000) })).text();
const items = parseFeed(xml); if (!items.length) throw new Error('feed.xml vide');
const repeated = markImages(items);
const pl = plan(items, state.sent, { network: 'bluesky', liveSince: state.liveSince, accounts: ACCOUNTS });
const { limits, status } = pl;
console.log(`Bluesky ${handle} : ${status.hour}/${limits.perHour} cette heure, ${status.day}/${limits.perDay} sur 24 h (poids horaire ${limits.weight}, rodage ×${limits.ramp}) · ${pl.now.length} maintenant, ${pl.hold.length} au prochain passage, ${pl.skip.length} sauté(s) (doublon).`);
for (const it of pl.skip) { console.log(`Sauté (quasi-doublon) : [${it.source}] ${it.id}`); if (!dry) state.sent[it.id] = { at: new Date().toISOString(), skipped: 'dup', source: it.source }; }
let todo = pl.now.map(it => ({ id: it.id }));
if (shareNow) {
  const pool = freshCandidates(items, state.sent, { liveSince: new Date(0).toISOString() });
  const best = [pool.filter(p => p.img && !p.imgDropped), pool].find(l => l.length) || [];
  todo = status.dayLeft && best.length ? [{ id: best[Math.floor(Math.random() * best.length)].id, shareNow: true }] : [];
}
const shareUrl = (process.env.SHARE_URL || '').trim();
const pickUrl = () => { const it = items.find(i => i.link === stripUtm(shareUrl) || i.id === shareUrl); if (!it) throw new Error(`SHARE_URL absent du flux : ${shareUrl}`); return it; };
if (shareNow && shareUrl) todo = [{ id: pickUrl().id, shareNow: true }]; // article imposé : un seul post, hors plafond
if (!todo.length) { save(); process.exit(0); }

const bs = createBluesky({ handle, password });
let posted = new Set(); const dids = new Map();
if (!dry) {
  await bs.login(); posted = await bs.recentLinks();
  for (const a of ACCOUNTS) { const h = a.handle.replace(/^@/, '').toLowerCase(), d = await bs.resolve(h); if (d) dids.set(h, d); }
}
const used = new Map(); let n = 0;
for (const t of todo) {
  if (n && !dry) await new Promise(r => setTimeout(r, jitterMs(limits.gapSec))); // espacement, pas de rafale
  const it = items.find(i => i.id === t.id);
  if (!it) { console.log(`::warning::${t.id} absent du flux, non publié.`); if (!dry) state.sent[t.id] = { at: new Date().toISOString(), skipped: 'absent du flux' }; continue; }
  const im = await resolveImage(it, { used, repeated });
  const text = buildBskyText(it, ACCOUNTS, { credit: im?.credit, photo: !!im }), lang = detectLang(it);
  if (!text) { console.log(`Texte refusé (nom interdit) : ${it.id}`); continue; }
  console.log(`\n--- ${++n}. [${it.source}] ${graphemes(text)}/${BSKY_LIMIT} graphèmes · ${lang} · image ${im ? im.url : 'AUCUNE'} · facettes ${facets(text).length}\n${text}`);
  if (dry) continue;
  if (posted.has(it.link) || posted.has(siteLink(it))) { console.log('Déjà sur Bluesky (vérifié dans le compte) : noté, pas republié.'); state.sent[it.id] = { at: new Date().toISOString(), dedup: true }; save(); continue; }
  const thumb = await bs.uploadImage(im.url); // échec = erreur : jamais de carte sans l'image du Radar
  const rec = postRecord({ text, lang, dids, card: { uri: siteLink(it), title: it.bare || it.title, description: it.desc?.slice(0, 300), thumb } });
  const p = await bs.post(rec);
  state.sent[it.id] = { at: new Date().toISOString(), source: it.source, k: titleKey(it), uri: p.uri, url: p.url, ...(t.shareNow ? { shareNow: true } : {}) };
  save();
  console.log(`→ Bluesky : ${p.url}`);
}
for (const [id, s] of Object.entries(state.sent)) if (Date.now() - new Date(s.at) > 30 * 864e5) delete state.sent[id];
save();
console.log(`\n${dry ? 'ESSAI' : 'RÉEL'} terminé.`);

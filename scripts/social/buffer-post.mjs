#!/usr/bin/env node
// Bot social du Radar : feed.xml → file Buffer (X). Sans BUFFER_API_KEY : mode essai, sortie 0.
// Usage : node scripts/social/buffer-post.mjs [--dry-run] [--feed fichier.xml]
import fs from 'node:fs';
import path from 'node:path';
import { parseFeed, markImages, buildText, buildXText, selectItems, selectDaily, freeSlots, DAILY_SLOTS, xlen, slotsToday, refreshPhotoLine, QUEUE_MAX, MAX_AGE_H, stripUtm, siteLink } from './lib.mjs';
const inText = (t, i) => !!t && (t.includes(i.link) || t.includes(siteLink(i)));
import { resolveImage, mediaForNetwork, isMediaRefusal } from './image-resolve.mjs';
import { createRequire as _cr } from 'node:module';
const { wikimediaThumbUrl } = _cr(import.meta.url)('../jpeg-facebook-safe.js');
import { createXBuffer, AuthError } from './channels/x-buffer.mjs';
import { withHook } from './ai-hook.mjs';
import { volumeFor, torontoDay, mentionLedger, accountsForPost, mentionedIn, noteMention, POLICY } from './policy.mjs';

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
    console.log('Horaire du canal :', JSON.stringify(await channel.schedule()));
    queued = await channel.queued();
  }
} catch (e) { if (e instanceof AuthError) { console.error(`::error::${e.message}`); process.exit(1); } throw e; }

// Crédit à jour à la publication : chaque post en file dont l'article est au flux reprend le crédit
// ACTUEL du site (figcaption du flux, même fonction que les autres bots) ; editPost si différent.
if (channel && process.env.REFRESH_CREDITS !== 'false') {
  for (const p of queued) {
    const it = items.find(i => inText(p.text, i)); if (!it) continue;
    const r = refreshPhotoLine(p.text, it, p.assets?.[0]?.source || '');
    if (!r || r === p.text) continue;
    if (Date.parse(p.dueAt) - Date.now() < 10 * 60e3) { console.log(`Crédit : ${p.id} trop proche, intact`); continue; }
    console.log(`Crédit rafraîchi ${p.id} : ${p.text.split('\n').pop()} → ${r.split('\n').pop()}`);
    if (!dry) { await channel.editText(p.id, r); p.text = r; const s = Object.values(state.sent).find(v => v.postId === p.id); if (s) s.credit = it.credit; }
  }
}
const byPost = new Map(Object.values(state.sent).filter(s => s.postId).map(s => [s.postId, s.source]));
const queuedSources = queued.map(p => byPost.get(p.id) || items.find(i => inText(p.text, i))?.source).filter(Boolean);
const maxNew = parseInt(process.env.MAX_NEW || '', 10);
const slots = Math.min(Math.max(0, QUEUE_MAX - queued.length), maxNew > 0 ? maxNew : QUEUE_MAX);
console.log(`Flux : ${items.length} items · file actuelle : ${queued.length} · places : ${slots}`);
const maxAgeH = parseInt(process.env.MAX_AGE_H || '', 10) || MAX_AGE_H;
// SLOT_TIMES="07:30,09:00,…" : programme aujourd'hui à ces heures (America/Toronto) au lieu de l'horaire Buffer.
// DAILY=true (cron nocturne) : veille + classement, créneaux fixes du jour (jamais l'horaire Buffer).
const daily = process.env.DAILY === 'true';
// EVENING=true (cron ≈ 21 h Toronto) : remplit dès la veille les créneaux du lendemain (8 h 30 → 21 h).
// Les passes de nuit restent en secours : freeSlots écarte les créneaux déjà pris, aucun doublon.
const evening = daily && process.env.EVENING === 'true';
// Volume réduit (policy.json, 14 jours) : 5 créneaux/jour au lieu de 10, et jamais plus de `perDay` programmés pour le jour visé
// (file existante comprise). Fin de la période : retour automatique aux 10 créneaux de base.
const targetT = Date.now() + (evening ? 864e5 : 0), reduced = daily && !process.env.SLOT_TIMES ? volumeFor('x', targetT) : null;
const times = process.env.SLOT_TIMES ? process.env.SLOT_TIMES.split(',').map(x => x.trim()).filter(Boolean) : daily ? (reduced ? POLICY.volume.xSlots : DAILY_SLOTS) : null;
const dues = times ? freeSlots(slotsToday(times, { dayOffset: evening ? 1 : 0 }), queued.map(p => p.dueAt)) : null;
const onTargetDay = reduced ? queued.filter(p => torontoDay(Date.parse(p.dueAt)) === torontoDay(targetT)).length : 0;
const dayLeft = reduced ? Math.max(0, reduced.perDay - onTargetDay) : Infinity;
const want = dues ? Math.min(slots, dues.length, dayLeft) : slots;
if (reduced) console.log(`Volume réduit actif jusqu'au ${reduced.until} : ${reduced.perDay}/jour sur X, ${onTargetDay} déjà en file pour le ${torontoDay(targetT)}, ${want} à ajouter.`);
const ledger = mentionLedger({ sent: state.sent, queued, accounts: ACCOUNTS }); // ≤ 1 mention de média par jour sur X
const sentIds = new Set(Object.keys(state.sent));
// SHARE_NOW=true : UN article au hasard (récent, ni envoyé ni en file, photo réelle et source hors file si possible), publié tout de suite.
// SHARE_URL : cet article précis (même article sur tous les réseaux), avec SHARE_NOW.
const shareNow = process.env.SHARE_NOW === 'true';
const shareUrl = (process.env.SHARE_URL || '').trim();
const pickUrl = () => { const it = items.find(i => (i.link || '').replace(/\/+$/, '') === stripUtm(shareUrl).replace(/\/+$/, '') || i.id === shareUrl); if (!it) throw new Error(`SHARE_URL absent du flux : ${shareUrl}`); return it; };
const sel = shareNow && shareUrl ? [pickUrl()] : shareNow ? (() => {
  const qs = new Set(queuedSources), qt = queued.map(p => p.text || '');
  const pool = items.filter(i => !sentIds.has(i.id) && Date.now() - i.date <= maxAgeH * 3600e3 && !qt.some(t => inText(t, i)));
  const best = [p => p.img && !p.imgDropped && !qs.has(p.source), p => !qs.has(p.source), p => p.img && !p.imgDropped, () => true]
    .map(f => pool.filter(f)).find(l => l.length) || [];
  return best.length ? [best[Math.floor(Math.random() * best.length)]] : [];
})() : daily ? (() => {
  const base = { sentIds, queuedSources, accounts: ACCOUNTS, maxAgeH, evening };
  if (!reduced) return selectDaily(items, { ...base, slots: want });
  // Les plus solides d'abord : photo du flux, une seule par source ; on complète (≥ minPerDay) avec les moins solides seulement si besoin.
  const strong = selectDaily(items, { ...base, slots: want, perSource: reduced.perSource, minPhoto: 1 });
  const need = Math.min(want, Math.max(0, reduced.minPerDay - onTargetDay)) - strong.length;
  if (need <= 0) return strong;
  const used = new Set([...sentIds, ...strong.map(i => i.id)]);
  return [...strong, ...selectDaily(items, { ...base, sentIds: used, slots: need, perSource: reduced.perSource, queuedSources: [...queuedSources, ...strong.map(i => i.source)] })];
})()
  : selectItems(items, { sentIds, queuedSources, slots: want, maxAgeH });
if (dues) console.log(`Créneaux libres aujourd'hui : ${dues.length} · mode ${daily ? 'nocturne (veille)' : 'manuel'}`);

const used = new Map(); let n = 0;
for (const it of sel) {
  const im = await resolveImage(it, { used, repeated });
  if (!im) { console.log(`::warning::Sans image du site, non publié : ${it.id}`); continue; }
  const pub = await mediaForNetwork(im.url, 'x', { thumb: wikimediaThumbUrl });
  if (!pub) { console.log(`::warning::Image inaccessible ou trop lourde, non ajoutée à Buffer : ${im.url} (${it.id})`); continue; }
  im.url = pub.url;
  await withHook(it);
  const dueAt = dues && !shareNow ? dues[n] : undefined;
  const day = torontoDay(dueAt ? Date.parse(dueAt) : Date.now());
  const text = buildXText(it, accountsForPost(it, ACCOUNTS, ledger, day), { credit: im?.credit, photo: !!im, ai: true });
  if (!text) { console.log(`Texte refusé (nom interdit) : ${it.id}`); continue; }
  const mentions = mentionedIn(text, ACCOUNTS); for (const h of mentions) noteMention(ledger, day, h);
  console.log(`\n--- ${++n}.${dueAt ? ' ' + new Date(dueAt).toLocaleString('fr-CA', { timeZone: 'America/Toronto' }) : ''} [${it.source}] ${xlen(text)} car. · image ${im ? im.origin + ' ' + im.url : 'AUCUNE'}\n${text}`);
  if (dry) continue;
  try {
    const post = await channel.add({ text, image: im?.url, dueAt, now: shareNow });
    state.sent[it.id] = { at: new Date().toISOString(), source: it.source, postId: post.id, dueAt: post.dueAt || null, image: im?.url || null, credit: im ? (im.credit || it.source) : null, ...(mentions.length ? { mention: mentions } : {}), ...(shareNow ? { shareNow: true, link: post.externalLink || null } : {}) };
    fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
    console.log(`→ Buffer : ${post.id} (${shareNow ? 'publication immédiate ' + (post.status || '') + ' ' + (post.externalLink || '') : post.dueAt || 'heure auto'})`);
  } catch (e) {
    if (e instanceof AuthError) { console.error(`::error::${e.message}`); process.exit(1); }
    if (isMediaRefusal(e)) { console.log(`::warning::Image refusée par Buffer, article sauté : ${e.message}`); continue; }
    throw e;
  }
}
// Purge de l'état > 30 jours (le flux ne garde que 50 items).
for (const [id, s] of Object.entries(state.sent)) if (Date.now() - new Date(s.at) > 30 * 864e5) delete state.sent[id];
if (!dry) fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
console.log(`\n${dry ? 'ESSAI' : 'RÉEL'} : ${sel.length} publication(s) ${dry ? 'prévues' : 'ajoutées'}, ${new Set(sel.map(s => s.source)).size} source(s).`);

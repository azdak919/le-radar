#!/usr/bin/env node
// Bot Mastodon du Radar (@leradar@piaille.fr) : mêmes règles que Bluesky. Tous les articles FRAIS
// du flux (≤ 24 h, après state.liveSince), une seule fois, sans limite par source : une même
// source est étalée (spread), jamais sautée ; rien la nuit (posting-windows.json) ; rodage et
// plafond mastodon de rate-limit.mjs (règles de piaille.fr). Image = celle du site
// (image-resolve.mjs) ; sans image, l'article attend le passage suivant (jamais publié sans).
// Idempotent : data/mastodon-sent.json + derniers statuts publics + Idempotency-Key.
// Sans MASTODON_TOKEN : essai. SHARE_NOW=true : un article frais, tout de suite.
import fs from 'node:fs';
import path from 'node:path';
import { parseFeed, markImages, stripUtm, siteLink, buildText, LIMITS, detectLang } from './lib.mjs';
import { resolveImage } from './image-resolve.mjs';
import { createMastodon, idemKey } from './channels/mastodon.mjs';
import { plan, freshCandidates, titleKey } from './rate-limit.mjs';
import { jitterMs } from './schedule.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const STATE = path.join(ROOT, 'data/mastodon-sent.json');
const instance = process.env.MASTODON_INSTANCE || 'https://piaille.fr', token = process.env.MASTODON_TOKEN || '';
const acct = process.env.MASTODON_ACCT || 'leradar';
let dry = process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run');
if (!token) { console.log('MASTODON_TOKEN absent : mode essai.'); dry = true; }
const shareNow = process.env.SHARE_NOW === 'true';
const save = () => { if (!dry) fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n'); };
const len = s => [...String(s).replace(/https?:\/\/\S+/g, 'x'.repeat(23))].length; // Mastodon : lien = 23
export const camelTag = s => { const w = String(s || '').replace(/[’'`-]/g, ' ').split(/[^\p{L}\p{N}]+/u).filter(Boolean); return w.length ? '#' + w.map(x => x[0].toUpperCase() + x.slice(1)).join('') : ''; };
/** 3 ou 4 mots-clics CamelCase : #PresseÉtudiante #Québec #<Média> + sujet (1re catégorie). */
export const mastoTags = it => [...new Set(['#PresseÉtudiante', '#Québec', camelTag(it.source), camelTag((it.categories || [])[0])].filter(t => t.length > 2))].join(' ');
export const buildMastoText = (it, { credit = '', photo = true } = {}) => { const tags = mastoTags(it); const t = buildText(it, [], LIMITS.mastodon - len(tags) - 2, { credit, photo, len, link: true }); return t && `${t}\n\n${tags}`; };

const state = JSON.parse(fs.readFileSync(STATE, 'utf8')); state.sent ||= {};
if (!state.liveSince) { state.liveSince = new Date().toISOString(); console.log(`Mise en service : ${state.liveSince} (rien d'antérieur ne sera publié).`); }

const xml = await (await fetch(process.env.FEED_URL || 'https://le-radar.ca/feed.xml', { signal: AbortSignal.timeout(30000) })).text();
const items = parseFeed(xml); if (!items.length) throw new Error('feed.xml vide');
const repeated = markImages(items);
const pl = plan(items, state.sent, { network: 'mastodon', liveSince: state.liveSince, accounts: [] });
const { limits, status } = pl;
console.log(`Mastodon @${acct} : ${status.hour}/${limits.perHour} cette heure, ${status.day}/${limits.perDay} sur 24 h (poids horaire ${limits.weight}, rodage ×${limits.ramp}) · ${pl.now.length} maintenant, ${pl.hold.length} au prochain passage, ${pl.skip.length} sauté(s) (doublon).`);
for (const it of pl.skip) { console.log(`Sauté (quasi-doublon) : [${it.source}] ${it.id}`); if (!dry) state.sent[it.id] = { at: new Date().toISOString(), skipped: 'dup', source: it.source }; }
let todo = pl.now.map(it => ({ id: it.id }));
if (shareNow) {
  const pool = freshCandidates(items, state.sent, { liveSince: new Date(0).toISOString() });
  const best = pool.filter(p => p.img && !p.imgDropped);
  todo = status.dayLeft && best.length ? [{ id: best[Math.floor(Math.random() * best.length)].id, shareNow: true }] : [];
}
const shareUrl = (process.env.SHARE_URL || '').trim();
if (shareNow && shareUrl) { const it = items.find(i => i.link === stripUtm(shareUrl) || i.id === shareUrl); if (!it) throw new Error(`SHARE_URL absent du flux : ${shareUrl}`); todo = [{ id: it.id, shareNow: true }]; }
if (!todo.length) { save(); console.log('Rien de frais à publier.'); process.exit(0); }

const md = createMastodon({ instance, token, acct });
const posted = dry ? new Set() : await md.recentLinks();
const used = new Map(); let n = 0;
for (const t of todo) {
  if (n && !dry) await new Promise(r => setTimeout(r, jitterMs(limits.gapSec)));
  const it = items.find(i => i.id === t.id);
  if (!it) { console.log(`::warning::${t.id} absent du flux.`); continue; }
  const im = await resolveImage(it, { used, repeated });
  if (!im) { console.log(`::warning::Aucune image du site pour ${it.id} : pas publié, réessai au passage suivant.`); continue; }
  const text = buildMastoText(it, { credit: im.credit, photo: true }), lang = detectLang(it);
  if (!text) { console.log(`Texte refusé (nom interdit) : ${it.id}`); continue; }
  console.log(`\n--- ${++n}. [${it.source}] ${len(text)}/${LIMITS.mastodon} · ${lang} · image ${im.url}\n${text}`);
  if (dry) continue;
  if (posted.has(it.link) || posted.has(siteLink(it))) { console.log('Déjà sur Mastodon : noté, pas republié.'); state.sent[it.id] = { at: new Date().toISOString(), dedup: true }; save(); continue; }
  const mediaId = await md.uploadImage(im.url, [it.bare || it.title, im.credit ? `Photo : ${im.credit}` : ''].filter(Boolean).join('. '));
  if (!mediaId) { console.log(`::warning::Téléversement de l'image refusé pour ${it.id} : pas publié, réessai.`); continue; }
  const p = await md.post({ status: text, mediaId, lang, key: idemKey(it.id) });
  state.sent[it.id] = { at: new Date().toISOString(), source: it.source, k: titleKey(it), id: p.id, url: p.url, ...(t.shareNow ? { shareNow: true } : {}) };
  save();
  console.log(`→ Mastodon : ${p.url}`);
}
for (const [id, s] of Object.entries(state.sent)) if (Date.now() - new Date(s.at) > 30 * 864e5) delete state.sent[id];
save();
console.log(`\n${dry ? 'ESSAI' : 'RÉEL'} terminé.`);

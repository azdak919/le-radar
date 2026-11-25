#!/usr/bin/env node
// Bot Tumblr du Radar (le-radar-ca.tumblr.com) : même règles que Bluesky. Articles FRAIS du flux
// (≤ 24 h, après state.liveSince : aucun rattrapage), une seule fois. Les posts partent dans la FILE
// native de Tumblr (state « queue ») : c'est Tumblr qui les étale, pas des rafales d'IP de CI.
// ≤ MAX_POSTS_PER_RUN (3) par passage, les plus récents d'abord, 3–5 s entre deux appels API.
// 429 / 401 / 403 : on journalise et on arrête les appels Tumblr du passage, sans échec du job.
// État (data/tumblr-sent.json) noté seulement après « 201 Created » : un raté est retenté plus tard.
// TUMBLR_ENABLED=false : pause totale (aucun appel à l'API Tumblr), p. ex. pendant un appel de compte.
// DRY_RUN=true : vérifie l'authentification (/v2/user/info) sans publier. Sans clés : essai.
import fs from 'node:fs';
import path from 'node:path';
import { parseFeed, markImages, stripUtm, siteLink } from './lib.mjs';
import { resolveImage } from './image-resolve.mjs';
import { buildTumblrText, npfBody, detectLang, isHaltStatus, tumblrEnabled, tumblrKeys, tumblrBlog, hasTumblrKeys, tumblrFromEnv, PAUSED_MSG } from './tumblr.mjs';
import { plan, freshCandidates, titleKey } from './rate-limit.mjs';
import { withHook } from './ai-hook.mjs';
import { gateArticleImage } from './ai-image.mjs';

if (!tumblrEnabled()) { console.log(`${PAUSED_MSG} Rien de publié ni noté.`); process.exit(0); }
const MAX_POSTS_PER_RUN = Math.max(1, Number.parseInt(process.env.MAX_POSTS_PER_RUN, 10) || 3);
const gapMs = () => 3000 + Math.floor(Math.random() * 2001); // 3–5 s entre deux appels consécutifs

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const STATE = path.join(ROOT, 'data/tumblr-sent.json');
const ACCOUNTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/social/tumblr-accounts.json'), 'utf8')).accounts;
const keys = tumblrKeys();
const blog = tumblrBlog();
let dry = process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run');
const hasKeys = hasTumblrKeys();
if (!hasKeys) { console.log('Clés Tumblr absentes : mode essai.'); dry = true; }
const shareNow = process.env.SHARE_NOW === 'true';
const save = () => { if (!dry) fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n'); };
const tb = tumblrFromEnv(process.env, { gapMs });
let halted = false;
/** 429/401/403 : arrêt des appels Tumblr du passage (sans faire échouer le job). Autre erreur : rejetée. */
const halt = (e, what) => {
  if (!isHaltStatus(e?.status)) throw e;
  halted = true;
  console.log(`::error::Tumblr ${e.status} pendant ${what} : arrêt des appels Tumblr pour ce passage (${e.message}).`);
};

if (dry && hasKeys) {
  try {
    const u = await tb.userInfo();
    const mine = (u?.user?.blogs || []).map(b => b.name);
    console.log(`Authentification Tumblr OK : ${mine.length} blogue(s), ${mine.includes(blog.split('.')[0]) ? blog + ' accessible' : 'BLOGUE ' + blog + ' INTROUVABLE'}.`);
  } catch (e) { halt(e, 'la vérification d\'authentification'); process.exit(0); }
}

const state = JSON.parse(fs.readFileSync(STATE, 'utf8')); state.sent ||= {};
if (!state.liveSince) { state.liveSince = new Date().toISOString(); console.log(`Mise en service : ${state.liveSince} (rien d'antérieur ne sera publié).`); }

const xml = await (await fetch(process.env.FEED_URL || 'https://le-radar.ca/feed.xml', { signal: AbortSignal.timeout(30000) })).text();
const items = parseFeed(xml); if (!items.length) throw new Error('feed.xml vide');
const repeated = markImages(items);
const pl = plan(items, state.sent, { network: 'tumblr', liveSince: state.liveSince, accounts: ACCOUNTS });
const { limits, status } = pl;
console.log(`Tumblr ${blog} : ${status.hour}/${limits.perHour} cette heure, ${status.day}/${limits.perDay} sur 24 h (poids horaire ${limits.weight}, rodage ×${limits.ramp}) · ${pl.now.length} maintenant, ${pl.hold.length} au prochain passage, ${pl.skip.length} sauté(s).`);
for (const it of pl.skip) { console.log(`Sauté (quasi-doublon) : [${it.source}] ${it.id}`); if (!dry) state.sent[it.id] = { at: new Date().toISOString(), skipped: 'dup', source: it.source }; }
let todo = pl.now.map(it => ({ id: it.id }));
if (shareNow) {
  const pool = freshCandidates(items, state.sent, { liveSince: state.liveSince });
  const best = [pool.filter(p => p.img && !p.imgDropped), pool].find(l => l.length) || [];
  todo = status.dayLeft && best.length ? [{ id: best[Math.floor(Math.random() * best.length)].id, shareNow: true }] : [];
}
const shareUrl = (process.env.SHARE_URL || '').trim();
const pickUrl = () => { const it = items.find(i => (i.link || '').replace(/\/+$/, '') === stripUtm(shareUrl).replace(/\/+$/, '') || i.id === shareUrl); if (!it) throw new Error(`SHARE_URL absent du flux : ${shareUrl}`); return it; };
if (shareNow && shareUrl) todo = [{ id: pickUrl().id, shareNow: true }]; // article imposé : un seul post, hors plafond
// Plafond du passage : les plus récents d'abord (un article imposé reste seul).
const dateOf = t => +(items.find(i => i.id === t.id)?.date || 0);
todo = todo.sort((a, b) => dateOf(b) - dateOf(a)).slice(0, MAX_POSTS_PER_RUN);
if (!todo.length) { save(); console.log('Rien de frais à publier.'); process.exit(0); }
console.log(`Passage : ${todo.length} article(s) au plus (MAX_POSTS_PER_RUN=${MAX_POSTS_PER_RUN}), état « queue ».`);

let posted = new Set();
if (!dry) try { posted = await tb.recentLinks(); } catch (e) { halt(e, 'la lecture du blogue'); save(); process.exit(0); }
const used = new Map(); let n = 0;
for (const t of todo) {
  if (halted) break;
  const it = items.find(i => i.id === t.id);
  const im = await resolveImage(it, { used, repeated });
  if (!im) { console.log(`::warning::Sans image du site, non publié : ${it.id}`); continue; }
  const gate = await gateArticleImage(it, im.url, { credit: im.credit });
  if (gate.reject) continue;
  await withHook(it);
  const text = buildTumblrText(it, ACCOUNTS, { credit: im?.credit, photo: !!im }), lang = detectLang(it);
  if (!text) { console.log(`Texte refusé (nom interdit) : ${it.id}`); continue; }
  const body = npfBody(it, text, { image: { ...im, alt: gate.alt }, lang });
  console.log(`\n--- ${++n}. [${it.source}] ${lang} · image ${im ? im.url : 'AUCUNE'} · étiquettes ${body.tags}\n${text}`);
  if (dry) continue;
  if (posted.has(it.link) || posted.has(siteLink(it))) { console.log('Déjà sur Tumblr (vérifié dans le blogue) : noté, pas republié.'); state.sent[it.id] = { at: new Date().toISOString(), dedup: true }; save(); continue; }
  let p;
  try { p = await tb.post(body); } catch (e) {
    if (isHaltStatus(e?.status)) { halt(e, `l'envoi de ${it.id}`); break; }
    console.log(`::warning::Envoi Tumblr raté (${e.message}) : ${it.id} non noté, retenté au prochain passage.`);
    continue;
  }
  if (!p.created) { console.log(`::warning::Tumblr a répondu ${p.status} (pas 201 Created) : ${it.id} non noté, retenté au prochain passage.`); continue; }
  state.sent[it.id] = { at: new Date().toISOString(), source: it.source, k: titleKey(it), id: p.id, url: p.url, state: body.state, ...(t.shareNow ? { shareNow: true } : {}) };
  save();
  console.log(`→ Tumblr (${body.state === 'queue' ? 'en file' : 'publié'}) : ${p.url}`);
}
for (const [id, s] of Object.entries(state.sent)) if (Date.now() - new Date(s.at) > 30 * 864e5) delete state.sent[id];
save();
console.log(`\n${dry ? 'ESSAI' : 'RÉEL'} terminé${halted ? ' (appels Tumblr arrêtés : voir l\'erreur plus haut)' : ''}.`);

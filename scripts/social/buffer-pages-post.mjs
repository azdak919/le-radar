#!/usr/bin/env node
// Pages Facebook et LinkedIn « LE-RADAR.ca » via Buffer (forfait gratuit). Remplit SEULEMENT les
// places libres de chaque canal (10 max), à des heures de pointe tirées au hasard (buffer-pages.mjs).
// Refus du lien/post (ex. blocage des nouvelles de Meta) : journalisé, réseau arrêté pour ce passage,
// détails écrits dans $PAGES_ISSUE_FILE (une seule issue GitHub, mise à jour par le workflow).
// Usage : node scripts/social/buffer-pages-post.mjs [--dry-run] [--feed fichier.xml]   (PAGES=facebook,linkedin)
import fs from 'node:fs';
import path from 'node:path';
import { parseFeed, markImages, QUEUE_MAX, refreshPhotoLine, stripUtm } from './lib.mjs';
import { createRequire } from 'node:module';
const { articleId } = createRequire(import.meta.url)('../../mobile/app/js/core.js');
import { resolveImage, publicMedia, isMediaRefusal } from './image-resolve.mjs';
import { createXBuffer, AuthError } from './channels/x-buffer.mjs';
import { planDues, selectForPage, buildPageText, isRejection, postMetadata } from './buffer-pages.mjs';
import { titleKey } from './rate-limit.mjs';
import { withHook } from './ai-hook.mjs';
const { jpegNeedsFacebookSanitize, facebookRelayUrl } = createRequire(import.meta.url)('../jpeg-facebook-safe.js');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const STATE = path.join(ROOT, 'data/buffer-pages-sent.json');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/social/buffer-pages.json'), 'utf8'));
const args = process.argv.slice(2);
const key = process.env.BUFFER_API_KEY || '';
let dry = args.includes('--dry-run') || process.env.DRY_RUN === 'true';
if (!key) { console.log('BUFFER_API_KEY absent : mode essai (sans lecture de la file).'); dry = true; }
const feedArg = args.includes('--feed') ? args[args.indexOf('--feed') + 1] : null;
const networks = (process.env.PAGES || 'facebook,linkedin').split(',').map(s => s.trim()).filter(n => CFG[n]);
const issueFile = process.env.PAGES_ISSUE_FILE || '';
const fixedIds = { facebook: process.env.BUFFER_FACEBOOK_CHANNEL_ID, linkedin: process.env.BUFFER_LINKEDIN_CHANNEL_ID };

/** Facebook refuse les JPEG Canva (ICC + XMP). On lui donne un JPEG ré-encodé. */
async function imageUrlForNetwork(service, url) {
  if (service !== 'facebook' || !url) return url;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; LeRadarBot/1.0; +https://le-radar.ca)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return url;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!jpegNeedsFacebookSanitize(buf)) return url;
    const relay = facebookRelayUrl(url);
    console.log(`Image JPEG refusée par Facebook (métadonnées), relais : ${relay}`);
    return relay;
  } catch (e) {
    console.log(`::warning::lecture image Facebook ${url} : ${e.message}`);
    return url;
  }
}

const xml = feedArg ? fs.readFileSync(feedArg, 'utf8')
  : await (await fetch(process.env.FEED_URL || 'https://le-radar.ca/feed.xml', { signal: AbortSignal.timeout(30000) })).text();
const items = parseFeed(xml);
if (!items.length) throw new Error('feed.xml vide ou illisible');
const repeated = markImages(items);
const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
const save = () => { if (!dry) fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n'); };
const problems = [];
// SHARE_NOW=true + SHARE_URL : cet article précis, publié tout de suite sur chaque Page (hors file).
const shareUrl = (process.env.SHARE_NOW === 'true' && process.env.SHARE_URL || '').trim();
const pickUrl = () => { const it = items.find(i => (i.link || '').replace(/\/+$/, '') === stripUtm(shareUrl).replace(/\/+$/, '') || i.id === shareUrl); if (!it) throw new Error(`SHARE_URL absent du flux : ${shareUrl}`); return it; };

for (const net of networks) {
  const cfg = CFG[net]; const sent = (state[net] ||= {});
  console.log(`\n===== ${net} « ${cfg.name} » · lien ${cfg.link} · ${cfg.perDay}/jour à pleine vitesse =====`);
  const ch = key ? createXBuffer({ key, service: cfg.service, channelName: cfg.name, fallbackId: fixedIds[net] || null }) : null;
  let queued = [];
  try {
    if (ch) {
      const c = await ch.context();
      console.log(`Canal ${net} : ${c.channelId} (${c.discovered ? 'découvert via channels, service ' + c.service : 'id de repli'})`);
      queued = await ch.queued();
      try {
        const bad = await ch.errored();
        if (bad.length) { const msg = `${bad.length} publication(s) ${net} en erreur dans Buffer : ` + bad.map(b => `${b.id} ${b.error?.message || ''}`.trim()).join(' ; ');
          console.log(`::warning::${msg}`); problems.push(`- **${net}** : ${msg}`); }
      } catch (e) { if (e instanceof AuthError) throw e; console.log(`(lecture des erreurs Buffer indisponible : ${e.message.slice(0, 160)})`); }
    }
  } catch (e) {
    if (e instanceof AuthError) { console.error(`::error::${e.message}`); process.exit(1); }
    console.log(`::warning::${net} : canal indisponible (${e.message.slice(0, 200)}) — réseau sauté.`); problems.push(`- **${net}** : canal indisponible — ${e.message.slice(0, 300)}`); continue;
  }
  // Crédit actuel du site (même source que X/Bluesky/Tumblr) réappliqué aux posts en file avant publication.
  if (ch && process.env.REFRESH_CREDITS !== 'false') for (const p of queued) {
    const it = items.find(i => p.text?.includes(i.link) || p.text?.includes(articleId(i.link))); if (!it) continue;
    const r = refreshPhotoLine(p.text, it, p.assets?.[0]?.source || '', 5000);
    if (!r || r === p.text || Date.parse(p.dueAt) - Date.now() < 10 * 60e3) continue;
    console.log(`Crédit rafraîchi ${net} ${p.id} : ${p.text.split('\n').pop()} → ${r.split('\n').pop()}`);
    if (!dry) { await ch.editText(p.id, r); p.text = r; }
  }
  const now = Date.now();
  const taken = [...queued.map(p => p.dueAt), ...Object.values(sent).map(s => s.dueAt || s.at)].filter(Boolean);
  const free = Math.max(0, QUEUE_MAX - queued.length);
  const dues = shareUrl ? [undefined] : planDues({ network: net, cfg, now, taken, free });
  const bySource = new Map(Object.values(sent).filter(s => s.postId).map(s => [s.postId, s.source]));
  const sel = shareUrl ? [pickUrl()] : selectForPage(items, { sent, queuedSources: queued.map(p => bySource.get(p.id)).filter(Boolean), queuedTexts: queued.map(p => p.text || ''), slots: dues.length, now, network: net });
  console.log(`File : ${queued.length}/${QUEUE_MAX} · places libres : ${free} · créneaux de pointe retenus : ${dues.length} · articles : ${sel.length}`);
  const used = new Map();
  for (let i = 0; i < sel.length; i++) {
    const it = sel[i], dueAt = dues[i];
    const im = await resolveImage(it, { used, repeated });
    if (!im) { console.log(`::warning::Sans image du site, non publié : ${it.id}`); continue; }
    if (!await publicMedia(im.url)) { console.log(`::warning::Image inaccessible ou trop lourde, non ajoutée à Buffer : ${im.url} (${it.id})`); continue; }
    const imageUrl = await imageUrlForNetwork(cfg.service, im.url);
    await withHook(it);
    const text = buildPageText(it, cfg, { credit: im?.credit, photo: !!im });
    if (/tison/i.test(text)) { console.log('Texte refusé (nom interdit) : sauté.'); continue; }
    console.log(`\n--- ${net} ${i + 1}. ${dueAt ? new Date(dueAt).toLocaleString('fr-CA', { timeZone: 'America/Toronto' }) + ' (HNE)' : 'MAINTENANT'} [${it.source}] · image ${im ? im.origin + ' ' + imageUrl : 'AUCUNE'}\n${text}`);
    if (dry) continue;
    try {
      const post = await ch.add({ text, image: imageUrl, dueAt, now: !!shareUrl, metadata: postMetadata(cfg.service) });
      sent[it.id] = { at: new Date().toISOString(), source: it.source, k: titleKey(it), postId: post.id, dueAt: post.dueAt || dueAt, ...(shareUrl ? { shareNow: true, link: post.externalLink || null } : {}) };
      save();
      console.log(`→ Buffer ${net} : ${post.id} (${post.dueAt || dueAt})`);
    } catch (e) {
      if (e instanceof AuthError) { console.error(`::error::${e.message}`); process.exit(1); }
      const why = e.message.slice(0, 400);
      if (isMediaRefusal(e)) { console.log(`::warning::${net} : image refusée par Buffer, article sauté (${why})`); continue; }
      console.log(`::warning::${net} : Buffer a refusé la publication (${why}) — arrêt de ${net} pour ce passage.`);
      problems.push(`- **${net}** : ${isRejection(why) ? 'lien ou publication refusé' : 'erreur Buffer'} pour ${it.link} — ${why}`);
      break;
    }
  }
  for (const [id, s] of Object.entries(sent)) if (now - Date.parse(s.at) > 30 * 864e5) delete sent[id];
}
save();
if (problems.length && issueFile) fs.writeFileSync(issueFile, `Dernier passage : ${new Date().toISOString()}\n\n${problems.join('\n')}\n\nSi Meta bloque les liens, régler \`link\` sur \`le-radar\` (ou retirer le lien) dans data/social/buffer-pages.json.\n`);
console.log(`\n${dry ? 'ESSAI' : 'RÉEL'} terminé${problems.length ? ` · ${problems.length} problème(s)` : ''}.`);

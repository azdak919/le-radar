#!/usr/bin/env node
// Pages Facebook et LinkedIn « LE-RADAR.ca », et Threads @le.radar.ca (éteint par défaut), via Buffer (forfait gratuit). Remplit SEULEMENT les
// places libres de chaque canal (10 max), à des heures de pointe tirées au hasard (buffer-pages.mjs).
// Refus du lien/post (ex. blocage des nouvelles de Meta) : journalisé, réseau arrêté pour ce passage,
// détails écrits dans $PAGES_ISSUE_FILE (une seule issue GitHub, mise à jour par le workflow).
// Usage : node scripts/social/buffer-pages-post.mjs [--dry-run] [--feed fichier.xml]   (PAGES=facebook,linkedin)
import fs from 'node:fs';
import path from 'node:path';
import { parseFeed, markImages, QUEUE_MAX, freePlaces, blockedMessage, reconcileSent, purgeablePosts, refreshPhotoLine, stripUtm } from './lib.mjs';
import { createRequire } from 'node:module';
import privacyGuard from '../privacy-guard.js';
const { articleId } = createRequire(import.meta.url)('../../mobile/app/js/core.js');
import { resolveImage, mediaForNetwork, isMediaRefusal } from './image-resolve.mjs';
import { createXBuffer, AuthError } from './channels/x-buffer.mjs';
import { pageConfig } from './networks/index.mjs';
import { loadFrontRanks, scorer, recentUneKeys, articleKey, bestFirst, bestSlotsFirst } from './selection.mjs';
import { planDues, selectForPage, buildPageText, buildThreadsText, threadsLen, isRejection, postMetadata } from './buffer-pages.mjs';
import { titleKey } from './rate-limit.mjs';
import { withHook } from './ai-hook.mjs';
import { gateArticleImage } from './ai-image.mjs';
const { jpegNeedsFacebookSanitize, facebookRelayUrl, wikimediaThumbUrl } = createRequire(import.meta.url)('../jpeg-facebook-safe.js');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const STATE = path.join(ROOT, 'data/buffer-pages-sent.json');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/social/buffer-pages.json'), 'utf8'));
// Sélection commune (selection.mjs) : note par article (rang de la page d'accueil, photo, extrait, fraîcheur).
const SCORE = scorer({ ranks: loadFrontRanks(path.join(ROOT, 'news.json')) });
const UNE = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data/social/une-state.json'), 'utf8')); } catch { return {}; } })();
const args = process.argv.slice(2);
const dryAll = args.includes('--dry-run') || process.env.DRY_RUN === 'true';
// Clé par réseau : Threads vit sur le compte Buffer d'Instagram (cfg.secret), les Pages sur le compte principal.
const keyFor = cfg => process.env[cfg.secret || 'BUFFER_API_KEY'] || '';
let dry = dryAll;
const feedArg = args.includes('--feed') ? args[args.indexOf('--feed') + 1] : null;
// Par défaut : tous les réseaux allumés. Un réseau éteint (enabled: false) nommé dans PAGES passe en essai seulement.
const networks = (process.env.PAGES || Object.keys(CFG).filter(n => !n.startsWith('_') && CFG[n].enabled !== false).join(',')).split(',').map(s => s.trim()).filter(n => CFG[n]);
const issueFile = process.env.PAGES_ISSUE_FILE || '';
const fixedIds = { facebook: process.env.BUFFER_FACEBOOK_CHANNEL_ID, linkedin: process.env.BUFFER_LINKEDIN_CHANNEL_ID, threads: process.env.BUFFER_THREADS_CHANNEL_ID };

/** Image vérifiée pour ce réseau au moment de l'ajout (publique, poids/pixels admis ; Facebook : JPEG sans ICC/XMP).
 * Facebook refuse les JPEG Canva (ICC + XMP) ; le relais wsrv.nl répond 404 pour Wikimedia (429 en amont) :
 * on essaie d'abord la vignette Wikimedia, puis le relais, et l'on vérifie chaque URL avant de la confier à Buffer. */
async function imageUrlForNetwork(service, url) {
  const isFb = service === 'facebook';
  // Relais JPEG pour tous les réseaux : un AVIF/WebP du miroir (ex. ebfd0e0cb64e1419.jpg, refusé par LinkedIn le 16 nov.)
  // est réencodé plutôt que confié tel quel à Buffer.
  const r = await mediaForNetwork(url, service, { thumb: wikimediaThumbUrl, relay: facebookRelayUrl, log: m => console.log(m),
    check: isFb ? (buf) => !(buf[0] === 0xff && buf[1] === 0xd8 && jpegNeedsFacebookSanitize(buf)) : null });
  if (r && r.url !== url) console.log(`Image remplacée pour ${service} : ${r.url} (${Math.round(r.bytes / 1024)} Ko, ${r.width}×${r.height})`);
  return r ? r.url : null;
}

const xml = feedArg ? fs.readFileSync(feedArg, 'utf8')
  : await (await fetch(process.env.FEED_URL || 'https://le-radar.ca/feed.xml', { signal: AbortSignal.timeout(30000) })).text();
const items = parseFeed(xml);
if (!items.length) throw new Error('feed.xml vide ou illisible');
const repeated = markImages(items);
const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
// L'état s'écrit si au moins un réseau a tourné pour de vrai (dry varie d'un réseau à l'autre).
let anyReal = false;
const save = () => { if (!dry || anyReal) fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n'); };
const problems = [];
// SHARE_NOW=true + SHARE_URL : cet article précis, publié tout de suite sur chaque Page (hors file).
const shareUrl = (process.env.SHARE_NOW === 'true' && process.env.SHARE_URL || '').trim();
const pickUrl = () => { const it = items.find(i => (i.link || '').replace(/\/+$/, '') === stripUtm(shareUrl).replace(/\/+$/, '') || i.id === shareUrl); if (!it) throw new Error(`SHARE_URL absent du flux : ${shareUrl}`); return it; };

for (const net of networks) {
  const cfg = pageConfig(net, CFG); const sent = (state[net] ||= {}); // règles du module + opérationnel du JSON
  const key = keyFor(cfg);
  dry = dryAll || !key || cfg.enabled === false;
  if (!dry) anyReal = true;
  console.log(`\n===== ${net} « ${cfg.name} » · lien ${cfg.link} · ${cfg.perDay}/jour à pleine vitesse${dry ? ' · ESSAI' : ''} =====`);
  if (!key) console.log(`${cfg.secret || 'BUFFER_API_KEY'} absent : ${net} en essai (sans lecture de la file).`);
  if (cfg.enabled === false) console.log(`${net} éteint (enabled: false) : aperçu seulement, rien n'est envoyé.`);
  const ch = key ? createXBuffer({ key, service: cfg.service, channelName: cfg.name, fallbackId: fixedIds[net] || null }) : null;
  let queued = [], errored = [];
  try {
    if (ch) {
      const c = await ch.context();
      console.log(`Canal ${net} : ${c.channelId} (${c.discovered ? 'découvert via channels, service ' + c.service : 'id de repli'})`);
      queued = await ch.queued();
      try {
        const bad = await ch.errored(); errored = bad;
        if (bad.length) { const msg = `${bad.length} publication(s) ${net} en erreur dans Buffer : ` + bad.map(b => `${b.id} ${b.error?.message || ''}`.trim()).join(' ; ');
          console.log(`::warning::${msg}`); problems.push(`- **${net}** : ${msg}`); }
      } catch (e) { if (e instanceof AuthError) throw e; console.log(`(lecture des erreurs Buffer indisponible : ${e.message.slice(0, 160)})`); }
    }
  } catch (e) {
    if (e instanceof AuthError) { console.error(`::error::${e.message}`); process.exit(1); }
    console.log(`::warning::${net} : canal indisponible (${e.message.slice(0, 200)}) — réseau sauté.`); problems.push(`- **${net}** : canal indisponible — ${e.message.slice(0, 300)}`); continue;
  }
  // Crédit actuel du site (même source que X/Bluesky/Tumblr) réappliqué aux posts en file avant publication.
  if (ch && cfg.image !== false && process.env.REFRESH_CREDITS !== 'false') for (const p of queued) {
    const it = items.find(i => p.text?.includes(i.link) || p.text?.includes(articleId(i.link))); if (!it) continue;
    const r = refreshPhotoLine(p.text, it, p.assets?.[0]?.source || '', 5000);
    if (!r || r === p.text || Date.parse(p.dueAt) - Date.now() < 10 * 60e3) continue;
    console.log(`Crédit rafraîchi ${net} ${p.id} : ${p.text.split('\n').pop()} → ${r.split('\n').pop()}`);
    if (!dry) { await ch.editText(p.id, r); p.text = r; }
  }
  const now = Date.now();
  // Plafond à 0 : les articles un à un encore programmés par ce robot sont retirés de la file Buffer.
  if (ch && !shareUrl && Number(cfg.perDay) === 0) {
    const purge = purgeablePosts(sent, queued, now);
    if (purge.length) console.log(`${net} : plafond à 0 — ${purge.length} article(s) un à un encore en file${dry ? ' (essai : rien retiré)' : ', retirés de Buffer'} : ${purge.map(x => `${x.postId} (${x.dueAt})`).join(', ')}`);
    if (!dry) for (const x of purge) {
      try { await ch.remove(x.postId); delete sent[x.articleId]; queued = queued.filter(p => p.id !== x.postId); console.log(`→ retiré de Buffer ${net} : ${x.postId}`); }
      catch (e) { if (e instanceof AuthError) { console.error(`::error::${e.message}`); process.exit(1); }
        console.log(`::warning::${net} : retrait de ${x.postId} refusé (${e.message.slice(0, 200)})`); problems.push(`- **${net}** : article un à un ${x.postId} encore en file, retrait refusé — ${e.message.slice(0, 200)}`); }
    }
    if (purge.length && !dry) save();
  }
  if (ch) { const gone = reconcileSent(sent, queued.map(p => p.id), now); if (gone.length) console.log(`${net} : ${gone.length} publication(s) à venir absentes de Buffer (supprimées) oubliées de l'état : ${gone.join(', ')}`); }
  const taken = [...queued.map(p => p.dueAt), ...Object.values(sent).map(s => s.dueAt || s.at)].filter(Boolean);
  const free = freePlaces(queued.length, errored.length);
  const blocked = blockedMessage(net, queued.length, errored.length);
  if (blocked) { console.log(`::warning::${blocked}`); problems.push(`- **${net}** : ${blocked}`); }
  const dues = shareUrl ? [undefined] : planDues({ network: net, cfg, now, taken, free });
  const bySource = new Map(Object.values(sent).filter(s => s.postId).map(s => [s.postId, s.source]));
  const inUne = recentUneKeys(UNE, cfg.service, { now });
  const picked = shareUrl ? [pickUrl()] : selectForPage(items, { sent, queuedSources: queued.map(p => bySource.get(p.id)).filter(Boolean), queuedTexts: queued.map(p => p.text || ''), slots: dues.length, now, network: net, score: SCORE, excluded: it => inUne.has(articleKey(it)) });
  // Meilleur article → meilleure heure (les heures retenues restent les mêmes, seule l'attribution change).
  const sel = shareUrl ? picked : bestFirst(picked, SCORE);
  if (!shareUrl) dues.splice(0, dues.length, ...bestSlotsFirst(dues, net));
  if (inUne.size) console.log(`${net} : ${inUne.size} article(s) parus dans La une depuis 24 h, écartés pour ce réseau`);
  console.log(`File : ${queued.length}/${QUEUE_MAX} (+${errored.length} en échec) · places libres : ${free} · créneaux de pointe retenus : ${dues.length} · articles : ${sel.length}`);
  const used = new Map();
  for (let i = 0; i < sel.length; i++) {
    const it = sel[i], dueAt = dues[i];
    // Threads : aucune image jointe (la carte d'aperçu de la fiche porte la photo).
    const withImage = cfg.image !== false;
    const im = withImage ? await resolveImage(it, { used, repeated }) : null;
    if (withImage && !im) { console.log(`::warning::Sans image du site, non publié : ${it.id}`); continue; }
    const imageUrl = withImage ? await imageUrlForNetwork(cfg.service, im.url) : null;
    if (withImage && !imageUrl) { console.log(`::warning::${net} : image inaccessible, trop lourde ou refusée par la plateforme, article sauté : ${im.url} (${it.id})`); continue; }
    const gate = withImage ? await gateArticleImage(it, imageUrl, { credit: im.credit }) : { reject: false, alt: '' };
    if (gate.reject) continue;
    await withHook(it);
    const text = cfg.service === 'threads' ? buildThreadsText(it, cfg) : buildPageText(it, cfg, { credit: im?.credit, photo: !!im });
    if (privacyGuard.containsForbiddenName(text)) { console.log('Texte refusé (nom interdit) : sauté.'); continue; }
    console.log(`\n--- ${net} ${i + 1}. ${dueAt ? new Date(dueAt).toLocaleString('fr-CA', { timeZone: 'America/Toronto' }) + ' (HNE)' : 'MAINTENANT'} [${it.source}] · note ${SCORE(it)} · image ${im ? im.origin + ' ' + imageUrl : 'AUCUNE'}\n${text}`);
    if (cfg.service === 'threads') console.log(`Sujet : ${postMetadata('threads', it).threads.topic} · ${threadsLen(text)}/500`);
    if (dry) continue;
    try {
      const post = await ch.add({ text, image: imageUrl, alt: gate.alt, dueAt, now: !!shareUrl, metadata: postMetadata(cfg.service, it) });
      sent[it.id] = { at: new Date().toISOString(), source: it.source, k: titleKey(it), postId: post.id, dueAt: post.dueAt || dueAt, image: imageUrl, ...(shareUrl ? { shareNow: true, link: post.externalLink || null } : {}) };
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
console.log(`\n${anyReal ? 'RÉEL' : 'ESSAI'} terminé${problems.length ? ` · ${problems.length} problème(s)` : ''}.`);

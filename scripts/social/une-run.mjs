#!/usr/bin/env node
// « La une du matin » (≈ 7 h 45) et « La une du soir » (≈ 19 h 30), heure de Montréal, sur six réseaux.
//  - Sélection : la une réelle du jour (scripts/social/une-lib.mjs), sans doublon entre créneaux ; le soir saute s'il n'y a rien de nouveau.
//  - Images : affiches/social-une.html rendu sans tête, portrait 4:5 1080×1350 sur tous les réseaux (story 9:16 pour Instagram,
//    préparé mais désactivé ; paysage 16:9 en aperçu seulement), matin clair, soir sombre, sans code QR.
//  - État idempotent : data/social/une-state.json (clé AAAA-MM-JJ:matin|soir, puis réseau). Une seule publication par réseau et par créneau ;
//    chaque réseau a sa propre file (un échec n'arrête pas les autres ; 3 essais au plus).
//  - DRY_RUN (défaut) : aperçus seulement, rien n'est hébergé ni publié, l'état n'est pas modifié.
// Usage : node scripts/social/une-run.mjs [--gate] [--slot auto|matin|soir] [--now ISO] [--out dossier] [--news fichier]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { POLICY } from './policy.mjs';
import { NETS, SLOTS, IMAGE_FOR, IMAGE_SIZES, formatsFor, storyEnabled, pickSports, pickRadio, moreRadio, slotAt, slotFor, slotDone, selectUne, seatBySource, buildUneAll, altText, frenchOnly } from './une-lib.mjs';
import { facets } from './bluesky.mjs';
import { createBluesky } from './channels/bluesky.mjs';
import { createMastodon, idemKey } from './channels/mastodon.mjs';
import { tumblrFromEnv, npfFromText, tumblrEnabled, PAUSED_MSG } from './tumblr.mjs';
import { createXBuffer, AuthError } from './channels/x-buffer.mjs';
import { postMetadata } from './buffer-pages.mjs';
import { moduleHashtags } from './networks/index.mjs';
import { decideInstagram, deliverInstagram, dryRunReport, imageUrl, openInstagramIssue } from './instagram.mjs';
import { reviewSocialImage } from './ai-image.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const STATE = path.join(ROOT, 'data/social/une-state.json');
const IG_STATE = path.join(ROOT, 'data/social/instagram-state.json');
const MEDIA_BRANCH = 'social-une-media';
const arg = (n, d = '') => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const rd = f => JSON.parse(fs.readFileSync(path.isAbsolute(f) ? f : path.join(ROOT, f), 'utf8'));
const tz = t => new Date(t).toLocaleString('fr-CA', { timeZone: 'America/Toronto' }) + ' (heure de Montréal)';
/** Sujet Threads de La une (un seul par publication, sans « . » ni « & »). */
export const UNE_THREADS_TOPIC = 'Médias étudiants';
/** Threads suit l'interrupteur de data/social/buffer-pages.json (enabled). */
export const threadsEnabled = () => { try { return rd('data/social/buffer-pages.json').threads?.enabled === true; } catch { return false; } };
export const CFG = POLICY.formats?.une || { publish: false, networks: [], slots: SLOTS };

/** Garde l'état court : créneaux des `days` derniers jours seulement. */
export function pruneState(state, now = Date.now(), days = 21) {
  const cut = new Date(now - days * 864e5).toISOString().slice(0, 10);
  for (const k of Object.keys(state)) if (/^\d{4}-\d{2}-\d{2}:/.test(k) && k.slice(0, 10) < cut) delete state[k];
  return state;
}
/** Le créneau doit-il tourner ? (porte légère du workflow : pas de navigateur si rien n'est dû). */
export function gate({ now = Date.now(), state = {}, forced = '', cfg = CFG, dry = false } = {}) {
  if (dry) return { due: true, slot: forced || 'auto', why: 'essai DRY_RUN : aperçus seulement' };
  if (forced && forced !== 'auto') return { due: true, slot: forced, why: 'créneau forcé (déclenchement manuel)' };
  const s = slotAt(now, cfg.slots || SLOTS);
  if (!s) return { due: false, slot: '', why: `hors des fenêtres d'envoi : ${tz(now)}` };
  const nets = (cfg.networks || []).filter(n => NETS.includes(n) && (n !== 'tumblr' || tumblrEnabled()) && (n !== 'threads' || threadsEnabled()));
  if (slotDone(state[s.key], nets)) return { due: false, slot: s.id, why: `${s.key} déjà traité` };
  return { due: true, slot: s.id, why: `${s.key} dû` };
}

// ── Hébergement des images (branche dédiée, hors de main) ────────────────────
const git = (args, cwd = ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function reachable(url, tries = 12) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) }); if (r.ok && /^image\//.test(r.headers.get('content-type') || '')) return true; } catch {}
    await new Promise(r => setTimeout(r, 5000));
  }
  return false;
}
/** Publie les images sur la branche social-une-media et renvoie leurs URL publiques (raw, figées par commit). */
export async function hostImages(images, key, repo = process.env.GITHUB_REPOSITORY || 'azdak919/le-radar') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'une-media-'));
  try {
    let fresh = false;
    try { git(['fetch', '--quiet', '--depth=1', 'origin', MEDIA_BRANCH]); git(['worktree', 'add', '--quiet', '--detach', dir, 'FETCH_HEAD']); }
    catch { fresh = true; git(['worktree', 'add', '--quiet', '--detach', dir]); git(['checkout', '--quiet', '--orphan', 'une-media-tmp'], dir); git(['rm', '-rfq', '.'], dir); }
    if (fresh) fs.writeFileSync(path.join(dir, 'README.md'), '# Images de « La une du matin » et « La une du soir »\n\nÉcrit par .github/workflows/social-une.yml. Ne pas fusionner dans main.\n');
    const [day, slot] = key.split(':'), rel = {};
    fs.mkdirSync(path.join(dir, 'une', day), { recursive: true });
    for (const [fmt, img] of Object.entries(images)) { rel[fmt] = `une/${day}/${slot}-${fmt}.jpg`; fs.copyFileSync(img.file, path.join(dir, rel[fmt])); }
    git(['add', '-A'], dir);
    git(['-c', 'user.name=Azdak', '-c', 'user.email=azdak-qc@proton.me', 'commit', '--quiet', '-s', '-m', `bot(social): images de la une ${key}`], dir);
    git(['push', '--quiet', 'origin', `HEAD:refs/heads/${MEDIA_BRANCH}`], dir);
    const sha = git(['rev-parse', 'HEAD'], dir), out = {};
    for (const [fmt, r] of Object.entries(rel)) { const u = `https://raw.githubusercontent.com/${repo}/${sha}/${r}`; if (!(await reachable(u))) throw new Error(`image ${fmt} injoignable : ${u}`); out[fmt] = u; }
    return out;
  } finally { try { git(['worktree', 'remove', '--force', dir]); } catch {} fs.rmSync(dir, { recursive: true, force: true }); }
}

// ── Publication ──────────────────────────────────────────────────────────────
async function publishOne(net, entry, env) {
  const text = entry.texts[net], img = entry.images[IMAGE_FOR[net]], size = IMAGE_SIZES[IMAGE_FOR[net]], head = text.split('\n')[0];
  if (net === 'bluesky') {
    const bs = createBluesky({ handle: env.BLUESKY_HANDLE || 'le-radar.ca', password: env.BLUESKY_APP_PASSWORD });
    await bs.login();
    if ((await bs.listPosts(30)).some(p => p.text.startsWith(head))) return { dedup: true };
    const blob = await bs.uploadImage(img); if (!blob) throw new Error('image Bluesky refusée');
    const rec = { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString(), langs: ['fr'], facets: facets(text),
      embed: { $type: 'app.bsky.embed.images', images: [{ image: blob, alt: entry.alt.slice(0, 2000), aspectRatio: size }] } };
    const p = await bs.post(rec); return { url: p.url, uri: p.uri };
  }
  if (net === 'mastodon') {
    const md = createMastodon({ instance: env.MASTODON_INSTANCE || 'https://piaille.fr', token: env.MASTODON_TOKEN, acct: env.MASTODON_ACCT || 'leradar' });
    if ((await md.listStatuses(30)).some(s => String(s.content || '').includes(head.slice(3, 40)))) return { dedup: true };
    const mediaId = await md.uploadImage(img, entry.alt); if (!mediaId) throw new Error('image Mastodon refusée');
    const p = await md.post({ status: text, mediaId, lang: 'fr', key: idemKey(`une:${entry.key}:mastodon`) });
    return { url: p.url, id: p.id };
  }
  if (net === 'tumblr') {
    const tb = tumblrFromEnv(env);
    const content = npfFromText(text, { image: { url: img, type: 'image/jpeg', ...size, alt: entry.alt }, altMax: 4096 });
    const p = await tb.post({ content, tags: entry.tumblrTags.join(','), source_url: 'https://le-radar.ca/' });
    if (!p.created) throw new Error(`Tumblr ${p.status} (pas 201 Created)`);
    return { url: p.url, id: p.id };
  }
  const pages = env.pages || {}, key = env.BUFFER_API_KEY;
  if (net === 'threads') {
    // Compte Buffer d'Instagram ; texte seul (le lien de la une devient la carte d'aperçu), un sujet.
    const th = createXBuffer({ key: env[pages.threads?.secret || 'BUFFER_INSTAGRAM_API_KEY'], service: 'threads', channelName: pages.threads?.name || 'le.radar.ca', fallbackId: env.BUFFER_THREADS_CHANNEL_ID || null });
    const post = await th.add({ text, now: true, metadata: { threads: { type: 'post', topic: UNE_THREADS_TOPIC } } });
    return { id: post.id, status: post.status || '' };
  }
  const ch = net === 'x' ? createXBuffer({ key, fallbackId: env.BUFFER_CHANNEL_ID || undefined })
    : createXBuffer({ key, service: pages[net].service, channelName: pages[net].name, fallbackId: (net === 'facebook' ? env.BUFFER_FACEBOOK_CHANNEL_ID : env.BUFFER_LINKEDIN_CHANNEL_ID) || null });
  const post = await ch.add({ text, image: img, alt: entry.alt, now: true, metadata: postMetadata(net) });
  return { id: post.id, status: post.status || '' };
}

function readIgState() {
  try { return JSON.parse(fs.readFileSync(IG_STATE, 'utf8')); } catch { return { halted: false, sent: {} }; }
}
function writeIgState(s) { fs.writeFileSync(IG_STATE, JSON.stringify(s, null, 1) + '\n'); }

/** Aperçu ou envoi Instagram. Un seul essai, clé dédiée, sans faire échouer les autres réseaux. */
async function posterAlt(model, images) {
  const fallback = altText(model);
  const file = images?.grille?.file || images?.portrait?.file;
  if (!file) return fallback;
  const buf = fs.readFileSync(file);
  const facts = [fallback, ...(model.items || []).map(i => `${i.title || ''} ${i.byline || ''}`)].join(' ');
  const r = await reviewSocialImage({ buf, width: images.grille?.width || images.portrait?.width, height: images.grille?.height || images.portrait?.height, contentType: 'image/jpeg', facts, fallbackAlt: fallback, allowReject: false });
  console.log(r.source === 'ia' ? 'IA : texte alternatif de l’affiche' : `Texte alternatif de l’affiche déterministe — ${r.reason || 'repli'}`);
  return r.alt || fallback;
}

async function instagramPass({ now, slot, text, problems = [], images, dry, alt = '' }) {
  const cfg = CFG.prepared?.instagram || {};
  const state0 = readIgState();
  const d = decideInstagram({ now, slotId: slot.id, format: 'une', cfg, state: state0, dry, env: process.env, text, problems, images: images || {}, dedupKey: `une:${slot.key}` });
  if (d.action === 'preview') {
    const report = dryRunReport(d);
    console.log('\n' + report);
    return report;
  }
  if (d.action !== 'send') { console.log(`Instagram : ${d.reason}`); return ''; }
  const result = await deliverInstagram({
    env: process.env, text, imageUrl: imageUrl(d.image?.ref), alt, state: state0,
    now: new Date(now).toISOString(), slotId: slot.id, format: 'une', dedupKey: `une:${slot.key}`,
    fileIssue: openInstagramIssue,
  });
  writeIgState(result.state || state0);
  console.log(result.action === 'sent' ? `→ instagram : ${result.id}` : `Instagram arrêté : ${result.reason}`);
  return '';
}

export function previewMarkdown(slot, sel, texts, images, { dry, reason }) {
  const L = [`## ${slot.label} (${slot.key}) — ${dry ? 'essai DRY_RUN, rien n\'est publié' : 'passage réel'}`, '', `Décision : ${reason}`, ''];
  if (sel.doubts?.length) L.push(`Doutes : ${sel.doubts.join(' ; ')}.`, '');
  for (const t of sel.translated || []) L.push(`Traduit : « ${t.from} » → « ${t.to} »`);
  if (images) for (const [f, v] of Object.entries(images)) L.push(`Image ${f} : ${path.basename(v.file)} (${v.width}×${v.height}, ${Math.round(v.bytes / 1024)} Ko, ${v.shown} article(s), ${v.sports} match(s) (${v.sportsDetail}), ${v.radio} émission(s) radio, photo ${v.photo ? 'oui' : 'non'})`);
  L.push('');
  for (const [n, v] of Object.entries(texts || {})) L.push(`### ${n} (${v.len}/${v.limit}, image ${v.image})`, '', '```text', v.text || '(aucun texte)', '```', v.problems.length ? `Problèmes : ${v.problems.join(' ; ')}` : 'Contrôles : OK', n === 'tumblr' ? `Étiquettes Tumblr : ${v.tags.join(', ')}` : '', '');
  return L.join('\n');
}

async function main() {
  const now = arg('now') === 'news' ? Date.parse(rd(arg('news', 'news.json')).updated) : arg('now') ? Date.parse(arg('now')) : Date.now(), forced = arg('slot', process.env.UNE_SLOT || 'auto');
  const dry = process.env.DRY_RUN !== 'false';
  let state = {}; try { state = rd(STATE); } catch {}
  if (process.argv.includes('--gate')) {
    const g = gate({ now, state, forced, dry });
    console.log(`Porte : ${g.why}`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `due=${g.due}\nslot=${g.slot}\n`);
    return;
  }
  const out = path.resolve(arg('out', 'une-preview')); fs.mkdirSync(out, { recursive: true });
  const slot = forced && forced !== 'auto' ? slotFor(forced, now, CFG.slots) : slotAt(now, CFG.slots);
  if (!slot) { console.log(`Hors des fenêtres d'envoi (${tz(now)}) : rien à faire.`); return; }
  const nets = (CFG.networks || []).filter(n => NETS.includes(n) && (n !== 'tumblr' || tumblrEnabled()) && (n !== 'threads' || threadsEnabled()));
  if (!tumblrEnabled() && (CFG.networks || []).includes('tumblr')) console.log(PAUSED_MSG);
  let entry = state[slot.key];
  if (!dry && slotDone(entry, nets)) { console.log(`${slot.key} : déjà traité.`); return; }
  let sel, texts, images, reason;
  if (entry?.texts && !dry) {
    reason = 'reprise du créneau figé (réessai des réseaux en échec).'; sel = { doubts: [] };
  } else {
    // Toute la fenêtre d'abord : la traduction peut écarter des titres, les sièges se comptent ensuite.
    sel = selectUne(rd(arg('news', 'news.json')), slot, { now, state, max: Infinity, maxNewsAgeH: CFG.maxNewsAgeH ?? 6 });
    // Français seulement : titres et résumés anglais traduits par translate.js ; en cas d'échec, l'article est exclu.
    if (sel.items.some(x => x.lang === 'en')) {
      const { createTranslator } = await import('./une-render.mjs');
      let tr = null;
      try { tr = await createTranslator(); } catch (e) { console.log(`::warning::traduction indisponible (${String(e.message).slice(0, 120)}) : articles anglais exclus.`); }
      const fr = await frenchOnly(sel.items, tr ? tr.translate : async () => '');
      if (tr) await tr.close();
      for (const x of fr.excluded) console.log(`Exclu (anglais non traduit) : ${x.title}`);
      sel.translated = fr.kept.filter(x => x.translated).map(x => ({ from: x.originalTitle, to: x.title }));
      sel.items = fr.kept;
    }
    sel.items = seatBySource(sel.items, CFG.maxItems || 4); sel.ids = sel.items.map(x => x.id); sel.lead = sel.items[0] || null;
    if (!sel.items.length && !sel.skip) { sel.skip = true; sel.why = 'aucun article publiable en français : publication sautée'; }
    console.log(`Sélection ${slot.key} : ${sel.items.length} article(s)${sel.doubts.length ? ' ; doutes : ' + sel.doubts.join(' ; ') : ''}`);
    if (sel.skip) { reason = sel.why; fs.writeFileSync(path.join(out, `apercu-${slot.id}.md`), previewMarkdown(slot, sel, null, null, { dry, reason })); console.log(reason); if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${slot.label} : ${reason}\n`); return; }
    // Sport étudiant : résultats récents du site (sports-masthead.json) pour l'image et les textes longs ; rien si aucune donnée récente.
    let sports = { results: [], next: [] };
    try { sports = pickSports(rd(arg('sports', 'sports-masthead.json')), slot.day, { max: 16, days: 2, afterToday: slot.id === 'soir' }); } catch (e) { console.log(`::warning::résultats sportifs illisibles (${String(e.message).slice(0, 120)}) : image sans bloc sport.`); }
    console.log(`Sport étudiant : ${sports.results.length} résultat(s), ${sports.next.length} prochain(s) match(s)`);
    // Radio étudiante : émissions à venir (matin : du jour ; soir : du lendemain), tirage reproductible par date ; rien si aucune grille.
    let radio = [];
    // Une émission par station d'abord (diversité), puis la suite de la grille du jour : le gabarit en ajoute tant qu'il y a de la place.
    try { const sch = rd(arg('radio', 'radio-schedules.json')); radio = pickRadio(sch, slot, { max: 8 }); radio = [...radio, ...moreRadio(sch, slot, radio)]; } catch (e) { console.log(`::warning::grilles radio illisibles (${String(e.message).slice(0, 120)}) : image sans bloc radio.`); }
    console.log(`Radio étudiante (${slot.id}) : ${radio.length} émission(s)${radio.some(x => x.fallback) ? `, dont ${radio.filter(x => x.fallback).length} en repli (fenêtre trop peu fournie)` : ""}`);
    const model = { slot, items: sel.items, sports, radio };
    texts = buildUneAll(model, { ...(POLICY.hashtags?.maxByNetwork || {}), ...moduleHashtags() });
    const { renderImages } = await import('./une-render.mjs');
    const igCfg = CFG.prepared?.instagram || {};
    const formats = formatsFor(nets, dry, { story: storyEnabled(CFG) });
    if ((dry || igCfg.enabled === true) && !formats.includes('grille')) formats.push('grille');
    images = await renderImages(model, { outDir: out, prefix: `une-${slot.id}`, formats, optionalFormats: ['grille'] });
    if (!dry && !storyEnabled(CFG)) delete images.story; // jamais hébergée ni envoyée tant que formats.une.story.publish n’est pas true
    const bad = Object.entries(texts).filter(([n, v]) => nets.includes(n) && v.problems.length);
    if (dry) reason = 'essai (DRY_RUN) : aucun envoi.';
    else if (!CFG.publish) reason = 'publication désactivée dans data/social/policy.json (formats.une.publish = false).';
    else if (sel.doubts.length) reason = `DOUTE sur les données, rien n'est publié : ${sel.doubts.join(' ; ')}.`;
    else if (bad.length) reason = `contrôle de texte échoué (${bad.map(([n, v]) => n + ' : ' + v.problems.join(', ')).join(' | ')}), rien n'est publié.`;
    else reason = 'publication réelle autorisée.';
    const md = previewMarkdown(slot, sel, texts, images, { dry, reason });
    fs.writeFileSync(path.join(out, `apercu-${slot.id}.md`), md);
    for (const [n, v] of Object.entries(texts)) fs.writeFileSync(path.join(out, `texte-${slot.id}-${n}.txt`), (v.text || '') + '\n');
    let poster = await posterAlt(model, images);
    fs.writeFileSync(path.join(out, `une-${slot.id}.json`), JSON.stringify({ at: new Date(now).toISOString(), reason, slot, ids: sel.ids, translated: sel.translated || [], alt: poster, texts, images }, null, 1));
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
    console.log(`\n=== ${slot.label} : ${reason}`);
    for (const [n, v] of Object.entries(texts)) console.log(`\n[${n}] ${v.len}/${v.limit}${v.problems.length ? ' PROBLÈMES : ' + v.problems.join(', ') : ''}\n${v.text}`);
    if (dry) {
      const igReport = await instagramPass({ now, slot, text: texts.instagram?.text || '', problems: texts.instagram?.problems || [], images, dry: true, alt: poster });
      if (igReport) {
        fs.writeFileSync(path.join(out, `instagram-${slot.id}.md`), igReport);
        if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, igReport + '\n');
      }
    }
    if (reason !== 'publication réelle autorisée.') return;
    // Figer le créneau AVANT tout envoi : les réessais reprennent exactement les mêmes textes et images.
    let urls;
    try { urls = await hostImages(images, slot.key); }
    catch (e) {
      console.log(`::warning::hébergement des images impossible (${String(e.message).slice(0, 200)}) : repli sur la photo de la une.`);
      const lead = sel.items[0].siteImage || 'https://le-radar.ca/assets/og-cover.png'; urls = { portrait: lead };
      poster = altText(model);
    }
    entry = state[slot.key] = { key: slot.key, at: new Date().toISOString(), ids: sel.ids, texts: Object.fromEntries(Object.entries(texts).map(([n, v]) => [n, v.text])),
      tumblrTags: texts.tumblr.tags, alt: poster, images: urls, nets: {} };
    fs.writeFileSync(STATE, JSON.stringify(pruneState(state, now), null, 1) + '\n');
  }
  if (!entry?.texts) return;
  entry.key ||= slot.key; entry.nets ||= {};
  const env = { ...process.env, pages: rd('data/social/buffer-pages.json') };
  let published = 0;
  for (const n of nets) {
    const d = entry.nets[n];
    if (d?.at && !d.failed) { console.log(`${n} : déjà publié pour ${slot.key}.`); continue; }
    if ((d?.attempts || 0) >= 3) { console.log(`::warning::${n} : 3 échecs pour ${slot.key}, abandon.`); continue; }
    try {
      const r = await publishOne(n, entry, env);
      entry.nets[n] = { at: new Date().toISOString(), ...r }; published++;
      console.log(`→ ${n} : ${r.dedup ? 'déjà présent dans le compte, noté' : r.url || r.id}`);
    } catch (e) {
      if (e instanceof AuthError) console.log(`::warning::${n} : authentification refusée.`);
      entry.nets[n] = { failed: true, attempts: (d?.attempts || 0) + 1, error: String(e.message).slice(0, 200), lastTry: new Date().toISOString() };
      console.log(`::warning::${n} : échec (${String(e.message).slice(0, 200)}), réessai au prochain passage (3 au plus).`);
    }
    fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
  }
  if (entry.texts?.instagram) await instagramPass({ now, slot, text: entry.texts.instagram, problems: [], images: entry.images || {}, dry: false, alt: entry.alt || '' });
  console.log(`\nRÉEL terminé : ${published} publication(s) pour ${slot.key}.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) await main();

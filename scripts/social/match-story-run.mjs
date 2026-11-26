#!/usr/bin/env node
// « Story match du jour » : une story 9:16 plein cadre par match étudiant du jour, sur Facebook (page) et Instagram (canal dédié).
//  - Sélection : scripts/social/match-story-lib.mjs (sports-masthead.json), universitaire d'abord, au plus formats.matchStory.max par jour,
//    jamais un match déjà commencé.
//  - Image : affiches/social-une.html, format « match-story » (affiche seule, sans liste ni radio ; logos d'équipes s'ils sont déposés).
//  - État idempotent : data/social/match-story-state.json (clé AAAA-MM-JJ:gameId, puis réseau). Une seule story par match et par réseau,
//    3 essais au plus ; un réseau en panne n'arrête pas les autres.
//  - DRY_RUN (défaut) : aperçus seulement, rien n'est hébergé ni publié, l'état n'est pas modifié.
// Usage : node scripts/social/match-story-run.mjs [--now ISO] [--out dossier] [--force] [--sports fichier]
import fs from 'node:fs';
import path from 'node:path';
import { POLICY } from './policy.mjs';
import { todaysStories, matchStoryModel, matchStoryAlt, matchKey, montrealDay, storyWindow, pruneMatchState } from './match-story-lib.mjs';
import { torontoMinutes } from './une-lib.mjs';
import { createXBuffer } from './channels/x-buffer.mjs';
import { createInstagramBuffer } from './instagram.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const STATE = path.join(ROOT, 'data/social/match-story-state.json');
const IG_STATE = path.join(ROOT, 'data/social/instagram-state.json');
const arg = (n, d = '') => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const rd = (f) => JSON.parse(fs.readFileSync(path.isAbsolute(f) ? f : path.join(ROOT, f), 'utf8'));
export const CFG = POLICY.formats?.matchStory || { publish: false, networks: [], max: 6 };
export const NETS = ['facebook', 'instagram'];
/** « Martlets reçoit Stingers » ou « Régate : épreuve (clubs) ». */
export const label = (m) => m.kind === 'regatta' ? `Régate : ${m.event} (${m.clubs.map((c) => c.name).join(', ')})` : `${m.teams[0].name} ${m.verb} ${m.teams[1].name}`;

/** Réseaux restant à faire pour un match (déjà publié ou 3 échecs = fait). */
export function pendingNets(entry, nets = NETS) {
  return nets.filter((n) => { const d = entry?.nets?.[n]; return !(d?.at && !d.failed) && (d?.attempts || 0) < 3; });
}

async function publishStory(net, image, alt, env) {
  if (net === 'facebook') {
    const fb = (env.pages || {}).facebook;
    if (!env.BUFFER_API_KEY || !fb) return null;
    const ch = createXBuffer({ key: env.BUFFER_API_KEY, service: fb.service, channelName: fb.name, fallbackId: env.BUFFER_FACEBOOK_CHANNEL_ID || null });
    const post = await ch.add({ text: '', image, alt, now: true, metadata: { facebook: { type: 'story' } } });
    return { id: post.id, status: post.status || '' };
  }
  if (net === 'instagram') {
    let halted = false; try { halted = !!rd(IG_STATE).halted; } catch {}
    if ((POLICY.formats?.une?.prepared?.instagram || {}).enabled !== true || halted) return null;
    const ig = createInstagramBuffer(env); if (!ig) return null;
    const post = await ig.add({ story: true, type: 'story', text: '', image, alt, now: true });
    return { id: post.id, status: post.status || '' };
  }
  return null;
}

async function main() {
  const now = arg('now') ? Date.parse(arg('now')) : Date.now();
  const dry = process.env.DRY_RUN !== 'false', force = process.argv.includes('--force') || process.env.MATCH_STORY_FORCE === 'true';
  const out = path.resolve(arg('out', 'match-story-preview')); fs.mkdirSync(out, { recursive: true });
  const day = montrealDay(now);
  const win = storyWindow(now, CFG.window || {});
  if (!win.due && !force && !dry) { console.log(`Story match du jour : ${win.why}, rien à faire.`); return; }
  const nets = (CFG.networks || []).filter((n) => NETS.includes(n));
  let state = {}; try { state = rd(STATE); } catch {}
  // Un match déjà commencé (régates : toute la journée) n'a plus d'intérêt en story « Jour de match » (essai : tous les matchs du jour).
  const matches = todaysStories(rd(arg('sports', 'sports-masthead.json')), day, { max: CFG.max || 6, notBefore: dry ? -1 : torontoMinutes(now) });
  console.log(`Story match du jour ${day} : ${matches.length} match(s)${matches.length ? ' — ' + matches.map(label).join(', ') : ''}.`);
  if (!matches.length) return;
  const todo = matches.map((m, i) => ({ m, i, key: matchKey(m) })).filter((x) => dry || pendingNets(state[x.key], nets).length);
  if (!todo.length) { console.log('Toutes les stories du jour sont déjà publiées.'); return; }
  const { renderImages } = await import('./une-render.mjs');
  const { hostImages } = await import('./une-run.mjs');
  const env = { ...process.env, pages: rd('data/social/buffer-pages.json') };
  const summary = [`## Story match du jour — ${day} (${dry ? 'essai DRY_RUN, rien n’est publié' : 'passage réel'})`, ''];
  for (const { m, i, key } of todo) {
    const short = String(m.gameId || key.slice(11)).slice(0, 24) || `m${i}`;
    const model = matchStoryModel(m, { index: i, total: matches.length });
    const imgs = await renderImages(model, { outDir: out, prefix: `match-${short}`, formats: ['match-story'] });
    const img = imgs['match-story'], alt = matchStoryAlt(m);
    summary.push(`- ${m.sport} · ${label(m)} · ${m.when} → ${path.basename(img.file)} (${Math.round(img.bytes / 1024)} Ko${img.logos ? `, ${img.logos} logo(s)` : ''}${img.overflow ? ', DÉBORDEMENT' : ''})`);
    console.log(`Image ${key} : ${path.basename(img.file)} ; alt : ${alt}`);
    if (dry) continue;
    if (!CFG.publish) { console.log('Publication désactivée (formats.matchStory.publish = false).'); continue; }
    if (img.overflow) { console.log(`::warning::${key} : débordement de l’affiche, story non publiée.`); continue; }
    let entry = state[key];
    if (!entry?.image) {
      let urls;
      try { urls = await hostImages({ 'match-story': img }, `${day}:match-${short}`); }
      catch (e) { console.log(`::warning::${key} : hébergement impossible (${String(e.message).slice(0, 200)}), réessai au prochain passage.`); continue; }
      entry = state[key] = { key, at: new Date().toISOString(), what: label(m), image: urls['match-story'], alt, nets: {} };
      fs.writeFileSync(STATE, JSON.stringify(pruneMatchState(state, now), null, 1) + '\n');
    }
    for (const n of pendingNets(entry, nets)) {
      const d = entry.nets[n];
      try {
        const r = await publishStory(n, entry.image, entry.alt, env);
        if (!r) { console.log(`${n} : canal non configuré, story sautée.`); continue; }
        entry.nets[n] = { at: new Date().toISOString(), ...r }; console.log(`→ ${n}-story ${key} : ${r.id}`);
      } catch (e) {
        entry.nets[n] = { failed: true, attempts: (d?.attempts || 0) + 1, error: String(e.message).slice(0, 200), lastTry: new Date().toISOString() };
        console.log(`::warning::${n}-story ${key} : échec (${String(e.message).slice(0, 200)}), réessai au prochain passage (3 au plus).`);
      }
      fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
    }
  }
  fs.writeFileSync(path.join(out, 'apercu-match-story.md'), summary.join('\n') + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n') + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) await main();

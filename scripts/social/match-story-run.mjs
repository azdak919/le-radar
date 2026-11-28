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
import { createRequire } from 'node:module';
import { todaysStories, quietDayLists, planWave, waveOf, WAVES, sailingTeams, rseqVenue, matchStoryModel, matchStoryAlt, matchKey, montrealDay, pruneMatchState } from './match-story-lib.mjs';
import { torontoMinutes, bufferWhen, montrealInstant } from './une-lib.mjs';
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
export const label = (m) => m.kind === 'more' ? `${m.title || 'Aussi aujourd’hui'} : ${m.items.map((x) => (x.kind === 'resultat' ? `${x.teams[0].name} ${x.teams[0].score}-${x.teams[1].score} ${x.teams[1].name}` : x.kind === 'classement' ? `${x.teams[0].name} (${x.event})` : label(x))).join(', ')}` : m.kind === 'regatta-results' ? `Résultats : ${m.event} (${m.rows.map((r) => `${r.place}e ${r.name}`).join(', ')})` : m.kind === 'regatta' ? `Régate : ${m.event} (${m.clubs.map((c) => c.name).join(', ')})` : `${m.teams[0].name} ${m.verb} ${m.teams[1].name}`;

/** Réseaux restant à faire pour un match (déjà publié ou 3 échecs = fait). */
export function pendingNets(entry, nets = NETS) {
  return nets.filter((n) => { const d = entry?.nets?.[n]; return !(d?.at && !d.failed) && (d?.attempts || 0) < 3; });
}

async function publishStory(net, image, alt, env, when = { now: true }) {
  if (net === 'facebook') {
    const fb = (env.pages || {}).facebook;
    if (!env.BUFFER_API_KEY || !fb) return null;
    const ch = createXBuffer({ key: env.BUFFER_API_KEY, service: fb.service, channelName: fb.name, fallbackId: env.BUFFER_FACEBOOK_CHANNEL_ID || null });
    const post = await ch.add({ text: '', image, alt, ...when, metadata: { facebook: { type: 'story' } } });
    return { id: post.id, status: post.status || '' };
  }
  if (net === 'instagram') {
    let halted = false; try { halted = !!rd(IG_STATE).halted; } catch {}
    if ((POLICY.formats?.une?.prepared?.instagram || {}).enabled !== true || halted) return null;
    const ig = createInstagramBuffer(env); if (!ig) return null;
    const post = await ig.add({ story: true, type: 'story', text: '', image, alt, ...when });
    return { id: post.id, status: post.status || '' };
  }
  return null;
}

// ── TikTok : carrousel « Matchs du jour » (27 nov. 2026, Charles) ─────────────────────────────────────────────────
// Les stories TikTok ne se publient pas par Buffer, et une publication par match ferait trop pour le fil : une seule
// publication par jour, en carrousel photo, avec les affiches 9:16 des stories du jour (déjà hébergées, dans l'ordre des
// vagues : la plus populaire d'abord, voile comprise). Programmée dans Buffer pour 16 h (après les cours, 2 à 3 h avant
// les matchs du soir) au passage de la 2e vague ; passage tardif : tout de suite, jusqu'à formats.matchStory.tiktok.until.
// Aucun match : rien. Entièrement automatique (sans notification).
export const TIKTOK = { enabled: false, at: '16:00', until: '18:30', max: 10, channelName: '*', ...(CFG.tiktok || {}) };
const hmMin = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
/** Affiches du jour déjà hébergées, dans l'ordre de publication des stories. */
export function tiktokEntries(state, day, max = TIKTOK.max) {
  return Object.values(state || {}).filter((e) => e && String(e.key || '').startsWith(`${day}:`) && !String(e.key).endsWith(':tiktok') && e.image).slice(0, max);
}
/** Image du carrousel : variante TikTok (format match-tiktok, hors de l'interface de TikTok), sinon l'affiche de la story. */
export const tiktokImage = (e) => e.tiktokImage || e.image;
const frDay = (day) => new Intl.DateTimeFormat('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
/** Légende courte, lisible même aplatie (comme la revue sur TikTok). */
export function tiktokCaption(day, entries, total = entries.length) {
  // Jour sans match : les listes « Résultats récents » et « À venir ».
  if (entries.length && entries.every((e) => e.list)) {
    const has = (l) => entries.some((e) => e.list === l);
    const what = has('resultats') && has('avenir') ? 'les derniers résultats et les prochains matchs' : has('resultats') ? 'les derniers résultats' : 'les prochains matchs';
    return [`🏟️ Sport étudiant · ${frDay(day)} : ${what} à faire défiler ➡️`, 'Tous les matchs : lien en bio.', '#SportÉtudiant #RSEQ #VieÉtudiante #Québec'].join('\n');
  }
  const n = Math.max(total, entries.filter((e) => !/^Aussi aujourd/.test(e.what || '')).length);
  const star = entries.find((e) => e.what && !/^Aussi aujourd/.test(e.what));
  return [
    `🏟️ Les matchs du jour · ${frDay(day)} : ${n} rencontre${n > 1 ? 's' : ''} du sport étudiant à faire défiler ➡️`,
    star ? `À ne pas manquer : ${star.what}.` : '',
    'Tous les matchs : lien en bio.',
    '#SportÉtudiant #RSEQ #VieÉtudiante #Québec',
  ].filter(Boolean).join('\n');
}
async function tiktokPass({ now, day, state, total, env }) {
  if (!TIKTOK.enabled || !CFG.publish) return;
  // Après le traitement de toutes les vagues du jour (affiches hébergées dès le premier passage) : programmée pour 16 h.
  if (torontoMinutes(now) > hmMin(TIKTOK.until)) return;
  const key = `${day}:tiktok`, d = state[key];
  if ((d?.at && !d.failed) || (d?.attempts || 0) >= 3) return;
  const entries = tiktokEntries(state, day);
  if (!entries.length) { console.log('TikTok : aucun match aujourd’hui, rien à publier.'); return; }
  if (!env.BUFFER_INSTAGRAM_API_KEY) { console.log('TikTok : BUFFER_INSTAGRAM_API_KEY absent, sauté.'); return; }
  const when = bufferWhen(day, TIKTOK.at, Date.now());
  try {
    const ch = createXBuffer({ key: env.BUFFER_INSTAGRAM_API_KEY, service: 'tiktok', channelName: TIKTOK.channelName, fallbackId: env.BUFFER_TIKTOK_CHANNEL_ID || null });
    const post = await ch.add({ text: tiktokCaption(day, entries, total), ...when, images: entries.map((e) => ({ url: tiktokImage(e), alt: e.alt })) });
    state[key] = { key, at: new Date().toISOString(), id: post.id, images: entries.length, ...(when.dueAt ? { dueAt: when.dueAt } : {}) };
    console.log(`→ tiktok « Matchs du jour » : ${post.id} (${entries.length} affiche(s)${when.dueAt ? `, programmée pour ${new Date(when.dueAt).toLocaleString('fr-CA', { timeZone: 'America/Toronto' })}` : ''})`);
  } catch (e) {
    state[key] = { key, failed: true, attempts: (d?.attempts || 0) + 1, error: String(e.message).slice(0, 200), lastTry: new Date().toISOString() };
    console.log(`::warning::tiktok « Matchs du jour » : échec (${String(e.message).slice(0, 200)}), réessai au prochain passage (3 au plus).`);
  }
  fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
}

async function main() {
  // --gate : porte légère du workflow (sans navigateur) — reste-t-il une story ou le TikTok du jour à faire ?
  const gateOnly = process.argv.includes('--gate');
  const gateOut = (due, why) => { console.log(`${due ? 'dû' : 'rien à faire'} : ${why}`); if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `due=${due}\n`); };
  const now = arg('now') ? Date.parse(arg('now')) : Date.now();
  const dry = process.env.DRY_RUN !== 'false', force = process.argv.includes('--force') || process.env.MATCH_STORY_FORCE === 'true';
  const out = path.resolve(arg('out', 'match-story-preview')); fs.mkdirSync(out, { recursive: true });
  const day = montrealDay(now);
  // Fenêtre de travail (heure de Montréal) : dès 7 h on prépare et programme toutes les stories du jour dans Buffer, à
  // l'heure de leur vague ; les passages suivants (toutes les 30 min) rattrapent ce qui a échoué.
  const win = { from: '07:00', to: '19:30', ...(CFG.window || {}) };
  const tm = torontoMinutes(now);
  if ((tm < hmMin(win.from) || tm > hmMin(win.to)) && !force && !dry) { if (gateOnly) return gateOut(false, 'hors de la fenêtre de travail'); console.log('Story match du jour : hors de la fenêtre de travail (heure de Montréal), rien à faire.'); return; }
  const nets = (CFG.networks || []).filter((n) => NETS.includes(n));
  let state = {}; try { state = rd(STATE); } catch {}
  // Un match déjà commencé (régates : toute la journée) n'a plus d'intérêt en story « Jour de match » (essai : tous les matchs du jour).
  // Voile : seules sources des régates (à venir et résultats) = équipes CICSA de sports.json (format compact, dépaqueté ici).
  let sailing = {};
  try { const { unpackSportsPayload } = createRequire(import.meta.url)('../sports-payload-lib.js'); sailing = sailingTeams(unpackSportsPayload(rd(arg('sailing', 'sports.json')))); }
  catch (e) { console.log(`::warning::voile illisible (${String(e.message).slice(0, 120)}) : pas de régate.`); }
  // Vagues (match-story-lib.mjs → WAVES) : la vague en cours, plus ce qu'une vague précédente n'a pas pu publier si le match
  // n'a pas commencé. Essai : toutes les vagues du jour, pour voir le plan complet.
  const t = torontoMinutes(now);
  const all = todaysStories(rd(arg('sports', 'sports-masthead.json')), day, { max: 200, notBefore: dry ? -1 : t, sailing });
  const waves = CFG.waves || WAVES; // toutes les vagues du jour : chaque story est programmée à l'heure de la sienne
  let plan = waves.flatMap((w) => { const p = planWave(all.filter((m) => waveOf(m, CFG.waves || WAVES) === w.id), { maxPerWave: CFG.maxPerWave || 4 }); return p.map((m, i) => ({ m, i, total: p.length, wave: w.id })); });
  // Jour sans match : derniers résultats et prochains matchs, en affiches de liste, dès la première vague (stories et TikTok).
  if (!all.length) {
    const lists = quietDayLists(rd(arg('sports', 'sports-masthead.json')), day, CFG.quiet || {});
    plan = lists.map((m, i) => ({ m, i, total: lists.length, wave: 'matin' }));
    if (lists.length) console.log(`Aucun match aujourd’hui : ${lists.map((m) => `${m.title} (${m.items.length})`).join(', ')}.`);
  }
  const matches = plan.map((x) => x.m);
  console.log(`Story match du jour ${day} : ${all.length} rencontre(s), ${plan.length} story(s) planifiée(s) — ${plan.map((x) => `[${x.wave}] ${x.m.kind === 'more' ? `Aussi aujourd’hui (${x.m.items.length})` : label(x.m)}`).join(', ')}.`);
  const tiktokEnv = { ...process.env };
  if (!matches.length) { if (gateOnly) gateOut(false, 'aucun match ni liste aujourd’hui'); return; }
  const todo = plan.map((x) => ({ ...x, key: matchKey(x.m) })).filter((x) => dry || pendingNets(state[x.key], nets).length);
  if (gateOnly) {
    const tk = state[`${day}:tiktok`];
    const tiktokDue = TIKTOK.enabled && CFG.publish && !(tk?.at && !tk.failed) && (tk?.attempts || 0) < 3 && tm <= hmMin(TIKTOK.until);
    return gateOut(todo.length > 0 || tiktokDue, `${todo.length} story(s) à faire${tiktokDue ? ', TikTok du jour à faire' : ''}`);
  }
  if (!todo.length) { console.log('Toutes les stories du jour sont déjà publiées.'); if (!dry) await tiktokPass({ now, day, state, total: all.length, env: tiktokEnv }); return; }
  const { renderImages } = await import('./une-render.mjs');
  const { hostImages } = await import('./une-run.mjs');
  const env = { ...process.env, pages: rd('data/social/buffer-pages.json') };
  const summary = [`## Story match du jour — ${day} (${dry ? 'essai DRY_RUN, rien n’est publié' : 'passage réel'})`, ''];
  for (const { m, i, total, wave, key } of todo) {
    const short = `${wave}-${i + 1}-` + (String(m.gameId || key.slice(11)).slice(0, 18) || 'm');
    if (m.kind === 'avenir' && !m.venue) m.venue = await rseqVenue(m.gameId);
    const model = matchStoryModel(m, { index: i, total });
    // Variante TikTok rendue à côté (seul le carrousel TikTok l'utilise ; les stories gardent match-story).
    const imgs = await renderImages(model, { outDir: out, prefix: `match-${short}`, formats: ['match-story', 'match-tiktok'] });
    const img = imgs['match-story'], tk = imgs['match-tiktok'], alt = matchStoryAlt(m);
    if (tk?.overflow) console.log(`::warning::${key} : débordement de la variante TikTok, le carrousel prendra l’affiche de la story.`);
    const tkOk = tk && !tk.overflow;
    summary.push(`- [${wave} ${i + 1}/${total}] ${m.kind === 'more' ? `Aussi aujourd’hui : ${m.items.length} rencontre(s)` : `${m.sport} · ${label(m)} · ${m.when}`} → ${path.basename(img.file)} (${Math.round(img.bytes / 1024)} Ko${img.logos ? `, ${img.logos} logo(s)` : ''}${img.overflow ? ', DÉBORDEMENT' : ''})`);
    console.log(`Image ${key} : ${path.basename(img.file)} ; alt : ${alt}`);
    if (dry) continue;
    if (!CFG.publish) { console.log('Publication désactivée (formats.matchStory.publish = false).'); continue; }
    if (img.overflow) { console.log(`::warning::${key} : débordement de l’affiche, story non publiée.`); continue; }
    let entry = state[key];
    if (!entry?.image) {
      let urls;
      try { urls = await hostImages({ 'match-story': img, ...(tkOk ? { 'match-tiktok': tk } : {}) }, `${day}:match-${short}`); }
      catch (e) { console.log(`::warning::${key} : hébergement impossible (${String(e.message).slice(0, 200)}), réessai au prochain passage.`); continue; }
      entry = state[key] = { key, at: new Date().toISOString(), what: label(m), ...(m.list ? { list: m.list } : {}), image: urls['match-story'], ...(urls['match-tiktok'] ? { tiktokImage: urls['match-tiktok'] } : {}), alt, nets: {} };
      fs.writeFileSync(STATE, JSON.stringify(pruneMatchState(state, now), null, 1) + '\n');
    }
    const wv = (CFG.waves || WAVES).find((w) => w.id === wave) || {};
    const when = bufferWhen(day, wv.post || '', Date.now());
    for (const n of pendingNets(entry, nets)) {
      const d = entry.nets[n];
      try {
        const r = await publishStory(n, entry.image, entry.alt, env, when);
        if (!r) { console.log(`${n} : canal non configuré, story sautée.`); continue; }
        entry.nets[n] = { at: new Date().toISOString(), ...r, ...(when.dueAt ? { dueAt: when.dueAt } : {}) }; console.log(`→ ${n}-story ${key} : ${r.id}${when.dueAt ? ` (programmée pour ${new Date(when.dueAt).toLocaleString('fr-CA', { timeZone: 'America/Toronto' })})` : ''}`);
      } catch (e) {
        entry.nets[n] = { failed: true, attempts: (d?.attempts || 0) + 1, error: String(e.message).slice(0, 200), lastTry: new Date().toISOString() };
        console.log(`::warning::${n}-story ${key} : échec (${String(e.message).slice(0, 200)}), réessai au prochain passage (3 au plus).`);
      }
      fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
    }
  }
  if (!dry) await tiktokPass({ now, day, state, total: all.length, env: tiktokEnv });
  else { const e = tiktokEntries(state, day); summary.push('', `TikTok « Matchs du jour » (${TIKTOK.enabled ? `${TIKTOK.at}` : 'éteint'}) :`, '```text', tiktokCaption(day, e.length ? e : plan.map((x) => ({ what: x.m.kind === 'more' ? 'Aussi aujourd’hui' : label(x.m) })), all.length), '```'); }
  fs.writeFileSync(path.join(out, 'apercu-match-story.md'), summary.join('\n') + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n') + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) await main();

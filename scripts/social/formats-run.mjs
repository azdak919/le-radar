#!/usr/bin/env node
// Formats natifs : « Résultats de la fin de semaine » et « À écouter ce soir ».
//  - Construit les textes par réseau, les contrôle, écrit l'aperçu (dossier + résumé du job).
//  - Ne publie QUE si : DRY_RUN=false, policy.json formats.<format>.publish = true, fenêtre d'envoi (lun.-mar. 8-21 h heure de Toronto
//    pour les résultats), aucun doute sur les données, et rien d'envoyé pour cette fin de semaine sur ce réseau (data/social/formats-state.json).
// Usage : node scripts/social/formats-run.mjs [--format weekend_results|listen_tonight|all] [--now ISO] [--out dossier]   (DRY_RUN=false pour publier)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { POLICY, torontoDay, torontoHour, torontoWeekday, mentionLedger } from './policy.mjs';
import { weekendModel, publishedModel, buildResultsText, resultsTags, resultsTumblrTags, listenModel, buildListenText, listenTags, checkText, NET_SPEC } from './formats.mjs';
import { postRecord, facets, graphemes } from './bluesky.mjs';
import { createBluesky } from './channels/bluesky.mjs';
import { createMastodon, idemKey } from './channels/mastodon.mjs';
import { createTumblr } from './channels/tumblr.mjs';
import { createXBuffer, AuthError } from './channels/x-buffer.mjs';
import { postMetadata } from './buffer-pages.mjs';

const require = createRequire(import.meta.url);
const { unpackSportsPayload } = require('../sports-payload-lib.js');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const rd = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const arg = (n, d = '') => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const STATE = path.join(ROOT, 'data/social/formats-state.json');
const NETS = ['bluesky', 'mastodon', 'x', 'tumblr', 'facebook', 'linkedin'];
const tz = t => new Date(t).toLocaleString('fr-CA', { timeZone: 'America/Toronto' }) + ' (heure de Montréal)';

/** Construit les textes d'un format pour tous les réseaux (pur, sans réseau). */
export function buildAll(format, { sports, radio, teamAcc, policy = POLICY, now = Date.now(), buffer = {} }) {
  const cfg = policy.formats[format], out = { format, networks: {}, problems: [], doubts: [] };
  const tagMax = n => cfg.hashtags?.[n] ?? 0;
  if (format === 'weekend_results') {
    const full = weekendModel(sports, now, cfg), model = publishedModel(full, cfg.sections);
    out.window = model.window; out.doubts = model.doubts; out.hardDoubt = model.hardDoubt;
    out.model = { uni: model.uni.map(g => ({ ...g })), coll: model.coll.map(g => ({ ...g })), previewOnly: full.coll.length && !cfg.sections.includes('coll') ? full.coll : [] };
    for (const n of NETS) {
      const spec = NET_SPEC[n], tags = n === 'tumblr' ? [] : resultsTags(model, tagMax(n), teamAcc);
      const text = buildResultsText(model, spec, { link: cfg.link, teamAcc, tags, maxMentions: 0 });
      const problems = checkText(text, spec, { model, teamAcc });
      out.networks[n] = { text, tags: n === 'tumblr' ? resultsTumblrTags(model, teamAcc) : tags, len: text ? spec.len(text) : 0, limit: spec.limit, problems };
    }
    if (out.model.previewOnly.length) {
      const pm = publishedModel(full, ['uni', 'coll']);
      out.previewColl = buildResultsText(pm, NET_SPEC.mastodon, { link: cfg.link, teamAcc, tags: resultsTags(pm, tagMax('mastodon'), teamAcc), maxMentions: 0 });
    }
  } else {
    const model = listenModel(radio, now, cfg); out.doubts = model.doubts; out.hardDoubt = model.doubts; out.model = model;
    const used = mentionLedger({ sent: buffer.sent || {}, accounts: [] }).get(torontoDay(now)) || new Set();
    const acc = { ...teamAcc, stations: Object.fromEntries(Object.entries(teamAcc.stations || {}).map(([k, v]) => [k, used.has(String(v.x || '').toLowerCase()) ? { ...v, x: undefined } : v])) };
    for (const n of NETS) {
      const spec = NET_SPEC[n], tags = n === 'tumblr' ? [] : listenTags(model, tagMax(n), teamAcc);
      const text = buildListenText(model, spec, { link: cfg.link, teamAcc: acc, tags });
      out.networks[n] = { text, tags, len: text ? spec.len(text) : 0, limit: spec.limit, problems: checkText(text, spec, { teamAcc, kind: 'listen_tonight' }) };
    }
  }
  return out;
}

export function previewMarkdown(built, { dry, willPublish, reason }) {
  const L = [`## Format « ${built.format === 'weekend_results' ? 'Résultats de la fin de semaine' : 'À écouter ce soir'} » — ${dry ? 'essai (rien n\'est publié)' : willPublish ? 'publication réelle' : 'aperçu seulement'}`, ''];
  if (built.window) L.push(`Fin de semaine : ${built.window.start} au ${built.window.end}.`, '');
  L.push(`Décision : ${reason}`, '');
  if (built.doubts.length) L.push(`Doutes / alertes : ${built.doubts.join(' ; ')}.`, '');
  for (const [n, v] of Object.entries(built.networks)) L.push(`### ${n} (${v.len}/${v.limit})`, '', '```text', v.text || '(aucun texte)', '```', v.problems.length ? `Problèmes : ${v.problems.join(' ; ')}` : 'Contrôles : OK', n === 'tumblr' ? `Étiquettes Tumblr : ${v.tags.join(', ')}` : '', '');
  if (built.previewColl) L.push('### Aperçu RSEQ collégial (non publié : scores non confirmés par une source indépendante)', '', '```text', built.previewColl, '```', '');
  return L.join('\n');
}

// ── Publication ──────────────────────────────────────────────────────────────
const LANG = 'fr';
async function publishOne(net, text, built, cfg, env) {
  const link = cfg.link, title = built.format === 'weekend_results' ? 'Résultats de la fin de semaine : U SPORTS et RSEQ' : 'À écouter ce soir sur les radios campus';
  const desc = built.format === 'weekend_results' ? 'Résultats des matchs universitaires du Québec, mis à jour par LE-RADAR.ca.' : 'Les émissions de la soirée sur les radios campus du Québec.';
  const header = text.split('\n')[0];
  if (net === 'bluesky') {
    const bs = createBluesky({ handle: env.BLUESKY_HANDLE || 'le-radar.ca', password: env.BLUESKY_APP_PASSWORD });
    await bs.login();
    const recent = await bs.listPosts(50); if (recent.some(p => p.text.startsWith(header))) return { dedup: true };
    const dids = new Map(); for (const a of Object.values(env.teamAcc.stations || {})) if (a.bluesky && a.did) dids.set(a.bluesky.slice(1).toLowerCase(), a.did);
    const thumb = await bs.uploadImage(cfg.image); if (!thumb) throw new Error('image Bluesky refusée');
    const p = await bs.post(postRecord({ text, lang: LANG, dids, card: { uri: link, title, description: desc, thumb } }));
    return { url: p.url, uri: p.uri };
  }
  if (net === 'mastodon') {
    const md = createMastodon({ instance: env.MASTODON_INSTANCE || 'https://piaille.fr', token: env.MASTODON_TOKEN, acct: env.MASTODON_ACCT || 'leradar' });
    const recent = await md.listStatuses(40); if (recent.some(s => String(s.content || '').includes(header.replace(/^🏆 /, '').slice(0, 30)))) return { dedup: true };
    const mediaId = await md.uploadImage(cfg.image, title); if (!mediaId) throw new Error('image Mastodon refusée');
    const p = await md.post({ status: text, mediaId, lang: LANG, key: idemKey(`${built.format}:${built.window?.key || torontoDay(Date.now())}:mastodon`) });
    return { url: p.url, id: p.id };
  }
  if (net === 'tumblr') {
    const keys = { ck: env.TUMBLR_CONSUMER_KEY, cs: env.TUMBLR_CONSUMER_SECRET, tk: env.TUMBLR_TOKEN, ts: env.TUMBLR_TOKEN_SECRET };
    const tb = createTumblr({ ...keys, blog: env.TUMBLR_BLOG || 'le-radar-ca.tumblr.com' });
    const content = text.split('\n').filter(l => l.trim()).map((l, i) => {
      const b = { type: 'text', text: l, ...(i === 0 ? { subtype: 'heading2' } : {}) }, at = l.indexOf(link);
      if (at >= 0) b.formatting = [{ start: [...l.slice(0, at)].length, end: [...l.slice(0, at)].length + [...link].length, type: 'link', url: link }];
      return b;
    });
    content.splice(1, 0, { type: 'image', media: [{ url: cfg.image }], alt_text: title });
    content.push({ type: 'link', url: link, title, description: desc });
    const p = await tb.post({ content, tags: built.networks.tumblr.tags.join(','), state: 'published', source_url: link });
    return { url: p.url, id: p.id };
  }
  // X, Facebook, LinkedIn : Buffer (publication immédiate, une seule fois)
  const pages = env.pages || {}, key = env.BUFFER_API_KEY;
  const ch = net === 'x' ? createXBuffer({ key, fallbackId: env.BUFFER_CHANNEL_ID || undefined }) : createXBuffer({ key, service: pages[net].service, channelName: pages[net].name, fallbackId: (net === 'facebook' ? env.BUFFER_FACEBOOK_CHANNEL_ID : env.BUFFER_LINKEDIN_CHANNEL_ID) || null });
  const post = await ch.add({ text, image: cfg.image, now: true, metadata: net === 'facebook' ? postMetadata('facebook') : undefined });
  return { id: post.id, status: post.status || '' };
}

/** Fenêtre d'envoi (jours et heures Toronto) : évite de publier un lundi soir tard ou en milieu de semaine à cause d'un cron en retard. */
export const inWindow = (cfg, now) => (cfg.eligibleWeekdays || []).includes(torontoWeekday(now)) && torontoHour(now) >= (cfg.hourFrom ?? 8) && torontoHour(now) < (cfg.hourTo ?? 21);

async function main() {
  const now = arg('now') ? Date.parse(arg('now')) : Date.now(), fmt = arg('format', process.env.FORMAT || 'all');
  const dry = process.env.DRY_RUN !== 'false';
  const out = arg('out', 'formats-preview'); fs.mkdirSync(out, { recursive: true });
  const teamAcc = rd('data/social/team-accounts.json'), sports = unpackSportsPayload(rd('sports.json')), radio = rd('radio-schedules.json');
  const state = rd('data/social/formats-state.json'); let buffer = {}; try { buffer = rd('data/buffer-sent.json'); } catch {}
  const formats = fmt === 'all' ? ['weekend_results', 'listen_tonight'] : [fmt];
  const summary = []; let published = 0;
  for (const format of formats) {
    const cfg = POLICY.formats[format]; if (!cfg) throw new Error(`format inconnu : ${format}`);
    const built = buildAll(format, { sports, radio, teamAcc, now, buffer });
    const nets = (cfg.networks || []).filter(n => NETS.includes(n));
    const key = format === 'weekend_results' ? built.window.key : torontoDay(now);
    const done = (state[format] ||= {})[key] ||= {};
    const bad = Object.entries(built.networks).filter(([n, v]) => nets.includes(n) && v.problems.length);
    let reason;
    if (dry) reason = 'essai (DRY_RUN) : aucun envoi.';
    else if (!cfg.publish) reason = 'publication désactivée dans data/social/policy.json (publish = false) : aperçu seulement.';
    else if (!nets.length) reason = 'aucun réseau activé pour ce format.';
    else if (format === 'weekend_results' && !inWindow(cfg, now)) reason = `hors de la fenêtre d'envoi (lundi-mardi, ${cfg.hourFrom} h à ${cfg.hourTo} h heure de Montréal) : ${tz(now)}.`;
    else if (built.hardDoubt.length) reason = `DOUTE sur les données, rien n'est publié : ${built.hardDoubt.join(' ; ')}.`;
    else if (bad.length) reason = `contrôle de texte échoué (${bad.map(([n, v]) => n + ' : ' + v.problems.join(', ')).join(' | ')}), rien n'est publié.`;
    else reason = 'publication réelle autorisée.';
    const will = reason === 'publication réelle autorisée.';
    summary.push(previewMarkdown(built, { dry, willPublish: will, reason }));
    fs.writeFileSync(path.join(out, `${format}.json`), JSON.stringify({ at: new Date(now).toISOString(), reason, ...built }, null, 1));
    console.log(`\n=== ${format} : ${reason}`);
    for (const [n, v] of Object.entries(built.networks)) console.log(`\n[${n}] ${v.len}/${v.limit}${v.problems.length ? ' PROBLÈMES : ' + v.problems.join(', ') : ''}\n${v.text || '(aucun texte)'}`);
    if (!will) continue;
    const env = { ...process.env, teamAcc, pages: rd('data/social/buffer-pages.json') };
    for (const n of nets) {
      if (done[n]?.at && !done[n].failed) { console.log(`${n} : déjà publié pour ${key} (${done[n].url || done[n].id || 'ok'}).`); continue; }
      if ((done[n]?.attempts || 0) >= 3) { console.log(`::warning::${n} : 3 échecs pour ${key}, abandon (voir l'état).`); continue; }
      try {
        const r = await publishOne(n, built.networks[n].text, built, cfg, env);
        done[n] = { at: new Date().toISOString(), ...r }; published++;
        console.log(`→ ${n} : ${r.dedup ? 'déjà présent (vérifié dans le compte), noté' : r.url || r.id}`);
      } catch (e) {
        if (e instanceof AuthError) console.log(`::warning::${n} : authentification refusée.`);
        done[n] = { failed: true, attempts: (done[n]?.attempts || 0) + 1, error: String(e.message).slice(0, 200), lastTry: new Date().toISOString() };
        console.log(`::warning::${n} : échec (${String(e.message).slice(0, 200)}) — réessai au prochain passage (max 3).`);
      }
      fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
    }
  }
  fs.writeFileSync(path.join(out, 'apercu.md'), summary.join('\n---\n\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n---\n\n') + '\n');
  console.log(`\n${dry ? 'ESSAI' : 'RÉEL'} terminé : ${published} publication(s).`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) await main();

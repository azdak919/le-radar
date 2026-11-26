#!/usr/bin/env node
// « La revue » sur les réseaux : publication distincte de La une (décision de Charles, 26 nov. 2026).
//  - Contenu : le carrousel de la revue du créneau (scripts/revue/revue-pdfs.mjs) — PDF « document » sur LinkedIn, pages 4:5
//    en plusieurs photos sur Facebook, carrousel à glisser sur Instagram. Les 8 meilleurs articles (note sociale), sport et
//    radio par popularité, voile toujours montrée (scripts/revue/revue-social-pick.mjs).
//  - Heures (Montréal) : matin ≈ 9 h 15, soir ≈ 20 h 45 — au cœur des fenêtres d'engagement déjà retenues pour notre public
//    (Facebook 9-13 h et 18-21 h, LinkedIn 8-10 h, Instagram en soirée), à distance de La une (≈ 7 h 45 et 19 h 30) pour ne
//    jamais publier deux fois coup sur coup. LinkedIn : le matin seulement (fenêtre de soirée nulle pour une Page).
//  - Minimum (mêmes principes que La une) : publiée s'il y a une revue du créneau — articles, ou sport et radio sans nouvel
//    article ; rien si la revue est sautée (rien de nouveau) ou refusée par son garde-fou (doute sur les données) ;
//    rien tant que le carrousel n'est pas en ligne (jamais d'image de remplacement).
//  - État idempotent : data/social/revue-state.json (clé = identifiant de la revue, puis réseau ; 3 essais au plus).
//    Instagram : état et arrêt au premier avertissement Buffer partagés avec La une (data/social/instagram-state.json).
//  - DRY_RUN (défaut hors cron) : textes et décisions seulement, rien n'est publié, l'état n'est pas modifié.
// Usage : node scripts/social/revue-post.mjs [--gate] [--slot auto|matin|soir] [--now ISO]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POLICY, torontoDay } from './policy.mjs';
import { torontoMinutes, instagramHashtags, igCreditLine, fmLabel } from './une-lib.mjs';
import { institutionTag } from './hashtags.mjs';
import { linkedinCarousel, revueCarousel } from './revue-carousel.mjs';
import { socialModel } from '../revue/revue-social-pick.mjs';
import { NETWORKS } from './networks/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STATE = path.join(ROOT, 'data/social/revue-state.json');
const IG_STATE = path.join(ROOT, 'data/social/instagram-state.json');
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(path.isAbsolute(f) ? f : path.join(ROOT, f), 'utf8')); } catch { return d; } };

export const DEFAULTS = {
  publish: false,
  slots: {
    matin: { id: 'matin', target: '09:15', from: '09:00', to: '11:30', networks: ['linkedin', 'facebook', 'instagram'] },
    soir: { id: 'soir', target: '20:45', from: '20:30', to: '22:30', networks: ['facebook', 'instagram'] },
  },
  instagram: { from: '' },
};
export const CFG = { ...DEFAULTS, ...(POLICY.formats?.revue || {}) };
export const NETS = ['linkedin', 'facebook', 'instagram'];
const MAX_ATTEMPTS = 3;
const hm = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };

/** Créneau dont la fenêtre contient `now` (heure de Montréal), sinon null. */
export function slotAt(now = Date.now(), slots = CFG.slots) {
  const m = torontoMinutes(now), day = torontoDay(now);
  for (const s of Object.values(slots)) if (m >= hm(s.from) && m < hm(s.to)) return { ...s, day, id: s.id, revueId: `${day}-${s.id}` };
  return null;
}
export function slotFor(id, now = Date.now(), slots = CFG.slots) {
  const s = slots[id]; if (!s) throw new Error(`créneau inconnu : ${id}`);
  const day = torontoDay(now); return { ...s, day, revueId: `${day}-${id}` };
}
/** Réseaux du créneau ; Instagram seulement à partir de `instagram.from` (jour civil de Montréal). */
export function netsFor(slot, { cfg = CFG } = {}) {
  return (slot.networks || []).filter((n) => NETS.includes(n) && (n !== 'instagram' || !cfg.instagram?.from || slot.day >= cfg.instagram.from));
}
export const netDone = (e) => !!(e && ((e.at && !e.failed) || (e.attempts || 0) >= MAX_ATTEMPTS));
export const slotDone = (entry, nets) => !!entry && (entry.skipped || nets.every((n) => netDone(entry.nets?.[n])));

/**
 * Revue du créneau publiée ? Revue absente (sautée : rien de nouveau) ou refusée (doute) : rien, comme La une.
 * Retourne { ok, why, model }.
 */
export function revueFor(slot, { index = rd('data/revue/index.json', []), load = (id) => rd(`data/revue/reviews/${id}.json`, null) } = {}) {
  if (!index.some((r) => r?.id === slot.revueId)) return { ok: false, why: `${slot.revueId} : aucune revue publiée pour ce créneau (sautée ou pas encore sortie)` };
  const model = load(slot.revueId);
  if (!model) return { ok: false, why: `${slot.revueId} : données de la revue introuvables` };
  const any = (model.items || []).length || (model.sports?.results || []).length || (model.sports?.next || []).length || (model.radio || []).length;
  if (!any) return { ok: false, why: `${slot.revueId} : revue vide (ni article, ni sport, ni radio)` };
  return { ok: true, why: 'revue publiée', model };
}

// ── Textes ─────────────────────────────────────────────────────────────────────
const len = (s) => [...String(s)].length;
const frDate = (day) => new Intl.DateTimeFormat('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
const who = (t) => `${t.name}${t.inst ? ` (${t.inst})` : ''}`;
function sportText(g) {
  const t = g.teams || [];
  const vs = t.length === 2 ? (t[0].score != null && t[1].score != null ? `${who(t[0])} ${t[0].score}-${t[1].score} ${who(t[1])}` : `${who(t[0])} vs ${who(t[1])}`) : (g.text || g.event || '');
  return `${g.emoji || '🏟️'} ${g.sport} · ${vs}${g.when ? `, ${g.when}` : ''}`;
}
/**
 * Texte d'un réseau. `link` : lien cliquable (LinkedIn, Facebook) ; Instagram : aucun lien, « lien en bio », crédit 📸,
 * 3 à 5 mots-clics. Les lignes d'articles sont retirées par la fin si le texte dépasse la limite du réseau.
 */
export function revueText(net, model, { limit = 2000, hashtags = 1 } = {}) {
  const sm = model.items && model.totalItems != null ? model : socialModel(model);
  const ed = model.edition || {};
  const items = sm.items || [], total = sm.totalItems ?? items.length;
  const head = `${ed.emoji ? ed.emoji + ' ' : ''}${ed.label || 'La revue'} · ${frDate(ed.day)}`;
  const intro = items.length
    ? (total > items.length ? `${items.length} articles des médias étudiants du Québec, choisis parmi les ${total} de la revue. Faites défiler :` : `${items.length} article${items.length > 1 ? 's' : ''} des médias étudiants du Québec. Faites défiler :`)
    : 'Pas de nouvel article des médias étudiants depuis la dernière revue : place au sport et aux radios étudiantes.';
  const lines = items.map((it, i) => `${i + 1}. ${it.title}${it.source ? ` — ${it.source}` : ''}`);
  const sport = [...(sm.sports?.results || []).slice(0, 1), ...(sm.sports?.next || [])][0];
  const show = (sm.radio || [])[0];
  const extra = [sport ? sportText(sport) : '', show ? `📻 À l’écoute : ${fmLabel(show.station)} · ${show.shows[0].title}${show.shows[0].when ? ` · ${show.shows[0].when}` : ''}` : ''].filter(Boolean);
  const ig = net === 'instagram';
  const url = model.url || `https://le-radar.ca/${model.path}`;
  const cta = ig ? 'La revue complète, à lire ou à imprimer avec sudoku et mots cachés : lien en bio (le-radar.ca/revues).' : `La revue complète, à lire ou à imprimer avec sudoku et mots cachés : ${url}`;
  const credit = ig ? igCreditLine(sm.image?.credit || items[0]?.credit || '') : '';
  const tags = ig
    ? instagramHashtags(items.map((it) => ({ ...it, tag: institutionTag({ source: it.source, title: it.title, desc: it.excerpt || '' }) })), hashtags)
    : hashtags > 0 ? ['#MédiasÉtudiants'] : [];
  const build = (n) => [head, intro + (n ? '\n' + lines.slice(0, n).join('\n') : ''), extra.join('\n'), cta, credit, tags.join(' ')].filter(Boolean).join('\n\n');
  let n = lines.length, text = build(n);
  while (len(text) > limit && n > 1) text = build(--n);
  const problems = [];
  if (len(text) > limit) problems.push(`trop long (${len(text)}/${limit})`);
  if (/(^|\s)@\w/.test(text)) problems.push('mention @');
  if (ig && /https?:\/\//.test(text)) problems.push('lien cliquable sur Instagram');
  if (ig && (text.match(/#[\p{L}\p{N}_]+/gu) || []).length > 5) problems.push('plus de 5 mots-clics');
  return { text, len: len(text), limit, problems };
}

/** Textes des réseaux du créneau, avec les limites et mots-clics de leurs modules. */
export function revueTexts(nets, model) {
  const sm = socialModel(model);
  const conf = { instagram: { limit: 2200, hashtags: (POLICY.hashtags?.maxByNetwork || {}).instagram || 5 } };
  for (const n of ['linkedin', 'facebook']) conf[n] = { limit: NETWORKS[n]?.limit || 1500, hashtags: NETWORKS[n]?.hashtags ?? 1 };
  return Object.fromEntries(nets.map((n) => [n, revueText(n, { ...model, ...sm, items: sm.items, totalItems: sm.totalItems }, conf[n])]));
}

// ── Exécution ──────────────────────────────────────────────────────────────────
async function sendOne(net, { text, doc, images, model, env, igState, slot }) {
  const { createXBuffer } = await import('./channels/x-buffer.mjs');
  const { postMetadata } = await import('./buffer-pages.mjs');
  const pages = rd('data/social/buffer-pages.json', {});
  if (net === 'linkedin') {
    const ch = createXBuffer({ key: env.BUFFER_API_KEY, service: pages.linkedin.service, channelName: pages.linkedin.name, fallbackId: env.BUFFER_LINKEDIN_CHANNEL_ID || null });
    const post = await ch.add({ text, now: true, document: doc, metadata: postMetadata('linkedin') });
    return { id: post.id, status: post.status || '' };
  }
  if (net === 'facebook') {
    const ch = createXBuffer({ key: env.BUFFER_API_KEY, service: pages.facebook.service, channelName: pages.facebook.name, fallbackId: env.BUFFER_FACEBOOK_CHANNEL_ID || null });
    const post = await ch.add({ text, now: true, images, metadata: postMetadata('facebook') });
    return { id: post.id, status: post.status || '' };
  }
  // Instagram : arrêt au premier avertissement ou à la première erreur Buffer (état partagé avec La une), sans réessai.
  const { deliverInstagram, openInstagramIssue } = await import('./instagram.mjs');
  if (igState.halted) return { skip: 'Instagram arrêté après un avertissement ou une erreur Buffer. Aucun réessai.' };
  const r = await deliverInstagram({ env, text, imageUrl: images[0].url, images, alt: images[0].alt, state: igState, now: new Date().toISOString(),
    slotId: slot.id, format: 'revue', dedupKey: `revue:${slot.revueId}`, fileIssue: openInstagramIssue });
  Object.assign(igState, r.state || {});
  if (r.action !== 'sent') throw Object.assign(new Error(r.reason || 'Instagram non publié'), { final: true });
  return { id: r.id, dedup: !!r.dedup };
}

export function gate({ now = Date.now(), state = rd(STATE, {}), forced = '', dry = false } = {}) {
  if (dry) return { due: true, why: 'essai DRY_RUN : textes seulement' };
  if (forced && forced !== 'auto') return { due: true, why: 'créneau forcé (déclenchement manuel)' };
  if (CFG.publish !== true) return { due: false, why: 'publication désactivée (formats.revue.publish)' };
  const s = slotAt(now);
  if (!s) return { due: false, why: 'hors des fenêtres de La revue' };
  if (slotDone(state[s.revueId], netsFor(s))) return { due: false, why: `${s.revueId} déjà traitée` };
  return { due: true, why: `${s.revueId} due` };
}

async function main() {
  const argv = process.argv, arg = (n, d = '') => { const i = argv.indexOf('--' + n); return i > 0 ? argv[i + 1] : d; };
  const now = arg('now') ? Date.parse(arg('now')) : Date.now();
  const dry = process.env.DRY_RUN !== 'false';
  const forced = arg('slot', process.env.REVUE_SLOT || 'auto');
  const state = rd(STATE, {});
  if (argv.includes('--gate')) {
    const g = gate({ now, state, forced, dry });
    console.log(`${g.due ? 'dû' : 'rien à faire'} : ${g.why}`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `due=${g.due}\n`);
    return;
  }
  const slot = forced && forced !== 'auto' ? slotFor(forced, now) : slotAt(now);
  if (!slot) { console.log('Hors des fenêtres de La revue.'); return; }
  const nets = netsFor(slot);
  const entry = state[slot.revueId] ||= { at: new Date(now).toISOString(), nets: {} };
  if (!dry && slotDone(entry, nets)) { console.log(`${slot.revueId} : déjà traitée.`); return; }
  const rv = revueFor(slot);
  if (!rv.ok) { console.log(rv.why); if (!dry) delete state[slot.revueId]; return; }
  const [doc, images] = await Promise.all([linkedinCarousel(`${slot.day}:${slot.id}`), revueCarousel(`${slot.day}:${slot.id}`)]);
  const texts = revueTexts(nets, rv.model);
  for (const [n, v] of Object.entries(texts)) console.log(`\n[${n}] ${v.len}/${v.limit}${v.problems.length ? ' PROBLÈMES : ' + v.problems.join(', ') : ''}\n${v.text}`);
  console.log(`\nCarrousel : PDF ${doc ? 'en ligne' : 'absent'} ; images ${images ? images.length + ' en ligne' : 'absentes'}.`);
  if (dry) { console.log('Essai (DRY_RUN) : aucun envoi.'); return; }
  if (CFG.publish !== true) { console.log('Publication désactivée (formats.revue.publish = false).'); return; }
  const igState = rd(IG_STATE, {});
  const env = process.env;
  for (const n of nets) {
    const e = entry.nets[n] ||= {};
    if (netDone(e)) continue;
    const t = texts[n];
    if (t.problems.length) { console.log(`::warning::${n} : texte refusé (${t.problems.join(', ')})`); e.attempts = MAX_ATTEMPTS; e.failed = true; e.error = t.problems.join(', '); continue; }
    if (n === 'linkedin' ? !doc : !images) { console.log(`${n} : carrousel pas encore en ligne, nouvel essai au prochain passage.`); continue; }
    try {
      const r = await sendOne(n, { text: t.text, doc, images, model: rv.model, env, igState, slot });
      if (r.skip) { console.log(`${n} : ${r.skip}`); e.attempts = MAX_ATTEMPTS; e.failed = true; e.error = r.skip; continue; }
      Object.assign(e, { at: new Date().toISOString(), id: r.id, failed: false });
      console.log(`→ ${n} : ${r.id}`);
    } catch (err) {
      e.attempts = err.final ? MAX_ATTEMPTS : (e.attempts || 0) + 1; e.failed = true; e.error = String(err.message || err).slice(0, 300);
      console.log(`::warning::${n} : ${e.error}`);
    }
  }
  // Garder l'état court : 21 jours.
  const cut = new Date(now - 21 * 864e5).toISOString().slice(0, 10);
  for (const k of Object.keys(state)) if (k.slice(0, 10) < cut) delete state[k];
  fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
  if (nets.includes('instagram')) fs.writeFileSync(IG_STATE, JSON.stringify(igState, null, 1) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });

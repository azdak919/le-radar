#!/usr/bin/env node
// « La revue » sur les réseaux : publication distincte de La une (décision de Charles, 26 nov. 2026).
//  - Contenu : le carrousel de la revue du créneau (scripts/revue/revue-pdfs.mjs) — PDF « document » sur LinkedIn, pages 4:5
//    en plusieurs photos sur Facebook, carrousel à glisser sur Instagram. Les 8 meilleurs articles (note sociale), sport et
//    radio par popularité, voile toujours montrée (scripts/revue/revue-social-pick.mjs).
//  - Heures (Montréal), une par réseau (formats.revue.slots.<créneau>.networks) : matin Facebook 11 h, Instagram 12 h,
//    LinkedIn 12 h 15 en semaine ; soir Facebook 20 h 45, Instagram 21 h 15. Au cœur des fenêtres d'engagement du dépôt
//    (scripts/social/networks/*.mjs) et à l'écart minimal de La une sur chaque réseau (Facebook 3 h, LinkedIn 4 h).
//  - Heure exacte malgré les retards de GitHub : le script passe tôt (dès que la revue est en ligne) et confie chaque
//    publication à Buffer, programmée à l'heure du réseau ; un passage tardif (heure dépassée, fenêtre encore ouverte)
//    publie tout de suite.
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
import { torontoMinutes, instagramHashtags, igCreditLine, fmLabel, montrealInstant } from './une-lib.mjs';
import { institutionTag } from './hashtags.mjs';
import { linkedinCarousel, revueCarousel } from './revue-carousel.mjs';
import { socialModel } from '../revue/revue-social-pick.mjs';
import { NETWORKS } from './networks/index.mjs';
import { instagramSlotAllowed } from './instagram.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STATE = path.join(ROOT, 'data/social/revue-state.json');
const IG_STATE = path.join(ROOT, 'data/social/instagram-state.json');
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(path.isAbsolute(f) ? f : path.join(ROOT, f), 'utf8')); } catch { return d; } };

export const DEFAULTS = {
  publish: false,
  slots: {
    matin: { id: 'matin', from: '07:00', to: '13:30', networks: { facebook: '11:00', instagram: '12:00', linkedin: '12:15' }, weekdaysOnly: ['linkedin'] },
    soir: { id: 'soir', from: '19:00', to: '22:30', networks: { facebook: '20:45', instagram: '21:15' } },
  },
  instagram: { from: '' },
};
export const CFG = { ...DEFAULTS, ...(POLICY.formats?.revue || {}) };
export const NETS = ['linkedin', 'facebook', 'instagram', 'x', 'threads', 'bluesky', 'mastodon', 'tiktok'];
/** Programmés dans Buffer à leur heure ; Bluesky et Mastodon (API directes) partent au premier passage après leur heure. */
export const BUFFER_NETS = new Set(['linkedin', 'facebook', 'instagram', 'x', 'threads', 'tiktok']);
/** Images par réseau : X, Bluesky et Mastodon 4 au plus ; les autres, tout le carrousel. */
const MAX_IMAGES = { x: 4, bluesky: 4, mastodon: 4 };
/** TikTok : préparé, éteint tant que le compte n'est pas connecté dans Buffer (formats.revue.tiktok.enabled). */
export const tiktokEnabled = (cfg = CFG) => cfg.tiktok?.enabled === true;
const MAX_ATTEMPTS = 3;
const hm = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };

/** Créneau dont la fenêtre contient `now` (heure de Montréal), sinon null. */
export function slotAt(now = Date.now(), slots = CFG.slots) {
  const m = torontoMinutes(now), day = torontoDay(now);
  for (const s of Object.values(slots)) if (s?.from && m >= hm(s.from) && m < hm(s.to)) return { ...s, day, id: s.id, revueId: `${day}-${s.id}` };
  return null;
}
export function slotFor(id, now = Date.now(), slots = CFG.slots) {
  const s = slots[id]; if (!s) throw new Error(`créneau inconnu : ${id}`);
  const day = torontoDay(now); return { ...s, day, revueId: `${day}-${id}` };
}
const weekday = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
/**
 * Réseaux du créneau, dans l'ordre de leur heure ; Instagram seulement à partir de `instagram.from` (jour civil de Montréal) ;
 * `weekdaysOnly` : pas le samedi ni le dimanche (LinkedIn : une Page n'a presque aucune portée la fin de semaine).
 */
export function netsFor(slot, { cfg = CFG } = {}) {
  const we = [0, 6].includes(weekday(slot.day));
  return Object.entries(slot.networks || {})
    .filter(([n]) => NETS.includes(n) && (n !== 'instagram' || !cfg.instagram?.from || slot.day >= cfg.instagram.from) && (n !== 'tiktok' || tiktokEnabled(cfg)) && !(we && (slot.weekdaysOnly || []).includes(n)))
    .sort((a, b) => hm(a[1]) - hm(b[1]))
    .map(([n]) => n);
}
/** Instant visé pour un réseau (heure de Montréal du jour du créneau, heure normale ou avancée). */
export const dueFor = (slot, net) => montrealInstant(slot.day, slot.networks[net]);
/** Programmer dans Buffer (heure encore à venir) ou publier tout de suite (passage tardif). */
export const whenFor = (slot, net, now = Date.now()) => { const due = dueFor(slot, net); return due - now > 2 * 60e3 ? { dueAt: new Date(due).toISOString() } : { now: true }; };
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
/**
 * Forme du texte selon l'affichage de chaque réseau (27 nov. 2026 : la légende TikTok, longue liste aplatie en un bloc,
 * était illisible) :
 *  - accroche (TikTok) : 3 phrases qui se lisent même sans retours à la ligne, puis les mots-clics ;
 *  - moyenne (Instagram, Threads, Mastodon) : les 3 meilleurs titres, « et N autres dans le carrousel » ;
 *  - longue (Facebook, LinkedIn) : 5 titres, le match et l'émission du moment, le lien ;
 *  - courte (X, Bluesky) : titre de l'édition, un titre, le lien.
 */
export const STYLE = { tiktok: 'accroche', instagram: 'moyenne', threads: 'moyenne', mastodon: 'moyenne', facebook: 'longue', linkedin: 'longue', x: 'courte', bluesky: 'courte' };
const frShort = (day) => new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));

export function revueText(net, model, { limit = 2000, hashtags = 1 } = {}) {
  const sm = model.items && model.totalItems != null ? model : socialModel(model);
  const ed = model.edition || {};
  const style = STYLE[net] || 'longue';
  const items = sm.items || [], total = sm.totalItems ?? items.length;
  const emoji = ed.emoji ? ed.emoji + ' ' : '';
  const head = `${emoji}${ed.label || 'La revue'} · ${frDate(ed.day)}`;
  const nArt = `${items.length} article${items.length > 1 ? 's' : ''} des médias étudiants du Québec`;
  const intro = items.length
    ? (total > items.length ? `${nArt}, choisis parmi les ${total} de la revue. Faites défiler ➡️` : `${nArt}. Faites défiler ➡️`)
    : 'Pas de nouvel article des médias étudiants depuis la dernière revue : place au sport et aux radios étudiantes ➡️';
  const line = (it) => `• ${it.title}${it.source ? ` — ${it.source}` : ''}`;
  const sport = [...(sm.sports?.results || []).slice(0, 1), ...(sm.sports?.next || [])][0];
  const show = (sm.radio || [])[0];
  const extra = [sport ? sportText(sport) : '', show ? `📻 À l’écoute : ${fmLabel(show.station)} · ${show.shows[0].title}${show.shows[0].when ? ` · ${show.shows[0].when}` : ''}` : ''].filter(Boolean);
  // Instagram et TikTok : aucun lien cliquable dans la légende → « lien en bio », crédit 📸, 3 à 5 mots-clics.
  const ig = net === 'instagram' || net === 'tiktok';
  const url = model.url || `https://le-radar.ca/${model.path}`;
  const cta = ig ? '📖 La revue complète, à lire ou à imprimer : lien en bio.' : `📖 La revue complète, à lire ou à imprimer : ${url}`;
  const coverCredit = String(sm.image?.credit || items[0]?.credit || '').replace(/^Photo\s*:\s*/i, '').trim();
  const credit = ig && coverCredit ? `📸 Couverture : ${coverCredit}` : '';
  const tags = ig
    ? instagramHashtags(items.map((it) => ({ ...it, tag: institutionTag({ source: it.source, title: it.title, desc: it.excerpt || '' }) })), hashtags)
    : hashtags > 0 ? ['#MédiasÉtudiants'] : [];
  const more = (shown) => (items.length > shown ? `… et ${items.length - shown} autre${items.length - shown > 1 ? 's' : ''} dans le carrousel.` : '');
  const build = (n, withExtra = true) => {
    if (style === 'accroche') {
      const lead = items[0] ? `À la une : ${items[0].title} (${items[0].source}).` : (sport ? `${sportText(sport)}.` : '');
      return [`${emoji}${ed.label || 'La revue'} du ${frShort(ed.day)} : ${items.length ? `${nArt} à faire défiler ➡️` : 'sport et radios étudiantes à faire défiler ➡️'}`, lead, 'La revue complète : lien en bio.', tags.join(' ')].filter(Boolean).join('\n');
    }
    if (style === 'courte') {
      return [head, `${items.length ? `${nArt} à faire défiler 👇` : 'Sport et radios étudiantes 👇'}${n ? '\n' + items.slice(0, n).map(line).join('\n') : ''}`, url, tags.join(' ')].filter(Boolean).join('\n\n');
    }
    const list = items.slice(0, n).map(line).concat(more(n) ? [more(n)] : []).join('\n');
    return [head, intro + (list ? '\n' + list : ''), style === 'longue' && withExtra ? extra.join('\n') : '', cta, credit, tags.join(' ')].filter(Boolean).join('\n\n');
  };
  let n = Math.min(items.length, style === 'longue' ? 5 : style === 'courte' ? 1 : 3), text = build(n);
  while (len(text) > limit && n > 0) text = build(--n);
  if (len(text) > limit) text = build(0, false);
  const problems = [];
  if (len(text) > limit) problems.push(`trop long (${len(text)}/${limit})`);
  if (/(^|\s)@\w/.test(text)) problems.push('mention @');
  if (ig && /https?:\/\//.test(text)) problems.push('lien cliquable sur Instagram ou TikTok');
  if (ig && (text.match(/#[\p{L}\p{N}_]+/gu) || []).length > 5) problems.push('plus de 5 mots-clics');
  return { text, len: len(text), limit, problems };
}

/** Textes des réseaux du créneau, avec les limites et mots-clics de leurs modules. */
export function revueTexts(nets, model) {
  const sm = socialModel(model);
  const max = POLICY.hashtags?.maxByNetwork || {};
  const conf = {
    instagram: { limit: 2200, hashtags: max.instagram || 5 },
    tiktok: { limit: 2000, hashtags: 5 },
    bluesky: { limit: 290, hashtags: Math.min(1, max.bluesky ?? 1) }, // 300 graphèmes, marge pour les émojis
    mastodon: { limit: 500, hashtags: Math.min(2, max.mastodon ?? 2) },
  };
  for (const n of ['linkedin', 'facebook', 'x', 'threads']) conf[n] = { limit: NETWORKS[n]?.limit || 1500, hashtags: Math.min(1, NETWORKS[n]?.hashtags ?? 1) };
  return Object.fromEntries(nets.map((n) => [n, revueText(n, { ...model, ...sm, items: sm.items, totalItems: sm.totalItems }, conf[n])]));
}

// ── Exécution ──────────────────────────────────────────────────────────────────
async function sendOne(net, { text, doc, images, model, env, igState, slot, when }) {
  const { createXBuffer } = await import('./channels/x-buffer.mjs');
  const { postMetadata } = await import('./buffer-pages.mjs');
  const pages = rd('data/social/buffer-pages.json', {});
  if (net === 'linkedin') {
    const ch = createXBuffer({ key: env.BUFFER_API_KEY, service: pages.linkedin.service, channelName: pages.linkedin.name, fallbackId: env.BUFFER_LINKEDIN_CHANNEL_ID || null });
    const post = await ch.add({ text, ...when, document: doc, metadata: postMetadata('linkedin') });
    return { id: post.id, status: post.status || '' };
  }
  if (net === 'facebook') {
    const ch = createXBuffer({ key: env.BUFFER_API_KEY, service: pages.facebook.service, channelName: pages.facebook.name, fallbackId: env.BUFFER_FACEBOOK_CHANNEL_ID || null });
    const post = await ch.add({ text, ...when, images, metadata: postMetadata('facebook') });
    return { id: post.id, status: post.status || '' };
  }
  const imgs = images.slice(0, MAX_IMAGES[net] || images.length);
  if (net === 'x') {
    const ch = createXBuffer({ key: env.BUFFER_API_KEY, fallbackId: env.BUFFER_CHANNEL_ID || undefined });
    const post = await ch.add({ text, ...when, images: imgs });
    return { id: post.id, status: post.status || '' };
  }
  if (net === 'threads') {
    // Compte Buffer d'Instagram ; un seul sujet, sans mot-clic (module networks/threads.mjs).
    const ch = createXBuffer({ key: env[pages.threads?.secret || 'BUFFER_INSTAGRAM_API_KEY'], service: 'threads', channelName: pages.threads?.name || 'le.radar.ca', fallbackId: env.BUFFER_THREADS_CHANNEL_ID || null });
    const post = await ch.add({ text, ...when, images: imgs, metadata: { threads: { type: 'post', topic: 'Médias étudiants' } } });
    return { id: post.id, status: post.status || '' };
  }
  if (net === 'tiktok') {
    // Carrousel photo TikTok, compte Buffer d'Instagram (3e canal gratuit). À vérifier à la première publication réelle.
    const ch = createXBuffer({ key: env.BUFFER_INSTAGRAM_API_KEY, service: 'tiktok', channelName: CFG.tiktok?.channelName || 'le.radar.ca', fallbackId: env.BUFFER_TIKTOK_CHANNEL_ID || null });
    const post = await ch.add({ text, ...when, images: imgs });
    return { id: post.id, status: post.status || '' };
  }
  if (net === 'bluesky') {
    const { createBluesky } = await import('./channels/bluesky.mjs');
    const { facets } = await import('./bluesky.mjs');
    const bs = createBluesky({ handle: env.BLUESKY_HANDLE || 'le-radar.ca', password: env.BLUESKY_APP_PASSWORD });
    await bs.login();
    const head = text.split('\n')[0];
    if ((await bs.listPosts(30)).some((p) => p.text.startsWith(head))) return { id: 'deja-present', dedup: true };
    const blobs = [];
    for (const im of imgs) { const b = await bs.uploadImage(im.url); if (!b) throw new Error('image Bluesky refusée'); blobs.push({ image: b, alt: String(im.alt || '').slice(0, 2000), aspectRatio: { width: 1080, height: 1350 } }); }
    const p = await bs.post({ $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString(), langs: ['fr'], facets: facets(text), embed: { $type: 'app.bsky.embed.images', images: blobs } });
    return { id: p.uri, url: p.url };
  }
  if (net === 'mastodon') {
    const { createMastodon, idemKey } = await import('./channels/mastodon.mjs');
    const md = createMastodon({ instance: env.MASTODON_INSTANCE || 'https://piaille.fr', token: env.MASTODON_TOKEN, acct: env.MASTODON_ACCT || 'leradar' });
    const head = text.split('\n')[0];
    if ((await md.listStatuses(30)).some((s) => String(s.content || '').includes(head.slice(3, 40)))) return { id: 'deja-present', dedup: true };
    const ids = [];
    for (const im of imgs) { const id = await md.uploadImage(im.url, im.alt); if (!id) throw new Error('image Mastodon refusée'); ids.push(id); }
    const p = await md.post({ status: text, mediaIds: ids, lang: 'fr', key: idemKey(`revue:${slot.revueId}:mastodon`) });
    return { id: p.id, url: p.url };
  }
  // Instagram : arrêt au premier avertissement ou à la première erreur Buffer (état partagé avec La une), sans réessai.
  const { deliverInstagram, openInstagramIssue } = await import('./instagram.mjs');
  if (igState.halted) return { skip: 'Instagram arrêté après un avertissement ou une erreur Buffer. Aucun réessai.' };
  const allowed = instagramRevueAllowed({ slot, igState });
  if (!allowed.ok) return { skip: `Instagram : ${allowed.why}` };
  const r = await deliverInstagram({ env, text, imageUrl: images[0].url, images, alt: images[0].alt, state: igState, now: new Date().toISOString(), dueAt: when.dueAt,
    slotId: slot.id, format: 'revue', dedupKey: `revue:${slot.revueId}`, fileIssue: openInstagramIssue });
  Object.assign(igState, r.state || {});
  if (r.action !== 'sent') throw Object.assign(new Error(r.reason || 'Instagram non publié'), { final: true });
  return { id: r.id, dedup: !!r.dedup };
}

/**
 * Instagram suit la montée du compte (formats.une.prepared.instagram.ramp) : le format « revue » doit figurer dans la
 * phase du jour, et la revue ne prend jamais la place de La une — la une du soir encore à venir garde sa place dans le
 * plafond du jour (la revue du soir est programmée vers 19 h 15, avant la une de 19 h 30).
 */
export function instagramRevueAllowed({ slot, igState = {}, now = montrealInstant(slot.day, slot.networks.instagram || '12:00'), cfg = POLICY.formats?.une?.prepared?.instagram || {} }) {
  const sent = igState.sent || {};
  const posted = Object.values(sent).filter((s) => s && s.day === slot.day && !s.failed && s.id).length;
  const uneSoirPending = slot.id === 'soir' && !sent[`une:${slot.day}:soir`]?.id ? 1 : 0;
  return instagramSlotAllowed({ now, slotId: slot.id, format: 'revue', cfg, posted: posted + uneSoirPending, dedupKey: `revue:${slot.revueId}`, state: igState });
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
    // Bluesky et Mastodon ne se programment pas : on attend leur heure (passage suivant, toutes les 30 min).
    if (!BUFFER_NETS.has(n) && Date.now() < dueFor(slot, n) - 2 * 60e3) { console.log(`${n} : à ${slot.networks[n]}, publication au premier passage après cette heure.`); continue; }
    try {
      const when = BUFFER_NETS.has(n) ? whenFor(slot, n, Date.now()) : { now: true };
      const r = await sendOne(n, { text: t.text, doc, images, model: rv.model, env, igState, slot, when });
      if (r.skip) { console.log(`${n} : ${r.skip}`); e.attempts = MAX_ATTEMPTS; e.failed = true; e.error = r.skip; continue; }
      Object.assign(e, { at: new Date().toISOString(), id: r.id, failed: false, ...(when.dueAt ? { dueAt: when.dueAt } : {}) });
      console.log(`→ ${n} : ${r.id}${when.dueAt ? ` (programmée pour ${new Date(when.dueAt).toLocaleString('fr-CA', { timeZone: 'America/Toronto' })})` : ' (publiée tout de suite)'}`);
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

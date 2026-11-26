// Compte Buffer réservé à Instagram (le.radar.ca). Jamais la clé du compte principal.
// Publication de fil seulement (type post). Image 3:4 native seulement. Légendes de une-lib.
// Montée lue dans data/social/policy.json. Au premier avertissement ou à la première erreur
// Buffer, arrêt sans réessai. Sans BUFFER_INSTAGRAM_API_KEY : le canal est sauté, les autres réseaux continuent.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { torontoDay, torontoHour, torontoWeekday } from './policy.mjs';
import { createXBuffer } from './channels/x-buffer.mjs';
import { uneTags, igCreditLine } from './une-lib.mjs';
import { buildResultsText, resultsTags } from './formats.mjs';

const execFileAsync = promisify(execFile);

/** Compte principal (secret BUFFER_API_KEY). Comportement inchangé. */
export const MAIN_BUFFER = {
  organizationId: '6ae6c44f8e9f8c0a55ccd241',
  channels: {
    linkedin: '6ae77e7de29c69a1712aa496',
    facebook: '6ae77e08e29c69a1712a8d8d',
    x: '6ae6c47be29c69a171203706',
  },
};

/** Compte Buffer gratuit, canal Instagram seulement. */
export const INSTAGRAM_CHANNEL_ID = '6b012936ece6dfde5f3f554d';
export const INSTAGRAM_CHANNEL_NAME = 'le.radar.ca';
export const INSTAGRAM_SECRET = 'BUFFER_INSTAGRAM_API_KEY';
export const INSTAGRAM_METADATA = { instagram: { type: 'post', shouldShareToFeed: true } };
/** Story de La une (9:16), seulement par la passe story de une-run.mjs (formats.une.story.publish), jamais dans le fil. */
export const INSTAGRAM_STORY_METADATA = { instagram: { type: 'story', shouldShareToFeed: false } };

/** Forme exigée par Buffer (InstagramPostMetadataInput) : `type` et `shouldShareToFeed` sont requis. */
export function instagramMetadataOrThrow(meta = INSTAGRAM_METADATA) {
  const ig = meta && meta.instagram;
  if (!ig || ig.type !== 'post' || ig.shouldShareToFeed !== true) {
    throw new Error('Instagram : metadata Buffer invalide (type post et shouldShareToFeed: true requis)');
  }
  return meta;
}
export const IG_IMAGE = {
  primary: { format: 'grille', width: 1080, height: 1440, ratio: '3:4' },
};
export const IG_CAPTION = { limit: 2200, maxHashtags: 5 };

const MAIN_IDS = new Set(Object.values(MAIN_BUFFER.channels));

/** Retire toute clé qui aurait fui dans un message d'erreur. */
export function scrub(s) {
  return String(s || '')
    .replace(/Bearer\s+\S+/gi, 'Bearer [secret]')
    .replace(/BUFFER_[A-Z0-9_]*KEY\s*[=:]\s*\S+/gi, (m) => m.replace(/\s*[=:]\s*\S+/, '=[secret]'))
    .slice(0, 800);
}

/**
 * Clé du compte Instagram. Vide si le secret manque ou s'il est confondu avec la clé principale :
 * dans les deux cas on saute le canal, sans erreur pour les autres réseaux.
 */
export function instagramKey(env = {}) {
  const key = String(env[INSTAGRAM_SECRET] || '').trim();
  const main = String(env.BUFFER_API_KEY || '').trim();
  if (!key) return { key: '', reason: 'BUFFER_INSTAGRAM_API_KEY absent : Instagram sauté' };
  if (main && key === main) return { key: '', reason: 'la clé Instagram est celle du compte principal : Instagram sauté' };
  return { key, reason: '' };
}

/** Client Buffer qui ne parle qu'au canal Instagram, qu'avec sa clé, et qui s'arrête au premier avertissement. */
export function createInstagramBuffer(env = {}, { fetchImpl } = {}) {
  const got = instagramKey(env);
  if (!got.key) return null;
  const ch = createXBuffer({
    key: got.key,
    fetchImpl,
    service: 'instagram',
    channelName: INSTAGRAM_CHANNEL_NAME,
    fallbackId: INSTAGRAM_CHANNEL_ID,
    allowedChannelId: INSTAGRAM_CHANNEL_ID,
    strictWarnings: true,
  });
  const add = ch.add.bind(ch);
  ch.add = (input = {}) => {
    const type = input.metadata?.instagram?.type || input.type || 'post';
    // Story : seulement sur demande explicite (story: true) de la passe story de La une. Jamais de reel.
    if (input.story === true && type === 'story') {
      if (input.channelId && input.channelId !== INSTAGRAM_CHANNEL_ID) throw new Error('Instagram : canal inattendu');
      return add({ text: input.text || '', image: input.image, alt: input.alt, now: true, metadata: INSTAGRAM_STORY_METADATA });
    }
    if (type !== 'post') throw new Error('Instagram : seul le type post est permis (ni story ni reel)');
    if (input.firstComment || input.metadata?.instagram?.firstComment) throw new Error('Instagram : premier commentaire interdit');
    if (input.channelId && input.channelId !== INSTAGRAM_CHANNEL_ID) throw new Error('Instagram : canal inattendu');
    return add({ text: input.text, image: input.image, alt: input.alt, dueAt: input.dueAt, now: input.now !== false, metadata: instagramMetadataOrThrow(INSTAGRAM_METADATA) });
  };
  return ch;
}

/** Jour 1 = date de départ (jour civil de Montréal). 0 = avant (la présentation du 21 nov. 2026 est déjà faite). */
export function rampDay(now, start) {
  const day = torontoDay(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start || '')) || day < start) return 0;
  return Math.round((Date.parse(day + 'T12:00:00Z') - Date.parse(start + 'T12:00:00Z')) / 864e5) + 1;
}

export function rampPhase(day, phases = []) {
  if (!(day >= 1)) return null;
  return phases.find(p => day >= p.fromDay && (p.toDay == null || day <= p.toDay)) || null;
}

export function postsOnDay(state, day) {
  return Object.values(state?.sent || {}).filter(s => s && s.day === day && !s.failed && s.id).length;
}

/**
 * La montée autorise-t-elle ce format maintenant ?
 * Jours 1-3 : au plus une une du soir. Dès le jour 4 : La une du matin et La une du soir (2 par jour).
 * Dès le jour 15 : résultats sportifs en après-midi (écartés de La une), au plus un par fin de semaine.
 */
export function instagramSlotAllowed({ now = Date.now(), slotId = '', format = 'une', cfg = {}, posted = 0, dedupKey = '', state = {} } = {}) {
  if (dedupKey && state?.sent?.[dedupKey]?.id) return { ok: false, why: 'déjà publié pour cette période' };
  const ramp = cfg?.ramp;
  if (!ramp?.start) return { ok: false, why: 'montée absente de policy.json' };
  const day = rampDay(now, ramp.start);
  const phase = rampPhase(day, ramp.phases || []);
  if (!phase) {
    return { ok: false, day, why: day < 1 ? 'avant la date de départ (présentation du 21 novembre 2026 déjà publiée à la main, non republicée)' : 'aucune phase pour ce jour' };
  }
  if (!(phase.formats || []).includes(format)) return { ok: false, day, phase, why: `format ${format} hors de cette phase` };
  if (format === 'une' && !(phase.slots || []).includes(slotId)) return { ok: false, day, phase, why: `créneau ${slotId} hors de cette phase` };
  const cap = phase.maxPerDay ?? 1;
  if (posted >= cap) return { ok: false, day, phase, why: `plafond du jour atteint (${posted}/${cap})` };
  if (format === 'weekend_results') {
    const s = phase.sports || {};
    const wd = torontoWeekday(now), h = torontoHour(now);
    const days = s.eligibleWeekdays || [1, 2];
    const from = s.hourFrom ?? 12, to = s.hourTo ?? 16;
    if (!days.includes(wd)) return { ok: false, day, phase, why: 'résultats : seulement lundi et mardi' };
    if (h < from || h >= to) return { ok: false, day, phase, why: `résultats : fenêtre ${from} h–${to} h, écartée de La une` };
  }
  return { ok: true, day, phase, why: '' };
}

/** Seulement le visuel 3:4 dessiné pour Instagram. Jamais le portrait d'un autre réseau. */
export function chooseInstagramImage(images = {}) {
  if (images.grille) return { ...IG_IMAGE.primary, ref: images.grille, fallback: false };
  return null;
}

export function imageUrl(ref) {
  if (!ref) return '';
  if (typeof ref === 'string') return ref;
  return ref.url || ref.href || '';
}

export { igCreditLine, embeddedCreditLabel } from './une-lib.mjs';

/** Mots-clics : 3 à 5, précis (établissement, puis #MédiasÉtudiants et #Québec), en fin de légende. Jamais plus de 5. */
export function instagramHashtags(items, max = IG_CAPTION.maxHashtags) {
  return uneTags(items, Math.min(IG_CAPTION.maxHashtags, max > 0 ? max : IG_CAPTION.maxHashtags));
}

export function countHashtags(text) {
  return (String(text || '').match(/#[\p{L}\p{N}_]+/gu) || []).length;
}

/**
 * Légende des résultats sportifs : pas de lien cliquable, le-radar.ca/sports en texte,
 * au plus 5 mots-clics, aucune mention @, crédit 📸 s'il y en a un.
 */
export function instagramResultsCaption(model, { tags = [], credit = '', teamAcc = {} } = {}) {
  const spec = { limit: IG_CAPTION.limit, len: s => [...String(s)].length, subheaders: true };
  const hash = (tags.length ? tags : resultsTags(model, IG_CAPTION.maxHashtags, teamAcc)).slice(0, IG_CAPTION.maxHashtags);
  let text = buildResultsText(model, spec, { link: 'le-radar.ca/sports', teamAcc, tags: hash, maxMentions: 0 });
  if (!text) return null;
  text = text.replace(/https?:\/\/\S+/g, 'le-radar.ca/sports');
  const line = igCreditLine(credit);
  if (line && !text.includes(line)) {
    const hashLine = text.match(/\n\n(#[\p{L}\p{N}_].*)$/u);
    text = hashLine ? text.slice(0, hashLine.index) + '\n\n' + line + hashLine[0] : text + '\n\n' + line;
  }
  return countHashtags(text) <= IG_CAPTION.maxHashtags ? text : null;
}

/**
 * Quoi faire de ce passage. `preview` = essai à blanc (légende et image, aucun appel Buffer).
 * `skip` = on n'envoie pas, sans faire échouer les autres réseaux. `send` = un seul essai.
 */
export function decideInstagram({ now = Date.now(), slotId = '', format = 'une', cfg = {}, state = {}, dry = false, env = {}, text = '', problems = [], images = {}, dedupKey = '' } = {}) {
  const image = chooseInstagramImage(images);
  const key = instagramKey(env);
  const posted = postsOnDay(state, torontoDay(now));
  const ramp = instagramSlotAllowed({ now, slotId, format, cfg, posted, dedupKey, state });
  const enabled = cfg?.enabled === true;
  const clean = !!(text && !problems?.length && countHashtags(text) <= IG_CAPTION.maxHashtags && [...String(text)].length <= IG_CAPTION.limit);
  const ready = !!(enabled && ramp.ok && key.key && image && clean);
  if (state?.halted) return { action: 'skip', reason: 'Instagram arrêté après un avertissement ou une erreur Buffer. Aucun réessai.', ramp, image, text };
  if (dry) {
    const bits = [enabled ? 'essai à blanc' : 'essai à blanc (instagram.enabled = false, aucun envoi)'];
    if (!ramp.ok) bits.push(ramp.why);
    if (!key.key) bits.push(key.reason);
    if (problems?.length) bits.push('légende : ' + problems.join(', '));
    if (!image) bits.push('aucune image 3:4 ni 4:5');
    return { action: 'preview', reason: bits.filter(Boolean).join(' · '), ready: enabled && ramp.ok && !!key.key && !!image && clean, ramp, image, text };
  }
  if (!enabled) return { action: 'skip', reason: 'instagram.enabled = false', ramp, image, text };
  if (!ramp.ok) return { action: 'skip', reason: ramp.why, ramp, image, text };
  if (!key.key) return { action: 'skip', reason: key.reason, ramp, image, text };
  if (problems?.length) return { action: 'skip', reason: 'légende refusée : ' + problems.join(', '), ramp, image, text };
  if (!clean) return { action: 'skip', reason: 'légende hors format Instagram', ramp, image, text };
  if (!image) return { action: 'skip', reason: 'aucune image 3:4 ni 4:5', ramp, image, text };
  return { action: 'send', reason: 'envoi', ready, ramp, image, text };
}

export function dryRunReport(decision) {
  const img = decision.image;
  const L = [
    '## Instagram — essai à blanc (rien n’est envoyé)',
    '',
    decision.reason || '',
    '',
    img ? `Image : ${img.ratio} ${img.width}×${img.height}${img.fallback ? ' (repli 4:5)' : ' (grille)'}` : 'Image : aucune',
    `Type : post (ni story, ni reel, ni premier commentaire)`,
    '',
    '```text',
    decision.text || '(aucun texte)',
    '```',
    '',
  ];
  return L.join('\n');
}

export function instagramIssue({ reason, slotId = '', format = '', at = '' } = {}) {
  const title = 'Instagram arrêté : premier avertissement ou erreur Buffer';
  const body = [
    'Le canal Instagram (compte Buffer distinct, le.radar.ca) s’est arrêté au premier avertissement ou à la première erreur.',
    '',
    'Aucun réessai n’a été tenté. Les autres réseaux ne sont pas concernés.',
    '',
    at ? `Instant : ${at}` : '',
    slotId ? `Créneau : ${slotId}` : '',
    format ? `Format : ${format}` : '',
    '',
    'Raison :',
    '```',
    scrub(reason),
    '```',
    '',
    'Pour reprendre : corriger la cause, puis retirer `halted` de `data/social/instagram-state.json`.',
  ].filter(Boolean).join('\n');
  return { title, body };
}

/** Vrai si un texte déjà envoyé ou en file a la même première ligne (reprise sans doublon). */
export function alreadyPosted(texts, text) {
  const head = String(text || '').split('\n')[0].trim();
  if (!head) return false;
  return (texts || []).some(t => String(t || '').split('\n')[0].trim() === head);
}

/** Un seul envoi. Toute erreur ou tout avertissement Buffer arrête le canal et ouvre une issue. */
export async function deliverInstagram({ env = {}, text, imageUrl, alt = '', state = {}, fetchImpl, fileIssue, now = new Date().toISOString(), slotId = '', format = 'une', dedupKey = '' } = {}) {
  const ch = createInstagramBuffer(env, { fetchImpl });
  if (!ch) return { action: 'skip', reason: instagramKey(env).reason, state };
  try {
    if (typeof ch.heads === 'function' && alreadyPosted(await ch.heads(), text)) {
      const when = Date.parse(now);
      const day = torontoDay(Number.isFinite(when) ? when : Date.now());
      const sent = { ...(state.sent || {}), [dedupKey || 'dedup']: { at: now, day, slotId, format, id: 'deja-present', dedup: true } };
      return { action: 'sent', id: 'deja-present', dedup: true, state: { ...state, halted: false, sent } };
    }
    const post = await ch.add({ text, image: imageUrl, alt, now: true, metadata: INSTAGRAM_METADATA });
    const when = Date.parse(now);
    const day = torontoDay(Number.isFinite(when) ? when : Date.now());
    const id = post?.id;
    if (!id) throw new Error('Buffer createPost sans identifiant');
    if (MAIN_IDS.has(id)) throw new Error('réponse Buffer sur un canal du compte principal');
    const sent = { ...(state.sent || {}) };
    sent[dedupKey || id] = { at: now, day, slotId, format, id };
    return { action: 'sent', id, state: { ...state, halted: false, sent } };
  } catch (e) {
    const reason = scrub(e?.message || e);
    const next = { ...state, halted: true, retry: false, halt: { at: now, reason, slotId, format } };
    if (fileIssue) {
      try { await fileIssue({ reason, slotId, format, at: now }); }
      catch { /* l'arrêt est déjà posé ; l'issue pourra être recréée à la main */ }
    }
    return { action: 'halt', reason, state: next };
  }
}

/** Ouvre l'issue GitHub. N'est appelé qu'une fois, au moment de l'arrêt. */
export async function openInstagramIssue(info, run = execFileAsync) {
  const { title, body } = instagramIssue(info);
  await run('gh', ['issue', 'create', '--title', title, '--body', body], { timeout: 20000 });
}

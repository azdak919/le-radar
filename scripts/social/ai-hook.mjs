// Accroche et sujet par IA ouverte (Cloudflare Workers AI, niveau gratuit), DÉSACTIVÉ tant que
// CLOUDFLARE_AI_TOKEN et CLOUDFLARE_ACCOUNT_ID sont absents. Tout échec, quota atteint ou sortie
// invalide → null : les scripts gardent la version déterministe (titre en tête, hashtags.mjs).
// Garde-fou : l'accroche ne peut contenir aucun chiffre, guillemet ni nom propre absent du titre/extrait.
import { detectLang } from './lib.mjs';
/** Langue de l'article : champ explicite (lang/language) sinon titre + extrait. */
export const articleLang = it => { const l = String(it?.lang || it?.language || '').toLowerCase().slice(0, 2); return l === 'en' || l === 'fr' ? l : detectLang({ title: it?.bare || it?.title, desc: it?.desc }); };
export const MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8-fast';
export const aiEnabled = (env = process.env) => !!(env.CLOUDFLARE_AI_TOKEN && env.CLOUDFLARE_ACCOUNT_ID && env.SOCIAL_AI !== 'off');
const words = s => new Set((String(s || '').normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []));
/** Accroche acceptable : 20-140 car., aucun chiffre ni mot capitalisé absent de la source, pas de citation ni hashtag. */
export function validHook(hook, it) { return hookReject(hook, it) === null; }
/** Raison du rejet (null si acceptable) : sert au journal du repli, sans jamais le texte des secrets. */
export function hookReject(hook, it) {
  const h = String(hook || '').replace(/\s+/g, ' ').trim();
  if (h.length < 20 || h.length > 140) return `longueur ${h.length}`;
  if (/[«»"“”#@]|https?:/i.test(h)) return 'guillemet, hashtag ou lien';
  const src = words(`${it.bare || it.title} ${it.desc || ''} ${it.author || ''} ${(it.authors || []).join?.(' ') || ''}`);
  for (const n of h.match(/\d+/g) || []) if (!src.has(n)) return `chiffre absent (${n})`;
  for (const w of h.match(/(?<=\s)\p{Lu}[\p{L}'’-]+/gu) || []) if (!src.has(w.toLowerCase().replace(/['’].*$/, '')) && !src.has(w.toLowerCase())) return `nom absent (${w})`;
  return null;
}
/** Langue de l'accroche : null si trop courte pour trancher (aucun mot-outil décisif). */
export function hookLang(h) {
  const a = detectLang({ title: `${h} the` }), b = detectLang({ title: `${h} le` });
  return a === 'en' && b === 'fr' ? null : detectLang({ title: h });
}
/** La réponse Workers AI peut être une chaîne (JSON parfois entouré de texte ou de ```) ou déjà un objet. */
export function parseAi(out) {
  if (out && typeof out === 'object') return out;
  const m = String(out || '').match(/\{[\s\S]*\}/)?.[0];
  if (!m) return null;
  try { return JSON.parse(m); } catch { return null; }
}
export const TOPICS = ['Politique', 'Sport', 'Culture', 'Environnement', 'Santé', 'Éducation', 'Société', 'International', 'Science', 'Économie'];
/** { hook, topic } ou null. fetchImpl injectable pour les tests. */
export async function aiHook(it, opts = {}) { const r = await aiHookDetail(it, opts); return !r || r.fail ? null : r.reason ? { hook: null, topic: r.topic } : r; }
/** Comme aiHook, avec { reason } (et fail: true si l'appel lui-même a échoué) : journal du repli. */
export async function aiHookDetail(it, { env = process.env, fetchImpl = fetch, lang = articleLang(it) } = {}) {
  if (!aiEnabled(env)) return { hook: null, topic: null, reason: 'IA désactivée', fail: true };
  const L = lang === 'en' ? 'anglais (English)' : 'français';
  const prompt = `Article d'un média étudiant (${lang}). Titre : ${it.bare || it.title}\nExtrait : ${(it.desc || '').slice(0, 600)}\n` +
    `Réponds en JSON {"hook":"…","topic":"…"} : hook = une phrase d'accroche (≤ 120 caractères) écrite OBLIGATOIREMENT en ${L}, la langue de l'article, fondée UNIQUEMENT sur le titre et l'extrait, sans chiffre, nom ni citation absents du texte ; topic = un de ${TOPICS.join(', ')}.`;
  try {
    const r = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${MODEL}`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.CLOUDFLARE_AI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], max_tokens: 120, temperature: 0.2 }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { hook: null, topic: null, reason: `HTTP ${r.status ?? '?'}${r.status === 429 ? ' (quota)' : ''}`, fail: true };
    const j = parseAi((await r.json())?.result?.response);
    if (!j || typeof j !== 'object') return { hook: null, topic: null, reason: 'réponse non JSON', fail: true };
    const topic = TOPICS.includes(j.topic) ? j.topic : null;
    const hook = typeof j.hook === 'string' ? j.hook.trim().replace(/^[«"“]\s*|\s*[»"”]$/g, '') : '';
    const why = hookReject(hook, it);
    if (why) return { hook: null, topic, reason: `garde-fou : ${why}` };
    const hl = hookLang(hook);
    if (hl && hl !== lang) return { hook: null, topic, reason: `langue ${hl} ≠ ${lang}` }; // jamais d'accroche dans une autre langue
    return { hook, topic };
  } catch (e) { return { hook: null, topic: null, reason: `appel en échec (${e?.name || 'erreur'})`, fail: true }; }
}

// Budget : ~5 neurones par appel (llama 3.1 8B fp8, ~450 jetons). Plafond par exécution très
// en deçà des 10 000 neurones/jour gratuits (≈ 100 exécutions × 12 appels × 5 ≈ 6 000).
export const MAX_CALLS_PER_RUN = Number(process.env.SOCIAL_AI_MAX || 12);
let calls = 0; const cache = new Map();
/** Pose it.aiHook (accroche validée) si l'IA répond ; sinon rien (repli déterministe). Jamais Mastodon. */
export async function withHook(it, opts = {}) {
  if (!it || !aiEnabled(opts.env)) return it;
  if (cache.has(it.id)) { const h = cache.get(it.id); if (h) it.aiHook = h; return it; }
  if (calls >= (opts.max ?? MAX_CALLS_PER_RUN)) return it;
  calls++;
  const r = await aiHookDetail(it, opts);
  cache.set(it.id, r?.hook || null);
  if (r?.hook) it.aiHook = r.hook;
  console.log(`IA : ${r?.hook ? 'accroche retenue' : `repli déterministe — ${r?.reason || 'aucune réponse'}`} (${it.id})`);
  return it;
}

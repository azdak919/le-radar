// Interactions automatiques sous les publications du Radar (logique pure, testable).
// Réponses : un seul émoji d'une liste blanche, jamais de texte. Dans le doute : rien.
import { MODEL } from './ai-hook.mjs';

export const EMOJIS = ['👍', '❤️', '🙏', '👏', '😊', '🙌', '💯', '🔥'];
export const MAX_PER_POST = 3, MAX_PER_DAY = 20, MAX_AGE_H = 48, MIN_ACCOUNT_DAYS = 30;
const SPAM = /(https?:\/\/|www\.|\bt\.me\/|bit\.ly|crypto|bitcoin|airdrop|onlyfans|promo code|code promo|dm me|écris[- ]moi en (mp|privé)|forex|casino)/i;
const NEG = /(merde|fuck|shit|con(ne)?s?\b|idiot|stupide|nul(le)?\b|honte|menteur|fake|propagande|trudeau|poilievre|legault|carney|trump|pq\b|caq\b|plq\b|\bndp\b|libéraux|conservateurs|woke|facho|gauchiste)/i;

export const emptyState = () => ({ done: {}, daily: {} });
export const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
export function budget(state, net, now = new Date()) { return MAX_PER_DAY - (state.daily?.[dayKey(now)]?.[net] || 0); }
export function spend(state, net, n = 1, now = new Date()) {
  const k = dayKey(now); state.daily ||= {}; state.daily[k] ||= {}; state.daily[k][net] = (state.daily[k][net] || 0) + n;
  for (const d of Object.keys(state.daily)) if (d < dayKey(new Date(now - 7 * 864e5))) delete state.daily[d];
}
export const seen = (state, id) => !!state.done?.[id];
export function mark(state, id, now = new Date()) {
  state.done ||= {}; state.done[id] = now.toISOString();
  const cut = new Date(now - 30 * 864e5).toISOString();
  for (const [k, v] of Object.entries(state.done)) if (v < cut) delete state.done[k];
}

/** Compte acceptable : abonnés > 0, âgé d'au moins 30 jours si connu, pas de profil vide/suspect. */
export function okAccount({ followers, createdAt, posts, name = '' }, now = new Date()) {
  if (!(Number(followers) > 0)) return false;
  if (createdAt && (now - new Date(createdAt)) / 864e5 < MIN_ACCOUNT_DAYS) return false;
  if (posts != null && Number(posts) < 3) return false;
  if (SPAM.test(name)) return false;
  return true;
}
/** Filtre déterministe prudent : lien, pourriel, mots négatifs ou partisans → rien. */
export function preFilter(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 500) return false;
  if (SPAM.test(t) || NEG.test(t)) return false;
  return true;
}
/** Repli sans IA : seulement des cas clairement positifs. */
export function fallbackEmoji(text) {
  const t = String(text || '').toLowerCase();
  if (/(merci|thanks|thank you|bravo|félicitations|congrats|super|génial|excellent|great|love|j'adore|beau travail|bien dit)/.test(t)) return /(merci|thank)/.test(t) ? '🙏' : /(love|adore)/.test(t) ? '❤️' : '👍';
  return null;
}
/** Workers AI : { ok, emoji } ; toute anomalie → null (le repli prudent décide). */
export async function aiClassify(text, { env = process.env, fetchImpl = fetch } = {}) {
  if (!env.CLOUDFLARE_AI_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) return null;
  const sys = `Tu modères les réponses sous les publications d'un média étudiant. Réponds UNIQUEMENT en JSON {"safe":true|false,"emoji":"..."}. safe=false si le message est négatif, critique, hostile, haineux, sarcastique, politique partisan, une question, une plainte, une pub ou un pourriel, ou si tu as le moindre doute. Sinon safe=true et emoji parmi : ${EMOJIS.join(' ')}.`;
  try {
    const r = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${MODEL}`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.CLOUDFLARE_AI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: sys }, { role: 'user', content: String(text).slice(0, 500) }], max_tokens: 30, temperature: 0 }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const out = String((await r.json())?.result?.response || '');
    const m = out.match(/\{[^}]*\}/); if (!m) return null;
    const j = JSON.parse(m[0]);
    if (j.safe !== true) return { ok: false };
    return EMOJIS.includes(j.emoji) ? { ok: true, emoji: j.emoji } : { ok: true, emoji: null };
  } catch { return null; }
}
/** Décision finale : null = ne rien faire ; { like:true, emoji|null }. */
export async function decide(text, opts = {}) {
  if (!preFilter(text)) return null;
  const ai = opts.noAi ? null : await aiClassify(text, opts);
  if (ai && !ai.ok) return null;
  const fb = fallbackEmoji(text);
  if (!ai) return fb ? { like: true, emoji: fb } : null; // IA absente : seulement le clairement positif
  return { like: true, emoji: ai.emoji || fb || '👍' };
}

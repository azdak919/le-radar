// Accroche et sujet par IA ouverte (Cloudflare Workers AI, niveau gratuit), DÉSACTIVÉ tant que
// CLOUDFLARE_AI_TOKEN et CLOUDFLARE_ACCOUNT_ID sont absents. Tout échec, quota atteint ou sortie
// invalide → null : les scripts gardent la version déterministe (titre en tête, hashtags.mjs).
// Garde-fou : l'accroche ne peut contenir aucun chiffre, guillemet ni nom propre absent du titre/extrait.
export const MODEL = '@cf/meta/llama-3.1-8b-instruct';
export const aiEnabled = (env = process.env) => !!(env.CLOUDFLARE_AI_TOKEN && env.CLOUDFLARE_ACCOUNT_ID && env.SOCIAL_AI !== 'off');
const words = s => new Set((String(s || '').normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []));
/** Accroche acceptable : 20-140 car., aucun chiffre ni mot capitalisé absent de la source, pas de citation ni hashtag. */
export function validHook(hook, it) {
  const h = String(hook || '').replace(/\s+/g, ' ').trim();
  if (h.length < 20 || h.length > 140 || /[«»"“”#@]|https?:/i.test(h)) return false;
  const src = words(`${it.bare || it.title} ${it.desc || ''}`);
  for (const n of h.match(/\d+/g) || []) if (!src.has(n)) return false;
  for (const w of h.match(/(?<=\s)\p{Lu}[\p{L}'’-]+/gu) || []) if (!src.has(w.toLowerCase().replace(/['’].*$/, '')) && !src.has(w.toLowerCase())) return false;
  return true;
}
export const TOPICS = ['Politique', 'Sport', 'Culture', 'Environnement', 'Santé', 'Éducation', 'Société', 'International', 'Science', 'Économie'];
/** { hook, topic } ou null. fetchImpl injectable pour les tests. */
export async function aiHook(it, { env = process.env, fetchImpl = fetch, lang = 'fr' } = {}) {
  if (!aiEnabled(env)) return null;
  const prompt = `Article d'un média étudiant (${lang}). Titre : ${it.bare || it.title}\nExtrait : ${(it.desc || '').slice(0, 600)}\n` +
    `Réponds en JSON {"hook":"…","topic":"…"} : hook = une phrase d'accroche (≤ 120 caractères, langue de l'article) fondée UNIQUEMENT sur le titre et l'extrait, sans chiffre, nom ni citation absents du texte ; topic = un de ${TOPICS.join(', ')}.`;
  try {
    const r = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${MODEL}`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.CLOUDFLARE_AI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], max_tokens: 120, temperature: 0.2 }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const out = (await r.json())?.result?.response || '';
    const j = JSON.parse(String(out).match(/\{[\s\S]*\}/)?.[0] || 'null');
    if (!j) return null;
    return { hook: validHook(j.hook, it) ? j.hook.trim() : null, topic: TOPICS.includes(j.topic) ? j.topic : null };
  } catch { return null; }
}

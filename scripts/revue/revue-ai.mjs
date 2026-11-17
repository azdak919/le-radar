// Résumés et chapeau de la revue par l'IA déjà intégrée au projet (Cloudflare Workers AI, même modèle, mêmes secrets et même
// interrupteur que l'accroche IA des réseaux : scripts/social/ai-hook.mjs). DÉSACTIVÉ sans CLOUDFLARE_AI_TOKEN et
// CLOUDFLARE_ACCOUNT_ID (ou SOCIAL_AI=off / REVUE_AI=off). Tout échec, quota, JSON invalide ou texte refusé par le garde-fou
// (revue-lib.mjs textReject : chiffre, nom ou date relative absents de la source, autre langue que le français) → repli
// déterministe, article par article. Les secrets ne sont jamais écrits dans le journal.
import { MODEL, aiEnabled as socialAiEnabled, parseAi, TOPICS } from '../social/ai-hook.mjs';
import { textReject, itemReject, itemSource, THEMES } from './revue-lib.mjs';

export { MODEL };
export const aiEnabled = (env = process.env) => socialAiEnabled(env) && env.REVUE_AI !== 'off';
const TOPIC_TO_THEME = Object.fromEntries(TOPICS.map(t => [t, THEMES.includes(t) ? t : 'Vie de campus']));

async function run(prompt, { env, fetchImpl, maxTokens }) {
  const r = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${MODEL}`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.CLOUDFLARE_AI_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0.2 }), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status ?? '?'}${r.status === 429 ? ' (quota)' : ''}`);
  return parseAi((await r.json())?.result?.response);
}
export function itemsPrompt(batch) {
  return 'Revue de presse des médias étudiants du Québec. Pour chaque article numéroté, écris en FRANÇAIS un résumé neutre ' +
    "d'une seule phrase (80 à 200 caractères), fondé UNIQUEMENT sur le titre et l'extrait fournis : aucun chiffre, nom propre, " +
    'citation ni date qui ne figure pas dans le texte, aucun guillemet, jamais « demain », « hier », « aujourd’hui » ni « week-end » ; ' +
    'un article en anglais est résumé en français. Garde comme sujet la personne ou l’organisation nommée dans le titre, ' +
    'ne la remplace jamais par une autre personne de l’extrait, et n’affirme rien que le texte ne dit pas ; un titre en forme de ' +
    'question se résume par une question. Choisis aussi un thème parmi : ' + TOPICS.join(', ') + '.\n' +
    'Réponds seulement en JSON : {"items":[{"n":1,"resume":"…","theme":"…"}]}\n\n' +
    batch.map((x, i) => `${i + 1}. [${x.lang}] Titre : ${x.title}\nExtrait : ${String(x.excerpt || '').slice(0, 400)}`).join('\n\n');
}
export function chapeauPrompt(items) {
  return 'Tu rédiges le chapeau d’une revue de presse des médias étudiants du Québec. À partir SEULEMENT des titres ci-dessous, ' +
    'écris en FRANÇAIS deux phrases neutres (au plus 380 caractères au total) qui présentent les grands sujets, sans chiffre, ' +
    'sans nom propre absent des titres, sans guillemet, sans « demain », « hier », « aujourd’hui » ni « week-end ». ' +
    'Réponds seulement en JSON : {"chapeau":"…"}\n\n' + items.map(x => `- ${x.title} (${x.source})`).join('\n');
}
/**
 * { chapeau, items: { id: { resume, theme } }, model, log: [...] } ; jamais d'exception. `items` = articles de revue-lib.selectArticles.
 */
export async function aiReview(items, { env = process.env, fetchImpl = fetch, batchSize = 8, maxCalls = 6 } = {}) {
  const out = { chapeau: '', items: {}, model: MODEL, log: [] };
  if (!aiEnabled(env)) { out.log.push('IA désactivée (secrets absents ou interrupteur) : gabarit déterministe.'); return out; }
  let calls = 0;
  for (let i = 0; i < items.length && calls < maxCalls - 1; i += batchSize) {
    const batch = items.slice(i, i + batchSize); calls++;
    try {
      const j = await run(itemsPrompt(batch), { env, fetchImpl, maxTokens: 90 * batch.length + 60 });
      const list = Array.isArray(j?.items) ? j.items : [];
      batch.forEach((x, k) => {
        const a = list.find(e => Number(e?.n) === k + 1) || list[k];
        const resume = typeof a?.resume === 'string' ? a.resume.replace(/\s+/g, ' ').trim().replace(/^[«"“]\s*|\s*[»"”]$/g, '') : '';
        const theme = TOPIC_TO_THEME[a?.theme] || '';
        const why = resume ? itemReject(resume, x) : 'aucun résumé';
        if (why) out.log.push(`repli (extrait) — ${why} : ${x.id}`);
        out.items[x.id] = { resume: why ? '' : resume, theme };
      });
    } catch (e) { out.log.push(`lot ${i / batchSize + 1} en échec (${String(e?.message || e?.name || 'erreur').slice(0, 80)}) : extraits d'origine.`); }
  }
  if (items.length && calls < maxCalls) {
    try {
      const j = await run(chapeauPrompt(items.slice(0, 25)), { env, fetchImpl, maxTokens: 200 });
      const c = typeof j?.chapeau === 'string' ? j.chapeau.replace(/\s+/g, ' ').trim() : '';
      const why = c ? textReject(c, items.map(itemSource).join(' '), { min: 60, max: 420 }) : 'aucun chapeau';
      if (why) out.log.push(`chapeau refusé (${why}) : phrase factuelle seulement.`); else out.chapeau = c;
    } catch (e) { out.log.push(`chapeau en échec (${String(e?.message || 'erreur').slice(0, 80)}).`); }
  }
  const n = Object.values(out.items).filter(x => x.resume).length;
  out.log.push(`IA ${MODEL} : ${n}/${items.length} résumé(s) retenu(s)${out.chapeau ? ', chapeau retenu' : ''}.`);
  return out;
}

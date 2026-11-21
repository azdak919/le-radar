// Résumés et chapeau de la revue (Cloudflare Workers AI, forfait gratuit seulement).
// Modèle : llama 3.3 70B, meilleur que le 8B des accroches sociales, toujours dans les
// 10 000 neurones/jour et sans facturation à l’usage. Plafond par passage : revue-quality.mjs.
// DÉSACTIVÉ sans CLOUDFLARE_AI_TOKEN et CLOUDFLARE_ACCOUNT_ID (ou SOCIAL_AI=off / REVUE_AI=off).
// Échec, quota, 403 (modèle réservé au forfait payant), JSON invalide ou texte refusé
// → extrait fidèle du chapô, article par article. Les secrets ne sont jamais écrits.
import { aiEnabled as socialAiEnabled, parseAi, TOPICS } from '../social/ai-hook.mjs';
import { itemReject, ledeReject, highlights, THEMES, chapoFallback } from './revue-lib.mjs';
import { estimateNeurons, NEURON_BUDGET_PER_RUN } from './revue-quality.mjs';

/** Libre sur le forfait Workers gratuit. Pas kimi-k2 ni glm-5.2 (réservés au forfait payant). */
export const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const aiEnabled = (env = process.env) => socialAiEnabled(env) && env.REVUE_AI !== 'off';
const TOPIC_TO_THEME = Object.fromEntries(TOPICS.map(t => [t, THEMES.includes(t) ? t : 'Vie de campus']));
const sourceOf = x => String(x.body || x.excerpt || '').slice(0, 1000);

function accept(x, resume, theme) {
  const why = resume ? itemReject(resume, x) : 'aucun résumé';
  if (!why) return { resume, theme, resumeBy: 'ia', why: '' };
  const chapo = chapoFallback(x);
  return { resume: chapo, theme, resumeBy: chapo ? 'chapo' : '', why };
}

async function run(prompt, { env, fetchImpl, maxTokens }) {
  const r = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${MODEL}`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.CLOUDFLARE_AI_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0.2 }), signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error(`HTTP ${r.status ?? '?'}${r.status === 429 ? ' (quota)' : ''}${r.status === 403 ? ' (forfait)' : ''}`);
  return parseAi((await r.json())?.result?.response);
}

export function itemsPrompt(batch) {
  return 'Revue de presse des médias étudiants du Québec. Pour chaque article numéroté, écris en FRANÇAIS deux ou trois phrases ' +
    '(240 à 520 caractères), au ton d’un journal. Pars du chapô, pas du titre seul : dis qui, quoi, où et pourquoi, ' +
    'et ajoute ce que le titre ne dit pas. Fondé UNIQUEMENT sur le titre et le chapô : aucun chiffre, nom propre, ' +
    'citation ni date qui ne figure pas dans le texte, aucun guillemet, jamais « demain », « hier », « aujourd’hui » ni « week-end ». ' +
    'Un article en anglais est résumé en français. Garde comme sujet la personne ou l’organisation nommée dans le titre, ' +
    'ne la remplace jamais par une autre personne du chapô, et n’affirme rien que le texte ne dit pas. Un titre en forme de ' +
    'question se termine par une question. Choisis aussi un thème parmi : ' + TOPICS.join(', ') + '.\n' +
    'Réponds seulement en JSON : {"items":[{"n":1,"resume":"…","theme":"…"}]}\n\n' +
    batch.map((x, i) => `${i + 1}. [${x.lang}] Titre : ${x.title}\nChapô : ${sourceOf(x)}`).join('\n\n');
}
export function chapeauPrompt(items, edition = 'soir') {
  const label = edition === 'matin' ? 'La revue du matin' : 'La revue du soir';
  return `Tu écris l’amorce de « ${label} », une publication originale du Radar (revue de presse des médias étudiants du Québec). ` +
    'Écris en FRANÇAIS exactement deux phrases naturelles (140 à 340 caractères au total), au ton d’un journal, qui mettent en avant ' +
    'deux ou trois articles marquants de la liste, de médias différents, en nommant leur média (par exemple : Le Collectif revient sur…, tandis que The Link raconte…). ' +
    'Écris chaque nom de média une seule fois et exactement comme dans la liste (The Campus reste The Campus, jamais « Le Campus »), et aucun mot anglais hors de ces noms. ' +
    'Reprends fidèlement les noms propres des titres, n’invente aucun fait, aucun chiffre, aucun nombre ni aucune date, n’utilise aucun guillemet, ' +
    'jamais « demain », « hier », « aujourd’hui », « ce soir » ni « week-end », aucune formule générique (« sujets variés », « mettent en lumière », ' +
    '« au cœur de ») et ne compte pas les articles. Ne commence pas par « Les médias étudiants ». ' +
    'Réponds seulement en JSON : {"chapeau":"…"}\n\n' + items.map(x => `- ${x.title} (média : ${x.source}) — ${sourceOf(x).slice(0, 280)}`).join('\n');
}
/**
 * { chapeau, items: { id: { resume, theme, resumeBy } }, model, neurons, log } ; jamais d'exception.
 * `items` = articles de revue-lib.selectArticles (champ `body` = chapô).
 */
export async function aiReview(items, { env = process.env, fetchImpl = fetch, batchSize = 4, maxCalls = 12, edition = 'soir', chapeau = true } = {}) {
  const out = { chapeau: '', items: {}, model: MODEL, neurons: 0, log: [] };
  const fillChapo = (x, why) => {
    const got = accept(x, '', '');
    out.items[x.id] = { resume: got.resume, theme: out.items[x.id]?.theme || '', resumeBy: got.resumeBy, modelText: '', why: why || got.why };
    if (why) out.log.push(`repli (extrait) — ${why} : ${x.id}`);
  };
  if (!aiEnabled(env)) { out.log.push('IA désactivée (secrets absents ou interrupteur) : chapô fidèle.'); return out; }
  let calls = 0;
  let quota = false;
  const budget = Number(env.REVUE_NEURON_BUDGET) > 0 ? Number(env.REVUE_NEURON_BUDGET) : NEURON_BUDGET_PER_RUN;
  const call = async (prompt, maxTokens) => {
    if (quota) throw new Error('plafond de neurones');
    const cost = estimateNeurons(prompt.length, maxTokens);
    if (out.neurons + cost > budget) { quota = true; throw new Error('plafond de neurones'); }
    out.neurons += cost;
    try {
      return await run(prompt, { env, fetchImpl, maxTokens });
    } catch (e) {
      if (/429|403|quota|plafond|forfait/.test(String(e?.message || ''))) quota = true;
      throw e;
    }
  };
  for (let i = 0; i < items.length && calls < maxCalls - 1 && !quota; i += batchSize) {
    const batch = items.slice(i, i + batchSize); calls++;
    const prompt = itemsPrompt(batch);
    const maxTokens = 160 * batch.length + 80;
    try {
      const j = await call(prompt, maxTokens);
      const list = Array.isArray(j?.items) ? j.items : [];
      batch.forEach((x, k) => {
        const a = list.find(e => Number(e?.n) === k + 1) || list[k];
        const resume = typeof a?.resume === 'string' ? a.resume.replace(/\s+/g, ' ').trim().replace(/^[«"“]\s*|\s*[»"”]$/g, '') : '';
        const theme = TOPIC_TO_THEME[a?.theme] || '';
        const got = accept(x, resume, theme);
        if (got.why) out.log.push(`repli (extrait) — ${got.why} : ${x.id}`);
        out.items[x.id] = { resume: got.resume, theme: got.theme, resumeBy: got.resumeBy, modelText: resume, why: got.why };
      });
    } catch (e) {
      const why = String(e?.message || e?.name || 'erreur').slice(0, 80);
      out.log.push(`lot ${Math.floor(i / batchSize) + 1} en échec (${why}) : chapô fidèle.`);
      for (const x of batch) if (!out.items[x.id]) fillChapo(x, why);
    }
  }
  for (const x of items) if (!out.items[x.id]) fillChapo(x, quota ? 'plafond de neurones' : '');
  if (chapeau && items.length && calls < maxCalls && !quota) {
    try {
      const pool = highlights(items, 12);
      const prompt = chapeauPrompt(pool, edition);
      const j = await call(prompt, 220);
      const c = typeof j?.chapeau === 'string' ? j.chapeau.replace(/\s+/g, ' ').trim() : '';
      const why = c ? ledeReject(c, pool) : 'aucune amorce';
      if (why) out.log.push(`amorce refusée (${why}) : amorce déterministe.`); else out.chapeau = c;
    } catch (e) { out.log.push(`chapeau en échec (${String(e?.message || 'erreur').slice(0, 80)}).`); }
  }
  const n = Object.values(out.items).filter(x => x.resumeBy === 'ia').length;
  out.log.push(`IA ${MODEL} : ${n}/${items.length} résumé(s) retenu(s), ~${Math.round(out.neurons)} neurones estimés (plafond ${budget})${out.chapeau ? ', amorce retenue' : ''}.`);
  return out;
}

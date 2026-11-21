// Accroche des articles de médias ANGLOPHONES sur X et Bluesky, sur le modèle repéré par Charles
// (21 nov. 2026) : une courte citation reprise MOT POUR MOT de l'article, puis une phrase en français
// qui dit de quoi parle l'article, « (En anglais) » et le lien vers la fiche le-radar.ca.
//
//   « Montreal police said in an email that “the SPVM does not compile this type of data.” »
//
//   The Link, média étudiant de l’Université Concordia, sous la plume de Nicolas Tremblay, revient sur …
//   (En anglais)
//   https://le-radar.ca/article/<id>/
//
// DÉSACTIVÉE par défaut : data/social/policy.json → automation.ai_en_accroche (false), ou
// SOCIAL_AI_EN_ACCROCHE=on|off (essai). Workers AI, forfait GRATUIT seulement (mêmes secrets que
// ai-hook.mjs). Jamais sur Mastodon (piaille.fr interdit le texte généré par IA), jamais en français.
//
// Partage des rôles, pour ne rien inventer :
// - média, établissement et auteur viennent des MÉTADONNÉES (flux, news.json), jamais de l'IA ;
// - la citation doit se trouver telle quelle dans le texte de l'article (findVerbatim) : on publie
//   la sous-chaîne exacte de la source, sinon pas de citation ;
// - la phrase française ne peut contenir aucun chiffre, nombre écrit, mois, jour, sigle ni nom propre
//   absent de la source (phraseReject) ; sinon tout le modèle est abandonné.
// Tout échec (IA éteinte, quota, page illisible, garde-fou, trop long) → format actuel (lib.mjs).
import { createRequire } from 'node:module';
import { POLICY } from './policy.mjs';
import { articleLang } from './ai-hook.mjs';
import { readFileSync } from 'node:fs';
import { detectLang, norm, articleId } from './lib.mjs';

const require = createRequire(import.meta.url);

/** Modèle : Gemma 4 26B A4B (MoE, 4 B actifs), bon en français et peu coûteux en neurones. */
export const EN_MODEL = process.env.SOCIAL_AI_EN_MODEL || '@cf/google/gemma-4-26b-a4b-it';
/** Réseaux couverts. Mastodon exclu exprès (règles de piaille.fr), Tumblr et Pages non concernés. */
export const EN_NETWORKS = new Set(['x', 'bluesky']);
// Budget : ~1 500 jetons d'entrée + ~150 de sortie ≈ 20 neurones par appel avec Gemma 4 26B
// (9 091 / M en entrée, 27 273 / M en sortie). Plafond par exécution : 4 appels.
export const EN_MAX_CALLS_PER_RUN = Number(process.env.SOCIAL_AI_EN_MAX || 4);
// X (280, lien = 23) et Bluesky (300 graphèmes, lien entier) sont serrés : citation et phrase courtes.
export const QUOTE_MIN = 25, QUOTE_MAX = 120, PHRASE_MIN = 30, PHRASE_MAX = 160;

/** Interrupteur : variable d'essai d'abord, sinon policy.json (absent = éteint). */
export function enAccrocheEnabled(env = process.env, policy = POLICY) {
  const v = String(env.SOCIAL_AI_EN_ACCROCHE || '').toLowerCase();
  if (v === 'on' || v === 'true' || v === '1') return true;
  if (v === 'off' || v === 'false' || v === '0') return false;
  return policy?.automation?.ai_en_accroche === true;
}
const aiReady = env => !!(env.CLOUDFLARE_AI_TOKEN && env.CLOUDFLARE_ACCOUNT_ID && env.SOCIAL_AI !== 'off');

// ── Métadonnées (jamais l'IA) ─────────────────────────────────────────────────
/** Nom français des établissements anglophones (mêmes libellés que mobile/app/js/translate.js). */
export const INSTITUTION_FR = {
  'Concordia University': 'Université Concordia',
  'McGill University': 'Université McGill',
  "Bishop's University": 'Université Bishop’s',
  'Bishop’s University': 'Université Bishop’s',
  'Dawson College': 'Collège Dawson',
  'Vanier College': 'Collège Vanier',
  'John Abbott College': 'Collège John-Abbott',
  'Marianopolis College': 'Collège Marianopolis',
  'Champlain College': 'Collège Champlain',
};
/** Établissement de l'article : champ de l'item, sinon data/article-pages.json, sinon news.json (même lien). */
let _meta = null;
export function institutionOf(it) {
  if (it?.institution) return it.institution;
  if (!_meta) {
    _meta = new Map();
    const rd = rel => { try { return JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')); } catch { return null; } };
    const news = rd('../../news.json'); for (const n of (news?.items || [])) if (n?.link && n.institution) _meta.set(articleId(n.link), n.institution);
    const pages = rd('../../data/article-pages.json'); for (const a of Object.values(pages?.articles || {})) if (a?.link && a.institution && !_meta.has(articleId(a.link))) _meta.set(articleId(a.link), a.institution);
  }
  return _meta.get(articleId(it?.link || '')) || '';
}
/** « de l’Université Concordia », « du Collège Dawson », « de Polytechnique Montréal ». */
export function deInstitution(inst) {
  const fr = INSTITUTION_FR[String(inst || '').trim()] || String(inst || '').trim();
  if (!fr) return '';
  if (/^(Collège|Cégep|Cegep)\b/.test(fr)) return `du ${fr}`;
  if (/^[AEIOUYÀÂÉÈÊÎÔÛaeiouyh]/.test(fr)) return `de l’${fr}`;
  return `de ${fr}`;
}

// ── Citation exacte ───────────────────────────────────────────────────────────
// Seules équivalences tolérées : espaces (dont insécables) et formes typographiques des apostrophes
// et guillemets. Lettres, chiffres, ponctuation et casse doivent être identiques. On renvoie la
// sous-chaîne ORIGINALE de la source : c'est elle qui est publiée, jamais le texte de l'IA.
const foldChar = c => /[’‘‛ʼ`´]/.test(c) ? "'" : /[“”„‟"]/.test(c) ? '"' : /\s/.test(c) ? ' ' : c;
function fold(s) {
  const out = [], map = [];
  for (let i = 0; i < s.length; i++) {
    const c = foldChar(s[i]);
    if (c === ' ' && (out.length === 0 || out[out.length - 1] === ' ')) continue;
    out.push(c); map.push(i);
  }
  return { text: out.join(''), map };
}
/** Sous-chaîne exacte de `source` correspondant à `quote` (mots entiers), sinon null. */
export function findVerbatim(quote, source) {
  const q = fold(String(quote || '').trim()).text.trim();
  if (!q) return null;
  const S = fold(String(source || ''));
  let from = 0;
  for (;;) {
    const k = S.text.indexOf(q, from);
    if (k < 0) return null;
    const a = S.map[k], b = S.map[k + q.length - 1] + 1, src = String(source);
    const before = src[a - 1] || ' ', after = src[b] || ' ';
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return src.slice(a, b);
    from = k + 1;
  }
}
/** Raison du rejet de la citation (null si acceptable). `exact` = sous-chaîne retrouvée. */
export function quoteReject(quote, source) {
  const q = String(quote || '').replace(/\s+/g, ' ').trim();
  if (!q) return { why: 'aucune citation proposée' };
  const exact = findVerbatim(q, source);
  if (!exact) return { why: 'citation introuvable telle quelle dans l’article' };
  const n = exact.replace(/\s+/g, ' ').trim();
  if (n.length < QUOTE_MIN || n.length > QUOTE_MAX) return { why: `citation de ${n.length} car. (${QUOTE_MIN}-${QUOTE_MAX})` };
  if (n.split(' ').length < 5) return { why: 'citation de moins de 5 mots' };
  // Une phrase entière, comme dans le modèle : majuscule (ou guillemet) au début, ponctuation finale à la fin.
  if (!/^["“‘«(]?[\p{Lu}\p{N}]/u.test(n) || !/[.!?…]["”’»)]*$/.test(n)) return { why: 'citation qui n’est pas une phrase entière' };
  if (/https?:|@\w|#\w/.test(n)) return { why: 'citation avec lien, @ ou #' };
  if (/tison/i.test(n)) return { why: 'nom interdit' };
  const open = (n.match(/[“«]/g) || []).length, close = (n.match(/[”»]/g) || []).length, straight = (n.match(/"/g) || []).length;
  if (open !== close || straight % 2) return { why: 'citation aux guillemets déséquilibrés' };
  return { why: null, exact: n };
}

// ── Phrase française : aucun fait vérifiable absent de la source ─────────────
const NUM_WORDS = {
  deux: ['2', 'two', 'second'], trois: ['3', 'three', 'third'], quatre: ['4', 'four'], cinq: ['5', 'five'], six: ['6', 'six'],
  sept: ['7', 'seven'], huit: ['8', 'eight'], neuf: ['9', 'nine'], dix: ['10', 'ten'], onze: ['11', 'eleven'], douze: ['12', 'twelve', 'dozen'],
  treize: ['13', 'thirteen'], quatorze: ['14', 'fourteen'], quinze: ['15', 'fifteen'], seize: ['16', 'sixteen'], vingt: ['20', 'twenty'],
  trente: ['30', 'thirty'], quarante: ['40', 'forty'], cinquante: ['50', 'fifty'], soixante: ['60', 'sixty'], cent: ['100', 'hundred'], cents: ['100', 'hundred'],
  mille: ['1000', '000', 'thousand'], million: ['million', 'millions'], millions: ['million', 'millions'], milliard: ['billion', 'billions'], milliards: ['billion', 'billions'],
  douzaine: ['dozen', '12'], dizaine: ['10', 'dozen', 'ten'], dizaines: ['dozens', 'tens'], centaine: ['hundred', 'hundreds'], centaines: ['hundreds'], milliers: ['thousands'],
  moitié: ['half', '50'], tiers: ['third', 'thirds'], quart: ['quarter'], deuxième: ['second', '2nd', '2'], troisième: ['third', '3rd', '3'], quatrième: ['fourth', '4th', '4'],
  double: ['double', 'twice', 'doubled'], triple: ['triple', 'tripled'], majorité: ['majority', 'most'],
};
const MONTHS = { janvier: 'january', février: 'february', mars: 'march', avril: 'april', mai: 'may', juin: 'june', juillet: 'july', août: 'august', septembre: 'september', octobre: 'october', novembre: 'november', décembre: 'december' };
const DAYS = { lundi: 'monday', mardi: 'tuesday', mercredi: 'wednesday', jeudi: 'thursday', vendredi: 'friday', samedi: 'saturday', dimanche: 'sunday' };
// Dates relatives : fausses dès que le post sort un autre jour que l'article.
const RELATIVE = /\b(hier|avant-hier|demain|aujourd[’']hui|ce matin|ce soir|cette semaine|la semaine (dernière|prochaine)|le mois (dernier|prochain)|l[’']an dernier|l[’']année (dernière|prochaine)|récemment)\b/i;
// Majuscules permises sans figurer dans la source (mots français courants).
const CAP_OK = new Set(['québec', 'montréal', 'canada', 'université', 'conseil', 'ville', 'gouvernement', 'assemblée', 'nationale', 'cégep', 'collège', 'premier', 'première', 'ministre', 'état', 'états-unis', 'palestine', 'gaza', 'israël']);
const toks = s => (String(s || '').normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
const bare = s => norm(s).replace(/\s+/g, '');

/** Raison du rejet de la phrase (null si acceptable). `src` = titre + texte + métadonnées. */
export function phraseReject(phrase, src, it = {}) {
  const p = String(phrase || '').replace(/\s+/g, ' ').trim();
  if (p.length < PHRASE_MIN || p.length > PHRASE_MAX) return `phrase de ${p.length} car. (${PHRASE_MIN}-${PHRASE_MAX})`;
  if (!/^\p{Ll}/u.test(p)) return 'la phrase doit commencer par un verbe en minuscule';
  if (!/[.!?…]$/.test(p)) return 'phrase sans point final';
  if (/[«»"“”#@]|https?:/i.test(p)) return 'guillemet, hashtag, @ ou lien dans la phrase';
  if (detectLang({ title: p }) !== 'fr') return 'phrase pas en français';
  if (RELATIVE.test(p)) return 'date relative (hier, cette semaine…)';
  if (/tison/i.test(p)) return 'nom interdit';
  const S = new Set(toks(src)), Sb = new Set(toks(src).map(bare));
  const has = w => S.has(w) || Sb.has(bare(w));
  for (const n of p.match(/\p{N}+/gu) || []) if (!S.has(n)) return `chiffre absent de la source (${n})`;
  for (const w of toks(p)) {
    if (NUM_WORDS[w] && !NUM_WORDS[w].some(has)) return `nombre absent de la source (${w})`;
    if (MONTHS[w] && !has(MONTHS[w]) && !has(w) && !has(MONTHS[w].slice(0, 3))) return `mois absent de la source (${w})`;
    if (DAYS[w] && !has(DAYS[w]) && !has(w)) return `jour absent de la source (${w})`;
  }
  // Noms propres et sigles (mot à majuscule hors début de phrase) : présents dans la source.
  for (const m of p.matchAll(/(?<=[\s(’'-])\p{Lu}[\p{L}’'-]*/gu)) {
    const w = m[0].replace(/[’'].*$/, '').toLowerCase();
    if (CAP_OK.has(w)) continue;
    if (!has(w)) return `nom absent de la source (${m[0]})`;
  }
  // Le média et l'auteur sont déjà écrits par le code : l'IA ne doit pas les répéter.
  for (const name of [it.source, it.author]) if (name && norm(p).includes(norm(name))) return `répète « ${name} »`;
  return null;
}

// ── Texte de l'article ────────────────────────────────────────────────────────
// Début du corps d'article, par ordre de confiance (schema.org, WordPress, The Link). Jamais les cartes
// « articles liés » (cs-entry__content…) : une citation doit venir de CET article.
const BODY_STARTS = ['itemprop=["\']articleBody["\']', 'class=["\'](?:[^"\']*\\s)?entry-content(?:\\s[^"\']*)?["\']', 'class=["\'][^"\']*\\bwp-block-post-content\\b[^"\']*["\']',
  'class=["\'](?:[^"\']*\\s)?(?:content-inner|article-body|article-content|single-content)(?:\\s[^"\']*)?["\']'].map(x => new RegExp(`<[a-z]+\\b[^>]*${x}[^>]*>`, 'i'));
const BODY_END = /<\/article>|<footer\b|<aside\b|<form\b|<script\b|id=["'](?:comments|respond)["']|class=["'][^"']*\b(?:sharedaddy|jp-relatedposts|related-posts|wp-block-query|cs-entry__after|post-navigation|comments-area)\b/i;
const CHROME = /(\bPublished (?:on )?(?:January|February|March|April|May|June|July|August|September|October|November|December)\b|^(?:photo|illustration|graphic|feature image|courtesy)\b|•\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d|^by [\p{Lu}][\p{L}.' -]+$|\bsubscribe\b|\bnewsletter\b|all rights reserved)/iu;
/** Texte brut des paragraphes du corps de l'article (page source), '' si illisible. */
export function articleTextFromHtml(html) {
  const { articleBodyHtml } = require('../article-image-lib.js');
  const { decodeEntities } = require('../html-entities-lib.js');
  const h = String(html || '');
  const paras = chunk => [...String(chunk || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => decodeEntities(m[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim())
    .filter(t => t.length >= 40 && !CHROME.test(t));
  let ps = [];
  for (const re of BODY_STARTS) {
    const k = h.search(re); if (k < 0) continue;
    const rest = h.slice(k, k + 120000), e = rest.slice(1).search(BODY_END);
    ps = paras(e > 0 ? rest.slice(0, e + 1) : rest);
    if (ps.length >= 2) break;
  }
  if (ps.length < 2) ps = paras(articleBodyHtml(h));
  return ps.join('\n\n');
}
/** Texte source : corps de l'article (page) si lisible, sinon l'extrait du flux. */
export async function articleSource(it, { fetchHtml } = {}) {
  let body = '';
  try {
    const get = fetchHtml || (u => require('../article-image-lib.js').fetchText(u, 3, 15000));
    if (it?.link) body = articleTextFromHtml(await get(it.link));
  } catch { body = ''; }
  const text = body.length >= 200 ? body : String(it?.desc || it?.excerpt || '').trim();
  return { text, from: body.length >= 200 ? 'page' : 'extrait' };
}

// ── Appel Workers AI ──────────────────────────────────────────────────────────
export function enPrompt(it, text) {
  return [
    'Tu prépares un message de réseau social pour Le Radar, qui relaie en français les médias étudiants du Québec.',
    'Voici un article en anglais.',
    `Titre : ${it.bare || it.title}`,
    `Texte de l'article :\n${String(text).slice(0, 4000)}`,
    '',
    'Réponds UNIQUEMENT en JSON : {"citation":"…","phrase":"…"}',
    `- citation : UNE PHRASE ENTIÈRE frappante (${QUOTE_MIN} à 100 caractères, de la majuscule au point final) COPIÉE CARACTÈRE POUR CARACTÈRE du texte ci-dessus, en anglais, sans rien changer ni traduire. Pas de guillemets autour. Si rien ne convient, chaîne vide.`,
    `- phrase : en français, ${PHRASE_MIN} à 130 caractères, qui commence par un verbe au présent à la 3e personne (par exemple « revient sur », « se penche sur », « raconte », « explique ») et dit de quoi parle l'article et pourquoi il compte. Elle sera précédée du nom du média et de l'auteur : ne les écris pas.`,
    '- N\'utilise QUE des faits présents dans le texte. Aucun chiffre, date, nom ou sigle qui n\'y figure pas. Pas de date relative (hier, cette semaine). Pas de guillemets, de hashtag ni de lien dans la phrase.',
    'Exemple de ton : {"citation":"Montreal police said in an email that the SPVM does not compile this type of data.","phrase":"revient sur la répression policière lors de la manifestation et sur la séance du conseil municipal où cette question a été abordée."}',
  ].join('\n');
}
/** Texte de la réponse : `result.response` (anciens modèles) ou `result.choices[0].message.content` (format OpenAI). */
export function aiText(j) {
  const r = j?.result ?? j;
  if (typeof r?.response === 'string') return r.response;
  if (r?.response && typeof r.response === 'object') return JSON.stringify(r.response);
  const c = r?.choices?.[0]?.message?.content;
  return typeof c === 'string' ? c : '';
}
export function parseJson(s) {
  const m = String(s || '').replace(/```(?:json)?/g, '').match(/\{[\s\S]*\}/)?.[0];
  if (!m) return null;
  try { return JSON.parse(m); } catch { return null; }
}
// Guillemets d'enrobage ajoutés par l'IA : retirés seulement s'ils forment une paire autour de toute la citation.
const unquote = s => { const t = String(s || '').trim(); const m = t.match(/^[«"“]\s*([\s\S]*?)\s*[»"”]$/); return m && !/["“”«»]/.test(m[1]) ? m[1] : t; };

/**
 * Accroche validée { quote, phrase, institution } ou { reason } (et détails pour l'essai).
 * fetchImpl / fetchHtml injectables pour les tests.
 */
export async function enAccrocheDetail(it, { env = process.env, fetchImpl = fetch, fetchHtml, source, model = EN_MODEL } = {}) {
  const out = { model, reason: null };
  if (articleLang(it) !== 'en') return { ...out, reason: 'article pas en anglais' };
  if (!aiReady(env)) return { ...out, reason: 'Workers AI non configuré' };
  const src = source || await articleSource(it, { fetchHtml });
  out.sourceFrom = src.from; out.sourceLen = src.text.length;
  if (src.text.length < 120) return { ...out, reason: 'texte de l’article trop court' };
  let j;
  try {
    const r = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.CLOUDFLARE_AI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: enPrompt(it, src.text) }], max_tokens: 400, temperature: 0.2, chat_template_kwargs: { enable_thinking: false } }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return { ...out, reason: `HTTP ${r.status ?? '?'}${r.status === 429 ? ' (quota)' : ''}` };
    j = await r.json();
  } catch (e) { return { ...out, reason: `appel en échec (${e?.name || 'erreur'})` }; }
  out.usage = j?.result?.usage || null;
  out.raw = aiText(j);
  const a = parseJson(out.raw);
  if (!a) return { ...out, reason: 'réponse non JSON' };
  out.aiQuote = unquote(a.citation); out.aiPhrase = String(a.phrase || '').replace(/\s+/g, ' ').trim();
  const inst = institutionOf(it);
  const fullSrc = [it.bare || it.title, src.text, it.desc, it.source, it.author, inst, INSTITUTION_FR[inst]].filter(Boolean).join('\n');
  const q = quoteReject(out.aiQuote, src.text); // la citation vient du TEXTE de l'article seulement
  out.quoteCheck = q.why || 'trouvée telle quelle';
  const why = phraseReject(out.aiPhrase, fullSrc, it);
  out.phraseCheck = why || 'aucun chiffre, date ni nom absent de la source';
  if (why) return { ...out, reason: `garde-fou : ${why}` };
  return { ...out, quote: q.exact || '', phrase: out.aiPhrase, institutionFr: deInstitution(institutionOf(it)) };
}

let calls = 0; const cache = new Map();
/** Pose it.enAccroche si l'interrupteur est allumé, l'article en anglais et les garde-fous passent. */
export async function withEnAccroche(it, network, opts = {}) {
  const env = opts.env || process.env;
  if (!it || !EN_NETWORKS.has(network) || !enAccrocheEnabled(env, opts.policy)) return it;
  if (articleLang(it) !== 'en') return it;
  if (cache.has(it.id)) { const c = cache.get(it.id); if (c) it.enAccroche = c; return it; }
  if (calls >= (opts.max ?? EN_MAX_CALLS_PER_RUN)) return it;
  calls++;
  const r = await enAccrocheDetail(it, { ...opts, env });
  const ok = !r.reason && r.phrase ? { quote: r.quote, phrase: r.phrase, institutionFr: r.institutionFr } : null;
  cache.set(it.id, ok);
  if (ok) it.enAccroche = ok;
  console.log(`IA (accroche anglophone) : ${ok ? `retenue${ok.quote ? ' avec citation' : ' sans citation'} [${r.model}]` : `format actuel — ${r.reason}`} (${it.id})`);
  return it;
}
export const _resetForTests = () => { calls = 0; cache.clear(); };

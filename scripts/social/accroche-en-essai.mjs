#!/usr/bin/env node
// Essai À BLANC des accroches anglophones (accroche-en.mjs) sur de vrais articles récents de news.json.
// AUCUNE publication : ce script n'importe aucun canal (Buffer, Bluesky, Mastodon…). Il appelle seulement
// Workers AI (forfait gratuit, plafond --n × modèles appels) et écrit un rapport Markdown.
// Usage : node scripts/social/accroche-en-essai.mjs [--n 10] [--models m1,m2] [--out fichier.md]
import fs from 'node:fs';
import path from 'node:path';
import { enAccrocheDetail, articleSource, EN_MODEL } from './accroche-en.mjs';
import { buildXText, siteLink, xlen, formatOk, enLead, EN_MARK } from './lib.mjs';
import { buildBskyText, graphemes } from './bluesky.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const N = Math.min(15, Number(arg('n', 10)));
const MODELS = String(arg('models', EN_MODEL)).split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
const OUT = arg('out', path.join(ROOT, 'accroches-en-essai.md'));
// Neurones par million de jetons (entrée, sortie), page Pricing de Workers AI (nov. 2026).
const PRICE = { '@cf/google/gemma-4-26b-a4b-it': [9091, 27273], '@cf/mistralai/mistral-small-3.1-24b-instruct': [31876, 50488], '@cf/meta/llama-3.3-70b-instruct-fp8-fast': [26668, 204805], '@cf/meta/llama-3.1-8b-instruct-fp8-fast': [4119, 34868] };
const neurons = (m, u) => { const p = PRICE[m]; if (!p || !u) return null; const i = u.prompt_tokens ?? u.input_tokens ?? 0, o = u.completion_tokens ?? u.output_tokens ?? 0; return Math.round((i * p[0] + o * p[1]) / 1e6 * 10) / 10; };

const env = { ...process.env, SOCIAL_AI: 'on' };
if (!env.CLOUDFLARE_AI_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) { console.log('Workers AI non configuré : rien à essayer.'); process.exit(0); }
const X_ACC = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/social/x-accounts.json'), 'utf8')).accounts;
const B_ACC = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/social/bluesky-accounts.json'), 'utf8')).accounts;
const news = JSON.parse(fs.readFileSync(path.join(ROOT, 'news.json'), 'utf8')).items || [];
// Articles anglophones récents, variés : tour de rôle par média, plus récent d'abord.
const en = news.filter(n => n.lang === 'en' && n.link).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
const by = new Map(); for (const n of en) { if (!by.has(n.source)) by.set(n.source, []); by.get(n.source).push(n); }
const pick = []; for (let r = 0; pick.length < N && r < 20; r++) for (const q of by.values()) if (q[r] && pick.length < N) pick.push(q[r]);

const md = [`# Essai des accroches anglophones — ${new Date().toLocaleString('fr-CA', { timeZone: 'America/Toronto' })} (heure de Montréal)`, '',
  `Aucune publication. Modèle(s) : ${MODELS.join(', ')}. ${pick.length} articles réels de news.json.`, ''];
const totals = Object.fromEntries(MODELS.map(m => [m, { ok: 0, quote: 0, neurons: 0 }]));
let k = 0;
for (const n of pick) {
  const it = { id: n.link, title: n.title, bare: n.title, link: n.link, source: n.source, author: n.author || '', institution: n.institution || '', lang: n.lang, desc: n.excerpt || '', date: new Date(n.date) };
  const credit = n.sourceImageCreator || '';
  const src = await articleSource(it);
  md.push(`## ${++k}. ${n.title}`, '', `- Média : ${n.source} (${n.institution || '?'}) · auteur : ${n.author || '—'} · ${String(n.date).slice(0, 10)}`,
    `- Article : ${n.link}`, `- Fiche Radar : ${siteLink(it)}`, `- Texte source : ${src.from} (${src.text.length} car.)`, '');
  for (const model of MODELS) {
    const r = await enAccrocheDetail(it, { env, source: src, model });
    const nr = neurons(model, r.usage); if (nr) totals[model].neurons += nr;
    const qs = (r.quoteChecks || []).map((q, i) => `  ${i + 1}. « ${q.quote} » → ${q.check}`);
    md.push(`### ${model}`, '', `- Citations proposées par l’IA : ${qs.length ? '' : '—'}`, ...qs, `- Meilleure citation exacte : ${r.bestQuote ? `« ${r.bestQuote} »` : '— (aucune)'}`,
      `- Phrase proposée : ${r.aiPhrase || '—'}`, `- Vérification chiffres, dates et noms : ${r.phraseCheck || '—'}`,
      `- Résultat : ${r.reason ? `**repli au format actuel** (${r.reason})` : r.quote ? 'accroche retenue avec citation' : 'accroche retenue sans citation'}`,
      `- Coût : ${r.usage ? `${r.usage.prompt_tokens ?? r.usage.input_tokens ?? '?'} jetons en entrée, ${r.usage.completion_tokens ?? r.usage.output_tokens ?? '?'} en sortie ≈ ${nr ?? '?'} neurones` : 'inconnu'}`, '');
    if (!r.reason) {
      totals[model].ok++; if (r.quote) totals[model].quote++;
      const a = { ...it, enAccroche: { quote: r.quote, phrase: r.phrase, institutionFr: r.institutionFr } };
      const x = buildXText(a, X_ACC, { credit, photo: !!credit, ai: true }), b = buildBskyText(a, B_ACC, { credit, photo: !!credit });
      const full = [r.quote ? `« ${r.quote} »` : '', `${enLead(a, [], r.institutionFr)}, ${r.phrase}\n${EN_MARK}\n${siteLink(it)}`].filter(Boolean).join('\n\n');
      md.push('Modèle complet (sans limite de longueur) :', '', '```text', full, '```', '',
        `X (${xlen(x)}/280, formatOk ${formatOk(x, a, credit) ? 'oui' : 'NON'}, ${x.includes('(En anglais)') ? 'accroche' : 'format actuel'}) :`, '', '```text', x, '```', '',
        `Bluesky (${graphemes(b)}/300, formatOk ${formatOk(b, a, credit) ? 'oui' : 'NON'}, ${b.includes('(En anglais)') ? 'accroche' : 'format actuel'}) :`, '', '```text', b, '```', '');
    }
    if (r.raw && r.reason) md.push('<details><summary>Réponse brute</summary>', '', '```text', String(r.raw).slice(0, 1200), '```', '', '</details>', '');
  }
}
md.push('## Bilan', '', ...MODELS.map(m => `- ${m} : ${totals[m].ok}/${pick.length} accroches retenues (${totals[m].quote} avec citation), ≈ ${Math.round(totals[m].neurons)} neurones au total`), '');
fs.writeFileSync(OUT, md.join('\n'));
console.log(md.join('\n'));

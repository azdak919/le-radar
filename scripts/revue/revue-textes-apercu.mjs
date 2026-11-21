#!/usr/bin/env node
// Aperçu des huit textes demandés : appel réel à Workers AI (llama 3.3 70B),
// mêmes secrets que la revue, jamais affichés. Écrit un JSON et un commentaire.
// Sans CLOUDFLARE_AI_TOKEN ou CLOUDFLARE_ACCOUNT_ID : nomme le secret manquant et s’arrête.
import fs from 'node:fs';
import path from 'node:path';
import { aiReview, MODEL } from './revue-ai.mjs';
import { NEURON_BUDGET_PER_RUN } from './revue-quality.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const outDir = path.resolve(process.argv[2] || 'apercu-70b');

const missing = ['CLOUDFLARE_AI_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'].filter(k => !process.env[k]);
if (missing.length) {
  const msg = `Secret Cloudflare manquant : ${missing.join(', ')}. Aucun n’a été créé.`;
  console.error(msg);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify({ missing, model: MODEL }, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'commentaire.md'), msg + '\n');
  process.exit(2);
}

const news = JSON.parse(fs.readFileSync(path.join(ROOT, 'news.json'), 'utf8'));
const byTitle = new Map(news.items.map(it => [it.title, it]));
const reviews = fs.readdirSync(path.join(ROOT, 'data/revue/reviews'))
  .filter(f => f.endsWith('.json'))
  .flatMap(f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/revue/reviews', f), 'utf8')).items || []);
const byReviewTitle = new Map(reviews.map(it => [it.title, it]));

// Deuxième phrase lue sur la page publique de La Pige (le fil ne garde que la première).
const SAGUENAY_SUITE = 'L’événement veut rappeler l’importance d’investir tôt dans le développement et le bien-être des enfants de 0 à 5 ans.';

const WANTED = [
  '« Un grand Québec commence petit » : Saguenay lève le drapeau pour les tout-petits',
  'Concordia Student Union byelection results are in',
  'ASFA asks students what issues matter most to them',
  'The conditions of compassion',
  'Why young people should watch more films like Persepolis',
  'La vie lors d’une régate d’aviron',
  'Au marché de Noël de Chicoutimi, les artisans réclament davantage de vérifications',
  'Des étudiants du Cégep de Jonquière à « la COP qui chie »',
];

function article(title) {
  const live = byTitle.get(title);
  const published = byReviewTitle.get(title);
  const base = live || published;
  if (!base) throw new Error(`article introuvable : ${title}`);
  let body = String(live?.leadExcerpt || live?.excerpt || published?.excerpt || '').replace(/\s+/g, ' ').trim();
  if (title.startsWith('« Un grand Québec') && !body.includes('investir tôt')) body = `${body} ${SAGUENAY_SUITE}`;
  return {
    id: live?.id || published?.id || title,
    title,
    lang: live?.lang || published?.lang || 'fr',
    source: live?.source || published?.source || '',
    excerpt: String(published?.excerpt || live?.excerpt || body).slice(0, 200),
    body,
    authors: [],
    old: published?.resume || '',
  };
}

const items = WANTED.map(article);
const results = [];
let neurons = 0;
for (const item of items) {
  const ai = await aiReview([item], { batchSize: 1, maxCalls: 2, chapeau: false });
  const got = ai.items[item.id] || {};
  neurons += ai.neurons || 0;
  const passed = got.resumeBy === 'ia';
  results.push({
    title: item.title,
    source: item.source,
    lang: item.lang,
    texte: got.modelText || '',
    publie: got.resume || '',
    barriere: passed ? 'passée' : 'repli',
    pourquoi: got.why || '',
    neurones: Math.round((ai.neurons || 0) * 10) / 10,
  });
  console.log(`${passed ? 'OK' : 'REPLI'} ${results.at(-1).neurones} neurones — ${item.title}`);
}

const report = { model: MODEL, plafondParPassage: NEURON_BUDGET_PER_RUN, neurones: Math.round(neurons * 10) / 10, resultats: results };
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(report, null, 2) + '\n');

const lines = [
  `Aperçu 70B (\`${MODEL}\`), ${report.neurones} neurones estimés au total. Plafond d’un passage : ${NEURON_BUDGET_PER_RUN}. Forfait gratuit, 10 000 neurones par jour.`,
  '',
];
results.forEach((r, i) => {
  lines.push(`### ${i + 1}. ${r.title}`);
  lines.push('');
  lines.push(`**Texte du modèle.** ${r.texte || '_(aucune réponse)_'}`);
  lines.push('');
  lines.push(`**Barrière.** ${r.barriere}${r.pourquoi ? ` — ${r.pourquoi}` : ''}. Neurones estimés : ${r.neurones}.`);
  if (!r.texte || r.barriere === 'repli') lines.push(`**Texte retenu.** ${r.publie || '_(aucun chapô français)_'}`);
  lines.push('');
});
const md = lines.join('\n');
fs.writeFileSync(path.join(outDir, 'commentaire.md'), md + '\n');
console.log(`Total estimé : ${report.neurones} neurones.`);

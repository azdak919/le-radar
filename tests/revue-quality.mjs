// Barrière des résumés : trop court, trop proche du titre, repli sur le chapô, plafond de neurones.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as L from '../scripts/revue/revue-lib.mjs';
import { aiReview } from '../scripts/revue/revue-ai.mjs';
import { chapoExtract, cutAtLastSentence, estimateNeurons, extraFacts, sentenceCount, titleSimilarity, TITLE_SIMILARITY_MAX, NEURON_BUDGET_PER_RUN, NEURONS_IN_PER_M, NEURONS_OUT_PER_M } from '../scripts/revue/revue-quality.mjs';
import { tokensForBatch } from '../scripts/revue/revue-ai.mjs';

assert.equal(titleSimilarity('même texte', 'même texte'), 1);
assert.ok(titleSimilarity('bonjour', 'xylophone') < 0.2);

const news = JSON.parse(fs.readFileSync('news.json', 'utf8'));
const byId = new Map(news.items.map(it => [it.id, it]));
const soir = JSON.parse(fs.readFileSync('data/revue/reviews/2026-11-19-soir.json', 'utf8'));
const sourceOf = (published) => byId.get(published.id) || news.items.find(it => it.link && published.link && it.link.split('?')[0] === published.link.split('?')[0]) || { title: published.title, excerpt: published.excerpt, leadExcerpt: published.excerpt, lang: published.lang, source: published.source };

for (const published of soir.items.filter(x => x.resume)) {
  const why = L.itemReject(published.resume, { ...published, body: published.excerpt });
  assert.ok(why, `l’ancien résumé doit être refusé : ${published.title} → ${why}`);
  assert.match(why, /trop court|trop proche|longueur|sans point final|question|remplissage|aucun fait/);
}

for (const published of soir.items) {
  const it = sourceOf(published);
  const body = String(it.leadExcerpt || it.excerpt || '');
  const chapo = chapoExtract(body, it.title);
  assert.ok(chapo, `chapô pour ${it.title}`);
  assert.ok(body.replace(/\s+/g, ' ').includes(chapo), 'le chapô est un extrait fidèle');
  const item = { title: it.title, lang: it.lang || 'fr', source: it.source, excerpt: it.excerpt || '', body, authors: [] };
  if (item.lang === 'en') assert.equal(L.chapoFallback(item), '', 'pas de traduction inventée sans modèle');
  else assert.ok(sentenceCount(chapo) >= 1, it.title);
}
assert.ok(soir.items.some(x => x.resume), 'la revue du 19 au soir a publié des résumés d’une phrase');

assert.equal(cutAtLastSentence('Phrase une. Phrase deux. Le thème est « coupé'), 'Phrase une. Phrase deux.');
assert.equal(cutAtLastSentence('rien sans point'), '');
assert.match(L.itemReject('Deux phrases sans point final ici', { title: 'Titre', lang: 'fr', excerpt: 'Deux phrases sans point final ici. Suite.', body: 'Deux phrases sans point final ici. Suite.' }), /sans point final/);
assert.match(L.itemReject('Les victimes sont reconnues. Quel est le facteur qui décide ?', { title: 'The conditions of compassion', lang: 'en', excerpt: 'sympathy', body: 'sympathy' }), /question/);
const asfa = { title: 'ASFA asks students what issues matter most to them', lang: 'en', source: 'The Concordian', excerpt: 'The Arts and Science Federation of Associations (ASFA) received 106 responses to its survey, as of Nov. 3.', body: 'The Arts and Science Federation of Associations (ASFA) received 106 responses to its survey, as of Nov. 3, questioning students on the issues they are facing at Concordia.' };
assert.ok(extraFacts(asfa.body, asfa.title).includes('106'));
assert.match(L.itemReject('L’ASFA cherche à comprendre leurs préoccupations. Elle souhaite mieux comprendre les besoins de ses membres.', asfa), /remplissage|aucun fait/);
assert.equal(L.itemReject('L’ASFA a reçu 106 réponses à son sondage en date du 3 novembre. Les étudiants y parlent de leur vie à Concordia.', asfa), null);

const nearTitle = '« Un grand Québec commence petit » : Saguenay lève le drapeau pour les tout-petits';
const near = 'Saguenay lève le drapeau pour les tout-petits. Un grand Québec commence petit, dit la ville.';
assert.ok(titleSimilarity(near, nearTitle) >= TITLE_SIMILARITY_MAX);
assert.match(L.itemReject(near, { title: nearTitle, lang: 'fr', excerpt: near, body: near }), /proche/);

// Deux éditions, 20 articles, lots de 4 : l’estimation reste sous les 10 000 neurones/jour.
const samplePrompt = 4200;
const sampleOut = tokensForBatch(4);
const perCall = estimateNeurons(samplePrompt, sampleOut);
const perEdition = perCall * 6;
assert.ok(perEdition < NEURON_BUDGET_PER_RUN, `un passage tient dans ${NEURON_BUDGET_PER_RUN} (${perEdition.toFixed(0)})`);
assert.ok(perEdition * 2 < 10000, 'deux éditions restent dans le forfait gratuit');
assert.equal(NEURONS_IN_PER_M, 26668);
assert.equal(NEURONS_OUT_PER_M, 204805);

const one = { id: 'a', title: 'Le conseil vote', lang: 'fr', source: 'Le Collectif', excerpt: 'Le conseil municipal a voté le budget. Les étudiants réclament des logements.', body: 'Le conseil municipal a voté le budget. Les étudiants réclament des logements.' };
let hits = 0;
const quota = async () => { hits++; return { ok: false, status: 429, json: async () => ({}) }; };
const down = await aiReview([one, { ...one, id: 'b' }], { env: { CLOUDFLARE_AI_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'c' }, fetchImpl: quota, batchSize: 1, maxCalls: 6 });
assert.equal(hits, 1, 'un 429 arrête les appels suivants');
assert.equal(down.items.a.resumeBy, 'chapo');
assert.match(down.items.a.resume, /conseil municipal/);
assert.ok(down.log.some(l => /429|quota/.test(l)));

console.log('revue-quality : OK');

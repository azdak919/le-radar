// Photos de repli : pertinentes, jamais logo, jamais répétées — 0 réseau.
// Cas réels d'oct. 2026 : « marche pour le climat, Paris » sur un article
// sur l'Albanie (Le Délit), « Students voting… University of Texas » pour
// un débat à Bishop's, banque Bishop's à 2 photos répétées (The Campus).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
process.env.LE_RADAR_OPENVERSE_MAX = '0';
const require = createRequire(import.meta.url);
const L = require('../scripts/stock-photo-lib.js');
const bank = require('../scripts/campus-photo-bank.js');

const albanie = {
  source: 'Le Délit', institution: 'Université McGill', lang: 'fr',
  title: 'Plus de 130 jours de manifestation en Albanie',
  excerpt: 'Les Albanais sont dans les rues de Tirana, la capitale, depuis mai 2026.',
  stockImage: 'https://live.staticflickr.com/65535/48774243902_25f3d81518_b.jpg',
  imageTitle: 'marche pour le climat du 21 septembre 2019 à Paris',
  imageCredit: 'Photo : Jeanne Menjoulet / CC BY · Openverse',
  imageProvider: 'openverse', imageLicense: 'by',
};
assert.equal(L.stockStillFits(albanie), false, 'marche climat Paris ≠ Albanie');

const debate = {
  source: 'The Campus', institution: "Bishop's University", lang: 'en',
  title: "Bishop's Hosts Provincial Election Debate",
  excerpt: 'Candidates from the Sherbrooke riding debated on campus.',
  stockImage: 'https://upload.wikimedia.org/wikipedia/commons/x/Students_voting_in_Fall_Elections%2C_University_of_Texas_at_Arlington.jpg',
  imageTitle: 'File:Students voting in Fall Elections, University of Texas at Arlington',
  imageProvider: 'wikimedia', imageLicense: 'CC BY 2.0',
};
assert.equal(L.stockStillFits(debate), false, 'Texas ≠ Bishop’s');

// Acceptation = rétention : findStockPhoto refuse ce que stockStillFits retire.
const src = readFileSync(new URL('../scripts/stock-photo-lib.js', import.meta.url), 'utf8');
assert.match(src, /if \(!stockStillFits\(\{ \.\.\.item, \.\.\.result \}\)\) continue;/);

// Banque Bishop's assez large pour ne pas répéter (≥ 6 vues).
const entries = bank.bankEntriesFor ? bank.bankEntriesFor("Bishop's University") : null;
const bishopSrc = readFileSync(new URL('../scripts/campus-photo-bank.js', import.meta.url), 'utf8');
const block = bishopSrc.slice(bishopSrc.indexOf(`"bishop's university": [`), bishopSrc.indexOf(`'polytechnique montreal'`, bishopSrc.indexOf(`"bishop's university": [`)));
assert.ok((block.match(/url:/g) || []).length >= 6, 'banque Bishop’s ≥ 6 photos');
if (entries) assert.ok(entries.length >= 6);

console.log('news-image-relevance OK');

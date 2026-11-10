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

// 1er nov. 2026 — lieu + sujet concordants : pas un faux positif.
const festival = {
  source: 'Impact Campus', institution: 'Université Laval', lang: 'fr',
  title: 'Retour sur le festival d’arts littéraires Québec en toutes lettres',
  excerpt: 'Le festival d’arts littéraires Québec en toutes lettres est de retour pour sa 17e édition.',
  stockImage: 'https://upload.wikimedia.org/wikipedia/commons/3/38/Qu%C3%A9bec_-_Maison_de_la_litt%C3%A9rature_20241031.jpg',
  imageTitle: 'Maison de la littérature, Québec',
  imageProvider: 'wikimedia', imageLicense: 'CC BY-SA 4.0',
};
assert.equal(L.stockStillFits(festival), true, 'Maison de la littérature, Québec = festival littéraire à Québec');
// Le lieu seul ne suffit pas : Québec sans mot de sujet commun.
assert.equal(L.stockStillFits({ ...festival, imageTitle: 'Château Frontenac, Québec',
  stockImage: 'https://upload.wikimedia.org/wikipedia/commons/x/Chateau_Frontenac.jpg' }), false);

// Autre campus nommé (University Park, Penn State) ≠ débat à Bishop's.
const parkDebate = { ...debate,
  stockImage: 'https://upload.wikimedia.org/wikipedia/commons/7/7a/University_Park_MMB_%C2%ABP4_Students%27_Union_Elections_2013.jpg?utm_source=commons.wikimedia.org',
  imageTitle: "File:University Park MMB «P4 Students' Union Elections 2013.jpg" };
assert.equal(L.stockStillFits(parkDebate), false, 'University Park ≠ Bishop’s');
// … et le remplacement vient de la banque du campus de la source.
const repl = bank.pickCampusPhoto(debate, { avoidUrls: [] });
assert.match(repl.imageTitle, /Bishop/);

// Anti-répétition par source, URL avec ou sans ?utm_ : une seule occurrence.
const u = 'https://upload.wikimedia.org/wikipedia/commons/8/82/Bishop%27s_University_campus_2011_04.jpg';
const camp = (title, date, url) => ({ source: 'The Campus', institution: "Bishop's University", title, date,
  link: `https://x/${title}`, stockImage: url, imageProvider: 'campus-bank', imageTitle: "Bishop's University campus 2011 04" });
const lot = [camp('Hockey', '2026-10-30', `${u}?utm_source=commons.wikimedia.org`), camp('Football', '2026-10-29', u)];
assert.equal(bank.dedupeStockBySource(lot), 1);
assert.notEqual(bank.stockKey(lot[0].stockImage), bank.stockKey(lot[1].stockImage || ''));
assert.equal(bank.stockKey(`${u}?utm_x=1`), bank.stockKey(u.replace('%27', "'")));
// pickCampusPhoto respecte l'avoid même quand la forme de l'URL diffère.
const avoidAll = bank.bankEntriesFor("Bishop's University").map((e) => `${e.url}?utm_source=x`);
assert.equal(bank.pickCampusPhoto(debate, { avoidUrls: avoidAll }), null);

console.log('news-image-relevance (lieu, répétition) OK');

// Équipe d'une autre école : « Nipissing Lakers » ≠ Gaiters de Bishop's.
const gaiters = { source: 'The Campus', institution: "Bishop's University", lang: 'en',
  title: 'Strong Start to the Season for the Gaiters', excerpt: 'The Gaiters women’s hockey team opened with two wins.',
  stockImage: "https://upload.wikimedia.org/wikipedia/commons/x/Nipissing_Lakers_women%27s_ice_hockey_%282026%29.jpg",
  imageTitle: "File:Nipissing Lakers women's ice hockey (2026).jpg", imageProvider: 'wikimedia', imageLicense: 'CC BY-SA 4.0' };
assert.equal(L.namesOtherSchoolTeam(gaiters), true);
assert.equal(L.stockStillFits(gaiters), false, 'Nipissing Lakers ≠ Gaiters');
assert.match(bank.pickCampusPhoto(gaiters, { avoidUrls: [] }).imageTitle, /Bishop/);
// Sa propre équipe reste acceptée par cette règle ; Rouge et Or ≠ Carabins.
assert.equal(L.namesOtherSchoolTeam({ ...gaiters, imageTitle: "Bishop's Gaiters football 2019", stockImage: '' }), false);
assert.equal(L.namesOtherSchoolTeam({ source: 'Quartier Libre', institution: 'Université de Montréal',
  imageTitle: 'Rouge et Or football Laval', stockImage: '' }), true);
assert.equal(L.namesOtherSchoolTeam({ source: 'Quartier Libre', institution: 'Université de Montréal',
  imageTitle: 'Carabins de Montréal', stockImage: '' }), false);
console.log('news-image-relevance (équipes) OK');

// Débat à Bishop's : la vraie photo de l'article (« Capture d’écran, le … », 856×1080)
// passe avant la banque campus quand la source exporte ses photos ainsi (The Campus).
const A = require('../scripts/article-image-lib.js');
const shot = 'https://thebucampus.ca/wp-content/uploads/2026/10/capture-decran-le-2026-10-27-a-22.35.07.png';
assert.equal(A.isCropSafePortrait(856, 1080, { url: shot }), false, 'sans indice de source : refus prudent');
assert.equal(A.isCropSafePortrait(856, 1080, { url: shot, screenshotPhotos: true }), true, 'The Campus : vraie photo');
assert.equal(A.isCropSafePortrait(856, 1080, { url: shot.replace('capture-decran', 'affiche-capture-decran'), screenshotPhotos: true }), false, 'affiche : refus');
assert.equal(A.isCropSafePortrait(600, 1080, { url: shot, screenshotPhotos: true }), false, 'trop en hauteur : refus');
assert.equal(A.isCropSafePortrait(686, 1048, { url: 'https://thebucampus.ca/wp-content/uploads/2026/11/capture-decran-le-2026-11-09-a-21.01.30.png', screenshotPhotos: true }), true, 'The Campus Movember 686×1048 : illustration acceptée');
assert.equal(A.isCropSafePortrait(686, 1048, { url: 'https://example.org/wp-content/uploads/2026/11/dessin.png' }), false, 'hors The Campus : seuil 0,66 inchangé');
assert.equal(A.isCropSafePortrait(608, 1080, { url: shot, screenshotPhotos: true }), false, 'story 9:16 The Campus : refus');
assert.equal(A.imageOptionsFromHints({ screenshotPhotos: true }).screenshotPhotos, true);
const sources = JSON.parse(readFileSync(new URL('../news-sources.json', import.meta.url), 'utf8'));
const campusSrc = (sources.sources || Object.values(sources).flat()).find((s) => s && s.name === 'The Campus');
assert.equal(campusSrc?.botHints?.images?.screenshotPhotos, true, 'indice screenshotPhotos sur The Campus');

// Doublon Wikimedia par lieu : une même photo avec ou sans ?utm_ n'entre qu'une fois dans la banque.
const merged = bank.mergeCampusEntries([{ url: u }], [{ url: `${u}?utm_source=commons.wikimedia.org` }, { url: u.replace('%27', "'") }]);
assert.equal(merged.length, 1, 'banque fusionnée sans doublon d’URL');
const keys = bank.bankEntriesFor("Bishop's University").map((e) => bank.stockKey(e.url));
assert.equal(new Set(keys).size, keys.length, 'banque Bishop’s : aucune photo deux fois');
// Réattribution : deux cartes ne reçoivent jamais la même photo sous deux formes d'URL.
const many = bank.bankEntriesFor("Bishop's University").map((e, i) => camp(`c${i}`, `2026-10-${10 + i}`, e.url));
bank.diversifyCampusBankItems(many);
const got = many.filter((it) => it.stockImage).map((it) => bank.stockKey(it.stockImage));
assert.equal(new Set(got).size, got.length, 'diversify : photos uniques par clé');
console.log('news-image-relevance (débat, doublons) OK');

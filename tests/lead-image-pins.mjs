// Non-régression : une affiche-texte écartée ne revient pas à la collecte suivante.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { applyLeadImagePins, isPinnedReject, loadPins } = require('../scripts/lead-image-pins-lib.js');
const { isCandidateImageUrl } = require('../scripts/article-image-lib.js');
const fs = require('fs');

const BAD = 'https://cdn.impactcampus.ca/wp-content/uploads/2026/10/22163152/Capture-decran-le-2026-10-22-a-16.27.40.png';
const LINK = 'https://impactcampus.ca/arts-et-culture/retour-sur-le-festival-darts-litteraires-quebec-en-toutes-lettres/';

assert.equal(isPinnedReject(BAD), true);
assert.equal(isPinnedReject(BAD + '?v=2'), true);
assert.equal(isCandidateImageUrl(BAD), false, 'fetch-news ne doit plus accepter l\'affiche');

// Simule fetch-news qui remet l'image vedette et efface le repli.
const item = { link: LINK, image: BAD, sourceImageCredit: 'Photo : Impact Campus' };
applyLeadImagePins([item]);
assert.equal(item.image, '');
assert.equal(item.sourceImageCredit, undefined);
assert.match(item.stockImage, /Maison_de_la_litt/);
assert.match(item.imageCredit, /Pymouss/);

// Données publiées conformes + photo unique.
const news = JSON.parse(fs.readFileSync(new URL('../news.json', import.meta.url)));
const live = news.items.find((i) => i.link === LINK);
if (live) {
  assert.notEqual(live.image, BAD);
  assert.match(live.stockImage || '', /Maison_de_la_litt/);
}
for (const i of news.items) assert.equal(isPinnedReject(i.image), false, `affiche rejetée revenue : ${i.title}`);
const pins = loadPins();
for (const [, pin] of pins.pins) {
  const n = news.items.filter((i) => (i.stockImage || i.image) === pin.stockImage).length;
  assert.ok(n <= 1, 'photo imposée en double');
}
console.log('lead-image-pins: ok');

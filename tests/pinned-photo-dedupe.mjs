// Une photo imposée (data/lead-image-pins.json) ne sert jamais à deux billets :
// le billet épinglé la garde, l'autre prend une autre photo (ou l'image par défaut).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { dedupeCardImages } = require('../scripts/ensure-lead-images.js');
const { loadPins } = require('../scripts/lead-image-pins-lib.js');

const [link, pin] = [...loadPins().pins.entries()].find(([, p]) => p.stockImage);
const pinned = { title: 'Épinglé', link, source: 'X', date: '2026-10-01', image: '', stockImage: pin.stockImage, imageCredit: 'a' };
const other = { title: 'Autre plus récent', link: 'https://example.org/autre/', source: 'Y', date: '2026-11-02', image: '', stockImage: pin.stockImage, imageCredit: 'a' };
await dedupeCardImages([other, pinned]);
assert.equal(pinned.stockImage, pin.stockImage, 'le billet épinglé garde sa photo');
assert.notEqual(other.stockImage, pin.stockImage, 'photo imposée en double');
const m = new Date().getMonth(), d = new Date().getDate();
if ((m === 10 && d < 15) || (m > 3 && m < 10)) assert.ok(!/snow|neige|winter|hiver/i.test(other.stockImage || ''), 'pas de neige hors saison');
console.log('pinned-photo-dedupe: ok');

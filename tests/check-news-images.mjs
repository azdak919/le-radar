// Sonde des images du fil : un 415 ou un pin keepSourceImage ne vide pas l'URL.
// Cas Karmina (16 nov. 2026) : HTTP 415 text/html, pas de miroir (imageRemoteOnly),
// image vidée alors que le point focal restait. 0 réseau.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const H = require('../scripts/check-news-images.js');
const { loadPins } = require('../scripts/lead-image-pins-lib.js');

const url = 'https://quartierlibre.ca/wp-content/uploads/2026/11/16_critique-cine.jpeg';
const link = 'https://quartierlibre.ca/karmina-vampires-quebecois/';
const pins = loadPins();
const pinned = () => ({
  link,
  title: 'Karmina, des vampires québécois !',
  image: url,
  imageCropSafe: url,
  imageCropFocalY: 0.5,
  imageRemoteOnly: true,
  leadImageReady: true,
  sourceImageCredit: 'Photo : Éléphant Films',
});

const refused = { ok: false, status: 415, type: 'text/html', transient: false };
const gone = { ok: false, status: 404, type: 'text/html', transient: false };

const karmina = pinned();
assert.equal(H.shouldClearOriginImage(karmina, refused, pins), false, '415 : refus de sonde, pas une image morte');
assert.equal(H.clearOriginImageIfNeeded(karmina, refused, pins), false);
assert.equal(karmina.image, url);
assert.equal(karmina.imageCropFocalY, 0.5);
assert.equal(karmina.imageRemoteOnly, true);
assert.equal(karmina.imageDead, undefined);
assert.equal(karmina.leadImageReady, true);

const karmina404 = pinned();
assert.equal(H.shouldClearOriginImage(karmina404, gone, pins), false, 'pin keepSourceImage : même un 404 ne vide pas');
assert.equal(H.clearOriginImageIfNeeded(karmina404, gone, pins), false);
assert.equal(karmina404.image, url);
assert.equal(karmina404.imageCropFocalY, 0.5);

const other = { link: 'https://example.org/billet/', image: 'https://example.org/photo.jpg', leadImageReady: true };
assert.equal(H.shouldClearOriginImage(other, refused, pins), false, '415 : aucune origine n’est vidée');
assert.equal(H.clearOriginImageIfNeeded({ ...other }, refused, pins), false);
assert.equal(H.shouldClearOriginImage(other, gone, pins), true, '404 sans pin ni miroir : on vide encore');
const cleared = { ...other };
assert.equal(H.clearOriginImageIfNeeded(cleared, gone, pins), true);
assert.equal(cleared.image, '');
assert.equal(cleared.imageDead, other.image);
assert.equal(cleared.leadImageReady, false);

const mirrored = { ...other, imageLocal: 'assets/news-images/abc.jpg' };
assert.equal(H.shouldClearOriginImage(mirrored, gone, pins), false, 'miroir local : l’origine reste');

assert.equal(H.isKeptSourcePin(pinned(), pins), true);
assert.equal(H.isKeptSourcePin(other, pins), false);
assert.equal(H.shouldClearOriginImage(pinned(), { ok: false, status: 415, type: 'text/html', transient: true }, pins), false);

console.log('check-news-images: ok');

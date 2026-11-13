/**
 * JPEG Canva (ICC + XMP, densité 1×1) → JPEG que Facebook accepte.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const {
  jpegNeedsFacebookSanitize,
  sanitizeJpegForFacebook,
  facebookRelayUrl,
} = require('../scripts/jpeg-facebook-safe.js');

function segment(marker, payload) {
  const len = payload.length + 2;
  const head = Buffer.alloc(4);
  head[0] = 0xff;
  head[1] = marker;
  head.writeUInt16BE(len, 2);
  return Buffer.concat([head, payload]);
}

// SOF0 8×8, 3 composantes, puis SOS vide jusqu'à EOI.
const sof = Buffer.from([
  0x08, 0x00, 0x08, 0x00, 0x08, 0x03,
  0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
]);
const sos = Buffer.from([0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00]);
const dirty = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  segment(0xe0, Buffer.from('JFIF\0\x01\x01\x00\x00\x01\x00\x01\x00\x00', 'ascii')),
  segment(0xe2, Buffer.from('ICC_PROFILE\0canva', 'ascii')),
  segment(0xe1, Buffer.from('http://ns.adobe.com/xap/1.0/\0Canva', 'ascii')),
  segment(0xc0, sof),
  Buffer.from([0xff, 0xda]),
  sos,
  Buffer.from([0xff, 0xd9]),
]);

assert.equal(jpegNeedsFacebookSanitize(dirty), true, 'Canva : à nettoyer');
const clean = sanitizeJpegForFacebook(dirty);
assert.ok(clean, 'réécriture');
assert.equal(jpegNeedsFacebookSanitize(clean), false, 'une fois nettoyé, on n’y retouche plus');
assert.equal(clean.includes(Buffer.from('ICC_PROFILE')), false);
assert.equal(clean.includes(Buffer.from('Canva')), false);
assert.equal(clean[2], 0xff);
assert.equal(clean[3], 0xe0);
assert.equal(clean[13], 1, 'unités = dpi');
assert.equal(clean.readUInt16BE(14), 72);
assert.equal(clean.readUInt16BE(16), 72);
// Le cadre et la fin du flux sont conservés.
assert.ok(clean.includes(Buffer.from([0xff, 0xc0])));
assert.equal(clean[clean.length - 2], 0xff);
assert.equal(clean[clean.length - 1], 0xd9);
assert.equal(sanitizeJpegForFacebook(Buffer.from('nope')), null);
assert.equal(jpegNeedsFacebookSanitize(Buffer.from([0x89, 0x50, 0x4e, 0x47])), false);

const dpiOnly = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  segment(0xe0, Buffer.from('JFIF\0\x01\x01\x00\x00\x01\x00\x01\x00\x00', 'ascii')),
  segment(0xc0, sof),
  Buffer.from([0xff, 0xda]),
  sos,
  Buffer.from([0xff, 0xd9]),
]);
assert.equal(jpegNeedsFacebookSanitize(dpiOnly), false, 'densité 1×1 sans ICC/XMP : on n’y touche pas');

const relay = facebookRelayUrl('https://le-radar.ca/assets/news-images/86d6a581397ae00f.jpg');
assert.match(relay, /^https:\/\/wsrv\.nl\/\?url=/);
assert.match(relay, /output=jpg/);

// Wikimedia limite wsrv.nl (429 → relais 404, échec Facebook du 9 nov. 2026) : vignette standard de Wikimedia.
{
  const { wikimediaThumbUrl } = require('../scripts/jpeg-facebook-safe.js');
  assert.equal(wikimediaThumbUrl('https://upload.wikimedia.org/wikipedia/commons/d/d1/Henry_F._Hall_Building_07.JPG'), 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Henry_F._Hall_Building_07.JPG/1280px-Henry_F._Hall_Building_07.JPG');
  assert.equal(wikimediaThumbUrl('https://le-radar.ca/assets/news-images/a.jpg'), '');
  assert.equal(wikimediaThumbUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/X.jpg/1280px-X.jpg'), '');
}
{
  const { withinLimits, MEDIA_LIMITS } = await import('../scripts/social/image-resolve.mjs');
  assert.equal(withinLimits({ bytes: 2067649, w: 5152, h: 3864 }, 'linkedin'), true, '19,9 Mpx : admis');
  assert.equal(withinLimits({ bytes: 3e6, w: 6000, h: 4000 }, 'linkedin'), false, '24 Mpx : vignette ou saut');
  assert.equal(withinLimits({ bytes: MEDIA_LIMITS.facebook.bytes + 1, w: 1000, h: 1000 }, 'facebook'), false);
  const bp = readFileSync('scripts/social/buffer-pages-post.mjs', 'utf8');
  assert.match(bp, /mediaForNetwork/); assert.match(bp, /image: imageUrl/, 'image mémorisée pour la conservation miroir');
  assert.match(readFileSync('scripts/social/buffer-post.mjs', 'utf8'), /image: im\?\.url/);
}
console.log('OK jpeg-facebook-safe');

// Images confiées à Buffer : format réel lu dans les octets, jamais d'envoi réel (fetch simulé).
// Cas réels de novembre 2026 : AVIF servi en « image/jpeg » (assets/news-images/ebfd0e0cb64e1419.jpg,
// LinkedIn « An unknown error has occurred » le 16 nov.), URL miroir 404 (X, 10 nov.).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { sniffImageFormat, extForFormat, formatForExt, contentTypeMatches, SOCIAL_FORMATS } = require('../scripts/image-format.js');

// En-têtes minimaux, fidèles aux vrais fichiers (AVIF : « ftypavif … mif1miaf » du miroir ebfd0e0cb64e1419.jpg).
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0'), Buffer.alloc(40), sof(1200, 675)]);
function sof(w, h) { const b = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03]); b.writeUInt16BE(h, 5); b.writeUInt16BE(w, 7); return Buffer.concat([b, Buffer.alloc(16)]); }
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), Buffer.from('IHDR'), Buffer.from([0, 0, 4, 0xb0, 0, 0, 3, 0x20]), Buffer.alloc(40)]);
const avif = Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from('ftypavif\0\0\0\0mif1miaf'), Buffer.alloc(40)]);
const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic\0\0\0\0mif1heic'), Buffer.alloc(40)]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x40, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(40)]);

assert.equal(sniffImageFormat(jpeg), 'jpeg');
assert.equal(sniffImageFormat(png), 'png');
assert.equal(sniffImageFormat(avif), 'avif');
assert.equal(sniffImageFormat(heic), 'heic');
assert.equal(sniffImageFormat(webp), 'webp');
assert.equal(sniffImageFormat(Buffer.from('<!DOCTYPE html><html><head>')), null, 'page 404 HTML');
assert.equal(extForFormat('avif'), '.avif'); assert.equal(extForFormat('jpeg'), '.jpg');
assert.equal(formatForExt('a/b/ebfd0e0cb64e1419.jpg'), 'jpeg'); assert.equal(formatForExt('x.JPEG'), 'jpeg'); assert.equal(formatForExt('x.svg'), null);
assert.ok(contentTypeMatches('image/jpeg', 'jpeg')); assert.ok(!contentTypeMatches('image/jpeg', 'avif'), 'AVIF annoncé en JPEG');
assert.ok(SOCIAL_FORMATS.has('jpeg') && SOCIAL_FORMATS.has('png') && !SOCIAL_FORMATS.has('avif') && !SOCIAL_FORMATS.has('webp'));

// ---- Réseau simulé : aucune requête ne sort de la machine, aucun appel à Buffer.
const routes = new Map(); const seen = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url); seen.push(u);
  if (/buffer\.com/i.test(u)) throw new Error('appel Buffer interdit dans les essais');
  const r = routes.get(u);
  if (!r) return new Response('<!DOCTYPE html><title>404</title>', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (r === 'timeout') throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  const res = new Response(r.body, { status: 200, headers: { 'content-type': r.ct } });
  Object.defineProperty(res, 'url', { value: u });
  return res;
};
const { mediaForNetwork, isPublicMedia, mediaRejectReason, isMediaRefusal } = await import('../scripts/social/image-resolve.mjs');
const { facebookRelayUrl } = require('../scripts/jpeg-facebook-safe.js');

// isPublicMedia : compatible avec l'ancien appel, strict quand le format est connu.
assert.ok(isPublicMedia({ status: 200, contentType: 'image/jpeg', bytes: 1e5, url: 'https://le-radar.ca/a.jpg' }));
assert.ok(isPublicMedia({ status: 200, contentType: 'image/jpeg', bytes: 1e5, url: 'https://le-radar.ca/a.jpg', format: 'jpeg' }));
assert.ok(!isPublicMedia({ status: 200, contentType: 'image/jpeg', bytes: 176994, url: 'https://le-radar.ca/assets/news-images/ebfd0e0cb64e1419.jpg', format: 'avif' }), 'AVIF déguisé refusé');
assert.ok(!isPublicMedia({ status: 200, contentType: 'image/webp', bytes: 1e5, url: 'https://le-radar.ca/a.webp', format: 'webp' }), 'WebP : relais JPEG');
assert.ok(!isPublicMedia({ status: 200, contentType: 'image/jpeg', bytes: 1e5, url: 'https://le-radar.ca/a.jpg', format: null }), 'contenu illisible');

const logs = []; const log = (m) => logs.push(m);
// 1. AVIF servi « image/jpeg » (cas LinkedIn du 16 nov.) : écarté, relais JPEG retenu, pour LinkedIn comme pour X.
{
  const src = 'https://le-radar.ca/assets/news-images/ebfd0e0cb64e1419.jpg';
  routes.set(src, { ct: 'image/jpeg', body: avif });
  routes.set(facebookRelayUrl(src), { ct: 'image/jpeg', body: jpeg });
  for (const net of ['linkedin', 'x', 'facebook']) {
    const r = await mediaForNetwork(src, net, { log });
    assert.ok(r, net); assert.equal(r.url, facebookRelayUrl(src), `${net} : relais JPEG`); assert.equal(r.format, 'jpeg');
  }
  assert.ok(logs.some(l => /format avif/.test(l)), 'raison du refus journalisée');
}
// 2. URL miroir retirée (404 HTML, cas X du 10 nov.) et relais 404 : aucune URL confiée à Buffer.
{
  const src = 'https://le-radar.ca/assets/news-images/153b89f00897bc8e.jpg';
  assert.equal(await mediaForNetwork(src, 'x', { log }), null);
  assert.ok(logs.some(l => l.includes(src) && /inaccessible/.test(l)));
}
// 3. JPEG sain : l'URL du Radar telle quelle, sans relais.
{
  const src = 'https://le-radar.ca/assets/news-images/86d6a581397ae00f.jpg';
  routes.set(src, { ct: 'image/jpeg', body: jpeg });
  const r = await mediaForNetwork(src, 'linkedin');
  assert.equal(r.url, src); assert.deepEqual(r.tried, [src]);
}
// 4. WebP bien annoncé : X et LinkedIn reçoivent le relais JPEG.
{
  const src = 'https://le-radar.ca/assets/news-images/5b903d3f01ed8708.webp';
  routes.set(src, { ct: 'image/webp', body: webp });
  routes.set(facebookRelayUrl(src), { ct: 'image/jpeg', body: jpeg });
  assert.equal((await mediaForNetwork(src, 'x')).url, facebookRelayUrl(src));
}
// 5. PNG annoncé en JPEG : Content-Type non conforme, relais.
{
  const src = 'https://le-radar.ca/assets/news-images/pngdeguise.jpg';
  routes.set(src, { ct: 'image/jpeg', body: png });
  routes.set(facebookRelayUrl(src), { ct: 'image/jpeg', body: jpeg });
  assert.match(mediaRejectReason({ ct: 'image/jpeg', format: 'png', bytes: 1e4 }, 'x'), /Content-Type/);
  assert.equal((await mediaForNetwork(src, 'linkedin')).url, facebookRelayUrl(src));
}
// 6. Délai dépassé à la vérification : sauté (repris au passage suivant), jamais envoyé.
{
  const src = 'https://le-radar.ca/assets/news-images/lent.jpg';
  routes.set(src, 'timeout');
  assert.equal(await mediaForNetwork(src, 'x', { relay: () => '' }), null);
}
// 7. Poids au-delà du plafond du réseau : raison explicite.
assert.match(mediaRejectReason({ ct: 'image/jpeg', format: 'jpeg', bytes: 6 * 1048576 }, 'x'), /plafond x 5 Mo/);
assert.match(mediaRejectReason({ ct: 'image/jpeg', format: 'jpeg', bytes: 1e6, w: 6000, h: 4000 }, 'linkedin'), /Mpx/);
assert.ok(isMediaRefusal(new Error('There appears to be an issue with the attached media or link attachment.')));
assert.ok(!seen.some(u => /buffer\.com/.test(u)), 'aucun appel Buffer');

// ---- Miroir : un AVIF n'est plus enregistré sous .jpg ; un ancien AVIF-en-.jpg est retéléchargé.
{
  const { ensureWebFormat, mirrorFileOk, resizeProxyUrl } = require('../scripts/mirror-news-images.js');
  const remote = 'https://lapige.atmjonquiere.com/wp-content/uploads/sites/3/2026/11/photo-dejarin-.avif';
  routes.set(resizeProxyUrl(remote), { ct: 'image/jpeg', body: Buffer.concat([jpeg, Buffer.alloc(2000)]) });
  const out = await ensureWebFormat({ buf: avif, format: 'avif', contentType: 'image/avif' }, remote);
  assert.equal(out.format, 'jpeg'); assert.equal(out.via, 'resize-proxy'); assert.equal(extForFormat(out.format), '.jpg');
  const same = { buf: webp, format: 'webp', contentType: 'image/webp' };
  assert.equal(await ensureWebFormat(same, 'https://x.ca/a.webp'), same, 'WebP gardé tel quel pour le site');
  await assert.rejects(ensureWebFormat({ buf: heic, format: 'heic' }, 'https://x.ca/introuvable.heic'), /unsupported format/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-fmt-'));
  const pad = Buffer.alloc(2000);
  fs.writeFileSync(path.join(dir, 'ebfd0e0cb64e1419.jpg'), Buffer.concat([avif, pad]));
  fs.writeFileSync(path.join(dir, 'ok.jpg'), Buffer.concat([jpeg, pad]));
  fs.writeFileSync(path.join(dir, 'ok.webp'), Buffer.concat([webp, pad]));
  assert.equal(mirrorFileOk(path.join(dir, 'ebfd0e0cb64e1419.jpg')), false, 'AVIF dans un .jpg : à refaire');
  assert.equal(mirrorFileOk(path.join(dir, 'ok.jpg')), true);
  assert.equal(mirrorFileOk(path.join(dir, 'ok.webp')), true);
  assert.equal(mirrorFileOk(path.join(dir, 'absent.jpg')), false);
  fs.rmSync(dir, { recursive: true, force: true });
}
globalThis.fetch = realFetch;
console.log('OK social-media-format');

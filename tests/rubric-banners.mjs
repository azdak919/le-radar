// Bannières de rubrique (« EDITORIAL » du McGill Daily) : écartées par l'image, pas seulement par le nom.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../scripts/rubric-banner-lib.js');

// PNG 9×8 gris synthétique → dHash attendu.
function png(gray) {
  const raw = Buffer.alloc(8 * 10);
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 9; x += 1) raw[y * 10 + 1 + x] = gray(x, y);
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'ascii'); d.copy(b, 8); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(9, 0); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
assert.equal(L.dhashFromPng(png((x) => 200 - x * 10)), 'ffffffffffffffff');
assert.equal(L.dhashFromPng(png((x) => x * 10)), '0000000000000000');
assert.equal(L.distance('4c30b2e8c8c26030', '4c30b2e8c8c22032'), 2);

// Noms de fichier génériques ; les vraies photos « Screenshot-… » du Daily restent permises.
for (const u of ['https://x/editorial_画板-1.png', 'https://x/banner-2026.jpg', 'https://x/default.png', 'https://x/Logo.png'])
  assert.ok(L.genericFileName(u), u);
for (const u of ['https://x/Screenshot-2026-10-23-at-8.09.26-PM.png', 'https://x/McGill-Daily.jpg', 'https://x/IMG_4100.jpg', 'https://x/defaulted-loans.jpg'])
  assert.ok(!L.genericFileName(u), u);

// Bannière connue réexportée sous un nouveau nom → écartée ; vraie photo gardée.
const store = { generic: [{ source: 'The McGill Daily', hash: '4c30b2e8c8c22032' }], cache: {} };
const fp = { 'https://d/Screenshot-2026-10-23-at-8.09.26-PM.png': '4c30b2e8c8c26030', 'https://d/IMG_4100.jpg': 'e8c4d4d4f4230b23' };
const banner = { source: 'The McGill Daily', image: 'https://d/Screenshot-2026-10-23-at-8.09.26-PM.png' };
const photo = { source: 'The McGill Daily', image: 'https://d/IMG_4100.jpg' };
let hits = await L.findRubricBanners([banner, photo], { store, fingerprint: async (u) => fp[u] });
assert.deepEqual([...hits], [banner]);

// Même visuel sur deux billets d'une source, URL différentes → les deux écartés et l'empreinte apprise.
const s2 = { generic: [], cache: {} };
const a = { source: 'S', image: 'https://s/a.png' }; const b = { source: 'S', image: 'https://s/b.png' }; const c = { source: 'T', image: 'https://t/c.png' };
hits = await L.findRubricBanners([a, b, c], { store: s2, fingerprint: async () => '1234567890abcdef' });
assert.ok(hits.has(a) && hits.has(b) && !hits.has(c));
assert.equal(s2.generic.length, 1);

// Données publiées : aucune image du fil n'est une bannière connue ; l'article signalé n'a plus la bannière.
const news = JSON.parse(fs.readFileSync(new URL('../news.json', import.meta.url)));
const real = L.loadStore();
hits = await L.findRubricBanners(news.items, { store: real, fingerprint: async () => '' });
assert.deepEqual([...hits].map((i) => i.image), [], 'bannière de rubrique publiée');
const it = news.items.find((i) => /keeping-our-unhoused-community-warm/.test(i.link));
if (it) {
  assert.ok(!/Screenshot-2026-10-23-at-8\.09\.26/.test(it.image || ''), 'bannière EDITORIAL encore en une');
  assert.ok(!/The editorial team|The McGill Daily/.test(it.imageCredit || it.sourceImageCredit || ''), 'crédit de la bannière');
}
console.log('rubric-banners: PASS');

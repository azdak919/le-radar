import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { sanitizeTitle } = require('../scripts/news-title-lib.js');
const { isWideScreenshotGraphic } = require('../scripts/article-image-lib.js');

// Kickers entre crochets : préfixe propre, jamais de « ] » orphelin.
assert.equal(sanitizeTitle('[Chronique] Glass House : la place de l’IA dans l’art visuel'),
  'Chronique : Glass House : la place de l’IA dans l’art visuel');
assert.equal(sanitizeTitle('Chronique] Mamu – Ensemble'), 'Chronique : Mamu – Ensemble');
assert.equal(sanitizeTitle('(Opinion) Le campus'), 'Opinion : Le campus');
assert.equal(sanitizeTitle('Budget (2026) adopté'), 'Budget (2026) adopté');

// Capture d'écran en bandeau rejetée ; capture de proportion photo gardée.
const ic = 'https://cdn.impactcampus.ca/wp-content/uploads/2026/10/22163152/Capture-decran-le-2026-10-22-a-16.27.40-scaled.png';
assert.equal(isWideScreenshotGraphic(ic, 2560, 659), true);
assert.equal(isWideScreenshotGraphic('https://thebucampus.ca/x/capture-decran-le-2026-09-30-a-16.28.10.png', 762, 582), false);
assert.equal(isWideScreenshotGraphic('https://x/panorama.jpg', 2560, 659), false);

// Données : aucun titre déséquilibré, aucun crédit générique affiché par le front.
const raw = JSON.parse(fs.readFileSync(new URL('../news.json', import.meta.url)));
const items = Array.isArray(raw) ? raw : (raw.articles || raw.items || []);
for (const it of items) {
  const t = it.title || '';
  assert.equal((t.match(/\[/g) || []).length, (t.match(/\]/g) || []).length, `crochets: ${t}`);
  assert.equal((t.match(/\(/g) || []).length, (t.match(/\)/g) || []).length, `parenthèses: ${t}`);
  assert.notEqual(it.image, ic);
}
const front = fs.readFileSync(new URL('../radar-news.js', import.meta.url), 'utf8');
assert.ok(!front.includes('sourceImageCredit: en ? `Photo credit: ${mediaName}`'), 'fallback crédit générique retiré');
console.log('impact-campus-card-fixes: ok');

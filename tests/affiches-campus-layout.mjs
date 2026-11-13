// Gabarit des affiches campus (non « Une ») figé à a9e8f52 — affiches Laval imprimées.
// Les changements postérieurs (96e52dc24 bandeau violet + Scanne-moi sous le QR + QR agrandi,
// 8659e2092 phrase sous Scanne-moi) ne doivent pas revenir.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFn as extractComposeFn, fixtureCompose, normalizeCompose } from './lib/campus-compose-a9.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'affiches/poster-builder.js'), 'utf8');

function extractFn(source, name) {
  const start = source.indexOf(`\nfunction ${name}(`);
  assert.ok(start >= 0, `function ${name} introuvable`);
  let depth = 0;
  let started = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') { depth += 1; started = true; }
    else if (ch === '}') {
      depth -= 1;
      if (started && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`function ${name} non terminée`);
}

const compose = extractFn(src, 'compose');
const une = extractFn(src, 'composeFrontPage');
const license = readFileSync(join(root, 'LICENSE'), 'utf8');

assert.match(license, /GNU GENERAL PUBLIC LICENSE/);
assert.match(license, /Version 2, June 1991/);
assert.match(src, /LICENSE_LINE = '\\u\{1F12F\} Azdak CC BY-SA 4\.0'/);
assert.match(src, /licenseSansFont/);
assert.match(src, /"LR Sans"/);
assert.match(src, /LR Copyleft/);
assert.match(src, /noto-sans-symbols-copyleft\.woff2/);
assert.equal(existsSync(join(root, 'assets/kit/fonts/noto-sans-symbols-copyleft.woff2')), true);

assert.match(src, /LICENSE_FR = LICENSE_LINE/);
assert.match(src, /LICENSE_EN = LICENSE_LINE/);
assert.match(src, /LICENSE_BI = LICENSE_LINE/);
assert.match(compose, /drawPosterLicense/);
assert.match(une, /drawPosterLicense/);
assert.doesNotMatch(
  normalizeCompose(fixtureCompose()),
  /drawPosterLicense/,
  'la référence historique a9e8f52 ne porte pas encore la ligne de licence',
);
assert.equal(normalizeCompose(extractComposeFn(src, 'compose')), normalizeCompose(compose));

assert.match(compose, /const qrIn = fmt\.id === 'tabloid' \? 2\.25 : 1\.65;/);
assert.match(compose, /const qrTop = playTop \+ Math\.round\(3680 \* fit\);/);
assert.match(compose, /ctx\.fillRect\(0, 0, w, barH\)/, 'fine barre supérieure d’origine (a9e8f52) conservée');
assert.doesNotMatch(compose, /scanHead/);
assert.doesNotMatch(compose, /fillCentered\([^)]*Scanne-moi/);
assert.doesNotMatch(compose, /Bandeau violet/);
assert.doesNotMatch(compose, /rgba\(108, 33, 99, 0\.6\)/);
assert.doesNotMatch(compose, /titleBand: true/);
assert.match(compose, /titleBand: false/);
assert.match(compose, /scanneMoi: false/);
assert.match(compose, /dataset\.campusLayout = 'a9e8f52'/);

/* La une garde son en-tête et son « Scanne-moi » propres, intactes. */
assert.match(une, /Scanne-moi/);
assert.match(une, /mastMode/);

console.log('affiches-campus-layout: OK (gabarit a9e8f52, une intacte)');

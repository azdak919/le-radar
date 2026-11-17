/**
 * Compteur anonyme éteint : aucun envoi, ordre du bandeau inchangé.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = require('../radar-audience.js');
const UUID = '32751d96-0b15-4e05-9b08-a04a333a1cde';
const PHRASE = 'Nous comptons, sans vous identifier';

const order = ['soccer', 'football', 'sailing'];

assert.equal(api.ENABLED, false);
assert.equal(api.clickBody('soccer', 'accueil', false), null);
assert.equal(api.send('soccer', 'accueil'), null);
assert.deepEqual(api.clickBody('voile', 'accueil', true), { name: 'sport', contexte: 'sailing-accueil' });
assert.deepEqual(api.clickBody('soccer', 'sports', true), { name: 'sport', contexte: 'soccer-sports' });
assert.deepEqual(Object.keys(api.clickBody('soccer', 'sports', true)).sort(), ['contexte', 'name']);
assert.deepEqual(api.stripOrder(order, { soccer: 0, football: 0, sailing: 0 }, false), order);
assert.deepEqual(api.stripOrder(order, { soccer: 3, football: 1, sailing: 0 }, true), order);
assert.deepEqual(api.stripOrder(order, { soccer: 400, football: 400, sailing: 400 }, true), order);

const audience = readFileSync(join(root, 'radar-audience.js'), 'utf8');
assert.doesNotMatch(audience, /cloud\.umami\.is/);
assert.doesNotMatch(audience, new RegExp(UUID));
assert.match(readFileSync(join(root, 'pomo/index.html'), 'utf8'), /cloud\.umami\.is\/script\.js/);

const cta = readFileSync(join(root, 'radar-sports-cta.js'), 'utf8');
const compare = cta.slice(cta.indexOf('function sportsCompareOpenOrder'), cta.indexOf('function sportsStripPolicy'));
assert.doesNotMatch(compare, /audience|poids|clickBody/);

for (const rel of ['index.html', 'en/index.html', 'sports/index.html', 'en/sports/index.html', 'scripts/seo-pages-lib.js']) {
  assert.match(readFileSync(join(root, rel), 'utf8'), /radar-audience\.js/, rel);
}

const page = readFileSync(join(root, 'mise-a-jour/index.html'), 'utf8');
const pageJs = readFileSync(join(root, 'mise-a-jour/page.js'), 'utf8');
assert.match(page, /Socle/);
assert.match(page, /1\.0\.0/);
assert.doesNotMatch(page, /<h2>Kiosque<\/h2>/);
assert.doesNotMatch(page, /type="password"/);
assert.doesNotMatch(page + pageJs, /fetch\s*\(/);
assert.doesNotMatch(page + pageJs, new RegExp(UUID));
assert.match(page, /connect-src 'none'/);
assert.match(readFileSync(join(root, 'index.html'), 'utf8'), /href="mise-a-jour\/"/);

for (const rel of ['docs/politique-editoriale.md', 'docs/mobile/privacy.md']) {
  assert.doesNotMatch(readFileSync(join(root, rel), 'utf8'), new RegExp(PHRASE), rel);
}

console.log('OK audience-clicks');

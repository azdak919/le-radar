import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { stripHtml } = require('../scripts/html-entities-lib.js');
// La Pige (Word) : un <span> coupe « permet » en deux.
assert.equal(stripHtml('<p><span data-contrast="auto">journalistes p</span><span data-contrast="auto">ermet de mettre</span></p>'), 'journalistes permet de mettre');
assert.equal(stripHtml('per&shy;met\u200Bde\u2060s'), 'permetdes');
assert.equal(stripHtml('<p>Un.</p><p>Deux<br>trois</p>'), 'Un. Deux trois');
assert.equal(stripHtml('Un <strong>mot</strong> <a href="x">lien</a>.'), 'Un mot lien.');
console.log('html-inline-spacing ok');

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { frenchNbsp } = createRequire(import.meta.url)('../scripts/article-pages.js');
assert.equal(frenchNbsp('Étudier en histoire ?'), 'Étudier en histoire\u202f?');
assert.equal(frenchNbsp('Oui ! Non ; « Bof » : fin'), 'Oui\u202f! Non\u202f; «\u202fBof\u202f»\u00a0: fin');
assert.equal(frenchNbsp('Stingers: home opener?'), 'Stingers: home opener?');
console.log('french-nbsp : OK');

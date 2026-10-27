import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const lib = require('../scripts/dead-images-lib.js');
const health = require('../scripts/source-health-lib.js');
const orig = 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Vecteezy_stack-of-newspaper_1961329.jpg';
const thumb = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Vecteezy_stack-of-newspaper_1961329.jpg/500px-Vecteezy_stack-of-newspaper_1961329.jpg';
assert.equal(lib.normalize(thumb), orig);
const f = join(mkdtempSync(join(tmpdir(), 'dead-')), 'd.json');
assert.equal(lib.remember([thumb, orig], f), 1);
assert.ok(lib.isDead(orig, lib.load(f)));
assert.ok(lib.isDead(thumb, lib.load(f)));
// Image réparée : ne garde plus l'issue ouverte.
const r = health.evaluateHealth({ registry: { active: [] }, imageHealth: { items: [{ source: 'X', status: 404, url: orig, field: 'stockImage', repaired: true }] } });
assert.equal(r.problems.filter((p) => p.kind === 'images-cartes').length, 0);
console.log('dead-images ok');

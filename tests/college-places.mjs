/**
 * D10 — QC_COLLEGE_PLACE_PARTS reste aligné sur institutions.json.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = spawnSync(process.execPath, [join(root, 'scripts/sync-college-places.js'), '--check'], {
  encoding: 'utf8',
});
assert.equal(check.status, 0, check.stderr || check.stdout || 'sync-college-places --check');

const src = readFileSync(join(root, 'translate.js'), 'utf8');
const m = src.match(/const QC_COLLEGE_PLACE_PARTS = (\[[\s\S]*?\]);/);
assert.ok(m, 'QC_COLLEGE_PLACE_PARTS présent');
const arr = Function(`"use strict"; return (${m[1]});`)();
const re = new RegExp(arr.join('|'), 'i');
assert.ok(re.test('Vanier College'));
assert.ok(re.test('Dawson College'));
assert.ok(re.test('Jonquière College'));
assert.ok(re.test('Collège de Maisonneuve'));
assert.ok(re.test('Cégep du Vieux Montréal'));
console.log(`OK college-places (${arr.length} motifs)`);

/**
 * D10 — institution-labels-lib + sync navigateur.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const {
  buildAcronymMap,
  buildSeoInstitutions,
} = require('../scripts/institution-labels-lib.js');

const map = buildAcronymMap();
assert.equal(map['Université de Montréal'], 'UdeM');
assert.equal(map.UQAM, 'UQAM');
assert.equal(map['McGill University'], 'McGill');
assert.equal(map['Université McGill'], 'McGill');

const seo = buildSeoInstitutions();
assert.ok(seo.some((e) => e.slug === 'mcgill-university' && e.short === 'McGill'));
assert.ok(seo.some((e) => e.slug === 'universite-laval'));

const check = spawnSync(process.execPath, [join(root, 'scripts/sync-institution-labels.js'), '--check'], {
  encoding: 'utf8',
});
assert.equal(check.status, 0, check.stderr || check.stdout);

const data = readFileSync(join(root, 'institution-acronyms-data.js'), 'utf8');
assert.match(data, /RadarInstitutionAcronyms/);
assert.match(data, /UdeM/);

console.log(`OK institution-labels-lib (${Object.keys(map).length} acronymes, ${seo.length} SEO)`);

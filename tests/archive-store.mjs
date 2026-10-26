import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { readArchive, writeArchive, monthOf, UNDATED } = require('../scripts/archive-store.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-'));
const rec = (id, publishedAt) => ({ id, title: `t${id}`, publishedAt });
assert.equal(monthOf(rec(1, '2026-10-03T12:00:00Z')), '2026-10');
assert.equal(monthOf(rec(1, 'pas une date')), UNDATED);

// Transition : lit l'ancien fichier monolithique.
const legacy = { schemaVersion: 1, updated: '2026-10-26T00:00:00Z', records: [rec('a', '2026-10-02T00:00:00Z'), rec('b', '2025-01-05T00:00:00Z'), rec('c', '')] };
fs.writeFileSync(path.join(root, 'news-archive.json'), JSON.stringify(legacy));
assert.deepEqual(readArchive(root), legacy);

// Découpage + aller-retour sans perte.
let r = writeArchive(legacy, root);
assert.deepEqual(r.written.sort(), ['0000-00', '2025-01', '2026-10']);
assert.equal(fs.existsSync(path.join(root, 'news-archive.json')), false, 'ancien fichier supprimé');
const back = readArchive(root);
assert.equal(back.updated, legacy.updated);
assert.deepEqual(back.records.map((x) => x.id), ['a', 'b', 'c']);
for (const f of fs.readdirSync(path.join(root, 'data', 'archives'))) JSON.parse(fs.readFileSync(path.join(root, 'data', 'archives', f), 'utf8'));

// Mois inchangés non réécrits ; mois vidé supprimé.
r = writeArchive({ ...legacy, updated: 'x', records: [rec('a', '2026-10-02T00:00:00Z'), rec('d', '2026-10-09T00:00:00Z'), rec('c', '')] }, root);
assert.deepEqual(r.written, ['2026-10']);
assert.deepEqual(r.removed, ['2025-01']);
const idx = JSON.parse(fs.readFileSync(path.join(root, 'data', 'archives', 'index.json'), 'utf8'));
assert.equal(idx.total, 3);
assert.deepEqual(readArchive(root).records.map((x) => x.id), ['d', 'a', 'c']);

// Rien → fallback.
assert.deepEqual(readArchive(fs.mkdtempSync(path.join(os.tmpdir(), 'arch-')), { records: [] }), { records: [] });
console.log('archive-store: OK');

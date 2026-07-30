/**
 * D8 — détection d’arche : trou (Percé) + silhouette (pont treillis).
 * Test unitaire léger sans canvas réel : pure structure d’export.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'quebec-backgrounds.js'), 'utf8');

assert.match(src, /rowSilhouette|silSmooth|hasSilhouetteArch/, 'silhouette D8 absente');
assert.match(src, /hasHoleArch/, 'hasHoleArch requis');
assert.match(src, /hasStrongArch = hasHoleArch \|\| hasSilhouetteArch/);
// Ne remplace pas le trou Percé
assert.match(src, /hasSilhouetteArch = !hasHoleArch &&/);
// Override Mercier documenté toujours en place
const nations = JSON.parse(readFileSync(join(root, 'data/quebec-nations-backgrounds.json'), 'utf8'));
const photos = nations.photos || nations.items || nations;
const list = Array.isArray(photos) ? photos : Object.values(photos);
const mercier = list.find((p) => /Mercier/i.test(p.title || p.url || ''));
assert.ok(mercier, 'photo Mercier en banque nations');
assert.ok(typeof mercier.focalY === 'number' && mercier.focalY < 0.25, 'override focalY Mercier conservé');

console.log('OK focal-arch (D8 silhouette + override Mercier)');

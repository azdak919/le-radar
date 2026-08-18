/* Rotation des fonds : le sac doit survivre aux rechargements.
 * Run: node tests/bg-rotation.mjs
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const store = new Map();
globalThis.localStorage = {
  getItem(key) { return store.has(key) ? store.get(key) : null; },
  setItem(key, value) { store.set(key, String(value)); },
  removeItem(key) { store.delete(key); },
};

const { createRotator } = require('../bg-rotation-lib.js');
const photos = Array.from({ length: 15 }, (_, i) => ({
  url: `https://images.example/${i}.jpg`,
  bank: ['masthead', 'universities', 'nations'][i % 3],
  credit: `Photographe ${i}`,
}));

const firstVisit = createRotator({
  surface: 'test-masthead',
  storageKey: 'test_bg_rotation_persistence',
  maxRecent: 15,
});
const seen = new Set();
for (let i = 0; i < 6; i++) {
  const photo = firstVisit.pick(photos);
  assert(photo, 'une photo doit être choisie');
  assert(!seen.has(photo.url), 'aucune répétition pendant le cycle');
  seen.add(photo.url);
  firstVisit.record(photo);
}

// Simule un rechargement complet : seul localStorage demeure.
const secondVisit = createRotator({
  surface: 'test-masthead',
  storageKey: 'test_bg_rotation_persistence',
  maxRecent: 15,
});
for (let i = 0; i < 9; i++) {
  const photo = secondVisit.pick(photos);
  assert(photo, 'le cycle persistant doit conserver des candidats');
  assert(!seen.has(photo.url), 'le rechargement ne doit pas redémarrer le sac');
  seen.add(photo.url);
  secondVisit.record(photo);
}

assert.equal(seen.size, photos.length, 'le cycle couvre tout le catalogue');

// Clic « suivante » : exclusion dure des N dernières, tout le sac.
store.clear();
const clicker = createRotator({
  surface: 'test-shuffle',
  storageKey: 'test_bg_shuffle_hard',
  maxRecent: 20,
});
const clickSeen = [];
for (let i = 0; i < 10; i++) {
  const photo = clicker.pick(photos, { hardExcludeRecent: 8, fullWindow: true });
  assert(photo, 'shuffle : une photo');
  const last8 = clickSeen.slice(-8);
  assert(
    !last8.includes(photo.url),
    `shuffle : pas de retour dans les 8 dernières (${photo.url})`
  );
  clickSeen.push(photo.url);
  clicker.record(photo);
}
assert.equal(new Set(clickSeen).size, 10, 'shuffle : 10 photos distinctes');
assert.deepEqual(
  new Set([...seen].map((url) => photos.find((photo) => photo.url === url).bank)),
  new Set(['masthead', 'universities', 'nations']),
  'toutes les banques présentes participent au cycle proportionnel'
);

console.log('All bg-rotation checks passed.');

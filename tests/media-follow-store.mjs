#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../scripts/media-channels-lib.js');
const store = require('../scripts/media-follow-store.js');

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    _data: data,
  };
}

store.setStorageForTests(memoryStorage());
assert.deepEqual(store.list(), []);
assert.equal(store.isFollowed('lexemplaire'), false);
assert.equal(store.follow("L'Exemplaire"), true);
assert.equal(store.isFollowed('lexemplaire'), true);
assert.equal(store.isFollowed("L'Exemplaire"), true);
assert.deepEqual(store.list(), ['lexemplaire']);
assert.equal(store.follow("L'Exemplaire"), true, 'suivre deux fois reste suivi');
assert.equal(store.toggle('lexemplaire'), false);
assert.equal(store.isFollowed('lexemplaire'), false);
assert.equal(store.toggle('quartier-libre'), true);
assert.deepEqual(store.list(), ['quartier-libre']);

const items = [
  { source: "L'Exemplaire", title: 'A' },
  { source: 'Quartier Libre', title: 'B' },
  { source: 'Le Délit', title: 'C' },
];
assert.deepEqual(
  store.filterItemsByFollowed(items).map((item) => item.source),
  ['Quartier Libre'],
);

store.unfollow('quartier-libre');
assert.deepEqual(store.filterItemsByFollowed(items), []);

const events = [];
const unsub = store.subscribe((ids) => events.push(ids.slice()));
store.follow('le-delit');
store.unfollow('le-delit');
unsub();
store.follow('le-delit');
assert.deepEqual(events, [['le-delit'], []]);

const persisted = memoryStorage();
persisted.setItem(store.STORAGE_KEY, JSON.stringify({ v: 1, ids: ['lexemplaire'] }));
store.setStorageForTests(persisted);
assert.deepEqual(store.list(), ['lexemplaire']);

const legacy = memoryStorage();
legacy.setItem('radar-followed-media-v1', JSON.stringify({ journals: ["L'Exemplaire"] }));
store.setStorageForTests(legacy);
assert.deepEqual(store.list(), ['lexemplaire'], 'migration du format journals[]');

store.setStorageForTests(memoryStorage());
assert.deepEqual(store.list(), [], 'absence de données = aucun suivi');

store.setStorageForTests({
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
  removeItem() {},
});
assert.doesNotThrow(() => store.follow('lexemplaire'));
assert.equal(store.isFollowed('lexemplaire'), true, 'sans localStorage : état mémoire de session');

store.setStorageForTests(null);
assert.doesNotThrow(() => store.list());

console.log('✓ suivi local : follow/unfollow, persistance versionnée, filtre du fil.');

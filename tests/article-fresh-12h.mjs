// Rouge « frais » : publié dans les 12 dernières heures (fenêtre glissante).
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const L = require('../scripts/article-card-lib.js');
const now = Date.parse('2026-10-24T11:20:00Z'); // 7 h 20 HE
const h = (n) => new Date(now - n * 3600e3).toISOString();
assert.equal(L.isFreshRecent(h(0.5), now), true);
assert.equal(L.isFreshRecent(h(11.9), now), true, '11 h 54 : rouge');
assert.equal(L.isFreshRecent(h(12), now), false, '12 h pile : plus rouge');
assert.equal(L.isFreshRecent(h(13), now), false, 'hier soir 22 h 20 : plus rouge');
// La veille au soir < 12 h reste rouge malgré le changement de jour.
assert.equal(L.isFreshRecent('2026-10-24T01:00:00Z', now), true, '21 h la veille');
// Date seule : seulement si c'est aujourd'hui (jour civil Québec).
assert.equal(L.isFreshRecent('2026-10-24', now), true);
assert.equal(L.isFreshRecent('2026-10-23', now), false);
assert.equal(L.isFreshRecent('', now), false);
assert.equal(L.isFreshRecent('n/a', now), false);
assert.equal(L.isFreshToday, L.isFreshRecent, 'alias rétrocompatible');
// Rafraîchissement DOM (page restée ouverte).
const mk = (dt, on) => { const c = new Set(on ? ['is-fresh'] : []); return { getAttribute: () => dt, classList: { contains: (k) => c.has(k), toggle: (k, v) => (v ? c.add(k) : c.delete(k)) }, c }; };
const a = mk(h(13), true), b = mk(h(1), false);
assert.equal(L.refreshFreshMarks({ querySelectorAll: () => [a, b] }, now), 2);
assert.equal(a.c.has('is-fresh'), false); assert.equal(b.c.has('is-fresh'), true);
console.log('article-fresh-12h : ok');

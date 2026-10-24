import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { inferFinal } = require('../scripts/sports-presto-live-lib.js');
const ev = (sport, statusText, a, h, date = '2026-10-23') =>
  ({ sport, state: 'live', statusText, away: { score: a }, home: { score: h }, date });
// Hockey
assert.equal(inferFinal(ev('hockey', 'End of 3rd', 1, 3)), true);
assert.equal(inferFinal(ev('hockey', '3rd - 00:00', 1, 3)), true);
assert.equal(inferFinal(ev('hockey', 'End of 3rd', 2, 2)), false);
assert.equal(inferFinal(ev('hockey', '3rd - 01:12', 1, 3)), false);
assert.equal(inferFinal(ev('hockey', 'End of 2nd', 1, 3)), false);
assert.equal(inferFinal(ev('hockey', 'End of OT', 3, 2)), true);
// Basket / football
assert.equal(inferFinal(ev('basketball', 'End of 4th', 70, 75)), true);
assert.equal(inferFinal(ev('basketball', 'End of 4th', 70, 70)), false);
assert.equal(inferFinal(ev('basketball', '3rd - 05:09', 50, 42)), false);
assert.equal(inferFinal(ev('football', '4th - 00:00', 7, 17)), true);
assert.equal(inferFinal(ev('football', 'Halftime', 7, 17)), false);
// Soccer
assert.equal(inferFinal(ev('soccer', 'End of 2nd half', 3, 1)), true);
assert.equal(inferFinal(ev('soccer', 'End of 2nd half', 1, 1)), true);
assert.equal(inferFinal(ev('soccer', 'End of 2nd half', 1, 1, '2026-11-07')), false);
assert.equal(inferFinal(ev('soccer', '2nd half - 90:00', 3, 1)), false);
assert.equal(inferFinal(ev('soccer', 'Halftime', 3, 1)), false);
// Volley (3 de 5)
assert.equal(inferFinal(ev('volleyball', '25-20,25-8,25-23', 3, 0)), true);
assert.equal(inferFinal(ev('volleyball', '25-20,25-8,25-23', 2, 0)), true);
assert.equal(inferFinal(ev('volleyball', '25-20,22-25,27-29,26-28', 1, 2)), true);
assert.equal(inferFinal(ev('volleyball', '22-25,23-25,7-14', 0, 2)), false);
assert.equal(inferFinal(ev('volleyball', '25-20,22-25,27-29,24-24', 1, 2)), false);
assert.equal(inferFinal(ev('volleyball', '25-20,22-25,25-27,25-20,15-13', 3, 2)), true);
assert.equal(inferFinal({ ...ev('hockey', 'End of 3rd', 1, 3), state: 'final' }), false);
console.log('sports-infer-final OK');

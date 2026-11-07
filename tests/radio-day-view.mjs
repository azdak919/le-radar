import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const L = require('../scripts/radio-day-lib.js');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/radio-day-view.json', import.meta.url)));
const before = JSON.stringify(fixture);
const mon = L.segments(fixture, 1);
assert.equal(mon.blocks.length, 6);
assert.deepEqual(mon.unknown.map(b => b.slot.title), ['Début seul', 'Fin estimée : pas de bloc', 'Durée nulle ambiguë : pas de bloc']);
assert.deepEqual([mon.blocks[0].start, mon.blocks[0].end, mon.blocks[0].fromPrevious], [0, 120, true]);
const two = mon.blocks.find(b => b.slot.title.startsWith('Deux heures'));
const alt = mon.blocks.find(b => b.slot.title === 'Alternance publiée');
const quarter = mon.blocks.find(b => b.slot.title === 'Quart d’heure');
assert.equal(two.laneCount, 2); assert.notEqual(two.lane, alt.lane); assert.equal(alt.lane, quarter.lane);
assert.equal(mon.blocks.find(b => b.slot.title === 'Une heure').laneCount, 1);
for (const a of mon.blocks) for (const b of mon.blocks) {
  if (a === b || a.end <= b.start || b.end <= a.start) continue;
  assert.notEqual(a.lane, b.lane, 'published overlaps must not cover one another');
}
const sun = L.segments(fixture, 0);
assert.deepEqual(sun.blocks.map(b => [b.start,b.end,b.fromPrevious]), [[0,30,true],[1380,1440,false]]);
assert.equal(L.segments([{day:1,start:'23:00',end:'00:00',title:'Minuit'}],2).blocks.length, 0);
assert.equal(L.segments([{day:1,start:'00:00',end:'24:00',title:'24 h explicites'}],1).blocks[0].end,1440);
assert.equal(L.segments([{day:8,start:'10:00',end:'11:00',title:'invalide'}],1).blocks.length,0);
assert.equal(JSON.stringify(fixture), before, 'source fixture is not mutated');
for(const value of ['25:00','12:60','24:01','bad','']) assert.equal(L.minute(value), null);
assert.equal(L.minute('24:00'),1440);
// UTC Sunday remains Toronto Saturday; clocks at DST boundaries are civil times.
for(const [iso,day,minute] of [
 ['2026-11-08T04:30:00Z',6,1410], ['2026-11-08T05:30:00Z',0,30],
 ['2026-11-01T05:30:00Z',0,90], ['2026-11-01T06:30:00Z',0,90],
 ['2026-03-08T06:59:00Z',0,119], ['2026-03-08T07:00:00Z',0,180],
]) {
 const got=L.moment(new Date(iso)); assert.equal(got.day,day,iso); assert.equal(got.minute,minute,iso);
}
assert.deepEqual(L.weekDates('2026-11-02').map(d=>d.iso),['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08']);
assert.equal(L.weekDates(null,new Date('2026-03-08T07:00:00Z'))[0].iso,'2026-03-02');
assert.equal(L.weekDates(null,new Date('2026-11-08T04:30:00Z'))[6].iso,'2026-11-08');
console.log('OK daily comparison: civil Toronto clock/DST, week wrap, midnight, explicit durations, overlap lanes, immutable sources');

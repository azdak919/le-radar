#!/usr/bin/env node
// Ordonnanceur : fenêtres par réseau (Toronto), heures calmes, rodage, anti-rafale, espacement aléatoire.
import assert from 'node:assert/strict';
import { weightAt, rampAt, effectiveLimits, jitterMs } from '../scripts/social/schedule.mjs';
import { NETWORKS, plan } from '../scripts/social/rate-limit.mjs';
const T = s => Date.parse(s); // heures UTC ; Toronto = UTC-5 en novembre
assert.equal(weightAt('bluesky', T('2026-11-03T08:00:00Z')), 0, '3 h : calme');
assert.equal(weightAt('bluesky', T('2026-11-04T01:00:00Z')), 1, 'mardi 20 h : pointe Bluesky');
assert.equal(weightAt('tumblr', T('2026-11-04T01:00:00Z')), 1, 'mardi 20 h : pointe Tumblr');
assert.equal(weightAt('x', T('2026-11-03T19:00:00Z')), 1, 'mardi 14 h : pointe X');
assert.equal(weightAt('bluesky', T('2026-11-07T22:00:00Z')), 1, 'samedi 17 h : pointe Bluesky');
const live = '2026-11-01T17:00:00Z';
assert.equal(rampAt(live, T('2026-11-02T00:00:00Z')), 0.4); assert.equal(rampAt(live, T('2026-11-05T18:00:00Z')), 0.7); assert.equal(rampAt(live, T('2026-11-09T00:00:00Z')), 1);
const e = effectiveLimits(NETWORKS.tumblr, { network: 'tumblr', liveSince: live, now: T('2026-11-02T01:00:00Z') });
assert.deepEqual([e.perHour, e.perDay, e.perRun], [3, 48, 2], 'rodage Tumblr jour 0 en pointe');
const night = effectiveLimits(NETWORKS.bluesky, { network: 'bluesky', liveSince: live, now: T('2026-11-03T08:00:00Z') });
assert.deepEqual([night.perHour, night.perRun], [0, 0]);
for (const n of Object.keys(NETWORKS)) for (let h = 0; h < 168; h++) {
  const l = effectiveLimits(NETWORKS[n], { network: n, liveSince: '2026-01-01T00:00:00Z', now: T('2026-11-02T05:00:00Z') + h * 3600e3 });
  assert(l.perHour <= NETWORKS[n].perHour && l.perRun <= NETWORKS[n].perRun && l.perRun <= Math.ceil(l.perHour / 2) + (l.perHour ? 0 : 0), n);
}
// heures calmes : rien ne part, rien n'est sauté (les frais attendent le matin)
const items = [1, 2, 3].map(i => ({ id: 'n' + i, source: 'S' + i, title: 'titre ' + i, date: new Date(T('2026-11-03T07:00:00Z') - i * 60e3) }));
const q = plan(items, {}, { network: 'bluesky', liveSince: '2026-10-01T00:00:00Z', now: T('2026-11-03T08:00:00Z') });
assert.deepEqual([q.now.length, q.hold.length, q.skip.length], [0, 3, 0]);
const js = Array.from({ length: 200 }, () => jitterMs(90));
assert(js.every(x => x >= 63000 && x <= 198000) && new Set(js).size > 50, 'espacement aléatoire');
console.log('social-schedule : OK');

#!/usr/bin/env node
// Module commun : plafonds par réseau, fraîcheur, sélection comme X, surplus sauté.
import assert from 'node:assert/strict';
import { NETWORKS, remaining, postedTimes, freshCandidates, rankLikeX, plan } from '../scripts/social/rate-limit.mjs';
const now = Date.parse('2026-11-01T18:00:00Z'), ago = m => new Date(now - m * 60e3);
const mk = mins => Object.fromEntries(mins.map((m, i) => [`p${i}`, { at: ago(m).toISOString(), uri: 'at://x', source: 'S' + i }]));
assert.deepEqual([NETWORKS.mastodon.perHour, NETWORKS.mastodon.perDay], [5, 50], 'piaille : 5/h, 50/j');
assert(NETWORKS.bluesky.perHour * 3 < 5000 && NETWORKS.bluesky.perDay * 3 < 35000);
const M = NETWORKS.mastodon;
assert.equal(remaining({}, M, { now }).left, 5);
assert.equal(remaining(mk([1, 10, 20, 30, 59]), M, { now }).left, 0, '5 dans l’heure');
assert.equal(remaining(mk([1, 10, 20, 30, 61]), M, { now }).left, 1, 'heure glissante');
assert.equal(remaining(mk(Array.from({ length: 50 }, (_, i) => 70 + i * 25)), M, { now }).left, 0, '50 / 24 h');
assert.equal(postedTimes({ a: { at: ago(1).toISOString(), skipped: 'late' }, b: { at: ago(2).toISOString(), dedup: true, uri: 'u' } }).length, 0);
// fraîcheur : ni avant la mise en service, ni > 24 h, ni déjà vu
const it = (id, source, min, img) => ({ id, source, date: ago(min), img, title: id, desc: 'x'.repeat(100) });
const items = [it('old', 'A', 25 * 60), it('pre', 'A', 120), it('ok', 'A', 30), it('seen', 'B', 10)];
assert.deepEqual(freshCandidates(items, { seen: {} }, { liveSince: ago(60).toISOString(), now }).map(i => i.id), ['ok']);
assert.deepEqual(freshCandidates(items, {}, { now }).map(i => i.id), [], 'sans date de service : rien d’ancien');
// variété d'abord, max 2 par source, puis photo
const pool = [it('a1', 'A', 5), it('a2', 'A', 6), it('a3', 'A', 7, 'p.jpg'), it('b1', 'B', 50, 'p.jpg'), it('c1', 'C', 8)];
const r = rankLikeX(pool).map(i => i.id);
assert.equal(r.length, 4, 'A plafonnée à 2'); assert.deepEqual(r.slice(0, 3).sort(), ['a3', 'b1', 'c1']); assert.equal(r[0].length, 2);
assert(['a3', 'b1'].includes(r[0]), 'photo réelle d’abord');
assert.equal(rankLikeX(pool, { recentSources: ['A', 'A'] }).filter(i => i.source === 'A').length, 0, '2 déjà publiés sur 24 h');
// plan : surplus sauté, jamais gardé au-delà de la fenêtre
const many = Array.from({ length: 9 }, (_, i) => it('m' + i, 'S' + i, 5 + i));
const p = plan(many, mk([1, 2, 3]), { network: 'mastodon', liveSince: ago(600).toISOString(), now });
assert.equal(p.now.length, 1); assert.equal(p.hold.length, 1); assert.equal(p.skip.length, 7);
const pb = plan(many, {}, { network: 'bluesky', liveSince: ago(600).toISOString(), now });
assert.equal(pb.now.length, 3); assert.equal(pb.hold.length, 6); assert.equal(pb.skip.length, 0);
console.log('social-rate-limit : OK');

#!/usr/bin/env node
// Bot Mastodon : clé d'idempotence stable, liens déjà publiés, plafond piaille.fr étalé.
import assert from 'node:assert/strict';
import { idemKey, linksInStatuses, createMastodon } from '../scripts/social/channels/mastodon.mjs';
import { NETWORKS } from '../scripts/social/rate-limit.mjs';
assert.equal(idemKey('a'), idemKey('a')); assert.notEqual(idemKey('a'), idemKey('b'));
assert.deepEqual([...linksInStatuses([{ card: { url: 'https://le-radar.ca/article/x/' }, content: '<a href="https://le-radar.ca/article/y/">y</a>' }])], ['https://le-radar.ca/article/x/', 'https://le-radar.ca/article/y/']);
assert.ok(NETWORKS.mastodon.spread && NETWORKS.mastodon.perHour <= 5 && NETWORKS.mastodon.perDay <= 50);
const calls = [];
const md = createMastodon({ instance: 'https://ex.social/', token: 't', sleep: async () => {}, fetchImpl: async (u, o = {}) => {
  calls.push([o.method || 'GET', u, o.headers?.['Idempotency-Key']]);
  if (u.endsWith('.jpg')) return new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/jpeg' } });
  if (u.endsWith('/api/v2/media')) return Response.json({ id: 'm1', url: null }, { status: 202 });
  if (u.endsWith('/api/v1/media/m1')) return Response.json({ id: 'm1', url: 'https://ex.social/m1.jpg' });
  return Response.json({ id: 's1', url: 'https://ex.social/@leradar/s1' });
} });
assert.equal(await md.uploadImage('https://le-radar.ca/p.jpg', 'Titre'), 'm1');
assert.deepEqual(await md.post({ status: 'x', mediaId: 'm1', lang: 'fr', key: 'k' }), { id: 's1', url: 'https://ex.social/@leradar/s1' });
assert.equal(calls.at(-1)[2], 'k');
console.log('social-mastodon : OK');

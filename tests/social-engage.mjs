#!/usr/bin/env node
import assert from 'node:assert/strict';
import { preFilter, fallbackEmoji, okAccount, decide, aiClassify, emptyState, spend, budget, mark, seen, EMOJIS } from '../scripts/social/engage-lib.mjs';
const now = new Date('2026-11-03T15:00:00Z');
assert.equal(preFilter('Bravo pour l’article !'), true);
assert.equal(preFilter('voir https://spam.io'), false);
assert.equal(preFilter('Legault est nul'), false);
assert.equal(preFilter(''), false);
assert.equal(fallbackEmoji('Merci !'), '🙏');
assert.equal(fallbackEmoji('Hmm, pas sûr'), null);
assert.equal(okAccount({ followers: 0 }, now), false);
assert.equal(okAccount({ followers: 5, createdAt: '2026-11-01T00:00:00Z' }, now), false);
assert.equal(okAccount({ followers: 5, createdAt: '2024-01-01T00:00:00Z', posts: 40 }, now), true);
assert.deepEqual(await decide('Bravo', { env: {} }), { like: true, emoji: '👍' });
assert.equal(await decide('Intéressant.', { env: {} }), null); // sans IA : doute → rien
const env = { CLOUDFLARE_AI_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' };
const ai = resp => async () => Response.json({ result: { response: resp } });
assert.deepEqual(await decide('Intéressant.', { env, fetchImpl: ai('{"safe":true,"emoji":"👏"}') }), { like: true, emoji: '👏' });
assert.equal(await decide('Bravo', { env, fetchImpl: ai('{"safe":false}') }), null);
assert.deepEqual(await decide('Intéressant.', { env, fetchImpl: ai('{"safe":true,"emoji":"🤡"}') }), { like: true, emoji: '👍' });
assert.equal(await aiClassify('x', { env, fetchImpl: async () => new Response('err', { status: 500 }) }), null);
const s = emptyState(); assert.equal(budget(s, 'bluesky', now), 20); spend(s, 'bluesky', 3, now); assert.equal(budget(s, 'bluesky', now), 17);
mark(s, 'a', now); assert.ok(seen(s, 'a')); assert.ok(!seen(s, 'b'));
assert.ok(EMOJIS.every(e => e.length <= 2));
console.log('social-engage : OK');

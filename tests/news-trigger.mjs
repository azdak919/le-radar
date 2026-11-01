import assert from 'node:assert/strict';
import { decide, newestFeedDate, socialWorkflows } from '../cloudflare/news-trigger/src/lib.js';
import { runSocial } from '../cloudflare/news-trigger/src/index.js';
import fs from 'node:fs';
const now = Date.parse('2026-10-27T00:00:00Z');
const upd = now - 20 * 60000;
assert.equal(newestFeedDate('<item><pubDate>Mon, 26 Oct 2026 23:50:00 GMT</pubDate></item>'), Date.parse('2026-10-26T23:50:00Z'));
assert.equal(decide({ now, newsUpdated: upd, active: 1, feedDates: [now] }).dispatch, false);
assert.equal(decide({ now, newsUpdated: upd, active: 0, feedDates: [upd - 1] }).dispatch, false);
assert.equal(decide({ now, newsUpdated: upd, active: 0, feedDates: [now - 60000] }).dispatch, true);
assert.equal(decide({ now, newsUpdated: now - 61 * 60000, active: 0, feedDates: [] }).dispatch, true);
assert.equal(decide({ now, newsUpdated: upd, active: 0, feedDates: [now + 86400000] }).dispatch, false); // date future ignorée
assert.deepEqual(socialWorkflows('social-bluesky.yml, social-tumblr.yml,'), ['social-bluesky.yml', 'social-tumblr.yml']);
assert.deepEqual(socialWorkflows('social-bluesky.yml'), ['social-bluesky.yml']);
assert.match(fs.readFileSync(new URL('../cloudflare/news-trigger/wrangler.toml', import.meta.url), 'utf8'), /SOCIAL_WORKFLOW = "social-bluesky\.yml,social-tumblr\.yml"/);
// runSocial : un dispatch par workflow, « busy » si une passe est en cours
const calls = []; const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init = {}) => { calls.push([init.method || 'GET', u]);
  if (/runs\?/.test(u)) return new Response(JSON.stringify({ workflow_runs: [{ status: /tumblr/.test(u) ? 'in_progress' : 'completed' }] }));
  return new Response(null, { status: 204 }); };
const slot = Date.parse('2026-11-01T17:05:00Z'); // 12:05 Toronto
const rs = await runSocial({ REPO: 'o/r', GH_TOKEN: 'x', SOCIAL_WORKFLOW: 'social-bluesky.yml,social-tumblr.yml' }, slot);
assert.deepEqual(rs, { social: 'dispatch', 'social-bluesky.yml': 204, 'social-tumblr.yml': 'busy' });
assert.equal(calls.filter(c => c[0] === 'POST').length, 1);
assert.deepEqual(await runSocial({ SOCIAL_WORKFLOW: 'a.yml' }, Date.parse('2026-11-01T17:50:00Z')), { social: 'idle' });
globalThis.fetch = realFetch;
console.log('news-trigger ok');

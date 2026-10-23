import assert from 'node:assert/strict';
import { needsLiveLoop, maybeDispatch } from '../workers/presto-cache/src/index.js';

const H = 3600000;
const t0 = Date.UTC(2026, 9, 23, 23, 0);
const win = { tailMs: 3 * H, kickoffs: [t0] };
assert.equal(needsLiveLoop(win, t0 - 2 * H), false);
assert.equal(needsLiveLoop(win, t0 - 70 * 60000), true);
assert.equal(needsLiveLoop(win, t0 + 2.5 * H), true);
assert.equal(needsLiveLoop(win, t0 + 3.5 * H), false);
assert.equal(needsLiveLoop({}, t0), false);

const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push(`${init.method || 'GET'} ${url}`);
  if (url.includes('sports-live-window')) return new Response(JSON.stringify(win));
  if (url.includes('status=in_progress')) return new Response(JSON.stringify({ total_count: calls.inProgress ? 1 : 0 }));
  if (url.includes('status=queued')) return new Response(JSON.stringify({ total_count: 0 }));
  if (url.endsWith('/dispatches')) return new Response(null, { status: 204 });
  return new Response('', { status: 404 });
};
assert.equal(await maybeDispatch({}, t0), 'no_token');
assert.equal(await maybeDispatch({ RADAR_GH_ACTIONS_TOKEN: 'x' }, t0 - 5 * H), 'idle');
assert.equal(await maybeDispatch({ RADAR_GH_ACTIONS_TOKEN: 'x' }, t0), 'dispatched');
calls.inProgress = true;
assert.equal(await maybeDispatch({ RADAR_GH_ACTIONS_TOKEN: 'x' }, t0), 'already_in_progress');
console.log('presto-cron: ok');

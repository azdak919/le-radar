import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  isTransientError, backoffMs, retryAsync, runHarvest, fetchExternal, readLastGood, SourceUnavailable,
} = require('../scripts/external-source-lib');
const { incidentTitle, reportIncident } = require('../scripts/source-incident');

assert.equal(backoffMs(0, { random: () => 0 }), 500);
assert.equal(backoffMs(1, { random: () => 0 }), 1000);
assert.equal(isTransientError(Object.assign(new Error('busy'), { status: 503 })), true);
assert.equal(isTransientError(Object.assign(new Error('forbidden'), { status: 403 })), false);
assert.equal(isTransientError(new Error('HTTP 403: API rate limit exceeded for installation')), true);
assert.equal(isTransientError(new Error('HTTP 403: Resource not accessible')), false);
assert.equal(isTransientError(Object.assign(new Error('ABORT'), { code: 'HUMAN_ACTION' })), false);
assert.equal(isTransientError(Object.assign(new Error('reset'), { code: 'ECONNRESET' })), true);

let calls = 0;
const value = await retryAsync(async () => {
  calls += 1;
  if (calls < 3) throw Object.assign(new Error('HTTP 503'), { status: 503 });
  return 'ok';
}, { retries: 3, minTimeout: 1, maxTimeout: 5, randomize: false });
assert.equal(value, 'ok');
assert.equal(calls, 3);

let permanent = 0;
await assert.rejects(retryAsync(async () => {
  permanent += 1;
  throw Object.assign(new Error('forbidden'), { status: 403 });
}, { retries: 3, minTimeout: 1, maxTimeout: 5 }), /forbidden/);
assert.equal(permanent, 1, 'un 403 de droits ne réessaie pas');

const dir = mkdtempSync(join(tmpdir(), 'ext-src-'));
const file = join(dir, 'payload.json');
writeFileSync(file, '{"kept":true}\n');
const degraded = await runHarvest('demo', async () => {
  writeFileSync(file, '{"kept":false}\n');
  throw Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' });
}, { preserve: [file] });
assert.equal(degraded.degraded, true);
assert.equal(readFileSync(file, 'utf8'), '{"kept":true}\n');
await assert.rejects(runHarvest('bug', async () => {
  throw new Error('TypeError: not a source');
}, { preserve: [file] }));

const server = http.createServer((req, res) => {
  res.writeHead(503);
  res.end('down');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/league`;
const cache = join(dir, 'cache.json');
writeFileSync(cache, '{"teams":1}\n');
let hits = 0;
const fetched = await fetchExternal(url, {
  retries: 1,
  minTimeout: 1,
  maxTimeout: 2,
  randomize: false,
  expect: 'json',
  cacheFile: cache,
  fetchImpl: async () => {
    hits += 1;
    return { ok: false, status: 503 };
  },
});
assert.equal(hits, 2);
assert.deepEqual(fetched, { teams: 1 });
assert.equal(readLastGood(cache).teams, 1);
await assert.rejects(fetchExternal(url, {
  retries: 0,
  expect: 'json',
  fetchImpl: async () => ({ ok: false, status: 404 }),
}), (err) => {
  assert.equal(err.status, 404);
  assert.equal(err instanceof SourceUnavailable, false);
  return true;
});
server.close();

const callsGh = [];
const execFile = (cmd, args) => {
  callsGh.push(args.join(' '));
  if (args[1] === 'list' || args[0] === 'issue' && args[1] === 'list') return '[]';
  return 'https://github.com/azdak919/le-radar/issues/1\n';
};
const opened = reportIncident({
  key: 'source démo', state: 'open', body: 'panne', execFile, repo: 'azdak919/le-radar',
});
assert.equal(opened.title, incidentTitle('source démo'));
assert.match(callsGh.at(-1), /issue create/);
callsGh.length = 0;
const execOpen = (cmd, args) => {
  callsGh.push(args.join(' '));
  if (args.includes('list')) return JSON.stringify([{ number: 9, title: incidentTitle('source démo'), state: 'OPEN' }]);
  return '';
};
const updated = reportIncident({ key: 'source démo', state: 'open', body: 'encore', execFile: execOpen });
assert.equal(updated.updated, true);
assert.match(callsGh.at(-1), /issue edit 9/);
const closed = reportIncident({
  key: 'source démo',
  state: 'close',
  execFile: execOpen,
});
assert.match(callsGh.at(-1), /issue close 9/);
assert.equal(closed.number, 9);

rmSync(dir, { recursive: true, force: true });
console.log('external-source ok');

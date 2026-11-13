// Le HTML /sports/ ne doit pas rester peint sur le tampon de la dernière visite.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const root = new URL('..', import.meta.url).pathname;
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(read('scripts/sports-document-refresh.js'), sandbox);

const {
  SPORTS_SHELL_FRESH_MS,
  sportsRevisionToken,
  sportsCacheAgeMs,
  sportsDocumentChanged,
  sportsShellPlan,
} = sandbox;

function headers(map) {
  return { get: (name) => map[String(name).toLowerCase()] ?? null };
}

const fresh = { headers: headers({ 'last-modified': 'Wed, 11 Nov 2026 18:50:53 GMT' }) };
const now = Date.parse('Wed, 11 Nov 2026 19:20:00 GMT');

assert.equal(SPORTS_SHELL_FRESH_MS, 20 * 60 * 1000);
assert.equal(sportsRevisionToken(fresh), 'Wed, 11 Nov 2026 18:50:53 GMT');
assert.equal(sportsRevisionToken({ headers: headers({ etag: '"abc"' }) }), '"abc"');
assert.equal(sportsRevisionToken(null), '');
assert.equal(sportsCacheAgeMs(null, now), Number.POSITIVE_INFINITY);
assert.equal(sportsCacheAgeMs({ headers: headers({}) }, now), Number.POSITIVE_INFINITY);
assert.ok(sportsCacheAgeMs(fresh, now) < 60 * 60 * 1000);

assert.equal(sportsDocumentChanged('', 'Wed, 11 Nov 2026 18:50:53 GMT'), false);
assert.equal(sportsDocumentChanged('Wed, 11 Nov 2026 05:18:25 GMT', 'Wed, 11 Nov 2026 05:18:25 GMT'), false);
assert.equal(sportsDocumentChanged('Wed, 11 Nov 2026 05:18:25 GMT', 'Wed, 11 Nov 2026 18:50:53 GMT'), true);

assert.equal(sportsShellPlan({ hasCache: false, cacheAgeMs: 0 }), 'network');
assert.equal(
  sportsShellPlan({ hasCache: true, cacheAgeMs: 14 * 60 * 60 * 1000 }),
  'network-then-cache',
  'un tampon de 14 h ne doit pas être la première peinture',
);
assert.equal(sportsShellPlan({ hasCache: true, cacheAgeMs: 5 * 60 * 1000 }), 'cache-then-refresh');
assert.equal(
  sportsShellPlan({ hasCache: true, cacheAgeMs: Number.POSITIVE_INFINITY }),
  'network-then-cache',
);

const worker = read('sports/sw.js');
const registrar = read('app-sw-register.js');
assert.match(worker, /importScripts\('\.\.\/scripts\/sports-document-refresh\.js'\)/);
assert.match(worker, /sportsShellPlan\(/);
assert.match(worker, /sports-document-updated/);
assert.match(worker, /refreshSportsDocument/);
assert.match(registrar, /sports-document-updated/);
assert.match(registrar, /sports-document-status/);
assert.match(registrar, /sports-doc-reload-token/);

console.log('sports-document-refresh: ok');

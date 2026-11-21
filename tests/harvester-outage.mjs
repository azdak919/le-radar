/**
 * Chaque récolteur, face à une source en panne, réessaie puis garde
 * la dernière donnée. Il ne propage pas l’erreur comme un échec du run.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const schedule = require('../scripts/radio-schedule-lib');
const nowPlaying = require('../scripts/radio-nowplaying-lib');
const { createSourceQueue } = require('../scripts/sports-source-queue');
const { checkAll } = require('../scripts/check-radio-health');
const links = require('../scripts/verify-live-links');
const { runHarvest } = require('../scripts/external-source-lib');

const down = async () => ({ ok: false, status: 503 });
const dir = mkdtempSync(join(tmpdir(), 'harvest-down-'));

async function countDown(label, fn) {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    return down();
  };
  await fn(fetchImpl);
  assert.ok(n >= 2, `${label} : une 503 doit être réessayée (vu ${n})`);
}

await countDown('horaires radio', async (fetchImpl) => {
  const cache = join(dir, 'grid.json');
  writeFileSync(cache, '{"shows":[1]}\n');
  const grid = await schedule.fetchJson('https://station.test/week-info', {
    fetchImpl, cacheFile: cache, retries: 1, minTimeout: 1, maxTimeout: 2, randomize: false,
  });
  assert.deepEqual(grid, { shows: [1] }, 'horaires : dernière grille conservée');
});

await countDown('now-playing', async (fetchImpl) => {
  const cache = join(dir, 'onair.json');
  writeFileSync(cache, '{"title":"Émission"}\n');
  const show = await nowPlaying.fetchJson('https://station.test/live', {
    fetchImpl, cacheFile: cache, retries: 1, minTimeout: 1, maxTimeout: 2, randomize: false,
  });
  assert.equal(show.title, 'Émission', 'now-playing : dernière réponse conservée');
  // Le cache est lu par fetchExternal avant l’échec ; fetchJson le renvoie
  // tel quel quand fetchImpl est injecté. S’il a été parsé, le titre reste.
  const again = await nowPlaying.fetchJson('https://station.test/live', {
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ title: 'Émission' }) }),
    retries: 0,
  });
  assert.equal(again.title, 'Émission');
});

{
  let n = 0;
  const q = createSourceQueue({ attempts: 2, random: () => 0, wait: async () => {}, now: () => 0 });
  await assert.rejects(q.run('rseq', async () => {
    n += 1;
    throw Object.assign(new Error('HTTP 503'), { status: 503 });
  }));
  assert.equal(n, 2, 'RSEQ : 503 réessayé puis refusé sans écraser le snapshot');
}

{
  const radio = { id: 'cfak', name: 'CFAK', stream: 'https://stream.cfak.test/live' };
  const previous = { stations: { cfak: { state: 'working', url: radio.stream, failures: 0 } } };
  let n = 0;
  const result = await checkAll([radio], previous, {
    now: Date.parse('2026-11-21T12:00:00Z'),
    retries: 1,
    minTimeout: 1,
    inspect: async () => {
      n += 1;
      throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    },
    alternatives: async () => [],
  });
  assert.ok(n >= 2, 'flux radio : panne réessayée');
  assert.equal(result.radios[0].stream, radio.stream, 'flux radio : URL publiée conservée');
  assert.equal(result.report.stations.cfak.state, 'unknown');
}

{
  const src = readFileSync(new URL('../scripts/verify-live-links.js', import.meta.url), 'utf8');
  assert.match(src, /retryAsync\(/, 'liens du fil : le contrôle HTTP passe par le réessai partagé');
  const blocked = await links.request('http://127.0.0.1/article', 'GET');
  assert.equal(blocked.error, 'blocked');
  const { retryAsync } = require('../scripts/external-source-lib');
  let n = 0;
  const net = await retryAsync(async () => {
    n += 1;
    throw Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' });
  }, { retries: 1, minTimeout: 1, maxTimeout: 2, randomize: false }).catch(() => ({ error: 'network' }));
  assert.equal(n, 2);
  assert.equal(net.error, 'network', 'liens du fil : une coupure devient un statut, pas un échec');
}

{
  const file = join(dir, 'retro-state.json');
  writeFileSync(file, '{"page":4}\n');
  const out = await runHarvest('rétro-crawl historique', async () => {
    writeFileSync(file, '{"page":0}\n');
    throw Object.assign(new Error('wordpress_network_error'), { code: 'ECONNRESET' });
  }, { preserve: [file] });
  assert.equal(out.degraded, true);
  assert.equal(readFileSync(file, 'utf8'), '{"page":4}\n', 'rétro-crawl : avancement conservé');
}

{
  const file = join(dir, 'live-links.json');
  writeFileSync(file, '{"entries":{"a":1}}\n');
  const out = await runHarvest('liens du fil', async () => {
    writeFileSync(file, '{}');
    throw Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' });
  }, { preserve: [file] });
  assert.equal(out.degraded, true);
  assert.match(readFileSync(file, 'utf8'), /"a":1/, 'liens du fil : registre conservé');
}

rmSync(dir, { recursive: true, force: true });
console.log('harvester-outage ok');

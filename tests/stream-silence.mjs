#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const s = require('../scripts/stream-silence-lib.js');
const core = require('../mobile/app/js/core.js');

const err = '[Parsed_volumedetect_0 @ 0x1] mean_volume: -87.3 dB\n[Parsed_volumedetect_0 @ 0x1] max_volume: -70.3 dB';
assert.deepEqual(s.parseVolumedetect(err), { meanDb: -87.3, maxDb: -70.3 });
assert.equal(s.parseVolumedetect('rien'), null);
assert.equal(s.parseVolumedetect('mean_volume: -inf dB').meanDb, -Infinity);

const base = { id: 'choq', stream: 'https://x', _streamStatus: 'working' };
const quiet = { meanDb: -87 }, loud = { meanDb: -18 };
// 1er silence : pas encore masqué
const a = s.applySilenceSample(base, base, quiet, 't1');
assert.equal(a._streamStatus, 'working'); assert.equal(a._silentStreak, 1);
// 2e silence consécutif : masqué
const b = s.applySilenceSample(base, a, quiet, 't2');
assert.equal(b._streamStatus, 'silent'); assert.equal(b._silentStreak, 2);
// échantillon raté : rien ne change (ni masquage, ni démasquage)
const c = s.applySilenceSample(base, b, null, 't3');
assert.equal(c._streamStatus, 'silent'); assert.equal(c._silentStreak, 2);
const c2 = s.applySilenceSample(base, a, null, 't3');
assert.equal(c2._streamStatus, 'working');
const c3 = s.applySilenceSample(base, base, null, 't3');
assert.equal(c3._streamStatus, 'working'); assert.equal(c3._silentStreak, undefined);
// le son revient : réapparaît et la série repart à zéro
const d = s.applySilenceSample(base, b, loud, 't4');
assert.equal(d._streamStatus, 'working'); assert.equal(d._silentStreak, undefined);
// flux HTTP mort : la détection n'intervient pas
assert.equal(s.applySilenceSample({ ...base, _streamStatus: 'none' }, b, quiet)._streamStatus, 'none');

// clients
assert.equal(s.isStationSilent(b), true);
const cat = core.radioCatalog([{ id: 'choq', name: 'CHOQ', stream: 'https://x', _streamStatus: 'silent' }, { id: 'cism', name: 'CISM', stream: 'https://y', _streamStatus: 'working' }]);
assert.deepEqual(cat.map((r) => [r.id, r.offline]), [['choq', true], ['cism', false]]);
import { readFileSync } from 'node:fs';
assert.match(readFileSync(new URL('../radar-utils.js', import.meta.url), 'utf8'), /function isStationOffline/);
assert.match(readFileSync(new URL('../radar-tuner.js', import.meta.url), 'utf8'), /Hors ligne/);
assert.match(readFileSync(new URL('../mobile/app/js/app.js', import.meta.url), 'utf8'), /Station hors ligne pour le moment/);
assert.match(readFileSync(new URL('../.github/workflows/update-streams.yml', import.meta.url), 'utf8'), /ffmpeg/);
console.log('stream-silence: ok');

// CHOQ (26 oct. 2026) : le bot marque « silent », mais le flux joue chez
// l'auditeur → l'étiquette « Hors ligne » tombe dès l'événement `playing`.
{
  const vm = await import('node:vm');
  const ctx = { location: { protocol: 'https:' } };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../radar-utils.js', import.meta.url), 'utf8'), ctx);
  const silent = { id: 'choq', _streamStatus: 'silent' };
  assert.equal(vm.runInContext('isStationOffline', ctx)(silent), true);
  vm.runInContext('markStationHeardLive', ctx)('choq');
  assert.equal(vm.runInContext('isStationOffline', ctx)(silent), false, 'poste entendu : pas « Hors ligne »');
  assert.equal(vm.runInContext('isStationOffline', ctx)({ id: 'cism', _streamStatus: 'silent' }), true);
  const tuner = readFileSync(new URL('../radar-tuner.js', import.meta.url), 'utf8');
  const play = tuner.slice(tuner.indexOf('function onAudioPlaying'), tuner.indexOf('function onAudioEnded'));
  assert.match(play, /markStationHeardLive\(currentStation\.id\)/);
  assert.match(play, /classList\.remove\('is-station-offline'\)/);
  console.log('OK stream-silence (entendu en direct)');
}

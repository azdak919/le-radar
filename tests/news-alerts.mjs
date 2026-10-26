#!/usr/bin/env node
// Réglages des notifications (le cœur de la détection est testé en JUnit :
// android/app/src/test/java/ca/leradar/app/news/NewsAlertsDetectorTest.java).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const alerts = require('../mobile/app/js/news-alerts.js');
const root = new URL('..', import.meta.url).pathname;

assert.deepEqual(alerts.regionsFrom([{ region: 'Montréal' }, { region: 'Estrie' }, { region: 'Montréal' }, {}]), ['Estrie', 'Montréal']);
assert.deepEqual(alerts.toggle(['a'], 'b', true), ['a', 'b']);
assert.deepEqual(alerts.toggle(['a', 'b'], 'a', false), ['b']);
assert.deepEqual(alerts.INTERVALS, [1, 2, 4]);
const off = { enabled: false, intervalHours: 2, quiet: true, quietStart: 22, quietEnd: 7, types: [], regions: [], permission: 'denied' };
const page = alerts.html(off, ['Montréal', '<x>']);
assert.match(page, /data-alerts="enabled" >/);
assert.match(page, /data-value="2" aria-pressed="true"/);
assert.match(page, /Silence de 22 h à 7 h/);
assert.ok(!page.includes('<x>'), 'région échappée');
assert.match(alerts.html(null, []), /application Android/);

// Aucune bibliothèque Google / Firebase dans le build F-Droid.
const gradle = readFileSync(`${root}android/app/build.gradle`, 'utf8');
// Seule la saveur `full` peut tirer le SDK Cast (fullImplementation) ;
// aucune autre ligne (commentaires exclus) ne doit citer Google/Firebase.
const gradleCode = gradle.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l));
const offending = gradleCode.filter((l) => /firebase|play-services|com\.google\.android\.gms/i.test(l) && !/^\s*fullImplementation\s/.test(l));
assert.deepEqual(offending, [], 'Google/Firebase hors saveur full');
assert.ok(!/firebase/i.test(gradleCode.join('\n')), 'jamais Firebase');
const worker = readFileSync(`${root}android/app/src/main/java/ca/leradar/app/news/NewsAlertsWorker.java`, 'utf8');
assert.match(worker, /https:\/\/le-radar\.ca\/news\.json/);
console.log('news-alerts OK');

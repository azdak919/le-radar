#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  TARGET_PASSES_UTC,
  CRON_LEAD_MINUTES,
  SCHEDULE_TOLERANCE_MINUTES,
  SAFETY_NET_CRON,
  scheduledSlotFor,
  primaryFireUtc,
} = require('../scripts/news-schedule-lib.js');

assert.equal(TARGET_PASSES_UTC.length, 8, 'huit créneaux affichés requis');
assert.equal(CRON_LEAD_MINUTES, 35, 'avance cron 35 min (retard GitHub + fetch)');
assert.equal(SCHEDULE_TOLERANCE_MINUTES, 75);
assert.equal(SAFETY_NET_CRON, '20 * * * *');

function utc(iso) {
  return new Date(iso);
}

function slotIso(iso) {
  return scheduledSlotFor(utc(iso));
}

// 16 h QC = 20:00 UTC. Cron à 19:25. Un fetch de 10 min atterrit vers 19:35.
assert.equal(slotIso('2026-08-24T19:25:00.000Z'), '2026-08-24T20:00:00.000Z');
assert.equal(slotIso('2026-08-24T19:40:00.000Z'), '2026-08-24T20:00:00.000Z');
assert.equal(slotIso('2026-08-24T20:00:00.000Z'), '2026-08-24T20:00:00.000Z');
assert.equal(slotIso('2026-08-24T20:40:00.000Z'), '2026-08-24T20:00:00.000Z');
assert.equal(slotIso('2026-08-24T21:16:00.000Z'), null, 'hors tolérance 75 min après 16 h');

// 13 h 30 QC = 17:30 UTC, cron 16:55.
assert.equal(slotIso('2026-08-24T16:55:00.000Z'), '2026-08-24T17:30:00.000Z');
assert.equal(slotIso('2026-08-24T17:58:00.000Z'), '2026-08-24T17:30:00.000Z');

// 05 h 30 QC = 09:30 UTC, cron 08:55.
assert.equal(slotIso('2026-08-24T08:55:00.000Z'), '2026-08-24T09:30:00.000Z');

// 21 h QC = 01:00 UTC le lendemain, cron 00:25.
assert.equal(slotIso('2026-08-25T00:25:00.000Z'), '2026-08-25T01:00:00.000Z');
assert.equal(slotIso('2026-08-25T01:10:00.000Z'), '2026-08-25T01:00:00.000Z');

// Filet :20 hors de toute fenêtre (12:20 UTC : 11 h QC fini, 12 h pas encore).
assert.equal(slotIso('2026-08-24T12:20:00.000Z'), null);

function expandCron(expr) {
  const parts = expr.trim().replace(/^'|'$/g, '').split(/\s+/);
  assert.equal(parts.length, 5, `cron à 5 champs : ${expr}`);
  const minute = Number(parts[0]);
  if (parts[1] === '*') return [];
  return parts[1].split(',').map((hour) => ({ hour: Number(hour), minute }));
}

const workflow = readFileSync(new URL('../.github/workflows/update-news.yml', import.meta.url), 'utf8');
const cronExprs = [...workflow.matchAll(/- cron:\s*'([^']+)'/g)].map((m) => m[1]);
assert.ok(cronExprs.includes(SAFETY_NET_CRON), 'filet :20 toujours déclaré');

const fireFromYml = cronExprs
  .filter((expr) => expr !== SAFETY_NET_CRON)
  .flatMap(expandCron)
  .map((t) => `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`)
  .sort();
const fireFromLib = primaryFireUtc()
  .map((t) => `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`)
  .sort();
assert.deepEqual(
  fireFromYml,
  fireFromLib,
  'les crons primaires de update-news.yml doivent partir 35 min avant les créneaux affichés',
);

console.log('OK news-schedule');

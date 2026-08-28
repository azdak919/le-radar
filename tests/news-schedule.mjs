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
  FILET_WORKFLOWS,
  scheduledSlotFor,
  primaryFireUtc,
} = require('../scripts/news-schedule-lib.js');

assert.equal(TARGET_PASSES_UTC.length, 10, 'dix créneaux affichés requis');
assert.equal(CRON_LEAD_MINUTES, 35, 'avance cron 35 min (retard GitHub + fetch)');
assert.equal(SCHEDULE_TOLERANCE_MINUTES, 75);
assert.equal(SAFETY_NET_CRON, '20 * * * *');

function utc(iso) {
  return new Date(iso);
}

function slotIso(iso) {
  return scheduledSlotFor(utc(iso));
}

// 17 h QC = 21:00 UTC. Cron à 20:25. Un fetch de 10 min atterrit vers 20:35.
assert.equal(slotIso('2026-08-24T20:25:00.000Z'), '2026-08-24T21:00:00.000Z');
assert.equal(slotIso('2026-08-24T20:40:00.000Z'), '2026-08-24T21:00:00.000Z');
assert.equal(slotIso('2026-08-24T21:00:00.000Z'), '2026-08-24T21:00:00.000Z');
assert.equal(slotIso('2026-08-24T21:40:00.000Z'), '2026-08-24T21:00:00.000Z');
assert.equal(slotIso('2026-08-24T22:16:00.000Z'), null, 'hors tolérance 75 min après 17 h');

// 13 h QC = 17:00 UTC, cron 16:25.
assert.equal(slotIso('2026-08-24T16:25:00.000Z'), '2026-08-24T17:00:00.000Z');
assert.equal(slotIso('2026-08-24T17:58:00.000Z'), '2026-08-24T17:00:00.000Z');

// 06 h QC = 10:00 UTC, cron 09:25.
assert.equal(slotIso('2026-08-24T09:25:00.000Z'), '2026-08-24T10:00:00.000Z');

// 07 h QC = 11:00 UTC, cron 10:25.
assert.equal(slotIso('2026-08-24T10:25:00.000Z'), '2026-08-24T11:00:00.000Z');

// 12 h QC = 16:00 UTC, cron 15:25.
assert.equal(slotIso('2026-08-24T15:25:00.000Z'), '2026-08-24T16:00:00.000Z');
assert.equal(slotIso('2026-08-24T16:10:00.000Z'), '2026-08-24T16:00:00.000Z');

// 21 h QC = 01:00 UTC le lendemain, cron 00:25.
assert.equal(slotIso('2026-08-25T00:25:00.000Z'), '2026-08-25T01:00:00.000Z');
assert.equal(slotIso('2026-08-25T01:10:00.000Z'), '2026-08-25T01:00:00.000Z');

// Filet :20 hors de toute fenêtre (12:20 UTC : 7 h QC fini, 9 h pas encore).
assert.equal(slotIso('2026-08-24T12:20:00.000Z'), null);

function expandCron(expr) {
  const parts = expr.trim().replace(/^'|'$/g, '').split(/\s+/);
  assert.equal(parts.length, 5, `cron à 5 champs : ${expr}`);
  const minute = Number(parts[0]);
  if (parts[1] === '*') return [];
  return parts[1].split(',').map((hour) => ({ hour: Number(hour), minute }));
}

const workflow = readFileSync(new URL('../.github/workflows/update-news.yml', import.meta.url), 'utf8');
assert.match(
  workflow,
  /github\.event_name == 'workflow_dispatch' && 'manual'/,
  'filet :20 ne doit pas annuler une passe manuelle',
);
assert.match(
  workflow,
  /cancel-in-progress:\s*false/,
  'ne pas annuler un fetch déjà parti (filet radio/sports ou primaire)',
);
assert.match(
  workflow,
  /Successful fetch — always publish so the live stamp is the last check/,
  'toute passe qui a fetché publie le tampon live',
);
assert.match(
  workflow,
  /workflow_run:/,
  'filet workflow_run déclaré (GitHub lâche les crons fréquents)',
);
assert.match(
  workflow,
  /EVENT='\$\{\{ github\.event_name \}\}'/,
  'gate : distingue primaire, :20 et workflow_run',
);
assert.ok(
  FILET_WORKFLOWS.length >= 2,
  'au moins deux bots filet (radio + sports RSEQ)',
);
for (const name of FILET_WORKFLOWS) {
  assert.ok(
    workflow.includes(`- ${name}`),
    `update-news.yml déclenché par « ${name} »`,
  );
}
const radioYml = readFileSync(new URL('../.github/workflows/update-radio-nowplaying.yml', import.meta.url), 'utf8');
const sportsYml = readFileSync(new URL('../.github/workflows/update-sports.yml', import.meta.url), 'utf8');
assert.equal(
  radioYml.match(/^name:\s*(.+)$/m)[1].trim(),
  'Update Radio Now Playing',
);
assert.equal(
  sportsYml.match(/^name:\s*(.+)$/m)[1].trim(),
  'Update Student Sports (RSEQ)',
);
assert.deepEqual(
  FILET_WORKFLOWS.slice().sort(),
  ['Update Radio Now Playing', 'Update Student Sports (RSEQ)'].sort(),
);
const fetchNews = readFileSync(new URL('../scripts/fetch-news.js', import.meta.url), 'utf8');
assert.match(
  fetchNews,
  /eventName === 'workflow_dispatch'/,
  'passe manuelle : pas de créneau, l’UI montre l’heure réelle',
);
assert.match(
  fetchNews,
  /eventName === 'workflow_run'/,
  'filet radio/sports : pas de créneau, l’UI montre l’heure réelle',
);
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

const feeds = readFileSync(new URL('../feeds.html', import.meta.url), 'utf8');
assert.match(
  feeds,
  /<li>6:00<\/li><li>7:00<\/li><li>9:00<\/li><li>11:00<\/li><li>12:00<\/li>\s*<li>13:00<\/li><li>15:00<\/li><li>17:00<\/li><li>19:00<\/li><li>21:00<\/li>/,
  'feeds.html : 6 h, midi, et toutes les 2 h de 7 h à 21 h',
);

console.log('OK news-schedule');

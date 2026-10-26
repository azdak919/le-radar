#!/usr/bin/env node
/** Page Sports : plages de régates (24-25 oct.), état « Résultats à venir », jamais « Aujourd’hui ». */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = require(join(ROOT, 'scripts/seo-pages.js'));
const C = require(join(ROOT, 'scripts/cicsa-sailing-lib.js'));

assert.equal(S.sportsEventRangeLabel({ eventStart: '2026-10-24', eventEnd: '2026-10-25' }), '24-25 oct.');
assert.equal(S.sportsEventRangeLabel({ eventStart: '2026-09-12', eventEnd: '2026-09-13' }), '12-13 sept.');
assert.equal(S.sportsEventRangeLabel({ eventStart: '2026-10-31', eventEnd: '2026-11-01' }), '31 oct.-1 nov.');
assert.equal(S.sportsEventRangeLabel({ eventStart: '2026-10-03', eventEnd: '2026-10-03' }), '', 'un seul jour : pas de plage');
assert.equal(S.sportsEventRangeLabel({ date: '2026-10-03' }), '', 'sans fin officielle : jamais devinée');
assert.equal(S.sportsEventPhase({ eventStart: '2000-01-01', eventEnd: '2000-01-02' }), 'after');
assert.equal(S.sportsEventPhase({ eventStart: '2999-01-01', eventEnd: '2999-01-02' }), 'before');

const page = (d) => `<span class="page-info-key">Date</span><span class="page-info-value"><time datetime="x" itemprop="startDate">${d}</time></span>`;
assert.deepEqual(
  { ...C.parseIcsaRegattaDates(page('September 12-13, 2026')), label: undefined },
  { start: '2026-09-12', end: '2026-09-13', label: undefined },
);
assert.equal(C.parseIcsaRegattaDates(page('October 31-November 1, 2026')).end, '2026-11-01');
assert.equal(C.parseIcsaRegattaDates(page('October 3, 2026')).end, '2026-10-03');
assert.equal(C.parseIcsaRegattaDates('<p>pas de date</p>'), null);

// Rendu statique : aucune régate en « Aujourd’hui » ni « · résultats à venir » collé au titre.
const html = readFileSync(join(ROOT, 'sports/index.html'), 'utf8');
for (const m of html.matchAll(/<li class="sports-result[^"]*"[^>]*data-game-id="cicsa[^"]*"[^>]*>([\s\S]*?)<\/li>/g)) {
  assert.doesNotMatch(m[1], /sports-result__time[^>]*>Aujourd/, 'régate CICSA jamais « Aujourd’hui »');
  assert.doesNotMatch(m[1], /sports-result__opp">[^<]*· résultats à venir/i, 'suffixe retiré du titre');
}
assert.match(readFileSync(join(ROOT, 'sports-board.js'), 'utf8'), /data-event-state'\) === 'awaiting'/);
console.log('OK sports-page-ranges');

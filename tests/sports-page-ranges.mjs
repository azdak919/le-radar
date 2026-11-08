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
// Rang de saison CICSA libellé : distinct d’une place à une régate.
const season = { cicsaSeason: { season: '2026-2027', rank: 11, field: 16, score: 7.5 } };
assert.equal(S.sportsCicsaSeasonMeta(season, 'fr'), 'Classement saison CICSA 2026-2027\u00a0: 11e/16 · 7,5 pts');
assert.equal(S.sportsCicsaSeasonMeta(season, 'en'), 'CICSA 2026-2027 season standing: 11th/16 · 7.5 pts');
// Ordre : à venir d’abord, puis résultats du plus récent au plus ancien.
{
  const team = { sport: 'sailing', results: [
    { date: '2026-10-25', opponent: 'B', scoreFor: 7, scoreAgainst: 11, scoreKind: 'place', sport: 'sailing' },
    { date: '2026-10-11', opponent: 'A', scoreFor: 9, scoreAgainst: 12, scoreKind: 'place', sport: 'sailing' },
  ], nextGame: { date: '2026-11-14', opponent: 'C', sport: 'sailing' } };
  const out = S.sportsResultRows(team, {}, 'fr');
  const dates = [...out.matchAll(/datetime="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(dates, ['2026-11-14', '2026-10-25', '2026-10-11'], 'à venir en haut, puis passés récents → anciens');
}
// Complete season, not the masthead preview: eight regular results + playoff + final.
{
  const results = Array.from({ length: 8 }, (_, i) => ({ gameId: `regular-${i}`, date: `2026-09-${String(i + 1).padStart(2, '0')}`, time: '15:00', opponent: 'Official opponent', scoreFor: 21, scoreAgainst: 7, result: 'W' }));
  const playoff = { ...results[0], gameId: 'semi', date: '2026-11-07', scoreFor: 42, scoreAgainst: 4 };
  const final = { gameId: 'final', date: '2026-11-14', time: '13:00', opponent: 'Official opponent' };
  const team = { sport: 'football', source: 'rseq-s1', leagueId: 'd9538539-2732-439b-8521-02da4f3da6e8', results: [playoff, ...results], lastGame: playoff, nextGame: final, nextGames: [final] };
  const out = S.sportsResultRows(team, {}, 'fr');
  assert.equal((out.match(/<li class="sports-result/g) || []).length, 10);
  assert.equal((out.match(/data-result=/g) || []).length, 9);
  assert.equal((out.match(/data-game-id="final"/g) || []).length, 1);
  assert.ok(out.indexOf('data-game-id="final"') < out.indexOf('data-game-id="semi"'));
  assert.match(out, /sports-panel__results-source" hidden/);
  for (const sport of ['soccer', 'rugby', 'sailing']) assert.equal((S.sportsResultRows({ ...team, sport }, {}, 'fr').match(/<li class="sports-result/g) || []).length, 10, sport);
  const empty = { ...team, results: [], lastGame: null, nextGames: [], nextGame: null, scheduleUnavailable: true };
  const link = 'Consulter les résultats sur le site officiel';
  for (const variant of [empty, { ...empty, nextGame: final, nextGames: [final] }]) {
    const html = S.sportsResultRows(variant, {}, 'fr');
    assert.ok(html.includes(link));
    assert.doesNotMatch(html, /sports-panel__results-source" hidden/);
    assert.match(html, /https:\/\/diffusion.rseq.ca\/\?Type=League&amp;LeagueId=/);
    assert.doesNotMatch(html, /courriel|email|prépar/i);
  }
  assert.equal(S.sportsResultsSourceUrl({ source: 'unknown', resultsSourceUrl: 'javascript:alert(1)' }), '');
  assert.equal(S.sportsResultsSourceUrl({ source: 'unknown' }), '');
  assert.equal(S.sportsResultsSourceUrl({ sport: 'hockey', sex: 'F', registryId: 'concordia', source: 'campus-hockey', results: [{url:'https://example.invalid/a-single-game'}] }), 'https://www.concordia.ca/fr/stingers/hockey_f/resultats.html');
  assert.equal(S.sportsResultsSourceUrl({ source: 'spordle-rseqhockey', sector: 'collegial' }), 'https://collegial.rseqhockey.com/fr');
  assert.equal(S.sportsResultsSourceUrl({ source: 'rseq-s1', leagueId: 'invalid' }), '');
}
console.log('OK sports-page-ranges');

// The build marker must also survive a legitimately empty sports bank.
{
  const { pages } = S.buildEntityPages({
    radios: [], sources: [], news: [], institutions: [], schedules: {},
    sports: { teams: {}, errors: [] }, siteBase: 'https://example.invalid',
  });
  for (const path of ['sports/', 'en/sports/']) {
    const page = pages.find(page => page.path === path);
    assert.ok(page, path);
    assert.match(page.html, /<p class="seo-empty"[^>]*data-sports-history="complete"/);
    assert.doesNotMatch(page.html, /class="sports-panel"/);
  }
}

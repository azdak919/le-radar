#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const lib = require(join(ROOT, 'scripts/campus-hockey-lib.js'));

assert.equal(lib.resolveNick('Torrents').registryId, 'uqo');
assert.equal(lib.resolveNick('Vert-et-Or').registryId, 'usherbrooke');
assert.equal(lib.resolveNick('Piranhas').registryId, 'ets');
assert.equal(lib.resolveNick('Inuk').registryId, 'uqac');
assert.equal(lib.parseFrDateTime('Samedi 10 octobre 2026 20 h 00').date, '2026-10-10');
assert.equal(lib.parseFrDateTime('Samedi 10 octobre 2026 20 h 00').time, '20:00');
assert.equal(lib.parseFrDateTime('Dimanche 29 novembre 2026 20 h').time, '20:00');

const uqoHtml = `
<table>
<tr><th>Date / heure</th><th>Lieu</th><th>Équipes (local vs visiteur)</th><th>Résultats</th></tr>
<tr><td>Samedi 10 octobre 2026 20 h 00</td><td>Sherbrooke</td><td>Vert-et-Or vs Torrents</td><td></td></tr>
<tr><td>Vendredi 23 octobre 2026 19 h 15</td><td>Gatineau</td><td>Torrents vs Piranhas</td><td>4-2</td></tr>
</table>`;
const uqoGames = lib.parseUqoScheduleHtml(uqoHtml);
assert.equal(uqoGames.length, 2);
assert.equal(uqoGames[0].homeRegistryId, 'usherbrooke');
assert.equal(uqoGames[0].awayRegistryId, 'uqo');
assert.equal(uqoGames[1].scoreHome, 4);
assert.equal(uqoGames[1].scoreAway, 2);

const uqacJson = {
  events: [
    {
      title: '[Hockey masculin] Match hors concours : SHERBROOKE vs UQAC',
      start_date: '2026-09-19 16:00:00',
      url: 'https://www.uqac.ca/inuk/evenement/x',
      categories: [{ slug: 'a-domicile' }, { slug: 'hockey-masculin' }],
    },
    {
      title: '[Hockey masculin] Match : UQAC vs SHERBROOKE',
      start_date: '2026-10-23 20:00:00',
      url: 'https://www.uqac.ca/inuk/evenement/y',
      categories: [{ slug: 'hockey-masculin' }],
    },
  ],
};
const uqacGames = lib.parseUqacEventsJson(uqacJson);
assert.equal(uqacGames.length, 2);
assert.equal(uqacGames[0].homeRegistryId, 'uqac');
assert.equal(uqacGames[0].awayRegistryId, 'usherbrooke');
assert.equal(uqacGames[0].time, '16:00');
assert.equal(uqacGames[1].homeRegistryId, 'usherbrooke');
assert.equal(uqacGames[1].awayRegistryId, 'uqac');

const merged = lib.mergeGames([uqoGames, uqacGames]);
const now = Date.parse('2026-09-19T12:00:00-04:00');
const teams = lib.teamsFromGames(merged, { now });
assert.ok(Object.keys(teams).length >= 3, `équipes ${Object.keys(teams)}`);
const uqac = Object.values(teams).find((t) => t.registryId === 'uqac');
assert.ok(uqac);
assert.ok(uqac.nextGames.length >= 1, 'UQAC a des à-venir');
assert.equal(uqac.nextGame.date, '2026-09-19');
assert.equal(uqac.nextGame.opponent, 'Sherbrooke');

const s1 = {
  'universitaire:hockey:s1:uqac': {
    id: 'universitaire:hockey:s1:uqac',
    sport: 'hockey',
    registryId: 'uqac',
    sex: 'M',
    sector: 'universitaire',
    nextGames: [],
    nextGame: null,
    source: 'rseq-s1',
  },
};
const ov = lib.overlayCampusHockey(s1, teams);
assert.ok(ov.attached >= 1);
assert.ok(s1['universitaire:hockey:s1:uqac'].nextGames.length >= 1);
assert.match(s1['universitaire:hockey:s1:uqac'].source, /campus-hockey/);

const stingersHtml = `
<title>Hockey (W) 2026-2027 Schedule</title>
<ul>
  <li>Oct. 16</li>
  <li>7:30 PM</li>
  <li>@ Bishop's</li>
  <li>League</li>
</ul>
<ul>
  <li>Oct. 25</li>
  <li>2 PM</li>
  <li>vs. Montréal</li>
  <li>League</li>
</ul>`;
const stGames = lib.parseStingersResultsHtml(stingersHtml);
assert.equal(stGames.length, 2);
assert.equal(stGames[0].awayRegistryId, 'concordia');
assert.equal(stGames[0].homeRegistryId, 'bishops');
assert.equal(stGames[0].sex, 'F');
assert.equal(stGames[1].homeRegistryId, 'concordia');
assert.equal(stGames[1].awayRegistryId, 'udem');

const sidearm = `<script type="application/ld+json">${JSON.stringify([{
  '@type': 'SportsEvent',
  name: "Bishop's University At McGill University",
  startDate: '2026-10-18T15:00:00',
  homeTeam: { name: "Bishop's University" },
  awayTeam: { name: 'McGill University' },
}])}</script>`;
const sideGames = lib.parseSidearmJsonLd(sidearm, 'https://gaiters.ca/x', 'campus-gaiters-w');
assert.equal(sideGames.length, 1);
assert.equal(sideGames[0].homeRegistryId, 'mcgill', 'At X → X is home');
assert.equal(sideGames[0].awayRegistryId, 'bishops');

const src = readFileSync(join(ROOT, 'scripts/fetch-sports.js'), 'utf8');
assert.match(src, /campus-hockey-lib/);
assert.match(src, /calendriers campus/);

console.log('OK campus-hockey');

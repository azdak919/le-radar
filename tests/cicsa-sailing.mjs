/**
 * CICSA — clubs de voile du Québec seulement.
 * La feuille réelle est large ; ici la même forme : classement,
 * régates côte à côte, barème vide, calendrier.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { buildCicsaQcTeams, qcBoat } = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts/cicsa-sailing-lib.js'));

const CLUBS = [
  { registryId: 'mcgill', clubName: 'McGill Sailing', name: 'Université McGill', code: 'MCG', rseqTeamId: 'mcgill' },
  { registryId: 'concordia', clubName: 'Concordia Sailing', name: 'Université Concordia', code: 'UCON', rseqTeamId: 'concordia' },
  { registryId: 'polytechnique', clubName: 'PolyVoile', name: 'Polytechnique Montréal', code: 'POLY', rseqTeamId: 'POLY' },
  { registryId: 'ulaval', clubName: 'ULaVoile', name: 'Université Laval', code: 'LAV', rseqTeamId: 'ulaval' },
  { registryId: 'usherbrooke', clubName: 'Voile UdeS', name: 'Université de Sherbrooke', code: 'USHE', rseqTeamId: 'usherbrooke' },
];

const SCORES = `
,Team,Region,Notes*,Current Region Score,Season Score (Region score + National Championship)
,DAL,Atlantic,,8.6,11.5
,QU,Ontario,,9.0,14.7,,,,Rank,Team,Season Score
,CON,Québec,,7.2,7.2,,,,8,Con,7.2
,McG,Québec,,8.7,18.8,,,,1,McG,18.8
,POLY,Québec,,0.0,0.0,,,,14,POLY,0.0
,MdeS,Québec,,2.9,2.9,,,,11,UdeS,2.9
,UO,Ontario,,3.1,10.3
,,,,,
CAN/AMs (September 19-20),,,,,Womens Event (October 3-4),,,,Quebec Regionals (October 10-11),
Team,Rank,Points,Notes,,Team,Rank,Points,Notes,,Team,Rank,Points,Notes
QU1,1,9.17,,,McG,1,9.00,,,,1,9.23,
McG,2,8.33,,,QU,3,7.00,,,,2,8.46,
CON,6,5.00,,,LVL,9,1.00,,,,3,7.69,
MdeS,8,3.33,,,McG2,6,4.00,Not Scored
WLU,11,0.83,No Show,,,,,,,
`;

const SCHEDULE = `
Weekend,Date,Region,2026-27 Events,Host,Venue,Tier,Spots,Points
,,,,,,,,,Host (1),2,3,4,Notes,Teams,Entries
5,Oct 10-11,Quebec,Quebec Regionals,McG,PCYC,REG,12,9.23,McG,CON,UdeS,LVL,,,
6,Oct 17-18,Ontario,Match Race Nationals,CICSA,RCYC,NAT,12,12,McG,CON,UdeS,WLU,,
7,Oct 24-25,Quebec,Team Race Nationals,McG,PCYC,NAT,12,12,McG,CON,UdeS,LVL,Poly
,Oct 15-16,,Match Racing Clinic,CICSA,RCYC,Clinic,12,,
`;

function built() {
  return buildCicsaQcTeams(SCORES, SCHEDULE, {
    seasonStartYear: 2026,
    seasonLabel: '2026-2027',
    clubs: CLUBS,
    today: '2026-10-11',
  });
}

test('codes CICSA du Québec', () => {
  assert.equal(qcBoat('McG').registryId, 'mcgill');
  assert.equal(qcBoat('McG 2').boat, '2');
  assert.equal(qcBoat('MdeS').registryId, 'usherbrooke');
  assert.equal(qcBoat('LVL').registryId, 'ulaval');
  assert.equal(qcBoat('QU1'), null);
  assert.equal(qcBoat('WLU'), null);
});

test('clubs QC : places, classement, pas de hors-province', () => {
  const { teams } = built();
  const ids = Object.values(teams).map((team) => team.registryId).sort();
  assert.deepEqual(ids, ['concordia', 'mcgill', 'polytechnique', 'ulaval', 'usherbrooke']);
  const blob = JSON.stringify(teams);
  assert.doesNotMatch(blob, /Dalhousie|Queen's|Ottawa|Laurier|RMC/);

  const mcgill = teams['sailing:universitaire:mcgill'];
  assert.equal(mcgill.cicsaSeason.rank, 1);
  assert.equal(mcgill.cicsaSeason.field, 4);
  assert.equal(mcgill.cicsaSeason.score, 18.8);
  assert.equal(mcgill.kind, 'association-etudiante');
  assert.equal(mcgill.source, 'cicsa');
  const places = mcgill.results.map((game) => `${game.date} ${game.opponent} ${game.scoreFor}/${game.scoreAgainst}`);
  assert.ok(places.some((line) => line.includes('2026-10-04') && line.includes('Épreuve féminine') && line.includes('1/')), places.join(' | '));
  assert.ok(places.some((line) => line.includes('équipage 2')), 'le deuxième équipage reste un résultat');
  assert.equal(mcgill.results.some((game) => /no show/i.test(JSON.stringify(game))), false);
  assert.equal(mcgill.nextGame.opponent, 'Régionale Québec');
  assert.equal(mcgill.nextGame.date, '2026-10-11');
  assert.equal(mcgill.nextGame.url, 'https://cicsailing.ca/season-schedule');
  assert.match(mcgill.results[0].url, /cicsailing\.ca\/season-results/);

  const poly = teams['sailing:universitaire:polytechnique'];
  assert.equal(poly.results.length, 0);
  assert.equal(poly.cicsaSeason.rank, 14);
  assert.equal(poly.nextGame.opponent, 'Nationaux team race');
  assert.equal(poly.nextGame.date, '2026-10-24');

  const laval = teams['sailing:universitaire:ulaval'];
  assert.ok(laval.results.some((game) => game.scoreFor === 9));
  assert.equal(laval.nextGame.date, '2026-10-11');

  const con = teams['sailing:universitaire:concordia'];
  assert.ok(con.results.some((game) => game.opponent.includes('CAN/AMs') && game.scoreFor === 6));
  assert.equal(con.results.some((game) => /Régionale Québec/.test(game.opponent) && game.scoreFor), false);
});

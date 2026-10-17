/**
 * Pointages en cours de match U SPORTS / RSEQ Direct (PrestoSports).
 * Fixtures : extraits réels des pages composite du 17 oct. 2026 vers 19 h 15 HAE.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const Presto = require(join(ROOT, 'scripts/sports-presto-live-lib.js'));
const Live = require(join(ROOT, 'scripts/sports-live-lib.js'));
const registry = JSON.parse(readFileSync(join(ROOT, 'sports-teams.json'), 'utf8'));

const FIX = join(ROOT, 'tests/fixtures/presto-live');
const RD_HTML = readFileSync(join(FIX, 'rseqdirect-2026-10-17.html.txt'), 'utf8');
const US_HTML = readFileSync(join(FIX, 'usports-2026-10-17.html.txt'), 'utf8');
const NOW = Date.parse('2026-10-17T23:15:00.000Z'); // 19:15 HAE, heure des fixtures
const DAY = '2026-10-17';

function face(gameId, { date = DAY, time, home, opponent, opponentFullName, opponentRegistryId, sport }) {
  return { date, time, opponent, opponentFullName, opponentRegistryId, home, sport, gameId, live: true };
}

/** Deux formations d’un même match RSEQ (comme sports.json déplié). */
function pairTeams(gameId, { sector, sport, sex, time, home, away }) {
  const mk = (us, them, isHome) => {
    const g = face(gameId, {
      time, home: isHome, sport,
      opponent: them.name, opponentFullName: them.fullName, opponentRegistryId: them.id,
    });
    return {
      id: `${sector}:${sport}:L:${us.id}:${gameId}`,
      sector, sport, sex,
      name: us.name, fullName: us.fullName, registryId: us.id,
      nextGames: [g], nextGame: g, results: [], lastGame: null,
    };
  };
  const h = mk(home, away, true);
  const a = mk(away, home, false);
  return { [h.id]: h, [a.id]: a };
}

const CSL = { id: 'champlain-st-lambert', name: 'Champlain St-Lambert', fullName: 'Champlain College Saint-Lambert' };
const BRE = { id: 'brebeuf', name: 'Jean-de-Brébeuf', fullName: 'Collège Jean-de-Brébeuf' };
const VAN = { id: 'vanier', name: 'Vanier', fullName: 'Vanier College' };
const CEM = { id: 'edouard-montpetit', name: 'Édouard-Montpetit', fullName: 'Cégep Édouard-Montpetit' };
const UQAC = { id: 'uqac', name: 'UQAC', fullName: 'Université du Québec à Chicoutimi' };
const MCG = { id: 'mcgill', name: 'McGill', fullName: 'Université McGill' };

function todayTeams() {
  return {
    // RSEQ : Champlain St-Lambert (domicile) vs Jean-de-Brébeuf, 17 h 15, basket M.
    ...pairTeams('g-bre-csl', { sector: 'collegial', sport: 'basketball', sex: 'M', time: '17:15', home: CSL, away: BRE }),
    // RSEQ : Vanier (domicile) vs Champlain St-Lambert, 18 h 45, basket F.
    ...pairTeams('g-csl-van', { sector: 'collegial', sport: 'basketball', sex: 'F', time: '18:45', home: VAN, away: CSL }),
    // RSEQ : Vanier vs Édouard-Montpetit, 19 h 30 — RSEQ Direct affiche déjà « Start of 2nd 0–0 ».
    ...pairTeams('g-cem-van', { sector: 'collegial', sport: 'basketball', sex: 'M', time: '19:30', home: VAN, away: CEM }),
    // Universitaire : McGill vs UQAC (volleyball F 17 h) — final U SPORTS, RSEQ pas encore versé.
    ...pairTeams('g-uqac-mcg', { sector: 'universitaire', sport: 'volleyball', sex: 'F', time: '17:00', home: MCG, away: UQAC }),
  };
}

function feeds() {
  return [
    { source: 'rseqdirect', sector: 'collegial', date: DAY, ok: true, events: Presto.parseCompositeHtml(RD_HTML) },
    { source: 'usports', sector: 'universitaire', date: DAY, ok: true, events: Presto.parseCompositeHtml(US_HTML) },
  ];
}

const byGame = (teams, gid) => Object.values(teams).map((t) => ({
  team: t,
  next: (t.nextGames || []).find((g) => g.gameId === gid),
  res: (t.results || []).find((g) => g.gameId === gid),
})).filter((x) => x.next || x.res);

test('parse : cartes réelles RSEQ Direct (en cours, final, à venir)', () => {
  const ev = Presto.parseCompositeHtml(RD_HTML);
  assert.equal(ev.length, 23);
  const bre = ev.find((e) => e.away.name === 'Collège Jean-de-Brébeuf');
  assert.equal(bre.state, 'live');
  assert.equal(bre.sport, 'basketball');
  assert.equal(bre.sex, 'M');
  assert.equal(bre.home.name, 'Champlain College Saint-Lambert');
  assert.deepEqual([bre.away.score, bre.home.score], [77, 59]);
  assert.equal(bre.statusText, '4th - 01:23');
  const fin = ev.find((e) => e.statusText === 'Final - 2OT');
  assert.equal(fin.state, 'final');
  assert.deepEqual([fin.away.score, fin.home.score], [82, 85]);
  const up = ev.filter((e) => e.state === 'scheduled');
  assert.ok(up.length >= 10);
  assert.ok(up.every((e) => e.home.score == null));
});

test('parse : cartes réelles U SPORTS (hockey, soccer, volleyball)', () => {
  const ev = Presto.parseCompositeHtml(US_HTML);
  const unb = ev.find((e) => e.home.name === 'UNB' && e.sport === 'hockey');
  assert.equal(unb.state, 'live');
  assert.equal(unb.statusText, '2nd - 14:25');
  const vb = ev.find((e) => e.away.name === 'Lakehead');
  assert.equal(vb.sport, 'volleyball');
  assert.equal(vb.sex, 'F');
  assert.equal(vb.statusText, '20-25,14-25,8-18');
  const laval = ev.find((e) => e.home.name === 'Laval' && e.sport === 'basketball');
  assert.equal(laval.state, 'final');
  assert.deepEqual([laval.away.score, laval.home.score], [77, 57]);
});

test('période / horloge en français', () => {
  const p = (s, sp) => Presto.parseLiveStatus(s, sp).label;
  assert.equal(p('4th - 02:55', 'basketball'), '4e quart 2:55');
  assert.equal(p('1st - 05:31', 'basketball'), '1er quart 5:31');
  assert.equal(p('2nd - 15:14', 'hockey'), '2e période 15:14');
  assert.equal(p('Start of 2nd', 'hockey'), 'Début de la 2e période');
  assert.equal(p('End of 1st', 'basketball'), 'Fin du 1er quart');
  assert.equal(p('1st half - 09:54', 'soccer'), '1re mi-temps 9:54');
  assert.equal(p('Halftime', 'soccer'), 'Mi-temps');
  assert.equal(p('OT - 03:00', 'hockey'), 'Prolongation 3:00');
  assert.equal(p('25-18,23-22', 'volleyball'), '2e manche 23–22');
  assert.equal(p('', 'hockey'), '');
});

test('noms : Presto ↔ registre RSEQ', () => {
  const idx = Presto.buildRegistryIndex(registry);
  const ids = (n, s) => [...Presto.registryIdsFor(n, s, idx)];
  assert.deepEqual(ids('Collège Vanier', 'collegial'), ['vanier']);
  assert.deepEqual(ids('Champlain College Saint-Lambert', 'collegial'), ['champlain-st-lambert']);
  assert.deepEqual(ids('Collège Jean-de-Brébeuf', 'collegial'), ['brebeuf']);
  assert.deepEqual(ids('Mérici Collégial Privé', 'collegial'), ['merici']);
  assert.deepEqual(ids('Cégep Régional de Lanaudière', 'collegial'), ['lanaudiere']);
  assert.deepEqual(ids("Collège d'Alma", 'collegial'), ['alma']);
  assert.deepEqual(ids('Laval', 'universitaire'), ['ulaval']);
  assert.deepEqual(ids("Bishop's", 'universitaire'), ['bishops']);
  assert.deepEqual(ids('UQAC', 'universitaire'), ['uqac']);
  // « Sherbrooke » : le secteur tranche entre l’université et le cégep.
  assert.deepEqual(ids('Sherbrooke', 'universitaire'), ['usherbrooke']);
  assert.deepEqual(ids('Cégep de Sherbrooke', 'collegial'), ['cegep-sherbrooke']);
});

test('application : pointage en cours collé sur les deux formations, orienté', () => {
  const teams = todayTeams();
  const stats = Presto.applyPrestoLive(teams, feeds(), { registry, now: NOW });
  const faces = byGame(teams, 'g-bre-csl');
  const csl = faces.find((f) => f.team.registryId === 'champlain-st-lambert').next;
  const bre = faces.find((f) => f.team.registryId === 'brebeuf').next;
  assert.equal(csl.live, true);
  assert.deepEqual([csl.scoreFor, csl.scoreAgainst], [59, 77]);
  assert.deepEqual([bre.scoreFor, bre.scoreAgainst], [77, 59]);
  assert.equal(csl.period, '4e quart 1:23');
  assert.equal(csl.liveFeed, 'rseqdirect');
  const van = byGame(teams, 'g-csl-van').find((f) => f.team.registryId === 'vanier').next;
  assert.deepEqual([van.scoreFor, van.scoreAgainst], [28, 21]);
  assert.equal(van.period, '2e quart 6:25');
  assert.ok(stats.live >= 2);
  // Aucune mention « non officiel » nulle part dans les champs affichés.
  for (const f of [csl, bre, van]) {
    assert.ok(!/officiel|unofficial/i.test(JSON.stringify(f)));
  }
});

test('fausse entrée « Start of 2nd 0–0 » avant le coup d’envoi : écartée', () => {
  const teams = todayTeams();
  const stats = Presto.applyPrestoLive(teams, feeds(), { registry, now: NOW });
  for (const { next } of byGame(teams, 'g-cem-van')) {
    assert.equal(next.scoreFor, undefined);
    assert.equal(next.period, undefined);
    assert.equal(next.liveFeed, undefined);
  }
  assert.ok(stats.dropped >= 1);
  // 5 min après le coup d’envoi, une 2e période est encore impossible.
  const later = todayTeams();
  Presto.applyPrestoLive(later, feeds(), { registry, now: Date.parse('2026-10-17T23:35:00.000Z') });
  for (const { next } of byGame(later, 'g-cem-van')) assert.equal(next.scoreFor, undefined);
});

test('isPlausible : période annoncée vs temps écoulé', () => {
  const g = { date: DAY, time: '19:00' };
  const ev = (statusText, state = 'live') => ({ sport: 'hockey', state, statusText });
  const at = (hhmm) => Live.zonedTimeToMs(DAY, hhmm);
  assert.equal(Presto.isPlausible(ev('1st - 18:00'), g, at('19:02')), true);
  assert.equal(Presto.isPlausible(ev('1st - 18:00'), g, at('18:40')), false);
  assert.equal(Presto.isPlausible(ev('3rd - 10:00'), g, at('19:10')), false);
  assert.equal(Presto.isPlausible(ev('3rd - 10:00'), g, at('20:10')), true);
  assert.equal(Presto.isPlausible(ev('Final', 'final'), g, at('19:20')), false);
  assert.equal(Presto.isPlausible(ev('Final', 'final'), g, at('21:20')), true);
});

test('final U SPORTS avant le rapport RSEQ : résultat provisoire, pas « En direct »', () => {
  const teams = todayTeams();
  Presto.applyPrestoLive(teams, feeds(), { registry, now: NOW });
  const faces = byGame(teams, 'g-uqac-mcg');
  const mcg = faces.find((f) => f.team.registryId === 'mcgill');
  assert.equal(mcg.next, undefined);
  assert.deepEqual([mcg.res.scoreFor, mcg.res.scoreAgainst, mcg.res.result], [3, 0, 'W']);
  assert.equal(mcg.res.live, undefined);
  assert.equal(mcg.team.lastGame.gameId, 'g-uqac-mcg');
  const uqac = faces.find((f) => f.team.registryId === 'uqac');
  assert.equal(uqac.res.result, 'L');
  // La boucle live continue de relire la ligue jusqu’au rapport officiel.
  assert.ok(Live.liveGameIdsFromTeams(teams, NOW).includes('g-uqac-mcg'));
});

test('RSEQ officiel l’emporte : un match déjà pointé par S1 n’est pas touché', () => {
  const teams = todayTeams();
  for (const { next } of byGame(teams, 'g-bre-csl')) {
    next.scoreFor = next.home ? 60 : 80;
    next.scoreAgainst = next.home ? 80 : 60;
  }
  Presto.applyPrestoLive(teams, feeds(), { registry, now: NOW });
  const csl = byGame(teams, 'g-bre-csl').find((f) => f.team.registryId === 'champlain-st-lambert').next;
  assert.deepEqual([csl.scoreFor, csl.scoreAgainst], [60, 80]);
  assert.equal(csl.liveFeed, undefined);
});

test('pas de correspondance hasardeuse : mauvais sexe / mauvais adversaire', () => {
  const teams = {
    // Même établissements que Brébeuf–CSL, mais basket F : rien à coller.
    ...pairTeams('g-f', { sector: 'collegial', sport: 'basketball', sex: 'F', time: '17:15', home: CSL, away: BRE }),
    // Bon sport, mauvais adversaire.
    ...pairTeams('g-x', { sector: 'collegial', sport: 'basketball', sex: 'M', time: '17:15', home: CSL, away: CEM }),
  };
  Presto.applyPrestoLive(teams, feeds(), { registry, now: NOW });
  for (const t of Object.values(teams)) {
    assert.equal(t.nextGames[0].scoreFor, undefined, t.id);
  }
});

test('source en panne : rien ne casse, dernier pointage connu recollé', async () => {
  const prev = todayTeams();
  Presto.applyPrestoLive(prev, feeds(), { registry, now: NOW });
  const teams = todayTeams();
  const stats = await Presto.overlayPrestoLive(teams, {
    registry,
    previousTeams: prev,
    now: NOW,
    fetchImpl: async () => { throw new Error('HTTP 503'); },
  });
  assert.equal(stats.failed.length, 2);
  const csl = byGame(teams, 'g-bre-csl').find((f) => f.team.registryId === 'champlain-st-lambert').next;
  assert.deepEqual([csl.scoreFor, csl.scoreAgainst], [59, 77]);
  // Sans snapshot précédent : payload RSEQ intact.
  const bare = todayTeams();
  const before = JSON.stringify(bare);
  await Presto.overlayPrestoLive(bare, { registry, now: NOW, fetchImpl: async () => { throw new Error('timeout'); } });
  assert.equal(JSON.stringify(bare), before);
});

test('overlay : 1 requête par site et par jour, cache contourné', async () => {
  const urls = [];
  const teams = todayTeams();
  const stats = await Presto.overlayPrestoLive(teams, {
    registry,
    now: NOW,
    fetchImpl: async (url) => {
      urls.push(url);
      return url.includes('rseqdirect') ? RD_HTML : US_HTML;
    },
  });
  assert.equal(urls.length, 2);
  assert.ok(urls.every((u) => /\/composite\?d=2026-10-17&_=\d+$/.test(u)));
  assert.ok(stats.live >= 2);
  // Aucun match en fenêtre : aucune requête.
  const none = [];
  await Presto.overlayPrestoLive({}, { registry, now: NOW, fetchImpl: async (u) => { none.push(u); return ''; } });
  assert.equal(none.length, 0);
});

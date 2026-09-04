/**
 * Contrôles unitaires du bot sports + payload sports.json + registre.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

test('sports-leagues.json liste des ligues RSEQ avec UUID', () => {
  const catalog = JSON.parse(readFileSync(join(ROOT, 'sports-leagues.json'), 'utf8'));
  assert.ok(Array.isArray(catalog.leagues));
  assert.ok(catalog.leagues.length >= 4);
  for (const league of catalog.leagues) {
    assert.match(league.id, /^[a-f0-9-]{36}$/i, league.label);
    assert.ok(league.sector === 'collegial' || league.sector === 'universitaire', league.label);
    assert.ok(league.sport && league.sportLabel, league.label);
  }
  const hasUni = catalog.leagues.some((l) => l.sector === 'universitaire' && l.usports);
  assert.ok(hasUni, 'au moins une ligue universitaire (U Sports / RSEQ)');
});

test('sports.json a des équipes normalisées', () => {
  const path = join(ROOT, 'sports.json');
  assert.ok(existsSync(path), 'sports.json absent — lancer node scripts/fetch-sports.js --update');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  assert.ok(data.updated);
  assert.match(String(data.source || ''), /rseq-s1/);
  const teams = Object.values(data.teams || {});
  assert.ok(teams.length >= 10, `attendu ≥10 équipes, reçu ${teams.length}`);
  // Certaines disciplines (athlétisme, cross…) n’ont pas toujours de match
  // calendrier ; on vérifie le contrat sur les formations qui en ont un.
  const withGames = teams.filter((t) => t.lastGame || t.nextGame);
  assert.ok(withGames.length >= 10, `attendu ≥10 équipes avec match, reçu ${withGames.length}`);
  for (const team of withGames.slice(0, 20)) {
    assert.ok(team.id && team.name && team.code, team.id);
    assert.ok(team.sector === 'collegial' || team.sector === 'universitaire');
    assert.ok(team.lastGame || team.nextGame, `${team.name} sans match`);
  }
  // Registre appliqué (noms enrichis)
  const withReg = teams.filter((t) => t.registryId);
  assert.ok(withReg.length >= 30, `attendu beaucoup de registryId, reçu ${withReg.length}`);
  const garneau = teams.find((t) => t.code === 'GAR');
  assert.ok(garneau, 'Garneau présent');
  assert.ok(garneau.fullName, 'Garneau.fullName depuis le registre');
});

test('sports-masthead.json est le snapshot léger de l’accueil', () => {
  const path = join(ROOT, 'sports-masthead.json');
  assert.ok(existsSync(path), 'sports-masthead.json absent — lancer node scripts/build-sports-masthead.js --write');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  assert.ok(data.updated);
  assert.ok(data.masthead?.nextGameLimit >= 16);
  assert.ok(data.teamCount > 0);
  assert.equal(data.teamCount, Object.keys(data.teams || {}).length);
});

test('sports-teams.json registre des formations', () => {
  const reg = JSON.parse(readFileSync(join(ROOT, 'sports-teams.json'), 'utf8'));
  assert.ok(Array.isArray(reg.teams));
  assert.ok(reg.teams.length >= 30, `registre trop petit: ${reg.teams.length}`);
  for (const t of reg.teams) {
    assert.ok(t.id && t.code && t.shortName && t.sector, t.id);
    assert.ok(Array.isArray(t.aliases) && t.aliases.length >= 1, t.id);
  }
  const { loadSportsTeamsRegistry, resolveSportsTeam } = require(join(ROOT, 'scripts/sports-teams-lib.js'));
  const loaded = loadSportsTeamsRegistry();
  const garneau = resolveSportsTeam(loaded, { name: 'Garneau', code: 'GAR', sector: 'collegial' });
  assert.equal(garneau.matched, true);
  assert.equal(garneau.shortName, 'Garneau');
  assert.match(garneau.fullName || '', /Garneau/);
  assert.equal(garneau.code, 'GAR');
  const len = resolveSportsTeam(loaded, { name: 'Ch.-Lennoxville', code: 'LEN' });
  assert.equal(len.matched, true);
  assert.match(len.fullName || '', /Lennoxville|Champlain/i);
});

test('fetch-sports.js est du JS Node valide', () => {
  const src = readFileSync(join(ROOT, 'scripts/fetch-sports.js'), 'utf8');
  assert.match(src, /GetLeagueDiffusion/);
  assert.match(src, /GetGameDiffusion/);
  assert.match(src, /--update/);
  assert.match(src, /--live/);
  assert.match(src, /SCORE_NONE/);
  assert.match(src, /sports-live-lib/);
  assert.match(src, /buildSportsMastheadPayload/);
  assert.match(src, /loadSportsTeamsRegistry|sports-teams-lib/);
  // Fraîcheur ops : préservation sur panne + abort si payload catastrophique.
  assert.match(src, /preserveByLeagueId|preservePreviousTeams/);
  assert.match(src, /ABORT/);
  assert.match(src, /teamsPreservedOnError/);
  assert.match(src, /preserveHarvestCatalogStats/);
  assert.match(src, /loadPreviousPayload/);
});

test('update-sports.yml couvre les heures de consultation QC', () => {
  const yml = readFileSync(join(ROOT, '.github/workflows/update-sports.yml'), 'utf8');
  // 6 passes quotidiennes + week-end après-midi
  assert.match(yml, /30 11 \* \* \*/);
  assert.match(yml, /15 16 \* \* \*/);
  assert.match(yml, /45 20 \* \* \*/);
  assert.match(yml, /0 0 \* \* \*/);
  assert.match(yml, /30 2 \* \* \*/);
  assert.match(yml, /15 4 \* \* \*/);
  assert.match(yml, /0 18 \* \* 0,6/);
  assert.match(yml, /could not push sports update after retries/);
  assert.match(yml, /generate-seo\.js --update --sports-only/);
  assert.match(yml, /sports\/index\.html/);
  const refreshStep = yml.match(
    /- name: Refresh \/sports\/ HTML from sports\.json[\s\S]*?(?=\n      - name:)/,
  )?.[0] || '';
  assert.match(refreshStep, /generate-seo\.js --update --sports-only/);
  assert.doesNotMatch(refreshStep, /continue-on-error:\s*true/);
  const validateAt = yml.indexOf('bash scripts/bot-prepush-check.sh');
  const commitAt = yml.indexOf('- name: Commit sports.json');
  assert.ok(validateAt >= 0 && validateAt < commitAt, 'sports : prepush HTML avant commit');
  assert.match(yml.slice(0, commitAt), /git add sports\/index\.html en\/sports\/index\.html/);
  assert.doesNotMatch(yml.slice(commitAt), /if:\s*always\(\)/);
});

test('update-sports-live.yml sonde les fenêtres de match', () => {
  const yml = readFileSync(join(ROOT, '.github/workflows/update-sports-live.yml'), 'utf8');
  assert.match(yml, /\*\/5 16-23 \* \* \*/);
  assert.match(yml, /\*\/5 0-3 \* \* \*/);
  assert.match(yml, /20 \* \* \*/);
  assert.match(yml, /workflow_run/);
  assert.match(yml, /Update Radio Now Playing/);
  assert.doesNotMatch(yml, /0,15,30,45/);
  assert.match(yml, /--live/);
});

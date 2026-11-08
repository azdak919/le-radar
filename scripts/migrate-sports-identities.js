/** Identity-only migration. No requests, no score/date/URL changes. --write is explicit. */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { unpackSportsPayload, packSportsPayload } = require('./sports-payload-lib');
const { loadSportsTeamsRegistry, applyRegistryToTeam } = require('./sports-teams-lib');
const { buildSportsMastheadPayload } = require('./sports-masthead-lib');
const TEAM_IDENTITY = new Set(['name', 'shortName', 'fullName', 'nickname', 'code', 'registryId', 'priority', 'sector', 'institutionId', 'institutionName', 'institutionLabel', 'identityAliases']);
const GAME_IDENTITY = new Set(['opponent', 'opponentCode', 'opponentFullName', 'opponentNickname', 'opponentRegistryId', 'opponentSector', 'opponentRseqTeamId']);
function invariantProjection(payload) {
  function project(value, identity) {
    if (Array.isArray(value)) return value.map(v => project(v, identity));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key, v]) => !identity.has(key) && v !== undefined)
      .map(([key, v]) => [key, project(v, ['results', 'nextGames', 'lastGame', 'nextGame'].includes(key) ? GAME_IDENTITY : new Set())]));
  }
  return { ...payload, teams: Object.fromEntries(Object.entries(payload.teams || {}).map(([id, team]) => [id, project(team, TEAM_IDENTITY)])) };
}
function migrateIdentities(raw, registry = loadSportsTeamsRegistry()) {
  const payload = unpackSportsPayload(structuredClone(raw));
  const before = invariantProjection(structuredClone(payload));
  for (const team of Object.values(payload.teams || {})) applyRegistryToTeam(team, registry);
  assert.deepEqual(invariantProjection(payload), before, 'Identity migration must preserve match/team IDs, scores, schedules, source URLs and other non-identity data');
  return payload;
}
if (require.main === module) {
  const root = path.join(__dirname, '..');
  const payload = migrateIdentities(JSON.parse(fs.readFileSync(path.join(root, 'sports.json'), 'utf8')));
  console.log(`Identity migration: ${Object.keys(payload.teams || {}).length} formations; immutable data unchanged.`);
  if (process.argv.includes('--write')) {
    fs.writeFileSync(path.join(root, 'sports.json'), JSON.stringify(packSportsPayload(payload)) + '\n');
    fs.writeFileSync(path.join(root, 'sports-masthead.json'), JSON.stringify(buildSportsMastheadPayload(payload)) + '\n');
  }
}
module.exports = { migrateIdentities, invariantProjection };

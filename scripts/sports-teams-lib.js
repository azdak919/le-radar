/**
 * LE-RADAR — registre des formations sportives (sports-teams.json).
 *
 * Résout le nom court, le code, le nom d’établissement et le surnom à partir
 * d’un libellé / code / TeamId RSEQ provenant de l’API S1.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PATH = path.join(ROOT, 'sports-teams.json');

function stripDiacritics(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normKey(s) {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * @param {string} [registryPath]
 * @returns {{
 *   teams: object[],
 *   byId: Map<string, object>,
 *   byRseqId: Map<string, object>,
 *   byCodeSector: Map<string, object>,
 *   byAlias: Map<string, object>,
 *   editorialCodes: string[],
 * }}
 */
function loadSportsTeamsRegistry(registryPath = DEFAULT_PATH) {
  let raw = { teams: [] };
  try {
    raw = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch {
    /* registre absent : résolution = identité */
  }
  const teams = Array.isArray(raw.teams) ? raw.teams : [];
  const byId = new Map();
  const byRseqId = new Map();
  const byCodeSector = new Map();
  const byAlias = new Map();

  for (const t of teams) {
    if (!t || !t.id) continue;
    byId.set(t.id, t);
    const code = String(t.code || '').toUpperCase();
    const sector = t.sector || '';
    if (code && sector) byCodeSector.set(`${sector}:${code}`, t);
    for (const rid of t.rseqTeamIds || []) {
      if (rid) byRseqId.set(String(rid), t);
    }
    const aliasList = [t.shortName, t.fullName, t.nickname, t.code, ...(t.aliases || [])];
    for (const a of aliasList) {
      const k = normKey(a);
      if (k && !byAlias.has(k)) byAlias.set(k, t);
    }
  }

  const editorialCodes = teams
    .filter((t) => Number.isFinite(t.priority) && t.priority < 20)
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((t) => String(t.code || '').toUpperCase())
    .filter(Boolean);

  return { teams, byId, byRseqId, byCodeSector, byAlias, editorialCodes, updated: raw.updated };
}

/**
 * @param {ReturnType<typeof loadSportsTeamsRegistry>} reg
 * @param {{ name?: string, code?: string, sector?: string, rseqTeamId?: string }} query
 */
function resolveSportsTeam(reg, query = {}) {
  if (!reg) {
    return emptyResolved(query);
  }
  const rseqId = query.rseqTeamId ? String(query.rseqTeamId) : '';
  if (rseqId && reg.byRseqId.has(rseqId)) {
    return toResolved(reg.byRseqId.get(rseqId), query);
  }
  const code = String(query.code || '').toUpperCase().slice(0, 4);
  const sector = query.sector || '';
  if (code && sector && reg.byCodeSector.has(`${sector}:${code}`)) {
    return toResolved(reg.byCodeSector.get(`${sector}:${code}`), query);
  }
  const nameKey = normKey(query.name);
  if (nameKey && reg.byAlias.has(nameKey)) {
    return toResolved(reg.byAlias.get(nameKey), query);
  }
  // Code seul (adversaire hors secteur fiable).
  if (code) {
    const hit = reg.teams.find((t) => String(t.code || '').toUpperCase() === code);
    if (hit) return toResolved(hit, query);
  }
  return emptyResolved(query);
}

function emptyResolved(query) {
  const name = String(query.name || '').trim() || 'Équipe';
  const code = String(query.code || '').toUpperCase().slice(0, 4) || codeFromName(name);
  return {
    registryId: null,
    shortName: name,
    fullName: null,
    nickname: null,
    code,
    sector: query.sector || null,
    priority: 99,
    matched: false,
  };
}

function toResolved(entry, query) {
  return {
    registryId: entry.id,
    shortName: entry.shortName || query.name || entry.fullName,
    fullName: entry.fullName || null,
    nickname: entry.nickname || null,
    code: String(entry.code || query.code || '').toUpperCase().slice(0, 4),
    sector: entry.sector || query.sector || null,
    priority: Number.isFinite(entry.priority) ? entry.priority : 99,
    matched: true,
  };
}

function codeFromName(name) {
  const raw = String(name || '').trim();
  if (!raw) return 'EQ';
  const parts = raw.split(/[\s.-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts
    .slice(0, 3)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 4);
}

/**
 * Applique le registre à une formation du payload sports.json.
 * @param {object} team
 * @param {ReturnType<typeof loadSportsTeamsRegistry>} reg
 */
function applyRegistryToTeam(team, reg) {
  if (!team) return team;
  // Associations de voile (ULaVoile, PolyVoile, McGill Sailing) : le nom du club
  // et l’établissement hôte priment — pas le surnom d’excellence (Rouge et Or…).
  const sailingClub = team.sport === 'sailing'
    && (team.kind === 'association-etudiante' || team.source === 'sailing-watchlist' || team.source === 'icsa-collegesailing');
  const clubName = team.kind === 'association-etudiante' ? team.name : null;
  const clubFull = sailingClub ? team.fullName : null;
  const resolved = resolveSportsTeam(reg, {
    name: team.name,
    code: team.code,
    sector: team.sector,
    rseqTeamId: team.rseqTeamId,
  });
  if (sailingClub) {
    // Établissement hôte + code depuis le registre ; garder le nom de club.
    if (resolved.fullName) team.fullName = resolved.fullName;
    else if (clubFull) team.fullName = clubFull;
    if (resolved.code) team.code = resolved.code;
    if (resolved.registryId) team.registryId = resolved.registryId;
    team.priority = resolved.priority;
    team.nickname = undefined; // jamais Redbirds / Rouge et Or sur un club voile
    if (clubName) team.name = clubName;
  } else {
    team.name = resolved.shortName;
    team.code = resolved.code;
    team.fullName = resolved.fullName || undefined;
    team.nickname = resolved.nickname || undefined;
    team.registryId = resolved.registryId || undefined;
    team.priority = resolved.priority;
  }
  if (team.lastGame) applyRegistryToGameSide(team.lastGame, reg, team.sector);
  if (team.nextGame) applyRegistryToGameSide(team.nextGame, reg, team.sector);
  return team;
}

function applyRegistryToGameSide(game, reg, sector) {
  if (!game) return;
  const opp = resolveSportsTeam(reg, {
    name: game.opponent,
    code: game.opponentCode,
    sector, // même secteur de ligue en général
  });
  game.opponent = opp.shortName;
  game.opponentCode = opp.code;
  if (opp.fullName) game.opponentFullName = opp.fullName;
  if (opp.nickname) game.opponentNickname = opp.nickname;
  if (opp.registryId) game.opponentRegistryId = opp.registryId;
}

module.exports = {
  loadSportsTeamsRegistry,
  resolveSportsTeam,
  applyRegistryToTeam,
  applyRegistryToGameSide,
  codeFromName,
  normKey,
  DEFAULT_PATH,
};

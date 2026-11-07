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
const LEGACY_MATCH_IDENTITIES = new Map(require('../data/sports-match-identities.json').matches.map(g => [g.GameId, g]));
const AMBIGUOUS_PLACES = new Set(['montreal', 'sherbrooke', 'quebec', 'trois rivieres', 'rimouski', 'chicoutimi', 'outaouais', 'gatineau', 'ottawa', 'laval', 'baps', 'college militaire royal', 'cmr', 'rmc', 'royal military college']);

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
  /** @type {Map<string, object[]>} alias → toutes les formations (ex. Sherbrooke SHE+USHE) */
  const byAlias = new Map();

  for (const t of teams) {
    if (!t || !t.id) continue;
    byId.set(t.id, t);
    const code = String(t.code || '').toUpperCase();
    const sector = t.sector || '';
    if (code && sector) {
      const key = `${sector}:${code}`;
      byCodeSector.set(key, [...(byCodeSector.get(key) || []), t]);
    }
    for (const rid of t.rseqTeamIds || []) {
      if (rid) byRseqId.set(String(rid), t);
    }
    const variantNames = Object.values(t.sourceTeamVariants || {}).filter(v => v.qualifier).map(v => `${t.institutionName} — ${v.qualifier}`);
    const aliasList = [t.shortName, t.fullName, t.nickname, t.code, ...(t.aliases || []), ...variantNames];
    for (const a of aliasList) {
      const k = normKey(a);
      if (!k) continue;
      const list = byAlias.get(k) || [];
      if (!list.some((x) => x.id === t.id)) list.push(t);
      byAlias.set(k, list);
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
/**
 * Choisit parmi plusieurs hits d’alias (ex. « Sherbrooke » = cégep SHE + univ USHE).
 * Préfère le secteur demandé, puis fullName le plus aligné au query.name.
 */
function pickAliasHit(list, query = {}) {
  if (!list || !list.length) return null;
  const full = normKey(query.fullName);
  if (full) {
    const exact = list.filter(t => normKey(t.fullName) === full || normKey(t.institutionName) === full);
    if (exact.length === 1) return exact[0];
  }
  if (query.sector) list = list.filter(t => t.sector === query.sector);
  return list.length === 1 ? list[0] : null; // never break a collision by editorial priority
}

function resolveSportsTeam(reg, query = {}) {
  if (!reg) return emptyResolved(query);
  const rid = String(query.rseqTeamId || '');
  // Official TeamId outranks a legacy registryId, notably the SG/SM migration.
  if (rid && reg.byRseqId.has(rid)) return toResolved(reg.byRseqId.get(rid), query);
  const explicit = normKey(query.fullName);
  const name = normKey(query.name);
  if (['rmc', 'royal military college', 'royal military college of canada'].includes(name) && !explicit) return emptyResolved(query);
  for (const key of [explicit, name]) {
    if (!key || AMBIGUOUS_PLACES.has(key)) continue;
    const hit = pickAliasHit(reg.byAlias.get(key), { ...query, sector: undefined });
    if (hit) return toResolved(hit, query);
  }
  if (explicit && /c[eé]gep|coll[eè]ge|university|universit[eé]|polytechnique|centre d[’']?[ée]tudes/i.test(query.fullName) && !reg.byAlias.has(explicit)) return emptyResolved(query);
  const code = String(query.code || '').toUpperCase();
  if (code && !query.codeIsDerived) {
    const hits = reg.teams.filter(t => String(t.code).toUpperCase() === code
      && (!query.sector || t.sector === query.sector));
    const hit = pickAliasHit(hits, query);
    if (hit) return toResolved(hit, query);
  }
  // A stable, previously resolved association is usable when no contradictory full school is provided.
  if (query.registryId && reg.byId.has(query.registryId) && !explicit) {
    return toResolved(reg.byId.get(query.registryId), query);
  }
  return emptyResolved(query);
}

function normSex(sex) {
  const s = String(sex || '').trim().toUpperCase();
  if (s === 'F' || s === 'W') return 'F';
  if (s === 'M' || s === 'H') return 'M';
  return '';
}

/** Surnom selon le sexe quand le registre en a deux (Martlets / Redbirds). */
function nicknameForEntry(entry, sex, sport) {
  if (!entry || sport === 'sailing') return null;
  const key = normSex(sex);
  const by = entry.nicknameBySex;
  if (by && Object.keys(by).length) {
    if (!key) return entry.nickname || null;
    const scope = entry.nicknameSexScope?.[key];
    if (by[key] && (!sport || !scope || scope.some(s => normKey(s) === normKey(sport)))) return String(by[key]);
    return null; // a verified feminine variant in one sport is not evidence for every sport
  }
  return entry.nickname || null;
}

function emptyResolved(query) {
  const rawName = String(query.fullName || query.name || '').trim() || 'Équipe';
  const name = AMBIGUOUS_PLACES.has(normKey(rawName)) ? `${rawName} — établissement non précisé` : rawName;
  const code = String(query.code || '').toUpperCase() || codeFromName(rawName);
  return {
    registryId: null,
    shortName: name,
    fullName: query.fullName || (name !== rawName ? name : null),
    nickname: null,
    code,
    sector: query.sector || null,
    priority: 99,
    matched: false,
  };
}

function toResolved(entry, query = {}) {
  const codeVariants = Object.values(entry.sourceTeamVariants || {}).filter(v => v.sourceCode === query.code);
  const uniqueQualifier = new Set(codeVariants.map(v => v.qualifier)).size === 1;
  const variant = entry.sourceTeamVariants?.[query.rseqTeamId] || (uniqueQualifier ? codeVariants[0] : null);
  let fullName = entry.fullName || null;
  if (variant?.qualifier) {
    fullName = entry.institutionName + ' — ' + variant.qualifier;
  }
  return {
    registryId: entry.id,
    shortName: variant?.qualifier ? fullName : (entry.shortName || query.name || fullName),
    fullName,
    institutionName: entry.institutionName || entry.fullName,
    institutionId: entry.institutionId || entry.id,
    institutionLabel: entry.campus ? entry.fullName : (entry.institutionName || entry.fullName),
    nickname: nicknameForEntry(entry, query.sex, query.sport),
    code: String(variant?.sourceCode || entry.code || query.code || '').toUpperCase(),
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
    && (team.kind === 'association-etudiante'
      || team.source === 'sailing-watchlist'
      || team.source === 'icsa-collegesailing'
      || team.source === 'cicsa');
  const clubName = team.kind === 'association-etudiante' ? team.name : null;
  const clubFull = sailingClub ? team.fullName : null;
  const resolved = resolveSportsTeam(reg, {
    name: team.name,
    fullName: team.fullName,
    registryId: team.registryId,
    sport: team.sport,
    code: team.code,
    sector: team.sector,
    rseqTeamId: team.rseqTeamId,
    sex: team.sex,
  });
  if (resolved.institutionId) team.institutionId = resolved.institutionId;
  if (resolved.institutionName) team.institutionName = resolved.institutionName;
  if (resolved.institutionLabel) team.institutionLabel = resolved.institutionLabel;
  if (sailingClub) {
    // Établissement hôte + code depuis le registre ; garder le nom de club.
    if (resolved.fullName) team.fullName = resolved.fullName;
    else if (clubFull) team.fullName = clubFull;
    if (resolved.code) team.code = resolved.code;
    if (resolved.registryId) team.registryId = resolved.registryId;
    team.priority = resolved.priority;
    team.nickname = undefined; // jamais Redbirds / Rouge et Or sur un club voile
    if (clubName) team.name = clubName;
    if (team.registryId === 'ulaval') team.identityAliases = ['ULaVoile', 'CVUL', 'Club de voile de l’Université Laval'];
  } else {
    team.name = resolved.shortName;
    team.code = resolved.code;
    team.fullName = resolved.fullName || undefined;
    team.nickname = resolved.nickname || undefined;
    team.registryId = resolved.registryId || undefined;
    team.priority = resolved.priority;
    if (resolved.sector) team.sector = resolved.sector;
  }
  applyRegistryToListedGames(team, reg);
  return team;
}

function applyRegistryToListedGames(team, reg) {
  if (!team || !reg) return;
  const list = [];
  if (team.lastGame) list.push(team.lastGame);
  if (team.nextGame) list.push(team.nextGame);
  if (Array.isArray(team.results)) list.push(...team.results);
  if (Array.isArray(team.nextGames)) list.push(...team.nextGames);
  const seen = new Set();
  for (const game of list) {
    if (!game || seen.has(game)) continue;
    seen.add(game);
    applyRegistryToGameSide(game, reg, team.sector, team.sex, team.sport, team.rseqTeamId);
  }
}

function applyRegistryToGameSide(game, reg, sector, sex, sport, teamRseqId) {
  if (!game || !reg) return;
  // Régate : le nom d’épreuve n’est pas une école. Ne pas réécrire
  // « Régionale Québec » en sigle UCON / LAV / MCG.
  if (game.scoreKind === 'place' || game.sport === 'sailing' || game.opponentCode === 'CICS') return;
  // Indices collégiaux dans fullName adversaire priment sur le secteur de l’équipe
  // (évite UdeS quand le flux dit « Cégep de Sherbrooke »).
  let oppSector = sector;
  const hint = `${game.opponent || ''} ${game.opponentFullName || ''}`;
  if (/c[eé]gep|coll[eè]ge(?!\s+militaire)|campus\s|champlain\s+college/i.test(hint)
    && !/universit[eé]|university/i.test(hint)) {
    oppSector = 'collegial';
  } else if (/universit[eé]|university/i.test(hint)) {
    oppSector = 'universitaire';
  }
  const sideSex = game.sex || sex;
  const sourceMatch = LEGACY_MATCH_IDENTITIES.get(game.gameId);
  if (!game.opponentRseqTeamId && sourceMatch && teamRseqId) {
    if (sourceMatch.HomeTeamId === teamRseqId) game.opponentRseqTeamId = sourceMatch.VisitingTeamId;
    else if (sourceMatch.VisitingTeamId === teamRseqId) game.opponentRseqTeamId = sourceMatch.HomeTeamId;
    const officialName = sourceMatch.HomeTeamId === teamRseqId ? sourceMatch.VisitingTeamName : sourceMatch.VisitingTeamId === teamRseqId ? sourceMatch.HomeTeamName : null;
    if (officialName && game.opponentRseqTeamId && !reg.byRseqId.has(String(game.opponentRseqTeamId))) {
      game.opponent = officialName;
      for (const key of ['opponentFullName', 'opponentNickname', 'opponentRegistryId', 'opponentSector']) delete game[key];
    }
  }
  const sourceId = String(game.opponentRseqTeamId || '');
  const regId = String(game.opponentRegistryId || '');
  const opp = resolveSportsTeam(reg, {
    registryId: regId,
    name: game.opponent,
    fullName: game.opponentFullName,
    code: game.opponentCode,
    sector: oppSector,
    sex: sideSex,
    sport,
    rseqTeamId: sourceId,
  });
  game.opponent = opp.shortName;
  game.opponentCode = opp.code;
  if (opp.fullName) game.opponentFullName = opp.fullName;
  if (opp.nickname) game.opponentNickname = opp.nickname;
  else if (opp.matched) delete game.opponentNickname;
  if (opp.registryId) game.opponentRegistryId = opp.registryId;
  else if (regId) { delete game.opponentRegistryId; delete game.opponentNickname; delete game.opponentSector; }
  if (opp.sector) game.opponentSector = opp.sector;
}

module.exports = {
  loadSportsTeamsRegistry,
  resolveSportsTeam,
  applyRegistryToTeam,
  applyRegistryToGameSide,
  nicknameForEntry,
  codeFromName,
  normKey,
  DEFAULT_PATH,
};

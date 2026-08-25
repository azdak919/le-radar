/*
 * Projection légère du snapshot RSEQ pour le mât de l'accueil.
 *
 * /sports/ reste un tableau statique complet, généré depuis sports.json.
 * L'accueil, lui, n'affiche que quelques cartes et ne doit pas faire parser
 * des milliers de matchs futurs sur une tablette. On garde les résultats
 * chauds et les prochains matchs les plus proches, avec les deux faces d'un
 * même match afin que le choix éditorial du client reste inchangé.
 */
'use strict';

const MASTHEAD_NEXT_GAME_LIMIT = 48;
const MASTHEAD_RESULT_LIMIT = 32;

function gameKey(game, team) {
  if (game?.gameId != null && String(game.gameId).trim()) return `id:${game.gameId}`;
  const pair = [team?.code, game?.opponentCode || game?.opponent]
    .filter(Boolean)
    .map((value) => String(value).toUpperCase())
    .sort()
    .join('|');
  return `pair:${game?.date || ''}|${game?.time || ''}|${game?.sport || team?.sport || ''}|${pair}`;
}

function gameStamp(game) {
  return `${String(game?.date || '9999-12-31')}T${String(game?.time || '23:59')}`;
}

function compactTeam(team, { results = [], nextGames = [] } = {}) {
  const out = { ...team, results, nextGames };
  out.lastGame = results[0] || null;
  out.nextGame = nextGames[0] || null;
  delete out.record;
  return out;
}

function buildSportsMastheadPayload(payload, {
  nextGameLimit = MASTHEAD_NEXT_GAME_LIMIT,
  resultLimit = MASTHEAD_RESULT_LIMIT,
} = {}) {
  const teams = Object.values(payload?.teams || {});
  const nextByMatch = new Map();
  const resultByMatch = new Map();

  for (const team of teams) {
    const nextGames = Array.isArray(team?.nextGames) && team.nextGames.length
      ? team.nextGames
      : (team?.nextGame ? [team.nextGame] : []);
    for (const game of nextGames) {
      const key = gameKey(game, team);
      if (!nextByMatch.has(key)) nextByMatch.set(key, []);
      nextByMatch.get(key).push({ team, game });
    }

    const resultGames = [team?.lastGame, ...(Array.isArray(team?.results) ? team.results : [])]
      .filter(Boolean);
    for (const game of resultGames) {
      const key = gameKey(game, team);
      if (!resultByMatch.has(key)) resultByMatch.set(key, []);
      resultByMatch.get(key).push({ team, game });
    }
  }

  const selected = [
    ...[...resultByMatch.values()]
      .sort((a, b) => gameStamp(b[0]?.game).localeCompare(gameStamp(a[0]?.game)))
      .slice(0, resultLimit),
    ...[...nextByMatch.values()]
      .sort((a, b) => gameStamp(a[0]?.game).localeCompare(gameStamp(b[0]?.game)))
      .slice(0, nextGameLimit),
  ];

  const selectedTeams = new Map();
  for (const faces of selected) {
    for (const { team, game } of faces) {
      if (!team?.id || !game) continue;
      if (!selectedTeams.has(team.id)) {
        selectedTeams.set(team.id, { team, results: [], nextGames: [] });
      }
      const entry = selectedTeams.get(team.id);
      const result = [team.lastGame, ...(team.results || [])].some((candidate) => candidate === game);
      (result ? entry.results : entry.nextGames).push(game);
    }
  }

  const outTeams = {};
  for (const [id, entry] of selectedTeams) {
    outTeams[id] = compactTeam(entry.team, entry);
  }

  return {
    updated: payload?.updated,
    fetchedAt: payload?.fetchedAt,
    source: payload?.source,
    sportsFreshness: payload?.sportsFreshness,
    masthead: { nextGameLimit, resultLimit },
    teamCount: Object.keys(outTeams).length,
    teams: outTeams,
  };
}

module.exports = {
  MASTHEAD_NEXT_GAME_LIMIT,
  MASTHEAD_RESULT_LIMIT,
  buildSportsMastheadPayload,
};

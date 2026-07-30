#!/usr/bin/env node
/**
 * LE RADAR — Agrégateur résultats sportifs étudiants (RSEQ)
 *
 * Lit sports-leagues.json, appelle l’API diffusion S1 (GetLeagueDiffusion),
 * écrit un sports.json mince pour le site statique.
 *
 * Source : https://s1.rseq.ca/api/LeagueApi/GetLeagueDiffusion/?leagueId=
 * (collégial + universitaire QC ; les unis RSEQ = conférence U Sports locale)
 *
 * Usage:
 *   node scripts/fetch-sports.js           # dry-run résumé
 *   node scripts/fetch-sports.js --update  # écrit sports.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const LEAGUES_PATH = path.join(ROOT, 'sports-leagues.json');
const OUT_PATH = path.join(ROOT, 'sports.json');
const API = 'https://s1.rseq.ca/api/LeagueApi/GetLeagueDiffusion/?leagueId=';
const SCORE_NONE = -999;

const update = process.argv.includes('--update');

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'le-radar.ca sports-bot/1.0 (https://le-radar.ca)',
        },
        timeout: 25000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          getJson(res.headers.location).then(resolve, reject);
          res.resume();
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`timeout ${url}`));
    });
  });
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

function hasScore(game) {
  const h = game.HomeTeamScore;
  const v = game.VisitingTeamScore;
  return Number.isFinite(h) && Number.isFinite(v) && h !== SCORE_NONE && v !== SCORE_NONE;
}

function gameDate(game) {
  return game.GameDateFormatted || game.GameDateText || (game.GameDate || '').slice(0, 10) || '';
}

function allGames(league) {
  return []
    .concat(league.PreSeasonGames || [])
    .concat(league.RegularSeasonGames || [])
    .concat(league.PostSeasonGames || [])
    .concat(league.ChampionshipGames || [])
    .concat(league.ConferenceChampionshipGames || []);
}

function normalizeGame(game, teamId, meta) {
  const home = game.HomeTeamId === teamId;
  const oppName = home ? game.VisitingTeamName : game.HomeTeamName;
  const oppCode =
    (home ? game.VisitingTeamCode : game.HomeTeamCode) || codeFromName(oppName);
  const scoreFor = home ? game.HomeTeamScore : game.VisitingTeamScore;
  const scoreAgainst = home ? game.VisitingTeamScore : game.HomeTeamScore;
  let result = 'D';
  if (scoreFor > scoreAgainst) result = 'W';
  else if (scoreFor < scoreAgainst) result = 'L';
  return {
    date: gameDate(game),
    time: game.GameTimeFormatted || '',
    opponent: oppName || '',
    opponentCode: String(oppCode || '').toUpperCase().slice(0, 4),
    home,
    scoreFor,
    scoreAgainst,
    result,
    sport: meta.sport,
    competition: meta.label,
    gameId: game.GameId || null,
    url: game.GameId
      ? `https://diffusion.rseq.ca/Default.aspx?Type=Game&GameId=${game.GameId}`
      : null,
  };
}

function nextGameForTeam(games, teamId, meta) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = games
    .filter((g) => (g.HomeTeamId === teamId || g.VisitingTeamId === teamId) && !hasScore(g))
    .filter((g) => gameDate(g) >= today || !gameDate(g))
    .sort((a, b) => gameDate(a).localeCompare(gameDate(b)));
  const g = upcoming[0];
  if (!g) return null;
  const home = g.HomeTeamId === teamId;
  const oppName = home ? g.VisitingTeamName : g.HomeTeamName;
  const oppCode = (home ? g.VisitingTeamCode : g.HomeTeamCode) || codeFromName(oppName);
  return {
    date: gameDate(g),
    time: g.GameTimeFormatted || '',
    opponent: oppName || '',
    opponentCode: String(oppCode || '').toUpperCase().slice(0, 4),
    home,
    sport: meta.sport,
    competition: meta.label,
    gameId: g.GameId || null,
  };
}

function lastGameForTeam(games, teamId, meta) {
  const scored = games
    .filter((g) => (g.HomeTeamId === teamId || g.VisitingTeamId === teamId) && hasScore(g))
    .sort((a, b) => gameDate(b).localeCompare(gameDate(a)));
  return scored[0] ? normalizeGame(scored[0], teamId, meta) : null;
}

function standingForTeam(standings, teamId) {
  const row = (standings || []).find((s) => s.TeamId === teamId);
  if (!row) return null;
  const w = row.Wins || 0;
  const l = row.Losses || 0;
  const d = row.Draws || 0;
  return {
    wins: w,
    losses: l,
    draws: d,
    played: row.GamesPlayed || w + l + d,
    label: d ? `${w}-${l}-${d}` : `${w}-${l}`,
  };
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(LEAGUES_PATH, 'utf8'));
  const leagues = catalog.leagues || [];
  const teams = {};
  const errors = [];

  for (const meta of leagues) {
    process.stderr.write(`sports: ${meta.label}… `);
    try {
      const data = await getJson(API + meta.id);
      const games = allGames(data);
      const standings = data.Standings || [];
      let teamCount = 0;
      for (const t of data.Teams || []) {
        const id = t.TeamId;
        if (!id) continue;
        const name = t.TeamName || 'Équipe';
        const code = (t.TeamCode || codeFromName(name)).toUpperCase().slice(0, 4);
        const key = `${meta.sector}:${meta.sport}:${id}`;
        const lastGame = lastGameForTeam(games, id, meta);
        const nextGame = nextGameForTeam(games, id, meta);
        const record = standingForTeam(standings, id);
        teams[key] = {
          id: key,
          rseqTeamId: id,
          leagueId: meta.id,
          name,
          code,
          sector: meta.sector,
          sport: meta.sport,
          sportLabel: meta.sportLabel,
          sex: meta.sex || null,
          division: meta.division || null,
          usports: Boolean(meta.usports),
          leagueLabel: meta.label,
          lastGame,
          nextGame,
          record,
        };
        teamCount += 1;
      }
      process.stderr.write(`${teamCount} équipes\n`);
    } catch (err) {
      process.stderr.write(`ERREUR ${err.message}\n`);
      errors.push({ leagueId: meta.id, label: meta.label, error: String(err.message || err) });
    }
  }

  const payload = {
    updated: new Date().toISOString(),
    source: 'rseq-s1',
    note: 'Résultats collégiaux et universitaires du Québec (RSEQ). Unis = conférence U Sports locale.',
    teamCount: Object.keys(teams).length,
    errors: errors.length ? errors : undefined,
    teams,
  };

  console.log(
    JSON.stringify(
      {
        teams: payload.teamCount,
        withLastGame: Object.values(teams).filter((t) => t.lastGame).length,
        withNextGame: Object.values(teams).filter((t) => t.nextGame).length,
        errors: errors.length,
        update,
      },
      null,
      2,
    ),
  );

  if (update) {
    fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.error(`sports: écrit ${path.relative(ROOT, OUT_PATH)}`);
  } else {
    console.error('sports: dry-run (passe --update pour écrire)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

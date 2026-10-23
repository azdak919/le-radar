#!/usr/bin/env node
/**
 * Boucle du workflow « Update Student Sports (live) » : reste-t-il un match
 * RSEQ dans la fenêtre live (−15 min / +3 h, pas encore versé) ?
 *
 * Sortie 0 = oui (refaire une passe), 1 = non (le job peut s’arrêter).
 *
 * Pourquoi : le cron GitHub « toutes les 5 min » est « best effort » — observé le 17 oct. 2026,
 * il n’a tiré qu’aux 45–90 min. Le score RSEQ arrive d’un coup, au dépôt du
 * rapport de match (ex. 17 h 46 pour un baseball de 16 h) ; sans boucle, le
 * bandeau gardait « En direct 0–0 » jusqu’au prochain cron.
 */
const fs = require('fs');
const path = require('path');
const SportsPayload = require('./sports-payload-lib');
const SportsLive = require('./sports-live-lib');

const OUT_PATH = path.join(__dirname, '..', 'sports.json');

function main() {
  let teams = {};
  try {
    const raw = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
    const payload = SportsPayload.unpackSportsPayload(raw);
    teams = (payload && payload.teams) || {};
  } catch (err) {
    console.error(`sports-live-pending: lecture impossible (${err.message})`);
    process.exit(1);
  }
  const ids = SportsLive.liveGameIdsFromTeams(teams);
  console.error(`sports-live-pending: ${ids.length} match(s) en fenêtre live`);
  if (ids.length) process.exit(0);
  // Le cron GitHub peut manquer le début d’une soirée : on garde la boucle
  // en vie si un match commence bientôt (LIVE_LOOKAHEAD_MIN, défaut 0).
  const ahead = Number(process.env.LIVE_LOOKAHEAD_MIN || 0);
  const soon = upcomingWithin(teams, ahead * 60000);
  if (soon) console.error(`sports-live-pending: prochain match dans ${Math.round(soon / 60000)} min — on attend`);
  process.exit(soon ? 0 : 1);
}

/** ms avant le prochain coup d’envoi non versé, s’il tombe dans `windowMs`. */
function upcomingWithin(teams, windowMs, now = Date.now()) {
  if (!(windowMs > 0)) return 0;
  let best = 0;
  for (const team of Object.values(teams || {})) {
    for (const g of [team && team.nextGame, ...((team && team.nextGames) || [])]) {
      const t = g && SportsLive.gameMs(g);
      if (!Number.isFinite(t) || t <= now || t - now > windowMs) continue;
      if (!best || t - now < best) best = t - now;
    }
  }
  return best;
}

if (require.main === module) main();
module.exports = { upcomingWithin };

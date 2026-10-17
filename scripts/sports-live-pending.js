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
  process.exit(ids.length ? 0 : 1);
}

main();

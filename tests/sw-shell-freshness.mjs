#!/usr/bin/env node
/**
 * Régression : un asset de code du shell ne change pas sans bump du cache.
 *
 * A capturé la panne « HTML frais + style.css périmé » : le menu de sections
 * sortait en liens soulignés collés au bord gauche sur un appareil dont le
 * service worker servait encore une feuille d'avant l'ajout de `.site-sections`.
 * Voir `scripts/sw-shell-lock.mjs` pour le raisonnement complet.
 */

import assert from 'node:assert/strict';
import { WORKERS, computeLock, diffLock, readLock } from '../scripts/sw-shell-lock.mjs';

const lock = readLock();
assert(lock, 'sw-shell-lock.json manquant — lance « npm run sw:bump »');

const computed = computeLock();

for (const report of diffLock(lock, computed)) {
  assert(
    !report.missing,
    `${report.file} : absent de sw-shell-lock.json — lance « npm run sw:bump »`,
  );
  assert(
    !report.cacheStale,
    `${report.changed.join(', ')} a changé sans bump de ${report.cacheAfter} `
    + `(${report.file}, voir AGENTS.md) — lance « npm run sw:bump »`,
  );
  assert.equal(
    report.changed.length,
    0,
    `${report.file} : verrou désynchronisé (${report.changed.join(', ')}) — lance « npm run sw:bump »`,
  );
  assert.equal(
    lock[report.file].cache,
    report.cacheAfter,
    `${report.file} : le verrou annonce ${lock[report.file].cache}, le worker ${report.cacheAfter}`,
  );
}

console.log(`OK verrou des shells SW (${WORKERS.length} workers)`);

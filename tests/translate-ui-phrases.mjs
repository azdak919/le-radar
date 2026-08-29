#!/usr/bin/env node
/**
 * D22 — glossaire chrome sports/radio. Fixtures sans réseau.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'translate.js'), 'utf8');
const cta = readFileSync(join(root, 'radar-sports-cta.js'), 'utf8');

assert.match(src, /radar-translate-cache-v9/, 'cache v9 (invalide correspondre v8)');
assert.match(src, /const CONCURRENCY = 6/, 'CONCURRENCY reste 6 (plafond gtx par hôte)');
assert.match(src, /const MAX_CHUNK = 450/, 'MAX_CHUNK reste 450 (ordre IU)');
assert.match(src, /chromeOnly/, 'passage chrome avant le fil');
assert.match(src, /CHROME_SELECTOR/, 'sélecteur chrome');
assert.match(src, /UI_LOCK_NO_MT/, 'filet anti-MT sur match / reçoit');
assert.match(src, /const inflight = new Map/, 'dédup requêtes en vol');
assert.match(src, /function cacheGet/, 'LRU cacheGet');

const phrases = [
  'Prochains match',
  'Prochain match',
  'En direct',
  'En cours',
  'Demain',
  'Hier',
  'Avant-hier',
  'reçoit',
  'chez',
];
for (const phrase of phrases) {
  assert(
    src.includes(`'${phrase}'`) || src.includes(`"${phrase}"`) || src.includes(`${phrase}:`),
    `glossaire UI : ${phrase}`,
  );
}
assert.match(src, /\bmatch:\s*\{/, 'glossaire : nœud isolé « match »');
assert.match(src, /en: 'Next games'/, 'Prochains match → Next games (pas correspondre)');
assert.match(src, /en: 'game'/, 'match → game, pas verbe to match');
assert.match(src, /en: 'hosts'/, 'reçoit → hosts');
assert.match(src, /en: 'at'/, 'chez → at');
assert.doesNotMatch(
  src,
  /en:\s*'correspondre'|fr:\s*'correspondre'/,
  'aucune traduction glossaire vers correspondre',
);

assert.match(cta, /function fillSportsCtaTagCopy/, 'pastille CTA');
assert.match(cta, /markNoTranslate\(tag\)/, 'pastille toujours notranslate');
assert.doesNotMatch(
  cta,
  /tag\.classList\.remove\('sports-chip__cta-tag--brand', 'notranslate'\)/,
  'ne plus retirer notranslate hors idle',
);
assert.match(cta, /data-vs-orig/, 'verbe reçoit/chez : original FR pour le glossaire');
assert.match(cta, /radar:translate-mode/, 'rejouer le chrome à la langue');

console.log('OK translate-ui-phrases (D22 glossaire + pastille + chrome-first)');

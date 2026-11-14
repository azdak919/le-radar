/**
 * Fil d’accueil : le compteur doit suivre les cartes vraiment affichées,
 * et l’absence de session-freshness-lib.js ne doit plus vider la liste.
 * Run: node tests/news-feed-display-guard.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const SF = require('../scripts/session-freshness-lib.js');
const news = JSON.parse(readFileSync(join(root, 'news.json'), 'utf8'));
const radarNews = readFileSync(join(root, 'radar-news.js'), 'utf8');

assert.equal(news.count, news.items.length, 'count de news.json = nombre d’items');
const now = new Date(news.updated || Date.now());
assert.equal(
  SF.filterFreshItems(news.items, now).length,
  news.items.length,
  'tous les items publiés sont dans la fenêtre de fraîcheur',
);
assert.equal(
  SF.filterFreshItemsLenient(news.items, now).length,
  news.items.length,
  'le filet ne change rien quand le pool est déjà frais',
);

assert.match(radarNews, /function sessionFreshnessApi\(/);
assert.match(radarNews, /function filterFreshItemsLenient\(/);
assert.match(radarNews, /filterFreshItemsLenient\(items/);
assert.doesNotMatch(
  radarNews,
  /function isWithinFreshnessWindow[\s\S]{0,250}: false;/,
  'le repli de fraîcheur ne doit plus renvoyer false pour tout le fil',
);
assert.match(
  radarNews,
  /if \(news\.length\) return;/,
  'un fetch raté ne doit pas effacer un fil déjà chargé',
);
assert.match(
  radarNews,
  /NEWS_LIST\.replaceChildren\(frag\)/,
  'le DOM n’est remplacé qu’une fois le nouveau fil assemblé',
);
assert.match(
  radarNews,
  /\$\{displayed\} article/,
  'le compteur doit suivre les cartes réellement rendues',
);

console.log('OK news-feed-display-guard', news.items.length, 'articles');

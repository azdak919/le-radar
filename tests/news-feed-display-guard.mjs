/**
 * Fil d’accueil : le compteur d’accueil utilise le total du catalogue
 * (news-latest.json), pas le premier lot chargé ; l’absence de
 * session-freshness-lib.js ne doit plus vider la liste.
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
const freshN = SF.filterFreshItems(news.items, now).length;
assert.ok(
  freshN > 0 && freshN <= news.items.length,
  'la fenêtre de fraîcheur est un sous-ensemble non vide du catalogue (qui peut retenir de plus vieux articles)',
);
assert.ok(
  SF.filterFreshItemsLenient(news.items, now).length >= freshN,
  'le filet ne restreint pas davantage un pool déjà filtré',
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
  /function formatNewsCountLabel\(/,
  'libellé du compteur factorisé (total du catalogue / compte filtré)',
);
assert.match(
  radarNews,
  /formatNewsCountLabel\(displayed, \{[\s\S]*?total: newsPaging\.total/,
  'à l’accueil le compteur lit newsPaging.total (news-latest.json), pas le lot affiché',
);
assert.match(
  radarNews,
  /NEWS_COUNT\.textContent = formatNewsCountLabel\(0, \{ total: newsPaging\.total \}\)/,
  'après « Charger plus », le compteur reste le total, pas le nombre de cartes chargées',
);

console.log('OK news-feed-display-guard', news.items.length, 'articles');

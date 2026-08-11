/* Favorites permanent = collection, pas affichage hors saison.
 * Run: node tests/season-permanent.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  filterPoolByCurrentSeason,
  resolveItemSeason4,
} = require('../scripts/season-lib.js');

const summer = {
  url: 'https://example.test/summer.jpg',
  title: 'Lac en juillet',
  season: 'ete',
  seasonSource: 'manual',
  seasonConfidence: 1,
  permanent: true,
};

const winterPinned = {
  url: 'https://example.test/winter-laval.jpg',
  title: 'Université Laval neige',
  season: 'hiver',
  seasonSource: 'manual',
  seasonConfidence: 1,
  permanent: true,
};

const autumn = {
  url: 'https://example.test/fall.jpg',
  title: 'Érables rouges octobre',
  season: 'automne',
  seasonSource: 'manual',
  seasonConfidence: 1,
};

const items = [summer, winterPinned, autumn];

// Août = été strict
const august = filterPoolByCurrentSeason(items, {
  date: new Date(2026, 7, 10),
  minStrict: 1,
  minAdjacent: 1,
});
assert.equal(august.season4, 'ete');
assert.equal(august.tier, 'strict');
assert.equal(
  august.items.some((p) => p.url === winterPinned.url),
  false,
  'favorite hiver permanente absente du pool en été'
);
assert.equal(
  august.items.some((p) => p.url === summer.url),
  true,
  'favorite été permanente présente en été'
);

// Client ne doit pas réinjecter permanent hors saison (régression du bug mât).
function clientSeasonPool(list, date) {
  const r = filterPoolByCurrentSeason(list, {
    date,
    minStrict: 12,
    minAdjacent: 16,
  });
  // Correct : pas de force-push des permanent
  return r.items && r.items.length ? r.items.slice() : list.slice();
}

function buggyClientSeasonPool(list, date) {
  const r = filterPoolByCurrentSeason(list, {
    date,
    minStrict: 12,
    minAdjacent: 16,
  });
  let out = r.items && r.items.length ? r.items.slice() : list.slice();
  for (const p of list) {
    if (p.permanent && p.url && !out.some((x) => x.url === p.url)) out.push(p);
  }
  return out;
}

const fixed = clientSeasonPool(items, new Date(2026, 7, 10));
const buggy = buggyClientSeasonPool(items, new Date(2026, 7, 10));
assert.equal(
  fixed.some((p) => p.url === winterPinned.url),
  false,
  'client corrigé : pas de neige forcée en août'
);
assert.equal(
  buggy.some((p) => p.url === winterPinned.url),
  true,
  'témoin : l’ancien contournement permanent réinjectait l’hiver'
);

// Janvier = hiver : la favorite permanente doit être éligible
const january = filterPoolByCurrentSeason(items, {
  date: new Date(2027, 0, 15),
  minStrict: 1,
  minAdjacent: 1,
});
assert.equal(january.season4, 'hiver');
assert.equal(
  january.items.some((p) => p.url === winterPinned.url),
  true,
  'favorite hiver permanente éligible en janvier'
);
assert.equal(resolveItemSeason4(winterPinned), 'hiver');

console.log('All season-permanent checks passed.');

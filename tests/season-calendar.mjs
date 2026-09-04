/* Horloge astronomique du mât ≠ tags photo météo ≠ sessions univ.
 * Run: node tests/season-calendar.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  getCurrentSeason4,
  getCurrentSeason6,
  season4FromPhotoMonth,
  season6FromPhotoMonth,
  inferSeason4,
  detectFromText,
  filterPoolByCurrentSeason,
} = require('../scripts/season-lib.js');
const {
  getCurrentUniversitySessionId,
} = require('../scripts/session-freshness-lib.js');

function d(year, month, day) {
  return new Date(year, month, day);
}

const cases4 = [
  [d(2026, 2, 20), 'hiver'],
  [d(2026, 2, 21), 'printemps'],
  [d(2026, 5, 20), 'printemps'],
  [d(2026, 5, 21), 'ete'],
  [d(2026, 7, 10), 'ete'],
  [d(2026, 8, 3), 'ete'],
  [d(2026, 8, 21), 'ete'],
  [d(2026, 8, 22), 'automne'],
  [d(2026, 11, 20), 'automne'],
  [d(2026, 11, 21), 'hiver'],
  [d(2027, 0, 15), 'hiver'],
];
for (const [date, want] of cases4) {
  assert.equal(
    getCurrentSeason4(date),
    want,
    `saison 4 ${date.toISOString().slice(0, 10)} → ${want}`
  );
}

const cases6 = [
  [d(2026, 8, 3), 'ukiaqsaaq'],
  [d(2026, 8, 21), 'ukiaqsaaq'],
  [d(2026, 9, 20), 'ukiaqsaaq'],
  [d(2026, 9, 21), 'ukiaq'],
  [d(2026, 11, 20), 'ukiaq'],
  [d(2026, 11, 21), 'ukiuq'],
  [d(2027, 1, 20), 'ukiuq'],
  [d(2027, 1, 21), 'upingaksaaq'],
  [d(2026, 5, 21), 'aujaq'],
  [d(2026, 7, 20), 'aujaq'],
  [d(2026, 7, 21), 'ukiaqsaaq'],
];
for (const [date, want] of cases6) {
  assert.equal(
    getCurrentSeason6(date),
    want,
    `saison 6 ${date.toISOString().slice(0, 10)} → ${want}`
  );
}

// Tags photo : un mois de fichier reste météo (septembre = automne).
assert.equal(season4FromPhotoMonth(8), 'automne');
assert.equal(season4FromPhotoMonth(7), 'ete');
assert.equal(season4FromPhotoMonth(2), 'printemps');
assert.equal(season4FromPhotoMonth(11), 'hiver');
assert.equal(season6FromPhotoMonth(8), 'ukiaqsaaq');
assert.equal(season6FromPhotoMonth(9), 'ukiaq');
assert.equal(
  inferSeason4({ title: 'Campus Laval 2024-09-15' }),
  'automne',
  'fichier septembre → tag automne (météo), pas l’horloge été'
);
assert.equal(
  detectFromText({ title: 'Roddick-2022-09-05.jpg' }).season,
  'automne'
);

// Sessions univ. : 1er sept. = automne. Ne pas les coller sur le mât.
assert.equal(getCurrentUniversitySessionId(d(2026, 8, 3)), 'automne');
assert.equal(getCurrentSeason4(d(2026, 8, 3)), 'ete');

const summer = {
  url: 'https://example.test/july.jpg',
  title: 'Lac en juillet',
  season: 'ete',
  seasonSource: 'manual',
  seasonConfidence: 1,
};
const autumn = {
  url: 'https://example.test/maples.jpg',
  title: 'Érables rouges octobre',
  season: 'automne',
  seasonSource: 'manual',
  seasonConfidence: 1,
};
const winter = {
  url: 'https://example.test/snow.jpg',
  title: 'Campus sous la neige',
  season: 'hiver',
  seasonSource: 'manual',
  seasonConfidence: 1,
};

const sept3 = filterPoolByCurrentSeason([summer, autumn, winter], {
  date: d(2026, 8, 3),
  minStrict: 1,
  minAdjacent: 1,
});
assert.equal(sept3.season4, 'ete', '3 sept. 2026 : mât encore en été');
assert.equal(sept3.tier, 'strict');
assert.equal(
  sept3.items.some((p) => p.url === summer.url),
  true,
  'photo d’été au mât le 3 sept.'
);
assert.equal(
  sept3.items.some((p) => p.url === autumn.url),
  false,
  'érables d’octobre hors strict le 3 sept.'
);
assert.equal(
  sept3.items.some((p) => p.url === winter.url),
  false,
  'neige hors mât le 3 sept.'
);

const sept22 = filterPoolByCurrentSeason([summer, autumn, winter], {
  date: d(2026, 8, 22),
  minStrict: 1,
  minAdjacent: 1,
});
assert.equal(sept22.season4, 'automne', '22 sept. : automne astronomique');
assert.equal(sept22.items.some((p) => p.url === autumn.url), true);
assert.equal(sept22.items.some((p) => p.url === winter.url), false);

console.log('All season-calendar checks passed.');

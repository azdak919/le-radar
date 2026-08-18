/* Pierre grise ≠ hiver : n’éjecter que l’opposé certain.
 * Run: node tests/season-certainty.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  detectFromText,
  mergeDetections,
  seasonTagTrusted,
  resolveItemSeason4,
  filterPoolByCurrentSeason,
  inferSeason4,
} = require('../scripts/season-lib.js');

const greyHall = {
  url: 'https://example.test/hall.jpg',
  title: 'Henry F. Hall Building, Concordia University',
  description: 'The Henry F. Hall Building is a high-density hub of Concordia’s downtown campus.',
  season: 'hiver',
  seasonSource: 'text+visual',
  seasonConfidence: 0.99,
  seasonReasons: ['kw_hiver', 'visual_agrees'],
};

const greyVisual = {
  url: 'https://example.test/gaudry.jpg',
  title: 'Université de Montréal, Pavillon Roger-Gaudry',
  season: 'hiver',
  seasonSource: 'visual',
  seasonConfidence: 0.8,
  seasonReasons: ['visual_only'],
};

const realSnow = {
  url: 'https://example.test/neige.jpg',
  title: 'Campus de Laval sous la neige',
  description: 'Allée du campus après la tempête',
  season: 'hiver',
  seasonSource: 'text+visual',
  seasonConfidence: 0.99,
};

const julyGreen = {
  url: 'https://example.test/july.jpg',
  title: 'Roddick Gates closed, McGill University, July 17, 2024',
  season: 'ete',
  seasonSource: 'text+visual',
  seasonConfidence: 0.99,
};

const august = { date: new Date(2026, 7, 10), minStrict: 1, minAdjacent: 1 };
const january = { date: new Date(2027, 0, 15), minStrict: 1, minAdjacent: 1 };

// Le champ season:hiver ne doit pas se re-valider tout seul.
const circular = detectFromText(greyHall);
assert.notEqual(
  circular.season,
  'hiver',
  'detectFromText : Hall sans mot neige/hiver ne doit pas sortir hiver'
);

assert.equal(inferSeason4(greyHall), null, 'inferSeason4 ignore le tag circulaire');
assert.equal(seasonTagTrusted(greyHall), false, 'Hall : tag hiver sans preuve, non fiable');
assert.equal(resolveItemSeason4(greyHall), null, 'Hall : saison résolue inconnue');
assert.equal(seasonTagTrusted(greyVisual), false, 'Gaudry visuel seul non fiable');
assert.equal(resolveItemSeason4(greyVisual), null, 'Gaudry : saison inconnue');

assert.equal(seasonTagTrusted(realSnow), true, 'neige textuelle fiable');
assert.equal(resolveItemSeason4(realSnow), 'hiver', 'neige → hiver');
assert.equal(inferSeason4(realSnow), 'hiver');

// Visual hiver n’écrase pas une date d’août / un texte d’été.
const saguenay = mergeDetections(
  { title: '2016-08 Saguenay river 05' },
  { season: 'hiver', confidence: 0.8 }
);
assert.equal(saguenay.season, 'ete', 'date août + visuel hiver → on garde l’été');

const visualOnly = mergeDetections(
  { title: 'Le rocher Percé vu de la mer' },
  { season: 'hiver', confidence: 0.8 }
);

// Miroir JS : pas de seasonSource ni de catégories. Le tag a déjà passé
// le filtre à la sync — il doit rester fiable (neige Montmorency).
const montmorencyMirror = {
  url: 'https://example.test/montmorency.jpg',
  title: 'Parc de la Chute-Montmorency 001',
  season: 'hiver',
};
assert.equal(
  seasonTagTrusted(montmorencyMirror),
  true,
  'miroir JS : hiver déjà syncé reste fiable'
);
assert.equal(
  filterPoolByCurrentSeason([montmorencyMirror, julyGreen], august).items.some(
    (p) => p.url === montmorencyMirror.url
  ),
  false,
  'neige Montmorency absente en août (tag miroir)'
);
assert.equal(visualOnly.season, null, 'rocher gris : pas d’hiver visuel seul');

const snowMerge = mergeDetections(realSnow, { season: 'hiver', confidence: 0.7 });
assert.equal(snowMerge.season, 'hiver', 'texte neige + visuel hiver → hiver');

const thaw = detectFromText({
  title: 'Rivière en dégel (4518647727)',
  categories: 'Ice breakups in Quebec',
});
assert.equal(thaw.season, 'printemps', 'dégel / ice breakup → printemps, pas hiver');

const pool = [greyHall, greyVisual, realSnow, julyGreen];
const inAugust = filterPoolByCurrentSeason(pool, august);
assert.equal(inAugust.season4, 'ete');
assert.equal(
  inAugust.items.some((p) => p.url === greyHall.url),
  true,
  'pierre grise Hall reste en août'
);
assert.equal(
  inAugust.items.some((p) => p.url === greyVisual.url),
  true,
  'pierre grise Gaudry reste en août'
);
assert.equal(
  inAugust.items.some((p) => p.url === realSnow.url),
  false,
  'vraie neige absente en août'
);
assert.equal(
  inAugust.items.some((p) => p.url === julyGreen.url),
  true,
  'photo d’été présente en août'
);

const inJanuary = filterPoolByCurrentSeason(pool, january);
assert.equal(inJanuary.season4, 'hiver');
assert.equal(
  inJanuary.items.some((p) => p.url === realSnow.url),
  true,
  'vraie neige présente en janvier'
);
assert.equal(
  inJanuary.items.some((p) => p.url === greyHall.url),
  true,
  'campus pierre grise aussi en hiver (pas écarté des bonnes saisons)'
);
assert.equal(
  inJanuary.items.some((p) => p.url === julyGreen.url),
  false,
  'feuillage de juillet absent en janvier'
);

// Inconnue seule : éligible dès le tier courant (août).
const onlyUnknown = filterPoolByCurrentSeason([greyHall], {
  date: new Date(2026, 7, 10),
  minStrict: 12,
  minAdjacent: 16,
});
assert.equal(onlyUnknown.items.length, 1, 'inconnue seule : pool non vide en août');
assert.ok(['strict', 'adjacent', 'soft', 'all'].includes(onlyUnknown.tier));

console.log('All season-certainty checks passed.');

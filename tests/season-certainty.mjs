/* Pierre grise ≠ hiver : n’éjecter que l’opposé certain.
 * Run: node tests/season-certainty.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  detectFromText,
  mergeDetections,
  seasonTagTrusted,
  resolveItemSeason4,
  resolveItemSeason6,
  filterPoolByCurrentSeason,
  inferSeason4,
  inferSeason6,
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

const beaver = {
  url: 'https://upload.wikimedia.org/wikipedia/commons/2/29/Beaver_dam_in_Gatineau_Park_Jan_14.jpg',
  title: 'Beaver dam in Gatineau Park Jan 14',
  credit: 'MB-one',
  nationId: 'algonquin',
  season: 'ete',
  season6: 'aujaq',
  seasonSource: 'sessionId-fallback',
  seasonConfidence: 0.3,
};
assert.equal(inferSeason4(beaver), 'hiver', 'Jan 14 dans le titre → hiver');
assert.equal(inferSeason6(beaver), 'ukiuq', 'Jan 14 + nations → ukiuq');
assert.equal(seasonTagTrusted(beaver), false, 'repli de session non fiable');
assert.equal(resolveItemSeason4(beaver), 'hiver', 'client infère hiver malgré le tag été de moisson');
assert.equal(resolveItemSeason6(beaver), 'ukiuq');
assert.equal(detectFromText(beaver).season, 'hiver', 'bot : Jan 14 → hiver');
assert.equal(
  inferSeason4({ title: 'Gatineau Park Jan 2014' }),
  'hiver',
  'Jan 2014 (année, pas le jour 20) → janvier'
);

const julyOk = {
  url: 'https://example.test/july-green.jpg',
  title: 'Roddick Gates closed, McGill University, July 17, 2024',
  season: 'ete',
  seasonSource: 'text',
  seasonConfidence: 0.9,
};
const beaverAugust = filterPoolByCurrentSeason([beaver, julyOk], {
  date: new Date(2026, 7, 24),
  minStrict: 1,
  minAdjacent: 1,
});
assert.equal(
  beaverAugust.items.some((p) => p.url === beaver.url),
  false,
  'barrage de castors en janvier absent du mât en août'
);
assert.equal(
  beaverAugust.items.some((p) => p.url === julyOk.url),
  true,
  'photo de juillet reste en août'
);

const ukiuqOnly = {
  url: 'https://example.test/ukiuq.jpg',
  title: 'Kuujjuaq under snow',
  nationId: 'inuit',
  season: 'hiver',
  season6: 'ukiuq',
  seasonSource: 'manual',
  seasonConfidence: 1,
};
const softAugust = filterPoolByCurrentSeason([ukiuqOnly, julyOk], {
  date: new Date(2026, 7, 24),
  minStrict: 80,
  minAdjacent: 80,
});
assert.equal(
  softAugust.items.some((p) => p.url === ukiuqOnly.url),
  false,
  'ukiuq = hiver météo : hors pool même au palier soft en août'
);

const liveBank = JSON.parse(
  readFileSync(new URL('../data/photo-bank.json', import.meta.url), 'utf8')
);
const liveBeaver = (liveBank.photos || []).find((p) =>
  /Beaver dam in Gatineau Park Jan 14/.test(p.title || '')
);
assert.ok(liveBeaver, 'banque unique : barrage de castors Gatineau présent');
assert.equal(liveBeaver.season, 'hiver', 'banque unique : Jan 14 n’est plus un été de moisson');
assert.notEqual(liveBeaver.seasonSource, 'sessionId-fallback');
const liveAugust = filterPoolByCurrentSeason([liveBeaver, julyOk], {
  date: new Date(2026, 7, 24),
  minStrict: 1,
  minAdjacent: 1,
});
assert.equal(
  liveAugust.items.some((p) => p.url === liveBeaver.url),
  false,
  'banque unique : neige de Gatineau hors mât en août'
);

console.log('All season-certainty checks passed.');

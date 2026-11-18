#!/usr/bin/env node
/**
 * Sièges d’accueil : horizon 14 jours, héros par source, En bref en
 * passes, première page qui réserve les sources de l’horizon.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const div = require('../scripts/homepage-diversity-lib.js');
const { buildNewsPages, FIRST_PAGE_SIZE } = require('../scripts/news-pages.js');

const REF = new Date('2026-11-18T00:30:52Z');
const HOUR = 3600e3;

function art(title, source, institution, ageHours, link = `https://ex.ample/${source}/${title}`) {
  return {
    title,
    source,
    institution,
    link,
    date: new Date(REF.getTime() - ageHours * HOUR).toISOString(),
  };
}

const concordian = art('Roses', 'The Concordian', 'Concordia', 0);
const concordian2 = art('Serbie', 'The Concordian', 'Concordia', 3);
const concordian3 = art('Persépolis', 'The Concordian', 'Concordia', 5);
const concordian4 = art('Quickspins', 'The Concordian', 'Concordia', 8);
const campus = art('Beyond the Bubble', 'The Campus', "Bishop's", 26);
const campus2 = art('Business Pathway', 'The Campus', "Bishop's", 26.2);
const quartier = art('Génération Z', 'Quartier Libre', 'UdeM', 28);
const link = art('Link une', 'The Link', 'Concordia', 40);
const plant = art('Plant', 'The Plant', 'Dawson', 4 * 24);
const tribune = art('Tribune', 'The Tribune', "Bishop's", 40 * 24);

const pool = [
  concordian4, concordian3, concordian2, concordian,
  campus2, campus, quartier, link, plant, tribune,
];

const hero5 = div.pickHeroSeats(pool, 5, REF, 14);
assert.equal(hero5.length, 5);
assert.equal(hero5[0].link, concordian.link, 'la première une est le plus récent du fil');
assert.deepEqual(
  hero5.map((item) => item.source),
  ['The Concordian', 'The Campus', 'Quartier Libre', 'The Link', 'The Plant'],
  '5 sièges : une source chacune, la rafale ne prend pas le bloc',
);
assert.equal(new Set(hero5.map((item) => item.source)).size, 5);

const quiet = div.pickHeroSeats(
  [art('Vieux A', 'Seul', 'X', 30 * 24), art('Vieux B', 'Seul', 'X', 31 * 24)],
  2,
  REF,
  14,
);
assert.deepEqual(quiet.map((item) => item.title), ['Vieux A', 'Vieux B'], 'hors horizon : repli par date');

const repeatUne = div.pickHeroSeats(
  [art('Frais', 'A', 'IA', 0), art('Presque', 'A', 'IA', 1), art('Autre', 'B', 'IB', 10)],
  3,
  REF,
  14,
);
assert.deepEqual(
  repeatUne.map((item) => item.title),
  ['Frais', 'Presque', 'Autre'],
  's’il reste un siège, la rafale peut devenir une vedette (ou une une)',
);

const brief = div.pickBriefSeats(pool, hero5, 6, REF, 14);
assert.deepEqual(
  brief.map((item) => item.title),
  ['Serbie', 'Business Pathway'],
  'sources d’horizon déjà assises : un 2e titre chacune, Tribune ne s’intercale pas',
);
assert.ok(
  brief.filter((item) => item.source === 'The Concordian').length <= 1,
  'plafond de deux au total : la Concordian a déjà son siège',
);

const stacked = [
  campus, campus2, quartier, link,
];
const briefOrder = div.pickBriefSeats(stacked, [concordian], 4, REF, 14);
assert.deepEqual(
  briefOrder.map((item) => item.title),
  ['Beyond the Bubble', 'Génération Z', 'Link une', 'Business Pathway'],
  'le 2e Campus ne passe pas devant un premier titre',
);

const blocked = div.pickBriefSeats(
  [campus, campus2, plant],
  [concordian],
  2,
  REF,
  14,
);
assert.deepEqual(
  blocked.map((item) => item.source),
  ['The Campus', 'The Plant'],
  'Plant, dans l’horizon, prend le siège avant un 2e titre',
);
const afterPlant = div.pickBriefSeats(
  [campus, campus2, plant],
  [concordian],
  3,
  REF,
  14,
);
assert.deepEqual(
  afterPlant.map((item) => item.title),
  ['Beyond the Bubble', 'Plant', 'Business Pathway'],
  'le 2e titre vient après le premier de chaque source d’horizon',
);

const oldPaper = div.pickBriefSeats(
  [campus, campus2, tribune],
  [concordian],
  3,
  REF,
  14,
);
assert.deepEqual(
  oldPaper.map((item) => item.title),
  ['Beyond the Bubble', 'Business Pathway'],
  'Tribune hors horizon ne bloque pas un 2e titre',
);

assert.equal(
  div.hasUncoveredHorizonSource([plant], [], new Set(), REF, 14),
  false,
  'une source sans article dans le pool ne bloque pas',
);
assert.equal(
  div.hasUncoveredHorizonSource([plant, concordian], [plant], new Set(['The Concordian']), REF, 14),
  true,
);

const burst = Array.from({ length: 70 }, (_, k) => art(`B${k}`, 'The Campus', "Bishop's", k, `https://burst.example/${k}`));
const reservedNews = {
  updated: REF.toISOString(),
  items: [tribune, plant, ...burst],
};
const reserved = buildNewsPages(reservedNews);
assert.equal(reserved.latest.items.length, FIRST_PAGE_SIZE);
assert.equal(reserved.latest.items[0].link, burst[0].link);
assert.ok(reserved.latest.items.some((item) => item.source === 'The Plant'));
assert.equal(reserved.latest.items.filter((item) => item.source === 'The Tribune').length, 0);
const flat = [...reserved.latest.items, ...reserved.pages.flatMap((page) => page.data.items)];
assert.equal(flat.length, reservedNews.items.length);
assert.equal(new Set(flat.map((item) => item.link)).size, flat.length);

const manySources = Array.from({ length: 70 }, (_, k) => art(`S${k}`, `Source ${k}`, `Inst ${k}`, k, `https://s.example/${k}`));
const grown = buildNewsPages({ updated: REF.toISOString(), items: manySources });
assert.equal(grown.latest.items.length, 70, 'la page grandit si les sources réservées dépassent 60');
assert.equal(grown.latest.items[0].source, 'Source 0');
assert.equal(grown.pages.length, 0);

console.log('homepage-diversity: OK');

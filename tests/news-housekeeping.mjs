#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  isHousekeepingNotice,
  isSummerHousekeepingWindow,
  housekeepingDisposition,
  filterHousekeepingForDisplay,
  hasSelfReference,
  isCampusMediaSource,
  SUMMER_HOUSEKEEPING_START,
  SUMMER_HOUSEKEEPING_END,
} = require('../scripts/news-housekeeping-lib.js');

const campus = { type: 'universite', source: 'Zone Campus' };

const zone = {
  ...campus,
  title: 'Le Zone Campus ferme ses portes pour la saison estivale!',
  excerpt:
    'Chers lecteurs et lectrices, nous tenons à vous annoncer la fermeture du journal Zone Campus pour la saison estivale 2026. En effet, du 8 mai au 8 septembre…',
  date: '2026-05-08T14:20:26.000Z',
};

assert.equal(isCampusMediaSource(zone), true);
assert.equal(hasSelfReference(zone), true, 'titre cite Zone Campus + chers lecteurs');
assert.equal(isHousekeepingNotice(zone), true, 'Zone Campus auto-annonce = avis');

const midJune = new Date('2026-06-15T15:00:00.000Z');
const midOctober = new Date('2026-10-05T15:00:00.000Z');
assert.equal(housekeepingDisposition(zone, midJune), 'brief', 'été → En bref');
assert.equal(housekeepingDisposition(zone, midOctober), 'exclude', 'octobre → exclu');
assert.equal(isSummerHousekeepingWindow(midJune), true);
assert.equal(isSummerHousekeepingWindow(midOctober), false);
assert.equal(SUMMER_HOUSEKEEPING_START.day, 1);
assert.equal(SUMMER_HOUSEKEEPING_END.day, 25);

// --- Fermetures légitimes (autre entité) → pass, même depuis une source campus ---
const legitCases = [
  {
    name: 'café étudiant',
    title: 'Le café étudiant ferme ses portes',
    excerpt: 'Après dix ans, le Café Campus cesse ses activités au pavillon central.',
  },
  {
    name: 'usine',
    title: 'Une usine ferme ses portes à Trois-Rivières',
    excerpt: 'Des dizaines d’emplois sont menacés dans le secteur manufacturier.',
  },
  {
    name: 'cégep',
    title: 'Le Cégep de Trois-Rivières ferme ses portes pour des travaux',
    excerpt: 'Le campus sera inaccessible jusqu’en septembre.',
  },
  {
    name: 'restaurant',
    title: 'Le restaurant du centre-ville ferme ses portes',
    excerpt: 'Les propriétaires prennent leur retraite après 30 ans.',
  },
  {
    name: 'bâtiment campus',
    title: 'Le pavillon des sciences ferme ses portes pour rénovation',
    excerpt: 'Les cours sont relocalisés dans d’autres ailes.',
  },
  {
    name: 'hiatus sans auto-réf',
    title: 'Hiatus for the campus radio shows',
    excerpt: 'Several student radio programs go quiet until September.',
  },
  {
    name: 'retour septembre sans auto-réf',
    title: 'De retour en septembre pour les clubs étudiants',
    excerpt: 'Les associations reprendront leurs activités à la rentrée.',
  },
];

for (const c of legitCases) {
  const item = { ...campus, title: c.title, excerpt: c.excerpt };
  assert.equal(
    isHousekeepingNotice(item),
    false,
    `${c.name} ne doit pas être un avis de ménage`,
  );
  assert.equal(housekeepingDisposition(item, midOctober), 'pass', `${c.name} → pass en octobre`);
  assert.equal(housekeepingDisposition(item, midJune), 'pass', `${c.name} → pass en juin`);
}

// Article « été » sans fermeture
const normalSummer = {
  ...campus,
  title: 'Les meilleurs festivals d’été à Trois-Rivières',
  excerpt: 'Guide des spectacles et terrasses pour profiter de la saison estivale.',
};
assert.equal(isHousekeepingNotice(normalSummer), false);

// Retrospective Tribune (pas auto-pause)
const tribune = {
  type: 'universite',
  source: 'The Tribune',
  title: 'What we liked this summer break',
  excerpt: 'Staff picks from the past few months.',
};
assert.equal(isHousekeepingNotice(tribune), false);

// Auto-réf par formulation sans répéter le nom exact
const selfPhrase = {
  ...campus,
  source: 'Montréal Campus',
  title: 'Fermeture estivale — à bientôt',
  excerpt: 'Chers lecteurs, nous tenons à vous annoncer la pause de notre journal jusqu’en septembre.',
};
assert.equal(isHousekeepingNotice(selfPhrase), true, 'chers lecteurs + notre journal');

// Source non-campus → pass même avec auto-texte
const offCampus = {
  type: 'blog',
  source: 'Blog random',
  title: 'Le Blog random ferme ses portes pour la saison estivale',
  excerpt: 'Chers lecteurs, nous tenons à vous annoncer notre pause.',
};
assert.equal(isCampusMediaSource(offCampus), false);
assert.equal(isHousekeepingNotice(offCampus), false);

const fallPool = filterHousekeepingForDisplay([zone, normalSummer], midOctober);
assert.equal(fallPool.length, 1);
assert.equal(fallPool[0].title, normalSummer.title);
const summerPool = filterHousekeepingForDisplay([zone, normalSummer], midJune);
assert.equal(summerPool.length, 2);

console.log('news-housekeeping: ok');

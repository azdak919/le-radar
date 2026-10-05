#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  isHousekeepingNotice,
  isSummerHousekeepingWindow,
  housekeepingDisposition,
  filterHousekeepingForDisplay,
  SUMMER_HOUSEKEEPING_START,
  SUMMER_HOUSEKEEPING_END,
} = require('../scripts/news-housekeeping-lib.js');

const zone = {
  title: 'Le Zone Campus ferme ses portes pour la saison estivale!',
  excerpt:
    'Chers lecteurs et lectrices, nous tenons à vous annoncer la fermeture du journal Zone Campus pour la saison estivale 2026. En effet, du 8 mai au 8 septembre…',
  date: '2026-05-08T14:20:26.000Z',
  source: 'Zone Campus',
};

const normalSummerMention = {
  title: 'Les meilleurs festivals d’été à Trois-Rivières',
  excerpt: 'Guide des spectacles et terrasses pour profiter de la saison estivale.',
  date: '2026-06-10T12:00:00.000Z',
  source: 'Zone Campus',
};

const tribuneRetrospective = {
  title: 'What we liked this summer break',
  excerpt: 'Staff picks from the past few months.',
  date: '2026-09-01T12:00:00.000Z',
  source: 'The Tribune',
};

assert.equal(isHousekeepingNotice(zone), true, 'Zone Campus fermeture = avis de ménage');
assert.equal(isHousekeepingNotice(normalSummerMention), false, 'article sur l’été ≠ avis de ménage');
assert.equal(isHousekeepingNotice(tribuneRetrospective), false, 'retrospective summer break ≠ avis');

assert.equal(SUMMER_HOUSEKEEPING_START.month, 5);
assert.equal(SUMMER_HOUSEKEEPING_START.day, 1);
assert.equal(SUMMER_HOUSEKEEPING_END.month, 8);
assert.equal(SUMMER_HOUSEKEEPING_END.day, 25);

const midJune = new Date('2026-06-15T15:00:00.000Z'); // 11 h EDT
const midOctober = new Date('2026-10-05T15:00:00.000Z');
const aug25 = new Date('2026-08-25T16:00:00.000Z'); // après-midi EDT = encore le 25
const aug26 = new Date('2026-08-26T16:00:00.000Z');

assert.equal(isSummerHousekeepingWindow(midJune), true, 'juin = fenêtre été');
assert.equal(isSummerHousekeepingWindow(midOctober), false, 'octobre = hors fenêtre');
assert.equal(isSummerHousekeepingWindow(aug25), true, '25 août inclus');
assert.equal(isSummerHousekeepingWindow(aug26), false, '26 août exclus');

assert.equal(housekeepingDisposition(zone, midJune), 'brief', 'été → En bref');
assert.equal(housekeepingDisposition(zone, midOctober), 'exclude', 'octobre → exclu');
assert.equal(housekeepingDisposition(normalSummerMention, midJune), 'pass');
assert.equal(housekeepingDisposition(normalSummerMention, midOctober), 'pass');

const summerPool = filterHousekeepingForDisplay([zone, normalSummerMention], midJune);
assert.equal(summerPool.length, 2, 'en été les deux restent (avis → brief côté partition)');
const fallPool = filterHousekeepingForDisplay([zone, normalSummerMention], midOctober);
assert.equal(fallPool.length, 1, 'en octobre l’avis disparaît');
assert.equal(fallPool[0].title, normalSummerMention.title);

// Soft title + excerpt confirm
const soft = {
  title: 'À bientôt — saison estivale',
  excerpt: 'Nos activités seront suspendues jusqu’en septembre. Fermeture du journal pour la relâche.',
};
assert.equal(isHousekeepingNotice(soft), true, 'titre doux + excerpt confirment');

const softNoConfirm = {
  title: 'Spécial saison estivale',
  excerpt: 'Nos chroniques préférées de juin à août.',
};
assert.equal(isHousekeepingNotice(softNoConfirm), false, 'saison estivale sans fermeture ≠ avis');

console.log('news-housekeeping: ok');

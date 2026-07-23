#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveCurrentSlot } = require('../scripts/radio-schedule-lib.js');

const root = new URL('../', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const isHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

for (const file of [
  'news.json',
  'news-sources.json',
  'radios.json',
  'radios-candidates.json',
  'radio-schedules.json',
  'radio-nowplaying.json',
  'institutions.json',
  'brand-colors.json',
  'manifest.json',
]) {
  assert.doesNotThrow(() => readJson(file), `${file} doit contenir du JSON valide`);
}

const newsDocument = readJson('news.json');
const articles = newsDocument.items || newsDocument.articles;
assert(Array.isArray(articles) && articles.length > 0, 'news.json doit contenir des articles');
assert(Number.isFinite(Date.parse(newsDocument.updated)), 'news.json.updated doit être une date ISO valide');

const articleLinks = new Set();
for (const [index, article] of articles.entries()) {
  const label = `news.json article ${index}`;
  assert.equal(typeof article.title, 'string', `${label}: title requis`);
  assert(article.title.trim(), `${label}: title non vide`);
  assert.equal(typeof article.source, 'string', `${label}: source requise`);
  assert(article.source.trim(), `${label}: source non vide`);
  assert(isHttpUrl(article.link), `${label}: lien HTTP(S) valide requis`);
  assert(Number.isFinite(Date.parse(article.date)), `${label}: date valide requise`);
  assert(!articleLinks.has(article.link), `${label}: lien d'article dupliqué ${article.link}`);
  articleLinks.add(article.link);
}

const sourceRegistry = readJson('news-sources.json');
assert(Array.isArray(sourceRegistry.active), 'news-sources.json.active doit être un tableau');
assert(Array.isArray(sourceRegistry.candidates), 'news-sources.json.candidates doit être un tableau');
const activeSourceNames = new Set();
for (const source of sourceRegistry.active) {
  assert(source.name && !activeSourceNames.has(source.name), `source active unique requise: ${source.name}`);
  activeSourceNames.add(source.name);
  assert(isHttpUrl(source.url), `URL valide requise pour ${source.name}`);
}
for (const article of articles) {
  assert(activeSourceNames.has(article.source), `source active introuvable pour ${article.source}`);
}

const radios = readJson('radios.json');
const schedules = readJson('radio-schedules.json').stations;
const nowPlaying = readJson('radio-nowplaying.json').stations;
assert(Array.isArray(radios) && radios.length > 0, 'radios.json doit contenir des radios');
assert(schedules && typeof schedules === 'object', 'radio-schedules.json.stations requis');
assert(nowPlaying && typeof nowPlaying === 'object', 'radio-nowplaying.json.stations requis');

const radioIds = new Set();
for (const radio of radios) {
  assert(radio.id && !radioIds.has(radio.id), `identifiant radio unique requis: ${radio.id}`);
  radioIds.add(radio.id);
  assert(radio.name && radio.institution, `nom et établissement requis pour ${radio.id}`);
  assert(isHttpUrl(radio.stream), `flux HTTP(S) valide requis pour ${radio.id}`);
  assert(isHttpUrl(radio.website), `site HTTP(S) valide requis pour ${radio.id}`);
  assert(schedules[radio.id], `grille manquante pour ${radio.id}`);
  assert(nowPlaying[radio.id], `métadonnées à l'antenne manquantes pour ${radio.id}`);
}

const chyzOverlap = resolveCurrentSlot([
  { day: 4, start: '17:30', end: '19:00', title: 'Régulier' },
  { day: 4, start: '18:50', end: '23:00', title: 'Spécial' },
], new Date('2026-07-23T22:55:00Z'), 'America/Toronto');
assert.equal(chyzOverlap?.title, 'Spécial', 'le créneau CHYZ commencé le plus récemment doit primer');

console.log(`OK données (${articles.length} articles, ${activeSourceNames.size} sources, ${radios.length} radios)`);

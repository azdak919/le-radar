#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveCurrentSlot, gridCoverage } = require('../scripts/radio-schedule-lib.js');

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

/*
 * Ce qui sort des bots horaires doit être lisible tel quel à l'antenne.
 *
 * Deux régressions vécues, toutes deux invisibles en dry-run :
 *  - Airtime (CKUT) sert du HTML échappé → « Utopia&#039;s Paradise » affiché
 *    brut dans le syntoniseur ;
 *  - le même automate émet « Offline » entre deux émissions, qui filait dans
 *    `track` faute de filtre → « ♪ Offline » sous le titre de l'émission.
 */
const HTML_ENTITY_RE = /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]{1,31});/i;
const TECHNICAL_AIR_RE = /^(?:off ?line|off ?air|dead ?air|silence(?: detected)?|station ?id|airtime!?|liquidsoap(?:\s+radio!?)?|no name|unknown|unspecified|n\/a)$/i;

const airTextFields = [];
for (const [id, station] of Object.entries(nowPlaying)) {
  for (const [key, show] of [['current', station.current], ['next', station.next]]) {
    if (!show) continue;
    airTextFields.push([`radio-nowplaying.json ${id}.${key}.title`, show.title]);
    if (show.host) airTextFields.push([`radio-nowplaying.json ${id}.${key}.host`, show.host]);
  }
  airTextFields.push([`radio-nowplaying.json ${id}.track`, station.track]);
  airTextFields.push([`radio-nowplaying.json ${id}.showTitle`, station.showTitle]);
}
for (const [id, station] of Object.entries(schedules)) {
  for (const [i, slot] of (station.grid || []).entries()) {
    airTextFields.push([`radio-schedules.json ${id}.grid[${i}].title`, slot.title]);
    if (slot.host) airTextFields.push([`radio-schedules.json ${id}.grid[${i}].host`, slot.host]);
  }
}

for (const [label, value] of airTextFields) {
  const text = String(value || '').trim();
  if (!text) continue;
  assert(
    !HTML_ENTITY_RE.test(text),
    `${label}: entité HTML non décodée (${text}) — voir normalizeShowTitle / normalizeSlot`
  );
  assert(
    !TECHNICAL_AIR_RE.test(text),
    `${label}: métadonnée technique diffusée comme contenu (${text}) — voir isUsableTrackLine`
  );
}

/*
 * Couverture des grilles.
 *
 * Une grille peut être fraîche et pourtant ne décrire qu'un huitième de la
 * semaine. Ces planchers sont relevés sur l'état connu et servent d'alarme :
 * ils attrapent le cas où une source répond 200 mais où le parseur ne
 * comprend plus la page — le bot garde alors l'ancienne grille (garde-fou
 * COLLAPSE_RATIO), et ce test dit pourquoi. Les relever quand une station
 * publie mieux ; ne jamais les baisser sans savoir ce qui a été perdu.
 */
const COVERAGE_FLOOR = {
  cism: 95, cjlo: 95, ckut: 95, cfak: 80, chyz: 20, choq: 10,
};

for (const [id, floor] of Object.entries(COVERAGE_FLOOR)) {
  const station = schedules[id];
  if (!station) continue;
  const cov = gridCoverage(station.grid);
  assert(
    cov.weekPercent >= floor,
    `radio-schedules.json ${id} : couverture tombée à ${cov.weekPercent} % `
    + `(plancher ${floor} %, ${cov.slots} créneaux) — parseur cassé ou source refondue ?`
  );
}

const chyzOverlap = resolveCurrentSlot([
  { day: 4, start: '17:30', end: '19:00', title: 'Régulier' },
  { day: 4, start: '18:50', end: '23:00', title: 'Spécial' },
], new Date('2026-07-23T22:55:00Z'), 'America/Toronto');
assert.equal(chyzOverlap?.title, 'Spécial', 'le créneau CHYZ commencé le plus récemment doit primer');

// ── Banques fonds QC : JSON source de vérité ↔ JS miroir + hard-ban ──
const { matchHardBanned } = require('../scripts/quebec-backgrounds-blacklist');
const bankPairs = [
  ['data/quebec-backgrounds.json', 'quebec-backgrounds-data.js'],
  ['data/quebec-pomo-backgrounds.json', 'quebec-pomo-backgrounds-data.js'],
  ['data/quebec-university-backgrounds.json', 'quebec-university-backgrounds-data.js'],
  ['data/quebec-nations-backgrounds.json', 'quebec-nations-backgrounds-data.js'],
  ['data/quebec-favorites-backgrounds.json', 'quebec-favorites-backgrounds-data.js'],
];
const extractJsUrls = (text) => {
  const urls = [];
  const re = /url:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(text))) urls.push(m[1]);
  return urls;
};
let bankPhotoCount = 0;
for (const [jsonRel, jsRel] of bankPairs) {
  const bank = readJson(jsonRel);
  assert(Array.isArray(bank.photos), `${jsonRel}: photos[] requis`);
  const jsonUrls = bank.photos.map((p) => p.url).filter(Boolean);
  const jsText = readFileSync(new URL(`../${jsRel}`, import.meta.url), 'utf8');
  const jsUrls = extractJsUrls(jsText);
  assert.equal(
    jsonUrls.length,
    jsUrls.length,
    `${jsonRel} ↔ ${jsRel}: nombre d'URL (json=${jsonUrls.length} js=${jsUrls.length}) — npm run bank:sync`
  );
  for (const url of jsonUrls) {
    assert(jsUrls.includes(url), `${jsRel}: URL absente du miroir JS — npm run bank:sync`);
  }
  for (const photo of bank.photos) {
    const ban = matchHardBanned(photo);
    assert(
      !ban,
      `${jsonRel}: photo hard-bannie encore en banque (${photo.title || photo.url}) reason=${ban?.reason}`
    );
  }
  bankPhotoCount += bank.photos.length;
}

console.log(
  `OK données (${articles.length} articles, ${activeSourceNames.size} sources, ${radios.length} radios, ${bankPhotoCount} fonds QC)`
);

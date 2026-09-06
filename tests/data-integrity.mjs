#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveCurrentSlot, gridCoverage, fetchChoqGrid, COVERAGE_FLOOR } = require('../scripts/radio-schedule-lib.js');

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
  'pomo/site.webmanifest',
  'solitaire/site.webmanifest',
]) {
  assert.doesNotThrow(() => readJson(file), `${file} doit contenir du JSON valide`);
}

for (const [file, background] of [
  ['manifest.json', '#0e0f12'],
  ['pomo/site.webmanifest', '#1a1816'],
  ['solitaire/site.webmanifest', '#1a1816'],
]) {
  const manifest = readJson(file);
  assert.equal(manifest.display, 'standalone', `${file} : affichage standalone requis`);
  assert.equal(manifest.background_color, background, `${file} : fond de lancement cohérent requis`);
  assert.equal(manifest.theme_color, background, `${file} : couleur système initiale cohérente requise`);
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

// Slogans SEO : CISM = « La Marge » (Wikipédia FR + branding site).
{
  const radiosList = readJson('radios.json');
  const cism = (Array.isArray(radiosList) ? radiosList : []).find((r) => r.id === 'cism');
  assert(cism?.slogan === 'La Marge', `CISM slogan attendu « La Marge », obtenu ${JSON.stringify(cism?.slogan)}`);
  assert(
    !/radio étudiante de l'Université de Montréal/i.test(String(cism?.slogan || '')),
    'CISM : ne pas confondre slogan de marque et description institutionnelle',
  );
}
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

{
  // CHYZ : ne pas suivre le <audio> de chyz.ca — il pointe le mount
  // « Tests techniques » (/proxy/tech/stream). L’antenne est le compte
  // Centova `chyz` (tunein/chyz.pls → Title1=CHYZ 94,3 FM).
  const CHYZ_ONAIR = 'https://ecoutez.chyz.ca/proxy/chyz/stream';
  const chyz = radios.find((radio) => radio.id === 'chyz');
  assert.equal(chyz?.stream, CHYZ_ONAIR, 'CHYZ : flux = mount Centova d’antenne (/proxy/chyz/stream)');
  const discover = readFileSync(new URL('scripts/discover-streams.js', root), 'utf8');
  assert(
    discover.includes(`chyz: CHYZ_ONAIR_STREAM`) || discover.includes(`'${CHYZ_ONAIR}'`),
    'discover-streams : KNOWN_STREAMS.chyz aligné sur radios.json',
  );
  assert(
    !discover.includes("chyz: 'https://ecoutez.chyz.ca/proxy/tech/stream'"),
    'discover-streams : ne plus préférer le mount de tests techniques',
  );
  assert(
    !discover.includes("chyz: 'https://ecoutez.chyz.ca/proxy/chyz943/stream'"),
    'discover-streams : ne plus préférer le mount CHYZ 404',
  );

  const {
    parseCentovaPls,
    isJunkIcyName,
    isJunkStreamUrl,
    canonicalizeStreamUrl,
    CHYZ_ONAIR_STREAM,
    CFAK_ONAIR_STREAM,
    CHOQ_ONAIR_STREAM,
  } = require('../scripts/discover-streams.js');
  assert.equal(CHYZ_ONAIR_STREAM, CHYZ_ONAIR);
  assert.equal(
    parseCentovaPls('[playlist]\nTitle1=CHYZ 94,3 FM\nFile1=http://example:8004/stream\n').title,
    'CHYZ 94,3 FM',
  );
  assert.equal(
    parseCentovaPls('[playlist]\nTitle1=Tests techniques\nFile1=http://example:8000/stream\n').title,
    'Tests techniques',
  );
  assert.equal(isJunkIcyName('Tests techniques'), true);
  assert.equal(isJunkIcyName('No Name'), true);
  assert.equal(isJunkIcyName('CHYZ 94,3 FM'), false);
  assert.equal(isJunkIcyName(''), false);
  assert.equal(isJunkStreamUrl('https://ecoutez.chyz.ca/proxy/tech/stream'), true);
  assert.equal(isJunkStreamUrl(CHYZ_ONAIR), false);

  // CFAK : le player officiel pointe streams.radiomast.io/<uuid>. Le bot
  // ne doit pas figer le 302 vers un audio-edge-* (hôte géo éphémère).
  const CFAK_ONAIR = 'https://streams.radiomast.io/a372c74f-6c78-48b9-9933-81a8fc50b54a';
  const cfak = radios.find((radio) => radio.id === 'cfak');
  assert.equal(cfak?.stream, CFAK_ONAIR, 'CFAK : flux = URL RadioMast canonique (pas un edge géo)');
  assert.equal(CFAK_ONAIR_STREAM, CFAK_ONAIR);
  assert(
    discover.includes('cfak: CFAK_ONAIR_STREAM') || discover.includes(`'${CFAK_ONAIR}'`),
    'discover-streams : KNOWN_STREAMS.cfak aligné sur radios.json',
  );
  assert(
    !radios.some((radio) => /audio-edge-/i.test(String(radio.stream || ''))),
    'radios.json : ne pas figer un hostname audio-edge RadioMast',
  );
  assert.equal(
    canonicalizeStreamUrl('https://audio-edge-vqwx4.yyz.g.radiomast.io/a372c74f-6c78-48b9-9933-81a8fc50b54a'),
    CFAK_ONAIR,
  );
  assert.equal(canonicalizeStreamUrl(CFAK_ONAIR), CFAK_ONAIR);
  assert.equal(canonicalizeStreamUrl(CHYZ_ONAIR), CHYZ_ONAIR);

  // CHOQ : /api/live et le PLS Triton 302 vers NNNN.live.streamtheworld.com.
  // Ne pas figer cet edge géo (même classe que CFAK audio-edge-*).
  const CHOQ_ONAIR = 'https://playerservices.streamtheworld.com/api/livestream-redirect/SP_R4799664_SC';
  const choq = radios.find((radio) => radio.id === 'choq');
  assert.equal(choq?.stream, CHOQ_ONAIR, 'CHOQ : flux = redirecteur StreamTheWorld (pas un edge géo)');
  assert.equal(CHOQ_ONAIR_STREAM, CHOQ_ONAIR);
  assert(
    discover.includes('choq: CHOQ_ONAIR_STREAM') || discover.includes(`'${CHOQ_ONAIR}'`),
    'discover-streams : KNOWN_STREAMS.choq aligné sur radios.json',
  );
  assert(
    !radios.some((radio) => /\d+\.live\.streamtheworld\.com/i.test(String(radio.stream || ''))),
    'radios.json : ne pas figer un hostname NNNN.live.streamtheworld.com',
  );
  assert.equal(
    canonicalizeStreamUrl('https://14223.live.streamtheworld.com/SP_R4799664_SC'),
    CHOQ_ONAIR,
  );
  assert.equal(
    canonicalizeStreamUrl('https://18213.live.streamtheworld.com:443/SP_R4799664_SC'),
    CHOQ_ONAIR,
  );
  assert.equal(canonicalizeStreamUrl(CHOQ_ONAIR), CHOQ_ONAIR);
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
// Consignes internes laissées dans le nom d'émission par les stations —
// « Desi Beats (must be .mp3!!) » chez CKUT. Le filtre a manqué deux fois à un
// endroit différent (grille, puis flux live) : ce test couvre les deux sorties.
const PRODUCTION_NOTE_RE = /\(\s*(?:must|please|do not|don't|new time|tba|tbd|test)\b|\([^)]*\.(?:mp3|wav|flac|aiff?|m4a|ogg)\b/i;
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
  assert(
    !PRODUCTION_NOTE_RE.test(text),
    `${label}: consigne interne diffusée comme titre (${text}) — voir stripProductionNote`
  );
  assert(
    !/^(?:ffiles|files|file|track\d*|untitled)$/i.test(text),
    `${label}: titre déchet type fichier/placeholder (${text}) — voir isJunkShowTitle`
  );
}

// Titres tronqués CJLO (« Words an... ») : si une URL /shows/… existe, le
// bot doit reconstituer le nom complet (expandTruncatedTitle).
{
  const { expandTruncatedTitle } = require('../scripts/radio-schedule-lib.js');
  assert(
    expandTruncatedTitle('Words an...', 'http://www.cjlo.com/shows/words-and-culture') === 'Words and Culture',
    'expandTruncatedTitle : Words and Culture depuis le slug',
  );
  for (const [id, station] of Object.entries(schedules)) {
    for (const [i, slot] of (station.grid || []).entries()) {
      if (!slot?.url || !/\.\.\.|…/.test(String(slot.title || ''))) continue;
      assert(
        false,
        `radio-schedules.json ${id}.grid[${i}].title encore tronqué (${slot.title}) avec url — expandTruncatedTitle`,
      );
    }
  }
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
assert.equal(COVERAGE_FLOOR.choq, 5, 'plancher CHOQ partagé bot / intégrité (épisodes datés, semaine mince réelle)');
assert(
  readFileSync(new URL('scripts/fetch-radio-schedules.js', root), 'utf8').includes('belowCoverageFloor'),
  'bot horaires : ne pas publier une grille sous le plancher d’intégrité',
);

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

{
  // Empêche un merge Labo local (ou un bot sauté) de republier une grille
  // d'il y a deux semaines sous « cette semaine ». Semaine tamponnée = celle
  // en cours à Québec, ou la précédente si on est avant la passe du lundi.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  const local = new Date(Date.UTC(get('year'), get('month') - 1, get('day'), 12));
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  const thisMonday = local.toISOString().slice(0, 10);
  const prev = new Date(local);
  prev.setUTCDate(prev.getUTCDate() - 7);
  const lastMonday = prev.toISOString().slice(0, 10);
  const older = new Date(prev);
  older.setUTCDate(older.getUTCDate() - 7);
  const twoAgoMonday = older.toISOString().slice(0, 10);
  const maxAgeMs = 14 * 24 * 60 * 60 * 1000;
  for (const [id, station] of Object.entries(schedules)) {
    const week = station.verifiedWeekOf;
    // this / last : collecte hebdo. twoAgo : grille conservée sous plancher
    // (CHOQ hors session) — checkedAt doit quand même être récent.
    assert(
      week === thisMonday || week === lastMonday || week === twoAgoMonday,
      `radio-schedules.json ${id} : semaine ${week} hors ${twoAgoMonday}–${thisMonday} — collecte manquée ou merge Labo local ?`,
    );
    const checked = new Date(station.checkedAt).getTime();
    assert(
      Number.isFinite(checked) && Date.now() - checked < maxAgeMs,
      `radio-schedules.json ${id} : checkedAt trop vieux (${station.checkedAt})`,
    );
  }
}

const chyzOverlap = resolveCurrentSlot([
  { day: 4, start: '17:30', end: '19:00', title: 'Régulier' },
  { day: 4, start: '18:50', end: '23:00', title: 'Spécial' },
], new Date('2026-07-23T22:55:00Z'), 'America/Toronto');
assert.equal(chyzOverlap?.title, 'Spécial', 'le créneau CHYZ commencé le plus récemment doit primer');

{
  const choqGrid = schedules.choq?.grid || [];
  const occupancy = new Map();
  for (const slot of choqGrid) {
    const key = `${slot.day}|${slot.start}`;
    assert.equal(
      occupancy.has(key),
      false,
      `CHOQ : deux émissions au même créneau (${key} déjà ${occupancy.get(key)}, aussi ${slot.title})`,
    );
    occupancy.set(key, slot.title);
  }
}

{
  const ymdInTz = (date) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const addDays = (ymd, n) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  };
  const today = ymdInTz(new Date());
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', weekday: 'short' }).format(new Date());
  const todayDow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd];
  const weekStart = addDays(today, todayDow === 0 ? -6 : 1 - todayDow);
  const nextMonday = addDays(weekStart, 7);
  const utc17 = (ymd) => `${ymd}T21:00:00+00:00`;
  const utc18 = (ymd) => `${ymd}T22:00:00+00:00`;
  const episodes = {
    [weekStart]: [{
      title: 'ep',
      timestamp_start: utc17(weekStart),
      timestamp_end: utc18(weekStart),
      parent: { title: 'Faire avec', slug: 'faire-avec' },
    }],
    [nextMonday]: [{
      title: 'ep',
      timestamp_start: utc17(nextMonday),
      timestamp_end: utc18(nextMonday),
      parent: { title: 'Bitume', slug: 'bitume' },
    }],
  };
  const fetchImpl = async (_url, opts = {}) => {
    const body = JSON.parse(opts.body || '{}');
    const range = body.variables?.date || [];
    const day = String(range[1] || '').replace(/^>=\s*/, '');
    return {
      ok: true,
      json: async () => ({ data: { entries: episodes[day] || [] } }),
    };
  };
  const grid = await fetchChoqGrid({ days: 14 }, { fetchImpl });
  const monday17 = grid.filter((s) => s.day === 1 && s.start === '17:00');
  assert.equal(monday17.length, 1, 'CHOQ quinzaine : un seul lundi 17 h');
  assert.equal(monday17[0].title, 'Faire avec', 'CHOQ quinzaine : la semaine en cours prime');
  const thisWeek = await fetchChoqGrid({ days: 7 }, { fetchImpl });
  assert.equal(
    thisWeek.some((s) => s.title === 'Bitume'),
    false,
    'CHOQ : la semaine courante ne doit pas afficher l’émission de la semaine suivante',
  );
}

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

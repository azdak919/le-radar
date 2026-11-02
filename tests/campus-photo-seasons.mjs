// Photos de repli : jamais de neige hors de l'hiver réel (15 nov. → 31 mars) ; saison inconnue évitée.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../scripts/campus-photo-bank.js');
const { classify } = require('../scripts/tag-campus-seasons.js');

// Étiquetage Commons : catégorie, titre, date de prise.
assert.equal(classify({ title: 'Campus UdeM sous la neige' }).snow, true);
assert.equal(classify({ cats: 'Winter in Montreal' }).snow, true);
assert.equal(classify({ date: '2013-03-02 10:00' }).snow, true);
assert.equal(classify({ cats: 'October 2002 in Montreal' }).snow, false);
assert.equal(classify({ date: '2022-08-31' }).snow, false);
assert.equal(classify({ date: '2012-11-20' }).snow, null);
assert.equal(classify({}).snow, null);

// Calendrier.
assert.equal(C.isSnowSeason(new Date('2026-11-02T12:00Z')), false);
assert.equal(C.isSnowSeason(new Date('2026-11-20T12:00Z')), true);
assert.equal(C.isSnowSeason(new Date('2027-01-10T12:00Z')), true);
assert.equal(C.isSnowSeason(new Date('2027-04-02T12:00Z')), false);

// Chaque photo des banques de repli a une étiquette.
const tags = JSON.parse(fs.readFileSync(new URL('../data/campus-photo-seasons.json', import.meta.url))).photos;
for (const list of Object.values(C.BANK)) for (const e of list || []) assert.ok(C.stockKey(e.url) in tags, `sans étiquette : ${e.url}`);

// Hors hiver : aucune photo enneigée choisie, pour aucun établissement ; en hiver, elles reviennent.
const nov2 = new Date('2026-11-02T12:00Z');
for (const inst of Object.keys(C.BANK)) {
  for (let k = 0; k < 6; k += 1) {
    const p = C.pickCampusPhoto({ institution: inst, link: `https://x/${inst}/${k}`, title: 'Winter is coming' }, { now: nov2 });
    if (p) assert.notEqual(C.photoHasSnow({ url: p.stockImage, title: p.imageTitle }), true, `${inst} : ${p.imageTitle}`);
  }
}
const pool = C.bankEntriesFor('McGill University');
assert.ok(C.seasonFilter(pool, nov2).every((e) => C.photoHasSnow(e) === false));
assert.ok(C.seasonFilter(pool, new Date('2027-01-10T12:00Z')).some((e) => C.photoHasSnow(e) === true));

// Données publiées : hors hiver, aucune une ni carte avec une photo de repli enneigée.
const news = JSON.parse(fs.readFileSync(new URL('../news.json', import.meta.url)));
const at = new Date(news.updated || news.lastUpdated || Date.now());
if (!C.isSnowSeason(at)) {
  const bad = news.items.filter((i) => i.stockImage && !i.image && C.photoHasSnow({ url: i.stockImage, title: i.imageTitle || '' }) === true);
  assert.deepEqual(bad.map((i) => `${i.source} : ${i.imageTitle}`), []);
}
const mg = news.items.find((i) => /keeping-our-unhoused-community-warm/.test(i.link));
if (mg) assert.match(mg.stockImage || '', /McGill_University_Montr%C3%A9al\.jpeg/);
console.log('campus-photo-seasons: PASS');

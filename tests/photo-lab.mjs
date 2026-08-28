/**
 * Labo photo local — mutations hors prod.
 * Run: node tests/photo-lab.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createPhotoLab,
  coverWindow,
  photoKey,
  thumbUrl,
  commonsFileFragment,
  DESKTOP_MAST,
} = require('../scripts/photo-lab-lib.js');

const win0 = coverWindow(1600, 900, DESKTOP_MAST.w, DESKTOP_MAST.h, 0);
assert.ok(win0.y0 < 1, 'focalY 0 ancre le haut');
assert.ok(win0.visibleFrac > 0.1 && win0.visibleFrac < 0.5, 'bandeau bureau cache la majorité de la hauteur');
const win1 = coverWindow(1600, 900, DESKTOP_MAST.w, DESKTOP_MAST.h, 1);
assert.ok(win1.y0 > win0.y0, 'focalY 1 descend la fenêtre');
assert.ok(Math.abs(win0.visH - win1.visH) < 0.01, 'hauteur visible indépendante de focalY');

assert.equal(
  photoKey('https://images.unsplash.com/photo-abc123?w=1920'),
  'unsplash:abc123',
);
assert.ok(
  commonsFileFragment(
    'https://upload.wikimedia.org/wikipedia/commons/a/ab/Rocher.jpg',
    'https://commons.wikimedia.org/wiki/File:Rocher.jpg',
  ),
);
assert.match(
  thumbUrl('https://images.unsplash.com/photo-abc123?w=1920'),
  /w=640/,
);

const {
  cacheId,
  candidateUrls,
  commonsFileTitle,
  findCached,
} = require('../scripts/photo-lab-cache.js');
assert.equal(
  cacheId('https://images.unsplash.com/photo-abc123?w=1920'),
  cacheId('https://images.unsplash.com/photo-abc123?w=400'),
  'cacheId ignore les params Unsplash',
);
const commons = 'https://upload.wikimedia.org/wikipedia/commons/b/b9/Wanderer_above_the_sea_of_fog.jpg';
assert.equal(
  commonsFileTitle(
    'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/David_-_The_Death_of_Socrates.jpg/1920px-David_-_The_Death_of_Socrates.jpg',
  ),
  'David_-_The_Death_of_Socrates.jpg',
);
assert.ok(
  candidateUrls(commons).some((u) => /Special:FilePath/.test(u)),
  'cache : Special:FilePath pour contourner un hash Commons faux',
);
assert.equal(findCached('/tmp/does-not-exist-photo-lab', 'nope'), null);

const root = mkdtempSync(join(tmpdir(), 'photo-lab-'));
function bank(rel, photos) {
  const file = join(root, rel);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify({ version: 1, photos }, null, 2) + '\n',
  );
}
bank('data/quebec-backgrounds.json', [
  {
    id: 'aaaaaaaaaaaa',
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Lac_Test.jpg',
    link: 'https://commons.wikimedia.org/wiki/File:Lac_Test.jpg',
    title: 'Lac Test',
    credit: 'Alice',
    license: 'CC BY-SA 4.0',
    season: 'hiver',
    seasonSource: 'text',
    width: 2000,
    height: 1200,
  },
]);
bank('data/quebec-university-backgrounds.json', []);
bank('data/quebec-pomo-backgrounds.json', [
  {
    id: 'bbbbbbbbbbbb',
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Lac_Test.jpg',
    title: 'Lac Test',
    credit: 'Alice',
    season: 'hiver',
  },
]);
bank('data/quebec-nations-backgrounds.json', []);
bank('data/quebec-favorites-backgrounds.json', []);
writeFileSync(
  join(root, 'data/quebec-backgrounds-rejected.json'),
  JSON.stringify({ version: 1, entries: [] }, null, 2) + '\n',
);
mkdirSync(join(root, 'pomo/js'), { recursive: true });
mkdirSync(join(root, 'solitaire/js'), { recursive: true });
writeFileSync(
  join(root, 'pomo/js/backgrounds-data.js'),
  'const BACKGROUNDS = [\n  { url: "https://images.unsplash.com/photo-labtest1", credit: "Bob", title: "Stock Pomo" },\n];\n',
);
writeFileSync(
  join(root, 'solitaire/js/backgrounds-data.js'),
  'const BACKGROUNDS = [\n  { url: "https://images.unsplash.com/photo-labtest2", credit: "Carol", title: "Stock Solitaire" },\n];\n',
);

const lab = createPhotoLab({ root, sync: false });
const listed = lab.listPhotos();
assert.equal(listed.length, 3, 'QC dédupliquée + 2 stocks');
const lac = listed.find((p) => /Lac Test/.test(p.title));
assert.ok(lac);
assert.ok(
  lac.banks.includes('mat') || lac.banks.includes('masthead'),
  'présent au mât',
);
assert.ok(lac.banks.includes('pomo'), 'présent au pomo');
assert.ok(lac.surfaces.includes('masthead') && lac.surfaces.includes('pomo'));

lab.setSeason(lac.url, { season: 'ete' });
const afterSeason = lab.findByUrl(lac.url);
assert.equal(afterSeason.season, 'ete');
assert.equal(afterSeason.seasonSource, 'manual');

lab.setCredit(lac.url, { credit: 'Alice Tremblay', place: 'Tadoussac' });
const afterCredit = lab.findByUrl(lac.url);
assert.equal(afterCredit.credit, 'Alice Tremblay');
assert.equal(afterCredit.place, 'Tadoussac');

lab.setFocalY(lac.url, 0.22);
assert.equal(lab.findByUrl(lac.url).focalY, 0.22);

lab.saveAll(lac.url, {
  credit: 'Alice Tremblay',
  place: 'Tadoussac',
  season: 'ete',
  focalY: 0.31,
  surfaces: ['masthead', 'pomo'],
});
assert.equal(
  JSON.parse(readFileSync(join(root, 'data/quebec-favorites-backgrounds.json'), 'utf8')).photos.length,
  0,
  'Enregistrer ne clone pas en favorites si la photo est déjà en mât/pomo',
);

lab.saveAll(lac.url, {
  credit: 'Alice Tremblay',
  place: 'Tadoussac',
  season: 'ete',
  focalY: 0.31,
  surfaces: ['pomo', 'solitaire'],
});
const afterSave = lab.findByUrl(lac.url);
assert.deepEqual(afterSave.surfaces.slice().sort(), ['pomo', 'solitaire']);
assert.equal(afterSave.focalY, 0.31);
const unifiedAfter = JSON.parse(
  readFileSync(join(root, 'data/photo-bank.json'), 'utf8'),
);
const uniPhoto = (unifiedAfter.photos || []).find((p) => p.url === lac.url);
assert.ok(uniPhoto, 'banque unique contient la photo');
assert.equal(uniPhoto.focalY, 0.31, 'focalY enregistré dans la banque unique');
assert.ok(uniPhoto.tags.includes('pomo') && uniPhoto.tags.includes('solitaire'));
assert.ok(!uniPhoto.tags.includes('mat'), 'décoche mât → plus de tag mat');
assert.equal(afterSave.credit, 'Alice Tremblay');
assert.equal(afterSave.place, 'Tadoussac');
assert.equal(afterSave.season, 'ete');
const savedPayload = lab.saveAll(lac.url, {
  credit: 'Alice Tremblay',
  place: 'Tadoussac',
  season: 'hiver',
  focalY: 0.44,
  tags: ['pomo', 'solitaire'],
});
assert.ok(savedPayload.photo, 'Enregistrer renvoie la fiche');
assert.equal(savedPayload.photo.season, 'hiver', 'saison renvoyée après save');
assert.equal(savedPayload.photo.focalY, 0.44);
assert.deepEqual(savedPayload.photo.tags.slice().sort(), ['pomo', 'solitaire']);
assert.equal(lab.findByUrl(lac.url).season, 'hiver', 'saison encore là au rechargement');

const allYear = lab.saveAll(lac.url, {
  credit: 'Alice Tremblay',
  place: 'Tadoussac',
  clearSeason: true,
  tags: ['pomo', 'solitaire'],
});
assert.ok(!allYear.photo.season, 'toutes saisons : pas de season');
assert.equal(allYear.photo.seasonSource, 'manual', 'toutes saisons : manuel, pas de re-tag bot');
const uniAll = JSON.parse(readFileSync(join(root, 'data/photo-bank.json'), 'utf8'));
const uniAllPhoto = (uniAll.photos || []).find((p) => p.url === lac.url);
assert.ok(uniAllPhoto, 'banque unique après clearSeason');
assert.ok(!uniAllPhoto.season, 'banque unique : saison vidée');
assert.equal(uniAllPhoto.seasonSource, 'manual');
const { mergeRecord } = require('../scripts/photo-bank-lib.js');
const protectedAll = mergeRecord(uniAllPhoto, { season: 'ete', seasonSource: 'text' });
assert.ok(!protectedAll.season, 'moisson ne recolle pas une saison sur « toutes saisons »');

lab.pinPhoto(lac.url, { surfaces: ['masthead', 'solitaire'], focalY: 0.22 });
const fav = JSON.parse(readFileSync(join(root, 'data/quebec-favorites-backgrounds.json'), 'utf8'));
assert.equal(fav.photos.length, 1);
assert.equal(fav.photos[0].permanent, true);
assert.equal(fav.photos[0].focalY, 0.22);
assert.deepEqual(fav.photos[0].surfaces, ['masthead', 'solitaire']);

lab.rejectPhoto(lac.url, 'test');
assert.equal(lab.findByUrl(lac.url), undefined);
const sidecar = JSON.parse(readFileSync(join(root, 'data/quebec-backgrounds-rejected.json'), 'utf8'));
assert.ok(sidecar.entries.length >= 1);
assert.ok(sidecar.entries[0].fragments.some((f) => /Lac_Test/i.test(f)));
const mast = JSON.parse(readFileSync(join(root, 'data/quebec-backgrounds.json'), 'utf8'));
assert.equal(mast.photos.length, 0);

const undone = lab.undo();
assert.equal(undone.ok, true);
assert.ok(lab.findByUrl(lac.url), 'undo remet la photo');

const stock = lab.listPhotos().find((p) => p.title === 'Stock Solitaire');
lab.rejectPhoto(stock.url);
assert.equal(
  lab.listPhotos().some((p) => p.title === 'Stock Solitaire'),
  false,
);
assert.match(
  readFileSync(join(root, 'solitaire/js/backgrounds-data.js'), 'utf8'),
  /BACKGROUNDS/,
);
assert.ok(!existsSync(join(root, 'nope')));

const {
  retainUnifiedPhoto,
  photoToUnifiedJs,
} = require('../scripts/photo-bank-lib.js');
const harvestEte = photoToUnifiedJs({
  url: 'https://upload.wikimedia.org/wikipedia/commons/2/29/Beaver_dam_in_Gatineau_Park_Jan_14.jpg',
  title: 'Beaver dam in Gatineau Park Jan 14',
  season: 'ete',
  season6: 'aujaq',
  seasonSource: 'sessionId-fallback',
  seasonConfidence: 0.3,
  tags: ['mat', 'nations'],
});
assert.doesNotMatch(
  harvestEte,
  /season:/,
  'PHOTO_BANK n’exporte pas un été hérité de la session de moisson',
);
assert.match(
  photoToUnifiedJs({
    url: 'https://example.test/neige.jpg',
    title: 'Campus sous la neige',
    season: 'hiver',
    seasonSource: 'manual',
    seasonConfidence: 1,
    tags: ['mat'],
  }),
  /season: "hiver"/,
  'PHOTO_BANK exporte un hiver revu à la main',
);
const casaultKept = retainUnifiedPhoto({
  url: 'https://upload.wikimedia.org/wikipedia/commons/d/de/Pavillon_Louis-Jacques-Casault_3.jpg',
  title: 'Pavillon Louis-Jacques-Casault 3',
  campus: true,
  tags: ['mat', 'campus'],
});
assert.ok(casaultKept, 'Casault campus reste dans la banque unique');
assert.ok(casaultKept.tags.includes('mat'), 'Casault : tag mat (exception église)');
assert.ok(casaultKept.tags.includes('campus'), 'Casault : tag campus');
assert.equal(
  retainUnifiedPhoto({
    url: 'https://upload.wikimedia.org/wikipedia/commons/6/6d/Pavillon_Adrien-Pouliot_07.jpg',
    title: 'Pavillon Adrien-Pouliot 07',
    campus: true,
    tags: ['mat', 'campus'],
  }),
  null,
  'Pouliot 07 rejeté au labo : hors banque unique',
);
const portrait = retainUnifiedPhoto({
  url: 'https://upload.wikimedia.org/wikipedia/commons/x/x1/Teluq_headquarters_in_Quebec_City.jpg',
  title: 'Teluq headquarters in Quebec City',
  campus: true,
  tags: ['mat', 'campus'],
  width: 1619,
  height: 2483,
});
assert.ok(portrait, 'portrait campus reste pour les affiches');
assert.ok(!portrait.tags.includes('mat'), 'portrait campus : hors mât');
assert.ok(portrait.tags.includes('campus'), 'portrait campus : tag campus');

console.log('OK photo-lab (crop + mutations + undo)');

/**
 * Repli photo campus — toutes les sources du fil.
 * Run: node tests/campus-article-fallback.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = dirname(fileURLToPath(import.meta.url)).replace(/\/tests$/, '');
const {
  pickCampusPhoto,
  hasCampusBank,
  resolveBankKey,
  bankEntriesFor,
} = require('../scripts/campus-photo-bank.js');
const {
  imageHostIsFragile,
  sourceNeedsCampusBackup,
  pickCampusFallback,
  campusNeedlesFor,
  filterUniversityPhotos,
} = require('../scripts/campus-fallback-lib.js');

const newsSources = JSON.parse(readFileSync(join(root, 'news-sources.json'), 'utf8'));
const sources = [...(newsSources.active || []), ...(newsSources.candidates || [])];
const uniJs = readFileSync(join(root, 'quebec-university-backgrounds-data.js'), 'utf8');
const uniCtx = {};
vm.runInNewContext(`${uniJs}\nthis.photos = QUEBEC_UNIVERSITY_BACKGROUNDS;`, uniCtx);
const universityPhotos = uniCtx.photos;
assert.ok(universityPhotos.length > 20, 'banque universities chargée');

assert.equal(
  imageHostIsFragile('https://www.exemplaire.com.ulaval.ca/wp-content/uploads/2026/05/SKIBIDI-MINIA-2.png'),
  true,
  'L’Exemplaire est un hôte fragile',
);
assert.equal(
  imageHostIsFragile('https://lecollectif.ca/wp-content/uploads/2026/05/foo.jpg'),
  false,
  'Le Collectif n’est pas marqué fragile',
);

assert.equal(
  sourceNeedsCampusBackup(
    { image: 'https://www.exemplaire.com.ulaval.ca/x.png', institution: 'Université Laval' },
    { hasUsableSourceImage: true },
  ),
  true,
  'URL Exemplaire sans miroir → backup campus',
);
assert.equal(
  sourceNeedsCampusBackup(
    {
      image: 'https://www.exemplaire.com.ulaval.ca/x.png',
      imageLocal: 'assets/news-images/abc.jpg',
      institution: 'Université Laval',
    },
    { hasUsableSourceImage: true },
  ),
  false,
  'Exemplaire mirroiré : pas de backup forcé',
);
assert.equal(
  sourceNeedsCampusBackup(
    { image: '', institution: 'McGill University' },
    { hasUsableSourceImage: false },
  ),
  true,
  'pas de photo source → campus',
);
assert.equal(
  sourceNeedsCampusBackup(
    { image: 'https://quartierlibre.ca/x.jpg', stockImage: 'https://upload.wikimedia.org/x.jpg' },
    { hasUsableSourceImage: true },
  ),
  false,
  'stock déjà là : pas de double backup',
);

const laval = pickCampusFallback(
  { institution: 'Université Laval', link: 'https://www.exemplaire.com.ulaval.ca/skibidi/' },
  { universityPhotos },
);
assert.ok(laval?.url, 'Laval → photo campus');
assert.match(laval.url, /wikimedia|upload/i, 'Laval : Commons');
assert.match(
  `${laval.title} ${laval.url} ${laval.link}`.toLowerCase(),
  /laval/,
  'Laval : la photo parle bien de Laval',
);

const mcgill = pickCampusFallback(
  { institution: 'Université McGill', link: 'https://le-delit.ca/x' },
  { universityPhotos },
);
assert.ok(mcgill?.url, 'Université McGill (Le Délit) → campus');
assert.match(`${mcgill.title} ${mcgill.url}`.toLowerCase(), /mcgill/, 'McGill');

const poly = pickCampusFallback(
  { institution: 'Polytechnique Montréal', link: 'https://polyscope.qc.ca/x' },
  { universityPhotos },
);
assert.ok(poly?.url, 'Polytechnique → campus');
assert.match(
  `${poly.title} ${poly.place || ''} ${poly.url}`.toLowerCase() + campusNeedlesFor('Polytechnique Montréal').join(' '),
  /polytechnique/,
  'Polytechnique : aiguille polytechnique',
);

const dawson = pickCampusFallback(
  { institution: 'Dawson College', link: 'https://theplantnews.com/x' },
  { universityPhotos },
);
assert.ok(dawson?.url, 'Dawson → cégep extras');
assert.match(dawson.url, /Dawson/i, 'Dawson : photo Dawson');

const pige = pickCampusFallback(
  { institution: 'Cégep de Jonquière (ATM – journalisme)', link: 'https://lapige.ca/x' },
  { universityPhotos },
);
assert.ok(pige?.url, 'La Pige / Jonquière → campus');
assert.match(`${pige.title} ${pige.url}`, /Jonqui/i, 'Jonquière');

const skipped = [];
const covered = [];
for (const src of sources) {
  const inst = src.institution || '';
  if (!inst) continue;
  const bot = pickCampusPhoto({ institution: inst, link: src.site || src.url || inst });
  const client = pickCampusFallback(
    { institution: inst, link: src.site || src.url || inst },
    { universityPhotos },
  );
  const uniHits = filterUniversityPhotos(universityPhotos, inst);
  const ok = Boolean(bot?.stockImage || client?.url || uniHits.length);
  if (ok) covered.push(`${src.name} (${inst})`);
  else skipped.push(`${src.name} (${inst})`);
}

assert.ok(
  covered.length >= 12,
  `au moins 12 sources avec campus (got ${covered.length}: ${covered.join(', ')})`,
);

const activeNow = [
  'Université Laval',
  'McGill University',
  'Université McGill',
  'Concordia University',
  'Université de Montréal',
  'UQAM',
  'Université de Sherbrooke',
  "Bishop's University",
  'Université du Québec à Trois-Rivières',
  'Polytechnique Montréal',
  'Dawson College',
  'Cégep du Vieux Montréal',
  'Cégep de Jonquière (ATM – journalisme)',
];
for (const inst of activeNow) {
  const client = pickCampusFallback({ institution: inst, link: `https://le-radar.ca/#${inst}` }, { universityPhotos });
  const bot = pickCampusPhoto({ institution: inst, link: `https://le-radar.ca/#${inst}` });
  assert.ok(
    client?.url || bot?.stockImage || hasCampusBank(inst),
    `source active sans campus : ${inst} (key=${resolveBankKey(inst)}, entries=${bankEntriesFor(inst).length})`,
  );
}

const radarNews = readFileSync(join(root, 'radar-news.js'), 'utf8');
assert.match(radarNews, /ensureCampusStock/, 'fil : ensureCampusStock');
assert.match(radarNews, /pickClientCampusPhoto/, 'fil : pickClientCampusPhoto');
assert.match(radarNews, /referrerPolicy = 'no-referrer'/, 'fil : no-referrer anti-hotlink');
assert.match(radarNews, /fragileRemote/, 'fil : timeout court sur hôte fragile');
assert.match(radarNews, /isFragileUnmirroredPhoto/, 'fil : hôte fragile sans miroir → campus d’abord');
assert.match(radarNews, /alternateDisplayImage\(item, kind, role, src\)/, 'fil : alternate reçoit l’URL ratée');

const ensure = readFileSync(join(root, 'scripts/ensure-lead-images.js'), 'utf8');
assert.match(ensure, /itemNeedsCampusBackup/, 'bot : backup campus même si URL source');
assert.match(ensure, /imageHostIsFragile/, 'bot : hôtes fragiles');

if (skipped.length) {
  console.log('sources sans campus (hors fil actif, OK) :', skipped.join('; '));
}
console.log(`OK campus-article-fallback (${covered.length} sources couvertes)`);

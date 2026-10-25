/**
 * Repli campus : chaque média → photos du campus de SON établissement.
 * Pas de carte, peinture, vue de ville, autre université ni campus satellite.
 * Run: node tests/campus-source-mapping.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = dirname(fileURLToPath(import.meta.url)).replace(/\/tests$/, '');
const { bankEntriesFor } = require('../scripts/campus-photo-bank.js');
const {
  filterUniversityPhotos,
  isRejectedCampusPhoto,
  normalizeCampusKey,
} = require('../scripts/campus-fallback-lib.js');

const ctx = {};
vm.runInNewContext(
  `${readFileSync(join(root, 'quebec-university-backgrounds-data.js'), 'utf8')}\nthis.p = QUEBEC_UNIVERSITY_BACKGROUNDS;`,
  ctx,
);
const uniPhotos = ctx.p;
// Métadonnées Commons (lieu, description) de la source de vérité JSON.
const META = new Map(
  JSON.parse(readFileSync(join(root, 'data/quebec-university-backgrounds.json'), 'utf8'))
    .photos.map((p) => [p.url, p]),
);

// Établissement → marqueurs attendus (au moins un) et interdits.
const EXPECT = [
  { re: /universite de montreal/, ok: ['universite de montreal', 'udem', 'roger gaudry'], no: ['laval'] },
  { re: /uqam/, ok: ['uqam', 'universite du quebec a montreal', 'judith jasmin'], no: [] },
  { re: /mcgill/, ok: ['mcgill'], no: ['sherbrooke street', 'campusmap'] },
  { re: /concordia/, ok: ['concordia', 'henry f hall', 'loyola', 'mackay street'], no: ['polytechnique', 'lassonde'] },
  { re: /trois rivieres/, ok: ['uqtr', 'trois rivieres'], no: ['drummondville'] },
  { re: /universite laval/, ok: ['universite laval', 'ulaval', 'laval university'], no: ['udem', 'bus stop', 'quebec canada 02'] },
  { re: /universite de sherbrooke/, ok: ['universite de sherbrooke', 'udes', 'campus longueuil', 'campus de longueuil'], no: ['centre ville'] },
  { re: /vieux montreal/, ok: ['vieux montreal'], no: [] },
  { re: /jonquiere/, ok: ['jonquiere'], no: ['aerienne', 'aerial'] },
  { re: /polytechnique/, ok: ['polytechnique'], no: [] },
  { re: /bishop/, ok: ['bishop s university', 'bishops university'], no: ['chichester', 'otter'] },
  { re: /dawson/, ok: ['dawson'], no: [] },
  { re: /cegep de chicoutimi/, ok: ['cegep de chicoutimi', 'cegep chicoutimi', 'seminaire de chicoutimi'], no: ['uqac'] },
  { re: /lionel groulx/, ok: ['lionel groulx'], no: [] },
  { re: /maisonneuve/, ok: ['maisonneuve'], no: [] },
  { re: /universite du quebec a chicoutimi/, ok: ['uqac', 'universite du quebec a chicoutimi'], no: [] },
  { re: /universite du quebec a rimouski/, ok: ['uqar', 'universite du quebec a rimouski', 'universite du quebec 300 allee des ursulines'], no: ['levis'] },
  { re: /outaouais/, ok: ['outaouais', 'felix leclerc'], no: ['uqo', 'universite du quebec en outaouais'] },
  { re: /john abbott/, ok: ['john abbott'], no: ['mcgill'] },
  { re: /cegep de rimouski/, ok: ['cegep de rimouski', 'cegep rimouski', 'cegeprimouski'], no: ['uqar'] },
];

const KIND_RE = /\b(map|carte|logo|painting|peinture|skyline|cityscape|centre ville|vue aerienne de saguenay)\b|campusmap|\.svg\b/;

function hay(p) {
  const m = META.get(p.url) || {};
  const raw = [p.title, p.url, p.link, p.sourceUrl, p.place, m.place, m.description]
    .filter(Boolean)
    .map((v) => { try { return decodeURIComponent(String(v)); } catch { return String(v); } })
    .join(' ')
    .replace(/_/g, ' ');
  return normalizeCampusKey(raw);
}

const news = JSON.parse(readFileSync(join(root, 'news-sources.json'), 'utf8'));
const sources = [...(news.active || []), ...(news.candidates || [])].filter((s) => s.institution);
assert.ok(sources.length >= 20, 'sources chargées');

for (const s of sources) {
  const inst = normalizeCampusKey(s.institution);
  const rule = EXPECT.find((r) => r.re.test(inst));
  assert.ok(rule, `${s.name} (${s.institution}) : établissement sans règle campus`);
  const server = bankEntriesFor(s.institution);
  const client = filterUniversityPhotos(uniPhotos, s.institution);
  const all = [...server, ...client];
  const unique = new Set(all.map((p) => p.url));
  assert.ok(unique.size >= 2, `${s.name} : au moins 2 photos campus (${unique.size})`);
  for (const p of all) {
    const h = hay(p);
    const label = `${s.name} → ${p.title || p.url}`;
    assert.equal(isRejectedCampusPhoto(p), false, `${label} : photo rejetée par l’audit`);
    assert.ok(!KIND_RE.test(h), `${label} : carte / peinture / vue de ville`);
    assert.ok(rule.ok.some((t) => h.includes(t)), `${label} : ne montre pas ${s.institution}`);
    for (const t of rule.no) assert.ok(!h.includes(t), `${label} : marqueur interdit « ${t} »`);
    if (String(p.url).startsWith('/')) {
      assert.ok(existsSync(join(root, p.url)), `${label} : fichier local absent`);
    } else {
      assert.match(p.url, /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//, `${label} : URL Commons`);
    }
    if (server.includes(p) && !p._fromWallpaperBank) {
      assert.ok(p.creator && p.license, `${label} : auteur et licence requis`);
    }
  }
}

// Fichiers morts ou hors campus repérés le 2026-10-23 : jamais réintroduits.
for (const bad of [
  'https://upload.wikimedia.org/wikipedia/commons/d/de/Universit%C3%A9_Laval%2C_Quebec%2C_Canada_02.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/x/xx/McGillCampusMap.png',
  'https://upload.wikimedia.org/wikipedia/commons/x/xx/Bishop_Otter_Campus,_University_of_Chichester.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/x/xx/Campus_de_l%27UQTR_%C3%A0_Drummondville.jpg',
]) {
  assert.equal(isRejectedCampusPhoto({ url: bad }), true, `rejet attendu : ${bad}`);
}
// Une vraie photo campus passe.
assert.equal(
  isRejectedCampusPhoto({ url: 'https://upload.wikimedia.org/wikipedia/commons/d/de/Pavillon_Louis-Jacques-Casault_3.jpg' }),
  false,
);

console.log('campus-source-mapping: OK');

/**
 * Sources web extra (géoloc / Wikidata) — hors réseau.
 * Run: node tests/photo-web-sources.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  CAMPUS_GEO,
  NATION_GEO,
  CAMPUS_CATEGORIES,
  commonsGeoUrl,
  wikidataCampusSparql,
} = require('../scripts/photo-web-sources.js');

assert(CAMPUS_GEO.length >= 8, 'au moins 8 campus géolocalisés');
assert(NATION_GEO.some((g) => g.nationId === 'inuit'), 'PNI : Inuit géolocalisés');
assert(CAMPUS_CATEGORIES.includes('McGill University'), 'catégorie McGill');
const url = commonsGeoUrl(45.5048, -73.5772, 1800, 12);
assert(url.includes('generator=geosearch'), 'URL Commons geosearch');
assert(url.includes('ggscoord=45.5048'), 'coord McGill');
assert(wikidataCampusSparql().includes('wd:Q201492'), 'Wikidata McGill P18');
console.log('OK photo-web-sources');

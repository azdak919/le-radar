#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { mergeHistoricalCatalog, serializeHistoricalCatalog, partialPublicSample, ageBand, stableId } = require('../scripts/historical-catalog-lib.js');

const item = {
  source: 'Journal témoin', institution: 'Université témoin', region: 'Montréal', type: 'universite', lang: 'fr',
  title: 'Un article historique dont le titre est assez précis', author: 'Personne Exemple',
  date: '2024-04-05T14:30:00.000Z', link: 'https://example.test/article?utm_source=rss',
  excerpt: 'Un extrait suffisamment long pour démontrer que le catalogue conserve une description factuelle, sans enregistrer le corps complet de la publication externe.',
  image: 'https://example.test/image.jpg',
};
const initial = mergeHistoricalCatalog({ records: [] }, [item], '2026-07-29T10:00:00.000Z', { importedAt: '2026-07-29T10:00:00.000Z' });
assert.equal(initial.added, 1);
assert.equal(initial.catalog.records[0].firstDiscoveredAt, null, 'un bootstrap ne doit pas inventer une découverte passée');
assert.equal(initial.catalog.records[0].image.status, 'not-retained-unknown-license');
assert.equal(initial.catalog.records[0].originalUrl, 'https://example.test/article');
assert.equal(initial.catalog.records[0].id, stableId(item.source, item.link));
assert.ok(!Object.hasOwn(initial.catalog.records[0], 'body'), 'le corps externe ne doit jamais entrer au catalogue');

const second = mergeHistoricalCatalog(initial.catalog, [{ ...item, excerpt: `${item.excerpt} Mise à jour.` }], '2026-07-30T10:00:00.000Z', { firstDiscoveredAt: '2026-07-30T10:00:00.000Z' });
assert.equal(second.catalog.records.length, 1, 'la même URL normalisée ne crée pas de doublon');
assert.equal(second.catalog.records[0].importedAt, '2026-07-29T10:00:00.000Z');

const verified = structuredClone(second.catalog.records[0]);
verified.link = { status: 'available', checkedAt: '2026-07-30T10:00:00.000Z', statusCode: 200, resolvedUrl: verified.originalUrl };
const unknown = structuredClone(verified);
unknown.id = 'history-unknown';
unknown.source = 'Autre journal';
unknown.link.status = 'unknown';
const sample = partialPublicSample([verified, unknown], {
  mode: 'partial', partial: { maxRecords: 10, minimumExcerptCharacters: 90, verifiedWithinDays: 35 },
}, Date.parse('2026-07-31T10:00:00.000Z'));
assert.equal(sample.records.length, 1, 'un lien non vérifié est exclu du catalogue public');
assert.equal(sample.records[0].id, verified.id);

const conservation = structuredClone(verified);
conservation.id = 'history-conservation';
conservation.publishedAt = '2019-07-30T10:00:00.000Z';
const preserved = structuredClone(verified);
preserved.id = 'history-preserved';
preserved.publishedAt = '2014-07-30T10:00:00.000Z';
const ageConfig = { mode: 'partial', age: { indexableYears: 5, conservationYears: 10 }, partial: { maxRecords: 10, minimumExcerptCharacters: 90, verifiedWithinDays: 35 } };
const ageNow = Date.parse('2026-07-29T10:00:00.000Z');
assert.equal(ageBand(verified, ageConfig, ageNow), 'indexable');
assert.equal(ageBand(conservation, ageConfig, ageNow), 'conservation');
assert.equal(ageBand(preserved, ageConfig, ageNow), 'preserved');
const ageSample = partialPublicSample([verified, conservation, preserved], ageConfig, ageNow);
assert.equal(ageSample.records.length, 1, 'les articles de conservation ne rejoignent pas le sitemap public');
assert.equal(ageSample.conservation.length, 1, 'la tranche 5–10 ans reste consultable sans indexation automatique');
assert.equal(ageSample.reference.length, 1, 'les métadonnées plus anciennes restent accessibles dans les archives de référence');

const many = [];
for (let i = 0; i < 5; i += 1) {
  many.push({
    ...item,
    title: `${item.title} ${i}`,
    link: `https://example.test/article-${i}`,
    date: `2024-04-0${i + 1}T14:30:00.000Z`,
  });
}
const capped = mergeHistoricalCatalog({ records: [] }, many, '2026-07-29T10:00:00.000Z', {}, { maxRecords: 2 });
assert.equal(capped.catalog.records.length, 2, 'storage.maxRecords plafonne le catalogue interne');
assert.equal(capped.dropped, 3);
const serialized = serializeHistoricalCatalog(capped.catalog, { storage: { maxRecords: 2, maxFileBytes: 16777216 } });
assert.ok(serialized.text.endsWith('\n'));
assert.equal(JSON.parse(serialized.text).records.length, 2);

{
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const sitemap = readFileSync(join(root, 'sitemap-archives.xml'), 'utf8');
  const sitemapLocs = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  const htmlFiles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'index.html') htmlFiles.push(full);
    }
  };
  walk(join(root, 'archives'));
  const indexable = [];
  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    const robots = html.match(/name="robots" content="([^"]+)"/i)?.[1] || '';
    const canonical = html.match(/rel="canonical" href="([^"]+)"/i)?.[1] || '';
    const rel = file.slice(root.length + 1);
    const conservation = rel.startsWith('archives/conservation/') || rel.startsWith('archives/reference/');
    if (conservation) {
      assert.match(robots, /noindex/i, `${rel} : conservation/référence doit rester noindex`);
      assert.equal(sitemapLocs.has(canonical), false, `${rel} : page noindex absente du sitemap-archives`);
    }
    if (/\bnoindex\b/i.test(robots)) {
      assert.equal(sitemapLocs.has(canonical), false, `${rel} : noindex ne doit pas figurer au sitemap`);
    } else {
      assert.match(robots, /index/i, `${rel} : robots index,follow requis hors conservation`);
      assert.ok(canonical, `${rel} : canonical requis`);
      assert.equal(sitemapLocs.has(canonical), true, `${rel} : page indexable absente de sitemap-archives.xml`);
      indexable.push(canonical);
    }
  }
  assert.equal(sitemapLocs.size, indexable.length, 'sitemap-archives : uniquement les pages indexables');
}

console.log('✓ Catalogue historique : identité, rétention et sélection publique vérifiées.');

#!/usr/bin/env node
/**
 * Le fil doit garder toute la session (ou ≤ 45 j), pas seulement
 * les 10–20 derniers items encore présents dans le flux RSS.
 * Run: node tests/session-feed-archive.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const {
  mergeFetchedWithSessionArchive,
  itemLinkKey,
  retainablePriorArticles,
} = require(join(ROOT, 'scripts/source-retention-lib.js'));
const { recordFromItem, newsItemFromRecord } = require(join(ROOT, 'scripts/historical-catalog-lib.js'));

const ref = new Date(2026, 10, 16, 12); // 16 nov. 2026, session d’automne

const item = (title, date, link) => ({
  source: 'Le Délit',
  institution: 'McGill',
  region: 'Montréal',
  type: 'universite',
  lang: 'fr',
  title,
  date,
  link,
  excerpt: 'Extrait.',
  author: 'A. Auteur',
});

const rss = Array.from({ length: 20 }, (_, i) => item(
  `Frais ${i + 1}`,
  `2026-11-${String(16 - (i % 15)).padStart(2, '0')}T12:00:00.000Z`,
  `https://www.delitfrancais.com/frais-${i + 1}/?utm_source=rss`,
));

const earlierInSession = Array.from({ length: 15 }, (_, i) => item(
  `Septembre ${i + 1}`,
  `2026-09-${String(i + 2).padStart(2, '0')}T12:00:00.000Z`,
  `https://www.delitfrancais.com/septembre-${i + 1}/`,
));

const summer = [item(
  'Été trop ancien',
  '2026-07-01T12:00:00.000Z',
  'https://www.delitfrancais.com/ete/',
)];

const prior = [
  // Un des articles du flux, déjà en cache avec un utm différent
  item('Frais 1', '2026-11-16T12:00:00.000Z', 'https://www.delitfrancais.com/frais-1/'),
  ...earlierInSession,
  ...summer,
];

const merged = mergeFetchedWithSessionArchive(rss, prior, ref);
assert.equal(merged.items.length, 35, '20 du flux + 15 de septembre, pas un plafond à 20');
assert.equal(merged.retained, 15, 'seuls les 15 articles de session absents du flux sont repris');
assert.equal(
  merged.items.filter((it) => it._retainedFromCache).length,
  15,
  'les articles repris sont marqués comme cache',
);
assert.ok(
  merged.items.every((it) => it.title !== 'Été trop ancien'),
  'un article d’été est hors fenêtre en novembre',
);
assert.equal(
  merged.items.filter((it) => itemLinkKey(it).endsWith('/frais-1')).length,
  1,
  'le même article flux/cache n’est pas doublé malgré l’utm',
);

// Fenêtre de rentrée : le 5 sept., un article d’août (≤ 45 j) reste visible.
const sep5 = new Date(2026, 8, 5, 12);
const august = item('Fin d’été', '2026-08-01T12:00:00.000Z', 'https://www.delitfrancais.com/aout/');
const rentrée = mergeFetchedWithSessionArchive([], [august], sep5);
assert.equal(rentrée.items.length, 1, 'août reste visible au début de septembre');
assert.equal(rentrée.retained, 1);

// Catalogue historique : une fiche redevient un item du fil.
const record = recordFromItem(earlierInSession[0], '2026-09-03T12:00:00.000Z');
record.link = {
  status: 'redirected',
  checkedAt: '2026-10-01T13:54:07.704Z',
  statusCode: 200,
  resolvedUrl: earlierInSession[0].link,
};
const fromCatalog = newsItemFromRecord(record);
assert.ok(fromCatalog, 'fiche catalogue convertible');
assert.equal(fromCatalog.date, earlierInSession[0].date);
assert.equal(fromCatalog.link, 'https://www.delitfrancais.com/septembre-1');
assert.equal(fromCatalog.lang, 'fr');
assert.equal(typeof fromCatalog.link, 'string');
const withCatalog = mergeFetchedWithSessionArchive(rss, [fromCatalog], ref);
assert.equal(withCatalog.items.length, 21);
assert.equal(withCatalog.retained, 1);

assert.equal(
  retainablePriorArticles(prior, ref).length,
  16,
  '15 de septembre + le doublon de novembre, sans l’été',
);

const fetchNews = readFileSync(join(ROOT, 'scripts/fetch-news.js'), 'utf8');
assert.match(fetchNews, /mergeFetchedWithSessionArchive/);
assert.match(fetchNews, /plafond d’un seul flux RSS/);
assert.ok(fetchNews.includes("authorHints.ignoreRssAuthor && !it._retainedFromCache"));
assert.doesNotMatch(
  fetchNews,
  /MAX_PER_SOURCE = 20; {2}\/\/ archive par journal/,
  'le commentaire ne doit plus laisser croire que 20 est l’archive de session',
);

console.log('OK session-feed-archive');

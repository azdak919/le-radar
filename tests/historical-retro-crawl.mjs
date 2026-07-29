#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  wordpressApiBase, wordpressComApiBase, wordpressPostToItem, wordpressComPostToItem, sourceKey, selectRetroSources, progressAfterPage, progressAfterFailure,
} = require('../scripts/historical-retro-crawl-lib.js');

const source = { name: 'Journal témoin', url: 'https://example.test/feed/', institution: 'Université témoin', region: 'Montréal', type: 'universite', lang: 'fr' };
assert.equal(wordpressApiBase(source), 'https://example.test/wp-json/wp/v2');
assert.equal(wordpressComApiBase({ ...source, url: 'https://exilecvm.wordpress.com/feed/' }), 'https://public-api.wordpress.com/rest/v1.1/sites/exilecvm.wordpress.com/posts/');
assert.equal(wordpressComApiBase({ ...source, historyWordpressComSite: 'exilecvm.wordpress.com' }), 'https://public-api.wordpress.com/rest/v1.1/sites/exilecvm.wordpress.com/posts/');
const item = wordpressPostToItem({
  title: { rendered: 'Titre &amp; important' }, link: 'https://example.test/article/', date_gmt: '2020-01-02T03:04:05',
  excerpt: { rendered: '<p>Une brève description strictement limitée.</p>' },
  _embedded: { author: [{ name: 'Autrice Exemple' }] }, content: { rendered: '<p>Ne doit jamais être utilisé.</p>' },
}, source);
assert.equal(item.title, 'Titre & important');
assert.equal(item.author, 'Autrice Exemple');
assert.equal(item.excerpt, 'Une brève description strictement limitée.');
assert.equal(item.image, '');
assert.ok(!Object.hasOwn(item, 'content'), 'le modèle de rétro-crawl ne transmet jamais le corps complet');
const wordpressComItem = wordpressComPostToItem({ title: 'Titre WordPress.com', URL: 'https://exilecvm.wordpress.com/2020/01/02/test/', date: '2020-01-02T03:04:05+00:00', excerpt: '<p>Extrait WordPress.com.</p>', author: { name: 'Autrice WP.com' }, content: '<p>Ne doit jamais être utilisé.</p>' }, source);
assert.equal(wordpressComItem.author, 'Autrice WP.com');
assert.equal(wordpressComItem.excerpt, 'Extrait WordPress.com.');
assert.ok(!Object.hasOwn(wordpressComItem, 'content'), 'le repli WordPress.com ne transmet jamais le corps complet');

const key = sourceKey(source);
const sources = [source, { ...source, name: 'Source terminée', url: 'https://finished.test/feed/' }];
const state = { sources: { [sourceKey(sources[1])]: { completedAt: '2026-07-29T00:00:00.000Z' } } };
assert.deepEqual(selectRetroSources(sources, state, { limit: 2 }).map((entry) => entry.name), ['Journal témoin']);
const continued = progressAfterPage({}, { page: 1, totalPages: 3, received: 50, at: '2026-07-29T10:00:00.000Z' });
assert.equal(continued.nextPage, 2);
assert.equal(continued.completedAt, undefined);
const completed = progressAfterPage(continued, { page: 3, totalPages: 3, received: 4, at: '2026-07-29T10:05:00.000Z' });
assert.equal(completed.nextPage, null);
assert.ok(completed.completedAt);
const failed = progressAfterFailure({}, { at: '2026-07-29T10:00:00.000Z', reason: 'wordpress_http_404', unsupported: true });
assert.equal(failed.strategy, 'unsupported');
assert.ok(failed.retryAt);
assert.equal(key, 'journal-temoin');

console.log('✓ Rétro-crawl historique : projection minimale, reprise et erreurs vérifiés.');

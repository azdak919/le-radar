#!/usr/bin/env node
/**
 * Fil public par pages (scripts/news-pages.js) : news-latest.json léger au
 * premier rendu, lots news-page-N.json ensuite ; news.json reste complet.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildNewsPages, INTERNAL_FIELDS, FIRST_PAGE_SIZE, PAGE_SIZE } = require('../scripts/news-pages.js');

const D = (k) => new Date(Date.UTC(2026, 10, 17) - k * 3600e3).toISOString();
const items = Array.from({ length: 1012 }, (_, k) => ({
  title: `A${k}`, link: `https://x.ca/${k}/`, date: D(k), source: `S${k % 40}`, institution: `I${k % 40}`, type: 'journal',
  author: 'Une Personne, Autre Personne', authorCheckedAt: D(1), imageHealthKey: 'x|', leadImageCheckedKey: 'x|', _retainedFromCache: true,
}));
const news = { updated: D(0), count: items.length, items: items.slice().reverse() };
const { latest, pages } = buildNewsPages(news);

// 1re page légère, total complet, schéma compatible (count + items).
assert.equal(latest.items.length, FIRST_PAGE_SIZE);
assert.equal(latest.count, 1012);
assert.equal(latest.total, 1012);
assert.equal(latest.updated, news.updated);
assert.equal(latest.items[0].title, 'A0', 'les plus récents d\'abord');
// Lots de 30, dans l'ordre, sans perte ni doublon.
assert.equal(pages.length, Math.ceil((1012 - FIRST_PAGE_SIZE) / PAGE_SIZE));
assert.deepEqual(latest.pages, pages.map((p) => p.file));
assert.equal(pages[0].file, 'news-page-2.json');
assert.ok(pages.every((p) => p.data.items.length <= PAGE_SIZE));
const all = [...latest.items, ...pages.flatMap((p) => p.data.items)];
assert.equal(all.length, 1012);
assert.equal(new Set(all.map((i) => i.link)).size, 1012);
// Tous les auteurs gardés ; marques internes retirées du public seulement.
assert.ok(all.every((i) => i.author === 'Une Personne, Autre Personne'));
for (const f of INTERNAL_FIELDS) assert.ok(all.every((i) => !(f in i)), f);
assert.ok('authorCheckedAt' in news.items[0], 'news.json canonique intact');
// Toutes les sources pour les filtres, sans charger les pages.
assert.equal(latest.sourceList.length, 40);

// Client : 1re page puis lots, repli news.json, accessibilité.
const js = readFileSync(new URL('../radar-news.js', import.meta.url), 'utf8');
assert.match(js, /fetch\(appAsset\('news-latest\.json'\)/);
assert.match(js, /fetch\(appAsset\('news\.json'\)/, 'repli fil complet');
assert.match(js, /aria-live', 'polite'/);
assert.match(js, /more\.type = 'button'/);
assert.match(js, /IntersectionObserver/);
assert.match(js, /target\?\.focus\(/);
assert.match(js, /news-tail-more__spin notranslate/);
assert.match(js, /spin\.setAttribute\('aria-hidden', 'true'\)/);
assert.match(js, /spin\.setAttribute\('translate', 'no'\)/);
assert.match(js, /news-tail-more__label/);
assert.match(js, /\.news-tail-toggle:not\(\.news-tail-more\)/);
assert.doesNotMatch(js, /more\.textContent = adaptRadarUiText/, 'libellé sur le span, pas le bouton');
const chrome = readFileSync(new URL('../style-chrome.css', import.meta.url), 'utf8');
assert.match(chrome, /\.news-tail-more__spin/);
assert.match(chrome, /translate-progress-spin 0\.95s linear infinite/);
assert.match(chrome, /forced-colors:\s*active/);
assert.match(chrome, /news-tail-more\[aria-busy="true"\] \.news-tail-more__spin[\s\S]{0,400}prefers-reduced-motion:\s*reduce/);
// Publication : étape du bot, régénération sur conflit, contrôle Pages.
const wf = readFileSync(new URL('../.github/workflows/update-news.yml', import.meta.url), 'utf8');
assert.match(wf, /node scripts\/news-pages\.js --update/);
assert.match(wf, /git add -A -- news-latest\.json 'news-page-\*\.json'/);
const push = readFileSync(new URL('../scripts/bot-push.sh', import.meta.url), 'utf8');
assert.match(push, /news-latest\\\.json\|news-page-\[0-9\]\+\\\.json/);
console.log('news-pages: OK');

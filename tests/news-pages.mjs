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
assert.doesNotMatch(js, /newsTailMoreObserver/, 'plus d’IntersectionObserver sur le fil');
assert.match(js, /target\?\.focus\(/);
assert.doesNotMatch(js, /news-tail-more__spin/);
assert.match(js, /RadarNewsLoad/);
assert.match(js, /translate-progress--news/);
assert.match(js, /Chargement des articles…/);
assert.match(js, /Loading articles…/);
assert.match(js, /aria-disabled', 'true'/);
assert.match(js, /news-tail-more__label/);
assert.match(js, /\.news-tail-toggle:not\(\.news-tail-more\)/);
assert.doesNotMatch(js, /more\.textContent = adaptRadarUiText/, 'libellé sur le span, pas le bouton');
const chrome = readFileSync(new URL('../style-chrome.css', import.meta.url), 'utf8');
assert.doesNotMatch(chrome, /\.news-tail-more__spin/);
assert.match(chrome, /news-tail-more\[aria-busy="true"\]/);
assert.match(chrome, /pointer-events:\s*none/);
const feedCss = readFileSync(new URL('../style-feed.css', import.meta.url), 'utf8');
assert.match(feedCss, /content-visibility:\s*auto/);
// Publication : étape du bot, régénération sur conflit, contrôle Pages.
const wf = readFileSync(new URL('../.github/workflows/update-news.yml', import.meta.url), 'utf8');
assert.match(wf, /node scripts\/news-pages\.js --update/);
assert.match(wf, /git add -A -- news-latest\.json 'news-page-\*\.json'/);
const push = readFileSync(new URL('../scripts/bot-push.sh', import.meta.url), 'utf8');
assert.match(push, /news-latest\\\.json\|news-page-\[0-9\]\+\\\.json/);
// Compteur en tête du fil : total du catalogue, pas le premier lot (60).
assert.match(js, /function formatNewsCountLabel\(/);
assert.match(js, /formatNewsCountLabel\(displayed,/);
assert.match(js, /total: newsPaging\.total/);
assert.doesNotMatch(
  js,
  /NEWS_COUNT\.textContent = `\$\{n\} article/,
  'après « Charger plus », le compteur ne reprend pas le nombre de cartes chargées',
);
const fn = js.match(/function formatNewsCountLabel\([\s\S]*?^\}/m);
assert(fn, 'formatNewsCountLabel extractible pour les cas de test');
const formatNewsCountLabel = new Function(`${fn[0]}; return formatNewsCountLabel;`)();
assert.equal(formatNewsCountLabel(60, { total: 1018 }), '1018 articles', 'accueil : total, pas le lot');
assert.equal(formatNewsCountLabel(90, { total: 1018 }), '1018 articles', 'après un lot de plus : toujours le total');
assert.equal(formatNewsCountLabel(1, { total: 1 }), '1 article');
assert.equal(formatNewsCountLabel(0, { total: 0 }), '0 articles');
assert.equal(formatNewsCountLabel(12, { search: true, total: 1018 }), '12 résultats', 'recherche : compte filtré');
assert.equal(formatNewsCountLabel(1, { search: true, total: 1018 }), '1 résultat');
assert.equal(formatNewsCountLabel(7, { filtered: true, total: 1018 }), '7 articles', 'source ou suivis : compte filtré');
assert.equal(formatNewsCountLabel(60, { total: 0 }), '60 articles', 'repli si le total manque');

console.log('news-pages: OK');

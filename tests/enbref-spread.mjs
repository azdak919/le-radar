// En bref : plus de cartes « mini » ; le trou résiduel est réparti (spread).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const js = readFileSync(new URL('../radar-news.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style-feed.css', import.meta.url), 'utf8');
assert.ok(!js.includes("article--compact-mini"), 'radar-news.js ne doit plus créer de carte mini');
assert.ok(!css.includes('article--compact-mini'), 'style-feed.css ne doit plus styler de carte mini');
assert.match(js, /brief\.classList\.remove\('brief-rail--spread'\)/, 'mesure sans étirement');
assert.match(js, /applyBriefSpread\(\);\s*window\.setTimeout/, 'spread appliqué en fin de balance');
assert.match(css, /\.brief-rail\.brief-rail--spread > \.article--compact \{ flex: 1 0 auto; \}/);
assert.match(css, /html\[data-wide-preview\] \.brief-rail\.brief-rail--spread \{ display: flex;/);
// Source avec peu d’articles : réserve vide → pas d’étalement (cartes étirées).
const spreadFn = js.slice(js.indexOf('const applyBriefSpread'), js.indexOf('};', js.indexOf('const applyBriefSpread')));
assert.match(spreadFn, /if \(!magazineReserve\.length\) return;/, 'réserve vide : pas de spread');
assert.match(spreadFn, /gap <= avgCard/, 'spread seulement pour un reste < 1 carte');
console.log('enbref-spread OK');

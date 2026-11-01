// Régression : mot croisé de The Concordian (page sans <p>) dont l'extrait était le titre
// d'une carte voisine (« Le plan chaleur 2026… ») → repris dans le JSON-LD de l'accueil.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { excerptLinksElsewhere, articleBodyHtml } = require('../scripts/article-image-lib.js');

const self = 'https://theconcordian.com/2026/10/crossword-paranormal-activity/';
const other = 'https://theconcordian.com/2026/10/plan-chaleur-2026-montreal-mesure-litinerance-quebec/';
const html = `<html><head><meta property="og:description" content="Halloween crossword – Issue 7, Volume 44" /></head><body>
<article class="cs-entry"><div class="cs-entry__outer"><a href="${other}" class="cs-overlay-link"></a>
<h6 class="cs-entry__title"><a href="${other}">Le plan chaleur 2026 de Montréal, une mesure « pansement » face à la montée de l&#8217;itinérance au Québec</a></h6></div></article>
<main><h1><a href="${self}">Crossword: Paranormal Activity</a></h1><img src="https://theconcordian.com/wp-content/uploads/2026/10/cw.jpg"></main></body></html>`;

const bad = 'Le plan chaleur 2026 de Montréal, une mesure « pansement » face à la montée de l’itinérance au Québec';
assert.equal(excerptLinksElsewhere(bad, html, self), true, 'titre d’un autre article lié → rejeté');
assert.equal(excerptLinksElsewhere(bad, html, other), false, 'sa propre page : jamais rejeté');
assert.equal(excerptLinksElsewhere('Halloween crossword – Issue 7, Volume 44', html, self), false, 'méta réelle gardée');
assert.equal(excerptLinksElsewhere('Crossword: Paranormal Activity', html, self + '?utm_source=rss'), false, 'lien vers soi (utm) ignoré');
assert.equal(excerptLinksElsewhere('court', html, self), false, 'texte trop court ignoré');
// Le corps détecté est bien la carte voisine, sans aucun <p> : d'où le repli interdit dans enrichItem.
assert.ok(!/<p[\s>]/i.test(articleBodyHtml(html)) && articleBodyHtml(html).includes(other));
// fetch-news.js : le repli « tout le texte » est coupé pour le corps de page.
const src = require('node:fs').readFileSync(new URL('../scripts/fetch-news.js', import.meta.url), 'utf8');
assert.match(src, /firstParagraphFromHtml\(body, \{ fallback: false \}\)/);
assert.match(src, /excerptLinksElsewhere\(next\.excerpt, slim, item\.link\)/);
console.log('excerpt-foreign-link : OK');

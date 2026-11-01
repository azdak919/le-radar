#!/usr/bin/env node
// Fiches /article/<id>/ : habillage complet, carte de lien (OG/Twitter), crédit du flux, registre sans retrait.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { recordOf, merge, renderPage, loadTemplate, shortExcerpt, frDate } = require('../scripts/article-pages.js');
const { articleId } = require('../mobile/app/js/core.js');

const item = { source: 'Quartier Libre', institution: 'Université de Montréal', title: 'Étudier en histoire', link: 'https://quartierlibre.ca/etudier-en-histoire/', author: 'Cassie Bertrand',
  date: '2026-10-28T14:00:00.000Z', lang: 'fr', leadExcerpt: 'Première phrase. Deuxième phrase. Troisième phrase.', imageLocal: 'assets/news-images/abc.jpg', sourceImageCredit: 'Photo: Benoît Rochon', sourceImageCreditCited: true };
const r = recordOf(item);
assert.equal(r.id, articleId(item.link));
assert.equal(r.image, 'https://le-radar.ca/assets/news-images/abc.jpg', 'image miroir absolue');
assert.equal(r.excerpt, 'Première phrase. Deuxième phrase.', '2 phrases au plus');
assert.equal(shortExcerpt('a'.repeat(400)).length <= 321, true);
assert.equal(frDate('2026-11-01T15:00:00Z'), '1er novembre 2026');

const html = renderPage(loadTemplate(), { ...r, credit: r.credit || 'Benoît Rochon' });
const url = `https://le-radar.ca/article/${r.id}/`;
for (const m of ['og:title', 'og:description', 'og:image', 'og:url']) assert.equal((html.match(new RegExp(`property="${m}"`, 'g')) || []).length, 1, `${m} unique`);
assert(html.includes(`<meta property="og:url" content="${url}" />`));
assert(html.includes('<meta property="og:image" content="https://le-radar.ca/assets/news-images/abc.jpg" />'));
assert(html.includes('<meta name="twitter:card" content="summary_large_image" />'));
assert(html.includes(`<link rel="canonical" href="${url}" />`));
assert(/class="masthead"/.test(html) && /class="site-foot"/.test(html) && /radar-tuner\.js/.test(html), 'habillage complet (masthead, radio, pied)');
assert(!/hreflang="en-CA" href="https:\/\/le-radar\.ca\/en\/schedules/.test(html), 'pas de hreflang de la page gabarit');
assert(!/(["'(])\.\.\/(?!\.\.\/)[a-z]/i.test(html.replace(/\.\.\/\.\.\//g, '')), 'chemins relevés de deux niveaux');
assert(html.includes('📸 Benoît Rochon</figcaption>'), 'crédit visible');
assert(html.includes(`href="${item.link}"`), 'bouton vers le média');
assert(!/tison/i.test(html));

// Registre : un article sorti du fil reste ; un champ vidé garde l'ancienne valeur.
const store = { articles: {} };
assert.equal(merge(store, [item], '2026-10-28T15:00:00Z'), 1);
assert.equal(merge(store, [{ ...item, imageLocal: '', image: '' }], '2026-10-29T15:00:00Z'), 0);
assert.equal(store.articles[r.id].image, r.image);
assert.equal(store.articles[r.id].firstSeen, '2026-10-28T15:00:00Z');
merge(store, []);
assert(store.articles[r.id], 'jamais retiré');
console.log('article-pages : OK');

// Crédits d'auteur et de photo justes pour toute source (non-régression
// La Griffe / The Concordian, oct. 2026) + règle 10 de l'admission.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const AL = require('../scripts/author-lib.js');
const PC = require('../scripts/article-photo-credit-lib.js');
const A = require('../scripts/source-admission-lib.js');

const pad = '<p>' + 'x'.repeat(300) + '</p>';

// 1. Boîte auteur WP Post Author : « See author's posts » n'est pas un nom.
const awpa = `<html><body>${pad}<div class="wp-post-author-meta awpa-author-block"><h4 class="awpa-display-name"><a href="https://journallagriffe.ca/author/cn/">Constance Nolet</a></h4><div class="wp-post-author-meta-more-posts"><p class="awpa-more-posts"><a href="https://journallagriffe.ca/author/cn/" class="awpa-more-posts">See author&#039;s posts</a></p></div></div>
<script type="application/ld+json">{"@graph":[{"@type":"Article","author":{"@type":"Person","name":"Constance Nolet"}}]}</script><meta name="author" content="Constance Nolet"></body></html>`;
assert.equal(AL.authorFromArticleHtml(awpa, 'fr', {}, 'La Griffe'), 'Constance Nolet');
for (const junk of ["See author's posts", 'View all posts', 'Voir tous les articles', 'Posts by Jane']) {
  assert.equal(AL.normalizeAuthor(junk), '', junk);
}
assert.equal(AL.expandAuthorName("Félix Beauchesne et See author's posts"), 'Félix Beauchesne');
assert.equal(AL.expandAuthorName('Nathan Brisbois et Elora Veyron-Churlet'), 'Nathan Brisbois et Elora Veyron-Churlet');
// Registre des bylines : une entrée polluée est nettoyée à la lecture.
assert.equal(AL.bylineFromLedger('La Griffe', 'https://x.ca/a/', { 'La Griffe': { 'https://x.ca/a': "Olivier Lapointe et See author's posts" } }) || AL.bylineFromLedger('La Griffe', 'https://x.ca/a/', { 'La Griffe': { [AL.normalizeArticleUrl('https://x.ca/a/')]: "Olivier Lapointe et See author's posts" } }), 'Olivier Lapointe');

// 2. Pseudo social et nom du média retirés du crédit.
assert.equal(PC.stripCreditHandles('Saima Mazumder // _saimamazumder // The Concordian'), 'Saima Mazumder');
assert.equal(PC.stripCreditHandles('Eric Kemplan// @eric.kemplan// The Concordian'), 'Eric Kemplan');
assert.equal(PC.stripCreditHandles('Nicolas Doire'), 'Nicolas Doire');

// 3. Image en lazy-load (data-pk-src) : la légende de LA bonne figure.
const lazy = `<html><body>${pad}
<figure class="wp-block-image"><img src="data:image/png;base64,AAA" data-pk-src="https://theconcordian.com/wp-content/uploads/2026/10/jade-1024x873.jpg"><figcaption>Players celebrate. Photo by Jade-S. Vachon-Côté// @arts_by_jadesvcote// The Concordian</figcaption></figure>
<figure class="wp-block-image"><img src="data:image/png;base64,AAA" data-pk-src="https://theconcordian.com/wp-content/uploads/2026/10/image-1-1024x768.jpeg" data-pk-srcset="https://theconcordian.com/wp-content/uploads/2026/10/image-1-300x225.jpeg 300w"><figcaption>George Rassias celebrates. Photo by Eric Kemplan// @eric.kemplan// The Concordian</figcaption></figure></body></html>`;
const hit = PC.extractPhotoCreditFromHtml(lazy, 'https://theconcordian.com/wp-content/uploads/2026/10/image-1.jpeg', 'en');
assert.equal(hit.creator, 'Eric Kemplan');

// 4. Légende sœur de la figure (thème Csco) : « Graphic by … » = illustrateur.
const csco = `<html><body>${pad}<figure class="cs-entry__post-media"><img src="data:image/png;base64,AAA" data-pk-src="https://theconcordian.com/wp-content/uploads/2026/10/circle-matters-800x600.jpg"></figure>
<figcaption class="cs-entry__caption-text wp-caption-text">Graphic by Adrien Foula //@adrienfoula // The Concordian</figcaption></body></html>`;
const ill = PC.extractPhotoCreditFromHtml(csco, 'https://theconcordian.com/wp-content/uploads/2026/10/circle-matters.jpg', 'en');
assert.equal(ill.creator, 'Adrien Foula');
assert.match(ill.creditLine, /^Illustration/);
// … mais pas pour une autre image.
const other = PC.extractPhotoCreditFromHtml(csco, 'https://theconcordian.com/wp-content/uploads/2026/10/autre.jpg', 'en');
assert.ok(!other || other.creator !== 'Adrien Foula');

// 5. Un crédit cité pour la même image n'est pas écrasé par « Photo : [média] ».
const item = { link: 'https://theconcordian.com/2026/10/x/', image: 'https://theconcordian.com/wp-content/uploads/2026/10/p.jpg', lang: 'en',
  sourceImageCredit: 'Photo : Anthony Tapia Ancinez // @_anthonytapia // The Concordian', sourceImageCreator: 'Anthony Tapia Ancinez // @_anthonytapia // The Concordian',
  sourceImageCreditCited: true, sourceImageCreditImageKey: 'p.jpg' };
assert.equal(PC.needsSourceCreditCheck(item), true);
PC.applySourcePhotoCredit(item, { from: 'media', creditLine: 'Photo: The Concordian', cited: false }, { doUpdate: true });
assert.equal(item.sourceImageCreator, 'Anthony Tapia Ancinez');

// 6. Admission : un échantillon aux crédits illisibles bloque l'ajout.
assert.deepEqual(A.auditSampleCredits([{ link: 'a', author: 'Constance Nolet', creditLine: 'Photo : Nicolas Doire', creator: 'Nicolas Doire' }], 'La Griffe'), []);
assert.equal(A.auditSampleCredits([{ link: 'a', author: "Constance Nolet et See author's posts" }], 'La Griffe').length, 1);
assert.equal(A.auditSampleCredits([{ link: 'a', author: 'La Griffe' }], 'La Griffe').length, 1);
assert.equal(A.auditSampleCredits([{ link: 'a', creator: 'Eric // @eric' }], 'X').length, 1);
console.log('credit-extraction OK');
const ctxOk = { registry: { active: [], candidates: [] }, institutions: [{ name: "Cégep de l'Outaouais", type: 'cegep', region: 'Outaouais' }], blocklist: [], now: Date.parse('2026-10-25T17:00:00Z'), hasCampusPhoto: () => true };
const cand = { name: 'La Griffe', institution: "Cégep de l'Outaouais", site: 'https://journallagriffe.ca/', vetted: true };
const pr = { feedUrl: 'https://journallagriffe.ca/feed/', isFeed: true, items: 10, lastItemMs: ctxOk.now - 86400000, pageText: '' };
assert.equal(A.evaluateAdmission(cand, pr, ctxOk).admit, true);
assert.equal(A.evaluateAdmission(cand, { ...pr, creditSamples: [{ link: 'a', author: "X et See author's posts" }] }, ctxOk).admit, false);
// Une page vérifiée avant le dernier correctif d'extraction est revérifiée.
assert.equal(AL.needsPageAuthorVerification({ link: 'https://x.ca/a/', author: 'La rédaction', authorCheckedAt: '2026-10-25T18:11:06Z' }), true);
console.log('credit-extraction recheck OK');
// « Photo courtesy of X » en fin de longue légende → X, pas le média ni une autre image.
const pc = PC.figureImageUrls('<img data-pk-src="https://t.com/wp-content/uploads/a-800x600.jpg">');
assert.equal(pc[0], 'https://t.com/wp-content/uploads/a-800x600.jpg');
const camino = `<html><body>${pad}<figure><img src="data:image/png;base64,A" data-pk-src="https://t.com/wp-content/uploads/2026/10/PXL_1-800x600.jpg"><figcaption>Anthony Tapia Ancinez in full gear looking into the horizon, three kilometres after leaving Sarria with 97.40 per cent left of the route to walk. Photo courtesy of Sonia Celi</figcaption></figure>
<figure><img src="data:image/png;base64,A" data-pk-src="https://t.com/wp-content/uploads/2026/10/PXL_2-1024x768.jpg"><figcaption>Near Portomarin. Photo by Anthony Tapia Ancinez // IG @_anthonytapia // The Concordian</figcaption></figure></body></html>`;
assert.equal(PC.extractPhotoCreditFromHtml(camino, 'https://t.com/wp-content/uploads/2026/10/PXL_1-1024x768.jpg', 'en').creator, 'Sonia Celi');
assert.equal(PC.extractPhotoCreditFromHtml(camino, 'https://t.com/wp-content/uploads/2026/10/PXL_2.jpg', 'en').creator, 'Anthony Tapia Ancinez');
console.log('credit-extraction courtesy OK');

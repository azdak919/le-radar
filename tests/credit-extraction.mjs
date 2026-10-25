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
{
  // Règle 10 non bloquante : admis, crédits douteux seulement notés (#220).
  const v = A.evaluateAdmission(cand, { ...pr, creditSamples: [{ link: 'a', author: "X et See author's posts" }] }, ctxOk);
  assert.equal(v.admit, true);
  assert.equal(v.creditNotes.length, 1);
}
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

// ── « Crédit faussé ou étrange → La rédaction » (affichage partagé site/app) ──
const C = require('../scripts/article-card-lib.js');
const en = { lang: 'en', source: 'The Plant' };
const fr = { lang: 'fr', source: 'La Griffe' };
for (const bad of ['Co', 'admin', "See author's posts", 'Voir tous les articles', '@plant', 'juliebergeron', 'jdoe@x.ca', 'The Plant', '', 'Ab', 'Th3rdwave']) {
  assert.equal(C.displayAuthorName(bad, en), 'The editorial team', bad);
}
assert.equal(C.displayAuthorName('Co', fr), 'La rédaction');
for (const good of ['Simon Jaffary Osowski', 'Elsie Duque Hills', 'Atika Ume Fazal', 'Nathan Brisbois et Elora Veyron-Churlet', 'Colin van den Ameele', "Marie-Ève D'Amours"]) {
  assert.equal(C.displayAuthorName(good, fr), good, good);
}
assert.equal(C.displayPhotoCredit('Photo : La Griffe', { ...fr, sourceImageCreditFrom: 'media' }), 'Photo : La rédaction');
assert.equal(C.displayPhotoCredit('Photo: The Plant', en), 'Photo: The editorial team');
assert.equal(C.displayPhotoCredit('Photo: Th3rdwave', en), 'Photo: The editorial team');
assert.equal(C.displayPhotoCredit('Photo : Scannez le code QR pour lire la version complète de cet article, incluant les références! Avec la collaboration de X', fr), 'Photo : La rédaction');
assert.equal(C.displayPhotoCredit('Photo : Nicolas Doire', fr), 'Photo : Nicolas Doire');
assert.equal(C.displayPhotoCredit('Photo: Courtesy of Spotify', en), 'Photo: Courtesy of Spotify');
assert.equal(C.displayPhotoCredit('Photo : Source : Getty Images', fr), 'Photo : Getty Images');
assert.equal(C.displayPhotoCredit('Photo : Ana Camila Torchia l Le Délit', fr), 'Photo : Ana Camila Torchia / Le Délit');
assert.equal(C.looksLikePersonName('Simon Jaffary Osowski'), true);
assert.equal(C.looksLikePersonName('Pulp Fiction'), true); // forme seule : d'où la règle « Via » ci-dessous
assert.equal(C.looksLikePersonName('see author posts'), false);

// The Plant (25 oct.) : nom + rôle en tête d'article (« Visual Arts Editor »,
// « Co-Managing Editor ») — l'ancien motif de rôle ratait ces deux libellés.
const plant = (caption, name, role) => `<html><head><meta name="author" content=""></head><body><div class="entry-content wp-block-post-content"><figure class="wp-block-image"><img src="https://theplantnews.com/wp-content/uploads/2026/10/x.jpg"><figcaption>${caption}</figcaption></figure><p>${name}</p><p>${role}</p><p>I thought I knew it all. I mean, Pulp Fiction reformed me and the long body text continues here for a while.</p></div></body></html>`;
assert.equal(AL.authorFromArticleHtml(plant('Via Pinterest', 'Simon Jaffary Osowski', 'Visual Arts Editor'), 'en', {}, 'The Plant'), 'Simon Jaffary Osowski');
assert.equal(AL.authorFromArticleHtml(plant('Via Pulp Fiction', 'Elsie Duque Hills', 'Co-Managing Editor'), 'en', {}, 'The Plant'), 'Elsie Duque Hills');
// « Via Pulp Fiction » : provenance, pas un photographe.
const via = `<html><body><div class="entry-content"><p>Via Pulp Fiction</p><p>Elsie Duque Hills</p><p>Co-Managing Editor</p></div></body></html>`;
const vc = PC.extractViaCredit ? PC.extractViaCredit(via, 'fr') : null;
assert.equal(vc.creditLine, 'Image tirée de Pulp Fiction');
assert.equal(PC.extractViaCredit(via, 'en').creditLine, 'Image via Pulp Fiction');
assert.equal(PC.creditFromIptc('Jane Doe', 'fr').creditLine, 'Photo : Jane Doe');
assert.equal(PC.creditFromIptc('IMG_2034', 'fr'), null);
assert.equal(C.displayAuthorName('Ellen Lurie and Managing Editor', en), 'Ellen Lurie');
assert.equal(C.displayAuthorName('Ingara Maidou and Eva Marriott-Fabre', en), 'Ingara Maidou and Eva Marriott-Fabre');
console.log('credit-extraction la-rédaction OK');

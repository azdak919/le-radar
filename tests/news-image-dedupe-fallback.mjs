// Deux billets ne partagent jamais une image ; une carte ne finit jamais
// sans image quand un repli campus existe (fichier Commons renommé → 404).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { imageFromArticleHtml, dropSharedSourceImages, stripOtherPostArticles } = require('../scripts/article-image-lib.js');

// 1) Panneau « The Latest » (thème Concordian) : <article class="post-AUTRE">.
const other = 'https://theconcordian.com/wp-content/uploads/2026/10/Spotlight_Vol44.jpg';
const own = 'https://theconcordian.com/wp-content/uploads/2026/10/own-photo-1024x683.jpg';
const page = (body) => `<html><head></head><body class="single single-post postid-200">
<div class="cs-search__posts"><article class="post-100 post type-post has-post-thumbnail">
<div><img width="110" height="110" src="${other}" class="wp-post-image" alt=""></div></article></div>
${body}</body></html>`;
assert.equal(imageFromArticleHtml(page(''), [], {}, 'https://theconcordian.com/x/').url, '',
  'vignette d’un autre billet écartée');
const withOwn = page(`<article class="post-200 post"><div class="entry-content">
<img width="1024" height="683" src="${own}" class="wp-post-image" alt=""><p>Texte.</p></div></article>`);
assert.notEqual(imageFromArticleHtml(withOwn, [], {}, 'https://theconcordian.com/x/').url, other);
assert.equal(stripOtherPostArticles('<article class="post-1">a</article>', '').length > 0, true);

// 2) Paire d'une même source : retirée (ré-enrichissement depuis chaque page).
const items = [
  { source: 'C', image: other, sourceImageCredit: 'Photo: X' },
  { source: 'C', image: other, sourceImageCredit: 'Photo: The Concordian' },
  { source: 'C', image: own },
];
assert.equal(dropSharedSourceImages(items, 2), 2);
assert.deepEqual(items.map((i) => i.image), ['', '', own]);
assert.equal(items[1].sourceImageCredit, undefined, 'crédit retiré avec l’image');

// 3) Client : campus mort → autre campus ; photo déjà prise → repli.
const js = fs.readFileSync(new URL('../radar-news.js', import.meta.url), 'utf8');
assert.match(js, /markDeadCampusPhoto\(failed\)/);
assert.match(js, /const urls = \[\.\.\.deadCampusPhotos\.values\(\)\]/);
assert.match(js, /alt\.kind === 'photo' \|\| alt\.kind === 'stock'/);
assert.match(js, /if \(articlePhotoTakenByOther\(item\)\) return false;/);
assert.match(js, /!claimArticlePhoto\(item\)\) preferPhoto = false/);

// 4) Banque Laval : plus l'URL 404 (fichier renommé sur Commons).
for (const f of ['../data/quebec-university-backgrounds.json', '../scripts/campus-photo-bank.js']) {
  const t = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
  assert.ok(!/3e\/Park_in_Universit/.test(t), `${f} : URL morte`);
}
console.log('news-image-dedupe-fallback: OK');

// 5) Repli campus : jamais un plan du campus (vraie banque).
{
  const lib = require('../scripts/campus-fallback-lib.js');
  const raw = JSON.parse(fs.readFileSync(new URL('../data/quebec-university-backgrounds.json', import.meta.url), 'utf8'));
  const universityPhotos = Array.isArray(raw) ? raw : (raw.photos || raw.items || Object.values(raw).find(Array.isArray));
  let seen = 0;
  for (let n = 0; n < 200; n += 1) {
    const pick = lib.pickCampusFallback({ source: 'The Concordian', institution: 'Concordia University', type: 'universite', link: `https://x/${n}` }, { universityPhotos });
    const u = String(pick?.url || pick?.stockImage || '');
    if (u) seen += 1;
    assert.ok(!/campus_map/i.test(u), `plan du campus choisi : ${u}`);
  }
  assert.ok(seen > 0, 'Concordia a un repli');
}
for (const f of ['../data/quebec-university-backgrounds.json', '../quebec-university-backgrounds-data.js']) {
  assert.ok(!/campus_map/i.test(fs.readFileSync(new URL(f, import.meta.url), 'utf8')), `${f} : plan du campus`);
}

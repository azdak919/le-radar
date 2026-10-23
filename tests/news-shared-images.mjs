// Vignettes « en vedette » / articles liés et images partagées par source.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { imageFromArticleHtml, dropSharedSourceImages, linksToOtherArticle } = require('../scripts/article-image-lib.js');

const base = 'https://impactcampus.ca/arts-et-culture/mon-article/';
const html = `<html><head>
<meta property="og:image" content="https://cdn.impactcampus.ca/wp-content/uploads/2026/10/22/propre-photo.jpg">
</head><body>
<div class="entry-content"><div class="cb-mask mask">
<a href="https://impactcampus.ca/actualites/autre-article-vedette/" class="mask-img">
<img width="360" height="240" src="https://cdn.impactcampus.ca/wp-content/uploads/2026/10/03/IMG_2939-copie-360x240.jpg" class="wp-post-image" alt="">
</a></div>
<p>Texte de l'article, suffisamment long pour être un corps d'article réel.</p>
</div></body></html>`;

const found = imageFromArticleHtml(html, [], {}, base);
assert.equal(found.url, 'https://cdn.impactcampus.ca/wp-content/uploads/2026/10/22/propre-photo.jpg',
  'la vignette d\u2019un autre billet ne doit pas battre og:image');

const at = (h) => linksToOtherArticle(h, h.indexOf('<img'), base);
assert.equal(at('<a href="/actualites/autre-article/"><img'), true);
assert.equal(at('<a href="/arts-et-culture/mon-article/"><img'), false);
assert.equal(at('<a href="/wp-content/uploads/x.jpg"><img'), false);
assert.equal(at('<a href="/actualites/autre-article/">lien</a><p><img'), false);

const shared = 'https://cdn.x.ca/wp-content/uploads/generic.jpg';
const items = [
  { source: 'A', image: shared, imageLocal: 'x' },
  { source: 'A', image: shared },
  { source: 'A', image: shared },
  { source: 'A', image: 'https://cdn.x.ca/own.jpg' },
  { source: 'B', image: shared },
  { source: 'C', image: 'https://cdn.x.ca/pair.jpg' },
  { source: 'C', image: 'https://cdn.x.ca/pair.jpg' },
];
assert.equal(dropSharedSourceImages(items), 3);
assert.deepEqual(items.map((i) => i.image), ['', '', '', 'https://cdn.x.ca/own.jpg', shared,
  'https://cdn.x.ca/pair.jpg', 'https://cdn.x.ca/pair.jpg']);
assert.equal(items[0].imageLocal, undefined);

console.log('news-shared-images: OK');

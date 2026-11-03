// Faux articles (The Plant « AI Content », 3 nov. 2026) : pages, menu WordPress, logo.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { filterNonArticles, nonArticleReason, isWpChromeExcerpt } = require('../scripts/non-article-filter.js');

const chrome = 'Comment Reblog Subscribe Subscribed The Plant Sign me up Have a WordPress.com account? Log in now.';
assert.ok(isWpChromeExcerpt(chrome));
const fake = { source: 'The Plant', title: 'AI Content', link: 'https://theplantnews.com/2026/11/03/3782/',
  excerpt: 'https://videopress.com/v/FsmACDVk?resizeToParent=true', leadExcerpt: chrome,
  image: 'https://theplantnews.com/wp-content/uploads/2026/10/pplant.jpg' };
assert.ok(nonArticleReason(fake));
assert.ok(nonArticleReason({ link: 'https://x.org/category/news/' }));
assert.ok(nonArticleReason({ link: 'https://x.org/ai-policy/' }));
assert.ok(nonArticleReason({ link: 'https://x.org/2026/11/03/a/', excerpt: chrome }));
const real = { source: 'S', title: 'Vrai', link: 'https://x.org/2026/11/03/vrai/', excerpt: 'Students gathered on Monday to discuss the new library hours and the budget for next term at the college.' };
assert.equal(nonArticleReason(real), '');
// Ne pas confondre un vrai texte qui mentionne « subscribe ».
assert.equal(nonArticleReason({ ...real, excerpt: real.excerpt + ' Subscribe to our newsletter.' }), '');
// Logo : nom de fichier ou même image sur ≥ 3 billets d'une source.
const logoNamed = { ...real, link: real.link + 'l', image: 'https://x.org/wp-content/uploads/site-logo.png' };
const same = [1, 2, 3].map((n) => ({ ...real, link: `${real.link}${n}`, image: 'https://x.org/p.jpg' }));
const out = filterNonArticles([fake, real, logoNamed, ...same]);
assert.equal(out.length, 5, 'seul le faux article est retiré');
assert.ok(!out.find((i) => i.title === 'AI Content'));
assert.equal(out.find((i) => i.link.endsWith('l')).image, '');
assert.ok(same.every((i) => i.image === ''));
assert.equal(real.image, undefined);
console.log('non-article-filter: ok');

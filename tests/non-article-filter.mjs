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

// 10 nov. 2026 : mot croisé / sudoku / casse-tête, et extrait réduit à une inscription.
const crossword = {
  source: 'The Concordian',
  title: 'Cha Cha Real Smooth Crossword',
  link: 'https://theconcordian.com/2026/11/cha-cha-real-smooth-crossword/',
  excerpt: '',
  leadExcerpt: 'SIGN UP TO CONTRIBUTE! Subscribe to our Substack to receive new Podcast episodes, our weekly section newsletters and be added to our Pitch List. We\'ll send you our pitches every weekend. If you see one you\'re interested in, you can sign up to cover it! → Sign Me Up.',
};
assert.ok(nonArticleReason(crossword), 'mot croisé Concordian exclu');
assert.ok(nonArticleReason({ title: 'Sudoku de la semaine', link: 'https://x.org/2026/11/10/sudoku/' }));
assert.ok(nonArticleReason({ title: 'Mots croisés du jeudi', link: 'https://x.org/2026/11/10/mots-croises/' }));
assert.ok(nonArticleReason({ title: 'Weekly Puzzle', link: 'https://x.org/2026/11/10/weekly-puzzle/' }));
assert.ok(nonArticleReason({ title: 'Campus word search', link: 'https://x.org/2026/11/10/word-search/' }));
assert.equal(nonArticleReason({ ...real, title: 'The puzzle of campus housing' }), '', 'métaphore « puzzle » conservée');

const signupOnly = {
  source: 'The Concordian',
  title: 'Call for contributors',
  link: 'https://theconcordian.com/2026/11/call-for-contributors/',
  excerpt: '',
  leadExcerpt: crossword.leadExcerpt,
};
assert.equal(nonArticleReason(signupOnly), 'extrait = inscription infolettre');
assert.ok(nonArticleReason({
  title: 'Appel',
  link: 'https://x.org/2026/11/10/appel/',
  excerpt: 'Abonnez-vous à notre infolettre pour recevoir les nouvelles du campus chaque vendredi.',
}));

const mentioned = { ...real, excerpt: real.excerpt + ' Subscribe to our newsletter.' };
assert.equal(nonArticleReason(mentioned), '');
const cleaned = filterNonArticles([{ ...mentioned, link: real.link + 'nl' }]);
assert.equal(cleaned.length, 1);
assert.equal(cleaned[0].excerpt, real.excerpt, 'appel à s\'inscrire retiré, texte conservé');
assert.ok(!filterNonArticles([crossword, signupOnly]).length, 'mots croisés et inscription seuls retirés');
console.log('non-article-filter puzzles/infolettre: ok');

#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { authorFromArticleHtml, normalizeAuthor, reconcileAuthor } = require('../scripts/author-lib.js');

const leTraitCredit = `
  <article><div class="entry-content"><p><em>Un texte d’opinion (légèrement) réac de R.</em> et photographie de Émile Arsenault-Laniel</p>
  <p>${'Texte de démonstration. '.repeat(20)}</p></div></article>`;
const leTraitCollective = `
  <article><div class="entry-content"><p>Un texte d’opinion par Écologie populaire</p>
  <p>${'Texte de démonstration. '.repeat(20)}</p></div></article>`;
const leTraitSignature = `
  <article><div class="entry-content"><p>Noah Boisjoli-Jebali</p>
  <p>${'Texte de démonstration. '.repeat(20)}</p></div></article>`;
const leTraitEssay = `
  <article><div class="entry-content"><p>Un essai de KidaLauzia Paquette</p>
  <p>${'Texte de démonstration. '.repeat(20)}</p></div></article>`;
const laGifleByline = `
  <html><head><meta property="og:description" content="Par Valérie Dugré — Article de démonstration."></head>
  <body><article><div class="entry-content"><p>${'Texte de démonstration. '.repeat(20)}</p></div></article></body></html>`;

assert.equal(normalizeAuthor('letdu'), '', 'le compte WordPress technique doit être ignoré');
assert.equal(normalizeAuthor('lagifleblog'), '', 'le compte WordPress technique de La Gifle doit être ignoré');
assert.equal(authorFromArticleHtml(leTraitCredit, 'fr', {}, "Le Trait d'Union"), 'R.');
assert.equal(authorFromArticleHtml(leTraitCollective, 'fr', {}, "Le Trait d'Union"), 'Écologie populaire');
assert.equal(authorFromArticleHtml(leTraitSignature, 'fr', {}, "Le Trait d'Union"), 'Noah Boisjoli-Jebali');
assert.equal(authorFromArticleHtml(leTraitEssay, 'fr', {}, "Le Trait d'Union"), 'KidaLauzia Paquette');
assert.equal(authorFromArticleHtml(laGifleByline, 'fr', {}, 'La Gifle'), 'Valérie Dugré');

const tribuneLegacy = `
  <article><div class="entry-meta"><span class="entry-author">by
    <a href="https://www.thetribune.ca/?tribune_author=Ellen+Lurie" rel="author">Admin</a>
  </span><time>September 8, 2026</time></div>
  <div class="entry-content"><p>${'Article body. '.repeat(30)}</p></div></article>`;
const tribuneSigned = `
  <article><span class="entry-author">by <a href="https://www.thetribune.ca/author/adminc/" rel="author">Admin</a></span>
  <div class="entry-content">
    <p>The Lunchbox: A Musical – Dylan Hing, Staff Writer</p>
    <p>${'Over the summer, the show ran. '.repeat(12)}</p>
    <p>Sterling Point – Lia James, Contributor</p>
  </div></article>`;
const tribuneAdminOnly = `
  <article><span class="entry-author">by <a href="https://www.thetribune.ca/author/adminc/" rel="author">Admin</a></span>
  <meta name="author" content="Admin" />
  <div class="entry-content"><p>${'Following a joint meeting with student leaders. '.repeat(20)}</p></div></article>`;

assert.equal(authorFromArticleHtml(tribuneLegacy, 'en', {}, 'The Tribune'), 'Ellen Lurie', 'tribune_author bat le compte Admin');
assert.equal(
  authorFromArticleHtml(tribuneSigned, 'en', {}, 'The Tribune'),
  'Dylan Hing and Lia James',
  'signatures Nom, rôle dans le corps',
);
assert.equal(authorFromArticleHtml(tribuneAdminOnly, 'en', {}, 'The Tribune'), '', 'Admin seul ne devient pas un auteur');

const badges = reconcileAuthor({
  source: 'The Tribune',
  lang: 'en',
  link: 'https://www.thetribune.ca/news/mcgill-security-required-to-wear-identifiable-recognizable-badges-per-new-policy-08092026/',
  author: 'The editorial team',
  excerpt: 'Following a joint meeting with student leaders and members of McGill Campus Public Safety.',
}, [], { applyFallback: true, pageAuthor: '' });
assert.equal(badges.item.author, 'Shea McDonnell', 'registre : byline déjà prouvée, pas The editorial team');
assert.equal(badges.reason, 'byline-ledger');

console.log('✓ auteurs : signatures de Le Trait d’Union et de La Gifle, comptes techniques exclus.');

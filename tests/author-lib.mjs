#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { authorFromArticleHtml, normalizeAuthor } = require('../scripts/author-lib.js');

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

assert.equal(normalizeAuthor('letdu'), '', 'le compte WordPress technique doit être ignoré');
assert.equal(authorFromArticleHtml(leTraitCredit, 'fr', {}, "Le Trait d'Union"), 'R.');
assert.equal(authorFromArticleHtml(leTraitCollective, 'fr', {}, "Le Trait d'Union"), 'Écologie populaire');
assert.equal(authorFromArticleHtml(leTraitSignature, 'fr', {}, "Le Trait d'Union"), 'Noah Boisjoli-Jebali');
assert.equal(authorFromArticleHtml(leTraitEssay, 'fr', {}, "Le Trait d'Union"), 'KidaLauzia Paquette');

console.log('✓ auteurs : signatures de Le Trait d’Union et comptes techniques vérifiés.');

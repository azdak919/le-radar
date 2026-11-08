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

// Impact Campus : fixture réduite de structure, pas reproduction d'une nouvelle
// erreur d'extraction du HTML complet (déjà correct) ; la pollution est en cache.
const fs = await import('node:fs');
const vm = await import('node:vm');
const authors = require('../scripts/author-lib.js');
const impactLink='https://impactcampus.ca/arts-et-culture/les-distances-la-complexite-des-relations-dispersees/';
const impact={source:'Impact Campus',lang:'fr',link:impactLink,title:'Les distances',excerpt:'Une analyse de la pièce et de ses relations dispersées.',author:'Léann Laquerre et Archives Impact Campus',sourceImageCredit:'Photo : Nicola-Frank Vachon'};
const dirtyLedger={'Impact Campus':{[impactLink]:impact.author}};
const fixture=fs.readFileSync(new URL('./fixtures/authors/impact-campus-archivist.html',import.meta.url),'utf8');
assert.equal(authorFromArticleHtml(fixture,'fr',{},impact.source),'Léann Laquerre');
assert.equal(authorFromArticleHtml(fixture.replace('<p>Par Léann Laquerre, chef de pupitre aux Arts</p>','').replaceAll('Léann Laquerre','Alice Martin et Bob Roy'),'fr',{},impact.source),'Alice Martin et Bob Roy');
const cleaned=reconcileAuthor(impact,[],{ledger:dirtyLedger});
assert.equal(cleaned.changed,true);assert.equal(cleaned.author,'Léann Laquerre');
assert.equal(cleaned.item.sourceImageCredit,impact.sourceImageCredit);
assert.equal(reconcileAuthor(cleaned.item,[],{ledger:dirtyLedger}).changed,false,'nettoyage idempotent malgré ancien ledger');
assert.equal(authors.bylineFromLedger(impact.source,impactLink,dirtyLedger),'Léann Laquerre');
for(const candidate of ['Alice Martin et Bob Roy et Archives Impact Campus','Alice Martin, Archives Impact Campus et Bob Roy','Archives Impact Campus, Alice Martin and Bob Roy']) {
 assert.equal(reconcileAuthor({...impact,author:candidate},[],{ledger:{}}).author,'Alice Martin et Bob Roy');
 assert.equal(reconcileAuthor({...impact,author:''},[],{ledger:{'Impact Campus':{[impactLink]:candidate}}}).author,'Alice Martin et Bob Roy');
 assert.equal(reconcileAuthor({...impact,author:'Archives Impact Campus'},[],{pageAuthor:candidate,ledger:{}}).author,'Alice Martin et Bob Roy');
 assert.equal(authors.mergePriorAuthor({...impact,author:''},{author:candidate}).author,'Alice Martin et Bob Roy');
}
for(const candidate of ['Archives Impact Campus','  ARCHIVES\u00a0 IMPACT CAMPUS  ']) {
 assert.equal(reconcileAuthor({...impact,author:candidate},[],{ledger:{}}).author,null);
 assert.equal(reconcileAuthor({...impact,author:candidate},[],{ledger:{},applyFallback:true}).author,'La rédaction');
}
assert.equal(authors.sourceAuthor('Alexandre Archives','Impact Campus'),'Alexandre Archives');
assert.equal(authors.sourceAuthor('Archives du Campus','Impact Campus'),'Archives du Campus');
assert.equal(reconcileAuthor({...impact,source:'Autre média',author:'Archives Impact Campus'},[],{ledger:{}}).author,'Archives Impact Campus');
assert.equal(authors.mergePriorAuthor({...impact,author:''},{author:impact.author}).author,'Léann Laquerre');
assert.equal(authors.mergePriorAuthor({...impact},null).author,'Léann Laquerre');
assert.equal(reconcileAuthor({...impact,author:'',excerpt:'Par Léann Laquerre et Archives Impact Campus. Une analyse assez longue de cette pièce.'},[],{ledger:{}}).author,'Léann Laquerre');
assert.equal(reconcileAuthor({...impact,author:''},[{...impact}],{ledger:{}}).author,'Léann Laquerre');
assert.equal(reconcileAuthor({...impact,author:'Archives Impact Campus'},[],{pageAuthor:'Léann Laquerre',ledger:{}}).author,'Léann Laquerre');
// Écriture ledger isolée en mémoire : le compte technique ne peut être réintroduit.
let ledgerBytes=JSON.stringify(dirtyLedger);const module={exports:{}};
const authorRequire=createRequire(new URL('../scripts/author-lib.js',import.meta.url));
vm.runInNewContext('(function(require,module,__dirname){'+fs.readFileSync(new URL('../scripts/author-lib.js',import.meta.url),'utf8')+'})')(
 id=>id==='fs'?{readFileSync:()=>ledgerBytes,writeFileSync:(_p,body)=>ledgerBytes=body}:authorRequire(id),module,'/test/scripts');
assert.equal(module.exports.rememberResolvedByline(impact.source,impactLink,impact.author),true);
assert.equal(JSON.parse(ledgerBytes)['Impact Campus'][impactLink],'Léann Laquerre');
assert.equal(module.exports.rememberResolvedByline(impact.source,impactLink,'Archives Impact Campus'),false);
console.log('Impact Campus : archiviste exact seul/composite/cache/ledger/page, coauteurs, idempotence et crédit préservés');

const feed=require('../scripts/generate-feed.js'),articlePages=require('../scripts/article-pages.js');
const repaired=require('../news.json').items.find(it=>it.link===impactLink);
assert.equal(repaired.author,'Léann Laquerre');assert.equal(repaired.sourceImageCredit,'Photo : Nicola-Frank Vachon');
const record=require('../data/article-pages.json').articles[articlePages.recordOf(repaired).id];
assert.equal(record.author,repaired.author);assert.equal(record.credit,'Nicola-Frank Vachon');
const xml=feed.buildItemXml(repaired);assert.ok(xml.includes('Léann Laquerre'));assert.ok(!xml.includes('Archives Impact Campus'));assert.ok(xml.includes('Nicola-Frank Vachon'));
const html=articlePages.renderPage(articlePages.loadTemplate(),record);assert.ok(!html.includes('Archives Impact Campus'));assert.ok(html.includes('Léann Laquerre'));assert.ok(html.includes('Nicola-Frank Vachon'));
const ld=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);assert.equal(ld.author.name,'Léann Laquerre');
for(const file of ['journaux/impact-campus/index.html','en/newspapers/impact-campus/index.html']){const h=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.ok(h.includes('Léann Laquerre'));assert.ok(!h.includes('Archives Impact Campus'));}
assert.equal(authorFromArticleHtml(fixture.replaceAll('Léann Laquerre','Archives Impact Campus'),'fr',{},impact.source),'');
console.log('Impact Campus : cohérence fil/fiche/RSS/JSON-LD et pages FR/EN, image/crédit intacts');

assert.equal(reconcileAuthor({...impact,author:''},[{...impact,author:'Archives Impact Campus'},{...impact,author:'Léann Laquerre'}],{ledger:{}}).author,'Léann Laquerre');

// formatOk (repost) et reformatText (reformat-queue) alignés sur le formateur partagé.
import assert from 'node:assert/strict';
import { buildText, formatOk, siteLink } from '../scripts/social/lib.mjs';
import { reformatText } from '../scripts/social/reformat-queue.mjs';

const it = { id: 'a', link: 'https://thelinknewspaper.ca/article/16530', source: 'The Link', author: 'Colin van den Ameele',
  title: 'Carabins 4, Stingers 0: Stingers lose in their home opener', bare: 'Carabins 4, Stingers 0: Stingers lose in their home opener',
  desc: 'The Concordia University Stingers women’s hockey home opener didn’t go their way.' };
const acc = [{ type: 'source', cle_flux: 'The Link', handle: '@Linknewspaper' }];
const site = siteLink(it);

const withCredit = buildText(it, acc, 280, { credit: 'Yann Rifflard', photo: true });
assert.ok(withCredit.includes(site) && withCredit.split('\n').includes('📸 Yann Rifflard'));
assert.ok(formatOk(withCredit, it, 'Yann Rifflard'));
assert.ok(!formatOk(withCredit, it, 'Autre Personne'), 'crédit différent → à corriger');

const noCredit = buildText(it, acc, 280, { credit: '', photo: false });
assert.ok(noCredit.trim().endsWith(site) && !noCredit.includes('📸'));
assert.ok(formatOk(noCredit, it, ''), 'sans crédit : correct si finit par le lien de la fiche');
assert.ok(!formatOk(noCredit + '\n📸 The Link', it, ''), 'ancien repli « 📸 média » → à corriger');

const oldBullet = `The Link (@Linknewspaper) • Colin van den Ameele • ${it.title} : The Concordia…\n${it.link}\n📸 Yann Rifflard`;
assert.ok(!formatOk(oldBullet, it, 'Yann Rifflard'), 'ancien format à puces + lien source → à corriger');
assert.ok(!formatOk(withCredit.replace(site, it.link), it, 'Yann Rifflard'), 'lien source → à corriger');
assert.ok(!formatOk('@Linknewspaper ' + withCredit, it, 'Yann Rifflard'), '@ en tête → à corriger');

const r = reformatText(it, acc, { credit: 'Yann Rifflard', img: 'https://x/y.jpg' });
assert.equal(r, withCredit + '\n#Montréal #Hockey', 'X : 2 hashtags (lieu + sport précis) en dernière ligne');
assert.ok(formatOk(r, it, 'Yann Rifflard'), 'formatOk tolère la ligne de hashtags');
assert.ok(r.includes(' · ') && r.includes('(@Linknewspaper)') && !r.includes(' • '));
assert.equal(reformatText(it, acc, { credit: '', img: '' }), noCredit + '\n#Montréal #Hockey');
// reformater n'ajoute jamais le @ d'un média absent du texte d'origine (budget ≤ 1 mention/jour)
assert.ok(!reformatText(it, acc, { credit: '', img: '', old: 'ancien texte sans @' }).includes('@Linknewspaper'));
assert.ok(reformatText(it, acc, { credit: '', img: '', old: 'avec (@Linknewspaper)' }).includes('@Linknewspaper'));
console.log('social-format-align : OK');
// Crédit à jour pour la file : banque (attribution complète) > flux > état (sauf nom du média).
import { currentCredit } from '../scripts/social/reformat-queue.mjs';
const bankImg = 'https://upload.wikimedia.org/wikipedia/commons/c/c6/Universit%C3%A9_Montr%C3%A9al_Roger-Gaudry.jpg';
assert.equal(currentCredit({ source: 'Quartier Libre' }, { credit: 'abdallahh' }, bankImg), 'abdallahh (Wikimedia Commons, CC BY 2.0)');
assert.equal(currentCredit({ source: 'The Link', credit: 'Yann Rifflard' }, { credit: 'The Link' }, 'https://le-radar.ca/a.jpg'), 'Yann Rifflard');
assert.equal(currentCredit({ source: 'The Link' }, { credit: 'The Link' }, 'https://le-radar.ca/a.jpg'), '');
console.log('social-format-align (crédits) : OK');

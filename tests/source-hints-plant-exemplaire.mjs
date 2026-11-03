// Critères par source (news-sources.json → botHints) : The Plant et L'Exemplaire.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { sourceHints, patternList } = require('../scripts/source-hints.js');
const { nonArticleReason, filterNonArticles } = require('../scripts/non-article-filter.js');
const { extractMontageCredit, resolveSourcePhotoCredit } = require('../scripts/article-photo-credit-lib.js');

// Une source cassée ne casse pas les autres ; source absente = général.
assert.deepEqual(patternList(['(', 'ok']).map(String), ['/ok/i']);
assert.deepEqual(sourceHints('Source inconnue', 'filter'), {});

// The Plant : billet vidéo à extrait VideoPress + logo pplant.
const plant = { source: 'The Plant', title: 'AI Content', link: 'https://theplantnews.com/2026/11/03/3782/',
  excerpt: 'https://videopress.com/v/FsmACDVk?resizeToParent=true', image: 'https://theplantnews.com/wp-content/uploads/2026/10/pplant.jpg' };
assert.ok(nonArticleReason(plant));
const realPlant = { source: 'The Plant', title: 'Real', link: 'https://theplantnews.com/2026/11/03/real/',
  excerpt: 'Dawson students rallied on Monday for better transit passes and longer library hours this term.', image: 'https://theplantnews.com/wp-content/uploads/2026/10/pplant.jpg' };
const out = filterNonArticles([plant, realPlant]);
assert.equal(out.length, 1);
assert.equal(out[0].image, '', 'logo pplant retiré comme image');
// Vrai texte dans le flux + menu WordPress en leadExcerpt : gardé, menu effacé.
const horo = { source: 'The Plant', title: 'Horoscope September 2026', link: 'https://theplantnews.com/2026/09/01/horoscope/',
  excerpt: 'Aries (Mar. 20 – Apr.18): For a short period of time, your least wise friends will give you the most sage advice.',
  leadExcerpt: 'Comment Reblog Subscribe Subscribed The Plant Sign me up Have a WordPress.com account? Log in now.' };
const kept = filterNonArticles([horo]);
assert.equal(kept.length, 1, 'Horoscope gardé');
assert.equal(kept[0].leadExcerpt, undefined, 'menu WordPress effacé');
// Le critère de The Plant ne touche pas une autre source.
const other = { ...realPlant, source: 'Le Délit', link: 'https://www.delitfrancais.com/x/' };
assert.equal(filterNonArticles([other])[0].image, realPlant.image);

// L'Exemplaire : plusieurs auteurs (« Par A, B et C ») gardés à l'affichage.
const news = fs.readFileSync(new URL('../radar-news.js', import.meta.url), 'utf8');
const junk = new Function(`${news.match(/function isJunkAuthorName[\s\S]*?\n}\n/)[0]}; return isJunkAuthorName;`)();
assert.equal(junk('Julia Audet, Raphaël Bédard et Benjamin Lessard'), false);
assert.equal(junk('Hermione Durocher, Émie Lanteigne et Élise Paré'), false);
assert.equal(junk('Skip to content'), true);

// L'Exemplaire : image composée → crédit du montage, jamais une photo de la légende.
const caption = 'À droite, Éric Duhaime (photo : Marie-Josée Hélie / Facebook); à gauche, Paul St-Pierre Plamondon (photo : Jacques Boissinot / La Presse canadienne); au centre, la carte (illustration : Radio-Canada). Montage : Benjamin Lessard / L’Exemplaire.';
const html = `<script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'ImageObject', url: 'https://www.exemplaire.com.ulaval.ca/wp-content/uploads/2026/10/montage_1920x1080_v6.png', caption }] })}</script>`;
assert.equal(extractMontageCredit(html), 'Benjamin Lessard / L’Exemplaire');
const ex = { source: "L'Exemplaire", lang: 'fr', link: 'https://www.exemplaire.com.ulaval.ca/a-la-une/x/', image: 'https://www.exemplaire.com.ulaval.ca/wp-content/uploads/2026/10/montage_1920x1080_v6.png' };
assert.equal(resolveSourcePhotoCredit(ex, html).creditLine, 'Montage : Benjamin Lessard / L’Exemplaire');
// Sans légende « Montage : », rien n'est inventé.
assert.equal(extractMontageCredit('<p>Rien</p>'), '');
console.log('source-hints-plant-exemplaire: ok');

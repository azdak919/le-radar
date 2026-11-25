#!/usr/bin/env node
// Le Club-École (22 nov. 2026) : la légende de la photo est un paragraphe sous la figure
// (« … Photo tirée de Getty images »), parfois suivie d'un paragraphe-crédit seul.
// L'extrait du fil doit sauter la légende et prendre le vrai premier paragraphe.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const W = require('../scripts/fetch-source-worker.js');

const item = (content) => `<item><title>T</title><description><![CDATA[<p>Teaser court coupé au milieu d’un mot de la phrase, comme le fait WordPress pour ses extraits automatiques. Ce</p>]]></description><content:encoded><![CDATA[${content}]]></content:encoded></item>`;
const lede = '<p><strong>La sélection anglaise, entraînée par Thomas Tuchel, a battu 3-2 les champions du monde en titre lors d’un match disputé à guichets fermés au stade de Wembley, à Londres, mardi soir.</strong></p>';

// 1. Légende + crédit dans le même paragraphe.
let ex = W.pickExcerpt(item(`<figure><img src="a.jpg"></figure><p>Bellingham a été passeur décisif sur le but de Ben White. Photo tirée de Getty images&nbsp;</p>${lede}`));
assert.match(ex, /^La sélection anglaise/, ex);

// 2. Légende puis crédit seul dans le paragraphe suivant.
ex = W.pickExcerpt(item(`<p>Au cours du championnat, Jessica de Filippo, du Rise de Vancouver, a été la meilleure buteuse de la saison régulière.</p><p>Photo tirée du compte Instagram du AFC Toronto</p>${lede}`));
assert.match(ex, /^La sélection anglaise/, ex);

// 3. Un chapô ordinaire contenant « tirée de » reste le chapô.
ex = W.pickExcerpt(item('<p>Une leçon tirée de la défaite de mardi : la défensive des Citadins doit se resserrer avant la finale de conférence de samedi prochain au Centre sportif.</p>'));
assert.match(ex, /^Une leçon tirée de la défaite/, ex);

console.log('caption-excerpt OK');

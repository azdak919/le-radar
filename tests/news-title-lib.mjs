#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  sanitizeTitle,
  fixCamelGlue,
  extractStructuredTitle,
} = require('../scripts/news-title-lib.js');

const EXPECTED_UQAM =
  'Débat électoral à l’UQAM : Ce que les partis ont à offrir aux étudiants';

// RSS Montréal Campus : CSS fuité + kicker/titre collés (balises déjà stripées par WP).
assert.equal(
  sanitizeTitle(
    '.t2 {font-size: 2rem;@media (max-width: 1000px){font-size: 1.25rem;}color: rgb(100 116 139);}Débat électoral à l’UQAMCe que les partis ont à offrir aux étudiants',
  ),
  EXPECTED_UQAM,
  'RSS collé UQAMCe → kicker : titre',
);

// HTML h1 avec span.t2 + span (structure réelle montrealcampus.ca).
const h1Html =
  "<style>.t2 {font-size: 2rem;}</style><div style='display:flex;flex-direction:column;'><span class='t2'>Débat électoral à l’UQAM</span><span>Ce que les partis ont à offrir aux étudiants</span></div>";
assert.equal(
  extractStructuredTitle(h1Html),
  EXPECTED_UQAM,
  'extractStructuredTitle lit span.t2 + span',
);
assert.equal(sanitizeTitle(h1Html), EXPECTED_UQAM, 'sanitizeTitle sur HTML h1');

// Séries MC déjà gérées via camel glue + label.
assert.equal(
  sanitizeTitle('Marché aux pucesIncursion chez un bastion montréalais du vintage'),
  'Marché aux puces : Incursion chez un bastion montréalais du vintage',
);
assert.equal(
  sanitizeTitle('PhotoreportageIulian Ciobanu : découvrir un autre monde'),
  'Photoreportage : Iulian Ciobanu : découvrir un autre monde',
);
assert.equal(
  sanitizeTitle("CobayeS’entraîner avec un bébé, tout un sport!"),
  "Cobaye : S’entraîner avec un bébé, tout un sport!",
);

// Ne pas casser les marques / acronymes légitimes.
assert.equal(sanitizeTitle('McGill Student Theatre: Beyond Backstage'), 'McGill Student Theatre: Beyond Backstage');
assert.equal(sanitizeTitle('iPhone tips on campus'), 'iPhone tips on campus');
assert.equal(sanitizeTitle('LeRadar briefing'), 'LeRadar briefing');
assert.equal(sanitizeTitle('UdeM en grève'), 'UdeM en grève');
assert.equal(fixCamelGlue('McGill'), 'McGill');
assert.equal(fixCamelGlue('iPhone'), 'iPhone');
assert.equal(fixCamelGlue('LeRadar'), 'LeRadar');

// Acronyme collé générique.
assert.equal(fixCamelGlue('UQAMCe que'), 'UQAM : Ce que');

console.log('news-title-lib: ok');

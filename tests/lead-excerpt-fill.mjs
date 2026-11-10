/**
 * Double une : un premier paragraphe de 200 car. doit entraîner le suivant.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  pickBestLeadParagraph,
  excerptLooksIncomplete,
  LEAD_FILL_MIN,
} = require('../scripts/lead-excerpt-lib.js');

const first = 'With Halloween in the rearview mirror, Movember is officially upon us! Bishop’s University’s men’s rugby team is participating in this month-long event which raises funds for men’s health initiatives.';
const second = 'The Movember website states that they have raised over 1.8 billion dollars in prevention-focused work across mental health and suicide prevention, prostate cancer and testicular cancer, in the past 22 years, worldwide. Movember asks people to grow a moustache and to talk about health.';
assert.ok(first.length < LEAD_FILL_MIN, 'le premier paragraphe seul est trop court');
assert.ok(first.length >= 180, 'cas réel : pile au-dessus de l’ancien seuil de 180');

const html = `<article><p>${first}</p><p>${second}</p></article>`;
const picked = pickBestLeadParagraph(html);
assert.ok(picked.text.includes('Movember website'), 'le paragraphe suivant est collé');
assert.ok(picked.text.length >= LEAD_FILL_MIN, `longueur ${picked.text.length} ≥ ${LEAD_FILL_MIN}`);
assert.equal(picked.text.startsWith('With Halloween'), true);

assert.equal(excerptLooksIncomplete({ leadExcerpt: first, link: 'https://example.test/a' }), true);
assert.equal(
  excerptLooksIncomplete({ leadExcerpt: picked.text, link: 'https://example.test/a' }),
  false,
  'une fois rempli, on ne refetch pas à chaque passage',
);

console.log('OK lead-excerpt-fill');

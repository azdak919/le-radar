import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { creditFromWpMediaCaption } = require('../scripts/article-photo-credit-lib.js');

// « Photo par X » → X.
const a = creditFromWpMediaCaption('<p>Photo par Marie Tremblay</p>');
assert.equal(a?.creator, 'Marie Tremblay');
assert.equal(a?.creditLine, 'Photo : Marie Tremblay');
assert.equal(a?.source, 'wp-media-caption');

// Anglais.
assert.equal(creditFromWpMediaCaption('Photo by Jane Doe.', 'en')?.creditLine, 'Photo: Jane Doe');

// Crédit d'œuvre « Titre, Artiste, 2024 » → légende entière.
const g = creditFromWpMediaCaption('<p>Glass House (partie 5, capture), Boris Labbé, 2024.</p>');
assert.equal(g?.creator, 'Glass House (partie 5, capture), Boris Labbé, 2024');
assert.equal(g?.creditLine, 'Photo : Glass House (partie 5, capture), Boris Labbé, 2024');

// Légende descriptive, vide ou placeholder : rien.
assert.equal(creditFromWpMediaCaption('Des étudiants traversent le campus sous la pluie'), null);
assert.equal(creditFromWpMediaCaption(''), null);
assert.equal(creditFromWpMediaCaption('Crédit : Journaliste'), null);
assert.equal(creditFromWpMediaCaption('x'.repeat(250)), null);

console.log('wp-media-caption-credit: ok');

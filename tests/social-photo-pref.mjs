// Préférence : vraie photo du flux créditée à une personne > photo sans crédit / pseudo > image de banque.
import assert from 'node:assert/strict';
import { personCredit, photoRank, selectItems, quality } from '../scripts/social/lib.mjs';
import { rankLikeX } from '../scripts/social/rate-limit.mjs';

for (const c of ['Yann Rifflard', 'Colin van den Ameele', 'Illustration : Maud Amoretti', 'Photo : Benoît Rochon', 'Ilario Del Guercio-Maridor']) assert.ok(personCredit(c), c);
for (const c of ['abdallahh', 'Wikimedia Commons', 'Courtoisie', 'Unsplash', '', 'Archives Quartier Libre', 'user123']) assert.ok(!personCredit(c), c);
const now = Date.parse('2026-11-01T20:00:00Z'), h = n => now - n * 3600e3;
const stock = { id: 's', source: 'QL', date: h(1), img: '', imgDropped: true, credit: '' };          // repli banque (ex. « abdallahh »)
const nocred = { id: 'n', source: 'QL', date: h(2), img: 'x.jpg', credit: '' };
const person = { id: 'p', source: 'QL', date: h(3), img: 'y.jpg', credit: 'Solène Gerber' };
assert.deepEqual([stock, nocred, person].map(photoRank), [0, 1, 2]);
assert.equal(photoRank({ ...person, source: 'The Link', credit: 'The Link' }), 1, 'crédit = nom du média');
assert.ok(quality(person) > quality(nocred) && quality(nocred) > quality(stock));
// selectItems (X et pages) : même source, la photo créditée passe devant le plus récent
assert.deepEqual(selectItems([stock, nocred, person], { slots: 2, now }).map(i => i.id), ['p', 'n']);
// Bluesky / Tumblr (rankLikeX) : idem
assert.deepEqual(rankLikeX([stock, nocred, person]).map(i => i.id), ['p', 'n']);
console.log('social-photo-pref : OK');
// Plus récent d'un autre jour : passe devant malgré la photo (préférence à égalité seulement) ; banque toujours publiée.
const older = { ...person, id: 'o', date: h(30) };
assert.deepEqual(selectItems([stock, older], { slots: 2, now }).map(i => i.id), ['s', 'o']);
// Crédit de banque : pseudo complété par source + licence (CC BY) ; nom de personne inchangé.
import { bankAttribution } from '../scripts/social/image-resolve.mjs';
assert.equal(bankAttribution({ creator: 'abdallahh', license: 'CC BY 2.0', url: 'https://upload.wikimedia.org/x.jpg' }), 'abdallahh (Wikimedia Commons, CC BY 2.0)');
assert.equal(bankAttribution({ creator: 'D. Benjamin Miller', license: 'CC BY-SA 4.0', url: 'https://upload.wikimedia.org/y.jpg' }), 'D. Benjamin Miller');
console.log('social-photo-pref (banque) : OK');

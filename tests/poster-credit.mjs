// Crédit imprimé sur les affiches = même règle que les publications (bankAttribution / feedCredit).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bankAttribution } from '../scripts/social/image-resolve.mjs';
const src = readFileSync(new URL('../affiches/poster-builder.js', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('/* posterCredit:start'), src.indexOf('/* posterCredit:end'));
const posterCredit = new Function(`${block}; return posterCredit;`)();
const W = 'https://upload.wikimedia.org/wikipedia/commons/c/cb/UQTR_-_Pavillon_Ringuet.JPG';
assert.equal(posterCredit('Khayman', 'CC BY-SA 3.0', W), 'Khayman (Wikimedia Commons, CC BY-SA 3.0)');
assert.equal(posterCredit('0x010C', 'CC BY-SA 4.0', W), '0x010C (Wikimedia Commons, CC BY-SA 4.0)');
assert.equal(posterCredit('Jean Boileau', 'CC BY-SA 4.0', W), 'Photo : Jean Boileau · CC BY-SA 4.0');
assert.equal(posterCredit('', 'CC0', W), '');
for (const [c, l] of [['Khayman', 'CC BY-SA 3.0'], ['Mcturcotte', 'CC BY 3.0'], ['Groupe de recherche en art du Québec', 'CC BY-SA 4.0'], ['Matti Blume', 'CC BY-SA 4.0']]) {
  const want = bankAttribution({ creator: c, license: l, url: W });
  const got = posterCredit(c, l, W);
  assert.equal(got.replace(/^Photo : (.*) · .*$/, '$1'), want, `${c} : même crédit que les publications`);
}
assert.match(src, /posterCredit\(opts\.credit, opts\.license, opts\.photoUrl/);
console.log('poster-credit OK');

// Couleur d’établissement partagée (affiches « Une », La une sociale) : brand-colors.json, AA ≥ 4,5:1, repli accent.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const IC = require('../scripts/institution-color-lib.js');
const B = JSON.parse(readFileSync(join(root, 'brand-colors.json'), 'utf8')).institutions;
const rgb = (s) => s.match(/\d+/g).map(Number);

assert.equal(IC.institutionColor('Université Laval', B), '#E30513');
assert.equal(IC.institutionColor('Concordia', B), '#912338', 'nom court du sport');
assert.equal(IC.institutionColor('UdeS', B), '#00A759');
assert.equal(IC.institutionColor('Bishop’s', B), '#582C83', 'apostrophe typographique');
assert.equal(IC.institutionColor('Université de Montréal', B), '#0057AC');
assert.equal(IC.institutionColor('ÉTS', B), '', 'inconnue : vide');
assert.equal(IC.paint('ÉTS', B, ['#F4F0E6'], '#6C2163'), '#6C2163', 'repli : accent');
assert.equal(IC.paint('', B, ['#F4F0E6'], '#6C2163'), '#6C2163');

const sets = {
  papier: [[244, 240, 230], [255, 255, 255]],
  verre: [[255, 252, 247], [199, 197, 193]],
  bande: [[59, 18, 54], [79, 42, 74]],
  entete: [[108, 33, 99], [59, 18, 54], [67, 67, 67]],
  surimpression: [[20, 8, 20], [72, 62, 72]],
};
for (const [name, entry] of Object.entries(B)) {
  for (const [bg, list] of Object.entries(sets)) {
    const c = rgb(IC.aaColor(entry.color, list));
    for (const b of list) assert.ok(IC.ratio(c, b) >= 4.5, `${name} sur ${bg} : ${IC.ratio(c, b).toFixed(2)}`);
  }
}
// Laval sur l’en-tête violet : éclaircie (rouge pur illisible), pas remplacée par l’accent.
const lav = rgb(IC.aaColor('#E30513', sets.entete));
assert.ok(lav[0] > lav[1] && lav[0] > lav[2], 'reste rouge');

// Branchement dans l’outil d’affiches : média, parenthèses du sport, station radio.
const src = readFileSync(join(root, 'affiches/poster-builder.js'), 'utf8');
assert.match(src, /grab\('\.\.\/brand-colors\.json'\)/);
assert.match(src, /colorText: radio\.name, colorInst: radio\.institution/);
assert.match(src, /metaColor\(lead, BG_LIGHT, PURPLE\)/);
assert.match(src, /instColor\(inner, bgs, ''\)/);
assert.match(readFileSync(join(root, 'affiches/index.html'), 'utf8'), /scripts\/institution-color-lib\.js/);
console.log('institution-color OK');

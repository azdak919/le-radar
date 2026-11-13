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
// ÉTS (t986u/t988u) : l'entrée manquait dans brand-colors.json et aucun alias ne couvrait « ÉTS »/« ETS ».
for (const n of ['ÉTS', 'ETS', '(ÉTS)', 'École de technologie supérieure', 'Piranhas', 'ets']) assert.equal(IC.institutionColor(n, B), '#E40032', n);
assert.equal(IC.institutionColor('Université du Québec à Montréal', B), '#0079BE', 'radio CHOQ');
assert.equal(IC.institutionColor('Établissement inconnu', B), '', 'inconnue : vide');
assert.equal(IC.paint('Établissement inconnu', B, ['#F4F0E6'], '#6C2163'), '#6C2163', 'repli : accent');

// Source unique : aucune couleur ni table d'alias en dur dans le module partagé ni dans l'outil d'affiches.
const lib = readFileSync(join(root, 'scripts/institution-color-lib.js'), 'utf8');
assert.doesNotMatch(lib, /#[0-9a-f]{6}/i, 'aucune couleur en dur dans institution-color-lib.js');
assert.doesNotMatch(lib, /BRAND_ALIAS/, 'alias lus dans brand-colors.json');
for (const [k, e] of Object.entries(B)) {
  assert.match(e.color, /^#[0-9A-Fa-f]{6}$/, `${k} : couleur`);
  assert.ok(e.source && e.source.length > 5, `${k} : source`);
  if (e.aliases) assert.ok(Array.isArray(e.aliases) && e.aliases.every((a) => typeof a === 'string' && a.trim()), `${k} : alias`);
}

// Tout établissement qui peut s'afficher sur une affiche a sa couleur : équipes universitaires du RSEQ
// (bandeau, bilan), établissements des médias et des radios.
const teams = JSON.parse(readFileSync(join(root, 'sports-teams.json'), 'utf8')).teams;
const missing = teams.filter((t) => t.sector === 'universitaire')
  .filter((t) => !(IC.institutionColor(t.fullName, B) || IC.institutionColor(t.shortName, B) || IC.institutionColor(t.code, B)))
  .map((t) => t.fullName);
assert.deepEqual(missing, [], `établissements sportifs sans couleur : ${missing.join(', ')}`);
for (const t of teams.filter((x) => x.sector === 'universitaire')) {
  const viaShort = IC.institutionColor(t.shortName, B);
  if (viaShort) assert.equal(viaShort, IC.institutionColor(t.fullName, B), `${t.shortName} = ${t.fullName}`);
}
const srcRaw = JSON.parse(readFileSync(join(root, 'news-sources.json'), 'utf8'));
const sources = Array.isArray(srcRaw) ? srcRaw : (srcRaw.sources || Object.values(srcRaw));
const radiosRaw = JSON.parse(readFileSync(join(root, 'radios.json'), 'utf8'));
const radios = Array.isArray(radiosRaw) ? radiosRaw : (radiosRaw.radios || radiosRaw.stations || Object.values(radiosRaw));
const shown = [...new Set([...sources.map((s) => s && s.institution), ...radios.map((r) => r && (r.institution || r.university))].filter(Boolean))];
const noColor = shown.filter((n) => !IC.institutionColor(n, B));
assert.deepEqual(noColor, [], `médias ou radios sans couleur : ${noColor.join(', ')}`);
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

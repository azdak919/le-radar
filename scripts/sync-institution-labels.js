#!/usr/bin/env node
/**
 * Génère institution-acronyms-data.js pour le navigateur (app.js)
 * à partir de institutions.json + lib partagée.
 *
 *   node scripts/sync-institution-labels.js
 *   node scripts/sync-institution-labels.js --check
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  buildAcronymMap,
  buildFullByAcronym,
  loadInstitutions,
} = require('./institution-labels-lib');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'institution-acronyms-data.js');

function render() {
  const institutions = loadInstitutions();
  const acronyms = buildAcronymMap(institutions);
  const fullByAcr = buildFullByAcronym(acronyms);
  return `/* Auto-généré — node scripts/sync-institution-labels.js — ne pas éditer à la main.
 * Source de vérité : institutions.json (+ alias connus dans institution-labels-lib.js)
 */
window.RadarInstitutionAcronyms = ${JSON.stringify(acronyms, null, 2)};
window.RadarInstitutionFullByAcronym = ${JSON.stringify(fullByAcr, null, 2)};
`;
}

function main() {
  const next = render();
  const check = process.argv.includes('--check');
  if (check) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== next) {
      console.error('institution-acronyms-data.js désynchronisé — lancer node scripts/sync-institution-labels.js');
      process.exit(1);
    }
    console.log('OK institution-labels sync');
    return;
  }
  fs.writeFileSync(OUT, next);
  console.log(`Écrit ${OUT}`);
}

main();

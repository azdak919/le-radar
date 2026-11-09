#!/usr/bin/env node
/**
 * Nettoie les données publiées de tout marqueur CDATA (<![CDATA[, ]]>, entités comprises).
 * Idempotent. Usage : node scripts/scrub-cdata.js [--update]
 * Sans --update : liste seulement (code de sortie 1 s'il reste des marqueurs).
 */
const fs = require('fs');
const path = require('path');
const { scrubDeep, hasCdata } = require('./cdata-lib');

const ROOT = path.resolve(__dirname, '..');
const update = process.argv.includes('--update');
const files = ['news.json', 'data/article-pages.json', 'social-feed.json'];
const archDir = path.join(ROOT, 'data/archives');
if (fs.existsSync(archDir)) for (const f of fs.readdirSync(archDir)) if (f.endsWith('.json')) files.push(path.join('data/archives', f));

let dirty = 0;
for (const rel of files) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  const raw = fs.readFileSync(abs, 'utf8');
  if (!hasCdata(raw)) continue;
  const { value, changed } = scrubDeep(JSON.parse(raw));
  console.log(`${rel} : ${changed} champ(s) avec marqueur CDATA`);
  dirty += changed;
  if (update) {
    // Conserve la mise en forme d'origine : remplace dans le texte brut plutôt que de réécrire le JSON.
    const { stripCdata } = require('./cdata-lib');
    const out = stripCdata(raw);
    JSON.parse(out);
    fs.writeFileSync(abs, out);
  }
}
console.log(dirty ? `${dirty} champ(s) ${update ? 'nettoyé(s)' : 'à nettoyer'}.` : 'Aucun marqueur CDATA.');
process.exit(dirty && !update ? 1 : 0);

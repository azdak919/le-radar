#!/usr/bin/env node
/**
 * Dernière garde d'unicité de news.json, APRÈS `git pull --rebase -X theirs`.
 *
 * Cause du doublon du 2026-10-25 (Le Délit, « Affaire Thelyson Orelien ») :
 * deux passes concurrentes (bot news + rattrapage harvest-freshness) ont
 * modifié le même article ; la fusion textuelle du rebase a gardé les deux
 * blocs JSON. fetch-news.js dédoublonne bien, mais avant le rebase.
 *
 * Usage : node scripts/dedupe-news-json.js [--update] [--commit] [fichier]
 *  --update : réécrit le fichier si des doublons sont retirés
 *  --commit : en plus, crée un commit git du fichier corrigé
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { articleDedupeKey } = require('./live-link-health-lib');

/** Garde une entrée par lien ; entre deux copies, préfère celle qui a son image locale. */
function dedupeNewsItems(items = []) {
  const kept = [];
  const index = new Map();
  let removed = 0;
  for (const item of items) {
    const key = articleDedupeKey(item && item.link);
    if (!key) { kept.push(item); continue; }
    if (!index.has(key)) { index.set(key, kept.length); kept.push(item); continue; }
    removed += 1;
    const at = index.get(key);
    if (item && item.imageLocal && !kept[at].imageLocal) kept[at] = item;
  }
  return { items: kept, removed };
}

function main(argv) {
  const update = argv.includes('--update') || argv.includes('--commit');
  const commit = argv.includes('--commit');
  const file = argv.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', 'news.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const field = Array.isArray(doc.items) ? 'items' : 'articles';
  const { items, removed } = dedupeNewsItems(doc[field] || []);
  console.log(`dedupe-news-json: ${removed} doublon(s) retiré(s)`);
  if (!removed || !update) return removed;
  doc[field] = items;
  if (typeof doc.count === 'number') doc.count = items.length;
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
  if (commit) {
    execFileSync('git', ['add', file], { stdio: 'inherit' });
    execFileSync('git', ['commit', '-q', '-m', 'bot: dédoublonnage de news.json après rebase (auto)'], { stdio: 'inherit' });
  }
  return removed;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { dedupeNewsItems };

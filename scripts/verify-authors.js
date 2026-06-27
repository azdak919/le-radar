#!/usr/bin/env node
/**
 * QC auteurs — l'extrait « Par … » prime sur le champ RSS (souvent rédacteur·rice).
 *
 *   node scripts/verify-authors.js
 *   node scripts/verify-authors.js --update
 *   node scripts/verify-authors.js --strict
 */

const fs = require('fs');
const path = require('path');
const { auditAuthors, reconcileAuthor } = require('./author-lib');

const ROOT = path.join(__dirname, '..');
const NEWS_PATH = path.join(ROOT, 'news.json');
const QC_PATH = path.join(ROOT, 'author-qc.json');

const args = process.argv.slice(2);
const doUpdate = args.includes('--update');
const strict = args.includes('--strict');

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function main() {
  const news = readJson(NEWS_PATH, { items: [] });
  const items = news.items || [];
  if (!items.length) {
    console.error('No items in news.json');
    process.exit(1);
  }

  const { mismatches, fixable, total } = auditAuthors(items);
  const withAuthor = items.filter((i) => i.author && String(i.author).trim()).length;

  console.log('Author QC');
  console.log('==========');
  console.log(`Articles        : ${total}`);
  console.log(`Avec auteur     : ${withAuthor}`);
  console.log(`À corriger      : ${fixable}`);

  if (mismatches.length) {
    console.log('\nConflits extrait / champ RSS :');
    mismatches.slice(0, 12).forEach((m) => {
      const from = m.fieldAuthor ? `"${m.fieldAuthor}"` : '(vide)';
      console.log(`  · ${m.title}`);
      console.log(`    ${from} → "${m.canonicalAuthor}" (${m.source})`);
    });
    if (mismatches.length > 12) {
      console.log(`  … et ${mismatches.length - 12} autres`);
    }
  } else {
    console.log('\nAucun conflit détecté.');
  }

  const qc = {
    updated: new Date().toISOString(),
    total,
    withAuthor,
    mismatches: fixable,
    ok: fixable === 0,
    samples: mismatches.slice(0, 20),
  };

  if (doUpdate && fixable > 0) {
    const nextItems = items.map((item) => reconcileAuthor(item, items, { applyFallback: true }).item);
    fs.writeFileSync(NEWS_PATH, JSON.stringify({ ...news, items: nextItems }, null, 2) + '\n');
    console.log(`\n✅ ${fixable} auteur(s) corrigé(s) dans news.json`);
    qc.fixed = fixable;
    qc.ok = true;
  } else if (doUpdate) {
    console.log('\nRien à écrire.');
  } else if (fixable > 0) {
    console.log('\nDry-run. Utilisez --update pour corriger news.json.');
  }

  fs.writeFileSync(QC_PATH, JSON.stringify(qc, null, 2) + '\n');
  console.log(`✅ ${QC_PATH}`);

  if (strict && fixable > 0 && !doUpdate) process.exit(1);
}

main();
#!/usr/bin/env node
/**
 * QC crédits photo — automatique à chaque agrégation.
 * Priorité : vedette récente > articles sans crédit > reste du fil.
 * Nouvelle source ou image changée → re-vérification page source.
 *
 *   node scripts/verify-photo-credits.js
 *   node scripts/verify-photo-credits.js --update
 *   node scripts/verify-photo-credits.js --strict
 */

const fs = require('fs');
const path = require('path');
const { sleep } = require('./article-image-lib');
const {
  auditPhotoCredits,
  buildPhotoCreditQueue,
  fetchSourcePhotoCredit,
  applySourcePhotoCredit,
} = require('./article-photo-credit-lib');

const ROOT = path.join(__dirname, '..');
const NEWS_PATH = path.join(ROOT, 'news.json');
const QC_PATH = path.join(ROOT, 'photo-credit-qc.json');

const FETCH_DELAY = 150;

const args = process.argv.slice(2);
const doUpdate = args.includes('--update');
const strict = args.includes('--strict');

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

async function main() {
  const news = readJson(NEWS_PATH, { items: [] });
  const items = news.items || [];
  if (!items.length) {
    console.error('No items in news.json');
    process.exit(1);
  }

  const before = auditPhotoCredits(items);
  const queue = buildPhotoCreditQueue(items);

  console.log('Photo credit QC');
  console.log('===============');
  console.log(`Articles           : ${before.total}`);
  console.log(`Avec photo source  : ${before.withImage}`);
  console.log(`Avec crédit        : ${before.withCredit} (${before.cited} cités)`);
  console.log(`À vérifier         : ${queue.length}`);
  if (before.missingHero) {
    console.log(`Vedette sans crédit: ${before.missingHero}`);
  }

  let checked = 0;
  let updated = 0;
  let cited = 0;
  let fallback = 0;
  const samples = [];

  for (const item of queue) {
    const resolved = await fetchSourcePhotoCredit(item);
    checked += 1;
    const result = applySourcePhotoCredit(item, resolved, { doUpdate });
    if (result.changed) updated += 1;
    if (result.cited) cited += 1;
    else if (resolved) fallback += 1;
    if (samples.length < 12 && result.changed) {
      samples.push({
        title: item.title,
        source: item.source,
        credit: resolved?.creditLine || item.sourceImageCredit,
        cited: result.cited,
        method: result.method,
      });
    }
    await sleep(FETCH_DELAY);
  }

  const after = auditPhotoCredits(items);

  if (samples.length) {
    console.log('\nDerniers crédits appliqués :');
    samples.forEach((s) => {
      console.log(`  · ${s.title.slice(0, 52)} (${s.source})`);
      console.log(`    → ${s.credit}${s.cited ? '' : ' [repli média]'}`);
    });
  } else if (!queue.length) {
    console.log('\nAucune vérification nécessaire.');
  }

  const qc = {
    updated: new Date().toISOString(),
    ...after,
    checked,
    updatedCount: updated,
    citedNew: cited,
    fallbackNew: fallback,
    samples,
  };

  if (doUpdate && updated > 0) {
    fs.writeFileSync(NEWS_PATH, JSON.stringify({ ...news, items }, null, 2) + '\n');
    console.log(`\n✅ ${updated} crédit(s) écrit(s) dans news.json`);
  } else if (doUpdate) {
    console.log('\nRien à écrire.');
  } else if (queue.length) {
    console.log('\nDry-run. Utilisez --update pour écrire news.json.');
  }

  fs.writeFileSync(QC_PATH, JSON.stringify(qc, null, 2) + '\n');
  console.log(`✅ ${QC_PATH}`);

  if (strict && (after.missingHero > 0 || after.pending > 0) && !doUpdate) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
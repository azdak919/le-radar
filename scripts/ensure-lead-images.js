#!/usr/bin/env node
/**
 * Bot QC vedette — garantit une image (photo ou repli SVG) pour chaque article
 * susceptible d'être à la une. Aucune API payante ; contrôle autonome en CI.
 *
 *   node scripts/ensure-lead-images.js
 *   node scripts/ensure-lead-images.js --update
 */

const fs = require('fs');
const path = require('path');
const {
  hasUsableImage,
  fallbackFileName,
  buildFallbackSvg,
} = require('./lead-fallback-lib');

const ROOT = path.join(__dirname, '..');
const NEWS_PATH = path.join(ROOT, 'news.json');
const BRAND_PATH = path.join(ROOT, 'brand-colors.json');
const QC_PATH = path.join(ROOT, 'lead-image-qc.json');
const FALLBACK_DIR = path.join(ROOT, 'assets', 'lead-fallbacks');

const doUpdate = process.argv.includes('--update');

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function main() {
  const news = readJson(NEWS_PATH, { items: [] });
  const brandColors = readJson(BRAND_PATH, { institutions: {}, fallback_palette: [] });
  const items = news.items || [];
  if (!items.length) {
    console.error('No items in news.json');
    process.exit(1);
  }

  if (doUpdate) fs.mkdirSync(FALLBACK_DIR, { recursive: true });

  let generated = 0;
  let alreadyOk = 0;

  for (const item of items) {
    if (hasUsableImage(item)) {
      alreadyOk += 1;
      continue;
    }

    const fileName = fallbackFileName(item);
    const relPath = `./assets/lead-fallbacks/${fileName}`;
    const absPath = path.join(FALLBACK_DIR, fileName);
    const svg = buildFallbackSvg(item, brandColors);

    if (doUpdate) {
      fs.writeFileSync(absPath, svg, 'utf8');
      item.fallbackImage = relPath;
    }
    generated += 1;
  }

  const withPhoto = items.filter((i) => i.image && hasUsableImage({ image: i.image })).length;
  const withFallback = items.filter((i) => i.fallbackImage).length;
  const fullyCovered = items.filter((i) => hasUsableImage(i)).length;

  const qc = {
    updated: new Date().toISOString(),
    total: items.length,
    withPhoto,
    withFallback,
    fullyCovered,
    generatedThisRun: generated,
    alreadyOk,
    mainPageLeadReady: fullyCovered >= Math.min(HERO_MIN_POOL, items.length),
  };

  console.log('Lead image QC');
  console.log('==============');
  console.log(`Articles       : ${qc.total}`);
  console.log(`Photos         : ${qc.withPhoto}`);
  console.log(`Repli SVG      : ${withFallback}`);
  console.log(`Couverture     : ${qc.fullyCovered}/${qc.total}`);
  if (doUpdate) console.log(`Générés        : ${generated}`);

  if (doUpdate) {
    fs.writeFileSync(NEWS_PATH, JSON.stringify({ ...news, items }, null, 2) + '\n');
    fs.writeFileSync(QC_PATH, JSON.stringify(qc, null, 2) + '\n');
    console.log(`✅ ${NEWS_PATH}`);
    console.log(`✅ ${QC_PATH}`);
  } else {
    console.log('\nDry-run. Use --update to write fallbacks and news.json.');
  }
}

const HERO_MIN_POOL = 4;

main();
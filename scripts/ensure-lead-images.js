#!/usr/bin/env node
/**
 * Bot QC vedette — séquence :
 *   1. Vérifier la photo existante (dimensions réelles)
 *   2. Scraper la page source si photo absente ou trop faible
 *   3. Générer un repli SVG seulement en dernier recours
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
const {
  resolveLeadReadyPhoto,
  meetsLeadDisplaySize,
  isCandidateImageUrl,
  isWeakImageUrl,
  probeRemoteImageSize,
  sleep,
} = require('./article-image-lib');

const ROOT = path.join(__dirname, '..');
const NEWS_PATH = path.join(ROOT, 'news.json');
const BRAND_PATH = path.join(ROOT, 'brand-colors.json');
const QC_PATH = path.join(ROOT, 'lead-image-qc.json');
const FALLBACK_DIR = path.join(ROOT, 'assets', 'lead-fallbacks');
const HERO_MIN_POOL = 4;
const PAGE_SCRAPE_LIMIT = 30;

const doUpdate = process.argv.includes('--update');

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

async function photoIsLeadReady(item) {
  if (!item.image || !isCandidateImageUrl(item.image) || isWeakImageUrl(item.image)) {
    return false;
  }
  const dims = await probeRemoteImageSize(item.image);
  return !!(dims && meetsLeadDisplaySize(dims.width, dims.height));
}

async function main() {
  const news = readJson(NEWS_PATH, { items: [] });
  const brandColors = readJson(BRAND_PATH, { institutions: {}, fallback_palette: [] });
  const items = news.items || [];
  if (!items.length) {
    console.error('No items in news.json');
    process.exit(1);
  }

  if (doUpdate) fs.mkdirSync(FALLBACK_DIR, { recursive: true });

  let photosOk = 0;
  let pageScraped = 0;
  let photosRecovered = 0;
  let svgGenerated = 0;
  let svgKept = 0;
  const gaps = [];

  const scrapeQueue = items
    .filter((item) => item.link && (!item.image || !isCandidateImageUrl(item.image) || isWeakImageUrl(item.image)))
    .slice(0, PAGE_SCRAPE_LIMIT);

  for (const item of scrapeQueue) {
    const resolved = await resolveLeadReadyPhoto(item);
    if (!resolved?.url) continue;
    pageScraped += 1;
    if (doUpdate) {
      item.image = resolved.url;
      delete item.fallbackImage;
    }
    if (resolved.leadReady !== false) photosRecovered += 1;
    await sleep(200);
  }

  for (const item of items) {
    const leadReady = await photoIsLeadReady(item);

    if (leadReady) {
      photosOk += 1;
      if (doUpdate && item.fallbackImage) delete item.fallbackImage;
      continue;
    }

    if (!item.image || !isCandidateImageUrl(item.image)) {
      const resolved = await resolveLeadReadyPhoto(item);
      if (resolved?.url && doUpdate) {
        item.image = resolved.url;
        delete item.fallbackImage;
        pageScraped += 1;
        if (resolved.leadReady !== false) {
          photosRecovered += 1;
          photosOk += 1;
          continue;
        }
      }
    }

    const stillReady = await photoIsLeadReady(item);
    if (stillReady) {
      photosOk += 1;
      if (doUpdate && item.fallbackImage) delete item.fallbackImage;
      continue;
    }

    if (item.fallbackImage && hasUsableImage(item)) {
      svgKept += 1;
      gaps.push({ title: item.title, link: item.link, reason: 'svg-fallback', image: item.image || null });
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
    svgGenerated += 1;
    gaps.push({
      title: item.title,
      link: item.link,
      reason: item.image ? 'photo-too-small-or-missing' : 'no-photo',
      image: item.image || null,
    });
    await sleep(50);
  }

  const withPhoto = items.filter((i) => i.image && isCandidateImageUrl(i.image)).length;
  const withFallback = items.filter((i) => i.fallbackImage).length;
  const fullyCovered = items.filter((i) => hasUsableImage(i)).length;
  const leadReadyCount = photosOk;

  const qc = {
    updated: new Date().toISOString(),
    total: items.length,
    withPhoto,
    withFallback,
    fullyCovered,
    leadReadyPhotos: leadReadyCount,
    pageScraped,
    photosRecovered,
    svgGeneratedThisRun: svgGenerated,
    svgKept,
    mainPageLeadReady: leadReadyCount >= Math.min(HERO_MIN_POOL, items.length),
    gaps: gaps.slice(0, 12),
  };

  console.log('Lead image QC');
  console.log('==============');
  console.log(`Articles          : ${qc.total}`);
  console.log(`Photos URL        : ${qc.withPhoto}`);
  console.log(`Photos vedette OK : ${qc.leadReadyPhotos}`);
  console.log(`Pages scrapées    : ${qc.pageScraped}`);
  console.log(`Photos récupérées : ${qc.photosRecovered}`);
  console.log(`Repli SVG         : ${qc.withFallback}`);
  console.log(`Couverture totale : ${qc.fullyCovered}/${qc.total}`);
  if (doUpdate) console.log(`SVG générés       : ${svgGenerated}`);

  if (gaps.length) {
    console.log('\nArticles sans photo vedette (repli SVG) :');
    gaps.slice(0, 5).forEach((g) => console.log(`  · ${g.title} — ${g.reason}`));
  }

  if (doUpdate) {
    fs.writeFileSync(NEWS_PATH, JSON.stringify({ ...news, items }, null, 2) + '\n');
    fs.writeFileSync(QC_PATH, JSON.stringify(qc, null, 2) + '\n');
    console.log(`\n✅ ${NEWS_PATH}`);
    console.log(`✅ ${QC_PATH}`);
  } else {
    console.log('\nDry-run. Use --update to write fallbacks and news.json.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
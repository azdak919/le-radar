#!/usr/bin/env node
/**
 * LE RADAR — bot de détection de saison des fonds photo
 *
 * Rôle (source de vérité tags) :
 *   - Parcourt data/photo-bank.json (banque unique) ; sinon les JSON par banque
 *   - Détecte season (4) + season6 (nations/Inuit)
 *   - Écrit seasonConfidence, seasonSource, seasonReasons
 *   - Ne touche PAS aux entrées seasonSource === 'manual'
 *
 * Couches :
 *   1. Texte / dates / toponymes (scripts/season-lib.js) — offline, défaut
 *   2. Optionnel --visual : thumb Commons + Pillow (scripts/detect-photo-seasons-visual.py)
 *
 * Usage :
 *   node scripts/detect-photo-seasons.js                  # rapport dry-run
 *   node scripts/detect-photo-seasons.js --update         # écrit JSON
 *   node scripts/detect-photo-seasons.js --update --sync  # + bank:sync JS
 *   node scripts/detect-photo-seasons.js --visual --update
 *   node scripts/detect-photo-seasons.js --force          # réécrit même si déjà tagué (sauf manual)
 *   node scripts/detect-photo-seasons.js --profile nations
 *   node scripts/detect-photo-seasons.js --min-confidence 0.55
 *
 * Client (mât/pomo) : filtre via season-lib — ce bot améliore le taux de tags.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  detectFromText,
  mergeDetections,
  isNationsItem,
  SEASON4,
  SEASON6,
} = require('./season-lib');
const photosLib = require('./photo-bank-lib');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const doUpdate = args.includes('--update');
const doSync = args.includes('--sync');
const doVisual = args.includes('--visual');
const force = args.includes('--force');
const dryJson = args.includes('--json');

const profileFilter = (() => {
  const eq = args.find((a) => a.startsWith('--profile='));
  if (eq) return eq.slice('--profile='.length).trim().toLowerCase();
  const i = args.indexOf('--profile');
  if (i >= 0 && args[i + 1]) return String(args[i + 1]).trim().toLowerCase();
  return null;
})();

const DETECTOR_SOURCES = new Set([
  'visual',
  'text',
  'text+visual',
  'date',
  'topo',
  'sessionId-fallback',
]);

const minConfidence = (() => {
  const eq = args.find((a) => a.startsWith('--min-confidence='));
  if (eq) return Math.max(0, Math.min(1, parseFloat(eq.split('=')[1])));
  const i = args.indexOf('--min-confidence');
  if (i >= 0 && args[i + 1]) return Math.max(0, Math.min(1, parseFloat(args[i + 1])));
  return 0.5;
})();

const BANKS = [
  { id: 'masthead', jsonRel: 'data/quebec-backgrounds.json', nations: false },
  { id: 'universities', jsonRel: 'data/quebec-university-backgrounds.json', nations: false },
  { id: 'pomo', jsonRel: 'data/quebec-pomo-backgrounds.json', nations: false },
  { id: 'nations', jsonRel: 'data/quebec-nations-backgrounds.json', nations: true },
  { id: 'favorites', jsonRel: 'data/quebec-favorites-backgrounds.json', nations: false },
];

function loadJson(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
}

function runVisualBatch(photos) {
  /** @type {Map<string, object>} */
  const byId = new Map();
  if (!photos.length) return byId;

  const py = path.join(ROOT, 'scripts/detect-photo-seasons-visual.py');
  const input = photos
    .map((p) => JSON.stringify({ id: p.id || p.url, url: p.url }))
    .join('\n');

  const res = spawnSync('python3', [py], {
    input,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    cwd: ROOT,
  });

  if (res.status !== 0 && res.stderr) {
    console.warn('  ⚠ visual python:', (res.stderr || '').slice(0, 400));
  }

  for (const line of (res.stdout || '').split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row.id) byId.set(row.id, row);
    } catch {
      /* ignore */
    }
  }
  return byId;
}

function shouldSkip(photo) {
  if (photo.seasonSource === 'manual') return 'manual';
  if (!force && photo.season && photo.seasonConfidence >= minConfidence) {
    // nations : aussi season6
    if (isNationsItem(photo) || photo.bank === 'nations') {
      if (photo.season6) return 'already_tagged';
    } else {
      return 'already_tagged';
    }
  }
  return null;
}

function applyDetection(photo, bank, visualRow) {
  const visual =
    visualRow && visualRow.season && !visualRow.error
      ? {
          season: visualRow.season,
          season6: visualRow.season6,
          confidence: visualRow.confidence,
        }
      : null;

  const det = mergeDetections(photo, visual);
  if (!det.season || det.confidence < minConfidence) {
    if (
      force &&
      photo.seasonSource !== 'manual' &&
      DETECTOR_SOURCES.has(photo.seasonSource)
    ) {
      const before = {
        season: photo.season || null,
        season6: photo.season6 || null,
        seasonSource: photo.seasonSource || null,
        seasonConfidence: photo.seasonConfidence ?? null,
      };
      delete photo.season;
      if (bank.nations || isNationsItem(photo)) delete photo.season6;
      delete photo.seasonSource;
      delete photo.seasonConfidence;
      delete photo.seasonReasons;
      photo.seasonDetectedAt = new Date().toISOString();
      return { changed: true, det, before, reason: 'cleared_uncertain' };
    }
    return { changed: false, det, reason: 'low_confidence' };
  }

  const nations = bank.nations || isNationsItem(photo);
  const before = {
    season: photo.season || null,
    season6: photo.season6 || null,
    seasonSource: photo.seasonSource || null,
    seasonConfidence: photo.seasonConfidence ?? null,
  };

  photo.season = det.season;
  if (nations && det.season6 && SEASON6.includes(det.season6)) {
    photo.season6 = det.season6;
  }
  photo.seasonConfidence = Math.round(det.confidence * 1000) / 1000;
  photo.seasonSource = det.source;
  photo.seasonReasons = (det.reasons || []).slice(0, 8);
  photo.seasonDetectedAt = new Date().toISOString();

  const changed =
    before.season !== photo.season ||
    before.season6 !== (photo.season6 || null) ||
    before.seasonSource !== photo.seasonSource ||
    before.seasonConfidence !== photo.seasonConfidence;

  return { changed, det, before };
}

function main() {
  const unifiedRel = photosLib.PHOTOS_REL;
  const unifiedExists = fs.existsSync(path.join(ROOT, unifiedRel));
  const useUnified = unifiedExists && !profileFilter;
  const banks = useUnified
    ? [{ id: 'unified', jsonRel: unifiedRel, nations: false }]
    : profileFilter
      ? BANKS.filter((b) => b.id === profileFilter)
      : BANKS;

  if (profileFilter && !banks.length) {
    console.error(`Profil inconnu : ${profileFilter}`);
    process.exit(2);
  }

  console.log(
    `LE RADAR — detect-photo-seasons (${doUpdate ? 'UPDATE' : 'dry-run'}` +
      `${doVisual ? ', visual' : ', text-only'}` +
      `${force ? ', force' : ''}` +
      `, minConf=${minConfidence})`
  );
  console.log(`Banques : ${banks.map((b) => b.id).join(', ')}\n`);

  const report = {
    banks: {},
    totals: { scanned: 0, tagged: 0, changed: 0, skipped: 0, low: 0 },
  };

  for (const bank of banks) {
    const loaded = loadJson(bank.jsonRel);
    if (!loaded) {
      console.log(`  ⚠ ${bank.id}: JSON manquant`);
      continue;
    }
    const photos = Array.isArray(loaded.data.photos) ? loaded.data.photos : [];
    const bankRep = {
      total: photos.length,
      changed: 0,
      skipped: 0,
      low: 0,
      samples: [],
    };

    // Visual batch for photos that need work
    const needWork = photos.filter((p) => !shouldSkip(p));
    let visualMap = new Map();
    if (doVisual && needWork.length) {
      console.log(`  ↘ ${bank.id}: analyse visuelle de ${needWork.length} photo(s)…`);
      visualMap = runVisualBatch(needWork);
      console.log(`  ↖ ${bank.id}: ${visualMap.size} réponse(s) visuelle(s)`);
    }

    for (const photo of photos) {
      report.totals.scanned += 1;
      const skip = shouldSkip(photo);
      if (skip) {
        bankRep.skipped += 1;
        report.totals.skipped += 1;
        continue;
      }

      const vid = photo.id || photo.url;
      const visualRow = visualMap.get(vid) || null;
      const { changed, det, reason } = applyDetection(photo, bank, visualRow);

      if (reason === 'cleared_uncertain') {
        bankRep.changed += 1;
        report.totals.changed += 1;
        continue;
      }
      if (reason === 'low_confidence' || !det.season) {
        bankRep.low += 1;
        report.totals.low += 1;
        continue;
      }

      report.totals.tagged += 1;
      if (changed) {
        bankRep.changed += 1;
        report.totals.changed += 1;
        if (bankRep.samples.length < 6) {
          bankRep.samples.push({
            title: photo.title || photo.id,
            season: photo.season,
            season6: photo.season6 || null,
            conf: photo.seasonConfidence,
            source: photo.seasonSource,
          });
        }
      }
    }

    report.banks[bank.id] = bankRep;

    console.log(
      `  ${bank.id}: ${photos.length} photos · Δ${bankRep.changed}` +
        ` · skip ${bankRep.skipped} · low ${bankRep.low}`
    );
    for (const s of bankRep.samples) {
      console.log(
        `    · ${s.season}${s.season6 ? '/' + s.season6 : ''} ` +
          `(${s.conf} ${s.source}) — ${s.title}`
      );
    }

    if (doUpdate) {
      loaded.data.photos = photos;
      loaded.data.updated = new Date().toISOString();
      loaded.data.lastSeasonDetect = new Date().toISOString();
      fs.writeFileSync(loaded.path, JSON.stringify(loaded.data, null, 2) + '\n', 'utf8');
      console.log(`  ✅ écrit ${bank.jsonRel}`);
    }
  }

  if (dryJson) {
    console.log(JSON.stringify(report, null, 2));
  }

  if (doUpdate && useUnified) {
    const n = photosLib.materializeLegacySlices(ROOT);
    console.log(`\n→ materialize photo-bank → slices JSON + photo-bank-data.js (${n} photos)`);
  }

  if (doUpdate && doSync) {
    console.log('\n→ bank:sync…');
    const sync = spawnSync('node', [path.join(ROOT, 'scripts/sync-quebec-backgrounds.js')], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    process.stdout.write(sync.stdout || '');
    if (sync.stderr) process.stderr.write(sync.stderr);
    if (sync.status !== 0) process.exit(sync.status || 1);
  } else if (doUpdate) {
    console.log('\nJSON mis à jour. Lancer `npm run bank:sync` pour régénérer les *-data.js (+ bump SW si shell).');
  } else {
    console.log('\nDry-run. Pour écrire : --update   Pour JS shell : --update --sync');
  }

  console.log(
    `\nTotaux : scannés ${report.totals.scanned} · tagués OK ${report.totals.tagged}` +
      ` · changés ${report.totals.changed} · skip ${report.totals.skipped} · low ${report.totals.low}`
  );
}

main();

#!/usr/bin/env node
/**
 * LE RADAR — annotation « visages » des banques de fonds
 *
 * Rôle : parcourir data/quebec-*-backgrounds.json, mesurer les visages sur la
 * vignette Commons (scripts/detect-photo-faces.py), et persister le résultat
 * dans le JSON : faces, faceRatio, faceDetectedAt.
 *
 * La porte de rejet, elle, est en Node (wallpaper-subject-lib → textGate /
 * auditPhotoHard) et lit le champ persisté : la CI n'a pas Python, mais une
 * fois la passe faite le verdict tient tout seul. Sans annotation, la porte
 * reste muette — elle ne bloque jamais une banque non annotée.
 *
 * Usage :
 *   node scripts/detect-photo-faces.js                  # rapport dry-run
 *   node scripts/detect-photo-faces.js --update         # écrit les JSON
 *   node scripts/detect-photo-faces.js --update --sync  # + bank:sync
 *   node scripts/detect-photo-faces.js --force          # ré-annote même si déjà fait
 *   node scripts/detect-photo-faces.js --profile nations
 *
 * Réseau (vignettes Commons) + opencv-python-headless/Pillow requis.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { FACE_MIN_RATIO } = require('./wallpaper-subject-lib');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const doUpdate = args.includes('--update');
const doSync = args.includes('--sync');
const force = args.includes('--force');

const profileFilter = (() => {
  const eq = args.find((a) => a.startsWith('--profile='));
  if (eq) return eq.slice('--profile='.length).trim().toLowerCase();
  const i = args.indexOf('--profile');
  if (i >= 0 && args[i + 1]) return String(args[i + 1]).trim().toLowerCase();
  return null;
})();

const BANKS = [
  { id: 'masthead', jsonRel: 'data/quebec-backgrounds.json' },
  { id: 'universities', jsonRel: 'data/quebec-university-backgrounds.json' },
  { id: 'pomo', jsonRel: 'data/quebec-pomo-backgrounds.json' },
  { id: 'nations', jsonRel: 'data/quebec-nations-backgrounds.json' },
  { id: 'favorites', jsonRel: 'data/quebec-favorites-backgrounds.json' },
];

function loadJson(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
}

/** Un seul spawn Python par banque : le script lit du JSONL sur stdin. */
function runFaceBatch(photos) {
  /** @type {Map<string, object>} */
  const byId = new Map();
  if (!photos.length) return byId;

  const py = path.join(ROOT, 'scripts/detect-photo-faces.py');
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
    console.warn('  ⚠ face python:', (res.stderr || '').slice(0, 400));
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
  if (force) return false;
  return typeof photo.faceDetectedAt === 'string' && photo.faceDetectedAt;
}

function main() {
  const banks = profileFilter
    ? BANKS.filter((b) => b.id === profileFilter)
    : BANKS;
  if (!banks.length) {
    console.error(`Profil inconnu : ${profileFilter}`);
    process.exit(1);
  }

  console.log(
    `LE RADAR — détection de visages (${banks.map((b) => b.id).join(', ')})\n`
  );

  const totals = { scanned: 0, annotated: 0, flagged: 0, errors: 0 };
  const flagged = [];

  for (const bank of banks) {
    const loaded = loadJson(bank.jsonRel);
    if (!loaded) {
      console.log(`  ⚠ ${bank.id}: JSON manquant`);
      continue;
    }
    const photos = Array.isArray(loaded.data.photos) ? loaded.data.photos : [];
    const needWork = photos.filter((p) => p && p.url && !shouldSkip(p));
    totals.scanned += photos.length;

    if (!needWork.length) {
      console.log(`  ${bank.id}: ${photos.length} photos · rien à annoter`);
      continue;
    }

    console.log(`  ↘ ${bank.id}: analyse de ${needWork.length} photo(s)…`);
    const rows = runFaceBatch(needWork);
    console.log(`  ↖ ${bank.id}: ${rows.size} réponse(s)`);

    let annotated = 0;
    for (const photo of photos) {
      const row = rows.get(photo.id || photo.url);
      if (!row) continue;
      if (row.error) {
        totals.errors += 1;
        continue;
      }
      photo.faces = Number(row.faces) || 0;
      photo.faceRatio = Number(row.faceRatio) || 0;
      photo.faceDetectedAt = new Date().toISOString();
      annotated += 1;
      if (photo.faces >= 1 && photo.faceRatio >= FACE_MIN_RATIO) {
        totals.flagged += 1;
        flagged.push(
          `${bank.id} · ${photo.title || photo.id} — ${photo.faces} visage(s), ` +
            `${(photo.faceRatio * 100).toFixed(2)} % de l'image`
        );
      }
    }
    totals.annotated += annotated;
    console.log(`  ${bank.id}: ${annotated} annotée(s)`);

    if (doUpdate && annotated) {
      loaded.data.photos = photos;
      loaded.data.updated = new Date().toISOString();
      loaded.data.lastFaceDetect = new Date().toISOString();
      fs.writeFileSync(
        loaded.path,
        JSON.stringify(loaded.data, null, 2) + '\n',
        'utf8'
      );
      console.log(`  ✅ écrit ${bank.jsonRel}`);
    }
  }

  if (flagged.length) {
    console.log('\nVisages au-dessus du seuil (à bannir après revue humaine) :');
    for (const f of flagged) console.log(`  · ${f}`);
  }

  if (doUpdate && doSync) {
    console.log('\n→ bank:sync…');
    const sync = spawnSync(
      'node',
      [path.join(ROOT, 'scripts/sync-quebec-backgrounds.js')],
      { encoding: 'utf8', cwd: ROOT }
    );
    process.stdout.write(sync.stdout || '');
    if (sync.stderr) process.stderr.write(sync.stderr);
    if (sync.status !== 0) process.exit(sync.status || 1);
  } else if (doUpdate) {
    console.log('\nJSON mis à jour. `npm run bank:check` pour le verdict HARD.');
  } else {
    console.log('\nDry-run. Pour écrire : --update');
  }

  console.log(
    `\nTotaux : scannés ${totals.scanned} · annotés ${totals.annotated}` +
      ` · signalés ${totals.flagged} · erreurs ${totals.errors}`
  );
}

main();

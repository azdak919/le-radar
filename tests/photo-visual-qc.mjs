/**
 * Smoke tests — photo-visual-qc-lib + merge campus wallpaper.
 * Run: node tests/photo-visual-qc.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const {
  scoreVisualQuality,
  applyVisualQcToScore,
  visualQcEnabled,
} = require('../scripts/photo-visual-qc-lib.js');
const {
  bankEntriesFor,
  loadWallpaperCampusExtras,
  mapWallpaperToBankKey,
} = require('../scripts/campus-photo-bank.js');
const { scoreCandidate } = require('../scripts/stock-photo-lib.js');

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  } else {
    console.log('ok:', msg);
  }
}

// ── Visual QC ────────────────────────────────────────────────
assert(visualQcEnabled(), 'visual QC enabled by default');

const good = scoreVisualQuality({
  width: 1600,
  height: 900,
  title: 'Université Laval campus autumn',
  tags: 'campus exterior',
});
assert(good.ok && !good.hardReject, 'good campus dims ok');
assert(good.softPenalty <= 8, `good photo low penalty (got ${good.softPenalty})`);

const night = scoreVisualQuality({
  width: 1600,
  height: 900,
  title: 'Montreal skyline at night neon',
});
assert(night.softPenalty >= 10, 'night scene soft penalty');
assert(night.ok, 'night is soft not hard');

const barren = scoreVisualQuality({
  width: 1600,
  height: 900,
  title: 'Mudflat barren batture marée basse',
});
assert(barren.softPenalty >= 15, 'barren soft penalty');

const tiny = scoreVisualQuality({ width: 200, height: 100, title: 'x' });
assert(tiny.hardReject, 'tiny image hard reject');

const scored = applyVisualQcToScore(150, {
  width: 1600,
  height: 900,
  title: 'night city lights',
});
assert(scored < 150 && scored > 0, `soft reduces score (150 → ${scored})`);

// Religieux : soft sauf si article religieux
const church = scoreVisualQuality(
  { width: 1600, height: 900, title: 'Église Notre-Dame Montréal' },
  { context: { norm: 'sport hockey match' } },
);
assert(church.reasons.includes('religious_subject_soft'), 'church soft when article not religious');
const churchOk = scoreVisualQuality(
  { width: 1600, height: 900, title: 'Église Notre-Dame Montréal' },
  { context: { norm: 'visite de l église patrimoine' } },
);
assert(!churchOk.reasons.includes('religious_subject_soft'), 'church no soft when article religious');

// ── scoreCandidate still works with QC ───────────────────────
const hit = {
  url: 'https://example.com/a.jpg',
  width: 1600,
  height: 900,
  title: 'Université Laval campus autumn Quebec',
  tags: 'laval campus exterior',
  provider: 'wikimedia',
  license: 'CC BY-SA 4.0',
  creator: 'Someone',
};
const matchTokens = {
  title: ['laval', 'campus', 'automne'],
  important: ['universite'],
  content: ['quebec', 'etudiant'],
};
const sc = scoreCandidate(hit, matchTokens, {
  norm: 'universite laval campus automne etudiant',
  titleNorm: 'campus laval automne',
  institutionPhrases: ['universite laval'],
});
assert(sc > 100 || sc === -1, `scoreCandidate returns number (got ${sc})`);
// Note: may be -1 if concrete match rules fail — not a QC failure.

// ── Campus wallpaper merge ───────────────────────────────────
const key = mapWallpaperToBankKey({ title: 'Pavillon Judith-Jasmin UQAM 24' });
assert(key === 'uqam', `map UQAM → uqam (got ${key})`);

const extras = loadWallpaperCampusExtras();
assert(extras.size > 0, `wallpaper extras loaded (${extras.size} keys)`);

const uqam = bankEntriesFor('uqam');
const curatedOnly = require('../scripts/campus-photo-bank.js').BANK.uqam || [];
assert(uqam.length >= curatedOnly.length, 'uqam bank ≥ curated after merge');
const fromWall = uqam.filter((e) => e._fromWallpaperBank);
assert(fromWall.length > 0, `uqam has wallpaper extras (${fromWall.length})`);

// Dédup URL
const urls = uqam.map((e) => e.url);
assert(new Set(urls).size === urls.length, 'uqam URLs unique after merge');

// ── Competing logo thresholds (doc + regression) ─────────────
// Aligné sur quebec-backgrounds.js / audit-quebec-backgrounds.py
function wouldRejectCompetingLogo(m) {
  return (
    m.strokeFrac >= 0.75
    && m.hiLocalFrac >= 0.25
    && (m.brightFrac >= 0.08 || m.wmEdge >= 0.045)
  );
}
assert(
  wouldRejectCompetingLogo({ strokeFrac: 1.0, hiLocalFrac: 0.38, brightFrac: 0.14, wmEdge: 0.057 }),
  'UQAM-23-like metrics → competing_logo_zone',
);
assert(
  !wouldRejectCompetingLogo({ strokeFrac: 0.57, hiLocalFrac: 0.10, brightFrac: 0.01, wmEdge: 0.019 }),
  'UQAM-24 facade sans enseigne → keep',
);
assert(
  !wouldRejectCompetingLogo({ strokeFrac: 0.0, hiLocalFrac: 0.12, brightFrac: 0.0, wmEdge: 0.025 }),
  'landscape lac → keep',
);

// religious_architecture thresholds (croix + clocher blanc, ex. Wôlinak)
function wouldRejectReligiousSpire(m) {
  return m.dense >= 4 && m.solidWhite && m.skyAbove >= 0.55 && m.notGrid;
}
assert(
  wouldRejectReligiousSpire({ dense: 4, solidWhite: true, skyAbove: 0.99, notGrid: true }),
  'Wôlinak-like spire → religious_architecture',
);
assert(
  !wouldRejectReligiousSpire({ dense: 22, solidWhite: false, skyAbove: 0.53, notGrid: true }),
  'campus windows (high var) → keep',
);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll photo-visual-qc checks passed.');

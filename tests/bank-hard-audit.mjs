/**
 * CI — audit HARD offline des banques fonds QC (0 réseau).
 * Run: node tests/bank-hard-audit.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  BANK_SPECS,
  auditPhotoHard,
  auditBankHard,
  RELIGIOUS_RE,
  TOWN_HALL_FACADE_RE,
} = require('../scripts/bank-hard-audit-lib');
const {
  RELIGIOUS_SUBJECT_RE,
  TOWN_HALL_FACADE_RE: TOWN_HALL_SHARED,
  SPIRE_THRESHOLDS,
  spireMetricsReject,
} = require('../scripts/religious-facade-lib');
const { matchHardBanned } = require('../scripts/quebec-backgrounds-blacklist');

const root = new URL('../', import.meta.url);
const readJson = (rel) =>
  JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));

// ── Unit : règles (lib partagée clocher / façade) ────────────
assert.equal(
  RELIGIOUS_RE.source,
  RELIGIOUS_SUBJECT_RE.source,
  'bank-hard et religious-facade partagent le même RE religieux',
);
assert.equal(
  TOWN_HALL_FACADE_RE.source,
  TOWN_HALL_SHARED.source,
  'town hall RE partagé',
);
assert.equal(SPIRE_THRESHOLDS.version, 1, 'SPIRE SYNC-ID religious-spire-v1');
assert.equal(SPIRE_THRESHOLDS.skyL, 0.5, 'skyL aligné JS/Python');
assert(
  spireMetricsReject({
    hitCount: 5,
    dense: 5,
    solidWhite: true,
    solidStone: false,
    multiPeaks: 0,
    skyAbove: 0.7,
    reject: false,
  }),
  'spireMetricsReject clocher blanc',
);
assert(
  spireMetricsReject({
    hitCount: 3,
    dense: 3,
    solidWhite: false,
    solidStone: true,
    multiPeaks: 2,
    skyAbove: 0.5,
    reject: false,
  }),
  'spireMetricsReject multi-tours pierre',
);
assert(RELIGIOUS_RE.test('Église Notre-Dame'), 'religious RE église');
assert(RELIGIOUS_RE.test('Pavillon Louis-Jacques-Casault'), 'religious RE casault');
assert(TOWN_HALL_FACADE_RE.test('Town hall of Vaudreuil'), 'town hall RE');

const bannedHit = matchHardBanned({
  url: 'https://upload.wikimedia.org/wikipedia/commons/b/b0/Vaudreuil-sur-le-Lac_QC.JPG',
  title: 'x',
});
assert(bannedHit, 'blacklist Vaudreuil match');

const church = auditPhotoHard(
  { title: 'Chapelle du village', url: 'https://example.com/a.jpg', width: 2000, height: 1200 },
  { id: 'masthead', landscape: true },
);
assert.equal(church.ok, false);
assert(church.reasons.includes('religious_subject'), 'church → religious_subject');

const town = auditPhotoHard(
  {
    title: 'Hôtel de ville de X',
    url: 'https://example.com/b.jpg',
    width: 2000,
    height: 1200,
  },
  { id: 'masthead', landscape: true },
);
assert(town.reasons.includes('town_hall_facade'), 'mairie → town_hall paysage');

const townUni = auditPhotoHard(
  {
    title: 'Hôtel de ville de X',
    url: 'https://example.com/b.jpg',
    width: 2000,
    height: 1200,
  },
  { id: 'universities', landscape: false },
);
assert(
  !townUni.reasons.includes('town_hall_facade'),
  'town hall non bloqué hors paysage',
);

const winterOk = auditPhotoHard(
  {
    title: 'Québec hiver paysage neige',
    url: 'https://example.com/w.jpg',
    width: 2000,
    height: 1200,
  },
  { id: 'masthead', landscape: true },
);
assert.equal(winterOk.ok, true, 'hiver/neige n’est pas HARD (saisonnier)');

const tiny = auditPhotoHard(
  { title: 'x', url: 'https://example.com/t.jpg', width: 800, height: 400 },
  { id: 'masthead', landscape: true },
);
assert(tiny.reasons.includes('low_resolution_width'), 'low res HARD');

// ── Intégration : banques live ───────────────────────────────
let total = 0;
let hard = 0;
for (const spec of BANK_SPECS) {
  const data = readJson(spec.jsonRel);
  const result = auditBankHard(data, spec);
  total += result.total;
  hard += result.failures.length;
  if (!result.ok) {
    console.error(`FAIL ${spec.id}:`);
    for (const f of result.failures) {
      console.error(`  [${f.reasons.join(', ')}] ${f.title || f.url}`);
    }
  }
  assert.equal(
    result.ok,
    true,
    `${spec.id}: ${result.failures.length} HARD en banque — purger ou blacklister`
  );
}

console.log(
  `OK bank-hard-audit (${total} photos, 0 HARD, ${BANK_SPECS.length} banques)`
);

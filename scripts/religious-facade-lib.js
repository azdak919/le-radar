/**
 * LE RADAR — constantes partagées « religieux / clocher / façade mairie »
 *
 * Source de vérité TEXTE pour :
 *   - maintain-quebec-backgrounds.js
 *   - bank-hard-audit-lib.js
 *   - photo-visual-qc-lib.js
 *
 * Seuils VISUELS (clocher / multi-tours) : miroir de
 *   quebec-backgrounds.js → _religiousSpireMetrics
 *   scripts/audit-quebec-backgrounds.py → religious_architecture
 *
 * Après changement de seuils : mettre à jour aussi le .py (commentaire SYNC)
 * et `npm run check` (tests unit).
 */

'use strict';

/**
 * Architecture cultuelle institutionnelle (titre / URL / description).
 * Spiritualité autochtone (tipi, inuksuk, pow-wow) volontairement hors regex.
 */
const RELIGIOUS_SUBJECT_SOURCE =
  String.raw`(?:église|eglise|church|cathedral|cathédrale|basilique|basilica|chapelle|chapel|coll[eé]giale|collegiale|crucifix|\bcroix\b|crosses?\b|mosquée|mosquee|mosque|synagogue|monastère|monastere|monastery|couvent|convent|calvaire|cimetière|cimetiere|cemetery|minaret|clocher|steeple|bell[\s-]?tower|paroisse|parish|presbyt[eè]re|presbytery|lieu de culte|place of worship|\bjésus\b|\bjesus\b|\bchrist\b|crucifi|temple\s+(?:bouddh|hindou|sikh)|tabernacle)`;

const RELIGIOUS_SUBJECT_RE = new RegExp(RELIGIOUS_SUBJECT_SOURCE, 'i');

/**
 * Pavillons campus (Casault, etc.) : tours / pierre grise ≠ lieu de culte.
 * Une chapelle / église nommée dans le titre n’est pas exceptée.
 */
const CAMPUS_BUILDING_EXCEPTION_SOURCE =
  String.raw`(?:casault|casseault|louis[\s_-]?jacques[\s_-]?casault|pavillon|palasis|bonenfant|adrien[\s_-]?pouliot|ferdinand[\s_-]?vandry|de[\s_-]?koninck|\bdkn\b|alphonse[\s_-]?marie[\s_-]?parent|biermans|ernest[\s_-]?lemieux|roger[\s_-]?gaudry|judith[\s_-]?jasmin|mcgreer|arts[\s_-]?building|henry[\s_.-]?f[.\s_-]?hall|loyola)`;

const CAMPUS_BUILDING_EXCEPTION_RE = new RegExp(CAMPUS_BUILDING_EXCEPTION_SOURCE, 'i');

/** Façades municipales type clocher — paysage mât/pomo seulement. */
const TOWN_HALL_FACADE_SOURCE =
  String.raw`(?:town[\s-]?hall|h[oô]tel[\s-]?de[\s-]?ville|city[\s-]?hall|\bmairie\b)`;

const TOWN_HALL_FACADE_RE = new RegExp(TOWN_HALL_FACADE_SOURCE, 'i');

/**
 * Seuils pixel clocher / multi-tours — garder en sync avec Python.
 * @see quebec-backgrounds.js _religiousSpireMetrics
 * @see audit-quebec-backgrounds.py (bloc religious_architecture)
 */
const SPIRE_THRESHOLDS = Object.freeze({
  // SYNC-ID: religious-spire-v1
  version: 1,
  skyL: 0.5,
  darkCrossMaxL: 0.32,
  armDarkMaxL: 0.36,
  minCrossHits: 3,
  minMultiPeaks: 2,
  // clocher blanc
  solidWhiteMeanMin: 0.55,
  solidWhiteVarMax: 0.18,
  solidWhiteFracMin: 0.5,
  rejectWhiteDenseMin: 4,
  rejectWhiteSkyAboveMin: 0.55,
  // pierre grise (Casault)
  solidStoneMeanMin: 0.36,
  solidStoneMeanMax: 0.78,
  solidStoneVarMax: 0.2,
  solidStoneLightFracMin: 0.42,
  rejectStoneDenseMin: 3,
  rejectStoneSkyAboveMin: 0.42,
  rejectStoneHitsMin: 3,
  // multi-tours
  rejectMultiSkyAboveMin: 0.4,
  rejectMultiHitsMin: 2,
  // pics silhouette
  peakDarkMaxL: 0.42,
  peakDownMin: 4,
  peakSepFrac: 0.12,
});

function entrySubjectHay(entry) {
  if (!entry) return '';
  return [
    entry.title,
    entry.url,
    entry.link,
    entry.credit,
    entry.description,
    entry.categories,
    entry.place,
  ]
    .filter(Boolean)
    .join(' ');
}

function isCampusTaggedPhoto(entry) {
  if (!entry) return false;
  if (entry.campus === true || entry.bank === 'universities') return true;
  return Array.isArray(entry.tags) && entry.tags.includes('campus');
}

function isCampusBuildingException(entry) {
  if (!entry) return false;
  const hay = entrySubjectHay(entry);
  if (RELIGIOUS_SUBJECT_RE.test(hay)) return false;
  if (isCampusTaggedPhoto(entry)) return true;
  return CAMPUS_BUILDING_EXCEPTION_RE.test(hay);
}

function looksReligiousSubject(entry) {
  if (!entry) return false;
  if (isCampusBuildingException(entry)) return false;
  return RELIGIOUS_SUBJECT_RE.test(entrySubjectHay(entry));
}

function looksTownHallFacade(entry) {
  if (!entry) return false;
  const hay = [
    entry.title,
    entry.url,
    entry.link,
    entry.description,
    entry.categories,
  ]
    .filter(Boolean)
    .join(' ');
  return TOWN_HALL_FACADE_RE.test(hay);
}

/**
 * Décide reject à partir de métriques déjà calculées (tests / audit).
 * @param {object} m  métriques type _religiousSpireMetrics
 */
function spireMetricsReject(m) {
  if (!m) return false;
  if (m.reject === true) return true;
  const t = SPIRE_THRESHOLDS;
  const hitN = Math.max(m.hitCount || 0, m.multiPeaks || 0);
  const dense = m.dense || 0;
  const notGrid = hitN <= Math.max(dense, 1) * 4.2;
  const solidWhite = !!m.solidWhite;
  const solidStone = !!m.solidStone;
  const solidBase = solidWhite || solidStone;
  const skyAbove = Number(m.skyAbove) || 0;
  const hits = m.hitCount || 0;
  const multiPeaks = m.multiPeaks || 0;

  const rejectWhite =
    dense >= t.rejectWhiteDenseMin &&
    solidWhite &&
    skyAbove >= t.rejectWhiteSkyAboveMin &&
    notGrid;
  const rejectStone =
    dense >= t.rejectStoneDenseMin &&
    solidStone &&
    skyAbove >= t.rejectStoneSkyAboveMin &&
    notGrid &&
    hits >= t.rejectStoneHitsMin;
  const rejectMulti =
    multiPeaks >= t.minMultiPeaks &&
    solidBase &&
    skyAbove >= t.rejectMultiSkyAboveMin &&
    (hits >= t.rejectMultiHitsMin || multiPeaks >= 3) &&
    notGrid;
  return rejectWhite || rejectStone || rejectMulti;
}

module.exports = {
  RELIGIOUS_SUBJECT_SOURCE,
  RELIGIOUS_SUBJECT_RE,
  CAMPUS_BUILDING_EXCEPTION_SOURCE,
  CAMPUS_BUILDING_EXCEPTION_RE,
  TOWN_HALL_FACADE_SOURCE,
  TOWN_HALL_FACADE_RE,
  SPIRE_THRESHOLDS,
  entrySubjectHay,
  isCampusTaggedPhoto,
  isCampusBuildingException,
  looksReligiousSubject,
  looksTownHallFacade,
  spireMetricsReject,
};

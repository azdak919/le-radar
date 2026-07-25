/**
 * QC visuelle partagée (mât wallpaper ↔ stock lead articles).
 *
 * Objectif : réutiliser des heuristiques *qualité* des bots mât
 * (résolution, ratio extrême, nuit, intérieur, sujet plat…) sans
 * imposer le score « wallpaper décoratif » aux illustrations éditoriales.
 *
 * Usage :
 *   - soft (défaut) : pénalités numériques pour scoreCandidate stock
 *   - hard : rejets nets seulement sur cas inutilisables en une
 *   - NE PAS appliquer aux images source scrapées (item.image)
 *
 * Désactiver : LE_RADAR_VISUAL_QC=0  ou  opts.enabled = false
 */

'use strict';

const {
  RELIGIOUS_SUBJECT_RE,
} = require('./religious-facade-lib');

/** Aligné sur article-image-lib (vedette). */
const LEAD_MIN_WIDTH = 720;
const LEAD_MIN_HEIGHT = 405;
const LEAD_MIN_PIXELS = 320_000;

/**
 * Résolution « confortable » héritée du mât (anti-grain retina).
 * Soft only pour le stock : sous ce seuil on pénalise, on ne rejette pas
 * si meetsLeadDisplaySize est déjà OK.
 */
const COMFORT_MIN_W = 1000;
const COMFORT_MIN_H = 560;
const COMFORT_MIN_PX = 700_000;

const NIGHT_SCENE_RE =
  /\b(?:night|nuit|twilight|cr[eé]puscule|after[\s-]?dark|illuminat|neon|nightlife)\b/i;

const INDOOR_OBJECT_RE =
  /\b(?:canot|canoe|kayak|museum|mus[eé]e|interior|int[eé]rieur|indoor|exhibit|exhibition|gallery|galerie|classroom|salle de classe|laboratoire|laboratory)\b/i;

const BARREN_SCENE_RE =
  /\b(?:ultramafic|barren|tundra|wasteland|rocky plain|quarry|carri[eè]re|mudflat|batture|mar[eé]e basse)\b/i;

// RELIGIOUS_SUBJECT_RE : source de vérité scripts/religious-facade-lib.js
// Soft only ici (articles) — hard pour wallpaper via bank-hard / maintain.

const ARCHIVAL_FLAT_RE =
  /\b(?:engraving|gravure|lithograph|etching|postcard|carte postale|glass plate|plaque de verre|s[eé]pia|monochrome|black[\s-]?and[\s-]?white|microfilm)\b/i;

function visualQcEnabled(opts = {}) {
  if (opts && opts.enabled === false) return false;
  if (opts && opts.enabled === true) return true;
  const env = String(process.env.LE_RADAR_VISUAL_QC || '1').trim().toLowerCase();
  return !(env === '0' || env === 'false' || env === 'off' || env === 'no');
}

function hitHay(hit = {}) {
  return [hit.title, hit.tags, hit.url, hit.creator, hit.license]
    .filter(Boolean)
    .join(' ');
}

/**
 * @param {{ width?: number, height?: number, title?: string, tags?: string, url?: string }} hit
 * @param {{ enabled?: boolean, mode?: 'soft'|'hard', context?: object }} [opts]
 * @returns {{
 *   ok: boolean,
 *   hardReject: boolean,
 *   reasons: string[],
 *   softPenalty: number,
 *   metrics: object
 * }}
 */
function scoreVisualQuality(hit = {}, opts = {}) {
  if (!visualQcEnabled(opts)) {
    return { ok: true, hardReject: false, reasons: [], softPenalty: 0, metrics: { skipped: true } };
  }

  const mode = opts.mode === 'hard' ? 'hard' : 'soft';
  const w = Number(hit.width) || 0;
  const h = Number(hit.height) || 0;
  const pixels = w * h;
  const aspect = h > 0 ? w / h : 0;
  const hay = hitHay(hit);
  const reasons = [];
  let softPenalty = 0;
  let hardReject = false;

  // ── Dimensions ──────────────────────────────────────────────
  if (w > 0 && h > 0) {
    if (
      w < LEAD_MIN_WIDTH
      || h < LEAD_MIN_HEIGHT
      || pixels < LEAD_MIN_PIXELS
    ) {
      // Déjà filtré par meetsLeadDisplaySize en amont — hard si on arrive ici.
      hardReject = true;
      reasons.push('low_resolution_lead');
    } else if (
      w < COMFORT_MIN_W
      || h < COMFORT_MIN_H
      || pixels < COMFORT_MIN_PX
    ) {
      softPenalty += 12;
      reasons.push('low_resolution_comfort');
    }

    // Ratio extrême : une/vedette ~ paysage ou carré large, pas panorama 5:1 ni portrait 2:3.
    if (aspect > 0 && aspect < 0.95) {
      softPenalty += 18;
      reasons.push('portrait_ratio');
    } else if (aspect > 2.6) {
      softPenalty += 14;
      reasons.push('ultra_wide_ratio');
    } else if (aspect >= 1.1 && aspect <= 2.2) {
      softPenalty -= 4; // léger bonus (aligné stock-photo-lib)
    }
  }

  // ── Heuristiques titre / tags (pas de pixels — sans CORS / download) ──
  if (NIGHT_SCENE_RE.test(hay)) {
    softPenalty += 16;
    reasons.push('night_scene_title');
  }
  if (INDOOR_OBJECT_RE.test(hay)) {
    softPenalty += 14;
    reasons.push('indoor_object_title');
  }
  if (BARREN_SCENE_RE.test(hay)) {
    softPenalty += 20;
    reasons.push('barren_scene_title');
  }
  if (ARCHIVAL_FLAT_RE.test(hay)) {
    // stock-photo-lib rejette déjà beaucoup d’archives ; renfort soft
    softPenalty += 22;
    reasons.push('archival_flat_title');
  }

  // Religieux : soft seulement ; neutre si l’article parle de religion.
  const ctxNorm = String(opts.context?.norm || opts.context?.titleNorm || '');
  const articleReligious = RELIGIOUS_SUBJECT_RE.test(ctxNorm);
  if (RELIGIOUS_SUBJECT_RE.test(hay) && !articleReligious) {
    softPenalty += 10;
    reasons.push('religious_subject_soft');
  }

  // Clamp pénalité (ne doit pas effacer un match thématique fort à lui seul)
  softPenalty = Math.max(0, Math.min(55, softPenalty));

  if (mode === 'hard' && softPenalty >= 40) {
    hardReject = true;
    reasons.push('hard_mode_soft_threshold');
  }

  return {
    ok: !hardReject,
    hardReject,
    reasons,
    softPenalty,
    metrics: {
      width: w,
      height: h,
      aspect: aspect ? Math.round(aspect * 1000) / 1000 : 0,
      pixels,
      mode,
    },
  };
}

/**
 * Applique le QC soft au score thématique existant.
 * @returns {number} score ajusté (peut devenir < 0)
 */
function applyVisualQcToScore(score, hit, opts = {}) {
  if (typeof score !== 'number' || score < 0) return score;
  const v = scoreVisualQuality(hit, { ...opts, mode: 'soft' });
  if (v.hardReject) return -1;
  return score - v.softPenalty;
}

module.exports = {
  visualQcEnabled,
  scoreVisualQuality,
  applyVisualQcToScore,
  LEAD_MIN_WIDTH,
  LEAD_MIN_HEIGHT,
  LEAD_MIN_PIXELS,
  COMFORT_MIN_W,
  COMFORT_MIN_H,
  COMFORT_MIN_PX,
  NIGHT_SCENE_RE,
  INDOOR_OBJECT_RE,
  BARREN_SCENE_RE,
  RELIGIOUS_SUBJECT_RE,
};

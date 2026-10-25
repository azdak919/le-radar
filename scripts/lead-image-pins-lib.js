/**
 * Corrections d'image persistantes (data/lead-image-pins.json).
 * Sans ce registre, une affiche-texte écartée par ensure-lead-images
 * revenait à la collecte suivante : fetch-news relit la page et remet
 * l'image vedette (contrôle d'URL seulement, sans dimensions) en effaçant
 * la photo de repli (Impact Campus, Québec en toutes lettres, 24-25 oct. 2026).
 */
const fs = require('fs');
const path = require('path');

const PINS_PATH = path.join(__dirname, '..', 'data', 'lead-image-pins.json');
let cache = null;

function normUrl(u = '') {
  try { const x = new URL(String(u).trim()); return (x.origin + x.pathname).replace(/\/+$/, '').toLowerCase(); } catch { return String(u).trim().toLowerCase(); }
}

function loadPins(file = PINS_PATH) {
  if (cache && file === PINS_PATH) return cache;
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { raw = {}; }
  const out = {
    reject: new Set((raw.rejectImages || []).map(normUrl)),
    pins: new Map(Object.entries(raw.pins || {}).map(([k, v]) => [normUrl(k), v])),
  };
  if (file === PINS_PATH) cache = out;
  return out;
}

function isPinnedReject(url = '', pins = loadPins()) {
  return !!url && pins.reject.has(normUrl(url));
}

/** Applique rejets + photos imposées ; retourne le nombre de billets modifiés. */
function applyLeadImagePins(items = [], pins = loadPins()) {
  let changed = 0;
  for (const item of items) {
    if (!item) continue;
    let touched = false;
    if (item.image && isPinnedReject(item.image, pins)) {
      item.image = '';
      item.leadImageReady = false;
      delete item.sourceImageCredit;
      touched = true;
    }
    const pin = pins.pins.get(normUrl(item.link));
    if (pin) {
      if (item.image && !pin.keepSourceImage) { item.image = ''; item.leadImageReady = false; delete item.sourceImageCredit; touched = true; }
      for (const [k, v] of Object.entries(pin)) {
        if (k === 'keepSourceImage') continue;
        if (item[k] !== v) { item[k] = v; touched = true; }
      }
    }
    if (touched) changed += 1;
  }
  return changed;
}

module.exports = { loadPins, isPinnedReject, applyLeadImagePins, normUrl, PINS_PATH };

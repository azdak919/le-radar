'use strict';
/**
 * Critères par source : lit `botHints` de news-sources.json (édition à la main).
 * Une source sans entrée garde le comportement général ; un critère invalide
 * (regex cassée, mauvais type) est ignoré pour cette source seulement.
 */
const fs = require('fs');
const path = require('path');

let cache = null;
function loadAll(file = path.join(__dirname, '..', 'news-sources.json')) {
  if (cache) return cache;
  cache = new Map();
  try {
    const reg = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const s of [...(reg.active || []), ...(reg.candidates || [])]) {
      if (s && s.name && s.botHints && typeof s.botHints === 'object' && !cache.has(s.name)) cache.set(s.name, s.botHints);
    }
  } catch { /* registre illisible : comportement général partout */ }
  return cache;
}

/** Bloc `botHints[bot]` d'une source (objet vide si absent). */
function sourceHints(sourceName = '', bot = '', { hints } = {}) {
  const all = hints || loadAll().get(sourceName) || {};
  const block = bot ? all[bot] : all;
  return block && typeof block === 'object' ? block : {};
}

/** Liste de motifs → RegExp valides (les motifs cassés sont ignorés). */
function patternList(list) {
  const out = [];
  for (const p of Array.isArray(list) ? list : []) {
    if (typeof p !== 'string' || !p) continue;
    try { out.push(new RegExp(p, 'i')); } catch { /* motif invalide : ignoré */ }
  }
  return out;
}

module.exports = { sourceHints, patternList, _reset: () => { cache = null; } };

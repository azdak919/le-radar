/* Institutional affiliation accents, not replacements for the stations’ own logos.
 * Primary values reuse brand-colors.json; primary sources/adaptations: docs/radio-palettes.md. */
'use strict';
const brands = require('../brand-colors.json').institutions;
const palettes = {
  cfak: ['usherbrooke', 'Université de Sherbrooke', '#018849', null],
  choq: ['uqam', 'UQAM', null, null],
  chyz: ['ulaval', 'Université Laval', null, '#FFC103'],
  cism: ['umontreal', 'Université de Montréal', '#0B113A', '#0B113A'],
  cjlo: ['concordia', 'Concordia University', null, '#CBB576'],
  ckut: ['mcgill', 'McGill University', '#9E0918', null],
};
function radioPalette(id) {
  const entry = palettes[id];
  if (!entry) return null;
  const [institution, brandKey, variant, companion] = entry;
  const primary = brands[brandKey].color;
  return { institution, primary, variant: variant || primary, companion: companion || primary };
}
function radioPaletteAttrs(id) {
  const p = radioPalette(id);
  return p ? ` data-radio-institution="${p.institution}" style="--station-brand:${p.primary};--station-variant:${p.variant};--station-companion:${p.companion}"` : '';
}
module.exports = { radioPalette, radioPaletteAttrs };

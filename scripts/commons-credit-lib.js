/**
 * LE RADAR — normalisation des crédits Wikimedia Commons
 *
 * Commons injecte souvent le gabarit :
 *   « No machine-readable author provided. NAME assumed (based on copyright claims). »
 * Affiché tel quel (et parfois auto-traduit), ça donne une ligne illisible
 * sous le mât. On extrait le nom supposé ou un libellé court.
 *
 * Utilisé par : maintain-quebec-backgrounds.js, scrub banks, tests.
 * Miroir runtime : quebec-backgrounds.js (sanitizeBgCredit).
 */

'use strict';

/**
 * @param {string} raw
 * @returns {string}
 */
function sanitizeCommonsCredit(raw) {
  if (raw == null) return '';
  let s = String(raw).replace(/\s+/g, ' ').trim();
  if (!s) return '';

  // EN : "No machine-readable author provided. Miguel Andrade assumed (based on copyright claims)."
  let m = s.match(
    /no machine-readable author provided\.?\s*(.+?)\s+assumed\s*\(\s*based on copyright claims\s*\)\.?/i
  );
  if (m) return _cleanName(m[1]);

  // FR (si stocké ou déjà traduit) :
  // "Aucun auteur lisible par machine n'est fourni, Miguel Andrade l'a supposé (…)."
  m = s.match(
    /aucun auteur lisible par machine n['’]est fourni[.,]?\s*(.+?)\s+l['’]a\s+suppos[ée]/i
  );
  if (m) return _cleanName(m[1]);

  // Variante sans nom extrait
  if (/^no machine-readable author provided\.?$/i.test(s)) {
    return 'Wikimedia Commons';
  }
  if (/^aucun auteur lisible par machine/i.test(s)) {
    return 'Wikimedia Commons';
  }

  // Tronquer les crédits monstrueux restants (HTML raté, listes…)
  if (s.length > 72) {
    const head = s.split(/\s*[—–|]\s*|\s*\(/)[0].trim();
    if (head.length >= 2 && head.length <= 60) s = head;
    else s = `${s.slice(0, 60).trim()}…`;
  }
  return s;
}

function _cleanName(name) {
  return String(name || '')
    .replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * Applique sanitizeCommonsCredit sur credit de chaque photo d’une banque.
 * @param {{ photos?: object[] }} bank
 * @returns {number} nombre de crédits modifiés
 */
function scrubBankCredits(bank) {
  if (!bank || !Array.isArray(bank.photos)) return 0;
  let n = 0;
  for (const p of bank.photos) {
    if (!p || p.credit == null) continue;
    const next = sanitizeCommonsCredit(p.credit);
    if (next !== p.credit) {
      p.credit = next;
      n += 1;
    }
  }
  return n;
}

module.exports = {
  sanitizeCommonsCredit,
  scrubBankCredits,
};

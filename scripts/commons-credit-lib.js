/**
 * LE RADAR — normalisation des crédits Wikimedia Commons
 *
 * Commons injecte souvent :
 *   « No machine-readable author provided. NAME assumed (based on copyright claims). »
 *   « Sam311 ( talk ) ( Uploads ) »
 *   « Andrea Schaffer from Sydney, Australia »
 * Affiché tel quel (et parfois auto-traduit), ça donne une ligne illisible
 * sous le mât. On extrait un libellé court et lisible.
 *
 * Utilisé par : maintain-quebec-backgrounds.js, scrub banks, tests.
 * Miroir runtime : quebec-backgrounds.js (sanitizeBgCredit) + pomo/js/backgrounds.js.
 */

'use strict';

/**
 * Pseudos Commons collés → nom affiché (identités publiques connues).
 * Clé = forme normalisée (minuscules, sans espaces).
 */
const CREDIT_DISPLAY_ALIASES = {
  jeangagnon: 'Jean Gagnon',
  danielhbordeleau: 'Daniel H. Bordeleau',
};

/**
 * @param {string} raw
 * @returns {string}
 */
function sanitizeCommonsCredit(raw) {
  if (raw == null) return '';
  let s = String(raw)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';

  // EN : "No machine-readable author provided. Miguel Andrade assumed (based on copyright claims)."
  let m = s.match(
    /no machine-readable author provided\.?\s*(.+?)\s+assumed\s*\(\s*based on copyright claims\s*\)\.?/i
  );
  if (m) return _finalizeCreditName(m[1]);

  // FR (si stocké ou déjà traduit) :
  // "Aucun auteur lisible par machine n'est fourni, Miguel Andrade l'a supposé (…)."
  m = s.match(
    /aucun auteur lisible par machine n['’]est fourni[.,]?\s*(.+?)\s+l['’]a\s+suppos[ée]/i
  );
  if (m) return _finalizeCreditName(m[1]);

  // Variante sans nom extrait
  if (/^no machine-readable author provided\.?$/i.test(s)) {
    return 'Wikimedia Commons';
  }
  if (/^aucun auteur lisible par machine/i.test(s)) {
    return 'Wikimedia Commons';
  }

  // Placeholder de licence Commons (pas un auteur)
  if (/you may select the license of your choice/i.test(s)) {
    return 'Wikimedia Commons';
  }

  // "MontrealNasa.jpg : NASA derivative work: MTLskyline ( talk )"
  m = s.match(/derivative\s+work:\s*(.+)$/i);
  if (m) {
    s = m[1].trim();
  } else {
    m = s.match(/^[^\s:]+\.(?:jpe?g|png|gif|webp)\s*:\s*(.+)$/i);
    if (m) s = m[1].trim();
  }

  // Bruit page utilisateur Commons : ( talk ), ( Uploads ), ( discussion ), …
  s = s.replace(
    /\s*\(\s*(?:talk|discussion|uploads|t[eé]l[eé]versements|contribs?|contributions)\s*\)/gi,
    ''
  );

  // "Nichole Ouellette/ouellette001.com"
  s = s.replace(/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/\S*)?$/i, '');

  // Flickr / Commons : "… from Sydney, Australia" / "… from Canada"
  s = s.replace(
    /\s+from\s+(?:North\s+)?[\p{L}][\p{L}\d'’.\-]*(?:\s+[\p{L}][\p{L}\d'’.\-]*)*(?:,\s*[\p{L}][\p{L}\d'’.\-]*(?:\s+[\p{L}][\p{L}\d'’.\-]*)*)?\s*$/u,
    ''
  );

  // Signature spam type « Blanchardb- Me • MyEars • MyMouth -timed »
  if (/[•]/.test(s) || /MyEars|MyMouth/i.test(s)) {
    const head = s.split(/[-–—]/)[0].trim();
    if (head.length >= 2) s = head;
  }

  return _finalizeCreditName(s);
}

/**
 * @param {string} name
 * @returns {string}
 */
function _cleanName(name) {
  return String(name || '')
    .replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '')
    .replace(/\s*([—–])\s*/g, ' $1 ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * Espaces, camelCase léger, alias, troncature.
 * @param {string} name
 * @returns {string}
 */
function _finalizeCreditName(name) {
  let s = _cleanName(name);
  if (!s) return '';

  // camelCase collé : AndreaSchaffer → Andrea Schaffer ; DannysFlamand → Dannys Flamand
  if (!/\s/.test(s) && s.length >= 8 && s.length <= 48 && /[a-z][A-Z]/.test(s)) {
    s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
    // Chiffres collés en fin de pseudo après scission : Irksome Buccaneer2635 → Irksome Buccaneer
    s = s.replace(/(\p{L})\d{2,}$/u, '$1');
  }

  const aliasKey = s.toLowerCase().replace(/\s+/g, '');
  if (CREDIT_DISPLAY_ALIASES[aliasKey]) {
    return CREDIT_DISPLAY_ALIASES[aliasKey];
  }

  // Tronquer les crédits monstrueux restants (HTML raté, listes…)
  if (s.length > 72) {
    const head = s.split(/\s*[—–|]\s*|\s*\(/)[0].trim();
    if (head.length >= 2 && head.length <= 60) return head;
    return `${s.slice(0, 60).trim()}…`;
  }
  return s;
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
  CREDIT_DISPLAY_ALIASES,
};

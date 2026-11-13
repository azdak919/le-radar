/**
 * Couleur d'établissement partagée (affiches « Une », La une sociale) :
 * couleur officielle de brand-colors.json, ajustée pour un contraste d'au moins 4,5:1
 * sur chaque fond donné ; repli : accent du support (couleur inconnue → '').
 * Mêmes alias et même algorithme que La une sociale (PR407, af17e4c6) — à réutiliser là aussi.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RadarInstitutionColor = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const BRAND_ALIAS = {
    concordia: 'Concordia University', mcgill: 'Université McGill', 'montréal': 'Université de Montréal', udem: 'Université de Montréal',
    laval: 'Université Laval', ulaval: 'Université Laval', sherbrooke: 'Université de Sherbrooke', udes: 'Université de Sherbrooke',
    uqtr: 'Université du Québec à Trois-Rivières', uqac: 'Université du Québec à Chicoutimi (UQAC)', uqar: 'Université du Québec à Rimouski (UQAR)',
    uqam: 'UQAM', "bishop's": "Bishop's University", polytechnique: 'Polytechnique Montréal', poly: 'Polytechnique Montréal',
    dawson: 'Dawson College', 'john abbott': 'John Abbott College', maisonneuve: 'Collège de Maisonneuve', montmorency: 'Collège Montmorency',
    'lionel-groulx': 'Collège Lionel-Groulx', 'vieux montréal': 'Cégep du Vieux Montréal',
  };
  function institutionColor(name, brand) {
    const B = brand || {};
    const raw = String(name || '').replace(/\s+—\s+.*$/, '').replace(/’/g, "'").trim();
    if (!raw) return '';
    const head = raw.split(',')[0].trim();
    const keys = [
      raw, head, raw.replace(/\s*\([^)]*\)\s*$/, ''),
      BRAND_ALIAS[head.toLowerCase()] || '',
      BRAND_ALIAS[head.replace(/^(Université|Cégep|Collège)\s+(de\s+|du\s+|d')?/i, '').toLowerCase()] || '',
    ];
    for (const k of keys) if (k && B[k] && B[k].color) return B[k].color;
    const low = raw.toLowerCase();
    const hit = Object.keys(B).find((k) => k.toLowerCase() === low);
    return hit ? B[hit].color : '';
  }
  function hex(h) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim());
    return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null;
  }
  function lum(c) {
    const v = c.map((x) => { const y = x / 255; return y <= 0.03928 ? y / 12.92 : ((y + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function ratio(a, b) {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  }
  /* Éclaircit (fonds sombres) ou fonce (fonds clairs) par pas de 8 % jusqu'à ≥ 4,5:1 sur TOUS les fonds. */
  function aaColor(h, bgs, target = 4.6) {
    let c = hex(h);
    if (!c) return '';
    const list = (bgs || []).map((b) => (Array.isArray(b) ? b : hex(b))).filter(Boolean);
    if (!list.length) return `rgb(${c.join(', ')})`;
    const dark = list.reduce((s, b) => s + lum(b), 0) / list.length < 0.18;
    const to = dark ? 255 : 0;
    for (let i = 0; i < 60 && list.some((b) => ratio(c, b) < target); i += 1) c = c.map((x) => Math.round(x + (to - x) * 0.08));
    return `rgb(${c.join(', ')})`;
  }
  /* Couleur prête à peindre : établissement ajusté AA, sinon l'accent fourni. */
  function paint(name, brand, bgs, accent) {
    return aaColor(institutionColor(name, brand), bgs) || accent;
  }
  return { BRAND_ALIAS, institutionColor, aaColor, paint, ratio, hex };
}));

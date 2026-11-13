/**
 * Couleur d'établissement partagée (affiches « Une », La une sociale) :
 * couleur officielle de brand-colors.json, ajustée pour un contraste d'au moins 4,5:1
 * sur chaque fond donné ; repli : accent du support (couleur inconnue → '').
 * Source unique : brand-colors.json (couleurs ET alias « aliases »), partagée avec La une sociale.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RadarInstitutionColor = api;
}(typeof self !== 'undefined' ? self : this, () => {
  /* Comparaison tolérante : sans accents, sans casse, apostrophes et espaces normalisés. */
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’`]/g, "'")
      .replace(/\s+/g, ' ').trim().toLowerCase();
  }
  /* Index nom / alias → couleur, construit depuis brand-colors.json seulement (aucune couleur ni alias en dur). */
  const cache = new WeakMap();
  function index(B) {
    if (cache.has(B)) return cache.get(B);
    const map = new Map();
    for (const [key, entry] of Object.entries(B)) {
      if (!entry || typeof entry !== 'object' || !/^#[0-9a-f]{6}$/i.test(String(entry.color || '').trim())) continue;
      for (const n of [key, ...(Array.isArray(entry.aliases) ? entry.aliases : [])]) {
        const k = norm(n);
        if (k && !map.has(k)) map.set(k, entry.color.trim());
      }
    }
    cache.set(B, map);
    return map;
  }
  function institutionColor(name, brand) {
    const B = brand && typeof brand === 'object' ? (brand.institutions || brand) : {};
    const raw = String(name || '').replace(/\s+—\s+.*$/, '').trim();
    if (!raw) return '';
    const map = index(B);
    const head = raw.split(',')[0].trim();
    const inParen = (/\(([^)]+)\)\s*$/.exec(raw) || [])[1] || '';
    const bare = raw.replace(/\s*\([^)]*\)\s*$/, '');
    const keys = [raw, head, bare, inParen, head.replace(/^(Université|Cégep|Collège|University|College)\s+(de\s+|du\s+|d['’]\s*|of\s+)?/i, '')];
    for (const k of keys) {
      const hit = k && map.get(norm(k));
      if (hit) return hit;
    }
    return '';
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
  return { institutionColor, aaColor, paint, ratio, hex, norm };
}));

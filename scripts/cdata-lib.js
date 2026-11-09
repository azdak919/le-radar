/**
 * Déballage CDATA — filet unique pour tout ce qui vient d'un flux RSS/Atom.
 *
 * Cas couverts :
 *   - <![CDATA[ … ]]> normal ;
 *   - CDATA échappé en entités (&lt;![CDATA[ … ]]&gt;, y compris double échappement) ;
 *   - CDATA TRONQUÉ (pas de ]]> : le contenu a été coupé à N caractères avant la fermeture —
 *     content:encoded WordPress > 8 000 car., McGill Daily 9 nov. 2026) ;
 *   - CDATA imbriqué (<![CDATA[ … <![CDATA[ … ]]>) ;
 *   - ]]> orphelin.
 * Aucun marqueur ne doit jamais atteindre les données, le HTML, les fils ni les accroches IA.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RadarCdata = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
'use strict';

const LT = '(?:&(?:amp;)*(?:lt|#0*60|#x0*3c);)';
const GT = '(?:&(?:amp;)*(?:gt|#0*62|#x0*3e);)';
const ESC_OPEN_RE = new RegExp(`${LT}(?=!\\[CDATA\\[)`, 'gi');
const ESC_CLOSE_RE = new RegExp(`\\]\\](?:${GT})`, 'g');
const ANY_RE = new RegExp(`!\\[CDATA\\[|\\]\\](?:>|${GT})`, 'i');
const CLOSED_RE = /<!\[CDATA\[([\s\S]*?)\]\]>/gi;
const OPEN_RE = /<!\[CDATA\[/gi;
const PARTIAL_OPEN_TAIL_RE = /<!\[(?:C(?:D(?:A(?:T(?:A)?)?)?)?)?$/;

/** Vrai si la chaîne porte un marqueur CDATA (ouvrant, fermant, entités comprises). */
function hasCdata(s) {
  return ANY_RE.test(String(s == null ? '' : s)) || PARTIAL_OPEN_TAIL_RE.test(String(s == null ? '' : s));
}

/** Retire tout marqueur CDATA ; le contenu emballé est conservé. */
function stripCdata(input) {
  let s = String(input == null ? '' : input);
  if (!hasCdata(s)) return s;
  s = s.replace(ESC_OPEN_RE, '<').replace(ESC_CLOSE_RE, ']]>');
  let prev;
  let guard = 0;
  do {
    prev = s;
    s = s.replace(CLOSED_RE, '$1');
    guard += 1;
  } while (s !== prev && guard < 6);
  const hadOpen = /<!\[CDATA\[/i.test(s);
  s = s.replace(OPEN_RE, '').replace(/\]\]>/g, '');
  // Fermeture elle-même tronquée (« …texte]] » / « …texte] ») après un ouvrant sans fermeture.
  if (hadOpen) s = s.replace(/\]{1,2}\s*$/, '');
  s = s.replace(PARTIAL_OPEN_TAIL_RE, '');
  return s;
}

/** Copie profonde d'un JSON : nettoie toutes les chaînes. Renvoie { value, changed }. */
function scrubDeep(value) {
  let changed = 0;
  const walk = (v) => {
    if (typeof v === 'string') {
      const t = stripCdata(v);
      if (t !== v) changed += 1;
      return t;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v)) o[k] = walk(v[k]);
      return o;
    }
    return v;
  };
  const out = walk(value);
  return { value: out, changed };
}

return { hasCdata, stripCdata, scrubDeep };
}));

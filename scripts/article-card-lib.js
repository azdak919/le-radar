/**
 * Cartes article partagées site ↔ app (Capacitor) : nettoyage des titres,
 * retrait du « Par Auteur » en tête de chapô, ordre des blocs par rôle
 * (À la une, vedettes, En bref, suite du fil) et date « fraîche ».
 * Chargé avant radar-news.js sur le site, copié dans mobile/www/site par
 * mobile/scripts/prepare.mjs. Aucune dépendance DOM.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RadarArticleCard = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
'use strict';

// Rubrique seulement si elle est suivie d’un séparateur ou collée à une majuscule
// (« OpinionLe… », « Critique : … ») — jamais un début de mot (« Reportages radio… »).
const MC_CATEGORY_PREFIX = /^(?:Photoreportage|Marché aux puces|Cobaye|Incursion|Reportage|Opinion|Entrevue|Critique|Chronique)(?:\s*[:：–—-]\s*|(?=\p{Lu}))/u;

function stripEmbeddedCss(title = '') {
  let t = String(title).trim();
  if (!/^\.[\w-]+\s*\{/.test(t) && !/@media/i.test(t)) return t;
  const start = t.indexOf('{');
  if (start === -1) return t;
  let depth = 0;
  for (let i = start; i < t.length; i += 1) {
    if (t[i] === '{') depth += 1;
    else if (t[i] === '}') {
      depth -= 1;
      if (depth === 0) return t.slice(i + 1).trim();
    }
  }
  return t;
}

/** Retire puces / symboles en tête, mais garde chiffres et lettres (« 14 bourses… »). */
function stripLeadingNonLetters(title = '') {
  return String(title).replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

/** Aligné sur scripts/html-entities-lib.js — inclut &eacute;, &ccedil;, etc. */
const NAMED_HTML_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: '\u00A0', hellip: '…', mdash: '—', ndash: '–',
  rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201D', ldquo: '\u201C',
  laquo: '«', raquo: '»',
  aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ',
  ccedil: 'ç', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
  ntilde: 'ñ', oacute: 'ó', ograve: 'ò', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
  uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü', yacute: 'ý', yuml: 'ÿ',
  Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ',
  Ccedil: 'Ç', Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Euml: 'Ë',
  Iacute: 'Í', Igrave: 'Ì', Icirc: 'Î', Iuml: 'Ï',
  Ntilde: 'Ñ', Oacute: 'Ó', Ograve: 'Ò', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø',
  Uacute: 'Ú', Ugrave: 'Ù', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý',
  oelig: 'œ', OElig: 'Œ',
};

function decodeNamedHtmlEntities(str = '') {
  return String(str).replace(/&([a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(NAMED_HTML_ENTITIES, name)
      ? NAMED_HTML_ENTITIES[name]
      : match
  ));
}

/** fromCodePoint sûr : couvre les caractères astraux (émojis) sans lever sur un code invalide. */
function safeFromCodePoint(code, fallback) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10FFFF) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

function decodeHtmlEntities(str = '') {
  let s = String(str);
  for (let pass = 0; pass < 3; pass += 1) {
    const prev = s;
    s = s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&#(\d+);/g, (m, n) => safeFromCodePoint(parseInt(n, 10), m))
      .replace(/&#x([0-9a-f]+);/gi, (m, n) => safeFromCodePoint(parseInt(n, 16), m))
      .replace(/&#0?39;/gi, '’');
    s = decodeNamedHtmlEntities(s)
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');
    if (s === prev) break;
  }
  return s;
}

function cleanTitle(title = '') {
  let t = decodeHtmlEntities(stripEmbeddedCss(title));
  t = t.replace(/\s+/g, ' ').trim();
  // Suffixes SEO collés aux og:title (Rank Math) — déjà stripés côté bot, mais
  // on nettoie aussi les news.json déjà en cache.
  t = t.replace(/\s*[–—|-]\s*Montréal\s+Campus\s*$/i, '').trim();
  t = t.replace(/\s*[–—|-]\s*Quartier\s+Libre\s*$/i, '').trim();
  t = t.replace(/\s*[–—|-]\s*Le\s+D[eé]lit\s*$/i, '').trim();
  t = t.replace(/\bUde\s+M\b/g, 'UdeM').replace(/\bUde\s+S\b/g, 'UdeS');
  t = t.replace(/\bMc\s+Gill\b/g, 'McGill');
  const prefix = t.match(MC_CATEGORY_PREFIX);
  if (prefix) t = t.slice(prefix[0].length).trim();
  t = stripLeadingNonLetters(t);
  // Titres doubles sans ponctuation (ex. « Magazines à potins En papier… »)
  return t.replace(
    /([\p{Ll}àâäéèêëïîôùûüç'’])\s+(En|Le|La|Les|L'|L'|Un|Une|The|A|An)\s+/gu,
    '$1 — $2 ',
  );
}

function stripLeadingByline(text = '', author = '') {
  if (!text || !author) return text;
  const escaped = author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text).replace(new RegExp(`^(?:Par|By)\\s+${escaped}\\s*`, 'iu'), '').trim();
}


/** Jour civil à Toronto (AAAA-MM-JJ). */
function torontoDay(value = Date.now()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Rouge « frais » : toute la journée civile québécoise (voir createArticle). */
function isFreshToday(iso, now = Date.now()) {
  if (!iso) return false;
  const day = torontoDay(iso);
  return Boolean(day) && day === torontoDay(now);
}

/**
 * Ordre des blocs d’une carte, identique au site.
 * - lead : bandeau, méta, titre, byline, photo, chapô (+ Lire la suite)
 * - feature / compact avec photo : méta, titre, byline, photo, chapô
 * - suite du fil / En bref sans photo : méta, photo d’abord, titre, byline, chapô
 */
function cardSlots(role = 'standard', hasMedia = false) {
  if (role === 'lead') return ['eyebrow', 'meta', 'title', 'byline', 'media', 'brief'];
  if (role === 'feature' || (role === 'compact' && hasMedia)) {
    return ['meta', 'title', 'byline', 'media', 'brief'];
  }
  return ['meta', 'media', 'title', 'byline', 'brief'];
}

return {
  MC_CATEGORY_PREFIX,
  decodeHtmlEntities,
  cleanTitle,
  stripLeadingByline,
  torontoDay,
  isFreshToday,
  cardSlots,
};
}));

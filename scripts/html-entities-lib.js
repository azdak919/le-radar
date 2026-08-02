/**
 * Décodage HTML — entités numériques, nommées (é, è, ç, …) et double-encodage (&amp;eacute;).
 * Partagé par les bots Node ; garder decodeHtmlEntities() dans app.js aligné.
 */

const NAMED_HTML_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00A0',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201D',
  ldquo: '\u201C',
  laquo: '«',
  raquo: '»',
  bull: '•',
  middot: '·',
  aacute: 'á',
  agrave: 'à',
  acirc: 'â',
  atilde: 'ã',
  auml: 'ä',
  aring: 'å',
  aelig: 'æ',
  ccedil: 'ç',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  euml: 'ë',
  iacute: 'í',
  igrave: 'ì',
  icirc: 'î',
  iuml: 'ï',
  ntilde: 'ñ',
  oacute: 'ó',
  ograve: 'ò',
  ocirc: 'ô',
  otilde: 'õ',
  ouml: 'ö',
  oslash: 'ø',
  uacute: 'ú',
  ugrave: 'ù',
  ucirc: 'û',
  uuml: 'ü',
  yacute: 'ý',
  yuml: 'ÿ',
  Aacute: 'Á',
  Agrave: 'À',
  Acirc: 'Â',
  Atilde: 'Ã',
  Auml: 'Ä',
  Aring: 'Å',
  AElig: 'Æ',
  Ccedil: 'Ç',
  Eacute: 'É',
  Egrave: 'È',
  Ecirc: 'Ê',
  Euml: 'Ë',
  Iacute: 'Í',
  Igrave: 'Ì',
  Icirc: 'Î',
  Iuml: 'Ï',
  Ntilde: 'Ñ',
  Oacute: 'Ó',
  Ograve: 'Ò',
  Ocirc: 'Ô',
  Otilde: 'Õ',
  Ouml: 'Ö',
  Oslash: 'Ø',
  Uacute: 'Ú',
  Ugrave: 'Ù',
  Ucirc: 'Û',
  Uuml: 'Ü',
  Yacute: 'Ý',
  oelig: 'œ',
  OElig: 'Œ',
  scaron: 'š',
  Scaron: 'Š',
};

const NAMED_ENTITY_RE = /&([a-zA-Z][a-zA-Z0-9]{1,31});/g;

function decodeNamedEntities(str = '') {
  return String(str).replace(NAMED_ENTITY_RE, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(NAMED_HTML_ENTITIES, name)) {
      return NAMED_HTML_ENTITIES[name];
    }
    return match;
  });
}

function decodeHtmlEntities(str = '', { maxPasses = 3 } = {}) {
  let s = String(str);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const prev = s;
    s = s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
      .replace(/&#0?39;/g, '’')
      .replace(NAMED_ENTITY_RE, (match, name) => (
        Object.prototype.hasOwnProperty.call(NAMED_HTML_ENTITIES, name)
          ? NAMED_HTML_ENTITIES[name]
          : match
      ))
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    if (s === prev) break;
  }
  return s;
}

/** Alias historique des scripts existants. */
function decodeEntities(str = '') {
  return decodeHtmlEntities(str);
}

function stripHtml(html = '') {
  return decodeHtmlEntities(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Majuscules isolées qui sont de vrais mots — « À cette fin… », « A student… »,
 * « I would… », « O Canada », « Y a-t-il… ». Jamais recollées au mot suivant.
 */
const STANDALONE_CAPITAL_WORD_RE = /^[AÀÂIÎOÔY]$/u;

/**
 * WP `has-drop-cap` : la lettrine est dans son propre élément
 * (« <span>L</span>e 18 juin… »), donc le strip HTML laisse une espace :
 * « L e 18 juin ». On recolle la lettre au reste de son mot.
 *
 * Exception : une majuscule qui forme un mot à elle seule est laissée telle
 * quelle, sinon « À cette fin » devenait « Àcette fin ». Contrepartie assumée :
 * une vraie lettrine sur ces lettres-là (« A près de 300 personnes ») reste
 * détachée — un espace de trop est moins grave qu’un mot fusionné, et le cas
 * ne s’est jamais présenté alors que les phrases en « À … » sont courantes.
 */
function fixDropCapSpacing(text = '') {
  return String(text)
    .replace(/^([\p{Lu}])\s+(['’])/u, '$1$2')
    .replace(/^([\p{Lu}])\s+([\p{Ll}])/u, (match, cap, next) => (
      STANDALONE_CAPITAL_WORD_RE.test(cap) ? match : `${cap}${next}`
    ));
}

module.exports = {
  NAMED_HTML_ENTITIES,
  decodeHtmlEntities,
  decodeEntities,
  stripHtml,
  fixDropCapSpacing,
  STANDALONE_CAPITAL_WORD_RE,
};
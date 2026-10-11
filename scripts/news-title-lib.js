/**
 * Nettoyage des titres RSS/HTML (Montréal Campus et assimilés).
 *
 * Problème fréquent : le titre WP contient du HTML
 *   <span class="t2">Kicker</span><span>Titre</span>
 * WordPress le verse dans le RSS en retirant les balises SANS espace →
 * « UQAMCe que… », « pucesIncursion… ». On répare à l’ingestion.
 */

const { stripHtml } = require('./html-entities-lib');

/** Rubriques Montréal Campus collées au titre (souvent après une fuite CSS). */
const MC_SERIES_LABEL = /^(Photoreportage|Marché aux puces|Cobaye|Reportage photo)(?:\s*[:：–—-]\s*|\s+)(.+)$/iu;

/** Marques / acronymes à ne pas fendre avec fixCamelGlue. */
const PROTECTED_TOKENS_RE = /\b(LeRadar|iPhone|iPad|iOS|McGill|UdeM|UdeS)\b/g;

/**
 * Kicker + titre structurés (span.t2 + span) — on garde « Kicker : Titre »
 * avant que stripHtml ne fonde les deux blocs.
 */
function extractStructuredTitle(raw = '') {
  const html = String(raw);
  if (!/<span\b/i.test(html)) return '';
  const m = html.match(
    /<span\b[^>]*\bclass\s*=\s*['"][^'"]*\bt2\b[^'"]*['"][^>]*>([\s\S]*?)<\/span>\s*<span\b[^>]*>([\s\S]*?)<\/span>/i,
  );
  if (!m) return '';
  const kicker = stripHtml(m[1]).replace(/\s+/g, ' ').trim();
  const rest = stripHtml(m[2]).replace(/\s+/g, ' ').trim();
  if (!kicker || !rest) return '';
  return `${kicker} : ${rest}`;
}

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
  const t = String(title);
  // Garder un guillemet ouvrant en tête (« Citation » : …) — sinon on
  // produit des titres déséquilibrés « …extrême » : … ».
  const m = t.match(/^[^\p{L}\p{N}]*?([«“"‘]\s*)(?=[\p{L}\p{N}])/u);
  if (m) {
    const q = m[1].trim();
    return `${q === '«' ? '« ' : q}${t.slice(m[0].length)}`.trim();
  }
  return t.replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

/** » sans « : restaurer le guillemet ouvrant en tête (citation en ouverture). */
function balanceGuillemets(title = '') {
  const t = String(title).trim();
  const opens = (t.match(/«/g) || []).length;
  const closes = (t.match(/»/g) || []).length;
  if (closes > opens && opens === 0 && closes === 1) return `« ${t}`;
  return t;
}

function normTitleKey(s = '') {
  return String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[’']/g, "'").replace(/[^\p{L}\p{N}']+/gu, ' ').trim();
}

/**
 * Titre de site (og:title global d’une SPA, <title> générique) plutôt
 * que titre d’article : égal au nom de source, ou « Source - slogan ».
 */
function isSiteNameTitle(title = '', sourceName = '', siteNames = []) {
  const t = normTitleKey(title);
  if (!t) return false;
  const names = [sourceName, ...siteNames].map(normTitleKey).filter(Boolean);
  for (const n of names) {
    if (t === n) return true;
    if (new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-–—|:]`).test(
      String(title).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’']/g, "'"),
    )) return true;
  }
  if (/\bjournal (des|etudiant)|\bstudent (news|newspaper)\b/.test(t) && /\s[-–—|]\s/.test(title)) return true;
  return false;
}

/**
 * Répare les collages dus au strip de balises sans séparateur.
 * - minuscule → Majuscule : « pucesIncursion » → « puces Incursion »
 * - acronyme (2+ caps) → Mot capitalisé : « UQAMCe » → « UQAM : Ce »
 *   (le « : » reflète kicker/sous-titre MC ; exige 2+ capitals consécutifs
 *   pour ne pas toucher McGill, iPhone, LeRadar).
 */
function fixCamelGlue(title = '') {
  const protected = [];
  let t = String(title).replace(PROTECTED_TOKENS_RE, (m) => {
    const idx = protected.length;
    protected.push(m);
    return `\u0000${idx}\u0000`;
  });
  t = t.replace(
    /([\p{Ll}éèêëàâäùûüôöîïç])([\p{Lu}ÀÂÄÉÈÊËÎÏÔÖÙÛÜ])/gu,
    '$1 $2',
  );
  t = t.replace(
    /([\p{Lu}ÀÂÄÉÈÊËÎÏÔÖÙÛÜ]{2,})([\p{Lu}ÀÂÄÉÈÊËÎÏÔÖÙÛÜ][\p{Ll}])/gu,
    '$1 : $2',
  );
  t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => protected[Number(i)]);
  return t;
}

/** Recolle les marques légitimes si un protect a manqué. */
function rejoinKnownTokens(title = '') {
  return String(title)
    .replace(/\bUde\s+M\b/g, 'UdeM')
    .replace(/\bUde\s+S\b/g, 'UdeS')
    .replace(/\bMc\s+Gill\b/g, 'McGill')
    .replace(/\bi\s+Phone\b/g, 'iPhone')
    .replace(/\bi\s+Pad\b/g, 'iPad')
    .replace(/\bi\s+OS\b/g, 'iOS');
}

function sanitizeTitle(title = '') {
  const raw = String(title ?? '');
  const structured = extractStructuredTitle(raw);
  let t = structured || stripHtml(stripEmbeddedCss(raw));
  // CSS encore en tête après un strip partiel (RSS WP).
  t = stripEmbeddedCss(t);
  t = fixCamelGlue(t).replace(/\s+/g, ' ').trim();
  t = rejoinKnownTokens(t);
  // Retirer les suffixes SEO Rank Math / Yoast des og:title
  t = t.replace(/\s*[–—|-]\s*Montréal\s+Campus\s*$/i, '').trim();
  t = t.replace(/\s*[–—|-]\s*Quartier\s+Libre\s*$/i, '').trim();
  t = t.replace(/\s*[–—|-]\s*Le\s+D[eé]lit\s*$/i, '').trim();
  const series = t.match(MC_SERIES_LABEL);
  if (series) {
    const label = series[1].trim();
    const rest = series[2].trim();
    if (rest) return balanceGuillemets(stripLeadingNonLetters(`${label} : ${rest}`));
  }
  return balanceGuillemets(stripLeadingNonLetters(t));
}

module.exports = {
  MC_SERIES_LABEL,
  extractStructuredTitle,
  stripEmbeddedCss,
  stripLeadingNonLetters,
  fixCamelGlue,
  rejoinKnownTokens,
  sanitizeTitle,
  balanceGuillemets,
  isSiteNameTitle,
};

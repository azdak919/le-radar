'use strict';
/**
 * Filtre général des faux articles (3 nov. 2026 : « AI Content » de The Plant,
 * billet vidéo sans texte, extrait = menu WordPress, image = logo du site ;
 * 10 nov. 2026 : mot croisé de The Concordian, extrait = inscription Substack).
 *   - pages non-articles : catégories, étiquettes, pages, politiques ;
 *   - titre ou adresse d'un mot croisé, sudoku ou casse-tête ;
 *   - extrait fait du texte d'interface WordPress, d'une infolettre, ou réduit à une URL ;
 *   - image = logo / icône du site (retirée, le repli du site prend le relais).
 */
const NON_ARTICLE_PATH = /\/(?:category|categorie|tag|etiquette|author|auteur|page|pages)\/|\/(?:[a-z-]*-)?(?:policy|policies|politique|privacy|confidentialite|terms|conditions|about|a-propos|contact|subscribe|abonnement)\/$/i;
const WP_CHROME = /\b(?:Reblog|Subscribed?|Sign me up|Log in now|Have a WordPress\.com account|Like this:|Share this:|Loading\.\.\.)\b/gi;
const LOGO_IMAGE = /(?:^|[\/_-])(?:logo|favicon|site-?icon|cropped-[^\/]*icon|apple-touch-icon)[^\/]*$/i;
/** Genre clairement identifié dans le titre (mots croisés, sudoku, mots cachés). */
const PUZZLE_GENRE = /\b(?:crossword|sudokus?|word[\s-]*search|mots?[\s-]+crois[ée]s?|mots?[\s-]+cach[ée]s?|mots?[\s-]+m[êe]l[ée]s?)\b/i;
/** « Puzzle » seulement en tête, en queue, ou précédé d'un marqueur de rubrique. */
const PUZZLE_AS_TITLE = /(?:^|(?:weekly|daily|sunday|samedi|dimanche|hebdo)\s+)puzzles?\b|\bpuzzles?\s*$/i;
const PUZZLE_PATH = /(?:^|\/|-)(?:crossword|sudokus?|word-?search|mots?-crois[ée]s?|mots?-cach[ée]s?|mots?-m[eê]l[eé]s?)(?:s)?$/i;
/** Appels à s'inscrire (infolettre, Substack, « Sign up to contribute »). */
const NEWSLETTER_CTA = /sign\s+up\s+to\s+contribute|sign\s+me\s+up|subscribe\s+to\s+our\s+substack|subscribe\s+to\s+our\s+(?:weekly\s+)?(?:section\s+)?newsletters?|abonnez[- ]vous\s+[àa]\s+notre\s+(?:infolettre|newsletter)|pitch\s+list/i;
const NEWSLETTER_BLOCKS = [
  /\bsign\s+up\s+to\s+contribute\b[!.,:]?\s*/gi,
  /\bsubscribe\s+to\s+our\s+substack\b[^.!?]{0,280}[.!?…]*/gi,
  /\bsubscribe\s+to\s+our\s+(?:weekly\s+)?(?:section\s+)?newsletters?\b[^.!?]{0,200}[.!?…]*/gi,
  /\babonnez[- ]vous\s+[àa]\s+notre\s+(?:infolettre|newsletter)\b[^.!?]{0,200}[.!?…]*/gi,
  /\bwe['’]ll\s+send\s+you\s+our\s+pitches\b[^.!?]{0,200}[.!?…]*/gi,
  /\bif\s+you\s+see\s+one\s+you['’]?re\s+interested\s+in\b[^.!?]{0,200}[.!?…]*/gi,
  /\byou\s+can\s+sign\s+up\s+to\s+cover\s+it\b[^.!?]{0,80}[.!?…]*/gi,
  /\band\s+be\s+added\s+to\s+our\s+pitch\s+list\b[.!?…]*/gi,
  /(?:➜|→)\s*sign\s+me\s+up\b[.!?…]*/gi,
  /\bsign\s+me\s+up\b[.!?…]*/gi,
];
const MIN_MEANINGFUL = 24;

const { sourceHints, patternList } = require('./source-hints');

/**
 * Critères propres à la source (news-sources.json → botHints.filter) :
 *   excludePathPatterns, rejectExcerptPatterns, logoImagePatterns (regex texte).
 */
function filterHints(item = {}, opts = {}) {
  const h = sourceHints(item.source, 'filter', opts);
  return {
    paths: patternList(h.excludePathPatterns),
    excerpts: patternList(h.rejectExcerptPatterns),
    logos: patternList(h.logoImagePatterns),
  };
}

const text = (s = '') => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function isUrlOnly(s = '') {
  const t = text(s);
  return !!t && /^(?:https?:\/\/\S+\s*)+$/i.test(t);
}

/** Titre ou adresse d'un mot croisé, sudoku, mots cachés ou casse-tête. */
function isPuzzleItem(item = {}) {
  const title = text(item.title);
  if (title && (PUZZLE_GENRE.test(title) || PUZZLE_AS_TITLE.test(title))) return true;
  let path = '';
  try { path = decodeURIComponent(new URL(item.link).pathname); } catch { path = String(item.link || ''); }
  path = path.replace(/\/+$/, '');
  return PUZZLE_PATH.test(path);
}

/** Retire les appels à s'inscrire ; laisse le vrai texte d'article. */
function stripNewsletterBoilerplate(s = '') {
  let t = text(s);
  if (!t) return '';
  for (const re of NEWSLETTER_BLOCKS) {
    re.lastIndex = 0;
    t = t.replace(re, ' ');
  }
  return t.replace(/\s+/g, ' ').replace(/^[,\s;:…\-–—➜→]+|[,\s;:…\-–—➜→]+$/g, '').trim();
}

function hasNewsletterCta(s = '') {
  NEWSLETTER_CTA.lastIndex = 0;
  return NEWSLETTER_CTA.test(text(s));
}

/** Texte réellement utilisable après retrait des inscriptions. */
function meaningfulExcerpt(s = '') {
  const stripped = stripNewsletterBoilerplate(s);
  return stripped.length >= MIN_MEANINGFUL ? stripped : '';
}

/** Vrai si l'extrait est surtout du texte d'interface WordPress. */
function isWpChromeExcerpt(s = '') {
  const t = text(s);
  if (!t) return false;
  const hits = t.match(WP_CHROME) || [];
  if (hits.length < 2) return false;
  const rest = t.replace(WP_CHROME, '').replace(/\b(?:Comment|The \w+|Log in|now|Have a|account\??)\b/gi, '').replace(/[\s.?!:,]/g, '');
  return rest.length < 60;
}

function isNonArticleLink(link = '') {
  try { return NON_ARTICLE_PATH.test(new URL(link).pathname.replace(/\/+$/, '') + '/'); } catch { return false; }
}

function isLogoImage(url = '', item = {}, opts = {}) {
  if (!url) return false;
  const u = String(url).split(/[?#]/)[0];
  if (LOGO_IMAGE.test(u)) return true;
  return filterHints(item, opts).logos.some((re) => re.test(u));
}

/** Raison du rejet, ou '' si le billet est un vrai article. */
function nonArticleReason(item = {}, opts = {}) {
  if (isNonArticleLink(item.link)) return 'page non-article';
  const h = filterHints(item, opts);
  let p = '';
  try { p = new URL(item.link).pathname; } catch { p = String(item.link || ''); }
  if (h.paths.some((re) => re.test(p))) return 'page exclue (critère de la source)';
  // Critère de la source : sur l'extrait du flux seulement. Le menu WordPress
  // collé en leadExcerpt est effacé (filterNonArticles), jamais un motif de rejet
  // quand le flux a du vrai texte (Horoscope de The Plant, 3 nov. 2026).
  if (h.excerpts.some((re) => re.test(text(item.excerpt)))) return 'extrait rejeté (critère de la source)';
  if (isPuzzleItem(item)) return 'mots croisés / casse-tête';
  const ex = item.excerpt || '';
  const lead = item.leadExcerpt || '';
  if (isWpChromeExcerpt(ex) || isWpChromeExcerpt(lead)) {
    if (!text(ex) || isUrlOnly(ex) || isWpChromeExcerpt(ex)) return 'extrait = interface WordPress';
  }
  if (isUrlOnly(ex) && (!text(lead) || isWpChromeExcerpt(lead))) return 'extrait = URL seule';
  const raw = text(ex) || text(lead);
  if (raw && !meaningfulExcerpt(ex) && !meaningfulExcerpt(lead) && (hasNewsletterCta(ex) || hasNewsletterCta(lead))) {
    return 'extrait = inscription infolettre';
  }
  return '';
}

/**
 * Retire les faux articles, enlève les logos utilisés comme image.
 * Une même image sur ≥ 3 billets distincts d'une source = logo du site.
 */
function filterNonArticles(items = [], { log = () => {}, ...opts } = {}) {
  const bySrcImg = new Map();
  for (const it of items) {
    if (!it || !it.image) continue;
    const k = `${it.source}\u0000${String(it.image).split(/[?#]/)[0]}`;
    bySrcImg.set(k, (bySrcImg.get(k) || new Set()).add(it.link));
  }
  const kept = [];
  for (const it of items) {
    if (!it) continue;
    const why = nonArticleReason(it, opts);
    if (why) { log(`✂ faux article (${why}) : ${it.source} — ${it.title}`); continue; }
    const k = `${it.source}\u0000${String(it.image || '').split(/[?#]/)[0]}`;
    if (it.image && (isLogoImage(it.image, it, opts) || (bySrcImg.get(k)?.size || 0) >= 3)) {
      log(`✂ logo retiré comme image : ${it.source} — ${it.title}`);
      it.image = '';
      it.leadImageReady = false;
      for (const f of ['imageLocal', 'imageLocalKey', 'imageLocalVia', 'sourceImageCredit']) delete it[f];
    }
    if (it.leadExcerpt && isWpChromeExcerpt(it.leadExcerpt)) delete it.leadExcerpt;
    if (text(it.excerpt) && hasNewsletterCta(it.excerpt)) {
      const cleaned = stripNewsletterBoilerplate(it.excerpt);
      if (cleaned) it.excerpt = cleaned;
      else it.excerpt = '';
    }
    if (it.leadExcerpt && hasNewsletterCta(it.leadExcerpt)) {
      const cleaned = stripNewsletterBoilerplate(it.leadExcerpt);
      if (cleaned) it.leadExcerpt = cleaned;
      else delete it.leadExcerpt;
    }
    kept.push(it);
  }
  return kept;
}

module.exports = { filterNonArticles, nonArticleReason, isWpChromeExcerpt, isUrlOnly, isNonArticleLink, isLogoImage, isPuzzleItem, stripNewsletterBoilerplate };

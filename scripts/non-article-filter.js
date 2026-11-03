'use strict';
/**
 * Filtre général des faux articles (3 nov. 2026 : « AI Content » de The Plant,
 * billet vidéo sans texte, extrait = menu WordPress, image = logo du site).
 *   - pages non-articles : catégories, étiquettes, pages, politiques ;
 *   - extrait fait du texte d'interface WordPress, ou réduit à une URL ;
 *   - image = logo / icône du site (retirée, le repli du site prend le relais).
 */
const NON_ARTICLE_PATH = /\/(?:category|categorie|tag|etiquette|author|auteur|page|pages)\/|\/(?:[a-z-]*-)?(?:policy|policies|politique|privacy|confidentialite|terms|conditions|about|a-propos|contact|subscribe|abonnement)\/$/i;
const WP_CHROME = /\b(?:Reblog|Subscribed?|Sign me up|Log in now|Have a WordPress\.com account|Like this:|Share this:|Loading\.\.\.)\b/gi;
const LOGO_IMAGE = /(?:^|[\/_-])(?:logo|favicon|site-?icon|cropped-[^\/]*icon|apple-touch-icon)[^\/]*$/i;

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
  const ex = item.excerpt || '';
  const lead = item.leadExcerpt || '';
  if (isWpChromeExcerpt(ex) || isWpChromeExcerpt(lead)) {
    if (!text(ex) || isUrlOnly(ex) || isWpChromeExcerpt(ex)) return 'extrait = interface WordPress';
  }
  if (isUrlOnly(ex) && (!text(lead) || isWpChromeExcerpt(lead))) return 'extrait = URL seule';
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
    kept.push(it);
  }
  return kept;
}

module.exports = { filterNonArticles, nonArticleReason, isWpChromeExcerpt, isUrlOnly, isNonArticleLink, isLogoImage };

/**
 * Extraction et réconciliation des auteurs — partagé par fetch-news et verify-authors.
 * Règle : si l'extrait commence par « Par … » / « By … », c'est l'auteur de l'article,
 * pas le dc:creator du flux (souvent rédacteur·rice ou compte générique).
 */

const GENERIC_AUTHORS = /^(admin|administrator|administrateur|editor|éditeur|editeur|rédaction|redaction|staff|wordpress|webmaster|collectif|tribune|link|daily|exemplaire|quartier libre|zone campus|la pige|le délit|le delit|the link|the tribune|the mcgill daily)$/i;

const BYLINE_ARTICLE_STARTERS = /^(Le|La|Les|L'|L'|Un|Une|The|An|À|A)$/iu;
const NAME_PARTICLES = new Set(['de', 'du', 'des', 'd', 'la', 'le', 'les', 'van', 'von', 'st', 'ste', 'saint', 'sainte']);

function stripHtml(text = '') {
  return String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeAuthor(name = '') {
  let a = stripHtml(name);
  const paren = a.match(/\(([^)]+)\)/);
  if (paren) a = paren[1];
  a = a.replace(/^(?:Par|By)\s+/i, '').replace(/\s+/g, ' ').trim();
  if (!a || a.length < 2 || GENERIC_AUTHORS.test(a) || /@/.test(a)) return '';
  return a.slice(0, 80);
}

/** Auteurs RSS mal fusionnés avec le début du texte (« Médéric Dens Après »). */
function trimMangledAuthor(name = '') {
  const a = normalizeAuthor(name);
  const parts = a.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return a;
  if (parts.length >= 3 && NAME_PARTICLES.has(parts[1].toLowerCase())) {
    return parts.slice(0, Math.min(parts.length, 4)).join(' ');
  }
  return parts.slice(0, 2).join(' ');
}

function normAuthorKey(name = '') {
  return normalizeAuthor(name)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function extractBylineFromText(text = '') {
  const plain = stripHtml(text);
  if (!/^(?:Par|By)\s+/i.test(plain)) return { author: '', body: plain };

  const tokens = plain.replace(/^\s*(?:Par|By)\s+/i, '').split(/\s+/);
  const nameParts = [];
  let i = 0;
  for (; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (nameParts.length >= 1 && BYLINE_ARTICLE_STARTERS.test(token)) break;
    if (nameParts.length >= 2) break;
    if (/^[\p{Lu}][\p{L}'’.\-]+$/u.test(token)) nameParts.push(token);
    else break;
  }

  const author = normalizeAuthor(nameParts.join(' '));
  const body = tokens.slice(i).join(' ').trim();
  if (!author || body.length < 8) return { author: '', body: plain };
  return { author, body };
}

function excerptOpensWithByline(excerpt = '') {
  return /^(?:Par|By)\s+/i.test(String(excerpt).trim());
}

function reconcileAuthor(item) {
  let next = { ...item };
  let changed = false;

  const trimmed = trimMangledAuthor(next.author);
  if (trimmed && trimmed !== normalizeAuthor(next.author)) {
    next.author = trimmed;
    changed = true;
  }

  const ex = String(next.excerpt || '').trim();
  const fromExcerpt = extractBylineFromText(ex);
  if (!fromExcerpt.author || !excerptOpensWithByline(ex)) {
    return { changed, item: next, author: normalizeAuthor(next.author) || null };
  }

  const fieldAuthor = normalizeAuthor(next.author);
  if (fieldAuthor && normAuthorKey(fieldAuthor) === normAuthorKey(fromExcerpt.author)) {
    return { changed, item: next, author: fieldAuthor };
  }

  const previousAuthor = fieldAuthor || null;
  next.author = fromExcerpt.author;
  if (fromExcerpt.body.length >= 20) {
    next.excerpt = fromExcerpt.body;
  }

  return {
    changed: true,
    item: next,
    author: fromExcerpt.author,
    previousAuthor,
    reason: previousAuthor ? 'excerpt-byline-overrides-rss' : 'filled-from-excerpt',
  };
}

function auditAuthors(items = []) {
  const mismatches = [];
  let fixable = 0;

  for (const item of items) {
    const result = reconcileAuthor(item);
    if (result.changed) {
      fixable += 1;
      mismatches.push({
        title: item.title,
        link: item.link,
        source: item.source,
        fieldAuthor: result.previousAuthor,
        canonicalAuthor: result.author,
        reason: result.reason,
      });
    }
  }

  return { mismatches, fixable, total: items.length };
}

module.exports = {
  GENERIC_AUTHORS,
  normalizeAuthor,
  trimMangledAuthor,
  extractBylineFromText,
  excerptOpensWithByline,
  reconcileAuthor,
  auditAuthors,
};
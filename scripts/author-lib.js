/**
 * Extraction et réconciliation des auteurs — partagé par fetch-news et verify-authors.
 * Règle : si l'extrait commence par « Par … » / « By … », c'est l'auteur de l'article,
 * pas le dc:creator du flux (souvent rédacteur·rice ou compte générique).
 */

const GENERIC_AUTHORS = /^(admin|administrator|administrateur|editor|éditeur|editeur|rédaction|redaction|staff|wordpress|webmaster|collectif|tribune|link|daily|exemplaire|quartier libre|zone campus|la pige|le délit|le delit|the link|the tribune|the mcgill daily)$/i;

const EDITORIAL_BYLINE_RE = /^(?:Par|By)\s+(?:(?:La|L')\s*)?[Rr]édaction\b\.?/i;
const EDITORIAL_BYLINE_EN_RE = /^(?:Par|By)\s+Editorial\s+(?:team|staff|board)\b\.?/i;

const BYLINE_ARTICLE_STARTERS = /^(Le|La|Les|L'|L'|Un|Une|The|An|À|A)$/iu;
const NAME_PARTICLES = new Set(['de', 'du', 'des', 'd', 'la', 'le', 'les', 'van', 'von', 'st', 'ste', 'saint', 'sainte']);

function stripHtml(text = '') {
  return String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function editorialFallback(lang = 'fr') {
  return lang === 'en' ? 'The editorial team' : 'La rédaction';
}

function canonicalizeEditorialAuthor(name = '') {
  const a = stripHtml(name).replace(/^(?:Par|By)\s+/i, '').replace(/\s+/g, ' ').trim();
  if (/^(?:la\s+|l')\s*rédaction$/i.test(a) || /^redaction$/i.test(a)) return 'La rédaction';
  if (/^editorial\s+(?:team|staff|board)$/i.test(a) || /^the\s+editorial\s+team$/i.test(a)) {
    return 'The editorial team';
  }
  if (/^staff\s+writers?$/i.test(a)) return 'The editorial team';
  return '';
}

function normalizeAuthor(name = '') {
  let a = stripHtml(name);
  const paren = a.match(/\(([^)]+)\)/);
  if (paren) a = paren[1];
  a = a.replace(/^(?:Par|By)\s+/i, '').replace(/\s+/g, ' ').trim();
  const editorial = canonicalizeEditorialAuthor(a);
  if (editorial) return editorial;
  if (!a || a.length < 2 || GENERIC_AUTHORS.test(a) || /@/.test(a)) return '';
  return a.slice(0, 80);
}

function resolveAuthor(item = {}, allItems = []) {
  const { item: reconciled } = reconcileAuthor(item, allItems, { applyFallback: true });
  return normalizeAuthor(reconciled.author) || editorialFallback(reconciled.lang === 'en' ? 'en' : 'fr');
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
  if (EDITORIAL_BYLINE_RE.test(plain)) {
    return {
      author: 'La rédaction',
      body: plain.replace(EDITORIAL_BYLINE_RE, '').trim(),
    };
  }
  if (EDITORIAL_BYLINE_EN_RE.test(plain)) {
    return {
      author: 'The editorial team',
      body: plain.replace(EDITORIAL_BYLINE_EN_RE, '').trim(),
    };
  }
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

function normalizeArticleUrl(link = '') {
  try {
    const u = new URL(link);
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return String(link).split('?')[0].split('#')[0];
  }
}

function findSiblingAuthor(item, allItems = []) {
  const key = normalizeArticleUrl(item.link);
  if (!key) return '';
  for (const other of allItems) {
    if (other === item) continue;
    if (normalizeArticleUrl(other.link) !== key) continue;
    const author = normalizeAuthor(other.author);
    if (author) return author;
  }
  return '';
}

/** Chroniques à la première personne (« Salut, moi c'est Elora »). */
function extractFirstPersonAuthor(text = '') {
  const plain = stripHtml(text);
  const m = plain.match(/^(?:Salut,?\s+)?moi,?\s+c['']est\s+([\p{Lu}][\p{L}'’.\-]+)/iu)
    || plain.match(/^je\s+m['']appelle\s+([\p{Lu}][\p{L}'’.\-]+)/iu);
  return m ? normalizeAuthor(m[1]) : '';
}

function applyAuthorFallback(item = {}) {
  const lang = item.lang === 'en' ? 'en' : 'fr';
  const fallback = editorialFallback(lang);
  if (normalizeAuthor(item.author) === fallback) return item;
  return { ...item, author: fallback };
}

function reconcileAuthor(item, allItems = [], { applyFallback = false } = {}) {
  let next = { ...item };
  let changed = false;
  let reason = null;
  const previousAuthor = normalizeAuthor(item.author) || null;

  const trimmed = trimMangledAuthor(next.author);
  if (trimmed && trimmed !== normalizeAuthor(next.author)) {
    next.author = trimmed;
    changed = true;
  }

  const ex = String(next.excerpt || '').trim();
  const fromExcerpt = extractBylineFromText(ex);
  if (!fromExcerpt.author || !excerptOpensWithByline(ex)) {
    if (!normalizeAuthor(next.author)) {
      const sibling = findSiblingAuthor(next, allItems);
      if (sibling) {
        next.author = sibling;
        changed = true;
        reason = 'filled-from-duplicate';
      }
    }
    if (!normalizeAuthor(next.author)) {
      const firstPerson = extractFirstPersonAuthor(ex);
      if (firstPerson) {
        next.author = firstPerson;
        changed = true;
        reason = reason || 'filled-from-first-person';
      }
    }
  } else {
    const fieldAuthor = normalizeAuthor(next.author);
    if (!fieldAuthor || normAuthorKey(fieldAuthor) !== normAuthorKey(fromExcerpt.author)) {
      next.author = fromExcerpt.author;
      changed = true;
      reason = fieldAuthor ? 'excerpt-byline-overrides-rss' : 'filled-from-excerpt';
      if (fromExcerpt.body.length >= 20) {
        next.excerpt = fromExcerpt.body;
      }
    }
  }

  if (applyFallback && !normalizeAuthor(next.author)) {
    next = applyAuthorFallback(next);
    changed = true;
    reason = reason || 'fallback-editorial';
  }

  const author = normalizeAuthor(next.author) || null;
  if (changed || (applyFallback && author !== previousAuthor)) {
    return { changed: true, item: next, author, previousAuthor, reason };
  }
  return { changed: false, item: next, author, previousAuthor, reason: null };
}

function auditAuthors(items = []) {
  const mismatches = [];
  let fixable = 0;

  for (const item of items) {
    const result = reconcileAuthor(item, items, { applyFallback: true });
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
  editorialFallback,
  canonicalizeEditorialAuthor,
  normalizeAuthor,
  trimMangledAuthor,
  extractBylineFromText,
  extractFirstPersonAuthor,
  excerptOpensWithByline,
  resolveAuthor,
  applyAuthorFallback,
  reconcileAuthor,
  auditAuthors,
};
/**
 * Worker : fetch d'UNE source RSS/HTML/Firebase.
 * Le parent le tue après SOURCE_BUDGET_MS si bloqué (CPU ou réseau).
 *
 * Message in  : { source, referenceDateISO }
 * Message out : { ok, items, note, error }
 */
const {
  // Re-use logic by requiring fetch-news helpers — avoid running main
} = {};

// Inline minimal implementation to stay isolated from main() side effects.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { isAllowedFetchUrl } = require('./url-security-lib');
const { isHtmlListSource, parseHtmlListPage } = require('./html-list-fetcher');
const { isFirebaseSource, fetchFirebaseFeed } = require('./firebase-list-fetcher');
const { pruneToFreshWindow } = require('./source-retention-lib');
const { decodeEntities, stripHtml } = require('./html-entities-lib');
const { expandAuthorName, extractBylineFromText, authorFromBodyCredits, normalizeAuthor, isEditorialPlaceholder } = require('./author-lib');
const { isCandidateImageUrl, isWeakImageUrl, unwrapCdnImageUrl } = require('./article-image-lib');

const TIMEOUT = 12000;
const MAX_BYTES = 2_000_000;
const MAX_PER_SOURCE = 20;

function fetchText(url, redirects = 3, timeout = TIMEOUT) {
  if (!isAllowedFetchUrl(url)) return Promise.resolve('');
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    let req;
    try {
      req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; REQ-NewsBot/1.0)',
          Accept: 'application/rss+xml, application/xml, text/xml, text/html, */*',
        },
        timeout,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
          res.resume();
          return done(fetchText(new URL(res.headers.location, url).toString(), redirects - 1, timeout));
        }
        if (res.statusCode >= 400) { res.resume(); return done(''); }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          data += c;
          if (data.length > MAX_BYTES) { try { req.destroy(); } catch {} done(data); }
        });
        res.on('end', () => done(data));
        res.on('error', () => done(''));
      });
    } catch { return done(''); }
    req.on('error', () => done(''));
    req.on('timeout', () => { try { req.destroy(); } catch {} done(''); });
    setTimeout(() => { try { req.destroy(); } catch {} done(''); }, timeout + 1500);
  });
}

/** Extraction tag sans regex catastroophique (indexOf, pas [\s\S]*?). */
function tagFast(block, name) {
  const openRe = new RegExp(`<${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s[^>]*)?>`, 'i');
  const open = openRe.exec(block);
  if (!open) return '';
  const start = open.index + open[0].length;
  const closeTag = `</${name}>`;
  const closeIdx = block.toLowerCase().indexOf(closeTag.toLowerCase(), start);
  if (closeIdx === -1) return '';
  // Plafonner le contenu extrait
  const raw = block.slice(start, Math.min(closeIdx, start + 8_000));
  return decodeEntities(raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim());
}

function sanitizeTitle(title = '') {
  let t = stripHtml(String(title)).replace(/\s+/g, ' ').trim();
  t = t.replace(/\s*[–—|-]\s*Le\s+D[eé]lit\s*$/i, '').trim();
  t = t.replace(/\s*[–—|-]\s*Quartier\s+Libre\s*$/i, '').trim();
  t = t.replace(/\s*[–—|-]\s*Montréal\s+Campus\s*$/i, '').trim();
  // Éviter « Mc Gill » (séparation erronée de McGill)
  t = t.replace(/\bMc\s+Gill\b/g, 'McGill');
  return t;
}

function truncateExcerpt(text = '', max = 280) {
  let s = stripHtml(text).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > max * 0.55) cut = cut.slice(0, lastSpace);
  return cut.trim();
}

/** Footer Yoast / Rank Math collé aux descriptions RSS (Le Délit, etc.). */
function stripExcerptBoilerplate(text = '') {
  let s = stripHtml(String(text)).replace(/\s+/g, ' ').trim();
  s = s.replace(/\s*L['’]article\b[\s\S]*?est apparu en premier sur[\s\S]*$/i, '');
  s = s.replace(/\s*The\s+post\b[\s\S]*?appeared first on[\s\S]*$/i, '');
  const li = s.search(/\sL['’]article\s/);
  if (li > 30) s = s.slice(0, li);
  return s.replace(/\s+/g, ' ').trim();
}

/** WP has-drop-cap : « L e 18… » / « L 'identité » dans content:encoded. */
function fixDropCapSpacing(text = '') {
  return String(text)
    .replace(/^([\p{Lu}])\s+([''’])/u, '$1$2')
    .replace(/^([\p{Lu}])\s+([\p{Ll}])/u, '$1$2');
}

function firstParagraphFromHtml(html = '') {
  if (!html) return '';
  const decoded = decodeEntities(html);
  const paragraphs = decoded.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
  for (const p of paragraphs) {
    let text = fixDropCapSpacing(stripExcerptBoilerplate(stripHtml(p)));
    if (text.length < 40) continue;
    if (/^(?:Par|By)\s+[\p{Lu}]/u.test(text) && text.length < 80) continue;
    if (/^(?:Photo|Crédit|Credit)\s*:/i.test(text)) continue;
    return text;
  }
  return '';
}

/**
 * Préférer content:encoded (vrai 1er paragraphe) à la description RSS
 * souvent limitée à un teaser + « L'article … est apparu en premier sur … ».
 */
function pickExcerpt(block) {
  const descText = stripExcerptBoilerplate(tagFast(block, 'description') || '');
  const content = tagFast(block, 'content:encoded') || tagFast(block, 'content') || '';
  const contentLead = firstParagraphFromHtml(content)
    || fixDropCapSpacing(stripExcerptBoilerplate(content));

  let excerpt = '';
  if (contentLead && contentLead.length >= Math.max(descText.length + 20, 100)) {
    excerpt = contentLead;
  } else if (descText.length >= 40) {
    excerpt = descText;
  } else {
    excerpt = contentLead || descText;
  }
  return truncateExcerpt(fixDropCapSpacing(stripExcerptBoilerplate(excerpt)), 280);
}

function firstImage(block) {
  const head = String(block || '').slice(0, 12_000);
  const m = head.match(/url=["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i)
    || head.match(/src=["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i);
  if (!m) return '';
  const raw = decodeEntities(m[1]);
  const unwrapped = unwrapCdnImageUrl(raw) || raw;
  if (unwrapped && isCandidateImageUrl(unwrapped) && !isWeakImageUrl(unwrapped)) return unwrapped;
  if (isCandidateImageUrl(raw) && !isWeakImageUrl(raw)) return raw;
  return '';
}

function parseFeed(xml) {
  const items = [];
  // Split simple sur </item> — évite un match global [\s\S]*? monstrueux
  const parts = String(xml || '').split(/<\/item>/i);
  const channelTitle = sanitizeTitle(tagFast(String(xml || '').slice(0, 4_000), 'title'));

  for (const part of parts) {
    const itemStart = part.toLowerCase().lastIndexOf('<item');
    if (itemStart === -1) continue;
    // 40k : laisser entrer le début de content:encoded (teaser description insuffisant)
    const block = part.slice(itemStart, itemStart + 40_000);
    if (!/<item[\s>]/i.test(block.slice(0, 80))) continue;

    const title = sanitizeTitle(tagFast(block, 'title'));
    let link = stripHtml(tagFast(block, 'link'));
    if (!link) {
      const lm = block.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (lm) link = lm[1];
    }
    const dateRaw = tagFast(block, 'pubDate') || tagFast(block, 'dc:date')
      || tagFast(block, 'published') || tagFast(block, 'updated');
    const date = dateRaw ? new Date(dateRaw) : null;
    const excerpt = pickExcerpt(block);
    let author = expandAuthorName(tagFast(block, 'dc:creator') || tagFast(block, 'author'));
    // Ne pas appeler extractBylineFromText sur du HTML long (regex fragile)
    if (channelTitle && author && author.toLowerCase() === channelTitle.toLowerCase()) {
      author = '';
    }
    const image = firstImage(block);
    if (title && link) {
      items.push({
        title,
        link,
        author: author || '',
        date: date && !isNaN(date) ? date.toISOString() : null,
        excerpt,
        image,
      });
    }
    if (items.length >= MAX_PER_SOURCE) break;
  }
  return items;
}

function isFeedXml(xml = '') {
  return /<rss[\s>]|<feed[\s>]/i.test(String(xml).slice(0, 600));
}

process.on('message', async (msg) => {
  try {
    const src = msg.source;
    const referenceDate = new Date(msg.referenceDateISO || Date.now());
    let items = [];
    let note = '';

    if (isFirebaseSource(src)) {
      items = await fetchFirebaseFeed(src, { maxItems: MAX_PER_SOURCE });
      items = items.map((it) => ({
        ...it,
        title: sanitizeTitle(it.title),
        excerpt: truncateExcerpt(it.excerpt, 280),
      }));
      note = ' (firebase)';
    } else if (isHtmlListSource(src)) {
      const listUrls = [src.url, src.urlFallback, ...(src.feedAlternates || [])].filter(Boolean);
      for (const listUrl of [...new Set(listUrls)]) {
        const html = await fetchText(listUrl);
        const parsed = parseHtmlListPage(html, listUrl, { maxItems: MAX_PER_SOURCE });
        if (parsed.length) {
          items = parsed.slice(0, MAX_PER_SOURCE).map((it) => ({
            ...it,
            title: sanitizeTitle(it.title),
            excerpt: truncateExcerpt(it.excerpt, 280),
          }));
          note = ' (html-list)';
          break;
        }
      }
    } else {
      const urls = [src.url, src.urlFallback, ...(src.feedAlternates || [])].filter(Boolean);
      const unique = [...new Set(urls)];
      if (src.mergeFeedAlternates) {
        const seen = new Set();
        for (const u of unique) {
          const xml = await fetchText(u);
          if (!xml || !isFeedXml(xml)) continue;
          for (const it of parseFeed(xml)) {
            if (!it.link || seen.has(it.link)) continue;
            seen.add(it.link);
            items.push(it);
          }
        }
        items.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
        items = items.slice(0, MAX_PER_SOURCE);
        note = unique.length > 1 ? ` [${unique.length} feeds]` : '';
      } else {
        for (const u of unique) {
          const xml = await fetchText(u);
          if (xml && isFeedXml(xml)) {
            items = parseFeed(xml).slice(0, MAX_PER_SOURCE);
            if (u !== src.url) note = ` [repli: ${u}]`;
            break;
          }
        }
      }
    }

    items = pruneToFreshWindow(items, referenceDate);
    process.send({ ok: items.length > 0, items, note, error: null });
  } catch (e) {
    process.send({ ok: false, items: [], note: '', error: String(e && e.message || e) });
  }
  process.exit(0);
});

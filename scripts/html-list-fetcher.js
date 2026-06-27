#!/usr/bin/env node
/**
 * Agrégation par page HTML (sites SvelteKit / headless sans flux RSS).
 *
 * Utilisé quand news-sources.json définit fetchMode: "html-list" et que url
 * pointe vers une page de liste (ex. /toutes-les-nouvelles).
 *
 *   const { isHtmlListSource, parseHtmlListPage } = require('./html-list-fetcher');
 */

const DAY = 86400000;
const OK_DAYS = 270;
const STALE_DAYS = 540;
const DEAD_DAYS = 730;

const DATED_PATH_RE = /\/(20\d{2})\/(\d{2})\/(\d{2})\//;

function decodeEntities(str = '') {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, '’')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&hellip;/gi, '…');
}

function stripHtml(html = '') {
  return decodeEntities(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isHtmlListSource(src = {}) {
  return src.fetchMode === 'html-list';
}

function absoluteLink(href = '', baseUrl = '') {
  const raw = String(href).trim();
  if (!raw) return '';
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return '';
  }
}

function dateFromPath(link = '') {
  const m = String(link).match(DATED_PATH_RE);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  return !isNaN(d) ? d.toISOString() : null;
}

function extractSvelteComment(block = '', tag = '') {
  const re = new RegExp(
    `<${tag}[^>]*>\\s*<!-- HTML_TAG_START -->([\\s\\S]*?)<!-- HTML_TAG_END -->`,
    'i',
  );
  const m = block.match(re);
  return m ? stripHtml(m[1]) : '';
}

function parseArticleBlock(block = '', baseUrl = '') {
  const linkM = block.match(/href=["']([^"']+)["']/i);
  if (!linkM) return null;

  const link = absoluteLink(linkM[1], baseUrl);
  if (!link || !DATED_PATH_RE.test(link)) return null;

  let title = extractSvelteComment(block, 'h[12]');
  if (!title) {
    const alt = block.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
    title = alt ? stripHtml(alt[1]) : '';
  }

  let excerpt = extractSvelteComment(block, 'p');
  if (!excerpt) {
    const alt = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    excerpt = alt ? stripHtml(alt[1]) : '';
  }

  const imgM = block.match(/<img[^>]+src=["']([^"']+)["']/i);
  const image = imgM ? decodeEntities(imgM[1]) : '';

  const date = dateFromPath(link);

  if (!title) return null;
  return { title, link, author: '', date, excerpt, image };
}

function parseLinkOnly(html = '', baseUrl = '') {
  const items = [];
  const seen = new Set();
  const re = /href=["'](\/20\d{2}\/\d{2}\/\d{2}\/[^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const link = absoluteLink(m[1], baseUrl);
    if (!link || seen.has(link)) continue;
    seen.add(link);
    const slug = link.split('/').pop() || '';
    const title = slug
      .replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    items.push({
      title,
      link,
      author: '',
      date: dateFromPath(link),
      excerpt: '',
      image: '',
    });
  }
  return items;
}

function parseHtmlListPage(html = '', baseUrl = '', options = {}) {
  if (!html || html.length < 200) return [];

  const blocks = html.split(/<article[\s>]/i).slice(1);
  const items = [];
  const seen = new Set();

  for (const block of blocks) {
    const item = parseArticleBlock(block, baseUrl);
    if (!item || seen.has(item.link)) continue;
    seen.add(item.link);
    items.push(item);
  }

  if (!items.length) {
    for (const item of parseLinkOnly(html, baseUrl)) {
      if (seen.has(item.link)) continue;
      seen.add(item.link);
      items.push(item);
    }
  }

  items.sort((a, b) => {
    const da = a.date ? Date.parse(a.date) : 0;
    const db = b.date ? Date.parse(b.date) : 0;
    return db - da;
  });

  const max = options.maxItems || 25;
  return items.slice(0, max);
}

function countHtmlListItems(html = '', baseUrl = '') {
  return parseHtmlListPage(html, baseUrl).length;
}

function latestHtmlListDate(html = '', baseUrl = '') {
  const items = parseHtmlListPage(html, baseUrl);
  const dates = items.map((i) => i.date).filter(Boolean).map((d) => Date.parse(d));
  if (!dates.length) return null;
  return new Date(Math.max(...dates)).toISOString();
}

function classifyHtmlList(html = '', baseUrl = '') {
  const count = countHtmlListItems(html, baseUrl);
  if (count === 0) return { status: 'dead', lastItemDate: null };

  const lastIso = latestHtmlListDate(html, baseUrl);
  if (lastIso == null) return { status: 'stale', lastItemDate: null };

  const last = Date.parse(lastIso);
  const ageDays = (Date.now() - last) / DAY;
  let status = 'ok';
  if (ageDays > DEAD_DAYS) status = 'dead';
  else if (ageDays > STALE_DAYS) status = 'stale';
  else if (ageDays > OK_DAYS) status = 'stale';

  return { status, lastItemDate: lastIso };
}

module.exports = {
  isHtmlListSource,
  parseHtmlListPage,
  countHtmlListItems,
  latestHtmlListDate,
  classifyHtmlList,
  dateFromPath,
};
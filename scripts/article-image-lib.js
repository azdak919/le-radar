/**
 * Extraction et validation d'images d'articles — partagé par fetch-news et ensure-lead-images.
 */

const https = require('https');

const DEFAULT_TIMEOUT = 12000;

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
    .replace(/&gt;/g, '>');
}

function fetchText(url, redirects = 3, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; REQ-NewsBot/1.0)',
          Accept: 'application/rss+xml, application/xml, text/xml, text/html, image/*, */*',
        },
        timeout,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          return resolve(fetchText(next, redirects - 1, timeout));
        }
        if (res.statusCode >= 400) {
          res.resume();
          return resolve('');
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(data));
      },
    );
    req.on('error', () => resolve(''));
    req.on('timeout', () => {
      req.destroy();
      resolve('');
    });
  });
}

function fetchBinaryPrefix(url, maxBytes = 65536, redirects = 3, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; REQ-NewsBot/1.0)',
          Accept: 'image/*,*/*',
        },
        timeout,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          return resolve(fetchBinaryPrefix(next, maxBytes, redirects - 1, timeout));
        }
        if (res.statusCode >= 400) {
          res.resume();
          return resolve(null);
        }
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          if (size >= maxBytes) return;
          chunks.push(chunk);
          size += chunk.length;
          if (size >= maxBytes) res.destroy();
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('close', () => {
          if (chunks.length) resolve(Buffer.concat(chunks));
        });
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

function parseJpegSize(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const h = buf.readUInt16BE(i + 5);
      const w = buf.readUInt16BE(i + 7);
      return { width: w, height: h };
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return null;
}

function parsePngSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function parseWebpSize(buf) {
  if (!buf || buf.length < 30) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const fmt = buf.toString('ascii', 12, 16);
  if (fmt === 'VP8 ') {
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
    };
  }
  if (fmt === 'VP8L' && buf.length >= 25) {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (fmt === 'VP8X' && buf.length >= 30) {
    return {
      width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
      height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
    };
  }
  return null;
}

function parseImageSize(buf) {
  return parseJpegSize(buf) || parsePngSize(buf) || parseWebpSize(buf);
}

async function probeRemoteImageSize(url) {
  if (!url) return null;
  const buf = await fetchBinaryPrefix(url);
  if (!buf) return null;
  return parseImageSize(buf);
}

function metaContent(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${key}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1]).trim();
  }
  return '';
}

function articleBodyHtml(html = '') {
  const regions = [
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i),
    html.match(/class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i),
    html.match(/class=["'][^"']*post-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i),
    html.match(/class=["'][^"']*article-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i),
  ];
  for (const m of regions) {
    if (m && m[1] && m[1].length > 120) return m[1];
  }
  return html;
}

function isCandidateImageUrl(raw = '') {
  const src = String(raw).trim();
  if (!src) return false;
  try {
    const url = new URL(src);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const path = decodeURIComponent(url.pathname).toLowerCase();
    if (/(logo|avatar|icon|placeholder|default|blank|spacer|profile|author|favicon|gravatar|emoji|smiley)/.test(path)) {
      return false;
    }
    if (/(?:^|\/)(?:1x1|pixel)\b/.test(path)) return false;
    if (/article-tile|size-article-tile|thumbnail|thumb_|-150x\d+\./.test(path)) return false;
    return true;
  } catch {
    return false;
  }
}

function isWeakImageUrl(raw = '') {
  const path = String(raw).toLowerCase();
  if (/-\d{2,3}x\d{2,3}\./.test(path) && !/-\d{3,4}x\d{3,4}\./.test(path)) return true;
  return /article-tile|size-article-tile/.test(path);
}

/** Seuils vedette : assez grands pour un hero ~800px sans pixelisation visible. */
const LEAD_MIN_WIDTH = 720;
const LEAD_MIN_HEIGHT = 405;
const LEAD_MIN_PIXELS = 320000;
const FEATURE_MIN_WIDTH = 640;
const FEATURE_MIN_HEIGHT = 360;
const FEATURE_MIN_PIXELS = 240000;

function meetsLeadDisplaySize(width = 0, height = 0) {
  const ratio = width / Math.max(height, 1);
  const pixels = width * height;
  return (
    width >= LEAD_MIN_WIDTH
    && height >= LEAD_MIN_HEIGHT
    && pixels >= LEAD_MIN_PIXELS
    && ratio >= 0.95
    && ratio <= 2.6
  );
}

function meetsFeatureDisplaySize(width = 0, height = 0) {
  const ratio = width / Math.max(height, 1);
  const pixels = width * height;
  return (
    width >= FEATURE_MIN_WIDTH
    && height >= FEATURE_MIN_HEIGHT
    && pixels >= FEATURE_MIN_PIXELS
    && ratio >= 0.95
    && ratio <= 2.6
  );
}

function imageFromArticleHtml(html = '') {
  const candidates = [];

  const ogImage = metaContent(html, 'og:image');
  const ogW = parseInt(metaContent(html, 'og:image:width'), 10) || 0;
  const ogH = parseInt(metaContent(html, 'og:image:height'), 10) || 0;
  if (ogImage && isCandidateImageUrl(ogImage)) {
    candidates.push({ url: ogImage, score: 100 + Math.min(ogW, 2400) / 10, w: ogW, h: ogH });
  }

  for (const key of ['twitter:image', 'twitter:image:src']) {
    const tw = metaContent(html, key);
    if (tw && isCandidateImageUrl(tw)) candidates.push({ url: tw, score: 90, w: 0, h: 0 });
  }

  const wpPost = html.match(
    /<img[^>]+class=["'][^"']*wp-post-image[^"']*["'][^>]*>/i,
  );
  if (wpPost) {
    const tag = wpPost[0];
    const srcM = tag.match(/src=["']([^"']+)["']/i);
    const w = parseInt((tag.match(/width=["'](\d+)["']/i) || [])[1], 10) || 0;
    const h = parseInt((tag.match(/height=["'](\d+)["']/i) || [])[1], 10) || 0;
    if (srcM && isCandidateImageUrl(srcM[1]) && !isWeakImageUrl(srcM[1])) {
      candidates.push({ url: srcM[1], score: 85 + w / 10, w, h });
    }
    const srcsetM = tag.match(/srcset=["']([^"']+)["']/i);
    if (srcsetM) {
      for (const part of srcsetM[1].split(',')) {
        const [u, size] = part.trim().split(/\s+/);
        const w = parseInt((size || '').replace('w', ''), 10) || 0;
        if (u && isCandidateImageUrl(u) && !isWeakImageUrl(u)) {
          candidates.push({ url: u, score: 82 + w / 8, w, h: 0 });
        }
      }
    }
  }

  const neve = html.match(/class=["'][^"']*attachment-neve-blog[^"']*["'][^>]*src=["']([^"']+)["']/i);
  if (neve && isCandidateImageUrl(neve[1])) {
    candidates.push({ url: neve[1], score: 88, w: 0, h: 0 });
  }

  const jsonLdBlocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const block of jsonLdBlocks) {
    const m = block.match(/"image"\s*:\s*"([^"]+)"/)
      || block.match(/"image"\s*:\s*\[\s*"([^"]+)"/)
      || block.match(/"url"\s*:\s*"(https?:[^"]+\.(?:jpe?g|png|webp)[^"]*)"/i);
    if (m && isCandidateImageUrl(m[1])) candidates.push({ url: m[1], score: 75, w: 0, h: 0 });
  }

  const body = articleBodyHtml(html);
  for (const m of body.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
    const tag = m[0];
    const src = decodeEntities(m[1]);
    const w = parseInt((tag.match(/width=["'](\d+)["']/i) || [])[1], 10) || 0;
    if (!isCandidateImageUrl(src) || isWeakImageUrl(src)) continue;
    if (w > 0 && w < 400) continue;
    candidates.push({ url: src, score: 60 + w / 10, w, h: 0 });
    break;
  }

  if (!candidates.length) return { url: '', w: 0, h: 0 };
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return { url: best.url, w: best.w || 0, h: best.h || 0 };
}

function needsImageEnrichment(item) {
  if (!item.link) return false;
  if (!item.image || !isCandidateImageUrl(item.image)) return true;
  return isWeakImageUrl(item.image);
}

async function scrapeArticleImage(item) {
  if (!item?.link) return null;
  const html = await fetchText(item.link);
  if (!html || html.length < 200) return null;
  const found = imageFromArticleHtml(html);
  if (!found.url) return null;
  return found;
}

async function resolveLeadReadyPhoto(item) {
  const tryUrl = async (url, metaW = 0, metaH = 0) => {
    if (!url || !isCandidateImageUrl(url) || isWeakImageUrl(url)) return null;
    if (metaW && metaH && meetsLeadDisplaySize(metaW, metaH)) {
      return { url, width: metaW, height: metaH, source: 'meta' };
    }
    const dims = await probeRemoteImageSize(url);
    if (dims && meetsLeadDisplaySize(dims.width, dims.height)) {
      return { url, width: dims.width, height: dims.height, source: 'probe' };
    }
    if (dims && dims.width >= 200 && dims.height >= 150) {
      return { url, width: dims.width, height: dims.height, source: 'probe-small', leadReady: false };
    }
    return null;
  };

  if (item.image) {
    const hit = await tryUrl(item.image);
    if (hit) return hit;
  }

  const scraped = await scrapeArticleImage(item);
  if (scraped?.url) {
    const hit = await tryUrl(scraped.url, scraped.w, scraped.h);
    if (hit) return hit;
    if (scraped.url && isCandidateImageUrl(scraped.url)) {
      const dims = await probeRemoteImageSize(scraped.url);
      if (dims) {
        return {
          url: scraped.url,
          width: dims.width,
          height: dims.height,
          source: 'page-scrape',
          leadReady: meetsLeadDisplaySize(dims.width, dims.height),
        };
      }
      return { url: scraped.url, width: scraped.w, height: scraped.h, source: 'page-scrape', leadReady: false };
    }
  }

  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  LEAD_MIN_WIDTH,
  LEAD_MIN_HEIGHT,
  LEAD_MIN_PIXELS,
  FEATURE_MIN_WIDTH,
  FEATURE_MIN_HEIGHT,
  FEATURE_MIN_PIXELS,
  fetchText,
  fetchBinaryPrefix,
  probeRemoteImageSize,
  parseImageSize,
  metaContent,
  articleBodyHtml,
  isCandidateImageUrl,
  isWeakImageUrl,
  meetsLeadDisplaySize,
  meetsFeatureDisplaySize,
  imageFromArticleHtml,
  needsImageEnrichment,
  scrapeArticleImage,
  resolveLeadReadyPhoto,
  sleep,
  decodeEntities,
};
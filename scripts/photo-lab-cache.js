/**
 * Cache disque local des fonds du labo photo.
 * Ne va pas dans git. Télécharge des thumbs (~1600px), pas les originaux.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { photoKey, thumbUrl } = require('./photo-lab-lib');

const DEFAULT_ROOT = path.join(__dirname, '..');
const UA = 'LE-RADAR-photo-lab/1.0 (local curation; https://le-radar.ca)';
const EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

function cacheId(url) {
  return crypto.createHash('sha1').update(photoKey(url) || String(url)).digest('hex').slice(0, 16);
}

function cacheDir(root = DEFAULT_ROOT) {
  return path.join(root, 'dev', 'photo-lab', 'cache');
}

function findCached(dir, id) {
  if (!id) return null;
  for (const ext of EXTS) {
    const p = path.join(dir, id + ext);
    if (fs.existsSync(p) && fs.statSync(p).size > 80) return p;
  }
  return null;
}

function extFromType(type, url) {
  const t = String(type || '').toLowerCase();
  if (t.includes('png')) return '.png';
  if (t.includes('webp')) return '.webp';
  if (t.includes('gif')) return '.gif';
  if (t.includes('jpeg') || t.includes('jpg')) return '.jpg';
  const m = String(url || '').match(/\.(jpe?g|png|webp|gif)(?:$|\?)/i);
  if (m) return `.${m[1].toLowerCase().replace('jpeg', 'jpg')}`;
  return '.jpg';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('too many redirects'));
      return;
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }
    const lib = parsed.protocol === 'http:' ? http : https;
    const req = lib.get(
      parsed,
      {
        headers: {
          'User-Agent': UA,
          Accept: 'image/jpeg,image/webp,image/png,image/*;q=0.8,*/*;q=0.1',
          Referer: 'https://commons.wikimedia.org/',
        },
        timeout: 28000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, url).href;
          fetchBuffer(next, redirects + 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            buf: Buffer.concat(chunks),
            type: res.headers['content-type'] || 'image/jpeg',
          })
        );
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

function candidateUrls(url) {
  const out = [];
  const t1600 = thumbUrl(url, 1600);
  const t1280 = thumbUrl(url, 1280);
  if (t1600 && t1600 !== url) out.push(t1600);
  if (t1280 && t1280 !== url && t1280 !== t1600) out.push(t1280);
  out.push(url);
  return [...new Set(out.filter(Boolean))];
}

async function downloadToCache(url, dir, attempt = 0) {
  const id = cacheId(url);
  const hit = findCached(dir, id);
  if (hit) return hit;
  fs.mkdirSync(dir, { recursive: true });
  let lastErr = null;
  for (const cand of candidateUrls(url)) {
    try {
      const { buf, type } = await fetchBuffer(cand);
      if (!buf || buf.length < 80) throw new Error('empty');
      const ext = extFromType(type, cand);
      const dest = path.join(dir, id + ext);
      fs.writeFileSync(dest, buf);
      return dest;
    } catch (err) {
      lastErr = err;
    }
  }
  const msg = lastErr && lastErr.message ? lastErr.message : '';
  if (/429|timeout/i.test(msg) && attempt < 7) {
    await sleep(Math.min(20000, 800 * 2 ** attempt));
    return downloadToCache(url, dir, attempt + 1);
  }
  throw lastErr || new Error('download failed');
}

function countCached(dir, photos) {
  let have = 0;
  for (const p of photos || []) {
    if (findCached(dir, cacheId(p.url))) have += 1;
  }
  return have;
}

function createProgress() {
  return { total: 0, have: 0, failed: 0, running: false, error: '' };
}

async function prefetchAll(photos, opts = {}) {
  const root = opts.root || DEFAULT_ROOT;
  const dir = opts.dir || cacheDir(root);
  const concurrency = Math.max(1, Number(opts.concurrency) || 2);
  const progress = opts.progress || createProgress();
  const list = (photos || []).slice().sort((a, b) => {
    const aw = /wikimedia/.test(a.url || '') ? 1 : 0;
    const bw = /wikimedia/.test(b.url || '') ? 1 : 0;
    return aw - bw;
  });
  progress.total = list.length;
  progress.have = countCached(dir, list);
  progress.failed = 0;
  progress.running = true;
  progress.error = '';
  fs.mkdirSync(dir, { recursive: true });
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const idx = i;
      i += 1;
      const p = list[idx];
      if (!p || !p.url) continue;
      const id = cacheId(p.url);
      if (findCached(dir, id)) continue;
      try {
        await downloadToCache(p.url, dir);
        progress.have += 1;
        await sleep(250);
      } catch (err) {
        progress.failed += 1;
        progress.error = err.message || String(err);
        await sleep(800);
      }
    }
  }
  const workers = [];
  for (let w = 0; w < concurrency; w += 1) workers.push(worker());
  await Promise.all(workers);
  progress.running = false;
  progress.have = countCached(dir, list);
  return progress;
}

module.exports = {
  cacheId,
  cacheDir,
  findCached,
  candidateUrls,
  downloadToCache,
  countCached,
  createProgress,
  prefetchAll,
  extFromType,
};

if (require.main === module) {
  const { createPhotoLab } = require('./photo-lab-lib');
  const lab = createPhotoLab({ root: DEFAULT_ROOT, sync: false });
  const photos = lab.listPhotos();
  const progress = createProgress();
  console.log(`Cache labo : ${photos.length} photos → ${cacheDir()}`);
  prefetchAll(photos, { progress, concurrency: 2 }).then((p) => {
    console.log(`Terminé : ${p.have}/${p.total} en cache` + (p.failed ? `, ${p.failed} échecs` : ''));
    process.exit(p.failed && p.have === 0 ? 1 : 0);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

/**
 * Cache disque local des fonds du labo photo + miroir GitHub Release.
 *
 * On ne « brute-force » pas les 429 Wikimedia (interdit / contre-productif).
 * On télécharge **une fois**, poliment, via Special:FilePath (hash Commons
 * souvent faux dans le stock), puis on sert le miroir GitHub.
 *
 *   node scripts/photo-lab-cache.js            # complète le cache local
 *   node scripts/photo-lab-cache.js --hydrate  # tar GitHub → disque
 *   node scripts/photo-lab-cache.js --publish  # tar + gh release
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { spawnSync } = require('child_process');
const { photoKey, thumbUrl } = require('./photo-lab-lib');

const DEFAULT_ROOT = path.join(__dirname, '..');
const UA = 'LE-RADAR-photo-lab/1.0 (https://le-radar.ca; local curation)';
const EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const RELEASE_TAG = 'photo-lab-cache';
const RELEASE_ASSET = 'photo-lab-cache.tgz';
const RELEASE_URL =
  'https://github.com/azdak919/le-radar/releases/download/photo-lab-cache/photo-lab-cache.tgz';

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

function commonsFileTitle(url) {
  if (!url) return null;
  try {
    const u = decodeURIComponent(String(url));
    const thumb = u.match(/\/thumb\/[^/]+\/[^/]+\/([^/]+)\/\d+px-/i);
    if (thumb) return thumb[1];
    const orig = u.match(
      /\/commons\/(?:thumb\/)?[^/]+\/[^/]+\/([^/?#]+\.(?:jpe?g|png|gif|webp|tiff?|svg))/i
    );
    if (orig) return orig[1];
    const file = u.match(/\/File:([^/?#]+)/i);
    if (file) return file[1].replace(/ /g, '_');
  } catch {
    /* ignore */
  }
  return null;
}

function specialFilePath(title, width) {
  const name = encodeURIComponent(String(title).replace(/ /g, '_'));
  const w = width ? `?width=${width}` : '';
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${name}${w}`;
}

function localSourcePath(url, root = DEFAULT_ROOT) {
  if (!url || url.startsWith('http://') || url.startsWith('https://')) return null;
  const rel = String(url).replace(/^\.\//, '').replace(/^\//, '');
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(path.resolve(root))) return null;
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  return null;
}

function candidateUrls(url) {
  const out = [];
  const title = commonsFileTitle(url);
  if (title) {
    out.push(specialFilePath(title, 1280));
    out.push(specialFilePath(title, 1600));
    out.push(specialFilePath(title));
  }
  if (/unsplash\.com/.test(url || '')) {
    const m = String(url).match(/photo-([a-zA-Z0-9_-]+)/);
    if (m) {
      out.push(
        `https://images.unsplash.com/photo-${m[1]}?w=1280&q=80&auto=format&fit=max`
      );
      out.push(
        `https://images.unsplash.com/photo-${m[1]}?w=1600&q=80&auto=format&fit=max`
      );
    }
  }
  const t1280 = thumbUrl(url, 1280);
  const t1600 = thumbUrl(url, 1600);
  if (t1280 && t1280 !== url) out.push(t1280);
  if (t1600 && t1600 !== url && t1600 !== t1280) out.push(t1600);
  out.push(url);
  return [...new Set(out.filter(Boolean))];
}

function fetchBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) {
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
          'Api-User-Agent': UA,
          Accept: 'image/jpeg,image/webp,image/png,image/*;q=0.8,*/*;q=0.1',
          Referer: 'https://commons.wikimedia.org/',
        },
        timeout: 35000,
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

function fetchToFile(url, dest) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'http:' ? http : https;
    const out = fs.createWriteStream(dest);
    const req = lib.get(
      parsed,
      {
        headers: { 'User-Agent': UA, Accept: '*/*' },
        timeout: 120000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          out.close();
          fs.unlink(dest, () => {});
          fetchToFile(new URL(res.headers.location, url).href, dest).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          out.close();
          fs.unlink(dest, () => {});
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(out);
        out.on('finish', () => resolve(dest));
        out.on('error', reject);
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function commonsSearchFile(title) {
  const q = String(title || '')
    .replace(/\s+[—–−].*$/, '')
    .replace(/,\s*\d{3,4}.*$/, '')
    .trim();
  if (q.length < 4) return null;
  const api =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
    `&list=search&srnamespace=6&srlimit=5&srsearch=${encodeURIComponent(q)}`;
  try {
    const { buf } = await fetchBuffer(api);
    const data = JSON.parse(buf.toString('utf8'));
    const hits = (data.query && data.query.search) || [];
    const hit = hits.find((h) => /^File:/i.test(h.title || '')) || hits[0];
    if (!hit || !hit.title) return null;
    return String(hit.title)
      .replace(/^File:/i, '')
      .replace(/ /g, '_');
  } catch {
    return null;
  }
}

async function downloadToCache(url, dir, attempt = 0, root = DEFAULT_ROOT, meta = {}) {
  const id = cacheId(url);
  const hit = findCached(dir, id);
  if (hit) return hit;
  fs.mkdirSync(dir, { recursive: true });
  const local = localSourcePath(url, root);
  if (local) {
    const ext = path.extname(local).toLowerCase() || '.jpg';
    const dest = path.join(dir, id + ext);
    fs.copyFileSync(local, dest);
    return dest;
  }
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
  if (/404/.test(msg) && meta.title && /wikimedia|wikipedia/.test(url || '') && !meta.searched) {
    const found = await commonsSearchFile(meta.title);
    if (found) {
      try {
        const { buf, type } = await fetchBuffer(specialFilePath(found, 1280));
        if (buf && buf.length > 80) {
          const ext = extFromType(type, found);
          const dest = path.join(dir, id + ext);
          fs.writeFileSync(dest, buf);
          return dest;
        }
      } catch {
        /* continue to retry / throw */
      }
    }
  }
  if (/429|timeout|503/i.test(msg) && attempt < 8) {
    await sleep(Math.min(120000, 4000 * 2 ** attempt));
    return downloadToCache(url, dir, attempt + 1, root, meta);
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

async function runPool(list, dir, root, progress, concurrency, delayMs) {
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const idx = i;
      i += 1;
      const p = list[idx];
      if (!p || !p.url) continue;
      if (findCached(dir, cacheId(p.url))) continue;
      try {
        await downloadToCache(p.url, dir, 0, root, { title: p.title || p.credit || '' });
        progress.have += 1;
        await sleep(delayMs);
      } catch (err) {
        progress.failed += 1;
        progress.error = err.message || String(err);
        await sleep(Math.max(delayMs, 1000));
      }
    }
  }
  const n = Math.max(1, concurrency);
  await Promise.all(Array.from({ length: n }, () => worker()));
}

async function prefetchAll(photos, opts = {}) {
  const root = opts.root || DEFAULT_ROOT;
  const dir = opts.dir || cacheDir(root);
  const progress = opts.progress || createProgress();
  const rest = [];
  const wiki = [];
  for (const p of photos || []) {
    if (/wikimedia|wikipedia/.test(p.url || '')) wiki.push(p);
    else rest.push(p);
  }
  progress.total = (photos || []).length;
  progress.have = countCached(dir, photos);
  progress.failed = 0;
  progress.running = true;
  progress.error = '';
  fs.mkdirSync(dir, { recursive: true });
  await runPool(rest, dir, root, progress, opts.concurrency || 2, 150);
  await runPool(wiki, dir, root, progress, 1, 450);
  progress.running = false;
  progress.have = countCached(dir, photos);
  return progress;
}

function packCache(dir, tgzPath) {
  fs.mkdirSync(path.dirname(tgzPath), { recursive: true });
  const r = spawnSync('tar', ['-C', dir, '-czf', tgzPath, '.'], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(r.stderr || 'tar failed');
  }
  return tgzPath;
}

function hydrateFromGithub(opts = {}) {
  const dir = opts.dir || cacheDir(opts.root || DEFAULT_ROOT);
  const url = opts.url || RELEASE_URL;
  fs.mkdirSync(dir, { recursive: true });
  const tgz = path.join(os.tmpdir(), `photo-lab-cache-${Date.now()}.tgz`);
  return fetchToFile(url, tgz).then(() => {
    const r = spawnSync('tar', ['-C', dir, '-xzf', tgz], { encoding: 'utf8' });
    fs.unlink(tgz, () => {});
    if (r.status !== 0) throw new Error(r.stderr || 'tar extract failed');
    return dir;
  });
}

function publishCache(opts = {}) {
  const root = opts.root || DEFAULT_ROOT;
  const dir = opts.dir || cacheDir(root);
  const tgz = opts.tgz || path.join(os.tmpdir(), RELEASE_ASSET);
  packCache(dir, tgz);
  const view = spawnSync('gh', ['release', 'view', RELEASE_TAG], {
    encoding: 'utf8',
    cwd: root,
  });
  if (view.status !== 0) {
    const created = spawnSync(
      'gh',
      [
        'release',
        'create',
        RELEASE_TAG,
        tgz,
        '--title',
        'Labo photo — cache images',
        '--notes',
        'Miroir local des fonds mât/pomo/solitaire. Téléchargé une fois depuis Commons/Unsplash, servi hors quota. `npm run lab:photos:hydrate` pour le récupérer.',
      ],
      { encoding: 'utf8', cwd: root }
    );
    if (created.status !== 0) {
      throw new Error(created.stderr || created.stdout || 'gh release create failed');
    }
  } else {
    const up = spawnSync(
      'gh',
      ['release', 'upload', RELEASE_TAG, `${tgz}#${RELEASE_ASSET}`, '--clobber'],
      { encoding: 'utf8', cwd: root }
    );
    if (up.status !== 0) {
      throw new Error(up.stderr || up.stdout || 'gh release upload failed');
    }
  }
  return { tgz, url: RELEASE_URL };
}

module.exports = {
  cacheId,
  cacheDir,
  findCached,
  candidateUrls,
  commonsFileTitle,
  commonsSearchFile,
  specialFilePath,
  localSourcePath,
  downloadToCache,
  countCached,
  createProgress,
  prefetchAll,
  packCache,
  hydrateFromGithub,
  publishCache,
  extFromType,
  RELEASE_TAG,
  RELEASE_URL,
};

if (require.main === module) {
  const { createPhotoLab } = require('./photo-lab-lib');
  const args = process.argv.slice(2);
  const lab = createPhotoLab({ root: DEFAULT_ROOT, sync: false });
  const photos = lab.listPhotos();
  const dir = cacheDir();
  const progress = createProgress();

  async function main() {
    if (args.includes('--hydrate')) {
      console.log('Hydratation depuis GitHub Release…');
      await hydrateFromGithub({ dir });
      console.log(`Cache : ${countCached(dir, photos)}/${photos.length}`);
      return;
    }
    if (args.includes('--publish')) {
      console.log(`Publication ${countCached(dir, photos)} fichiers…`);
      const r = publishCache({ dir, root: DEFAULT_ROOT });
      console.log('Release :', r.url);
      return;
    }
    console.log(`Cache labo : ${photos.length} photos → ${dir}`);
    const p = await prefetchAll(photos, { progress, root: DEFAULT_ROOT, dir });
    console.log(
      `Terminé : ${p.have}/${p.total} en cache` + (p.failed ? `, ${p.failed} échecs` : '')
    );
    if (p.failed && p.have === 0) process.exit(1);
  }

  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

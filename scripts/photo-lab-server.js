#!/usr/bin/env node
/**
 * Labo photo local — 127.0.0.1 seulement.
 *
 *   npm run lab:photos
 *   → http://127.0.0.1:8777/dev/photo-lab/
 *
 * Les images passent par /img/:id (cache disque). Au démarrage, téléchargement
 * en arrière-plan de tout le corpus.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createPhotoLab } = require('./photo-lab-lib');
const {
  cacheId,
  cacheDir,
  findCached,
  downloadToCache,
  countCached,
  createProgress,
  prefetchAll,
  hydrateFromGithub,
} = require('./photo-lab-cache');

const ROOT = path.join(__dirname, '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PHOTO_LAB_PORT || 8777);
const lab = createPhotoLab({ root: ROOT });
const DIR = cacheDir(ROOT);
const progress = createProgress();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function isLocalHost(hostHeader) {
  const h = String(hostHeader || '').split(':')[0];
  return h === '127.0.0.1' || h === 'localhost';
}

function send(res, status, body, headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body == null ? '' : String(body));
  res.writeHead(status, {
    'Cache-Control': headers['Cache-Control'] || 'no-store',
    'X-Photo-Lab': 'local',
    ...headers,
    'Content-Length': payload.length,
  });
  res.end(payload);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
  });
}

function decorate(p) {
  const id = cacheId(p.url);
  return {
    ...p,
    id,
    src: `/img/${id}`,
    cached: !!findCached(DIR, id),
  };
}

function listed() {
  return lab.listPhotos().map(decorate);
}

function photoById(id) {
  return listed().find((p) => p.id === id) || null;
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function safeStatic(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  let rel = decoded || '/';
  if (rel === '/' || rel === '/dev' || rel === '/dev/') {
    rel = '/dev/index.html';
  } else if (rel === '/dev/photo-lab' || rel === '/dev/photo-lab/') {
    rel = '/dev/photo-lab/index.html';
  } else if (rel.endsWith('/')) {
    rel = `${rel}index.html`;
  }
  const abs = path.resolve(ROOT, `.${rel}`);
  if (!abs.startsWith(ROOT)) return null;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return abs;
}

async function serveImg(req, res, id) {
  const photo = photoById(id);
  if (!photo) {
    send(res, 404, 'unknown photo');
    return;
  }
  let file = findCached(DIR, id);
  if (!file) {
    try {
      file = await downloadToCache(photo.url, DIR);
      progress.have = countCached(DIR, lab.listPhotos());
    } catch (err) {
      sendJson(res, 502, { error: err.message || 'download failed' });
      return;
    }
  }
  const ext = path.extname(file).toLowerCase();
  const buf = fs.readFileSync(file);
  send(res, 200, buf, {
    'Content-Type': MIME[ext] || 'image/jpeg',
    'Cache-Control': 'public, max-age=86400',
  });
}

async function handleApi(req, res, url) {
  const route = url.pathname.replace(/\/+$/, '') || '/';
  try {
    if (req.method === 'GET' && route === '/api/photos') {
      const photos = listed();
      return sendJson(res, 200, { photos, stats: lab.stats(photos), cache: { ...progress } });
    }
    if (req.method === 'GET' && route === '/api/cache') {
      progress.have = countCached(DIR, lab.listPhotos());
      progress.total = progress.total || lab.listPhotos().length;
      return sendJson(res, 200, progress);
    }
    if (req.method === 'GET' && route === '/api/stats') {
      return sendJson(res, 200, lab.stats());
    }
    if (req.method === 'GET' && route === '/api/meta') {
      return sendJson(res, 200, {
        frames: lab.frames,
        seasons4: lab.SEASON4,
        seasons6: lab.SEASON6,
      });
    }
    if (req.method === 'POST' && route === '/api/reject') {
      const body = await readBody(req);
      return sendJson(res, 200, lab.rejectPhoto(body.url, body.note));
    }
    if (req.method === 'POST' && route === '/api/season') {
      const body = await readBody(req);
      return sendJson(res, 200, lab.setSeason(body.url, body));
    }
    if (req.method === 'POST' && route === '/api/credit') {
      const body = await readBody(req);
      return sendJson(res, 200, lab.setCredit(body.url, body));
    }
    if (req.method === 'POST' && route === '/api/focal') {
      const body = await readBody(req);
      return sendJson(res, 200, lab.setFocalY(body.url, body.focalY));
    }
    if (req.method === 'POST' && route === '/api/pin') {
      const body = await readBody(req);
      return sendJson(res, 200, lab.pinPhoto(body.url, body));
    }
    if (req.method === 'POST' && route === '/api/save') {
      const body = await readBody(req);
      const result = lab.saveAll(body.url, body);
      if (result && result.photo) result.photo = decorate(result.photo);
      return sendJson(res, 200, result);
    }
    if (req.method === 'POST' && route === '/api/undo') {
      return sendJson(res, 200, lab.undo());
    }
    return sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    return sendJson(res, 400, { error: err.message || String(err) });
  }
}

const server = http.createServer(async (req, res) => {
  if (!isLocalHost(req.headers.host)) {
    send(res, 403, 'localhost only');
    return;
  }
  let url;
  try {
    url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  } catch {
    send(res, 400, 'bad url');
    return;
  }

  if (url.pathname.startsWith('/img/')) {
    const id = url.pathname.slice('/img/'.length).replace(/\/+$/, '');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, 'method not allowed');
      return;
    }
    await serveImg(req, res, id);
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    await handleApi(req, res, url);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'method not allowed');
    return;
  }

  const file = safeStatic(url.pathname);
  if (!file) {
    send(res, 404, 'not found');
    return;
  }
  const ext = path.extname(file).toLowerCase();
  const buf = fs.readFileSync(file);
  send(res, 200, buf, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
});

function startPrefetch() {
  const photos = lab.listPhotos();
  progress.total = photos.length;
  progress.have = countCached(DIR, photos);
  const goSources = () => {
    progress.have = countCached(DIR, photos);
    if (progress.have >= progress.total) {
      progress.running = false;
      console.log(`Cache déjà complet : ${progress.have}/${progress.total}`);
      return;
    }
    console.log(`Cache : ${progress.have}/${progress.total} — téléchargement en arrière-plan…`);
    prefetchAll(photos, { root: ROOT, dir: DIR, progress, concurrency: 2 }).then((p) => {
      console.log(`Cache prêt : ${p.have}/${p.total}` + (p.failed ? ` (${p.failed} échecs)` : ''));
    }).catch((err) => {
      progress.running = false;
      progress.error = err.message || String(err);
      console.error('Cache :', err);
    });
  };
  if (progress.have === 0) {
    console.log('Cache vide — hydratation depuis GitHub Release…');
    hydrateFromGithub({ dir: DIR, root: ROOT }).then(() => {
      progress.have = countCached(DIR, photos);
      console.log(`GitHub : ${progress.have}/${progress.total}`);
      goSources();
    }).catch((err) => {
      console.warn('Hydratation GitHub ignorée :', err.message || err);
      goSources();
    });
    return;
  }
  goSources();
}

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Labo → http://${HOST}:${PORT}/dev/`);
    console.log(`Labo photo → http://${HOST}:${PORT}/dev/photo-lab/`);
    console.log('127.0.0.1 seulement. Ctrl+C pour quitter.');
    const cleaned = lab.cleanupDuplicates({ skipSnapshot: true });
    if (cleaned.removed) {
      console.log(`Doublons fusionnés / favorites redondantes : −${cleaned.removed}`);
    }
    startPrefetch();
  });
}

module.exports = { server, PORT, HOST, startPrefetch };

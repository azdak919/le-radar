#!/usr/bin/env node
/**
 * Exporte chaque exemple du kit (campus et La une) : fichier téléchargeable
 * (PDF 600 dpi ou PNG écran) et aperçu JPEG issu du même rendu.
 * Les photos campus viennent du cache labo local quand il est présent.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import http from 'node:http';
import { chromium } from '@playwright/test';
import { writeStamp } from './kit-poster-stamp.mjs';

const require = createRequire(import.meta.url);
const { cacheId, cacheDir, findCached } = require('./photo-lab-cache');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets/kit/affiches');
const catalog = JSON.parse(readFileSync(join(outDir, 'examples.json'), 'utf8'));
const PORT = Number(process.env.PW_PORT || 4189);
const BASE = `http://127.0.0.1:${PORT}`;
const force = process.argv.includes('--force');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

const PREVIEW = {
  tabloid: [660, 1020],
  letter: [660, 854],
  legal: [660, 1087],
  'ecran-paysage': [960, 540],
  'ecran-portrait': [540, 960],
};

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'python3',
      ['-c', `from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler; ThreadingHTTPServer(('127.0.0.1', ${PORT}), SimpleHTTPRequestHandler).serve_forever()`],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    child.stderr.on('data', (buf) => {
      if (String(buf).includes('Address already in use')) reject(new Error(String(buf)));
    });
    setTimeout(() => resolve(child), 600);
  });
}

function fileNameFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.pathname.includes('Special:FilePath')) {
      return decodeURIComponent(u.pathname.split('Special:FilePath/')[1] || '');
    }
    return decodeURIComponent(u.pathname.split('/').pop() || '');
  } catch {
    return '';
  }
}

function localPhotoMap() {
  const bank = JSON.parse(readFileSync(join(root, 'data/photo-bank.json'), 'utf8'));
  const dir = cacheDir(root);
  const byFile = new Map();
  for (const p of bank.photos || []) {
    const name = fileNameFromUrl(p.url).toLowerCase();
    if (name) byFile.set(name, p.url);
  }
  return { dir, byFile };
}

function cachedPath(requestUrl, map) {
  const direct = findCached(map.dir, cacheId(requestUrl));
  if (direct) return direct;
  const name = fileNameFromUrl(requestUrl).toLowerCase();
  const orig = map.byFile.get(name);
  if (orig) return findCached(map.dir, cacheId(orig));
  return null;
}

function mimeFor(file) {
  if (/\.png$/i.test(file)) return 'image/png';
  if (/\.webp$/i.test(file)) return 'image/webp';
  if (/\.gif$/i.test(file)) return 'image/gif';
  return 'image/jpeg';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* Une seule photo Commons à la fois. La rafale des affiches précédentes prend
 * un 429 (HTML, souvent sans CORS) : l’<img crossorigin> échoue, downloadPrint
 * n’émet aucun fichier, et le job attendait 180 s (Concordia, 14 et 15 nov. 2026). */
const COMMONS_UA = 'LE-RADAR-kit/1.0 (+https://le-radar.ca; export affiches)';
let commonsGate = Promise.resolve();
let commonsNotBefore = 0;

function serializeCommons(task) {
  const run = commonsGate.then(task, task);
  commonsGate = run.then(() => {}, () => {});
  return run;
}

function retryAfterMs(header, attempt) {
  const n = Number(header);
  if (Number.isFinite(n) && n > 0) return Math.min(n * 1000, 20000);
  const when = Date.parse(String(header || ''));
  if (Number.isFinite(when)) return Math.min(Math.max(0, when - Date.now()), 20000);
  return Math.min(20000, 2500 * (attempt + 1));
}

function commonsGet(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    let target;
    try { target = new URL(url); } catch (err) { reject(err); return; }
    const lib = target.protocol === 'http:' ? http : https;
    const req = lib.get(target, {
      headers: { 'User-Agent': COMMONS_UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
      timeout: 20000,
    }, (res) => {
      const code = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(code) && res.headers.location && redirects < 4) {
        res.resume();
        const next = new URL(res.headers.location, target).href;
        resolve(commonsGet(next, redirects + 1));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: code,
        type: String(res.headers['content-type'] || ''),
        retryAfter: res.headers['retry-after'],
        body: Buffer.concat(chunks),
      }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

async function fulfillCommons(route) {
  const url = route.request().url();
  await serializeCommons(async () => {
    let last = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wait = commonsNotBefore - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        last = await commonsGet(url);
      } catch (err) {
        console.warn(`  photo coupure, nouvel essai ${attempt + 1} :`, url.slice(0, 90));
        commonsNotBefore = Date.now() + 1500 * (attempt + 1);
        continue;
      }
      const image = /^image\//i.test(last.type);
      const ok = (last.status === 200 || last.status === 206) && image;
      if (ok) {
        await route.fulfill({
          status: last.status,
          contentType: last.type,
          body: last.body,
          headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=86400' },
        });
        commonsNotBefore = Date.now() + 120;
        return;
      }
      if (last.status === 404 || last.status === 410) break;
      const pause = retryAfterMs(last.retryAfter, attempt);
      console.warn(`  photo HTTP ${last.status} ${last.type.split(';')[0]}, pause ${pause} ms :`, url.slice(0, 90));
      commonsNotBefore = Date.now() + pause;
    }
    await route.fulfill({
      status: last ? last.status : 502,
      contentType: last ? last.type : 'text/plain',
      body: last ? last.body : Buffer.from('commons'),
      headers: { 'access-control-allow-origin': '*' },
    });
  });
}

async function attachLocalPhotos(page) {
  const map = localPhotoMap();
  await page.route(/wikimedia\.org/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
      });
      return;
    }
    const file = cachedPath(route.request().url(), map);
    if (!file) {
      const url = route.request().url();
      if (/[?&]width=\d+/.test(url) && !/[?&]width=(1400|2048|2560)\b/.test(url)) {
        await route.abort();
        return;
      }
      console.warn('  photo hors cache, téléchargée :', url.slice(0, 100));
      await fulfillCommons(route);
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: mimeFor(file),
      body: readFileSync(file),
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  });
}

function composeQuery(ex) {
  const q = new URLSearchParams();
  if ((ex.kind || 'campus') === 'une') {
    q.set('modele', 'une');
    if (ex.uni) q.set('uni', ex.uni);
    if (ex.media && ex.media !== 'tous') q.set('media', ex.media);
    if (ex.periode) q.set('periode', ex.periode);
    if (ex.layout) q.set('layout', ex.layout);
  } else {
    q.set('modele', 'campus');
    q.set('campus', ex.campus);
    if (ex.photo) q.set('photo', ex.photo);
    q.set('greeting', ex.greeting || 'none');
  }
  q.set('format', ex.format || 'tabloid');
  q.set('lang', ex.lang || 'standard');
  q.set('qr', ex.qr === false ? 'non' : 'oui');
  q.set('dpi', '600');
  return q;
}

function isScreen(ex) {
  return ex.format === 'ecran-paysage' || ex.format === 'ecran-portrait';
}

function dests(ex) {
  return {
    preview: join(outDir, `affiche-ex-${ex.id}-preview.jpg`),
    file: isScreen(ex)
      ? join(outDir, `affiche-ex-${ex.id}.png`)
      : join(outDir, `affiche-ex-${ex.id}-600dpi.pdf`),
  };
}

function writeGalleryMeta(periods) {
  const featured = 'une-udem-ql-lettre-semaine';
  const now = new Date();
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const featuredPeriod = periods[featured] || {};
  const meta = {
    generatedAt: now.toISOString(),
    previewV: `${ymd}-${featuredPeriod.id || 'semaine'}`,
    featured,
    periods,
  };
  writeFileSync(join(outDir, 'gallery-meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

function deriveFiles(srcPath, ex) {
  const [pw, ph] = PREVIEW[ex.format] || PREVIEW.tabloid;
  const { preview, file } = dests(ex);
  const screen = isScreen(ex);
  const code = `
from PIL import Image
from pathlib import Path
src = Path(${JSON.stringify(srcPath)})
im = Image.open(src).convert('RGB')
pw, ph = ${pw}, ${ph}
if ${screen ? 'True' : 'False'}:
    Path(${JSON.stringify(file)}).write_bytes(src.read_bytes())
else:
    im.save(${JSON.stringify(file)}, 'PDF', resolution=600)
prev = im.copy()
prev.thumbnail((pw, ph), Image.LANCZOS)
out = Image.new('RGB', (pw, ph), (14, 15, 18) if sum(prev.getpixel((0, 0))[:3]) < 80 else (255, 255, 255))
out.paste(prev, ((pw - prev.width) // 2, (ph - prev.height) // 2))
out.save(${JSON.stringify(preview)}, quality=86)
print('wrote', ${JSON.stringify(preview)})
`;
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c', code], { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (b) => { err += b; });
    child.on('exit', (code) => {
      if (code === 0) resolve({ preview, file });
      else reject(new Error(err || `python exit ${code}`));
    });
  });
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const server = await startServer();
  const launch = process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] }
    : {};
  const browser = await chromium.launch(launch);
  const tmp = join(tmpdir(), 'kit-gallery-export');
  mkdirSync(tmp, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await attachLocalPhotos(page);
    const examples = catalog.examples.filter((ex) => !only || ex.id === only || ex.kind === only);
    let existingMeta = {};
    try { existingMeta = JSON.parse(readFileSync(join(outDir, 'gallery-meta.json'), 'utf8')); } catch { /* premier passage */ }
    const periods = { ...(existingMeta.periods || {}) };
    for (const ex of examples) {
      const out = dests(ex);
      if (!force && existsSync(out.preview) && existsSync(out.file)) {
        console.log('skip', ex.id);
        continue;
      }
      const url = `${BASE}/affiches/?${composeQuery(ex)}`;
      console.log('→', ex.id, url);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.locator('#preview').waitFor({ timeout: 30000 });
      if ((ex.kind || 'campus') !== 'une') {
        await page.waitForFunction(() => document.body?.dataset?.campusLayout === 'a9e8f52', { timeout: 20000 });
      }
      await page.waitForFunction(() => document.getElementById('preview')?.dataset.state === 'pret', { timeout: 90000 });
      await page.evaluate(() => document.fonts.ready);
      const downloadPromise = page.waitForEvent('download', { timeout: 180000 });
      await page.locator('#dl-jpg').click();
      const started = Date.now();
      let download = null;
      let downloadError = null;
      downloadPromise.then((d) => { download = d; }).catch((err) => { downloadError = err; });
      while (!download && !downloadError && Date.now() - started < 180000) {
        const status = await page.locator('#status').innerText().catch(() => '');
        if (status.startsWith('Téléchargement impossible')) {
          throw new Error(status);
        }
        await page.waitForTimeout(400);
      }
      if (!download) throw downloadError || new Error('timeout waiting for download');
      const suggested = download.suggestedFilename() || `${ex.id}.bin`;
      const srcPath = join(tmp, `${ex.id}-${suggested}`);
      await download.saveAs(srcPath);
      const written = await deriveFiles(srcPath, ex);
      if ((ex.kind || 'campus') === 'une') {
        const period = await page.evaluate(() => {
          const el = document.getElementById('preview');
          if (!el || !el.dataset.periodFr) return null;
          return { id: el.dataset.periodId || '', fr: el.dataset.periodFr, en: el.dataset.periodEn || '' };
        });
        if (period && period.fr) periods[ex.id] = period;
      }
      console.log('OK', ex.id, '→', written.file);
    }
    const meta = writeGalleryMeta(periods);
    console.log('gallery-meta', meta.previewV);
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
}

main().then(() => {
  const stamp = writeStamp(root);
  console.log('stamp', stamp.fingerprint);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});

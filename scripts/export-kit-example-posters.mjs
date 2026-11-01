#!/usr/bin/env node
/**
 * Exporte des aperçus d’affiches (campus + sa photo) pour la galerie du kit.
 * Les photos viennent du cache labo local — pas de Wikimedia au runtime du kit.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
      // Pas en cache : on va chercher la photo publique (sinon l’aperçu sortait sans photo).
      console.warn('  photo hors cache, téléchargée :', route.request().url().slice(0, 100));
      await route.continue();
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

async function pickPhoto(page, hint) {
  await page.locator('#photo-grid label').first().waitFor({ timeout: 15000 });
  if (!hint) {
    await page.locator('#photo-grid label').first().click();
    return;
  }
  const more = page.locator('#photo-more');
  if (await more.isVisible()) {
    const t = (await more.textContent()) || '';
    if (/plus/i.test(t)) await more.click();
  }
  await page.waitForTimeout(400);
  const labels = page.locator('#photo-grid label');
  const n = await labels.count();
  const needle = hint.toLowerCase();
  for (let i = 0; i < n; i += 1) {
    const title = ((await labels.nth(i).getAttribute('title')) || '').toLowerCase();
    if (title.includes('fond radar')) continue;
    if (title.includes(needle)) {
      await labels.nth(i).click();
      console.log('  photo', title.slice(0, 80));
      return;
    }
  }
  for (let i = 0; i < n; i += 1) {
    const title = ((await labels.nth(i).getAttribute('title')) || '').toLowerCase();
    if (!title.includes('fond radar')) {
      await labels.nth(i).click();
      console.warn('  repli photo (hint manquant):', hint, '→', title);
      return;
    }
  }
}

async function capture(page, dest) {
  // Attendre la photo : sinon l’aperçu sort sans fond (course observée sur Laval).
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
  const data = await page.locator('#preview canvas').evaluate((c) => {
    // Aperçu net (2×) pour la galerie du kit : 660 × 1020 px.
    const o = document.createElement('canvas');
    o.width = 660;
    o.height = 1020;
    const g = o.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(c, 0, 0, o.width, o.height);
    return o.toDataURL('image/jpeg', 0.84);
  });
  const buf = Buffer.from(data.split(',')[1], 'base64');
  writeFileSync(dest, buf);
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    await attachLocalPhotos(page);
    for (const ex of catalog.examples) {
      const dest = join(outDir, `affiche-ex-${ex.id}-preview.jpg`);
      if (existsSync(dest) && !force) {
        console.log('skip', ex.id);
        continue;
      }
      await page.goto(`${BASE}/affiches/?campus=${ex.campus}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.locator('#preview canvas').waitFor({ timeout: 20000 });
      await page.evaluate(() => document.fonts.ready);
      await page.locator(`label:has(input[name="campus"][value="${ex.campus}"])`).click();
      await page.waitForTimeout(300);
      if (ex.lang === 'bilingue') {
        const bi = page.locator('label:has(input[name="lang"][value="bilingue"])');
        if (await bi.isVisible()) await bi.click();
      }
      await page.selectOption('#greeting', ex.greeting || 'none');
      await page.locator(`label:has(input[name="langs"][value="${ex.langs ? 'oui' : 'non'}"])`).click();
      await page.locator(`label:has(input[name="qr"][value="${ex.qr ? 'oui' : 'non'}"])`).click();
      await pickPhoto(page, ex.photo);
      await capture(page, dest);
      console.log('OK', ex.id);
    }
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
}

main().then(() => writeStamp(root)).catch((err) => {
  console.error(err);
  process.exit(1);
});

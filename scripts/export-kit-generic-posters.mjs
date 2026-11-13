#!/usr/bin/env node
/**
 * Exporte l’affiche générique aux réglages par défaut de /affiches/
 * (fond radar, FR, QR, sans message manuscrit, 600 dpi) en 11×17, lettre et légal.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { writeStamp } from './kit-poster-stamp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets/kit/affiches');
const PORT = Number(process.env.PW_PORT || 4188);
const BASE = `http://127.0.0.1:${PORT}`;

const FORMATS = [
  { value: 'tabloid', file: '11x17', w: 6600, h: 10200 },
  { value: 'letter', file: 'lettre', w: 5100, h: 6600 },
  { value: 'legal', file: 'legal', w: 5100, h: 8400 },
];

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'python3',
      ['-c', `from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler; ThreadingHTTPServer(('127.0.0.1', ${PORT}), SimpleHTTPRequestHandler).serve_forever()`],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const t = setTimeout(() => reject(new Error('serveur timeout')), 8000);
    const onErr = (buf) => {
      const s = String(buf);
      if (s.includes('Address already in use')) reject(new Error(s));
    };
    child.stderr.on('data', onErr);
    setTimeout(() => {
      clearTimeout(t);
      resolve(child);
    }, 600);
  });
}

/* ImageMagick si présent, sinon Pillow (même résultat : PDF 600 dpi, aperçu 660 × 1020). */
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')}`))));
  });
}
async function convert(magickArgs, src, dest) {
  try {
    await run('magick', [src, ...magickArgs]);
  } catch {
    const py = dest.endsWith('.pdf')
      ? `from PIL import Image; Image.open(${JSON.stringify(src)}).convert('RGB').save(${JSON.stringify(dest)}, 'PDF', resolution=600)`
      : `from PIL import Image; im=Image.open(${JSON.stringify(src)}).convert('RGB'); im.thumbnail((660, 1020), Image.LANCZOS); im.save(${JSON.stringify(dest)}, quality=84)`;
    await run('python3', ['-c', py]);
  }
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  try {
    const page = await browser.newPage();
    await page.goto(`${BASE}/affiches/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('#preview canvas').waitFor({ timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await page.selectOption('#greeting', 'none');
    for (const fmt of FORMATS) {
      await page.locator(`label:has(input[name="format"][value="${fmt.value}"])`).click();
      await page.waitForTimeout(400);
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 60000 }),
        page.locator('#dl-jpg').click(),
      ]);
      const dest = join(outDir, `affiche-generique-${fmt.file}-600dpi.jpg`);
      await download.saveAs(dest);
      const pdf = dest.replace(/\.jpg$/, '.pdf');
      await convert(['-units', 'PixelsPerInch', '-density', '600', pdf], dest, pdf);
      if (fmt.value === 'tabloid') {
        const preview = join(outDir, 'affiche-generique-preview.jpg');
        await convert(['-resize', '660x1020', '-quality', '84', preview], dest, preview);
      }
      console.log('OK', dest, '→', pdf);
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

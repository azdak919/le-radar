#!/usr/bin/env node
/**
 * Exporte l’affiche générique aux réglages par défaut de /affiches/
 * (fond radar, FR, QR, 600 dpi) en 11×17, lettre et légal.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

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

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${BASE}/affiches/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('#preview canvas').waitFor({ timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    for (const fmt of FORMATS) {
      await page.locator(`label:has(input[name="format"][value="${fmt.value}"])`).click();
      await page.waitForTimeout(400);
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 60000 }),
        page.locator('#dl').click(),
      ]);
      const dest = join(outDir, `affiche-generique-${fmt.file}-600dpi.jpg`);
      await download.saveAs(dest);
      console.log('OK', dest);
    }
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

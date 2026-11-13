// Rendu sans tête des images « La une du matin / du soir » (affiches/social-une.html) avec Playwright.
// renderImages(model, { outDir, formats }) → { portrait: { file, bytes, width, height, shown }, paysage: … }
// JPEG ≤ MAX_IMAGE_BYTES (Bluesky : 976 Ko), qualité réduite au besoin.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { IMAGE_SIZES, MAX_IMAGE_BYTES, frDay } from './une-lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c', `from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler as H; H.log_message=lambda *a: None; ThreadingHTTPServer(('127.0.0.1', ${port}), H).serve_forever()`], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', b => { if (String(b).includes('Address already in use')) reject(new Error(String(b))); });
    setTimeout(() => resolve(child), 600);
  });
}

/** Modèle passé à la page : seulement ce qu'elle affiche. Images : miroir le-radar.ca d'abord (le dépôt n'a pas les fichiers miroir). */
export function pageModel(model) {
  return {
    slot: { label: model.slot.label, dayLabel: frDay(model.slot.day).replace(/^./, c => c.toUpperCase()) },
    items: model.items.map((x, i) => ({ title: x.title, byline: x.byline, hook: i === 0 ? x.hook || '' : '', credit: x.credit || '', focalY: x.focalY, images: [...new Set([x.siteImage, ...(x.images || []).filter(u => /^https:/.test(u))].filter(Boolean))] })),
  };
}

export async function renderImages(model, { outDir, formats = ['portrait', 'paysage'], prefix = 'une', port = Number(process.env.UNE_PORT || 4193) } = {}) {
  const { chromium } = await import('@playwright/test');
  fs.mkdirSync(outDir, { recursive: true });
  const server = await startServer(port), browser = await chromium.launch();
  const out = {};
  try {
    for (const format of formats) {
      const { width, height } = IMAGE_SIZES[format];
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      await page.goto(`http://127.0.0.1:${port}/affiches/social-une.html`, { waitUntil: 'load' });
      const info = await page.evaluate(arg => window.renderUne(arg), { model: pageModel(model), format });
      const file = path.join(outDir, `${prefix}-${format}-${width}x${height}.jpg`);
      let buf;
      for (const quality of [88, 80, 72, 64]) { buf = await page.locator('#card').screenshot({ type: 'jpeg', quality }); if (buf.length <= MAX_IMAGE_BYTES) break; }
      if (buf.length > MAX_IMAGE_BYTES) throw new Error(`image ${format} trop lourde (${buf.length} o)`);
      fs.writeFileSync(file, buf);
      out[format] = { file, bytes: buf.length, width, height, ...info };
      await page.close();
    }
  } finally { await browser.close(); server.kill(); }
  return out;
}

#!/usr/bin/env node
// Captures d'un exemple de revue (scripts/revue/revue-run.mjs --sample) : sert le dépôt (CSS, polices, chrome du site) avec le
// dossier d'exemple par-dessus, puis enregistre chaque page en PNG pleine hauteur (mobile 390 px et ordinateur 1280 px, modes
// clair et sombre), puis en PDF d'impression réels (feuille d'impression du site, @page) sur Letter, Legal, Tabloid, A4 et A3
// en portrait, dans impression/. Aucune écriture dans le dépôt.
// Usage : node scripts/revue/revue-screenshots.mjs --sample /tmp/revue --out /tmp/revue/captures
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (n, d = '') => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SAMPLE = path.resolve(arg('sample', 'revue-sample'));
const OUT = path.resolve(arg('out', path.join(SAMPLE, 'captures')));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const cands = [path.join(SAMPLE, p), path.join(ROOT, p)];
    const f = cands.find(c => c.startsWith(SAMPLE) || c.startsWith(ROOT)) && cands.find(c => fs.existsSync(c) && fs.statSync(c).isFile());
    if (!f) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

const { chromium } = await import('@playwright/test');
fs.mkdirSync(OUT, { recursive: true });
const index = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'data/revue/index.json'), 'utf8'));
const server = await serve(), port = server.address().port, browser = await chromium.launch({ args: ['--host-resolver-rules=MAP revue.test 127.0.0.1'] }); // hôte ≠ localhost : pas de barre de labo dev/
const pages = [...index.map(r => ({ name: r.id, url: `/${r.path}` })), { name: 'index-des-revues', url: '/revue/' }];
const shots = [];
const PAPER = { Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8], A4: [210, 297], A3: [297, 420] }; // mm, portrait
try {
  for (const pg of pages) {
    for (const [dev, vp] of [['mobile', { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 }], ['ordinateur', { width: 1280, height: 900, deviceScaleFactor: 1 }]]) {
      for (const theme of ['clair', 'sombre']) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: !!vp.isMobile, colorScheme: theme === 'sombre' ? 'dark' : 'light', locale: 'fr-CA', timezoneId: 'America/Toronto', serviceWorkers: 'block' });
        const page = await ctx.newPage();
        await page.goto(`http://revue.test:${port}${pg.url}`, { waitUntil: 'load' });
        await page.waitForTimeout(1200);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (overflow > 1) console.log(`::warning::${pg.name} ${dev} ${theme} : débordement horizontal ${overflow} px`);
        const file = path.join(OUT, `${pg.name}-${dev}-${theme}.png`);
        await page.screenshot({ path: file, fullPage: true });
        shots.push(file);
        await ctx.close();
      }
    }
    // Impression : largeur imprimable de chaque format (marges @page de style-chrome.css : 12 mm de chaque côté).
    fs.mkdirSync(path.join(OUT, 'impression'), { recursive: true });
    for (const [format, [wmm, hmm]] of Object.entries(PAPER)) {
      const mm = (v) => Math.round(v / 25.4 * 96);
      const ctx = await browser.newContext({ viewport: { width: mm(wmm - 24), height: mm(hmm - 26) }, colorScheme: 'light', locale: 'fr-CA', timezoneId: 'America/Toronto', serviceWorkers: 'block' });
      const page = await ctx.newPage();
      await page.emulateMedia({ media: 'print' });
      await page.goto(`http://revue.test:${port}${pg.url}`, { waitUntil: 'load' });
      await page.waitForTimeout(800);
      const pdf = path.join(OUT, 'impression', `${pg.name}-${format}.pdf`);
      await page.pdf({ path: pdf, format, printBackground: false });
      shots.push(pdf);
      await ctx.close();
    }
  }
} finally { await browser.close(); server.close(); }
console.log(`${shots.length} fichier(s) dans ${OUT}`);

#!/usr/bin/env node
// Aperçus Instagram 3:4 (1080×1440), JPEG sRGB. Textes réels du fil et de sports.json.
// Aucun envoi. Usage : node scripts/social/instagram-preview.mjs [--news news.json] [--out dossier]
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { weekendModel, publishedModel, SPORT_EMOJI } from './formats.mjs';

const require = createRequire(import.meta.url);
const { unpackSportsPayload } = require('../sports-payload-lib.js');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const outDir = path.resolve(arg('out', 'une-preview'));
const newsPath = arg('news', path.join(ROOT, 'news.json'));
fs.mkdirSync(outDir, { recursive: true });

const SEX = { M: '(H)', F: '(F)' };
const SPORT_FR = { football: 'Football', hockey: 'Hockey', basketball: 'Basketball', volleyball: 'Volleyball', soccer: 'Soccer', rugby: 'Rugby', badminton: 'Badminton', sailing: 'Voile', cheerleading: 'Cheerleading', 'flag-football': 'Flag football' };

function lead(kind) {
  const news = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
  const items = (news.items || []).filter(a => a.lang !== 'en' && a.title && a.source && (a.imageLocal || a.image));
  const it = items[kind === 'soir' ? 1 : 0] || items[0];
  const img = it.imageLocal && fs.existsSync(path.join(ROOT, it.imageLocal)) ? '/' + it.imageLocal : it.image;
  return {
    slot: { label: kind === 'soir' ? 'La une du soir' : 'La une du matin', dayLabel: 'Dimanche 22 novembre', dayLabelYear: 'Dimanche 22 novembre 2026' },
    items: [{ title: it.title, source: it.source, credit: it.sourceImageCredit || it.sourceImageCreator || '', images: [img], focalY: 0.38 }],
  };
}

function sportModel() {
  const sports = unpackSportsPayload(JSON.parse(fs.readFileSync(path.join(ROOT, 'sports.json'), 'utf8')));
  const model = publishedModel(weekendModel(sports, Date.now(), {}), ['uni']);
  const results = model.uni.slice(0, 3).map(g => ({
    emoji: SPORT_EMOJI[g.sport] || '',
    sport: `${SPORT_FR[g.sport] || g.sport} ${SEX[g.sex] || ''}`.trim(),
    a: g.A.name, as: String(g.A.score), b: g.B.name, bs: String(g.B.score),
  }));
  return { poster: 'sport', slot: { label: 'Résultats de la fin de semaine', dayLabel: model.window.label }, media: 'U SPORTS', results };
}

function startServer(port) {
  return new Promise((resolve) => {
    const child = spawn('python3', ['-c', `from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler as H; H.log_message=lambda *a: None; ThreadingHTTPServer(('127.0.0.1', ${port}), H).serve_forever()`], { cwd: ROOT, stdio: 'ignore' });
    setTimeout(() => resolve(child), 400);
  });
}

function toSrgb(file) {
  try { execFileSync('convert', [file, '-colorspace', 'sRGB', '-quality', '86', file], { stdio: 'ignore' }); }
  catch { /* le JPEG de Chromium est déjà en sRGB */ }
}

const shots = [
  ['instagram-matin.jpg', lead('matin')],
  ['instagram-soir.jpg', lead('soir')],
  ['instagram-sport.jpg', sportModel()],
];

const port = 4217;
const server = await startServer(port);
const pw = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const chromium = pw.chromium || pw.default.chromium;
const browser = await chromium.launch();
try {
  for (const [name, model] of shots) {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1440 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/affiches/social-une.html`, { waitUntil: 'load' });
    const info = await page.evaluate(arg => window.renderUne(arg), { model, format: 'grille' });
    const file = path.join(outDir, name);
    const buf = await page.locator('#card').screenshot({ type: 'jpeg', quality: 86 });
    if (buf.length > 8 * 1024 * 1024) throw new Error(`${name} dépasse 8 Mo`);
    fs.writeFileSync(file, buf);
    toSrgb(file);
    const saved = fs.statSync(file).size;
    console.log(`${name} ${saved} o débordement=${info.overflow}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}

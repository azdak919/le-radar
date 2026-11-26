#!/usr/bin/env node
/**
 * Publie les PDF d'une édition (Lettre, Légal, Tabloïd, A4, A3) à côté de
 * index.html, pour le bouton « Télécharger le PDF ». Impression identique
 * aux tests tests/print-formats.spec.mjs (printBackground: false).
 *
 *   node scripts/revue/revue-pdfs.mjs --id 2026-11-17-soir
 *   node scripts/revue/revue-pdfs.mjs --id soir
 *   node scripts/revue/revue-pdfs.mjs --all
 *
 * « matin » / « soir » se résolvent vers l'édition correspondante la plus récente
 * déjà écrite sous revue/ (via data/revue/index.json). Le workflow doit pourtant
 * passer l'identifiant complet AAAA-MM-JJ-matin|soir : un --id matin seul a
 * fait échouer la publication du 18 nov. 2026 avant le commit.
 */
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { listEditionDirs, resolveEditionId } from './revue-pdf-id.mjs';
import { socialModel, withVenues } from './revue-social-pick.mjs';
import { createRequire } from 'node:module';
const { syncEditionPdfLinks } = createRequire(import.meta.url)('./revue-render.js');
const { renderLinkedInCarousel, carouselAlts, W: LI_W, H: LI_H } = createRequire(import.meta.url)('./revue-linkedin.js');

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PW_PORT || 4193);
const FORMATS = [
  { file: 'lettre.pdf', format: 'Letter' },
  { file: 'legal.pdf', format: 'Legal' },
  { file: 'tabloid.pdf', format: 'Tabloid' },
  { file: 'a4.pdf', format: 'A4' },
  { file: 'a3.pdf', format: 'A3' },
];

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
    setTimeout(() => resolve(child), 500);
  });
}

async function printEdition(browser, id) {
  const pageUrl = `http://127.0.0.1:${PORT}/revues/${id}/`;
  const outDir = join(root, 'revues', id);
  mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage();
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('article.revue, .revue-wire', { timeout: 20_000 });
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => { d.open = true; });
  });
  // Images en loading="lazy" : sans défilement, celles du bas ne se chargeaient jamais à l'impression.
  // On les charge toutes, puis on retire les figures dont l'image a échoué : sinon la figure tombe à
  // largeur nulle et son crédit s'imprime une lettre par ligne (revue du soir du 25 nov. 2026, p. 2).
  const dropped = await page.evaluate(async () => {
    const imgs = [...document.images];
    imgs.forEach((i) => { i.loading = 'eager'; });
    await Promise.all(imgs.map((i) => (i.complete && i.naturalWidth) ? null : new Promise((r) => {
      i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 15000);
    })));
    let n = 0;
    for (const f of document.querySelectorAll('figure')) {
      const im = f.querySelector('img');
      if (im && !im.naturalWidth) { f.remove(); n++; }
    }
    return n;
  });
  if (dropped) console.log(`   ${dropped} figure(s) sans image retirée(s) de l'impression`);
  await page.emulateMedia({ media: 'print' });
  for (const fmt of FORMATS) {
    const dest = join(outDir, fmt.file);
    await page.pdf({ path: dest, format: fmt.format, printBackground: false, preferCSSPageSize: true });
    const longName = `le-radar-revue-${id}-${fmt.file}`;
    copyFileSync(dest, join(outDir, longName));
    console.log('  ', fmt.file, longName);
  }
  await page.close();
}

/**
 * Carrousel LinkedIn (revues/<id>/linkedin.pdf, pages 1080 × 1350) et sa vignette (linkedin-cover.jpg,
 * exigée par Buffer pour un document). Données : data/revue/reviews/<id>.json.
 */
async function printLinkedIn(browser, id) {
  const file = join(root, 'data/revue/reviews', `${id}.json`);
  if (!existsSync(file)) { console.log(`   (carrousel LinkedIn sauté : ${file} absent)`); return; }
  // Réseaux seulement : les meilleurs articles (note sociale). La page et les PDF d'impression restent complets.
  const model = await withVenues(socialModel(JSON.parse(readFileSync(file, 'utf8')), { root }));
  const html = renderLinkedInCarousel(model);
  const page = await browser.newPage({ viewport: { width: LI_W, height: LI_H } });
  // Servi depuis la même origine que le site local : sinon (about:blank) les polices du site sont refusées.
  const at = `http://127.0.0.1:${PORT}/revues/${id}/__linkedin.html`;
  await page.route(at, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  // Photos réduites à la taille d'affichage (JPEG q80) : sans ça, Chrome intègre les originaux (44 Mo).
  await page.route(/\.(jpe?g|png|webp|avif)(\?.*)?$/i, async (route) => {
    try {
      const res = await route.fetch();
      const buf = await res.body();
      let out = buf;
      try { out = execFileSync('convert', ['-', '-auto-orient', '-resize', `${LI_W}x${LI_H}>`, '-strip', '-quality', '80', 'jpg:-'], { input: buf, maxBuffer: 64 << 20 }); } catch { /* ImageMagick absent : original */ }
      await route.fulfill({ status: res.status(), contentType: 'image/jpeg', body: out });
    } catch { await route.continue(); }
  });
  await page.goto(at, { waitUntil: 'load', timeout: 60_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 15000); }))));
    // Image d'article introuvable : la page passe en mise en page sans photo plutôt qu'un cadre vide.
    for (const im of document.querySelectorAll('.li-photo img')) if (!im.naturalWidth) { const p = im.closest('.li-page'); im.closest('.li-photo').remove(); p.classList.add('li-article--noimg'); }
    for (const im of document.querySelectorAll('.li-cover__img')) if (!im.naturalWidth) im.remove();
    // Page finale : tant que sport et radio débordent au-dessus de l'encadré du lien, retirer la dernière ligne de la
    // liste la plus longue (jamais sous une ligne par liste) ; une liste vidée emporte son titre.
    for (const body of document.querySelectorAll('.li-end__body')) {
      for (let guard = 0; body.scrollHeight > body.clientHeight + 1 && guard < 30; guard++) {
        const lists = [...body.querySelectorAll('.li-list')].sort((a, b) => b.children.length - a.children.length);
        const l = lists.find((x) => x.children.length > 1);
        if (l) l.lastElementChild.remove(); else { const last = lists.at(-1); last?.previousElementSibling?.remove(); last?.remove(); }
      }
    }
  });
  const outDir = join(root, 'revues', id);
  await page.screenshot({ path: join(outDir, 'linkedin-cover.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: LI_W, height: LI_H } });
  const dest = join(outDir, 'linkedin.pdf');
  await page.pdf({ path: dest, width: `${LI_W}px`, height: `${LI_H}px`, printBackground: true, preferCSSPageSize: true });
  copyFileSync(dest, join(outDir, `le-radar-revue-${id}-linkedin.pdf`));
  console.log('   linkedin.pdf', `le-radar-revue-${id}-linkedin.pdf`, 'linkedin-cover.jpg');
  // Mêmes pages en images 4:5 (carrousel Facebook et Instagram, qui n'acceptent pas de PDF) + carrousel.json
  // (fichiers et textes alternatifs), lu par scripts/social/une-run.mjs → revueCarousel.
  for (const f of readdirSync(outDir)) if (/^carrousel-\d+\.jpg$/.test(f)) rmSync(join(outDir, f));
  const alts = carouselAlts(model), shots = page.locator('.li-page'), n = await shots.count(), files = [];
  for (let i = 0; i < n; i++) {
    const f = `carrousel-${i + 1}.jpg`;
    await shots.nth(i).screenshot({ path: join(outDir, f), type: 'jpeg', quality: 85 });
    files.push({ file: f, alt: alts[i] || '' });
  }
  writeFileSync(join(outDir, 'carrousel.json'), JSON.stringify({ id, width: LI_W, height: LI_H, pages: files }, null, 1) + '\n');
  console.log(`   carrousel-1..${n}.jpg carrousel.json`);
  await page.close();
}

function requestedIds(argv = process.argv, base = root) {
  if (argv.includes('--all')) return listEditionDirs(base);
  const raw = argv.find((a) => a.startsWith('--id='))?.slice(5) || (argv.includes('--id') ? argv[argv.indexOf('--id') + 1] : '');
  return raw ? [resolveEditionId(raw, base)] : [];
}

function syncIds(ids) {
  for (const id of ids) syncEditionPdfLinks(join(root, 'revues', id));
}

async function main() {
  const ids = requestedIds();
  if (!ids.length) {
    console.error('usage: revue-pdfs.mjs --id YYYY-MM-DD-matin|soir | --id matin|soir | --all');
    process.exit(2);
  }
  if (process.argv.includes('--sync-only')) {
    syncIds(ids);
    console.log('liens PDF alignés sur les fichiers présents');
    return;
  }
  const server = await startServer();
  try {
    const browser = await chromium.launch({ headless: true });
    for (const id of ids) {
      if (!existsSync(join(root, 'revues', id, 'index.html'))) {
        console.error('édition introuvable :', id);
        process.exit(1);
      }
      console.log(id);
      await printEdition(browser, id);
      await printLinkedIn(browser, id);
    }
    await browser.close();
  } finally {
    syncIds(ids);
    server.kill('SIGTERM');
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) await main();

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
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { listEditionDirs, resolveEditionId } from './revue-pdf-id.mjs';
import { createRequire } from 'node:module';
const { syncEditionPdfLinks } = createRequire(import.meta.url)('./revue-render.js');

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
  const pageUrl = `http://127.0.0.1:${PORT}/revue/${id}/`;
  const outDir = join(root, 'revue', id);
  mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage();
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('article.revue, .revue-wire', { timeout: 20_000 });
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => { d.open = true; });
  });
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

function requestedIds(argv = process.argv, base = root) {
  if (argv.includes('--all')) return listEditionDirs(base);
  const raw = argv.find((a) => a.startsWith('--id='))?.slice(5) || (argv.includes('--id') ? argv[argv.indexOf('--id') + 1] : '');
  return raw ? [resolveEditionId(raw, base)] : [];
}

function syncIds(ids) {
  for (const id of ids) syncEditionPdfLinks(join(root, 'revue', id));
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
      if (!existsSync(join(root, 'revue', id, 'index.html'))) {
        console.error('édition introuvable :', id);
        process.exit(1);
      }
      console.log(id);
      await printEdition(browser, id);
    }
    await browser.close();
  } finally {
    syncIds(ids);
    server.kill('SIGTERM');
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) await main();

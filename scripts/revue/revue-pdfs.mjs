#!/usr/bin/env node
/**
 * Publie les PDF d'une édition (Lettre, Légal, Tabloïd, A4, A3) à côté de
 * index.html, pour le bouton « Télécharger le PDF ». Impression identique
 * aux tests tests/print-formats.spec.mjs (printBackground: false).
 *
 *   node scripts/revue/revue-pdfs.mjs --id 2026-11-17-soir
 *   node scripts/revue/revue-pdfs.mjs --all
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

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

function listEditions() {
  const dir = join(root, 'revue');
  return readdirSync(dir).filter((name) => {
    if (!/^\d{4}-\d{2}-\d{2}-(matin|soir)$/.test(name)) return false;
    return existsSync(join(dir, name, 'index.html'));
  });
}

async function printEdition(browser, id) {
  const pageUrl = `http://127.0.0.1:${PORT}/revue/${id}/`;
  const outDir = join(root, 'revue', id);
  mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage();
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('article.revue, .revue-wire', { timeout: 20_000 });
  for (const fmt of FORMATS) {
    const dest = join(outDir, fmt.file);
    await page.pdf({ path: dest, format: fmt.format, printBackground: false, preferCSSPageSize: true });
    console.log('  ', fmt.file);
  }
  await page.close();
}

const ids = process.argv.includes('--all')
  ? listEditions()
  : [process.argv.find((a) => a.startsWith('--id='))?.slice(5) || (process.argv.includes('--id') ? process.argv[process.argv.indexOf('--id') + 1] : '')].filter(Boolean);
if (!ids.length) {
  console.error('usage: revue-pdfs.mjs --id YYYY-MM-DD-matin|soir | --all');
  process.exit(2);
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
  server.kill('SIGTERM');
}

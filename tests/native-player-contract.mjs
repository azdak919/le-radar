/**
 * D17 — contrat du lecteur natif sur les routes publiques.
 *
 * Règles (architecture réelle 2026-07) :
 * - Accueil, pages SEO générées, horaires/médias/archives : balisage #tuner
 *   natif + app.js (pas d’iframe #radar-embed).
 * - feeds.html (page écrite à la main) : native-tuner.js injecte le même
 *   balisage depuis index.html, puis charge app.js — pas d’iframe.
 * - pomo / solitaire : exception explicite — iframe #radar-embed → tuner-embed.
 * - offline.html : hors contrat audio (mini-jeu hors-ligne).
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function walkHtml(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'test-results' || name === 'playwright-report') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkHtml(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

function rel(p) {
  return relative(root, p).replace(/\\/g, '/');
}

const IFRAME_ALLOWED = new Set(['pomo/index.html', 'solitaire/index.html']);
const NO_PLAYER = new Set([
  'offline.html',
  'easter-egg.html',
  'tuner-embed.html', // est le lecteur, pas un consommateur
  'sports-embed.html', // iframe sports, pas un consommateur radio
]);

const pages = walkHtml(root);
let native = 0;
let iframeOk = 0;
let skipped = 0;

for (const file of pages) {
  const r = rel(file);
  // Pages générées hors site public
  if (r.startsWith('dev/') || r.startsWith('docs/')) {
    skipped += 1;
    continue;
  }
  const html = readFileSync(file, 'utf8');
  const hasEmbed = /id=["']radar-embed["']/.test(html);
  const hasNativeTuner = /id=["']tuner["']/.test(html);
  const hasNativeLoader = /native-tuner\.js/.test(html);
  const hasPlayerEl = /id=["']radar-player["']/.test(html) || hasNativeLoader;
  const hasApp = /app\.js/.test(html) || hasNativeLoader;

  if (IFRAME_ALLOWED.has(r)) {
    assert(hasEmbed, `${r}: exception iframe — #radar-embed requis`);
    assert(/tuner-embed\.html/.test(html), `${r}: iframe doit cibler tuner-embed.html`);
    assert(!hasNativeTuner, `${r}: pas de #tuner natif en parallèle de l’iframe`);
    iframeOk += 1;
    continue;
  }

  if (NO_PLAYER.has(r) || r.endsWith('/offline.html')) {
    assert(!hasEmbed, `${r}: pas d’iframe lecteur hors exceptions`);
    skipped += 1;
    continue;
  }

  // Toute autre page HTML publique avec chrome site : lecteur natif attendu
  // si elle charge le chrome radio (app.js / native-tuner / #tuner).
  const looksPublic =
    r === 'index.html'
    || r === 'feeds.html'
    || r.startsWith('radios/')
    || r.startsWith('journaux/')
    || r.startsWith('etablissements/')
    || r.startsWith('horaires/')
    || r.startsWith('medias/')
    || r.startsWith('sports/')
    || r.startsWith('archives/')
    || r.startsWith('kit-media/')
    || r.startsWith('iframes/')
    || r.startsWith('en/');

  if (!looksPublic) {
    // Fiches isolées sans chrome : pas de contrainte D17
    if (hasEmbed) {
      assert.fail(`${r}: #radar-embed hors liste d’exceptions (pomo/solitaire)`);
    }
    skipped += 1;
    continue;
  }

  assert(!hasEmbed, `${r}: #radar-embed interdit (lecteur natif requis)`);
  assert(
    hasNativeTuner || hasNativeLoader,
    `${r}: #tuner natif ou native-tuner.js requis`,
  );
  if (hasNativeTuner) {
    assert(hasPlayerEl || hasApp, `${r}: #radar-player ou app.js requis avec #tuner`);
  }
  native += 1;
}

assert(native >= 50, `attendu ≥ 50 pages natives, got ${native}`);
assert(iframeOk === 2, `attendu 2 pages iframe (pomo+solitaire), got ${iframeOk}`);

console.log(`OK native-player-contract (${native} natives, ${iframeOk} iframes, ${skipped} hors périmètre)`);

#!/usr/bin/env node
/**
 * Miroir local des photos de repli Wikimedia Commons (banque campus + stockImage).
 *
 * Cause : upload.wikimedia.org répond 429 (text/html) dès qu'un téléphone
 * charge plusieurs vignettes d'un coup. Le navigateur bloque la réponse (ORB),
 * toutes les photos campus de repli échouent l'une après l'autre et la carte
 * reste vide (The McGill Daily, « MUNACA’s Campaign… », oct. 2026).
 * On sert donc ces photos depuis le-radar.ca : vignettes 500 px (cartes) dans
 * assets/stock-images/, carte d'URL dans stock-images-map.js (lue par le client).
 * Le client garde l'URL Commons comme repli si le fichier local manque.
 *
 *   node scripts/mirror-stock-images.js --update
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'stock-images');
const MAP_JS = path.join(ROOT, 'stock-images-map.js');
const UA = 'LE-RADAR-StockMirror/1.0 (https://le-radar.ca/; azdak-qc@proton.me) node-fetch';
const WIDTH = 500;
const MAX_BYTES = 400_000;
const BUDGET = 16 * 1024 * 1024;
const doUpdate = process.argv.includes('--update');

function originalKey(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'upload.wikimedia.org') return null;
    const m = u.pathname.match(/^\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+\.(?:jpe?g|png|webp))$/i);
    if (!m) return null;
    return { key: `${u.origin}${u.pathname}`, thumb: `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${m[3]}/${WIDTH}px-${m[3]}`, ext: /\.png$/i.test(m[3]) ? 'png' : (/\.webp$/i.test(m[3]) ? 'webp' : 'jpg') };
  } catch { return null; }
}

function bankUrls() {
  const out = [];
  const file = path.join(ROOT, 'quebec-university-backgrounds-data.js');
  if (!fs.existsSync(file)) return out;
  const ctx = { window: {}, self: {}, globalThis: {} };
  try {
    vm.runInNewContext(`${fs.readFileSync(file, 'utf8')}\n;this.__b = typeof QUEBEC_UNIVERSITY_BACKGROUNDS !== 'undefined' ? QUEBEC_UNIVERSITY_BACKGROUNDS : [];`, ctx);
  } catch { return out; }
  for (const p of ctx.__b || []) {
    const u = p && (p.stockImage || p.url || p.src);
    if (u) out.push(String(u));
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(url) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*' } });
      const type = (res.headers.get('content-type') || '').toLowerCase();
      if (res.status === 429 || res.status >= 500) { await sleep(4000 * (attempt + 1)); continue; }
      if (!res.ok || !type.startsWith('image/')) return { error: `${res.status} ${type}` };
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1200 || buf.length > MAX_BYTES) return { error: `taille ${buf.length}` };
      return { buf };
    } catch (e) { await sleep(2000); }
  }
  return { error: '429 persistant' };
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const news = JSON.parse(fs.readFileSync(path.join(ROOT, 'news.json'), 'utf8'));
  const wanted = new Map();
  for (const u of [...(news.items || []).map((i) => i.stockImage), ...bankUrls()]) {
    const k = u && originalKey(u);
    if (k && !wanted.has(k.key)) wanted.set(k.key, k);
  }
  const map = {};
  let fetched = 0; let failed = 0; let total = 0;
  for (const [key, k] of wanted) {
    const name = `${crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)}.${k.ext}`;
    const file = path.join(DIR, name);
    if (!fs.existsSync(file)) {
      if (!doUpdate) continue;
      const r = await download(k.thumb);
      await sleep(400); // poli envers Wikimedia
      if (!r.buf) { failed += 1; console.warn(`✗ ${r.error} ${k.thumb}`); continue; }
      if (total + r.buf.length > BUDGET) { console.warn('budget atteint'); break; }
      fs.writeFileSync(file, r.buf); fetched += 1;
    }
    total += fs.statSync(file).size;
    map[key] = `assets/stock-images/${name}`;
  }
  // Champ lu par l'app Android (pas de banque campus côté app).
  for (const item of news.items || []) {
    const k = item.stockImage && originalKey(item.stockImage);
    const local = k && map[k.key];
    if (local) item.stockImageLocal = local; else delete item.stockImageLocal;
  }
  if (doUpdate) fs.writeFileSync(path.join(ROOT, 'news.json'), `${JSON.stringify(news, null, 2)}\n`);
  // Ménage : fichiers plus référencés.
  const keep = new Set(Object.values(map).map((p) => path.basename(p)));
  if (doUpdate) for (const f of fs.readdirSync(DIR)) if (!keep.has(f)) fs.unlinkSync(path.join(DIR, f));
  const body = `/* LE RADAR — miroir local des photos de repli Wikimedia (généré).\n * Régénéré par : node scripts/mirror-stock-images.js --update\n * Clé : URL de l'original Commons (sans requête) → vignette ${WIDTH} px servie par le site. */\nvar RADAR_STOCK_LOCAL = ${JSON.stringify(map, null, 0).replace(/","/g, '",\n"')};\n`;
  if (doUpdate) fs.writeFileSync(MAP_JS, body);
  console.log(`stock: ${wanted.size} photos, ${Object.keys(map).length} en miroir (${fetched} nouvelles, ${failed} échecs), ${(total / 1048576).toFixed(1)} Mo`);
}
main().catch((e) => { console.error(e); process.exit(1); });

/**
 * Bannières de rubrique (« EDITORIAL » du McGill Daily, etc.) : un même visuel
 * réexporté sous un nouveau nom de fichier à chaque billet. Le nom ne trahit
 * rien (« Screenshot-… »), donc on compare l'image elle-même : empreinte dHash
 * 64 bits calculée sur une vignette 9×8 en gris (proxy wsrv.nl, PNG).
 *
 * Générique si :
 *  - le nom de fichier dit editorial / banner / default / logo (motifs ci-dessous) ;
 *  - l'empreinte est proche d'une bannière connue de data/generic-image-hashes.json ;
 *  - deux billets d'une même source, URL différentes, ont la même empreinte
 *    (l'empreinte est alors apprise dans le fichier).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const https = require('https');

const STORE = path.join(__dirname, '..', 'data', 'generic-image-hashes.json');
const MAX_DIST = 6;
const GENERIC_NAME_RE = /(?:^|[\/_.-])(?:editorials?|banners?|bannieres?|default|logos?)(?:[_.-]|\d|$)/i;

function genericFileName(url = '') {
  let p = String(url);
  try { p = new URL(p).pathname; } catch { /* relatif */ }
  return GENERIC_NAME_RE.test(decodeURIComponent(p.split('/').pop() || ''));
}

/** Décodage PNG minimal (8 bits, gris / gris+alpha / RVB / RVBA, non entrelacé). */
function decodePng(buf) {
  if (!buf || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let off = 8; let w = 0; let h = 0; let ct = 0; let depth = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ct = data[9]; if (data[12]) return null; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  if (depth !== 8 || !ch) return null;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch; const out = Buffer.alloc(w * h * ch);
  for (let y = 0; y < h; y += 1) {
    const f = raw[y * (stride + 1)]; const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= ch ? out[y * stride + x - ch] : 0; const b = y ? out[(y - 1) * stride + x] : 0;
      const c = x >= ch && y ? out[(y - 1) * stride + x - ch] : 0; let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  const gray = new Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const p = i * ch; gray[i] = ch >= 3 ? (out[p] * 299 + out[p + 1] * 587 + out[p + 2] * 114) / 1000 : out[p];
  }
  return { w, h, gray };
}

/** dHash 64 bits (hex) depuis une image 9×8 en gris. */
function dhashFromPng(buf) {
  let img = null;
  try { img = decodePng(buf); } catch { img = null; }
  if (!img || img.w < 9 || img.h < 8) return '';
  if (img.w !== 9 || img.h !== 8) {
    const g = new Array(72).fill(0);
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 9; x += 1) {
      const x0 = Math.floor(x * img.w / 9); const x1 = Math.max(x0 + 1, Math.floor((x + 1) * img.w / 9));
      const y0 = Math.floor(y * img.h / 8); const y1 = Math.max(y0 + 1, Math.floor((y + 1) * img.h / 8));
      let sum = 0; let n = 0;
      for (let yy = y0; yy < y1; yy += 1) for (let xx = x0; xx < x1; xx += 1) { sum += img.gray[yy * img.w + xx]; n += 1; }
      g[y * 9 + x] = sum / n;
    }
    img = { w: 9, h: 8, gray: g };
  }
  let bits = '';
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) bits += img.gray[y * 9 + x] > img.gray[y * 9 + x + 1] ? '1' : '0';
  return BigInt('0b' + bits).toString(16).padStart(16, '0');
}

function distance(a = '', b = '') {
  if (!a || !b) return 64;
  let x = BigInt('0x' + a) ^ BigInt('0x' + b); let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

function thumbUrl(url) {
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=9&h=8&fit=fill&filt=greyscale&output=png`;
}

function fetchBuffer(url, timeout = 12000) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'le-radar-bot' }, timeout }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      const parts = []; res.on('data', (d) => parts.push(d)); res.on('end', () => resolve(Buffer.concat(parts)));
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

function loadStore(p = STORE) {
  try { const s = JSON.parse(fs.readFileSync(p, 'utf8')); return { generic: s.generic || [], cache: s.cache || {} }; } catch { return { generic: [], cache: {} }; }
}
function saveStore(store, p = STORE) {
  fs.writeFileSync(p, JSON.stringify({ _note: 'Empreintes dHash de bannières de rubrique / visuels génériques (rubric-banner-lib.js). cache : URL → empreinte.', generic: store.generic, cache: store.cache }, null, 2) + '\n');
}

/**
 * Repère les images génériques parmi items (mutation : aucune). Retourne un Set d'items.
 * fingerprint(url) → Promise<hex> (injectable pour les tests).
 */
async function findRubricBanners(items = [], { store = { generic: [], cache: {} }, fingerprint, concurrency = 12, maxNew = 120 } = {}) {
  const fp = fingerprint || (async (u) => dhashFromPng(await fetchBuffer(thumbUrl(u), 6000)));
  // Même fichier en vignette / pleine résolution (-1024x576, -scaled) : même empreinte.
  const ck = (u) => String(u).replace(/[?#].*$/, '').replace(/-(?:\d+x\d+|scaled)(?=\.\w+$)/i, '');
  for (const [u, h] of Object.entries(store.cache)) if (h && store.cache[ck(u)] === undefined) store.cache[ck(u)] = h;
  for (const it of items) if (it && it.image && store.cache[it.image] === undefined && store.cache[ck(it.image)]) store.cache[it.image] = store.cache[ck(it.image)];
  const hits = new Set(); const hashes = new Map();
  // Empreintes neuves en parallèle, plafonnées par passage (le cache fait le reste).
  const todo = [...new Set(items.filter((it) => it && it.image && !genericFileName(it.image) && store.cache[it.image] === undefined).map((it) => it.image))].slice(0, maxNew);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, async () => {
    while (next < todo.length) { const u = todo[next++]; const h = (await fp(u).catch(() => '')) || ''; if (h) store.cache[u] = h; }
  }));
  for (const it of items) {
    if (!it || !it.image) continue;
    if (genericFileName(it.image)) { hits.add(it); continue; }
    const h = store.cache[it.image];
    if (!h) continue;
    hashes.set(it, h);
    if (store.generic.some((g) => (!g.source || g.source === it.source) && distance(g.hash, h) <= MAX_DIST)) hits.add(it);
  }
  const list = [...hashes];
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
    const [a, ha] = list[i]; const [b, hb] = list[j];
    if (a.source !== b.source || a.image === b.image || distance(ha, hb) > MAX_DIST) continue;
    hits.add(a); hits.add(b);
    if (!store.generic.some((g) => g.source === a.source && distance(g.hash, ha) <= MAX_DIST)) store.generic.push({ source: a.source, hash: ha, example: a.image });
  }
  return hits;
}

module.exports = { genericFileName, decodePng, dhashFromPng, distance, thumbUrl, loadStore, saveStore, findRubricBanners, MAX_DIST };

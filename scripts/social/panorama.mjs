// Découpe panoramique. Drapeau OFF : aucun workflow ne l'importe.
// Instagram : 2 à 4 diapos 1080×1440, une même photo, bords jointifs.
// X : 2 images côte à côte (1:1) ou 4 cases (2×2). Buffer refuse au-delà de 4 images sur X.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const IG_PANEL = { width: 1080, height: 1440 };
export const X_PANEL = { width: 1080, height: 1080 };
export const X_IMAGE_MAX = 4;

function coverCrop(w, h, aspect) {
  if (!(w > 0 && h > 0) || !(aspect > 0)) return null;
  if (w / h > aspect) {
    const ch = h;
    const cw = Math.round(h * aspect);
    if (cw < 2 || cw > w) return null;
    return { w: cw, h: ch, x: Math.round((w - cw) / 2), y: 0 };
  }
  const cw = w;
  const ch = Math.round(w / aspect);
  if (ch < 2 || ch > h) return null;
  return { w: cw, h: ch, x: 0, y: Math.round((h - ch) / 2) };
}

function slicesFrom(crop, n, cols) {
  const colW = Math.round(crop.w / cols);
  const rows = n / cols;
  const rowH = Math.round(crop.h / rows);
  const slices = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = crop.x + col * colW;
    const y = crop.y + row * rowH;
    const w = col === cols - 1 ? crop.x + crop.w - x : colW;
    const h = row === rows - 1 ? crop.y + crop.h - y : rowH;
    slices.push({ i, x, y, w, h });
  }
  for (let i = 1; i < slices.length; i++) {
    const a = slices[i - 1];
    const b = slices[i];
    const sameRow = Math.floor((i - 1) / cols) === Math.floor(i / cols);
    if (sameRow && a.x + a.w !== b.x) return null;
    if (!sameRow && a.y + a.h !== b.y && i % cols === 0) {
      if (slices[i - cols] && slices[i - cols].y + slices[i - cols].h !== b.y) return null;
    }
  }
  return slices;
}

/** Plan ou null si la photo ne remplit pas chaque panneau sans agrandissement. */
export function panoramaPlan(width, height, network) {
  if (network === 'instagram') {
    for (let n = 4; n >= 2; n--) {
      const aspect = (IG_PANEL.width / IG_PANEL.height) * n;
      const crop = coverCrop(width, height, aspect);
      if (!crop || crop.h < IG_PANEL.height || crop.w / n < IG_PANEL.width) continue;
      const slices = slicesFrom(crop, n, n);
      if (!slices) continue;
      return { network, n, cols: n, rows: 1, crop, slices, panel: IG_PANEL };
    }
    return null;
  }
  if (network === 'x') {
    const options = [
      { n: 4, cols: 2, aspect: 1 },
      { n: 2, cols: 2, aspect: 2 },
    ];
    for (const opt of options) {
      const crop = coverCrop(width, height, opt.aspect);
      if (!crop) continue;
      const cellW = crop.w / opt.cols;
      const cellH = crop.h / (opt.n / opt.cols);
      if (cellW < X_PANEL.width || cellH < X_PANEL.height) continue;
      const slices = slicesFrom(crop, opt.n, opt.cols);
      if (!slices) continue;
      return { network, n: opt.n, cols: opt.cols, rows: opt.n / opt.cols, crop, slices, panel: X_PANEL };
    }
    return null;
  }
  return null;
}

export function panoramaAllowed(cfg, network) {
  const p = cfg?.panorama;
  if (!p || p.enabled !== true) return false;
  if (network === 'instagram') return p.instagram === true;
  if (network === 'x') return p.x === true;
  return false;
}

/** null tant que le drapeau est false, même si la photo est assez grande. */
export function selectPanorama(cfg, width, height, network) {
  if (!panoramaAllowed(cfg, network)) return null;
  return panoramaPlan(width, height, network);
}

function jpegSize(file) {
  const b = fs.readFileSync(file);
  let i = 2;
  while (i < b.length - 8) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xc0 || m === 0xc1 || m === 0xc2) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    if (m === 0xd8 || m === 0xd9) { i += 2; continue; }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

/** Écrit les panneaux JPEG. Les bords se touchent dans le recadrage source. */
export function renderPanorama(file, outDir, network) {
  const size = jpegSize(file);
  if (!size) return null;
  const plan = panoramaPlan(size.width, size.height, network);
  if (!plan) return null;
  fs.mkdirSync(outDir, { recursive: true });
  const { crop, panel, n, cols } = plan;
  const stripW = panel.width * cols;
  const stripH = panel.height * (n / cols);
  const strip = path.join(outDir, `${network}-bande.png`);
  execFileSync('convert', [
    file, '-crop', `${crop.w}x${crop.h}+${crop.x}+${crop.y}`, '+repage',
    '-filter', 'Lanczos', '-resize', `${stripW}x${stripH}!`,
    'png:' + strip,
  ], { stdio: 'ignore' });
  const files = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const dest = path.join(outDir, `${network}-${i + 1}.jpg`);
    execFileSync('convert', [
      strip, '-crop', `${panel.width}x${panel.height}+${col * panel.width}+${row * panel.height}`,
      '+repage', '-quality', '90', dest,
    ], { stdio: 'ignore' });
    files.push(dest);
  }
  fs.rmSync(strip, { force: true });
  return { ...plan, files, source: size };
}

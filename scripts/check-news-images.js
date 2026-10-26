#!/usr/bin/env node
/**
 * Balayage des images de toutes les cartes du fil (news.json).
 *
 * Pourquoi : la surveillance existante (source-health) ne voyait que le taux
 * d'échecs du miroir des photos d'articles. Les photos de repli (stockImage :
 * banque campus / Wikimedia, Openverse) n'étaient jamais vérifiées — une
 * vignette Commons refusée laissait un carré vide sans aucune alerte
 * (The McGill Daily, « MUNACA’s Campaign… », oct. 2026).
 *
 * Pour chaque carte : imageLocal (fichier présent), image (origine), stockImage
 * (original + vignette 500 px comme le client) → statut HTTP + type image/*.
 *
 *   node scripts/check-news-images.js            # rapport seulement
 *   node scripts/check-news-images.js --update   # répare news.json
 *   node scripts/check-news-images.js --strict   # code 1 s'il reste des images cassées
 *
 * Réparation (--update) : URL d'origine morte → image vidée (le client passe
 * au miroir / à la photo de repli) ; stockImage morte → retirée (le client
 * choisit une autre photo du campus). Jamais d'image inventée.
 * Rapport : data/image-health.json (lu par source-health).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NEWS_PATH = path.join(ROOT, 'news.json');
const REPORT_PATH = path.join(ROOT, 'data', 'image-health.json');
const UA = 'LE-RADAR-ImageHealth/1.0 (+https://le-radar.ca/; image health check)';
const TIMEOUT_MS = 15_000;
const CONCURRENCY = 4;

const args = new Set(process.argv.slice(2));

function commonsThumb(url, width = 500) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'upload.wikimedia.org') return '';
    const m = u.pathname.match(/^\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+\.(?:jpe?g|png|webp))$/i);
    if (!m) return '';
    return `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${m[3]}/${width}px-${m[3]}`;
  } catch { return ''; }
}

async function probe(url, attempt = 0) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.5', Range: 'bytes=0-2047' }, redirect: 'follow', signal: ctrl.signal });
    const type = (res.headers.get('content-type') || '').toLowerCase();
    try { await res.body?.cancel(); } catch {}
    // 429 / 5xx : passager, on retente avant de déclarer l'image morte.
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      return probe(url, attempt + 1);
    }
    const ok = (res.status === 200 || res.status === 206) && type.startsWith('image/');
    return { ok, status: res.status, type, transient: res.status === 429 || res.status >= 500 };
  } catch (err) {
    if (attempt < 1) return probe(url, attempt + 1);
    return { ok: false, status: 0, type: '', error: String(err?.name || err), transient: true };
  } finally { clearTimeout(t); }
}

async function pool(tasks, n) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); }
  }));
  return out;
}

function loadStockMirror() {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'stock-images-map.js'), 'utf8');
    const m = src.match(/RADAR_STOCK_LOCAL = (\{[\s\S]*\});/);
    return m ? JSON.parse(m[1]) : {};
  } catch { return {}; }
}
function stockKey(url) {
  try { const u = new URL(url); return `${u.origin}${u.pathname}`; } catch { return ''; }
}
const stockMirror = loadStockMirror();

async function main() {
  const news = JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
  const items = news.items || [];
  const cache = new Map();
  const check = (url) => {
    if (!cache.has(url)) cache.set(url, null);
    return url;
  };
  const plan = [];
  for (const item of items) {
    const entry = { item, checks: [] };
    if (item.imageLocal) {
      const ok = fs.existsSync(path.join(ROOT, String(item.imageLocal)));
      entry.checks.push({ field: 'imageLocal', url: item.imageLocal, local: true, ok });
    }
    if (/^https?:\/\//.test(item.image || '')) entry.checks.push({ field: 'image', url: check(item.image) });
    const mirrored = stockMirror[stockKey(item.stockImage)];
    if (mirrored) {
      // Photo Commons servie par le site : vérifier le fichier local, pas
      // Wikimedia (429 en rafale, c'est justement ce qu'on évite).
      const ok = fs.existsSync(path.join(ROOT, mirrored));
      entry.checks.push({ field: 'stockImage', variant: 'mirror', url: mirrored, local: true, ok });
    } else if (/^https?:\/\//.test(item.stockImage || '')) {
      entry.checks.push({ field: 'stockImage', url: check(item.stockImage) });
      const thumb = commonsThumb(item.stockImage);
      if (thumb) entry.checks.push({ field: 'stockImage', variant: 'thumb500', url: check(thumb) });
    }
    plan.push(entry);
  }
  const urls = [...cache.keys()];
  const results = await pool(urls.map((u) => () => probe(u)), CONCURRENCY);
  urls.forEach((u, k) => cache.set(u, results[k]));

  const broken = [];
  let repaired = 0;
  for (const { item, checks } of plan) {
    for (const c of checks) {
      const r = c.local ? { ok: c.ok, status: c.ok ? 200 : 404, type: 'file' } : cache.get(c.url);
      if (r.ok) continue;
      const row = { source: item.source, title: item.title, link: item.link, field: c.field, variant: c.variant || '', url: c.url, status: r.status, type: r.type, transient: !!r.transient };
      broken.push(row);
      if (!args.has('--update') || r.transient) continue;
      // Image locale absente : le client retombe sur l'origine.
      if (c.field === 'imageLocal') { delete item.imageLocal; delete item.imageLocalVia; repaired += 1; }
      // Origine morte sans miroir : vider, le repli normal prend le relais.
      else if (c.field === 'image' && !item.imageLocal) { item.imageDead = item.image; item.image = ''; item.leadImageReady = false; repaired += 1; }
      // Photo de repli morte (original ou vignette) : la retirer.
      else if (c.field === 'stockImage' && c.variant !== 'mirror' && item.stockImage) {
        for (const k of ['stockImage', 'imageTitle', 'imageCredit', 'imageCreator', 'imageLicense', 'imageProvider', 'imageSourceUrl', '_campusBank']) delete item[k];
        repaired += 1;
      }
    }
  }
  const report = { at: new Date().toISOString(), cards: items.length, urls: urls.length, broken: broken.length, repaired, items: broken };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  if (args.has('--update') && repaired) fs.writeFileSync(NEWS_PATH, `${JSON.stringify(news, null, 2)}\n`);
  console.log(`images: ${items.length} cartes, ${urls.length} URL, ${broken.length} cassée(s), ${repaired} réparée(s)`);
  for (const b of broken) console.log(` ✗ [${b.status} ${b.type}] ${b.source} — ${b.field}${b.variant ? `/${b.variant}` : ''} — ${b.url}`);
  const persistent = broken.filter((b) => !b.transient && !(args.has('--update')));
  if (args.has('--strict') && persistent.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });

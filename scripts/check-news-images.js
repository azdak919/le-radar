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
 * Réparation (--update) : URL d'origine morte (404/410, ou réponse qui n'est
 * pas une image) → image vidée (le client passe au miroir / à la photo de
 * repli) ; stockImage morte → retirée (le client choisit une autre photo du
 * campus). Jamais d'image inventée.
 *
 * Exceptions (Karmina, 16 nov. 2026) : un HTTP 415 est un refus de la requête
 * (souvent le Range de la sonde), pas un fichier disparu — on retente sans
 * Range, puis on ne vide pas. Une photo épinglée `keepSourceImage` n'est
 * jamais vidée ici : ce passage tourne après l'épinglage, et la vider laisse
 * le point focal sans URL. imageRemoteOnly / la licence ne sont pas touchés.
 * Rapport : data/image-health.json (lu par source-health).
 */
const fs = require('fs');
const path = require('path');
const { loadPins, normUrl } = require('./lead-image-pins-lib');
const { buildCheckQueue, logQueue } = require('./article-check-queue-lib');
const { BOT_USER_AGENT, IMAGE_ACCEPT } = require('./http-bot-headers');

const ROOT = path.join(__dirname, '..');
const NEWS_PATH = path.join(ROOT, 'news.json');
const REPORT_PATH = path.join(ROOT, 'data', 'image-health.json');
const TIMEOUT_MS = 15_000;
const CONCURRENCY = 4;
// File de vérification : chaque passe sonde les cartes neuves / dont l'image a
// changé, puis l'arriéré le plus anciennement sondé, au plus N cartes. Les
// fichiers locaux (miroirs) restent vérifiés sur toutes les cartes (disque).
const IMAGE_QUEUE_SIZE = Math.max(1, Number(process.env.LE_RADAR_IMAGE_QUEUE_SIZE) || 150);
const IMAGE_RECHECK_MS = 24 * 3600 * 1000;

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

async function probe(url, attempt = 0, { range = true } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const headers = { 'User-Agent': BOT_USER_AGENT, Accept: IMAGE_ACCEPT };
    if (range) headers.Range = 'bytes=0-2047';
    const res = await fetch(url, { headers, redirect: 'follow', signal: ctrl.signal });
    const type = (res.headers.get('content-type') || '').toLowerCase();
    try { await res.body?.cancel(); } catch {}
    // 415 + Range : le serveur refuse la requête (LiteSpeed / WordPress), pas
    // le fichier. Sans nouvel essai, la sonde déclarait l'image morte.
    if (res.status === 415 && range) return probe(url, attempt, { range: false });
    // 429 / 5xx : passager, on retente avant de déclarer l'image morte.
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      return probe(url, attempt + 1, { range });
    }
    const ok = (res.status === 200 || res.status === 206) && type.startsWith('image/');
    // 415 persistant : refus de sonde, pas une disparition (404/410).
    const transient = res.status === 429 || res.status >= 500 || res.status === 415;
    return { ok, status: res.status, type, transient };
  } catch (err) {
    if (attempt < 1) return probe(url, attempt + 1, { range });
    return { ok: false, status: 0, type: '', error: String(err?.name || err), transient: true };
  } finally { clearTimeout(t); }
}

/** Photo imposée par le registre (keepSourceImage), URL courante = URL du pin. */
function isKeptSourcePin(item = {}, pins = loadPins()) {
  if (!item.image || !item.link) return false;
  const pin = pins.pins.get(normUrl(item.link));
  return !!(pin && pin.keepSourceImage && pin.image && normUrl(pin.image) === normUrl(item.image));
}

/**
 * Faut-il vider `item.image` après une sonde ratée ?
 * Non si un miroir local existe, si la sonde est passagère, si le statut est
 * 415, ou si l'URL est celle d'un pin keepSourceImage.
 */
function shouldClearOriginImage(item = {}, probeResult = {}, pins = loadPins()) {
  if (!item.image || item.imageLocal) return false;
  if (!probeResult || probeResult.ok || probeResult.transient) return false;
  if (Number(probeResult.status) === 415) return false;
  if (isKeptSourcePin(item, pins)) return false;
  return true;
}

/** Applique la décision ; ne touche pas au point focal ni à imageRemoteOnly. */
function clearOriginImageIfNeeded(item, probeResult, pins = loadPins()) {
  if (!shouldClearOriginImage(item, probeResult, pins)) return false;
  item.imageDead = item.image;
  item.image = '';
  item.leadImageReady = false;
  return true;
}

/** Signature des URL distantes sondées : la changer remet la carte en tête de file. */
function imageHealthSig(item = {}) {
  return [item.image || '', item.stockImage || ''].join('|');
}

/** File de sonde réseau des cartes (voir article-check-queue-lib). */
function buildImageQueue(items = [], { now = Date.now(), size = IMAGE_QUEUE_SIZE } = {}) {
  const remote = items.filter((it) => /^https?:\/\//.test(it.image || '') || /^https?:\/\//.test(it.stockImage || ''));
  return buildCheckQueue({
    items: remote,
    isNew: (it) => it.imageHealthKey !== imageHealthSig(it),
    isDue: (it) => now - (Date.parse(it.imageHealthAt || '') || 0) >= IMAGE_RECHECK_MS,
    checkedAt: (it) => it.imageHealthAt || '',
    size,
  });
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
  const pins = loadPins();
  const cache = new Map();
  const check = (url) => {
    if (!cache.has(url)) cache.set(url, null);
    return url;
  };
  const plan = [];
  const queue = buildImageQueue(items);
  logQueue('sonde des vignettes', queue);
  const probeNow = new Set(queue.batch);
  for (const item of items) {
    const entry = { item, checks: [], probed: probeNow.has(item) };
    if (item.imageLocal) {
      const ok = fs.existsSync(path.join(ROOT, String(item.imageLocal)));
      entry.checks.push({ field: 'imageLocal', url: item.imageLocal, local: true, ok });
    }
    const mirrored = stockMirror[stockKey(item.stockImage)];
    if (!entry.probed) {
      // Hors lot : seulement le disque ; la sonde réseau attend son tour.
      if (mirrored) entry.checks.push({ field: 'stockImage', variant: 'mirror', url: mirrored, local: true, ok: fs.existsSync(path.join(ROOT, mirrored)) });
      plan.push(entry);
      continue;
    }
    if (/^https?:\/\//.test(item.image || '')) entry.checks.push({ field: 'image', url: check(item.image) });
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
  const deadUrls = [];
  let repaired = 0;
  let stampedHealth = 0;
  const stampAt = new Date().toISOString();
  for (const { item, checks, probed } of plan) {
    // Sonde complète sans échec passager : la carte quitte la tête de file.
    const transientHit = checks.some((c) => !c.local && cache.get(c.url)?.transient);
    for (const c of checks) {
      const r = c.local ? { ok: c.ok, status: c.ok ? 200 : 404, type: 'file' } : cache.get(c.url);
      if (r.ok) continue;
      const row = { source: item.source, title: item.title, link: item.link, field: c.field, variant: c.variant || '', url: c.url, status: r.status, type: r.type, transient: !!r.transient };
      broken.push(row);
      if (!args.has('--update') || r.transient) continue;
      // Photo épinglée ou 415 : on signale, on ne vide pas, on ne marque pas
      // « réparé » (un 404 réel sur un pin reste visible dans l'issue santé).
      if (c.field === 'image' && !item.imageLocal && !shouldClearOriginImage(item, r, pins)) continue;
      if (/^(404|410)$/.test(String(r.status)) && /^(stockImage|image)$/.test(c.field)) deadUrls.push(c.url);
      row.repaired = true;
      // Image locale absente : le client retombe sur l'origine.
      if (c.field === 'imageLocal') { delete item.imageLocal; delete item.imageLocalVia; repaired += 1; }
      // Origine morte sans miroir : vider, le repli normal prend le relais.
      else if (c.field === 'image' && clearOriginImageIfNeeded(item, r, pins)) repaired += 1;
      // Photo de repli morte (original ou vignette) : la retirer.
      else if (c.field === 'stockImage' && c.variant !== 'mirror' && item.stockImage) {
        for (const k of ['stockImage', 'imageTitle', 'imageCredit', 'imageCreator', 'imageLicense', 'imageProvider', 'imageSourceUrl', '_campusBank']) delete item[k];
        repaired += 1;
      }
    }
    if (probed && !transientHit && args.has('--update')) {
      item.imageHealthKey = imageHealthSig(item);
      item.imageHealthAt = stampAt;
      stampedHealth += 1;
    }
  }
  if (deadUrls.length) require('./dead-images-lib').remember(deadUrls);
  const report = { at: new Date().toISOString(), cards: items.length, probedCards: queue.batch.length, queueDeferred: queue.deferred, urls: urls.length, broken: broken.length, repaired, items: broken };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  if (args.has('--update') && (repaired || stampedHealth)) fs.writeFileSync(NEWS_PATH, `${JSON.stringify(news, null, 2)}\n`);
  console.log(`images: ${items.length} cartes, ${urls.length} URL, ${broken.length} cassée(s), ${repaired} réparée(s)`);
  for (const b of broken) console.log(` ✗ [${b.status} ${b.type}] ${b.source} — ${b.field}${b.variant ? `/${b.variant}` : ''} — ${b.url}`);
  const persistent = broken.filter((b) => !b.transient && !(args.has('--update')));
  if (args.has('--strict') && persistent.length) process.exit(1);
}

module.exports = {
  probe,
  imageHealthSig,
  buildImageQueue,
  isKeptSourcePin,
  shouldClearOriginImage,
  clearOriginImageIfNeeded,
};

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

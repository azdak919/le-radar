#!/usr/bin/env node
/**
 * Miroir local des photos source du fil (résilience multi-sources).
 *
 * Problème : les journaux étudiants hébergent les images sur leur propre
 * WordPress — quand le site tombe (ex. L’Exemplaire / ULaval), le fil
 * LE-RADAR affiche des cartes sans photo même si l’article est encore
 * dans news.json.
 *
 * Solution en couches (affichage client, app.js) :
 *   1. imageLocal  → assets/news-images/<hash>.ext  (ce script, GitHub Pages)
 *   2. image       → URL d’origine (Photon / Wayback seulement si l’origine échoue)
 *   3. stockImage  → Openverse / campus-bank (ensure-lead-images)
 *   4. fallback    → SVG généré côté client
 *
 * Usage :
 *   node scripts/mirror-news-images.js
 *   node scripts/mirror-news-images.js --update
 *   node scripts/mirror-news-images.js --update --force   # re-télécharge tout
 *
 * Env :
 *   CI=true           → moins de logs verbeux
 *   MIRROR_MAX_BYTES  → plafond par fichier (défaut 750000)
 *   MIRROR_CONCURRENCY → téléchargements parallèles (défaut 4)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { imageUrlKey } = require('./article-photo-credit-lib');

const ROOT = path.join(__dirname, '..');
const NEWS_PATH = path.join(ROOT, 'news.json');
const CACHE_DIR = path.join(ROOT, 'assets', 'news-images');
const MANIFEST_PATH = path.join(CACHE_DIR, 'manifest.json');

const doUpdate = process.argv.includes('--update');
const forceAll = process.argv.includes('--force');
/* 1,2 Mo : une illustration PNG 16:9 (~760 ko, ex. Sans fin(s) / L’Exemplaire)
 * passait juste au-dessus de 750 ko et n’était jamais mirroirée. */
const MAX_BYTES = Number(process.env.MIRROR_MAX_BYTES) || 1_200_000;
const MIN_BYTES = 1_200;
const CONCURRENCY = Math.max(1, Number(process.env.MIRROR_CONCURRENCY) || 4);
const TIMEOUT_MS = 18_000;
const UA = 'LE-RADAR-ImageMirror/1.0 (+https://le-radar.ca/; news image resilience cache)';

/**
 * Hôtes prioritaires : toujours tenter un miroir (et Wayback si l’origine échoue).
 * Les autres sources sont mirroirées en best-effort si le téléchargement réussit.
 */
const FRAGILE_HOSTS = new Set([
  'exemplaire.com.ulaval.ca',
  'www.exemplaire.com.ulaval.ca',
]);

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function hostOf(url = '') {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isHttpUrl(url = '') {
  return /^https?:\/\//i.test(String(url || '').trim());
}

/** Clé stable fichier = sha1(URL canonique sans query volatile). */
function mirrorKey(url = '') {
  try {
    const u = new URL(url);
    u.hash = '';
    // Garder le path complet (pas seulement le basename) pour éviter collisions.
    const canon = `${u.hostname.toLowerCase()}${u.pathname}`;
    return crypto.createHash('sha1').update(canon).digest('hex').slice(0, 16);
  } catch {
    return crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 16);
  }
}

function extFrom(contentType = '', url = '') {
  const ct = String(contentType).toLowerCase();
  if (ct.includes('png')) return '.png';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('gif')) return '.gif';
  if (ct.includes('jpeg') || ct.includes('jpg')) return '.jpg';
  const m = String(url).match(/\.(jpe?g|png|webp|gif)(?:$|[?#])/i);
  if (m) return `.${m[1].toLowerCase().replace('jpeg', 'jpg')}`;
  return '.jpg';
}

function archiveUrl(url = '') {
  return `https://web.archive.org/web/2id_/${url}`;
}

function photonUrl(url = '') {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === 'i0.wp.com' || host.endsWith('.wp.com')) return url;
    if (!/\/wp-content\/uploads\//i.test(u.pathname)) return '';
    return `https://i0.wp.com/${host}${u.pathname}?ssl=1`;
  } catch {
    return '';
  }
}

function isFragile(url = '') {
  return FRAGILE_HOSTS.has(hostOf(url));
}

async function fetchBuffer(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': UA,
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < MIN_BYTES) throw new Error(`too small (${buf.length} B)`);
  if (buf.length > MAX_BYTES) throw new Error(`too large (${buf.length} B > ${MAX_BYTES})`);
  // Magic bytes basiques
  const isImg = buf[0] === 0xff && buf[1] === 0xd8
    || (buf[0] === 0x89 && buf[1] === 0x50)
    || (buf[0] === 0x47 && buf[1] === 0x49)
    || (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP');
  if (!isImg && !/^image\//i.test(ct)) throw new Error(`not an image (${ct || 'no type'})`);
  return { buf, contentType: ct, finalUrl: res.url || url };
}

async function downloadWithFallback(url) {
  try {
    return { ...(await fetchBuffer(url)), via: 'origin' };
  } catch (err) {
    if (!isFragile(url)) throw err;
    const photon = photonUrl(url);
    if (photon && photon !== url) {
      try {
        return { ...(await fetchBuffer(photon)), via: 'photon', sourceUrl: url };
      } catch {
        /* Wayback ensuite */
      }
    }
    const archived = archiveUrl(url);
    const out = await fetchBuffer(archived);
    return { ...out, via: 'wayback', sourceUrl: url };
  }
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

function localPathFor(key, ext) {
  return path.posix.join('assets/news-images', `${key}${ext}`);
}

function fileExists(abs) {
  try {
    return fs.statSync(abs).size >= MIN_BYTES;
  } catch {
    return false;
  }
}

async function main() {
  const news = readJson(NEWS_PATH, null);
  if (!news || !Array.isArray(news.items)) {
    console.error('news.json invalide ou absent');
    process.exit(1);
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const manifest = readJson(MANIFEST_PATH, { version: 1, files: {} });
  if (!manifest.files || typeof manifest.files !== 'object') manifest.files = {};

  const targets = news.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isHttpUrl(item.image));

  console.log(`Miroir images : ${targets.length} URLs source (${news.items.length} articles)`);

  let downloaded = 0;
  let reused = 0;
  let failed = 0;
  let fragileOk = 0;
  const keepKeys = new Set();

  await mapPool(targets, CONCURRENCY, async ({ item }) => {
    const remote = String(item.image).trim();
    const key = mirrorKey(remote);
    keepKeys.add(key);

    const prior = manifest.files[key];
    const priorPath = prior?.local ? path.join(ROOT, prior.local) : null;
    if (!forceAll && priorPath && fileExists(priorPath) && prior.local) {
      item.imageLocal = prior.local;
      item.imageLocalKey = key;
      if (prior.via) item.imageLocalVia = prior.via;
      reused += 1;
      return;
    }
    // Fichier déjà sur disque sans entrée manifeste (reprise).
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.gif']) {
      const guess = path.join(CACHE_DIR, `${key}${ext}`);
      if (!forceAll && fileExists(guess)) {
        const rel = localPathFor(key, ext === '.jpeg' ? '.jpg' : ext);
        item.imageLocal = rel;
        item.imageLocalKey = key;
        manifest.files[key] = {
          local: rel,
          remote,
          host: hostOf(remote),
          bytes: fs.statSync(guess).size,
          updatedAt: new Date().toISOString(),
          via: prior?.via || 'disk',
          nameKey: imageUrlKey(remote) || undefined,
        };
        reused += 1;
        return;
      }
    }

    try {
      const { buf, contentType, via } = await downloadWithFallback(remote);
      const ext = extFrom(contentType, remote);
      const rel = localPathFor(key, ext);
      const abs = path.join(ROOT, rel);
      fs.writeFileSync(abs, buf);
      item.imageLocal = rel;
      item.imageLocalKey = key;
      if (via && via !== 'origin') item.imageLocalVia = via;
      else delete item.imageLocalVia;
      manifest.files[key] = {
        local: rel,
        remote,
        host: hostOf(remote),
        bytes: buf.length,
        contentType: contentType || undefined,
        updatedAt: new Date().toISOString(),
        via: via || 'origin',
        nameKey: imageUrlKey(remote) || undefined,
      };
      downloaded += 1;
      if (isFragile(remote)) fragileOk += 1;
      if (!process.env.CI) {
        console.log(`  ✓ ${via || 'origin'} ${rel} (${buf.length} B) ← ${hostOf(remote)}`);
      }
    } catch (err) {
      failed += 1;
      // Conserver un ancien miroir si présent.
      if (prior?.local && fileExists(path.join(ROOT, prior.local))) {
        item.imageLocal = prior.local;
        item.imageLocalKey = key;
        reused += 1;
        if (!process.env.CI) console.log(`  ↻ keep stale ${prior.local} (${err.message})`);
      } else {
        delete item.imageLocal;
        delete item.imageLocalKey;
        delete item.imageLocalVia;
        if (isFragile(remote) || !process.env.CI) {
          console.log(`  ✗ ${hostOf(remote)} ${err.message}`);
        }
      }
    }
  });

  // Retirer imageLocal des articles sans image distante.
  for (const item of news.items) {
    if (!isHttpUrl(item.image)) {
      delete item.imageLocal;
      delete item.imageLocalKey;
      delete item.imageLocalVia;
    }
  }

  // Purge des fichiers orphelins (plus référencés par le fil courant).
  let pruned = 0;
  for (const [key, entry] of Object.entries(manifest.files)) {
    if (keepKeys.has(key)) continue;
    if (entry?.local) {
      const abs = path.join(ROOT, entry.local);
      try {
        fs.unlinkSync(abs);
        pruned += 1;
      } catch { /* already gone */ }
    }
    delete manifest.files[key];
  }
  // Orphelins disque hors manifeste
  for (const name of fs.readdirSync(CACHE_DIR)) {
    if (name === 'manifest.json' || name.startsWith('.')) continue;
    const key = name.replace(/\.[^.]+$/, '');
    if (!keepKeys.has(key)) {
      try {
        fs.unlinkSync(path.join(CACHE_DIR, name));
        pruned += 1;
      } catch { /* ignore */ }
    }
  }

  manifest.version = 1;
  manifest.updatedAt = new Date().toISOString();
  manifest.count = Object.keys(manifest.files).length;
  manifest.fragileHosts = [...FRAGILE_HOSTS];

  console.log(
    `Résultat : +${downloaded} téléchargés, ${reused} réutilisés, ${failed} échecs,`
    + ` ${pruned} purgés, fragile OK ${fragileOk}, total miroir ${manifest.count}`,
  );

  if (!doUpdate) {
    console.log('(dry-run — passer --update pour écrire news.json + assets)');
    return;
  }

  writeJson(MANIFEST_PATH, manifest);
  news.updated = news.updated || new Date().toISOString();
  writeJson(NEWS_PATH, news);
  console.log(`Écrit ${path.relative(ROOT, CACHE_DIR)}/ et news.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

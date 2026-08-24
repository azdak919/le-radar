/**
 * LE RADAR — librairie du labo photo local (mât / pomo / solitaire)
 *
 * Mutations JSON + sidecar de rejet. Le serveur HTTP est un mince wrapping.
 * Bind 127.0.0.1 seulement — jamais en prod.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { BANKS, syncBanks } = require('./sync-quebec-backgrounds');
const { sanitizeCommonsCredit, placeFromPhotoMeta } = require('./commons-credit-lib');
const { matchHardBanned } = require('./quebec-backgrounds-blacklist');
const photosLib = require('./photo-bank-lib');

const DEFAULT_ROOT = path.join(__dirname, '..');
const SEASON4 = ['printemps', 'ete', 'automne', 'hiver'];
const SEASON6 = ['ukiuq', 'upingaksaaq', 'upingaaq', 'aujaq', 'ukiaqsaaq', 'ukiaq'];

const DESKTOP_MAST = { w: 1280, h: 170, label: 'bureau' };
const MOBILE_MAST = { w: 390, h: 175, label: 'mobile' };
const FULLSCREEN_PHONE = { w: 390, h: 844, label: 'pomo/solitaire téléphone' };
const FULLSCREEN_DESKTOP = { w: 1280, h: 800, label: 'pomo/solitaire bureau' };

const STOCK = [
  {
    id: 'pomo-stock',
    label: 'stock pomo',
    rel: 'pomo/js/backgrounds-data.js',
    surfaces: ['pomo'],
  },
  {
    id: 'solitaire-stock',
    label: 'stock solitaire',
    rel: 'solitaire/js/backgrounds-data.js',
    surfaces: ['solitaire'],
  },
];

function photoIdFromUrl(url = '') {
  return crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 12);
}

function photoKey(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.hostname.includes('unsplash.com')) {
      const m = u.pathname.match(/photo-([a-zA-Z0-9_-]+)/);
      return m ? `unsplash:${m[1]}` : u.pathname;
    }
    if (u.hostname.includes('pexels.com')) {
      const m = u.pathname.match(/\/photos\/(\d+)/);
      return m ? `pexels:${m[1]}` : u.pathname;
    }
    if (u.hostname.includes('wikimedia.org')) {
      return `wiki:${u.pathname.replace(/\/\d+px-/, '/')}`;
    }
    return u.origin + u.pathname;
  } catch {
    return String(url);
  }
}

function commonsFileFragment(url, link) {
  const fromLink = String(link || '').match(/File:([^#?]+)/i);
  if (fromLink) {
    try {
      return decodeURIComponent(fromLink[1]).replace(/ /g, '_');
    } catch {
      return fromLink[1];
    }
  }
  const fromUrl = String(url || '').match(/\/([^/?#]+\.(jpe?g|png|webp|gif|JPG|JPEG|PNG))/);
  return fromUrl ? fromUrl[1] : null;
}

function thumbUrl(url, width = 640) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname.includes('images.unsplash.com')) {
      u.searchParams.set('w', String(width));
      u.searchParams.set('q', '80');
      u.searchParams.set('auto', 'format');
      u.searchParams.set('fit', 'max');
      return u.href;
    }
    if (u.hostname.includes('images.pexels.com')) {
      u.searchParams.set('w', String(width));
      u.searchParams.set('auto', 'compress');
      return u.href;
    }
    if (u.hostname.includes('upload.wikimedia.org')) {
      const pathname = u.pathname;
      if (pathname.includes('/thumb/')) {
        return url.replace(/\/\d+px-/, `/${width}px-`);
      }
      const parts = pathname.split('/').filter(Boolean);
      const file = parts[parts.length - 1];
      if (!file) return url;
      const a = parts[parts.length - 2];
      const b = parts[parts.length - 3];
      const bucket = parts.includes('commons') ? 'commons' : parts[1] || 'commons';
      return `https://upload.wikimedia.org/wikipedia/${bucket}/thumb/${b}/${a}/${file}/${width}px-${file}`;
    }
  } catch {
    /* keep original */
  }
  return url;
}

/**
 * Fenêtre source visible après background-size:cover.
 * focalY 0 = haut, 1 = bas (même formule que quebec-backgrounds.js).
 */
function coverWindow(imgW, imgH, frameW, frameH, focalY) {
  const w = Number(imgW) || 0;
  const h = Number(imgH) || 0;
  const fw = Number(frameW) || 1;
  const fh = Number(frameH) || 1;
  const fyRaw = Number(focalY);
  const fy = Math.min(1, Math.max(0, Number.isFinite(fyRaw) ? fyRaw : 0.5));
  if (w <= 0 || h <= 0) {
    return { x0: 0, y0: 0, visW: 0, visH: 0, visibleFrac: 1, topFrac: 0 };
  }
  const scale = Math.max(fw / w, fh / h);
  const visW = Math.min(w, fw / scale);
  const visH = Math.min(h, fh / scale);
  const x0 = (w - visW) / 2;
  const visibleFrac = visH / h;
  const topFrac = (1 - visibleFrac) * fy;
  const y0 = topFrac * h;
  return { x0, y0, visW, visH, visibleFrac, topFrac };
}

function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function loadJsBackgrounds(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const src = fs.readFileSync(filePath, 'utf8');
  const ctx = {};
  vm.runInNewContext(`${src}\nthis.BACKGROUNDS = BACKGROUNDS;`, ctx);
  return Array.isArray(ctx.BACKGROUNDS) ? ctx.BACKGROUNDS : [];
}

function writeJsBackgrounds(filePath, photos, header) {
  const esc = (s) => JSON.stringify(s == null ? '' : s);
  const body = photos
    .map((p) => {
      const lines = [`    url: ${esc(p.url)}`];
      if (p.credit) lines.push(`    credit: ${esc(p.credit)}`);
      if (p.link) lines.push(`    link: ${esc(p.link)}`);
      if (p.source) lines.push(`    source: ${esc(p.source)}`);
      if (p.title) lines.push(`    title: ${esc(p.title)}`);
      if (p.culture) lines.push(`    culture: ${esc(p.culture)}`);
      if (typeof p.focalY === 'number' && !Number.isNaN(p.focalY)) {
        lines.push(`    focalY: ${p.focalY}`);
      }
      if (typeof p.position === 'string' && p.position.trim()) {
        lines.push(`    position: ${esc(p.position.trim())}`);
      }
      if (Array.isArray(p.surfaces)) {
        lines.push(
          `    surfaces: [${p.surfaces.map((s) => JSON.stringify(s)).join(', ')}]`
        );
      }
      return `  {\n${lines.join(',\n')},\n  }`;
    })
    .join(',\n');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${header}const BACKGROUNDS = [\n${body}\n];\n`, 'utf8');
}

function stockHeader(id) {
  if (id === 'pomo-stock') {
    return `/* Ataraxia — background image pool (data only)
 * Exports: BACKGROUNDS (global array)
 * Régénéré par le labo photo local (scripts/photo-lab-lib.js).
 */
`;
  }
  return `/* LE RADAR — fonds solitaire (stock plein écran)
 * Consommateur : /solitaire/ uniquement.
 * Régénéré par le labo photo local (scripts/photo-lab-lib.js).
 */
`;
}

function derivedSurfaces(bankId, photo) {
  if (bankId === 'masthead' || bankId === 'universities') return ['masthead'];
  if (bankId === 'pomo' || bankId === 'pomo-stock') return ['pomo'];
  if (bankId === 'solitaire-stock') return ['solitaire'];
  if (bankId === 'nations') return ['masthead', 'pomo'];
  if (bankId === 'favorites') {
    const s = Array.isArray(photo.surfaces) ? photo.surfaces.slice() : ['masthead', 'pomo'];
    return s;
  }
  return [];
}

function urlsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return photoKey(a) === photoKey(b);
}

function preferUrl(a, b) {
  const au = String(a || '');
  const bu = String(b || '');
  const aq = au.includes('?');
  const bq = bu.includes('?');
  if (aq && !bq) return bu;
  if (!aq && bq) return au;
  return au.length <= bu.length ? au : bu;
}

function mergePhotoRecord(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) {
    if (v == null || v === '') continue;
    if (k === 'surfaces' && Array.isArray(v)) {
      out.surfaces = [...new Set([...(out.surfaces || []), ...v])];
      continue;
    }
    if (out[k] == null || out[k] === '') out[k] = v;
  }
  if (a && b && a.url && b.url) out.url = preferUrl(a.url, b.url);
  return out;
}

function dedupePhotoList(photos) {
  const map = new Map();
  const order = [];
  for (const p of photos || []) {
    if (!p || !p.url) continue;
    const k = photoKey(p.url);
    if (!map.has(k)) {
      map.set(k, { ...p });
      order.push(k);
    } else {
      map.set(k, mergePhotoRecord(map.get(k), p));
    }
  }
  return order.map((k) => map.get(k));
}

function createPhotoLab(opts = {}) {
  const root = opts.root || DEFAULT_ROOT;
  const rejectedPath =
    opts.rejectedPath || path.join(root, 'data', 'quebec-backgrounds-rejected.json');
  const doSync = opts.sync !== false;
  const undoStack = [];

  function qcPath(rel) {
    return path.join(root, rel);
  }

  function snapshotFiles(paths) {
    const snap = {};
    for (const p of paths) {
      if (fs.existsSync(p)) snap[p] = fs.readFileSync(p, 'utf8');
      else snap[p] = null;
    }
    undoStack.push(snap);
    if (undoStack.length > 40) undoStack.shift();
  }

  function restoreSnap(snap) {
    for (const [p, content] of Object.entries(snap)) {
      if (content == null) {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } else {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, content, 'utf8');
      }
    }
  }

  function qcFiles() {
    return BANKS.map((b) => qcPath(b.jsonRel)).concat(BANKS.map((b) => qcPath(b.jsRel)));
  }

  function stockFiles() {
    return STOCK.map((s) => qcPath(s.rel));
  }

  function photosFile() {
    return qcPath(photosLib.PHOTOS_REL);
  }

  function allMutableFiles() {
    return qcFiles()
      .concat(stockFiles())
      .concat([rejectedPath, photosFile(), qcPath(photosLib.PHOTOS_JS_REL)]);
  }

  function ensureUnified() {
    if (!fs.existsSync(photosFile())) {
      photosLib.mergeLegacyIntoUnified(root);
    }
  }

  function patchUnified(url, mutator) {
    ensureUnified();
    const data = photosLib.loadPhotos(root);
    let n = 0;
    for (const p of data.photos || []) {
      if (!p || !urlsMatch(p.url, url)) continue;
      mutator(p);
      n += 1;
    }
    if (n) photosLib.savePhotos(data, root);
    return n;
  }

  function runSync() {
    if (fs.existsSync(photosFile())) {
      photosLib.materializeLegacySlices(root);
    }
    if (!doSync) return { skipped: true };
    return syncBanks({
      root,
      quiet: true,
      returnResult: true,
      checkOnly: false,
      skipScrub: true,
    });
  }

  function loadRejected() {
    const data = loadJson(rejectedPath, { version: 1, entries: [] });
    if (!Array.isArray(data.entries)) data.entries = [];
    return data;
  }

  function loadQcBank(bank) {
    const data = loadJson(qcPath(bank.jsonRel), { photos: [] });
    return data;
  }

  function eachQcPhoto(fn) {
    for (const bank of BANKS) {
      const data = loadQcBank(bank);
      const photos = data.photos || [];
      for (let i = 0; i < photos.length; i += 1) {
        fn(bank, data, photos, i, photos[i]);
      }
    }
  }

  function listPhotosFromUnified() {
    ensureUnified();
    const data = photosLib.loadPhotos(root);
    return (data.photos || [])
      .filter((p) => p && p.url)
      .map((p) => {
        const tags = Array.isArray(p.tags) ? p.tags.slice() : [];
        const surfaces = photosLib.surfacesFromTags(tags);
        return {
          key: photosLib.photoKey(p.url),
          url: p.url,
          id: p.id || photoIdFromUrl(p.url),
          thumb: thumbUrl(p.url, 640),
          title: p.title || '',
          credit: sanitizeCommonsCredit(p.credit || '') || p.credit || '',
          place: p.place || placeFromPhotoMeta(p.title || '', p.description || ''),
          license: p.license || '',
          link: p.link || '',
          season: p.season || null,
          season6: p.season6 || null,
          seasonSource: p.seasonSource || null,
          focalY: typeof p.focalY === 'number' ? p.focalY : null,
          position: p.position || '',
          permanent: p.permanent === true || photosLib.hasTag(p, 'favori'),
          width: p.width,
          height: p.height,
          faces: p.faces,
          nation: p.nation,
          nationId: p.nationId,
          banks: tags.slice(),
          surfaces,
          tags,
          stock: false,
        };
      })
      .sort((a, b) =>
        `${a.place || ''} ${a.title || ''}`.localeCompare(`${b.place || ''} ${b.title || ''}`, 'fr')
      );
  }

  function listPhotos() {
    if (fs.existsSync(photosFile()) || fs.existsSync(qcPath('data/quebec-backgrounds.json'))) {
      try {
        const unified = listPhotosFromUnified();
        if (unified.length) return unified;
      } catch {
        /* fallback héritage */
      }
    }
    const groups = new Map();

    function touch(url, partial) {
      if (!url) return;
      const key = photoKey(url);
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          url,
          id: photoIdFromUrl(url),
          thumb: thumbUrl(url, 640),
          title: '',
          credit: '',
          place: '',
          license: '',
          link: '',
          season: null,
          season6: null,
          seasonSource: null,
          focalY: null,
          position: '',
          permanent: false,
          width: null,
          height: null,
          faces: null,
          nation: '',
          nationId: '',
          banks: [],
          surfaces: [],
          stock: false,
        };
        groups.set(key, g);
      }
      for (const [k, v] of Object.entries(partial)) {
        if (k === 'banks' || k === 'surfaces') continue;
        if (v == null || v === '') continue;
        if (g[k] == null || g[k] === '') g[k] = v;
      }
      for (const b of partial.banks || []) {
        if (!g.banks.includes(b)) g.banks.push(b);
      }
      if (partial.lockSurfaces) {
        g.surfaces = (partial.surfaces || []).slice();
        g.lockSurfaces = true;
      } else if (!g.lockSurfaces) {
        for (const s of partial.surfaces || []) {
          if (!g.surfaces.includes(s)) g.surfaces.push(s);
        }
      }
      if (partial.stock) g.stock = true;
    }

    for (const bank of BANKS) {
      const data = loadQcBank(bank);
      for (const p of data.photos || []) {
        if (!p || !p.url) continue;
        touch(p.url, {
          url: p.url,
          title: p.title,
          credit: sanitizeCommonsCredit(p.credit || '') || p.credit,
          place: p.place || placeFromPhotoMeta(p.title || '', p.description || ''),
          license: p.license,
          link: p.link,
          season: p.season || null,
          season6: p.season6 || null,
          seasonSource: p.seasonSource || null,
          focalY: typeof p.focalY === 'number' ? p.focalY : null,
          position: p.position || '',
          permanent: p.permanent === true || bank.id === 'favorites',
          width: p.width,
          height: p.height,
          faces: p.faces,
          nation: p.nation,
          nationId: p.nationId,
          banks: [bank.id],
          surfaces: Array.isArray(p.surfaces)
            ? p.surfaces.slice()
            : derivedSurfaces(bank.id, p),
          lockSurfaces: Array.isArray(p.surfaces),
        });
      }
    }

    for (const stock of STOCK) {
      const photos = loadJsBackgrounds(qcPath(stock.rel));
      for (const p of photos) {
        if (!p || !p.url) continue;
        touch(p.url, {
          url: p.url,
          title: p.title,
          credit: p.credit,
          link: p.link,
          license: p.source,
          focalY: typeof p.focalY === 'number' ? p.focalY : null,
          position: p.position || '',
          banks: [stock.id],
          surfaces: Array.isArray(p.surfaces)
            ? p.surfaces.slice()
            : stock.surfaces.slice(),
          lockSurfaces: Array.isArray(p.surfaces),
          stock: true,
        });
      }
    }

    const list = [...groups.values()];
    list.sort((a, b) => {
      const ta = `${a.place || ''} ${a.title || ''}`.toLowerCase();
      const tb = `${b.place || ''} ${b.title || ''}`.toLowerCase();
      return ta.localeCompare(tb, 'fr');
    });
    return list;
  }

  function findByUrl(url) {
    return listPhotos().find((p) => urlsMatch(p.url, url) || p.key === url);
  }

  function patchQcByUrl(url, mutator) {
    let n = 0;
    for (const bank of BANKS) {
      const file = qcPath(bank.jsonRel);
      const data = loadQcBank(bank);
      const photos = data.photos || [];
      let changed = false;
      for (const p of photos) {
        if (!p || !urlsMatch(p.url, url)) continue;
        mutator(p, bank);
        changed = true;
        n += 1;
      }
      if (changed) {
        data.photos = photos;
        data.updated = new Date().toISOString();
        writeJson(file, data);
      }
    }
    return n;
  }

  function patchStockByUrl(url, mutator) {
    let n = 0;
    for (const stock of STOCK) {
      const file = qcPath(stock.rel);
      const photos = loadJsBackgrounds(file);
      let changed = false;
      for (const p of photos) {
        if (!p || !urlsMatch(p.url, url)) continue;
        mutator(p, stock);
        changed = true;
        n += 1;
      }
      if (changed) writeJsBackgrounds(file, photos, stockHeader(stock.id));
    }
    return n;
  }

  function removeFromQc(url) {
    let n = 0;
    for (const bank of BANKS) {
      const file = qcPath(bank.jsonRel);
      const data = loadQcBank(bank);
      const before = (data.photos || []).length;
      data.photos = (data.photos || []).filter((p) => p && !urlsMatch(p.url, url));
      n += before - data.photos.length;
      if (before !== data.photos.length) {
        data.updated = new Date().toISOString();
        writeJson(file, data);
      }
    }
    return n;
  }

  function removeFromStock(url) {
    let n = 0;
    for (const stock of STOCK) {
      const file = qcPath(stock.rel);
      const photos = loadJsBackgrounds(file);
      const next = photos.filter((p) => p && !urlsMatch(p.url, url));
      n += photos.length - next.length;
      if (next.length !== photos.length) {
        writeJsBackgrounds(file, next, stockHeader(stock.id));
      }
    }
    return n;
  }

  function rejectPhoto(url, note) {
    const photo = findByUrl(url);
    if (!photo) throw new Error(`Photo introuvable: ${url}`);
    snapshotFiles(allMutableFiles());
    patchUnified(photo.url, () => {});
    {
      const uni = photosLib.loadPhotos(root);
      uni.photos = (uni.photos || []).filter((p) => p && !urlsMatch(p.url, photo.url));
      photosLib.savePhotos(uni, root);
    }
    const data = loadRejected();
    const fragments = [];
    const fileFrag = commonsFileFragment(photo.url, photo.link);
    if (fileFrag) fragments.push(fileFrag);
    fragments.push(photoIdFromUrl(photo.url));
    if (photo.key) fragments.push(photo.key);
    const entry = {
      fragments: [...new Set(fragments.filter(Boolean))],
      reason: 'user_curated_photo_rejected',
      note: note || `Labo photo ${new Date().toISOString().slice(0, 10)}`,
      url: photo.url,
      title: photo.title || '',
      rejectedAt: new Date().toISOString(),
    };
    const already = data.entries.some(
      (e) => Array.isArray(e.fragments) && e.fragments.some((f) => entry.fragments.includes(f))
    );
    if (!already) data.entries.push(entry);
    writeJson(rejectedPath, data);
    const qc = removeFromQc(photo.url);
    const st = removeFromStock(photo.url);
    runSync();
    return { ok: true, removed: qc + st, sidecar: true, title: photo.title };
  }

  function setSeason(url, payload) {
    const photo = findByUrl(url);
    if (!photo) throw new Error(`Photo introuvable: ${url}`);
    const season = payload.season ? String(payload.season) : null;
    const season6 = payload.season6 ? String(payload.season6) : null;
    if (season && !SEASON4.includes(season)) {
      throw new Error(`Saison 4 inconnue: ${season}`);
    }
    if (season6 && !SEASON6.includes(season6)) {
      throw new Error(`Saison 6 inconnue: ${season6}`);
    }
    snapshotFiles(allMutableFiles());
    patchUnified(photo.url, (p) => {
      if (season) {
        p.season = season;
        p.seasonSource = 'manual';
        p.seasonConfidence = 1;
        p.seasonDetectedAt = new Date().toISOString();
      }
      if (season6) {
        p.season6 = season6;
        p.seasonSource = 'manual';
        p.seasonConfidence = 1;
      }
      if (payload.clear) {
        delete p.season;
        delete p.season6;
        delete p.seasonSource;
      }
    });
    const n = patchQcByUrl(photo.url, (p) => {
      if (season) {
        p.season = season;
        p.seasonSource = 'manual';
        p.seasonConfidence = 1;
        p.seasonDetectedAt = new Date().toISOString();
      }
      if (season6) {
        p.season6 = season6;
        p.seasonSource = 'manual';
        p.seasonConfidence = 1;
      }
      if (payload.clear) {
        delete p.season;
        delete p.season6;
        delete p.seasonSource;
      }
    });
    runSync();
    return { ok: true, patched: n, season, season6 };
  }

  function setCredit(url, payload) {
    const photo = findByUrl(url);
    if (!photo) throw new Error(`Photo introuvable: ${url}`);
    const credit = payload.credit != null ? String(payload.credit).trim() : null;
    const place = payload.place != null ? String(payload.place).trim() : null;
    snapshotFiles(allMutableFiles());
    patchUnified(photo.url, (p) => {
      if (credit != null) p.credit = credit;
      if (place != null) p.place = place;
    });
    const n =
      patchQcByUrl(photo.url, (p) => {
        if (credit != null) p.credit = credit;
        if (place != null) p.place = place;
      }) +
      patchStockByUrl(photo.url, (p) => {
        if (credit != null) p.credit = credit;
      });
    runSync();
    const name = credit != null ? credit : photo.credit;
    const loc = place != null ? place : photo.place;
    const preview =
      name && loc && name.toLowerCase().indexOf(loc.toLowerCase()) < 0
        ? `${name} — ${loc}`
        : name || loc || '';
    return { ok: true, patched: n, credit: name, place: loc, preview };
  }

  function setFocalY(url, focalY) {
    const photo = findByUrl(url);
    if (!photo) throw new Error(`Photo introuvable: ${url}`);
    const nVal = Number(focalY);
    if (!Number.isFinite(nVal)) throw new Error('focalY invalide');
    const fy = Math.min(1, Math.max(0, nVal));
    snapshotFiles(allMutableFiles());
    const n =
      patchUnified(photo.url, (p) => {
        p.focalY = fy;
      }) +
      patchQcByUrl(photo.url, (p) => {
        p.focalY = fy;
      }) +
      patchStockByUrl(photo.url, (p) => {
        p.focalY = fy;
      });
    runSync();
    return { ok: true, patched: n, focalY: fy };
  }

  function normalizeSurfaces(raw) {
    const allowed = ['masthead', 'pomo', 'solitaire'];
    const list = Array.isArray(raw) ? raw : String(raw || '').split(',');
    return [...new Set(list.map((s) => String(s).trim()).filter((s) => allowed.includes(s)))];
  }

  function upsertFavorite(photo, surfaces, extra = {}) {
    const favBank = BANKS.find((b) => b.id === 'favorites');
    const file = qcPath(favBank.jsonRel);
    const data = loadJson(file, {
      version: 1,
      profile: 'favorites',
      photos: [],
    });
    const photos = data.photos || [];
    let src = null;
    eachQcPhoto((_bank, _data, _photos, _i, p) => {
      if (!src && p && urlsMatch(p.url, photo.url)) src = p;
    });
    const entry = {
      id: (src && src.id) || photoIdFromUrl(photo.url),
      url: photo.url,
      link: photo.link || (src && src.link) || photo.url,
      title: extra.title || photo.title || (src && src.title) || 'Favorite',
      credit: extra.credit != null ? extra.credit : photo.credit || (src && src.credit) || '',
      license: photo.license || (src && src.license) || '',
      width: photo.width || (src && src.width),
      height: photo.height || (src && src.height),
      aspect: src && src.aspect,
      mime: src && src.mime,
      place: extra.place != null ? extra.place : photo.place || (src && src.place) || '',
      focalY:
        extra.focalY != null
          ? extra.focalY
          : photo.focalY != null
            ? photo.focalY
            : src && src.focalY,
      position: photo.position || (src && src.position),
      season: extra.season || photo.season || (src && src.season),
      season6: extra.season6 || photo.season6 || (src && src.season6),
      seasonSource: 'manual',
      seasonConfidence: 1,
      permanent: extra.permanent === true,
      keep: extra.permanent === true,
      surfaces,
      pinnedAt: new Date().toISOString(),
      note: extra.note || 'Validé manuellement — labo photo',
    };
    const idx = photos.findIndex((p) => p && urlsMatch(p.url, photo.url));
    if (idx >= 0) photos[idx] = { ...photos[idx], ...entry };
    else photos.push(entry);
    data.photos = photos;
    data.updated = new Date().toISOString();
    writeJson(file, data);
    return entry;
  }

  function favoriteIsRedundant(fav, surfaces) {
    if ((surfaces || fav.surfaces || []).includes('solitaire')) return false;
    let inMaintain = false;
    eachQcPhoto((bank, _data, _photos, _i, p) => {
      if (bank.id === 'favorites') return;
      if (p && urlsMatch(p.url, fav.url)) inMaintain = true;
    });
    return inMaintain;
  }

  function applyBanks(url, surfacesRaw, extra = {}) {
    const surfaces = normalizeSurfaces(surfacesRaw);
    const photo = extra.photo || findByUrl(url);
    patchUnified(url, (p) => {
      const keep = (p.tags || []).filter((t) => !['mat', 'pomo', 'solitaire'].includes(t));
      p.tags = photosLib.tagsFromSurfaces(surfaces, keep);
      p.surfaces = surfaces.slice();
      if (extra.permanent) {
        p.tags = [...new Set([...(p.tags || []), 'favori'])];
        p.permanent = true;
      }
      if (extra.focalY != null) p.focalY = extra.focalY;
    });
    patchQcByUrl(url, (p) => {
      p.surfaces = surfaces.slice();
    });
    for (const stock of STOCK) {
      const file = qcPath(stock.rel);
      const photos = loadJsBackgrounds(file);
      const want = stock.surfaces[0];
      const idx = photos.findIndex((p) => p && urlsMatch(p.url, url));
      if (idx < 0) continue;
      if (surfaces.includes(want)) {
        photos[idx].surfaces = surfaces.slice();
      } else {
        photos.splice(idx, 1);
      }
      writeJsBackgrounds(file, photos, stockHeader(stock.id));
    }
    const needFavorite = extra.permanent;
    if (needFavorite && photo) {
      upsertFavorite({ ...photo, ...extra, url: photo.url }, surfaces, extra);
    } else if (photo) {
      const favBank = BANKS.find((b) => b.id === 'favorites');
      const file = qcPath(favBank.jsonRel);
      const data = loadJson(file, { photos: [] });
      const before = (data.photos || []).length;
      data.photos = (data.photos || []).filter((p) => {
        if (!p || !urlsMatch(p.url, url)) return true;
        return !favoriteIsRedundant(p, surfaces);
      });
      if (data.photos.length !== before) {
        data.updated = new Date().toISOString();
        writeJson(file, data);
      }
    }
    return surfaces;
  }

  function saveAll(url, payload = {}) {
    const photo = findByUrl(url);
    if (!photo) throw new Error(`Photo introuvable: ${url}`);
    snapshotFiles(allMutableFiles());
    const extra = {};
    if (payload.focalY != null && payload.focalY !== '') {
      const n = Number(payload.focalY);
      if (!Number.isFinite(n)) throw new Error('focalY invalide');
      extra.focalY = Math.min(1, Math.max(0, n));
      patchUnified(photo.url, (p) => {
        p.focalY = extra.focalY;
      });
      patchQcByUrl(photo.url, (p) => {
        p.focalY = extra.focalY;
      });
      patchStockByUrl(photo.url, (p) => {
        p.focalY = extra.focalY;
      });
    }
    if (payload.credit != null) extra.credit = String(payload.credit).trim();
    if (payload.place != null) extra.place = String(payload.place).trim();
    if (extra.credit != null || extra.place != null) {
      patchUnified(photo.url, (p) => {
        if (extra.credit != null) p.credit = extra.credit;
        if (extra.place != null) p.place = extra.place;
      });
      patchQcByUrl(photo.url, (p) => {
        if (extra.credit != null) p.credit = extra.credit;
        if (extra.place != null) p.place = extra.place;
      });
      patchStockByUrl(photo.url, (p) => {
        if (extra.credit != null) p.credit = extra.credit;
      });
    }
    if (payload.clearSeason) {
      extra.season = '';
      extra.season6 = '';
      patchQcByUrl(photo.url, (p) => {
        delete p.season;
        delete p.season6;
        delete p.seasonSource;
      });
    } else {
      if (payload.season) {
        if (!SEASON4.includes(payload.season)) {
          throw new Error(`Saison 4 inconnue: ${payload.season}`);
        }
        extra.season = payload.season;
      }
      if (payload.season6) {
        if (!SEASON6.includes(payload.season6)) {
          throw new Error(`Saison 6 inconnue: ${payload.season6}`);
        }
        extra.season6 = payload.season6;
      }
      if (extra.season || extra.season6) {
        patchUnified(photo.url, (p) => {
          if (extra.season) {
            p.season = extra.season;
            p.seasonSource = 'manual';
            p.seasonConfidence = 1;
          }
          if (extra.season6) {
            p.season6 = extra.season6;
            p.seasonSource = 'manual';
          }
        });
        patchQcByUrl(photo.url, (p) => {
          if (extra.season) {
            p.season = extra.season;
            p.seasonSource = 'manual';
            p.seasonConfidence = 1;
            p.seasonDetectedAt = new Date().toISOString();
          }
          if (extra.season6) {
            p.season6 = extra.season6;
            p.seasonSource = 'manual';
            p.seasonConfidence = 1;
          }
        });
      }
    }
    extra.permanent = payload.permanent === true;
    extra.note = payload.note;
    extra.title = photo.title;
    extra.photo = { ...photo, ...extra, url: photo.url };
    let surfaces = (photo.surfaces || []).slice();
    if (Array.isArray(payload.tags)) {
      const allowed = photosLib.TAGS;
      let tags = [...new Set(payload.tags.filter((t) => allowed.includes(t)))];
      if (payload.permanent && !tags.includes('favori')) tags.push('favori');
      if (tags.includes('campus') && !tags.includes('mat')) {
        const hit = matchHardBanned({
          url: photo.url,
          title: photo.title,
          id: photo.id,
        });
        if (!(hit && hit.reason === 'reads_as_church_casault')) tags.push('mat');
      }
      extra.permanent = extra.permanent || tags.includes('favori');
      patchUnified(photo.url, (p) => {
        p.tags = tags;
        p.surfaces = photosLib.surfacesFromTags(tags);
        p.campus = tags.includes('campus');
        p.permanent = tags.includes('favori');
        if (extra.focalY != null) p.focalY = extra.focalY;
      });
      surfaces = photosLib.surfacesFromTags(tags);
      applyBanks(photo.url, surfaces, extra);
    } else if (payload.surfaces != null) {
      surfaces = applyBanks(photo.url, payload.surfaces, extra);
    }
    if (payload.tags == null && payload.surfaces == null && payload.permanent) {
      upsertFavorite({ ...photo, ...extra }, surfaces.length ? surfaces : ['masthead'], extra);
    }
    cleanupDuplicates({ skipSnapshot: true, skipSync: true });
    runSync();
    const after = findByUrl(url);
    return {
      ok: true,
      surfaces: after ? after.surfaces : surfaces,
      credit: after && after.credit,
      place: after && after.place,
      season: after && after.season,
      focalY: after && after.focalY,
    };
  }

  function cleanupDuplicates(opts = {}) {
    if (!opts.skipSnapshot) snapshotFiles(allMutableFiles());
    let removed = 0;
    for (const bank of BANKS) {
      const file = qcPath(bank.jsonRel);
      const data = loadQcBank(bank);
      const before = (data.photos || []).length;
      data.photos = dedupePhotoList(data.photos || []);
      removed += before - data.photos.length;
      if (before !== data.photos.length) {
        data.updated = new Date().toISOString();
        writeJson(file, data);
      }
    }
    for (const stock of STOCK) {
      const file = qcPath(stock.rel);
      const photos = loadJsBackgrounds(file);
      const next = dedupePhotoList(photos);
      removed += photos.length - next.length;
      if (next.length !== photos.length) {
        writeJsBackgrounds(file, next, stockHeader(stock.id));
      }
    }
    const favBank = BANKS.find((b) => b.id === 'favorites');
    const favFile = qcPath(favBank.jsonRel);
    const fav = loadJson(favFile, { photos: [] });
    const maintainKeys = new Set();
    eachQcPhoto((bank, _d, _p, _i, p) => {
      if (bank.id === 'favorites' || !p || !p.url) return;
      maintainKeys.add(photoKey(p.url));
    });
    const beforeFav = (fav.photos || []).length;
    fav.photos = (fav.photos || []).filter((p) => {
      if (!p || !p.url) return false;
      const surfaces = Array.isArray(p.surfaces) ? p.surfaces : [];
      if (p.keep) return true;
      if (surfaces.includes('solitaire') || surfaces.includes('*')) return true;
      if (!maintainKeys.has(photoKey(p.url))) return true;
      if (p.note && !/labo photo/i.test(String(p.note))) return true;
      removed += 1;
      return false;
    });
    fav.photos = dedupePhotoList(fav.photos);
    if (fav.photos.length !== beforeFav) {
      fav.updated = new Date().toISOString();
      writeJson(favFile, fav);
    }
    if (!opts.skipSync) runSync();
    return { ok: true, removed };
  }

  function pinPhoto(url, payload = {}) {
    return saveAll(url, { ...payload, permanent: true });
  }

  function undo() {
    const snap = undoStack.pop();
    if (!snap) return { ok: false, reason: 'empty' };
    restoreSnap(snap);
    runSync();
    return { ok: true, remaining: undoStack.length };
  }

  function stats(list) {
    const photos = list || listPhotos();
    const byBank = {};
    const bySeason = {};
    const bySurface = { masthead: 0, pomo: 0, solitaire: 0 };
    let untagged = 0;
    let permanent = 0;
    for (const p of photos) {
      for (const b of p.banks) byBank[b] = (byBank[b] || 0) + 1;
      const s = p.season || '?';
      bySeason[s] = (bySeason[s] || 0) + 1;
      if (!p.season) untagged += 1;
      if (p.permanent) permanent += 1;
      for (const surf of p.surfaces) {
        if (bySurface[surf] != null) bySurface[surf] += 1;
      }
    }
    return {
      total: photos.length,
      byBank,
      bySeason,
      bySurface,
      untagged,
      permanent,
    };
  }

  return {
    root,
    listPhotos,
    findByUrl,
    rejectPhoto,
    setSeason,
    setCredit,
    setFocalY,
    pinPhoto,
    saveAll,
    applyBanks,
    cleanupDuplicates,
    undo,
    stats,
    thumbUrl,
    coverWindow,
    frames: { DESKTOP_MAST, MOBILE_MAST, FULLSCREEN_PHONE, FULLSCREEN_DESKTOP },
    SEASON4,
    SEASON6,
  };
}

module.exports = {
  createPhotoLab,
  photoKey,
  photoIdFromUrl,
  thumbUrl,
  coverWindow,
  commonsFileFragment,
  DESKTOP_MAST,
  MOBILE_MAST,
  FULLSCREEN_PHONE,
  FULLSCREEN_DESKTOP,
  SEASON4,
  SEASON6,
  BANKS,
  STOCK,
};

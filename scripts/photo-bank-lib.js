/**
 * LE RADAR — banque unique de fonds (tags).
 * Source de vérité : data/photo-bank.json
 *
 * Tags : mat | pomo | solitaire | favori | campus | nations | art
 * favori + campus = hors purge des moissons.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { matchHardBanned } = require('./quebec-backgrounds-blacklist');

const DEFAULT_ROOT = path.join(__dirname, '..');
const PHOTOS_REL = 'data/photo-bank.json';
const PHOTOS_JS_REL = 'photo-bank-data.js';

const TAGS = ['mat', 'pomo', 'solitaire', 'favori', 'campus', 'nations', 'art'];
const SURFACE_TAGS = ['mat', 'pomo', 'solitaire'];

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

function hasTag(p, tag) {
  return Array.isArray(p && p.tags) && p.tags.includes(tag);
}

function isProtectedPhoto(p) {
  if (!p) return false;
  if (p.permanent === true || p.campus === true) return true;
  return hasTag(p, 'favori') || hasTag(p, 'campus');
}

function isCampusTagged(p) {
  return !!(p && (p.campus === true || hasTag(p, 'campus')));
}

function stripMastTags(p) {
  const tags = (p.tags || []).filter((t) => t !== 'mat');
  const hasSurfaces = Array.isArray(p.surfaces);
  const surfaces = hasSurfaces
    ? p.surfaces.filter((s) => s !== 'masthead' && s !== 'mat')
    : [];
  const tagsSame = tags.length === (p.tags || []).length;
  const surfSame = !hasSurfaces || surfaces.length === p.surfaces.length;
  if (tagsSame && surfSame) return p;
  const out = { ...p, tags };
  if (hasSurfaces) {
    if (surfaces.length) out.surfaces = surfaces;
    else delete out.surfaces;
  }
  return out;
}

/**
 * Banque unique (labo + affiches) : les rejets labo sortent toujours.
 * Casault et pavillons campus ne sont plus un hard-ban « église ».
 */
function retainUnifiedPhoto(p) {
  if (!p) return null;
  const hit = matchHardBanned(p);
  if (!hit) return destineCampusPhoto(p);
  if (hit.reason === 'user_curated_photo_rejected') return null;
  return null;
}

const MAST_MIN_ASPECT = 1.25;

function isMastAspectOk(p) {
  const w = Number(p && p.width) || 0;
  const h = Number(p && p.height) || 0;
  if (!w || !h) return true;
  return w / h >= MAST_MIN_ASPECT;
}

/** Portrait campus → affiches seulement (11×17), pas le bandeau mât. */
function destineCampusPhoto(p) {
  if (!p || !isCampusTagged(p)) return p;
  if (isMastAspectOk(p)) return p;
  return stripMastTags(p);
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

function pickFocalY(a, b) {
  const av = typeof a === 'number' && !Number.isNaN(a);
  const bv = typeof b === 'number' && !Number.isNaN(b);
  if (av && !bv) return a;
  if (bv && !av) return b;
  if (av && bv) {
    if (a === 0.5 && b !== 0.5) return b;
    if (b === 0.5 && a !== 0.5) return a;
    return a;
  }
  return undefined;
}

function mergeRecord(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) {
    if (v == null || v === '') continue;
    if (k === 'tags' && Array.isArray(v)) {
      out.tags = [...new Set([...(out.tags || []), ...v])];
      continue;
    }
    if (k === 'surfaces' && Array.isArray(v)) {
      out.surfaces = [...new Set([...(out.surfaces || []), ...v])];
      continue;
    }
    if (k === 'focalY') continue;
    if (out[k] == null || out[k] === '') out[k] = v;
  }
  const fy = pickFocalY(a && a.focalY, b && b.focalY);
  if (fy != null) out.focalY = fy;
  if (a && b && a.url && b.url) out.url = preferUrl(a.url, b.url);
  if (hasTag(out, 'favori') || out.permanent) out.permanent = true;
  if (hasTag(out, 'campus') || out.campus) out.campus = true;
  return out;
}

function loadJsBackgrounds(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const src = fs.readFileSync(filePath, 'utf8');
  const ctx = {};
  vm.runInNewContext(`${src}\nthis.BACKGROUNDS = BACKGROUNDS;`, ctx);
  return Array.isArray(ctx.BACKGROUNDS) ? ctx.BACKGROUNDS : [];
}

function loadPhotos(root = DEFAULT_ROOT) {
  const file = path.join(root, PHOTOS_REL);
  if (!fs.existsSync(file)) return { version: 1, photos: [] };
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(data.photos)) data.photos = [];
  return data;
}

function savePhotos(data, root = DEFAULT_ROOT) {
  const file = path.join(root, PHOTOS_REL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const out = {
    version: 1,
    profile: 'unified',
    updated: new Date().toISOString(),
    photos: data.photos || [],
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n', 'utf8');
  return out;
}

function loadJsonPhotos(file) {
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(data.photos) ? data.photos : [];
}

function withTags(photo, tags) {
  const t = new Set(tags);
  if (photo.permanent) t.add('favori');
  if (photo.campus) t.add('campus');
  if (Array.isArray(photo.surfaces)) {
    for (const s of photo.surfaces) {
      if (s === 'masthead' || s === 'mat') t.add('mat');
      if (s === 'pomo') t.add('pomo');
      if (s === 'solitaire') t.add('solitaire');
      if (s === '*') {
        t.add('mat');
        t.add('pomo');
        t.add('solitaire');
      }
    }
  }
  const out = { ...photo, tags: [...t] };
  if (t.has('favori')) out.permanent = true;
  if (t.has('campus')) out.campus = true;
  return out;
}

function mergeLegacyIntoUnified(root = DEFAULT_ROOT) {
  const map = new Map();
  function ingest(photos, tags) {
    for (const raw of photos || []) {
      if (!raw || !raw.url) continue;
      const tagged = withTags(raw, tags);
      const k = photoKey(tagged.url);
      if (!map.has(k)) map.set(k, tagged);
      else map.set(k, mergeRecord(map.get(k), tagged));
    }
  }
  ingest(loadJsonPhotos(path.join(root, 'data/quebec-backgrounds.json')), ['mat']);
  ingest(loadJsonPhotos(path.join(root, 'data/quebec-university-backgrounds.json')), [
    'mat',
    'campus',
  ]);
  ingest(loadJsonPhotos(path.join(root, 'data/quebec-pomo-backgrounds.json')), ['pomo']);
  ingest(loadJsonPhotos(path.join(root, 'data/quebec-nations-backgrounds.json')), [
    'mat',
    'pomo',
    'nations',
  ]);
  ingest(loadJsonPhotos(path.join(root, 'data/quebec-favorites-backgrounds.json')), ['favori']);
  ingest(loadJsBackgrounds(path.join(root, 'pomo/js/backgrounds-data.js')), ['pomo']);
  ingest(loadJsBackgrounds(path.join(root, 'solitaire/js/backgrounds-data.js')), ['solitaire']);

  const photos = [...map.values()].map((p) => {
    const tags = [...new Set(p.tags || [])].filter((t) => TAGS.includes(t));
    const out = { ...p, tags };
    if (!out.id) out.id = photoIdFromUrl(out.url);
    if (tags.includes('favori')) out.permanent = true;
    if (tags.includes('campus')) out.campus = true;
    return out;
  });
  photos.sort((a, b) =>
    `${a.place || ''} ${a.title || ''}`.localeCompare(`${b.place || ''} ${b.title || ''}`, 'fr')
  );
  const data = savePhotos({ photos }, root);
  return {
    total: photos.length,
    withFocalY: photos.filter((p) => typeof p.focalY === 'number').length,
    favori: photos.filter((p) => hasTag(p, 'favori')).length,
    campus: photos.filter((p) => hasTag(p, 'campus')).length,
    mat: photos.filter((p) => hasTag(p, 'mat')).length,
    pomo: photos.filter((p) => hasTag(p, 'pomo')).length,
    solitaire: photos.filter((p) => hasTag(p, 'solitaire')).length,
    data,
  };
}

function filterByTag(photos, tag) {
  return (photos || []).filter((p) => hasTag(p, tag));
}

function surfacesFromTags(tags) {
  const s = [];
  if ((tags || []).includes('mat')) s.push('masthead');
  if ((tags || []).includes('pomo')) s.push('pomo');
  if ((tags || []).includes('solitaire')) s.push('solitaire');
  return s;
}

function tagsFromSurfaces(surfaces, extra = []) {
  const t = new Set(extra);
  for (const s of surfaces || []) {
    if (s === 'masthead' || s === 'mat') t.add('mat');
    if (s === 'pomo') t.add('pomo');
    if (s === 'solitaire') t.add('solitaire');
  }
  return [...t];
}

function escJs(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function photoToUnifiedJs(p) {
  const lines = [`    url: "${escJs(p.url)}"`];
  if (p.credit) lines.push(`    credit: "${escJs(p.credit)}"`);
  if (p.link) lines.push(`    link: "${escJs(p.link)}"`);
  if (p.license) lines.push(`    license: "${escJs(p.license)}"`);
  if (p.title) lines.push(`    title: "${escJs(p.title)}"`);
  if (p.place) lines.push(`    place: "${escJs(p.place)}"`);
  if (typeof p.focalY === 'number' && !Number.isNaN(p.focalY)) {
    lines.push(`    focalY: ${p.focalY}`);
  }
  if (typeof p.width === 'number' && p.width > 0) lines.push(`    width: ${Math.round(p.width)}`);
  if (typeof p.height === 'number' && p.height > 0) lines.push(`    height: ${Math.round(p.height)}`);
  if (p.season) lines.push(`    season: "${escJs(p.season)}"`);
  if (p.season6) lines.push(`    season6: "${escJs(p.season6)}"`);
  if (p.nationId) lines.push(`    nationId: "${escJs(p.nationId)}"`);
  if (p.nation) lines.push(`    nation: "${escJs(p.nation)}"`);
  if (p.campus || hasTag(p, 'campus')) lines.push('    campus: true');
  if (p.permanent || hasTag(p, 'favori')) lines.push('    permanent: true');
  const tags = p.tags || [];
  if (tags.length) {
    lines.push(`    tags: [${tags.map((t) => `"${escJs(t)}"`).join(', ')}]`);
  }
  const surfaces = surfacesFromTags(tags);
  if (surfaces.length) {
    lines.push(`    surfaces: [${surfaces.map((s) => `"${escJs(s)}"`).join(', ')}]`);
  }
  return `  {\n${lines.join(',\n')},\n  }`;
}

function writePhotosJs(photos, root = DEFAULT_ROOT) {
  const body = (photos || []).map(photoToUnifiedJs).join(',\n');
  const out = `/* LE RADAR — banque unique de fonds (généré)
 * Source : ${PHOTOS_REL}
 * Tags : mat, pomo, solitaire, favori, campus, nations, art
 * favori + campus : hors purge moisson
 */
const PHOTO_BANK = [
${body}
];
`;
  fs.writeFileSync(path.join(root, PHOTOS_JS_REL), out, 'utf8');
}

function materializeLegacySlices(root = DEFAULT_ROOT) {
  const photos = loadPhotos(root).photos || [];
  const slices = [
    {
      rel: 'data/quebec-backgrounds.json',
      profile: 'masthead',
      pred: (p) =>
        hasTag(p, 'mat') &&
        !hasTag(p, 'campus') &&
        !hasTag(p, 'nations') &&
        /wikimedia|commons/i.test(String(p.url || '')),
    },
    {
      rel: 'data/quebec-university-backgrounds.json',
      profile: 'universities',
      pred: (p) => hasTag(p, 'campus') && hasTag(p, 'mat'),
    },
    {
      rel: 'data/quebec-pomo-backgrounds.json',
      profile: 'pomo',
      pred: (p) =>
        hasTag(p, 'pomo') &&
        !hasTag(p, 'nations') &&
        /wikimedia|commons/i.test(String(p.url || '')) &&
        (hasTag(p, 'mat') || !hasTag(p, 'solitaire')),
    },
    {
      rel: 'data/quebec-nations-backgrounds.json',
      profile: 'nations',
      pred: (p) => hasTag(p, 'nations'),
    },
    {
      rel: 'data/quebec-favorites-backgrounds.json',
      profile: 'favorites',
      pred: (p) => hasTag(p, 'favori'),
    },
  ];
  for (const s of slices) {
    const list = photos.filter(s.pred);
    const data = {
      version: 1,
      profile: s.profile,
      updated: new Date().toISOString(),
      photos: list,
    };
    const dest = path.join(root, s.rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }
  writePhotosJs(photos, root);
  return photos.length;
}

function absorbHarvest(profileId, harvested, root = DEFAULT_ROOT) {
  const tagMap = {
    masthead: ['mat'],
    universities: ['mat', 'campus'],
    pomo: ['pomo'],
    nations: ['mat', 'pomo', 'nations'],
  };
  const extraTags = tagMap[profileId] || ['mat'];
  const data = loadPhotos(root);
  const map = new Map();
  for (const p of data.photos || []) {
    if (!p || !p.url) continue;
    map.set(photoKey(p.url), p);
  }
  let added = 0;
  for (const raw of harvested || []) {
    if (!raw || !raw.url) continue;
    const tagged = withTags(raw, extraTags);
    const k = photoKey(tagged.url);
    if (map.has(k)) {
      const cur = map.get(k);
      const merged = mergeRecord(cur, tagged);
      merged.tags = [...new Set([...(cur.tags || []), ...(tagged.tags || []), ...extraTags])];
      if (typeof cur.focalY === 'number') merged.focalY = cur.focalY;
      map.set(k, merged);
    } else {
      if (!tagged.id) tagged.id = photoIdFromUrl(tagged.url);
      map.set(k, tagged);
      added += 1;
    }
  }
  const photos = [...map.values()];
  savePhotos({ photos }, root);
  materializeLegacySlices(root);
  return { total: photos.length, added };
}

module.exports = {
  PHOTOS_REL,
  PHOTOS_JS_REL,
  TAGS,
  SURFACE_TAGS,
  photoIdFromUrl,
  photoKey,
  hasTag,
  isProtectedPhoto,
  isCampusTagged,
  stripMastTags,
  retainUnifiedPhoto,
  destineCampusPhoto,
  isMastAspectOk,
  MAST_MIN_ASPECT,
  mergeRecord,
  pickFocalY,
  loadPhotos,
  savePhotos,
  mergeLegacyIntoUnified,
  absorbHarvest,
  filterByTag,
  surfacesFromTags,
  tagsFromSurfaces,
  loadJsBackgrounds,
  materializeLegacySlices,
  writePhotosJs,
  photoToUnifiedJs,
};

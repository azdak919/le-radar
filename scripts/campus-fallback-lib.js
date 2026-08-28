/**
 * Repli photo campus selon l’établissement de la source.
 *
 * Utilisé par le bot (ensure-lead-images) et les tests. Le fil (radar-news.js)
 * reprend la même logique côté client (QUEBEC_UNIVERSITY_BACKGROUNDS + cégeps).
 *
 * Hôtes fragiles : URL d’article présente mais souvent injoignable depuis
 * le-radar.ca (hotlink / origine down). On garde la photo source en priorité,
 * et on attache un stock campus comme filet.
 */

'use strict';

(function initCampusFallback(global) {
const FRAGILE_IMAGE_HOSTS = new Set([
  'exemplaire.com.ulaval.ca',
  'www.exemplaire.com.ulaval.ca',
]);

function hostOf(url = '') {
  try {
    return new URL(String(url || '').trim()).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function imageHostIsFragile(url = '') {
  const host = hostOf(url);
  if (!host) return false;
  if (FRAGILE_IMAGE_HOSTS.has(host)) return true;
  for (const frag of FRAGILE_IMAGE_HOSTS) {
    if (host === frag || host.endsWith(`.${frag}`)) return true;
  }
  return false;
}

function normalizeCampusKey(text = '') {
  return String(text || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Aiguilles spécifiques d’abord (Polytechnique avant Montréal, UQAM avant
 * Montréal) pour ne pas servir le mauvais campus.
 */
function campusNeedlesFor(institution = '') {
  const raw = normalizeCampusKey(institution);
  if (!raw) return [];
  const needles = [];
  const add = (n) => {
    const v = normalizeCampusKey(n);
    if (v && !needles.includes(v)) needles.push(v);
  };

  if (/\bpolytechnique\b/.test(raw)) add('polytechnique');
  if (/\buqam\b/.test(raw) || /quebec a montreal/.test(raw)) add('uqam');
  if (/\buqtr\b/.test(raw) || /trois rivi/.test(raw)) {
    add('uqtr');
    add('trois rivieres');
  }
  if (/\buqac\b/.test(raw) || (/\bchicoutimi\b/.test(raw) && /universit/.test(raw))) add('uqac');
  if (/\buqar\b/.test(raw) || (/\brimouski\b/.test(raw) && /universit/.test(raw))) add('uqar');
  if (/\buqo\b/.test(raw) || /outaouais/.test(raw)) add('uqo');
  if (/\buqat\b/.test(raw) || /abitibi/.test(raw)) add('uqat');
  if (/\bets\b/.test(raw) || /ecole de technologie/.test(raw)) add('ets');
  if (/\bhec\b/.test(raw)) add('hec');
  if (/\bteluq\b/.test(raw)) add('teluq');
  if (/\benap\b/.test(raw)) add('enap');
  if (/\blaval\b/.test(raw)) add('laval');
  if (/\bmcgill\b/.test(raw)) add('mcgill');
  if (/\bconcordia\b/.test(raw)) add('concordia');
  if (/\bbishop/.test(raw)) add('bishop');
  if (/\bsherbrooke\b/.test(raw)) {
    add('sherbrooke');
    add('longueuil');
  }
  if (/\bdawson\b/.test(raw)) add('dawson');
  if (/vieux montreal/.test(raw)) add('vieux montreal');
  if (/jonquiere/.test(raw)) add('jonquiere');
  if (/lionel groulx/.test(raw)) add('lionel groulx');
  if (/maisonneuve/.test(raw)) add('maisonneuve');
  if (/chicoutimi/.test(raw) && /cegep|college/.test(raw)) add('cegep de chicoutimi');
  if (/rimouski/.test(raw) && /cegep|college/.test(raw)) add('cegep de rimouski');
  if (/\budem\b/.test(raw) || /universite de montreal/.test(raw)) add('universite de montreal');

  if (!needles.length) add(raw);
  return needles;
}

function campusPhotoHay(photo = {}) {
  const tags = Array.isArray(photo.tags) ? photo.tags.join(' ') : (photo.tags || '');
  return normalizeCampusKey(
    [photo.place, photo.title, photo.url, photo.link, photo.sourceUrl, tags, photo.creator, photo.credit]
      .filter(Boolean)
      .join(' '),
  );
}

function photoMatchesNeedles(photo, needles = []) {
  if (!needles.length) return false;
  const hay = campusPhotoHay(photo);
  if (!hay) return false;
  return needles.some((n) => hay.includes(n));
}

function filterUniversityPhotos(photos = [], institution = '') {
  const needles = campusNeedlesFor(institution);
  if (!needles.length) return [];
  return (Array.isArray(photos) ? photos : []).filter((p) => p && p.url && photoMatchesNeedles(p, needles));
}

function hashIndex(seed, modulo) {
  const n = Number(modulo) || 0;
  if (n <= 0) return 0;
  let h = 2166136261;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % n;
}

/** Cégeps absents de la banque mât universities — mêmes URL que campus-photo-bank. */
const CEGEP_CAMPUS_EXTRAS = [
  {
    needles: ['dawson'],
    photos: [
      {
        url: 'https://upload.wikimedia.org/wikipedia/commons/e/ee/Dawson_College_1.jpg',
        title: 'Dawson College, Montréal',
        credit: 'Hayden Soloviev',
        license: 'CC BY 4.0',
        link: 'https://commons.wikimedia.org/wiki/File:Dawson_College_1.jpg',
      },
      {
        url: 'https://upload.wikimedia.org/wikipedia/commons/d/d5/Dawson_College_6.jpg',
        title: 'Dawson College 6, Montréal',
        credit: 'Hayden Soloviev',
        license: 'CC BY 4.0',
        link: 'https://commons.wikimedia.org/wiki/File:Dawson_College_6.jpg',
      },
      {
        url: 'https://upload.wikimedia.org/wikipedia/commons/c/c2/Dawson_College_09.JPG',
        title: 'Dawson College 09',
        credit: 'Jeangagnon',
        license: 'CC BY-SA 3.0',
        link: 'https://commons.wikimedia.org/wiki/File:Dawson_College_09.JPG',
      },
    ],
  },
  {
    needles: ['vieux montreal'],
    photos: [
      {
        url: 'https://upload.wikimedia.org/wikipedia/commons/9/94/C%C3%A9gep_du_Vieux_Montr%C3%A9al01.JPG',
        title: 'Cégep du Vieux Montréal',
        credit: 'Jeangagnon',
        license: 'CC BY-SA 3.0',
        link: 'https://commons.wikimedia.org/wiki/File:C%C3%A9gep_du_Vieux_Montr%C3%A9al01.JPG',
      },
      {
        url: 'https://upload.wikimedia.org/wikipedia/commons/6/6c/C%C3%A9gep_du_Vieux_Montr%C3%A9al%2C_Nov_03_2022.jpg',
        title: 'Cégep du Vieux Montréal, Nov 03 2022',
        credit: 'Gen. Quon',
        license: 'CC BY-SA 4.0',
        link: 'https://commons.wikimedia.org/wiki/File:C%C3%A9gep_du_Vieux_Montr%C3%A9al,_Nov_03_2022.jpg',
      },
    ],
  },
  {
    needles: ['jonquiere'],
    photos: [
      {
        url: 'https://upload.wikimedia.org/wikipedia/commons/f/f4/Pavillon_principal_du_C%C3%A9gep_de_Jonqui%C3%A8re.jpg',
        title: 'Pavillon principal du Cégep de Jonquière',
        credit: 'Jeangagnon',
        license: 'CC BY-SA 4.0',
        link: 'https://commons.wikimedia.org/wiki/File:Pavillon_principal_du_C%C3%A9gep_de_Jonqui%C3%A8re.jpg',
      },
      {
        url: 'https://upload.wikimedia.org/wikipedia/commons/3/31/Campus_du_C%C3%A9gep_de_Jonqui%C3%A8re.jpg',
        title: 'Campus du Cégep de Jonquière',
        credit: 'Khayman',
        license: 'CC BY-SA 3.0',
        link: 'https://commons.wikimedia.org/wiki/File:Campus_du_C%C3%A9gep_de_Jonqui%C3%A8re.jpg',
      },
    ],
  },
];

function extrasForInstitution(institution = '') {
  const needles = campusNeedlesFor(institution);
  const out = [];
  for (const group of CEGEP_CAMPUS_EXTRAS) {
    const hit = needles.some((n) => group.needles.some((g) => n.includes(g) || g.includes(n)));
    if (hit) out.push(...group.photos);
  }
  return out;
}

function toFallbackFields(pick = {}) {
  if (!pick?.url) return null;
  const credit = pick.credit || pick.creator || '';
  const license = pick.license || 'CC';
  const link = pick.link || pick.sourceUrl || pick.url;
  return {
    url: pick.url,
    title: pick.title || '',
    credit,
    license,
    link,
    stockImage: pick.url,
    imageTitle: pick.title || '',
    imageCredit: `Photo : ${credit || 'Auteur·e inconnu·e'} / ${license} · Wikimedia Commons`,
    imageCreator: credit,
    imageLicense: license,
    imageProvider: 'campus-bank',
    imageSourceUrl: link,
  };
}

/**
 * @param {{ institution?: string, link?: string, title?: string }} item
 * @param {{ universityPhotos?: object[] }} [opts]
 */
function pickCampusFallback(item = {}, opts = {}) {
  const inst = item.institution || '';
  const uni = filterUniversityPhotos(opts.universityPhotos || [], inst).map((p) => ({
    url: p.url,
    title: p.title || '',
    credit: p.credit || p.creator || '',
    license: p.license || '',
    link: p.link || p.sourceUrl || p.url,
  }));
  const pool = [...uni, ...extrasForInstitution(inst)];
  if (!pool.length) return null;
  const pick = pool[hashIndex(item.link || item.title || inst, pool.length)];
  return toFallbackFields(pick);
}

function sourceNeedsCampusBackup(item = {}, { hasUsableSourceImage = false } = {}) {
  if (!item) return false;
  if (item.stockImage && String(item.stockImage).trim()) return false;
  if (!hasUsableSourceImage) return true;
  if (imageHostIsFragile(item.image) && !String(item.imageLocal || '').trim()) return true;
  return false;
}

const api = {
  FRAGILE_IMAGE_HOSTS,
  imageHostIsFragile,
  normalizeCampusKey,
  campusNeedlesFor,
  filterUniversityPhotos,
  extrasForInstitution,
  pickCampusFallback,
  sourceNeedsCampusBackup,
  CEGEP_CAMPUS_EXTRAS,
  hashIndex,
};

if (typeof module === 'object' && module.exports) {
  module.exports = api;
}
if (global) global.CampusFallback = api;
}(typeof globalThis === 'object' ? globalThis : this));

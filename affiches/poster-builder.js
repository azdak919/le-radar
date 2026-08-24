/* Générateur public d’affiches LE-RADAR.ca — JPEG 300 ou 600 dpi (1200 en labo local). */

const REF_DPI = 300;
const PREVIEW_DPI = 150;
const DPI_PUBLIC = [300, 600];
const DPI_LAB = [300, 600, 1200];
const DEFAULT_DPI = 600;
const FORMATS = {
  tabloid: { id: 'tabloid', label: '11 × 17 po', file: '11x17', wIn: 11, hIn: 17 },
  letter: { id: 'letter', label: 'Lettre 8,5 × 11 po', file: 'lettre', wIn: 8.5, hIn: 11 },
  legal: { id: 'legal', label: 'Légal 8,5 × 14 po', file: 'legal', wIn: 8.5, hIn: 14 },
};

const TITLE = 'LE-RADAR.ca';
const SLOGAN = 'Journaux, radios et sports étudiants du Québec, réunis au même endroit';
const NAME_FULL = 'Le Réseau Académique de Découverte et d’Agrégation de Ressources';
const SLOGAN_EN = 'Student newspapers, radio and sports from Quebec, all in one place';
const INDEP_1 = 'Projet indépendant, non officiel et sans affiliation aux médias ni aux établissements.';
const INDEP_2 = 'Les contenus appartiennent à leurs publications d’origine.';
const INDEP_EN = 'Independent, unofficial and not affiliated. Content belongs to the original publications.';

const INK = '#F1F2F4';
const SOFT = '#C2C6CD';
const MUTED = '#888D96';
const BG = '#0E0F12';
const PURPLE = '#6C2163';
const TRACK = -0.02;

/* Endonymes — mêmes libellés que le module de traduction du site. */
const TRANSLATE_LANGS = [
  'Français', 'English', 'ᐃᓄᒃᑎᑐᑦ', 'Inuktut',
  'አማርኛ', 'العربية', 'বাংলা', 'Deutsch', 'Ελληνικά', 'Español',
  'فارسی', 'ગુજરાતી', 'Hausa', 'עברית', 'हिन्दी', 'Kreyòl ayisyen',
  'Bahasa Indonesia', 'Igbo', 'Italiano', '日本語', 'ಕನ್ನಡ', '한국어',
  'മലയാളം', 'मराठी', 'Bahasa Melayu', 'Nederlands', 'ਪੰਜਾਬੀ', 'Polski',
  'Português', 'Română', 'Русский', 'Svenska', 'Kiswahili', 'தமிழ்',
  'తెలుగు', 'ไทย', 'Tagalog', 'Türkçe', 'Українська', 'اردو',
  'Tiếng Việt', 'Yorùbá', '简体中文', '繁體中文',
];

const GREETINGS = {
  none: null,
  rentree: 'Bonne rentrée',
  'mi-session': 'Courage — mi-session',
  motivation: 'Tu vas y arriver',
  'fin-session': 'Bonne fin de session',
  relache: 'Bonne relâche',
  'action-grace': 'Bonne Action de grâce',
  verite: 'Vérité et réconciliation',
  souvenir: 'Souvenons-nous',
  fetes: 'Joyeuses Fêtes',
  annee: 'Bonne année',
  paques: 'Joyeuses Pâques',
  patriotes: 'Journée des Patriotes',
  'saint-jean': 'Bonne Saint-Jean',
  canada: 'Bonne fête du Canada',
  nopub: 'Pas de publicité',
  gpl: 'Code libre GPL 2.0',
  gratuit: 'Gratuit, pour toujours',
  independant: 'Indépendant',
  ncompte: 'Sans compte à créer',
};

const GREETINGS_EN = {
  rentree: 'Have a great start',
  'mi-session': 'You’ve got this — midterms',
  motivation: 'You’ve got this',
  'fin-session': 'Good luck with finals',
  relache: 'Enjoy the break',
  'action-grace': 'Happy Thanksgiving',
  verite: 'Truth and Reconciliation',
  souvenir: 'Lest we forget',
  fetes: 'Happy Holidays',
  annee: 'Happy New Year',
  paques: 'Happy Easter',
  patriotes: 'Patriots’ Day',
  'saint-jean': 'Happy Fête nationale',
  canada: 'Happy Canada Day',
  nopub: 'No ads',
  gpl: 'Free software — GPL 2.0',
  gratuit: 'Free, forever',
  independant: 'Independent',
  ncompte: 'No account needed',
};

const CAMPUSES = [
  { slug: 'generique', line: null, lineEn: null, bilingual: false, places: null, hints: null, label: 'Générique' },
  {
    slug: 'laval', line: 'Université Laval', prefix: 'Université ', core: 'Laval', bilingual: false, label: 'Université Laval',
    places: ['université laval'],
    hints: ['université laval', 'adrien-pouliot', 'alphonse-marie-parent', 'biermans', 'ernest-lemieux', 'pavillon dkn', 'casault', 'palasis', 'bonenfant', 'grand axe'],
  },
  {
    slug: 'mcgill', line: 'Université McGill', lineEn: 'McGill University', prefix: 'Université ', core: 'McGill', bilingual: true, label: 'Université McGill',
    places: ['mcgill'],
    hints: ['mcgill'],
  },
  {
    slug: 'udem', line: 'Université de Montréal', prefix: 'Université de ', core: 'Montréal', bilingual: false, label: 'Université de Montréal',
    places: ['université de montréal'],
    hints: ['université de montréal', 'roger-gaudry', 'école polytechnique de montréal'],
  },
  {
    slug: 'uqam', line: 'Université du Québec à Montréal', prefix: 'Université du Québec à ', core: 'Montréal', bilingual: false, label: 'Université du Québec à Montréal',
    places: ['uqam'],
    hints: ['uqam', 'judith-jasmin'],
  },
  {
    slug: 'concordia', line: 'Université Concordia', lineEn: 'Concordia University', prefix: 'Université ', core: 'Concordia', bilingual: true, label: 'Université Concordia',
    places: ['concordia'],
    hints: ['concordia', 'hall building', 'loyola'],
  },
  {
    slug: 'sherbrooke', line: 'Université de Sherbrooke', prefix: 'Université de ', core: 'Sherbrooke', bilingual: false, label: 'Université de Sherbrooke',
    places: ['sherbrooke', 'longueuil'],
    hints: ['université de sherbrooke', 'udes', 'georges-cabana', 'univestrie'],
  },
  {
    slug: 'bishops', line: 'Université Bishop’s', lineEn: 'Bishop’s University', prefix: 'Université ', core: 'Bishop’s', bilingual: true, label: 'Université Bishop’s',
    places: ['bishop'],
    hints: ['bishop'],
  },
  {
    slug: 'uqtr', line: 'Université du Québec à Trois-Rivières', prefix: 'Université du Québec à ', core: 'Trois-Rivières', bilingual: false, label: 'UQTR',
    places: ['uqtr', 'trois-rivières', 'trois-rivieres'],
    hints: ['uqtr', 'trois-rivières', 'trois rivieres'],
  },
  {
    slug: 'uqac', line: 'Université du Québec à Chicoutimi', prefix: 'Université du Québec à ', core: 'Chicoutimi', bilingual: false, label: 'UQAC',
    places: ['uqac', 'chicoutimi'],
    hints: ['uqac', 'chicoutimi'],
  },
  {
    slug: 'uqar', line: 'Université du Québec à Rimouski', prefix: 'Université du Québec à ', core: 'Rimouski', bilingual: false, label: 'UQAR',
    places: ['uqar', 'rimouski'],
    hints: ['uqar', 'rimouski', 'ursulines'],
  },
  {
    slug: 'uqo', line: 'Université du Québec en Outaouais', prefix: 'Université du Québec en ', core: 'Outaouais', bilingual: false, label: 'UQO',
    places: ['uqo', 'outaouais'],
    hints: ['uqo', 'outaouais', 'lucien-brault'],
  },
  {
    slug: 'uqat', line: 'Université du Québec en Abitibi-Témiscamingue', prefix: 'Université du Québec en ', core: 'Abitibi-Témiscamingue', bilingual: false, label: 'UQAT',
    places: ['uqat', 'abitibi', 'rouyn'],
    hints: ['uqat', 'abitibi', 'rouyn', 'premiers peuples'],
  },
  {
    slug: 'teluq', line: 'TÉLUQ', prefix: '', core: 'TÉLUQ', bilingual: false, label: 'TÉLUQ',
    places: ['téluq', 'teluq'],
    hints: ['téluq', 'teluq'],
  },
  {
    slug: 'ets', line: 'École de technologie supérieure', prefix: 'École de ', core: 'technologie supérieure', bilingual: false, label: 'ÉTS',
    places: ['éts', 'ets', 'technologie supérieure'],
    hints: ['technologie superieure', 'technologie supérieure', 'école de technologie'],
  },
  {
    slug: 'enap', line: 'ENAP', prefix: '', core: 'ENAP', bilingual: false, label: 'ENAP',
    places: ['enap'],
    hints: ['enap'],
  },
  {
    slug: 'inrs', line: 'INRS', prefix: '', core: 'INRS', bilingual: false, label: 'INRS',
    places: ['inrs'],
    hints: ['inrs'],
  },
  {
    slug: 'poly', line: 'Polytechnique Montréal', prefix: '', core: 'Polytechnique Montréal', bilingual: false, label: 'Polytechnique Montréal',
    places: ['polytechnique'],
    hints: ['polytechnique'],
  },
  {
    slug: 'hec', line: 'HEC Montréal', prefix: '', core: 'HEC Montréal', bilingual: false, label: 'HEC Montréal',
    places: ['hec'],
    hints: ['hec montréal', 'hec montreal', 'decelles'],
  },
];

const state = {
  format: 'tabloid',
  campus: 'generique',
  lang: 'standard',
  greeting: 'nopub',
  langs: true,
  showUni: true,
  qr: true,
  dpi: DEFAULT_DPI,
  photoId: null,
  photos: [],
  focalX: 0.5,
  focalY: 0.42,
  angle: 0,
  zoom: 0.9,
  photoOpen: false,
};

let lastPhotoImg = null;

const assets = { logo: null, qr: null, translate: null };
const imageCache = new Map();
let previewGen = 0;

function isLocalHost() {
  const h = location.hostname;
  return h === '127.0.0.1' || h === 'localhost' || h === '[::1]';
}

function dpiChoices() {
  return isLocalHost() ? DPI_LAB : DPI_PUBLIC;
}

function outputDpi() {
  return dpiChoices().includes(state.dpi) ? state.dpi : DEFAULT_DPI;
}

/* iPadOS 13+ se présente comme un Mac. Safari plafonne le canevas ~4096 px / 16 Mpx. */
function isAppleTouch() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints) > 1);
}

function maxSafeDpi(fmt) {
  const maxSide = isAppleTouch() ? 4096 : 16384;
  const maxArea = isAppleTouch() ? 16_777_216 : 268_435_456;
  let dpi = 1200;
  while (dpi >= 72) {
    const w = Math.round(fmt.wIn * dpi);
    const h = Math.round(fmt.hIn * dpi);
    if (w <= maxSide && h <= maxSide && w * h <= maxArea) return dpi;
    dpi -= 10;
  }
  return 72;
}

function exportDpi(fmt = FORMATS[state.format]) {
  return Math.min(outputDpi(), maxSafeDpi(fmt));
}

function canvasAllocates(w, h) {
  try {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    if (c.width !== w || c.height !== h) return false;
    const ctx = c.getContext('2d', { alpha: false });
    if (!ctx) return false;
    ctx.fillStyle = '#111111';
    ctx.fillRect(w - 1, h - 1, 1, 1);
    const ok = ctx.getImageData(w - 1, h - 1, 1, 1).data[0] === 0x11;
    c.width = 0;
    c.height = 0;
    return ok;
  } catch {
    return false;
  }
}

function px(fmt, dpi = outputDpi()) {
  return { w: Math.round(fmt.wIn * dpi), h: Math.round(fmt.hIn * dpi) };
}

function campusOf(slug) {
  return CAMPUSES.find((c) => c.slug === slug) || CAMPUSES[0];
}

function fold(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function photoMatches(photo, campus) {
  if (!campus.places) return true;
  const place = fold(photo.place);
  if (place) {
    return campus.places.some((p) => place === fold(p) || place.includes(fold(p)));
  }
  const hay = fold(`${photo.title || ''} ${photo.description || ''}`);
  return (campus.hints || []).some((h) => hay.includes(fold(h)));
}

function fileNameFromUrl(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
  } catch {
    return '';
  }
}

function thumbUrl(photo, width) {
  const name = fileNameFromUrl(photo.url);
  if (!name) return photo.url.split('?')[0];
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${width}`;
}

function printUrl(photo) {
  return (photo.url || '').split('?')[0];
}

function photoKeyId(photo) {
  return photo.id || printUrl(photo);
}

function loadImage(src, cors = true) {
  const key = `${cors ? 'c' : 'n'}:${src}`;
  if (imageCache.has(key)) return imageCache.get(key);
  const job = new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    const t = setTimeout(() => {
      imageCache.delete(key);
      reject(new Error('timeout'));
    }, 14000);
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => {
      clearTimeout(t);
      imageCache.delete(key);
      reject(new Error(`image: ${src}`));
    };
    img.src = src;
  });
  imageCache.set(key, job);
  return job;
}

async function loadFonts() {
  const faces = [
    new FontFace('LR Serif', 'url(../scripts/og-fonts/SourceSerif4Display-Bold.ttf)'),
    new FontFace('LR Sans', 'url(../scripts/og-fonts/Inter-Regular.ttf)'),
    new FontFace('LR Sans Semi', 'url(../scripts/og-fonts/Inter-SemiBold.ttf)'),
    new FontFace('LR Script', 'url(../assets/kit/fonts/Caveat-Bold.ttf)'),
  ];
  await Promise.all(faces.map(async (f) => {
    await f.load();
    document.fonts.add(f);
  }));
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function coverDraw(ctx, img, tw, th, fx = 0.5, fy = 0.42, scale = 0.9, angleDeg = 0) {
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const ang = (angleDeg || 0) * Math.PI / 180;
  const pad = Math.abs(Math.sin(ang)) + Math.abs(Math.cos(ang));
  const dw = tw * pad;
  const dh = th * pad;
  const ratio = dw / dh;
  const cover = clamp(scale, 0.55, 1);
  let cw;
  let ch;
  if (sw / sh > ratio) {
    ch = sh * cover;
    cw = ch * ratio;
  } else {
    cw = sw * cover;
    ch = cw / ratio;
  }
  cw = Math.max(1, Math.min(Math.round(cw), sw));
  ch = Math.max(1, Math.min(Math.round(ch), sh));
  if (cw / ch > ratio) cw = Math.max(1, Math.min(Math.round(ch * ratio), sw));
  else ch = Math.max(1, Math.min(Math.round(cw / ratio), sh));
  const left = Math.max(0, Math.min(Math.round(fx * sw - cw / 2), sw - cw));
  const top = Math.max(0, Math.min(Math.round(fy * sh - ch / 2), sh - ch));
  ctx.save();
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, tw, th);
  ctx.translate(tw / 2, th / 2);
  ctx.rotate(ang);
  ctx.filter = 'saturate(0.52) contrast(1.04)';
  ctx.drawImage(img, left, top, cw, ch, -dw / 2, -dh / 2, dw, dh);
  ctx.filter = 'none';
  ctx.restore();
  ctx.fillStyle = 'rgba(14, 15, 18, 0.58)';
  ctx.fillRect(0, 0, tw, th);
}

function drawRadar(ctx, w, h, cx, cy) {
  const reach = Math.hypot(Math.max(cx, w - cx), Math.max(h - cy, cy));
  ctx.strokeStyle = 'rgba(241, 242, 244, 0.07)';
  ctx.lineWidth = Math.max(1, w / 1600);
  const step = Math.max(48, reach / 9);
  for (let r = step; r <= reach + step; r += step) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(241, 242, 244, 0.05)';
  ctx.lineWidth = Math.max(1, w / 2200);
  const rays = 16;
  for (let i = 0; i < rays; i += 1) {
    const a = (i / rays) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * reach, cy + Math.sin(a) * reach);
    ctx.stroke();
  }
}

function textW(ctx, text) {
  return ctx.measureText(text).width;
}

function wrapWords(ctx, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width <= maxW) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function uniLockupParts(campus, kind) {
  if (!campus || !campus.core) return null;
  if (kind === 'bilingue' && campus.bilingual) {
    return {
      left: campus.prefix != null ? campus.prefix : 'Université ',
      core: campus.core,
      right: ' University',
    };
  }
  return { left: '', core: campus.line || campus.core, right: '' };
}

function fillUniLockup(ctx, parts, y, small, large) {
  const left = parts.left || '';
  const right = parts.right || '';
  const core = parts.core;
  const maxW = ctx.canvas.width * 0.86;
  ctx.fillStyle = INK;
  if (!left && !right) {
    ctx.font = `600 ${large}px "LR Sans Semi"`;
    const lines = wrapWords(ctx, core, maxW);
    let yy = y;
    lines.forEach((line) => {
      yy += fillCentered(ctx, line, yy, INK) + large * 0.12;
    });
    return Math.max(large, yy - y);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 ${small}px "LR Sans"`;
  const wLeft = textW(ctx, left);
  const wRight = textW(ctx, right);
  ctx.font = `600 ${large}px "LR Sans Semi"`;
  const wCore = textW(ctx, core);
  let x = (ctx.canvas.width - (wLeft + wCore + wRight)) / 2;
  const base = y + large * 0.82;
  ctx.font = `400 ${small}px "LR Sans"`;
  ctx.fillText(left, x, base);
  x += wLeft;
  ctx.font = `600 ${large}px "LR Sans Semi"`;
  ctx.fillText(core, x, base);
  x += wCore;
  ctx.font = `400 ${small}px "LR Sans"`;
  ctx.fillText(right, x, base);
  ctx.textBaseline = 'top';
  return large;
}

function wrapJoin(ctx, parts, maxW) {
  const lines = [];
  let cur = '';
  for (const part of parts) {
    const next = cur ? `${cur}  ·  ${part}` : part;
    if (ctx.measureText(next).width <= maxW) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = part;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function fillCentered(ctx, text, y, color) {
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  const w = textW(ctx, text);
  ctx.fillText(text, (ctx.canvas.width - w) / 2, y);
  const m = ctx.measureText(text);
  const h = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0) || parseInt(ctx.font, 10);
  return h;
}

function trackedWidth(ctx, text, size) {
  const extra = size * TRACK;
  let total = 0;
  ctx.font = `700 ${size}px "LR Serif"`;
  for (let i = 0; i < text.length; i += 1) {
    total += ctx.measureText(text[i]).width;
    if (i < text.length - 1) total += extra;
  }
  return total;
}

function fillTracked(ctx, text, y, size, color, xStart) {
  const extra = size * TRACK;
  ctx.font = `700 ${size}px "LR Serif"`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  let x = xStart;
  if (x == null) x = (ctx.canvas.width - trackedWidth(ctx, text, size)) / 2;
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + extra;
  }
  const m = ctx.measureText(text);
  return (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0) || size;
}

function compose(opts) {
  const fmt = FORMATS[opts.format];
  const dpi = Number(opts.dpi) || outputDpi();
  const { w, h } = px(fmt, dpi);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  if (canvas.width !== w || canvas.height !== h) {
    throw new Error(`canevas ${w}×${h} trop grand pour ce navigateur`);
  }
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('canevas 2D indisponible');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const refW = 11 * REF_DPI;
  const refH = 17 * REF_DPI;
  const safe = Math.round(0.45 * REF_DPI * (h / refH));
  const barH = Math.max(28, Math.round(42 * (w / refW)));
  const campus = campusOf(opts.campus);
  const kind = campus.bilingual && opts.lang === 'bilingue' ? 'bilingue' : 'standard';
  const photo = opts.photoImg || null;

  if (photo) {
    coverDraw(
      ctx, photo, w, h,
      opts.focalX ?? 0.5,
      opts.focalY ?? 0.42,
      opts.cropScale ?? 0.9,
      opts.angle ?? 0,
    );
  } else {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
  }

  const credit = photo && opts.credit
    ? `Photo : ${opts.credit}${opts.license ? ` · ${opts.license}` : ''}`
    : '';
  const fit = Math.min(w / refW, h / refH);
  const measure = (text, size) => {
    ctx.font = `400 ${size}px "LR Sans"`;
    const m = ctx.measureText(text);
    return (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0) || size;
  };
  /* Pied : plus lisible à l’impression, toujours sous le slogan / nom d’établissement. */
  const footCap = Math.round(62 * fit);
  const fMark = Math.min(52 * fit, footCap);
  const fSign = Math.min(36 * fit, footCap * 0.62);
  const fLegal = Math.min(28 * fit, footCap * 0.5);
  const fCredit = Math.min(26 * fit, footCap * 0.48);
  const fEn = Math.min(22 * fit, footCap * 0.4);
  const footLogo = Math.min(56 * fit, footCap + 4 * fit);
  const markGap = 12 * fit;
  const legalMax = w - 2 * safe - 160 * fit;
  ctx.font = `400 ${fLegal}px "LR Sans"`;
  const legalLines = wrapWords(ctx, `${INDEP_1} ${INDEP_2}`, legalMax);
  const legalLineH = measure(legalLines[0] || INDEP_1, fLegal);
  ctx.font = `400 ${fEn}px "LR Sans"`;
  const enLines = kind === 'bilingue' ? wrapWords(ctx, INDEP_EN, legalMax) : [];
  const enLineH = enLines.length ? measure(enLines[0], fEn) : 0;
  const legalH = legalLines.length * (legalLineH + 6) - 6
    + (enLines.length ? 8 * fit + enLines.length * (enLineH + 4) - 4 : 0);
  const nameH = measure(NAME_FULL, fSign);
  const creditH = credit ? measure(credit, fCredit) : 0;
  const fLang = Math.min(28 * fit, footCap * 0.5);
  const iconS = Math.min(40 * fit, footCap * 0.7);
  const langFont = `400 ${fLang}px "Noto Sans", "Noto Sans JP", "Noto Sans SC", "Noto Sans TC", "Noto Sans Arabic", "Noto Sans Devanagari", "LR Sans"`;
  ctx.font = langFont;
  const langMax = w - 2 * safe - 80 * fit;
  const langLines = opts.langs ? wrapJoin(ctx, TRANSLATE_LANGS, langMax) : [];
  const langLineH = langLines.length ? measure(langLines[0] || 'Français', fLang) : 0;
  const langsH = opts.langs
    ? iconS + 8 + langLines.length * (langLineH + 5)
    : 0;
  const markH = Math.max(footLogo, fMark);
  const qrIn = fmt.id === 'tabloid' ? 2.25 : 1.65;
  const qrPx = Math.round(qrIn * REF_DPI * fit);
  const qrPad = Math.round(36 * fit);
  const qrSide = qrPx;
  const playTop = barH + 12 * fit;
  const big = Math.round(816 * fit);
  const logoY = playTop + Math.round(700 * fit);
  const qrTop = playTop + Math.round(3680 * fit);
  if (!photo) drawRadar(ctx, w, h, w / 2, logoY + big / 2);

  ctx.fillStyle = PURPLE;
  ctx.fillRect(0, 0, w, barH);

  const fadeTop = Math.max(barH, qrTop - 70 * fit);
  const fade = ctx.createLinearGradient(0, fadeTop, 0, h);
  fade.addColorStop(0, 'rgba(14, 15, 18, 0)');
  fade.addColorStop(0.4, 'rgba(14, 15, 18, 0.22)');
  fade.addColorStop(1, 'rgba(14, 15, 18, 0.72)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, fadeTop, w, h - fadeTop);

  if (opts.qr && assets.qr) {
    const card = qrSide;
    ctx.fillStyle = '#fff';
    ctx.fillRect((w - card) / 2, qrTop, card, card);
    const inner = card - 2 * qrPad;
    ctx.drawImage(assets.qr, (w - inner) / 2, qrTop + qrPad, inner, inner);
  }

  const qrBottom = ((opts.qr && assets.qr) || opts.langs) ? qrTop + qrSide : qrTop;
  const pad = 32 * fit;
  const gMark = 14 * fit;
  const gName = 18 * fit;
  const gLegal = 18 * fit;

  let cy = qrBottom + pad;
  const markW = trackedWidth(ctx, TITLE, fMark);
  const rowW = footLogo + markGap + markW;
  const mx = (w - rowW) / 2;
  if (assets.logo) ctx.drawImage(assets.logo, mx, cy + (markH - footLogo) / 2, footLogo, footLogo);
  fillTracked(ctx, TITLE, cy + (markH - fMark) / 2, fMark, INK, mx + footLogo + markGap);
  cy += markH + gMark;
  ctx.font = `400 ${fSign}px "LR Sans"`;
  fillCentered(ctx, NAME_FULL, cy, SOFT);
  cy += nameH + gName;
  const legalStart = cy;
  legalLines.forEach((line) => {
    ctx.font = `400 ${fLegal}px "LR Sans"`;
    fillCentered(ctx, line, cy, SOFT);
    cy += legalLineH + 6;
  });
  enLines.forEach((line, i) => {
    if (i === 0) cy += 2 * fit;
    ctx.font = `400 ${fEn}px "LR Sans"`;
    fillCentered(ctx, line, cy, SOFT);
    cy += enLineH + 4;
  });
  cy = legalStart + legalH + (langsH ? gLegal : 0);
  if (opts.langs && langsH) {
    if (assets.translate) {
      ctx.drawImage(assets.translate, (w - iconS) / 2, cy, iconS, iconS);
    }
    let ly = cy + iconS + 8;
    ctx.font = langFont;
    langLines.forEach((line) => {
      fillCentered(ctx, line, ly, SOFT);
      ly += langLineH + 5;
    });
    cy = ly;
  }
  if (credit) {
    const creditY = cy + (h - cy - creditH) / 2;
    ctx.font = `400 ${fCredit}px "LR Sans"`;
    fillCentered(ctx, credit, creditY, SOFT);
  }

  if (assets.logo) ctx.drawImage(assets.logo, (w - big) / 2, logoY, big, big);
  const titleSize = Math.round(226 * fit);
  const titleY = playTop + Math.round(1630 * fit);
  fillTracked(ctx, TITLE, titleY, titleSize, INK);
  let y = titleY + titleSize + Math.round(109 * fit);
  const maxW = w - 2 * safe - 80;
  let sloganSize = Math.round(74 * fit);
  ctx.font = `400 ${sloganSize}px "LR Sans"`;
  while (textW(ctx, SLOGAN) > maxW && sloganSize > 22) {
    sloganSize -= 1;
    ctx.font = `400 ${sloganSize}px "LR Sans"`;
  }
  const enSize = Math.max(14, Math.floor(sloganSize * 0.48));
  const uniSize = Math.round(70 * fit);
  const uniCore = Math.round(uniSize * 1.22);
  const gapBlock = Math.round(86 * fit);
  const gapLang = Math.round(47 * fit);
  ctx.font = `400 ${sloganSize}px "LR Sans"`;
  y += fillCentered(ctx, SLOGAN, y, INK) + (kind === 'bilingue' ? gapLang : gapBlock);
  if (kind === 'bilingue') {
    ctx.font = `400 ${enSize}px "LR Sans"`;
    const enLines = wrapWords(ctx, SLOGAN_EN, maxW);
    enLines.forEach((line, i) => {
      const extra = i === enLines.length - 1 ? gapBlock : Math.round(enSize * 0.25);
      y += fillCentered(ctx, line, y, SOFT) + extra;
    });
  }
  if (opts.showUni !== false) {
    const uniParts = uniLockupParts(campus, kind);
    if (uniParts) {
      y += fillUniLockup(ctx, uniParts, y, uniSize, uniCore) + gapBlock;
    }
  }
  const greet = GREETINGS[opts.greeting];
  if (greet) {
    const biGreet = kind === 'bilingue' && GREETINGS_EN[opts.greeting];
    const gSize = Math.round((biGreet ? 156 : 187) * fit);
    y += Math.round(39 * fit);
    ctx.save();
    ctx.translate(w / 2, y + gSize * 0.15);
    ctx.rotate((-8 * Math.PI) / 180);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `700 ${gSize}px "LR Script"`;
    ctx.fillStyle = INK;
    ctx.fillText(greet, 0, 0);
    if (biGreet) {
      ctx.font = `700 ${Math.round(gSize * 0.5)}px "LR Script"`;
      ctx.fillStyle = SOFT;
      ctx.fillText(GREETINGS_EN[opts.greeting], 0, gSize * 0.95);
    }
    ctx.restore();
  }

  return canvas;
}

function isCampusPhoto(p) {
  return p.campus === true || (Array.isArray(p.tags) && p.tags.includes('campus'));
}

function filteredPhotos() {
  const campus = campusOf(state.campus);
  const pool = campus.places
    ? state.photos.filter((p) => isCampusPhoto(p) && photoMatches(p, campus))
    : state.photos;
  return pool.filter(printWorthy);
}

function printWorthy(p) {
  const w = p.width || 0;
  const h = p.height || 0;
  return Math.max(w, h) >= 1400 && Math.min(w, h) >= 800;
}

function currentPhoto() {
  if (!state.photoId) return null;
  return state.photos.find((p) => photoKeyId(p) === state.photoId) || null;
}

function renderChoices() {
  const photos = filteredPhotos();
  const grid = document.getElementById('photo-grid');
  const moreBtn = document.getElementById('photo-more');
  const selectedStillValid = state.photoId && photos.some((p) => photoKeyId(p) === state.photoId);
  if (!selectedStillValid) state.photoId = null;
  const previewN = 5;
  const selectedIdx = state.photoId ? photos.findIndex((p) => photoKeyId(p) === state.photoId) : -1;
  if (selectedIdx >= previewN) state.photoOpen = true;
  const shown = state.photoOpen ? photos : photos.slice(0, previewN);
  const items = [{ id: '', title: 'Fond radar' }, ...shown];
  grid.innerHTML = items.map((p) => {
    const id = p.id === '' ? '' : photoKeyId(p);
    const on = (id || null) === state.photoId || (!id && !state.photoId);
    if (!id) {
      return `<label class="thumb-radar"><input type="radio" name="photo" value="" ${on ? 'checked' : ''}><span class="solid solid--radar" title="Fond radar"><img src="../assets/icon.svg" width="40" height="40" alt=""><span>Fond radar</span></span></label>`;
    }
    return `<label title="${escapeAttr(p.title || '')}"><input type="radio" name="photo" value="${escapeAttr(id)}" ${on ? 'checked' : ''}><img src="${thumbUrl(p, 280)}" width="92" height="142" alt="" loading="lazy"></label>`;
  }).join('');
  const hiddenN = photos.length - shown.length;
  if (photos.length > previewN) {
    moreBtn.hidden = false;
    moreBtn.textContent = state.photoOpen
      ? 'Voir moins'
      : `Voir plus de photos (${hiddenN})`;
  } else {
    moreBtn.hidden = true;
  }
  const n = photos.length;
  document.getElementById('photo-meta').textContent = state.campus === 'generique'
    ? `${n} photos de toute la banque`
    : `${n} photos pour ${campusOf(state.campus).label}`;
  syncCropUi();
}

function escapeAttr(s) {
  return String(s).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
}

function specLine() {
  const fmt = FORMATS[state.format];
  const dpi = exportDpi(fmt);
  const { w, h } = px(fmt, dpi);
  return `${fmt.label} · ${w} × ${h} px · ${dpi} dpi · PDF`;
}

function recipeLine() {
  const bits = [
    FORMATS[state.format].label,
    campusOf(state.campus).label,
    state.lang === 'bilingue' ? 'Bilingue' : 'Français',
  ];
  if (state.greeting !== 'none' && GREETINGS[state.greeting]) bits.push(GREETINGS[state.greeting]);
  if (state.qr) bits.push('QR');
  const photo = currentPhoto();
  bits.push(photo ? (photo.title || 'Photo') : 'Fond radar');
  return bits.join(' · ');
}

function previewFit() {
  const pane = document.getElementById('preview-pane');
  const crop = document.getElementById('crop-tools');
  const pad = 8;
  const cropW = crop && !crop.hidden ? crop.getBoundingClientRect().width + 16 : 0;
  const maxW = Math.max(160, (pane?.clientWidth || window.innerWidth * 0.45) - cropW - pad * 2);
  const maxH = Math.max(220, (pane?.clientHeight || window.innerHeight - 72) - pad);
  return { maxW, maxH };
}

function paintPreview(img, photo) {
  const out = document.getElementById('preview');
  const canvas = compose({
    format: state.format,
    campus: state.campus,
    lang: state.lang,
    greeting: state.greeting,
    langs: state.langs,
    showUni: state.showUni,
    qr: state.qr,
    dpi: PREVIEW_DPI,
    photoImg: img || null,
    credit: photo?.credit,
    license: photo?.license,
    focalX: state.focalX,
    focalY: state.focalY,
    cropScale: state.zoom,
    angle: state.angle,
  });
  const { maxW, maxH } = previewFit();
  const cssScale = Math.min(maxW / canvas.width, maxH / canvas.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = Math.max(1, Math.round(canvas.width * cssScale));
  const cssH = Math.max(1, Math.round(canvas.height * cssScale));
  const view = document.createElement('canvas');
  view.width = Math.max(1, Math.round(cssW * dpr));
  view.height = Math.max(1, Math.round(cssH * dpr));
  view.style.width = `${cssW}px`;
  view.style.height = `${cssH}px`;
  const vctx = view.getContext('2d', { alpha: false });
  vctx.imageSmoothingEnabled = true;
  vctx.imageSmoothingQuality = 'high';
  vctx.drawImage(canvas, 0, 0, view.width, view.height);
  out.replaceChildren(view);
}

async function preview() {
  const status = document.getElementById('status');
  const recipe = document.getElementById('recipe');
  const frame = document.getElementById('preview');
  const gen = ++previewGen;
  const photo = currentPhoto();
  if (recipe) recipe.textContent = recipeLine();
  frame.classList.add('is-busy');
  try {
    paintPreview(null, photo);
    if (photo) {
      const img = await loadImage(printUrl(photo), true);
      if (gen !== previewGen) return;
      lastPhotoImg = img;
      paintPreview(img, photo);
    }
    if (gen !== previewGen) return;
    status.innerHTML = `<strong>${specLine()}</strong>`;
  } catch (err) {
    if (gen !== previewGen) return;
    paintPreview(null, null);
    status.textContent = `Photo indisponible — fond radar. ${err.message}`;
  } finally {
    if (gen === previewGen) frame.classList.remove('is-busy');
  }
}

function jpegToPdfBlob(jpeg, imgW, imgH, wIn, hIn) {
  const pw = wIn * 72;
  const ph = hIn * 72;
  const enc = (s) => new TextEncoder().encode(s);
  const chunks = [];
  const offs = [0];
  let pos = 0;
  const push = (u8) => { chunks.push(u8); pos += u8.length; };
  const pushStr = (s) => push(enc(s));
  pushStr('%PDF-1.4\n');
  const start = () => { offs.push(pos); };
  start();
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  start();
  pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  start();
  pushStr(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`);
  const stream = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q\n`;
  start();
  pushStr(`4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`);
  start();
  pushStr(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  pushStr('\nendstream\nendobj\n');
  const xrefPos = pos;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i += 1) {
    xref += `${String(offs[i]).padStart(10, '0')} 00000 n \n`;
  }
  pushStr(xref);
  pushStr(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return new Blob([out], { type: 'application/pdf' });
}

async function saveBlob(blob, name) {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  if (typeof navigator.canShare === 'function') {
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return 'share';
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return 'abort';
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    if (isAppleTouch()) {
      const opened = window.open(url, '_blank');
      if (!opened) {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return 'link';
}

async function jpegOfCanvas(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG'))), 'image/jpeg', 0.95);
  });
}

async function downloadPrint(kind = 'pdf') {
  const buttons = [document.getElementById('dl'), document.getElementById('dl-jpg'), document.getElementById('dl-bottom'), document.getElementById('dl-jpg-bottom')];
  const status = document.getElementById('status');
  buttons.forEach((b) => { if (b) b.disabled = true; });
  status.textContent = kind === 'pdf' ? 'Composition du PDF…' : 'Composition du JPEG…';
  try {
    const fmt = FORMATS[state.format];
    const wanted = outputDpi();
    const photo = currentPhoto();
    let img = null;
    if (photo) img = await loadImage(printUrl(photo), true);
    let dpi = exportDpi(fmt);
    let jpegBlob = null;
    let w = 0;
    let h = 0;
    let lastErr = null;
    while (dpi >= 120) {
      ({ w, h } = px(fmt, dpi));
      if (!canvasAllocates(w, h)) {
        lastErr = new Error(`canevas ${w}×${h} trop grand pour ce navigateur`);
        dpi -= 20;
        continue;
      }
      try {
        const canvas = compose({
          format: state.format,
          campus: state.campus,
          lang: state.lang,
          greeting: state.greeting,
          langs: state.langs,
          showUni: state.showUni,
          qr: state.qr,
          dpi,
          photoImg: img,
          credit: photo?.credit,
          license: photo?.license,
          focalX: state.focalX,
          focalY: state.focalY,
          cropScale: state.zoom,
          angle: state.angle,
        });
        if (canvas.width !== w || canvas.height !== h) {
          throw new Error(`dimensions ${canvas.width}×${canvas.height}, attendu ${w}×${h}`);
        }
        jpegBlob = await jpegOfCanvas(canvas);
        break;
      } catch (err) {
        lastErr = err;
        dpi -= 20;
      }
    }
    if (!jpegBlob) {
      throw lastErr || new Error('mémoire insuffisante pour composer l’affiche');
    }
    const campus = campusOf(state.campus);
    const lang = state.lang === 'bilingue' ? 'bilingue' : 'fr';
    const uni = state.showUni ? '' : '-sans-etab';
    const qr = state.qr ? '-qr' : '';
    const greet = state.greeting !== 'none' ? `-${state.greeting}` : '';
    const langs = state.langs ? '-langues' : '';
    const stem = `le-radar-affiche-${campus.slug}-${fmt.file}-${lang}${uni}${greet}${langs}${qr}-${dpi}dpi`;
    let blob;
    let name;
    if (kind === 'pdf') {
      const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
      blob = jpegToPdfBlob(jpeg, w, h, fmt.wIn, fmt.hIn);
      name = `${stem}.pdf`;
    } else {
      blob = jpegBlob;
      name = `${stem}.jpg`;
    }
    const how = await saveBlob(blob, name);
    if (how === 'abort') {
      status.textContent = 'Téléchargement annulé.';
      return;
    }
    const mb = (blob.size / 1_048_576).toFixed(1);
    const limited = dpi < wanted
      ? ` Safari sur tablette limite la mémoire : ${dpi} dpi au lieu de ${wanted}.`
      : '';
    const shareHint = how === 'share' ? ' Choisissez Enregistrer dans Fichiers (ou Imprimer).' : '';
    status.innerHTML = `Fichier <strong>${name}</strong> · ${fmt.label} · ${dpi} dpi · ${mb} Mo.${limited}${shareHint} Imprimez à 100 %, sans « ajuster à la page ».`;
  } catch (err) {
    status.textContent = `Téléchargement impossible : ${err.message}`;
  } finally {
    buttons.forEach((b) => { if (b) b.disabled = false; });
  }
}

function syncDpiLab() {
  const lab = document.getElementById('dpi-1200-choice');
  const hint = document.getElementById('dpi-hint');
  const local = isLocalHost();
  if (lab) lab.hidden = !local;
  if (!local && state.dpi === 1200) state.dpi = DEFAULT_DPI;
  if (hint) {
    const fmt = FORMATS[state.format];
    const cap = maxSafeDpi(fmt);
    if (isAppleTouch() && cap < outputDpi()) {
      hint.textContent = `Safari sur iPad plafonne à ${cap} dpi pour ${fmt.label} (mémoire du canevas).`;
    } else if (local) {
      hint.textContent = '600 dpi par défaut. 300 pour un babillard, 1200 pour un tirage photo.';
    } else {
      hint.textContent = '600 dpi par défaut. 300 pour un babillard.';
    }
  }
}

function syncDpiLabels() {
  const dpi = exportDpi();
  for (const id of ['dl', 'dl-bottom']) {
    const el = document.getElementById(id);
    if (el) el.textContent = `PDF ${dpi} dpi`;
  }
  for (const id of ['dl-jpg', 'dl-jpg-bottom']) {
    const el = document.getElementById(id);
    if (el) el.textContent = `JPEG ${dpi} dpi`;
  }
}

function syncLangChoice() {
  const campus = campusOf(state.campus);
  const allowed = campus.bilingual;
  const bi = document.querySelector('label:has(input[name="lang"][value="bilingue"])');
  if (bi) bi.hidden = !allowed;
  if (!allowed && state.lang === 'bilingue') {
    state.lang = 'standard';
    const fr = document.querySelector('input[name="lang"][value="standard"]');
    if (fr) fr.checked = true;
  }
  const uniBox = document.getElementById('uni-toggle');
  if (uniBox) uniBox.hidden = !campus.line;
}

function resetCrop(photo) {
  state.focalX = 0.5;
  state.focalY = typeof photo?.focalY === 'number' ? photo.focalY : 0.42;
  state.angle = 0;
  state.zoom = 0.9;
  lastPhotoImg = null;
  syncCropUi();
}

function syncCropUi() {
  const box = document.getElementById('crop-tools');
  const pane = document.getElementById('preview-pane');
  if (!box) return;
  const on = Boolean(state.photoId);
  box.hidden = !on;
  if (pane) pane.classList.toggle('has-crop', on);
  if (!on) return;
  const x = document.getElementById('focal-x');
  const y = document.getElementById('focal-y');
  const a = document.getElementById('photo-angle');
  const z = document.getElementById('photo-zoom');
  if (x) x.value = String(Math.round(state.focalX * 100));
  if (y) y.value = String(Math.round(state.focalY * 100));
  if (a) a.value = String(state.angle);
  if (z) z.value = String(Math.round(state.zoom * 100));
}

function applyQuery() {
  let q;
  try { q = new URLSearchParams(location.search); } catch { return; }
  const campus = q.get('campus');
  if (campus && CAMPUSES.some((c) => c.slug === campus)) {
    state.campus = campus;
    const input = document.querySelector(`input[name="campus"][value="${campus}"]`);
    if (input) input.checked = true;
  }
  syncGenericLangs();
}

function syncGenericLangs() {
  if (state.campus !== 'generique') return;
  state.langs = true;
  const oui = document.querySelector('input[name="langs"][value="oui"]');
  if (oui) oui.checked = true;
}

function applyChoice(name, value) {
  if (name === 'format') {
    state.format = value;
    syncDpiLab();
    syncDpiLabels();
  }
  if (name === 'dpi') {
    const n = Number(value);
    state.dpi = dpiChoices().includes(n) ? n : DEFAULT_DPI;
    syncDpiLab();
    syncDpiLabels();
  }
  if (name === 'campus') {
    state.campus = value;
    state.photoOpen = false;
    syncGenericLangs();
    syncLangChoice();
    renderChoices();
  }
  if (name === 'lang') state.lang = value;
  if (name === 'qr') state.qr = value === 'oui';
  if (name === 'langs') state.langs = value === 'oui';
  if (name === 'showUni') state.showUni = value === 'oui';
  if (name === 'photo') {
    state.photoId = value || null;
    resetCrop(currentPhoto());
  }
  preview();
}

function bind() {
  document.getElementById('form').addEventListener('change', (ev) => {
    const t = ev.target;
    if (!t.name) return;
    if (t.name === 'greeting') {
      state.greeting = t.value;
      preview();
      return;
    }
    applyChoice(t.name, t.value);
  });
  document.getElementById('photo-grid').addEventListener('click', (ev) => {
    const label = ev.target.closest('label');
    if (!label) return;
    const input = label.querySelector('input[name="photo"]');
    if (!input) return;
    input.checked = true;
    applyChoice('photo', input.value || null);
  });
  ['focal-x', 'focal-y', 'photo-angle', 'photo-zoom'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      if (id === 'focal-x') state.focalX = Number(el.value) / 100;
      if (id === 'focal-y') state.focalY = Number(el.value) / 100;
      if (id === 'photo-angle') state.angle = Number(el.value);
      if (id === 'photo-zoom') state.zoom = Number(el.value) / 100;
      if (lastPhotoImg) paintPreview(lastPhotoImg, currentPhoto());
      else preview();
    });
  });
  document.getElementById('crop-reset').addEventListener('click', () => {
    resetCrop(currentPhoto());
    if (lastPhotoImg) paintPreview(lastPhotoImg, currentPhoto());
    else preview();
  });
  const frame = document.getElementById('preview');
  let drag = null;
  frame.addEventListener('pointerdown', (ev) => {
    if (!currentPhoto()) return;
    drag = { x: ev.clientX, y: ev.clientY, fx: state.focalX, fy: state.focalY };
    frame.setPointerCapture(ev.pointerId);
  });
  frame.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const box = frame.getBoundingClientRect();
    state.focalX = clamp(drag.fx - (ev.clientX - drag.x) / box.width, 0, 1);
    state.focalY = clamp(drag.fy - (ev.clientY - drag.y) / box.height, 0, 1);
    syncCropUi();
    if (lastPhotoImg) paintPreview(lastPhotoImg, currentPhoto());
  });
  frame.addEventListener('pointerup', () => { drag = null; });
  frame.addEventListener('pointercancel', () => { drag = null; });
  document.getElementById('photo-more').addEventListener('click', () => {
    state.photoOpen = !state.photoOpen;
    renderChoices();
  });
  document.getElementById('dl').addEventListener('click', () => downloadPrint('pdf'));
  document.getElementById('dl-jpg').addEventListener('click', () => downloadPrint('jpeg'));
  document.getElementById('dl-bottom').addEventListener('click', () => downloadPrint('pdf'));
  document.getElementById('dl-jpg-bottom').addEventListener('click', () => downloadPrint('jpeg'));
  const pane = document.getElementById('preview-pane');
  let fitTimer = 0;
  const refit = () => {
    if (!previewGen) return;
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => {
      if (lastPhotoImg) paintPreview(lastPhotoImg, currentPhoto());
      else paintPreview(null, currentPhoto());
    }, 80);
  };
  if (pane && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(refit).observe(pane);
  } else {
    window.addEventListener('resize', refit);
  }
}

async function main() {
  bind();
  applyQuery();
  syncDpiLab();
  syncDpiLabels();
  syncLangChoice();
  await loadFonts();
  await document.fonts.ready;
  assets.logo = await loadImage('../assets/icon.svg', false);
  assets.qr = await loadImage('../assets/kit/qr-le-radar.svg', false);
  assets.translate = await loadImage('../assets/kit/translate-mark.svg?v=regular', false);
  const [bank, rejected] = await Promise.all([
    fetch('../data/photo-bank.json').then((r) => r.json()),
    fetch('../data/quebec-backgrounds-rejected.json').then((r) => r.json()).catch(() => ({ entries: [] })),
  ]);
  const banned = new Set();
  for (const e of rejected.entries || []) {
    if (e.url) banned.add(String(e.url).split('?')[0]);
    for (const f of e.fragments || []) banned.add(String(f));
  }
  state.photos = (bank.photos || []).filter((p) => {
    if (!p.url || !p.width || !p.height) return false;
    const url = String(p.url).split('?')[0];
    const file = fileNameFromUrl(p.url);
    if (banned.has(url) || banned.has(p.id) || (file && banned.has(file))) return false;
    return true;
  });
  renderChoices();
  await preview();
}

main().catch((err) => {
  document.getElementById('status').textContent = err.message;
});

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
  rentree: 'Bonne rentrée !',
  'mi-session': 'Courage — mi-session !',
  motivation: 'Tu vas y arriver !',
  'fin-session': 'Bonne fin de session !',
  relache: 'Bonne relâche !',
  'action-grace': 'Bonne Action de grâce !',
  verite: 'Vérité et réconciliation',
  souvenir: 'Souvenons-nous',
  fetes: 'Joyeuses Fêtes !',
  annee: 'Bonne année !',
  paques: 'Joyeuses Pâques !',
  patriotes: 'Journée des Patriotes',
  'saint-jean': 'Bonne Saint-Jean !',
  canada: 'Bonne fête du Canada !',
  nopub: 'Pas de publicité',
  gpl: 'Code libre GPL 2.0',
  gratuit: 'Gratuit, pour toujours',
  independant: 'Indépendant',
  ncompte: 'Sans compte à créer',
};

const GREETINGS_EN = {
  rentree: 'Have a great start!',
  'mi-session': 'You’ve got this — midterms!',
  motivation: 'You’ve got this!',
  'fin-session': 'Good luck with finals!',
  relache: 'Enjoy the break!',
  'action-grace': 'Happy Thanksgiving!',
  verite: 'Truth and Reconciliation',
  souvenir: 'Lest we forget',
  fetes: 'Happy Holidays!',
  annee: 'Happy New Year!',
  paques: 'Happy Easter!',
  patriotes: 'Patriots’ Day',
  'saint-jean': 'Happy Fête nationale!',
  canada: 'Happy Canada Day!',
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
    hints: [
      'université laval', 'adrien-pouliot', 'alphonse-marie-parent', 'biermans',
      'ernest-lemieux', 'agathe-lacerte', 'pavillon dkn', 'casault', 'palasis',
      'bonenfant', 'grand axe', 'vandry', 'vachon', 'desjardins', 'marchand',
      'optique', 'pavillon de l’est', 'peps', 'médecine dentaire', 'envirotron',
      'savard', 'kruger', 'de sève', 'lapointe', 'sciences de l’éducation',
      'pollack', 'comtois', 'laurentienne', 'abitibi-price', 'institut nordique',
    ],
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
  greeting: 'none',
  langs: true,
  showUni: true,
  qr: true,
  dpi: DEFAULT_DPI,
  photoId: null,
  photoHint: null,
  photos: [],
  focalX: 0.5,
  focalY: 0.42,
  angle: 0,
  zoom: 0.9,
  photoOpen: false,
  uploads: [],
  model: 'campus',
  layout: 'classique',
  uneCampus: 'toutes',
  uneArticles: [],
  uneBriefs: [],
  uneSidebars: null,
  uneStatus: '',
};

let lastPhotoImg = null;
let uploadSeq = 0;

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

function mustTile(w, h) {
  if (isAppleTouch()) {
    const maxSide = 4096;
    const maxArea = 16_777_216;
    if (w > maxSide || h > maxSide || w * h > maxArea) return true;
  }
  return !canvasAllocates(w, h);
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

function isLocalPhoto(photo) {
  return !!(photo && (photo.local === true || /^(blob|data):/i.test(String(photo.url || ''))));
}

function thumbUrl(photo, width) {
  if (isLocalPhoto(photo)) return photo.url;
  const name = fileNameFromUrl(photo.url);
  if (!name) return photo.url.split('?')[0];
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${width}`;
}

function printUrl(photo) {
  if (isLocalPhoto(photo)) return photo.url;
  return (photo.url || '').split('?')[0];
}

function photoKeyId(photo) {
  return photo.id || printUrl(photo);
}

function loadImage(src, cors = true) {
  if (/^(blob|data):/i.test(src)) cors = false;
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

/* Noto Sans Regular (400) auto-hébergé, sous-ensemble des endonymes (assets/kit/fonts/langs/). */
const LANG_FONT_FILES = [
  ['Noto Sans', 'noto-sans.woff2'],
  ['Noto Sans Canadian Aboriginal', 'noto-sans-canadian-aboriginal.woff2'],
  ['Noto Sans Ethiopic', 'noto-sans-ethiopic.woff2'],
  ['Noto Sans Arabic', 'noto-sans-arabic.woff2'],
  ['Noto Sans Bengali', 'noto-sans-bengali.woff2'],
  ['Noto Sans Gujarati', 'noto-sans-gujarati.woff2'],
  ['Noto Sans Hebrew', 'noto-sans-hebrew.woff2'],
  ['Noto Sans Devanagari', 'noto-sans-devanagari.woff2'],
  ['Noto Sans JP', 'noto-sans-jp.woff2'],
  ['Noto Sans Kannada', 'noto-sans-kannada.woff2'],
  ['Noto Sans KR', 'noto-sans-kr.woff2'],
  ['Noto Sans Malayalam', 'noto-sans-malayalam.woff2'],
  ['Noto Sans Gurmukhi', 'noto-sans-gurmukhi.woff2'],
  ['Noto Sans Tamil', 'noto-sans-tamil.woff2'],
  ['Noto Sans Telugu', 'noto-sans-telugu.woff2'],
  ['Noto Sans Thai', 'noto-sans-thai.woff2'],
  ['Noto Sans SC', 'noto-sans-sc.woff2'],
  ['Noto Sans TC', 'noto-sans-tc.woff2'],
];
const LANG_FONT_FAMILIES = LANG_FONT_FILES.map(([family]) => family).concat('LR Sans');
function langTypeface(size) {
  return `400 ${size}px ${LANG_FONT_FAMILIES.map((family) => `"${family}"`).join(', ')}`;
}

async function loadFonts() {
  const faces = [
    new FontFace('LR Serif', 'url(../scripts/og-fonts/SourceSerif4Display-Bold.ttf)'),
    new FontFace('LR Sans', 'url(../scripts/og-fonts/Inter-Regular.ttf)'),
    new FontFace('LR Sans Semi', 'url(../scripts/og-fonts/Inter-SemiBold.ttf)'),
    new FontFace('LR Script', 'url(../assets/kit/fonts/Caveat-Bold.ttf)'),
    ...LANG_FONT_FILES.map(([family, file]) => new FontFace(
      family,
      `url(../assets/kit/fonts/langs/${file})`,
      { weight: '400', style: 'normal' },
    )),
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

function coverPhoto(ctx, img, x, y, tw, th, fx = 0.5, fy = 0.5) {
  if (!img || tw <= 0 || th <= 0) return;
  const sw = img.naturalWidth || img.width || 0;
  const sh = img.naturalHeight || img.height || 0;
  if (!sw || !sh) return;
  const ratio = tw / th;
  let cw;
  let ch;
  if (sw / sh > ratio) {
    ch = sh;
    cw = ch * ratio;
  } else {
    cw = sw;
    ch = cw / ratio;
  }
  cw = Math.max(1, Math.min(cw, sw));
  ch = Math.max(1, Math.min(ch, sh));
  const left = Math.max(0, Math.min(fx * sw - cw / 2, sw - cw));
  const top = Math.max(0, Math.min(fy * sh - ch / 2, sh - ch));
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, tw, th);
  ctx.clip();
  ctx.drawImage(img, left, top, cw, ch, x, y, tw, th);
  ctx.restore();
}

function roundedRectPath(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function frostedRect(ctx, x, y, w, h, r, {
  fill = 'rgba(255, 252, 247, 0.78)',
  stroke = 'rgba(255, 255, 255, 0.62)',
  blur = 16,
} = {}) {
  if (w < 2 || h < 2) return;
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.min(ctx.canvas.width - sx, Math.ceil(w + (x - sx)));
  const sh = Math.min(ctx.canvas.height - sy, Math.ceil(h + (y - sy)));
  if (sw > 2 && sh > 2) {
    try {
      const snap = ctx.getImageData(sx, sy, sw, sh);
      const tmp = document.createElement('canvas');
      tmp.width = sw;
      tmp.height = sh;
      tmp.getContext('2d').putImageData(snap, 0, 0);
      const scale = 0.25;
      const off = document.createElement('canvas');
      off.width = Math.max(1, Math.round(sw * scale));
      off.height = Math.max(1, Math.round(sh * scale));
      const octx = off.getContext('2d');
      octx.imageSmoothingEnabled = true;
      octx.drawImage(tmp, 0, 0, off.width, off.height);
      ctx.save();
      roundedRectPath(ctx, x, y, w, h, r);
      ctx.clip();
      ctx.filter = `blur(${blur}px)`;
      ctx.drawImage(off, sx, sy, sw, sh);
      ctx.filter = 'none';
      ctx.restore();
    } catch {
      /* canevas souillé ou cliché impossible : le voile opaque suffit */
    }
  }
  ctx.save();
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.004);
  ctx.stroke();
  ctx.restore();
}

function drawQrCode(ctx, x, y, size, text) {
  const api = (typeof qrcodegen !== 'undefined' && qrcodegen.QrCode) ? qrcodegen.QrCode : null;
  if (!api || !text || size < 8) return;
  const qr = api.encodeText(String(text), api.Ecc.MEDIUM);
  const n = qr.size;
  const quiet = 2;
  const dim = n + quiet * 2;
  const off = document.createElement('canvas');
  off.width = dim;
  off.height = dim;
  const octx = off.getContext('2d', { alpha: false });
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, dim, dim);
  octx.fillStyle = '#111111';
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      if (qr.getModule(col, row)) octx.fillRect(col + quiet, row + quiet, 1, 1);
    }
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, x, y, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}

function frontInk() {
  return {
    paper: '#F4F0E6',
    ink: '#1A1917',
    mute: '#5E5A54',
    rule: '#C9C2B4',
    photoBg: '#E4DED1',
  };
}

function posterTodayYmd() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function posterClock(time) {
  const raw = String(time || '').trim();
  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?/);
  if (!m) return raw.replace(':', ' h ');
  const h = String(Number(m[1]));
  const min = m[2] && m[2] !== '00' ? ` h ${m[2]}` : ' h';
  return `${h}${min}`;
}

function pickPosterRadio(nowplaying, radios, campus, limit = 3) {
  const stations = nowplaying && nowplaying.stations;
  if (!stations) return [];
  const list = Array.isArray(stations)
    ? stations
    : Object.keys(stations).map((id) => ({ id, ...stations[id] }));
  const radioMeta = new Map((radios || []).map((r) => [r.id, r]));
  const rows = [];
  for (const st of list) {
    const meta = radioMeta.get(st.id) || {};
    const inst = meta.institution || '';
    if (campus && !itemMatchesCampusPoster({ institution: inst }, campus)) continue;
    const current = st.current || null;
    if (!current || !current.title) continue;
    const when = [posterClock(current.start), posterClock(current.end)].filter(Boolean).join('–');
    rows.push({
      kicker: st.name || meta.name || st.id,
      line: current.title,
      meta: when,
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

function itemMatchesCampusPoster(item, campus) {
  const Front = typeof RadarMagazineFrontPage !== 'undefined' ? RadarMagazineFrontPage : null;
  if (Front && typeof Front.itemMatchesCampus === 'function') return Front.itemMatchesCampus(item, campus);
  return !campus;
}

function pickPosterSports(masthead, campus, limit = 3) {
  const teams = masthead && masthead.teams;
  if (!teams || typeof teams !== 'object') return [];
  const today = posterTodayYmd();
  const upcoming = [];
  const results = [];
  const seen = new Set();
  Object.values(teams).forEach((team) => {
    if (!team) return;
    const inst = team.institutionName || team.institutionLabel || team.fullName || team.name || '';
    if (campus && !itemMatchesCampusPoster({ institution: inst }, campus)) return;
    const sport = team.sportLabel || team.sport || '';
    const name = team.name || team.fullName || '';
    const uniBoost = team.sector === 'universitaire' ? 0 : 1;
    (team.nextGames || []).forEach((game) => {
      const id = game.gameId || `${name}-${game.date}-${game.opponent}`;
      if (seen.has(id) || !game.date) return;
      seen.add(id);
      const vs = game.opponentNickname || game.opponent || game.opponentFullName || '';
      const verb = game.home ? 'reçoit' : 'visite';
      upcoming.push({
        sort: `${uniBoost}-${game.date}-${game.time || ''}`,
        today: game.date === today,
        kicker: sport,
        line: `${name} ${verb} ${vs}`,
        meta: [game.date === today ? 'aujourd’hui' : (typeof RadarMagazineFrontPage !== 'undefined' && RadarMagazineFrontPage.frDate ? RadarMagazineFrontPage.frDate(`${game.date}T12:00:00`) : ''), posterClock(game.time)].filter(Boolean).join(' · '),
      });
    });
    (team.results || []).forEach((game) => {
      const id = `r-${game.gameId || `${name}-${game.date}`}`;
      if (seen.has(id) || game.scoreFor == null || game.scoreAgainst == null) return;
      seen.add(id);
      results.push({
        sort: `${uniBoost}-${game.date}`,
        kicker: sport,
        line: `${name} ${game.scoreFor}–${game.scoreAgainst} ${game.opponentNickname || game.opponent || ''}`,
        meta: typeof RadarMagazineFrontPage !== 'undefined' && RadarMagazineFrontPage.frDate
          ? RadarMagazineFrontPage.frDate(`${game.date}T12:00:00`)
          : game.date,
      });
    });
  });
  upcoming.sort((a, b) => {
    if (a.today !== b.today) return a.today ? -1 : 1;
    return String(a.sort).localeCompare(String(b.sort));
  });
  results.sort((a, b) => String(b.sort).localeCompare(String(a.sort)));
  const out = [...upcoming.slice(0, limit)];
  if (out.length < limit) out.push(...results.slice(0, limit - out.length));
  return out.slice(0, limit);
}

function composeFrontPage(ctx, w, h, opts) {
  const c = frontInk();
  const articles = (opts.articles || []).filter(Boolean);
  const briefs = (opts.briefs || []).filter(Boolean);
  const images = opts.articleImages || new Map();
  const withQr = Boolean(opts.qr);
  const glass = opts.layout === 'verre';
  const bilingual = opts.lang === 'bilingue';
  const showLangs = opts.langs !== false;
  const margin = Math.round(Math.min(w, h) * 0.036);
  const barH = Math.max(8, Math.round(h * 0.009));
  const site = (typeof RadarMagazineFrontPage !== 'undefined' && RadarMagazineFrontPage.SITE)
    ? RadarMagazineFrontPage.SITE
    : 'https://le-radar.ca';
  const todayIso = opts.date || new Date().toISOString();
  const Front = typeof RadarMagazineFrontPage !== 'undefined' ? RadarMagazineFrontPage : null;
  const dateLabel = Front && Front.frDate ? Front.frDate(todayIso, { weekday: true }) : '';
  const capDate = dateLabel ? dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1) : '';
  const dateEn = (bilingual && Front && Front.enDate) ? Front.enDate(todayIso, { weekday: true }) : '';
  const campus = opts.campus && opts.campus !== 'toutes' && opts.campus !== 'generique'
    ? campusOf(opts.campus)
    : null;
  const uniLabel = campus
    ? (bilingual && campus.lineEn && campus.lineEn !== campus.line
      ? `${campus.line}  ·  ${campus.lineEn}`
      : campus.line)
    : '';
  const photo = opts.photoImg || null;
  const credit = (glass && photo && opts.credit)
    ? posterCredit(opts.credit, opts.license, opts.photoUrl || '')
    : '';
  const radioLines = opts.radioLines || [];
  const sportsLines = opts.sportsLines || [];

  if (glass && photo) {
    coverPhoto(ctx, photo, 0, 0, w, h, opts.focalX ?? 0.5, opts.focalY ?? 0.42);
    ctx.fillStyle = 'rgba(18, 16, 14, 0.32)';
    ctx.fillRect(0, 0, w, h);
  } else if (glass) {
    ctx.fillStyle = '#2A2420';
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = c.paper;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.fillStyle = PURPLE;
  ctx.fillRect(0, 0, w, barH);

  const measure = (font, text) => {
    ctx.font = font;
    const m = ctx.measureText(text);
    return (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0) || parseFloat(font) || 12;
  };
  const wrapFit = (text, fontFn, maxW, maxSize, minSize, maxLines) => {
    let size = maxSize;
    let lines = [text || ''];
    while (size > minSize) {
      ctx.font = fontFn(size);
      lines = wrapWords(ctx, text || '', maxW);
      if (lines.length <= maxLines) break;
      size -= 1;
    }
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      let last = lines[maxLines - 1] || '';
      while (last.length > 4 && textW(ctx, `${last}…`) > maxW) last = last.slice(0, -1).trimEnd();
      lines[maxLines - 1] = /[….]$/.test(last) ? last : `${last}…`;
    }
    return { size, lines };
  };

  const ink = c.ink;
  const mute = glass ? '#3F3A35' : c.mute;
  const markSize = Math.round(Math.min(w, h) * 0.028);
  const logoS = Math.round(markSize * 1.12);
  const x0 = margin;
  const x1 = w - margin;
  const contentW = x1 - x0;
  const sloganSize = Math.round(markSize * 0.34);
  const dSize = Math.round(markSize * 0.4);
  const fit = Math.min(w / (11 * REF_DPI), h / (17 * REF_DPI));
  const footCap = Math.round(62 * fit);
  const fLang = Math.min(26 * fit, footCap * 0.48);
  const iconS = Math.min(36 * fit, footCap * 0.64);
  const siteQr = Math.round(Math.min(w, h) * 0.062);
  const footPad = Math.round(margin * 0.16);
  const legalSize = Math.max(10, Math.round(Math.min(w, h) * 0.01));
  const qrCol = withQr ? siteQr + margin * 0.3 : 0;
  const legalMax = Math.max(80, contentW - qrCol);
  const langsMax = contentW;
  ctx.font = `400 ${legalSize}px "LR Sans"`;
  const legalLines = [
    ...wrapWords(ctx, `${INDEP_1} ${INDEP_2}`, legalMax),
    ...(bilingual ? wrapWords(ctx, INDEP_EN, legalMax) : []),
  ];
  const legalLineH = measure(`400 ${legalSize}px "LR Sans"`, legalLines[0] || INDEP_1);
  const legalH = legalLines.length * (legalLineH + 3);
  const langsMetrics = showLangs
    ? measureLangsFooter(ctx, { maxW: langsMax, size: fLang, iconS, lineGap: 4, iconGap: 6 })
    : { height: 0, lines: [] };
  const creditSize = credit ? Math.max(8, Math.round(Math.min(w, h) * 0.008)) : 0;
  const creditH = credit ? creditSize + 5 : 0;
  const qrBlock = withQr ? siteQr + Math.round(legalSize * 1.25) : 0;
  const footTopH = Math.max(qrBlock, legalH) + footPad;
  const footH = footTopH + langsMetrics.height + creditH + footPad;
  const footY = h - margin * 0.55 - footH;

  const hasFold = briefs.length > 0 || radioLines.length > 0 || sportsLines.length > 0;
  const foldH = hasFold ? Math.round(Math.min(w, h) * 0.15) : 0;
  const foldGap = hasFold ? Math.round(margin * 0.22) : 0;
  const contentBottom = footY - (hasFold ? foldH + foldGap + Math.round(margin * 0.12) : Math.round(margin * 0.1));

  /* Bandeau de tête */
  let headY = barH + Math.round(margin * 0.4);
  headY += logoS + Math.round(margin * 0.14);
  const sloganMax = contentW;
  ctx.font = `400 ${sloganSize}px "LR Sans"`;
  wrapWords(ctx, SLOGAN, sloganMax).forEach((line) => {
    headY += measure(`400 ${sloganSize}px "LR Sans"`, line) + 3;
  });
  if (bilingual) {
    ctx.font = `400 ${sloganSize}px "LR Sans"`;
    wrapWords(ctx, SLOGAN_EN, sloganMax).forEach((line) => {
      headY += measure(`400 ${sloganSize}px "LR Sans"`, line) + 2;
    });
  }
  if (uniLabel) {
    const uniSize = Math.round(markSize * 0.36);
    ctx.font = `600 ${uniSize}px "LR Sans Semi", "LR Sans"`;
    headY += measure(ctx.font, uniLabel) + 3;
  }
  headY += Math.round(margin * 0.22);
  if (glass) {
    frostedRect(ctx, margin * 0.4, barH + 3, w - margin * 0.8, headY - barH - 2, Math.round(margin * 0.18), {
      fill: 'rgba(255, 252, 247, 0.84)',
    });
  }

  let y = barH + Math.round(margin * 0.4);
  if (assets.logo) ctx.drawImage(assets.logo, x0, y, logoS, logoS);
  fillTracked(ctx, TITLE, y + Math.round((logoS - markSize) / 2), markSize, PURPLE, x0 + logoS + Math.round(logoS * 0.16));
  if (capDate) {
    ctx.font = `400 ${dSize}px "LR Sans"`;
    ctx.fillStyle = mute;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(capDate, x1, y + logoS / 2 - (dateEn ? dSize * 0.35 : 0));
    if (dateEn) {
      ctx.font = `400 ${Math.round(dSize * 0.86)}px "LR Sans"`;
      ctx.fillText(dateEn, x1, y + logoS / 2 + dSize * 0.55);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }
  y += logoS + Math.round(margin * 0.14);
  wrapWords(ctx, SLOGAN, sloganMax).forEach((line) => {
    ctx.font = `400 ${sloganSize}px "LR Sans"`;
    ctx.fillStyle = mute;
    ctx.textBaseline = 'top';
    ctx.fillText(line, x0, y);
    y += measure(ctx.font, line) + 3;
  });
  if (bilingual) {
    wrapWords(ctx, SLOGAN_EN, sloganMax).forEach((line) => {
      ctx.font = `400 ${sloganSize}px "LR Sans"`;
      ctx.fillStyle = mute;
      ctx.textBaseline = 'top';
      ctx.fillText(line, x0, y);
      y += measure(ctx.font, line) + 2;
    });
  }
  if (uniLabel) {
    const uniSize = Math.round(markSize * 0.36);
    ctx.font = `600 ${uniSize}px "LR Sans Semi", "LR Sans"`;
    ctx.fillStyle = PURPLE;
    ctx.textBaseline = 'top';
    ctx.fillText(uniLabel, x0, y);
    y += measure(ctx.font, uniLabel) + 3;
  }
  y += Math.round(margin * 0.08);
  if (!glass) {
    ctx.strokeStyle = c.rule;
    ctx.lineWidth = Math.max(1, Math.round(h / 900));
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, Math.round(h / 1800));
    ctx.beginPath();
    ctx.moveTo(x0, y + Math.max(2, Math.round(h / 700)));
    ctx.lineTo(x1, y + Math.max(2, Math.round(h / 700)));
    ctx.stroke();
    y += Math.max(2, Math.round(h / 700)) + Math.round(margin * 0.18);
  } else {
    y += Math.round(margin * 0.2);
  }

  const radius = glass ? Math.round(margin * 0.16) : 0;
  const pad = glass ? Math.round(margin * 0.12) : 0;
  const filet = Math.max(1, Math.round(h / 1400));

  const drawCreditLine = (text, cx, cy, maxW) => {
    if (!text) return 0;
    const size = Math.max(8, Math.round(Math.min(w, h) * 0.008));
    ctx.font = `400 ${size}px "LR Sans"`;
    let line = String(text).replace(/\s+/g, ' ').trim();
    while (line.length > 4 && textW(ctx, line) > maxW) line = line.slice(0, -1).trimEnd();
    if (textW(ctx, line) > maxW) return 0;
    ctx.fillStyle = mute;
    ctx.textBaseline = 'top';
    ctx.fillText(line, cx, cy);
    return size + 3;
  };
  const drawKicker = (label, yy, left, frosted) => {
    const size = Math.max(9, Math.round(Math.min(w, h) * 0.011));
    const font = `700 ${size}px "LR Sans Semi", "LR Sans"`;
    const start = left ?? x0;
    ctx.font = font;
    const hgt = measure(font, label.toUpperCase());
    if (frosted) {
      const padX = Math.round(size * 0.5);
      const padY = Math.round(size * 0.28);
      ctx.font = font;
      const tw = textW(ctx, label.toUpperCase());
      frostedRect(ctx, start - padX, yy - padY, tw + padX * 2, hgt + padY * 2, Math.round(size * 0.4), {
        fill: 'rgba(255, 252, 247, 0.9)',
      });
    }
    ctx.font = font;
    ctx.fillStyle = PURPLE;
    ctx.textBaseline = 'top';
    ctx.fillText(label.toUpperCase(), start, yy);
    return yy + hgt + Math.round(size * 0.4);
  };
  const fillPlaceholder = (x, yy, tw, th, label) => {
    ctx.fillStyle = glass ? 'rgba(90, 84, 76, 0.28)' : c.photoBg;
    ctx.fillRect(x, yy, tw, th);
    if (!label) return;
    const size = Math.max(11, Math.round(th * 0.08));
    ctx.font = `600 ${size}px "LR Sans Semi", "LR Sans"`;
    ctx.fillStyle = mute;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + tw / 2, yy + th / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  };
  const paintImage = (img, x, yy, tw, th, fy, source) => {
    if (img) {
      ctx.save();
      roundedRectPath(ctx, x, yy, tw, th, glass ? Math.round(radius * 0.45) : 0);
      ctx.clip();
      coverPhoto(ctx, img, x, yy, tw, th, 0.5, fy ?? 0.5);
      ctx.restore();
    } else fillPlaceholder(x, yy, tw, th, source || '');
  };
  const vRule = (x, y1, y2) => {
    if (glass) return;
    ctx.strokeStyle = c.rule;
    ctx.lineWidth = filet;
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.stroke();
  };
  const hRule = (xA, xB, yy) => {
    if (glass) return;
    ctx.strokeStyle = c.rule;
    ctx.lineWidth = filet;
    ctx.beginPath();
    ctx.moveTo(xA, yy);
    ctx.lineTo(xB, yy);
    ctx.stroke();
  };

  const drawStory = (art, box, kind) => {
    if (!art || box.w < 8 || box.h < 8) return;
    const { x, y: by, w: bw, h: bh } = box;
    if (glass) frostedRect(ctx, x, by, bw, bh, radius);
    const ip = pad;
    const ix = x + ip;
    const iy = by + ip;
    const iw = bw - ip * 2;
    const ih = bh - ip * 2;
    const floor = by + bh - ip;
    const isLead = kind === 'lead';
    const isSec = kind === 'secondary';
    const qr = withQr && art.pageUrl
      ? Math.round(Math.min(iw, ih) * (isLead ? 0.18 : isSec ? 0.22 : 0.24))
      : 0;
    const img = art.key ? images.get(art.key) : null;
    const imgRatio = isLead ? 0.40 : isSec ? 0.38 : 0.36;
    let ty = iy;
    const kicker = isLead
      ? (bilingual ? 'À la une  ·  Front page' : 'À la une')
      : '';
    if (kicker) ty = drawKicker(kicker, ty, ix);
    const imgH = Math.max(24, Math.min(Math.round(ih * imgRatio), Math.round(iw / (isLead ? 1.75 : 1.55))));
    paintImage(img, ix, ty, iw, imgH, art.focalY, art.source);
    ty += imgH + 3;
    if (art.credit) ty += drawCreditLine(art.credit, ix, ty, iw);
    const titleMax = Math.round(Math.min(iw, ih) * (isLead ? 0.1 : isSec ? 0.1 : 0.095));
    const titleMin = isLead ? 14 : 11;
    const titleW = iw;
    const tFit = wrapFit(art.title, (s) => `700 ${s}px "LR Serif"`, titleW, titleMax, titleMin, isLead ? 3 : 3);
    tFit.lines.forEach((line) => {
      ctx.font = `700 ${tFit.size}px "LR Serif"`;
      ctx.fillStyle = ink;
      ctx.textBaseline = 'top';
      const hh = measure(ctx.font, line);
      if (ty + hh > floor) return;
      ctx.fillText(line, ix, ty);
      ty += hh + Math.round(tFit.size * 0.06);
    });
    const meta = [art.source, art.dateLabel].filter(Boolean).join('  ·  ');
    if (meta) {
      const ms = Math.max(9, Math.round(tFit.size * (isLead ? 0.3 : 0.36)));
      ctx.font = `600 ${ms}px "LR Sans Semi", "LR Sans"`;
      ctx.fillStyle = PURPLE;
      const mh = measure(ctx.font, meta);
      if (ty + mh < floor) {
        ctx.fillText(meta, ix, ty);
        ty += mh + Math.round(ms * 0.35);
      }
    }
    const hook = isLead ? (art.hookLong || art.hook || '') : (art.hook || art.hookShort || '');
    const hookW = iw - (qr ? qr + 8 : 0);
    if (hook) {
      const hs = Math.max(10, Math.round(Math.min(w, h) * (isLead ? 0.0155 : isSec ? 0.013 : 0.012)));
      const room = floor - ty - 2;
      const maxLines = Math.max(2, Math.min(isLead ? 7 : isSec ? 5 : 4, Math.floor(room / (hs * 1.2))));
      const hFit = wrapFit(hook, (s) => `400 ${s}px "LR Sans"`, hookW, hs, 9, maxLines);
      hFit.lines.forEach((line) => {
        ctx.font = `400 ${hFit.size}px "LR Sans"`;
        ctx.fillStyle = ink;
        ctx.textBaseline = 'top';
        const hh = measure(ctx.font, line);
        if (ty + hh > floor) return;
        ctx.fillText(line, ix, ty);
        ty += hh + Math.round(hFit.size * 0.18);
      });
    }
    if (qr) {
      const qx = ix + iw - qr;
      const qy = Math.min(Math.max(iy + imgH + 6, floor - qr), floor - qr);
      drawQrCode(ctx, qx, qy, qr, art.pageUrl);
    }
  };

  const n = articles.length;
  const lead = articles[0] || null;
  const rest = articles.slice(1);
  const colGap = Math.round(margin * 0.22);
  const rowGap = Math.round(margin * 0.2);
  const top = y;

  if (!lead) {
    if (glass) frostedRect(ctx, x0, y, contentW, Math.round(margin * 1.5), radius);
    ctx.font = `400 ${Math.round(markSize * 0.42)}px "LR Sans"`;
    ctx.fillStyle = mute;
    ctx.fillText('Aucun article à afficher. Cochez au moins un titre.', x0 + (glass ? 12 : 0), y + (glass ? 14 : 0));
  } else {
    const areaH = contentBottom - top;
    const sideN = n === 2 ? 1 : n === 4 ? 3 : Math.min(2, rest.length);
    const hasSide = sideN > 0;
    const hasGrid = rest.length > sideN;
    const leadShare = hasGrid ? (rest.length - sideN >= 5 ? 0.46 : 0.5) : 0.96;
    const leadBottom = top + Math.round(areaH * leadShare);
    const leadW = hasSide ? Math.round(contentW * 0.62) : contentW;
    const sideX = x0 + leadW + colGap;
    const sideW = x1 - sideX;
    drawStory(lead, { x: x0, y: top, w: leadW, h: leadBottom - top }, 'lead');
    if (hasSide) {
      vRule(x0 + leadW + Math.round(colGap / 2), top, leadBottom);
      const sideArts = rest.slice(0, sideN);
      const cellH = Math.floor((leadBottom - top - rowGap * (sideArts.length - 1)) / sideArts.length);
      sideArts.forEach((art, i) => {
        const cy = top + i * (cellH + rowGap);
        if (i > 0) hRule(sideX, x1, cy - Math.round(rowGap / 2));
        drawStory(art, { x: sideX, y: cy, w: sideW, h: cellH }, 'secondary');
      });
    }
    const gridArts = rest.slice(sideN);
    if (gridArts.length) {
      const gy = leadBottom + rowGap;
      const kicker = bilingual ? 'Vedettes  ·  Features' : 'Vedettes';
      const gyText = drawKicker(kicker, gy, x0, glass);
      const gridH = contentBottom - gyText;
      const count = gridArts.length;
      const firstCols = count <= 2 ? count : 3;
      const firstN = Math.min(firstCols, count);
      const secondN = count - firstN;
      const rows = secondN ? 2 : 1;
      const rowH = Math.floor((gridH - (rows > 1 ? rowGap : 0)) / rows);

      const placeRow = (arts, rowY, rowHeight) => {
        const cols = arts.length;
        const cellW = Math.floor((contentW - colGap * (cols - 1)) / cols);
        arts.forEach((art, i) => {
          const cx = x0 + i * (cellW + colGap);
          if (i > 0) vRule(cx - Math.round(colGap / 2), rowY, rowY + rowHeight);
          drawStory(art, { x: cx, y: rowY, w: cellW, h: rowHeight }, 'grid');
        });
      };
      placeRow(gridArts.slice(0, firstN), gyText, rowH);
      if (secondN) {
        const y2 = gyText + rowH + rowGap;
        hRule(x0, x1, y2 - Math.round(rowGap / 2));
        placeRow(gridArts.slice(firstN), y2, rowH);
      }
    }
  }

  /* Pli du bas : En bref / radio / sports, colonnes seulement si elles ont du contenu. */
  if (hasFold) {
    const fy = footY - foldH - foldGap;
    const foldCols = [
      briefs.length ? { title: bilingual ? 'En bref  ·  In brief' : 'En bref', items: briefs.map((b) => ({ kicker: b.source, line: b.title, meta: b.dateLabel })) } : null,
      radioLines.length ? { title: bilingual ? 'Radio  ·  On air' : 'Radio en direct', items: radioLines } : null,
      sportsLines.length ? { title: bilingual ? 'Sports  ·  Scoreboard' : 'Sports étudiants', items: sportsLines } : null,
    ].filter(Boolean);
    if (glass) frostedRect(ctx, margin * 0.4, fy - 2, w - margin * 0.8, foldH + 4, radius, { fill: 'rgba(255, 252, 247, 0.86)' });
    else {
      ctx.strokeStyle = c.rule;
      ctx.lineWidth = Math.max(1, Math.round(h / 900));
      ctx.beginPath();
      ctx.moveTo(x0, fy);
      ctx.lineTo(x1, fy);
      ctx.stroke();
    }
    const fCols = foldCols.length;
    const fGap = colGap;
    const fW = Math.floor((contentW - fGap * (fCols - 1)) / fCols);
    const fPad = Math.round(margin * 0.06);
    foldCols.forEach((col, i) => {
      const cx = x0 + i * (fW + fGap);
      if (i > 0) vRule(cx - Math.round(fGap / 2), fy + 6, fy + foldH - 4);
      let ty = drawKicker(col.title, fy + fPad + 4, cx, false);
      const size = Math.max(10, Math.round(Math.min(w, h) * 0.011));
      const metaS = Math.max(8, Math.round(size * 0.78));
      col.items.forEach((item) => {
        if (ty > fy + foldH - 8) return;
        const line = item.line || '';
        const fitted = wrapFit(line, (s) => `700 ${s}px "LR Serif"`, fW - 4, size, 9, 2);
        ctx.font = `600 ${metaS}px "LR Sans Semi", "LR Sans"`;
        ctx.fillStyle = PURPLE;
        const tag = [item.kicker, item.meta].filter(Boolean).join('  ·  ');
        if (tag) {
          ctx.fillText(tag, cx, ty);
          ty += measure(ctx.font, tag) + 1;
        }
        fitted.lines.forEach((ln) => {
          ctx.font = `700 ${fitted.size}px "LR Serif"`;
          ctx.fillStyle = ink;
          ctx.textBaseline = 'top';
          const hh = measure(ctx.font, ln);
          if (ty + hh > fy + foldH - 4) return;
          ctx.fillText(ln, cx, ty);
          ty += hh + 1;
        });
        ty += 4;
      });
    });
  }

  if (glass) {
    frostedRect(ctx, margin * 0.4, footY - 3, w - margin * 0.8, h - (footY - 3) - margin * 0.2, Math.round(margin * 0.16), {
      fill: 'rgba(255, 252, 247, 0.86)',
    });
  } else {
    ctx.strokeStyle = c.rule;
    ctx.lineWidth = Math.max(1, Math.round(h / 900));
    ctx.beginPath();
    ctx.moveTo(x0, footY);
    ctx.lineTo(x1, footY);
    ctx.stroke();
  }
  let ly = footY + footPad;
  legalLines.forEach((line) => {
    ctx.font = `400 ${legalSize}px "LR Sans"`;
    ctx.fillStyle = mute;
    ctx.textBaseline = 'top';
    ctx.fillText(line, x0, ly);
    ly += legalLineH + 3;
  });
  let langsY = footY + footPad + Math.max(qrBlock, legalH) + 2;
  if (showLangs && langsMetrics.height) {
    drawLangsFooter(ctx, {
      y: langsY,
      maxW: langsMax,
      size: fLang,
      iconS,
      color: mute,
      lineGap: 4,
      iconGap: 6,
    });
    langsY += langsMetrics.height;
  }
  if (credit) drawCreditLine(credit, x0, Math.min(langsY + 2, h - margin * 0.4 - creditSize), langsMax);
  if (withQr) {
    const qx = x1 - siteQr;
    const qy = footY + footPad;
    drawQrCode(ctx, qx, qy, siteQr, `${site}/`);
    const capS = Math.max(8, Math.round(legalSize * 0.9));
    ctx.font = `600 ${capS}px "LR Sans Semi", "LR Sans"`;
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('le-radar.ca', qx + siteQr / 2, qy + siteQr + 3);
    ctx.textAlign = 'left';
  }
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

function pageWidth(ctx) {
  return ctx._pageW || ctx.canvas.width;
}

function fillUniLockup(ctx, parts, y, small, large) {
  const left = parts.left || '';
  const right = parts.right || '';
  const core = parts.core;
  const maxW = pageWidth(ctx) * 0.86;
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
  let x = (pageWidth(ctx) - (wLeft + wCore + wRight)) / 2;
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

function measureLangsFooter(ctx, { maxW, size, iconS = 0, lineGap = 5, iconGap = 8 }) {
  const font = langTypeface(size);
  ctx.font = font;
  const lines = wrapJoin(ctx, TRANSLATE_LANGS, maxW);
  let lineH = 0;
  if (lines.length) {
    ctx.font = font;
    const m = ctx.measureText(lines[0] || 'Français');
    lineH = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0) || size;
  }
  const height = lines.length
    ? (iconS ? iconS + iconGap : 0) + lines.length * (lineH + lineGap)
    : 0;
  return { lines, lineH, height, font, size, iconS, lineGap, iconGap };
}

function drawTranslateMark(ctx, x, y, size, color) {
  if (!assets.translate || size < 2) return;
  if (!color || color === SOFT) {
    ctx.drawImage(assets.translate, x, y, size, size);
    return;
  }
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.round(size));
  off.height = Math.max(1, Math.round(size));
  const octx = off.getContext('2d');
  octx.drawImage(assets.translate, 0, 0, off.width, off.height);
  octx.globalCompositeOperation = 'source-in';
  octx.fillStyle = color;
  octx.fillRect(0, 0, off.width, off.height);
  ctx.drawImage(off, x, y);
}

function drawLangsFooter(ctx, {
  y, maxW, size, iconS = 0, color, lineGap = 5, iconGap = 8,
}) {
  const measured = measureLangsFooter(ctx, { maxW, size, iconS, lineGap, iconGap });
  if (!measured.lines.length) return measured;
  let cy = y;
  if (iconS && assets.translate) {
    drawTranslateMark(ctx, (pageWidth(ctx) - iconS) / 2, cy, iconS, color);
  }
  let ly = cy + (iconS ? iconS + iconGap : 0);
  ctx.font = measured.font;
  measured.lines.forEach((line) => {
    fillCentered(ctx, line, ly, color);
    ly += measured.lineH + lineGap;
  });
  return measured;
}

function fillCentered(ctx, text, y, color) {
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  const w = textW(ctx, text);
  ctx.fillText(text, (pageWidth(ctx) - w) / 2, y);
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
  if (x == null) x = (pageWidth(ctx) - trackedWidth(ctx, text, size)) / 2;
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
  const clipX = Math.max(0, Math.round(Number(opts.clipX) || 0));
  const clipY = Math.max(0, Math.round(Number(opts.clipY) || 0));
  const clipW = Math.round(Number(opts.clipW) || w);
  const clipH = Math.round(Number(opts.clipH) || h);
  const canvas = document.createElement('canvas');
  canvas.style.fontSynthesis = 'none';
  canvas.width = clipW;
  canvas.height = clipH;
  if (canvas.width !== clipW || canvas.height !== clipH) {
    throw new Error(`canevas ${clipW}×${clipH} trop grand pour ce navigateur`);
  }
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('canevas 2D indisponible');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx._pageW = w;
  ctx.save();
  ctx.translate(-clipX, -clipY);

  if (opts.model === 'une') {
    composeFrontPage(ctx, w, h, opts);
    ctx.restore();
    return canvas;
  }

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
    ? posterCredit(opts.credit, opts.license, opts.photoUrl || '')
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
  const langMax = w - 2 * safe - 80 * fit;
  const langsMetrics = opts.langs
    ? measureLangsFooter(ctx, { maxW: langMax, size: fLang, iconS, lineGap: 5, iconGap: 8 })
    : { height: 0, lines: [] };
  const langsH = langsMetrics.height;
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
    drawLangsFooter(ctx, { y: cy, maxW: langMax, size: fLang, iconS, color: SOFT, lineGap: 5, iconGap: 8 });
    cy += langsH;
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

  ctx.restore();
  return canvas;
}

function isCampusPhoto(p) {
  return p.campus === true || (Array.isArray(p.tags) && p.tags.includes('campus'));
}

function photoBankCampus() {
  if (isUneModel()) {
    const slug = (state.uneCampus && state.uneCampus !== 'toutes')
      ? state.uneCampus
      : (state.campus && state.campus !== 'generique' ? state.campus : 'laval');
    return campusOf(slug);
  }
  return campusOf(state.campus);
}

function uneUsesPhoto() {
  return isUneModel() && state.layout === 'verre';
}

function ensureUnePhoto() {
  if (!uneUsesPhoto()) return;
  const photos = filteredPhotos();
  if (state.photoId && photos.some((p) => photoKeyId(p) === state.photoId)) return;
  const first = photos[0];
  if (first) {
    state.photoId = photoKeyId(first);
    resetCrop(first);
  }
}

function fillUneCampusSelect() {
  const sel = document.getElementById('une-campus');
  if (!sel || sel.dataset.filled === '1') return;
  CAMPUSES.filter((c) => c.slug !== 'generique').forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.slug;
    opt.textContent = c.line;
    sel.appendChild(opt);
  });
  sel.dataset.filled = '1';
  if (state.uneCampus && state.uneCampus !== 'toutes') sel.value = state.uneCampus;
}

function filteredPhotos() {
  const campus = photoBankCampus();
  const bank = campus.places
    ? state.photos.filter((p) => isCampusPhoto(p) && photoMatches(p, campus))
    : state.photos;
  const uploads = isLocalHost() ? state.uploads : [];
  return [...uploads, ...bank.filter(printWorthy)];
}

function printWorthy(p) {
  const w = p.width || 0;
  const h = p.height || 0;
  return Math.max(w, h) >= 1400 && Math.min(w, h) >= 800;
}

function currentPhoto() {
  if (!state.photoId) return null;
  const pool = [...(state.uploads || []), ...state.photos];
  return pool.find((p) => photoKeyId(p) === state.photoId) || null;
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
  const nLocal = photos.filter(isLocalPhoto).length;
  const bankCampus = photoBankCampus();
  const base = (!isUneModel() && state.campus === 'generique')
    ? `${n} photos de toute la banque`
    : `${n} photos pour ${bankCampus.label}`;
  document.getElementById('photo-meta').textContent = nLocal
    ? `${base} · ${nLocal} téléversée${nLocal > 1 ? 's' : ''}`
    : base;
  syncCropUi();
}

function escapeAttr(s) {
  return String(s).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
}

function specLine() {
  const fmt = FORMATS[state.format];
  const { w, h } = px(fmt);
  return `${fmt.label} · ${w} × ${h} px · ${outputDpi()} dpi · PDF`;
}

function recipeLine() {
  if (isUneModel()) {
    const bits = [FORMATS[state.format].label, 'Une du Radar'];
    const n = selectedUneArticles().length;
    bits.push(n ? `${n} article${n > 1 ? 's' : ''}` : 'Aucun article');
    if ((state.uneBriefs || []).length) bits.push(`${state.uneBriefs.length} en bref`);
    bits.push(state.layout === 'verre' ? 'Verre dépoli' : 'Classique');
    if (state.uneCampus && state.uneCampus !== 'toutes') bits.push(campusOf(state.uneCampus).label);
    bits.push(state.lang === 'bilingue' ? 'Bilingue' : 'Français');
    if (state.langs) bits.push('Langues');
    if (state.qr) bits.push('QR');
    return bits.join(' · ');
  }
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

function isUneModel() {
  return state.model === 'une';
}

function selectedUneArticles() {
  return (state.uneArticles || []).filter((a) => a.included !== false);
}

function syncModelUi() {
  const dash = document.querySelector('.dash');
  if (dash) {
    dash.dataset.model = state.model;
    dash.dataset.layout = isUneModel() ? (state.layout || 'classique') : '';
  }
  ['une-box', 'une-layout-box', 'une-uni-box'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = !isUneModel();
  });
  fillUneCampusSelect();
  syncLangChoice();
  const crop = document.getElementById('crop-tools');
  const pane = document.getElementById('preview-pane');
  if (isUneModel() && !uneUsesPhoto()) {
    if (crop) crop.hidden = true;
    if (pane) pane.classList.remove('has-crop');
  } else {
    syncCropUi();
  }
  const lead = document.querySelector('.dash-lead');
  if (lead) {
    lead.textContent = isUneModel()
      ? 'La une et les vedettes viennent du site. Choisissez la mise en page, une université ou la langue, puis exportez.'
      : 'Paramètres d’abord, photo ensuite. L’affiche reste à droite.';
  }
}

function renderUneList() {
  const list = document.getElementById('une-list');
  const status = document.getElementById('une-status');
  if (!list) return;
  if (status) status.textContent = state.uneStatus || '';
  list.replaceChildren();
  state.uneArticles.forEach((art, index) => {
    const li = document.createElement('li');
    if (art.included !== false && selectedUneArticles()[0]?.key === art.key) li.classList.add('is-lead');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'une-check';
    check.checked = art.included !== false;
    check.addEventListener('change', () => {
      art.included = check.checked;
      renderUneList();
      preview();
    });
    const meta = document.createElement('div');
    meta.className = 'une-meta';
    const role = document.createElement('span');
    role.className = 'une-role';
    const selected = selectedUneArticles();
    const place = selected.findIndex((a) => a.key === art.key);
    role.textContent = art.included === false
      ? 'Retiré'
      : (place === 0 ? 'À la une' : 'Vedette');
    const title = document.createElement('span');
    title.className = 'une-title';
    title.textContent = art.title;
    const source = document.createElement('span');
    source.className = 'une-source';
    source.textContent = [art.source, art.dateLabel].filter(Boolean).join(' · ');
    meta.append(role, title, source);
    const up = document.createElement('button');
    up.type = 'button';
    up.textContent = '↑';
    up.setAttribute('aria-label', 'Monter');
    up.disabled = index === 0;
    up.addEventListener('click', () => moveUneArticle(index, -1));
    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = '↓';
    down.setAttribute('aria-label', 'Descendre');
    down.disabled = index === state.uneArticles.length - 1;
    down.addEventListener('click', () => moveUneArticle(index, 1));
    li.append(check, meta, up, down);
    list.append(li);
  });
}

function moveUneArticle(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= state.uneArticles.length) return;
  const arr = state.uneArticles;
  const tmp = arr[index];
  arr[index] = arr[next];
  arr[next] = tmp;
  renderUneList();
  preview();
}

async function loadUneFeed() {
  const Front = typeof RadarMagazineFrontPage !== 'undefined' ? RadarMagazineFrontPage : null;
  if (!Front) {
    state.uneStatus = 'Module de une introuvable.';
    renderUneList();
    return;
  }
  state.uneStatus = 'Chargement des articles du site…';
  renderUneList();
  try {
    const res = await fetch('../news.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`news.json (${res.status})`);
    const data = await res.json();
    const now = data.updated ? new Date(data.updated) : new Date();
    const campus = (state.uneCampus && state.uneCampus !== 'toutes')
      ? campusOf(state.uneCampus)
      : null;
    const featureN = Front.POSTER_PAGE_COUNT || 9;
    const briefN = Front.POSTER_BRIEF_COUNT || 6;
    const cards = Front.frontPageCards(data.items || [], now, '..', campus, featureN + briefN);
    state.uneArticles = cards.items.slice(0, featureN).map((card) => ({ ...card, included: true }));
    state.uneBriefs = cards.items.slice(featureN);
    const n = state.uneArticles.length;
    const b = state.uneBriefs.length;
    const where = campus ? ` pour ${campus.line}` : ' du fil actuel';
    const briefBit = b ? ` et ${b} en bref` : '';
    state.uneStatus = n
      ? `${n} article${n > 1 ? 's' : ''}${where} (1 à la une, ${Math.max(0, n - 1)} vedette${n - 1 > 1 ? 's' : ''})${briefBit}.`
      : (campus
        ? `Aucun article frais pour ${campus.line}. L’affiche n’invente pas de titres.`
        : 'Aucun article frais dans le fil.');
  } catch (err) {
    state.uneArticles = [];
    state.uneBriefs = [];
    state.uneStatus = `Impossible de lire le fil : ${err.message}`;
  }
  renderUneList();
}

async function loadUneImages(articles) {
  const map = new Map();
  await Promise.all((articles || []).map(async (art) => {
    if (!art?.key) return;
    const candidates = (art.images && art.images.length)
      ? art.images
      : (art.image ? [art.image] : []);
    for (const src of candidates) {
      try {
        map.set(art.key, await loadImage(src, true));
        return;
      } catch {
        /* essayer le miroir public, puis l’URL d’origine */
      }
    }
  }));
  return map;
}

async function loadUneSidebars() {
  if (state.uneSidebars) return state.uneSidebars;
  const grab = (url) => fetch(url, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [nowplaying, radios, sports] = await Promise.all([
    grab('../radio-nowplaying.json'),
    grab('../radios.json'),
    grab('../sports-masthead.json'),
  ]);
  state.uneSidebars = { nowplaying, radios, sports };
  return state.uneSidebars;
}

function uneComposeOpts(dpi, images, photoImg, photo) {
  const campusSlug = (state.uneCampus && state.uneCampus !== 'toutes') ? state.uneCampus : null;
  const campus = campusSlug ? campusOf(campusSlug) : null;
  const bars = state.uneSidebars || {};
  return {
    model: 'une',
    format: state.format,
    qr: state.qr,
    langs: state.langs,
    lang: state.lang,
    layout: state.layout,
    campus: campusSlug,
    dpi,
    articles: selectedUneArticles(),
    briefs: state.uneBriefs || [],
    radioLines: pickPosterRadio(bars.nowplaying, bars.radios, campus, 3),
    sportsLines: pickPosterSports(bars.sports, campus, 3),
    articleImages: images || new Map(),
    photoImg: photoImg || null,
    credit: photo?.credit,
    license: photo?.license,
    photoUrl: photo?.url,
    focalX: state.focalX,
    focalY: state.focalY,
    cropScale: state.zoom,
    angle: state.angle,
  };
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

function paintPreview(img, photo, uneOpts) {
  const out = document.getElementById('preview');
  const canvas = compose(isUneModel()
    ? uneComposeOpts(PREVIEW_DPI, uneOpts?.articleImages, img, photo)
    : {
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
    photoUrl: photo?.url,
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
  view.style.fontSynthesis = 'none';
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
  const photo = (!isUneModel() || uneUsesPhoto()) ? currentPhoto() : null;
  if (recipe) recipe.textContent = recipeLine();
  frame.classList.add('is-busy');
  try {
    if (isUneModel()) {
      paintPreview(null, photo, { articleImages: new Map() });
      await loadUneSidebars();
      const images = await loadUneImages(selectedUneArticles());
      if (gen !== previewGen) return;
      let bg = null;
      if (photo) {
        try { bg = await loadImage(printUrl(photo), !isLocalPhoto(photo)); } catch { bg = null; }
      }
      if (gen !== previewGen) return;
      lastPhotoImg = bg;
      paintPreview(bg, photo, { articleImages: images });
    } else {
      paintPreview(null, photo);
      if (photo) {
        const img = await loadImage(printUrl(photo), !isLocalPhoto(photo));
        if (gen !== previewGen) return;
        lastPhotoImg = img;
        paintPreview(img, photo);
      }
    }
    if (gen !== previewGen) return;
    status.innerHTML = `<strong>${escapeAttr(specLine())}</strong>`;
  } catch (err) {
    if (gen !== previewGen) return;
    paintPreview(null, null);
    status.textContent = isUneModel()
      ? `Aperçu indisponible. ${err.message}`
      : `Photo indisponible — fond radar. ${err.message}`;
  } finally {
    if (gen === previewGen) frame.classList.remove('is-busy');
  }
}

function jpegToPdfBlob(jpeg, imgW, imgH, wIn, hIn) {
  return jpegTilesToPdfBlob([{ jpeg, x: 0, y: 0, w: imgW, h: imgH }], imgW, imgH, wIn, hIn);
}

function jpegTilesToPdfBlob(tiles, pageWpx, pageHpx, wIn, hIn) {
  const pw = wIn * 72;
  const ph = hIn * 72;
  const enc = (s) => new TextEncoder().encode(s);
  const chunks = [];
  const offs = [0];
  let pos = 0;
  const push = (u8) => { chunks.push(u8); pos += u8.length; };
  const pushStr = (s) => push(enc(s));
  const nImg = tiles.length;
  pushStr('%PDF-1.4\n');
  const start = () => { offs.push(pos); };
  start();
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  start();
  pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  let xobj = '';
  for (let i = 0; i < nImg; i += 1) xobj += `/Im${i} ${5 + i} 0 R `;
  start();
  pushStr(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << ${xobj}>> >> /Contents 4 0 R >>\nendobj\n`);
  let stream = '';
  for (let i = 0; i < nImg; i += 1) {
    const t = tiles[i];
    const tw = (t.w / pageWpx) * pw;
    const th = (t.h / pageHpx) * ph;
    const x = (t.x / pageWpx) * pw;
    const y = ((pageHpx - t.y - t.h) / pageHpx) * ph;
    stream += `q ${tw} 0 0 ${th} ${x} ${y} cm /Im${i} Do Q\n`;
  }
  start();
  pushStr(`4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`);
  for (let i = 0; i < nImg; i += 1) {
    const t = tiles[i];
    start();
    pushStr(`${5 + i} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${t.w} /Height ${t.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${t.jpeg.length} >>\nstream\n`);
    push(t.jpeg);
    pushStr('\nendstream\nendobj\n');
  }
  const lastObj = 4 + nImg;
  const xrefPos = pos;
  let xref = `xref\n0 ${lastObj + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= lastObj; i += 1) {
    xref += `${String(offs[i]).padStart(10, '0')} 00000 n \n`;
  }
  pushStr(xref);
  pushStr(`trailer\n<< /Size ${lastObj + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
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

async function rasterTiles(opts, w, h) {
  const maxSide = isAppleTouch() ? 4096 : 16384;
  const maxArea = isAppleTouch() ? 16_777_216 : 268_435_456;
  const tw = Math.min(w, maxSide);
  const th = Math.max(1, Math.min(h, maxSide, Math.floor(maxArea / Math.max(1, tw))));
  const tiles = [];
  for (let y = 0; y < h; y += th) {
    for (let x = 0; x < w; x += tw) {
      const cw = Math.min(tw, w - x);
      const ch = Math.min(th, h - y);
      if (!canvasAllocates(cw, ch)) {
        throw new Error(`tuile ${cw}×${ch} trop grande pour ce navigateur`);
      }
      const canvas = compose({ ...opts, clipX: x, clipY: y, clipW: cw, clipH: ch });
      const jpegBlob = await jpegOfCanvas(canvas);
      tiles.push({
        jpeg: new Uint8Array(await jpegBlob.arrayBuffer()),
        x,
        y,
        w: cw,
        h: ch,
      });
    }
  }
  if (!tiles.length) throw new Error('aucune tuile composée');
  return tiles;
}

function printFileStem(fmt, dpi) {
  if (isUneModel()) {
    const layout = state.layout === 'verre' ? 'verre' : 'classique';
    const uni = (state.uneCampus && state.uneCampus !== 'toutes') ? `-${state.uneCampus}` : '';
    const lang = state.lang === 'bilingue' ? 'bilingue' : 'fr';
    const langs = state.langs ? '-langues' : '';
    const qr = state.qr ? '-qr' : '';
    return `le-radar-affiche-une-${layout}${uni}-${fmt.file}-${lang}${langs}${qr}-${dpi}dpi`;
  }
  const campus = campusOf(state.campus);
  const lang = state.lang === 'bilingue' ? 'bilingue' : 'fr';
  const uni = state.showUni ? '' : '-sans-etab';
  const qr = state.qr ? '-qr' : '';
  const greet = state.greeting !== 'none' ? `-${state.greeting}` : '';
  const langs = state.langs ? '-langues' : '';
  return `le-radar-affiche-${campus.slug}-${fmt.file}-${lang}${uni}${greet}${langs}${qr}-${dpi}dpi`;
}

async function downloadPrint(kind = 'pdf') {
  const buttons = [document.getElementById('dl'), document.getElementById('dl-jpg'), document.getElementById('dl-bottom'), document.getElementById('dl-jpg-bottom')];
  const status = document.getElementById('status');
  buttons.forEach((b) => { if (b) b.disabled = true; });
  status.textContent = kind === 'pdf' ? 'Composition du PDF…' : 'Composition du JPEG…';
  try {
    const fmt = FORMATS[state.format];
    const dpi = outputDpi();
    const photo = (!isUneModel() || uneUsesPhoto()) ? currentPhoto() : null;
    let img = null;
    if (photo) img = await loadImage(printUrl(photo), !isLocalPhoto(photo));
    if (isUneModel()) await loadUneSidebars();
    const uneImages = isUneModel() ? await loadUneImages(selectedUneArticles()) : null;
    const { w, h } = px(fmt, dpi);
    const composeOpts = isUneModel()
      ? uneComposeOpts(dpi, uneImages, img, photo)
      : {
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
      photoUrl: photo?.url,
      focalX: state.focalX,
      focalY: state.focalY,
      cropScale: state.zoom,
      angle: state.angle,
    };
    let jpegBlob = null;
    let tiles = null;
    if (!mustTile(w, h)) {
      const canvas = compose(composeOpts);
      if (canvas.width !== w || canvas.height !== h) {
        throw new Error(`dimensions ${canvas.width}×${canvas.height}, attendu ${w}×${h}`);
      }
      jpegBlob = await jpegOfCanvas(canvas);
    } else if (kind === 'pdf') {
      tiles = await rasterTiles(composeOpts, w, h);
    } else {
      const safe = exportDpi(fmt);
      const { w: sw, h: sh } = px(fmt, safe);
      const canvas = compose({ ...composeOpts, dpi: safe });
      jpegBlob = await jpegOfCanvas(canvas);
      const stem = printFileStem(fmt, safe);
      const how = await saveBlob(jpegBlob, `${stem}.jpg`);
      if (how === 'abort') {
        status.textContent = 'Téléchargement annulé.';
        return;
      }
      const mb = (jpegBlob.size / 1_048_576).toFixed(1);
      const shareHint = how === 'share' ? ' Choisissez Enregistrer dans Fichiers (ou Imprimer).' : '';
      status.innerHTML = `JPEG <strong>${escapeAttr(stem)}.jpg</strong> · ${escapeAttr(fmt.label)} · ${escapeAttr(safe)} dpi · ${escapeAttr(mb)} Mo (Safari ne tient pas un JPEG ${escapeAttr(dpi)} dpi). Le PDF reste à ${escapeAttr(dpi)} dpi.${escapeAttr(shareHint)}`;
      return;
    }
    const stem = printFileStem(fmt, dpi);
    let blob;
    let name;
    if (kind === 'pdf') {
      if (tiles) {
        blob = jpegTilesToPdfBlob(tiles, w, h, fmt.wIn, fmt.hIn);
      } else {
        const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
        blob = jpegToPdfBlob(jpeg, w, h, fmt.wIn, fmt.hIn);
      }
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
    const tiled = tiles ? ' Composé en tuiles (limite Safari).' : '';
    const shareHint = how === 'share' ? ' Choisissez Enregistrer dans Fichiers (ou Imprimer).' : '';
    status.innerHTML = `Fichier <strong>${escapeAttr(name)}</strong> · ${escapeAttr(fmt.label)} · ${escapeAttr(dpi)} dpi · ${escapeAttr(mb)} Mo.${escapeAttr(tiled)}${escapeAttr(shareHint)} Imprimez à 100 %, sans « ajuster à la page ».`;
  } catch (err) {
    status.textContent = `Téléchargement impossible : ${err.message}`;
  } finally {
    buttons.forEach((b) => { if (b) b.disabled = false; });
  }
}

function syncUploadLab() {
  const box = document.getElementById('photo-upload-box');
  if (box) box.hidden = !isLocalHost();
}

function isUploadFile(file) {
  const type = String(file.type || '').toLowerCase();
  if (/^image\/(jpeg|jpg|png|webp)$/.test(type)) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name || '');
}

async function addUploadedFiles(fileList) {
  if (!isLocalHost()) return;
  const status = document.getElementById('status');
  const files = [...(fileList || [])];
  if (!files.length) return;
  let last = null;
  for (const file of files) {
    if (!isUploadFile(file)) {
      if (status) status.textContent = `Format non pris en charge : ${file.name}. JPEG, PNG ou WebP.`;
      continue;
    }
    const url = URL.createObjectURL(file);
    let img;
    try {
      img = await loadImage(url, false);
    } catch {
      URL.revokeObjectURL(url);
      if (status) status.textContent = `Impossible de lire ${file.name}.`;
      continue;
    }
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (Math.max(w, h) < 800 || Math.min(w, h) < 400) {
      URL.revokeObjectURL(url);
      if (status) status.textContent = `${file.name} est trop petite (${w} × ${h}). Minimum environ 800 px.`;
      continue;
    }
    const title = String(file.name || 'Photo téléversée').replace(/\.[^.]+$/, '') || 'Photo téléversée';
    const photo = {
      id: `local-${++uploadSeq}`,
      url,
      title,
      credit: title,
      width: w,
      height: h,
      local: true,
    };
    state.uploads.push(photo);
    last = { photo, img };
  }
  if (!last) return;
  state.photoId = photoKeyId(last.photo);
  resetCrop(last.photo);
  lastPhotoImg = last.img;
  renderChoices();
  await preview();
}

function syncDpiLab() {
  const lab = document.getElementById('dpi-1200-choice');
  const hint = document.getElementById('dpi-hint');
  const local = isLocalHost();
  if (lab) lab.hidden = !local;
  if (!local && state.dpi === 1200) state.dpi = DEFAULT_DPI;
  syncUploadLab();
  if (hint) {
    if (isAppleTouch()) {
      hint.textContent = '600 dpi par défaut. Sur iPad, le PDF est composé en tuiles ; le JPEG peut descendre si Safari refuse le canevas plein.';
    } else if (local) {
      hint.textContent = '600 dpi par défaut. 300 pour un babillard, 1200 pour un tirage photo.';
    } else {
      hint.textContent = '600 dpi par défaut. 300 pour un babillard.';
    }
  }
}

function syncDpiLabels() {
  const dpi = outputDpi();
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
  const allowed = isUneModel() || campus.bilingual;
  const bi = document.querySelector('label:has(input[name="lang"][value="bilingue"])');
  if (bi) bi.hidden = !allowed;
  if (!allowed && state.lang === 'bilingue') {
    state.lang = 'standard';
    const fr = document.querySelector('input[name="lang"][value="standard"]');
    if (fr) fr.checked = true;
  }
  const uniBox = document.getElementById('uni-toggle');
  if (uniBox) uniBox.hidden = isUneModel() || !campus.line;
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
  const model = q.get('modele') || q.get('model');
  if (model === 'une' || model === 'campus') {
    state.model = model;
    const input = document.querySelector(`input[name="model"][value="${model}"]`);
    if (input) input.checked = true;
  }
  const campus = q.get('campus');
  if (campus && CAMPUSES.some((c) => c.slug === campus)) {
    state.campus = campus;
    if (state.model !== 'une') state.model = 'campus';
    const input = document.querySelector(`input[name="campus"][value="${campus}"]`);
    if (input) input.checked = true;
    const modelCampus = document.querySelector('input[name="model"][value="campus"]');
    if (modelCampus && state.model === 'campus') modelCampus.checked = true;
  }
  const layout = q.get('layout') || q.get('mise');
  if (layout === 'verre' || layout === 'classique') {
    state.layout = layout;
    const input = document.querySelector(`input[name="layout"][value="${layout}"]`);
    if (input) input.checked = true;
  }
  const uni = q.get('uni') || q.get('uneCampus') || q.get('universite');
  if (uni && (uni === 'toutes' || CAMPUSES.some((c) => c.slug === uni))) {
    state.uneCampus = uni;
  }
  const photo = q.get('photo');
  if (photo) state.photoHint = photo;
  const greeting = q.get('greeting');
  if (greeting && Object.prototype.hasOwnProperty.call(GREETINGS, greeting)) {
    state.greeting = greeting;
    const sel = document.getElementById('greeting');
    if (sel) sel.value = greeting;
  }
  syncGenericLangs();
  // Préréglages venus de la galerie du kit (format, langue, QR, langues).
  const presets = {
    format: Object.keys(FORMATS),
    lang: ['standard', 'bilingue', 'minimal'],
    qr: ['oui', 'non'],
    langs: ['oui', 'non'],
  };
  Object.entries(presets).forEach(([name, allowed]) => {
    const value = q.get(name);
    if (!value || !allowed.includes(value)) return;
    const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
    if (name === 'format') state.format = value;
    if (name === 'lang') state.lang = value;
    if (name === 'qr') state.qr = value === 'oui';
    if (name === 'langs') state.langs = value === 'oui';
  });
}

function applyPhotoHint() {
  const hint = fold(state.photoHint || '');
  if (!hint) return;
  const photos = filteredPhotos();
  const hit = photos.find((p) => photoKeyId(p) === state.photoHint)
    || photos.find((p) => fold(`${p.title || ''} ${p.id || ''}`).includes(hint));
  if (!hit) return;
  state.photoId = photoKeyId(hit);
  if (photos.findIndex((p) => photoKeyId(p) === state.photoId) >= 5) state.photoOpen = true;
}

function syncGenericLangs() {
  if (state.campus !== 'generique') return;
  state.langs = true;
  const oui = document.querySelector('input[name="langs"][value="oui"]');
  if (oui) oui.checked = true;
}

function applyChoice(name, value) {
  if (name === 'model') {
    state.model = value === 'une' ? 'une' : 'campus';
    if (isUneModel() && state.layout === 'verre') ensureUnePhoto();
    syncModelUi();
    renderChoices();
    if (isUneModel()) {
      loadUneFeed().then(() => preview());
      return;
    }
  }
  if (name === 'layout') {
    state.layout = value === 'verre' ? 'verre' : 'classique';
    if (state.layout === 'verre') ensureUnePhoto();
    syncModelUi();
    renderChoices();
  }
  if (name === 'uneCampus') {
    state.uneCampus = value || 'toutes';
    if (state.layout === 'verre') {
      state.photoId = null;
      ensureUnePhoto();
      renderChoices();
    }
    loadUneFeed().then(() => preview());
    return;
  }
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
  const upload = document.getElementById('photo-upload');
  if (upload) {
    upload.addEventListener('change', async () => {
      await addUploadedFiles(upload.files);
      upload.value = '';
    });
  }
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

/* posterCredit:start — même règle que bankAttribution (scripts/social/image-resolve.mjs, feedCredit) :
 * une personne « Prénom Nom » → « Photo : Nom · licence » ; un pseudo → « pseudo (Wikimedia Commons, licence) ». */
function posterPersonCredit(c) {
  const t = String(c || '').replace(/^(photo|photos|illustration|crédit|credit)s?\s*:\s*/i, '').trim();
  if (!t || /wiki|commons|unsplash|pexels|pixabay|shutterstock|getty|istock|courtoisie|courtesy|archives?|stock|@|https?:|\d/i.test(t)) return false;
  return /^\p{Lu}[\p{L}'’.-]+(?:\s+(?:(?:de|du|des|da|di|van|von|den|der|la|le|el|al|bin)\s+)*\p{Lu}[\p{L}'’.-]+)+$/u.test(t);
}
function posterCredit(credit, license, url) {
  const c = String(credit || '').trim();
  if (!c) return '';
  const lic = String(license || '').trim();
  if (posterPersonCredit(c)) return `Photo : ${c}${lic ? ` · ${lic}` : ''}`;
  const src = /wiki/i.test(String(url || '')) ? 'Wikimedia Commons' : /flickr/i.test(String(url || '')) ? 'Flickr' : '';
  const extra = [src, lic].filter(Boolean).join(', ');
  return extra ? `${c} (${extra})` : c;
}
/* posterCredit:end */

async function main() {
  bind();
  applyQuery();
  syncDpiLab();
  syncUploadLab();
  syncDpiLabels();
  syncLangChoice();
  syncModelUi();
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
  applyPhotoHint();
  if (isUneModel() && state.layout === 'verre') ensureUnePhoto();
  renderChoices();
  if (isUneModel()) await loadUneFeed();
  await preview();
}

main().catch((err) => {
  document.getElementById('status').textContent = err.message;
});

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
/* Écrans d’affichage dynamique (Une seulement) : taille exacte en pixels, PNG.
 * Hors du bloc FORMATS : les affiches imprimées du kit ne changent pas. 1 « po » virtuel = 100 px. */
const SCREEN_FORMATS = {
  'ecran-paysage': { id: 'ecran-paysage', label: 'Écran 16:9 · 1920 × 1080 px', file: 'ecran-1920x1080', wIn: 19.2, hIn: 10.8, pxW: 1920, pxH: 1080, screen: true },
  'ecran-portrait': { id: 'ecran-portrait', label: 'Écran 9:16 · 1080 × 1920 px', file: 'ecran-1080x1920', wIn: 10.8, hIn: 19.2, pxW: 1080, pxH: 1920, screen: true },
};
Object.assign(FORMATS, SCREEN_FORMATS);

const TITLE = 'LE-RADAR.ca';
const SLOGAN = 'Journaux, radios et sports étudiants du Québec, réunis au même endroit';
const NAME_FULL = 'Le Réseau Académique de Découverte et d’Agrégation de Ressources';
const SLOGAN_EN = 'Student newspapers, radio and sports from Quebec, all in one place';
const INDEP_1 = 'Projet indépendant, non officiel et sans affiliation aux médias ni aux établissements.';
const INDEP_2 = 'Les contenus appartiennent à leurs publications d’origine.';
const INDEP_EN = 'Independent, unofficial and not affiliated. Content belongs to the original publications.';
/* Gabarits d’affiches : 🄯 Azdak, CC BY-SA 4.0. Le code du dépôt reste GNU GPL v2
 * (LICENSE). Les contenus des médias et les photos restent à leurs titulaires (INDEP_2). */
const LICENSE_LINE = '\u{1F12F} Azdak CC BY-SA 4.0';
const LICENSE_FR = LICENSE_LINE;
const LICENSE_EN = LICENSE_LINE;
const LICENSE_BI = LICENSE_LINE;
const LICENSE_MARK = '\u{1F12F}';

function posterLicenseText() {
  return LICENSE_LINE;
}

/* Même graisse et famille que la mention d’indépendance (LR Sans = Inter Regular).
 * Le glyphe copyleft (U+1F12F) vient d’un sous-ensemble Noto Sans Symbols (LR Copyleft). */
function licenseSansFont(size) {
  return `400 ${size}px "LR Sans"`;
}
function licenseMarkFont(size) {
  return `400 ${size}px "LR Copyleft", "LR Sans"`;
}

function measurePosterLicense(ctx, size) {
  const rest = 'Azdak CC BY-SA 4.0';
  const gap = Math.max(2, Math.round(size * 0.22));
  ctx.textBaseline = 'top';
  ctx.font = licenseMarkFont(size);
  const mm = ctx.measureText(LICENSE_MARK);
  const markW = mm.width;
  const markH = (mm.actualBoundingBoxAscent || 0) + (mm.actualBoundingBoxDescent || 0) || size;
  ctx.font = licenseSansFont(size);
  const rm = ctx.measureText(rest);
  const restW = rm.width;
  const restH = (rm.actualBoundingBoxAscent || 0) + (rm.actualBoundingBoxDescent || 0) || size;
  return { rest, gap, markW, restW, width: markW + gap + restW, height: Math.max(markH, restH) };
}

function drawPosterLicense(ctx, { x, y, size, color }) {
  const m = measurePosterLicense(ctx, size);
  const x0 = x - m.width / 2;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = licenseMarkFont(size);
  ctx.fillText(LICENSE_MARK, x0, y);
  ctx.font = licenseSansFont(size);
  ctx.fillText(m.rest, x0 + m.markW + m.gap, y);
  return m.height;
}

const INK = '#F1F2F4';
const SOFT = '#C2C6CD';
const MUTED = '#888D96';
const BG = '#0E0F12';
const PURPLE = '#6C2163';
/* Verbe atténué des matchs dans l’en-tête : blanc 0,65 sur le violet, opaque (4,9:1). */
const mastDimColor = 'rgb(197, 171, 196)';
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

/* Phrase sous « Scanne-moi » : FR, puis EN (mode bilingue des établissements autorisés). */
const UNE_TAGLINES = {
  direct: { label: 'Le fil étudiant, en direct', fr: 'Le fil étudiant, en direct', en: 'Student news, live' },
  auto: { label: 'Automatique (campus ou tout le Radar)' },
  fil: { label: 'Le fil étudiant', fr: 'Le fil étudiant', en: 'The student news feed' },
  tout: { label: 'Tout le Radar étudiant', fr: 'Tout le Radar étudiant', en: 'All student news' },
  campus: { label: 'Ton campus en direct', fr: 'Ton campus en direct', en: 'Your campus, live' },
};
const UNE_PERIOD_LABELS = {
  jour: 'Aujourd’hui (les plus récents)',
  demain: 'Demain (affiche du lendemain)',
  fds: 'Fin de semaine',
  semaine: 'Dernière semaine',
  mois: 'Dernier mois',
  session: 'Cette session',
};
/* Format → densité de la une : en Lettre, moins d’articles plutôt que tout rétrécir. */
const UNE_FORMAT_PLAN = {
  tabloid: { k: 1, side: 2, grid: 4, sports: 4, radio: 3, briefCols: 3, want: { lead: 62, grid: 36, band: 21, briefs: 20 } },
  legal: { k: 0.9, side: 2, grid: 3, sports: 4, radio: 3, briefCols: 2, want: { lead: 56, grid: 36, band: 20, briefs: 22 } },
  letter: { k: 0.84, side: 1, grid: 3, sports: 2, radio: 2, briefCols: 2, want: { lead: 50, grid: 33, band: 15, briefs: 14 } },
  /* Écrans : lecture en quelques secondes, à distance. Pas de brèves, pas de QR d’article. */
  'ecran-paysage': { k: 1.5, side: 3, grid: 0, sports: 4, radio: 2, briefCols: 0, screen: true, rightFrac: 0.42, cardRow: true, want: { lead: 50, grid: 0, band: 12, briefs: 0 } },
  'ecran-portrait': { k: 1.4, side: 0, grid: 3, sports: 4, radio: 2, briefCols: 0, screen: true, want: { lead: 62, grid: 38, band: 20, briefs: 0 } },
};

/* Bilingue seulement pour Concordia, McGill et Bishop’s ; « tous les établissements » reste en français (règle de Charles). */
function uneBilingualAllowed(slug) {
  if (!slug || slug === 'toutes' || slug === 'generique') return false;
  const campus = CAMPUSES.find((c) => c.slug === slug);
  return Boolean(campus && campus.bilingual);
}

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
  langs: false, /* t984u : aucune rangée de langues sur une affiche ni un PDF */
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
  uneMedia: 'tous', /* « tous les médias de l’établissement » ou le slug d’un média */
  uneMediaList: [],
  unePeriod: 'jour',
  uneTagline: 'direct',
  uneLeadPhoto: 'surimpression',
  uneMastGlass: 'givre',
  uneRoles: { aussi: [], vedettes: [], bref: [], masquer: [] },
  uneSportBand: [],
  uneSportSlogan: [],
  uneSportHide: [],
  unePeriodInfo: null,
  uneCandidates: [],
  uneAutoArticles: [],
  uneAutoBriefs: [],
  uneManualIds: [],
  uneLeadId: '',
  uneSports: null,
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
  if (fmt && fmt.screen) return { w: fmt.pxW, h: fmt.pxH };
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
    /* Image vraiment chargée et décodée (pas de vignette vide, pas de chargement paresseux) avant tout rendu. */
    img.onload = () => {
      clearTimeout(t);
      if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) { imageCache.delete(key); reject(new Error(`image vide : ${src}`)); return; }
      const done = () => resolve(img);
      if (typeof img.decode === 'function') img.decode().then(done, done); else done();
    };
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
    new FontFace('LR Emoji', 'url(../assets/kit/fonts/emoji/noto-color-emoji-sports.woff2)'),
    new FontFace('LR Copyleft', 'url(../assets/kit/fonts/noto-sans-symbols-copyleft.woff2)', { weight: '400', style: 'normal', unicodeRange: 'U+1F12F' }),
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

/* Point focal vertical automatique : centre de l’énergie des contours (visages, sujets, scène),
 * calculé une fois sur une vignette 64 px. Repli 0,42 si l’image est illisible (CORS). */
function photoFocalY(img) {
  if (!img) return 0.42;
  if (typeof img.__lrFocalY === 'number') return img.__lrFocalY;
  let fy = 0.42;
  try {
    const sw = img.naturalWidth || img.width || 0;
    const sh = img.naturalHeight || img.height || 0;
    if (sw && sh && typeof document !== 'undefined') {
      const W = 64;
      const H = Math.max(8, Math.round(W * sh / sw));
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data;
      const lum = (i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      let sum = 0;
      let acc = 0;
      for (let y = 1; y < H - 1; y += 1) {
        let row = 0;
        for (let x = 1; x < W - 1; x += 1) {
          const i = (y * W + x) * 4;
          row += Math.abs(lum(i + 4) - lum(i - 4)) + Math.abs(lum(i + W * 4) - lum(i - W * 4));
        }
        sum += row;
        acc += row * (y + 0.5);
      }
      if (sum > 0) fy = Math.max(0.25, Math.min(0.7, acc / sum / H));
    }
  } catch { fy = 0.42; }
  try { img.__lrFocalY = fy; } catch { /* objet figé */ }
  return fy;
}

/* Opacité minimale du voile violet pour que le texte (couleur `txt`) garde le contraste visé
 * sur 99 % des pixels réels de la zone (échantillon réduit). Plafond 0,94 (en-tête opaque d’origine). */
function contrastRatio(a, b) {
  const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  const la = L(a);
  const lb = L(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function mastVeilAlpha(ctx, x, y, w, h, veil, txt, target = 4.5) {
  let px = null;
  try {
    const W = 96;
    const H = Math.max(4, Math.round(W * h / w));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(ctx.canvas, x, y, w, h, 0, 0, W, H);
    px = g.getImageData(0, 0, W, H).data;
  } catch { return 0.94; }
  const pass = (a) => {
    let bad = 0;
    const n = px.length / 4;
    for (let i = 0; i < px.length; i += 4) {
      const bl = [0, 1, 2].map((k) => a * veil[k] + (1 - a) * px[i + k]);
      if (contrastRatio(txt, bl) < target) bad += 1;
    }
    return bad / n <= 0.01;
  };
  for (let a = 0.5; a < 0.94; a += 0.02) if (pass(a)) return Math.round(a * 100) / 100;
  return 0.94;
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

/* Date absolute courte pour l’imprimé (« Ven. 13 nov. ») : jamais « demain » ni « aujourd’hui ». */
const FR_MONTH_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
function posterShortDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return '';
  const wd = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  const d = Number(m[3]);
  return `${['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'][wd]}\u00A0${d === 1 ? '1er' : d}\u00A0${FR_MONTH_SHORT[Number(m[2]) - 1]}`;
}

function posterNextYmd() {
  const d = new Date(`${posterTodayYmd()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function pickPosterSports(masthead, campus, limit = 3, targetYmd = '') {
  const teams = masthead && masthead.teams;
  if (!teams || typeof teams !== 'object') return [];
  const realToday = posterTodayYmd();
  /* Jour visé : aujourd’hui ou, pour l’affiche du lendemain, demain (matchs à venir seulement). */
  const today = targetYmd || realToday;
  const upcoming = [];
  const results = [];
  const seen = new Set();
  Object.values(teams).forEach((team) => {
    if (!team) return;
    const inst = team.institutionName || team.institutionLabel || team.fullName || team.name || '';
    if (campus && !itemMatchesCampusPoster({ institution: inst }, campus)) return;
    const sport = team.sportLabel || team.sport || '';
    /* Genre explicite « (F) » / « (H) » seulement si la donnée le dit ; jamais deviné. */
    const gender = typeof RadarMagazineFrontPage !== 'undefined' && RadarMagazineFrontPage.genderMark ? RadarMagazineFrontPage.genderMark(team.sex) : '';
    const sportTag = [sport, gender].filter(Boolean).join(' ');
    const name = team.name || team.fullName || '';
    const uniBoost = team.sector === 'universitaire' ? 0 : 1;
    (team.nextGames || []).forEach((game) => {
      const id = game.gameId || `${name}-${game.date}-${game.opponent}`;
      const key = `${game.date}|${game.time || ''}|${sportTag}|${game.opponentNickname || game.opponent || ''}`;
      if (seen.has(id) || seen.has(key) || !game.date || game.date < today) return;
      seen.add(id);
      seen.add(key);
      const F = typeof RadarMagazineFrontPage !== 'undefined' ? RadarMagazineFrontPage : null;
      const sides = F && F.gameSides ? F.gameSides(team, game, campus) : { who: name, vs: game.opponentNickname || game.opponent || '' };
      const verb = game.home ? 'reçoit' : 'visite';
      upcoming.push({
        sort: `${uniBoost}-${game.date}-${game.time || ''}`,
        today: game.date === today,
        kicker: sportTag,
        gender,
        emoji: typeof RadarMagazineFrontPage !== 'undefined' && RadarMagazineFrontPage.sportEmoji ? RadarMagazineFrontPage.sportEmoji(sport) : '',
        line: `${sides.who} ${verb} ${sides.vs}`,
        upcoming: true,
        meta: [posterShortDate(game.date), posterClock(game.time)].filter(Boolean).join(' · '),
      });
    });
    (team.results || []).forEach((game) => {
      const id = `r-${game.gameId || `${name}-${game.date}`}`;
      if (seen.has(id) || game.scoreFor == null || game.scoreAgainst == null) return;
      seen.add(id);
      results.push({
        sort: `${uniBoost}-${game.date}`,
        kicker: sportTag,
        gender,
        emoji: typeof RadarMagazineFrontPage !== 'undefined' && RadarMagazineFrontPage.sportEmoji ? RadarMagazineFrontPage.sportEmoji(sport) : '',
        line: (() => {
          const F = typeof RadarMagazineFrontPage !== 'undefined' ? RadarMagazineFrontPage : null;
          const sd = F && F.gameSides ? F.gameSides(team, game, campus) : { who: name, vs: game.opponentNickname || game.opponent || '' };
          return `${sd.who} ${game.scoreFor}–${game.scoreAgainst} ${sd.vs}`;
        })(),
        meta: posterShortDate(game.date) || game.date,
      });
    });
  });
  upcoming.sort((a, b) => {
    if (a.today !== b.today) return a.today ? -1 : 1;
    return String(a.sort).localeCompare(String(b.sort));
  });
  results.sort((a, b) => String(b.sort).localeCompare(String(a.sort)));
  const out = [...upcoming.slice(0, limit)];
  /* Affiche du lendemain : des matchs à venir seulement, jamais d’anciens résultats. */
  if (out.length < limit) out.push(...results.slice(0, limit - out.length));
  return out.slice(0, limit);
}

const CAMPUS_PAGE_PATHS = {
  laval: 'etablissements/universite-laval/',
  mcgill: 'etablissements/mcgill-university/',
  udem: 'etablissements/universite-de-montreal/',
  uqam: 'etablissements/universite-du-quebec-a-montreal/',
  concordia: 'etablissements/concordia-university/',
  sherbrooke: 'etablissements/universite-de-sherbrooke/',
  bishops: 'etablissements/bishops-university/',
};

/* Une v3 : bandeau Radar plein, une dominante, un grand QR d’appel en haut,
 * vedettes à titres seuls, bande sports/radio lisible, En bref numéroté. */
function composeFrontPage(ctx, w, h, opts) {
  /* Toute coupure (« … ») réellement dessinée est notée : les tests et les exports la refusent. */
  const cuts = [];
  const signatures = [];
  if (typeof window !== 'undefined') {
    window.__uneCuts = cuts;
    window.__uneSignatures = signatures;
    if (new URLSearchParams(location.search).has('debugcuts')) {
      const where = new Map();
      window.__uneCutWhere = where;
      const push = cuts.push.bind(cuts);
      cuts.push = (x) => { where.set(x, (new Error().stack || '').split('\n').slice(2, 7).map((l) => (l.match(/:(\d+):\d+\)?$/) || [])[1]).join('<')); return push(x); };
    }
  }
  const c = frontInk();
  const articles = (opts.articles || []).filter(Boolean);
  const images = opts.articleImages || new Map();
  const withQr = Boolean(opts.qr);
  const glass = opts.layout === 'verre';
  const showLangs = false; /* t984u : rangée de langues retirée de toutes les affiches */
  const fmtSpec = FORMATS[opts.format] || FORMATS.tabloid;
  const plan = UNE_FORMAT_PLAN[fmtSpec.id] || UNE_FORMAT_PLAN.tabloid;
  /* 1 u ≈ 0,1 po sur le Tabloid ; un peu plus serré en Légal et en Lettre. */
  const u = (w / fmtSpec.wIn) * 0.1 * plan.k;
  const articleQr = withQr && !plan.screen;
  const px = (n) => Math.max(1, Math.round(n * u));
  const margin = px(4);
  const site = (typeof RadarMagazineFrontPage !== 'undefined' && RadarMagazineFrontPage.SITE)
    ? RadarMagazineFrontPage.SITE
    : 'https://le-radar.ca';
  const Front = typeof RadarMagazineFrontPage !== 'undefined' ? RadarMagazineFrontPage : null;
  const todayIso = opts.date || new Date().toISOString();
  const dateLabel = Front && Front.frDate ? Front.frDate(todayIso, { weekday: true }) : '';
  const capDate = dateLabel ? dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1) : '';
  const campusSlug = opts.campus && opts.campus !== 'toutes' && opts.campus !== 'generique' ? opts.campus : null;
  const campus = campusSlug ? campusOf(campusSlug) : null;
  /* Loi 96 : établissement francophone → français seulement. */
  const bilingual = opts.lang === 'bilingue' && uneBilingualAllowed(campusSlug);
  const period = opts.period || null;
  const dateEn = (bilingual && Front && Front.enDate) ? Front.enDate(todayIso, { weekday: true }) : '';
  const uniLabel = campus
    ? (bilingual && campus.lineEn && campus.lineEn !== campus.line ? `${campus.line}  ·  ${campus.lineEn}` : campus.line)
    : '';
  const ctaUrl = `${site}/${(campusSlug && CAMPUS_PAGE_PATHS[campusSlug]) || ''}`;
  const ctaLabel = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const photo = opts.photoImg || null;
  const credit = (glass && photo && opts.credit) ? posterCredit(opts.credit, opts.license, opts.photoUrl || '') : '';
  const radioLines = (opts.radioLines || []).slice(0, plan.radio);
  let sportsLines = (opts.sportsLines || []).slice();

  const ink = c.ink;
  const mute = glass ? '#3F3A35' : c.mute;
  const DEEP = '#3B1236';
  const LILAC = '#E9C8E3';

  /* Fond */
  if (glass && photo) {
    coverPhoto(ctx, photo, 0, 0, w, h, opts.focalX ?? 0.5, opts.focalY ?? 0.42);
    ctx.fillStyle = 'rgba(18, 16, 14, 0.38)';
    ctx.fillRect(0, 0, w, h);
  } else if (glass) {
    ctx.fillStyle = '#2A2420';
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = c.paper;
    ctx.fillRect(0, 0, w, h);
  }

  const measure = (font, text) => {
    ctx.font = font;
    const m = ctx.measureText(text || 'Hg');
    return (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0) || parseFloat(font) || 12;
  };
  const wrapFit = (text, fontFn, maxW, maxSize, minSize, maxLines) => {
    let size = Math.max(minSize, Math.round(maxSize));
    let lines = [text || ''];
    while (true) {
      ctx.font = fontFn(size);
      lines = wrapWords(ctx, text || '', maxW);
      if (lines.length <= maxLines || size <= minSize) break;
      size -= 1;
    }
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      let last = lines[maxLines - 1] || '';
      while (last.length > 4 && textW(ctx, `${last}…`) > maxW) last = last.slice(0, -1).trimEnd();
      lines[maxLines - 1] = /[….]$/.test(last) ? last : `${last}…`;
      return { size, lines, cut: text };
    }
    return { size, lines };
  };
  /* Texte entier ou première phrase entière, sinon rien (jamais « … »). */
  const wholeFit = (text, fontFn, maxW, maxSize, minSize, maxLines) => {
    const full = String(text || '').trim();
    if (!full || maxLines < 1) return null;
    const first = (full.match(/^.+?[.!?…»](?=\s+[A-ZÀ-ÖØ-Þ«])/) || [])[0];
    for (const t of first && first !== full ? [full, first] : [full]) {
      const f = wrapFit(t, fontFn, maxW, maxSize, minSize, maxLines);
      if (!f.cut) return f;
    }
    return null;
  };
  /* Extrait réel de l’article seulement (hook / chapô / excerpt déjà tronqué en phrases). */
  const hookText = (art) => {
    const raw = [art?.hook, art?.hookShort, art?.hookLong, art?.leadExcerpt, art?.excerpt]
      .map((t) => String(t || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t && !t.endsWith('…') && !t.endsWith('...'));
    return raw[0] || '';
  };
  const paintHook = (text, x, y, maxW, maxSize, minSize, maxLines, color, floorY) => {
    if (!text || maxLines < 1 || floorY - y < minSize) return y;
    const f = wholeFit(text, sans(400), maxW, maxSize, minSize, maxLines);
    if (!f) return y;
    return drawLines(f, sans(400), x, y, color, 1.25, floorY);
  };
  const drawLines = (fit, fontFn, x, y, color, lead = 1.16, floor = Infinity) => {
    let yy = y;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    if (fit.cut) cuts.push(fit.cut);
    fit.lines.forEach((line) => {
      ctx.font = fontFn(fit.size);
      if (yy + fit.size > floor) { cuts.push(line); return; }
      ctx.fillText(line, x, yy);
      yy += Math.round(fit.size * lead);
    });
    return yy;
  };
  const sans = (wt) => (s) => `${wt} ${s}px ${wt >= 600 ? '"LR Sans Semi", "LR Sans"' : '"LR Sans"'}`;
  const serif = (s) => `700 ${s}px "LR Serif"`;
  /* Verbe de rencontre (« reçoit », « visite », « chez », « vs », « à ») plus pâle que les noms,
   * comme la bande sports du site (.sports-chip__vs : poids 500, 0,88 em, blanc atténué). */
  /* Couleur d’établissement (brand-colors.json, module partagé avec La une sociale) ajustée AA sur les fonds donnés ; repli : accent. */
  const IC = typeof RadarInstitutionColor !== 'undefined' ? RadarInstitutionColor : null;
  const instColor = (name, bgs, accent) => (IC && opts.brand ? IC.paint(name, opts.brand, bgs, accent) : accent);
  const BG_LIGHT = glass ? [[255, 252, 247], [199, 197, 193]] : [[244, 240, 230], [255, 255, 255]];
  const BG_BAND = [[59, 18, 54], [79, 42, 74]];
  const BG_MAST = [[108, 33, 99], [59, 18, 54], [67, 67, 67]];
  const BG_OVERLAY = [[20, 8, 20], [72, 62, 72]];
  /* Texte d’une couleur, avec un passage (nom du média, de la station) dans la couleur de l’établissement. */
  const fillWithSpan = (text, x, y, base, span, spanColor, align = 'left') => {
    let i = span && spanColor && spanColor !== base ? text.indexOf(span) : -1;
    if (i < 0 && span && spanColor && spanColor !== base) {
      /* Nom du média coupé en fin ou en début de ligne : la partie visible garde la couleur. */
      const words = String(span).split(/\s+/);
      for (let k = words.length - 1; k >= 1 && i < 0; k -= 1) {
        const head = words.slice(0, k).join(' ');
        const tail = words.slice(words.length - k).join(' ');
        if (text.trimEnd().endsWith(head)) { span = head; i = text.trimEnd().length - head.length; }
        else if (text.startsWith(tail)) { span = tail; i = 0; }
      }
    }
    if (i < 0) { ctx.fillStyle = base; ctx.fillText(text, x, y); return; }
    const parts = [[text.slice(0, i), base], [span, spanColor], [text.slice(i + span.length), base]];
    const total = ctx.measureText(text).width;
    const prevAlign = ctx.textAlign;
    let xx = align === 'right' ? x - total : x;
    ctx.textAlign = 'left';
    parts.forEach(([t, col]) => { if (!t) return; ctx.fillStyle = col; ctx.fillText(t, xx, y); xx += ctx.measureText(t).width; });
    ctx.textAlign = prevAlign;
  };
  const metaColor = (art, bgs, accent) => instColor(art && art.institution, bgs, accent);
  const drawRich = (text, fontFn, size, x, y, color, dim, emojiFont = false, bgs = null) => {
    const m = /( (?:reçoit|visite|chez|vs|à|hosts|visits|at) )/.exec(text);
    const parts0 = m ? [[text.slice(0, m.index), false], [m[1], true], [text.slice(m.index + m[1].length), false]] : [[text, false]];
    /* Parenthèses d’établissement (« (Concordia) ») dans la couleur de l’établissement. */
    const parts = [];
    parts0.forEach(([t, isDim]) => {
      if (isDim || !bgs) { parts.push([t, isDim]); return; }
      let last = 0;
      t.replace(/\(([^)]+)\)/g, (all, inner, at) => {
        if (at > last) parts.push([t.slice(last, at), false]);
        const col = instColor(inner, bgs, '');
        parts.push([all, false, col || '']);
        last = at + all.length;
        return all;
      });
      if (last < t.length) parts.push([t.slice(last), false]);
    });
    const tail = emojiFont ? ', "LR Emoji"' : '';
    ctx.textBaseline = 'alphabetic';
    const base = y + Math.round(size * 0.93);
    let xx = x;
    parts.forEach(([t, isDim, col]) => {
      if (!t) return;
      const z = isDim ? Math.round(size * 0.88) : size;
      ctx.font = isDim ? `500 ${z}px "LR Sans"${tail}` : `${fontFn(z)}${tail}`;
      ctx.fillStyle = isDim ? dim : (col || color);
      ctx.fillText(t, xx, base);
      xx += ctx.measureText(t).width;
    });
    ctx.textBaseline = 'top';
  };
  const drawRichLines = (fit, fontFn, x, y, color, dim, lead = 1.16, floor = Infinity, bgs = null) => {
    let yy = y;
    if (fit.cut) cuts.push(fit.cut);
    fit.lines.forEach((line) => {
      if (yy + fit.size > floor) { cuts.push(line); return; }
      drawRich(line, fontFn, fit.size, x, yy, color, dim, false, bgs);
      yy += Math.round(fit.size * lead);
    });
    return yy;
  };
  const fitOne = (text, fontFn, size, maxW) => {
    ctx.font = fontFn(size);
    let t = String(text || '');
    const orig = t;
    while (t.length > 3 && textW(ctx, t) > maxW) t = `${t.slice(0, -2).trimEnd()}…`;
    if (t !== orig) cuts.push(orig);
    return t;
  };
  /* Titre qui coule sur toute la largeur puis se resserre à côté d’un QR. */
  const fitFlow = (text, fontFn, maxSize, minSize, y, fullW, narrowW, narrowFromY, floor, lead = 1.1) => {
    const words = String(text || '').split(/[^\S\u00A0\u202F]+/).filter(Boolean);
    let size = Math.max(minSize, Math.round(maxSize));
    let out = null;
    while (true) {
      ctx.font = fontFn(size);
      const lh = Math.round(size * lead);
      const lines = [];
      let yy = y;
      let i = 0;
      let overflow = false;
      while (i < words.length) {
        if (yy + size > floor) { overflow = true; break; }
        const maxW = (yy + size > narrowFromY) ? narrowW : fullW;
        let line = words[i];
        i += 1;
        while (i < words.length && textW(ctx, `${line} ${words[i]}`) <= maxW) { line = `${line} ${words[i]}`; i += 1; }
        lines.push({ text: line, y: yy, maxW });
        yy += lh;
      }
      out = { size, lines, end: yy, overflow };
      if (!overflow || size <= minSize) break;
      size -= 1;
    }
    if (out.overflow && out.lines.length) {
      const last = out.lines[out.lines.length - 1];
      let t = last.text;
      ctx.font = fontFn(out.size);
      while (t.length > 4 && textW(ctx, `${t}…`) > last.maxW) t = t.slice(0, -1).trimEnd();
      last.text = `${t.replace(/[\s,;:]+$/, '')}…`;
      out.cut = String(text || '');
    }
    return out;
  };
  const drawFlow = (f, fontFn, x, color) => {
    if (f.cut) cuts.push(f.cut);
    ctx.font = fontFn(f.size);
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    f.lines.forEach((l) => ctx.fillText(l.text, x, l.y));
    return f.end;
  };
  const panel = (x, y, pw, ph, fill) => {
    if (glass) frostedRect(ctx, x, y, pw, ph, px(1.2), fill ? { fill } : undefined);
  };
  const rule = (xA, xB, yy, weight = 1) => {
    if (glass) return;
    ctx.strokeStyle = c.rule;
    ctx.lineWidth = Math.max(1, Math.round(u * 0.12 * weight));
    ctx.beginPath();
    ctx.moveTo(xA, yy);
    ctx.lineTo(xB, yy);
    ctx.stroke();
  };
  const vrule = (x, yA, yB) => {
    if (glass) return;
    ctx.strokeStyle = c.rule;
    ctx.lineWidth = Math.max(1, Math.round(u * 0.12));
    ctx.beginPath();
    ctx.moveTo(x, yA);
    ctx.lineTo(x, yB);
    ctx.stroke();
  };
  const label = (text, x, y, color = PURPLE, size = px(1.6)) => {
    ctx.font = `700 ${size}px "LR Sans Semi", "LR Sans"`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    ctx.fillText(text.toUpperCase(), x, y);
    return y + Math.round(size * 1.45);
  };
  const paintImage = (img, x, y, iw, ih, fy, source) => {
    ctx.save();
    roundedRectPath(ctx, x, y, iw, ih, glass ? px(0.6) : 0);
    ctx.clip();
    if (img) coverPhoto(ctx, img, x, y, iw, ih, 0.5, fy ?? 0.5);
    else {
      ctx.fillStyle = glass ? 'rgba(90, 84, 76, 0.28)' : c.photoBg;
      ctx.fillRect(x, y, iw, ih);
      if (source) {
        ctx.font = `600 ${px(1.8)}px "LR Sans Semi", "LR Sans"`;
        ctx.fillStyle = mute;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(source, x + iw / 2, y + ih / 2);
        ctx.textAlign = 'left';
      }
    }
    ctx.restore();
  };
  const creditLine = (text, x, y, maxW) => {
    if (!text) return 0;
    const s = Math.max(8, px(0.85));
    ctx.font = `400 ${s}px "LR Sans"`;
    ctx.fillStyle = mute;
    ctx.textBaseline = 'top';
    /* Crédit entier (attribution) : une ligne, sinon deux, jamais coupé. */
    const t = String(text).replace(/\s+/g, ' ').trim();
    let lines = wrapWords(ctx, t, maxW);
    if (lines.length > 2) {
      ctx.font = `400 ${Math.max(7, Math.round(s * 0.85))}px "LR Sans"`;
      lines = wrapWords(ctx, t, maxW);
    }
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * Math.round(s * 1.15)));
    return lines.length * Math.round(s * 1.15) - Math.round(s * 0.15) + px(0.4);
  };
  const metaOf = (art) => [art.source, art.dateLabel].filter(Boolean).join('  ·  ');
  /* Signature « Par tous les auteurs · Média · date » : on passe à la ligne ou on réduit
   * le corps ; on ne coupe jamais un nom et on n’omet jamais un auteur pour caser la date. */
  const bylineFor = (art, maxNames = Infinity) => (Front && Front.bylineOf
    ? Front.bylineOf(art.authors || [], art.source || '', { maxNames })
    : (art.source || ''));
  const signatureText = (art, withDate = true) => (Front && Front.signatureOf
    ? Front.signatureOf(art, { withDate })
    : [bylineFor(art, Infinity), withDate ? art.dateLabel : ''].filter(Boolean).join(' · '));
  const metaPick = (art, maxW, fontFn, size, opts = {}) => {
    const withDate = opts.withDate !== false;
    const leadR = opts.lead || 1.25;
    const text = signatureText(art, withDate);
    if (!text) return { lines: [], size, text: '' };
    const minS = opts.minSize != null ? opts.minSize : Math.max(7, Math.round(size * 0.68));
    const trySize = (s) => {
      ctx.font = fontFn(s);
      const lines = wrapWords(ctx, text, maxW);
      const overflow = text.split(/[^\S\u00A0\u202F]+/).some((tok) => ctx.measureText(tok).width > maxW);
      return { lines, overflow, h: lines.length * Math.round(s * leadR) };
    };
    for (let s = size; s >= minS; s -= 1) {
      const t = trySize(s);
      const linesOk = !opts.maxLines || t.lines.length <= opts.maxLines;
      const hOk = opts.maxH == null || t.h <= opts.maxH;
      if (linesOk && hOk && !t.overflow) return { lines: t.lines, size: s, text };
    }
    const t = trySize(minS);
    return { lines: t.lines, size: minS, text };
  };
  const noteSignature = (art, role, fit) => {
    signatures.push({
      role,
      title: art.title || '',
      authors: [...(art.authors || [])],
      source: art.source || '',
      dateLabel: art.dateLabel || '',
      text: (fit.lines || []).join(' '),
      size: fit.size,
    });
  };
  const paintSignature = (art, role, x, y, maxW, preferSize, color, bgs, opts = {}) => {
    const leadR = opts.lead || 1.25;
    const fit = metaPick(art, maxW, sans(600), preferSize, opts);
    const lh = Math.round(fit.size * leadR);
    ctx.font = sans(600)(fit.size);
    ctx.textBaseline = 'top';
    fit.lines.forEach((line, i) => fillWithSpan(line, x, y + i * lh, color, art.source, metaColor(art, bgs, color)));
    noteSignature(art, role, fit);
    return { ...fit, height: fit.lines.length * lh, lead: leadR };
  };

  const x0 = margin;
  const x1 = w - margin;
  const contentW = x1 - x0;
  const gap = px(2.2);

  /* 1. Bandeau Radar plein */
  const logoS = px(plan.screen ? 8 : 9.5);
  /* Page étroite : le titre rétrécit pour laisser au moins 26 u au bloc de droite. */
  let titleS = px(plan.screen ? 6.6 : 7.4);
  ctx.font = `700 ${titleS}px "LR Serif"`;
  while (titleS > px(4) && x0 + logoS + px(2) + trackedWidth(ctx, TITLE, titleS) > x1 - px(29)) titleS -= 1;
  const tagS = px(1.9);
  const mastTop = 0;
  /* Bloc de droite (université, période, date) : coupé en lignes, jamais tronqué. */
  ctx.font = `700 ${titleS}px "LR Serif"`;
  const titleRight = x0 + logoS + px(2) + trackedWidth(ctx, TITLE, titleS);
  const maxRight = Math.max(px(20), x1 - titleRight - px(3));
  const rightLines = [];
  /* Jamais de coupure dans une date : lignes seulement après une virgule, taille ajustée pour tenir. */
  const pushNoBreak = (text, wt, size, color) => {
    if (!text) return;
    const segs = Front && Front.mastheadSegments ? Front.mastheadSegments(text) : [String(text).replace(/ /g, '\u00A0')];
    const minS = Math.max(9, Math.round(size * 0.62));
    const fits = (t, sz) => { ctx.font = sans(wt)(sz); return ctx.measureText(t).width <= maxRight; };
    const lines = [];
    segs.forEach((seg) => {
      const cand = lines.length ? `${lines[lines.length - 1]}\u00A0${seg}` : '';
      if (cand && fits(cand, Math.round(size * 0.9))) lines[lines.length - 1] = cand;
      else lines.push(seg);
    });
    let sz = Math.round(size);
    while (sz > minS && !lines.every((l) => fits(l, sz))) sz -= 1;
    lines.forEach((line) => rightLines.push({ text: line, wt, size: sz, color }));
  };
  if (campus) {
    pushNoBreak(campus.line, 700, px(2.5), '#ffffff');
    if (bilingual && campus.lineEn && campus.lineEn !== campus.line) pushNoBreak(campus.lineEn, 400, px(1.9), LILAC);
  }
  if (period && period.id && !period.live) {
    /* Période passée : la plage (avec l’année) remplace la date du jour, qui sonnerait faux. */
    pushNoBreak(period.fr, 700, px(2.1), '#ffffff');
    if (bilingual && period.en) pushNoBreak(period.en, 400, px(1.75), LILAC);
  } else {
    const frDay = period && period.id === 'demain' ? period.fr : capDate;
    const enDay = period && period.id === 'demain' ? (bilingual ? period.en : '') : dateEn;
    pushNoBreak(frDay, 700, px(2.1), '#ffffff');
    if (enDay) pushNoBreak(enDay, 400, px(1.7), LILAC);
    if (opts.mastNote) pushNoBreak(opts.mastNote, 400, px(1.6), LILAC);
    if (bilingual && opts.mastNoteEn) pushNoBreak(opts.mastNoteEn, 400, px(1.45), LILAC);
  }
  const rightH = rightLines.reduce((sum, l) => sum + Math.round(l.size * 1.3), 0);
  const rowTop = px(2.6);
  const logoRowH = Math.max(logoS, rightH + px(0.4));
  /* Encart du haut à droite (à côté de l’accroche) : grille radio, match, chiffre clé — données réelles seulement. */
  const tagRowsH = Math.round(tagS * 1.35) * (bilingual ? 2 : 1);
  ctx.font = `400 ${tagS}px "LR Sans"`;
  const tagW = Math.max(ctx.measureText(SLOGAN).width, bilingual ? ctx.measureText(SLOGAN_EN).width : 0);
  const extraW = x1 - (x0 + tagW + px(3));
  let extra = opts.mastExtras && opts.mastExtras.lines && opts.mastExtras.lines.length && extraW >= px(16) ? { ...opts.mastExtras, lines: opts.mastExtras.lines.slice() } : null;
  const exHeadS = px(1.35);
  const exLineS = px(1.65);
  /* Aucune coupure dans l’encart : une ligne qui ne tient pas même à 70 % est remplacée par la suivante ;
   * un titre trop long se réduit au nom de la station ; un encart « strict » (match) perd tout plutôt qu’une moitié. */
  if (extra) {
    ctx.font = `600 ${Math.round(exLineS * 0.7)}px "LR Sans Semi", "LR Sans", "LR Emoji"`;
    const fits = (l) => ctx.measureText(l).width <= extraW;
    const kept = extra.lines.filter(fits);
    extra.lines = extra.strict && kept.length !== extra.lines.length ? [] : kept;
    /* Combo : une émission + le chiffre (s’il tient), toujours dans cet ordre. */
    if (extra.tail !== undefined) extra.lines = [extra.lines[0], extra.tail && fits(extra.tail) ? extra.tail : null].filter(Boolean);
    ctx.font = `600 ${exHeadS}px "LR Sans Semi", "LR Sans"`;
    if (ctx.measureText(String(extra.title || '').toUpperCase()).width > extraW) {
      const short = String(extra.colorText || '');
      if (short && ctx.measureText(short.toUpperCase()).width <= extraW) extra.title = short;
      else extra.lines = [];
    }
    if (!extra.lines.length) extra = null;
  }
  const extraH = extra ? Math.round(exHeadS * 1.35) + extra.lines.length * Math.round(exLineS * 1.3) : 0;
  /* Sous l’accroche, à côté de l’encart : matchs à venir de l’établissement (dates absolues),
   * retirés de la bande sports pour éviter tout doublon. */
  const gameS = Math.max(10, Math.round(tagS * 0.8));
  const gameLineH = Math.round(gameS * 1.3);
  /* 2 à 4 matchs selon le format : l’en-tête grandit un peu, l’encart radio s’aligne dessus. */
  const gameTarget = { letter: 3, legal: 3, tabloid: 4, 'ecran-paysage': 2, 'ecran-portrait': 3 }[fmtSpec.id] || 2;
  /* Émissions de l’encart radio : autant que la hauteur en tient (3 en Lettre, 4 en Tabloïd). */
  const extraTarget = { letter: 3, legal: 3, tabloid: 4, 'ecran-paysage': 2, 'ecran-portrait': 3 }[fmtSpec.id] || 2;
  const mastGames = [];
  {
    const up = (opts.mastGames || []).filter((g) => g && (g.upcoming || opts.mastGamesManual));
    const bandKeys = new Set(sportsLines.filter((x) => !x.upcoming).map((x) => `${x.line}|${x.meta}`));
    const pool = up.length ? up : (opts.mastGames || []).filter((g) => g && !g.upcoming && !bandKeys.has(`${g.line}|${g.meta}`));
    pool.slice(0, gameTarget).forEach((g) => mastGames.push(g));
  }
  let leftH = tagRowsH + (mastGames.length ? px(0.3) + mastGames.length * gameLineH : 0);
  /* L’encart de droite garde autant de lignes que la colonne de gauche en occupe (ni vide ni débord). */
  if (extra) {
    const per = Math.round(exLineS * 1.3);
    const head = Math.round(exHeadS * 1.35);
    extra.lines = extra.lines.slice(0, extraTarget);
    while (extra.lines.length > 1 && head + extra.lines.length * per > Math.max(leftH, head + per) + Math.round(per * 0.6)) extra.lines = extra.lines.slice(0, -1);
  }
  let extrasW = 0;
  if (extra) {
    ctx.font = `600 ${exLineS}px "LR Sans Semi", "LR Sans"`;
    extrasW = Math.min(extraW, Math.max(...extra.lines.map((l) => ctx.measureText(l).width)));
  }
  const gameW = x1 - x0 - (extra ? extrasW + px(3) : 0);
  /* Matchs sous l’accroche : celui qui ne tient pas entier (même à 72 %) est retiré, jamais coupé. */
  {
    ctx.font = `600 ${Math.round(gameS * 0.72)}px "LR Sans Semi", "LR Sans", "LR Emoji"`;
    for (let i = mastGames.length - 1; i >= 0; i -= 1) {
      const g = mastGames[i];
      const text = `${g.emoji ? `${g.emoji} ` : ''}${g.gender ? `${g.gender} ` : ''}${g.meta} · ${g.line}`;
      if (ctx.measureText(text).width > gameW) mastGames.splice(i, 1);
    }
    leftH = tagRowsH + (mastGames.length ? px(0.3) + mastGames.length * gameLineH : 0);
  }
  const extraHFit = extra ? Math.round(exHeadS * 1.35) + extra.lines.length * Math.round(exLineS * 1.3) : 0;
  if (mastGames.length) {
    const used = new Set(mastGames.map((g) => `${g.line}|${g.meta}`));
    sportsLines = sportsLines.filter((x) => !used.has(`${x.line}|${x.meta}`));
  }
  sportsLines = sportsLines.slice(0, plan.sports);
  const mastH = rowTop + logoRowH + px(1.2) + Math.max(leftH, extraHFit) + px(2);
  const mastMode = glass && photo ? (opts.mastGlass || 'givre') : 'opaque';
  if (mastMode === 'opaque') {
    ctx.fillStyle = glass ? 'rgba(108, 33, 99, 0.94)' : PURPLE;
    ctx.fillRect(0, mastTop, w, mastH);
  } else {
    /* La photo de fond transparaît dans l’en-tête : verre givré (flou) ou voile violet simple.
     * L’opacité est calculée sur la photo réelle pour que le plus petit texte lilas reste AA (≥ 4,5:1). */
    if (mastMode === 'givre') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, mastTop, w, mastH);
      ctx.clip();
      ctx.filter = `blur(${Math.max(2, px(1.2))}px)`;
      ctx.drawImage(ctx.canvas, 0, mastTop, w, mastH, 0, mastTop, w, mastH);
      ctx.filter = 'none';
      ctx.restore();
    }
    /* Le texte le plus pâle de l’en-tête (verbe atténué des matchs) fixe l’opacité minimale. */
    const a = mastVeilAlpha(ctx, 0, mastTop, w, mastH, [108, 33, 99], [197, 171, 196], 4.5);
    ctx.fillStyle = `rgba(108, 33, 99, ${a.toFixed(3)})`;
    ctx.fillRect(0, mastTop, w, mastH);
  }
  ctx.fillStyle = DEEP;
  ctx.fillRect(0, mastTop + mastH - px(0.6), w, px(0.6));
  let my = rowTop;
  /* Pictogramme directement sur le violet, sans le carré blanc derrière l’icône. */
  const mark = assets.logoMark || assets.logo;
  if (mark) {
    const inset = px(0.7);
    ctx.drawImage(mark, x0 + inset, my + inset, logoS - inset * 2, logoS - inset * 2);
  }
  fillTracked(ctx, TITLE, my + Math.round((logoS - titleS) / 2), titleS, '#ffffff', x0 + logoS + px(2));
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  /* Bloc de droite centré sur la rangée du logo : pas de vide sous la date. */
  let ry = my + Math.max(px(0.4), Math.round((logoRowH - rightH) / 2));
  rightLines.forEach((l) => {
    ctx.font = sans(l.wt)(l.size);
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, x1, ry);
    ry += Math.round(l.size * 1.3);
  });
  ctx.textAlign = 'left';
  my += logoRowH + px(1.2);
  if (extra) {
    let ey = my;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = `600 ${exHeadS}px "LR Sans Semi", "LR Sans"`;
    {
      /* Nom de la station dans la couleur de son établissement (AA sur l’en-tête). */
      const head = fitOne(String(extra.title || '').toUpperCase(), sans(600), exHeadS, extraW);
      const span = extra.colorText ? String(extra.colorText).toUpperCase() : '';
      fillWithSpan(head, x1, ey, LILAC, span, extra.colorInst ? instColor(extra.colorInst, BG_MAST, LILAC) : '', 'right');
    }
    ey += Math.round(exHeadS * 1.35);
    /* Taille commune à toutes les lignes (t984u) : la plus longue fixe la taille (au plus −30 %),
     * puis troncature propre « … » seulement si elle ne tient toujours pas. Même style partout. */
    const emojiFont = (z) => `600 ${z}px "LR Sans Semi", "LR Sans", "LR Emoji"`;
    let exZ = exLineS;
    ctx.font = emojiFont(exZ);
    const widest = () => Math.max(...extra.lines.map((l) => ctx.measureText(l).width));
    while (exZ > Math.round(exLineS * 0.7) && widest() > extraW) { exZ -= 1; ctx.font = emojiFont(exZ); }
    extra.lines.forEach((line) => {
      ctx.font = emojiFont(exZ);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(fitOne(line, emojiFont, exZ, extraW), x1, ey);
      ey += Math.round(exLineS * 1.3);
    });
    ctx.textAlign = 'left';
  }
  ctx.font = `400 ${tagS}px "LR Sans"`;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  ctx.fillText(fitOne(SLOGAN, sans(400), tagS, contentW), x0, my);
  my += Math.round(tagS * 1.35);
  if (bilingual) {
    ctx.fillStyle = LILAC;
    ctx.fillText(fitOne(SLOGAN_EN, sans(400), tagS, contentW), x0, my);
    my += Math.round(tagS * 1.35);
  }
  if (mastGames.length) {
    let gy = my + px(0.3);
    const gameFont = (z) => `600 ${z}px "LR Sans Semi", "LR Sans", "LR Emoji"`;
    mastGames.forEach((g) => {
      const text = `${g.emoji ? `${g.emoji} ` : ''}${g.gender ? `${g.gender} ` : ''}${g.meta} · ${g.line}`;
      let z = gameS;
      ctx.font = gameFont(z);
      while (z > Math.round(gameS * 0.72) && ctx.measureText(text).width > gameW) { z -= 1; ctx.font = gameFont(z); }
      /* Sur le violet de l’en-tête, 0,55 tomberait à 3,9:1 : 0,65 (4,9:1, AA). */
      drawRich(fitOne(text, gameFont, z, gameW), (q) => `600 ${q}px "LR Sans Semi", "LR Sans"`, z, x0, gy, '#ffffff', mastDimColor, true, BG_MAST);
      gy += gameLineH;
    });
  }

  /* 2. Pied : mention d’indépendance + ligne des langues */
  const legalSize = Math.max(9, px(1.15));
  const fit = Math.min(w / (11 * REF_DPI), h / (17 * REF_DPI));
  const fLang = Math.min(26 * fit, Math.round(62 * fit) * 0.48);
  const iconS = Math.min(36 * fit, Math.round(62 * fit) * 0.64);
  ctx.font = `400 ${legalSize}px "LR Sans"`;
  const legalLines = [
    ...wrapWords(ctx, `${INDEP_1} ${INDEP_2}`, contentW),
    ...(bilingual ? wrapWords(ctx, INDEP_EN, contentW) : []),
  ];
  const legalLineH = Math.round(legalSize * 1.3);
  /* Nom complet du Radar (signature du pied du site), centré au-dessus de la mention d’indépendance. */
  const nameSize = Math.max(10, px(1.45));
  const nameLineH = Math.round(nameSize * 1.35);
  const langsMetrics = showLangs
    ? measureLangsFooter(ctx, { maxW: contentW, size: fLang, iconS, lineGap: 4, iconGap: 6 })
    : { height: 0, lines: [] };
  const creditS = credit ? Math.max(8, px(0.85)) + px(0.4) : 0;
  const licSize = Math.max(8, px(0.8));
  const licLineH = Math.round(licSize * 1.25);
  const footPad = px(0.9);
  const footH = footPad + nameLineH + legalLines.length * legalLineH + (langsMetrics.height ? px(0.6) + langsMetrics.height : 0) + creditS + licLineH + px(0.15) + footPad;
  /* Marge sûre d’impression : le pied reste à au moins 0,25 po du bord bas (zone non imprimable). */
  const safeIn = plan.screen ? px(1.2) : Math.max(px(1.2), Math.round((w / fmtSpec.wIn) * 0.25));
  const footY = h - safeIn - footH;

  /* 3. Répartition verticale */
  const lead = articles[0] || null;
  const rest = articles.slice(1);
  const sideArts = rest.slice(0, plan.side);
  const gridArts = rest.slice(plan.side, plan.side + plan.grid);
  const briefs = plan.screen ? [] : [...rest.slice(plan.side + plan.grid), ...(opts.briefs || [])].filter(Boolean);
  const hasBand = sportsLines.length > 0 || radioLines.length > 0;
  const top = mastTop + mastH + px(2.4);
  const bottom = footY - px(1.4);
  const avail = bottom - top;
  const want = {
    lead: lead ? plan.want.lead : 0,
    grid: gridArts.length ? plan.want.grid : 0,
    band: hasBand ? plan.want.band : 0,
    briefs: briefs.length ? plan.want.briefs : 0,
  };
  const blocks = Object.keys(want).filter((k) => want[k]);
  const gapsH = Math.max(0, blocks.length - 1) * px(2.4);
  const totalWant = blocks.reduce((s, k) => s + want[k], 0) || 1;
  /* Les blocs absents rendent leur place : priorité à la une et aux brèves. */
  const scale = (avail - gapsH) / (totalWant * u);
  const bh = {};
  blocks.forEach((k) => { bh[k] = Math.round(want[k] * u * (k === 'band' ? Math.min(scale, 1.15) : scale)); });
  const spare = (avail - gapsH) - blocks.reduce((s, k) => s + bh[k], 0);
  if (spare > 0 && bh.lead) bh.lead += spare;
  else if (spare > 0 && blocks.length && lead) bh[blocks[0]] += spare;
  /* La bande garde au moins une rangée lisible ; la une cède la différence. */
  if (bh.band && bh.band < px(11) && bh.lead) {
    const d = px(11) - bh.band;
    bh.band += d;
    bh.lead -= d;
  }

  let cy = top;
  if (!lead) {
    panel(x0, cy, contentW, px(8));
    const none = wrapFit('Aucun article sur cette période. Choisissez une période plus longue.', sans(400), contentW - px(3), px(2.2), Math.max(9, px(1.3)), 2);
    drawLines(none, sans(400), x0 + px(1.5), cy + (none.lines.length > 1 ? px(1.4) : px(2.5)), glass ? ink : mute, 1.25);
    /* Sans article : la bande garde sa hauteur normale sous le message, sans s’étirer. */
    cy += px(8) + px(2.4);
  }

  /* 4. La une + colonne d’appel (grand QR) */
  if (lead) {
    const rowH = bh.lead;
    const showCta = withQr || sideArts.length > 0;
    const rightW = showCta ? Math.round(contentW * (plan.rightFrac || 0.32)) : 0;
    const leadW = showCta ? contentW - rightW - gap : contentW;
    const p = glass ? px(1.4) : 0;
    panel(x0, cy, leadW, rowH);
    const lx = x0 + p;
    const lw = leadW - p * 2;
    let ly = cy + p;
    const floor = cy + rowH - p;
    const img = lead.key ? images.get(lead.key) : null;
    const capS = px(1.3);
    const creditH = lead.credit ? Math.max(8, px(0.85)) + px(0.4) : 0;
    /* Le titre cède d’abord (taille, lignes), puis le QR, pour garder une vraie photo. */
    const minImg = Math.round((floor - ly) * (plan.screen ? 0.42 : 0.3));
    let leadQr = articleQr && lead.pageUrl ? px(12) : 0;
    let tProbe = null;
    let titleH = 0;
    for (let ts = 5.6; ts >= 3; ts -= 0.4) {
      tProbe = wrapFit(lead.title, serif, lw, px(ts), px(3), 3);
      titleH = tProbe.lines.length * Math.round(tProbe.size * 1.08);
      const rest = floor - ly - px(1.2) - creditH - titleH - px(1) - (leadQr ? leadQr + px(2.2) : px(6));
      if (rest >= minImg) break;
    }
    const qrRowH = leadQr ? leadQr + px(2.2) : px(6);
    const leadMode = opts.leadPhoto || 'surimpression';
    const autoFy = img ? (lead.focalY ?? photoFocalY(img)) : (lead.focalY ?? 0.5);
    if (leadMode === 'surimpression' && img) {
      /* Option C (focus-group) : la photo occupe tout le bloc de la une, à son ratio presque natif ;
       * titre, signature et chapeau posés sur un dégradé sombre en bas (contraste AA), QR sur tuile blanche. */
      const phH = floor - ly;
      ctx.save();
      roundedRectPath(ctx, lx, ly, lw, phH, glass ? px(0.6) : 0);
      ctx.clip();
      /* Le sujet est gardé dans les 55 % du haut, au-dessus du texte. */
      /* Image très verticale (affiche, illustration en portrait) : un recadrage plein bloc n’en garderait qu’une
       * bande (t985u, « Les jeunes cyniques ? ») ; elle est alors montrée ENTIÈRE à droite, sur un fond flou
       * de la même image, et le texte prend la colonne de gauche. */
      const isw = img.naturalWidth || img.width || 1;
      const ish = img.naturalHeight || img.height || 1;
      const tall = isw / ish < (lw / phH) * 0.62;
      let colW = lw;
      if (tall) {
        ctx.filter = `blur(${Math.max(4, px(2.4))}px)`;
        coverPhoto(ctx, img, lx - px(3), ly - px(3), lw + px(6), phH + px(6), 0.5, 0.5);
        ctx.filter = 'none';
        ctx.fillStyle = 'rgba(20, 8, 20, 0.55)';
        ctx.fillRect(lx, ly, lw, phH);
        const imgW = Math.min(Math.round(phH * isw / ish), Math.round(lw * 0.5));
        const imgH = Math.round(imgW * ish / isw);
        ctx.drawImage(img, lx + lw - imgW, ly + Math.round((phH - imgH) / 2), imgW, imgH);
        colW = lw - imgW;
      } else {
        coverPhoto(ctx, img, lx, ly, lw, phH, 0.5, Math.max(0.2, autoFy - 0.08));
      }
      ctx.restore();
      /* Le texte reste sous la moitié haute : visages et scène dégagés (verdict focus-group). */
      const textTopEst = tall ? 0.12 : 0.42;
      const kick = bilingual ? 'À la une  ·  Front page' : 'À la une';
      const kS = px(1.7);
      ctx.font = `700 ${kS}px "LR Sans Semi", "LR Sans"`;
      const kW = textW(ctx, kick.toUpperCase()) + px(2.2);
      ctx.fillStyle = PURPLE;
      ctx.fillRect(lx, ly, kW, Math.round(kS * 2));
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(kick.toUpperCase(), lx + px(1.1), ly + Math.round(kS));
      ctx.textBaseline = 'top';
      /* Crédit photo en haut à droite, sur pastille sombre. */
      if (lead.credit) {
        const cs = Math.max(8, px(0.85));
        ctx.font = `400 ${cs}px "LR Sans"`;
        const ct = fitOne(lead.credit, sans(400), cs, lw * 0.6);
        const cw = textW(ctx, ct) + px(1.2);
        ctx.fillStyle = 'rgba(20, 8, 20, 0.7)';
        ctx.fillRect(lx + lw - cw, ly, cw, cs + px(0.6));
        ctx.fillStyle = '#ffffff';
        ctx.fillText(ct, lx + lw - cw + px(0.6), ly + px(0.3));
      }
      const pad = px(1.6);
      const qrS = leadQr ? Math.min(leadQr, px(11)) : 0;
      const tw = colW - pad * 2;
      const textWq = tw - (qrS && !tall ? qrS + px(1.6) + px(1.8) : 0);
      /* Pile de texte calée en bas : chapeau, signature, titre (de bas en haut). */
      const metaLead = metaPick(lead, textWq, sans(600), px(1.8), { withDate: true, maxLines: 4, minSize: Math.max(8, px(1.25)), lead: 1.3 });
      const metaS = metaLead.size;
      const metaLines = metaLead.lines;
      const metaH = metaLines.length * Math.round(metaS * 1.3);
      const hook = hookText(lead);
      const hS = px(1.95);
      const hLineH = Math.round(hS * 1.25);
      const textTop = tall ? ly + px(4.6) : ly + phH * (textTopEst + 0.08);
      /* Image entière à droite : le QR passe sous le texte, dans la colonne de gauche (l’image reste dégagée) ;
       * si la colonne ne peut tout tenir, il revient sur l’image, en bas à droite. */
      let qrBlockH = tall && qrS ? qrS + px(1.6) + px(1.8) + px(1.4) : 0;
      let tfit = null;
      let tH = 0;
      const fitsCol = () => tH + px(0.8) + metaH + qrBlockH <= floor - pad - textTop;
      for (let pass = 0; pass < 2; pass += 1) {
        for (let ts = 5.2; ts >= 2.8; ts -= 0.4) {
          tfit = wrapFit(lead.title, serif, textWq, px(ts), px(2.8), 3);
          tH = tfit.lines.length * Math.round(tfit.size * 1.08);
          if (tall ? fitsCol() : tH <= phH * 0.3) break;
        }
        if (!tall || fitsCol() || !qrBlockH) break;
        qrBlockH = 0;
      }
      const qrInCol = tall && qrBlockH > 0;
      const roomHook = floor - pad - qrBlockH - (textTop + tH + px(0.8) + metaH + px(0.6));
      const hookLines = hook ? Math.max(0, Math.min(6, Math.floor(roomHook / hLineH))) : 0;
      /* Chapeau entier ou première phrase entière : jamais de points de suspension. */
      const hFit = hookLines ? wholeFit(hook, sans(400), textWq, hS, Math.max(9, px(1.6)), hookLines) : null;
      const hookH = hFit ? hFit.lines.length * hLineH : 0;
      const stackH = tH + px(0.8) + metaH + (hookH ? px(0.6) + hookH : 0);
      let ty = Math.max(textTop, floor - pad - qrBlockH - stackH);
      /* Dégradé sombre calé sur le texte : déjà 0,78 au haut du titre (blanc AA sur tout pixel). */
      {
        const g0 = Math.max(ly, ty - px(7));
        const grad = ctx.createLinearGradient(0, g0, 0, floor);
        const kTop = Math.min(0.95, (ty - g0) / Math.max(1, floor - g0));
        grad.addColorStop(0, 'rgba(20, 8, 20, 0)');
        grad.addColorStop(kTop, 'rgba(20, 8, 20, 0.78)');
        grad.addColorStop(1, 'rgba(20, 8, 20, 0.9)');
        ctx.save();
        roundedRectPath(ctx, lx, ly, lw, phH, glass ? px(0.6) : 0);
        ctx.clip();
        ctx.fillStyle = grad;
        ctx.fillRect(lx, g0, colW, floor - g0);
        ctx.restore();
      }
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = px(0.6);
      ty = drawLines(tfit, serif, lx + pad, ty, '#ffffff', 1.08, floor);
      ty += px(0.8);
      ctx.font = `600 ${metaS}px "LR Sans Semi", "LR Sans"`;
      metaLines.forEach((line, i) => fillWithSpan(line, lx + pad, ty + i * Math.round(metaS * 1.3), '#F1D9EE', lead.source, metaColor(lead, BG_OVERLAY, '#F1D9EE')));
      noteSignature(lead, 'lead', metaLead);
      ty += metaH;
      /* Chapeau dans l’espace réellement libre au-dessus du QR (pas seulement l’estimation roomHook). */
      const tile = qrS ? qrS + px(1.6) : 0;
      const qy = qrS ? floor - pad - tile - px(1.8) : floor - pad;
      const hookTop = ty + px(0.55);
      const hookFloor = (qrInCol && qrS) ? qy - px(0.3) : (floor - pad);
      if (hook && hookFloor - hookTop >= px(1.8)) {
        const hSize = Math.min(hS, Math.max(px(1.35), Math.round((hookFloor - hookTop) * 0.16)));
        const hl = Math.max(1, Math.min(8, Math.floor((hookFloor - hookTop) / Math.round(hSize * 1.25))));
        paintHook(hook, lx + pad, hookTop, textWq, hSize, Math.max(8, px(1.2)), hl, '#ffffff', hookFloor);
      } else if (hook && qrInCol && qrS) {
        /* Lettre / colonne étroite : le QR est déjà sous la signature ; le vide est à sa droite. */
        const hookX = lx + pad + tile + px(0.7);
        const hookW = (lx + colW - pad) - hookX;
        const sideTop = Math.max(ty + px(0.25), qy);
        const sideFloor = floor - pad;
        if (hookW >= px(7) && sideFloor - sideTop >= px(1.8)) {
          const hSize = Math.min(hS, Math.max(px(1.25), Math.round(hookW * 0.08)));
          const hl = Math.max(1, Math.min(8, Math.floor((sideFloor - sideTop) / Math.round(hSize * 1.22))));
          paintHook(hook, hookX, sideTop, hookW, hSize, Math.max(8, px(1.1)), hl, '#ffffff', sideFloor);
        }
      } else if (hFit) {
        drawLines(hFit, sans(400), lx + pad, ty + px(0.6), '#ffffff', 1.25, hookFloor);
      }
      ctx.restore();
      if (qrS) {
        /* Tuile blanche (zone calme) pour que le QR se lise sur la photo. */
        /* Image verticale entière à droite : QR en bas de la colonne de texte ; sinon en bas à droite. */
        const qx = qrInCol ? lx + pad : lx + lw - pad - tile;
        ctx.fillStyle = '#ffffff';
        roundedRectPath(ctx, qx, qy, tile, tile + px(1.8), px(0.5));
        ctx.fill();
        drawQrCode(ctx, qx + px(0.8), qy + px(0.8), qrS, lead.pageUrl);
        ctx.font = `600 ${capS}px "LR Sans Semi", "LR Sans"`;
        ctx.fillStyle = mute;
        ctx.textAlign = 'center';
        ctx.fillText(bilingual ? 'Lire · Read' : 'Lire l’article', qx + tile / 2, qy + qrS + px(1.1));
        ctx.textAlign = 'left';
      }
    } else {
    const qrRowH = leadQr ? leadQr + px(2.2) : px(6);
    let imgH = Math.min(Math.round(lw / 1.55), floor - ly - px(1.2) - creditH - titleH - px(1) - qrRowH);
    if (leadMode === 'ratio') {
      /* Option A (focus-group) : ratio plancher 2:1 ; le titre et le chapeau cèdent d’abord. */
      imgH = Math.max(imgH, Math.min(Math.round(lw / 2), floor - ly - px(1.2) - creditH - Math.round(px(3) * 1.08) * 2 - px(1) - qrRowH));
    }
    if (imgH < minImg && leadQr) {
      const give = Math.min(leadQr - px(9), minImg - imgH);
      leadQr -= Math.max(0, give);
      imgH += Math.max(0, give);
    }
    imgH = Math.max(px(10), imgH);
    paintImage(img, lx, ly, lw, imgH, autoFy, lead.source);
    /* Étiquette À la une posée sur la photo */
    const kick = bilingual ? 'À la une  ·  Front page' : 'À la une';
    const kS = px(1.7);
    ctx.font = `700 ${kS}px "LR Sans Semi", "LR Sans"`;
    const kW = textW(ctx, kick.toUpperCase()) + px(2.2);
    ctx.fillStyle = PURPLE;
    ctx.fillRect(lx, ly, kW, Math.round(kS * 2));
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(kick.toUpperCase(), lx + px(1.1), ly + Math.round(kS));
    ctx.textBaseline = 'top';
    ly += imgH + px(0.4);
    if (lead.credit) ly += creditLine(lead.credit, lx, ly, lw);
    ly += px(0.8);
    ly = drawLines(tProbe, serif, lx, ly, ink, 1.08, floor);
    ly += px(0.8);
    const textW2 = lw - (leadQr ? leadQr + px(2.4) : 0);
    const metaLead = metaPick(lead, textW2, sans(600), px(1.9), { withDate: true, maxLines: 4, minSize: Math.max(8, px(1.3)), lead: 1.26 });
    const metaLines = metaLead.lines;
    const metaLh = Math.round(metaLead.size * 1.26);
    ctx.font = `600 ${metaLead.size}px "LR Sans Semi", "LR Sans"`;
    metaLines.forEach((line, i) => fillWithSpan(line, lx, ly + i * metaLh, PURPLE, lead.source, metaColor(lead, BG_LIGHT, PURPLE)));
    noteSignature(lead, 'lead', metaLead);
    const meta = metaLines.length > 0;
    const hookY = ly + (meta ? px(0.6) + metaLines.length * metaLh : 0);
    const hook = hookText(lead);
    if (hook && floor - hookY > px(2.4)) {
      const lines = Math.max(1, Math.min(6, Math.floor((floor - hookY) / Math.round(px(2.1) * 1.25))));
      paintHook(hook, lx, hookY, textW2, px(2.1), Math.max(9, px(1.6)), lines, ink, floor);
    }
    if (leadQr) {
      const qx = lx + lw - leadQr;
      const qy = ly; /* sous le titre, jamais par-dessus */
      drawQrCode(ctx, qx, qy, leadQr, lead.pageUrl);
      ctx.font = `600 ${capS}px "LR Sans Semi", "LR Sans"`;
      ctx.fillStyle = mute;
      ctx.textAlign = 'center';
      ctx.fillText(bilingual ? 'Lire · Read' : 'Lire l’article', qx + leadQr / 2, qy + leadQr + px(0.4));
      ctx.textAlign = 'left';
    }
    }
    if (showCta) {
      const rx = x0 + leadW + gap;
      vrule(rx - Math.round(gap / 2), cy, cy + rowH);
      let ry2 = cy;
      if (withQr) {
        /* Carte d’appel : un seul gros QR, en haut (le bas d’un babillard est souvent masqué). */
        const cardP = px(1.6);
        const head = bilingual ? 'Scanne · Scan' : 'Scanne-moi';
        const tagKey = UNE_TAGLINES[opts.tagline] && opts.tagline !== 'auto' ? opts.tagline : (campus ? 'campus' : 'tout');
        const tag = UNE_TAGLINES[tagKey];
        const sub2 = 'Journaux · radios · sports';
        const headS = px(3.4);
        const innerW = rightW - cardP * 2;
        const wrapW = plan.cardRow ? Math.round(innerW * 0.5) - px(1.6) : innerW;
        const subFr = wrapFit(tag.fr, sans(600), wrapW, px(2), Math.max(9, px(1.4)), 2);
        const subEn = bilingual && tag.en ? wrapFit(tag.en, sans(400), wrapW, px(1.7), Math.max(9, px(1.3)), 2) : null;
        const subH = subFr.lines.length * Math.round(subFr.size * 1.25) + (subEn ? subEn.lines.length * Math.round(subEn.size * 1.25) : 0);
        const labelH = px(2.6) + px(2.4);
        const textH = Math.round(headS * 1.25) + subH + labelH;
        let qrS;
        let cardH;
        let textX;
        let textWd;
        if (plan.cardRow) {
          /* Écran paysage : QR à droite, texte centré à gauche. */
          qrS = Math.max(px(12), Math.min(Math.round(innerW * 0.5), px(13), rowH - cardP * 2 - px(10)));
          cardH = Math.max(textH, qrS) + cardP * 2;
          textX = rx + cardP;
          textWd = innerW - qrS - px(1.6);
        } else {
          const fixedH = cardP + Math.round(headS * 1.25) + subH + px(0.6) + px(3.2) + px(2.4) + cardP;
          /* Le QR ne déborde jamais de la rangée : il rétrécit d’abord (plancher 1,4 po). */
          qrS = Math.max(px(14), Math.min(innerW, px(glass ? 21 : 22), rowH - fixedH));
          cardH = fixedH + qrS;
          textX = rx + cardP;
          textWd = innerW;
        }
        ctx.fillStyle = glass ? 'rgba(59, 18, 54, 0.92)' : DEEP;
        roundedRectPath(ctx, rx, ry2, rightW, cardH, px(1.2));
        ctx.fill();
        const midX = textX + textWd / 2;
        let cyy = plan.cardRow ? ry2 + Math.round((cardH - textH) / 2) : ry2 + cardP;
        let hS = headS;
        ctx.font = sans(700)(hS);
        while (hS > px(1.8) && textW(ctx, head) > textWd) { hS -= 1; ctx.font = sans(700)(hS); }
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        ctx.fillText(head, midX, cyy + Math.round((headS - hS) / 2));
        cyy += Math.round(headS * 1.25);
        const centerLines = (f, fontFn, color) => {
          ctx.font = fontFn(f.size);
          ctx.fillStyle = color;
          f.lines.forEach((line) => { ctx.fillText(line, midX, cyy); cyy += Math.round(f.size * 1.25); });
        };
        centerLines(subFr, sans(600), LILAC);
        if (subEn) centerLines(subEn, sans(400), '#F3E3F0');
        ctx.textAlign = 'left';
        let qx;
        let qy;
        if (plan.cardRow) {
          qx = rx + rightW - cardP - qrS;
          qy = ry2 + Math.round((cardH - qrS) / 2);
          cyy += px(0.4);
        } else {
          cyy += px(0.6);
          qx = rx + Math.round((rightW - qrS) / 2);
          qy = cyy;
          cyy += qrS + px(1.2);
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(qx - px(0.6), qy - px(0.6), qrS + px(1.2), qrS + px(1.2));
        drawQrCode(ctx, qx, qy, qrS, ctaUrl);
        /* Marque officielle : LE-RADAR.ca en Source Serif Display, comme le bandeau du site. */
        /* Icône officielle (assets/icon.svg, comme le bandeau) à gauche du mot-marque, centrée sur sa hauteur. */
        let brandS = px(2.1);
        const iconFor = (z) => (assets.logo ? Math.round(z * 1.25) : 0);
        const iconGap = (z) => (assets.logo ? Math.round(z * 0.35) : 0);
        while (brandS > px(1.2) && iconFor(brandS) + iconGap(brandS) + trackedWidth(ctx, TITLE, brandS) > textWd) brandS -= 1;
        const bIcon = iconFor(brandS);
        const bRowW = bIcon + iconGap(brandS) + trackedWidth(ctx, TITLE, brandS);
        const bx0 = Math.round(midX - bRowW / 2);
        if (assets.logo) {
          const iy = cyy - px(0.2) + Math.round((brandS * 1.05 - bIcon) / 2);
          ctx.save();
          roundedRectPath(ctx, bx0, iy, bIcon, bIcon, Math.round(bIcon * 0.18));
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.restore();
          const ins = Math.max(1, Math.round(bIcon * 0.08));
          ctx.drawImage(assets.logo, bx0 + ins, iy + ins, bIcon - ins * 2, bIcon - ins * 2);
        }
        fillTracked(ctx, TITLE, cyy - px(0.2), brandS, '#ffffff', bx0 + bIcon + iconGap(brandS));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        cyy += Math.round(brandS * 1.1) + px(0.2);
        ctx.font = `400 ${px(1.5)}px "LR Sans"`;
        ctx.fillStyle = LILAC;
        ctx.fillText(fitOne(sub2, sans(400), px(1.5), textWd), midX, cyy);
        ctx.textAlign = 'left';
        ry2 += cardH + px(1.8);
      }
      if (sideArts.length) {
        const sideH = cy + rowH - ry2;
        if (sideH > px(6)) {
          const sp = glass ? px(1.2) : 0;
          const sy = ry2 + sp + Math.round(px(1.6) * 1.45); /* sous l’étiquette « Aussi à lire », dessinée après le choix */
          /* Pas de titre tronqué à une ligne : s’il manque de place, le second passe en bref. */
          const needPer = px(plan.screen ? 5.4 : 6.6);
          let shown = sideArts;
          const fitN = Math.max(1, Math.floor((ry2 + sideH - sp - sy) / needPer));
          if (sideArts.length > fitN) {
            shown = sideArts.slice(0, fitN);
            if (!plan.screen) briefs.unshift(...sideArts.slice(fitN));
          }
          /* Titre entier ou article déplacé en bref : jamais de « … » ni de ligne perdue (règle sans troncature).
           * sideFit rend la mise en forme qui tient en entier dans la hauteur, ou null. */
          const sideMetaH = (art, per) => {
            const cap = Math.min(px(5.4), Math.max(px(2.2), Math.round(per * 0.45)));
            const fit = metaPick(art, rightW - sp * 2, sans(600), px(1.45), { withDate: true, maxH: cap, minSize: Math.max(8, px(1.0)), lead: 1.25 });
            return fit.lines.length * Math.round(fit.size * 1.25);
          };
          const sideFit = (art, per, minS = Math.max(10, px(1.45))) => {
            const room = per - sideMetaH(art, per) - px(0.7) - px(0.4);
            const cap = Math.min(plan.screen ? px(2.4) : px(2.5), Math.floor(room / 1.1));
            for (let sz = cap; sz >= minS; sz -= 1) {
              const lh = Math.round(sz * 1.1);
              const n = Math.floor((room - sz) / lh) + 1;
              if (n < 1) continue;
              ctx.font = serif(sz);
              const lines = wrapWords(ctx, art.title || '', rightW - sp * 2);
              if (lines.length <= n) return { size: sz, lines };
            }
            return null;
          };
          const avail = ry2 + sideH - sp - sy;
          for (let k = 0; k < 4 && shown.length; k += 1) {
            const perTry = Math.floor(avail / shown.length);
            const bad = shown.filter((a) => !sideFit(a, perTry));
            if (!bad.length) break;
            let keep = shown.filter((a) => !bad.includes(a));
            if (!keep.length) {
              /* Aucun ne tient à plusieurs : le premier qui tient seul, sur toute la hauteur. */
              const alone = shown.find((a) => sideFit(a, avail)) || shown.find((a) => sideFit(a, avail, Math.max(9, px(1.2))));
              keep = alone ? [alone] : [shown[0]];
            }
            if (!plan.screen) briefs.unshift(...shown.filter((a) => !keep.includes(a)));
            shown = keep;
          }
          /* Rien ne tient en entier : pas d’encart (l’article passe en bref) plutôt qu’un titre coupé. */
          if (shown.length && !shown.every((a) => sideFit(a, Math.floor(avail / shown.length)) || sideFit(a, Math.floor(avail / shown.length), Math.max(9, px(1.2))))) {
            if (!plan.screen) briefs.unshift(...shown);
            shown = [];
          }
          if (shown.length) {
            panel(rx, ry2, rightW, sideH);
            label(bilingual ? 'Aussi · Also' : 'Aussi à lire', rx + sp, ry2 + sp);
          }
          const per = Math.floor((ry2 + sideH - sp - sy) / shown.length);
          shown.forEach((art, i) => {
            const by = sy + i * per;
            if (i > 0) rule(rx, rx + rightW, by - px(0.6));
            let yy = by + (i > 0 ? px(0.4) : 0);
            const sidePaint = paintSignature(art, 'aussi', rx + sp, yy, rightW - sp * 2, px(1.45), PURPLE, BG_LIGHT, { withDate: true, maxH: Math.min(px(5.4), Math.max(px(2.2), Math.round(per * 0.45))), minSize: Math.max(8, px(1.0)), lead: 1.25 });
            yy += sidePaint.height + px(0.25);
            const room = by + per - yy - px(0.3);
            const tMax = plan.screen
              ? Math.max(px(1.7), Math.min(px(2.4), Math.floor(room / (room >= px(5) ? 2.2 : 1.15))))
              : Math.max(px(1.7), Math.min(px(2.5), Math.floor(room / 2.2)));
            const maxL = Math.max(plan.screen ? 1 : 2, Math.min(4, Math.floor(room / (tMax * 1.1))));
            const f = sideFit(art, per) || sideFit(art, per, Math.max(9, px(1.2))) || wrapFit(art.title, serif, rightW - sp * 2, tMax, Math.max(10, px(1.7)), maxL);
            const endY = drawLines(f, serif, rx + sp, yy, ink, 1.1, by + per + px(0.2));
            /* Chapeau réel dans l’espace restant, phrase entière seulement. */
            const hookRoom = by + per - endY - px(0.8);
            const hook = hookText(art);
            if (hook && hookRoom >= px(2.2)) {
              const hs = px(1.5);
              const hl = Math.max(1, Math.floor(hookRoom / Math.round(hs * 1.3)));
              paintHook(hook, rx + sp, endY + px(0.5), rightW - sp * 2, hs, Math.max(8, px(1.15)), hl, mute, by + per);
            }
          });
        }
      }
    }
    cy += rowH + px(2.4);
  }

  /* 5. Vedettes : photo + titre, QR moyen, extrait réel s’il tient en phrases entières. */
  if (gridArts.length && bh.grid) {
    const rowH = bh.grid;
    rule(x0, x1, cy - px(1.2), 2);
    const cols = gridArts.length;
    const cw = Math.floor((contentW - gap * (cols - 1)) / cols);
    gridArts.forEach((art, i) => {
      const gx = x0 + i * (cw + gap);
      if (i > 0) vrule(gx - Math.round(gap / 2), cy, cy + rowH);
      const p = glass ? px(1) : 0;
      panel(gx, cy, cw, rowH);
      const ix = gx + p;
      const iw = cw - p * 2;
      let iy = cy + p;
      const floor = cy + rowH - p;
      const img = art.key ? images.get(art.key) : null;
      const imgH = Math.min(Math.round(rowH * (cols <= 2 ? 0.52 : 0.36)), Math.round(iw / (cols <= 2 ? 1.7 : 1.45)));
      paintImage(img, ix, iy, iw, imgH, art.focalY, art.source);
      /* Numéro de vedette, repère pour le QR */
      const nS = px(2.2);
      ctx.fillStyle = PURPLE;
      ctx.fillRect(ix, iy, Math.round(nS * 1.7), Math.round(nS * 1.7));
      ctx.font = `700 ${nS}px "LR Sans Semi", "LR Sans"`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), ix + Math.round(nS * 0.85), iy + Math.round(nS * 0.9));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      iy += imgH + px(0.3);
      if (art.credit) iy += creditLine(art.credit, ix, iy, iw);
      iy += px(0.5);
      const qr = articleQr && art.pageUrl ? Math.min(px(8), Math.round(iw * 0.34)) : 0;
      const qrTop = floor - qr;
      const mw = iw - (qr ? qr + px(1) : 0);
      const mS = Math.max(8, px(1.3));
      const gridMeta = metaPick(art, mw, sans(600), mS, { withDate: true, maxH: px(8), minSize: Math.max(7, px(0.95)), lead: 1.25 });
      const sigH = Math.max(px(2.4), gridMeta.lines.length * Math.round(gridMeta.size * 1.25));
      const titleFloor = floor - sigH;
      let f = fitFlow(art.title, serif, px(2.9), Math.max(10, px(1.8)), iy, iw, mw, qrTop - px(0.6), titleFloor, 1.1);
      /* Titre entier : on descend le corps plutôt que de couper. */
      if (f.cut) f = fitFlow(art.title, serif, px(2.9), Math.max(9, px(1.35)), iy, iw, mw, qrTop - px(0.6), titleFloor, 1.1);
      const titleEnd = drawFlow(f, serif, ix, ink);
      const sigY = floor - sigH;
      paintSignature(art, 'vedette', ix, sigY, mw, mS, PURPLE, BG_LIGHT, { withDate: true, maxH: sigH, minSize: Math.max(7, px(0.95)), lead: 1.25 });
      const hookTop = titleEnd + px(0.35);
      const hookFloor = sigY - px(0.15);
      const hook = hookText(art);
      if (hook && hookFloor - hookTop >= px(1.3)) {
        const hs = Math.min(px(1.65), Math.max(px(1.15), Math.round((hookFloor - hookTop) * 0.2)));
        const hl = Math.max(1, Math.floor((hookFloor - hookTop) / Math.round(hs * 1.25)));
        paintHook(hook, ix, hookTop, mw, hs, Math.max(8, px(1.05)), hl, mute, hookFloor);
      }
      if (qr) drawQrCode(ctx, ix + iw - qr, floor - qr, qr, art.pageUrl);
    });
    cy += rowH + px(2.4);
  }

  /* 6. Bande Sports étudiants + Radio en ondes */
  if (hasBand && bh.band) {
    const rowH = bh.band;
    ctx.fillStyle = glass ? 'rgba(59, 18, 54, 0.9)' : DEEP;
    roundedRectPath(ctx, x0, cy, contentW, rowH, glass ? px(1.2) : px(0.6));
    ctx.fill();
    const bp = px(1.6);
    const parts = [];
    const recap = opts.recap || null;
    if (recap) {
      /* Période passée : bilan réel (résultats + chiffres), pas de direct radio. */
      parts.push({ title: bilingual ? 'Bilan sportif · Results' : 'Bilan sportif', items: sportsLines, weight: (recap.stats || []).length ? 2 : 1 });
      if ((recap.stats || []).length) parts.push({ title: bilingual ? 'En chiffres · By the numbers' : 'En chiffres', items: recap.stats, weight: 1 });
    } else {
      if (sportsLines.length) parts.push({ title: bilingual ? 'Sports étudiants · Varsity' : 'Sports étudiants', items: sportsLines, weight: radioLines.length ? 2 : 1 });
      if (radioLines.length) parts.push({ title: bilingual ? 'En ondes · On air' : 'En ondes', items: radioLines, weight: 1 });
    }
    const tw = parts.reduce((s, p2) => s + p2.weight, 0);
    let bx = x0 + bp;
    const innerW = contentW - bp * 2 - gap * (parts.length - 1);
    parts.forEach((part, pi) => {
      const pw = Math.round(innerW * (part.weight / tw));
      if (pi > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(bx - Math.round(gap / 2), cy + bp, Math.max(1, px(0.12)), rowH - bp * 2);
      }
      let by = label(part.title, bx, cy + bp, LILAC, px(1.7));
      /* Colonnes : autant que la largeur le permet (au moins 24 u chacune), sans case vide. */
      const maxCols = part.weight === 2 ? 2 : (parts.length === 1 ? 3 : 1);
      const roomCols = Math.max(1, Math.floor((pw + gap) / (px(24) + gap)));
      const cols = Math.max(1, Math.min(maxCols, roomCols, part.items.length));
      const colW = Math.floor((pw - (cols - 1) * gap) / cols);
      const itemMinH = px(2) + Math.round(px(2.1) * 1.15) + px(0.4);
      const fitRows = Math.max(1, Math.floor((cy + rowH - bp - by) / itemMinH));
      let items = part.items.slice(0, fitRows * cols);
      let perCol = Math.ceil(items.length / cols);
      let rowsH = Math.floor((cy + rowH - bp - by) / Math.max(1, perCol));
      /* Même corps pour toutes les lignes de la bande : le plus petit qui tient (pas de tailles disparates). */
      const fitItem = (item, cap) => {
        const room = rowsH - (item.kicker || item.meta ? px(2) : 0);
        const minS = Math.max(10, px(1.3));
        const one = Math.min(cap, px(2.4), Math.floor(room / 1.2));
        const indent1 = item.emoji ? Math.round(one * 1.35) : 0;
        const f1 = wrapFit(item.line || '', sans(700), colW - indent1, one, minS, 1);
        if (!/…$/.test(f1.lines[0] || '') || room < Math.round(minS * 1.15) * 2) return f1;
        /* Deux lignes dès que la hauteur les tient : corps limité à la hauteur, jamais de points de suspension. */
        const two = Math.max(minS, Math.min(cap, px(2.4), Math.floor(room / 2.3)));
        const indent2 = item.emoji ? Math.round(two * 1.35) : 0;
        return wrapFit(item.line || '', sans(700), colW - indent2, two, minS, 2);
      };
      /* Une ligne qui ne tient pas entière (deux lignes au plus) cède sa place à la suivante : jamais de « … ». */
      {
        const ok = part.items.filter((it) => !fitItem(it, Infinity).cut);
        if (ok.length !== part.items.length) {
          items = ok.slice(0, fitRows * cols);
          perCol = Math.ceil(items.length / cols);
          rowsH = Math.floor((cy + rowH - bp - by) / Math.max(1, perCol));
        }
      }
      const bandCap = items.length ? Math.min(...items.map((it) => fitItem(it, Infinity).size)) : px(2.4);
      items.forEach((item, ii) => {
        const col = Math.floor(ii / perCol);
        const r = ii % perCol;
        const ix = bx + col * (colW + gap);
        let iy = by + r * rowsH;
        const tag = [item.kicker, item.meta].filter(Boolean).join('  ·  ');
        if (tag) {
          ctx.font = `600 ${px(1.4)}px "LR Sans Semi", "LR Sans"`;
          /* Un seul média : le kicker reprend le nom du journal, dans sa couleur d’établissement
           * (la même que les noms de médias sur le site et les affiches). Plusieurs médias : lilas. */
          const kickerCol = item.kickerKind === 'media'
            ? instColor(item.kickerInstitution || item.kicker, BG_BAND, LILAC)
            : LILAC;
          const shown = fitOne(tag, sans(600), px(1.4), colW);
          if (kickerCol !== LILAC && item.kicker && shown.includes(item.kicker.split(' ')[0])) {
            fillWithSpan(shown, ix, iy, LILAC, item.kicker, kickerCol);
          } else {
            ctx.fillStyle = kickerCol;
            ctx.fillText(shown, ix, iy);
          }
          iy += px(2);
        }
        /* Emoji de sport (police couleur LR Emoji) devant le match ou le résultat. */
        const f = fitItem(item, bandCap);
        if (item.emoji && iy + f.size <= by + (r + 1) * rowsH) {
          ctx.font = `${f.size}px "LR Emoji"`;
          ctx.textBaseline = 'top';
          ctx.fillText(item.emoji, ix, iy);
        }
        /* Sur le violet foncé de la bande : 0,55 comme le site (5,2:1) ; 0,6 en verre (photo dessous). */
        drawRichLines(f, sans(700), ix + (item.emoji ? Math.round(f.size * 1.35) : 0), iy, '#ffffff', glass ? 'rgba(245, 246, 248, 0.6)' : 'rgba(245, 246, 248, 0.55)', 1.15, by + (r + 1) * rowsH, BG_BAND);
      });
      bx += pw + gap;
    });
    cy += rowH + px(2.4);
  }

  /* 7. En bref numéroté */
  if (briefs.length && bh.briefs) {
    const rowH = bh.briefs;
    const p = glass ? px(1.2) : 0;
    panel(x0, cy, contentW, rowH);
    if (!glass) rule(x0, x1, cy - px(1.2), 2);
    let by = label(bilingual ? 'En bref · In brief' : 'En bref', x0 + p, cy + p);
    /* Rangées : autant que la hauteur le permet (min. 5,9 u), puis réparties sans vide en bas. */
    const cols = plan.briefCols;
    const availB = cy + rowH - p - by;
    const colW = Math.floor((contentW - p * 2 - gap * (cols - 1)) / cols);
    /* Titre entier, jamais coupé : on réduit le corps, on passe à 3 lignes si la rangée le permet,
     * sinon le bref est retiré (plutôt qu’un « … »). */
    const briefFit = (title, tW, hAvail) => {
      for (let sz = px(1.95); sz >= Math.max(8, px(1.25)); sz -= 1) {
        ctx.font = serif(sz);
        const lines = wrapWords(ctx, title || '', tW);
        if (lines.length * Math.round(sz * 1.12) <= hAvail) return { size: sz, lines };
      }
      return null;
    };
    const briefMetaH = (b, tW, capH) => {
      const fit = metaPick(b, tW, sans(600), px(1.3), { withDate: true, maxH: capH, minSize: Math.max(7, px(0.95)), lead: 1.25 });
      return fit.lines.length * Math.round(fit.size * 1.25);
    };
    const usable = briefs.filter((b) => {
      const tW = colW - px(3.4);
      const mh = briefMetaH(b, tW, px(3.8));
      return briefFit(b.title, tW, px(5.9) - mh - px(0.2));
    });
    const rowsFit = Math.max(1, Math.floor(availB / px(5.9)));
    const count = Math.min(usable.length, rowsFit * cols);
    const perCol = Math.ceil(count / cols);
    const itemH = Math.max(px(5.9), Math.min(px(7.4), Math.floor(availB / Math.max(1, perCol))));
    const numS = px(3);
    usable.slice(0, count).forEach((b, i) => {
      const col = Math.floor(i / perCol);
      const r = i % perCol;
      const bx = x0 + p + col * (colW + gap);
      const iy = by + r * itemH;
      if (col > 0 && r === 0) vrule(bx - Math.round(gap / 2), by, by + perCol * itemH - px(0.6));
      ctx.font = `700 ${numS}px "LR Serif"`;
      ctx.fillStyle = PURPLE;
      ctx.textBaseline = 'top';
      ctx.fillText(String(i + 1), bx, iy);
      const tx = bx + px(3.4);
      const tW = colW - px(3.4);
      const briefPaint = paintSignature(b, 'bref', tx, iy, tW, px(1.3), PURPLE, BG_LIGHT, { withDate: true, maxH: Math.min(px(3.8), Math.round(itemH * 0.48)), minSize: Math.max(7, px(0.95)), lead: 1.25 });
      const f = briefFit(b.title, tW, itemH - briefPaint.height - px(0.2)) || wrapFit(b.title || '', serif, tW, px(1.95), Math.max(9, px(1.5)), 2);
      const titleTop = iy + briefPaint.height + px(0.2);
      const endY = drawLines(f, serif, tx, titleTop, ink, 1.12, iy + itemH);
      const hook = hookText(b);
      const hookTop = endY + px(0.25);
      const hookFloor = iy + itemH - px(0.2);
      if (hook && hookFloor - hookTop >= px(1.9)) {
        const hs = px(1.4);
        const hl = Math.max(1, Math.min(3, Math.floor((hookFloor - hookTop) / Math.round(hs * 1.22))));
        paintHook(hook, tx, hookTop, tW, hs, Math.max(8, px(1.05)), hl, mute, hookFloor);
      }
    });
  }

  /* 8. Pied */
  if (glass) {
    frostedRect(ctx, margin * 0.5, footY - px(0.4), w - margin, h - footY - px(0.6), px(1.2), { fill: 'rgba(255, 252, 247, 0.88)' });
  } else rule(x0, x1, footY, 1.5);
  let ly = footY + footPad;
  ctx.font = `400 ${nameSize}px "LR Sans"`;
  ctx.fillStyle = glass ? '#2A2622' : '#3A3732';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.fillText(fitOne(NAME_FULL, sans(400), nameSize, contentW), w / 2, ly);
  ctx.textAlign = 'left';
  ly += nameLineH;
  legalLines.forEach((line) => {
    ctx.font = `400 ${legalSize}px "LR Sans"`;
    ctx.fillStyle = mute;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillText(line, w / 2, ly);
    ctx.textAlign = 'left';
    ly += legalLineH;
  });
  if (showLangs && langsMetrics.height) {
    ly += px(0.6);
    drawLangsFooter(ctx, { y: ly, maxW: contentW, size: fLang, iconS, color: mute, lineGap: 4, iconGap: 6 });
    ly += langsMetrics.height;
  }
  if (credit) {
    const cs = Math.max(8, px(0.85));
    ctx.font = `400 ${cs}px "LR Sans"`;
    ctx.fillStyle = mute;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillText(fitOne(String(credit).replace(/\s+/g, ' ').trim(), (z) => `400 ${z}px "LR Sans"`, cs, contentW), w / 2, ly + px(0.2));
    ctx.textAlign = 'left';
    ly += px(0.2) + cs + px(0.25);
  }
  const uneLicKind = (opts.lang === 'en' || opts.locale === 'en') ? 'en' : (bilingual ? 'bilingue' : 'fr');
  drawPosterLicense(ctx, {
    x: w / 2,
    y: ly,
    size: licSize,
    color: mute,
  });
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
  /* Espaces insécables (U+00A0, U+202F) jamais coupées : dates, « : ; ! ? ». */
  const words = String(text).split(/[^\S\u00A0\u202F]+/);
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
    if (typeof window !== 'undefined') {
      window.__campusLayout = null;
      if (typeof document !== 'undefined' && document.body) delete document.body.dataset.campusLayout;
    }
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
  /* Gabarit campus figé à a9e8f52 (affiches Laval imprimées). Ne pas y reporter
   * les ajouts postérieurs (bandeau violet de titre, « Scanne-moi » sous le QR,
   * QR agrandi et pied recalculé) : Charles n’a pas demandé de changer ces affiches. */
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
  /* Ligne de licence : uniquement dans l’espace libre sous le crédit / la mention
   * d’indépendance. Rien d’autre du gabarit a9e8f52 n’est déplacé. */
  let licenseY = 0;
  {
    const licKind = kind === 'bilingue' ? 'bilingue' : 'fr';
    const licText = posterLicenseText(licKind);
    let fLic = Math.max(10, Math.round((credit ? fCredit : fLegal) * 0.92));
    let licH = measurePosterLicense(ctx, fLic).height;
    const creditBottom = credit
      ? (cy + (h - cy - creditH) / 2) + creditH
      : cy;
    const minGap = Math.round(2 * fit);
    const wantGap = Math.round(6 * fit);
    let licYMax = h - safe - licH;
    if (creditBottom + wantGap > licYMax) {
      const room = (h - safe) - (creditBottom + minGap);
      if (room < licH && room >= 8) {
        fLic = Math.max(8, Math.floor(room));
        licH = measurePosterLicense(ctx, fLic).height;
        licYMax = h - safe - licH;
      }
    }
    const licY = Math.min(creditBottom + wantGap, licYMax);
    licenseY = licY;
    if (licY + licH <= h && licY >= 0) {
      drawPosterLicense(ctx, {
        x: w / 2,
        y: licY,
        size: fLic,
        color: SOFT,
      });
    }
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

  /* Contrat de régression : gabarit campus a9e8f52 (pas de bandeau mauve de titre, pas de « Scanne-moi » sous le QR). */
  if (typeof window !== 'undefined') {
    window.__campusLayout = {
      qrIn,
      qrTop,
      barH,
      titleY,
      titleBand: false,
      scanneMoi: false,
      licenseY,
    };
    if (typeof document !== 'undefined' && document.body) {
      document.body.dataset.campusLayout = 'a9e8f52';
    }
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

function mediaSlug(name) {
  return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function fillUneMediaSelect() {
  const sel = document.getElementById('une-media');
  if (!sel) return;
  const keep = state.uneMedia || 'tous';
  sel.replaceChildren();
  const all = document.createElement('option');
  all.value = 'tous';
  all.textContent = state.uneCampus && state.uneCampus !== 'toutes' ? 'Tous les médias de l’établissement' : 'Tous les médias';
  sel.append(all);
  (state.uneMediaList || []).forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.slug;
    opt.textContent = m.name;
    sel.append(opt);
  });
  sel.value = (state.uneMediaList || []).some((m) => m.slug === keep) ? keep : 'tous';
}
/* Réglages partageables : l’URL reflète le modèle, le format et toutes les options visibles. */
function syncSettingsUrl() {
  try {
    const url = new URL(window.location.href);
    const set = (k, v, def) => { if (v && v !== def) url.searchParams.set(k, v); else url.searchParams.delete(k); };
    url.searchParams.set('modele', state.model);
    set('format', state.format, 'tabloid');
    set('qr', state.qr ? 'oui' : 'non', 'oui');
    set('lang', state.lang, 'standard');
    if (isUneModel()) {
      ['campus', 'greeting', 'photo'].forEach((k) => url.searchParams.delete(k));
      set('uni', state.uneCampus, 'toutes');
      set('media', state.uneMedia, 'tous');
      set('periode', state.unePeriod, 'jour');
      set('layout', state.layout, 'classique');
      set('entete', state.uneMastExtra, 'radio');
      set('phrase', state.uneTagline, 'direct');
    } else {
      ['uni', 'media', 'periode', 'layout', 'entete', 'phrase', 'articles', 'une', 'aussi', 'vedettes', 'bref', 'masquer', 'slogan', 'bande', 'sportsmasques'].forEach((k) => url.searchParams.delete(k));
      set('campus', state.campus, 'generique');
      set('greeting', state.greeting, 'none');
    }
    window.history.replaceState(null, '', url.toString());
  } catch { /* ignore */ }
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
    if (uneSelectedBriefs().length) bits.push(`${uneSelectedBriefs().length} en bref`);
    if (uneManualMode()) bits.push('Sélection manuelle');
    bits.push(state.layout === 'verre' ? 'Verre dépoli' : 'Classique');
    if (state.uneCampus && state.uneCampus !== 'toutes') bits.push(campusOf(state.uneCampus).label);
    if (state.unePeriod && state.unePeriod !== 'jour') bits.push(UNE_PERIOD_LABELS[state.unePeriod]);
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

function uneManualMode() {
  return (state.uneManualIds || []).length > 0;
}

function selectedUneArticles() {
  if (uneManualMode()) {
    const Front = typeof RadarMagazineFrontPage !== 'undefined' ? RadarMagazineFrontPage : null;
    return Front ? Front.manualSelection(state.uneCandidates || [], state.uneManualIds, state.uneLeadId) : [];
  }
  return state.uneAutoArticles || [];
}

function uneSelectedBriefs() {
  return uneManualMode() ? [] : (state.uneAutoBriefs || []);
}

const UNE_ROLE_KEYS = ['aussi', 'vedettes', 'bref', 'masquer'];
function uneRolesActive() {
  const r = state.uneRoles || {};
  return UNE_ROLE_KEYS.some((k) => (r[k] || []).length);
}
/* Rôles manuels (une, aussi à lire, vedettes, en bref, masqué) : places libres complétées par l’auto. */
function uneArticlesWithRoles() {
  const Front = typeof RadarMagazineFrontPage !== 'undefined' ? RadarMagazineFrontPage : null;
  const base = selectedUneArticles();
  const briefsBase = uneSelectedBriefs();
  if (!Front || !Front.assignRoles || (!uneRolesActive() && !state.uneLeadId)) return { articles: base, briefs: briefsBase };
  const plan = UNE_FORMAT_PLAN[state.format] || UNE_FORMAT_PLAN.tabloid;
  const seen = new Set();
  const pool = [...base, ...briefsBase, ...(state.uneCandidates || [])].filter((a) => a && !seen.has(a.id) && seen.add(a.id));
  const r = state.uneRoles || {};
  const out = Front.assignRoles(pool, { une: state.uneLeadId, ...r }, { side: plan.side, grid: plan.grid, briefs: plan.screen ? 0 : 6 });
  return { articles: [out.lead, ...out.side, ...out.grid].filter(Boolean), briefs: out.briefs };
}
function uneSportsManualActive() {
  return (state.uneSportBand || []).length + (state.uneSportSlogan || []).length + (state.uneSportHide || []).length > 0;
}

/* Réglage partageable : ids d’articles et une dans l’URL, comme les autres paramètres. */
function syncUneSelectionUrl() {
  try {
    const url = new URL(window.location.href);
    if (uneManualMode()) {
      url.searchParams.set('articles', state.uneManualIds.join(','));
      if (state.uneLeadId) url.searchParams.set('une', state.uneLeadId);
      else url.searchParams.delete('une');
    } else {
      url.searchParams.delete('articles');
      if (state.uneLeadId) url.searchParams.set('une', state.uneLeadId);
      else url.searchParams.delete('une');
    }
    const r = state.uneRoles || {};
    UNE_ROLE_KEYS.forEach((k) => { if ((r[k] || []).length) url.searchParams.set(k, r[k].join(',')); else url.searchParams.delete(k); });
    [['slogan', state.uneSportSlogan], ['bande', state.uneSportBand], ['sportsmasques', state.uneSportHide]].forEach(([k, v]) => {
      if ((v || []).length) url.searchParams.set(k, v.join(','));
      else url.searchParams.delete(k);
    });
    window.history.replaceState(null, '', url.toString());
  } catch { /* ignore */ }
}

function syncModelUi() {
  const dash = document.querySelector('.dash');
  if (dash) {
    dash.dataset.model = state.model;
    dash.dataset.layout = isUneModel() ? (state.layout || 'classique') : '';
  }
  ['une-box', 'une-sports-box', 'une-layout-box', 'une-uni-box', 'une-media-box', 'une-period-box', 'une-entete-box'].forEach((id) => {
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
      ? 'Articles, sports et radio viennent du site, en temps réel. Choisissez l’établissement, le média, la période et le fond, puis exportez.'
      : 'Paramètres d’abord, photo ensuite. L’affiche reste à droite.';
  }
}

function renderUneList() {
  const list = document.getElementById('une-list');
  const status = document.getElementById('une-status');
  const reset = document.getElementById('une-auto');
  if (!list) return;
  if (status) status.textContent = state.uneStatus || '';
  if (reset) reset.hidden = !(uneManualMode() || uneRolesActive() || state.uneLeadId || uneSportsManualActive());
  list.replaceChildren();
  const manual = uneManualMode();
  const autoIds = new Set((state.uneAutoArticles || []).concat(state.uneAutoBriefs || []).map((a) => a.id));
  const chosen = new Set(state.uneManualIds || []);
  const leadId = selectedUneArticles()[0]?.id || '';
  (state.uneCandidates || []).slice(0, 80).forEach((art) => {
    const li = document.createElement('li');
    if (art.id === leadId) li.classList.add('is-lead');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'une-check';
    check.checked = manual ? chosen.has(art.id) : false;
    check.setAttribute('aria-label', `Intégrer : ${art.title}`);
    check.addEventListener('change', () => {
      const ids = (state.uneManualIds || []).filter((id) => id !== art.id);
      if (check.checked) ids.push(art.id);
      state.uneManualIds = ids;
      if (state.uneLeadId && !ids.includes(state.uneLeadId)) state.uneLeadId = '';
      syncUneSelectionUrl();
      renderUneList();
      preview();
    });
    const meta = document.createElement('div');
    meta.className = 'une-meta';
    const role = document.createElement('span');
    role.className = 'une-role';
    const place = selectedUneArticles().findIndex((a) => a.id === art.id);
    role.textContent = place === 0 ? 'À la une'
      : place > 0 ? 'Sur l’affiche'
        : (!manual && autoIds.has(art.id) ? 'Auto' : '');
    const title = document.createElement('span');
    title.className = 'une-title';
    title.textContent = art.title;
    const source = document.createElement('span');
    source.className = 'une-source';
    source.textContent = [art.byline || art.source, art.dateLabel].filter(Boolean).join(' · ');
    meta.append(role, title, source);
    const leadLab = document.createElement('label');
    leadLab.className = 'une-lead';
    const lead = document.createElement('input');
    lead.type = 'radio';
    lead.name = 'une-lead-pick';
    lead.checked = art.id === leadId;
    lead.addEventListener('change', () => {
      if (!lead.checked) return;
      const ids = uneManualMode() ? (state.uneManualIds || []).slice() : selectedUneArticles().map((a) => a.id);
      if (!ids.includes(art.id)) ids.push(art.id);
      state.uneManualIds = ids;
      state.uneLeadId = art.id;
      syncUneSelectionUrl();
      renderUneList();
      preview();
    });
    leadLab.append(lead, document.createTextNode(' Une'));
    /* Rôle manuel : auto par défaut ; le choix est gardé dans l’URL (aussi=, vedettes=, bref=, masquer=). */
    const roleSel = document.createElement('select');
    roleSel.className = 'une-role-pick';
    roleSel.setAttribute('aria-label', `Rôle : ${art.title}`);
    [['', 'Auto'], ['vedettes', 'Vedette'], ['aussi', 'Aussi à lire'], ['bref', 'En bref'], ['masquer', 'Masquer']].forEach(([v, t]) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = t;
      roleSel.append(opt);
    });
    const roles = state.uneRoles || {};
    roleSel.value = UNE_ROLE_KEYS.find((k) => (roles[k] || []).includes(art.id)) || '';
    roleSel.addEventListener('change', () => {
      const next = {};
      UNE_ROLE_KEYS.forEach((k) => { next[k] = (roles[k] || []).filter((id) => id !== art.id); });
      if (roleSel.value) next[roleSel.value].push(art.id);
      state.uneRoles = next;
      syncUneSelectionUrl();
      renderUneList();
      preview();
    });
    li.append(check, meta, leadLab, roleSel);
    list.append(li);
  });
}

/* Sports du studio : chaque match ou résultat réel peut aller sous le slogan, dans la bande (ou le bilan) ou être masqué. */
async function renderUneSportsList() {
  const list = document.getElementById('une-sports-list');
  if (!list || !isUneModel()) return;
  await loadUneSportsHistory();
  const campus = (state.uneCampus && state.uneCampus !== 'toutes') ? campusOf(state.uneCampus) : null;
  const cands = uneSportsCandidates(campus, state.unePeriodInfo);
  list.replaceChildren();
  cands.slice(0, 60).forEach((item) => {
    const li = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'une-meta';
    const title = document.createElement('span');
    title.className = 'une-title';
    title.textContent = [item.emoji, item.kicker, '—', item.line].filter(Boolean).join(' ');
    const src = document.createElement('span');
    src.className = 'une-source';
    src.textContent = [item.meta, item.upcoming ? 'à venir' : 'résultat'].filter(Boolean).join(' · ');
    meta.append(title, src);
    const sel = document.createElement('select');
    sel.className = 'une-role-pick';
    sel.setAttribute('aria-label', `Place : ${item.line}`);
    [['', 'Auto'], ['slogan', 'Sous le slogan'], ['bande', 'Bande / bilan'], ['masquer', 'Masquer']].forEach(([v, t]) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = t;
      sel.append(opt);
    });
    sel.value = (state.uneSportSlogan || []).includes(item.id) ? 'slogan'
      : (state.uneSportBand || []).includes(item.id) ? 'bande'
        : (state.uneSportHide || []).includes(item.id) ? 'masquer' : '';
    sel.addEventListener('change', () => {
      const drop = (arr) => (arr || []).filter((id) => id !== item.id);
      state.uneSportSlogan = drop(state.uneSportSlogan);
      state.uneSportBand = drop(state.uneSportBand);
      state.uneSportHide = drop(state.uneSportHide);
      if (sel.value === 'slogan') state.uneSportSlogan.push(item.id);
      if (sel.value === 'bande') state.uneSportBand.push(item.id);
      if (sel.value === 'masquer') state.uneSportHide.push(item.id);
      syncUneSelectionUrl();
      preview();
    });
    li.append(meta, sel);
    list.append(li);
  });
}

async function loadUneFeed() {
  const Front = typeof RadarMagazineFrontPage !== 'undefined' ? RadarMagazineFrontPage : null;
  if (!Front) {
    state.uneStatus = 'Module de une introuvable.';
    renderUneList();
    return;
  }
  state.uneStatus = 'Chargement des articles du site…';
  { const fr = document.getElementById('preview'); if (fr) fr.dataset.state = 'occupe'; }
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
    const period = state.unePeriod || 'jour';
    /* Médias de l’établissement (ou de tout le fil) : choix « tous » ou un seul média. */
    const inScope = Front.frontPageCards(data.items || [], now, '..', campus, Infinity, 'session').items || [];
    const mediaMap = new Map();
    (data.items || []).forEach((it) => {
      if (!it || !it.source) return;
      if (campus && !inScope.some((c) => c.source === it.source)) return;
      const slug = it.sourceSlug || mediaSlug(it.source);
      if (!mediaMap.has(slug)) mediaMap.set(slug, it.source);
    });
    state.uneMediaList = [...mediaMap.entries()].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    if (state.uneMedia !== 'tous' && !mediaMap.has(state.uneMedia)) state.uneMedia = 'tous';
    fillUneMediaSelect();
    const items = state.uneMedia === 'tous'
      ? (data.items || [])
      : (data.items || []).filter((it) => it && (it.sourceSlug || mediaSlug(it.source || '')) === state.uneMedia);
    const all = Front.frontPageCards(items, now, '..', campus, Infinity, period);
    const cards = Front.frontPageCards(items, now, '..', campus, featureN + briefN, period);
    state.unePeriodInfo = cards.period || null;
    state.uneCandidates = all.items;
    state.uneAutoArticles = cards.items.slice(0, featureN);
    state.uneAutoBriefs = cards.items.slice(featureN);
    /* Sélection manuelle : on garde les articles encore présents (université, période). */
    const known = new Set(all.items.map((c) => c.id));
    state.uneManualIds = (state.uneManualIds || []).filter((id) => known.has(id));
    if (state.uneLeadId && !known.has(state.uneLeadId)) state.uneLeadId = '';
    const n = selectedUneArticles().length;
    const b = uneSelectedBriefs().length;
    const per = state.unePeriodInfo && state.unePeriodInfo.id !== 'jour' ? ` (${state.unePeriodInfo.fr.charAt(0).toLowerCase()}${state.unePeriodInfo.fr.slice(1)})` : '';
    const mediaName = state.uneMedia !== 'tous' ? (state.uneMediaList.find((m) => m.slug === state.uneMedia) || {}).name : '';
    const where = (mediaName ? ` de ${mediaName}` : '') + (campus ? ` pour ${campus.line}` : (mediaName ? '' : ' du fil actuel')) + per;
    const how = uneManualMode() ? 'sélection manuelle' : 'sélection automatique';
    state.uneStatus = all.items.length
      ? `${all.items.length} article${all.items.length > 1 ? 's' : ''}${where}. Sur l’affiche : ${n}${b ? ` + ${b} en bref` : ''} (${how}). Cochez pour choisir vous-même.`
      : (campus
        ? `Aucun article pour ${campus.line} sur cette période. L’affiche n’invente pas de titres.`
        : 'Aucun article dans le fil pour cette période.');
  } catch (err) {
    state.uneCandidates = [];
    state.uneAutoArticles = [];
    state.uneAutoBriefs = [];
    state.uneStatus = `Impossible de lire le fil : ${err.message}`;
  }
  renderUneList();
  renderUneSportsList();
}

/* Toutes les images des articles, attendues AVANT la composition (t985u) : chaque candidat (miroir public,
 * puis URL d’origine) est essayé ; une image introuvable est remplacée par l’encart neutre au nom du média
 * et signalée (statut du studio + data-poster-images sur <body> pour les exports automatisés). */
async function loadUneImages(articles) {
  const map = new Map();
  const missing = [];
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
    if (candidates.length) missing.push(art.title || art.key);
  }));
  map.missing = missing;
  state.uneMissingImages = missing;
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.posterImages = missing.length ? `manquantes:${missing.length}` : 'pretes';
  }
  return map;
}
function uneMissingImagesNote() {
  const list = state.uneMissingImages || [];
  return list.length ? ` Image introuvable (encart neutre au nom du média si elle doit s’afficher) : ${list.map((t) => `« ${t} »`).join(', ')}.` : '';
}

async function loadUneSidebars() {
  if (state.uneSidebars) return state.uneSidebars;
  const grab = (url) => fetch(url, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [nowplaying, radios, sports, schedules, brand] = await Promise.all([
    grab('../radio-nowplaying.json'),
    grab('../radios.json'),
    grab('../sports-masthead.json'),
    grab('../radio-schedules.json'),
    grab('../brand-colors.json'),
  ]);
  /* Couleurs officielles des établissements (mêmes que les pastilles du site et La une sociale). */
  state.uneBrand = (brand && brand.institutions) || null;
  state.uneSidebars = { nowplaying, radios, sports, schedules };
  return state.uneSidebars;
}

/* Bilan d’une période passée : sports.json complet (dépaqueté), chargé à la demande. */
async function loadUneSportsHistory() {
  if (state.uneSports) return state.uneSports;
  try {
    const res = await fetch('../sports.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const raw = await res.json();
    const P = typeof RadarSportsPayload !== 'undefined' ? RadarSportsPayload : null;
    const data = P && typeof P.unpackSportsPayload === 'function' ? P.unpackSportsPayload(raw) : raw;
    state.uneSports = data && data.teams ? data.teams : null;
  } catch {
    state.uneSports = null;
  }
  return state.uneSports;
}

function unePeriodRecap(campus) {
  const Front = typeof RadarMagazineFrontPage !== 'undefined' ? RadarMagazineFrontPage : null;
  const win = state.unePeriodInfo;
  if (!Front || !win || win.live || !state.uneSports) return null;
  const res = Front.periodResults(state.uneSports, win, campus, 4);
  if (!res.items.length) return null;
  const pool = state.uneCandidates || [];
  const medias = new Set(pool.map((a) => a.source).filter(Boolean)).size;
  const stats = [];
  const bilingual = state.lang === 'bilingue' && uneBilingualAllowed(campus || state.uneCampus);
  if (pool.length) {
    const kick = Front.pressKicker ? Front.pressKicker(pool) : { kicker: 'Journaux étudiants', institution: '' };
    const line = Front.numbersLine
      ? Front.numbersLine(pool, { bilingual })
      : `${pool.length} article${pool.length > 1 ? 's' : ''} · ${medias} média${medias > 1 ? 's' : ''}`;
    stats.push({
      kicker: kick.kicker,
      kickerInstitution: kick.institution || '',
      kickerKind: kick.kicker !== 'Journaux étudiants' ? 'media' : '',
      line,
    });
  }
  stats.push({ kicker: 'Matchs', line: campus ? `${res.played} joué${res.played > 1 ? 's' : ''} · ${res.wins} victoire${res.wins > 1 ? 's' : ''}` : `${res.played} match${res.played > 1 ? 's' : ''} joué${res.played > 1 ? 's' : ''}` });
  return { items: res.items, stats };
}

/* Encart du haut à droite. Verdict du focus-group (A) : 2 émissions à venir de la station campus
 * (grille radio-schedules.json) ; repli générique : prochain match, sinon chiffre clé, sinon rien. */
const UNE_MAST_EXTRAS = ['radio', 'match', 'chiffre', 'combo', 'aucun'];
const FR_WEEKDAY_SHORT = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
function uneRadioShows(bars, campus, info, limit = 2) {
  const Front = typeof RadarMagazineFrontPage !== 'undefined' ? RadarMagazineFrontPage : null;
  const radios = Array.isArray(bars.radios) ? bars.radios : ((bars.radios && (bars.radios.radios || bars.radios.stations)) || []);
  const list = Array.isArray(radios) ? radios : Object.values(radios);
  const stations = (bars.schedules && bars.schedules.stations) || {};
  const station = list.find((r) => r && stations[r.id] && (stations[r.id].grid || []).length
    && (!campus || itemMatchesCampusPoster({ institution: r.institution || '' }, campus)));
  if (!station) return null;
  const grid = stations[station.id].grid || [];
  const realToday = posterTodayYmd();
  const startYmd = (info && info.live && info.target) || realToday;
  const nowHm = startYmd === realToday
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
    : '07:00';
  /* Émissions originales de jour ou de soir, étalées, sans reprise ni rotation automatique (t984u). */
  const out = Front && Front.pickRadioShows
    ? Front.pickRadioShows(grid, startYmd, nowHm, limit).map((x) => `${posterShortDate(x.ymd)} · ${posterClock(x.start)} · ${x.title}`)
    : [];
  return out.length ? { name: station.name || station.id, institution: station.institution || '', shows: out } : null;
}
function uneMastExtras(mode, bars, campus, info, sportsLines) {
  if (!info || mode === 'aucun') return null;
  const radio = uneRadioShows(bars, campus, info, mode === 'radio' ? 8 : 3);
  const next = (sportsLines || []).find((x) => x.upcoming);
  const pool = state.uneCandidates || [];
  const ref = (info.to || posterTodayYmd());
  const from = new Date(`${ref}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 6);
  const fromYmd = from.toISOString().slice(0, 10);
  const Front = typeof RadarMagazineFrontPage !== 'undefined' ? RadarMagazineFrontPage : null;
  const week = pool.filter((a) => a.date && Front && Front.mtlYmd && Front.mtlYmd(a.date) >= fromYmd);
  const medias = new Set(week.map((a) => a.source).filter(Boolean)).size;
  const bilingual = state.lang === 'bilingue' && uneBilingualAllowed(campus || state.uneCampus);
  const stat = week.length ? (Front && Front.numbersLine ? Front.numbersLine(week, { suffix: 'en 7 jours', bilingual }) : `${week.length} article${week.length > 1 ? 's' : ''} en 7 jours · ${medias} média${medias > 1 ? 's' : ''}`) : '';
  const pick = {
    radio: radio ? { title: `À l’antenne de ${radio.name}`, lines: radio.shows, colorText: radio.name, colorInst: radio.institution } : null,
    match: next ? { title: 'Prochain match', strict: true, lines: [`${next.emoji ? `${next.emoji} ` : ''}${next.line}`, next.meta.charAt(0).toUpperCase() + next.meta.slice(1)] } : null,
    chiffre: stat ? { title: 'À surveiller', lines: [stat] } : null,
    combo: radio ? { title: 'À surveiller', lines: radio.shows.map((x) => `${radio.name} · ${x}`), tail: stat, colorText: radio.name, colorInst: radio.institution } : null,
  };
  return pick[mode] || pick.match || pick.chiffre || null;
}

/* Candidats sports du studio : matchs à venir (bandeau sports) et résultats réels (sports.json). */
function uneSportsCandidates(campus, info) {
  const Front = typeof RadarMagazineFrontPage !== 'undefined' ? RadarMagazineFrontPage : null;
  const bars = state.uneSidebars || {};
  const live = !info || info.live;
  const up = pickPosterSports(bars.sports, campus, 40, live && info ? info.target : posterNextYmd()).filter((x) => x.upcoming);
  let res = [];
  if (Front && Front.periodResults && state.uneSports) {
    let win = info;
    if (live) {
      const to = posterTodayYmd();
      const d = new Date(`${to}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 30);
      win = { from: d.toISOString().slice(0, 10), to };
    }
    res = Front.periodResults(state.uneSports, win, campus, Infinity).items;
    /* En direct, la bande garde le format court des matchs (« Dim. 25 oct. ») ; le bilan garde le sien. */
    if (live) res = res.map((x) => ({ ...x, meta: posterShortDate(x.date) || x.meta }));
  }
  const all = [...up, ...res];
  all.forEach((x) => { if (!x.id && Front && Front.sportItemId) x.id = Front.sportItemId(x); });
  const seen = new Set();
  return all.filter((x) => !seen.has(x.id) && seen.add(x.id));
}

function uneComposeOpts(dpi, images, photoImg, photo) {
  const campusSlug = (state.uneCampus && state.uneCampus !== 'toutes') ? state.uneCampus : null;
  const campus = campusSlug ? campusOf(campusSlug) : null;
  const bars = state.uneSidebars || {};
  const info = state.unePeriodInfo;
  const past = Boolean(info && !info.live);
  const recap = past ? unePeriodRecap(campus) : null;
  const ahead = Boolean(info && info.id === 'demain');
  const Front = typeof RadarMagazineFrontPage !== 'undefined' ? RadarMagazineFrontPage : null;
  const autoBand = recap ? recap.items : (past ? [] : pickPosterSports(bars.sports, campus, 8, info && info.target));
  autoBand.forEach((x) => { if (!x.id && Front && Front.sportItemId) x.id = Front.sportItemId(x); });
  const sportCands = uneSportsManualActive() ? uneSportsCandidates(campus, info) : [];
  /* Sélection manuelle des sports (bande ou bilan) : ids choisis dans l’ordre, sinon l’auto moins les masqués. */
  const sportsLines = Front && Front.applySportSelection
    ? Front.applySportSelection(sportCands, autoBand, state.uneSportBand, state.uneSportHide)
    : autoBand;
  const autoSlogan = pickPosterSports(bars.sports, campus, 6, info && info.live ? info.target : posterNextYmd());
  autoSlogan.forEach((x) => { if (!x.id && Front && Front.sportItemId) x.id = Front.sportItemId(x); });
  const sloganManual = (state.uneSportSlogan || []).length > 0;
  const mastGames = Front && Front.applySportSelection
    ? Front.applySportSelection(sportCands, autoSlogan, state.uneSportSlogan, state.uneSportHide)
    : autoSlogan;
  /* Note du bandeau (périodes en direct) : ce que l’affiche contient vraiment. */
  const games = sportsLines.some((x) => x.upcoming);
  const mastNote = past ? '' : (games ? `Nouvelles récentes et matchs ${ahead ? 'à venir' : 'du jour'}` : 'Les nouvelles les plus récentes');
  const mastNoteEn = past ? '' : (games ? `Latest news and ${ahead ? 'upcoming' : 'today’s'} games` : 'The latest news');
  return {
    model: 'une',
    format: state.format,
    qr: state.qr,
    langs: false,
    lang: state.lang,
    layout: state.layout,
    campus: campusSlug,
    dpi,
    articles: uneArticlesWithRoles().articles,
    briefs: uneArticlesWithRoles().briefs,
    /* « En ondes » = émission en cours : sans objet pour le lendemain (grille inconnue). */
    radioLines: (recap || past || ahead) ? [] : pickPosterRadio(bars.nowplaying, bars.radios, campus, 3),
    sportsLines,
    /* Période passée : matchs à partir du lendemain (ceux du jour peuvent être joués à l’impression). */
    mastGames,
    mastGamesManual: sloganManual,
    mastExtras: uneMastExtras(state.uneMastExtra || 'radio', bars, campus, info, sportsLines),
    mastNote,
    mastNoteEn,
    recap: recap ? { stats: recap.stats } : null,
    period: state.unePeriodInfo,
    tagline: state.uneTagline,
    brand: state.uneBrand || null,
    leadPhoto: state.uneLeadPhoto,
    mastGlass: state.uneMastGlass,
    articleImages: images || new Map(),
    photoImg: photoImg || null,
    credit: photo?.credit,
    license: photoLicense(photo),
    photoUrl: photo?.url,
    focalX: state.focalX,
    focalY: state.focalY,
    cropScale: state.zoom,
    angle: state.angle,
  };
}

const previewView = { mode: 'fit', scale: 1, x: 0, y: 0, natW: 0, natH: 0 };

function previewViewportEl() {
  return document.getElementById('preview-viewport') || document.getElementById('preview-pane');
}

function previewFit() {
  const vp = previewViewportEl();
  const pad = 8;
  const maxW = Math.max(160, (vp?.clientWidth || window.innerWidth * 0.55) - pad * 2);
  const maxH = Math.max(220, (vp?.clientHeight || window.innerHeight * 0.6) - pad);
  return { maxW, maxH };
}

function previewFitScale() {
  if (!previewView.natW || !previewView.natH) return 1;
  const { maxW, maxH } = previewFit();
  return Math.min(maxW / previewView.natW, maxH / previewView.natH);
}

function currentViewScale() {
  return previewView.mode === 'fit' ? previewFitScale() : previewView.scale;
}

function updateViewLabel() {
  const el = document.getElementById('view-zoom-label');
  const fitBtn = document.getElementById('view-fit');
  const btn100 = document.getElementById('view-100');
  if (!el) return;
  if (previewView.mode === 'fit') el.textContent = 'Ajuster';
  else el.textContent = `${Math.round(previewView.scale * 100)} %`;
  if (fitBtn) fitBtn.setAttribute('aria-pressed', String(previewView.mode === 'fit'));
  if (btn100) btn100.setAttribute('aria-pressed', String(previewView.mode === 'free' && Math.abs(previewView.scale - 1) < 0.02));
}

function sizeStudioDash() {
  const dash = document.querySelector('.affiche-wire--studio .dash');
  if (!dash) return;
  const top = dash.getBoundingClientRect().top;
  const gap = 16;
  const h = Math.max(280, Math.round(window.innerHeight - top - gap));
  dash.style.height = `${h}px`;
  dash.style.maxHeight = `${h}px`;
}

function applyPreviewView() {
  const frame = document.getElementById('preview');
  const vp = previewViewportEl();
  if (!frame || !vp) return;
  const canvas = frame.querySelector('canvas');
  if (!canvas || !previewView.natW) return;
  const s = currentViewScale();
  const w = previewView.natW * s;
  const h = previewView.natH * s;
  const minX = Math.min(0, vp.clientWidth - w);
  const minY = Math.min(0, vp.clientHeight - h);
  const maxX = Math.max(0, vp.clientWidth - w);
  const maxY = Math.max(0, vp.clientHeight - h);
  if (previewView.mode === 'fit') {
    previewView.x = 0;
    previewView.y = 0;
  } else {
    previewView.x = Math.min(maxX, Math.max(minX, previewView.x));
    previewView.y = Math.min(maxY, Math.max(minY, previewView.y));
  }
  const x = (vp.clientWidth - w) / 2 + previewView.x;
  const y = (vp.clientHeight - h) / 2 + previewView.y;
  frame.style.width = `${previewView.natW}px`;
  frame.style.height = `${previewView.natH}px`;
  frame.style.transformOrigin = '0 0';
  frame.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  if (canvas) {
    canvas.style.width = `${previewView.natW}px`;
    canvas.style.height = `${previewView.natH}px`;
  }
  updateViewLabel();
}

function setPreviewFit() {
  previewView.mode = 'fit';
  previewView.scale = previewFitScale();
  previewView.x = 0;
  previewView.y = 0;
  applyPreviewView();
}

function setPreview100() {
  previewView.mode = 'free';
  previewView.scale = 1;
  previewView.x = 0;
  previewView.y = 0;
  applyPreviewView();
}

function zoomPreviewAt(factor, cx, cy) {
  const vp = previewViewportEl();
  if (!vp || !previewView.natW) return;
  const prev = currentViewScale();
  const next = Math.min(8, Math.max(0.15, prev * factor));
  const rect = vp.getBoundingClientRect();
  const px = (cx ?? (rect.left + rect.width / 2)) - rect.left;
  const py = (cy ?? (rect.top + rect.height / 2)) - rect.top;
  const contentX = (px - (vp.clientWidth - previewView.natW * prev) / 2 - previewView.x) / prev;
  const contentY = (py - (vp.clientHeight - previewView.natH * prev) / 2 - previewView.y) / prev;
  previewView.mode = 'free';
  previewView.scale = next;
  previewView.x = px - contentX * next - (vp.clientWidth - previewView.natW * next) / 2;
  previewView.y = py - contentY * next - (vp.clientHeight - previewView.natH * next) / 2;
  applyPreviewView();
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
    tagline: state.uneTagline,
    langs: false,
    showUni: state.showUni,
    qr: state.qr,
    dpi: PREVIEW_DPI,
    photoImg: img || null,
    credit: photo?.credit,
    license: photoLicense(photo),
    photoUrl: photo?.url,
    focalX: state.focalX,
    focalY: state.focalY,
    cropScale: state.zoom,
    angle: state.angle,
  });
  previewView.natW = canvas.width;
  previewView.natH = canvas.height;
  const view = document.createElement('canvas');
  view.width = canvas.width;
  view.height = canvas.height;
  view.style.fontSynthesis = 'none';
  const vctx = view.getContext('2d', { alpha: false });
  vctx.imageSmoothingEnabled = true;
  vctx.imageSmoothingQuality = 'high';
  vctx.drawImage(canvas, 0, 0);
  out.replaceChildren(view);
  applyPreviewView();
}

async function preview() {
  const status = document.getElementById('status');
  const recipe = document.getElementById('recipe');
  const frame = document.getElementById('preview');
  const gen = ++previewGen;
  const photo = (!isUneModel() || uneUsesPhoto()) ? currentPhoto() : null;
  if (recipe) recipe.textContent = recipeLine();
  frame.classList.add('is-busy');
  frame.dataset.state = 'occupe'; /* repère des tests et exports : « pret » quand l’aperçu final est peint */
  try {
    if (isUneModel()) {
      paintPreview(null, photo, { articleImages: new Map() });
      await loadUneSidebars();
      if ((state.unePeriod && !['jour', 'demain'].includes(state.unePeriod)) || uneSportsManualActive()) await loadUneSportsHistory();
      const images = await loadUneImages(uneArticlesWithRoles().articles);
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
    status.innerHTML = `<strong>${escapeAttr(specLine())}</strong>${escapeAttr(isUneModel() ? uneMissingImagesNote() : '')}`;
    if (isUneModel()) document.body.dataset.posterCoupures = String((window.__uneCuts || []).length);
    if (isUneModel() && state.unePeriodInfo) {
      frame.dataset.periodId = state.unePeriodInfo.id || '';
      frame.dataset.periodFr = state.unePeriodInfo.fr || '';
      frame.dataset.periodEn = state.unePeriodInfo.en || '';
    } else {
      delete frame.dataset.periodId;
      delete frame.dataset.periodFr;
      delete frame.dataset.periodEn;
    }
    frame.dataset.state = 'pret';
  } catch (err) {
    if (gen !== previewGen) return;
    frame.dataset.state = 'erreur';
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
    const per = state.unePeriod && state.unePeriod !== 'jour' ? `-${state.unePeriod}` : '';
    const lang = state.lang === 'bilingue' ? 'bilingue' : 'fr';
    const langs = state.langs ? '-langues' : '';
    const qr = state.qr ? '-qr' : '';
    return `le-radar-affiche-une-${layout}${uni}${per}-${fmt.file}-${lang}${langs}${qr}${fmt.screen ? '' : `-${dpi}dpi`}`;
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
    if (isUneModel() && ((state.unePeriod && !['jour', 'demain'].includes(state.unePeriod)) || uneSportsManualActive())) await loadUneSportsHistory();
    const uneImages = isUneModel() ? await loadUneImages(uneArticlesWithRoles().articles) : null;
    const { w, h } = px(fmt, dpi);
    const composeOpts = isUneModel()
      ? uneComposeOpts(dpi, uneImages, img, photo)
      : {
      format: state.format,
      campus: state.campus,
      lang: state.lang,
      greeting: state.greeting,
      tagline: state.uneTagline,
      langs: false,
      showUni: state.showUni,
      qr: state.qr,
      dpi,
      photoImg: img,
      credit: photo?.credit,
      license: photoLicense(photo),
      photoUrl: photo?.url,
      focalX: state.focalX,
      focalY: state.focalY,
      cropScale: state.zoom,
      angle: state.angle,
    };
    if (fmt.screen) {
      /* Écran : PNG à la taille exacte en pixels, quel que soit le bouton. */
      const canvas = compose(composeOpts);
      if (canvas.width !== w || canvas.height !== h) throw new Error(`dimensions ${canvas.width}×${canvas.height}, attendu ${w}×${h}`);
      const png = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG indisponible'))), 'image/png'));
      const name = `${printFileStem(fmt, dpi)}.png`;
      const how = await saveBlob(png, name);
      if (how === 'abort') { status.textContent = 'Téléchargement annulé.'; return; }
      status.textContent = `PNG ${name} · ${fmt.label} · taille exacte pour l’écran.${isUneModel() ? uneMissingImagesNote() : ''}`;
      return;
    }
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
    status.innerHTML = `Fichier <strong>${escapeAttr(name)}</strong> · ${escapeAttr(fmt.label)} · ${escapeAttr(dpi)} dpi · ${escapeAttr(mb)} Mo.${escapeAttr(tiled)}${escapeAttr(shareHint)} Imprimez à 100 %, sans « ajuster à la page ».${escapeAttr(isUneModel() ? uneMissingImagesNote() : '')}`;
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
  /* Loi 96 : la Une d’un établissement francophone reste en français. */
  const allowed = isUneModel() ? uneBilingualAllowed(state.uneCampus) : campus.bilingual;
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
    const sel = document.getElementById('campus-select');
    if (sel) sel.value = campus;
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
  const entete = q.get('entete');
  if (entete && UNE_MAST_EXTRAS.includes(entete)) state.uneMastExtra = entete;
  { const sel = document.getElementById('une-entete'); if (sel) sel.value = state.uneMastExtra || 'radio'; }
  const media = q.get('media');
  if (media && /^[a-z0-9-]{2,60}$/.test(media)) state.uneMedia = media;
  const periode = q.get('periode') || q.get('period');
  if (periode && Object.prototype.hasOwnProperty.call(UNE_PERIOD_LABELS, periode)) {
    state.unePeriod = periode;
    const sel = document.getElementById('une-period');
    if (sel) sel.value = periode;
  }
  const picks = (q.get('articles') || '').split(',').map((x) => x.trim()).filter((x) => /^[0-9a-f]{16}$/.test(x));
  if (picks.length) state.uneManualIds = picks;
  const leadPick = q.get('une');
  if (leadPick && /^[0-9a-f]{16}$/.test(leadPick)) {
    state.uneLeadId = leadPick;
    if (state.uneManualIds.length && !state.uneManualIds.includes(leadPick)) state.uneManualIds.push(leadPick);
  }
  const ids16 = (k) => (q.get(k) || '').split(',').map((x) => x.trim()).filter((x) => /^[0-9a-f]{16}$/.test(x));
  const ids8 = (k) => (q.get(k) || '').split(',').map((x) => x.trim()).filter((x) => /^[0-9a-f]{8}$/.test(x));
  state.uneRoles = { aussi: ids16('aussi'), vedettes: ids16('vedettes'), bref: ids16('bref'), masquer: ids16('masquer') };
  state.uneSportSlogan = ids8('slogan');
  state.uneSportBand = ids8('bande');
  state.uneSportHide = ids8('sportsmasques');
  const photoUne = q.get('photoune');
  if (['bande', 'ratio', 'surimpression'].includes(photoUne)) state.uneLeadPhoto = photoUne;
  const enteteFond = q.get('entetefond');
  if (['opaque', 'voile', 'givre'].includes(enteteFond)) state.uneMastGlass = enteteFond;
  const phrase = q.get('phrase') || q.get('tagline');
  if (phrase && Object.prototype.hasOwnProperty.call(UNE_TAGLINES, phrase)) {
    state.uneTagline = phrase;
    const sel = document.getElementById('une-tagline');
    if (sel) sel.value = phrase;
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
  };
  Object.entries(presets).forEach(([name, allowed]) => {
    const value = q.get(name);
    if (!value || !allowed.includes(value)) return;
    const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
    if (name === 'format') state.format = value;
    if (name === 'lang') state.lang = value;
    if (name === 'qr') state.qr = value === 'oui';
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
  state.langs = false;
}

function applyChoice(name, value) {
  if (name === 'model') {
    state.model = value === 'une' ? 'une' : 'campus';
    if (!isUneModel() && FORMATS[state.format]?.screen) {
      state.format = 'tabloid';
      const tab = document.querySelector('input[name="format"][value="tabloid"]');
      if (tab) tab.checked = true;
    }
    if (isUneModel() && state.layout === 'verre') ensureUnePhoto();
    syncModelUi();
    renderChoices();
    syncSettingsUrl();
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
  if (name === 'unePeriod') {
    state.unePeriod = Object.prototype.hasOwnProperty.call(UNE_PERIOD_LABELS, value) ? value : 'jour';
    syncSettingsUrl();
    loadUneFeed().then(() => preview());
    return;
  }
  if (name === 'uneTagline') {
    state.uneTagline = Object.prototype.hasOwnProperty.call(UNE_TAGLINES, value) ? value : 'direct';
  }
  if (name === 'uneMedia') {
    state.uneMedia = value || 'tous';
    syncSettingsUrl();
    loadUneFeed().then(() => preview());
    return;
  }
  if (name === 'uneEntete') {
    state.uneMastExtra = UNE_MAST_EXTRAS.includes(value) ? value : 'radio';
  }
  if (name === 'uneCampus') {
    state.uneCampus = value || 'toutes';
    state.uneMedia = 'tous';
    syncSettingsUrl();
    syncLangChoice();
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
  if (name === 'showUni') state.showUni = value === 'oui';
  if (name === 'photo') {
    state.photoId = value || null;
    resetCrop(currentPhoto());
  }
  syncSettingsUrl();
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
  const viewport = previewViewportEl();
  let drag = null;
  let pointers = new Map();
  let pinchStart = null;
  const onPointerDown = (ev) => {
    if (ev.button != null && ev.button !== 0) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    (viewport || frame).setPointerCapture?.(ev.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchStart = { dist, scale: currentViewScale(), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      drag = null;
      return;
    }
    const zoomed = previewView.mode !== 'fit' || currentViewScale() > previewFitScale() + 0.02;
    if (zoomed) {
      drag = { kind: 'pan', x: ev.clientX, y: ev.clientY, px: previewView.x, py: previewView.y };
      viewport?.classList.add('is-panning');
      ev.preventDefault();
      return;
    }
    if (!currentPhoto()) return;
    drag = { kind: 'crop', x: ev.clientX, y: ev.clientY, fx: state.focalX, fy: state.focalY };
  };
  const onPointerMove = (ev) => {
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinchStart && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart.dist > 0) {
        const factor = dist / pinchStart.dist;
        previewView.mode = 'free';
        /* Reprendre depuis l’échelle de départ, pas un produit cumulatif. */
        const target = Math.min(8, Math.max(0.15, pinchStart.scale * factor));
        const prev = currentViewScale();
        zoomPreviewAt(target / prev, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      return;
    }
    if (!drag) return;
    if (drag.kind === 'pan') {
      previewView.mode = 'free';
      previewView.scale = currentViewScale();
      previewView.x = drag.px + (ev.clientX - drag.x);
      previewView.y = drag.py + (ev.clientY - drag.y);
      applyPreviewView();
      ev.preventDefault();
      return;
    }
    const box = frame.getBoundingClientRect();
    state.focalX = clamp(drag.fx - (ev.clientX - drag.x) / box.width, 0, 1);
    state.focalY = clamp(drag.fy - (ev.clientY - drag.y) / box.height, 0, 1);
    syncCropUi();
    if (lastPhotoImg) paintPreview(lastPhotoImg, currentPhoto());
  };
  const onPointerUp = (ev) => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) {
      drag = null;
      viewport?.classList.remove('is-panning');
    }
  };
  const host = viewport || frame;
  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('pointermove', onPointerMove);
  host.addEventListener('pointerup', onPointerUp);
  host.addEventListener('pointercancel', onPointerUp);
  host.addEventListener('wheel', (ev) => {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    ev.preventDefault();
    zoomPreviewAt(ev.deltaY < 0 ? 1.12 : 1 / 1.12, ev.clientX, ev.clientY);
  }, { passive: false });
  document.getElementById('view-zoom-in')?.addEventListener('click', () => zoomPreviewAt(1.25));
  document.getElementById('view-zoom-out')?.addEventListener('click', () => zoomPreviewAt(1 / 1.25));
  document.getElementById('view-fit')?.addEventListener('click', () => setPreviewFit());
  document.getElementById('view-100')?.addEventListener('click', () => setPreview100());
  const dash = document.querySelector('.dash');
  document.querySelectorAll('.dash-mobile-switch__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pane = btn.dataset.pane || 'preview';
      if (dash) dash.dataset.mobilePane = pane;
      document.querySelectorAll('.dash-mobile-switch__btn').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.pane === pane));
      });
      requestAnimationFrame(() => { sizeStudioDash(); applyPreviewView(); });
    });
  });
  if (dash && !dash.dataset.mobilePane) dash.dataset.mobilePane = 'controls';
  document.querySelectorAll('.dash-flow fieldset').forEach((fs) => {
    const hint = fs.querySelector('.field-hint:not(#une-status)');
    if (hint && hint.textContent.trim()) {
      const legend = fs.querySelector('legend');
      (legend || fs).title = hint.textContent.trim();
    }
  });
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
  const autoBtn = document.getElementById('une-auto');
  if (autoBtn) {
    autoBtn.addEventListener('click', () => {
      state.uneManualIds = [];
      state.uneLeadId = '';
      state.uneRoles = { aussi: [], vedettes: [], bref: [], masquer: [] };
      state.uneSportBand = [];
      state.uneSportSlogan = [];
      state.uneSportHide = [];
      syncUneSelectionUrl();
      renderUneList();
      renderUneSportsList();
      preview();
    });
  }
  document.getElementById('dl').addEventListener('click', () => downloadPrint('pdf'));
  document.getElementById('dl-jpg').addEventListener('click', () => downloadPrint('jpeg'));
  document.getElementById('dl-bottom').addEventListener('click', () => downloadPrint('pdf'));
  document.getElementById('dl-jpg-bottom').addEventListener('click', () => downloadPrint('jpeg'));
  const pane = previewViewportEl() || document.getElementById('preview-pane');
  let fitTimer = 0;
  const refit = () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => {
      sizeStudioDash();
      applyPreviewView();
    }, 40);
  };
  sizeStudioDash();
  if (pane && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(refit).observe(pane);
  }
  window.addEventListener('resize', refit);
  window.addEventListener('scroll', refit, { passive: true });
  window.visualViewport?.addEventListener('resize', refit);
  window.visualViewport?.addEventListener('scroll', refit, { passive: true });
}

/* posterCredit:start — même règle que bankAttribution (scripts/social/image-resolve.mjs, feedCredit) :
 * une personne « Prénom Nom » → « Photo : Nom · licence » ; un pseudo → « pseudo (Wikimedia Commons, licence) ». */
function posterPersonCredit(c) {
  const t = String(c || '').replace(/^(photo|photos|illustration|crédit|credit)s?\s*:\s*/i, '').trim();
  if (!t || /wiki|commons|unsplash|pexels|pixabay|shutterstock|getty|istock|courtoisie|courtesy|archives?|stock|@|https?:|\d/i.test(t)) return false;
  return /^\p{Lu}[\p{L}'’.-]+(?:\s+(?:(?:de|du|des|da|di|van|von|den|der|la|le|el|al|bin)\s+)*\p{Lu}[\p{L}'’.-]+)+$/u.test(t);
}
function photoLicense(photo) {
  const lic = String(photo && photo.license ? photo.license : '').trim();
  if (lic) return lic;
  const src = String(photo && photo.source ? photo.source : '');
  if (/public domain|domaine public/i.test(src)) return 'Public domain';
  return '';
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
  assets.logoMark = await loadImage('../assets/icon-mark.svg', false);
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

/* Générateur public d’affiches LE-RADAR.ca — JPEG 300 dpi, dans le navigateur. */

const DPI = 300;
const FORMATS = {
  tabloid: { id: 'tabloid', label: '11 × 17 po', file: '11x17', wIn: 11, hIn: 17 },
  letter: { id: 'letter', label: 'Lettre 8,5 × 11 po', file: 'lettre', wIn: 8.5, hIn: 11 },
  legal: { id: 'legal', label: 'Légal 8,5 × 14 po', file: 'legal', wIn: 8.5, hIn: 14 },
};

const TITLE = 'LE-RADAR.ca';
const SLOGAN = 'Journaux, radios et sports étudiants du Québec, réunis au même endroit';
const NAME_FULL = 'Le Réseau Académique de Découverte et d’Agrégation de Ressources';
const SLOGAN_EN = 'Student media on your radar';
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
};

const CAMPUSES = [
  { slug: 'generique', line: null, lineEn: null, bilingual: false, keys: null, label: 'Générique' },
  { slug: 'laval', line: 'Université Laval', bilingual: false, keys: ['laval', 'pouliot', 'casault', 'vachon', 'koninck', 'palasis', 'bonenfant', 'grand axe', 'parent', 'biermans', 'moraud', 'lemieux', 'lacerte'], label: 'Université Laval' },
  { slug: 'mcgill', line: 'Université McGill', lineEn: 'McGill University', bilingual: true, keys: ['mcgill'], label: 'Université McGill' },
  { slug: 'udem', line: 'Université de Montréal', bilingual: false, keys: ['montréal', 'montreal', 'udem', 'gaudry'], label: 'Université de Montréal' },
  { slug: 'uqam', line: 'Université du Québec à Montréal', bilingual: false, keys: ['uqam', 'jasmin'], label: 'Université du Québec à Montréal' },
  { slug: 'concordia', line: 'Université Concordia', lineEn: 'Concordia University', bilingual: true, keys: ['concordia', 'loyola'], label: 'Université Concordia' },
  { slug: 'sherbrooke', line: 'Université de Sherbrooke', bilingual: false, keys: ['sherbrooke', 'longueuil', 'cabana'], label: 'Université de Sherbrooke' },
  { slug: 'bishops', line: 'Université Bishop’s', lineEn: 'Bishop’s University', bilingual: true, keys: ['bishop'], label: 'Université Bishop’s' },
];

const state = {
  format: 'tabloid',
  campus: 'generique',
  lang: 'standard',
  greeting: 'none',
  langs: false,
  qr: true,
  photoId: null,
  photos: [],
  focalX: 0.5,
  focalY: 0.42,
  angle: 0,
  zoom: 0.9,
};

let lastPhotoImg = null;

const assets = { logo: null, qr: null, translate: null };
const imageCache = new Map();
let previewGen = 0;

function px(fmt) {
  return { w: Math.round(fmt.wIn * DPI), h: Math.round(fmt.hIn * DPI) };
}

function campusOf(slug) {
  return CAMPUSES.find((c) => c.slug === slug) || CAMPUSES[0];
}

function photoMatches(photo, campus) {
  if (!campus.keys) return true;
  const hay = `${photo.place || ''} ${photo.title || ''} ${photo.description || ''}`.toLowerCase();
  return campus.keys.some((k) => hay.includes(k));
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
  const { w, h } = px(fmt);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const refW = 3300;
  const refH = 5100;
  const safe = Math.round(0.45 * DPI * (h / refH));
  const barH = Math.max(28, Math.round(42 * (w / refW)));
  const campus = campusOf(opts.campus);
  const kind = campus.bilingual || opts.lang !== 'bilingue' ? opts.lang : 'standard'; // FR : jamais de bilingue
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
  const legal = [INDEP_1, INDEP_2];
  if (kind === 'bilingue') legal.push(INDEP_EN);
  const fit = Math.min(w / 3300, h / 5100);
  const fName = 32 * fit;
  const fBody = 28 * fit;
  const fCredit = 24 * fit;
  const measure = (text, size) => {
    ctx.font = `400 ${size}px "LR Sans"`;
    const m = ctx.measureText(text);
    return (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0) || size;
  };
  const nameH = measure(NAME_FULL, fName);
  const legalRows = legal.map((t, i) => {
    const sz = (kind === 'bilingue' && i === legal.length - 1) ? fCredit : fBody;
    return { t, sz, th: measure(t, sz) };
  });
  const legalH = legalRows.reduce((s, r) => s + r.th, 0) + 10 * (legalRows.length - 1);
  const creditH = credit ? measure(credit, fCredit) : 0;
  const fLang = 26 * fit;
  const iconS = 26 * fit;
  const langFont = `600 ${fLang}px "Noto Sans", "Noto Sans JP", "Noto Sans SC", "Noto Sans TC", "Noto Sans Arabic", "Noto Sans Devanagari", "LR Sans Semi"`;
  ctx.font = langFont;
  const langMax = w - 2 * safe - 240;
  const langLines = opts.langs ? wrapJoin(ctx, TRANSLATE_LANGS, langMax) : [];
  const langLineH = langLines.length ? measure(langLines[0] || 'Français', fLang) : 0;
  const langsH = opts.langs
    ? iconS + 8 + langLines.length * (langLineH + 6)
    : 0;
  const footLogo = 72 * fit;
  const markH = Math.max(footLogo, 40 * fit);
  const qrIn = fmt.id === 'tabloid' ? 2.25 : 1.65;
  const qrPx = Math.round(qrIn * DPI * fit);
  const qrPad = Math.round(36 * fit);
  const qrSide = qrPx;

  let contentBottom = h - safe;
  if (credit) contentBottom -= creditH + 40 * fit;
  if (opts.langs && langsH) contentBottom -= langsH + 20 * fit;
  contentBottom -= legalH + 16 * fit + nameH + 10 * fit + markH;
  if (opts.qr && assets.qr) contentBottom -= 24 * fit + qrSide;
  const playTop = barH + 12 * fit;
  const playBot = contentBottom - 28 * fit;
  const play = Math.max(200, playBot - playTop);
  const big = Math.round(play * (kind === 'minimal' ? 0.24 : 0.21));
  const logoY = playTop + play * 0.18;
  if (!photo) drawRadar(ctx, w, h, w / 2, logoY + big / 2);

  ctx.fillStyle = PURPLE;
  ctx.fillRect(0, 0, w, barH);

  let cy = h - safe;
  if (credit) {
    cy -= creditH;
    ctx.font = `400 ${fCredit}px "LR Sans"`;
    fillCentered(ctx, credit, cy, MUTED);
    cy -= 40 * fit;
  }
  if (opts.langs && langsH) {
    cy -= langsH;
    const langTop = cy;
    if (assets.translate) {
      ctx.drawImage(assets.translate, (w - iconS) / 2, langTop, iconS, iconS);
    }
    let ly = langTop + iconS + 8;
    ctx.font = langFont;
    ctx.fillStyle = MUTED;
    langLines.forEach((line) => {
      fillCentered(ctx, line, ly, MUTED);
      ly += langLineH + 6;
    });
    cy -= 20 * fit;
  }
  cy -= legalH;
  let ty = cy;
  legalRows.forEach((row) => {
    ctx.font = `400 ${row.sz}px "LR Sans"`;
    fillCentered(ctx, row.t, ty, MUTED);
    ty += row.th + 10;
  });
  cy -= 16 * fit;
  cy -= nameH;
  ctx.font = `400 ${fName}px "LR Sans"`;
  fillCentered(ctx, NAME_FULL, cy, SOFT);
  cy -= 10 * fit;
  cy -= markH;
  const markSize = 40 * fit;
  const markGap = 16 * fit;
  const markW = trackedWidth(ctx, TITLE, markSize);
  const rowW = footLogo + markGap + markW;
  const mx = (w - rowW) / 2;
  if (assets.logo) ctx.drawImage(assets.logo, mx, cy, footLogo, footLogo);
  fillTracked(ctx, TITLE, cy + (footLogo - markSize) / 2, markSize, INK, mx + footLogo + markGap);
  if (opts.qr && assets.qr) {
    const card = qrSide;
    cy -= 24 * fit + card;
    ctx.fillStyle = '#fff';
    ctx.fillRect((w - card) / 2, cy, card, card);
    const inner = card - 2 * qrPad;
    ctx.drawImage(assets.qr, (w - inner) / 2, cy + qrPad, inner, inner);
  }

  if (assets.logo) ctx.drawImage(assets.logo, (w - big) / 2, logoY, big, big);
  const titleSize = Math.round(play * 0.058);
  const titleY = playTop + play * 0.48;
  fillTracked(ctx, TITLE, titleY, titleSize, INK);
  let y = titleY + titleSize + Math.round(play * 0.028);
  const maxW = w - 2 * safe - 80;
  let sloganSize = Math.round(play * 0.019);
  ctx.font = `400 ${sloganSize}px "LR Sans"`;
  while (textW(ctx, SLOGAN) > maxW && sloganSize > 22) {
    sloganSize -= 1;
    ctx.font = `400 ${sloganSize}px "LR Sans"`;
  }
  const enSize = Math.max(16, Math.floor(sloganSize / 2));
  const uniSize = Math.round(play * 0.018);
  const uniEnSize = Math.max(14, Math.round(play * 0.01));
  const gapBlock = Math.round(play * 0.022);
  const gapLang = Math.round(play * 0.014);
  if (kind !== 'minimal') {
    ctx.font = `400 ${sloganSize}px "LR Sans"`;
    y += fillCentered(ctx, SLOGAN, y, INK) + (kind === 'bilingue' ? gapLang : gapBlock);
    if (kind === 'bilingue') {
      ctx.font = `400 ${enSize}px "LR Sans"`;
      y += fillCentered(ctx, SLOGAN_EN, y, SOFT) + gapBlock;
    }
  }
  if (campus.line) {
    ctx.font = `400 ${uniSize}px "LR Sans"`;
    y += fillCentered(ctx, campus.line, y, INK) + (kind === 'bilingue' && campus.lineEn ? gapLang : gapBlock);
    if (kind === 'bilingue' && campus.lineEn) {
      ctx.font = `400 ${uniEnSize}px "LR Sans"`;
      y += fillCentered(ctx, campus.lineEn, y, SOFT) + gapBlock;
    }
  }
  const greet = GREETINGS[opts.greeting];
  if (greet) {
    const gSize = Math.round(play * 0.048);
    y += Math.round(play * 0.012);
    ctx.save();
    ctx.translate(w / 2, y + gSize * 0.2);
    ctx.rotate((-8 * Math.PI) / 180);
    ctx.font = `700 ${gSize}px "LR Script"`;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(greet, 0, 0);
    ctx.restore();
  }

  return canvas;
}

function filteredPhotos() {
  const campus = campusOf(state.campus);
  return state.photos.filter((p) => minSide(p) >= 1400 && photoMatches(p, campus));
}

function minSide(p) {
  return Math.min(p.width || 0, p.height || 0);
}

function currentPhoto() {
  if (!state.photoId) return null;
  return state.photos.find((p) => photoKeyId(p) === state.photoId) || null;
}

function renderChoices() {
  const photos = filteredPhotos();
  const grid = document.getElementById('photo-grid');
  const selectedStillValid = state.photoId && photos.some((p) => photoKeyId(p) === state.photoId);
  if (!selectedStillValid) state.photoId = null;
  const items = [{ id: '', title: 'Fond radar' }, ...photos];
  grid.innerHTML = items.map((p) => {
    const id = p.id === '' ? '' : photoKeyId(p);
    const on = (id || null) === state.photoId || (!id && !state.photoId);
    if (!id) {
      return `<label class="thumb-radar"><input type="radio" name="photo" value="" ${on ? 'checked' : ''}><span class="solid solid--radar" title="Fond radar"><img src="../assets/icon.svg" width="40" height="40" alt=""><span>Fond radar</span></span></label>`;
    }
    return `<label title="${escapeAttr(p.title || '')}"><input type="radio" name="photo" value="${escapeAttr(id)}" ${on ? 'checked' : ''}><img src="${thumbUrl(p, 280)}" width="92" height="142" alt="" loading="lazy"></label>`;
  }).join('');
  const n = photos.length;
  document.getElementById('photo-meta').textContent = state.campus === 'generique'
    ? `${n} photos de la banque campus`
    : `${n} photos pour ${campusOf(state.campus).label}`;
  syncCropUi();
}

function escapeAttr(s) {
  return String(s).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
}

function specLine() {
  const fmt = FORMATS[state.format];
  const { w, h } = px(fmt);
  return `${fmt.label} · ${w} × ${h} px · 300 dpi · JPEG`;
}

function recipeLine() {
  const bits = [
    FORMATS[state.format].label,
    campusOf(state.campus).label,
    state.lang === 'bilingue' ? 'Bilingue' : (state.lang === 'minimal' ? 'Minimal' : 'Français'),
  ];
  if (state.greeting !== 'none' && GREETINGS[state.greeting]) bits.push(GREETINGS[state.greeting]);
  if (state.qr) bits.push('QR');
  const photo = currentPhoto();
  bits.push(photo ? (photo.title || 'Photo') : 'Fond radar');
  return bits.join(' · ');
}

function paintPreview(img, photo) {
  const out = document.getElementById('preview');
  const canvas = compose({
    format: state.format,
    campus: state.campus,
    lang: state.lang,
    greeting: state.greeting,
    langs: state.langs,
    qr: state.qr,
    photoImg: img || null,
    credit: photo?.credit,
    license: photo?.license,
    focalX: state.focalX,
    focalY: state.focalY,
    cropScale: state.zoom,
    angle: state.angle,
  });
  const view = document.createElement('canvas');
  const scale = Math.min(440 / canvas.width, 1);
  view.width = Math.round(canvas.width * scale);
  view.height = Math.round(canvas.height * scale);
  const vctx = view.getContext('2d');
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

async function downloadPrint() {
  const btn = document.getElementById('dl');
  const status = document.getElementById('status');
  btn.disabled = true;
  status.textContent = 'Composition du fichier d’impression…';
  try {
    const fmt = FORMATS[state.format];
    const { w, h } = px(fmt);
    const photo = currentPhoto();
    let img = null;
    if (photo) img = await loadImage(printUrl(photo), true);
    const canvas = compose({
      format: state.format,
      campus: state.campus,
      lang: state.lang,
      greeting: state.greeting,
      langs: state.langs,
      qr: state.qr,
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
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG'))), 'image/jpeg', 0.95);
    });
    const campus = campusOf(state.campus);
    const lang = state.lang === 'bilingue' ? 'bilingue' : (state.lang === 'minimal' ? 'minimal' : 'fr');
    const qr = state.qr ? '-qr' : '';
    const greet = state.greeting !== 'none' ? `-${state.greeting}` : '';
    const langs = state.langs ? '-langues' : '';
    const name = `le-radar-affiche-${campus.slug}-${fmt.file}-${lang}${greet}${langs}${qr}.jpg`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    const mb = (blob.size / 1_048_576).toFixed(1);
    status.innerHTML = `Fichier <strong>${name}</strong> · ${w} × ${h} px · 300 dpi · ${mb} Mo. Imprimez à 100 %, sans « ajuster à la page ».`;
  } catch (err) {
    status.textContent = `Téléchargement impossible : ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

function syncLangChoice() {
  const allowed = campusOf(state.campus).bilingual;
  const bi = document.querySelector('label:has(input[name="lang"][value="bilingue"])');
  if (bi) bi.hidden = !allowed;
  if (!allowed && state.lang === 'bilingue') {
    state.lang = 'standard';
    const fr = document.querySelector('input[name="lang"][value="standard"]');
    if (fr) fr.checked = true;
  }
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
  if (!box) return;
  const on = Boolean(state.photoId);
  box.hidden = !on;
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

function applyChoice(name, value) {
  if (name === 'format') state.format = value;
  if (name === 'campus') {
    state.campus = value;
    syncLangChoice();
    renderChoices();
  }
  if (name === 'lang') state.lang = value;
  if (name === 'qr') state.qr = value === 'oui';
  if (name === 'langs') state.langs = value === 'oui';
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
  document.getElementById('dl').addEventListener('click', downloadPrint);
}

async function main() {
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  const labLink = document.getElementById('lab-photo-link');
  if (labLink && local) labLink.hidden = false;
  bind();
  syncLangChoice();
  await loadFonts();
  await document.fonts.ready;
  assets.logo = await loadImage('../assets/icon.svg', false);
  assets.qr = await loadImage('../assets/kit/qr-le-radar.svg', false);
  assets.translate = await loadImage('../assets/kit/translate-mark.svg', false);
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
    const campus = p.campus === true || (Array.isArray(p.tags) && p.tags.includes('campus'));
    if (!campus) return false;
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

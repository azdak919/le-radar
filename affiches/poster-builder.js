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
const INDEP_1 = 'Projet indépendant, non officiel — sans affiliation aux médias ni aux établissements.';
const INDEP_2 = 'Les contenus appartiennent à leurs publications d’origine.';
const INDEP_EN = 'Independent, unofficial, not affiliated. Content belongs to the original publications.';

const INK = '#F1F2F4';
const SOFT = '#C2C6CD';
const MUTED = '#888D96';
const BG = '#0E0F12';
const PURPLE = '#6C2163';
const TRACK = -0.02;

const CAMPUSES = [
  { slug: 'generique', line: null, lineEn: null, bilingual: false, keys: null, label: 'Générique' },
  { slug: 'laval', line: 'Université Laval', bilingual: false, keys: ['laval', 'pouliot', 'casault', 'vachon', 'koninck', 'palasis', 'bonenfant', 'grand axe'], label: 'Université Laval' },
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
  qr: false,
  photoId: null,
  photos: [],
};

const assets = { logo: null, qr: null };

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
  if (!name) return photo.url;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${width}`;
}

function loadImage(src, cors = true) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image: ${src}`));
    img.src = src;
  });
}

async function loadFonts() {
  const faces = [
    new FontFace('LR Serif', 'url(../scripts/og-fonts/SourceSerif4Display-Bold.ttf)'),
    new FontFace('LR Sans', 'url(../scripts/og-fonts/Inter-Regular.ttf)'),
    new FontFace('LR Sans Semi', 'url(../scripts/og-fonts/Inter-SemiBold.ttf)'),
  ];
  await Promise.all(faces.map(async (f) => {
    await f.load();
    document.fonts.add(f);
  }));
}

function coverDraw(ctx, img, tw, th, fx = 0.5, fy = 0.42, scale = 0.9) {
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const ratio = tw / th;
  let cw;
  let ch;
  if (sw / sh > ratio) {
    ch = sh * scale;
    cw = ch * ratio;
  } else {
    cw = sw * scale;
    ch = cw / ratio;
  }
  cw = Math.max(1, Math.min(Math.round(cw), sw));
  ch = Math.max(1, Math.min(Math.round(ch), sh));
  if (cw / ch > ratio) cw = Math.max(1, Math.min(Math.round(ch * ratio), sw));
  else ch = Math.max(1, Math.min(Math.round(cw / ratio), sh));
  const left = Math.max(0, Math.min(Math.round(fx * sw - cw / 2), sw - cw));
  const top = Math.max(0, Math.min(Math.round(fy * sh - ch / 2), sh - ch));
  ctx.filter = 'saturate(0.52) contrast(1.04)';
  ctx.drawImage(img, left, top, cw, ch, 0, 0, tw, th);
  ctx.filter = 'none';
  ctx.fillStyle = 'rgba(14, 15, 18, 0.58)';
  ctx.fillRect(0, 0, tw, th);
}

function drawRadar(ctx, w, h) {
  const cx = w / 2;
  const cy = h * 0.34;
  ctx.strokeStyle = 'rgba(241, 242, 244, 0.06)';
  ctx.lineWidth = 2;
  for (const r of [280, 520, 820, 1180, 1600, 2100].map((n) => n * (w / 3300))) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(241, 242, 244, 0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, h);
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.stroke();
}

function textW(ctx, text) {
  return ctx.measureText(text).width;
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

  const scale = w / 792;
  const safe = Math.round(0.5 * DPI);
  const barH = 42;
  const campus = campusOf(opts.campus);
  const kind = campus.bilingual || opts.lang !== 'bilingue' ? opts.lang : 'standard'; // FR : jamais de bilingue
  const photo = opts.photoImg || null;

  if (photo) {
    coverDraw(ctx, photo, w, h, opts.focalX ?? 0.5, opts.focalY ?? 0.42, opts.cropScale ?? 0.9);
  } else {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    drawRadar(ctx, w, h);
  }

  ctx.fillStyle = PURPLE;
  ctx.fillRect(0, 0, w, barH);

  const big = Math.round((kind === 'minimal' ? 220 : 200) * scale);
  const logoY = Math.round(236 * scale);
  if (assets.logo) ctx.drawImage(assets.logo, (w - big) / 2, logoY, big, big);

  const titleSize = Math.round(56 * scale);
  const titleY = Math.round(560 * scale);
  fillTracked(ctx, TITLE, titleY, titleSize, INK);

  let y = titleY + titleSize + Math.round(28 * scale);
  const maxW = w - 2 * safe - 120;
  let sloganSize = Math.round(18 * scale);
  ctx.font = `400 ${sloganSize}px "LR Sans"`;
  while (textW(ctx, SLOGAN) > maxW && sloganSize > 30) {
    sloganSize -= 2;
    ctx.font = `400 ${sloganSize}px "LR Sans"`;
  }
  const enSize = Math.max(28, Math.floor(sloganSize / 2));
  const uniSize = Math.round(18 * scale);
  const uniEnSize = Math.max(26, Math.round(9 * scale));
  const gapBlock = Math.round(28 * scale);
  const gapLang = Math.round(18 * scale);

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
      fillCentered(ctx, campus.lineEn, y, SOFT);
    }
  }

  const credit = photo && opts.credit
    ? `Photo : ${opts.credit}${opts.license ? ` · ${opts.license}` : ''}`
    : '';
  const foot = [NAME_FULL, INDEP_1, INDEP_2];
  if (kind === 'bilingue') foot.push(INDEP_EN);
  const fName = 36 * (w / 3300);
  const fBody = 38 * (w / 3300);
  const fCredit = 26 * (w / 3300);
  const innerF = 16 * (w / 3300);
  ctx.font = `400 ${fName}px "LR Sans"`;
  let copyH = 0;
  const sizes = foot.map((t, i) => {
    const sz = i === 0 ? fName : (i === foot.length - 1 && kind === 'bilingue' ? fCredit : fBody);
    ctx.font = `400 ${sz}px "LR Sans"`;
    const m = ctx.measureText(t);
    const th = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0) || sz;
    copyH += th + (i < foot.length - 1 ? innerF : 0);
    return { t, sz, th };
  });
  ctx.font = `400 ${fCredit}px "LR Sans"`;
  const creditH = credit ? ((ctx.measureText(credit).actualBoundingBoxAscent || 0) + (ctx.measureText(credit).actualBoundingBoxDescent || 0) || fCredit) : 0;
  const footLogo = 72 * (w / 3300);
  const markH = Math.max(footLogo, 40 * (w / 3300));
  const qrIn = fmt.id === 'tabloid' ? 2.25 : 1.75;
  const qrPx = Math.round(qrIn * DPI);
  const qrPad = Math.round(36 * (w / 3300));
  const qrSide = opts.qr ? qrPx : 0;

  let cy = h - safe;
  if (credit) {
    cy -= creditH;
    ctx.font = `400 ${fCredit}px "LR Sans"`;
    fillCentered(ctx, credit, cy, MUTED);
    cy -= 56 * (w / 3300);
  }
  cy -= copyH;
  let ty = cy;
  sizes.forEach((row, i) => {
    ctx.font = `400 ${row.sz}px "LR Sans"`;
    fillCentered(ctx, row.t, ty, i === 0 || (kind === 'bilingue' && i === sizes.length - 1) ? MUTED : SOFT);
    ty += row.th + innerF;
  });
  cy -= 28 * (w / 3300);
  cy -= markH;
  const markSize = 40 * (w / 3300);
  const markGap = 16 * (w / 3300);
  const markW = trackedWidth(ctx, TITLE, markSize);
  const rowW = footLogo + markGap + markW;
  const mx = (w - rowW) / 2;
  if (assets.logo) ctx.drawImage(assets.logo, mx, cy, footLogo, footLogo);
  fillTracked(ctx, TITLE, cy + (footLogo - markSize) / 2, markSize, INK, mx + footLogo + markGap);
  if (opts.qr && assets.qr) {
    const card = qrSide;
    cy -= 32 * (w / 3300) + card;
    ctx.fillStyle = '#fff';
    ctx.fillRect((w - card) / 2, cy, card, card);
    const inner = card - 2 * qrPad;
    ctx.drawImage(assets.qr, (w - inner) / 2, cy + qrPad, inner, inner);
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
  return state.photos.find((p) => p.id === state.photoId) || null;
}

function renderChoices() {
  const photos = filteredPhotos();
  const grid = document.getElementById('photo-grid');
  const selectedStillValid = state.photoId && photos.some((p) => p.id === state.photoId);
  if (!selectedStillValid) state.photoId = null;
  const items = [{ id: null, label: 'Fond uni' }, ...photos];
  grid.innerHTML = items.map((p) => {
    const on = (p.id || null) === state.photoId;
    if (!p.id) {
      return `<label><input type="radio" name="photo" value="" ${on ? 'checked' : ''}><span class="solid">Fond #0E0F12</span></label>`;
    }
    return `<label title="${escapeAttr(p.title || '')}"><input type="radio" name="photo" value="${p.id}" ${on ? 'checked' : ''}><img src="${thumbUrl(p, 280)}" width="92" height="142" alt="" loading="lazy"></label>`;
  }).join('');
  grid.querySelectorAll('input').forEach((el) => {
    el.addEventListener('change', () => {
      state.photoId = el.value || null;
      preview();
    });
  });
  const n = photos.length;
  document.getElementById('photo-meta').textContent = state.campus === 'generique'
    ? `${n} photos de la banque campus`
    : `${n} photos pour ${campusOf(state.campus).label}`;
}

function escapeAttr(s) {
  return String(s).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
}

function specLine() {
  const fmt = FORMATS[state.format];
  const { w, h } = px(fmt);
  return `${fmt.label} · ${w} × ${h} px · 300 dpi · JPEG`;
}

async function preview() {
  const status = document.getElementById('status');
  const out = document.getElementById('preview');
  try {
    const photo = currentPhoto();
    let img = null;
    if (photo) img = await loadImage(thumbUrl(photo, 1600));
    const canvas = compose({
      format: state.format,
      campus: state.campus,
      lang: state.lang,
      qr: state.qr,
      photoImg: img,
      credit: photo?.credit,
      license: photo?.license,
      focalX: 0.5,
      focalY: 0.42,
    });
    const view = document.createElement('canvas');
    const scale = 420 / canvas.width;
    view.width = Math.round(canvas.width * scale);
    view.height = Math.round(canvas.height * scale);
    const vctx = view.getContext('2d');
    vctx.imageSmoothingEnabled = true;
    vctx.imageSmoothingQuality = 'high';
    vctx.drawImage(canvas, 0, 0, view.width, view.height);
    out.replaceChildren(view);
    status.innerHTML = `<strong>${specLine()}</strong> — aperçu. Le téléchargement est le fichier d’impression.`;
  } catch (err) {
    status.textContent = `Aperçu : ${err.message}`;
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
    if (photo) img = await loadImage(photo.url);
    const canvas = compose({
      format: state.format,
      campus: state.campus,
      lang: state.lang,
      qr: state.qr,
      photoImg: img,
      credit: photo?.credit,
      license: photo?.license,
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
    const name = `le-radar-affiche-${campus.slug}-${fmt.file}-${lang}${qr}.jpg`;
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

function bind() {
  document.querySelectorAll('[name="format"]').forEach((el) => {
    el.addEventListener('change', () => { state.format = el.value; preview(); });
  });
  document.querySelectorAll('[name="campus"]').forEach((el) => {
    el.addEventListener('change', () => {
      state.campus = el.value;
      syncLangChoice();
      renderChoices();
      preview();
    });
  });
  document.querySelectorAll('[name="lang"]').forEach((el) => {
    el.addEventListener('change', () => { state.lang = el.value; preview(); });
  });
  document.querySelectorAll('[name="qr"]').forEach((el) => {
    el.addEventListener('change', () => { state.qr = el.value === 'oui'; preview(); });
  });
  document.getElementById('dl').addEventListener('click', downloadPrint);
}

async function main() {
  bind();
  syncLangChoice();
  await loadFonts();
  assets.logo = await loadImage('../assets/icon.svg', false);
  assets.qr = await loadImage('../assets/kit/qr-le-radar.svg', false);
  const bank = await fetch('../data/quebec-university-backgrounds.json').then((r) => r.json());
  state.photos = (bank.photos || []).filter((p) => p.url && p.width && p.height);
  renderChoices();
  await preview();
}

main().catch((err) => {
  document.getElementById('status').textContent = err.message;
});

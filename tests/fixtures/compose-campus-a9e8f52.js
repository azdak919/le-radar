/* Gabarit campus figé : function compose() extraite de a9e8f52.
 * Ne pas « améliorer » ce fichier : tout écart visuel avec les affiches
 * imprimées à Laval est un bug. Le test de source (affiches-campus-layout)
 * et le rendu pixel (affiches-combos) comparent le studio actuel à cette référence.
 */
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

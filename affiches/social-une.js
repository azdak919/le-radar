/* Image « La une du matin / du soir » du Radar (réseaux sociaux), en français seulement.
 * window.renderUne({ model, format }) dessine la carte puis attend polices et images.
 * model = { slot: { label, dayLabel, kind }, items: [{ title, byline, source, place, sport, credit, hook, images[], focalY, focalX }], sports: [...] }
 * (scripts/social/une-lib.mjs). Matin : thème clair du site ; soir : thème sombre. Gabarit « Verre » + photo de la une
 * dégagée (panel du 12 nov. 2026, retour de Charles : mélange A/B, résultats sportifs étudiants pour combler le bas).
 * Instagram une régulière 3:4 (format grille, modèle B) : couverture plein cadre, pastille de créneau, date avec année, Aussi à la une (jusqu’à 2). Le poster sport conserve l’ancienne grille à barres. Post d’un seul article (format article / article-portrait, modèle v6) : QR vers la fiche le-radar.ca/article/<id>/. Aucun logo d'université. */
(function () {
  'use strict';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const NB = '\u00A0';
  // Ligne d'auteur comme sur le site (style-feed.css .article-byline) : « Par » pâle (--muted, 500), auteur foncé (--ink, 600), média pâle.
  function byline(it) {
    const p = el('p', 'by'); const [who, src] = String(it.byline || '').split(' · ');
    if (src) p.append(el('span', 'lbl', 'Par'), el('span', 'who', who), el('span', 'src', ' · ' + src)); else p.append(el('span', 'who solo', who));
    return p;
  }
  // Couleur de l'établissement (brand-colors.json) ajustée pour un contraste AA (≥ 4,5:1) sur les cartes du thème ; repli : accent du thème.
  const hex = (h) => { const m = String(h || '').match(/^#?([0-9a-f]{6})$/i); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
  const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const CARD_BG = { clair: [[255, 255, 255], [242, 242, 242]], sombre: [[37, 52, 86], [58, 72, 104]] };
  function aaColor(h, theme) {
    let c = hex(h); if (!c) return '';
    const bgs = CARD_BG[theme] || CARD_BG.clair, to = theme === 'sombre' ? 255 : 0;
    for (let i = 0; i < 40 && bgs.some((b) => ratio(c, b) < 4.6); i++) c = c.map((x) => Math.round(x + (to - x) * 0.08));
    return `rgb(${c.join(',')})`;
  }
  // Même contraste AA, mais on garde la teinte (éviter un gris délavé sur le thème sombre).
  const rgbToHsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
    if (!d) return [0, 0, l];
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
  };
  const hslToRgb = (h, s, l) => {
    const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  };
  function aaBrandColor(h, theme) {
    let c = hex(h); if (!c) return '';
    const bgs = CARD_BG[theme] || CARD_BG.clair, dir = theme === 'sombre' ? 1 : -1;
    let [H, S, L] = rgbToHsl(...c);
    for (let i = 0; i < 80 && bgs.some((b) => ratio(c, b) < 4.6); i++) {
      L = Math.max(0, Math.min(1, L + dir * 0.02));
      c = hslToRgb(H, S, L);
    }
    return `rgb(${c.join(',')})`;
  }
  // Kicker : média dans la couleur d’établissement · sigle dans la couleur normale du kicker.
  function kicker(it) {
    const k = el('p', 'kick');
    if (it.sport) k.append(el('span', 'emo', it.sport));
    const src = String(it.source || '').trim();
    const place = String(it.place || '').trim();
    if (src || place) {
      const line = el('span', 'labs');
      if (src) {
        const media = el('span', 'media', src);
        const c = aaBrandColor(it.placeColor, THEME);
        if (c) media.style.color = c;
        line.append(media);
      }
      if (src && place) line.append(document.createTextNode(NB + '·' + NB));
      if (place) line.append(el('span', 'place', place));
      k.append(line);
    }
    return k.childNodes.length ? k : null;
  }
  function loadFirst(img, urls) {
    return new Promise((resolve) => {
      const list = (urls || []).filter(Boolean); let i = 0, done = false;
      const end = (v) => { if (!done) { done = true; resolve(v); } };
      const next = () => { if (i >= list.length) { end(false); return; } img.src = list[i++]; };
      img.onload = () => end(true); img.onerror = next; next();
      setTimeout(() => end(img.complete && img.naturalWidth > 0), 15000);
    });
  }
  // Recadrage object-fit: cover. focalX / focalY dans [0, 1] (défaut 50 % / defaultY).
  function clamp01(n, fallback) {
    const x = Number(n);
    return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : fallback;
  }
  function objectPosition(it, defaultY) {
    const fx = clamp01(it && it.focalX, 0.5);
    const fy = clamp01(it && it.focalY, defaultY);
    return `${Math.round(fx * 100)}% ${Math.round(fy * 100)}%`;
  }
  function photo(it, cls, badge, format) {
    const box = el('div', cls); const img = el('img'); img.alt = ''; box.append(img);
    if (badge) box.append(el('span', 'badge', badge));
    const credit = String(it.credit || '').replace(/^\s*(?:photo|photos|illustration|crédit|credit)s?\s*:\s*/i, '').replace(/^📸\s*/, '').trim();
    if (credit && badge) box.append(el('span', 'credit', format === 'grille' ? '📸 ' + credit : 'Photo' + NB + ': ' + credit));
    img.style.objectPosition = objectPosition(it, 0.4);
    box.ready = (it.images && it.images.length ? loadFirst(img, it.images) : Promise.resolve(false)).then((ok) => { if (!ok) { img.remove(); box.classList.add('empty'); } return ok ? img.currentSrc || img.src : ''; });
    return box;
  }
  // Une rencontre = deux lignes : « 🏀 Basketball (H) · Final · jeu. 12 nov. » puis les équipes (gagnant d'abord, en gras ; « visite » / « reçoit » pâles).
  // Régate : « Concordia · Championnat canadien de course en flotte », sans verbe « visite ».
  function teamNode(t, cls) {
    const n = el('span', 'tn' + (cls ? ' ' + cls : '')); n.append(el('b', '', t.name));
    if (t.inst) { const i = el('span', 'in', NB + '(' + t.inst + ')'); const c = aaColor(t.color, THEME); if (c) i.style.color = c; n.append(i); }
    return n;
  }
  function match(r) {
    const m = el('div', 'mt' + (r.kind === 'avenir' ? ' next' : ''));
    const h = el('p', 'mh'); h.append(el('span', 'emo', r.emoji), el('span', 'sp', r.sport), el('span', 'dt', ' · ' + r.when)); m.append(h);
    const line = el('p', 'ml');
    if (r.kind === 'resultat') {
      line.append(teamNode(r.teams[0], r.tie ? '' : 'win'), el('span', 'sc' + (r.tie ? '' : ' win'), NB + r.teams[0].score), el('span', 'dash', '–'), el('span', 'sc', r.teams[1].score + NB), teamNode(r.teams[1]));
    } else if (r.event || !r.verb) {
      line.append(teamNode(r.teams[0]), el('span', 'vb', ' · '), el('span', 'ev', r.event || (r.teams[1] && r.teams[1].name) || ''));
      if (r.place) line.append(el('span', 'vb', ' · '), el('span', 'sc', r.place));
    } else {
      line.append(teamNode(r.teams[0]), el('span', 'vb', ' ' + r.verb + ' '), teamNode(r.teams[1]));
    }
    m.append(line); return m;
  }
  // Réduire avant de couper ; si le nom ne tient toujours pas au plancher, il passe sur deux lignes (jamais d'ellipse).
  function fitLine(line, min) {
    const s0 = parseFloat(getComputedStyle(line).fontSize); let s = s0;
    while (line.scrollWidth > line.clientWidth + 1 && s > min) { s -= 0.5; line.style.fontSize = s + 'px'; }
    if (line.scrollWidth > line.clientWidth + 1) { line.style.fontSize = Math.max(min, s0 - 2) + 'px'; line.classList.add('wrap'); }
  }
  function radioRow(x) {
    const r = el('div', 'show'); const t = el('p', 'st'); t.append(el('span', 'emo', x.emoji), el('span', 'stt', x.title));
    const m = el('p', 'when'); m.append(el('b', 'sta', x.station), document.createTextNode(' · ' + x.when)); r.append(t, m); return r;
  }
  function fit(node, min, lines) {
    // Réduit la police ; au plancher, coupe proprement à `lines` lignes avec « … » (jamais une demi-ligne visible).
    node.style.webkitLineClamp = String(lines); let size = parseFloat(getComputedStyle(node).fontSize);
    while (node.scrollHeight > node.clientHeight + 2 && size > min) { size -= 2; node.style.fontSize = size + 'px'; }
  }
  let THEME = 'clair';
  function brandBarGrille() {
    const bar = el('div', 'ig-brand'); const logo = el('img'); logo.src = '../assets/icon.svg'; logo.alt = '';
    bar.append(logo, el('span', 'wm', 'LE\u2011RADAR.ca'));
    bar.ready = new Promise((r) => { if (logo.complete) r(); else { logo.onload = r; logo.onerror = r; } });
    return bar;
  }
  function brandBarArticle() {
    const bar = el('div', 'ig-brand');
    const logo = el('img'); logo.src = '../assets/icon.svg'; logo.alt = '';
    const text = el('div', 'ig-brand-text');
    text.append(el('span', 'wm', 'LE\u2011RADAR.ca'));
    const motto = el('p', 'ig-motto');
    motto.append(
      el('span', 'lead', 'Journaux, radios et sports étudiants du Québec, '),
      el('span', 'tag', 'réunis au même endroit'),
    );
    text.append(motto);
    bar.append(logo, text);
    bar.ready = new Promise((r) => { if (logo.complete) r(); else { logo.onload = r; logo.onerror = r; } });
    return bar;
  }
  function igKicker(label, dayLabel) {
    const k = el('p', 'ig-kicker');
    k.append(el('span', 'slot', label || ''));
    if (dayLabel) k.append(el('span', 'mid', ' · '), el('span', 'date', dayLabel));
    return k;
  }
  // QR uniquement vers une fiche Radar (le-radar.ca/article/<id>/). Pas de QR sinon (sport, URL absente ou étrangère).
  function articleQrUrl(u) {
    const s = String(u || '').trim();
    return /^https:\/\/le-radar\.ca\/article\/[0-9a-f]+\/$/i.test(s) ? s : '';
  }
  function igQr(url, lead) {
    const wrap = el('div', 'ig-qr');
    wrap.dataset.url = url;
    const api = (typeof qrcodegen !== 'undefined' && qrcodegen.QrCode) ? qrcodegen.QrCode : null;
    if (api) {
      const qr = api.encodeText(url, api.Ecc.QUARTILE);
      const n = qr.size, quiet = 3, dim = n + quiet * 2;
      const c = document.createElement('canvas');
      c.width = dim; c.height = dim;
      const ctx = c.getContext('2d', { alpha: false });
      ctx.fillStyle = '#F1F2F4'; ctx.fillRect(0, 0, dim, dim);
      ctx.fillStyle = '#0E0F12';
      for (let row = 0; row < n; row += 1) {
        for (let col = 0; col < n; col += 1) {
          if (qr.getModule(col, row)) ctx.fillRect(col + quiet, row + quiet, 1, 1);
        }
      }
      wrap.append(c);
    }
    // Sujet à droite : on plaque le QR plus haut et plus à droite, toujours dans ce coin, pour éviter le sujet.
    const fx = Number.isFinite(lead && lead.focalX) ? lead.focalX : 0.5;
    if (fx >= 0.6) { wrap.style.top = '180px'; wrap.style.right = '24px'; }
    return wrap;
  }
  function fitTitle(node, floor) {
    let size = parseFloat(getComputedStyle(node).fontSize);
    while (node.scrollHeight > node.clientHeight + 2 && size > floor) { size -= 2; node.style.fontSize = size + 'px'; }
  }
  // Réduit le titre seulement s’il dépasse le nombre de lignes prévu (line-clamp).
  // On ne se fie pas à clientHeight : avec -webkit-box, le dépassement des descendantes
  // (souvent 8–15 px) ferait descendre le corps jusqu’au plancher pour un titre de 3 lignes.
  function fitArticleTitle(node, floor) {
    const lines = parseInt(getComputedStyle(node).webkitLineClamp, 10) || 3;
    let size = parseFloat(getComputedStyle(node).fontSize);
    const overflow = () => {
      const lh = parseFloat(getComputedStyle(node).lineHeight) || size * 1.05;
      return node.scrollHeight > lines * lh + Math.max(8, size * 0.25);
    };
    while (overflow() && size > floor) { size -= 2; node.style.fontSize = size + 'px'; }
  }
  // Coupe gloutonne puis rééquilibre : on évite une dernière ligne trop courte
  // (« pays » / « le pays ») en reprenant un mot à la ligne précédente.
  function balanceTitle(node) {
    const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
    const words = text.split(' ');
    if (words.length < 4) return;
    const probe = el('span');
    const cs = getComputedStyle(node);
    probe.style.cssText = `position:absolute;left:-9999px;white-space:nowrap;font-weight:${cs.fontWeight};font-size:${cs.fontSize};font-family:${cs.fontFamily};font-style:${cs.fontStyle};letter-spacing:${cs.letterSpacing};`;
    document.body.append(probe);
    const widthOf = (s) => { probe.textContent = s; return probe.getBoundingClientRect().width; };
    const maxW = node.clientWidth;
    const wrap = () => {
      const lines = [];
      let cur = [];
      for (const w of words) {
        const trial = cur.length ? `${cur.join(' ')} ${w}` : w;
        if (cur.length && widthOf(trial) > maxW + 0.5) { lines.push(cur); cur = [w]; }
        else cur.push(w);
      }
      if (cur.length) lines.push(cur);
      return lines;
    };
    const lines = wrap();
    while (lines.length >= 2 && lines[lines.length - 1].length <= 2 && lines[lines.length - 2].length >= 3) {
      lines[lines.length - 1].unshift(lines[lines.length - 2].pop());
    }
    probe.remove();
    if (lines.length < 2) return;
    node.replaceChildren(...lines.flatMap((ln, i) => (i ? [el('br'), document.createTextNode(ln.join(' '))] : [document.createTextNode(ln.join(' '))])));
  }
  // Noms des auteurs pour le post d’un seul article, sans le média (déjà sur ig-media).
  function igAuthors(it) {
    const raw = String(it.byline || '').trim();
    if (!raw) return '';
    const [who, src] = raw.split(' · ');
    const name = (src ? who : raw).trim();
    const media = String(it.source || '').trim();
    if (!name || name.toLowerCase() === media.toLowerCase()) return '';
    return name;
  }
  function isIllustrationCredit(credit) {
    return /^\s*illustration\b/i.test(String(credit || ''));
  }
  function plainCredit(credit) {
    return String(credit || '').replace(/^\s*(?:photo|photos|illustration|crédit|credit)s?\s*:\s*/i, '').replace(/^📸\s*/, '').trim();
  }
  // Une Instagram régulière 3:4 (modèle B) : couverture, pastille, date avec année, jusqu’à 2 autres titres.
  async function renderGrilleUne(card, model) {
    const items = model.items || [];
    const lead = items[0] || { title: '', images: [] };
    const illustration = isIllustrationCredit(lead.credit);
    card.className = 'card grille une-b ' + (illustration ? 'illustration' : 'photo');
    const root = el('div', 'ig');
    const full = el('div', 'ig-photo-full'); const imgFull = el('img'); imgFull.alt = ''; full.append(imgFull);
    const well = el('div', 'ig-photo-well'); const imgWell = el('img'); imgWell.alt = ''; well.append(imgWell);
    imgFull.style.objectPosition = objectPosition(lead, 0.40);
    const brand = brandBarArticle();
    const top = el('header', 'ig-top'); top.append(brand);
    const bottom = el('div', 'ig-bottom');
    const kicker = el('div', 'ig-kicker-row');
    kicker.append(el('span', 'ig-pill', model.slot.label || ''));
    const day = model.slot.dayLabelYear || model.slot.dayLabel || '';
    if (day) kicker.append(el('span', 'ig-date', day));
    bottom.append(kicker);
    const title = el('h1', 'ig-title', lead.title || ''); bottom.append(title);
    const authors = igAuthors(lead);
    if (authors) { const by = el('p', 'ig-by'); by.append(el('span', 'lbl', 'Par' + '\u00A0'), el('span', 'who', authors)); bottom.append(by); }
    if (lead.source) bottom.append(el('p', 'ig-media', lead.source));
    const credit = plainCredit(lead.credit);
    if (credit) bottom.append(el('p', 'ig-credit', '📸 ' + credit));
    const extra = items.slice(1, 3);
    const thumbs = [];
    if (extra.length) {
      const also = el('div', 'ig-also'); also.append(el('h2', '', 'Aussi à la une'));
      extra.forEach((it, i) => {
        const row = el('div', 'ig-also-item');
        row.append(el('span', 'num', String(i + 2)));
        const thumb = el('div', 'thumb'); const tImg = el('img'); tImg.alt = ''; thumb.append(tImg); row.append(thumb);
        const meta = el('div', 'meta');
        meta.append(el('h3', '', it.title || ''));
        const au = igAuthors(it);
        const oby = [au ? ('Par ' + au) : '', it.source || ''].filter(Boolean).join(' · ');
        if (oby) meta.append(el('p', 'oby', oby));
        row.append(meta); also.append(row);
        thumbs.push((it.images && it.images.length ? loadFirst(tImg, it.images) : Promise.resolve(false)).then((ok) => { if (!ok) tImg.remove(); return ok; }));
      });
      bottom.append(also);
    }
    root.append(full, well, el('div', 'ig-veil-top'), el('div', 'ig-veil-bot'), top, bottom);
    card.append(root);
    const sources = (lead.images && lead.images.length) ? lead.images : [];
    const ok = await (sources.length
      ? Promise.all([loadFirst(imgFull, sources), loadFirst(imgWell, sources)]).then((r) => r[0])
      : Promise.resolve(false));
    if (!ok) { imgFull.remove(); imgWell.remove(); full.classList.add('empty'); well.classList.add('empty'); }
    await Promise.all([document.fonts.ready, brand.ready, ...thumbs]);
    fitTitle(title, 44);
    const overflow = card.scrollHeight > card.clientHeight + 2 || bottom.scrollHeight > bottom.clientHeight + 2;
    return { shown: 1 + extra.length, photo: ok, sports: 0, radio: 0, overflow };
  }
  // Poster sport Instagram 3:4 : ancienne grille à barres (inchangée).
  async function renderGrille(card, model) {
    if (model.poster !== 'sport') return renderGrilleUne(card, model);
    card.className = 'card grille';
    const root = el('div', 'ig');
    const top = el('div', 'ig-edge'); top.append(el('span', '', model.slot.dayLabel || ''));
    const safe = el('div', 'ig-safe');
    const brand = brandBarGrille();
    const bottom = el('div', 'ig-edge'); bottom.append(el('span', '', model.slot.label || ''));
    const copy = el('div', 'ig-copy');
    copy.append(el('p', 'ig-kicker', model.slot.label || 'Résultats'));
    (model.results || []).slice(0, 3).forEach((r) => {
      const row = el('div', 'ig-match');
      row.append(el('p', 'ig-sport', [r.emoji, r.sport].filter(Boolean).join(' ')));
      const line = el('p', 'ig-line');
      line.append(el('span', '', r.a), el('span', 'sc', '  ' + r.as), el('span', '', ' – '), el('span', 'sc', r.bs + '  '), el('span', '', r.b));
      row.append(line); copy.append(row);
    });
    if (model.media) copy.append(el('p', 'ig-media', model.media));
    safe.append(brand, copy);
    root.append(top, safe, bottom); card.append(root);
    await Promise.all([document.fonts.ready, brand.ready]);
    copy.querySelectorAll('.ig-line').forEach((n) => { let s = parseFloat(getComputedStyle(n).fontSize); while (n.scrollWidth > n.clientWidth + 1 && s > 28) { s -= 1; n.style.fontSize = s + 'px'; } });
    return { shown: (model.results || []).length, photo: false, sports: (model.results || []).length, radio: 0, overflow: card.scrollHeight > card.clientHeight + 2 || safe.scrollHeight > safe.clientHeight + 2 };
  }
  // Post d’un seul article (modèle v6) : photo pleine page, slogan, kicker avec année, auteurs, QR, recadrage focalX.
  async function renderArticle(card, model, format) {
    card.className = format === 'article-portrait' ? 'card article-portrait' : 'card article';
    const root = el('div', 'ig');
    const safe = el('div', 'ig-safe');
    const brand = brandBarArticle();
    const lead = model.items[0];
    const photoBox = el('div', 'ig-photo'); const img = el('img'); img.alt = ''; photoBox.append(img);
    img.style.objectPosition = objectPosition(lead, 0.44);
    const copy = el('div', 'ig-copy');
    const day = model.slot.dayLabelYear || model.slot.dayLabel || '';
    copy.append(igKicker(model.slot.label || '', day));
    const title = el('h1', 'ig-title', lead.title || ''); copy.append(title);
    const authors = igAuthors(lead);
    if (authors) { const by = el('p', 'ig-by'); by.append(el('span', 'lbl', 'Par' + '\u00A0'), el('span', 'who', authors)); copy.append(by); }
    if (lead.source) copy.append(el('p', 'ig-media', lead.source));
    const credit = String(lead.credit || '').replace(/^\s*(?:photo|photos|illustration|crédit|credit)s?\s*:\s*/i, '').replace(/^📸\s*/, '').trim();
    if (credit) copy.append(el('p', 'ig-credit', '📸 ' + credit));
    safe.append(brand, copy);
    const qrUrl = articleQrUrl(lead.pageUrl);
    if (qrUrl) root.append(igQr(qrUrl, lead));
    root.append(photoBox, el('div', 'ig-veil-top'), el('div', 'ig-veil-bot'), safe);
    card.append(root);
    const ok = await (lead.images && lead.images.length ? loadFirst(img, lead.images) : Promise.resolve(false));
    if (!ok) { img.remove(); photoBox.classList.add('empty'); }
    await Promise.all([document.fonts.ready, brand.ready]);
    fitArticleTitle(title, 60);
    balanceTitle(title);
    const overflow = card.scrollHeight > card.clientHeight + 2 || safe.scrollHeight > safe.clientHeight + 2 || copy.scrollHeight > copy.clientHeight + 2;
    return { shown: 1, photo: ok, sports: 0, radio: 0, overflow };
  }
  window.renderUne = async function renderUne({ model, format }) {
    const card = document.getElementById('card'); card.textContent = '';
    if (format === 'grille') return renderGrille(card, model);
    if (format === 'article' || format === 'article-portrait') return renderArticle(card, model, format);

    THEME = model.slot.kind === 'soir' ? 'sombre' : 'clair';
    const [lead, ...rest] = model.items; const others = rest.slice(0, format === 'story' ? 5 : format === 'paysage' ? 3 : 4);
    const S = Array.isArray(model.sports) ? { results: model.sports, next: [] } : (model.sports || { results: [], next: [] });
    const T = format === 'paysage' ? 4 : format === 'story' ? 8 : 6, R0 = S.results || [], N0 = S.next || [];
    const nr = Math.min(R0.length, Math.max(Math.ceil(T / 2), T - N0.length)); const res = R0.slice(0, nr), nxt = N0.slice(0, T - nr); const sports = [...res, ...nxt];
    const theme = model.slot.kind === 'soir' ? 'sombre' : 'clair';
    card.className = `card ${format} ${theme} ${model.slot.kind || ''} ${others.length ? '' : 'solo'} ${sports.length ? '' : 'nosport'} ${res.length && nxt.length ? 'two' : 'one'}`;
    const bg = el('div', 'bg'); const bgi = el('img'); bgi.alt = ''; bg.append(bgi);
    const mast = el('header', 'mast'); const li = el('img', 'logo'); li.src = '../assets/icon.svg'; li.alt = '';
    const brand = el('div', 'brand'); brand.append(li, el('span', 'wm', 'LE\u2011RADAR.ca'));
    const slot = el('div', 'slot'); slot.append(el('b', '', model.slot.label), el('span', '', model.slot.dayLabel));
    mast.append(brand, slot);
    const ph = photo(lead, 'photo', 'À la une', format);
    const leadBox = el('section', 'lead glass'); leadBox.append(ph); const k = kicker(lead); if (k) leadBox.append(k);
    const lt = el('h1', 'title', lead.title); leadBox.append(lt, byline(lead));
    const hook = lead.hook ? el('p', 'hook', lead.hook) : null; if (hook) leadBox.append(hook);
    const list = el('div', 'list'); const thumbs = [];
    others.forEach((it, i) => {
      const row = el('article', 'item'); const tx = el('div', 'tx');
      const kk = kicker(it); if (kk) tx.append(kk);
      tx.append(el('h3', 't', it.title), byline(it));
      const th = photo(it, 'thumb'); thumbs.push(th.ready); th.append(el('span', 'num', String(i + 2)));
      row.append(th, tx); list.append(row);
    });
    const side = el('aside', 'side glass'); const sbody = el('div', 'sbody'); sbody.append(list); side.append(el('h2', '', 'Aussi à la une'), sbody);
    // Sport : « Résultats » à gauche, « Prochains matchs » à droite ; une colonne vide laisse l'autre prendre toute la largeur.
    const sp = el('section', 'sports glass'); const grid = el('div', 'grid');
    const colR = el('div', 'scol res'), colN = el('div', 'scol nxt');
    if (res.length) { colR.append(el('h3', '', 'Résultats')); res.forEach((r) => colR.append(match(r))); grid.append(colR); }
    if (nxt.length) { colN.append(el('h3', '', 'Prochains matchs')); nxt.forEach((r) => colN.append(match(r))); grid.append(colN); }
    grid.dataset.cols = String(grid.children.length);
    sp.append(el('h2', '', 'Sport étudiant'), grid);
    // Radio étudiante (radio-schedules.json) : à droite de « Aussi à la une » (4:5, story), sous la liste en paysage.
    const radio = (model.radio || []).slice(0, format === 'paysage' ? 3 : 4); const rb = el('div', 'radio'); if (radio.length) { rb.append(el('h3', '', 'À l’écoute · radio étudiante')); radio.forEach((x) => rb.append(radioRow(x))); }
    // Pied conforme aux affiches : icône + marque « LE‑RADAR.ca » (serif), nom complet (serif) centré, puis la ligne d'indépendance centrée.
    const foot = el('footer', 'foot'); const fm = el('p', 'fmark'); const fi = el('img', 'ficon'); fi.src = '../assets/icon.svg'; fi.alt = '';
    fm.append(fi, el('span', 'wm', 'LE\u2011RADAR.ca'));
    const full = el('span', 'full', 'Le Réseau Académique de Découverte et d’Agrégation de Ressources');
    foot.append(fm, full);
    foot.append(el('p', 'ind', 'Projet indépendant, non officiel et sans affiliation aux médias ni aux établissements.'));
    // Story : la bande du bas (sous l'interface d'Instagram et de Facebook) annonce la prochaine édition ; rien d'essentiel n'y est.
    if (format === 'story') { const nx = el('p', 'nextEd'); nx.append(el('span', 'lbl', model.slot.next ? 'Prochaine édition' : 'Toute l’actualité étudiante'), el('b', '', model.slot.next || 'Deux unes par jour, matin et soir'), el('span', 'url', 'le\u2011radar.ca')); foot.append(nx); }
    const main = el('div', 'main'); const colA = el('div', 'col a'); const colB = el('div', 'col b');
    colA.append(leadBox);
    if (radio.length) sbody.append(rb);
    if (others.length || radio.length) colB.append(side);
    if (!others.length) list.remove();
    if (sports.length) colB.append(sp);
    main.append(colA); if (colB.childNodes.length) main.append(colB);
    card.append(bg, mast, main, foot);
    const src = await ph.ready; if (src) bgi.src = src; else bgi.remove();
    await Promise.all([document.fonts.ready, ...thumbs, new Promise((r) => { if (li.complete) r(); else { li.onload = r; li.onerror = r; } }), new Promise((r) => { if (!bgi.isConnected || bgi.complete) r(); else { bgi.onload = r; bgi.onerror = r; } })]);
    const fitAll = () => sp.querySelectorAll('.ml').forEach((l) => fitLine(l, format === 'paysage' ? 10.5 : 13));
    fitAll();
    const solo = !others.length;
    fit(lt, format === 'paysage' ? 28 : 40, solo ? 5 : format === 'story' ? 4 : 3);
    const boxes = [card, main, colA, colB, leadBox, side, list, sp, grid, rb, colR, colN];
    const over = () => boxes.some((b) => b.isConnected && b.scrollHeight > b.clientHeight + 2) || ph.clientHeight < (format === 'paysage' ? 180 : format === 'story' ? 420 : 340);
    if (hook) hook.style.webkitLineClamp = String(solo ? 6 : format === 'paysage' ? 2 : format === 'story' ? 4 : 3);
    const removed = []; const rm = (parent) => { removed.push([parent, parent.lastChild]); parent.lastChild.remove(); };
    const cols = () => [colR, colN].filter((c) => c.isConnected && c.querySelector('.mt'));
    const dropMatch = (min) => { const cs = cols(); if (!cs.length) return false; const big = cs.sort((x, y) => y.querySelectorAll('.mt').length - x.querySelectorAll('.mt').length)[0]; const n = big.querySelectorAll('.mt').length; if (n <= min) return false; rm(big); return true; };
    // Ordre de rognage : le résumé de la une reste (2 lignes au moins) tant que possible ; « Aussi à la une » et le sport
    // gardent un socle (3 articles, 3 rencontres) avant de toucher au résumé ; tout ce qui a été retiré revient si la place le permet.
    const clampHook = (floor) => { if (!hook || !hook.isConnected) return false; const n = Number(hook.style.webkitLineClamp) - 1; if (n < floor) return false; hook.style.webkitLineClamp = String(n); return true; };
    const steps = [
      () => clampHook(2),
      () => { if (rb.children.length > 4 && rb.scrollHeight > rb.clientHeight + 2) { rm(rb); return true; } return false; },
      () => { if (list.children.length > 3) { rm(list); return true; } return false; },
      () => dropMatch(4),
      () => { if (rb.children.length > 3 && rb.scrollHeight > rb.clientHeight + 2) { rm(rb); return true; } return false; },
      () => dropMatch(3),
      () => { if (list.children.length > 2) { rm(list); return true; } return false; },
      () => dropMatch(2),
      () => clampHook(1),
      () => { if (hook && hook.isConnected) { hook.remove(); return true; } return false; },
      () => { if (list.children.length > 1) { rm(list); return true; } return false; },
      () => dropMatch(1),
      () => { if (rb.isConnected && rb.scrollHeight > rb.clientHeight + 2) { rb.remove(); card.classList.add('noradio'); return true; } return false; },
      () => { if (sp.isConnected) { sp.remove(); card.classList.add('nosport'); return true; } return false; },
    ];
    for (const step of steps) { while (over() && step()) { /* rogner dans l'ordre */ } if (!over()) break; }
    while (rb.isConnected && rb.children.length > 2 && rb.scrollHeight > rb.clientHeight + 2) rm(rb);
    // Remise en place : ce qui a été retiré trop tôt revient si la place le permet (ex. 3e émission en paysage).
    const stuck = new Set();
    for (let i = removed.length - 1; i >= 0; i--) {
      const [parent, node] = removed[i]; if (!parent.isConnected || stuck.has(parent)) continue;
      parent.append(node); node.querySelectorAll && node.querySelectorAll('.ml').forEach((l) => fitLine(l, format === 'paysage' ? 10.5 : 13));
      if (over()) { node.remove(); stuck.add(parent); }
    }
    if (rb.isConnected && rb.children.length < 2) rb.remove(); // titre seul : pas de bloc vide
    // Place restante : le résumé de la une reprend des lignes (jusqu'à 6).
    const hookMax = solo ? 6 : format === 'paysage' ? 2 : format === 'story' ? 4 : 3;
    if (hook && hook.isConnected) for (let n = Number(hook.style.webkitLineClamp) + 1; n <= hookMax; n++) { hook.style.webkitLineClamp = String(n); if (over()) { hook.style.webkitLineClamp = String(n - 1); break; } }
    [colR, colN].forEach((c) => { if (c.isConnected && !c.querySelector('.mt')) c.remove(); });
    grid.dataset.cols = String(grid.children.length);
    return { shown: 1 + list.children.length, photo: Boolean(src), sports: sp.isConnected ? sp.querySelectorAll('.mt').length : 0, sportsDetail: sp.isConnected ? `${colR.querySelectorAll('.mt').length} résultat(s) + ${colN.querySelectorAll('.mt').length} prochain(s)` : 'aucun', radio: rb.isConnected ? rb.querySelectorAll('.show').length : 0, overflow: over() };
  };
}());

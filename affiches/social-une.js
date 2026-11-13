/* Image « La une du matin / du soir » du Radar (réseaux sociaux), en français seulement.
 * window.renderUne({ model, format }) dessine la carte puis attend polices et images.
 * model = { slot: { label, dayLabel, kind }, items: [{ title, byline, place, sport, credit, hook, images[], focalY }], sports: [...] }
 * (scripts/social/une-lib.mjs). Matin : thème clair du site ; soir : thème sombre. Gabarit « Verre » + photo de la une
 * dégagée (panel du 12 nov. 2026, retour de Charles : mélange A/B, résultats sportifs étudiants pour combler le bas).
 * Pas de code QR (liens dans le texte du post), aucun logo d'université. */
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
  function kicker(it) {
    const k = el('p', 'kick');
    if (it.sport) k.append(el('span', 'emo', it.sport));
    if (it.place) { const pl = el('span', 'place', it.place); const c = aaColor(it.placeColor, THEME); if (c) pl.style.color = c; k.append(pl); }
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
  function photo(it, cls, badge) {
    const box = el('div', cls); const img = el('img'); img.alt = ''; box.append(img);
    if (badge) box.append(el('span', 'badge', badge));
    const credit = String(it.credit || '').replace(/^\s*(photo|crédit|credit)s?\s*:\s*/i, '').trim();
    if (credit && badge) box.append(el('span', 'credit', 'Photo' + NB + ': ' + credit));
    img.style.objectPosition = `50% ${Math.round((Number.isFinite(it.focalY) ? it.focalY : 0.4) * 100)}%`;
    box.ready = (it.images && it.images.length ? loadFirst(img, it.images) : Promise.resolve(false)).then((ok) => { if (!ok) { img.remove(); box.classList.add('empty'); } return ok ? img.currentSrc || img.src : ''; });
    return box;
  }
  // Une rencontre = deux lignes : « 🏀 Basketball (H) · Final · jeu. 12 nov. » puis les équipes (gagnant d'abord, en gras ; « visite » / « reçoit » pâles).
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
  window.renderUne = async function renderUne({ model, format }) {
    const card = document.getElementById('card'); card.textContent = '';
    THEME = model.slot.kind === 'soir' ? 'sombre' : 'clair';
    const [lead, ...rest] = model.items; const others = rest.slice(0, 3);
    const S = Array.isArray(model.sports) ? { results: model.sports, next: [] } : (model.sports || { results: [], next: [] });
    const T = format === 'paysage' ? 4 : 6, R0 = S.results || [], N0 = S.next || [];
    const nr = Math.min(R0.length, Math.max(Math.ceil(T / 2), T - N0.length)); const res = R0.slice(0, nr), nxt = N0.slice(0, T - nr); const sports = [...res, ...nxt];
    const theme = model.slot.kind === 'soir' ? 'sombre' : 'clair';
    card.className = `card ${format} ${theme} ${model.slot.kind || ''} ${others.length ? '' : 'solo'} ${sports.length ? '' : 'nosport'} ${res.length && nxt.length ? 'two' : 'one'}`;
    const bg = el('div', 'bg'); const bgi = el('img'); bgi.alt = ''; bg.append(bgi);
    const mast = el('header', 'mast'); const li = el('img', 'logo'); li.src = '../assets/icon.svg'; li.alt = '';
    const brand = el('div', 'brand'); brand.append(li, el('span', 'wm', 'LE\u2011RADAR.ca'));
    const slot = el('div', 'slot'); slot.append(el('b', '', model.slot.label), el('span', '', model.slot.dayLabel));
    mast.append(brand, slot);
    const ph = photo(lead, 'photo', 'À la une');
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
    if (hook) hook.style.webkitLineClamp = String(solo ? 5 : format === 'paysage' ? 2 : 3);
    const removed = []; const rm = (parent) => { removed.push([parent, parent.lastChild]); parent.lastChild.remove(); };
    const cols = () => [colR, colN].filter((c) => c.isConnected && c.querySelector('.mt'));
    const dropMatch = (min) => { const cs = cols(); if (!cs.length) return false; const big = cs.sort((x, y) => y.querySelectorAll('.mt').length - x.querySelectorAll('.mt').length)[0]; const n = big.querySelectorAll('.mt').length; if (n <= min) return false; rm(big); return true; };
    const steps = [
      () => { if (!hook || !hook.isConnected) return false; const n = Number(hook.style.webkitLineClamp) - 1; if (n < 1) hook.remove(); else hook.style.webkitLineClamp = String(n); return true; },
      () => { if (rb.children.length > 3 && rb.scrollHeight > rb.clientHeight + 2) { rm(rb); return true; } return false; },
      () => dropMatch(3),
      () => { if (list.children.length > 2) { rm(list); return true; } return false; },
      () => dropMatch(2),
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
    [colR, colN].forEach((c) => { if (c.isConnected && !c.querySelector('.mt')) c.remove(); });
    grid.dataset.cols = String(grid.children.length);
    return { shown: 1 + list.children.length, photo: Boolean(src), sports: sp.isConnected ? sp.querySelectorAll('.mt').length : 0, sportsDetail: sp.isConnected ? `${colR.querySelectorAll('.mt').length} résultat(s) + ${colN.querySelectorAll('.mt').length} prochain(s)` : 'aucun', radio: rb.isConnected ? rb.querySelectorAll('.show').length : 0, overflow: over() };
  };
}());

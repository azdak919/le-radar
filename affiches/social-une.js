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
  function byline(it) {
    const p = el('p', 'by'); const [who, src] = String(it.byline || '').split(' · ');
    if (src) p.append(el('span', 'who', 'Par' + NB + who), el('span', 'src', ' · ' + src)); else p.append(el('span', 'who', who));
    return p;
  }
  function kicker(it) {
    const k = el('p', 'kick');
    if (it.sport) k.append(el('span', 'emo', it.sport));
    if (it.place) k.append(el('span', 'place', it.place));
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
  function score(r) {
    const c = el('div', 'score' + (r.kind === 'avenir' ? ' next' : ''));
    const head = el('p', 'lg'); head.append(el('span', 'emo', r.emoji), el('span', 'lgt', r.league)); c.append(head);
    r.teams.forEach((t, i) => {
      const row = el('p', 'tm' + (r.kind === 'resultat' && i === 0 && !r.tie ? ' win' : ''));
      const nm = el('span', 'nm', t.name); if (t.inst) nm.append(el('small', '', ' ' + t.inst));
      row.append(nm); if (r.kind === 'resultat') row.append(el('b', 'pt', String(t.score)));
      c.append(row);
    });
    c.append(el('p', 'when', r.kind === 'resultat' ? 'Final · ' + r.when : r.when.replace(/^./, (x) => x.toUpperCase())));
    return c;
  }
  function fit(node, min, lines) {
    let size = parseFloat(getComputedStyle(node).fontSize);
    while (node.scrollHeight > node.clientHeight + 8 && size > min) { size -= 2; node.style.fontSize = size + 'px'; node.style.maxHeight = (size * 1.12 * lines + 6) + 'px'; }
  }
  window.renderUne = async function renderUne({ model, format }) {
    const card = document.getElementById('card'); card.textContent = '';
    const [lead, ...rest] = model.items; const others = rest.slice(0, 3);
    const sports = (model.sports || []).slice(0, format === 'paysage' ? 2 : 3);
    const theme = model.slot.kind === 'soir' ? 'sombre' : 'clair';
    card.className = `card ${format} ${theme} ${model.slot.kind || ''} ${others.length ? '' : 'solo'} ${sports.length ? '' : 'nosport'}`;
    const bg = el('div', 'bg'); const bgi = el('img'); bgi.alt = ''; bg.append(bgi);
    const mast = el('header', 'mast'); const li = el('img', 'logo'); li.src = '../assets/icon.svg'; li.alt = '';
    const brand = el('div', 'brand'); brand.append(li, el('span', 'wm', 'LE\u2011RADAR.ca'));
    const slot = el('div', 'slot'); slot.append(el('b', '', model.slot.label), el('span', '', model.slot.dayLabel));
    mast.append(brand, slot);
    const ph = photo(lead, 'photo', 'À la une');
    const leadBox = el('section', 'lead glass'); const k = kicker(lead); if (k) leadBox.append(k);
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
    const side = el('aside', 'side glass'); side.append(el('h2', '', 'Aussi à la une'), list);
    const sp = el('section', 'sports glass'); const grid = el('div', 'grid');
    sports.forEach((r) => grid.append(score(r)));
    sp.append(el('h2', '', sports[0] && sports[0].kind === 'avenir' ? 'Sport étudiant · à l’affiche aujourd’hui' : 'Sport étudiant · résultats'), grid);
    const foot = el('footer', 'foot'); const fr = el('div', 'legal');
    fr.append(el('span', 'full', 'Le Réseau Académique de Découverte et d’Agrégation de Ressources'), el('span', 'ind', 'Projet indépendant'));
    foot.append(el('span', 'url', 'le-radar.ca'), fr);
    const main = el('div', 'main'); const colA = el('div', 'col a'); const colB = el('div', 'col b');
    colA.append(ph, leadBox);
    if (others.length) colB.append(side);
    if (sports.length) colB.append(sp);
    main.append(colA); if (colB.childNodes.length) main.append(colB);
    card.append(bg, mast, main, foot);
    const src = await ph.ready; if (src) bgi.src = src; else bgi.remove();
    await Promise.all([document.fonts.ready, ...thumbs, new Promise((r) => { if (li.complete) r(); else { li.onload = r; li.onerror = r; } }), new Promise((r) => { if (!bgi.isConnected || bgi.complete) r(); else { bgi.onload = r; bgi.onerror = r; } })]);
    const solo = !others.length;
    fit(lt, format === 'paysage' ? 28 : 40, solo ? 5 : 3);
    const boxes = [card, main, colA, colB, leadBox, side, list, sp, grid];
    const over = () => boxes.some((b) => b.isConnected && b.scrollHeight > b.clientHeight + 2) || ph.clientHeight < (format === 'paysage' ? 200 : format === 'story' ? 460 : 370);
    if (hook) hook.style.webkitLineClamp = String(solo ? 5 : format === 'paysage' ? 2 : 3);
    const steps = [
      () => { if (!hook || !hook.isConnected) return false; const n = Number(hook.style.webkitLineClamp) - 1; if (n < 1) hook.remove(); else hook.style.webkitLineClamp = String(n); return true; },
      () => { if (grid.children.length > 2) { grid.lastChild.remove(); return true; } return false; },
      () => { if (list.children.length > 2) { list.lastChild.remove(); return true; } return false; },
      () => { if (grid.children.length > 1) { grid.lastChild.remove(); return true; } return false; },
      () => { if (list.children.length > 1) { list.lastChild.remove(); return true; } return false; },
      () => { if (sp.isConnected) { sp.remove(); card.classList.add('nosport'); return true; } return false; },
    ];
    for (const step of steps) { while (over() && step()) { /* rogner dans l'ordre */ } if (!over()) break; }
    card.dataset.cols = String(grid.children.length);
    return { shown: 1 + list.children.length, photo: Boolean(src), sports: sp.isConnected ? grid.children.length : 0, overflow: over() };
  };
}());

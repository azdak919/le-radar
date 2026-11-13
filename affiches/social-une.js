/* Image « La une du matin / du soir » du Radar (réseaux sociaux).
 * window.renderUne({ model, format }) dessine la carte puis attend polices et images.
 * model = { slot: { label, dayLabel }, items: [{ title, byline, credit, images[], focalY }] } (scripts/social/une-lib.mjs).
 * Pas de code QR : les liens cliquables sont dans le texte du post. */
(function () {
  'use strict';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  function byline(it) {
    const p = el('p', 'by'); const [who, src] = String(it.byline || '').split(' · ');
    if (src) { p.append(document.createTextNode(who)); p.append(el('span', 'src', ' · ' + src)); } else p.textContent = who;
    return p;
  }
  function loadFirst(img, urls) {
    return new Promise((resolve) => {
      const list = (urls || []).filter(Boolean); let i = 0;
      const next = () => { if (i >= list.length) { resolve(false); return; } img.src = list[i++]; };
      img.onload = () => resolve(true); img.onerror = next; next();
      setTimeout(() => resolve(img.complete && img.naturalWidth > 0), 15000);
    });
  }
  function photo(it, badge) {
    const box = el('div', 'photo'); const img = el('img'); img.alt = ''; box.append(img);
    if (badge) box.append(el('span', 'badge', badge));
    const credit = String(it.credit || '').replace(/^\s*(photo|crédit|credit)s?\s*:\s*/i, '').trim(); if (credit) box.append(el('span', 'credit', 'Photo : ' + credit));
    img.style.objectPosition = `50% ${Math.round((Number.isFinite(it.focalY) ? it.focalY : 0.5) * 100)}%`;
    box.ready = (it.images && it.images.length ? loadFirst(img, it.images) : Promise.resolve(false)).then((ok) => { if (!ok) { img.remove(); box.classList.add('empty'); } });
    return box;
  }
  /* Réduit la police d'un bloc jusqu'à ce qu'il tienne (titre de la une). */
  function fit(node, min, lines) {
    let size = parseFloat(getComputedStyle(node).fontSize);
    while (node.scrollHeight > node.clientHeight + 8 && size > min) { size -= 2; node.style.fontSize = size + 'px'; node.style.maxHeight = (size * 1.08 * lines + 4) + 'px'; }
  }
  window.renderUne = async function renderUne({ model, format }) {
    const card = document.getElementById('card'); card.textContent = ''; card.className = 'card ' + format;
    const [lead, ...rest] = model.items; const others = rest.slice(0, 3);
    if (format === 'paysage' && !others.length) card.classList.add('solo');
    const mast = el('header', 'mast'); const logo = el('div', 'logo'); const li = el('img'); li.src = '../assets/icon.svg'; li.alt = ''; logo.append(li);
    const slot = el('div', 'slot'); slot.append(el('b', '', model.slot.label), el('span', '', model.slot.dayLabel));
    mast.append(logo, el('div', 'brand', 'LE-RADAR.ca'), slot);
    const ph = photo(lead, 'À la une');
    const leadBox = el('section', 'lead'); const lt = el('h1', 'title', lead.title); leadBox.append(lt, byline(lead));
    const hook = lead.hook ? el('p', 'hook', lead.hook) : null; if (hook) leadBox.append(hook);
    const list = el('div', 'list');
    others.forEach((it, i) => { const row = el('article', 'item'); const tx = el('div'); tx.append(el('h3', 't', it.title), byline(it)); row.append(el('span', 'num', String(i + 2)), tx); list.append(row); });
    const foot = el('footer', 'foot'); foot.append(el('span', 'url', 'le-radar.ca'), el('span', 'legal', 'Journaux, radios et sports étudiants du Québec · Projet indépendant'));
    if (format === 'portrait') {
      card.append(mast, ph, leadBox, list, foot);
    } else {
      const body = el('div', 'body'); const col = el('div', 'leadcol'); col.append(ph, leadBox); body.append(col);
      if (others.length) { const side = el('aside', 'side'); side.append(el('h2', '', 'Aussi à la une'), list); body.append(side); }
      card.append(mast, body, foot);
    }
    await Promise.all([document.fonts.ready, ph.ready, new Promise((r) => { if (li.complete) r(); else { li.onload = r; li.onerror = r; } })]);
    fit(lt, format === 'portrait' ? 36 : 26, card.classList.contains('solo') ? 6 : 3);
    /* Portrait : retirer des articles s'ils débordent du bas (jamais la une). */
    const boxes = [card, list.parentElement, leadBox.parentElement].filter(Boolean);
    const over = () => boxes.some((b) => b.scrollHeight > b.clientHeight + 8);
    if (hook) { hook.style.webkitLineClamp = String(format === 'portrait' ? 3 : (others.length ? 3 : 5)); }
    while (hook && hook.isConnected && over()) {
      const n = Number(hook.style.webkitLineClamp) - 1;
      if (n < 1) hook.remove(); else hook.style.webkitLineClamp = String(n);
    }
    while (list.children.length && over()) list.lastChild.remove();
    return { shown: 1 + list.children.length, photo: !ph.classList.contains('empty') };
  };
}());

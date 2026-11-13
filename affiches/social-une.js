/* Image « La une du matin / du soir » du Radar (réseaux sociaux), en français seulement.
 * window.renderUne({ model, format, piste }) dessine la carte puis attend polices et images.
 * model = { slot: { label, dayLabel, kind }, items: [{ title, byline, place, sport, credit, hook, images[], focalY }] }
 * (scripts/social/une-lib.mjs). Pas de code QR (liens dans le texte du post), aucun logo d'université. */
(function () {
  'use strict';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  function byline(it) {
    const p = el('p', 'by'); const [who, src] = String(it.byline || '').split(' · ');
    if (src) { p.append(el('span', 'who', 'Par ' + who), el('span', 'src', ' · ' + src)); } else p.append(el('span', 'who', who));
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
    if (credit && badge) box.append(el('span', 'credit', 'Photo : ' + credit));
    img.style.objectPosition = `50% ${Math.round((Number.isFinite(it.focalY) ? it.focalY : 0.5) * 100)}%`;
    box.ready = (it.images && it.images.length ? loadFirst(img, it.images) : Promise.resolve(false)).then((ok) => { if (!ok) { img.remove(); box.classList.add('empty'); } });
    return box;
  }
  function fit(node, min, lines) {
    let size = parseFloat(getComputedStyle(node).fontSize);
    while (node.scrollHeight > node.clientHeight + 8 && size > min) { size -= 2; node.style.fontSize = size + 'px'; node.style.maxHeight = (size * 1.1 * lines + 6) + 'px'; }
  }
  window.renderUne = async function renderUne({ model, format, piste = 'b' }) {
    const card = document.getElementById('card'); card.textContent = '';
    const [lead, ...rest] = model.items; const others = rest.slice(0, 3);
    card.className = `card ${format} piste-${piste} ${model.slot.kind || ''} ${others.length ? '' : 'solo'}`;
    const mast = el('header', 'mast'); const logo = el('div', 'logo'); const li = el('img'); li.src = '../assets/icon.svg'; li.alt = ''; logo.append(li);
    const slot = el('div', 'slot'); slot.append(el('b', '', model.slot.label), el('span', '', model.slot.dayLabel));
    mast.append(logo, el('div', 'brand', 'LE-RADAR.ca'), slot);
    const ph = photo(lead, 'photo', 'À la une');
    const leadBox = el('section', 'lead'); const k = kicker(lead); if (k) leadBox.append(k);
    const lt = el('h1', 'title', lead.title); leadBox.append(lt, byline(lead));
    const hook = lead.hook ? el('p', 'hook', lead.hook) : null; if (hook) leadBox.append(hook);
    const list = el('div', 'list');
    const thumbs = [];
    others.forEach((it, i) => {
      const row = el('article', 'item'); const tx = el('div', 'tx');
      const kk = kicker(it); if (kk) tx.append(kk);
      tx.append(el('h3', 't', it.title), byline(it));
      const th = photo(it, 'thumb'); thumbs.push(th.ready);
      th.append(el('span', 'num', String(i + 2)));
      row.append(th, tx); list.append(row);
    });
    const foot = el('footer', 'foot');
    foot.append(el('span', 'url', 'le-radar.ca'), el('span', 'legal', 'Journaux, radios et sports étudiants du Québec · Projet indépendant'));
    const main = el('div', 'main'); const side = el('aside', 'side');
    if (others.length) side.append(el('h2', '', 'Aussi à la une'), list);
    main.append(ph, leadBox); if (others.length) main.append(side);
    card.append(mast, main, foot);
    await Promise.all([document.fonts.ready, ph.ready, ...thumbs, new Promise((r) => { if (li.complete) r(); else { li.onload = r; li.onerror = r; } })]);
    fit(lt, format === 'portrait' ? 40 : 28, card.classList.contains('solo') ? 5 : 3);
    const boxes = [card, main, leadBox, side, list];
    const over = () => boxes.some((b) => b.scrollHeight > b.clientHeight + 8);
    if (hook) hook.style.webkitLineClamp = String(card.classList.contains('solo') ? 5 : format === 'paysage' ? 2 : 3);
    while (hook && hook.isConnected && over()) { const n = Number(hook.style.webkitLineClamp) - 1; if (n < 1) hook.remove(); else hook.style.webkitLineClamp = String(n); }
    while (list.children.length && over()) list.lastChild.remove();
    return { shown: 1 + list.children.length, photo: !ph.classList.contains('empty') };
  };
}());

/* Story 9:16 (1080×1920) de « La une du matin / du soir », refonte du 13 nov. 2026 (retour de Charles : « une story c'est
 * rapide et on ne regarde pas s'il y a trop de trucs petits »). Lue en 2 à 3 secondes : une série de 3 écrans au plus,
 * un thème par écran, un seul élément principal en très gros, aucune liste dense, aucun texte sous 44 px.
 *   story        : À la une — photo plein cadre, établissement, titre en très gros, auteur, appel à l'action.
 *   story-sport  : Sport étudiant — 3 résultats au plus (ou un seul match en vedette s'il n'y a pas de résultat).
 *   story-radio  : Radio étudiante — 3 émissions au plus de l'édition (matin : journée ; soir : 17 h à minuit).
 * Zones sûres Instagram/Facebook : rien d'essentiel dans les 250 px du haut ni les 340 px du bas.
 * window.renderStory({ model, format }) → { shown, sports, radio, photo, empty, overflow, minFont }. */
(function () {
  'use strict';
  const NB = '\u00A0';
  const MIN = 44; // plancher de police à 1080 px de large
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const hex = (h) => { const m = String(h || '').match(/^#?([0-9a-f]{6})$/i); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
  const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  // Couleur d'établissement éclaircie jusqu'à ≥ 4,6:1 sur le fond sombre des écrans (texte clair sur voile foncé).
  const BG = { clair: [[22, 24, 28], [40, 18, 38]], sombre: [[13, 22, 42], [28, 42, 72]] };
  function aa(h, theme) { let c = hex(h); if (!c) return ''; for (let i = 0; i < 40 && BG[theme].some((b) => ratio(c, b) < 4.6); i++) c = c.map((x) => Math.round(x + (255 - x) * 0.1)); return `rgb(${c.join(',')})`; }
  function loadFirst(img, urls) {
    return new Promise((resolve) => {
      const list = (urls || []).filter(Boolean); let i = 0, done = false;
      const end = (v) => { if (!done) { done = true; resolve(v); } };
      const next = () => { if (i >= list.length) { end(false); return; } img.src = list[i++]; };
      img.onload = () => end(true); img.onerror = next; next();
      setTimeout(() => end(img.complete && img.naturalWidth > 0), 15000);
    });
  }
  // Réduit jusqu'au plancher ; jamais d'ellipse : au plancher, le texte passe à la ligne.
  function shrink(node, min, maxH) { let s = parseFloat(getComputedStyle(node).fontSize); while ((node.scrollWidth > node.clientWidth + 1 || (maxH && node.scrollHeight > maxH)) && s > min) { s -= 2; node.style.fontSize = s + 'px'; } }
  function brand(model) {
    const top = el('header', 'stop'); const b = el('div', 'sbrand'); const ic = el('img', 'sicon'); ic.src = '../assets/icon.svg'; ic.alt = '';
    b.append(ic, el('span', 'swm', 'LE\u2011RADAR.ca')); const pill = el('span', 'spill', model.slot.label);
    top.append(b, pill); return { top, ic };
  }
  function cta(text) { const c = el('p', 'scta'); c.append(el('span', '', text), el('b', '', 'le\u2011radar.ca')); return c; }
  function teamRow(t, win, score) {
    const r = el('div', 'steam' + (win ? ' win' : '')); const nm = el('div', 'snm'); nm.append(el('b', '', t.name));
    if (t.inst) { const i = el('span', 'sin', t.inst); const c = aa(t.color, THEME); if (c) i.style.color = c; nm.append(i); }
    r.append(nm); if (score != null) r.append(el('span', 'ssc', String(score))); return r;
  }
  let THEME = 'clair';
  window.renderStory = async function renderStory({ model, format }) {
    const card = document.getElementById('card'); card.textContent = '';
    THEME = model.slot.kind === 'soir' ? 'sombre' : 'clair';
    const kind = format === 'story-sport' ? 'sport' : format === 'story-radio' ? 'radio' : 'une';
    card.className = `card st ${THEME} st-${kind}`;
    const lead = model.items[0] || {};
    const bg = el('div', 'sbg'); const bgi = el('img'); bgi.alt = ''; bg.append(bgi);
    bgi.style.objectPosition = `50% ${Math.round((Number.isFinite(lead.focalY) ? lead.focalY : 0.4) * 100)}%`;
    const { top, ic } = brand(model); const body = el('main', 'sbody'); const foot = el('footer', 'sfoot');
    let info = { shown: 0, sports: 0, radio: 0, empty: false };
    if (kind === 'une') {
      const tag = el('p', 'stag', 'À la une');
      if (lead.place) { const p = el('span', 'splace', lead.place); const c = aa(lead.placeColor, THEME); if (c) p.style.color = c; tag.append(el('span', 'sdot', ' · '), p); }
      const h = el('h1', 'stitle', lead.title || ''); const [who, src] = String(lead.byline || '').split(' · ');
      const by = el('p', 'sby'); by.append(el('span', 'lbl', 'Par' + NB), el('b', '', who || '')); if (src) by.append(el('span', 'src', ' · ' + src));
      body.append(tag, h, by); foot.append(cta('Lire l’article sur'));
      const credit = String(lead.credit || '').replace(/^\s*(photo|crédit|credit)s?\s*:\s*/i, '').trim();
      if (credit) card.append(el('span', 'scredit', 'Photo' + NB + ': ' + credit));
      info.shown = 1;
    } else if (kind === 'sport') {
      const S = model.sports || { results: [], next: [] }; const res = (S.results || []).slice(0, 3);
      const list = res.length ? res : (S.next || []).slice(0, 1); const featured = !res.length;
      if (!list.length) info.empty = true;
      body.append(el('p', 'stag', 'Sport étudiant'), el('h2', 'shead', featured ? 'Match en vedette' : 'Résultats'));
      list.forEach((r) => {
        const m = el('article', 'smatch'); m.append(el('p', 'ssport', `${r.emoji || ''} ${r.sport}`.trim()));
        if (r.kind === 'resultat') { m.append(teamRow(r.teams[0], !r.tie, r.teams[0].score), teamRow(r.teams[1], false, r.teams[1].score)); }
        else { m.append(teamRow(r.teams[0], false), el('p', 'svb', r.verb), teamRow(r.teams[1], false)); }
        m.append(el('p', 'swhen', r.kind === 'resultat' ? 'Final · ' + String(r.when || '').replace(/^Final\s*·\s*/, '') : r.when));
        body.append(m);
      });
      info.sports = list.length; foot.append(cta(featured ? 'Tous les matchs sur' : 'Tous les résultats sur'));
    } else {
      const R = (model.radio || []).slice(0, 3); if (!R.length) info.empty = true;
      body.append(el('p', 'stag', 'Radio étudiante'), el('h2', 'shead', model.slot.kind === 'soir' ? 'À l’écoute ce soir' : 'À l’écoute aujourd’hui'));
      R.forEach((x) => { const s = el('article', 'sshow'); s.append(el('p', 'stt', x.title), el('p', 'ssta', `${x.station} · ${x.when}`)); body.append(s); });
      info.radio = R.length; foot.append(cta('Écouter en direct sur'));
    }
    card.append(bg, top, body, foot);
    const ok = lead.images && lead.images.length ? await loadFirst(bgi, lead.images) : false; if (!ok) { bgi.remove(); card.classList.add('nophoto'); }
    await Promise.all([document.fonts.ready, new Promise((r) => { if (ic.complete) r(); else { ic.onload = r; ic.onerror = r; } })]);
    // Ajustement : le titre (une) descend de 96 px au plancher ; noms d'équipe et titres d'émission de 64 à 48 px, puis passent à la ligne.
    const h1 = body.querySelector('.stitle'); if (h1) shrink(h1, 64, 5 * 1.08 * 96);
    body.querySelectorAll('.snm b, .stt').forEach((n) => shrink(n, 48));
    const over = () => body.scrollHeight > body.clientHeight + 2;
    // Trop haut : on retire la dernière rencontre / émission (jamais sous une), puis le titre descend encore.
    const rows = () => body.querySelectorAll('.smatch, .sshow');
    while (over() && rows().length > 1) { rows()[rows().length - 1].remove(); if (kind === 'sport') info.sports--; else info.radio--; }
    if (h1) { let s = parseFloat(getComputedStyle(h1).fontSize); while (over() && s > 56) { s -= 2; h1.style.fontSize = s + 'px'; } }
    const minFont = Math.min(...[...card.querySelectorAll('p, h1, h2, b, span')].filter((n) => n.textContent.trim() && n.getClientRects().length).map((n) => parseFloat(getComputedStyle(n).fontSize)));
    return { ...info, photo: Boolean(ok), overflow: over(), minFont };
  };
}());

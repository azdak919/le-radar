/* LE-RADAR.ca — enrichissement écran des pages /revue/… (PDF, images de banque, jeux).
 * Ne change pas la feuille d'impression : le bouton PDF est masqué en @media print. */
(() => {
  const root = document.querySelector('article.revue[data-revue]');
  if (!root) return;

  const FORMATS = [
    { file: 'lettre.pdf', label: 'Lettre' },
    { file: 'legal.pdf', label: 'Légal' },
    { file: 'tabloid.pdf', label: 'Tabloïd' },
    { file: 'a4.pdf', label: 'A4' },
    { file: 'a3.pdf', label: 'A3' },
  ];

  function editionBase() {
    const path = location.pathname.replace(/index\.html$/, '');
    return path.endsWith('/') ? path : `${path}/`;
  }

  function injectPdf() {
    if (root.querySelector('.revue-pdf')) return true;
    const meta = root.querySelector('.revue-meta');
    if (!meta) return;
    const box = document.createElement('div');
    box.className = 'revue-pdf';
    const details = document.createElement('details');
    details.className = 'revue-pdf__box';
    const summary = document.createElement('summary');
    summary.className = 'revue-pdf__btn';
    summary.textContent = 'Télécharger le PDF';
    const ul = document.createElement('ul');
    ul.className = 'revue-pdf__list';
    details.append(summary, ul);
    box.appendChild(details);
    meta.after(box);

    const base = editionBase();
    Promise.all(FORMATS.map((fmt) => fetch(`${base}${fmt.file}`, { method: 'HEAD', cache: 'no-cache' })
      .then((r) => (r.ok ? fmt : null))
      .catch(() => null)))
      .then((found) => {
        const ok = found.filter(Boolean);
        if (!ok.length) { box.remove(); return; }
        for (const fmt of ok) {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = `${base}${fmt.file}`;
          a.download = fmt.file;
          a.textContent = fmt.label;
          li.appendChild(a);
          ul.appendChild(li);
        }
        if (typeof window.RadarTranslate?.refresh === 'function') {
          try { window.RadarTranslate.refresh(); } catch { /* ignore */ }
        }
      });
  }

  function revealGames() {
    root.querySelectorAll('.revue-meteo, .revue-jeux').forEach((el) => {
      el.removeAttribute('aria-hidden');
    });
    const sols = root.querySelector('section.revue-solutions');
    if (!sols || sols.closest('details')) return;
    const wrap = document.createElement('details');
    wrap.className = 'revue-solutions-box';
    const sum = document.createElement('summary');
    sum.textContent = 'Solutions';
    sols.removeAttribute('aria-hidden');
    sols.classList.add('is-open');
    sols.replaceWith(wrap);
    wrap.append(sum, sols);
  }

  function markStock(urls) {
    const stock = new Set((urls || []).map((u) => String(u || '').split('?')[0]));
    const isBank = (src) => {
      const clean = String(src || '').split('?')[0];
      if (stock.has(clean)) return true;
      return /upload\.wikimedia\.org|commons\.wikimedia\.org/i.test(clean);
    };
    const cover = root.querySelector('.revue-cover');
    const coverImg = cover && cover.querySelector('img');
    if (cover && coverImg && (cover.dataset.stock === '1' || isBank(coverImg.src))) {
      cover.setAttribute('data-stock', '1');
    }
    root.querySelectorAll('.revue-item__fig').forEach((fig) => {
      const img = fig.querySelector('img');
      if (img && isBank(img.src)) fig.setAttribute('data-stock', '');
    });
  }

  injectPdf();
  revealGames();

  const toc = root.querySelector('.revue-toc');
  if (toc && root.querySelector('.revue-meteo') && !toc.querySelector('a[href="#meteo"]')) {
    const a = document.createElement('a');
    a.href = '#meteo';
    a.textContent = '☀️ Météo';
    toc.appendChild(a);
    const meteo = root.querySelector('.revue-meteo');
    if (meteo && !meteo.id) meteo.id = 'meteo';
  }
  if (toc && root.querySelector('.revue-jeux') && !toc.querySelector('a[href="#jeux"]')) {
    const a = document.createElement('a');
    a.href = '#jeux';
    a.textContent = '🧩 Jeux';
    toc.appendChild(a);
    const jeux = root.querySelector('.revue-jeux');
    if (jeux && !jeux.id) jeux.id = 'jeux';
  }

  const newsUrl = new URL('../../news-latest.json', document.baseURI || location.href);
  fetch(newsUrl.href, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const items = (data && (data.items || data)) || [];
      const stockUrls = items.map((it) => it && it.stockImage).filter(Boolean);
      const cover = root.querySelector('.revue-cover img');
      if (cover) {
        const src = cover.src.split('?')[0];
        const hit = items.find((it) => String(it.stockImage || '').split('?')[0] === src);
        if (hit) cover.closest('.revue-cover')?.setAttribute('data-stock', '1');
      }
      markStock(stockUrls);
    })
    .catch(() => markStock([]));
})();

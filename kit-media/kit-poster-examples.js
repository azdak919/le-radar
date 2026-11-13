/* Galerie d’affiches : toutes les affiches d’exemple (examples.json), filtrables par établissement.
 * Chaque carte a un aperçu entier (11 × 17, sans rognage) et trois formats PDF.
 * Les PDF des exemples sont composés à 600 dpi par le studio (/affiches/), préréglé par l’URL. */
(function () {
  const grid = document.getElementById('kit-poster-grid');
  if (!grid) return;
  const base = grid.getAttribute('data-asset-base') || './';
  const lang = (document.documentElement.lang || 'fr').startsWith('en') ? 'en' : 'fr';
  const compose = grid.getAttribute('data-compose') || '../affiches/';
  const filterBox = document.getElementById('kit-poster-filter');
  const countEl = document.getElementById('kit-poster-count');
  const PREVIEW_V = 'a9e8f52-2';
  const FORMATS = [
    ['tabloid', '11 × 17'],
    ['letter', lang === 'en' ? 'Letter' : 'Lettre'],
    ['legal', lang === 'en' ? 'Legal' : 'Légal'],
  ];
  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  function isAppleTouch() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints) > 1);
  }

  function composeUrl(ex, format) {
    const q = new URLSearchParams({ campus: ex.campus });
    if (ex.photo) q.set('photo', ex.photo);
    if (ex.greeting && ex.greeting !== 'none') q.set('greeting', ex.greeting);
    if (ex.lang) q.set('lang', ex.lang);
    q.set('qr', ex.qr ? 'oui' : 'non');
    if (format) q.set('format', format);
    return `${compose}?${q.toString()}`;
  }

  function card(ex) {
    const art = document.createElement('article');
    art.className = 'kit-card kit-card--poster kit-card--example';
    art.dataset.campus = ex.campus;
    const label = lang === 'en' ? ex.labelEn : ex.labelFr;
    const meta = lang === 'en' ? ex.metaEn : ex.metaFr;
    const src = `${base}affiche-ex-${encodeURIComponent(ex.id)}-preview.jpg?v=${PREVIEW_V}`;
    const pdfWord = lang === 'en' ? 'Make the PDF' : 'Composer le PDF';
    const links = FORMATS.map(([id, txt]) => `<a href="${esc(composeUrl(ex, id))}" aria-label="${esc(`${pdfWord} ${txt} — ${label}, ${meta}`)}">${esc(txt)}</a>`).join('');
    art.innerHTML = `<a class="kit-card__preview kit-card__preview--photo" href="${esc(composeUrl(ex))}" aria-label="${esc(`${lang === 'en' ? 'Customize' : 'Personnaliser'} : ${label}, ${meta}`)}">
        <img src="${src}" width="660" height="1020" alt="${esc(`${label} — ${meta}`)}" loading="lazy" decoding="async">
      </a>
      <div class="kit-card__body">
        <h3 class="kit-card__label">${esc(label)}</h3>
        <p class="kit-card__meta">${esc(meta)}</p>
        <p class="kit-dl" aria-label="${esc(pdfWord)}">${links}</p>
      </div>`;
    return art;
  }

  function applyFilter(campus) {
    let n = 0;
    grid.querySelectorAll('.kit-card--poster').forEach((el) => {
      const show = campus === 'all' || el.dataset.campus === campus || el.dataset.campus === 'generique';
      el.hidden = !show;
      if (show) n += 1;
    });
    filterBox?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.campus === campus)));
    if (countEl) countEl.textContent = lang === 'en' ? `${n} posters` : `${n} affiches`;
  }

  function buildFilter(examples) {
    if (!filterBox) return;
    const seen = new Map();
    examples.forEach((ex) => {
      if (!seen.has(ex.campus)) seen.set(ex.campus, lang === 'en' ? ex.labelEn : ex.labelFr);
    });
    const entries = [['all', lang === 'en' ? 'All' : 'Toutes'], ...seen.entries()];
    filterBox.innerHTML = entries.map(([slug, label]) => `<button type="button" data-campus="${esc(slug)}" aria-pressed="false">${esc(label)}</button>`).join('');
    filterBox.hidden = seen.size < 2;
    filterBox.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-campus]');
      if (b) applyFilter(b.dataset.campus);
    });
  }

  async function saveKitFile(a) {
    const name = a.getAttribute('download') || a.href.split('/').pop();
    const res = await fetch(a.href);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const type = a.getAttribute('type') || blob.type || 'application/pdf';
    const file = new File([blob], name, { type });
    if (typeof navigator.canShare === 'function') {
      try {
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: name });
          return;
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, '_blank', 'noopener');
    if (!opened) window.location.href = a.href;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  document.addEventListener('click', (ev) => {
    const a = ev.target.closest?.('.kit-dl a[download]');
    if (!a || !isAppleTouch()) return;
    ev.preventDefault();
    ev.stopPropagation();
    saveKitFile(a).catch(() => {
      window.location.href = a.href;
    });
  });

  fetch(`${base}examples.json?v=${PREVIEW_V}`, { cache: 'no-cache' })
    .then((r) => r.json())
    .then((data) => {
      const examples = (data.examples || []).filter((ex) => ex.id && ex.campus && ex.campus !== 'generique');
      examples.forEach((ex) => grid.appendChild(card(ex)));
      buildFilter(examples);
      applyFilter('all');
    })
    .catch(() => {});
})();

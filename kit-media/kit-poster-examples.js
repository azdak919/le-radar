/* Galerie d’exemples : campus + sa photo, tirage aléatoire pour remplir la rangée. */
(function () {
  const grid = document.getElementById('kit-poster-grid');
  if (!grid) return;
  const base = grid.getAttribute('data-asset-base') || './';
  const lang = (document.documentElement.lang || 'fr').startsWith('en') ? 'en' : 'fr';
  const compose = grid.getAttribute('data-compose') || '../affiches/';
  let pool = [];
  let lastSlots = -1;
  let shown = [];

  function isAppleTouch() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints) > 1);
  }

  function cols() {
    const gap = 16;
    const min = 280;
    const w = grid.clientWidth || grid.parentElement?.clientWidth || 800;
    return Math.max(1, Math.floor((w + gap) / (min + gap)));
  }

  function featureSpan() {
    return window.innerWidth >= 700 ? 2 : 1;
  }

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function card(ex) {
    const art = document.createElement('article');
    art.className = 'kit-card kit-card--example';
    const label = lang === 'en' ? ex.labelEn : ex.labelFr;
    const meta = lang === 'en' ? ex.metaEn : ex.metaFr;
    const href = `${compose}?campus=${encodeURIComponent(ex.campus)}`;
    const src = `${base}affiche-ex-${ex.id}-preview.jpg`;
    art.innerHTML = `<a class="kit-card__link" href="${href}">
      <div class="kit-card__preview kit-card__preview--photo">
        <img src="${src}" width="330" height="510" alt="${label}">
      </div>
      <div class="kit-card__body">
        <p class="kit-card__label">${label}</p>
        <p class="kit-card__meta">${meta}</p>
      </div>
    </a>`;
    return art;
  }

  function render() {
    const c = cols();
    const feat = featureSpan();
    const restOfRow = Math.max(0, c - feat);
    const extraRow = feat > 1 ? c : 0;
    const n = restOfRow + extraRow;
    if (n === lastSlots && shown.length) return;
    lastSlots = n;
    grid.querySelectorAll('.kit-card--example').forEach((el) => el.remove());
    shown = shuffle(pool).slice(0, n);
    shown.forEach((ex) => grid.appendChild(card(ex)));
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
    const a = ev.target.closest?.('.kit-dl a[href]');
    if (!a || !isAppleTouch()) return;
    ev.preventDefault();
    ev.stopPropagation();
    saveKitFile(a).catch(() => {
      window.location.href = a.href;
    });
  });

  fetch(`${base}examples.json`, { cache: 'no-cache' })
    .then((r) => r.json())
    .then((data) => {
      pool = (data.examples || []).filter((ex) => ex.id && ex.campus && ex.campus !== 'generique');
      render();
      let t = 0;
      window.addEventListener('resize', () => {
        clearTimeout(t);
        t = setTimeout(render, 120);
      });
    })
    .catch(() => {});
})();

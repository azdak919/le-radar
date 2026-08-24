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

  function cols() {
    const gap = 16;
    const min = 240;
    const w = grid.clientWidth || grid.parentElement?.clientWidth || 800;
    return Math.max(1, Math.floor((w + gap) / (min + gap)));
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
    const n = Math.max(0, cols() - 1);
    if (n === lastSlots && shown.length) return;
    lastSlots = n;
    grid.querySelectorAll('.kit-card--example').forEach((el) => el.remove());
    shown = shuffle(pool).slice(0, n);
    shown.forEach((ex) => grid.appendChild(card(ex)));
  }

  fetch(`${base}examples.json`, { cache: 'no-cache' })
    .then((r) => r.json())
    .then((data) => {
      pool = (data.examples || []).filter((ex) => ex.id);
      render();
      let t = 0;
      window.addEventListener('resize', () => {
        clearTimeout(t);
        t = setTimeout(render, 120);
      });
    })
    .catch(() => {});
})();

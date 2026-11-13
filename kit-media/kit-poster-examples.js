/* Galerie d’affiches : campus (gabarit a9e8f52) et La une, dans plusieurs
 * configurations. Chaque aperçu est un rendu réel, identique au fichier téléchargeable. */
(function () {
  const grid = document.getElementById('kit-poster-grid');
  if (!grid) return;
  const base = grid.getAttribute('data-asset-base') || './';
  const lang = (document.documentElement.lang || 'fr').startsWith('en') ? 'en' : 'fr';
  const compose = grid.getAttribute('data-compose') || '../affiches/';
  const filterBox = document.getElementById('kit-poster-filter');
  const countEl = document.getElementById('kit-poster-count');
  let PREVIEW_V = 'mix-2';
  const PREVIEW_WH = {
    tabloid: [660, 1020],
    letter: [660, 854],
    legal: [660, 1087],
    'ecran-paysage': [960, 540],
    'ecran-portrait': [540, 960],
  };
  const FORMAT_LABEL = {
    tabloid: '11 × 17',
    letter: lang === 'en' ? 'Letter' : 'Lettre',
    legal: lang === 'en' ? 'Legal' : 'Légal',
    'ecran-paysage': lang === 'en' ? '16:9 display' : 'Écran 16:9',
    'ecran-portrait': lang === 'en' ? '9:16 display' : 'Écran 9:16',
  };
  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  function isAppleTouch() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints) > 1);
  }

  function isScreen(ex) {
    return ex.format === 'ecran-paysage' || ex.format === 'ecran-portrait';
  }

  function composeUrl(ex) {
    const q = new URLSearchParams();
    if ((ex.kind || 'campus') === 'une') {
      q.set('modele', 'une');
      if (ex.uni) q.set('uni', ex.uni);
      if (ex.media && ex.media !== 'tous') q.set('media', ex.media);
      if (ex.periode) q.set('periode', ex.periode);
      if (ex.layout) q.set('layout', ex.layout);
    } else {
      q.set('modele', 'campus');
      if (ex.campus) q.set('campus', ex.campus);
      if (ex.photo) q.set('photo', ex.photo);
      if (ex.greeting && ex.greeting !== 'none') q.set('greeting', ex.greeting);
    }
    if (ex.format) q.set('format', ex.format);
    if (ex.lang) q.set('lang', ex.lang);
    q.set('qr', ex.qr === false ? 'non' : 'oui');
    return `${compose}?${q.toString()}`;
  }

  function fileUrl(ex) {
    const name = isScreen(ex)
      ? `affiche-ex-${encodeURIComponent(ex.id)}.png`
      : `affiche-ex-${encodeURIComponent(ex.id)}-600dpi.pdf`;
    return `${base}${name}?v=${PREVIEW_V}`;
  }

  function downloadName(ex) {
    const fmt = ex.format || 'tabloid';
    const stem = `le-radar-${ex.kind === 'une' ? 'une' : 'campus'}-${ex.id}`;
    return isScreen(ex) ? `${stem}.png` : `${stem}.pdf`;
  }

  const INST_LABEL = {
    laval: { fr: 'Université Laval', en: 'Université Laval' },
    mcgill: { fr: 'Université McGill', en: 'McGill University' },
    udem: { fr: 'Université de Montréal', en: 'Université de Montréal' },
    uqam: { fr: 'UQAM', en: 'UQAM' },
    concordia: { fr: 'Concordia', en: 'Concordia' },
    sherbrooke: { fr: 'Université de Sherbrooke', en: 'Université de Sherbrooke' },
    bishops: { fr: 'Bishop’s', en: 'Bishop’s' },
  };

  function instKey(ex) {
    return ex.uni || ex.campus || 'generique';
  }

  function instLabel(ex) {
    const key = instKey(ex);
    return INST_LABEL[key]?.[lang] || (lang === 'en' ? ex.labelEn : ex.labelFr);
  }

  function card(ex) {
    const art = document.createElement('article');
    art.className = 'kit-card kit-card--poster kit-card--example';
    art.dataset.campus = instKey(ex);
    art.dataset.kind = ex.kind || 'campus';
    art.dataset.format = ex.format || 'tabloid';
    const label = lang === 'en' ? ex.labelEn : ex.labelFr;
    const meta = lang === 'en' ? ex.metaEn : ex.metaFr;
    const [w, h] = PREVIEW_WH[ex.format] || PREVIEW_WH.tabloid;
    const src = `${base}affiche-ex-${encodeURIComponent(ex.id)}-preview.jpg?v=${PREVIEW_V}`;
    const dlWord = lang === 'en' ? 'Download' : 'Télécharger';
    const fmtLabel = FORMAT_LABEL[ex.format] || ex.format;
    const type = isScreen(ex) ? 'image/png' : 'application/pdf';
    const customize = lang === 'en' ? 'Customize in the studio' : 'Personnaliser dans le studio';
    art.innerHTML = `<a class="kit-card__preview kit-card__preview--photo" href="${esc(fileUrl(ex))}" style="aspect-ratio: ${w} / ${h};" aria-label="${esc(`${dlWord} ${fmtLabel} — ${label}`)}">
        <img src="${esc(src)}" width="${w}" height="${h}" alt="${esc(`${label} — ${meta}`)}" loading="lazy" decoding="async">
      </a>
      <div class="kit-card__body">
        <h3 class="kit-card__label">${esc(label)}</h3>
        <p class="kit-card__meta">${esc(meta)}</p>
        <p class="kit-dl" aria-label="${esc(dlWord)}">
          <a href="${esc(fileUrl(ex))}" download="${esc(downloadName(ex))}" type="${type}">${esc(fmtLabel)}</a>
          <a href="${esc(composeUrl(ex))}">${esc(customize)}</a>
        </p>
      </div>`;
    return art;
  }

  function applyFilter(value) {
    let n = 0;
    grid.querySelectorAll('.kit-card--poster').forEach((el) => {
      const show = value === 'all'
        || (value === 'une' && el.dataset.kind === 'une')
        || (value === 'campus' && (el.dataset.kind === 'campus' || el.dataset.campus === 'generique'))
        || el.dataset.campus === value;
      el.hidden = !show;
      if (show) n += 1;
    });
    grid.querySelectorAll('.kit-gallery-group').forEach((g) => {
      const visible = [...g.querySelectorAll('.kit-card--poster')].some((c) => !c.hidden);
      g.hidden = !visible;
    });
    filterBox?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === value)));
    if (countEl) countEl.textContent = lang === 'en' ? `${n} posters` : `${n} affiches`;
  }

  function buildFilter(examples) {
    if (!filterBox) return;
    const seen = new Map();
    examples.forEach((ex) => {
      const key = instKey(ex);
      if (!seen.has(key)) seen.set(key, instLabel(ex));
    });
    const entries = [
      ['all', lang === 'en' ? 'All' : 'Toutes'],
      ['une', lang === 'en' ? 'Front page' : 'La une'],
      ['campus', lang === 'en' ? 'Campus posters' : 'Affiches campus'],
      ...seen.entries(),
    ];
    filterBox.innerHTML = entries.map(([slug, label]) => `<button type="button" data-filter="${esc(slug)}" data-campus="${esc(slug)}" aria-pressed="false">${esc(label)}</button>`).join('');
    filterBox.hidden = false;
    filterBox.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-filter]');
      if (b) applyFilter(b.dataset.filter);
    });
  }

  const FORMAT_ORDER = ['letter', 'legal', 'tabloid', 'ecran-paysage', 'ecran-portrait'];

  function groupLabel(kind) {
    if (kind === 'une') return lang === 'en' ? 'The Radar front page' : 'La une du Radar';
    return lang === 'en' ? 'Campus posters' : 'Affiches campus';
  }

  function mount(examples) {
    const generic = grid.querySelector('.kit-card--feature, .kit-card[data-campus="generique"]');
    grid.classList.remove('kit-grid', 'kit-grid--poster');
    grid.classList.add('kit-gallery');
    grid.innerHTML = '';
    const byKind = { une: [], campus: [] };
    examples.forEach((ex) => byKind[(ex.kind || 'campus') === 'une' ? 'une' : 'campus'].push(ex));
    ['une', 'campus'].forEach((kind) => {
      const list = byKind[kind];
      if (!list.length && !(kind === 'campus' && generic)) return;
      const group = document.createElement('section');
      group.className = 'kit-gallery-group';
      group.dataset.kind = kind;
      const h = document.createElement('h3');
      h.className = 'kit-gallery-group__title';
      h.textContent = groupLabel(kind);
      group.appendChild(h);
      const buckets = new Map();
      const order = kind === 'une' ? FORMAT_ORDER.slice() : ['campus'];
      if (kind === 'campus' && generic) {
        generic.dataset.kind = 'campus';
        generic.dataset.format = generic.dataset.format || 'tabloid';
        buckets.set('campus', { label: lang === 'en' ? 'Original campus posters' : 'Affiches campus originales', cards: [generic] });
      }
      list.forEach((ex) => {
        const key = kind === 'une' ? (ex.format || 'tabloid') : 'campus';
        const label = kind === 'une'
          ? (FORMAT_LABEL[ex.format] || ex.format)
          : (lang === 'en' ? 'Original campus posters' : 'Affiches campus originales');
        if (!buckets.has(key)) buckets.set(key, { label, cards: [] });
        buckets.get(key).cards.push(card(ex));
      });
      (order.length ? order : [...buckets.keys()]).forEach((key) => {
        const bucket = buckets.get(key);
        if (!bucket) return;
        const sub = document.createElement('div');
        sub.className = 'kit-gallery-sub';
        sub.dataset.format = key;
        const h4 = document.createElement('h4');
        h4.className = 'kit-gallery-sub__title';
        h4.textContent = bucket.label;
        const inner = document.createElement('div');
        inner.className = 'kit-grid kit-grid--poster';
        bucket.cards.forEach((c) => inner.appendChild(c));
        sub.appendChild(h4);
        sub.appendChild(inner);
        group.appendChild(sub);
      });
      grid.appendChild(group);
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

  function fillFeatured(examples, meta) {
    const fig = document.getElementById('kit-une-example');
    if (!fig) return;
    const id = fig.dataset.featured || (meta && meta.featured);
    const ex = (examples || []).find((e) => e.id === id);
    const period = meta && meta.periods && id ? meta.periods[id] : null;
    const img = fig.querySelector('img');
    const link = document.getElementById('kit-une-example-link') || fig.querySelector('a');
    const cap = document.getElementById('kit-une-example-caption');
    const v = PREVIEW_V;
    if (ex && link) {
      const screen = ex.format === 'ecran-paysage' || ex.format === 'ecran-portrait';
      const name = screen ? `affiche-ex-${ex.id}.png` : `affiche-ex-${ex.id}-600dpi.pdf`;
      link.href = `${base}${name}?v=${v}`;
    }
    if (ex && img) {
      img.src = `${base}affiche-ex-${ex.id}-preview.jpg?v=${v}`;
    }
    if (!cap) return;
    const label = lang === 'en' ? (ex && ex.labelEn) : (ex && ex.labelFr);
    const when = period ? (lang === 'en' ? period.en : period.fr) : '';
    if (lang === 'en') {
      const head = 'Example — <strong>Quartier Libre</strong> front page (Université de Montréal), letter, last week, light paper background.';
      cap.innerHTML = when
        ? `${head} ${when}. The thumbnail is the downloadable file, scaled down.`
        : `${head} The thumbnail is the downloadable file, scaled down. The date shown matches the generated content.`;
      if (img && when) img.alt = `Quartier Libre front page, Université de Montréal, letter, ${when}`;
    } else {
      const head = 'Exemple — La une de <strong>Quartier Libre</strong> (Université de Montréal), format lettre, dernière semaine, fond clair.';
      cap.innerHTML = when
        ? `${head} ${when}. L’aperçu est le fichier téléchargeable, réduit.`
        : `${head} L’aperçu est le fichier téléchargeable, réduit. La date affichée suit le contenu généré.`;
      if (img && when) img.alt = `La une Quartier Libre, Université de Montréal, format lettre, ${when}`;
    }
  }

  function openCharteForHash() {
    const ids = ['identite', 'logos', 'bannieres', 'regles', 'banners', 'rules', 'charte'];
    const hash = (location.hash || '').replace(/^#/, '');
    if (!ids.includes(hash)) return;
    const box = document.querySelector('.kit-charte');
    if (box && !box.open) box.open = true;
    const target = document.getElementById(hash);
    if (target) target.scrollIntoView();
  }

  document.querySelectorAll('.kit-toc a[href^="#"]').forEach((a) => {
    a.addEventListener('click', () => {
      setTimeout(openCharteForHash, 0);
    });
  });
  window.addEventListener('hashchange', openCharteForHash);
  openCharteForHash();

  Promise.all([
    fetch(`${base}gallery-meta.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    fetch(`${base}examples.json`, { cache: 'no-cache' }).then((r) => r.json()),
  ])
    .then(([meta, data]) => {
      if (meta && meta.previewV) PREVIEW_V = meta.previewV;
      const examples = (data.examples || []).filter((ex) => ex.id);
      fillFeatured(examples, meta);
      mount(examples);
      buildFilter(examples);
      applyFilter('all');
    })
    .catch(() => {});
})();

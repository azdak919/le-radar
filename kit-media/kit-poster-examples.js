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
  let PREVIEW_V = 'mix-3';
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

  const PERIOD_TAG = {
    semaine: { fr: 'Semaine', en: 'Week' },
    mois: { fr: 'Mois', en: 'Month' },
  };

  function shortLabel(ex) {
    const raw = lang === 'en' ? ex.labelEn : ex.labelFr;
    return String(raw || '').replace(/^(La une — |Front page — |The Radar front page — )/i, '').trim() || raw;
  }

  function tags(ex) {
    const out = [];
    out.push(ex.kind === 'une' ? (lang === 'en' ? 'Front page' : 'La une') : (lang === 'en' ? 'Campus' : 'Campus'));
    const inst = instLabel(ex);
    if (inst) out.push(inst);
    out.push(FORMAT_LABEL[ex.format] || ex.format);
    if (ex.periode && PERIOD_TAG[ex.periode]) out.push(PERIOD_TAG[ex.periode][lang]);
    if (ex.lang === 'bilingue') out.push(lang === 'en' ? 'Bilingual' : 'Bilingue');
    if (ex.photo || (ex.layout && String(ex.layout).includes('verre'))) out.push(lang === 'en' ? 'Photo' : 'Photo');
    return out.filter(Boolean);
  }

  function card(ex) {
    const art = document.createElement('article');
    art.className = 'kit-card kit-card--poster kit-card--example';
    art.dataset.campus = instKey(ex);
    art.dataset.kind = ex.kind || 'campus';
    art.dataset.format = ex.format || 'tabloid';
    const label = shortLabel(ex);
    const meta = lang === 'en' ? ex.metaEn : ex.metaFr;
    const [w, h] = PREVIEW_WH[ex.format] || PREVIEW_WH.tabloid;
    const src = `${base}affiche-ex-${encodeURIComponent(ex.id)}-preview.jpg?v=${PREVIEW_V}`;
    const dlWord = lang === 'en' ? 'Download' : 'Télécharger';
    const fmtLabel = FORMAT_LABEL[ex.format] || ex.format;
    const type = isScreen(ex) ? 'image/png' : 'application/pdf';
    const customize = lang === 'en' ? 'Studio' : 'Studio';
    const chips = tags(ex).map((t) => `<span>${esc(t)}</span>`).join('');
    art.innerHTML = `<a class="kit-card__preview kit-card__preview--photo" href="${esc(fileUrl(ex))}" style="aspect-ratio: ${w} / ${h};" aria-label="${esc(`${dlWord} ${fmtLabel} — ${label}`)}">
        <img src="${esc(src)}" width="${w}" height="${h}" alt="${esc(`${label} — ${meta}`)}" loading="lazy" decoding="async">
      </a>
      <div class="kit-card__body">
        <h3 class="kit-card__label">${esc(label)}</h3>
        <p class="kit-tags">${chips}</p>
        <p class="kit-dl" aria-label="${esc(dlWord)}">
          <a href="${esc(fileUrl(ex))}" download="${esc(downloadName(ex))}" type="${type}">${esc(dlWord)}</a>
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
        || (FORMAT_LABEL[value] && el.dataset.format === value)
        || el.dataset.campus === value;
      el.hidden = !show;
      if (show) n += 1;
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
    const formats = [];
    FORMAT_ORDER.forEach((fmt) => {
      if (examples.some((ex) => ex.format === fmt) || (fmt === 'tabloid' && grid.querySelector('[data-campus="generique"]'))) {
        formats.push([fmt, FORMAT_LABEL[fmt]]);
      }
    });
    const entries = [
      ['all', lang === 'en' ? 'All' : 'Toutes'],
      ['une', lang === 'en' ? 'Front page' : 'La une'],
      ['campus', lang === 'en' ? 'Campus' : 'Campus'],
      ...formats,
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

  function mount(examples) {
    const generic = grid.querySelector('.kit-card--feature, .kit-card[data-campus="generique"]');
    grid.classList.remove('kit-grid');
    grid.classList.add('kit-gallery', 'kit-grid--poster');
    const keepGeneric = generic ? generic.cloneNode(true) : null;
    grid.innerHTML = '';
    if (keepGeneric) {
      keepGeneric.classList.add('kit-card--poster');
      keepGeneric.dataset.kind = 'campus';
      keepGeneric.dataset.format = keepGeneric.dataset.format || 'tabloid';
      if (!keepGeneric.querySelector('.kit-tags')) {
        const meta = keepGeneric.querySelector('.kit-card__meta');
        const body = keepGeneric.querySelector('.kit-card__body');
        if (meta && body) {
          const tagsP = document.createElement('p');
          tagsP.className = 'kit-tags';
          const bits = lang === 'en'
            ? ['Campus', '11 × 17', 'Letter', 'Legal']
            : ['Campus', '11 × 17', 'Lettre', 'Légal'];
          tagsP.innerHTML = bits.map((t) => `<span>${esc(t)}</span>`).join('');
          meta.replaceWith(tagsP);
        }
      }
      grid.appendChild(keepGeneric);
    }
    examples.forEach((ex) => grid.appendChild(card(ex)));
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
      cap.innerHTML = when
        ? `<strong>Quartier Libre</strong> · UdeM · Letter · ${when}`
        : '<strong>Quartier Libre</strong> · UdeM · Letter';
      if (img && when) img.alt = `Quartier Libre front page, Université de Montréal, letter, ${when}`;
    } else {
      cap.innerHTML = when
        ? `<strong>Quartier Libre</strong> · UdeM · Lettre · ${when}`
        : '<strong>Quartier Libre</strong> · UdeM · Lettre';
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

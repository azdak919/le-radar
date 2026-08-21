/* Labo photo local — client. Écrit via /api/* (127.0.0.1). */
(() => {
  const DESKTOP = { w: 1280, h: 170 };
  const MOBILE = { w: 390, h: 175 };
  const PHONE = { w: 390, h: 844 };
  const FULL = { w: 1280, h: 800 };

  const state = {
    photos: [],
    filtered: [],
    selected: null,
    focalY: 0.5,
    busy: false,
  };

  const $ = (id) => document.getElementById(id);

  function coverWindow(imgW, imgH, frameW, frameH, focalY) {
    const w = imgW || 0;
    const h = imgH || 0;
    const fyRaw = Number(focalY);
    const fy = Math.min(1, Math.max(0, Number.isFinite(fyRaw) ? fyRaw : 0.5));
    if (w <= 0 || h <= 0) return { topPct: 50 - 10, heightPct: 20, visibleFrac: 1 };
    const scale = Math.max(frameW / w, frameH / h);
    const visH = Math.min(h, frameH / scale);
    const visibleFrac = visH / h;
    const topFrac = (1 - visibleFrac) * fy;
    return {
      topPct: topFrac * 100,
      heightPct: visibleFrac * 100,
      visibleFrac,
    };
  }

  async function api(path, body) {
    const opts = body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {};
    const res = await fetch(path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  function seasonLabel(s) {
    return (
      {
        printemps: 'printemps',
        ete: 'été',
        automne: 'automne',
        hiver: 'hiver',
      }[s] || s || '—'
    );
  }

  function renderStats(stats) {
    if (!stats) return;
    $('stats').textContent =
      `${stats.total} photos · mât ${stats.bySurface.masthead} · pomo ${stats.bySurface.pomo} · solitaire ${stats.bySurface.solitaire} · sans saison ${stats.untagged}`;
  }

  function applyFilters() {
    const surface = $('f-surface').value;
    const bank = $('f-bank').value;
    const season = $('f-season').value;
    const q = $('f-q').value.trim().toLowerCase();
    state.filtered = state.photos.filter((p) => {
      if (surface && !(p.surfaces || []).includes(surface)) return false;
      if (bank && !(p.banks || []).includes(bank)) return false;
      if (season === 'untagged' && p.season) return false;
      if (season && season !== 'untagged' && p.season !== season) return false;
      if (q) {
        const hay = `${p.title} ${p.credit} ${p.place} ${p.url} ${p.banks.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    renderGrid();
  }

  function renderGrid() {
    const root = $('grid');
    root.textContent = '';
    const frag = document.createDocumentFragment();
    for (const p of state.filtered) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card' + (state.selected && state.selected.key === p.key ? ' is-on' : '');
      btn.dataset.key = p.key;
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = p.title || '';
      img.src = p.thumb || p.url;
      const cap = document.createElement('div');
      cap.className = 'cap';
      const b = document.createElement('b');
      b.textContent = p.place || p.title || p.credit || 'Sans titre';
      cap.appendChild(b);
      const chips = document.createElement('div');
      chips.className = 'chips';
      for (const bank of p.banks) {
        const c = document.createElement('span');
        c.className = 'chip';
        c.textContent = bank.replace('-stock', '');
        chips.appendChild(c);
      }
      if (p.season) {
        const c = document.createElement('span');
        c.className = 'chip';
        c.textContent = seasonLabel(p.season);
        chips.appendChild(c);
      }
      if (p.permanent) {
        const c = document.createElement('span');
        c.className = 'chip perm';
        c.textContent = 'permanente';
        chips.appendChild(c);
      }
      cap.appendChild(chips);
      btn.appendChild(img);
      btn.appendChild(cap);
      btn.addEventListener('click', () => select(p.key));
      frag.appendChild(btn);
    }
    root.appendChild(frag);
  }

  function currentIndex() {
    if (!state.selected) return -1;
    return state.filtered.findIndex((p) => p.key === state.selected.key);
  }

  function select(key) {
    const p = state.photos.find((x) => x.key === key);
    if (!p) return;
    state.selected = p;
    state.focalY = typeof p.focalY === 'number' ? p.focalY : 0.5;
    $('panel-empty').hidden = true;
    $('panel-body').hidden = false;
    $('full-photo').src = p.url;
    $('full-photo').alt = p.title || '';
    $('focal').value = String(Math.round(state.focalY * 1000));
    $('focal-val').textContent = state.focalY.toFixed(2);
    $('credit').value = p.credit || '';
    $('place').value = p.place || '';
    updateCreditPreview();
    for (const el of document.querySelectorAll('input[name="season"]')) {
      el.checked = (p.season || '') === el.value;
    }
    for (const el of document.querySelectorAll('input[name="season6"]')) {
      el.checked = (p.season6 || '') === el.value;
    }
    $('surf-masthead').checked = (p.surfaces || []).includes('masthead') || !p.surfaces.length;
    $('surf-pomo').checked = (p.surfaces || []).includes('pomo');
    $('surf-solitaire').checked = (p.surfaces || []).includes('solitaire');
    $('season6-wrap').style.display = (p.banks || []).includes('nations') ? '' : 'none';
    $('photo-meta').textContent = [
      p.title,
      (p.banks || []).join(', '),
      p.width && p.height ? `${p.width}×${p.height}` : '',
      p.seasonSource ? `source saison: ${p.seasonSource}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    $('status').textContent = '';
    document.querySelectorAll('.card.is-on').forEach((el) => el.classList.remove('is-on'));
    const card = document.querySelector(`.card[data-key="${CSS.escape(key)}"]`);
    if (card) card.classList.add('is-on');
    updateOverlays();
    renderMinis();
  }

  function updateCreditPreview() {
    const name = $('credit').value.trim();
    const place = $('place').value.trim();
    let label = name;
    if (name && place && name.toLowerCase().indexOf(place.toLowerCase()) < 0) {
      label = `${name} — ${place}`;
    } else if (!name) label = place;
    $('credit-preview').textContent = label ? `Aperçu : ${label}` : '';
  }

  function updateOverlays() {
    const img = $('full-photo');
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const fy = state.focalY;
    const desk = coverWindow(nw, nh, DESKTOP.w, DESKTOP.h, fy);
    const mob = coverWindow(nw, nh, MOBILE.w, MOBILE.h, fy);
    const d = $('band-desktop');
    const m = $('band-mobile');
    d.style.top = `${desk.topPct}%`;
    d.style.height = `${desk.heightPct}%`;
    m.style.top = `${mob.topPct}%`;
    m.style.height = `${mob.heightPct}%`;
  }

  function renderMinis() {
    const p = state.selected;
    if (!p) return;
    const fy = state.focalY;
    const pct = `${Math.round(fy * 1000) / 10}%`;
    const frames = {
      'preview-desktop': { w: DESKTOP.w, h: DESKTOP.h, word: true },
      'preview-mobile': { w: MOBILE.w, h: MOBILE.h, word: true },
      'preview-phone': { w: PHONE.w, h: PHONE.h, word: false },
      'preview-full': { w: FULL.w, h: FULL.h, word: false },
    };
    for (const [id, f] of Object.entries(frames)) {
      const el = $(id);
      const avail = el.clientWidth || 280;
      const scale = avail / f.w;
      el.innerHTML = '';
      el.style.height = `${Math.round(f.h * scale)}px`;
      const inner = document.createElement('div');
      inner.style.cssText = `width:${f.w}px;height:${f.h}px;transform:scale(${scale});transform-origin:top left;position:relative;`;
      const bg = document.createElement('div');
      bg.className = 'mini-bg';
      bg.style.backgroundImage = `url("${p.url}")`;
      bg.style.backgroundPosition = `50% ${pct}`;
      inner.appendChild(bg);
      if (f.word) {
        const chrome = document.createElement('div');
        chrome.className = 'mini-chrome';
        chrome.textContent = 'LE RADAR.ca';
        inner.appendChild(chrome);
        const cred = document.createElement('div');
        cred.className = 'mini-credit';
        cred.textContent = $('credit-preview').textContent.replace(/^Aperçu : /, '') || p.credit || '';
        inner.appendChild(cred);
      }
      el.appendChild(inner);
    }
  }

  async function reload() {
    const data = await api('/api/photos');
    state.photos = data.photos || [];
    renderStats(data.stats);
    applyFilters();
    if (state.selected) {
      const next = state.photos.find((p) => p.key === state.selected.key);
      if (next) select(next.key);
      else {
        state.selected = null;
        $('panel-body').hidden = true;
        $('panel-empty').hidden = false;
      }
    }
  }

  async function mutate(fn) {
    if (state.busy || !state.selected) return;
    state.busy = true;
    $('status').textContent = 'Enregistrement…';
    try {
      const result = await fn();
      $('status').textContent = result && result.error ? result.error : 'Enregistré.';
      await reload();
    } catch (err) {
      $('status').textContent = err.message || String(err);
    } finally {
      state.busy = false;
    }
  }

  function selectedSurfaces() {
    const out = [];
    if ($('surf-masthead').checked) out.push('masthead');
    if ($('surf-pomo').checked) out.push('pomo');
    if ($('surf-solitaire').checked) out.push('solitaire');
    return out.length ? out : ['masthead'];
  }

  $('f-surface').addEventListener('change', applyFilters);
  $('f-bank').addEventListener('change', applyFilters);
  $('f-season').addEventListener('change', applyFilters);
  $('f-q').addEventListener('input', applyFilters);

  $('focal').addEventListener('input', () => {
    state.focalY = Number($('focal').value) / 1000;
    $('focal-val').textContent = state.focalY.toFixed(2);
    updateOverlays();
    renderMinis();
  });
  $('focal').addEventListener('change', () => {
    if (!state.selected) return;
    mutate(() => api('/api/focal', { url: state.selected.url, focalY: state.focalY }));
  });

  $('credit').addEventListener('input', () => {
    updateCreditPreview();
    renderMinis();
  });
  $('place').addEventListener('input', updateCreditPreview);

  $('save-meta-btn').addEventListener('click', () => {
    if (!state.selected) return;
    const season = (document.querySelector('input[name="season"]:checked') || {}).value || '';
    const season6 = (document.querySelector('input[name="season6"]:checked') || {}).value || '';
    mutate(async () => {
      await api('/api/credit', {
        url: state.selected.url,
        credit: $('credit').value,
        place: $('place').value,
      });
      return api('/api/season', {
        url: state.selected.url,
        season: season || undefined,
        season6: season6 || undefined,
        clear: !season && !season6,
      });
    });
  });

  $('reject-btn').addEventListener('click', () => {
    if (!state.selected) return;
    const title = state.selected.title || state.selected.url;
    if (!window.confirm(`Rejeter définitivement « ${title} » ? Elle ne reviendra pas au prochain maintain.`)) {
      return;
    }
    const idx = currentIndex();
    mutate(async () => {
      const r = await api('/api/reject', { url: state.selected.url });
      const next = state.filtered[idx + 1] || state.filtered[idx - 1];
      if (next) state.selected = next;
      else state.selected = null;
      return r;
    });
  });

  $('pin-btn').addEventListener('click', () => {
    if (!state.selected) return;
    mutate(() =>
      api('/api/pin', {
        url: state.selected.url,
        surfaces: selectedSurfaces(),
      })
    );
  });

  $('undo-btn').addEventListener('click', () => mutate(() => api('/api/undo', {})));

  $('full-photo').addEventListener('load', () => {
    updateOverlays();
    renderMinis();
  });

  function focalFromPointer(ev) {
    const img = $('full-photo');
    const rect = img.getBoundingClientRect();
    if (rect.height <= 0) return state.focalY;
    const y = (ev.clientY - rect.top) / rect.height;
    return Math.min(1, Math.max(0, y));
  }

  let dragging = false;
  $('crop-stage').addEventListener('pointerdown', (ev) => {
    if (!state.selected) return;
    dragging = true;
    $('crop-stage').setPointerCapture(ev.pointerId);
    state.focalY = focalFromPointer(ev);
    $('focal').value = String(Math.round(state.focalY * 1000));
    $('focal-val').textContent = state.focalY.toFixed(2);
    updateOverlays();
    renderMinis();
  });
  $('crop-stage').addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    state.focalY = focalFromPointer(ev);
    $('focal').value = String(Math.round(state.focalY * 1000));
    $('focal-val').textContent = state.focalY.toFixed(2);
    updateOverlays();
    renderMinis();
  });
  $('crop-stage').addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    if (!state.selected) return;
    mutate(() => api('/api/focal', { url: state.selected.url, focalY: state.focalY }));
  });

  document.addEventListener('keydown', (ev) => {
    const tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (ev.key !== 'Escape') return;
    }
    if (ev.key === 'j' || ev.key === 'ArrowDown') {
      ev.preventDefault();
      const i = currentIndex();
      const n = state.filtered[i + 1] || state.filtered[0];
      if (n) {
        select(n.key);
        document.querySelector(`.card[data-key="${CSS.escape(n.key)}"]`)?.scrollIntoView({ block: 'nearest' });
      }
    } else if (ev.key === 'k' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const i = currentIndex();
      const n = state.filtered[i - 1] || state.filtered[state.filtered.length - 1];
      if (n) {
        select(n.key);
        document.querySelector(`.card[data-key="${CSS.escape(n.key)}"]`)?.scrollIntoView({ block: 'nearest' });
      }
    } else if (ev.key === 'r') {
      ev.preventDefault();
      $('reject-btn').click();
    } else if (ev.key === 'p') {
      ev.preventDefault();
      $('pin-btn').click();
    } else if (ev.key === 'z' && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
      ev.preventDefault();
      $('undo-btn').click();
    } else if (['1', '2', '3', '4'].includes(ev.key)) {
      const map = { 1: 'printemps', 2: 'ete', 3: 'automne', 4: 'hiver' };
      const val = map[ev.key];
      const radio = document.querySelector(`input[name="season"][value="${val}"]`);
      if (radio) {
        radio.checked = true;
        $('save-meta-btn').click();
      }
    }
  });

  reload().catch((err) => {
    $('stats').textContent = err.message;
  });
})();

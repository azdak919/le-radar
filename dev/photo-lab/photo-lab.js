/* Labo photo local — revue une à la fois. Écrit via /api/* (127.0.0.1). */
(() => {
  const DESKTOP = { w: 1280, h: 170 };
  const MOBILE = { w: 390, h: 175 };
  const PHONE = { w: 390, h: 844 };
  const FULL = { w: 1280, h: 800 };
  const STORE_KEY = 'photo-lab-current-key';

  const state = {
    photos: [],
    filtered: [],
    selected: null,
    focalY: 0.5,
    focalDirty: false,
    metaDirty: false,
    busy: false,
    view: 'grid',
  };

  const $ = (id) => document.getElementById(id);

  function coverWindow(imgW, imgH, frameW, frameH, focalY) {
    const w = imgW || 0;
    const h = imgH || 0;
    const fyRaw = Number(focalY);
    const fy = Math.min(1, Math.max(0, Number.isFinite(fyRaw) ? fyRaw : 0.5));
    if (w <= 0 || h <= 0) return { topPct: 40, heightPct: 20, visibleFrac: 1 };
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
      `${stats.total} au total · sans saison ${stats.untagged}`;
  }

  function renderCache(c) {
    if (!c || !$('cache-status')) return;
    const bit = `${c.have || 0}/${c.total || 0}`;
    $('cache-status').textContent = c.running ? `Cache ${bit}…` : `Cache ${bit}`;
  }

  function photoSrc(p) {
    if (!p) return '';
    return p.src || (p.id ? `/img/${p.id}` : p.url);
  }

  function prefetchAround() {
    const i = currentIndex();
    for (const j of [i + 1, i + 2, i - 1]) {
      const p = state.filtered[j];
      if (!p) continue;
      const im = new Image();
      im.src = photoSrc(p);
    }
  }

  function currentIndex() {
    if (!state.selected) return -1;
    return state.filtered.findIndex((p) => p.key === state.selected.key);
  }

  function updateCounter() {
    const i = currentIndex();
    const n = state.filtered.length;
    if (state.view === 'grid') {
      $('counter').textContent = n ? `${n} photos` : '0';
    } else {
      $('counter').textContent = n ? `${i + 1} / ${n}` : '0 / 0';
    }
    const navOff = state.view !== 'detail' || n < 2;
    if ($('prev-btn')) $('prev-btn').disabled = navOff;
    if ($('next-btn')) $('next-btn').disabled = navOff;
  }

  function showGrid() {
    state.view = 'grid';
    document.body.classList.add('mode-grid');
    document.body.classList.remove('mode-detail');
    if ($('panel-body')) $('panel-body').hidden = true;
    if ($('grid-view')) $('grid-view').hidden = false;
    if ($('brand-sub')) $('brand-sub').textContent = 'grille';
    renderGrid();
    updateCounter();
  }

  function showDetail(key) {
    state.view = 'detail';
    document.body.classList.remove('mode-grid');
    document.body.classList.add('mode-detail');
    if ($('panel-empty')) $('panel-empty').hidden = true;
    if ($('panel-body')) $('panel-body').hidden = false;
    if ($('grid-view')) $('grid-view').hidden = true;
    if ($('brand-sub')) $('brand-sub').textContent = 'fiche';
    select(key);
  }

  function renderGrid() {
    const root = $('grid');
    if (!root) return;
    root.textContent = '';
    const frag = document.createDocumentFragment();
    for (const p of state.filtered) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card';
      btn.dataset.key = p.key;
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = p.title || '';
      img.src = photoSrc(p);
      const cap = document.createElement('div');
      cap.className = 'cap';
      const b = document.createElement('b');
      b.textContent = p.place || p.title || p.credit || 'Sans titre';
      cap.appendChild(b);
      const chips = document.createElement('div');
      chips.className = 'chips';
      const tags = p.tags || [];
      for (const t of ['mat', 'pomo', 'solitaire', 'campus', 'favori', 'nations']) {
        if (!tags.includes(t) && !(t === 'favori' && p.permanent) && !(t === 'campus' && p.campus)) continue;
        if (t === 'mat' && !tags.includes('mat') && (p.surfaces || []).includes('masthead')) {
          /* show */
        }
        const c = document.createElement('span');
        c.className = 'chip' + (t === 'favori' || t === 'campus' ? ' perm' : '');
        c.textContent = t === 'mat' ? 'mât' : t;
        chips.appendChild(c);
      }
      cap.appendChild(chips);
      btn.appendChild(img);
      btn.appendChild(cap);
      btn.addEventListener('click', () => showDetail(p.key));
      frag.appendChild(btn);
    }
    root.appendChild(frag);
  }

  function applyFilters() {
    const surface = $('f-surface').value;
    const tag = $('f-tag') ? $('f-tag').value : '';
    const season = $('f-season').value;
    const q = $('f-q').value.trim().toLowerCase();
    const prevKey = state.selected && state.selected.key;
    state.filtered = state.photos.filter((p) => {
      if (surface && !(p.surfaces || []).includes(surface)) return false;
      const tags = p.tags || p.banks || [];
      if (tag && !tags.includes(tag) && !(tag === 'favori' && p.permanent)) return false;
      if (season === 'untagged' && p.season) return false;
      if (season && season !== 'untagged' && p.season !== season) return false;
      if (q) {
        const hay = `${p.title} ${p.credit} ${p.place} ${p.url} ${tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (!state.filtered.length) {
      state.selected = null;
      if ($('panel-body')) $('panel-body').hidden = true;
      if ($('grid-view')) $('grid-view').hidden = true;
      $('panel-empty').hidden = false;
      updateCounter();
      return;
    }
    $('panel-empty').hidden = true;
    if (state.view === 'detail') {
      const keep = prevKey && state.filtered.find((p) => p.key === prevKey);
      showDetail((keep || state.filtered[0]).key);
    } else {
      showGrid();
    }
  }

  function setFocalState(dirty) {
    state.focalDirty = !!dirty;
    const el = $('focal-state');
    if (!el) return;
    el.textContent = dirty ? 'non enregistré' : 'enregistré';
    el.classList.toggle('is-dirty', !!dirty);
    updateDirtyPill();
  }

  function formPayload() {
    const season = (document.querySelector('input[name="season"]:checked') || {}).value || '';
    const season6 = (document.querySelector('input[name="season6"]:checked') || {}).value || '';
    return {
      url: state.selected.url,
      focalY: state.focalY,
      credit: $('credit').value,
      place: $('place').value,
      season: season || undefined,
      season6: season6 || undefined,
      clearSeason: !season && !season6,
      surfaces: selectedSurfaces(),
      tags: selectedTags(),
    };
  }

  async function persistFocalIfDirty() {
    if (!state.focalDirty || !state.selected) return;
    await api('/api/focal', { url: state.selected.url, focalY: state.focalY });
    state.selected.focalY = state.focalY;
    const listed = state.photos.find((p) => p.key === state.selected.key);
    if (listed) listed.focalY = state.focalY;
    setFocalState(false);
  }

  async function persistAllIfDirty() {
    if (!state.selected) return;
    if (!state.focalDirty && !state.metaDirty) return;
    const result = await api('/api/save', formPayload());
    state.selected.focalY = state.focalY;
    state.selected.surfaces = result.surfaces || selectedSurfaces();
    setFocalState(false);
    state.metaDirty = false;
    return result;
  }

  async function go(delta) {
    if (state.view !== 'detail') return;
    const n = state.filtered.length;
    if (!n) return;
    try {
      await persistAllIfDirty();
    } catch (err) {
      $('status').textContent = err.message || String(err);
      return;
    }
    const i = currentIndex();
    const next = state.filtered[(i + delta + n) % n];
    if (next) select(next.key);
  }

  function select(key) {
    const p = state.photos.find((x) => x.key === key) || state.filtered.find((x) => x.key === key);
    if (!p) return;
    state.selected = p;
    state.focalY = typeof p.focalY === 'number' ? p.focalY : 0.5;
    try {
      sessionStorage.setItem(STORE_KEY, p.key);
    } catch (_) {}
    $('crop-stage').classList.add('is-loading');
    $('crop-stage').classList.remove('is-error');
    $('load-msg').textContent = 'Chargement de la photo…';
    $('full-photo').src = photoSrc(p);
    $('full-photo').alt = p.title || '';
    $('focal').value = String(Math.round(state.focalY * 1000));
    $('focal-val').textContent = state.focalY.toFixed(2);
    setFocalState(false);
    $('credit').value = p.credit || '';
    $('place').value = p.place || '';
    updateCreditPreview();
    for (const el of document.querySelectorAll('input[name="season"]')) {
      el.checked = (p.season || '') === el.value;
    }
    for (const el of document.querySelectorAll('input[name="season6"]')) {
      el.checked = (p.season6 || '') === el.value;
    }
    state.metaDirty = false;
    const tags = p.tags || p.banks || [];
    if ($('tag-mat')) $('tag-mat').checked = tags.includes('mat') || (p.surfaces || []).includes('masthead');
    if ($('tag-pomo')) $('tag-pomo').checked = tags.includes('pomo') || (p.surfaces || []).includes('pomo');
    if ($('tag-solitaire')) $('tag-solitaire').checked = tags.includes('solitaire') || (p.surfaces || []).includes('solitaire');
    if ($('tag-favori')) $('tag-favori').checked = tags.includes('favori') || !!p.permanent;
    if ($('tag-campus')) $('tag-campus').checked = tags.includes('campus') || !!p.campus;
    if ($('tag-nations')) $('tag-nations').checked = tags.includes('nations');
    if ($('season6-wrap')) {
      $('season6-wrap').style.display = tags.includes('nations') ? '' : 'none';
    }
    updateDirtyPill();
    $('photo-meta').textContent = [
      p.place || p.title || 'Sans titre',
      p.width && p.height ? `${p.width}×${p.height}` : '',
      p.seasonSource ? `saison: ${p.seasonSource}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const chips = $('photo-chips');
    chips.textContent = '';
    const tagLabel = {
      mat: 'mât',
      pomo: 'pomo',
      solitaire: 'solitaire',
      campus: 'campus',
      favori: 'favori',
      nations: 'nations',
      art: 'art',
    };
    const shown = new Set(p.tags || []);
    for (const s of p.surfaces || []) {
      if (s === 'masthead') shown.add('mat');
      else shown.add(s);
    }
    if (p.permanent) shown.add('favori');
    if (p.campus) shown.add('campus');
    for (const t of shown) {
      const c = document.createElement('span');
      c.className = 'chip' + (t === 'favori' || t === 'campus' ? ' perm' : '');
      c.textContent = tagLabel[t] || t;
      chips.appendChild(c);
    }
    if (p.season) {
      const c = document.createElement('span');
      c.className = 'chip';
      c.textContent = seasonLabel(p.season);
      chips.appendChild(c);
    }
    $('status').textContent = '';
    updateCounter();
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
    $('band-desktop').style.top = `${desk.topPct}%`;
    $('band-desktop').style.height = `${desk.heightPct}%`;
    $('band-mobile').style.top = `${mob.topPct}%`;
    $('band-mobile').style.height = `${mob.heightPct}%`;
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
      const inner = document.createElement('div');
      inner.style.cssText = `width:${f.w}px;height:${f.h}px;transform:scale(${scale});transform-origin:top left;position:relative;`;
      const bg = document.createElement('div');
      bg.className = 'mini-bg';
      bg.style.backgroundImage = `url("${photoSrc(p)}")`;
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

  async function reload(preferKey) {
    const data = await api('/api/photos');
    state.photos = data.photos || [];
    renderStats(data.stats);
    renderCache(data.cache);
    if (preferKey) {
      const hit = state.photos.find((p) => p.key === preferKey);
      if (hit) state.selected = hit;
    } else if (!state.selected) {
      let stored = '';
      try {
        stored = sessionStorage.getItem(STORE_KEY) || '';
      } catch (_) {}
      const hit = stored && state.photos.find((p) => p.key === stored);
      if (hit) state.selected = hit;
    }
    applyFilters();
  }

  async function mutate(fn) {
    if (state.busy || !state.selected) return;
    state.busy = true;
    $('status').textContent = 'Enregistrement…';
    try {
      const result = await fn();
      const keep = state.selected && state.selected.key;
      await reload(keep);
      $('status').textContent = result && result.error ? result.error : 'Enregistré.';
    } catch (err) {
      $('status').textContent = err.message || String(err);
    } finally {
      state.busy = false;
    }
  }

  function selectedTags() {
    const ids = ['tag-mat', 'tag-pomo', 'tag-solitaire', 'tag-favori', 'tag-campus', 'tag-nations'];
    const out = [];
    for (const id of ids) {
      const el = $(id);
      if (el && el.checked) out.push(el.value);
    }
    return out;
  }

  function selectedSurfaces() {
    const tags = selectedTags();
    const out = [];
    if (tags.includes('mat') || tags.includes('campus')) out.push('masthead');
    if (tags.includes('pomo')) out.push('pomo');
    if (tags.includes('solitaire')) out.push('solitaire');
    return out;
  }

  function updateDirtyPill() {
    const el = $('dirty-pill');
    if (!el) return;
    el.hidden = !(state.focalDirty || state.metaDirty);
  }

  function markMetaDirty() {
    state.metaDirty = true;
    updateDirtyPill();
  }

  $('f-surface').addEventListener('change', applyFilters);
  if ($('f-tag')) $('f-tag').addEventListener('change', applyFilters);
  $('f-season').addEventListener('change', applyFilters);
  $('f-q').addEventListener('input', applyFilters);

  if ($('grid-btn')) {
    $('grid-btn').addEventListener('click', async () => {
      try {
        await persistAllIfDirty();
      } catch (err) {
        $('status').textContent = err.message || String(err);
        return;
      }
      showGrid();
    });
  }
  $('prev-btn').addEventListener('click', () => go(-1));
  $('next-btn').addEventListener('click', () => go(1));

  $('focal').addEventListener('input', () => {
    state.focalY = Number($('focal').value) / 1000;
    $('focal-val').textContent = state.focalY.toFixed(2);
    setFocalState(true);
    updateOverlays();
    renderMinis();
  });
  $('focal').addEventListener('change', () => {
    persistFocalIfDirty().then(() => {
      $('status').textContent = 'Cadrage Y enregistré.';
    }).catch((err) => {
      $('status').textContent = err.message || String(err);
    });
  });

  $('credit').addEventListener('input', () => {
    markMetaDirty();
    updateCreditPreview();
    renderMinis();
  });
  $('place').addEventListener('input', () => {
    markMetaDirty();
    updateCreditPreview();
  });
  document.querySelectorAll('input[name="season"], input[name="season6"]').forEach((el) => {
    el.addEventListener('change', markMetaDirty);
  });
  ['tag-mat', 'tag-pomo', 'tag-solitaire', 'tag-favori', 'tag-campus', 'tag-nations'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('change', () => {
      if (id === 'tag-campus' && el.checked && $('tag-mat')) $('tag-mat').checked = true;
      if (id === 'tag-nations' && $('season6-wrap')) {
        $('season6-wrap').style.display = el.checked ? '' : 'none';
      }
      markMetaDirty();
    });
  });

  $('save-meta-btn').addEventListener('click', () => {
    if (!state.selected) return;
    mutate(async () => {
      const result = await api('/api/save', formPayload());
      setFocalState(false);
      state.metaDirty = false;
      return result;
    });
  });

  $('reject-btn').addEventListener('click', () => {
    if (!state.selected) return;
    const idx = currentIndex();
    const next = state.filtered[idx + 1] || state.filtered[idx - 1];
    const nextKey = next && next.key !== state.selected.key ? next.key : null;
    mutate(async () => {
      const r = await api('/api/reject', { url: state.selected.url });
      state.selected = nextKey ? { key: nextKey } : null;
      return r;
    });
  });

  $('pin-btn').addEventListener('click', () => {
    if (!state.selected) return;
    mutate(async () => {
      const result = await api('/api/save', { ...formPayload(), permanent: true });
      setFocalState(false);
      state.metaDirty = false;
      return result;
    });
  });

  $('undo-btn').addEventListener('click', () => mutate(() => api('/api/undo', {})));

  $('full-photo').addEventListener('load', () => {
    $('crop-stage').classList.remove('is-loading', 'is-error');
    updateOverlays();
    renderMinis();
    prefetchAround();
  });
  $('full-photo').addEventListener('error', () => {
    $('crop-stage').classList.add('is-error');
    $('crop-stage').classList.remove('is-loading');
    $('load-msg').textContent = 'Photo pas encore en cache — nouvel essai dans quelques secondes.';
    const p = state.selected;
    if (!p) return;
    window.setTimeout(() => {
      if (state.selected && state.selected.key === p.key) {
        $('crop-stage').classList.add('is-loading');
        $('full-photo').src = `${photoSrc(p)}?r=${Date.now()}`;
      }
    }, 2500);
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
    setFocalState(true);
    updateOverlays();
    renderMinis();
  });
  $('crop-stage').addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    state.focalY = focalFromPointer(ev);
    $('focal').value = String(Math.round(state.focalY * 1000));
    $('focal-val').textContent = state.focalY.toFixed(2);
    setFocalState(true);
    updateOverlays();
    renderMinis();
  });
  $('crop-stage').addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    if (!state.selected) return;
    persistFocalIfDirty().then(() => {
      $('status').textContent = 'Cadrage Y enregistré.';
    }).catch((err) => {
      $('status').textContent = err.message || String(err);
    });
  });

  document.addEventListener('keydown', (ev) => {
    const tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (ev.key !== 'Escape') return;
      ev.target.blur();
      return;
    }
    if (ev.key === 'Escape' || ev.key === 'g') {
      ev.preventDefault();
      if (state.view === 'detail') $('grid-btn').click();
    } else if (ev.key === 'ArrowRight' || ev.key === 'j' || ev.key === ' ' || ev.key === 'n') {
      ev.preventDefault();
      if (state.view === 'grid' && state.filtered[0]) showDetail(state.filtered[0].key);
      else go(1);
    } else if (ev.key === 'ArrowLeft' || ev.key === 'k' || ev.key === 'b') {
      ev.preventDefault();
      go(-1);
    } else if (ev.key === 's') {
      ev.preventDefault();
      $('save-meta-btn').click();
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

  window.setInterval(() => {
    api('/api/cache').then(renderCache).catch(() => {});
  }, 2000);

  reload().catch((err) => {
    $('stats').textContent = err.message;
  });
})();

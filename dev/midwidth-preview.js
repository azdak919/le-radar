/**
 * Lab local LE-RADAR — formats d’écran + options grand écran
 * ─────────────────────────────────────────────────────────
 * Visible uniquement sur localhost / 127.0.0.1 (ou ?lab= / ?wide=).
 * Ne s’injecte pas dans l’iframe lab (`?labFrame=1`) ni en prod le-radar.ca.
 *
 * Formats : largeur iframe — 390 / 430 / 768 / 900 / 1280 / 1600 / 1920 / plein.
 * Wide : ?wide=a|b|c|d|e (layouts CSS via data-wide-preview ; bascule sans reload).
 *
 * La rangée Wide est AU-DESSUS de Format pour ne pas passer sous le dock GNOME.
 */
(function () {
  'use strict';

  const LAB_PARAM = 'lab';
  const WIDE_PARAM = 'wide';
  const FRAME_PARAM = 'labFrame';
  /** Ancien param focus-group — purgé des URL pour ne plus polluer. */
  const LEGACY_MID_PARAM = 'midwidth';

  /** Formats d’écran (largeur iframe en px). null = page pleine fenêtre. */
  const FORMATS = {
    full: { id: 'full', label: 'Plein', w: null, hint: 'Fenêtre réelle du navigateur' },
    phone: { id: 'phone', label: '390', w: 390, hint: 'Téléphone ~iPhone' },
    phablet: { id: 'phablet', label: '430', w: 430, hint: 'Grand téléphone' },
    tablet: { id: 'tablet', label: '768', w: 768, hint: 'Tablette portrait' },
    mid: { id: 'mid', label: '900', w: 900, hint: 'Demi-écran / mid' },
    desktop: { id: 'desktop', label: '1280', w: 1280, hint: 'Bureau compact (réf. actuelle)' },
    wide1600: { id: 'wide1600', label: '1600', w: 1600, hint: 'Grand bureau' },
    wide1920: { id: 'wide1920', label: '1920', w: 1920, hint: 'Full HD' },
  };

  const WIDE_OPTIONS = {
    off: { id: 'off', label: 'Off', hint: 'Prod actuelle (~1180, magazine 2 pistes)' },
    a: { id: 'a', label: 'A', hint: 'Status quo — aucune règle wide (réf.)' },
    b: { id: 'b', label: 'B', hint: 'Shell ~1480 — magazine inchangé' },
    c: { id: 'c', label: 'C', hint: 'Shell ~1560 — sources 2 rangées, suite 3 col' },
    d: { id: 'd', label: 'D', hint: 'Shell ~1680 — une 2col, en bref 2col, suite 4col' },
    e: { id: 'e', label: 'E', hint: 'Rail sources + en bref 2–3 col · super-wide ≥1680' },
  };

  function isLabFrame() {
    try {
      if (window !== window.top) return true;
      return new URL(location.href).searchParams.has(FRAME_PARAM);
    } catch {
      return true;
    }
  }

  function isLocalHost() {
    const host = location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  }

  function shouldShowBar() {
    if (isLabFrame()) return false;
    if (isLocalHost()) return true;
    try {
      const u = new URL(location.href);
      return u.searchParams.has(LAB_PARAM) || u.searchParams.has(WIDE_PARAM);
    } catch {
      return false;
    }
  }

  function currentFormat() {
    try {
      const raw = new URL(location.href).searchParams.get(LAB_PARAM);
      if (!raw || raw === '1' || raw === 'full') return 'full';
      if (FORMATS[raw]) return raw;
      const n = parseInt(raw, 10);
      if (n === 390) return 'phone';
      if (n === 430) return 'phablet';
      if (n === 768) return 'tablet';
      if (n === 900) return 'mid';
      if (n === 1280) return 'desktop';
      if (n === 1600) return 'wide1600';
      if (n === 1920) return 'wide1920';
      return 'full';
    } catch {
      return 'full';
    }
  }

  function currentWide() {
    try {
      const raw = (new URL(location.href).searchParams.get(WIDE_PARAM) || 'off')
        .toLowerCase()
        .trim();
      if (!raw || raw === '0' || raw === 'false') return 'off';
      if (WIDE_OPTIONS[raw]) return raw;
      return 'off';
    } catch {
      return 'off';
    }
  }

  function buildUrl({ format, wide }) {
    const u = new URL(location.href);
    u.searchParams.delete(FRAME_PARAM);
    u.searchParams.delete(LEGACY_MID_PARAM);
    const fmt = format === undefined ? currentFormat() : format;
    const wid = wide === undefined ? currentWide() : wide;
    if (!fmt || fmt === 'full') u.searchParams.delete(LAB_PARAM);
    else u.searchParams.set(LAB_PARAM, String(FORMATS[fmt]?.w || fmt));
    if (!wid || wid === 'off') u.searchParams.delete(WIDE_PARAM);
    else u.searchParams.set(WIDE_PARAM, wid);
    return u.pathname + u.search + u.hash;
  }

  function frameSrc() {
    const u = new URL(location.href);
    u.searchParams.set(FRAME_PARAM, '1');
    u.searchParams.delete(LEGACY_MID_PARAM);
    // L’iframe a sa propre largeur : pas de ?lab= ; garder ?wide=
    u.searchParams.delete(LAB_PARAM);
    return u.pathname + u.search + u.hash;
  }

  function navigateFormat(fmtKey) {
    location.assign(buildUrl({ format: fmtKey }));
  }

  /** Wide : pas de reload (évite la « disparition » de la barre). */
  function applyWide(wideId, { pushUrl = true } = {}) {
    const id = WIDE_OPTIONS[wideId] ? wideId : 'off';
    try {
      if (id === 'off') delete document.documentElement.dataset.widePreview;
      else document.documentElement.dataset.widePreview = id;
    } catch { /* ignore */ }

    if (pushUrl) {
      try {
        history.replaceState(null, '', buildUrl({ wide: id }));
      } catch { /* ignore */ }
    }

    // Mettre à jour les boutons + hint
    const bar = document.getElementById('local-lab-format-bar');
    if (bar) {
      bar.querySelectorAll('[data-wide-id]').forEach((btn) => {
        const active = btn.getAttribute('data-wide-id') === id;
        btn.style.cssText = wideBtnStyle(active);
      });
      const hint = bar.querySelector('[data-wide-hint]');
      if (hint) hint.textContent = WIDE_OPTIONS[id]?.hint || '';
    }

    // Badge
    paintWideBadge(id);

    // Filtres sources (app.js lit __radarWidePreview à chaque sync)
    try {
      window.dispatchEvent(new CustomEvent('radar-wide-preview-change', { detail: { id } }));
    } catch { /* ignore */ }

    // Re-sync filtres si app déjà chargé
    try {
      if (typeof window.__radarWidePreview?.onChange === 'function') {
        window.__radarWidePreview.onChange(id);
      }
    } catch { /* ignore */ }

    // Si on est en mode iframe format, recharger le frame pour appliquer wide dedans
    const frame = document.getElementById('local-lab-frame');
    if (frame && currentFormat() !== 'full') {
      frame.src = frameSrc();
    }
  }

  function paintWideBadge(id) {
    if (isLabFrame()) return;
    let badge = document.getElementById('wide-desktop-badge');
    if (!id || id === 'off') {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'wide-desktop-badge';
      document.body.appendChild(badge);
    }
    badge.dataset.wide = id;
    const opt = WIDE_OPTIONS[id];
    badge.textContent = `Wide ${opt.label} · ${(opt.hint || '').split('—')[0].trim()}`;
    badge.title = opt.hint || '';
  }

  // Dataset le plus tôt possible (host + iframe)
  try {
    const early = currentWide();
    if (early && early !== 'off') {
      document.documentElement.dataset.widePreview = early;
    } else {
      delete document.documentElement.dataset.widePreview;
    }
  } catch { /* ignore */ }

  // Ne plus activer data-midwidth-preview (A/C) — prod = verdict C.
  try {
    delete document.documentElement.dataset.midwidthPreview;
  } catch { /* ignore */ }

  // Purger ?midwidth= des signets / liens collés (une fois).
  try {
    const u = new URL(location.href);
    if (u.searchParams.has(LEGACY_MID_PARAM) && !isLabFrame()) {
      u.searchParams.delete(LEGACY_MID_PARAM);
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    }
  } catch { /* ignore */ }

  const format = currentFormat();

  function formatBtnStyle(active) {
    if (active) {
      return 'appearance:none;cursor:pointer;border-radius:999px;padding:6px 10px;font:600 11px/1 system-ui,sans-serif;border:1px solid #6c2163;background:#6c2163;color:#fff';
    }
    return 'appearance:none;cursor:pointer;border-radius:999px;padding:6px 10px;font:600 11px/1 system-ui,sans-serif;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.06);color:#e8eaed';
  }

  function wideBtnStyle(active) {
    if (active) {
      return 'appearance:none;cursor:pointer;border-radius:999px;padding:6px 10px;font:600 11px/1 system-ui,sans-serif;border:1px solid #2f6fed;background:#2f6fed;color:#fff';
    }
    return 'appearance:none;cursor:pointer;border-radius:999px;padding:6px 10px;font:600 11px/1 system-ui,sans-serif;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.06);color:#e8eaed';
  }

  function ensureFrameShell(fmtKey) {
    const fmt = FORMATS[fmtKey] || FORMATS.full;
    let shell = document.getElementById('local-lab-shell');
    let frame = document.getElementById('local-lab-frame');

    if (!fmt.w) {
      if (shell) shell.remove();
      document.documentElement.classList.remove('local-lab-framed');
      document.body?.classList.remove('local-lab-framed');
      return;
    }

    document.documentElement.classList.add('local-lab-framed');
    document.body?.classList.add('local-lab-framed');

    if (!shell) {
      shell = document.createElement('div');
      shell.id = 'local-lab-shell';
      shell.setAttribute('aria-hidden', 'true');
      frame = document.createElement('iframe');
      frame.id = 'local-lab-frame';
      frame.title = 'Prévisualisation LE-RADAR';
      frame.setAttribute('scrolling', 'yes');
      shell.appendChild(frame);
      document.body.appendChild(shell);
    }

    shell.dataset.width = String(fmt.w);
    shell.style.width = `${fmt.w}px`;
    frame.src = frameSrc();
  }

  function rowEl() {
    const row = document.createElement('div');
    row.className = 'local-lab-row';
    row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:5px;width:100%';
    return row;
  }

  function injectBar() {
    if (!shouldShowBar()) return;
    if (document.getElementById('local-lab-format-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'local-lab-format-bar';
    bar.className = 'midwidth-preview-bar local-lab-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Lab local — formats et grand écran');
    // bottom assez haut pour le dock GNOME (~60–70 px) + 2 rangées
    bar.style.cssText = [
      'position:fixed',
      'z-index:10000',
      'left:50%',
      // Dock bas + marge : la barre entière reste cliquable
      'bottom:max(72px, calc(env(safe-area-inset-bottom) + 64px))',
      'transform:translateX(-50%)',
      'display:flex',
      'flex-direction:column',
      'align-items:stretch',
      'gap:6px',
      'padding:8px 10px',
      'border-radius:14px',
      'border:1px solid rgba(255,255,255,0.14)',
      'background:rgba(18,20,24,0.96)',
      'backdrop-filter:blur(10px)',
      'box-shadow:0 10px 40px -12px rgba(0,0,0,0.55)',
      'font:600 12px/1.2 system-ui,sans-serif',
      'color:#e8eaed',
      'max-width:min(98vw,760px)',
      'pointer-events:auto',
    ].join(';');

    const wideNow = currentWide();

    // ── Rangée 1 : Wide (au-dessus, pour ne pas passer sous le dock) ──
    const wideRow = rowEl();
    wideRow.setAttribute('aria-label', 'Options grand écran');
    const tagW = document.createElement('span');
    tagW.textContent = 'Wide';
    tagW.style.cssText = 'opacity:0.55;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-right:2px;flex-shrink:0';
    wideRow.appendChild(tagW);

    Object.keys(WIDE_OPTIONS).forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = WIDE_OPTIONS[key].label;
      btn.title = WIDE_OPTIONS[key].hint;
      btn.setAttribute('data-wide-id', key);
      btn.style.cssText = wideBtnStyle(key === wideNow);
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (key === currentWide()) return;
        applyWide(key);
      });
      wideRow.appendChild(btn);
    });

    const hint = document.createElement('span');
    hint.setAttribute('data-wide-hint', '1');
    hint.style.cssText = 'opacity:0.48;font-size:10px;font-weight:500;margin-left:2px;max-width:36ch';
    hint.textContent = WIDE_OPTIONS[wideNow]?.hint || '';
    wideRow.appendChild(hint);
    bar.appendChild(wideRow);

    // ── Rangée 2 : Format ──
    const fmtRow = rowEl();
    fmtRow.setAttribute('aria-label', 'Formats d’écran');
    const tagF = document.createElement('span');
    tagF.textContent = 'Format';
    tagF.style.cssText = 'opacity:0.55;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-right:2px;flex-shrink:0';
    fmtRow.appendChild(tagF);

    Object.keys(FORMATS).forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = FORMATS[key].label;
      btn.title = FORMATS[key].hint;
      btn.style.cssText = formatBtnStyle(key === format);
      btn.addEventListener('click', () => {
        if (key === format) return;
        navigateFormat(key);
      });
      fmtRow.appendChild(btn);
    });

    const w = document.createElement('span');
    w.id = 'local-lab-format-w';
    w.style.cssText = 'opacity:0.5;font-size:10px;margin-left:4px;font-variant-numeric:tabular-nums';
    const paintW = () => {
      const fw = FORMATS[currentFormat()]?.w;
      w.textContent = fw ? `${fw}px · lab` : `${window.innerWidth}px`;
    };
    paintW();
    window.addEventListener('resize', paintW, { passive: true });
    fmtRow.appendChild(w);
    bar.appendChild(fmtRow);

    document.body.appendChild(bar);
    paintWideBadge(wideNow);

    if (format !== 'full') {
      ensureFrameShell(format);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBar);
  } else {
    injectBar();
  }

  // Hooks app.js
  window.__radarMidwidthPreview = {
    format: () => currentFormat(),
    magazineMinPx: () => 900,
  };

  window.__radarWidePreview = {
    id: () => currentWide(),
    active: () => {
      const id = currentWide();
      return id !== 'off' && id !== 'a';
    },
    filtersCollapsedRows: () => {
      const id = currentWide();
      if (id === 'e') return 99;
      if (id === 'c' || id === 'd') return 2;
      return null;
    },
    filtersColumnCount: () => {
      const id = currentWide();
      if (id === 'e') return 1;
      if (id === 'b' || id === 'c' || id === 'd') {
        try {
          if (window.innerWidth >= 1500) return 6;
          if (window.innerWidth >= 1280) return 5;
        } catch { /* ignore */ }
      }
      return null;
    },
    set: (id) => applyWide(id),
    options: () => ({ ...WIDE_OPTIONS }),
  };
})();

/**
 * Lab local LE-RADAR — formats d’écran seulement
 * ─────────────────────────────────────────────
 * Visible uniquement sur localhost / 127.0.0.1 (ou ?lab=1).
 * Ne s’injecte pas dans l’iframe lab (`?labFrame=1`) ni en prod le-radar.ca.
 *
 * Formats : largeur d’iframe — 390 / 430 / 768 / 900 / 1280 / 1600 / 1920 / plein.
 * Options grand écran : voir wide-desktop-preview.js (?wide=a…e).
 * URL : ?lab=390
 *
 * Note : les variants « Fil mid » A/C/D (focus-group midwidth-fil) sont
 * retirés de la barre — le verdict C est le comportement prod ; plus besoin
 * de les comparer en lecture quotidienne.
 */
(function () {
  'use strict';

  const LAB_PARAM = 'lab';
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
      return new URL(location.href).searchParams.has(LAB_PARAM);
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

  function buildUrl({ format }) {
    const u = new URL(location.href);
    u.searchParams.delete(FRAME_PARAM);
    u.searchParams.delete(LEGACY_MID_PARAM);
    if (!format || format === 'full') u.searchParams.delete(LAB_PARAM);
    else u.searchParams.set(LAB_PARAM, String(FORMATS[format]?.w || format));
    return u.pathname + u.search + u.hash;
  }

  function frameSrc() {
    const u = new URL(location.href);
    u.searchParams.set(FRAME_PARAM, '1');
    u.searchParams.delete(LEGACY_MID_PARAM);
    // L’iframe a sa propre largeur : pas besoin de ?lab= dans le frame
    u.searchParams.delete(LAB_PARAM);
    return u.pathname + u.search + u.hash;
  }

  function navigateTo(opts) {
    location.assign(buildUrl(opts));
  }

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

  function btnStyle(active) {
    if (active) {
      return 'appearance:none;cursor:pointer;border-radius:999px;padding:6px 10px;font:600 11px/1 system-ui,sans-serif;border:1px solid #6c2163;background:#6c2163;color:#fff';
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

  function injectBar() {
    if (!shouldShowBar()) return;
    if (document.getElementById('local-lab-format-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'local-lab-format-bar';
    // Ancien id gardé en alias pour CSS éventuel / signets CSS.
    bar.className = 'midwidth-preview-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Lab local — formats d’écran');
    bar.style.cssText = [
      'position:fixed',
      'z-index:10000',
      'left:50%',
      'bottom:max(12px, env(safe-area-inset-bottom))',
      'transform:translateX(-50%)',
      'display:flex',
      'flex-wrap:wrap',
      'align-items:center',
      'gap:5px',
      'padding:8px 10px',
      'border-radius:14px',
      'border:1px solid rgba(255,255,255,0.14)',
      'background:rgba(18,20,24,0.96)',
      'backdrop-filter:blur(10px)',
      'box-shadow:0 10px 40px -12px rgba(0,0,0,0.55)',
      'font:600 12px/1.2 system-ui,sans-serif',
      'color:#e8eaed',
      'max-width:min(98vw,720px)',
      'pointer-events:auto',
    ].join(';');

    const tagF = document.createElement('span');
    tagF.textContent = 'Format';
    tagF.style.cssText = 'opacity:0.55;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-right:2px';
    bar.appendChild(tagF);

    Object.keys(FORMATS).forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = FORMATS[key].label;
      btn.title = FORMATS[key].hint;
      btn.style.cssText = btnStyle(key === format);
      btn.addEventListener('click', () => {
        if (key === format) return;
        navigateTo({ format: key });
      });
      bar.appendChild(btn);
    });

    const w = document.createElement('span');
    w.id = 'local-lab-format-w';
    w.style.cssText = 'opacity:0.5;font-size:10px;margin-left:4px;font-variant-numeric:tabular-nums';
    const paintW = () => {
      const fw = FORMATS[format]?.w;
      w.textContent = fw ? `${fw}px · lab` : `${window.innerWidth}px`;
    };
    paintW();
    window.addEventListener('resize', paintW, { passive: true });
    bar.appendChild(w);

    document.body.appendChild(bar);

    if (format !== 'full') {
      ensureFrameShell(format);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBar);
  } else {
    injectBar();
  }

  // Hook minimal pour app.js (magazine mid prod dès 900 px).
  window.__radarMidwidthPreview = {
    format: () => currentFormat(),
    magazineMinPx: () => 900,
  };
})();

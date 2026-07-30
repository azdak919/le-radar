/**
 * Prévisualisation locale A / C / D — focus-group midwidth fil.
 * Usage : ?midwidth=A | ?midwidth=C | (absent = D status quo)
 * Barre flottante sur localhost / 127.0.0.1 / ?midwidth=
 */
(function () {
  'use strict';

  const PARAM = 'midwidth';
  const MODES = {
    D: { id: 'D', label: 'D · Actuel', hint: 'Status quo · magazine ≥1100' },
    A: { id: 'A', label: 'A · Densité', hint: 'Dissidence · 1 col densifiée ≤1099' },
    C: { id: 'C', label: 'C · Hybride', hint: 'Verdict · densify + magazine mid ≥900' },
  };

  function currentMode() {
    try {
      const raw = new URL(location.href).searchParams.get(PARAM);
      if (!raw) return 'D';
      const m = String(raw).toUpperCase();
      return MODES[m] ? m : 'D';
    } catch {
      return 'D';
    }
  }

  function applyMode(mode) {
    const m = MODES[mode] ? mode : 'D';
    if (m === 'D') {
      delete document.documentElement.dataset.midwidthPreview;
    } else {
      document.documentElement.dataset.midwidthPreview = m;
    }
    return m;
  }

  function navigateTo(mode) {
    const u = new URL(location.href);
    if (mode === 'D') u.searchParams.delete(PARAM);
    else u.searchParams.set(PARAM, mode);
    // Rechargement : reconstruit hero/brief + canBalanceMagazineColumns.
    location.assign(u.pathname + u.search + u.hash);
  }

  function shouldShowBar() {
    const host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
    try {
      return new URL(location.href).searchParams.has(PARAM);
    } catch {
      return false;
    }
  }

  // Appliquer tôt (avant paint si script en head) + après DOM.
  const mode = applyMode(currentMode());

  function injectBar() {
    if (!shouldShowBar()) return;
    if (document.getElementById('midwidth-preview-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'midwidth-preview-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Prévisualisation largeurs médianes');
    bar.style.cssText = [
      'position:fixed',
      'z-index:9999',
      'left:50%',
      'bottom:max(12px, env(safe-area-inset-bottom))',
      'transform:translateX(-50%)',
      'display:flex',
      'flex-wrap:wrap',
      'align-items:center',
      'gap:6px',
      'padding:8px 10px',
      'border-radius:12px',
      'border:1px solid rgba(255,255,255,0.14)',
      'background:rgba(18,20,24,0.94)',
      'backdrop-filter:blur(10px)',
      'box-shadow:0 10px 40px -12px rgba(0,0,0,0.55)',
      'font:600 12px/1.2 system-ui,sans-serif',
      'color:#e8eaed',
      'max-width:min(96vw,520px)',
    ].join(';');

    const tag = document.createElement('span');
    tag.textContent = 'Midwidth';
    tag.style.cssText = 'opacity:0.55;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-right:4px';
    bar.appendChild(tag);

    Object.keys(MODES).forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = MODES[key].label;
      btn.title = MODES[key].hint;
      const active = key === mode;
      btn.style.cssText = [
        'appearance:none',
        'cursor:pointer',
        'border-radius:999px',
        'padding:7px 11px',
        'font:600 11.5px/1 system-ui,sans-serif',
        active
          ? 'border:1px solid #c8102e;background:#c8102e;color:#fff'
          : 'border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.06);color:#e8eaed',
      ].join(';');
      btn.addEventListener('click', () => {
        if (key === mode) return;
        navigateTo(key);
      });
      bar.appendChild(btn);
    });

    const w = document.createElement('span');
    w.id = 'midwidth-preview-w';
    w.style.cssText = 'opacity:0.5;font-size:10px;margin-left:4px;font-variant-numeric:tabular-nums';
    const paintW = () => {
      w.textContent = `${window.innerWidth}px`;
    };
    paintW();
    window.addEventListener('resize', paintW, { passive: true });
    bar.appendChild(w);

    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBar);
  } else {
    injectBar();
  }

  // Hook pour app.js (balance magazine dès 900 en mode C).
  window.__radarMidwidthPreview = {
    mode: () => currentMode(),
    // Prod = C (magazine ≥900). A = densify 1 col (balance off via app.js).
    // D = même seuil prod (900) pour ne pas régresser le demi-écran.
    magazineMinPx: () => (currentMode() === 'A' ? 1100 : 900),
  };
})();

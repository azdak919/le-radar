/**
 * Lab local LE-RADAR — formats d’écran + variants midwidth fil
 * ─────────────────────────────────────────────────────────────
 * Visible uniquement sur localhost / 127.0.0.1 (ou ?midwidth= / ?lab=1).
 * Ne s’injecte pas dans l’iframe lab (`?labFrame=1`) ni en prod le-radar.ca.
 *
 * Formats : largeur d’iframe (media queries réelles) — 390 / 768 / 900 / 1280 / plein.
 * Midwidth : focus-group midwidth-fil — D actuel · A densifié · C hybride.
 *
 * URL : ?lab=390&midwidth=C
 */
(function () {
  'use strict';

  const MID_PARAM = 'midwidth';
  const LAB_PARAM = 'lab';
  const FRAME_PARAM = 'labFrame';

  const MID_MODES = {
    D: { id: 'D', label: 'D · Actuel', hint: 'Status quo · magazine ≥1100' },
    A: { id: 'A', label: 'A · Densité', hint: '1 col densifiée ≤1099' },
    C: { id: 'C', label: 'C · Hybride', hint: 'Verdict · densify + magazine mid ≥900' },
  };

  /** Formats d’écran (largeur iframe en px). null = page pleine fenêtre. */
  const FORMATS = {
    full: { id: 'full', label: 'Plein', w: null, hint: 'Fenêtre réelle du navigateur' },
    phone: { id: 'phone', label: '390', w: 390, hint: 'Téléphone ~iPhone' },
    phablet: { id: 'phablet', label: '430', w: 430, hint: 'Grand téléphone' },
    tablet: { id: 'tablet', label: '768', w: 768, hint: 'Tablette portrait' },
    mid: { id: 'mid', label: '900', w: 900, hint: 'Demi-écran / mid' },
    desktop: { id: 'desktop', label: '1280', w: 1280, hint: 'Bureau compact' },
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
      return u.searchParams.has(MID_PARAM) || u.searchParams.has(LAB_PARAM);
    } catch {
      return false;
    }
  }

  function currentMid() {
    try {
      const raw = new URL(location.href).searchParams.get(MID_PARAM);
      if (!raw) return 'D';
      const m = String(raw).toUpperCase();
      return MID_MODES[m] ? m : 'D';
    } catch {
      return 'D';
    }
  }

  function currentFormat() {
    try {
      const raw = new URL(location.href).searchParams.get(LAB_PARAM);
      if (!raw || raw === '1' || raw === 'full') return 'full';
      // allow ?lab=390 or ?lab=phone
      if (FORMATS[raw]) return raw;
      const n = parseInt(raw, 10);
      if (n === 390) return 'phone';
      if (n === 430) return 'phablet';
      if (n === 768) return 'tablet';
      if (n === 900) return 'mid';
      if (n === 1280) return 'desktop';
      return 'full';
    } catch {
      return 'full';
    }
  }

  function applyMidMode(mode) {
    const m = MID_MODES[mode] ? mode : 'D';
    if (m === 'D') delete document.documentElement.dataset.midwidthPreview;
    else document.documentElement.dataset.midwidthPreview = m;
    return m;
  }

  function buildUrl({ format, mid }) {
    const u = new URL(location.href);
    u.searchParams.delete(FRAME_PARAM);
    if (!mid || mid === 'D') u.searchParams.delete(MID_PARAM);
    else u.searchParams.set(MID_PARAM, mid);
    if (!format || format === 'full') u.searchParams.delete(LAB_PARAM);
    else u.searchParams.set(LAB_PARAM, String(FORMATS[format]?.w || format));
    return u.pathname + u.search + u.hash;
  }

  function frameSrc({ format, mid }) {
    const u = new URL(location.href);
    u.searchParams.set(FRAME_PARAM, '1');
    if (!mid || mid === 'D') u.searchParams.delete(MID_PARAM);
    else u.searchParams.set(MID_PARAM, mid);
    // L’iframe a sa propre largeur : pas besoin de ?lab= dans le frame
    u.searchParams.delete(LAB_PARAM);
    return u.pathname + u.search + u.hash;
  }

  function navigateTo(opts) {
    location.assign(buildUrl(opts));
  }

  // Appliquer le mode midwidth sur la page courante (plein écran ou frame).
  const mid = applyMidMode(currentMid());
  const format = currentFormat();

  function btnStyle(active, accent) {
    if (active && accent === 'red') {
      return 'appearance:none;cursor:pointer;border-radius:999px;padding:6px 10px;font:600 11px/1 system-ui,sans-serif;border:1px solid #c8102e;background:#c8102e;color:#fff';
    }
    if (active) {
      return 'appearance:none;cursor:pointer;border-radius:999px;padding:6px 10px;font:600 11px/1 system-ui,sans-serif;border:1px solid #6c2163;background:#6c2163;color:#fff';
    }
    return 'appearance:none;cursor:pointer;border-radius:999px;padding:6px 10px;font:600 11px/1 system-ui,sans-serif;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.06);color:#e8eaed';
  }

  function ensureFrameShell(fmtKey, midKey) {
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
    frame.src = frameSrc({ format: fmtKey, mid: midKey });
  }

  function injectBar() {
    if (!shouldShowBar()) return;
    if (document.getElementById('midwidth-preview-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'midwidth-preview-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Lab local — formats et midwidth');
    bar.style.cssText = [
      'position:fixed',
      'z-index:10000',
      'left:50%',
      'bottom:max(12px, env(safe-area-inset-bottom))',
      'transform:translateX(-50%)',
      'display:flex',
      'flex-direction:column',
      'gap:6px',
      'padding:8px 10px',
      'border-radius:14px',
      'border:1px solid rgba(255,255,255,0.14)',
      'background:rgba(18,20,24,0.96)',
      'backdrop-filter:blur(10px)',
      'box-shadow:0 10px 40px -12px rgba(0,0,0,0.55)',
      'font:600 12px/1.2 system-ui,sans-serif',
      'color:#e8eaed',
      'max-width:min(98vw,640px)',
      'pointer-events:auto',
    ].join(';');

    // ── Ligne formats ──────────────────────────────────────────────
    const rowFmt = document.createElement('div');
    rowFmt.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:5px';
    const tagF = document.createElement('span');
    tagF.textContent = 'Format';
    tagF.style.cssText = 'opacity:0.55;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-right:2px';
    rowFmt.appendChild(tagF);

    Object.keys(FORMATS).forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = FORMATS[key].label;
      btn.title = FORMATS[key].hint;
      btn.style.cssText = btnStyle(key === format, 'purple');
      btn.addEventListener('click', () => {
        if (key === format) return;
        navigateTo({ format: key, mid });
      });
      rowFmt.appendChild(btn);
    });

    const w = document.createElement('span');
    w.id = 'midwidth-preview-w';
    w.style.cssText = 'opacity:0.5;font-size:10px;margin-left:4px;font-variant-numeric:tabular-nums';
    const paintW = () => {
      const fw = FORMATS[format]?.w;
      w.textContent = fw ? `${fw}px · lab` : `${window.innerWidth}px`;
    };
    paintW();
    window.addEventListener('resize', paintW, { passive: true });
    rowFmt.appendChild(w);
    bar.appendChild(rowFmt);

    // ── Ligne midwidth fil ─────────────────────────────────────────
    const rowMid = document.createElement('div');
    rowMid.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:5px';
    const tagM = document.createElement('span');
    tagM.textContent = 'Fil mid';
    tagM.style.cssText = 'opacity:0.55;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-right:2px';
    rowMid.appendChild(tagM);

    Object.keys(MID_MODES).forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = MID_MODES[key].label;
      btn.title = MID_MODES[key].hint;
      btn.style.cssText = btnStyle(key === mid, 'red');
      btn.addEventListener('click', () => {
        if (key === mid) return;
        navigateTo({ format, mid: key });
      });
      rowMid.appendChild(btn);
    });
    bar.appendChild(rowMid);

    document.body.appendChild(bar);

    // Shell iframe si format ≠ plein
    if (format !== 'full') {
      ensureFrameShell(format, mid);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBar);
  } else {
    injectBar();
  }

  // Hook pour app.js (balance magazine dès 900 en mode C).
  window.__radarMidwidthPreview = {
    mode: () => currentMid(),
    format: () => currentFormat(),
    magazineMinPx: () => (currentMid() === 'A' ? 1100 : 900),
  };
})();

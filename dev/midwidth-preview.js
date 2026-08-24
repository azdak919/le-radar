/**
 * Lab local LE-RADAR — formats d’écran + options grand écran
 * ─────────────────────────────────────────────────────────
 * Visible uniquement sur localhost / 127.0.0.1.
 * Ne s’injecte pas dans l’iframe lab (`?labFrame=1`) ni en prod le-radar.ca.
 *
 * Prod / main : E s’active tout seul dès 1281 px (aucun ?wide=).
 * `?wide=off` = témoin de l’ancien shell ~1180 (lab seulement).
 *
 * Formats : largeurs iframe (media queries réelles). Si > écran hôte, scale
 * proportionnel pour simuler QHD / 4K / UW sans moniteur physique.
 */
(function () {
  'use strict';

  const LAB_PARAM = 'lab';
  const WIDE_PARAM = 'wide';
  const FRAME_PARAM = 'labFrame';
  /** Ancien param focus-group — purgé des URL pour ne plus polluer. */
  const LEGACY_MID_PARAM = 'midwidth';

  /**
   * Formats d’écran (largeur CSS / layout, pas device-pixel-ratio).
   * Grandes tailles = marché grand public / moniteurs courants, pas niche 5K/8K.
   * null = page pleine fenêtre hôte.
   */
  const FORMATS = {
    full: { id: 'full', label: 'Plein', w: null, hint: 'Fenêtre réelle du navigateur', group: 'base' },
    phone: { id: 'phone', label: '390', w: 390, hint: 'Téléphone ~iPhone', group: 'base' },
    phablet: { id: 'phablet', label: '430', w: 430, hint: 'Grand téléphone', group: 'base' },
    tablet: { id: 'tablet', label: '768', w: 768, hint: 'Tablette portrait', group: 'base' },
    mid: { id: 'mid', label: '900', w: 900, hint: 'Demi-écran / mid', group: 'base' },
    desktop: { id: 'desktop', label: '1280', w: 1280, hint: 'Bureau compact (réf. LE-RADAR actuelle)', group: 'base' },
    wide1440: { id: 'wide1440', label: '1440', w: 1440, hint: 'Laptop courant / fenêtre large', group: 'large' },
    wide1600: { id: 'wide1600', label: '1600', w: 1600, hint: 'Grand bureau / laptop 16:10', group: 'large' },
    wide1920: { id: 'wide1920', label: '1920', w: 1920, hint: 'Full HD — moniteur le plus vendu', group: 'large' },
    qhd: { id: 'qhd', label: '2560', w: 2560, hint: 'QHD 1440p — moniteurs 27″ courants (scale si besoin)', group: 'large' },
    ultrawide: { id: 'ultrawide', label: '3440', w: 3440, hint: 'Ultrawide 34″ 3440×1440 (scale si besoin)', group: 'large' },
    uhd: { id: 'uhd', label: '3840', w: 3840, hint: '4K UHD — moniteurs 27–32″ (scale si besoin)', group: 'large' },
  };

  /** Ordre d’affichage barre lab (base + grands moniteurs marché). */
  const FORMAT_ORDER_BASE = ['full', 'phone', 'phablet', 'tablet', 'mid', 'desktop'];
  const FORMAT_ORDER_LARGE = ['wide1440', 'wide1600', 'wide1920', 'qhd', 'ultrawide', 'uhd'];

  /** Largeur → clé (parse ?lab=2560). */
  const WIDTH_TO_FORMAT = {
    390: 'phone',
    430: 'phablet',
    768: 'tablet',
    900: 'mid',
    1280: 'desktop',
    1440: 'wide1440',
    1600: 'wide1600',
    1920: 'wide1920',
    2560: 'qhd',
    3440: 'ultrawide',
    3840: 'uhd',
  };

  /* Verdict mainteneur : E seulement (A–D retirés de la barre lab). */
  const WIDE_OPTIONS = {
    off: { id: 'off', label: '1180', hint: 'Ancien shell ~1180 — témoin lab' },
    e: { id: 'e', label: 'Auto', hint: 'Défaut prod : E dès 1281, densités 1440/1920/2560…' },
  };

  /** E uniquement au-delà de la ref. bureau 1280 (format lab ou viewport). */
  const WIDE_E_MIN_PX = 1281;

  function formatWidthPx(fmtKey) {
    const f = FORMATS[fmtKey || currentFormat()];
    if (f && f.w != null) return f.w;
    return window.innerWidth || 0;
  }

  /** true si la largeur de layout autorise wide E. */
  function canApplyWideE(fmtKey) {
    const fmt = fmtKey || currentFormat();
    const f = FORMATS[fmt];
    // Format lab chiffré (390…1280…) : largeur simulée, pas la fenêtre hôte
    if (f && f.w != null) return f.w >= WIDE_E_MIN_PX;
    try {
      return window.matchMedia(`(min-width: ${WIDE_E_MIN_PX}px)`).matches;
    } catch {
      return (window.innerWidth || 0) >= WIDE_E_MIN_PX;
    }
  }

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
    return isLocalHost();
  }

  function currentFormat() {
    try {
      const raw = new URL(location.href).searchParams.get(LAB_PARAM);
      if (!raw || raw === '1' || raw === 'full') return 'full';
      if (FORMATS[raw]) return raw;
      const n = parseInt(raw, 10);
      if (WIDTH_TO_FORMAT[n]) return WIDTH_TO_FORMAT[n];
      return 'full';
    } catch {
      return 'full';
    }
  }

  /** Scale pour faire tenir une largeur simulée dans la fenêtre hôte. */
  function shellScaleFor(targetW) {
    const hostW = Math.max(320, window.innerWidth || 1920);
    // Marge minime ; on veut maximiser la surface utile.
    return Math.min(1, hostW / targetW);
  }

  function currentWide() {
    try {
      const raw = (new URL(location.href).searchParams.get(WIDE_PARAM) || '')
        .toLowerCase()
        .trim();
      if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'prod') return 'off';
      if (raw === 'b' || raw === 'c' || raw === 'd') return raw;
      return 'e';
    } catch {
      return 'e';
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
    if (!wid || wid === 'e') u.searchParams.delete(WIDE_PARAM);
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
    let id = WIDE_OPTIONS[wideId] ? wideId : 'off';
    // ≤1280 : E refusé — on peut garder ?wide=e dans l’URL pour y revenir
    // après un format large, mais le dataset n’est jamais posé.
    const allowed = canApplyWideE();
    const effective = (id !== 'off' && allowed) ? id : 'off';

    try {
      if (effective === 'off') delete document.documentElement.dataset.widePreview;
      else document.documentElement.dataset.widePreview = effective;
    } catch { /* ignore */ }

    if (pushUrl) {
      try {
        // Préférence URL : on mémorise le choix demandé (e), pas l’effective off
        history.replaceState(null, '', buildUrl({ wide: id }));
      } catch { /* ignore */ }
    }

    // Mettre à jour les boutons + hint
    const bar = document.getElementById('local-lab-format-bar');
    if (bar) {
      bar.querySelectorAll('[data-wide-id]').forEach((btn) => {
        const wid = btn.getAttribute('data-wide-id');
        const isE = wid === 'e';
        const locked = isE && !allowed;
        // Actif = choix URL si autorisé ; Prod actif si E bloqué
        const active = allowed
          ? wid === id
          : wid === 'off';
        btn.style.cssText = wideBtnStyle(active, locked);
        btn.disabled = locked;
        btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
        if (locked) {
          btn.title = 'E disponible seulement en >1280 (formats 1440+ ou fenêtre large)';
        } else {
          btn.title = WIDE_OPTIONS[wid]?.hint || '';
        }
      });
      const hint = bar.querySelector('[data-wide-hint]');
      if (hint) {
        if (!allowed && id === 'e') {
          hint.textContent = 'E inactif ≤1280 — passe en 1440+ ou Plein large pour l’activer';
        } else {
          hint.textContent = WIDE_OPTIONS[id]?.hint || '';
        }
      }
    }

    removeWideBadge();

    // Filtres sources (app.js lit __radarWidePreview à chaque sync)
    try {
      window.dispatchEvent(new CustomEvent('radar-wide-preview-change', {
        detail: { id: effective, requested: id, allowed },
      }));
    } catch { /* ignore */ }

    // Re-sync filtres si app déjà chargé
    try {
      if (typeof window.__radarWidePreview?.onChange === 'function') {
        window.__radarWidePreview.onChange(effective);
      }
    } catch { /* ignore */ }

    // Si on est en mode iframe format, recharger le frame pour appliquer wide dedans
    const frame = document.getElementById('local-lab-frame');
    if (frame && currentFormat() !== 'full') {
      frame.src = frameSrc();
    }
  }

  function removeWideBadge() {
    document.getElementById('wide-desktop-badge')?.remove();
  }

  // Dataset le plus tôt possible (host + iframe)
  // ⛔ ≤1280 : jamais de data-wide-preview
  try {
    const early = currentWide();
    if (early && early !== 'off' && canApplyWideE()) {
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

  function wideBtnStyle(active, locked) {
    if (locked) {
      return 'appearance:none;cursor:not-allowed;border-radius:999px;padding:6px 10px;font:600 11px/1 system-ui,sans-serif;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:rgba(232,234,237,0.35)';
    }
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
      window.removeEventListener('resize', onHostResizeForShell);
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

    layoutShell(shell, frame, fmt.w);
    // Ne recharger l’iframe que si la src utile a changé (évite flash au resize).
    const nextSrc = frameSrc();
    if (frame.dataset.labSrc !== nextSrc) {
      frame.dataset.labSrc = nextSrc;
      frame.src = nextSrc;
    }
    window.removeEventListener('resize', onHostResizeForShell);
    window.addEventListener('resize', onHostResizeForShell, { passive: true });
  }

  function layoutShell(shell, frame, targetW) {
    const scale = shellScaleFor(targetW);
    const hostH = Math.max(400, window.innerHeight || 900);
    // Largeur logique = targetW → media queries dans l’iframe voient la vraie largeur.
    // Scale CSS pour que ça tienne sur un 1080p physique.
    shell.dataset.width = String(targetW);
    shell.dataset.scale = scale.toFixed(3);
    shell.style.width = `${targetW}px`;
    shell.style.maxWidth = 'none';
    shell.style.height = `${Math.round(hostH / scale)}px`;
    shell.style.top = '0';
    shell.style.bottom = 'auto';
    shell.style.left = '50%';
    shell.style.transform = `translateX(-50%) scale(${scale})`;
    shell.style.transformOrigin = 'top center';
    if (frame) {
      frame.style.width = '100%';
      frame.style.height = '100%';
    }
    paintFormatWidthLabel();
  }

  function onHostResizeForShell() {
    const shell = document.getElementById('local-lab-shell');
    const frame = document.getElementById('local-lab-frame');
    const fmt = FORMATS[currentFormat()];
    if (!shell || !fmt?.w) return;
    layoutShell(shell, frame, fmt.w);
  }

  function paintFormatWidthLabel() {
    const w = document.getElementById('local-lab-format-w');
    if (!w) return;
    const key = currentFormat();
    const fw = FORMATS[key]?.w;
    if (!fw) {
      w.textContent = `${window.innerWidth}px`;
      w.title = 'Largeur fenêtre réelle';
      return;
    }
    const scale = shellScaleFor(fw);
    const pct = Math.round(scale * 100);
    const tag = FORMATS[key]?.label || fw;
    if (scale < 0.999) {
      w.textContent = `${fw}px · ×${pct}%`;
      w.title = `Simulation ${fw}px (media queries) — affichée à ${pct}% pour tenir dans ta fenêtre`;
    } else {
      w.textContent = `${fw}px · 1:1`;
      w.title = FORMATS[key]?.hint || `${fw}px`;
    }
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
    // 3 rangées + dock GNOME : remonter la barre
    bar.style.cssText = [
      'position:fixed',
      'z-index:10000',
      'left:50%',
      'bottom:max(80px, calc(env(safe-area-inset-bottom) + 72px))',
      'transform:translateX(-50%)',
      'display:flex',
      'flex-direction:column',
      'align-items:stretch',
      'gap:5px',
      'padding:8px 10px',
      'border-radius:14px',
      'border:1px solid rgba(255,255,255,0.14)',
      'background:rgba(18,20,24,0.96)',
      'backdrop-filter:blur(10px)',
      'box-shadow:0 10px 40px -12px rgba(0,0,0,0.55)',
      'font:600 12px/1.2 system-ui,sans-serif',
      'color:#e8eaed',
      'max-width:min(98vw,960px)',
      'pointer-events:auto',
    ].join(';');

    const wideNow = currentWide();
    const tagStyle = 'opacity:0.55;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-right:2px;flex-shrink:0';

    function appendFormatButtons(row, keys) {
      keys.forEach((key) => {
        const meta = FORMATS[key];
        if (!meta) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = meta.label;
        btn.title = meta.hint;
        btn.setAttribute('data-format-id', key);
        btn.style.cssText = formatBtnStyle(key === format);
        btn.addEventListener('click', () => {
          if (key === currentFormat()) return;
          navigateFormat(key);
        });
        row.appendChild(btn);
      });
    }

    // ── Rangée 1 : formats de base (plein → 1280) ──
    const fmtBase = rowEl();
    fmtBase.setAttribute('aria-label', 'Formats téléphone à bureau');
    const home = document.createElement('a');
    home.href = '/dev/';
    home.textContent = 'Tableau';
    home.title = 'Tableau de bord';
    home.style.cssText = formatBtnStyle(false) + ';text-decoration:none;display:inline-flex;align-items:center;margin-right:6px';
    fmtBase.appendChild(home);
    const tagB = document.createElement('span');
    tagB.textContent = 'Base';
    tagB.style.cssText = tagStyle;
    fmtBase.appendChild(tagB);
    appendFormatButtons(fmtBase, FORMAT_ORDER_BASE);
    bar.appendChild(fmtBase);

    // ── Rangée 2 : grands moniteurs marché (+ scale auto si > écran hôte) ──
    const fmtLarge = rowEl();
    fmtLarge.setAttribute('aria-label', 'Formats grands moniteurs');
    const tagL = document.createElement('span');
    tagL.textContent = 'Grand';
    tagL.style.cssText = tagStyle;
    fmtLarge.appendChild(tagL);
    appendFormatButtons(fmtLarge, FORMAT_ORDER_LARGE);

    const w = document.createElement('span');
    w.id = 'local-lab-format-w';
    w.style.cssText = 'opacity:0.55;font-size:10px;margin-left:4px;font-variant-numeric:tabular-nums;max-width:32ch';
    paintFormatWidthLabel();
    window.addEventListener('resize', paintFormatWidthLabel, { passive: true });
    fmtLarge.appendChild(w);
    bar.appendChild(fmtLarge);

    document.body.appendChild(bar);
    // Applique le gating ≤1280 (dataset + boutons + badge)
    applyWide(wideNow, { pushUrl: false });

    if (format !== 'full') {
      ensureFrameShell(format);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBar);
  } else {
    injectBar();
  }

  // Plein écran : bascule E actif/inactif au franchissement de 1281 px
  window.addEventListener('resize', () => {
    if (currentFormat() !== 'full') return;
    if (currentWide() !== 'e') return;
    try {
      applyWide('e', { pushUrl: false });
    } catch { /* ignore */ }
  }, { passive: true });

  // Hooks app.js
  window.__radarMidwidthPreview = {
    format: () => currentFormat(),
    magazineMinPx: () => 768,
  };

  window.__radarWidePreview = {
    id: () => (canApplyWideE() && currentWide() !== 'off' ? currentWide() : 'off'),
    active: () => canApplyWideE() && currentWide() === 'e',
    allowed: () => canApplyWideE(),
    filtersCollapsedRows: () => {
      if (!canApplyWideE()) return null;
      const id = currentWide();
      if (id === 'e') return 99;
      if (id === 'c' || id === 'd') return 2;
      return null;
    },
    filtersColumnCount: () => {
      if (!canApplyWideE()) return null;
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

/**
 * Lab local LE-RADAR — options grand écran (pré-focus-group)
 * ─────────────────────────────────────────────────────────
 * Visible uniquement sur localhost / 127.0.0.1 (ou ?lab= / ?wide=).
 * Ne s’injecte pas dans l’iframe lab (`?labFrame=1`) ni en prod.
 *
 * URL : ?wide=a|b|c|d|e   (off = absents / wide=off)
 * Combinable avec le lab formats : ?lab=1920&wide=c
 *
 * A status quo · B shell large · C densité · D grille presse · E rail sources
 * Radio : gelée en CSS (1180) pour B–E.
 */
(function () {
  'use strict';

  const WIDE_PARAM = 'wide';
  const FRAME_PARAM = 'labFrame';
  const LAB_PARAM = 'lab';

  const OPTIONS = {
    off: {
      id: 'off',
      label: 'Off',
      hint: 'Prod actuelle (~1180, magazine 2 pistes)',
    },
    a: {
      id: 'a',
      label: 'A',
      hint: 'Status quo — aucune règle wide (réf. visuelle)',
    },
    b: {
      id: 'b',
      label: 'B',
      hint: 'Shell ~1480 — magazine inchangé, + place mât',
    },
    c: {
      id: 'c',
      label: 'C',
      hint: 'Shell ~1560 — sources 2 rangées, suite 3 col, magazine élargi',
    },
    d: {
      id: 'd',
      label: 'D',
      hint: 'Shell ~1680 — une 2col, en bref 2col, suite 4col',
    },
    e: {
      id: 'e',
      label: 'E',
      hint: 'Shell ~1760 — sources rail gauche sticky, fil 3 col suite',
    },
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

  function shouldEnable() {
    if (isLabFrame()) {
      // Dans l’iframe : appliquer le CSS wide, pas la barre (barre = hôte).
      return true;
    }
    if (isLocalHost()) return true;
    try {
      const u = new URL(location.href);
      return u.searchParams.has(LAB_PARAM) || u.searchParams.has(WIDE_PARAM);
    } catch {
      return false;
    }
  }

  function currentWide() {
    try {
      const raw = (new URL(location.href).searchParams.get(WIDE_PARAM) || 'off')
        .toLowerCase()
        .trim();
      if (!raw || raw === '0' || raw === 'false') return 'off';
      if (OPTIONS[raw]) return raw;
      return 'off';
    } catch {
      return 'off';
    }
  }

  function isWideActive() {
    const id = currentWide();
    return id !== 'off' && id !== 'a';
  }

  function applyDataset() {
    const id = currentWide();
    try {
      if (id === 'off') {
        delete document.documentElement.dataset.widePreview;
      } else {
        document.documentElement.dataset.widePreview = id;
      }
    } catch { /* ignore */ }
  }

  function buildUrl(wideId) {
    const u = new URL(location.href);
    if (!wideId || wideId === 'off') u.searchParams.delete(WIDE_PARAM);
    else u.searchParams.set(WIDE_PARAM, wideId);
    return u.pathname + u.search + u.hash;
  }

  function navigateTo(wideId) {
    location.assign(buildUrl(wideId));
  }

  function btnStyle(active) {
    if (active) {
      return 'appearance:none;cursor:pointer;border-radius:999px;padding:6px 10px;font:600 11px/1 system-ui,sans-serif;border:1px solid #2f6fed;background:#2f6fed;color:#fff';
    }
    return 'appearance:none;cursor:pointer;border-radius:999px;padding:6px 10px;font:600 11px/1 system-ui,sans-serif;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.06);color:#e8eaed';
  }

  function injectBadge() {
    if (isLabFrame()) return;
    const id = currentWide();
    let badge = document.getElementById('wide-desktop-badge');
    if (id === 'off') {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'wide-desktop-badge';
      document.body.appendChild(badge);
    }
    badge.dataset.wide = id;
    const opt = OPTIONS[id];
    badge.textContent = `Wide ${opt.label} · ${opt.hint.split('—')[0].trim()}`;
    badge.title = opt.hint;
  }

  function injectWideRow(bar) {
    if (bar.querySelector('.wide-lab-row')) return;

    bar.classList.add('wide-lab-bar');

    // Envelopper la rangée Format existante si besoin
    if (!bar.querySelector('.format-lab-row')) {
      const kids = [...bar.childNodes];
      const formatRow = document.createElement('div');
      formatRow.className = 'wide-lab-row format-lab-row';
      kids.forEach((n) => formatRow.appendChild(n));
      bar.appendChild(formatRow);
    }

    const row = document.createElement('div');
    row.className = 'wide-lab-row';
    row.setAttribute('aria-label', 'Options grand écran');

    const tag = document.createElement('span');
    tag.textContent = 'Wide';
    tag.style.cssText = 'opacity:0.55;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-right:2px';
    row.appendChild(tag);

    const active = currentWide();
    Object.keys(OPTIONS).forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = OPTIONS[key].label;
      btn.title = OPTIONS[key].hint;
      btn.style.cssText = btnStyle(key === active);
      btn.addEventListener('click', () => {
        if (key === active) return;
        navigateTo(key);
      });
      row.appendChild(btn);
    });

    const hint = document.createElement('span');
    hint.className = 'wide-lab-hint';
    hint.textContent = OPTIONS[active]?.hint || '';
    row.appendChild(hint);

    bar.appendChild(row);
  }

  function tryAttachToFormatBar() {
    if (isLabFrame()) return false;
    if (!isLocalHost() && !new URL(location.href).searchParams.has(LAB_PARAM)
      && !new URL(location.href).searchParams.has(WIDE_PARAM)) {
      // même règle que le lab formats
    }
    if (!isLocalHost()) {
      try {
        const u = new URL(location.href);
        if (!u.searchParams.has(LAB_PARAM) && !u.searchParams.has(WIDE_PARAM)) return false;
      } catch {
        return false;
      }
    }

    const bar = document.getElementById('local-lab-format-bar')
      || document.getElementById('midwidth-preview-bar');
    if (!bar) return false;
    injectWideRow(bar);
    return true;
  }

  function injectStandaloneBar() {
    if (isLabFrame()) return;
    if (document.getElementById('wide-desktop-bar')) return;
    if (!isLocalHost()) {
      try {
        if (!new URL(location.href).searchParams.has(WIDE_PARAM)) return;
      } catch {
        return;
      }
    }

    const bar = document.createElement('div');
    bar.id = 'wide-desktop-bar';
    bar.className = 'wide-lab-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Lab local — grand écran');
    bar.style.cssText = [
      'position:fixed',
      'z-index:10000',
      'left:50%',
      'bottom:max(56px, calc(env(safe-area-inset-bottom) + 52px))',
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
      'max-width:min(98vw,720px)',
      'pointer-events:auto',
    ].join(';');

    const row = document.createElement('div');
    row.className = 'wide-lab-row';
    row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:5px';

    const tag = document.createElement('span');
    tag.textContent = 'Wide';
    tag.style.cssText = 'opacity:0.55;font-size:10px;letter-spacing:0.08em;text-transform:uppercase';
    row.appendChild(tag);

    const active = currentWide();
    Object.keys(OPTIONS).forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = OPTIONS[key].label;
      btn.title = OPTIONS[key].hint;
      btn.style.cssText = btnStyle(key === active);
      btn.addEventListener('click', () => {
        if (key === active) return;
        navigateTo(key);
      });
      row.appendChild(btn);
    });

    const hint = document.createElement('span');
    hint.className = 'wide-lab-hint';
    hint.style.cssText = 'opacity:0.48;font-size:10px;font-weight:500';
    hint.textContent = OPTIONS[active]?.hint || '';
    row.appendChild(hint);

    bar.appendChild(row);
    document.body.appendChild(bar);
  }

  function injectUi() {
    if (!shouldEnable()) return;
    injectBadge();
    if (isLabFrame()) return;
    // La barre formats s’injecte au DOMContentLoaded ; on réessaie un court instant.
    if (tryAttachToFormatBar()) return;
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      if (tryAttachToFormatBar() || tries > 20) {
        clearInterval(t);
        if (!document.querySelector('.wide-lab-row')) injectStandaloneBar();
      }
    }, 50);
  }

  // Dataset le plus tôt possible (CSS media + cascade).
  if (shouldEnable()) applyDataset();

  // Hooks consommés par app.js (filtres sources).
  window.__radarWidePreview = {
    id: () => currentWide(),
    active: () => isWideActive(),
    /** null = laisser la prod décider */
    filtersCollapsedRows: () => {
      const id = currentWide();
      if (id === 'e') return 99;
      if (id === 'c' || id === 'd') return 2;
      return null;
    },
    filtersColumnCount: () => {
      const id = currentWide();
      if (id === 'e') return 1;
      // Shell large → un cran de plus de pastilles par rangée si la place le permet.
      if (id === 'b' || id === 'c' || id === 'd') {
        try {
          if (window.innerWidth >= 1500) return 6;
          if (window.innerWidth >= 1280) return 5;
        } catch { /* ignore */ }
      }
      return null;
    },
    options: () => ({ ...OPTIONS }),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUi);
  } else {
    injectUi();
  }
})();

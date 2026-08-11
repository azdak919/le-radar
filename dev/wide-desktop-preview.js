/**
 * Lab grand écran — couche CSS / dataset uniquement
 * ─────────────────────────────────────────────────
 * La barre UI vit dans midwidth-preview.js (rangée Wide au-dessus de Format).
 * Ce fichier :
 *  - applique data-wide-preview le plus tôt possible (avant paint CSS)
 *  - resync les filtres sources quand l’option change (sans reload)
 *  - ne crée plus de 2ᵉ barre (évite disparition sous le dock / mode iframe)
 */
(function () {
  'use strict';

  const WIDE_PARAM = 'wide';

  function currentWide() {
    try {
      if (document.documentElement.dataset.widePreview) {
        return document.documentElement.dataset.widePreview;
      }
      const raw = (new URL(location.href).searchParams.get(WIDE_PARAM) || 'off')
        .toLowerCase()
        .trim();
      if (!raw || raw === '0' || raw === 'false' || raw === 'off') return 'off';
      if (/^[a-e]$/.test(raw)) return raw;
      return 'off';
    } catch {
      return 'off';
    }
  }

  // Dataset immédiat (double avec midwidth — idempotent)
  try {
    const id = currentWide();
    if (id && id !== 'off') document.documentElement.dataset.widePreview = id;
  } catch { /* ignore */ }

  function resyncFilters() {
    try {
      // app.js expose sync via style vars sur .filters-panel
      const panel = document.getElementById('filters-panel')
        || document.querySelector('.filters-panel');
      if (!panel) return;
      const wide = window.__radarWidePreview;
      if (!wide) return;
      const cols = wide.filtersColumnCount?.();
      const rows = wide.filtersCollapsedRows?.();
      if (typeof cols === 'number' && cols > 0) {
        panel.style.setProperty('--filters-cols', String(cols));
      }
      if (typeof rows === 'number' && rows > 0) {
        panel.style.setProperty('--filters-collapsed-rows', String(rows));
      }
      // Forcer recalcul overflow « Plus de sources »
      window.dispatchEvent(new Event('resize'));
    } catch { /* ignore */ }
  }

  window.addEventListener('radar-wide-preview-change', () => {
    // Laisser le dataset se poser, puis resync
    requestAnimationFrame(() => resyncFilters());
  });

  // Si midwidth n’a pas encore installé le hook, compléter filters helpers
  // (midwidth les écrase ensuite avec la version complète — OK).
  if (!window.__radarWidePreview) {
    window.__radarWidePreview = {
      id: () => currentWide(),
      filtersCollapsedRows: () => {
        const id = currentWide();
        if (id === 'e') return 99;
        if (id === 'c' || id === 'd') return 2;
        return null;
      },
      filtersColumnCount: () => {
        const id = currentWide();
        if (id === 'e') return 1;
        return null;
      },
    };
  }
})();

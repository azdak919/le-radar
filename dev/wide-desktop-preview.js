/**
 * Lab grand écran — couche CSS / dataset + chrome rail E
 * ─────────────────────────────────────────────────
 * La barre UI vit dans midwidth-preview.js (rangée Wide au-dessus de Format).
 * Ce fichier :
 *  - applique data-wide-preview le plus tôt possible (avant paint CSS)
 *  - resync les filtres sources quand l’option change (sans reload)
 *  - Wide E : regroupe menu pages + « Le fil étudiant » + traduction + sources
 *    dans une seule colonne sticky (réversible en Prod)
 */
(function () {
  'use strict';

  const WIDE_PARAM = 'wide';
  const STACK_ID = 'wide-rail-stack';

  /** Placeholders pour restaurer l’ordre DOM en quittant E. */
  let sectionsHome = null;
  let headHome = null;

  function currentWide() {
    try {
      if (document.documentElement.dataset.widePreview) {
        return document.documentElement.dataset.widePreview;
      }
      const raw = (new URL(location.href).searchParams.get(WIDE_PARAM) || 'off')
        .toLowerCase()
        .trim();
      if (!raw || raw === '0' || raw === 'false' || raw === 'off' || raw === 'prod') return 'off';
      // A–D historiques → E
      if (raw === 'e' || raw === 'a' || raw === 'b' || raw === 'c' || raw === 'd' || raw === '1' || raw === 'true') {
        return 'e';
      }
      return 'off';
    } catch {
      return 'off';
    }
  }

  // Dataset immédiat (double avec midwidth — idempotent)
  try {
    const id = currentWide();
    if (id && id !== 'off') document.documentElement.dataset.widePreview = id;
    else delete document.documentElement.dataset.widePreview;
  } catch { /* ignore */ }

  function resyncFilters() {
    try {
      const panel = document.getElementById('news-filters-panel')
        || document.getElementById('filters-panel')
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
      window.dispatchEvent(new Event('resize'));
    } catch { /* ignore */ }
  }

  /**
   * Wide E : empile dans le rail
   *   1) menu pages (Accueil · Médias · …)
   *   2) « Le fil étudiant » + module traduction (+ compteur)
   *   3) pastilles sources
   * Prod : restore DOM d’origine.
   */
  function applyWideRailChrome() {
    const id = currentWide();
    if (id !== 'e') {
      restoreWideRailChrome();
      return;
    }

    const sections = document.querySelector('.site-sections');
    const head = document.querySelector('.wire-head');
    const filters = document.getElementById('news-filters-panel')
      || document.querySelector('main.wire .filters-panel');
    const wire = document.querySelector('main.wire');
    if (!sections || !head || !filters || !wire) return;

    // Mémoriser l’emplacement d’origine une seule fois
    if (!sectionsHome && sections.parentNode && !sections.closest(`#${STACK_ID}`)) {
      sectionsHome = document.createComment('wide-lab-sections-home');
      sections.parentNode.insertBefore(sectionsHome, sections);
    }
    if (!headHome && head.parentNode && !head.closest(`#${STACK_ID}`)) {
      headHome = document.createComment('wide-lab-head-home');
      head.parentNode.insertBefore(headHome, head);
    }

    let stack = document.getElementById(STACK_ID);
    if (!stack) {
      stack = document.createElement('div');
      stack.id = STACK_ID;
      stack.className = 'wide-rail-stack';
      stack.setAttribute('data-wide-rail', '1');
      // Insérer le stack à la place du panneau filtres dans .wire
      filters.parentNode.insertBefore(stack, filters);
    }

    // Ordre : nav → titre/trad → sources
    if (sections.parentNode !== stack) stack.appendChild(sections);
    if (head.parentNode !== stack) stack.appendChild(head);
    if (filters.parentNode !== stack) stack.appendChild(filters);

    document.documentElement.dataset.wideRailChrome = '1';
  }

  function restoreWideRailChrome() {
    const stack = document.getElementById(STACK_ID);
    if (!stack) {
      delete document.documentElement.dataset.wideRailChrome;
      return;
    }

    const sections = stack.querySelector('.site-sections');
    const head = stack.querySelector('.wire-head');
    const filters = stack.querySelector('.filters-panel');

    if (sections && sectionsHome && sectionsHome.parentNode) {
      sectionsHome.parentNode.insertBefore(sections, sectionsHome);
      sectionsHome.remove();
      sectionsHome = null;
    } else if (sections && stack.parentNode) {
      // Repli : avant le wire
      const wire = document.querySelector('main.wire');
      if (wire && wire.parentNode) wire.parentNode.insertBefore(sections, wire);
    }

    if (head && headHome && headHome.parentNode) {
      headHome.parentNode.insertBefore(head, headHome);
      headHome.remove();
      headHome = null;
    } else if (head && stack.parentNode) {
      stack.parentNode.insertBefore(head, stack);
    }

    if (filters && stack.parentNode) {
      stack.parentNode.insertBefore(filters, stack);
    }

    stack.remove();
    delete document.documentElement.dataset.wideRailChrome;
  }

  function onWideChange() {
    requestAnimationFrame(() => {
      applyWideRailChrome();
      resyncFilters();
      // Recalcule sticky sous le synthé (app.js)
      try {
        window.dispatchEvent(new Event('resize'));
      } catch { /* ignore */ }
    });
  }

  window.addEventListener('radar-wide-preview-change', onWideChange);

  function boot() {
    applyWideRailChrome();
    resyncFilters();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
  // app.js peut peindre les filtres après coup
  window.addEventListener('load', () => {
    applyWideRailChrome();
    resyncFilters();
  }, { once: true });

  // Si midwidth n’a pas encore installé le hook, compléter filters helpers
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

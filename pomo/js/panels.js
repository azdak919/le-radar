/* Ataraxia — panel minimize / restore (pomo + quote) */
(function () {
  'use strict';

  function panelEl(panel) {
    return panel === 'pomo'
      ? document.getElementById('pomo-container')
      : document.getElementById('quote-card');
  }

  function setPanelMinimized(panel, minimized) {
    const el = panelEl(panel);
    if (!el) return;

    el.classList.toggle('is-minimized', minimized);

    const key = panel === 'pomo' ? POMO_MIN_KEY : QUOTE_MIN_KEY;
    try {
      if (minimized) localStorage.setItem(key, 'true');
      else localStorage.removeItem(key);
    } catch (e) {}

    const minimizeBtn = document.getElementById(
      panel === 'pomo' ? 'pomo-minimize-btn' : 'quote-minimize-btn'
    );
    const restoreBtn = document.getElementById(
      panel === 'pomo' ? 'pomo-restore-btn' : 'quote-restore-btn'
    );
    // aria-expanded sur les deux commandes ; le focus suit la commande
    // visible pour ne pas rester sur un bouton masqué.
    const hadFocus = document.activeElement === minimizeBtn || document.activeElement === restoreBtn;
    if (minimizeBtn) { minimizeBtn.hidden = minimized; minimizeBtn.setAttribute('aria-expanded', String(!minimized)); }
    if (restoreBtn) { restoreBtn.hidden = !minimized; restoreBtn.setAttribute('aria-expanded', String(!minimized)); }
    if (hadFocus) (minimized ? restoreBtn : minimizeBtn)?.focus({ preventScroll: true });

    if (panel === 'quote' && !minimized && typeof window.scheduleQuoteLayout === 'function') {
      window.scheduleQuoteLayout();
    }
    // Rescale après reflow (2 frames) pour éviter un flash mini→grand
    const afterLayout = () => {
      window.AtaraxiaLayout?.updateChromeInsets?.();
      if (typeof window.syncWidgetScale === 'function') window.syncWidgetScale();
      if (panel === 'quote' && !minimized && typeof window.scheduleQuoteLayout === 'function') {
        window.scheduleQuoteLayout();
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(afterLayout));
  }

  function isMinimized(panel) {
    return panelEl(panel)?.classList.contains('is-minimized') ?? false;
  }

  function restoreFromStorage() {
    try {
      if (localStorage.getItem(POMO_MIN_KEY) === 'true') setPanelMinimized('pomo', true);
      if (localStorage.getItem(QUOTE_MIN_KEY) === 'true') setPanelMinimized('quote', true);
    } catch (e) {}
  }

  function initPanelMinimize() {
    [['pomo-minimize-btn', 'pomo-widget', 'true'], ['pomo-restore-btn', 'pomo-widget', 'true'],
     ['quote-minimize-btn', 'quote-card', 'true'], ['quote-restore-btn', 'quote-card', 'true']].forEach(([id, ctl, exp]) => {
      const b = document.getElementById(id);
      if (b) { b.setAttribute('aria-controls', ctl); b.setAttribute('aria-expanded', exp); }
    });
    restoreFromStorage();

    document.getElementById('pomo-minimize-btn')?.addEventListener('click', () => {
      setPanelMinimized('pomo', true);
    });
    document.getElementById('pomo-restore-btn')?.addEventListener('click', () => {
      setPanelMinimized('pomo', false);
    });
    document.getElementById('quote-minimize-btn')?.addEventListener('click', () => {
      setPanelMinimized('quote', true);
    });
    document.getElementById('quote-restore-btn')?.addEventListener('click', () => {
      setPanelMinimized('quote', false);
    });
  }

  window.AtaraxiaPanels = {
    setPanelMinimized,
    isMinimized,
    initPanelMinimize,
  };
})();
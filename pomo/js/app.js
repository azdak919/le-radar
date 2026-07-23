/* Ataraxia — bootstrap (sole orchestrator)
 *
 * MODULE MAP (js/):
 *   storage.js         — localStorage keys + legacy migration
 *   backgrounds-data.js— BACKGROUNDS[] image pool
 *   backgrounds.js     — load/switch backgrounds, smart random
 *   quotes-data.js     — QUOTES[] citation database
 *   quotes-i18n.js     — curated per-language quote translations
 *   quotes.js          — quote display, layout, random selection
 *   toast.js           — toast notifications
 *   pomo-audio.js      — AtaraxiaPomoAudio (keepalive + chime, isolé du timer)
 *   pomo.js            — pomodoro state, UI, fullscreen, settings
 *   translate.js       — auto-translation (quotes + UI strings)
 *   layout.js          — touch/wide layout + Focus Deck scenes
 *   panels.js          — minimize / restore pomo + quote panels
 *
 * Init order (DOMContentLoaded):
 *   layout.syncLayout → migrateLegacyStorage → initPanelMinimize
 *   → initPomoHandlers → backgrounds + quotes → translate
 */
let _quoteCardObserver = null;
window._ataraxiaPageStart = performance.now();
document.addEventListener('DOMContentLoaded', () => {
  if (window.AtaraxiaLayout) window.AtaraxiaLayout.syncLayout();
  migrateLegacyStorage();
  if (window.AtaraxiaPanels) window.AtaraxiaPanels.initPanelMinimize();
  // Pomo first — must not depend on quote init (quotes.js may load late or fail)
  initPomoHandlers();

  // Restore recent history for smart random selection (anti-repetition across sessions)
  try {
    const quoteCount = (typeof QUOTES !== 'undefined' && QUOTES.length) || 0;
    recentQuotes = JSON.parse(localStorage.getItem(RECENT_QUOTES_KEY) || '[]')
      .filter(i => Number.isInteger(i) && i >= 0 && i < quoteCount);
    recentBgs = JSON.parse(localStorage.getItem(RECENT_BGS_KEY) || '[]')
      .filter(i => Number.isInteger(i) && i >= 0 && i < BACKGROUNDS.length);
  } catch(e) {
    recentQuotes = [];
    recentBgs = [];
  }

  // One-time cleanup of author fields across the entire quote database.
  // This protects against any <g id="..."> leakage that may have been
  // present in the original data or introduced by previous translation runs.
  try {
    QUOTES.forEach(q => {
      if (q.author) q.author = cleanTranslation(q.author);
      if (q.authorEn) q.authorEn = cleanTranslation(q.authorEn);
    });
  } catch(e) {}

  // Random start — isolated so a missing quotes.js cannot break the pomo timer
  try {
    currentBgIdx = getRandomBgIndex(null);
    recordBgSeen(currentBgIdx);
    loadBackground(currentBgIdx);

    currentQuoteIdx = getRandomQuoteIndex();
    recordQuoteSeen(currentQuoteIdx);
    const _initQuote = QUOTES[currentQuoteIdx];
    document.getElementById('quote-text').textContent = _initQuote.text;
    const _initLangSaved = localStorage.getItem(LANG_PREF_KEY)
      || localStorage.getItem(LANG_PREF_KEY_LEGACY);
    const initAuthor = _initQuote.authorEn || _initQuote.author;
    document.getElementById('quote-author').textContent = cleanTranslation(initAuthor);
    syncQuoteSource(_initQuote);
  } catch (e) {
    console.warn('Quote init failed:', e);
  }

  document.getElementById('home-reload-btn')?.addEventListener('click', () => location.reload());

  // Thème clair/sombre (même clé localStorage que Le Radar : req-theme)
  initThemeToggle();

  // Quote buttons
  document.getElementById('btn-new').addEventListener('click', showRandomQuote);
  document.getElementById('btn-bg').addEventListener('click', nextBackground);

  // Quote card resize observer
  const quoteCard = document.getElementById('quote-card');
  if (typeof ResizeObserver !== 'undefined' && quoteCard) {
    const quoteInner = quoteCard.querySelector('.quote-inner');
    _quoteCardObserver = new ResizeObserver(() => {
      if (!_quoteLayoutBusy) scheduleQuoteLayout();
    });
    _quoteCardObserver.observe(quoteCard);
    if (quoteInner) _quoteCardObserver.observe(quoteInner);
  }
  window.addEventListener('resize', () => scheduleQuoteLayout(), { passive: true });
  scheduleQuoteLayout();

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'q' || e.key === 'Q') showRandomQuote();
    if (e.key === 'b' || e.key === 'B') nextBackground();
    if (e.key === ' ') {
      e.preventDefault();
      pomo.isRunning ? stopPomo() : startPomo();
    }
  });

  // ═══════════════════════════════════════
  // INIT AUTO-TRANSLATE
  // ═══════════════════════════════════════
  initTranslation();

  // Le Radar embed — hauteur + ready (même contrat que Solitaire)
  initRadarEmbed();
});

/** Clair/sombre — partagé avec Le Radar via localStorage `req-theme`. */
function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  const apply = (theme) => {
    const isDark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    btn?.querySelector('.ico-sun')?.classList.toggle('hidden', !isDark);
    btn?.querySelector('.ico-moon')?.classList.toggle('hidden', isDark);
    if (btn) {
      const label = isDark ? 'Passer en mode clair' : 'Passer en mode sombre';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    }
    const meta = document.getElementById('meta-theme-color');
    if (meta) meta.setAttribute('content', isDark ? '#1a1816' : '#8b6f4e');
  };
  let theme = 'light';
  try {
    const saved = localStorage.getItem('req-theme');
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    theme = saved || (prefersDark ? 'dark' : 'light');
  } catch { /* */ }
  apply(theme);
  btn?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('req-theme', next); } catch { /* */ }
    apply(next);
  });
}

function initRadarEmbed() {
  const iframe = document.getElementById('radar-embed');
  if (!iframe) return;

  if (!iframe.getAttribute('src') || iframe.getAttribute('src') === 'about:blank') {
    iframe.src = '../tuner-embed.html';
  }

  window.addEventListener('message', (event) => {
    const data = event && event.data;
    if (!data || (data.type !== 'radar-embed' && data.type !== 'ataraxia-radar-embed')) return;
    if (typeof data.height === 'number' && data.height > 0) {
      const h = Math.round(data.height);
      document.documentElement.style.setProperty('--radar-embed-slot-h', h + 'px');
      iframe.style.height = h + 'px';
      window.AtaraxiaLayout?.updateChromeInsets?.();
    }
    if (data.ready) iframe.classList.add('is-ready');
  });

  iframe.addEventListener('load', () => {
    iframe.classList.add('is-ready');
    window.AtaraxiaLayout?.updateChromeInsets?.();
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed:', err));
  });
}

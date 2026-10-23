/**
 * LE-RADAR.ca — Amorçage avant premier paint (thème + layout viewport).
 *
 * Thème : même clé `radar-theme` que le reste du site, avant le premier
 * paint — sinon une personne en mode sombre reçoit une page blanche en
 * arrivant depuis un moteur de recherche.
 *
 * Layout : E s’active tout seul dès 1280 px (1280@150% Edge / 1440 / 1920 / 2560 / 3440 /
 * 3840 via media queries). Aucun `?wide=e` en prod. `?wide=off` reste le
 * témoin lab de l’ancien shell ~1180. Pomo / solitaire n’embarquent pas
 * ce fichier.
 *
 * Volontairement sans dépendance : app.js garde les bascules ; ce
 * bootstrap pose seulement l’état initial.
 */
(function () {
  'use strict';

  var WIDE_CSS = 'dev/wide-desktop-preview.css?v=wide-auto-e102';
  var WIDE_MQ = '(min-width: 1280px)';

  try {
    var saved = localStorage.getItem('radar-theme');
    var dark = saved
      ? saved === 'dark'
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', dark ? '#0e0f12' : '#ffffff');
  } catch (e) {
    /* stockage indisponible (mode privé strict) : on garde le thème clair. */
  }

  // Synchro entre documents : quand la radio joue, nav-shell affiche les
  // pages dans un iframe ; une bascule faite dans l'iframe (ou dans un autre
  // onglet) doit aussi changer l'hôte — sinon la PWA garde la barre d'état
  // et le shell sombres, et revient au sombre en quittant le shell.
  function syncTheme(theme) {
    if (theme !== 'dark' && theme !== 'light') return;
    var isDark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#0e0f12' : '#ffffff');
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      var sun = btn.querySelector('.ico-sun');
      var moon = btn.querySelector('.ico-moon');
      if (sun) sun.classList.toggle('hidden', !isDark);
      if (moon) moon.classList.toggle('hidden', isDark);
      var label = isDark ? 'Passer en mode clair' : 'Passer en mode sombre';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    }
  }
  try {
    window.addEventListener('storage', function (ev) {
      if (ev.key === 'radar-theme' && ev.newValue) syncTheme(ev.newValue);
    });
  } catch (e3) { /* ignore */ }

  function readWideParam() {
    try {
      return (new URL(location.href).searchParams.get('wide') || '').toLowerCase().trim();
    } catch (err) {
      return '';
    }
  }

  function assetBase() {
    var script = document.currentScript;
    var src = script && script.getAttribute('src');
    if (!src) return '';
    return src.replace(/seo-page-theme\.js(\?.*)?$/, '');
  }

  function ensureWideCss() {
    try {
      if (document.querySelector('link[href*="wide-desktop-preview.css"]')) return;
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = assetBase() + WIDE_CSS;
      document.head.appendChild(link);
    } catch (err) { /* ignore */ }
  }

  function applyWideLayoutFromViewport() {
    try {
      var raw = readWideParam();
      var off = raw === 'off' || raw === 'prod' || raw === '0' || raw === 'false';
      var letter = (raw === 'b' || raw === 'c' || raw === 'd') ? raw : 'e';
      var wideOk = window.matchMedia && window.matchMedia(WIDE_MQ).matches;
      var next = (!off && wideOk) ? letter : '';
      var prev = document.documentElement.getAttribute('data-wide-preview') || '';
      if (next) {
        document.documentElement.setAttribute('data-wide-preview', next);
      } else {
        document.documentElement.removeAttribute('data-wide-preview');
      }
      if (prev !== next) {
        try {
          window.dispatchEvent(new CustomEvent('radar-wide-preview-change', {
            detail: { id: next || 'off' },
          }));
        } catch (err2) { /* ignore */ }
      }
    } catch (err) { /* ignore */ }
  }

  applyWideLayoutFromViewport();
  ensureWideCss();
  try {
    var mq = window.matchMedia(WIDE_MQ);
    if (mq.addEventListener) mq.addEventListener('change', applyWideLayoutFromViewport);
    else if (mq.addListener) mq.addListener(applyWideLayoutFromViewport);
  } catch (err) { /* ignore */ }
  try {
    window.addEventListener('resize', applyWideLayoutFromViewport, { passive: true });
  } catch (err2) { /* ignore */ }
})();

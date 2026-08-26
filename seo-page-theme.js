/**
 * LE-RADAR.ca — Amorçage avant premier paint (thème + layout viewport).
 *
 * Thème : même clé `radar-theme` que le reste du site, avant le premier
 * paint — sinon une personne en mode sombre reçoit une page blanche en
 * arrivant depuis un moteur de recherche.
 *
 * Layout : E s’active tout seul dès 1281 px (1440 / 1920 / 2560 / 3440 /
 * 3840 via media queries). Aucun `?wide=e` en prod. `?wide=off` reste le
 * témoin lab de l’ancien shell ~1180. Pomo / solitaire n’embarquent pas
 * ce fichier.
 *
 * Volontairement sans dépendance : app.js garde les bascules ; ce
 * bootstrap pose seulement l’état initial.
 */
(function () {
  'use strict';

  var WIDE_CSS = 'dev/wide-desktop-preview.css?v=wide-auto-e94';
  var WIDE_MQ = '(min-width: 1281px)';

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

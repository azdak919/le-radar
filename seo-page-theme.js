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

  var WIDE_CSS = 'dev/wide-desktop-preview.css?v=wide-auto-e104';
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

/* Doodle Vice City, novembre 2026. Même décision que doodle-boot-lib.js
   (fin 25 nov. 23 h 59 heure de Montréal, désactivé le 26, tirage 1/5, ?doodle=on|off,
   ville Montréal/Québec à parts égales, gardée pour la session,
   ?doodle-city=montreal|quebec). Ce fichier est déjà chargé dans le
   <head> avant style-masthead.css, donc data-doodle-city est posé
   avant le premier paint, sans flash. */
(function () {
  "use strict";
  var STORAGE_KEY = "radar-doodle-2026-11";
  var CITY_STORAGE_KEY = "radar-doodle-2026-11-city";
  var END_MS = Date.parse("2026-11-26T04:59:59.999Z");
  var state = "off";
  var city = "";
  try {
    var boot = typeof window !== "undefined" ? window.__lrDoodleBoot : null;
    var search = "";
    try { search = new URL(location.href).search; } catch (e1) { search = location.search || ""; }
    if (boot && typeof boot.resolveDoodleState === "function") {
      state = boot.resolveDoodleState({ search: search, storage: window.localStorage });
    } else {
      var force = "";
      try {
        force = (new URLSearchParams(search).get("doodle") || "").toLowerCase().trim();
      } catch (e2) { force = ""; }
      if (force === "on" || force === "off") {
        state = force;
      } else if (Date.now() <= END_MS) {
        var saved = null;
        try { saved = localStorage.getItem(STORAGE_KEY); } catch (e3) { saved = null; }
        if (saved === "on" || saved === "off") {
          state = saved;
        } else {
          state = Math.random() < 0.2 ? "on" : "off";
          try { localStorage.setItem(STORAGE_KEY, state); } catch (e4) { /* ignore */ }
        }
      }
    }
    if (state === "on") {
      if (boot && typeof boot.resolveDoodleCity === "function") {
        city = boot.resolveDoodleCity({ search: search, cityStorage: window.sessionStorage });
      } else {
        var cityForce = "";
        try {
          cityForce = (new URLSearchParams(search).get("doodle-city") || "").toLowerCase().trim();
        } catch (e5) { cityForce = ""; }
        if (cityForce === "montreal" || cityForce === "quebec") {
          city = cityForce;
        } else {
          var citySaved = null;
          try { citySaved = sessionStorage.getItem(CITY_STORAGE_KEY); } catch (e6) { citySaved = null; }
          if (citySaved === "montreal" || citySaved === "quebec") {
            city = citySaved;
          } else {
            city = Math.random() < 0.5 ? "montreal" : "quebec";
            try { sessionStorage.setItem(CITY_STORAGE_KEY, city); } catch (e7) { /* ignore */ }
          }
        }
      }
    }
  } catch (err) {
    state = "off";
    city = "";
  }
  try {
    document.documentElement.classList.remove("doodle-on", "doodle-off");
    document.documentElement.classList.add(state === "on" ? "doodle-on" : "doodle-off");
    document.documentElement.setAttribute("data-doodle", state);
    if (state === "on" && (city === "montreal" || city === "quebec")) {
      document.documentElement.setAttribute("data-doodle-city", city);
    } else {
      document.documentElement.removeAttribute("data-doodle-city");
    }
  } catch (err2) { /* ignore */ }
})();

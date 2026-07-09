/**
 * LE RADAR — traduction de page (optionnelle).
 *
 * Par défaut : ORIGINAL bilingue (FR + EN tels quels). Aucune détection
 * automatique de la langue du navigateur — l'utilisateur doit choisir
 * explicitement Français, English ou une autre langue.
 *
 * Moteur : Google Website Translator (widget masqué) + UI maison.
 * Préférence : localStorage `radar-translate-mode`
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'radar-translate-mode';
  /** Valeur par défaut : ne jamais déduire depuis navigator.language. */
  const DEFAULT_MODE = 'original';

  const MODES = {
    original: {
      id: 'original',
      label: 'Original',
      short: 'Original',
      title: 'Par défaut — ne pas traduire, garder le fil bilingue (FR + EN)',
      hint: 'Bilingue FR + EN · défaut',
    },
    fr: {
      id: 'fr',
      label: 'Français',
      short: 'FR',
      title: 'Traduire toute la page en français',
      hint: 'Toute la page',
      goog: 'fr',
    },
    en: {
      id: 'en',
      label: 'English',
      short: 'EN',
      title: 'Translate the whole page into English',
      hint: 'Whole page',
      goog: 'en',
    },
    es: {
      id: 'es',
      label: 'Español',
      short: 'ES',
      title: 'Traducir toda la página al español',
      hint: 'Página completa',
      goog: 'es',
    },
    pt: {
      id: 'pt',
      label: 'Português',
      short: 'PT',
      title: 'Traduzir a página inteira para português',
      hint: 'Página inteira',
      goog: 'pt',
    },
    ar: {
      id: 'ar',
      label: 'العربية',
      short: 'AR',
      title: 'ترجمة الصفحة كاملة إلى العربية',
      hint: 'الصفحة كاملة',
      goog: 'ar',
    },
    zh: {
      id: 'zh',
      label: '中文',
      short: '中文',
      title: '将整页翻译成中文',
      hint: '整页',
      goog: 'zh-CN',
    },
  };

  /** Langues passées à Google (codes goog). */
  const GOOG_INCLUDED = Object.values(MODES)
    .map((m) => m.goog)
    .filter(Boolean)
    .join(',');

  let gtReady = false;
  let gtLoading = false;
  const pendingCallbacks = [];

  function getMode() {
    try {
      const raw = (localStorage.getItem(STORAGE_KEY) || DEFAULT_MODE).toLowerCase().trim();
      // Valeurs inconnues / corrompues → toujours l'original bilingue
      if (!raw || raw === 'auto' || raw === 'default' || !MODES[raw]) {
        return DEFAULT_MODE;
      }
      return raw;
    } catch {
      return DEFAULT_MODE;
    }
  }

  function setMode(mode) {
    if (!MODES[mode]) mode = DEFAULT_MODE;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch { /* private mode */ }
    return mode;
  }

  function clearGoogTransCookies() {
    const host = location.hostname;
    const expire = 'Thu, 01 Jan 1970 00:00:00 GMT';
    const paths = ['/', location.pathname || '/'];
    const domains = ['', host];
    if (host && host.includes('.')) {
      domains.push(`.${host}`);
      // github.io pages
      const parts = host.split('.');
      if (parts.length >= 2) {
        domains.push(`.${parts.slice(-2).join('.')}`);
      }
    }
    for (const d of domains) {
      for (const p of paths) {
        const domainPart = d ? `; domain=${d}` : '';
        document.cookie = `googtrans=; expires=${expire}; path=${p}${domainPart}`;
        document.cookie = `googtrans=; expires=${expire}; path=${p}${domainPart}; Secure`;
      }
    }
  }

  function setGoogTransCookie(targetLang) {
    clearGoogTransCookies();
    if (!targetLang) return;
    // /auto/xx : Google détecte la langue de chaque bloc (fil bilingue).
    const value = `/auto/${targetLang}`;
    document.cookie = `googtrans=${value}; path=/`;
    const host = location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      document.cookie = `googtrans=${value}; path=/; domain=${host}`;
    }
  }

  function readGoogTransTarget() {
    const m = document.cookie.match(/(?:^|;\s*)googtrans=\/[^/]*\/([a-z]{2}(?:-[A-Z]{2})?)/i);
    return m ? m[1] : '';
  }

  function updateUi(mode) {
    const m = MODES[mode] || MODES.original;
    const label = document.getElementById('translate-label');
    const btn = document.getElementById('translate-toggle');
    const menu = document.getElementById('translate-menu');
    if (label) {
      label.textContent = mode === DEFAULT_MODE ? m.label : m.short;
    }
    if (btn) {
      btn.title = m.title;
      btn.setAttribute(
        'aria-label',
        mode === DEFAULT_MODE
          ? 'Langue : original bilingue (défaut). Ouvrir pour traduire la page.'
          : `Langue d'affichage : ${m.label}. Changer la langue.`,
      );
      btn.dataset.mode = mode;
    }
    if (menu) {
      menu.querySelectorAll('[data-mode]').forEach((opt) => {
        const active = opt.dataset.mode === mode;
        opt.setAttribute('aria-selected', active ? 'true' : 'false');
        opt.classList.toggle('is-active', active);
      });
    }
    document.documentElement.dataset.translate = mode;
    // html lang : fr par défaut pour l'UI du site ; en seulement si traduction EN choisie
    if (mode === 'en') document.documentElement.lang = 'en-CA';
    else if (mode === 'fr') document.documentElement.lang = 'fr-CA';
    else document.documentElement.lang = 'fr-CA';
  }

  function closeMenu() {
    const menu = document.getElementById('translate-menu');
    const btn = document.getElementById('translate-toggle');
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function openMenu() {
    const menu = document.getElementById('translate-menu');
    const btn = document.getElementById('translate-toggle');
    if (menu) menu.hidden = false;
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function toggleMenu() {
    const menu = document.getElementById('translate-menu');
    if (!menu) return;
    if (menu.hidden) openMenu();
    else closeMenu();
  }

  function applyComboValue(lang) {
    const select = document.querySelector('.goog-te-combo');
    if (!select) return false;
    const want = lang || '';
    // Google utilise parfois zh-CN
    let matched = false;
    for (const opt of select.options) {
      if (opt.value === want || (want && opt.value.toLowerCase() === want.toLowerCase())) {
        if (select.value !== opt.value) {
          select.value = opt.value;
          select.dispatchEvent(new Event('change'));
        }
        matched = true;
        break;
      }
    }
    if (!matched && want) {
      select.value = want;
      select.dispatchEvent(new Event('change'));
    }
    return true;
  }

  function loadGoogleTranslate(cb) {
    if (gtReady) {
      if (cb) cb();
      return;
    }
    if (cb) pendingCallbacks.push(cb);
    if (gtLoading) return;
    gtLoading = true;

    window.googleTranslateElementInit = function googleTranslateElementInit() {
      try {
        // eslint-disable-next-line no-new
        new window.google.translate.TranslateElement(
          {
            pageLanguage: '',
            includedLanguages: GOOG_INCLUDED,
            autoDisplay: false,
            multilanguagePage: true,
          },
          'google_translate_element',
        );
      } catch (e) {
        console.warn('Google Translate init failed', e);
      }
      gtReady = true;
      gtLoading = false;
      const queue = pendingCallbacks.splice(0);
      queue.forEach((fn) => {
        try { fn(); } catch { /* ignore */ }
      });
    };

    const s = document.createElement('script');
    s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    s.async = true;
    s.onerror = () => {
      gtLoading = false;
      console.warn('Could not load Google Translate');
    };
    document.head.appendChild(s);
  }

  function applyMode(mode, { reloadIfNeeded = true } = {}) {
    mode = setMode(mode);
    updateUi(mode);

    if (mode === DEFAULT_MODE) {
      const hadCookie = !!readGoogTransTarget();
      const wasTranslated = !!(document.body && /translated/.test(document.body.className || ''));
      clearGoogTransCookies();
      if ((hadCookie || wasTranslated) && reloadIfNeeded) {
        location.reload();
        return;
      }
      applyComboValue('');
      return;
    }

    const target = MODES[mode].goog;
    const current = readGoogTransTarget();

    if (
      current.toLowerCase() === String(target).toLowerCase()
      && document.body
      && /translated/.test(document.body.className || '')
    ) {
      return;
    }

    setGoogTransCookie(target);

    // Charger Google uniquement après un choix explicite de l'utilisateur.
    loadGoogleTranslate(() => {
      let tries = 0;
      const tick = () => {
        tries += 1;
        if (applyComboValue(target)) return;
        if (tries < 20) {
          window.setTimeout(tick, 100);
          return;
        }
        if (
          reloadIfNeeded
          && readGoogTransTarget().toLowerCase().startsWith(String(target).toLowerCase().slice(0, 2))
          && !document.querySelector('.goog-te-combo')
        ) {
          location.reload();
        }
      };
      window.setTimeout(tick, 50);
    });
  }

  function bindUi() {
    const btn = document.getElementById('translate-toggle');
    const menu = document.getElementById('translate-menu');
    if (!btn || !menu) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    menu.querySelectorAll('[data-mode]').forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = opt.dataset.mode;
        closeMenu();
        if (mode) applyMode(mode);
      });
    });

    document.addEventListener('click', (e) => {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
  }

  function init() {
    // Toujours partir de l'original sauf choix explicite déjà enregistré.
    // Nettoyer tout cookie Google orphelin si on est en mode original.
    const mode = getMode();

    // Sécurité : ne jamais « deviner » fr/en via le navigateur.
    // (pas de navigator.language ici)

    bindUi();
    updateUi(mode);

    if (mode === DEFAULT_MODE) {
      // Mode défaut : pas de script Google, cookies de traduction effacés.
      if (readGoogTransTarget()) {
        clearGoogTransCookies();
        if (document.body && /translated/.test(document.body.className || '')) {
          location.reload();
        }
      }
      return;
    }

    // Préférence non-défaut enregistrée par l'utilisateur → appliquer.
    setGoogTransCookie(MODES[mode].goog);
    loadGoogleTranslate(() => {
      window.setTimeout(() => applyComboValue(MODES[mode].goog), 80);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.RadarTranslate = {
    getMode,
    applyMode,
    DEFAULT_MODE,
    MODES,
  };
})();

/**
 * LE RADAR — traduction de page.
 *
 * Règles :
 *  1. Préférence utilisateur (localStorage) si elle existe — y compris « Original ».
 *  2. Sinon, langue du navigateur :
 *     - fr* ou en*  → Original bilingue (pas de traduction auto)
 *     - toute autre → traduction auto vers cette langue
 *  3. L'utilisateur peut toujours forcer Original / FR / EN / etc. dans le menu.
 *
 * Moteur : Google Website Translator (widget masqué) + UI maison.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'radar-translate-mode';
  const DEFAULT_MODE = 'original';

  /** Modes avec entrée de menu. Autres codes ISO → traduction Google dynamique. */
  const MODES = {
    original: {
      id: 'original',
      label: 'Original',
      short: 'Original',
      title: 'Ne pas traduire — fil bilingue FR + EN (défaut pour navigateurs français ou anglais)',
      hint: 'Bilingue FR + EN',
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
    de: {
      id: 'de',
      label: 'Deutsch',
      short: 'DE',
      title: 'Ganze Seite auf Deutsch übersetzen',
      hint: 'Ganze Seite',
      goog: 'de',
    },
    it: {
      id: 'it',
      label: 'Italiano',
      short: 'IT',
      title: 'Traduci l’intera pagina in italiano',
      hint: 'Tutta la pagina',
      goog: 'it',
    },
    ht: {
      id: 'ht',
      label: 'Kreyòl',
      short: 'HT',
      title: 'Tradui tout paj la an kreyòl ayisyen',
      hint: 'Tout paj la',
      goog: 'ht',
    },
  };

  /** Codes Google pour les langues du menu + auto-détection courante. */
  const GOOG_INCLUDED = [
    ...new Set(
      Object.values(MODES)
        .map((m) => m.goog)
        .filter(Boolean)
        .concat(['hi', 'vi', 'ru', 'uk', 'pl', 'ro', 'tr', 'ko', 'ja', 'bn', 'pa', 'ur', 'fa']),
    ),
  ].join(',');

  let gtReady = false;
  let gtLoading = false;
  const pendingCallbacks = [];

  function hasUserPreference() {
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }

  function isValidLangCode(code) {
    return typeof code === 'string' && /^[a-z]{2}(?:-[A-Za-z]{2,4})?$/.test(code);
  }

  /** BCP-47 → code Google / mode connu. */
  function normalizeBrowserLang(tag) {
    const raw = String(tag || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw.startsWith('zh')) return 'zh';
    const primary = raw.split('-')[0];
    return primary || '';
  }

  function googCodeForMode(mode) {
    if (!mode || mode === DEFAULT_MODE) return null;
    if (MODES[mode]?.goog) return MODES[mode].goog;
    if (mode === 'zh') return 'zh-CN';
    if (isValidLangCode(mode)) return mode;
    return null;
  }

  function labelForMode(mode) {
    if (MODES[mode]) return MODES[mode];
    if (mode && mode !== DEFAULT_MODE) {
      return {
        id: mode,
        label: mode.toUpperCase(),
        short: mode.toUpperCase(),
        title: `Translate page to ${mode}`,
        hint: 'Auto',
        goog: googCodeForMode(mode),
      };
    }
    return MODES.original;
  }

  /**
   * Première langue navigateur ni fr ni en → mode de traduction auto.
   * fr / en (toute variante) → original.
   */
  function detectBrowserAutoMode() {
    let tags = [];
    try {
      if (Array.isArray(navigator.languages) && navigator.languages.length) {
        tags = navigator.languages.slice();
      } else if (navigator.language) {
        tags = [navigator.language];
      }
    } catch {
      tags = [];
    }

    for (const tag of tags) {
      const primary = normalizeBrowserLang(tag);
      if (!primary) continue;
      // Français ou anglais → garder le bilingue, ne pas traduire.
      if (primary === 'fr' || primary === 'en') {
        return DEFAULT_MODE;
      }
      // Autre langue → traduire vers celle-ci (première de la liste).
      if (MODES[primary]) return primary;
      if (isValidLangCode(primary)) return primary;
    }
    return DEFAULT_MODE;
  }

  /**
   * Mode effectif : préférence utilisateur si définie, sinon détection navigateur.
   */
  function getMode() {
    if (hasUserPreference()) {
      try {
        const raw = (localStorage.getItem(STORAGE_KEY) || '').toLowerCase().trim();
        if (raw === DEFAULT_MODE) return DEFAULT_MODE;
        if (MODES[raw]) return raw;
        if (isValidLangCode(raw) && raw !== 'fr' && raw !== 'en') return raw;
        // Préférence invalide → se comporter comme absence de préférence
      } catch { /* fall through */ }
    }
    return detectBrowserAutoMode();
  }

  function setMode(mode) {
    if (mode !== DEFAULT_MODE && !MODES[mode] && !isValidLangCode(mode)) {
      mode = DEFAULT_MODE;
    }
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
      const parts = host.split('.');
      if (parts.length >= 2) domains.push(`.${parts.slice(-2).join('.')}`);
    }
    for (const d of domains) {
      for (const p of paths) {
        const domainPart = d ? `; domain=${d}` : '';
        document.cookie = `googtrans=; expires=${expire}; path=${p}${domainPart}`;
      }
    }
  }

  function setGoogTransCookie(targetLang) {
    clearGoogTransCookies();
    if (!targetLang) return;
    const value = `/auto/${targetLang}`;
    document.cookie = `googtrans=${value}; path=/`;
    const host = location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      document.cookie = `googtrans=${value}; path=/; domain=${host}`;
    }
  }

  function readGoogTransTarget() {
    const m = document.cookie.match(/(?:^|;\s*)googtrans=\/[^/]*\/([a-z]{2}(?:-[A-Za-z]{2,4})?)/i);
    return m ? m[1] : '';
  }

  function updateUi(mode) {
    const m = labelForMode(mode);
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
          ? 'Langue : original bilingue. Ouvrir pour traduire la page.'
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
      // Si mode auto hors menu (ex. hi), pas d'option active — OK
    }
    document.documentElement.dataset.translate = mode;
    if (mode === 'en') document.documentElement.lang = 'en-CA';
    else if (mode === 'fr') document.documentElement.lang = 'fr-CA';
    else if (mode === 'ar') document.documentElement.lang = 'ar';
    else if (mode === 'zh') document.documentElement.lang = 'zh-Hans';
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
    let matched = false;
    for (const opt of select.options) {
      if (
        opt.value === want
        || (want && opt.value.toLowerCase() === want.toLowerCase())
        || (want === 'zh-CN' && /^zh/i.test(opt.value))
      ) {
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
      pendingCallbacks.splice(0).forEach((fn) => {
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

  function applyMode(mode, { reloadIfNeeded = true, persist = true } = {}) {
    if (persist) mode = setMode(mode);
    else if (!mode) mode = DEFAULT_MODE;

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

    const target = googCodeForMode(mode);
    if (!target) {
      applyMode(DEFAULT_MODE, { reloadIfNeeded, persist });
      return;
    }

    const current = readGoogTransTarget();
    if (
      current.toLowerCase() === String(target).toLowerCase()
      && document.body
      && /translated/.test(document.body.className || '')
    ) {
      return;
    }

    setGoogTransCookie(target);
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
          && readGoogTransTarget()
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
        // Choix utilisateur → toujours persisté
        if (mode) applyMode(mode, { persist: true });
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
    bindUi();

    const mode = getMode();
    const fromUser = hasUserPreference();
    updateUi(mode);

    if (mode === DEFAULT_MODE) {
      // Bilingue : pas de script Google ; purger cookies orphelins
      if (readGoogTransTarget()) {
        clearGoogTransCookies();
        if (document.body && /translated/.test(document.body.className || '')) {
          location.reload();
        }
      }
      return;
    }

    // Traduction demandée (auto navigateur non-FR/EN, ou préférence utilisateur)
    // Auto : ne pas écrire localStorage (persist:false) pour que FR/EN restent prioritaires
    // si l'utilisateur n'a rien choisi — en pratique getMode() a déjà tranché.
    applyMode(mode, {
      persist: fromUser,
      reloadIfNeeded: true,
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
    detectBrowserAutoMode,
    hasUserPreference,
    DEFAULT_MODE,
    MODES,
  };
})();

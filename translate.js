/**
 * LE RADAR — traduction de page (FR / EN / original bilingue).
 *
 * Moteur : Google Website Translator (widget masqué) + UI maison.
 * Préférence : localStorage `radar-translate-mode` = original | fr | en
 * Cookie googtrans pour la session de traduction.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'radar-translate-mode';
  const MODES = {
    original: {
      id: 'original',
      label: 'Original',
      short: 'Bilingue',
      title: 'Ne pas traduire — garder le fil bilingue (FR + EN)',
    },
    fr: {
      id: 'fr',
      label: 'Français',
      short: 'FR',
      title: 'Traduire toute la page en français',
      goog: 'fr',
    },
    en: {
      id: 'en',
      label: 'English',
      short: 'EN',
      title: 'Translate the whole page into English',
      goog: 'en',
    },
  };

  let gtReady = false;
  let gtLoading = false;
  const pendingCallbacks = [];

  function getMode() {
    const raw = (localStorage.getItem(STORAGE_KEY) || 'original').toLowerCase();
    return MODES[raw] ? raw : 'original';
  }

  function setMode(mode) {
    if (!MODES[mode]) mode = 'original';
    localStorage.setItem(STORAGE_KEY, mode);
    return mode;
  }

  function clearGoogTransCookies() {
    const host = location.hostname;
    const expire = 'Thu, 01 Jan 1970 00:00:00 GMT';
    const paths = ['/', location.pathname];
    const domains = ['', host, `.${host}`];
    // Sous-domaines github.io
    if (host.endsWith('.github.io')) {
      domains.push('.github.io');
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
    // /auto/xx : laisse Google détecter la langue source (fil bilingue).
    const value = `/auto/${targetLang}`;
    document.cookie = `googtrans=${value}; path=/`;
    const host = location.hostname;
    if (host && host !== 'localhost') {
      document.cookie = `googtrans=${value}; path=/; domain=${host}`;
    }
  }

  function readGoogTransTarget() {
    const m = document.cookie.match(/(?:^|;\s*)googtrans=\/[^/]*\/([a-z]{2})/i);
    return m ? m[1].toLowerCase() : '';
  }

  function updateUi(mode) {
    const m = MODES[mode] || MODES.original;
    const label = document.getElementById('translate-label');
    const btn = document.getElementById('translate-toggle');
    const menu = document.getElementById('translate-menu');
    if (label) {
      label.textContent = mode === 'original' ? m.label : m.short;
    }
    if (btn) {
      btn.title = m.title;
      btn.setAttribute('aria-label', `Langue d'affichage : ${m.label}. Changer la langue.`);
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
    document.documentElement.lang = mode === 'en' ? 'en-CA' : 'fr-CA';
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
    // Option « original » : valeur vide
    const want = lang || '';
    if (select.value === want) return true;
    select.value = want;
    select.dispatchEvent(new Event('change'));
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
        // pageLanguage omis → détection auto (contenu FR + EN).
        // eslint-disable-next-line no-new
        new window.google.translate.TranslateElement(
          {
            pageLanguage: '',
            includedLanguages: 'fr,en',
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

  /**
   * Applique le mode demandé. Recharge la page si le cookie doit changer
   * avant que le widget ne soit prêt (premier passage).
   */
  function applyMode(mode, { reloadIfNeeded = true } = {}) {
    mode = setMode(mode);
    updateUi(mode);

    if (mode === 'original') {
      const hadCookie = !!readGoogTransTarget();
      clearGoogTransCookies();
      // Si une traduction était active, recharger pour retrouver le DOM d'origine.
      if (hadCookie && reloadIfNeeded) {
        location.reload();
        return;
      }
      // Essayer de rétablir via le combo si présent
      applyComboValue('');
      return;
    }

    const target = MODES[mode].goog;
    const current = readGoogTransTarget();

    if (current === target && document.body.classList.contains('translated-ltr')) {
      // Déjà traduit dans la bonne langue
      return;
    }

    setGoogTransCookie(target);

    loadGoogleTranslate(() => {
      // Petit délai : le <select> est injecté async par le widget.
      let tries = 0;
      const tick = () => {
        tries += 1;
        if (applyComboValue(target)) return;
        if (tries < 20) {
          window.setTimeout(tick, 100);
          return;
        }
        // Combo introuvable — le cookie suffit au prochain chargement.
        if (reloadIfNeeded && readGoogTransTarget() === target && !document.querySelector('.goog-te-combo')) {
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
        if (mode && mode !== getMode()) applyMode(mode);
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
    updateUi(mode);

    // Si une préférence de traduction est enregistrée, charger le moteur.
    if (mode !== 'original') {
      // Cookie + widget pour appliquer sans forcément recharger.
      setGoogTransCookie(MODES[mode].goog);
      loadGoogleTranslate(() => {
        window.setTimeout(() => applyComboValue(MODES[mode].goog), 80);
      });
    } else if (readGoogTransTarget()) {
      // Cookie orphelin (navigation précédente) → rétablir l'original.
      clearGoogTransCookies();
      // Recharger une fois si le body est déjà traduit
      if (document.body && /translated/.test(document.body.className)) {
        location.reload();
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging / future hooks
  window.RadarTranslate = {
    getMode,
    applyMode,
    MODES,
  };
})();

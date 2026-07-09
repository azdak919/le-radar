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

  /**
   * Modes avec entrée de menu.
   * Ordre d'affichage : original → fr → en → langues autochtones du Québec → autres.
   * group: 'core' | 'indigenous' | 'other'
   * unavailable: true → affiché mais pas encore supporté par Google Translate.
   */
  const MODES = {
    original: {
      id: 'original',
      label: 'Original',
      short: 'Original',
      title: 'Ne pas traduire — fil bilingue FR + EN (défaut pour navigateurs français ou anglais)',
      hint: 'Bilingue FR + EN',
      group: 'core',
    },
    fr: {
      id: 'fr',
      label: 'Français',
      short: 'FR',
      title: 'Traduire toute la page en français',
      hint: 'Toute la page',
      goog: 'fr',
      group: 'core',
    },
    en: {
      id: 'en',
      label: 'English',
      short: 'EN',
      title: 'Translate the whole page into English',
      hint: 'Whole page',
      goog: 'en',
      group: 'core',
    },
    // ── Langues autochtones du Québec (Inuit + Premières Nations) ──
    // Google Translate (2024+) : Inuktut seulement. Les autres sont listées
    // pour visibilité ; clic → message tant que le moteur ne les offre pas.
    iu: {
      id: 'iu',
      label: 'ᐃᓄᒃᑎᑐᑦ',
      short: 'IU',
      title: 'Inuktitut (syllabiques) — Inuktut, Nunavik et Inuit du Canada',
      hint: 'Inuktitut · syllabiques',
      goog: 'iu',
      group: 'indigenous',
    },
    'iu-latn': {
      id: 'iu-latn',
      label: 'Inuktut',
      short: 'IU',
      title: 'Inuktut (alphabet latin) — Inuit du Canada',
      hint: 'Inuktitut · latin',
      goog: 'iu-Latn',
      group: 'indigenous',
    },
    cr: {
      id: 'cr',
      label: 'Cree',
      short: 'CR',
      title: 'Eeyou / Cree — pas encore disponible en traduction automatique',
      hint: 'Eeyou Istchee · bientôt',
      group: 'indigenous',
      unavailable: true,
    },
    moe: {
      id: 'moe',
      label: 'Innu-aimun',
      short: 'INN',
      title: 'Innu-aimun — pas encore disponible en traduction automatique',
      hint: 'Innu · bientôt',
      group: 'indigenous',
      unavailable: true,
    },
    atj: {
      id: 'atj',
      label: 'Atikamekw',
      short: 'ATJ',
      title: 'Atikamekw Nehiromowin — pas encore disponible en traduction automatique',
      hint: 'Atikamekw · bientôt',
      group: 'indigenous',
      unavailable: true,
    },
    alq: {
      id: 'alq',
      label: 'Anishinaabemowin',
      short: 'ALG',
      title: 'Anishinaabemowin (Algonquin) — pas encore disponible en traduction automatique',
      hint: 'Algonquin · bientôt',
      group: 'indigenous',
      unavailable: true,
    },
    moh: {
      id: 'moh',
      label: 'Kanienʼkéha',
      short: 'MOH',
      title: 'Kanienʼkéha (Mohawk) — pas encore disponible en traduction automatique',
      hint: 'Mohawk · bientôt',
      group: 'indigenous',
      unavailable: true,
    },
    mic: {
      id: 'mic',
      label: 'Mi\'kmaq',
      short: 'MIC',
      title: 'Mi\'kmaq — pas encore disponible en traduction automatique',
      hint: 'Mi\'kmaq · bientôt',
      group: 'indigenous',
      unavailable: true,
    },
    // ── Autres langues ──
    es: {
      id: 'es',
      label: 'Español',
      short: 'ES',
      title: 'Traducir toda la página al español',
      hint: 'Página completa',
      goog: 'es',
      group: 'other',
    },
    pt: {
      id: 'pt',
      label: 'Português',
      short: 'PT',
      title: 'Traduzir a página inteira para português',
      hint: 'Página inteira',
      goog: 'pt',
      group: 'other',
    },
    ar: {
      id: 'ar',
      label: 'العربية',
      short: 'AR',
      title: 'ترجمة الصفحة كاملة إلى العربية',
      hint: 'الصفحة كاملة',
      goog: 'ar',
      group: 'other',
    },
    zh: {
      id: 'zh',
      label: '中文',
      short: '中文',
      title: '将整页翻译成中文',
      hint: '整页',
      goog: 'zh-CN',
      group: 'other',
    },
    de: {
      id: 'de',
      label: 'Deutsch',
      short: 'DE',
      title: 'Ganze Seite auf Deutsch übersetzen',
      hint: 'Ganze Seite',
      goog: 'de',
      group: 'other',
    },
    it: {
      id: 'it',
      label: 'Italiano',
      short: 'IT',
      title: 'Traduci l’intera pagina in italiano',
      hint: 'Tutta la pagina',
      goog: 'it',
      group: 'other',
    },
    ht: {
      id: 'ht',
      label: 'Kreyòl',
      short: 'HT',
      title: 'Tradui tout paj la an kreyòl ayisyen',
      hint: 'Tout paj la',
      goog: 'ht',
      group: 'other',
    },
  };

  /** Ordre stable du menu (indépendant de l'ordre des clés d'objet). */
  const MENU_ORDER = [
    'original', 'fr', 'en',
    'iu', 'iu-latn', 'cr', 'moe', 'atj', 'alq', 'moh', 'mic',
    'es', 'pt', 'ht', 'ar', 'zh', 'de', 'it',
  ];

  /** Codes Google pour le widget + auto-détection. */
  const GOOG_INCLUDED = [
    ...new Set(
      Object.values(MODES)
        .map((m) => m.goog)
        .filter(Boolean)
        .concat(['hi', 'vi', 'ru', 'uk', 'pl', 'ro', 'tr', 'ko', 'ja', 'bn', 'pa', 'ur', 'fa', 'kl']),
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
    if (MODES[mode]?.unavailable) return null;
    if (MODES[mode]?.goog) return MODES[mode].goog;
    if (mode === 'zh') return 'zh-CN';
    if (mode === 'iu-latn') return 'iu-Latn';
    if (isValidLangCode(mode)) return mode;
    return null;
  }

  function notify(msg) {
    const el = document.getElementById('toast');
    if (el) {
      el.textContent = msg;
      el.classList.remove('hidden');
      clearTimeout(el._radarTranslateT);
      el._radarTranslateT = setTimeout(() => el.classList.add('hidden'), 4200);
      return;
    }
    console.info(msg);
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
   * iu / ike → Inuktut si présent.
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
      const lower = String(tag || '').toLowerCase();
      const primary = normalizeBrowserLang(tag);
      if (!primary) continue;
      // Français ou anglais → garder le bilingue, ne pas traduire.
      if (primary === 'fr' || primary === 'en') {
        return DEFAULT_MODE;
      }
      // Inuktut / Inuktitut
      if (primary === 'iu' || primary === 'ike' || lower.startsWith('iu-')) {
        return lower.includes('latn') ? 'iu-latn' : 'iu';
      }
      // Langue au menu mais pas encore supportée par le moteur → ne pas auto-traduire
      if (MODES[primary]?.unavailable) {
        continue;
      }
      // Autre langue → traduire vers celle-ci (première de la liste).
      if (MODES[primary] && MODES[primary].goog) return primary;
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
        if (raw === 'iu-latn') return 'iu-latn';
        if (MODES[raw] && !MODES[raw].unavailable) return raw;
        if (isValidLangCode(raw) && raw !== 'fr' && raw !== 'en') return raw;
        // Préférence invalide ou langue pas encore supportée → détection
      } catch { /* fall through */ }
    }
    return detectBrowserAutoMode();
  }

  function setMode(mode) {
    if (MODES[mode]?.unavailable) return getMode();
    if (mode !== DEFAULT_MODE && !MODES[mode] && !isValidLangCode(mode) && mode !== 'iu-latn') {
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
    if (MODES[mode]?.unavailable) {
      notify(
        `${MODES[mode].label} : la traduction automatique n’est pas encore offerte `
        + 'pour cette langue autochtone. La page reste en original bilingue.',
      );
      // Ne pas changer le mode actif
      return;
    }

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

  function buildMenu() {
    const menu = document.getElementById('translate-menu');
    if (!menu) return;

    const frag = document.createDocumentFragment();
    let lastGroup = '';

    for (const id of MENU_ORDER) {
      const m = MODES[id];
      if (!m) continue;
      const group = m.group || 'other';

      if (group !== lastGroup) {
        if (group === 'indigenous') {
          const sep = document.createElement('div');
          sep.className = 'translate-menu__sep';
          sep.setAttribute('role', 'presentation');
          sep.innerHTML = '<span class="translate-menu__sep-label">Langues autochtones du Québec</span>';
          frag.appendChild(sep);
        } else if (group === 'other' && lastGroup === 'indigenous') {
          const sep = document.createElement('div');
          sep.className = 'translate-menu__sep';
          sep.setAttribute('role', 'presentation');
          sep.innerHTML = '<span class="translate-menu__sep-label">Autres langues</span>';
          frag.appendChild(sep);
        }
        lastGroup = group;
      }

      const opt = document.createElement('button');
      opt.type = 'button';
      opt.role = 'option';
      opt.className = 'translate-menu__opt'
        + (id === DEFAULT_MODE ? ' is-active' : '')
        + (m.unavailable ? ' is-unavailable' : '');
      opt.dataset.mode = id;
      opt.setAttribute('aria-selected', id === DEFAULT_MODE ? 'true' : 'false');
      if (m.unavailable) {
        opt.setAttribute('aria-disabled', 'true');
        opt.title = m.title;
      }
      opt.innerHTML = `<span class="translate-menu__name">${escapeHtml(m.label)}</span>`
        + `<span class="translate-menu__hint">${escapeHtml(m.hint || '')}</span>`;
      frag.appendChild(opt);
    }

    menu.replaceChildren(frag);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function bindUi() {
    const btn = document.getElementById('translate-toggle');
    const menu = document.getElementById('translate-menu');
    if (!btn || !menu) return;

    buildMenu();

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    menu.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-mode]');
      if (!opt || !menu.contains(opt)) return;
      e.stopPropagation();
      const mode = opt.dataset.mode;
      closeMenu();
      if (mode) applyMode(mode, { persist: true });
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

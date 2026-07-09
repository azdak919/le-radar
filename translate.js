/**
 * LE RADAR — traduction de page.
 *
 * Règles :
 *  1. Préférence utilisateur (localStorage) si elle existe — y compris « Original ».
 *     Un choix manuel s'applique TOUJOURS, quelle que soit la langue du navigateur.
 *  2. Sinon, langue du navigateur :
 *     - fr* ou en*  → Original bilingue (pas de traduction auto)
 *     - toute autre → traduction auto vers cette langue
 *
 * Moteur : cookie googtrans + Google Website Translator + rechargement
 * (méthode la plus fiable ; le combo JS seul échoue souvent).
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'radar-translate-mode';
  const DEFAULT_MODE = 'original';

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
      label: "Mi'kmaq",
      short: 'MIC',
      title: "Mi'kmaq — pas encore disponible en traduction automatique",
      hint: "Mi'kmaq · bientôt",
      group: 'indigenous',
      unavailable: true,
    },
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

  const MENU_ORDER = [
    'original', 'fr', 'en',
    'iu', 'iu-latn', 'cr', 'moe', 'atj', 'alq', 'moh', 'mic',
    'es', 'pt', 'ht', 'ar', 'zh', 'de', 'it',
  ];

  // Codes exacts attendus par le widget Google (Inuktut = iu / iu-Latn).
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
    return typeof code === 'string' && /^[a-z]{2}(?:-[A-Za-z]{2,8})?$/.test(code);
  }

  function normalizeBrowserLang(tag) {
    const raw = String(tag || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw.startsWith('zh')) return 'zh';
    return raw.split('-')[0] || '';
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
      if (primary === 'fr' || primary === 'en') return DEFAULT_MODE;
      if (primary === 'iu' || primary === 'ike' || lower.startsWith('iu')) {
        return lower.includes('latn') ? 'iu-latn' : 'iu';
      }
      if (MODES[primary]?.unavailable) continue;
      if (MODES[primary]?.goog) return primary;
      if (isValidLangCode(primary)) return primary;
    }
    return DEFAULT_MODE;
  }

  function getMode() {
    if (hasUserPreference()) {
      try {
        const raw = (localStorage.getItem(STORAGE_KEY) || '').toLowerCase().trim();
        if (raw === DEFAULT_MODE) return DEFAULT_MODE;
        if (raw === 'iu-latn') return 'iu-latn';
        if (MODES[raw] && !MODES[raw].unavailable) return raw;
        if (isValidLangCode(raw) && raw !== 'fr' && raw !== 'en') return raw;
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

  /** Chemins cookie : / et préfixe projet GitHub Pages (/radios-etudiantes-qc/). */
  function cookiePaths() {
    const paths = new Set(['/']);
    const segs = location.pathname.split('/').filter(Boolean);
    // /radios-etudiantes-qc/… → cookie aussi sur le sous-chemin du projet
    if (segs.length >= 1) {
      paths.add(`/${segs[0]}/`);
    }
    return [...paths];
  }

  function cookieDomains() {
    const host = location.hostname;
    const domains = ['']; // host-only
    if (!host || host === 'localhost' || host === '127.0.0.1') return domains;
    domains.push(host);
    if (host.includes('.')) {
      domains.push(`.${host}`);
      const parts = host.split('.');
      if (parts.length >= 2) domains.push(`.${parts.slice(-2).join('.')}`);
    }
    return domains;
  }

  function clearGoogTransCookies() {
    const expire = 'Thu, 01 Jan 1970 00:00:00 GMT';
    for (const d of cookieDomains()) {
      for (const p of cookiePaths()) {
        const domainPart = d ? `; domain=${d}` : '';
        document.cookie = `googtrans=; expires=${expire}; path=${p}${domainPart}`;
      }
    }
  }

  function setGoogTransCookie(targetLang) {
    clearGoogTransCookies();
    if (!targetLang) return;
    // /auto/LANG : source détectée par bloc (fil bilingue FR+EN).
    const value = `/auto/${targetLang}`;
    for (const p of cookiePaths()) {
      document.cookie = `googtrans=${value}; path=${p}; max-age=31536000; SameSite=Lax`;
    }
    // Domaine host explicite (github.io)
    const host = location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      for (const p of cookiePaths()) {
        document.cookie = `googtrans=${value}; path=${p}; domain=${host}; max-age=31536000; SameSite=Lax`;
      }
    }
  }

  function readGoogTransTarget() {
    const m = document.cookie.match(/(?:^|;\s*)googtrans=\/[^/;]*\/([^;]+)/i);
    return m ? decodeURIComponent(m[1]).trim() : '';
  }

  function isPageTranslated() {
    const b = document.body;
    if (!b) return false;
    return /translated/.test(b.className || '')
      || !!b.classList?.contains('translated-ltr')
      || !!b.classList?.contains('translated-rtl')
      || !!document.documentElement.classList?.contains('translated-ltr');
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
    }
    document.documentElement.dataset.translate = mode;
    if (mode === 'en') document.documentElement.lang = 'en-CA';
    else if (mode === 'fr') document.documentElement.lang = 'fr-CA';
    else if (mode === 'ar') document.documentElement.lang = 'ar';
    else if (mode === 'zh') document.documentElement.lang = 'zh-Hans';
    else if (mode === 'iu' || mode === 'iu-latn') document.documentElement.lang = 'iu';
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
    const select = document.querySelector('select.goog-te-combo');
    if (!select || !select.options || !select.options.length) return false;
    const want = String(lang || '');
    let found = null;
    for (const opt of select.options) {
      const v = opt.value || '';
      if (
        v === want
        || v.toLowerCase() === want.toLowerCase()
        || (want === 'zh-CN' && /^zh/i.test(v))
        || (want === 'iu-Latn' && /^iu-?latn$/i.test(v))
        || (want === 'iu' && (v === 'iu' || v.toLowerCase() === 'iu'))
      ) {
        found = opt.value;
        break;
      }
    }
    if (found == null) return false;
    if (select.value !== found) {
      select.value = found;
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
        // pageLanguage 'fr' = UI site en français ; multilanguagePage pour le fil bilingue.
        // eslint-disable-next-line no-new
        new window.google.translate.TranslateElement(
          {
            pageLanguage: 'fr',
            includedLanguages: GOOG_INCLUDED,
            autoDisplay: false,
            multilanguagePage: true,
            layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE,
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

    if (document.querySelector('script[data-radar-gt]')) {
      // Script déjà demandé ; attendre le callback
      return;
    }

    const s = document.createElement('script');
    s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    s.async = true;
    s.dataset.radarGt = '1';
    s.onerror = () => {
      gtLoading = false;
      notify('Traduction indisponible (réseau ou bloqueur). Réessayez sans bloqueur de pubs.');
      console.warn('Could not load Google Translate');
    };
    document.head.appendChild(s);
  }

  /**
   * Applique une langue.
   * Choix manuel (persist=true) : cookie + reload systématique (fiable).
   * Init au chargement : charge le widget si cookie déjà posé.
   */
  function applyMode(mode, { persist = true, fromUserClick = false } = {}) {
    if (MODES[mode]?.unavailable) {
      notify(
        `${MODES[mode].label} : la traduction automatique n’est pas encore offerte `
        + 'pour cette langue autochtone. La page reste en original bilingue.',
      );
      return;
    }

    if (persist) mode = setMode(mode);
    else if (!mode) mode = DEFAULT_MODE;

    updateUi(mode);

    // ── Original : purger + recharger si besoin ──
    if (mode === DEFAULT_MODE) {
      const hadCookie = !!readGoogTransTarget();
      const wasTranslated = isPageTranslated();
      clearGoogTransCookies();
      if ((hadCookie || wasTranslated) && fromUserClick) {
        location.reload();
        return;
      }
      if ((hadCookie || wasTranslated) && !fromUserClick) {
        // Cookie orphelin au load : recharger une fois pour DOM propre
        if (!sessionStorage.getItem('radar-translate-cleared')) {
          sessionStorage.setItem('radar-translate-cleared', '1');
          location.reload();
        }
      }
      return;
    }

    const target = googCodeForMode(mode);
    if (!target) {
      notify('Code de langue inconnu.');
      return;
    }

    const cookieTarget = readGoogTransTarget();
    const cookieOk = cookieTarget.toLowerCase() === String(target).toLowerCase()
      || cookieTarget.replace(/_/g, '-').toLowerCase() === String(target).replace(/_/g, '-').toLowerCase();

    // ── Choix manuel : toujours cookie + reload (ignore la langue du navigateur) ──
    if (fromUserClick) {
      setGoogTransCookie(target);
      sessionStorage.removeItem('radar-translate-cleared');
      // Rechargement pour que Google applique googtrans avant le paint.
      location.reload();
      return;
    }

    // ── Chargement initial avec préférence non-originale ──
    if (!cookieOk) {
      setGoogTransCookie(target);
      // Cookie venait d'être posé sans reload (ex. auto navigateur) → recharger
      location.reload();
      return;
    }

    // Cookie déjà correct : charger le widget pour activer la traduction
    loadGoogleTranslate(() => {
      let tries = 0;
      const tick = () => {
        tries += 1;
        if (applyComboValue(target) || isPageTranslated()) return;
        if (tries < 30) {
          window.setTimeout(tick, 150);
          return;
        }
        // Dernier recours : re-forcer le cookie et recharger une seule fois
        if (!sessionStorage.getItem('radar-translate-retry')) {
          sessionStorage.setItem('radar-translate-retry', '1');
          setGoogTransCookie(target);
          location.reload();
        } else {
          sessionStorage.removeItem('radar-translate-retry');
          notify('Traduction non appliquée. Vérifiez les cookies du site ou un bloqueur.');
        }
      };
      window.setTimeout(tick, 100);
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
      opt.setAttribute('role', 'option');
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
      // Clic utilisateur : toujours forcer (persist + reload), même si navigateur en FR
      if (mode) applyMode(mode, { persist: true, fromUserClick: true });
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

    // Préférence déjà posée + cookie → le rechargement après clic appliquera GT
    if (mode === DEFAULT_MODE) {
      if (readGoogTransTarget() || isPageTranslated()) {
        clearGoogTransCookies();
        if (isPageTranslated() && !sessionStorage.getItem('radar-translate-cleared')) {
          sessionStorage.setItem('radar-translate-cleared', '1');
          location.reload();
        }
      }
      return;
    }

    // Mode traduit (choix user ou auto non-FR/EN)
    sessionStorage.removeItem('radar-translate-cleared');
    applyMode(mode, {
      persist: fromUser,
      fromUserClick: false,
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

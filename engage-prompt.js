/**
 * LE-RADAR.ca — invitations douces multi-appareil / multi-plateforme
 * (non bloquantes, anti-irritation).
 *
 * Objectifs (best practices web.dev / MDN / UX PWA) :
 *  1. Mobile : installer la PWA / écran d’accueil (étapes par OS + navigateur)
 *  2. Bureau : installer la PWA si le navigateur le permet, sinon
 *     guide page d’accueil + page de nouvel onglet / démarrage
 *
 * Timing (ne pas achaler) :
 *  - jamais à la 1ʳᵉ visite ni dans les ~12 s de la 1ʳᵉ paint
 *  - à partir de la 2ᵉ session (≥ 6 h d’écart) + un signal d’engagement
 *    (écoute radio, scroll fil, clic article, ou ~40 s sur la page)
 *  - un seul bandeau par chargement de page
 *  - snooze 7 j ; « Non merci » = dismiss permanent par type (focus-group B)
 *  - rien si déjà installé (standalone / minimal-ui / iOS standalone)
 *  - pas de mini-barre Chrome immédiate (beforeinstallprompt preventDefault)
 *  - file d’attente douce : install d’abord, puis home/new-tab plus tard
 *    (jamais les deux le même jour si l’utilisateur a déjà interagi)
 *
 * Un Worker n’aide pas ici (détection 100 % client, pas d’API serveur
 * d’installation) — toute la logique reste locale.
 */
(function () {
  'use strict';

  if (document.documentElement.dataset.embed === 'tuner') return;

  const STORAGE_KEY = 'radar-engage-v2';
  const LEGACY_KEY = 'radar-engage-v1';
  const SESSION_GAP_MS = 6 * 60 * 60 * 1000; // 6 h = nouvelle « visite »
  const MIN_VISITS = 2;
  const MIN_DWELL_MS = 40 * 1000;
  const SHOW_DELAY_MS = 2400;
  const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
  const FIRST_PAINT_GRACE_MS = 12 * 1000;
  /** Après un install accepté / « c’est fait », attendre avant home. */
  const POST_INSTALL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
  const SITE_URL = 'https://le-radar.ca';

  let deferredInstall = null;
  let engaged = false;
  let shownThisPage = false;
  let cardEl = null;
  let pageLoadedAt = Date.now();

  // ─── Persistance ──────────────────────────────────────────────────────────

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) || {};
      // Migration douce depuis v1 (conserve les refus / snoozes).
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const s = JSON.parse(legacy) || {};
        saveState(s);
        return s;
      }
    } catch { /* private mode */ }
    return {};
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* private mode */ }
  }

  function touchVisit() {
    const s = loadState();
    const now = Date.now();
    if (!s.firstVisitAt) s.firstVisitAt = now;
    const last = s.lastVisitAt || 0;
    if (!s.visitCount) s.visitCount = 0;
    if (now - last >= SESSION_GAP_MS) {
      s.visitCount += 1;
      s.lastVisitAt = now;
      saveState(s);
    } else if (!s.lastVisitAt) {
      s.visitCount = Math.max(1, s.visitCount);
      s.lastVisitAt = now;
      saveState(s);
    }
    return s;
  }

  function isSnoozed(bucket) {
    const s = loadState();
    const b = s[bucket] || {};
    if (b.dismissedForever) return true;
    if (b.done) return true;
    if (b.snoozeUntil && Date.now() < b.snoozeUntil) return true;
    return false;
  }

  function markSnooze(bucket) {
    const s = loadState();
    s[bucket] = { ...(s[bucket] || {}), snoozeUntil: Date.now() + SNOOZE_MS };
    saveState(s);
  }

  function markForever(bucket) {
    const s = loadState();
    s[bucket] = { ...(s[bucket] || {}), dismissedForever: true };
    saveState(s);
  }

  function markDone(bucket) {
    const s = loadState();
    const now = Date.now();
    s[bucket] = { ...(s[bucket] || {}), done: true, doneAt: now };
    if (bucket === 'install') s.installDoneAt = now;
    saveState(s);
  }

  // ─── Environnement (simulation multi-device / multi-plateforme) ───────────

  /**
   * Profil appareil + navigateur. Tout le copy et la priorité des prompts
   * branchent sur ce profil — un seul code path, des guides ciblés.
   */
  /**
   * Brave se présente comme Chrome dans l'UA : seul `navigator.brave.isBrave()`
   * le distingue, et il rend une promesse. On mémorise le verdict à l'init ;
   * avant sa résolution, Brave reste traité comme Chrome — ce qui n'est faux
   * que sur le libellé du navigateur, jamais sur la capacité d'installer.
   */
  let braveDetected = false;
  function detectBrave() {
    try {
      const probe = navigator.brave?.isBrave;
      if (typeof probe !== 'function') return;
      Promise.resolve(probe.call(navigator.brave))
        .then((yes) => { braveDetected = !!yes; })
        .catch(() => { /* ignore */ });
    } catch { /* ignore */ }
  }

  /**
   * Classification pure (tests + detectPlatform).
   *
   * Un tactile seul (`pointer: coarse`) ne fait pas un téléphone : le Flex 5
   * 2-en-1 + Philips 1920 + Edge se faisait classer `mobile_other` et proposait
   * « écran d’accueil » au lieu d’installer la PWA bureau.
   * ≥1024 px et pas iOS/Android = bureau, même avec écran tactile.
   */
  function classifyPlatform(input = {}) {
    const ua = String(input.ua || '');
    const iPadOs = input.platform === 'MacIntel' && Number(input.maxTouchPoints) > 1;
    const ios = /iPhone|iPad|iPod/i.test(ua) || iPadOs;
    const android = /Android/i.test(ua);
    const coarse = !!input.coarse;
    const narrow = !!input.narrow;
    const desktopWide = !!input.desktopWide;
    const notAPhoneViewport = input.notAPhoneViewport != null
      ? !!input.notAPhoneViewport
      : desktopWide;
    const ontouchstart = !!input.ontouchstart;
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);

    let mobileLike = ios || android || coarse || mobileUa
      || (narrow && ontouchstart);
    if (notAPhoneViewport && !ios && !android) {
      mobileLike = false;
    }

    let browser = 'other';
    if (/SamsungBrowser/i.test(ua)) browser = 'samsung';
    else if (/Edg\//.test(ua)) browser = 'edge';
    else if (/OPR\/|Opera/i.test(ua)) browser = 'opera';
    else if (/Firefox\//.test(ua) || /FxiOS\//.test(ua)) browser = 'firefox';
    else if (/CriOS\//.test(ua)) browser = 'chrome_ios';
    else if (input.brave && /Chrome\//.test(ua)) browser = 'brave';
    else if (/Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua)) browser = 'chrome';
    else if (/Safari\//.test(ua) && !/Chrome\//.test(ua) && !/CriOS\//.test(ua)) browser = 'safari';

    let family = 'desktop';
    if (ios) family = 'ios';
    else if (android) family = 'android';
    else if (mobileLike) family = 'mobile_other';

    const standalone = !!input.standalone;
    const iosNonSafari = family === 'ios' && browser !== 'safari';
    const canNativeInstall = !ios && !iosNonSafari;

    return {
      family,
      browser,
      mobileLike,
      desktop: !mobileLike && desktopWide,
      ios,
      android,
      iosNonSafari,
      standalone,
      canNativeInstall,
      browserLabel: ({
        chrome: 'Chrome',
        chrome_ios: 'Chrome',
        brave: 'Brave',
        edge: 'Edge',
        firefox: 'Firefox',
        safari: 'Safari',
        samsung: 'Samsung Internet',
        opera: 'Opera',
        other: '',
      })[browser] || '',
    };
  }

  function detectPlatform() {
    const ua = navigator.userAgent || '';
    const coarse = (() => {
      try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
    })();
    const narrow = (() => {
      try { return window.matchMedia('(max-width: 820px)').matches; } catch { return false; }
    })();
    const desktopWide = (() => {
      try { return window.matchMedia('(min-width: 900px)').matches; } catch { return true; }
    })();
    const notAPhoneViewport = (() => {
      try { return window.matchMedia('(min-width: 1024px)').matches; } catch { return desktopWide; }
    })();
    let standalone = false;
    try { standalone = isStandalone(); } catch { /* ignore */ }
    return classifyPlatform({
      ua,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      coarse,
      narrow,
      desktopWide,
      notAPhoneViewport,
      ontouchstart: 'ontouchstart' in window,
      brave: braveDetected,
      standalone,
    });
  }

  function isStandalone() {
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
      if (window.matchMedia('(display-mode: window-controls-overlay)').matches) return true;
      if (navigator.standalone === true) return true;
    } catch { /* ignore */ }
    return false;
  }

  function uiLang() {
    try {
      const m = window.RadarTranslate?.getMode?.();
      if (m === 'en') return 'en';
    } catch { /* ignore */ }
    return 'fr';
  }

  // ─── Engagement ───────────────────────────────────────────────────────────

  function markEngaged() {
    if (engaged) return;
    engaged = true;
    scheduleMaybeShow();
  }

  function bindEngagement() {
    window.setTimeout(markEngaged, MIN_DWELL_MS);

    const audio = document.getElementById('radar-player');
    if (audio) {
      const onPlay = () => {
        window.setTimeout(markEngaged, 8000);
        audio.removeEventListener('playing', onPlay);
      };
      audio.addEventListener('playing', onPlay);
    }
    document.getElementById('tuner-play')?.addEventListener('click', () => {
      window.setTimeout(markEngaged, 5000);
    }, { once: true });

    let scrolled = false;
    window.addEventListener('scroll', () => {
      if (scrolled) return;
      if ((window.scrollY || document.documentElement.scrollTop) > 420) {
        scrolled = true;
        markEngaged();
      }
    }, { passive: true });

    document.getElementById('news-list')?.addEventListener('click', (e) => {
      if (e.target.closest?.('a.article, .article a[href]')) markEngaged();
    }, { once: true });
  }

  // ─── Guides par plateforme ────────────────────────────────────────────────

  function installSteps(plat) {
    const en = uiLang() === 'en';
    const { family, browser } = plat;

    if (family === 'ios') {
      if (browser === 'chrome_ios' || browser === 'firefox' || browser === 'edge' || browser === 'opera') {
        return en
          ? [
            'On iPhone/iPad, install works best from <strong>Safari</strong>.',
            'Open this page in Safari, then tap <strong>Share</strong> (□↑).',
            'Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.',
          ]
          : [
            'Sur iPhone/iPad, l’installation se fait depuis <strong>Safari</strong>.',
            'Ouvrez cette page dans Safari, puis touchez <strong>Partager</strong> (□↑).',
            'Choisissez <strong>Sur l’écran d’accueil</strong>, puis <strong>Ajouter</strong>.',
          ];
      }
      return en
        ? [
          'Tap the <strong>Share</strong> button (square with arrow).',
          'Scroll and choose <strong>Add to Home Screen</strong>.',
          'Confirm <strong>Add</strong> — LE-RADAR.ca opens like an app.',
        ]
        : [
          'Touchez le bouton <strong>Partager</strong> (carré avec flèche).',
          'Faites défiler et choisissez <strong>Sur l’écran d’accueil</strong>.',
          'Validez <strong>Ajouter</strong> — LE-RADAR.ca s’ouvre comme une app.',
        ];
    }

    /*
     * `mobile_other` couvre les téléphones dont l'UA ne dit ni Android ni iOS
     * (UA réduits, navigateurs alternatifs). Sans cette branche il retombait
     * plus bas sur les consignes BUREAU — « dans la barre d'adresse, cliquez
     * l'icône Installer » lu sur un téléphone, constaté à l'écran.
     */
    if (family === 'android' || family === 'mobile_other') {
      if (browser === 'samsung') {
        return en
          ? [
            'Tap the menu <strong>☰</strong> (bottom or top bar).',
            'Choose <strong>Add page to</strong> → <strong>Home screen</strong>.',
            'Confirm — the icon appears next to your other apps.',
          ]
          : [
            'Touchez le menu <strong>☰</strong> (barre bas ou haut).',
            'Choisissez <strong>Ajouter la page à</strong> → <strong>Écran d’accueil</strong>.',
            'Validez — l’icône rejoint vos autres apps.',
          ];
      }
      if (browser === 'firefox') {
        return en
          ? [
            'Tap the menu <strong>⋮</strong>.',
            'Choose <strong>Install</strong> or <strong>Add to Home screen</strong>.',
            'Confirm — LE-RADAR.ca is one tap away.',
          ]
          : [
            'Touchez le menu <strong>⋮</strong>.',
            'Choisissez <strong>Installer</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.',
            'Validez — LE-RADAR.ca est à un doigt.',
          ];
      }
      if (browser === 'brave') {
        return en
          ? [
            'Tap the browser menu <strong>⋮</strong>.',
            'Choose <strong>Add to Home screen</strong> (Brave installs from there).',
            'Confirm — the icon joins your other apps.',
          ]
          : [
            'Touchez le menu <strong>⋮</strong> du navigateur.',
            'Choisissez <strong>Ajouter à l’écran d’accueil</strong> (Brave installe depuis là).',
            'Validez — l’icône rejoint vos autres apps.',
          ];
      }
      // Chrome / Edge / Opera Android (et défaut)
      return en
        ? [
          'Tap the browser menu <strong>⋮</strong> (or the install icon in the address bar).',
          'Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.',
          'Confirm — the icon joins your other apps.',
        ]
        : [
          'Touchez le menu <strong>⋮</strong> (ou l’icône d’install dans la barre d’adresse).',
          'Choisissez <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.',
          'Validez — l’icône rejoint vos autres apps.',
        ];
    }

    // Desktop manual install (sans beforeinstallprompt)
    if (browser === 'edge') {
      return en
        ? [
          'Open the address-bar <strong>App available</strong> icon, or menu <strong>…</strong> → <strong>Apps</strong>.',
          'Choose <strong>Install this site as an app</strong>.',
          'Pin it to the taskbar or Start if you like.',
        ]
        : [
          'Icône <strong>Application disponible</strong> dans la barre d’adresse, ou menu <strong>…</strong> → <strong>Applications</strong>.',
          'Choisissez <strong>Installer ce site en tant qu’application</strong>.',
          'Épinglez-la à la barre des tâches ou au menu Démarrer si vous voulez.',
        ];
    }
    if (browser === 'chrome' || browser === 'brave' || browser === 'opera') {
      return en
        ? [
          'In the address bar, click the <strong>Install</strong> icon (⊕ / computer+arrow),',
          'or menu <strong>⋮</strong> → <strong>Install LE-RADAR.ca…</strong> / <strong>Cast, save, and share</strong>.',
          'Confirm Install — opens in its own window.',
        ]
        : [
          'Dans la barre d’adresse, cliquez l’icône <strong>Installer</strong> (⊕ / ordinateur+flèche),',
          'ou menu <strong>⋮</strong> → <strong>Installer LE-RADAR.ca…</strong>.',
          'Validez — l’app s’ouvre dans sa propre fenêtre.',
        ];
    }
    return en
      ? [
        'Open your browser menu.',
        'Look for <strong>Install app</strong> or <strong>Add to Home screen</strong>.',
        'If your browser doesn’t support install, use the homepage tip instead.',
      ]
      : [
        'Ouvrez le menu de votre navigateur.',
        'Cherchez <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.',
        'Si l’option n’existe pas, utilisez plutôt le guide page d’accueil.',
      ];
  }

  /**
   * Guide « au démarrage » — focus-group le-radar-engage-home-guide (C) :
   * un seul job, **max 2 steps**, coller l’adresse (primary = Copier).
   * Pas de tip glisser-déposer, pas de monologue nouvel onglet.
   */
  function homeAndNewTabSteps(plat) {
    const en = uiLang() === 'en';
    const { browser } = plat;

    if (browser === 'chrome') {
      return en
        ? [
          'Settings (⋮) → <strong>On startup</strong> → open a specific page',
          'Add the address (paste)',
        ]
        : [
          'Paramètres (⋮) → <strong>Au démarrage</strong> → ouvrir une page précise',
          'Ajoutez l’adresse (collez)',
        ];
    }

    if (browser === 'edge') {
      return en
        ? [
          'Settings (…) → <strong>Start, home, and new tabs</strong>',
          '<strong>When Edge starts</strong> → open these pages → paste the address',
        ]
        : [
          'Paramètres (…) → <strong>Démarrage, accueil et nouveaux onglets</strong>',
          '<strong>Au démarrage d’Edge</strong> → ouvrir ces pages → collez l’adresse',
        ];
    }

    if (browser === 'firefox') {
      return en
        ? [
          'Menu ☰ → <strong>Settings</strong> → <strong>Home</strong>',
          '<strong>Homepage</strong> → Custom URLs → paste the address',
        ]
        : [
          'Menu ☰ → <strong>Paramètres</strong> → <strong>Accueil</strong>',
          '<strong>Page d’accueil</strong> → adresses personnalisées → collez l’adresse',
        ];
    }

    if (browser === 'safari') {
      return en
        ? [
          'Safari → <strong>Settings…</strong> → <strong>General</strong>',
          'Set <strong>Homepage</strong> → paste the address',
        ]
        : [
          'Safari → <strong>Réglages…</strong> → <strong>Général</strong>',
          'Champ <strong>Page d’accueil</strong> → collez l’adresse',
        ];
    }

    if (browser === 'opera') {
      return en
        ? [
          'Settings → <strong>On startup</strong> → open a specific page',
          'Paste the address',
        ]
        : [
          'Paramètres → <strong>Au démarrage</strong> → page spécifique',
          'Collez l’adresse',
        ];
    }

    return en
      ? [
        'Open browser settings → homepage or on startup',
        'Paste the address',
      ]
      : [
        'Paramètres du navigateur → page d’accueil ou au démarrage',
        'Collez l’adresse',
      ];
  }

  async function copySiteUrl() {
    const url = SITE_URL;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return true;
      }
    } catch { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  function closeCard() {
    if (!cardEl) return;
    cardEl.classList.add('is-leaving');
    const el = cardEl;
    cardEl = null;
    window.setTimeout(() => el.remove(), 280);
  }

  function renderCard({
    kind, title, body, steps, primaryLabel, onPrimary, showPrimary, icon,
    confirmLabel, onConfirm,
  }) {
    closeCard();
    const lang = uiLang();
    const root = document.createElement('div');
    root.className = 'engage-prompt';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-labelledby', 'engage-prompt-title');
    root.dataset.kind = kind;

    const stepsHtml = steps?.length
      ? `<ol class="engage-prompt__steps">${steps.map((s) => `<li>${s}</li>`).join('')}</ol>`
      : '';

    const glyph = icon
      || (kind === 'install' ? '📲' : kind === 'home' ? '🏠' : '✨');

    const confirmHtml = confirmLabel
      ? `<button type="button" class="engage-prompt__btn" data-act="confirm">${confirmLabel}</button>`
      : '';

    root.innerHTML = `
      <div class="engage-prompt__inner">
        <button type="button" class="engage-prompt__close" aria-label="${lang === 'en' ? 'Dismiss' : 'Fermer'}">×</button>
        <div class="engage-prompt__icon" aria-hidden="true">${glyph}</div>
        <div class="engage-prompt__copy">
          <p id="engage-prompt-title" class="engage-prompt__title">${title}</p>
          <p class="engage-prompt__body">${body}</p>
          ${stepsHtml}
        </div>
        <div class="engage-prompt__actions">
          ${showPrimary !== false
            ? `<button type="button" class="engage-prompt__btn engage-prompt__btn--primary" data-act="primary">${primaryLabel}</button>`
            : ''}
          ${confirmHtml}
          <button type="button" class="engage-prompt__btn" data-act="later">${lang === 'en' ? 'Later' : 'Plus tard'}</button>
          <button type="button" class="engage-prompt__btn engage-prompt__btn--quiet" data-act="never">${lang === 'en' ? 'No thanks' : 'Non merci'}</button>
        </div>
      </div>
    `;

    const snoozeKind = (k) => {
      markSnooze(k);
      // Compat v1 + alias home ↔ homepage
      if (k === 'home') markSnooze('homepage');
      if (k === 'homepage') markSnooze('home');
    };
    const foreverKind = (k) => {
      markForever(k);
      if (k === 'home') markForever('homepage');
      if (k === 'homepage') markForever('home');
    };

    root.querySelector('.engage-prompt__close')?.addEventListener('click', () => {
      snoozeKind(kind);
      closeCard();
    });
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        snoozeKind(kind);
        closeCard();
      }
    });
    root.querySelector('[data-act="later"]')?.addEventListener('click', () => {
      snoozeKind(kind);
      closeCard();
    });
    root.querySelector('[data-act="never"]')?.addEventListener('click', () => {
      foreverKind(kind);
      closeCard();
    });
    root.querySelector('[data-act="primary"]')?.addEventListener('click', async () => {
      try {
        await onPrimary?.();
      } catch { /* ignore */ }
    });
    root.querySelector('[data-act="confirm"]')?.addEventListener('click', async () => {
      try {
        await onConfirm?.();
      } catch { /* ignore */ }
    });

    document.body.appendChild(root);
    cardEl = root;
    requestAnimationFrame(() => root.classList.add('is-visible'));
  }

  function currentAppLabel(lang) {
    // APPS is defined later; fall back safely during soft-prompt before wire.
    try {
      const id = (typeof currentAppId === 'function') ? currentAppId() : 'radar';
      const app = (typeof APPS !== 'undefined' && APPS[id]) ? APPS[id] : null;
      if (app) return app.label[lang === 'en' ? 'en' : 'fr'];
    } catch { /* ignore */ }
    return 'LE-RADAR.ca';
  }

  /**
   * Corps install — focus-group `le-radar-engage-copy` (option B + reconvene triade) :
   * une ligne bénéfice campus ; triade marque journaux + radios + sports sur le hub.
   * Pas de jargon boutique ni offline gonflé.
   */
  function installBodyCopy(lang, appId) {
    if (appId === 'pomo') {
      return lang === 'en'
        ? 'Focus timer, quotes and Québec wallpapers — one tap away.'
        : 'Minuteur focus, citations et fonds québécois — en un geste.';
    }
    if (appId === 'solitaire') {
      return lang === 'en'
        ? 'Klondike solitaire with student radio — one tap away.'
        : 'Solitaire Klondike avec radio étudiante — en un geste.';
    }
    if (appId === 'sports') {
      return lang === 'en'
        ? 'Québec college and university scores — one tap away.'
        : 'Scores collégiaux et universitaires du Québec — en un geste.';
    }
    // Hub radar — triade marque (verdict B reconvene 2026-08-11).
    return lang === 'en'
      ? 'Québec student newspapers, radio and sports — one tap away.'
      : 'Journaux, radios et sports étudiants du Québec — en un geste.';
  }

  /**
   * Carte install native.
   * Mobile : titre spatial « Sur l’écran d’accueil » (focus-group B).
   * Bureau : PWA fenêtre (Edge/Chrome) — pas « écran d’accueil » téléphone.
   */
  function renderNativeInstallCard(lang, appId, plat) {
    const desktop = !!(plat && plat.desktop);
    renderCard({
      kind: 'install',
      icon: desktop ? '⬇' : '📲',
      title: desktop
        ? (lang === 'en' ? 'Install this app' : 'Installer l’application')
        : (lang === 'en' ? 'Add to Home Screen' : 'Sur l’écran d’accueil'),
      body: installBodyCopy(lang, appId),
      primaryLabel: desktop
        ? (lang === 'en' ? 'Install' : 'Installer')
        : (lang === 'en' ? 'Add' : 'Ajouter'),
      onPrimary: async () => {
        const ev = deferredInstall;
        deferredInstall = null;
        if (!ev) return;
        ev.prompt();
        const choice = await ev.userChoice.catch(() => ({ outcome: 'dismissed' }));
        if (choice?.outcome === 'accepted') markDone('install');
        else markSnooze('install');
        closeCard();
      },
    });
  }

  async function showInstallPrompt(plat) {
    const lang = uiLang();
    const appId = (typeof currentAppId === 'function') ? currentAppId() : 'radar';
    const canNative = !!deferredInstall && plat.canNativeInstall && !plat.ios;

    if (canNative) {
      renderNativeInstallCard(lang, appId, plat);
      return;
    }

    /*
     * Guide manuel affiché, mais le navigateur peut encore devenir capable :
     * Chromium n'émet `beforeinstallprompt` qu'une fois le manifeste lu et le
     * worker jugé éligible, parfois après notre délai de garde. La carte était
     * figée — on tombait sur des consignes manuelles alors qu'un vrai bouton
     * d'installation était à une seconde près. On surclasse donc la carte en
     * place si l'évènement arrive pendant qu'elle est ouverte.
     */
    if (plat.canNativeInstall && !plat.ios) {
      const upgrade = () => {
        window.removeEventListener('beforeinstallprompt', upgrade);
        if (!cardEl || !deferredInstall || isStandalone()) return;
        renderNativeInstallCard(uiLang(), appId, detectPlatform());
      };
      window.addEventListener('beforeinstallprompt', upgrade);
      // La carte fermée, l'écouteur n'a plus de raison d'être.
      window.setTimeout(() => {
        if (!cardEl) window.removeEventListener('beforeinstallprompt', upgrade);
      }, CARD_UPGRADE_WINDOW_MS);
    }

    const steps = installSteps(plat);
    const isIosChromeLike = plat.iosNonSafari;
    // Focus-group B + reconvene triade : même body bénéfice (journaux/radios/sports
    // sur le hub) en natif et en guide manuel ; les steps portent le « comment ».
    // iOS hors Safari : une phrase d’orientation en tête des steps suffit.
    const benefit = installBodyCopy(lang, appId);
    const body = isIosChromeLike
      ? (lang === 'en'
        ? `${benefit} On this device, add from Safari:`
        : `${benefit} Sur cet appareil, ajoutez depuis Safari :`)
      : benefit;
    // Focus-group B : même titre spatial partout (iOS + guide desktop).
    renderCard({
      kind: 'install',
      icon: '📲',
      title: lang === 'en' ? 'Add to Home Screen' : 'Sur l’écran d’accueil',
      body,
      steps,
      primaryLabel: lang === 'en' ? 'Got it' : 'Compris',
      onPrimary: () => {
        // Guide manuel : on marque « done » pour ne pas re-harceler ;
        // l’utilisateur peut encore utiliser « Plus tard » s’il n’a pas fini.
        markDone('install');
        closeCard();
      },
    });
  }

  function showHomePrompt(plat) {
    const lang = uiLang();
    const label = plat.browserLabel;
    // Focus-group le-radar-engage-home-guide (C) + titres le-radar-engage-copy (B)
    const browserName = label || (lang === 'en' ? 'your browser' : 'votre navigateur');
    renderCard({
      kind: 'home',
      icon: '🏠',
      title: lang === 'en'
        ? 'LE-RADAR on startup?'
        : 'LE-RADAR au démarrage ?',
      body: lang === 'en'
        ? `Your browser controls this — in ${browserName}, 2 steps.`
        : `Réglage navigateur uniquement — sous ${browserName}, 2 étapes.`,
      steps: homeAndNewTabSteps(plat),
      primaryLabel: lang === 'en' ? 'Copy address' : 'Copier l’adresse',
      onPrimary: async () => {
        const btn = cardEl?.querySelector('[data-act="primary"]');
        const ok = await copySiteUrl();
        if (btn) {
          const prev = btn.textContent;
          btn.textContent = ok
            ? (lang === 'en' ? 'Copied' : 'Copié')
            : (lang === 'en' ? 'Copy failed' : 'Échec');
          btn.disabled = true;
          window.setTimeout(() => {
            if (!btn.isConnected) return;
            btn.textContent = prev;
            btn.disabled = false;
          }, 1800);
        }
      },
      confirmLabel: lang === 'en' ? 'Done' : 'C’est fait',
      onConfirm: () => {
        markDone('home');
        markDone('homepage');
        closeCard();
      },
    });
  }

  // ─── Décision (file d’attente douce) ──────────────────────────────────────

  function recentlyInstalled() {
    const s = loadState();
    const at = s.installDoneAt || s.install?.doneAt || 0;
    return at && (Date.now() - at) < POST_INSTALL_COOLDOWN_MS;
  }

  function scheduleMaybeShow() {
    if (shownThisPage) return;
    window.setTimeout(maybeShow, SHOW_DELAY_MS);
  }

  function maybeShow() {
    if (shownThisPage || cardEl) return;
    if (Date.now() - pageLoadedAt < FIRST_PAINT_GRACE_MS) {
      window.setTimeout(maybeShow, FIRST_PAINT_GRACE_MS - (Date.now() - pageLoadedAt) + 200);
      return;
    }
    if (!engaged) return;

    const s = loadState();
    if ((s.visitCount || 0) < MIN_VISITS) return;

    const plat = detectPlatform();

    // Déjà en mode app → jamais d’install ; home desktop seulement si pertinent.
    if (plat.standalone) {
      // En standalone mobile, rien à proposer (déjà installé).
      if (plat.mobileLike) return;
      // Desktop « app window » : page d’accueil navigateur n’a plus de sens.
      return;
    }

    // 1) Install PWA — priorité mobile + bureau Chromium si event dispo
    const installOk = !isSnoozed('install');
    const wantMobileInstall = plat.mobileLike && installOk;
    const wantDesktopInstall = plat.desktop && installOk
      && (!!deferredInstall || ['chrome', 'brave', 'edge', 'opera'].includes(plat.browser));

    if (wantMobileInstall || wantDesktopInstall) {
      const tryInstall = () => {
        if (shownThisPage || isStandalone()) return;
        shownThisPage = true;
        showInstallPrompt(detectPlatform());
      };
      // Attendre un peu l’event beforeinstallprompt sur Chromium.
      if (deferredInstall || plat.ios || plat.family === 'android' && plat.browser === 'firefox') {
        tryInstall();
      } else if (plat.mobileLike || plat.desktop) {
        window.setTimeout(() => {
          if (!isSnoozed('install') && !isStandalone()) tryInstall();
        }, deferredInstall ? 0 : 2200);
      }
      return;
    }

    // 2) Accueil + nouvel onglet — bureau seulement, et pas juste après un install
    //    (évite deux nags collés). Mobile : l’écran d’accueil suffit.
    const homeBlocked = isSnoozed('home') || isSnoozed('homepage');
    if (plat.desktop && !homeBlocked && !recentlyInstalled()) {
      shownThisPage = true;
      showHomePrompt(plat);
    }
  }

  // ─── PWA events ───────────────────────────────────────────────────────────

  function bindInstallEvents() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // pas de mini-barre Chrome immédiate
      deferredInstall = e;
      if (engaged) scheduleMaybeShow();
    });

    window.addEventListener('appinstalled', () => {
      deferredInstall = null;
      markDone('install');
      closeCard();
    });
  }

  // ─── Install multi-apps (menu / pied de page) ─────────────────────────────

  /** Racine du site (= dossier de engage-prompt.js), stable depuis /radios/… etc. */
  const SITE_BASE = (() => {
    try {
      const nodes = document.querySelectorAll('script[src*="engage-prompt"]');
      const src = nodes[nodes.length - 1]?.getAttribute('src') || nodes[nodes.length - 1]?.src;
      if (src) return new URL('.', new URL(src, location.href));
    } catch { /* ignore */ }
    // Repli : remonter hors /pomo et /solitaire
    try {
      const u = new URL(location.href);
      u.pathname = u.pathname.replace(/\/(?:pomo|solitaire)(?:\/.*)?$/, '/');
      if (!u.pathname.endsWith('/')) {
        u.pathname = u.pathname.replace(/\/[^/]*$/, '/');
      }
      return u;
    } catch {
      return new URL('.', location.href);
    }
  })();

  const APPS = {
    radar: {
      id: 'radar',
      rel: './',
      label: { fr: 'LE-RADAR.ca', en: 'LE-RADAR.ca' },
      short: { fr: 'Le Radar', en: 'Le Radar' },
      emoji: 'satellite',
    },
    pomo: {
      id: 'pomo',
      rel: 'pomo/',
      label: { fr: 'Pomodoro', en: 'Pomodoro' },
      short: { fr: 'Pomodoro', en: 'Pomodoro' },
      emoji: 'tomato',
    },
    solitaire: {
      id: 'solitaire',
      rel: 'solitaire/',
      label: { fr: 'Solitaire', en: 'Solitaire' },
      short: { fr: 'Solitaire', en: 'Solitaire' },
      emoji: 'playing-cards',
    },
    sports: {
      id: 'sports',
      rel: 'sports/',
      label: { fr: 'Sports Étudiants', en: 'Student Sports' },
      short: { fr: 'Sports', en: 'Sports' },
      emoji: 'trophy',
    },
  };

  /**
   * Identifie l'app à laquelle appartient la page courante.
   *
   * Les motifs sont ancrés en début de chemin relatif : sans l'ancre,
   * `/journaux/le-pomo/` serait pris pour Pomodoro. L'ancre importe d'autant
   * plus pour `sports`, qui a un jumeau anglais `/en/sports/` — hors de la
   * portée `/sports/`, et donc volontairement non reconnu ici : depuis là,
   * « Installer » doit renvoyer vers `/sports/`, pas croire y être déjà.
   */
  function currentAppId() {
    try {
      const full = location.pathname || '/';
      const basePath = SITE_BASE.pathname.replace(/\/+$/, '') || '';
      let rel = full;
      if (basePath && full.startsWith(basePath)) {
        rel = full.slice(basePath.length) || '/';
      }
      if (!rel.startsWith('/')) rel = `/${rel}`;
      for (const id of ['pomo', 'solitaire', 'sports']) {
        if (new RegExp(`^/${id}(?:/|$)`).test(rel)) return id;
      }
    } catch { /* ignore */ }
    return 'radar';
  }

  function appHref(appId) {
    const app = APPS[appId] || APPS.radar;
    try {
      return new URL(app.rel, SITE_BASE).href;
    } catch {
      return app.rel;
    }
  }

  function emojiSrc(name) {
    try {
      return new URL(`assets/emoji/${name}.png`, SITE_BASE).href;
    } catch {
      return `assets/emoji/${name}.png`;
    }
  }

  /** Force l’invite d’install pour l’app courante (ignore snooze / visite). */
  async function forceShowInstall() {
    if (isStandalone()) {
      toastAlreadyInstalled();
      return;
    }
    shownThisPage = true;
    await showInstallPrompt(detectPlatform());
  }

  function toastAlreadyInstalled() {
    const lang = uiLang();
    const msg = lang === 'en'
      ? 'This app is already installed on this device.'
      : 'Cette app est déjà installée sur cet appareil.';
    try {
      // toast léger si présent (pomo/solitaire), sinon engage card courte
      const t = document.getElementById('toast');
      if (t) {
        t.textContent = msg;
        t.classList.add('show');
        window.setTimeout(() => t.classList.remove('show'), 2800);
        return;
      }
    } catch { /* ignore */ }
    renderCard({
      kind: 'install',
      icon: '✓',
      title: lang === 'en' ? 'Already installed' : 'Déjà installée',
      body: msg,
      primaryLabel: lang === 'en' ? 'OK' : 'OK',
      showPrimary: true,
      onPrimary: () => closeCard(),
    });
  }

  /**
   * Installer une app : si hors scope, on ouvre la page cible avec ?install=1.
   * Sur l’app courante, on déclenche l’invite native ou le guide manuel.
   */
  async function installApp(appId) {
    const id = APPS[appId] ? appId : 'radar';
    const current = currentAppId();
    if (id !== current) {
      // Une app ne s'installe que depuis sa propre portée : il faut ouvrir sa
      // page. En NOUVEL ONGLET — `location.href` faisait perdre sa place dans
      // le fil à qui voulait juste installer Pomodoro depuis l'accueil, sans
      // prévenir. Si le navigateur refuse l'onglet (blocage de fenêtres), on
      // retombe sur la navigation plutôt que de ne rien faire.
      let href;
      try {
        const url = new URL(appHref(id));
        url.searchParams.set('install', '1');
        href = url.href;
      } catch {
        href = appHref(id);
      }
      // `window.open(..., 'noopener')` rend TOUJOURS null : impossible alors de
      // distinguer un onglet ouvert d'un onglet bloqué, et le repli partait à
      // tort — la page d'origine naviguait quand même. On ouvre donc sans le
      // drapeau, et on coupe `opener` après coup.
      let opened = null;
      try { opened = window.open(href, '_blank'); } catch { /* ignore */ }
      if (!opened) {
        location.href = href;
        return;
      }
      try { opened.opener = null; } catch { /* ignore */ }
      return;
    }
    await forceShowInstall();
  }


  /**
   * Ferme les menus ouverts. `restoreFocus` ramène le focus sur le
   * déclencheur : sans ça, fermer avec Échap laisse le focus sur un élément
   * masqué et la navigation clavier repart du début du document.
   */
  function closeAllInstallMenus(except, { restoreFocus = false } = {}) {
    document.querySelectorAll('[data-install-menu].is-open').forEach((el) => {
      if (except && el === except) return;
      el.classList.remove('is-open');
      const btn = el.querySelector('[data-install-toggle]');
      const panel = el.querySelector('[data-install-panel]');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      if (panel) hidePanel(panel);
      if (restoreFocus && btn && panel?.contains(document.activeElement)) {
        try { btn.focus(); } catch { /* ignore */ }
      }
    });
  }

  /** Items actionnables d'un panneau, dans l'ordre visuel. */
  function menuItems(panel) {
    return [...panel.querySelectorAll('[data-install-app]')]
      .filter((el) => el.getAttribute('aria-disabled') !== 'true');
  }

  /**
   * Déplace le focus dans le panneau selon un décalage (roving tabindex).
   *
   * `role="menu"` promet aux lentilles d'écran une navigation aux flèches :
   * la poser sans la câbler annonce un menu qui n'en est pas un. Les items
   * portent donc `tabindex="-1"` dans le HTML, et seul l'item actif devient
   * atteignable.
   */
  function focusMenuItem(panel, index) {
    const items = menuItems(panel);
    if (!items.length) return;
    const i = (index + items.length) % items.length;
    items.forEach((el, n) => { el.tabIndex = n === i ? 0 : -1; });
    try { items[i].focus(); } catch { /* ignore */ }
  }

  /** Marge minimale entre le panneau et le bord de l'écran. */
  const PANEL_EDGE_MARGIN = 8;
  /** Air entre le déclencheur et le panneau. */
  const PANEL_GAP = 6;

  /** Le navigateur sait-il faire un vrai popover (top layer) ? */
  const SUPPORTS_POPOVER = (() => {
    try { return typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype; }
    catch { return false; }
  })();

  /**
   * Ouvre le panneau dans le top layer quand le navigateur sait le faire.
   *
   * POURQUOI LE TOP LAYER
   * Le panneau vivait dans le contexte d'empilement de son ancêtre — 2 pour
   * `.masthead-inner`, 1 pour la barre des apps — alors que le syntoniseur est
   * à 100 (site) et 3 (apps). Son `z-index: 240` ne pesait donc rien : le 4ᵉ
   * item passait sous la barre du lecteur sur l'accueil, et le panneau se
   * lisait à travers les boutons du jeu sur Solitaire. On relevait l'ancêtre
   * le temps de l'ouverture ; un popover n'a plus besoin de cette rustine.
   */
  function showPanel(panel) {
    if (SUPPORTS_POPOVER) {
      if (!panel.hasAttribute('popover')) panel.setAttribute('popover', 'manual');
      panel.hidden = false;
      if (!panel.matches(':popover-open')) {
        try { panel.showPopover(); } catch { panel.hidden = false; }
      }
      return;
    }
    panel.hidden = false;
  }

  function hidePanel(panel) {
    if (SUPPORTS_POPOVER && panel.hasAttribute('popover')) {
      try { if (panel.matches(':popover-open')) panel.hidePopover(); } catch { /* ignore */ }
      return;
    }
    panel.hidden = true;
  }

  /**
   * Pose le panneau sous son déclencheur, aligné à droite, et le ramène dans
   * l'écran s'il en sort.
   *
   * Dans le top layer le panneau n'est plus positionné par son ancêtre : c'est
   * ici qu'on calcule sa place, à partir du rectangle réel du bouton. Le
   * recadrage reste nécessaire dans la barre de Solitaire — étroite, centrée —
   * où le panneau sortait à −21,6 px sur un écran de 320 px.
   */
  function placePanel(toggle, panel) {
    if (!SUPPORTS_POPOVER || !panel.hasAttribute('popover')) {
      // Repli : le panneau est absolu dans son menu, seule la translation corrige.
      panel.style.transform = '';
      const box = panel.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      let shift = 0;
      if (box.left < PANEL_EDGE_MARGIN) shift = PANEL_EDGE_MARGIN - box.left;
      else if (box.right > width - PANEL_EDGE_MARGIN) shift = (width - PANEL_EDGE_MARGIN) - box.right;
      if (shift) panel.style.transform = `translateX(${Math.round(shift)}px)`;
      return;
    }
    const anchor = toggle.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    let left = anchor.right - box.width;
    left = Math.min(Math.max(left, PANEL_EDGE_MARGIN), vw - box.width - PANEL_EDGE_MARGIN);
    // Sous le bouton, sauf s'il n'y a plus la place : alors au-dessus.
    let top = anchor.bottom + PANEL_GAP;
    if (top + box.height > vh - PANEL_EDGE_MARGIN) {
      const above = anchor.top - PANEL_GAP - box.height;
      top = above >= PANEL_EDGE_MARGIN ? above : Math.max(PANEL_EDGE_MARGIN, vh - box.height - PANEL_EDGE_MARGIN);
    }
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }

  function openInstallMenu(menu, toggle, panel, { focusFirst = false } = {}) {
    closeAllInstallMenus();
    menu.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    showPanel(panel);
    // Marquer l’app courante dans le panneau
    const cur = currentAppId();
    panel.querySelectorAll('[data-install-app]').forEach((item) => {
      const id = item.getAttribute('data-install-app');
      item.classList.toggle('is-current', id === cur);
      if (id === cur && isStandalone()) {
        item.setAttribute('aria-disabled', 'true');
        item.classList.add('is-installed');
      } else {
        item.removeAttribute('aria-disabled');
        item.classList.remove('is-installed');
      }
    });
    placePanel(toggle, panel);
    if (focusFirst) focusMenuItem(panel, 0);
  }

  function wireInstallMenus() {
    document.querySelectorAll('[data-install-menu]').forEach((menu) => {
      if (menu.dataset.wired === '1') return;
      menu.dataset.wired = '1';
      const toggle = menu.querySelector('[data-install-toggle]');
      const panel = menu.querySelector('[data-install-panel]');
      if (!toggle || !panel) return;

      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const open = !menu.classList.contains('is-open');
        if (open) openInstallMenu(menu, toggle, panel);
        else closeAllInstallMenus();
      });

      // Flèches depuis le déclencheur : ouvre et entre dans le panneau, comme
      // le fait le sélecteur de langue du même bandeau.
      toggle.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter' && e.key !== ' ') return;
        if (e.key === 'Enter' || e.key === ' ') return; // le clic natif suffit
        e.preventDefault();
        openInstallMenu(menu, toggle, panel, { focusFirst: true });
        if (e.key === 'ArrowUp') focusMenuItem(panel, -1);
      });

      panel.addEventListener('keydown', (e) => {
        const items = menuItems(panel);
        if (!items.length) return;
        const at = items.indexOf(document.activeElement);
        switch (e.key) {
          case 'ArrowDown': e.preventDefault(); focusMenuItem(panel, at + 1); break;
          case 'ArrowUp': e.preventDefault(); focusMenuItem(panel, at - 1); break;
          case 'Home': e.preventDefault(); focusMenuItem(panel, 0); break;
          case 'End': e.preventDefault(); focusMenuItem(panel, items.length - 1); break;
          case 'Tab':
            // Un menu ne se parcourt pas à la tabulation : on referme et on
            // laisse le focus repartir normalement depuis le déclencheur.
            closeAllInstallMenus(null, { restoreFocus: true });
            break;
          default: break;
        }
      });

      panel.addEventListener('click', (e) => {
        const item = e.target.closest?.('[data-install-app]');
        if (!item || item.getAttribute('aria-disabled') === 'true') return;
        e.preventDefault();
        e.stopPropagation();
        closeAllInstallMenus();
        installApp(item.getAttribute('data-install-app'));
      });
    });

    document.querySelectorAll('[data-install-app]').forEach((btn) => {
      if (btn.dataset.wired === '1') return;
      // Items inside a dropdown panel are handled by the panel click above.
      if (btn.closest?.('[data-install-panel]')) return;
      btn.dataset.wired = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        installApp(btn.getAttribute('data-install-app') || 'radar');
      });
    });

    if (!document.documentElement.dataset.installMenusDoc) {
      document.documentElement.dataset.installMenusDoc = '1';
      document.addEventListener('click', (e) => {
        if (e.target.closest?.('[data-install-menu]')) return;
        closeAllInstallMenus();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllInstallMenus(null, { restoreFocus: true });
      });
      // Rotation de l'appareil panneau ouvert : la position calculée à
      // l'ouverture ne vaut plus rien, il faut la refaire.
      window.addEventListener('resize', () => {
        document.querySelectorAll('[data-install-menu].is-open').forEach((menu) => {
          const toggle = menu.querySelector('[data-install-toggle]');
          const panel = menu.querySelector('[data-install-panel]');
          if (toggle && panel) placePanel(toggle, panel);
        });
      });
    }
  }

  /** Délai de garde avant de renoncer à l'invite native et de basculer sur le
   *  guide manuel. Chromium n'émet `beforeinstallprompt` qu'une fois le
   *  manifeste lu et le service worker éligible — rarement sous la seconde. */
  const INSTALL_EVENT_WAIT_MS = 8000;

  /**
   * Au-delà, on cesse de guetter l'invite native pour une carte déjà ouverte.
   * Une carte d'invite ne reste pas une minute à l'écran ; passé ce délai
   * l'écouteur ne servirait plus qu'à retenir la fermeture.
   */
  const CARD_UPGRADE_WINDOW_MS = 60000;

  /**
   * Attend `beforeinstallprompt`, sans dépasser le délai de garde.
   *
   * POURQUOI PAS UN setTimeout FIXE
   * Arriver depuis « Installer Pomodoro » et tomber sur les instructions
   * manuelles alors que le navigateur SAIT installer est le pire des deux
   * mondes. On attend donc l'évènement réel, et on ne retombe sur le guide
   * que s'il ne vient pas.
   */
  function waitForInstallEvent() {
    if (deferredInstall) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener('beforeinstallprompt', finish);
        resolve();
      };
      window.addEventListener('beforeinstallprompt', finish);
      window.setTimeout(finish, INSTALL_EVENT_WAIT_MS);
    });
  }

  function consumeInstallQuery() {
    try {
      const url = new URL(location.href);
      if (url.searchParams.get('install') !== '1') return;
      url.searchParams.delete('install');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
      waitForInstallEvent().then(forceShowInstall);
    } catch { /* ignore */ }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    detectBrave();
    touchVisit();
    bindInstallEvents();
    bindEngagement();
    wireInstallMenus();
    consumeInstallQuery();

    window.setTimeout(() => {
      if (engaged) maybeShow();
    }, FIRST_PAINT_GRACE_MS + 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // API publique + debug multi-device
  try {
    window.RadarEngage = {
      install: installApp,
      forceInstall: forceShowInstall,
      currentApp: currentAppId,
      isStandalone,
      platform: detectPlatform,
      classify: classifyPlatform,
    };
    window.__radarEngageDebug = () => ({
      platform: detectPlatform(),
      state: loadState(),
      deferredInstall: !!deferredInstall,
      engaged,
      shownThisPage,
      currentApp: currentAppId(),
    });
  } catch { /* ignore */ }
})();

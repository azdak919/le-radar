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
 *  - snooze 7 j ; « Ne plus demander » permanent par type
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
  function detectPlatform() {
    const ua = navigator.userAgent || '';
    const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const ios = /iPhone|iPad|iPod/i.test(ua) || iPadOs;
    const android = /Android/i.test(ua);
    const coarse = (() => {
      try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
    })();
    const narrow = (() => {
      try { return window.matchMedia('(max-width: 820px)').matches; } catch { return false; }
    })();
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const mobileLike = ios || android || coarse || mobileUa
      || (narrow && ('ontouchstart' in window));

    let browser = 'other';
    if (/SamsungBrowser/i.test(ua)) browser = 'samsung';
    else if (/Edg\//.test(ua)) browser = 'edge';
    else if (/OPR\/|Opera/i.test(ua)) browser = 'opera';
    else if (/Firefox\//.test(ua) || /FxiOS\//.test(ua)) browser = 'firefox';
    else if (/CriOS\//.test(ua)) browser = 'chrome_ios';
    else if (/Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua)) browser = 'chrome';
    else if (/Safari\//.test(ua) && !/Chrome\//.test(ua) && !/CriOS\//.test(ua)) browser = 'safari';

    let family = 'desktop';
    if (ios) family = 'ios';
    else if (android) family = 'android';
    else if (mobileLike) family = 'mobile_other';

    const standalone = isStandalone();
    // iOS hors Safari : pas de beforeinstallprompt, pas d’install fiable.
    const iosNonSafari = family === 'ios' && browser !== 'safari';
    const canNativeInstall = !ios && !iosNonSafari; // event géré à part
    const desktopWide = (() => {
      try { return window.matchMedia('(min-width: 900px)').matches; } catch { return !mobileLike; }
    })();

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
        edge: 'Edge',
        firefox: 'Firefox',
        safari: 'Safari',
        samsung: 'Samsung Internet',
        opera: 'Opera',
        other: '',
      })[browser] || '',
    };
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

    if (family === 'android') {
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
      // Chrome / Edge / Opera Android (et défaut)
      return en
        ? [
          'Tap the browser menu <strong>⋮</strong> (or the install icon in the address bar).',
          'Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.',
          'Confirm — offline shell + home-screen icon, no app store.',
        ]
        : [
          'Touchez le menu <strong>⋮</strong> (ou l’icône d’install dans la barre d’adresse).',
          'Choisissez <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.',
          'Validez — une icône et un accès hors ligne, sans magasin d’apps.',
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
    if (browser === 'chrome' || browser === 'opera') {
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
   * Page d’accueil + démarrage + nouvel onglet — un seul guide par navigateur
   * pour ne pas enchaîner deux bandeaux (anti-irritation).
   */
  function homeAndNewTabSteps(plat) {
    const en = uiLang() === 'en';
    const url = SITE_URL;
    const { browser } = plat;

    if (browser === 'chrome') {
      return en
        ? [
          `<strong>Homepage / startup</strong> — Settings (⋮) → <strong>On startup</strong> → “Open a specific page…” → add <code>${url}</code>.`,
          `<strong>Home button</strong> — Settings → <strong>Appearance</strong> → show Home button → set to <code>${url}</code>.`,
          '<strong>New tab</strong> — Chrome locks the new-tab page (no site override without an extension). Startup + Home button is the reliable path.',
        ]
        : [
          `<strong>Démarrage</strong> — Paramètres (⋮) → <strong>Au démarrage</strong> → « Ouvrir une page spécifique… » → ajoutez <code>${url}</code>.`,
          `<strong>Bouton Accueil</strong> — Paramètres → <strong>Apparence</strong> → afficher le bouton Accueil → <code>${url}</code>.`,
          '<strong>Nouvel onglet</strong> — Chrome ne permet pas de le changer sans extension. Démarrage + bouton Accueil restent le chemin fiable.',
        ];
    }

    if (browser === 'edge') {
      return en
        ? [
          `Settings (…) → <strong>Start, home, and new tabs</strong>.`,
          `<strong>When Edge starts</strong> → “Open these pages” → <code>${url}</code>.`,
          `<strong>Home button</strong> → set to <code>${url}</code>.`,
          `<strong>New tab page</strong> → Custom / set your page to <code>${url}</code> when the option is available.`,
        ]
        : [
          `Paramètres (…) → <strong>Démarrage, accueil et nouveaux onglets</strong>.`,
          `<strong>Au démarrage d’Edge</strong> → « Ouvrir ces pages » → <code>${url}</code>.`,
          `<strong>Bouton Accueil</strong> → <code>${url}</code>.`,
          `<strong>Page de nouvel onglet</strong> → personnalisée / <code>${url}</code> si l’option est proposée.`,
        ];
    }

    if (browser === 'firefox') {
      return en
        ? [
          'Menu ☰ → <strong>Settings</strong> → <strong>Home</strong>.',
          `Homepage and new windows → <strong>Custom URLs</strong> → <code>${url}</code>.`,
          'New tabs → choose Homepage (or Custom) so a new tab opens LE-RADAR.ca.',
          'Tip: drag this tab onto the 🏠 toolbar button.',
        ]
        : [
          'Menu ☰ → <strong>Paramètres</strong> → <strong>Accueil</strong>.',
          `Page d’accueil et nouvelles fenêtres → <strong>Adresses web personnalisées</strong> → <code>${url}</code>.`,
          'Nouveaux onglets → Page d’accueil (ou personnalisée) pour ouvrir LE-RADAR.ca.',
          'Astuce : glissez cet onglet sur l’icône 🏠 de la barre d’outils.',
        ];
    }

    if (browser === 'safari') {
      return en
        ? [
          'Safari → <strong>Settings…</strong> (or Preferences) → <strong>General</strong>.',
          `Set <strong>Homepage</strong> to <code>${url}</code>.`,
          '“New windows open with” / “New tabs open with” → Homepage.',
        ]
        : [
          'Safari → <strong>Réglages…</strong> (ou Préférences) → <strong>Général</strong>.',
          `Champ <strong>Page d’accueil</strong> → <code>${url}</code>.`,
          '« Les nouvelles fenêtres / onglets s’ouvrent avec » → Page d’accueil.',
        ];
    }

    if (browser === 'opera') {
      return en
        ? [
          'Settings → <strong>On startup</strong> → open a specific page → <code>' + url + '</code>.',
          'Appearance / sidebar → enable Home if available.',
          'Opera’s new-tab (Speed Dial) is separate; startup pages are the reliable shortcut.',
        ]
        : [
          'Paramètres → <strong>Au démarrage</strong> → page spécifique → <code>' + url + '</code>.',
          'Apparence / barre latérale → activer Accueil si disponible.',
          'Le nouvel onglet Opera (Speed Dial) est séparé ; le démarrage reste le raccourci fiable.',
        ];
    }

    return en
      ? [
        'Open your browser settings.',
        'Look for “homepage”, “on startup”, or “new tab”.',
        `Set the value to <code>${url}</code> wherever the browser allows it.`,
      ]
      : [
        'Ouvrez les paramètres de votre navigateur.',
        'Cherchez « page d’accueil », « au démarrage » ou « nouvel onglet ».',
        `Indiquez <code>${url}</code> partout où le navigateur le permet.`,
      ];
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  function closeCard() {
    if (!cardEl) return;
    cardEl.classList.add('is-leaving');
    const el = cardEl;
    cardEl = null;
    window.setTimeout(() => el.remove(), 280);
  }

  function renderCard({ kind, title, body, steps, primaryLabel, onPrimary, showPrimary, icon }) {
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
          <button type="button" class="engage-prompt__btn" data-act="later">${lang === 'en' ? 'Not now' : 'Plus tard'}</button>
          <button type="button" class="engage-prompt__btn engage-prompt__btn--quiet" data-act="never">${lang === 'en' ? 'Don’t ask again' : 'Ne plus demander'}</button>
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

  function installBodyCopy(lang, appId) {
    if (appId === 'pomo') {
      return lang === 'en'
        ? 'Focus timer with quotes and Québec wallpapers — one tap away, no app store.'
        : 'Minuteur focus, citations et fonds québécois — à un tap, sans magasin d’apps.';
    }
    if (appId === 'solitaire') {
      return lang === 'en'
        ? 'Klondike solitaire with student radio — install for offline play and a home-screen icon.'
        : 'Solitaire Klondike avec radio étudiante — installez pour jouer hors ligne et un raccourci.';
    }
    if (appId === 'sports') {
      return lang === 'en'
        ? 'Québec college and university scores — install to check the board offline, no app store.'
        : 'Scores collégiaux et universitaires du Québec — installez pour consulter le tableau hors ligne.';
    }
    return lang === 'en'
      ? 'Student radio & news in one tap — no app store, works offline for the shell.'
      : 'Radios étudiantes et fil d’actus en un tap — sans magasin d’apps, accès hors ligne inclus.';
  }

  async function showInstallPrompt(plat) {
    const lang = uiLang();
    const appId = (typeof currentAppId === 'function') ? currentAppId() : 'radar';
    const appName = currentAppLabel(lang);
    const canNative = !!deferredInstall && plat.canNativeInstall && !plat.ios;

    if (canNative) {
      renderCard({
        kind: 'install',
        icon: '📲',
        title: lang === 'en' ? `Install ${appName}` : `Installer ${appName}`,
        body: installBodyCopy(lang, appId),
        primaryLabel: lang === 'en' ? 'Install' : 'Installer',
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
      return;
    }

    const steps = installSteps(plat);
    const isIosChromeLike = plat.iosNonSafari;
    renderCard({
      kind: 'install',
      icon: '📲',
      title: lang === 'en'
        ? (plat.ios ? 'Add to Home Screen' : `Install ${appName}`)
        : (plat.ios ? 'Sur l’écran d’accueil' : `Installer ${appName}`),
      body: lang === 'en'
        ? (isIosChromeLike
          ? 'On this device, install is done from Safari:'
          : 'Keep this app one tap away. On this device:')
        : (isIosChromeLike
          ? 'Sur cet appareil, l’installation se fait depuis Safari :'
          : 'Gardez cette app à un doigt. Sur cet appareil :'),
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
    renderCard({
      kind: 'home',
      icon: '🏠',
      title: lang === 'en'
        ? 'Open LE-RADAR.ca when you start?'
        : 'Ouvrir LE-RADAR.ca au démarrage ?',
      body: lang === 'en'
        ? `For your security, browsers do not let sites change this setting automatically. ${label ? `In ${label}:` : 'In your browser:'}`
        : `Pour votre sécurité, les navigateurs ne laissent pas un site modifier ce réglage automatiquement. ${label ? `Sous ${label} :` : 'Dans votre navigateur :'}`,
      steps: homeAndNewTabSteps(plat),
      primaryLabel: lang === 'en' ? 'Done' : 'C’est fait',
      onPrimary: () => {
        markDone('home');
        // Compat snooze ancien bucket « homepage »
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
      && (!!deferredInstall || ['chrome', 'edge', 'opera'].includes(plat.browser));

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
      label: { fr: 'SPORTS Étudiants', en: 'Student SPORTS' },
      short: { fr: 'SPORTS', en: 'SPORTS' },
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
      try {
        const url = new URL(appHref(id));
        url.searchParams.set('install', '1');
        location.href = url.href;
      } catch {
        location.href = appHref(id);
      }
      return;
    }
    await forceShowInstall();
  }


  /**
   * Styles de repli pour les pages qui n'importent pas style.css.
   *
   * POURQUOI CE GARDE-FOU
   * Ce bloc est ajouté au <head> à l'exécution, donc APRÈS style.css et à
   * spécificité égale : sur le site principal il gagnerait sur les règles du
   * dépôt. Il écraserait notamment le `bottom` de `.engage-prompt`, calculé
   * pour dégager les FAB `.page-tools` — la carte repasserait dessous.
   *
   * `--radar-chrome` est déclarée par style.css. Le CSS étant analysé avant
   * l'exécution des scripts `defer`, le test est fiable quel que soit l'ordre
   * de chargement. Le repli ne sert donc plus qu'à Pomodoro et Solitaire.
   *
   * POURQUOI CETTE CHAÎNE DE JETONS
   * Ces deux apps n'ont ni --bg, ni --ink, ni --rule, ni --sans : écrire
   * `var(--bg, #fff)` y donnerait un panneau blanc en thème sombre. On vise
   * donc d'abord leurs jetons --chrome-*, ceux du site ensuite, la valeur en
   * dur en dernier recours.
   */
  function ensureInstallStyles() {
    if (document.getElementById('radar-install-styles')) return;
    try {
      const hasSiteCss = getComputedStyle(document.documentElement)
        .getPropertyValue('--radar-chrome').trim() !== '';
      if (hasSiteCss) return;
    } catch { /* ignore : on injecte, c'est le cas dégradé le plus sûr */ }
    const css = `
.install-menu{position:relative;display:inline-flex;align-items:center}
.install-menu__toggle{cursor:pointer}
.install-menu__panel{
  position:absolute;top:calc(100% + 6px);right:0;z-index:240;
  min-width:11.5rem;max-width:calc(100vw - 16px);padding:6px;border-radius:12px;
  border:1px solid var(--chrome-rule, var(--rule, rgba(0,0,0,.12)));
  background:var(--chrome-surface-bg, var(--bg, #fff));
  color:var(--chrome-text, var(--ink, #111));
  backdrop-filter:var(--chrome-surface-blur, none);
  -webkit-backdrop-filter:var(--chrome-surface-blur, none);
  box-shadow:0 12px 32px -12px rgba(0,0,0,.28);
  display:flex;flex-direction:column;gap:2px;
}
.install-menu__panel[hidden]{display:none!important}
/* Le syntoniseur (.game-toolbar-tuner, z-index 3) est frère de la rangee de
   boutons (z-index 1) : sans ce relevement, son iframe passe par-dessus le
   panneau, dont le z-index 240 reste enferme dans la rangee. */
.game-toolbar-chrome.has-install-open,.app-toolbar-chrome.has-install-open{z-index:20}
.masthead-inner.has-install-open{z-index:150}
.install-menu__item{
  display:flex;align-items:center;gap:8px;width:100%;
  padding:8px 10px;border:0;border-radius:8px;background:transparent;
  color:inherit;font-family:var(--font-body, var(--sans, system-ui, sans-serif));font-size:13px;font-weight:600;
  text-align:left;cursor:pointer;
}
.install-menu__item:hover,.install-menu__item:focus-visible{
  background:color-mix(in srgb, var(--accent, #2563eb) 12%, transparent);
  outline:none;
}
.install-menu__item.is-current{box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--accent, #2563eb) 45%, transparent)}
.install-menu__item.is-installed{opacity:.55;cursor:default}
.install-menu__item .app-emoji{width:16px;height:16px;flex-shrink:0}
.site-foot__install{margin:0 0 12px}
.site-foot__install-btn{
  display:inline-flex;align-items:center;gap:8px;
  padding:9px 14px;border-radius:999px;
  border:1px solid var(--chrome-rule, var(--rule, rgba(0,0,0,.14)));
  background:color-mix(in srgb, var(--accent, #2563eb) 10%, transparent);
  color:var(--accent, #2563eb);font-family:var(--font-body, var(--sans, system-ui, sans-serif));font-size:13px;font-weight:700;
  cursor:pointer;transition:border-color 120ms ease, background 120ms ease, color 120ms ease;
}
.site-foot__install-btn svg{width:16px;height:16px;flex-shrink:0}
.site-foot__install-btn:hover{
  border-color:var(--accent, #2563eb);
  background:color-mix(in srgb, var(--accent, #2563eb) 16%, transparent);
}
.site-foot__install-btn:focus-visible{outline:2px solid var(--accent, #2563eb);outline-offset:2px}
/* engage card fallback (pomo / solitaire n’importent pas style.css) */
.engage-prompt{
  position:fixed;left:0;right:0;bottom:max(16px, env(safe-area-inset-bottom,0px));
  z-index:400;display:flex;justify-content:center;
  padding:0 12px;pointer-events:none;opacity:0;transform:translateY(12px);
  transition:opacity .28s ease, transform .28s ease;
}
.engage-prompt.is-visible{opacity:1;transform:none;pointer-events:auto}
.engage-prompt.is-leaving{opacity:0;transform:translateY(16px);pointer-events:none}
.engage-prompt__inner{
  position:relative;width:min(420px,100%);padding:16px 16px 14px;border-radius:16px;
  border:1px solid var(--chrome-rule, var(--rule, rgba(0,0,0,.12)));
  background:var(--chrome-surface-bg, var(--bg, #fff));
  color:var(--chrome-text, var(--ink, #111));box-shadow:0 12px 40px -12px rgba(0,0,0,.28);
  backdrop-filter:var(--chrome-surface-blur, none);-webkit-backdrop-filter:var(--chrome-surface-blur, none);
  font-family:var(--font-body, var(--sans, system-ui, sans-serif));
}
.engage-prompt__close{
  position:absolute;top:8px;right:10px;width:32px;height:32px;border:0;border-radius:999px;
  background:transparent;color:var(--text-muted, var(--muted, #666));font-size:22px;line-height:1;cursor:pointer;
}
.engage-prompt__title{margin:0 28px 6px 0;font-size:.98rem;font-weight:700}
.engage-prompt__body{margin:0 0 8px;font-size:.84rem;line-height:1.45;color:var(--text-secondary, var(--ink-soft, #444))}
.engage-prompt__steps{margin:0 0 12px;padding:0 0 0 1.15rem;font-size:.8rem;line-height:1.45;color:var(--text-secondary, var(--ink-soft, #444))}
.engage-prompt__actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.engage-prompt__btn{
  font-family:var(--font-body, var(--sans, system-ui, sans-serif));font-size:12.5px;font-weight:600;padding:8px 12px;border-radius:999px;
  border:1px solid var(--chrome-rule, var(--rule, rgba(0,0,0,.14)));
  background:var(--chrome-hover, var(--bg-soft, #f4f4f5));
  color:var(--chrome-text, var(--ink-soft, #444));cursor:pointer;
}
.engage-prompt__btn--primary{background:var(--accent, #2563eb);border-color:var(--accent, #2563eb);color:#fff}
.engage-prompt__btn--quiet{border-color:transparent;background:transparent;font-weight:500;color:var(--text-muted, var(--muted, #666))}
`;
    const s = document.createElement('style');
    s.id = 'radar-install-styles';
    s.textContent = css;
    document.head.appendChild(s);
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
      if (panel) panel.hidden = true;
      raiseStackingRoot(el, false);
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

  /**
   * Ramène le panneau dans l'écran s'il en sort.
   *
   * Le panneau est ancré `right: 0` sur son déclencheur et mesure au moins
   * 11,5 rem. Dans la barre de Solitaire — étroite, centrée, en position fixe
   * — le déclencheur se retrouve assez à gauche pour que le panneau sorte de
   * l'écran : mesuré à −21,6 px sur un écran de 320 px. Aucune règle CSS
   * statique ne peut le savoir, puisque ça dépend de la position réelle du
   * bouton ; on corrige donc après ouverture, par translation.
   */
  function clampPanelToViewport(panel) {
    panel.style.transform = '';
    const r = panel.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    let shift = 0;
    if (r.left < PANEL_EDGE_MARGIN) shift = PANEL_EDGE_MARGIN - r.left;
    else if (r.right > vw - PANEL_EDGE_MARGIN) shift = (vw - PANEL_EDGE_MARGIN) - r.right;
    if (shift) panel.style.transform = `translateX(${Math.round(shift)}px)`;
  }

  function openInstallMenu(menu, toggle, panel, { focusFirst = false } = {}) {
    closeAllInstallMenus();
    menu.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
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
    raiseStackingRoot(menu, true);
    clampPanelToViewport(panel);
    if (focusFirst) focusMenuItem(panel, 0);
  }

  /**
   * Ancêtres qui enferment le panneau dans leur contexte d'empilement.
   * `.masthead-inner` sur le site, la rangée de boutons dans les deux apps.
   */
  const STACKING_ROOTS = '.masthead-inner, .game-toolbar-chrome, .app-toolbar-chrome';

  /**
   * Sort le panneau de son contexte d'empilement, le temps de l'ouverture.
   *
   * Le `z-index: 240` du panneau ne vaut que DANS l'ancêtre qui établit le
   * contexte — et cet ancêtre est bien plus bas que le syntoniseur :
   *  - site : `.masthead-inner` est à 2, `#tuner` à 100 ;
   *  - apps : `.game-toolbar-chrome` est à 1, `.game-toolbar-tuner` à 3.
   * Dans les deux cas le syntoniseur passe par-dessus tout le sous-arbre du
   * panneau. Constaté à l'œil sur l'accueil (« SPORTS Étudiants », le 4ᵉ item,
   * disparaissait sous la barre) et mesuré sur Solitaire à 320 px.
   *
   * On relève donc l'ancêtre, et seulement pendant l'ouverture : le laisser
   * au-dessus en permanence changerait l'ordre de peinture du syntoniseur.
   */
  function raiseStackingRoot(menu, on) {
    const root = menu.closest?.(STACKING_ROOTS);
    if (root) root.classList.toggle('has-install-open', !!on);
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
      // Rotation de l'appareil panneau ouvert : le recadrage calculé à
      // l'ouverture ne vaut plus rien, il faut le refaire.
      window.addEventListener('resize', () => {
        document.querySelectorAll('[data-install-menu].is-open [data-install-panel]')
          .forEach(clampPanelToViewport);
      });
    }
  }

  /** Délai de garde avant de renoncer à l'invite native et de basculer sur le
   *  guide manuel. Chromium n'émet `beforeinstallprompt` qu'une fois le
   *  manifeste lu et le service worker éligible — rarement sous la seconde. */
  const INSTALL_EVENT_WAIT_MS = 3000;

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
    touchVisit();
    bindInstallEvents();
    bindEngagement();
    ensureInstallStyles();
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

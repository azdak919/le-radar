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

  async function showInstallPrompt(plat) {
    const lang = uiLang();
    const canNative = !!deferredInstall && plat.canNativeInstall && !plat.ios;

    if (canNative) {
      renderCard({
        kind: 'install',
        icon: '📲',
        title: lang === 'en' ? 'Install LE-RADAR.ca' : 'Installer LE-RADAR.ca',
        body: lang === 'en'
          ? 'Student radio & news in one tap — no app store, works offline for the shell.'
          : 'Radios étudiantes et fil d’actus en un tap — sans magasin d’apps, accès hors ligne inclus.',
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
        ? (plat.ios ? 'Add to Home Screen' : 'Install LE-RADAR.ca')
        : (plat.ios ? 'Sur l’écran d’accueil' : 'Installer LE-RADAR.ca'),
      body: lang === 'en'
        ? (isIosChromeLike
          ? 'On this device, install is done from Safari:'
          : 'Keep student media one tap away. On this device:')
        : (isIosChromeLike
          ? 'Sur cet appareil, l’installation se fait depuis Safari :'
          : 'Gardez les médias étudiants à un doigt. Sur cet appareil :'),
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

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    touchVisit();
    bindInstallEvents();
    bindEngagement();

    window.setTimeout(() => {
      if (engaged) maybeShow();
    }, FIRST_PAINT_GRACE_MS + 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Debug / QA multi-device : window.__radarEngageDebug()
  try {
    window.__radarEngageDebug = () => ({
      platform: detectPlatform(),
      state: loadState(),
      deferredInstall: !!deferredInstall,
      engaged,
      shownThisPage,
    });
  } catch { /* ignore */ }
})();

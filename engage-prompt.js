/**
 * LE-RADAR.ca — invitations douces (non bloquantes) :
 *  1. Mobile : installer l’app (PWA / écran d’accueil)
 *  2. Ordinateur : guide page d’accueil navigateur (impossible par JS)
 *
 * Timing (bonnes pratiques web.dev / non-irritant) :
 *  - jamais à la 1ʳᵉ visite ni dans les premières secondes
 *  - à partir de la 2ᵉ session (≥ 6 h d’écart) + un signal d’engagement
 *  - un seul bandeau à la fois ; snooze 21 j ; refus permanent possible
 *  - rien si déjà installé (standalone) ou si l’utilisateur a tranché
 */
(function () {
  'use strict';

  if (document.documentElement.dataset.embed === 'tuner') return;

  const STORAGE_KEY = 'radar-engage-v1';
  const SESSION_GAP_MS = 6 * 60 * 60 * 1000; // 6 h = nouvelle « visite »
  const MIN_VISITS = 2;
  const MIN_DWELL_MS = 40 * 1000; // temps sur la page
  const SHOW_DELAY_MS = 2200; // pause après engagement
  const SNOOZE_MS = 21 * 24 * 60 * 60 * 1000; // 21 jours
  const FIRST_PAINT_GRACE_MS = 12 * 1000;

  let deferredInstall = null;
  let engaged = false;
  let shownThisPage = false;
  let cardEl = null;
  let pageLoadedAt = Date.now();

  // ─── Persistance ──────────────────────────────────────────────────────────

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch {
      return {};
    }
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
    s[bucket] = { ...(s[bucket] || {}), done: true };
    saveState(s);
  }

  // ─── Environnement ────────────────────────────────────────────────────────

  function isStandalone() {
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
      if (navigator.standalone === true) return true; // iOS
    } catch { /* ignore */ }
    return false;
  }

  function isMobileLike() {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const narrow = window.matchMedia('(max-width: 820px)').matches;
    const ua = navigator.userAgent || '';
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    // iPadOS 13+ se fait passer pour Mac : coarse + maxTouchPoints
    const iPad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return coarse || mobileUa || iPad || (narrow && ('ontouchstart' in window));
  }

  function isDesktop() {
    return !isMobileLike() && window.matchMedia('(min-width: 900px)').matches;
  }

  function browserId() {
    const ua = navigator.userAgent || '';
    if (/Edg\//.test(ua)) return 'edge';
    if (/Firefox\//.test(ua)) return 'firefox';
    if (/Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua)) return 'chrome';
    if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'safari';
    if (/OPR\//.test(ua)) return 'opera';
    return 'other';
  }

  function isIos() {
    const ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod/i.test(ua)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function uiLang() {
    try {
      const m = window.RadarTranslate?.getMode?.();
      if (m === 'en') return 'en';
    } catch { /* ignore */ }
    return 'fr';
  }

  function t(fr, en) {
    return uiLang() === 'en' ? en : fr;
  }

  // ─── Engagement ───────────────────────────────────────────────────────────

  function markEngaged() {
    if (engaged) return;
    engaged = true;
    scheduleMaybeShow();
  }

  function bindEngagement() {
    // Temps passé
    window.setTimeout(markEngaged, MIN_DWELL_MS);

    // Lecture radio
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

    // Scroll dans le fil
    let scrolled = false;
    window.addEventListener('scroll', () => {
      if (scrolled) return;
      if ((window.scrollY || document.documentElement.scrollTop) > 420) {
        scrolled = true;
        markEngaged();
      }
    }, { passive: true });

    // Clic article
    document.getElementById('news-list')?.addEventListener('click', (e) => {
      if (e.target.closest?.('a.article, .article a[href]')) markEngaged();
    }, { once: true });
  }

  // ─── Contenu des prompts ──────────────────────────────────────────────────

  function homepageSteps(id) {
    const url = 'https://le-radar.ca';
    const steps = {
      chrome: {
        fr: [
          'Ouvrez les <strong>Paramètres</strong> de Chrome (⋮).',
          'Section <strong>Au démarrage</strong> → « Ouvrir une page spécifique… ».',
          `Ajoutez <code>${url}</code> (ou cette page).`,
        ],
        en: [
          'Open Chrome <strong>Settings</strong> (⋮).',
          'Under <strong>On startup</strong>, choose “Open a specific page…”.',
          `Add <code>${url}</code> (or this page).`,
        ],
      },
      edge: {
        fr: [
          'Menu <strong>…</strong> → <strong>Paramètres</strong>.',
          '<strong>Démarrage, accueil et nouveaux onglets</strong>.',
          `Activez le bouton Accueil et saisissez <code>${url}</code>.`,
        ],
        en: [
          'Open <strong>…</strong> → <strong>Settings</strong>.',
          '<strong>Start, home, and new tabs</strong>.',
          `Turn on the Home button and set <code>${url}</code>.`,
        ],
      },
      firefox: {
        fr: [
          'Menu ☰ → <strong>Paramètres</strong> → <strong>Accueil</strong>.',
          'Page d’accueil et nouvelles fenêtres → <strong>Adresses web personnalisées</strong>.',
          `Collez <code>${url}</code>.`,
          'Astuce : glissez cet onglet sur l’icône 🏠 de la barre d’outils.',
        ],
        en: [
          'Menu ☰ → <strong>Settings</strong> → <strong>Home</strong>.',
          'Homepage and new windows → <strong>Custom URLs</strong>.',
          `Paste <code>${url}</code>.`,
          'Tip: drag this tab onto the 🏠 toolbar button.',
        ],
      },
      safari: {
        fr: [
          'Safari → <strong>Réglages…</strong> (ou Préférences) → <strong>Général</strong>.',
          `Champ <strong>Page d’accueil</strong> → <code>${url}</code>.`,
          'Cochez « Les nouvelles fenêtres s’ouvrent avec : Page d’accueil » si besoin.',
        ],
        en: [
          'Safari → <strong>Settings…</strong> → <strong>General</strong>.',
          `Set <strong>Homepage</strong> to <code>${url}</code>.`,
          'Optionally open new windows with the homepage.',
        ],
      },
      other: {
        fr: [
          'Ouvrez les paramètres de votre navigateur.',
          'Cherchez « page d’accueil » ou « au démarrage ».',
          `Indiquez <code>${url}</code>.`,
        ],
        en: [
          'Open your browser settings.',
          'Look for “homepage” or “on startup”.',
          `Set it to <code>${url}</code>.`,
        ],
      },
    };
    const pack = steps[id] || steps.other;
    return pack[uiLang()] || pack.fr;
  }

  function iosInstallSteps() {
    return uiLang() === 'en'
      ? [
        'Tap the <strong>Share</strong> button (square with arrow).',
        'Choose <strong>Add to Home Screen</strong>.',
        'Confirm <strong>Add</strong> — LE-RADAR.ca appears like an app.',
      ]
      : [
        'Touchez le bouton <strong>Partager</strong> (carré avec flèche).',
        'Choisissez <strong>Sur l’écran d’accueil</strong>.',
        'Validez <strong>Ajouter</strong> — LE-RADAR.ca s’installe comme une app.',
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

  function renderCard({ kind, title, body, steps, primaryLabel, onPrimary, showPrimary }) {
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

    root.innerHTML = `
      <div class="engage-prompt__inner">
        <button type="button" class="engage-prompt__close" aria-label="${lang === 'en' ? 'Dismiss' : 'Fermer'}">×</button>
        <div class="engage-prompt__icon" aria-hidden="true">${kind === 'install' ? '📲' : '🏠'}</div>
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

    root.querySelector('.engage-prompt__close')?.addEventListener('click', () => {
      markSnooze(kind);
      closeCard();
    });
    root.querySelector('[data-act="later"]')?.addEventListener('click', () => {
      markSnooze(kind);
      closeCard();
    });
    root.querySelector('[data-act="never"]')?.addEventListener('click', () => {
      markForever(kind);
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

  async function showInstallPrompt() {
    const lang = uiLang();
    const canNative = !!deferredInstall && !isIos();

    if (canNative) {
      renderCard({
        kind: 'install',
        title: lang === 'en' ? 'Install LE-RADAR.ca' : 'Installer LE-RADAR.ca',
        body: lang === 'en'
          ? 'Add the student radio & news feed to your home screen — one tap, no app store.'
          : 'Ajoutez le fil étudiant et les radios à votre écran d’accueil — un tap, sans magasin d’apps.',
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

    // iOS / navigateurs sans beforeinstallprompt : guide manuel
    renderCard({
      kind: 'install',
      title: lang === 'en' ? 'Add to Home Screen' : 'Sur l’écran d’accueil',
      body: lang === 'en'
        ? 'Keep student media one tap away. On this device:'
        : 'Gardez les médias étudiants à un doigt. Sur cet appareil :',
      steps: isIos() ? iosInstallSteps() : (
        lang === 'en'
          ? [
            'Open the browser menu (⋮ or ⋯).',
            'Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.',
          ]
          : [
            'Ouvrez le menu du navigateur (⋮ ou ⋯).',
            'Choisissez <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.',
          ]
      ),
      primaryLabel: lang === 'en' ? 'Got it' : 'Compris',
      onPrimary: () => {
        markDone('install');
        closeCard();
      },
    });
  }

  function showHomepagePrompt() {
    const lang = uiLang();
    const id = browserId();
    const browserName = ({
      chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox', safari: 'Safari', opera: 'Opera', other: '',
    })[id] || '';

    renderCard({
      kind: 'homepage',
      title: lang === 'en' ? 'Make LE-RADAR.ca your homepage?' : 'Page d’accueil LE-RADAR.ca ?',
      body: lang === 'en'
        ? `Browsers don’t allow sites to change this automatically (for your safety). ${browserName ? `In ${browserName}:` : 'In your browser:'}`
        : `Les navigateurs n’autorisent pas un site à le faire automatiquement (sécurité). ${browserName ? `Sous ${browserName} :` : 'Dans votre navigateur :'}`,
      steps: homepageSteps(id),
      primaryLabel: lang === 'en' ? 'Done' : 'C’est fait',
      onPrimary: () => {
        markDone('homepage');
        closeCard();
      },
    });
  }

  // ─── Décision ─────────────────────────────────────────────────────────────

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

    // 1) Mobile install (prioritaire)
    if (isMobileLike() && !isStandalone() && !isSnoozed('install')) {
      // Sur Chromium mobile : attendre un deferred si possible (max ~2,5 s)
      const tryInstall = () => {
        if (shownThisPage) return;
        shownThisPage = true;
        showInstallPrompt();
      };
      if (deferredInstall || isIos()) {
        tryInstall();
      } else {
        window.setTimeout(() => {
          if (!isSnoozed('install') && !isStandalone()) tryInstall();
        }, 2500);
      }
      return;
    }

    // 2) Desktop homepage guide
    if (isDesktop() && !isSnoozed('homepage')) {
      shownThisPage = true;
      showHomepagePrompt();
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

    // Si déjà engagé très vite (rechargement) — recheck après grâce
    window.setTimeout(() => {
      if (engaged) maybeShow();
    }, FIRST_PAINT_GRACE_MS + 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

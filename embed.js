// Iframe embed :
// · tuner legacy (Pomo/Solitaire, sans surface=) — barre compacte 62 px
// · tuner kiosque-v1 — parité barre bureau LE-RADAR (+ crédit), 68 px
// · sports — colonne de cartes CTA (+ promo LE-RADAR tous les N)
// Signale le parent via postMessage (hauteur, ready, available).
(function () {
  const embedKind = document.documentElement.dataset.embed;
  if (embedKind !== 'tuner' && embedKind !== 'sports') return;

  if (embedKind === 'sports') {
    document.documentElement.classList.add('is-radar-embed', 'is-radar-sports-embed');

    function sportsHeight() {
      const root = document.getElementById('sports-embed');
      const h = Math.max(
        root?.scrollHeight || 0,
        document.documentElement.scrollHeight || 0,
        document.body?.scrollHeight || 0,
      );
      return Math.max(56, Math.ceil(h));
    }

    function postSports(extra) {
      try {
        parent.postMessage({
          type: 'radar-sports-embed',
          protocol: 1,
          height: sportsHeight(),
          ready: true,
          ...(extra || {}),
        }, '*');
      } catch (_) { /* ignore */ }
    }

    window.addEventListener('load', () => postSports({ event: 'load' }));
    window.addEventListener('resize', () => postSports({ event: 'resize' }), { passive: true });
    const kick = () => {
      postSports({ event: 'dom' });
      setTimeout(() => postSports({ event: 'hydrate' }), 400);
      setTimeout(() => postSports({ event: 'hydrate' }), 1400);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', kick);
    } else {
      kick();
    }
    if (typeof ResizeObserver === 'function') {
      const root = document.getElementById('sports-embed');
      if (root) new ResizeObserver(() => postSports({ event: 'ro' })).observe(root);
    }
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const surface = params.get('surface') === 'kiosque-v1' ? 'kiosque-v1' : 'legacy';
  const EMBED_H = surface === 'kiosque-v1' ? 68 : 62;
  document.documentElement.dataset.surface = surface;
  const themeParam = params.get('theme');
  if (themeParam === 'light' || themeParam === 'dark') {
    document.documentElement.dataset.theme = themeParam;
  }
  if (surface === 'kiosque-v1') {
    document.documentElement.dataset.theme = 'dark';
    // data-uni-session (fraîcheur) : le fond de barre ne varie plus.
    try {
      if (typeof RadarSessionFreshness !== 'undefined'
          && typeof RadarSessionFreshness.applyUniversitySessionTheme === 'function') {
        RadarSessionFreshness.applyUniversitySessionTheme();
      }
    } catch (_) { /* optionnel */ }
  }
  document.documentElement.style.setProperty('--embed-bar-h', `${EMBED_H}px`);

  // Hauteur souhaitée de l'iframe : hauteur de base, sauf quand le popover
  // volume (téléphone < 560 px) est ouvert — il déborde alors sous la rangée
  // et l'iframe doit s'agrandir pour ne pas le rogner.
  function desiredHeight() {
    const vol = document.getElementById('tuner-vol');
    if (!vol || !vol.classList.contains('is-open')) return EMBED_H;
    const slot = document.getElementById('tuner-vol-slot');
    // offsetHeight ignore le transform d'apparition (translateY/scale) :
    // la mesure est stable dès la première frame de l'animation.
    const anchor = vol.getBoundingClientRect().bottom;
    const slotH = slot?.offsetHeight || 0;
    return Math.max(EMBED_H, Math.ceil(anchor + 10 + slotH) + 8);
  }

  function postHeight(extra) {
    try {
      // La hauteur est toujours recalculée ici : un resize déclenché par
      // l'agrandissement de l'iframe (popover ouvert) doit renvoyer la hauteur
      // du popover, pas EMBED_H — sinon l'iframe rétrécit et rogne la bulle.
      const payload = {
        type: 'radar-embed',
        protocol: 1,
        surface,
        height: desiredHeight(),
        ready: surface !== 'kiosque-v1',
        ...(extra || {}),
      };
      parent.postMessage(payload, '*');
      // Legacy alias (pre-migration Ataraxia Solitaire listeners)
      parent.postMessage({ ...payload, type: 'ataraxia-radar-embed' }, '*');
    } catch (_) {}
  }

  // Classe utilitaire pour styles / debug parent
  document.documentElement.classList.add('is-radar-embed');

  // L'iframe doit suivre le bouton clair/sombre de la mini-app parente.
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (data?.type === 'radar-embed-theme' && (data.theme === 'light' || data.theme === 'dark')) {
      document.documentElement.dataset.theme = data.theme;
    }
  });

  window.addEventListener('load', () => postHeight({ event: 'load' }));
  window.addEventListener('resize', () => postHeight({ event: 'resize' }), { passive: true });

  // Embed étroit (< 560 px) : le volume s'ouvre en popover sous la rangée.
  // L'iframe est à hauteur fixe — on demande au parent la place du popover
  // le temps qu'il est ouvert, puis on revient à la hauteur de base.
  function watchVolumePopover() {
    const vol = document.getElementById('tuner-vol');
    if (!vol || typeof MutationObserver !== 'function') return;
    const syncHeight = () => {
      if (!vol.classList.contains('is-open')) {
        postHeight({ event: 'vol-close' });
        return;
      }
      // rAF : laisse le popover se poser avant de mesurer (desiredHeight).
      requestAnimationFrame(() => postHeight({ event: 'vol-open' }));
    };
    new MutationObserver(syncHeight).observe(vol, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchVolumePopover);
  } else {
    watchVolumePopover();
  }

  // Re-signal après hydratation du synthé (radios chargées)
  document.addEventListener('DOMContentLoaded', () => {
    postHeight({ event: 'dom' });
    // Petite latence : app.js (defer) peut peupler le dial juste après
    setTimeout(() => postHeight({ event: 'hydrate' }), 400);
  });

  // Le Kiosque ne révèle jamais une coquille vide. Le signal prêt arrive
  // après l'hydratation réelle du sélecteur; une panne de radios.json produit
  // un état indisponible explicite que l'hôte peut remplacer par son filet.
  if (surface === 'kiosque-v1') {
    const deadline = Date.now() + 5000;
    const announceAvailability = () => {
      const options = document.querySelectorAll('#tuner-select option:not([disabled])');
      if (options.length) {
        postHeight({ event: 'ready', ready: true, available: true });
        return;
      }
      if (Date.now() >= deadline) {
        postHeight({ event: 'unavailable', ready: true, available: false });
        return;
      }
      setTimeout(announceAvailability, 100);
    };
    announceAvailability();
  }
})();

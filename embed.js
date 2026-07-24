// Iframe embed (Solitaire, etc.) :
// hauteur fixe 58 px, volume en ligne, signale le parent via postMessage.
(function () {
  if (document.documentElement.dataset.embed !== 'tuner') return;

  const EMBED_H = 62; // aligné sur padding bureau 10+42+10

  function postHeight(extra) {
    try {
      const payload = {
        type: 'radar-embed',
        height: EMBED_H,
        ready: true,
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

  // Re-signal après hydratation du synthé (radios chargées)
  document.addEventListener('DOMContentLoaded', () => {
    postHeight({ event: 'dom' });
    // Petite latence : app.js (defer) peut peupler le dial juste après
    setTimeout(() => postHeight({ event: 'hydrate' }), 400);
  });
})();

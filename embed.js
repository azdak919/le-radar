// Iframe embed (Ataraxia Solitaire, etc.) :
// hauteur fixe 58 px, volume en ligne, signale le parent via postMessage.
(function () {
  if (document.documentElement.dataset.embed !== 'tuner') return;

  const EMBED_H = 62; // aligné sur padding bureau 10+42+10

  function postHeight(extra) {
    try {
      parent.postMessage(
        {
          type: 'ataraxia-radar-embed',
          height: EMBED_H,
          ready: true,
          ...(extra || {}),
        },
        '*'
      );
    } catch (_) {}
  }

  // Classe utilitaire pour styles / debug parent
  document.documentElement.classList.add('is-radar-embed');

  window.addEventListener('load', () => postHeight({ event: 'load' }));
  window.addEventListener('resize', () => postHeight({ event: 'resize' }), { passive: true });

  // Re-signal après hydratation du synthé (radios chargées)
  document.addEventListener('DOMContentLoaded', () => {
    postHeight({ event: 'dom' });
    // Petite latence : app.js (defer) peut peupler le dial juste après
    setTimeout(() => postHeight({ event: 'hydrate' }), 400);
  });
})();

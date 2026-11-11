/**
 * LE-RADAR.ca — enregistrement du service worker d'une app autonome.
 *
 * POURQUOI UN FICHIER SÉPARÉ
 * Les pages générées déclarent `script-src 'self'` sans `unsafe-inline` : un
 * `<script>` en ligne serait bloqué par la CSP. Ce fichier est donc chargé
 * uniquement par les pages qui portent leur propre manifeste (`/sports/`),
 * via `standaloneApp` dans `scripts/seo-pages-lib.js`.
 *
 * POURQUOI DES CHEMINS RELATIFS
 * `./sw.js` est résolu contre l'URL du document, pas contre celle de ce
 * script. Depuis `/sports/`, on enregistre donc bien `/sports/sw.js` avec la
 * portée `/sports/` — isolée du service worker racine, qui exclut ce chemin
 * (voir `ISOLATED_PATH_RE` dans `sw.js`).
 */
(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;
  // Une page affichée dans le shell de continuité audio est un iframe : c'est
  // au document hôte d'enregistrer son propre worker, pas à l'enfant.
  if (window !== window.top) return;

  // Le worker peint parfois le HTML en cache, puis découvre un Last-Modified
  // plus récent. Un seul rechargement par révision : la page neuve a le même
  // jeton et ne boucle pas.
  var RELOAD_TOKEN_KEY = 'sports-doc-reload-token';

  function reloadIfNewSportsDocument(token) {
    if (!token) return;
    try {
      if (sessionStorage.getItem(RELOAD_TOKEN_KEY) === token) return;
      sessionStorage.setItem(RELOAD_TOKEN_KEY, token);
    } catch (err) {
      return;
    }
    location.reload();
  }

  navigator.serviceWorker.addEventListener('message', (event) => {
    var data = event.data || {};
    if (data.type === 'sports-document-updated') reloadIfNewSportsDocument(data.token);
  });

  navigator.serviceWorker.ready.then((reg) => {
    var worker = navigator.serviceWorker.controller || reg.active;
    if (worker) worker.postMessage({ type: 'sports-document-status' });
  }).catch(() => {});

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
})();

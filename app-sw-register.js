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

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
})();

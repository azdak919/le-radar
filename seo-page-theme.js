/**
 * LE-RADAR.ca — Thème des pages d'entités (radios, journaux, établissements).
 *
 * Ces pages n'embarquent pas app.js. Ce micro-script applique le même thème
 * que le reste du site, avec la même clé de stockage (`req-theme`), avant le
 * premier paint — sinon une personne en mode sombre reçoit une page blanche
 * en arrivant depuis un moteur de recherche.
 *
 * Volontairement sans dépendance et sans écriture : ces pages ne proposent pas
 * de bascule, elles se contentent de respecter la préférence existante.
 */
(function () {
  'use strict';
  try {
    var saved = localStorage.getItem('req-theme');
    var dark = saved
      ? saved === 'dark'
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {
    /* stockage indisponible (mode privé strict) : on garde le thème clair. */
  }
})();

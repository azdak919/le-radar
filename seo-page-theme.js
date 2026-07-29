/**
 * LE-RADAR.ca — Amorçage du thème des pages natives.
 *
 * Ces pages n'embarquent pas app.js. Ce micro-script applique le même thème
 * que le reste du site, avec la même clé de stockage (`radar-theme`), avant le
 * premier paint — sinon une personne en mode sombre reçoit une page blanche
 * en arrivant depuis un moteur de recherche.
 *
 * Volontairement sans dépendance et sans écriture : app.js ou les mini-apps
 * gardent la bascule; ce bootstrap se contente de respecter la préférence
 * déjà enregistrée avant le premier paint.
 */
(function () {
  'use strict';
  try {
    var saved = localStorage.getItem('radar-theme');
    var dark = saved
      ? saved === 'dark'
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', dark ? '#0e0f12' : '#ffffff');
  } catch (e) {
    /* stockage indisponible (mode privé strict) : on garde le thème clair. */
  }
})();

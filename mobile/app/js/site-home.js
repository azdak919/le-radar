/* Charge le mât, la météo et le bandeau sports du site, puis les démarre.
   Aperçu : fichiers à la racine du dépôt. APK : copies sous ./site/. */
(function () {
  var inSource = /\/mobile\/app\/?/.test(location.pathname);
  var root = inSource ? '../../' : './site/';
  var files = [
    'scripts/season-lib.js',
    'bg-rotation-lib.js',
    'photo-bank-data.js',
    'quebec-backgrounds-data.js',
    'quebec-university-backgrounds-data.js',
    'quebec-nations-backgrounds-data.js',
    'quebec-favorites-backgrounds-data.js',
    'quebec-backgrounds.js',
    'weather-cities-data.js',
    'radar-utils.js',
    'radar-state.js',
    'radar-weather.js',
    'scripts/sports-freshness-lib.js',
    'radar-sports-cta.js',
  ];

  function boot() {
    try {
      if (typeof initMastheadWeather === 'function') initMastheadWeather();
    } catch (error) {
      console.warn('météo du mât', error);
    }
    try {
      if (typeof initMastheadSports === 'function') initMastheadSports();
    } catch (error) {
      console.warn('bandeau sports', error);
    }
  }

  function load(index) {
    if (index >= files.length) {
      boot();
      return;
    }
    var script = document.createElement('script');
    script.src = root + files[index];
    script.onload = function () { load(index + 1); };
    script.onerror = function () {
      console.warn('module du site absent', files[index]);
      load(index + 1);
    };
    document.body.appendChild(script);
  }

  load(0);
}());

/* LE-RADAR — lecteur natif pour les rares pages publiques écrites à la main.
 * Le balisage de référence reste celui de l'accueil. Aucun iframe : ce script
 * copie seulement #tuner, puis charge le même moteur audio que l'accueil. */
(async function () {
  'use strict';

  if (document.getElementById('tuner')) return;

  const script = document.currentScript || [...document.scripts]
    .find((node) => /native-tuner\.js(?:\?|$)/.test(node.src));
  const base = new URL('.', script?.src || location.href);

  try {
    const source = await fetch(new URL('index.html', base), { cache: 'force-cache' });
    if (!source.ok) throw new Error(`index.html ${source.status}`);
    const doc = new DOMParser().parseFromString(await source.text(), 'text/html');
    const tuner = doc.getElementById('tuner');
    if (!tuner) throw new Error('tuner absent de la source');

    const anchor = document.querySelector('header');
    if (anchor?.parentNode) anchor.parentNode.insertBefore(tuner, anchor.nextSibling);
    else document.body.prepend(tuner);

    for (const asset of [
      'cast.js',
      'mobile-playback.js',
      'player-sync.js',
      'institution-acronyms-data.js',
      'app.js',
    ]) {
      await new Promise((resolve, reject) => {
        const node = document.createElement('script');
        node.src = new URL(asset, base).href;
        node.onload = resolve;
        node.onerror = () => reject(new Error(`chargement ${asset} impossible`));
        document.head.appendChild(node);
      });
    }
  } catch (error) {
    console.error('LE-RADAR: lecteur natif indisponible', error);
  }
})();

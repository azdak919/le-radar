/* ═══════════════════════════════════════════════════════
   Ataraxia — disposition AVANT le premier rendu (js/layout-boot.js)

   POURQUOI CE FICHIER EXISTE
   `pomo/styles/layout.css` accroche 105 règles à `html[data-layout]`, et
   l'attribut n'était posé qu'au `DOMContentLoaded`, par `layout.js`. Sur
   téléphone, la page peignait donc d'abord les proportions bureau — anneau
   surdimensionné, panneaux côte à côte, aucun décalage de barre — avant de
   basculer d'un coup. Un fondu aurait masqué le saut ; le poser avant la
   peinture le supprime.

   POURQUOI UN FICHIER ET PAS UN <script> INLINE
   La CSP de la page déclare `script-src 'self'` sans `'unsafe-inline'` : un
   script inline serait chargé puis jeté, exactement comme l'ont été les styles
   du menu d'installation. Un fichier passe, sans toucher à la CSP.

   Chargé SYNCHRONE dans le <head>, avant les feuilles : c'est le même patron
   que `seo-page-theme.js` sur le site.

   Ce module est la source unique des seuils de disposition ; `layout.js` les
   lit ici plutôt que d'en garder une seconde copie.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var MQS = {
    touch: '(pointer: coarse) and (max-width: 1024px), (pointer: coarse) and (max-height: 520px), (hover: none) and (max-width: 900px)',
    portrait: '(orientation: portrait)',
  };

  /** Pilules réduites — plafond largeur (téléphone moyen). */
  var PHONE_LAYOUT_MAX = 430;
  /** UI pleine largeur chrome — pomo/citation empilés (téléphone + petit viewport). */
  var PHONE_UI_MAX = 720;

  var SCENE_KEY = 'ataraxia_scene';
  var LEGACY_SCENE_KEY = 'ataraxia_focus_scene';

  /** Tactile (téléphone / tablette) — layout Focus Deck, pas le wide desktop. */
  function isTouchViewport() {
    var coarse = window.matchMedia('(pointer: coarse)').matches;
    var noHover = window.matchMedia('(hover: none)').matches;
    var w = window.innerWidth;
    var h = window.innerHeight;
    return (coarse && (w <= 1024 || h <= 520)) || (noHover && w <= 900);
  }

  /** Scène mémorisée, sans migrer le stockage : `layout.js` s'en charge après. */
  function readScene() {
    try {
      var saved = localStorage.getItem(SCENE_KEY);
      if (saved == null) saved = localStorage.getItem(LEGACY_SCENE_KEY);
      return saved === 'quote' ? 'quote' : 'timer';
    } catch (e) {
      return 'timer';
    }
  }

  /**
   * Délai au-delà duquel on révèle la page quoi qu'il arrive.
   *
   * Le fondu ne couvre que les valeurs qui EXIGENT une mesure du DOM
   * (`--toolbar-offset`, `--content-pad-*`) : impossible de les connaître avant
   * peinture. Si `layout.js` ne venait jamais les poser, ce filet garantit que
   * personne ne reste devant une page vide — seul le JS masque, donc seul le JS
   * peut oublier de révéler.
   */
  var REVEAL_CEILING_MS = 1500;

  var root = document.documentElement;
  var mode = isTouchViewport() ? 'touch' : 'wide';
  root.dataset.layout = mode;
  if (mode === 'touch') root.dataset.scene = readScene();
  root.dataset.booting = '1';
  window.setTimeout(function () {
    root.removeAttribute('data-booting');
  }, REVEAL_CEILING_MS);

  window.ATARAXIA_LAYOUT_BOOT = {
    MQS: MQS,
    PHONE_LAYOUT_MAX: PHONE_LAYOUT_MAX,
    PHONE_UI_MAX: PHONE_UI_MAX,
    SCENE_KEY: SCENE_KEY,
    LEGACY_SCENE_KEY: LEGACY_SCENE_KEY,
    isTouchViewport: isTouchViewport,
    readScene: readScene,
  };
})();

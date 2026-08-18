/**
 * Sujets refusés en fond de mât — wallpaper-subject-lib + porte HARD.
 * Run: node tests/wallpaper-subject.mjs
 *
 * Les trois cas nominaux sont les photos réellement servies en production le
 * 2026-08-06 et rejetées par revue humaine. Les témoins vérifient qu'on n'a pas
 * élargi au point d'attraper un paysage : le français descriptif d'une rive
 * (« face au village », « groupe d'îles », « chef-lieu ») ne doit rien
 * déclencher, sinon on affame les banques.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const {
  FACE_MIN_RATIO,
  looksSpeciesMacro,
  looksPeopleScene,
  looksVernacularBuilding,
  looksFaceDetected,
} = require('../scripts/wallpaper-subject-lib.js');
const { auditPhotoHard } = require('../scripts/bank-hard-audit-lib.js');
const { seasonTagTrusted } = require('../scripts/season-lib.js');

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  } else {
    console.log('ok:', msg);
  }
}

// ── Macro / spécimen ─────────────────────────────────────────
const fragaria = {
  title: 'Fragaria virginiana 030',
  url: 'https://upload.wikimedia.org/wikipedia/commons/7/74/Fragaria_virginiana_030.jpg',
  link: 'https://commons.wikimedia.org/wiki/File:Fragaria%20virginiana%20030.jpg',
  categories:
    'Fragaria virginiana|Saint Lawrence River|Laurentides|Flore Laurentienne|Self-published work',
  description: '46° 36\' N - 072° 19\' W, Mauricie, Saint-Prosper, June 2, 2009',
  width: 3456,
  height: 2304,
};
assert(looksSpeciesMacro(fragaria), 'macro : binôme latin + catégorie taxon');
assert(
  looksSpeciesMacro({ title: 'Vue du lac', categories: 'Flora of Quebec' }),
  'macro : catégorie d’inventaire naturaliste seule'
);
assert(
  !looksSpeciesMacro({
    title: 'Village historique',
    categories: 'Beaupré|Heritage sites in Quebec',
  }),
  'macro : titre en deux mots sans taxon reste admis'
);
assert(
  !looksSpeciesMacro({
    title: 'Rocher Percé 12',
    categories: 'Rocher Percé|Gaspésie',
  }),
  'macro : toponyme numéroté reste admis'
);

// ── Personnes hors titre ─────────────────────────────────────
const havre = {
  title: 'Havre St Pierre 006',
  url: 'https://upload.wikimedia.org/wikipedia/commons/9/97/Havre_St_Pierre_006.jpg',
  link: 'https://commons.wikimedia.org/wiki/File:Havre%20St%20Pierre%20006.jpg',
  categories: 'Saint Lawrence River|Côte-Nord|Havre-Saint-Pierre|Self-published work',
  description:
    'MRC Minganie, 1000, Promenade des Anciens, information and reservation kiosks, in front of No. 4, offers excursions to the Mingan Archipelago',
  width: 1600,
  height: 1200,
};
assert(looksPeopleScene(havre), 'personnes : kiosques décrits hors du titre');
assert(
  !looksPeopleScene({
    description: 'Vue du lac face au village, groupe d’îles au loin',
    categories: 'Lac des Deux-Montagnes',
  }),
  'personnes : « face », « groupe » en français descriptif restent admis'
);
assert(
  !looksPeopleScene({
    title: 'Pow-wow à Mashteuiatsh',
    description: 'Rassemblement estival, danseurs autour du cercle',
    categories: 'Mashteuiatsh|Pekuakamiulnuatsh',
  }),
  'personnes : pow-wow / danse culturelle autochtone admis (visages au pixel)'
);

// ── Bâti vernaculaire ────────────────────────────────────────
const colomb = {
  title: 'Pointe-Calumet (QC)-Local des Chevaliers de Colomb-2023',
  url: 'https://upload.wikimedia.org/wikipedia/commons/7/77/Pointe-Calumet_%28QC%29-Local_des_Chevaliers_de_Colomb-2023.jpg',
  link: 'https://commons.wikimedia.org/wiki/File:Pointe-Calumet',
  description: 'Community hall of the Knights of Columbus, on Montée de la Baie',
  categories: 'Pointe-Calumet|Self-published work',
  width: 11832,
  height: 5013,
};
assert(looksVernacularBuilding(colomb), 'vernaculaire : salle de club-service');
assert(
  !looksVernacularBuilding({
    title: 'Église de Baie-Saint-Paul',
    description: 'Vue du village depuis la côte',
  }),
  'vernaculaire : village ordinaire reste admis'
);

// ── Visage mesuré au pixel ───────────────────────────────────
assert(
  looksFaceDetected({ faces: 1, faceRatio: 0.004 }),
  `visage : au-dessus du seuil ${FACE_MIN_RATIO}`
);
assert(
  !looksFaceDetected({ faces: 1, faceRatio: 0.0005 }),
  'visage : silhouette lointaine sous le seuil reste admise'
);
assert(!looksFaceDetected({ faces: 0, faceRatio: 0 }), 'visage : aucun détecté');
assert(
  !looksFaceDetected({}),
  'visage : banque non annotée ne bloque pas (porte muette)'
);

// ── Porte HARD (mêmes motifs côté audit) ─────────────────────
for (const [label, photo, reason] of [
  ['macro', fragaria, 'macro_closeup'],
  ['personnes', havre, 'people_scene'],
  ['vernaculaire', colomb, 'vernacular_building'],
]) {
  const res = auditPhotoHard(photo, { landscape: true });
  assert(
    !res.ok && res.reasons.includes(reason),
    `audit HARD ${label} → ${reason} (${res.reasons.join(', ') || 'aucun'})`
  );
}
const paysage = auditPhotoHard(
  {
    title: 'Lac des Deux-Montagnes paysage',
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Lac.jpg',
    link: 'https://commons.wikimedia.org/wiki/File:Lac.jpg',
    description: 'Vue du lac face au village, groupe d’îles au loin',
    categories: 'Lac des Deux-Montagnes',
    width: 4000,
    height: 2500,
  },
  { landscape: true }
);
assert(paysage.ok, `audit HARD témoin paysage accepté (${paysage.reasons.join(', ')})`);

// ── Étiquette saisonnière de confiance ───────────────────────
assert(
  !seasonTagTrusted({ season: 'ete', seasonSource: 'sessionId-fallback', seasonConfidence: 0.3 }),
  'saison : repli de session non fiable'
);
assert(
  !seasonTagTrusted({ season: 'ete', seasonSource: 'text', seasonConfidence: 0.3 }),
  'saison : confiance sous 0,5 non fiable'
);
assert(
  seasonTagTrusted({ season: 'hiver', seasonSource: 'manual', seasonConfidence: 1 }),
  'saison : revue humaine fiable'
);
assert(seasonTagTrusted({ season: 'ete' }), 'saison : sans métadonnée, on garde l’étiquette');
assert(
  !seasonTagTrusted({
    season: 'hiver',
    seasonSource: 'visual',
    seasonConfidence: 0.8,
    title: 'Pavillon Roger-Gaudry',
  }),
  'saison : hiver visuel seul (pierre grise) non fiable'
);
assert(
  !seasonTagTrusted({
    season: 'hiver',
    seasonSource: 'text+visual',
    seasonConfidence: 0.99,
    title: 'Henry F. Hall Building, Concordia University',
  }),
  'saison : hiver sans mot neige/hiver dans le texte — pas fiable'
);
assert(
  seasonTagTrusted({
    season: 'hiver',
    seasonSource: 'text+visual',
    seasonConfidence: 0.99,
    title: 'Campus de Laval sous la neige',
  }),
  'saison : hiver avec preuve textuelle (neige) fiable'
);

if (failed) {
  console.error(`\n${failed} test(s) en échec — wallpaper-subject`);
  process.exit(1);
}
console.log('\nOK wallpaper-subject (macro, personnes, vernaculaire, visage, saison)');

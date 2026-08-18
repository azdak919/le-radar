/**
 * LE RADAR — signaux de sujet pour les banques de fonds (mât, pomo, campus,
 * nations). Source de vérité partagée entre l'ingestion
 * (maintain-quebec-backgrounds.js) et l'audit HARD hors ligne
 * (bank-hard-audit-lib.js), comme religious-facade-lib.
 *
 * Ces trois signaux viennent de photos servies en production le 2026-08-06 que
 * toutes les portes existantes laissaient passer :
 *
 *  - « Fragaria virginiana 030 » — macro de fraisier. 3456×2304, ratio 1,5,
 *    CC BY : aucune porte dimensionnelle ne bronche, et le titre est un binôme
 *    latin numéroté, donc ni « macro » ni « close-up » à attraper. Ce sont les
 *    catégories Commons (taxon d'espèce, Flore Laurentienne) qui trahissent le
 *    plan rapproché.
 *  - « Havre St Pierre 006 » — visage lisible devant des kiosques. PEOPLE_RE ne
 *    lisait que titre/URL/lien ; la description Commons, elle, décrit la scène.
 *  - « Pointe-Calumet (QC)-Local des Chevaliers de Colomb-2023 » — salle de
 *    club-service en bord de route : bâti vernaculaire sans valeur de paysage.
 *
 * Le détecteur de visages pixel (detect-photo-faces) complète le volet
 * « personnes » là où aucun mot-clé n'existe ; ce module lit son résultat
 * persisté pour que la porte fonctionne aussi en CI, sans Python.
 */

'use strict';

/** Binôme latin : « Fragaria virginiana », « Acer saccharum var. saccharum ». */
const LATIN_BINOMIAL_RE =
  /^[A-Z][a-z]{2,}\s+[a-z]{3,}(?:\s+(?:subsp\.|var\.|f\.)\s+[a-z]{3,})?$/;

/** Catégories Commons d'inventaire naturaliste (photo de spécimen, pas de paysage). */
const TAXON_CATEGORY_RE =
  /\b(?:flore laurentienne|flora of|fauna of|plants of|flowers of|insects of|fungi of|lichens of|mosses of|birds of)\b/i;

/**
 * Personnes décrites dans la description / les catégories Commons.
 * Volontairement plus étroit que PEOPLE_RE : on écarte les mots qui collident
 * avec le français descriptif d'un paysage (« face au fleuve », « chef-lieu »,
 * « groupe d'îles »), et on ajoute la scène de comptoir/kiosque, qui implique
 * des personnes au premier plan même quand aucune n'est nommée.
 */
const PEOPLE_SCENE_RE =
  /(?:\bpeople\b|\bpersons?\b|\bman\b|\bwoman\b|\bmen\b|\bwomen\b|\bchild(?:ren)?\b|\bfamily\b|\bfamille\b|\bhommes?\b|\bfemmes?\b|\benfants?\b|\bcrowd\b|\bfoule\b|\bselfie\b|\bportrait\b|\bkiosks?\b|\bkiosques?\b|\bbooths?\b|\bvendors?\b|\bcomptoirs?\b)/i;

/** Bâti vernaculaire : ni paysage, ni patrimoine, ni campus. */
const VERNACULAR_BUILDING_RE =
  /(?:\bchevaliers de colomb\b|\bknights of columbus\b|\bcommunity hall\b|\bcommunity cent(?:er|re)\b|\bsalle communautaire\b|\bcentre communautaire\b|\bd[ée]panneur\b|\bstrip mall\b|\bmini[\s-]?putt\b|\bcar wash\b|\blave[\s-]?auto\b|\bgas station\b|\bstation[\s-]service\b)/i;

/**
 * Surface du plus grand visage rapportée au recadrage 3,8:1 du bandeau, seuil
 * de rejet. Calibré sur mesure, pas au jugé : le visage de « Havre St Pierre
 * 006 » pèse 0,40 % du bandeau, et les 113 paysages du mât ne produisent aucune
 * détection une fois le filtre de carnation appliqué. 0,2 % laisse donc une
 * marge d'un facteur deux sous le seul vrai positif connu.
 */
const FACE_MIN_RATIO = 0.002;

function joinFields(entry, fields) {
  if (!entry) return '';
  return fields
    .map((f) => entry[f])
    .filter(Boolean)
    .join(' ');
}

function categoryList(entry) {
  return String((entry && entry.categories) || '')
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Titre débarrassé de son numéro de série : « Fragaria virginiana 030 ». */
function titleTaxon(entry) {
  return String((entry && entry.title) || '')
    .trim()
    .replace(/\s+\d{1,4}$/, '');
}

/**
 * Photo de spécimen / plan rapproché naturaliste.
 * Deux voies : catégorie d'inventaire explicite, ou titre en binôme latin
 * confirmé par une catégorie taxon (le titre seul serait trop large — « Village
 * historique » a la même forme).
 */
function looksSpeciesMacro(entry) {
  if (!entry) return false;
  const cats = categoryList(entry);
  if (TAXON_CATEGORY_RE.test(cats.join(' | '))) return true;
  const taxon = titleTaxon(entry);
  if (!LATIN_BINOMIAL_RE.test(taxon)) return false;
  return cats.some(
    (c) => c.toLowerCase() === taxon.toLowerCase() || LATIN_BINOMIAL_RE.test(c)
  );
}

/** Personnes / comptoirs décrits hors du titre (description, catégories). */
function looksPeopleScene(entry) {
  return PEOPLE_SCENE_RE.test(joinFields(entry, ['description', 'categories']));
}

/** Salle communautaire, local de club, commerce de bord de route. */
function looksVernacularBuilding(entry) {
  return VERNACULAR_BUILDING_RE.test(
    joinFields(entry, ['title', 'url', 'link', 'description', 'categories'])
  );
}

/**
 * Visage détecté au pixel par detect-photo-faces (champ persisté en banque).
 * Absence d'annotation = pas de rejet : la porte reste muette tant que la passe
 * n'a pas tourné, elle ne bloque jamais une banque non annotée.
 */
function looksFaceDetected(entry) {
  if (!entry) return false;
  const faces = Number(entry.faces);
  if (!Number.isFinite(faces) || faces < 1) return false;
  const ratio = Number(entry.faceRatio);
  if (!Number.isFinite(ratio)) return true;
  return ratio >= FACE_MIN_RATIO;
}

module.exports = {
  LATIN_BINOMIAL_RE,
  TAXON_CATEGORY_RE,
  PEOPLE_SCENE_RE,
  VERNACULAR_BUILDING_RE,
  FACE_MIN_RATIO,
  looksSpeciesMacro,
  looksPeopleScene,
  looksVernacularBuilding,
  looksFaceDetected,
};

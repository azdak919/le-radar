/**
 * LE RADAR — blacklist durable des fonds photo QC
 *
 * Source de vérité pour le hard-ban (URL / File Commons / id en priorité).
 * Consommée par :
 *   - maintain-quebec-backgrounds.js  (rejet seed + purge)
 *   - sync-quebec-backgrounds.js      (purge offline + régén JS)
 *   - tests/data-integrity (anti-régression, si branché)
 *
 * Règles d’ajout :
 *   1. Préférer un fragment d’URL / nom de fichier Commons stable
 *   2. Ajouter l’id sha1-12 si déjà connu
 *   3. reason court, snake_case (loggable)
 *   4. Commenter le jugement (pourquoi, pas seulement quoi)
 *   5. Ne PAS blacklister un toponyme entier sauf si toute photo du lieu est indésirable
 *
 * Match : sous-chaîne case-insensitive sur id + url + link + title.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REJECTED_JSON = path.join(__dirname, '..', 'data', 'quebec-backgrounds-rejected.json');

/**
 * @typedef {{ fragments: string[], reason: string, note?: string }} HardBanEntry
 */

/** @type {HardBanEntry[]} */
const HARD_BANNED = [
  {
    // Sélection visuelle humaine : fonds rejetés pour le mât (façade, quai,
    // sentier, gare, skyline gris et deux vues Rigaud trop chargées).
    fragments: [
      'UQAM-Judith-Jasmin.jpg',
      '4ca5adf8cc3b',
      'House_facade_in_%C3%8Ele_d%27Orl%C3%A9ans',
      '69dd0a2ae94d',
      'Hudson_%28Qu%C3%A9bec%29-Trottoir_de_bois_sur_le_sentier_Sandy_Beach',
      '3c32360af1cc',
      'Hudson_%28Qu%C3%A9bec%29-Quai_flottant',
      '94c9767b0bdb',
      'Skyline_of_Quebec_City.jpg',
      'c46d86d3f064',
      'Rigaud_%28Qu%C3%A9bec%29-%C3%89difice_Robert-Lionel-Se2022-09-22',
      'c10b1831a704',
      'Rigaud_%28Qu%C3%A9bec%29-Edifice_Robert-Lionel_Seguin-2022-09-22',
      'f4bb693d8149',
      '%C3%8Ele-Perrot_train_station_%28exo%29_panorama',
      '7542e90a6e4f',
    ],
    reason: 'user_curated_photo_rejected',
    note: 'Purge 2026-07-26 : sélection mast rejetée visuellement par l’éditeur.',
  },
  {
    // Sélection visuelle humaine : scène de village trop chargée pour le mât.
    fragments: ['Les_Cedres_QC.JPG', '40581afcfb46'],
    reason: 'user_curated_photo_rejected',
    note: 'Retiré 2026-07-26 des banques mât+pomo.',
  },
  {
    // Sélection visuelle humaine : promenade / quais trop présents au bandeau.
    fragments: ['Deux-Montagnes%28QC%29-Parc_des_b%C3%A9n%C3%A9voles-2022-03-15', 'cce0e2776f36'],
    reason: 'user_curated_photo_rejected',
    note: 'Retiré 2026-07-26 des banques mât+pomo.',
  },
  {
    // Sélection visuelle humaine : rue résidentielle, pas un fond panoramique.
    fragments: ['Pointe-Calumet_%28QC%29-Vue_de_Mont%C3%A9e_de_la_Baie-2023', '04a174343ff8'],
    reason: 'user_curated_photo_rejected',
    note: 'Retiré 2026-07-26 des banques mât+pomo.',
  },
  {
    // Sélection visuelle humaine : rivière encadrée de trop près par le bâti.
    fragments: ['Rigaud_%28Qu%C3%A9bec%29-rivi%C3%A8re_Rigaud_%28vue_vers_l%27amont%29-2022-09-22', 'd0b225c2bd71'],
    reason: 'user_curated_photo_rejected',
    note: 'Retiré 2026-07-26 des banques mât+pomo.',
  },
  {
    // Sélection visuelle humaine : vue urbaine trop chargée pour le mât.
    fragments: ['Rigaud_%28Qu%C3%A9bec%29-Rivi%C3%A8re_Rigaud-2022-09-22', 'fec45852f13d'],
    reason: 'user_curated_photo_rejected',
    note: 'Retiré 2026-07-26 des banques mât+pomo.',
  },
  {
    // Sélection visuelle humaine : arche de Percé trop dominante en bandeau.
    fragments: ['Rocher_Perc%C3%A9_%28Gasp%C3%A9sie%29.jpg', '99b5a01e8421'],
    reason: 'user_curated_photo_rejected',
    note: 'Retiré 2026-07-26 des banques mât+pomo.',
  },
  {
    // Sélection visuelle humaine : macro de feuilles, pas un paysage de mât.
    fragments: ['2016-10_Maple_leaves_autumn_Quebec_01', '6a8b5f2a19e4'],
    reason: 'user_curated_photo_rejected',
    note: 'Retiré 2026-07-26 des banques mât+pomo.',
  },
  {
    // Sélection visuelle humaine : premier plan de champ trop uniforme.
    fragments: ['Champ_sur_l%27%C3%AEle_d%27Orl%C3%A9ans', 'f0460e0fa873'],
    reason: 'user_curated_photo_rejected',
    note: 'Retiré 2026-07-26 des banques mât+pomo.',
  },
  {
    // Chapelle très lisible au centre de Wôlinak, malgré le titre neutre.
    fragments: ['W%C3%B4linak.jpg', '3e9586b9617b'],
    reason: 'church_steeple_visible',
    note: 'Retiré 2026-07-26 de la banque Nations.',
  },
  {
    // Sélection visuelle humaine : scène nocturne peu lisible en bandeau.
    fragments: ['Manawan_e_tipiskak', '398524378425'],
    reason: 'user_curated_photo_rejected',
    note: 'Retiré 2026-07-26 de la banque Nations.',
  },
  {
    // Commons : « town hall » ; image : clocher / pignon type chapelle
    fragments: [
      'Vaudreuil-sur-le-Lac_QC',
      'upload.wikimedia.org/wikipedia/commons/b/b0/Vaudreuil-sur-le-Lac_QC.JPG',
      'eb86432b9561',
    ],
    reason: 'reads_as_chapel_clocher',
    note: 'Purge 2026-07-25 mât+pomo ; pas de paysage libre du village',
  },
  {
    // Décision éditoriale : retirer toutes les variantes du pont de l'Île-
    // aux-Tourtes, trop récurrentes et peu intéressantes en fond.
    fragments: [
      'Pont_de_l-Ile-aux-Tourtes_02',
      'Pont_de_l-Ile-aux-Tourtes_04',
      '%C3%8Ele_aux_Tourtes_Bridge.JPG',
      '7cc36bfa6f04',
      'dbbb99342f74',
      'Lac_des_Deux_Montagnes_-_ile-aux-Tourtes',
      'aa7634a182d8',
      'Two_Lanes_Open_on_Pont_Ile-Aux-Tourtes',
      '81243a82b35f',
      'Parc_Central_de_Deux-Montagnes',
      '0246d46d7655',
      'dbc9dbfdb45e',
      '9c13d023d170',
      'f443512d360f',
      '99aea36c75bf',
      '1f249773d042',
      'Quebec_Autoroute_30_-_WB_-_Soulanges_Canal_Tunnel',
      '68c3cfe5b4a2',
    ],
    reason: 'user_curated_location_rejected',
    note: 'Purge 2026-07-26 de toutes les banques et surfaces (mât + pomo).',
  },
  // Henry_F._Hall_Building_10 : réintégré universities avec focalY fenêtres
  // (grille modulaire Concordia) — ne pas re-bannir sans relecture visuelle.
  {
    // Clôture grillagée — effet carcéral (nation crie légitime, photo non)
    fragments: [
      'Oujé-Bougoumou_en_août_2014_03',
      'Ouj%C3%A9-Bougoumou_en_ao%C3%BBt_2014_03',
      'Ouje-Bougoumou_en_aout_2014_03',
    ],
    reason: 'chain_link_prison_effect',
    note: 'Remplacé par 2014_01 (musée) 2026-07-25',
  },
  {
    // Aéroport / hangar / voie ferrée — scène industrielle morne
    fragments: [
      'Les_Cèdres_Airport',
      'Les_C%C3%A8dres_Airport',
      'Cedres_Airport',
      'Airport_from_railway_teack',
      'Montréal-Les_Cèdres_Airport',
      'Montr%C3%A9al-Les_C%C3%A8dres_Airport',
    ],
    reason: 'drab_industrial_airport',
    note: 'Purge 2026-07-25 mât+pomo ; Les_Cedres_QC.JPG (village) reste OK',
  },
  {
    // Vue aérienne Odanak : superbe paysage fluvial, mais clocher d’église
    // blanc dominant au centre-droit du bandeau (titre sans « église »).
    fragments: [
      'Odanak_Vue_aérienne_2025',
      'Odanak_Vue_a%C3%A9rienne_2025',
      'Odanak_Vue_aerienne_2025',
      '223778e14b51',
    ],
    reason: 'church_steeple_visible',
    note: 'Purge 2026-07-25 mât+nations+pomo ; remplacé par Rivière Saint-François 2025 (même auteur, sans clocher)',
  },
  {
    // Usine d’épuration — pas un paysage de bandeau (même si Odanak)
    fragments: [
      'Station_d\'épuration_Odanak',
      'Station_d%27%C3%A9puration_Odanak',
      'Station_d_epuration_Odanak',
    ],
    reason: 'industrial_water_treatment',
    note: 'Découverte 2026-07-25 nations — filtré + ban',
  },
  {
    // Gros plan panneau d’arrêt — pas un wallpaper
    fragments: ['AbenakisStopSign', 'Abenaki_stop_sign', 'Abenaki stop sign odanak'],
    reason: 'signage_closeup',
    note: 'Découverte 2026-07-25 nations — filtré + ban',
  },
  {
    // Panneau d’entrée communauté — pas un wallpaper (titre = toponyme seul).
    // Ne pas bannir Gesgapegiag4 / Gesgapegiag5 (tipi / structures, OK nations).
    fragments: [
      'commons/a/a8/Gesgapegiag.jpg',
      'File:Gesgapegiag.jpg',
      'File:Gesgapegiag.JPG',
      'aa3d7c561410',
    ],
    reason: 'community_entrance_sign',
    note: 'Purge 2026-07-25 nations — enseigne bleue + logo tipi sous LE RADAR ; 4/5 restent',
  },
  {
    // Gros plan d’un bas-relief sur mur de brique : ni paysage ni campus.
    // Le ratio (1,333) passait le seuil 1,25 et « close-up » n’est pas dans le
    // titre — seul un regard sur l’image le révèle.
    // Audit pixel : busy_low_chroma_facade + competing_logo_zone + low_landscape.
    fragments: [
      'Loyola_College_Building_15',
      'File:Loyola_College_Building_15.JPG',
    ],
    reason: 'closeup_wall_relief',
    note: 'Purge 2026-07-26 campus — inutilisable en bandeau ; Concordia garde Hall Building',
  },
  {
    // Visages nettement identifiables au premier plan (groupe en habits de
    // noce). La politique en tête de banque dit « pas de personnes
    // reconnaissables » : ce motif suffit, sans avoir à trancher sur le
    // néogothique de la tour. Entrée par ailleurs sans width/height.
    fragments: [
      "Bishop's_University_McGreer_Hall",
      'Bishop%27s_University_McGreer_Hall',
      'Bishop_s_University_McGreer_Hall',
    ],
    reason: 'recognizable_people',
    note: 'Purge 2026-07-26 campus — décision humaine ; Bishop\'s garde campus 2011 si recadré',
  },
  {
    // Rue commerçante : enseignes de boutiques, poteaux électriques, chaussée
    // au premier plan. La regex négative connaît « enseigne » et « signage »
    // mais ne lit que le titre, ici réduit au toponyme.
    // Audit pixel : competing_logo_zone.
    fragments: [
      'commons/5/5d/Wendake-Qu',
      'File:Wendake-Québec.JPG',
      'File:Wendake-Quebec.JPG',
    ],
    reason: 'commercial_street_signage',
    note: 'Purge 2026-07-26 nations — pas un paysage ; Wendake reste éligible via une autre vue',
  },
  {
    // Macro de fleur (fraisier des champs) : sujet unique à faible profondeur
    // de champ, illisible en bandeau 3,8:1. Le titre est un binôme latin
    // numéroté, donc aucun mot-clé « macro » / « close-up » à attraper — c'est
    // la catégorie taxon (Fragaria virginiana, Flore Laurentienne) qui trahit
    // le plan rapproché ; gate `macro_closeup` ajouté en conséquence.
    fragments: ['Fragaria_virginiana_030', '40596f653cdd'],
    reason: 'macro_closeup',
    note: 'Purge 2026-08-06 mât+pomo — décision humaine sur capture de production',
  },
  {
    // Visage d'homme nettement identifiable au premier plan, devant les kiosques
    // de la promenade. La politique de banque interdit les personnes
    // reconnaissables ; ni le titre (toponyme numéroté) ni les catégories ne le
    // disaient, mais la description Commons nomme l'individu.
    fragments: ['Havre_St_Pierre_006', 'a321610ec6dc'],
    reason: 'recognizable_people',
    note: 'Purge 2026-08-06 mât — décision humaine sur capture de production',
  },
  {
    // Salle communautaire de club-service en bord de route : bâti vernaculaire
    // sans valeur de paysage. Ratio 2,36 et 11832 px de large, donc toutes les
    // portes dimensionnelles passaient.
    fragments: [
      'Local_des_Chevaliers_de_Colomb',
      'Local%20des%20Chevaliers%20de%20Colomb',
      '4dc2678b5ea6',
    ],
    reason: 'vernacular_building',
    note: 'Purge 2026-08-06 mât+pomo — décision humaine sur capture de production',
  },
  {
    // Balai 2026-08-11 (signalement mât prod) : scènes de rue / bungalow /
    // stationnement / façade — pas des paysages de bandeau. Sœur Pointe-Calumet
    // (Vue de Montée de la Baie) déjà ban ; celle du boul. Proulx avait passé
    // (mal taguée « ete » alors qu’elle est fin d’hiver).
    // Gardé : Vue du lac en hiver Montée de la Baie (c8457894f8d5) — paysage lacustre.
    // Gardé : Canal / fleuve Côteau-du-Lac (e79be8bf8486, e6fa85b6b652).
    fragments: [
      // Rue résidentielle Pointe-Calumet (capture mât 2026-08-11)
      'Pointe-Calumet_%28QC%29-Vue_vers_l%27ouest_du_boul._Proulx',
      'Pointe-Calumet_(QC)-Vue_vers_l\'ouest_du_boul._Proulx',
      '90b5d7977fc0',
      // Village Côteau-du-Lac : artère / arrière de clinique / stationnement
      'C%C3%B4teau-du-Lac-Vue_du_ch._Du_Fleuve-2025-01-04',
      'Côteau-du-Lac-Vue_du_ch._Du_Fleuve-2025-01-04',
      'e27492a5994e',
      'C%C3%B4teau-du-Lac-Vue_arri%C3%A8re_d%27une_vieille_2025-01-04',
      'Côteau-du-Lac-Vue_arrière_d\'une_vieille_2025-01-04',
      '72db176c7d96',
      'C%C3%B4teau-du-Lac-Immeuble_du_chemin_du_fleuve-2025-01-04',
      'Côteau-du-Lac-Immeuble_du_chemin_du_fleuve-2025-01-04',
      '0e03b35a1298',
      // Maisons Montmorency : bac à ordures / macro mur lierre — pas un paysage
      'House_close_to_Parc_de_la_Chute-Montmorency_007',
      'd4f8de7ffd99',
      'House_in_the_Parc_de_la_Chute-Montmorency_009',
      '77e14beca5e1',
    ],
    reason: 'user_curated_photo_rejected',
    note: 'Purge 2026-08-11 mât+pomo — rue résidentielle / bâti / parking (signalement humain)',
  },
];

function loadLabRejectedEntries() {
  try {
    if (!fs.existsSync(REJECTED_JSON)) return [];
    const data = JSON.parse(fs.readFileSync(REJECTED_JSON, 'utf8'));
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

function allBanEntries() {
  return HARD_BANNED.concat(loadLabRejectedEntries());
}

/**
 * @param {{ id?: string, url?: string, link?: string, title?: string }} entry
 * @returns {{ reason: string, fragment: string } | null}
 */
function matchHardBanned(entry) {
  if (!entry) return null;
  const hay = [entry.id, entry.url, entry.link, entry.title]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!hay) return null;
  for (const ban of allBanEntries()) {
    for (const frag of ban.fragments || []) {
      if (!frag) continue;
      if (hay.includes(String(frag).toLowerCase())) {
        return { reason: ban.reason || 'user_curated_photo_rejected', fragment: frag };
      }
    }
  }
  return null;
}

function isHardBanned(entry) {
  return matchHardBanned(entry) != null;
}

/** Fragments plats (debug / grep / docs). */
function allFragments() {
  return allBanEntries().flatMap((b) => b.fragments || []);
}

module.exports = {
  HARD_BANNED,
  REJECTED_JSON,
  loadLabRejectedEntries,
  matchHardBanned,
  isHardBanned,
  allFragments,
};

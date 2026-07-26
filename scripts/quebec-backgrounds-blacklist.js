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

/**
 * @typedef {{ fragments: string[], reason: string, note?: string }} HardBanEntry
 */

/** @type {HardBanEntry[]} */
const HARD_BANNED = [
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
    // Dessous de pont / dalle béton — crop bandeau inutile
    fragments: ['Pont_de_l-Ile-aux-Tourtes_02'],
    reason: 'underbridge_concrete',
    note: 'Purge 2026-07-25 mât+pomo (Tourtes_04 reste OK si paysage)',
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
    // Pavillon Casault ULaval — se lit comme église (tours, croix, flèches).
    // Titre Commons sans « église » ; pierre grise multi-tours (pas clocher blanc).
    fragments: [
      'Université_Laval,_Quebec_Canada_3',
      'Universit%C3%A9_Laval%2C_Quebec_Canada_3',
      'Universit%C3%A9_Laval,_Quebec_Canada_3',
      'Quebec_Canada_3.jpg',
      'd80fc225abc1',
    ],
    reason: 'reads_as_church_casault',
    note: 'pavillon Casault ULaval, architecture cultuelle ; purge 2026-07-25',
  },
  {
    // Même bâtiment (vue frontale twin towers + croix) — ban préventif
    fragments: [
      'Université_Laval,_Quebec,_Canada_01',
      'Universit%C3%A9_Laval%2C_Quebec%2C_Canada_01',
      'Universit%C3%A9_Laval,_Quebec,_Canada_01',
      'Quebec,_Canada_01.jpg',
      'Quebec%2C_Canada_01.jpg',
      '8063829c7ba9',
      'Pavillon_Louis-Jacques-Casault',
      'Louis-Jacques-Casault',
      'Louis_Jacques_Casault',
      'Louis-Jacques Casault',
    ],
    reason: 'reads_as_church_casault',
    note: 'Casault multi-tours/croix — ban curaté campus style-église 2026-07-25',
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
];

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
  for (const ban of HARD_BANNED) {
    for (const frag of ban.fragments || []) {
      if (!frag) continue;
      if (hay.includes(String(frag).toLowerCase())) {
        return { reason: ban.reason, fragment: frag };
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
  return HARD_BANNED.flatMap((b) => b.fragments || []);
}

module.exports = {
  HARD_BANNED,
  matchHardBanned,
  isHardBanned,
  allFragments,
};

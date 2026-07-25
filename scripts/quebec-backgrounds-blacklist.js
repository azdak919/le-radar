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
    note: 'Purge 2026-07-25 mât+nations+pomo ; Gabriel Picard CC BY-SA 4.0 — chercher autre vue W8banaki sans clocher',
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

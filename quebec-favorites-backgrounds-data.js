/* LE RADAR — banque favorites (permanente, manuelle)
 * Source de vérité : data/quebec-favorites-backgrounds.json
 * Régénéré par : node scripts/sync-quebec-backgrounds.js
 * Ne pas écraser via maintain-quebec-backgrounds (ménage / purge).
 * Ajouts : signalement manuel ou node scripts/pin-background.js
 *
 * Consommateurs : mât (+ pomo si surfaces inclut « pomo »)
 * permanent: true → immunisé contre la purge des bots
 */
const QUEBEC_FAVORITES_BACKGROUNDS = [
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/0/02/Rocher_Perc%C3%A9_%E2%80%93_Perc%C3%A9%2C_QC_%E2%80%93_%282018-07-19%29.jpg",
    credit: "Ryan Sharpe",
    link: "https://commons.wikimedia.org/wiki/File:Rocher%20Perc%C3%A9%20%E2%80%93%20Perc%C3%A9%2C%20QC%20%E2%80%93%20(2018-07-19).jpg",
    license: "CC BY-SA 4.0",
    title: "Rocher Percé – Percé, QC – (2018-07-19)",
    focalY: 0.66,
    season: "ete",
    permanent: true,
    surfaces: ["masthead", "pomo"],
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/6/65/Sunrise_Over_Montr%C3%A9al_%28250731329%29.jpeg",
    credit: "Quentin Schulz",
    link: "https://commons.wikimedia.org/wiki/File:Sunrise%20Over%20Montr%C3%A9al%20(250731329).jpeg",
    license: "CC BY 3.0",
    title: "Sunrise Over Montréal (250731329)",
    permanent: true,
    surfaces: ["masthead", "pomo"],
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/2/2f/Pont_de_l-Ile-aux-Tourtes_04.jpg",
    credit: "Jeangagnon",
    link: "https://commons.wikimedia.org/wiki/File:Pont_de_l-Ile-aux-Tourtes_04.jpg",
    license: "CC BY-SA 4.0",
    title: "Pont de l'Île-aux-Tourtes, Île Perrot",
    focalY: 0.38,
    permanent: true,
    surfaces: ["masthead", "pomo"],
  }
];

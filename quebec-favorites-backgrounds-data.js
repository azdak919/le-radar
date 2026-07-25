/* LE RADAR — banque favorites (permanente, manuelle)
 * Source de vérité : data/quebec-favorites-backgrounds.json
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
    permanent: true,
    surfaces: ["masthead", "pomo"],
  }
];

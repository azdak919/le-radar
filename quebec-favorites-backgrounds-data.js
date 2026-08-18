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
    width: 3747,
    height: 2508,
    place: "Percé",
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
    width: 2048,
    height: 1152,
    place: "Montréal",
    season: "ete",
    permanent: true,
    surfaces: ["masthead", "pomo"],
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/f/fe/Lac_des_Deux_Montagnes_07.JPG",
    credit: "Jean Gagnon",
    link: "https://commons.wikimedia.org/wiki/File:Lac_des_Deux_Montagnes_07.JPG",
    license: "CC BY-SA 3.0",
    title: "Lac des Deux-Montagnes",
    focalY: 0.22,
    width: 3870,
    height: 2177,
    place: "Lac des Deux-Montagnes",
    season: "ete",
    permanent: true,
    surfaces: ["masthead", "pomo"],
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/d/de/Universit%C3%A9_Laval%2C_Quebec%2C_Canada_02.jpg",
    credit: "Wilfredor",
    link: "https://commons.wikimedia.org/wiki/File:Universit%C3%A9_Laval,_Quebec,_Canada_02.jpg",
    license: "CC0",
    title: "Université Laval, Quebec, Canada 02",
    focalY: 0.52,
    width: 7409,
    height: 5034,
    place: "Université Laval",
    season: "hiver",
    permanent: true,
    surfaces: ["masthead", "pomo"],
  }
];

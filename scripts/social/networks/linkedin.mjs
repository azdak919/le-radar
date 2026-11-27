// Page LinkedIn « LE-RADAR.ca » (compte Buffer principal). Seule source des règles de ce réseau.
// Recherche du 25 novembre 2026 : les aperçus de lien rapportent ≈ 40 % de moins qu'une image
// (on envoie une image, lien dans le texte) ; 16 h-18 h ressort (+17 %, une seule étude) ; les
// nouvelles de l'organisation marchent bien ; les hashtags ne servent presque plus (1 au plus).
// 2 publications par jour en semaine, presque rien la fin de semaine.
export default {
  id: 'linkedin',
  service: 'linkedin',
  label: 'Page LinkedIn LE-RADAR.ca',
  account: 'BUFFER_API_KEY',
  limit: 2000,
  hashtags: 1,
  image: true,
  perDay: 0, // 26 nov. 2026 (Charles) : plus d’articles un à un sur LinkedIn — la une (8 h 30) et la revue (12 h 30) les remplacent.
  minGapMin: 240,
  metadata: () => undefined,
  windows: {
    weekday: [[0, 7, 0], [7, 8, 0.3], [8, 10, 1], [10, 12, 0.4], [12, 14, 0.8], [14, 16, 0.3], [16, 18, 1], [18, 24, 0]],
    weekend: [[0, 8, 0], [8, 9, 0], [9, 11, 0.34], [11, 24, 0]],
  },
  sources: [
    'https://ligosocial.com/research/linkedin-company-pages-2026',
    'https://www.socialinsider.io/blog/linkedin-best-practices/',
  ],
};

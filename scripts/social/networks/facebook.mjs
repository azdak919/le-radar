// Page Facebook « LE-RADAR.ca » (compte Buffer principal). Seule source des règles de ce réseau.
// Recherche du 25 novembre 2026 : les publications « lien » ont la plus faible portée organique
// (≈ 0,2 %) ; une photo avec le lien dans le texte reste une publication photo (c'est ce qu'on envoie).
// Le lien en premier commentaire n'est pas offert sur le forfait gratuit de Buffer. Portée ≈ 1-4 %
// des abonnés pour une petite Page : 3 publications choisies par jour plutôt que 6.
// Raccourcissement buff.ly désactivé dans Buffer le 25 novembre (les liens le-radar.ca restent visibles).
export default {
  id: 'facebook',
  service: 'facebook',
  label: 'Page Facebook LE-RADAR.ca',
  account: 'BUFFER_API_KEY',
  limit: 1500,
  hashtags: 1,
  image: true,
  perDay: 1, // 26 nov. 2026 (Charles) : un seul article un à un — la une (9 h) et les revues (12 h, 20 h) prennent le relais.
  minGapMin: 180,
  metadata: () => ({ facebook: { type: 'post' } }), // Buffer exige un type (post, story, reel)
  windows: {
    weekday: [[0, 7, 0], [7, 9, 0.3], [9, 13, 1], [13, 18, 0.4], [18, 21, 0.9], [21, 23, 0.2], [23, 24, 0]],
    weekend: [[0, 8, 0], [8, 9, 0.2], [9, 13, 0.8], [13, 18, 0.4], [18, 21, 0.7], [21, 24, 0]],
  },
  sources: [
    'https://heistbrain.com/benchmarks/facebook-reach.html',
    'https://rbbcommunications.com/blog/meta-organic-social-media-strategy-2026/',
  ],
};

// X @le_radar_ca (compte Buffer principal, secret BUFFER_API_KEY). Seule source des règles de ce réseau.
// Recherche du 25 novembre 2026 : les avis sur la pénalité des liens divergent (30-90 % selon les blogues,
// aucune selon d'autres) ; 3 hashtags ou plus seraient traités comme du pourriel ; 2 à 5 publications
// par jour, régulières plutôt qu'en rafale, les suivantes rapportant de moins en moins.
// Bilan réel (data/social/weekly) : très petite audience ; mieux vaut moins de publications, mieux choisies.
// Le lien en réponse (fil) n'est pas retenu : un seul fil en file sur le forfait gratuit de Buffer.
export default {
  id: 'x',
  service: 'x',
  label: 'X @le_radar_ca',
  account: 'BUFFER_API_KEY',
  limit: 280,
  hashtags: 2,
  image: true,
  // Mode nocturne (buffer-post.mjs, DAILY=true) : 5 créneaux par jour au lieu de 10, heure de Montréal.
  dailySlots: ['08:30', '11:30', '14:30', '17:30', '21:00'],
  windows: {
    weekday: [[0, 7, 0], [7, 11, 0.5], [11, 18, 1], [18, 22, 0.6], [22, 24, 0.3]],
    weekend: [[0, 8, 0], [8, 9, 0.3], [9, 21, 0.5], [21, 24, 0.3]],
  },
  sources: [
    'https://www.socialpilot.co/blog/twitter-algorithm',
    'https://purrplan.ai/blog/x-twitter-algorithm-2026/',
    'https://socialspool.com/blog/x-algorithm-2026-reach-factors',
  ],
};

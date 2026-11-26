// Threads @le.radar.ca (compte Buffer d'Instagram, secret BUFFER_INSTAGRAM_API_KEY). Seule source des règles.
// Documentation Meta et Buffer : 500 caractères (émojis comptés en octets UTF-8), un seul sujet par
// publication (1-50 caractères, sans « . » ni « & »), le premier lien devient la carte d'aperçu,
// lien attaché et images ne vont pas ensemble dans Buffer. Ton de conversation, 1 à 3 par jour.
export default {
  id: 'threads',
  service: 'threads',
  label: 'Threads @le.radar.ca',
  account: 'BUFFER_INSTAGRAM_API_KEY',
  limit: 500,
  hashtags: 0,
  image: false,
  perDay: 2,
  minGapMin: 240,
  windows: {
    weekday: [[0, 8, 0], [8, 11, 0.3], [11, 14, 0.8], [14, 17, 0.4], [17, 22, 1], [22, 24, 0.3]],
    weekend: [[0, 9, 0], [9, 12, 0.5], [12, 17, 0.6], [17, 22, 1], [22, 24, 0.3]],
  },
  sources: [
    'https://developers.facebook.com/docs/threads/posts/',
    'https://developers.buffer.com/types/ThreadsPostMetadata.html',
    'https://developers.buffer.com/guides/character-limits.md',
  ],
};

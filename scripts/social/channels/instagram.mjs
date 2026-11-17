// Adaptateur Instagram (API Graph, compte professionnel). DÉSACTIVÉ.
// Aucun identifiant dans le dépôt. À activer quand le compte existera :
//   1. formats.une.prepared.instagram.enabled = true dans data/social/policy.json
//   2. secrets INSTAGRAM_ACCESS_TOKEN et INSTAGRAM_USER_ID (jamais dans le code)
// Tant que ces deux conditions manquent, createInstagram refuse de publier.
export const GRAPH = 'https://graph.facebook.com/v21.0';

export function instagramEnabled(policy) {
  return policy?.formats?.une?.prepared?.instagram?.enabled === true;
}

/** Deux appels : créer le conteneur image, puis le publier. Aucun réseau ici. */
export function imageRequests(userId, { imageUrl, caption } = {}) {
  if (!userId || !imageUrl) throw new Error('Instagram : image et identifiant de compte requis');
  return [
    { method: 'POST', url: `${GRAPH}/${userId}/media`, body: { image_url: imageUrl, caption: String(caption || '').slice(0, 2200) } },
    { method: 'POST', url: `${GRAPH}/${userId}/media_publish`, body: { creation_id: '$creation_id' } },
  ];
}

export function createInstagram({ token, userId, fetchImpl = fetch, policy } = {}) {
  if (!instagramEnabled(policy) || !token || !userId) {
    const err = new Error('Instagram : adaptateur désactivé. À activer quand le compte professionnel existera (aucun identifiant dans le dépôt).');
    err.code = 'INSTAGRAM_DISABLED';
    throw err;
  }
  return {
    name: 'instagram',
    async publishImage({ imageUrl, caption }) {
      const [create, publish] = imageRequests(userId, { imageUrl, caption });
      const created = await fetchImpl(create.url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(create.body) });
      const container = await created.json();
      if (!container?.id) throw new Error('Instagram : création du conteneur refusée');
      const sent = await fetchImpl(publish.url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ creation_id: container.id }) });
      const post = await sent.json();
      if (!post?.id) throw new Error('Instagram : publication refusée');
      return { id: post.id };
    },
  };
}

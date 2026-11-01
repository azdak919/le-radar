// Canal X (@LeRadar_ca) via l'API GraphQL gratuite de Buffer.
export const API = 'https://api.buffer.com';
export const FALLBACK_CHANNEL_ID = '6ae6c47be29c69a171203706';
export const AUTH_MSG = 'BUFFER_API_KEY expirée ou invalide (voir BUFFER_KEY_EXPIRES dans .github/workflows/social-buffer.yml) : régénérer la clé dans Buffer › Settings › API et mettre à jour le secret du dépôt.';

export class AuthError extends Error {}

export function isAuthFailure(status, body) {
  if (status === 401 || status === 403) return true;
  const errs = body?.errors || [];
  return errs.some(e => /^(UNAUTHORIZED|UNAUTHENTICATED)$/i.test(e?.extensions?.code || ''));
}

/** Canal Buffer d'un service (x, facebook, linkedin…) nommé `channelName` (sans @, insensible à la casse). */
export const matchChannel = (x, service, channelName) => {
  const re = service === 'x' ? /twitter|^x$/i : new RegExp(`^${service}`, 'i');
  return re.test(x?.service || '') && (x.name || '').replace(/^@/, '').trim().toLowerCase() === channelName.toLowerCase();
};

export function createXBuffer({ key, fetchImpl = fetch, channelName = 'LeRadar_ca', fallbackId = FALLBACK_CHANNEL_ID, service = 'x' }) {
  async function gql(query, variables = {}) {
    const res = await fetchImpl(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000) });
    let body = null; try { body = await res.json(); } catch {}
    const why = (body?.errors || []).map(e => `${e?.extensions?.code || '?'}: ${e?.message || ''}`).join(' | ').slice(0, 400);
    if (isAuthFailure(res.status, body)) throw new AuthError(`${AUTH_MSG} [HTTP ${res.status} ${why}]`);
    if (!res.ok || body?.errors?.length) throw new Error(`Buffer API ${res.status}: ${JSON.stringify(body?.errors || body).slice(0, 500)}`);
    return body.data;
  }
  let ctx = null;
  async function context() {
    if (ctx) return ctx;
    const d = await gql('query { account { organizations { id name } } }');
    const orgs = d?.account?.organizations || [];
    const seen = [];
    for (const o of orgs) {
      const c = await gql('query($o: OrganizationId!) { channels(input: { organizationId: $o }) { id name service } }', { o: o.id });
      for (const x of c?.channels || []) seen.push(`${x.service}:${x.name}`);
      const ch = (c?.channels || []).find(x => matchChannel(x, service, channelName));
      if (ch) return (ctx = { organizationId: o.id, channelId: ch.id, service: ch.service, discovered: true });
    }
    if (!orgs.length) throw new Error('Buffer : aucune organisation sur ce compte');
    if (!fallbackId) throw new Error(`Buffer : canal ${service} « ${channelName} » introuvable (canaux : ${seen.join(', ') || 'aucun'})`);
    return (ctx = { organizationId: orgs[0].id, channelId: fallbackId, discovered: false });
  }
  return {
    name: service,
    context,
    // Lecture seule : l'API publique n'a pas de mutation pour l'horaire (réglé dans l'interface Buffer).
    async schedule() {
      const { channelId } = await context();
      try {
        const d = await gql('query($i: ChannelId!) { channel(input: { id: $i }) { timezone postingSchedule { day paused times } } }', { i: channelId });
        return d?.channel || null;
      } catch (e) { if (e instanceof AuthError) throw e; return { error: e.message }; }
    },
    async queued() {
      const { organizationId, channelId } = await context();
      const d = await gql(`query($o: OrganizationId!, $c: [ChannelId!]) {
        posts(first: 50, input: { organizationId: $o, filter: { channelIds: $c, status: [scheduled] } }) { edges { node { id text dueAt assets { source } } } } }`, { o: organizationId, c: [channelId] });
      return (d?.posts?.edges || []).map(e => e.node);
    },
    /** Publications refusées par le réseau (statut « error ») : id, texte, raison. */
    async errored() {
      const { organizationId, channelId } = await context();
      try {
        const d = await gql(`query($o: OrganizationId!, $c: [ChannelId!]) {
          posts(first: 20, input: { organizationId: $o, filter: { channelIds: $c, status: [error] } }) { edges { node { id text dueAt error { message } } } } }`, { o: organizationId, c: [channelId] });
        return (d?.posts?.edges || []).map(e => e.node);
      } catch (e) {
        if (e instanceof AuthError) throw e;
        const d = await gql(`query($o: OrganizationId!, $c: [ChannelId!]) {
          posts(first: 20, input: { organizationId: $o, filter: { channelIds: $c, status: [error] } }) { edges { node { id text dueAt } } } }`, { o: organizationId, c: [channelId] });
        return (d?.posts?.edges || []).map(e => e.node);
      }
    },
    // Texte seulement : id, image et heure programmée conservés (mode/dueAt omis).
    // metadata : requis par Buffer pour Facebook ({ facebook: { type: 'post' } }), comme à l'ajout.
    async editText(id, text, metadata) {
      const i = { id, text }; if (metadata) i.metadata = metadata;
      const d = await gql(`mutation($i: EditPostInput!) { editPost(input: $i) {
        ... on PostActionSuccess { post { id text dueAt } } ... on MutationError { message } } }`, { i });
      const r = d?.editPost;
      if (!r?.post?.id) throw new Error(`Buffer editPost refusé : ${r?.message || JSON.stringify(r)}`);
      return r.post;
    },
    async add({ text, image, dueAt, now = false, metadata }) {
      const { channelId } = await context();
      const input = { text, channelId, schedulingType: 'automatic', mode: now ? 'shareNow' : dueAt ? 'customScheduled' : 'addToQueue' };
      if (dueAt) input.dueAt = dueAt;
      if (image) input.assets = [{ image: { url: image } }];
      if (metadata) input.metadata = metadata;
      const d = await gql(`mutation($i: CreatePostInput!) { createPost(input: $i) {
        ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }`, { i: input });
      const r = d?.createPost;
      if (!r?.post?.id) throw new Error(`Buffer createPost refusé : ${r?.message || JSON.stringify(r)}`);
      return r.post;
    },
  };
}

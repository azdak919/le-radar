// Canal X (@LeRadar_ca) via l'API GraphQL gratuite de Buffer.
export const API = 'https://api.buffer.com';
export const FALLBACK_CHANNEL_ID = '6ae6c47be29c69a171203706';
export const AUTH_MSG = 'BUFFER_API_KEY expirée ou invalide (voir BUFFER_KEY_EXPIRES dans .github/workflows/social-buffer.yml) : régénérer la clé dans Buffer › Settings › API et mettre à jour le secret du dépôt.';

export class AuthError extends Error {}

export function isAuthFailure(status, body) {
  if (status === 401 || status === 403) return true;
  const errs = body?.errors || [];
  return errs.some(e => /UNAUTH|FORBIDDEN/i.test(e?.extensions?.code || '') || /unauthori[sz]ed|unauthenticated|invalid (api )?(key|token)|expired/i.test(e?.message || ''));
}

export function createXBuffer({ key, fetchImpl = fetch, channelName = 'LeRadar_ca', fallbackId = FALLBACK_CHANNEL_ID }) {
  async function gql(query, variables = {}) {
    const res = await fetchImpl(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000) });
    let body = null; try { body = await res.json(); } catch {}
    if (isAuthFailure(res.status, body)) throw new AuthError(AUTH_MSG);
    if (!res.ok || body?.errors?.length) throw new Error(`Buffer API ${res.status}: ${JSON.stringify(body?.errors || body).slice(0, 500)}`);
    return body.data;
  }
  let ctx = null;
  async function context() {
    if (ctx) return ctx;
    const d = await gql('query { account { organizations { id name } } }');
    const orgs = d?.account?.organizations || [];
    for (const o of orgs) {
      const c = await gql('query($o: OrganizationId!) { channels(input: { organizationId: $o }) { id name service } }', { o: o.id });
      const ch = (c?.channels || []).find(x => /twitter|^x$/i.test(x.service) && x.name?.replace(/^@/, '').toLowerCase() === channelName.toLowerCase());
      if (ch) return (ctx = { organizationId: o.id, channelId: ch.id, discovered: true });
    }
    if (!orgs.length) throw new Error('Buffer : aucune organisation sur ce compte');
    return (ctx = { organizationId: orgs[0].id, channelId: fallbackId, discovered: false });
  }
  return {
    name: 'x',
    context,
    async queued() {
      const { organizationId, channelId } = await context();
      const d = await gql(`query($o: OrganizationId!, $c: [ChannelId!]) {
        posts(input: { organizationId: $o, filter: { channelIds: $c, status: [scheduled] } }) { edges { node { id text dueAt } } } }`, { o: organizationId, c: [channelId] });
      return (d?.posts?.edges || []).map(e => e.node);
    },
    async add({ text, image }) {
      const { channelId } = await context();
      const input = { text, channelId, schedulingType: 'automatic', mode: 'addToQueue' };
      if (image) input.assets = { images: [{ url: image }] };
      const d = await gql(`mutation($i: CreatePostInput!) { createPost(input: $i) {
        ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }`, { i: input });
      const r = d?.createPost;
      if (!r?.post?.id) throw new Error(`Buffer createPost refusé : ${r?.message || JSON.stringify(r)}`);
      return r.post;
    },
  };
}

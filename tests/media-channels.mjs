#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  slugify,
  mediaIdFromName,
  looksLikeRssUrl,
  deriveWebsite,
  isGoogleNewsPublicationUrl,
  googleNewsFromSource,
  googleNewsStatus,
  discoverGoogleNewsChannel,
  isLikelySocialProfile,
  listVisibleChannels,
  channelLabel,
  channelCoverage,
  sameAsUrls,
  indexSocialFeed,
} = require('../scripts/media-channels-lib.js');
const { slugify: seoSlugify } = require('../scripts/seo-pages-lib.js');

assert.equal(mediaIdFromName("L'Exemplaire"), 'lexemplaire');
assert.equal(mediaIdFromName('Le Trait d’Union'), 'le-trait-dunion');
assert.equal(slugify("L'Exemplaire"), seoSlugify("L'Exemplaire"), 'slug identique aux fiches SEO');

assert.equal(looksLikeRssUrl('https://quartierlibre.ca/feed/'), true);
assert.equal(looksLikeRssUrl('https://www.polyscope.qc.ca/'), false);
assert.equal(deriveWebsite({ url: 'https://lecollectif.ca/feed/' }), 'https://lecollectif.ca/');
assert.equal(deriveWebsite({ site: 'https://www.exemplaire.com.ulaval.ca/', url: 'https://www.exemplaire.com.ulaval.ca/feed/' }), 'https://www.exemplaire.com.ulaval.ca/');
assert.equal(
  deriveWebsite({ url: 'https://cchic.ca/categorie/journal-etudiant-loisif/feed/' }),
  '',
  'ne pas promouvoir un CMS institutionnel comme site du journal',
);

assert.equal(
  isGoogleNewsPublicationUrl('https://news.google.com/publications/CAAqBwgKMLC'),
  true,
);
assert.equal(
  isGoogleNewsPublicationUrl('https://news.google.com/search?q=Impact+Campus'),
  false,
  'une recherche Google n’est pas une page de publication',
);
assert.equal(googleNewsStatus({}), 'unknown');
assert.equal(discoverGoogleNewsChannel({ name: 'L\'Exemplaire' }), null);

const withNews = {
  name: 'Quartier Libre',
  googleNews: { url: 'https://news.google.com/publications/CAAqBwgKMLC', status: 'verified' },
};
assert.equal(googleNewsFromSource(withNews).status, 'verified');
assert.equal(
  listVisibleChannels(withNews).some((c) => c.type === 'google-news'),
  true,
);
assert.equal(
  listVisibleChannels({ name: 'Quartier Libre', url: 'https://quartierlibre.ca/feed/' })
    .some((c) => c.type === 'google-news'),
  false,
  'pas de Google Actualités sans URL de publication',
);

assert.equal(
  isLikelySocialProfile('facebook', 'https://www.facebook.com/WordPresscom', 'Exil'),
  false,
);
assert.equal(
  isLikelySocialProfile('facebook', 'https://www.facebook.com/2008', 'La Pige'),
  false,
);
assert.equal(
  isLikelySocialProfile('facebook', 'https://www.facebook.com/profile.php', 'The Campus'),
  false,
);
assert.equal(
  isLikelySocialProfile('instagram', 'https://www.instagram.com/cegepchicoutimi/', "L'Oisif"),
  false,
  'le compte du cégep n’est pas le journal',
);
assert.equal(
  isLikelySocialProfile('instagram', 'https://www.instagram.com/quartierlibre.ca/', 'Quartier Libre'),
  true,
);
assert.equal(
  isLikelySocialProfile('youtube', 'https://www.youtube.com/@atmlapige', 'La Pige'),
  true,
);

const polyscope = {
  name: 'Le Polyscope',
  fetchMode: 'firebase',
  url: 'https://www.polyscope.qc.ca/',
  site: 'https://www.polyscope.qc.ca/',
  instagram: 'https://www.instagram.com/polyscope_aep/',
};
const polyChannels = listVisibleChannels(polyscope);
assert.deepEqual(polyChannels.map((c) => c.type), ['website', 'instagram']);
assert.equal(polyChannels.find((c) => c.type === 'rss'), undefined, 'SPA Firebase : pas de RSS');
assert.equal(polyChannels.find((c) => c.type === 'instagram').status, 'verified');

const harvested = listVisibleChannels(
  { name: 'Exil', url: 'https://exilecvm.ca/feed/' },
  {
    socialNetworks: [
      { type: 'instagram', url: 'https://instagram.com/exilexcvm/' },
      { type: 'facebook', url: 'https://www.facebook.com/WordPresscom' },
    ],
  },
);
assert.equal(harvested.some((c) => c.type === 'instagram'), true);
assert.equal(harvested.some((c) => c.type === 'facebook'), false);
assert.equal(harvested.find((c) => c.type === 'instagram').status, 'detected');
assert.equal(harvested.find((c) => c.type === 'rss').origin, 'registry');

assert.equal(channelLabel('google-news', 'fr'), 'Google Actualités');
assert.equal(channelLabel('google-news', 'en'), 'Google News');
assert.equal(channelLabel('podcast', 'fr'), 'Balado');

const socialMap = indexSocialFeed({
  items: [{ name: 'Quartier Libre', networks: [{ type: 'instagram', url: 'https://www.instagram.com/quartierlibre.ca/' }] }],
});
const coverage = channelCoverage(
  [
    { name: 'Quartier Libre', url: 'https://quartierlibre.ca/feed/', site: 'https://quartierlibre.ca/' },
    { name: 'Le Polyscope', fetchMode: 'firebase', url: 'https://www.polyscope.qc.ca/', site: 'https://www.polyscope.qc.ca/' },
  ],
  { socialByName: socialMap },
);
assert.equal(coverage.total, 2);
assert.equal(coverage.website, 2);
assert.equal(coverage.rss, 1);
assert.equal(coverage.instagram, 1);
assert.equal(coverage['google-news'], 0);

assert.deepEqual(
  sameAsUrls({ name: 'X', site: 'https://example.ca/', instagram: 'https://www.instagram.com/examplemedia/' }),
  ['https://example.ca/', 'https://www.instagram.com/examplemedia/'],
);

console.log('✓ canaux de distribution : RSS, Google Actualités, récolte sociale filtrée, stats.');

// editText transmet metadata (Facebook exige un type à l'édition comme à l'ajout).
{
  const { createXBuffer: mk } = await import('../scripts/social/channels/x-buffer.mjs');
  let sent = null;
  const fetchImpl = async (_u, o) => { sent = JSON.parse(o.body).variables; return { ok: true, status: 200, json: async () => ({ data: { editPost: { post: { id: 'p1', text: 't', dueAt: null } } } }) }; };
  const c = mk({ key: 'k', fetchImpl, fallbackId: 'c' });
  await c.editText('p1', 't', { facebook: { type: 'post' } });
  if (JSON.stringify(sent.i) !== JSON.stringify({ id: 'p1', text: 't', metadata: { facebook: { type: 'post' } } })) throw new Error('metadata absente de editPost');
  await c.editText('p1', 't');
  if ('metadata' in sent.i) throw new Error('metadata inattendue');
  console.log('editText metadata : OK');
}

// createPost : un id Buffer n'est pas une publication réussie si le statut est déjà « error »
// (ex. Facebook déconnecté : Buffer accepte le post, puis le refuse tout de suite).
{
  const { createXBuffer: mk, assertBufferPostOk } = await import('../scripts/social/channels/x-buffer.mjs');
  const authLost = 'It looks like Buffer has lost authorization to post on your behalf. Please refresh your channel to resume scheduling.';
  assertBufferPostOk({ id: 'ok', status: 'sent' });
  assertBufferPostOk({ id: 'ok', status: 'scheduled' });
  assertBufferPostOk({ id: 'ok' });
  assert.throws(() => assertBufferPostOk({ id: '6afaf91b91c178a8ccd9186f', status: 'error', error: { message: authLost } }), /lost authorization/);
  assert.throws(() => assertBufferPostOk({ id: 'x', status: 'error' }), /statut error/);
  assert.throws(() => assertBufferPostOk({}), /refusé/);

  const gql = (data) => ({ ok: true, status: 200, json: async () => ({ data }) });
  const orgs = { account: { organizations: [{ id: 'org1', name: 'My organization' }] } };
  const channels = { channels: [{ id: 'ch1', name: 'le_radar_ca', service: 'twitter' }] };
  const fetchFor = (create) => async (_u, o) => {
    const q = JSON.parse(o.body).query;
    if (q.includes('account {')) return gql(orgs);
    if (q.includes('channels(')) return gql(channels);
    if (q.includes('createPost')) return gql({ createPost: create });
    throw new Error(`requête inattendue : ${q.slice(0, 80)}`);
  };

  const bad = mk({ key: 'k', fetchImpl: fetchFor({ post: { id: '6afaf91b91c178a8ccd9186f', dueAt: '2026-11-16T12:37:47.131Z', status: 'error', error: { message: authLost } } }) });
  await assert.rejects(() => bad.add({ text: '☀️ La une du matin', now: true }), /lost authorization/);

  let createQuery = '';
  const good = mk({ key: 'k', fetchImpl: async (_u, o) => {
    const body = JSON.parse(o.body);
    if (body.query.includes('createPost')) createQuery = body.query;
    return fetchFor({ post: { id: 'ok1', dueAt: '2026-11-16T12:37:45Z', status: 'sent' } })(_u, o);
  } });
  const post = await good.add({ text: '☀️ La une du matin', now: true });
  assert.equal(post.id, 'ok1');
  assert.match(createQuery, /status/);
  assert.match(createQuery, /error \{ message \}/);
  console.log('createPost refuse un statut error : OK');
}

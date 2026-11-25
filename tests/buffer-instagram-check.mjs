#!/usr/bin/env node
// Le contrôle Buffer est en lecture seule, masque les clés, et sépare les deux comptes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scrub, assessInstagram, assessMain, bufferQuery, EXPECTED_MAIN } from '../scripts/social/buffer-instagram-check.mjs';
import { alreadyPosted, INSTAGRAM_METADATA, INSTAGRAM_CHANNEL_ID, createInstagramBuffer, instagramMetadataOrThrow } from '../scripts/social/instagram.mjs';

const SRC = fs.readFileSync(new URL('../scripts/social/buffer-instagram-check.mjs', import.meta.url), 'utf8');
const WF = fs.readFileSync(new URL('../.github/workflows/social-buffer-instagram-check.yml', import.meta.url), 'utf8');
assert.match(SRC, /QUERY_ACCOUNT = 'query /);
assert.match(SRC, /query\(\$o: OrganizationId!\)/);
assert.doesNotMatch(SRC, /=\s*['`]mutation/);
assert.match(SRC, /redirect:\s*'manual'/);
assert.doesNotMatch(SRC, /console\.(log|error|debug|info)\([^)]*headers/);
assert.doesNotMatch(WF, /echo[^\n]*secrets\.|secrets\.[A-Z_]+ *}}[^\n]*echo/);
assert.match(WF, /BUFFER_INSTAGRAM_API_KEY: \$\{\{ secrets\.BUFFER_INSTAGRAM_API_KEY \}\}/);
assert.match(WF, /BUFFER_API_KEY: \$\{\{ secrets\.BUFFER_API_KEY \}\}/);

const SECRET = 'ig-secret-valeur-qui-ne-doit-pas-sortir';
const MAIN = 'main-secret-valeur-qui-ne-doit-pas-sortir';
const dirty = `clé refusée Bearer ${SECRET} et ${MAIN} authorization: Bearer ${SECRET}`;
const clean = scrub(dirty, [SECRET, MAIN]);
assert.equal(clean.includes(SECRET), false);
assert.equal(clean.includes(MAIN), false);
assert.equal(clean.includes(SECRET.slice(0, 8)), false);
assert.match(clean, /\[secret\]/);

const ig = assessInstagram({
  orgIds: ['org-ig'],
  channels: [{ id: '6b012936ece6dfde5f3f554d', name: 'le.radar.ca', service: 'instagram', isDisconnected: false, isLocked: false, organizationId: 'org-ig' }],
});
assert.equal(ig.ok, true, ig.lines.join(' | '));
assert.equal(assessInstagram({ orgIds: ['org-ig'], channels: [] }).ok, false);
assert.equal(assessInstagram({
  orgIds: ['org-ig'],
  channels: [{ id: '6b012936ece6dfde5f3f554d', name: 'le.radar.ca', service: 'instagram', isDisconnected: true, isLocked: false, organizationId: 'org-ig' }],
}).ok, false, 'déconnecté');

const mainInv = {
  orgIds: [EXPECTED_MAIN.organizationId],
  channels: [
    { id: EXPECTED_MAIN.channels[0].id, service: 'linkedin', isDisconnected: false, organizationId: EXPECTED_MAIN.organizationId },
    { id: EXPECTED_MAIN.channels[1].id, service: 'facebook', isDisconnected: false, organizationId: EXPECTED_MAIN.organizationId },
    { id: EXPECTED_MAIN.channels[2].id, service: 'twitter', isDisconnected: false, organizationId: EXPECTED_MAIN.organizationId },
  ],
};
assert.equal(assessMain(mainInv).ok, true);
const leaked = assessMain({ ...mainInv, channels: [...mainInv.channels, { id: '6b012936ece6dfde5f3f554d', service: 'instagram', isDisconnected: false, organizationId: EXPECTED_MAIN.organizationId }] });
assert.equal(leaked.ok, false);
assert.match(leaked.problems.join(' '), /Instagram visible/);

let sentQuery = '';
await assert.rejects(() => bufferQuery('k', 'mutation { createPost(input: $i) { id } }', {}, async () => { throw new Error('réseau'); }), /lecture seule/);
await bufferQuery('k', 'query { account { organizations { id } } }', {}, async (_url, opts) => {
  sentQuery = JSON.parse(opts.body).query;
  assert.equal(opts.redirect, 'manual');
  assert.match(opts.headers.authorization, /^Bearer /);
  return { status: 200, json: async () => ({ data: { account: { organizations: [{ id: 'o' }] } } }) };
});
assert.doesNotMatch(sentQuery, /\bmutation\b/);
assert.equal(alreadyPosted(['🌙 La une du soir du Radar · dimanche\n\nsuite'], '🌙 La une du soir du Radar · dimanche\n\nautre'), true);
assert.equal(alreadyPosted(['autre accroche'], '🌙 La une du soir du Radar · dimanche'), false);


// InstagramPostMetadataInput (Buffer) : type et shouldShareToFeed sont tous deux requis.
// L’envoi du 21 nov. 2026 à 23 h 21 (heure de Montréal) a échoué avec seulement { type: "post" }.
assert.deepEqual(INSTAGRAM_METADATA, { instagram: { type: 'post', shouldShareToFeed: true } });
assert.equal(instagramMetadataOrThrow(INSTAGRAM_METADATA), INSTAGRAM_METADATA);
assert.throws(() => instagramMetadataOrThrow({ instagram: { type: 'post' } }), /shouldShareToFeed/);
assert.throws(() => instagramMetadataOrThrow({ instagram: { type: 'story', shouldShareToFeed: true } }), /type post/);

let sentCreate = null;
const fetchImpl = async (_url, opts) => {
  const body = JSON.parse(opts.body);
  const q = String(body.query || '');
  if (q.includes('createPost')) {
    sentCreate = body.variables.i;
    return { ok: true, status: 200, json: async () => ({ data: { createPost: { post: { id: 'p-ig', dueAt: null } } } }) };
  }
  if (q.includes('channels(')) {
    return { ok: true, status: 200, json: async () => ({ data: { channels: [{ id: INSTAGRAM_CHANNEL_ID, name: 'le.radar.ca', service: 'instagram' }] } }) };
  }
  if (q.includes('account')) {
    return { ok: true, status: 200, json: async () => ({ data: { account: { organizations: [{ id: 'org-ig', name: 'ig' }] } } }) };
  }
  throw new Error('requête Buffer inattendue dans le test');
};
const ch = createInstagramBuffer({ BUFFER_INSTAGRAM_API_KEY: 'ig-test-cle-fictive', BUFFER_API_KEY: 'main-test-cle-fictive' }, { fetchImpl });
assert.ok(ch);
const posted = await ch.add({ text: 'légende de test', image: 'https://example.test/une.jpg', alt: 'Une du Radar', now: true, metadata: { instagram: { type: 'post' } } });
assert.equal(posted.id, 'p-ig');
assert.equal(sentCreate.channelId, INSTAGRAM_CHANNEL_ID);
assert.equal(sentCreate.schedulingType, 'automatic');
assert.equal(sentCreate.mode, 'shareNow');
assert.deepEqual(sentCreate.metadata, { instagram: { type: 'post', shouldShareToFeed: true } }, 'createPost doit envoyer shouldShareToFeed, même si l’appelant omet le champ');

console.log('buffer-instagram-check ok');

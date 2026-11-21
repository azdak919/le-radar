#!/usr/bin/env node
// Le contrôle Buffer est en lecture seule, masque les clés, et sépare les deux comptes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scrub, assessInstagram, assessMain, bufferQuery, EXPECTED_MAIN } from '../scripts/social/buffer-instagram-check.mjs';

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
console.log('buffer-instagram-check ok');

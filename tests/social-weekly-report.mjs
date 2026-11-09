#!/usr/bin/env node
// Bilan hebdomadaire : comptes internes exclus, agrégation, rendu sans courriel ni publication.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isInternal, externalCounts, summarizePosts, render, delta } from '../scripts/social/weekly-report.mjs';
const internal = JSON.parse(fs.readFileSync('data/social/internal-accounts.json', 'utf8'));
assert.ok(internal.bluesky.includes('charlestison.bsky.social') && internal.bluesky.includes('le-radar.ca'), 'comptes internes connus');
assert.ok(isInternal('@Le-Radar.ca', internal.bluesky) && isInternal('CHARLESTISON.bsky.social', internal.bluesky) && !isInternal('quartierlibre.bsky.social', internal.bluesky));
const ext = externalCounts({ likes: ['charlestison.bsky.social', 'a.bsky.social', 'b.bsky.social'], reposts: ['le-radar.ca', 'c.bsky.social'], replies: ['charlestison.bsky.social'], quotes: [] }, internal.bluesky);
assert.deepEqual(ext, { likes: 2, reposts: 1, replies: 0, quotes: 0, total: 3, internalExcluded: 3 });
const s = summarizePosts([{ url: 'u1', text: 'A', ext }, { url: 'u2', text: 'B', ext: externalCounts({}, []) }, { url: 'u3', text: 'C', ext: externalCounts({ likes: ['x'] }, []) }]);
assert.equal(s.posts, 3); assert.equal(s.total, 4); assert.equal(s.zero, 1); assert.equal(s.internal, 3); assert.equal(s.perPost, 1.33); assert.deepEqual(s.top.map(t => t.url), ['u1', 'u3']);
assert.equal(delta(20, 15, '2026-11-02'), '+5 depuis le 2026-11-02'); assert.equal(delta(20, null), 'première mesure'); assert.equal(delta(10, 12, '2026-11-02'), '-2 depuis le 2026-11-02');
const md = render({ now: Date.parse('2026-11-16T14:00:00Z'), days: 7, internal, sentCounts: { x: 20, facebook: 10, linkedin: 4 }, prev: { date: '2026-11-09', followers: { bluesky: 12 } },
  nets: { Bluesky: { followers: 14, followersRaw: 15, internalFollowers: 1, follows: 88, posts: s }, Mastodon: { error: 'HTTP 500' }, Tumblr: { skipped: 'clé absente' } } });
assert.ok(md.includes('Abonnés externes : 14 (compte brut 15, 1 interne(s) retiré(s)) — +2 depuis le 2026-11-09'));
assert.ok(md.includes('Mesure impossible ce passage : HTTP 500') && md.includes('clé absente'));
assert.ok(md.includes('X 20, Facebook 10, LinkedIn 4') && /Aucun courriel envoyé, rien publié/.test(md));
// le script ne contient aucun envoi : pas de courriel, pas de publication
const src = fs.readFileSync('scripts/social/weekly-report.mjs', 'utf8');
assert.ok(!/sendmail|nodemailer|createRecord|statuses['"`]?,\s*\{\s*method: 'POST'|createPost|method: 'POST'/.test(src), 'lecture seule');

// Bluesky : la variable d'environnement peut être un DID ; le @handle du profil sert à reconnaître les publications du compte.
assert.match(src, /const handle = prof\.handle \|\| actor/, 'handle résolu depuis le profil (DID accepté)');
console.log('social-weekly-report : OK');

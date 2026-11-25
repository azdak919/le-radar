#!/usr/bin/env node
// Garde de confidentialité : noms et comptes internes viennent de l'environnement, jamais du code.
import assert from 'node:assert/strict';
import guard from '../scripts/privacy-guard.js';

const saved = { n: process.env.FORBIDDEN_NAMES, b: process.env.INTERNAL_BLUESKY_ACCOUNTS };

process.env.FORBIDDEN_NAMES = ' Dupont , Jean Martin ,';
assert.deepEqual(guard.forbiddenNames(), ['dupont', 'jean martin']);
assert.ok(guard.containsForbiddenName('Entrevue avec JEAN DUPONT'));
assert.ok(guard.containsForbiddenName('jean martin parle'));
assert.ok(!guard.containsForbiddenName('Rien à signaler'));

delete process.env.FORBIDDEN_NAMES;
assert.deepEqual(guard.forbiddenNames(), [], 'sans variable : aucun nom en dur');
assert.ok(!guard.containsForbiddenName('Jean Dupont'));
assert.ok(guard.containsForbiddenName('Jean Dupont', ['dupont']), 'repli fictif des tests');

process.env.INTERNAL_BLUESKY_ACCOUNTS = 'JeanDupont.bsky.social, le-radar.ca';
const merged = guard.mergeInternalAccounts({ bluesky: ['le-radar.ca'], mastodon: ['leradar'] });
assert.deepEqual(merged.bluesky, ['le-radar.ca', 'jeandupont.bsky.social']);
assert.deepEqual(merged.mastodon, ['leradar']);
delete process.env.INTERNAL_BLUESKY_ACCOUNTS;
assert.deepEqual(guard.mergeInternalAccounts({ bluesky: ['le-radar.ca'] }).bluesky, ['le-radar.ca']);

if (saved.n !== undefined) process.env.FORBIDDEN_NAMES = saved.n;
if (saved.b !== undefined) process.env.INTERNAL_BLUESKY_ACCOUNTS = saved.b;
console.log('privacy-guard OK');

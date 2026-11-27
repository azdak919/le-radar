#!/usr/bin/env node
// Politique sociale (data/social/policy.json) : volume réduit 14 jours, pacing par jour civil Toronto, solidité des posts,
// budget de mentions X (≤ 1 par média et par jour), gel des abonnements automatiques, aucun suivi X dans le dépôt.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { POLICY, volumeActive, volumeFor, allowedByNow, torontoDay, torontoHour, mentionLedger, accountsForPost, mentionedIn, noteMention, postedToday } from '../scripts/social/policy.mjs';
import { plan, NETWORKS } from '../scripts/social/rate-limit.mjs';
import { buildXText, selectDaily, xlen } from '../scripts/social/lib.mjs';
const T = iso => Date.parse(iso);

// ── volume des articles un à un, permanent depuis le 27 nov. 2026 (Charles) : Bluesky 3, Mastodon 3, Tumblr 3, X 2 ;
// Facebook, LinkedIn et Threads arrêtés dans leur module (plafond 0), donc absents d'ici.
const OLD = { volume: { ...POLICY.volume, from: '2026-11-09', until: '2026-11-23' } };
assert.equal(POLICY.volume.from, '2026-11-27'); assert.equal(POLICY.volume.until, '2099-12-31');
assert.equal(volumeActive(T('2026-11-27T05:30:00Z')), true, '27 nov. 0 h 30 heure de Montréal : début');
assert.equal(volumeActive(T('2027-06-01T16:00:00Z')), true, 'permanent');
assert.equal(volumeActive(T('2026-11-24T04:30:00Z'), OLD), true, 'mécanisme : dernier jour inclus');
assert.equal(volumeActive(T('2026-11-24T05:30:00Z'), OLD), false, 'mécanisme : lendemain hors fenêtre');
assert.equal(volumeActive(T('2026-12-15T17:00:00Z'), { volume: { ...POLICY.volume, active: false } }), false, 'active:false coupe tout');
for (const n of ['bluesky', 'mastodon', 'tumblr']) assert.equal(volumeFor(n, T('2026-12-02T17:00:00Z')).perDay, 3, n);
assert.equal(volumeFor('x', T('2026-12-02T17:00:00Z')).perDay, 2);
for (const n of ['facebook', 'linkedin', 'threads', 'inconnu']) assert.equal(volumeFor(n, T('2026-12-02T17:00:00Z')), null, `${n} : hors volume (arrêté dans son module)`);
assert.deepEqual(POLICY.volume.xSlots, ['14:30', '17:30'], 'X : entre la revue de 12 h et la une de 19 h 30');
assert.ok(POLICY.volume.minPerDay === 2 && Object.values(POLICY.volume.perDay).every(v => v >= 2 && v <= 3), '2 à 3 par jour et par réseau');

// ── pacing : 0 la nuit, croissant, perDay en fin de journée
assert.equal(allowedByNow('bluesky', 5, T('2026-11-10T08:00:00Z')), 0, '3 h : rien');
let last = 0; for (let h = 0; h < 24; h++) { const a = allowedByNow('bluesky', 5, T('2026-11-10T05:00:00Z') + h * 3600e3); assert.ok(a >= last && a <= 5); last = a; }
assert.equal(last, 5, 'tout le budget est permis en fin de journée'); assert.ok(allowedByNow('bluesky', 5, T('2026-11-10T16:00:00Z')) <= 2, '11 h : au plus 2');

// ── plan réduit
const now = T('2026-12-02T02:00:00Z'); // mardi 1er déc. 21 h (heure de Montréal)
const ago = m => new Date(now - m * 60e3);
const it = (id, source, min, img = 'https://img.ex/' + id + '.jpg', credit = 'Marie Tremblay') => ({ id, source, date: ago(min), img, credit, title: id + ' titre', bare: id + ' titre', desc: 'Un extrait substantiel qui dépasse largement le seuil de quatre-vingts caractères pour compter. '.repeat(2) });
const day = Array.from({ length: 9 }, (_, i) => it('s' + i, 'Src' + i, 20 + i * 30));
const liveSince = ago(60 * 24 * 30).toISOString();
const p0 = plan(day, {}, { network: 'bluesky', liveSince, now });
assert.equal(p0.limits.reduced, true); assert.equal(p0.limits.perDay, 3);
assert.ok(p0.now.length >= 1 && p0.now.length <= NETWORKS.bluesky.perRun, 'pas de rafale');
assert.equal(new Set(p0.now.map(i => i.source)).size, p0.now.length, 'une publication par source');
const sentToday = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [`d${i}`, { at: new Date(T('2026-12-01T15:00:00Z') + i * 3600e3).toISOString(), uri: 'at://x/' + i, source: 'Autre' + i }]));
assert.equal(postedToday(sentToday(4), now).length, 4);
assert.equal(plan(day, sentToday(3), { network: 'bluesky', liveSince, now }).now.length, 0, '3 déjà publiés aujourd’hui : plafond du jour');
assert.equal(plan(day, sentToday(3), { network: 'bluesky', liveSince, now }).status.dayLeft, 0);
const sameSrc = [it('a1', 'Src0', 20), it('a2', 'Src0', 40), it('b1', 'Src1', 50)];
assert.ok(plan(sameSrc, {}, { network: 'bluesky', liveSince, now }).now.filter(i => i.source === 'Src0').length <= 1, '≤ 1 par source et par jour');
assert.equal(plan(sameSrc, { x: { at: new Date(T('2026-12-01T16:00:00Z')).toISOString(), uri: 'u', source: 'Src0' } }, { network: 'bluesky', liveSince, now }).now.filter(i => i.source === 'Src0').length, 0, 'source déjà publiée aujourd’hui');
// sans photo du flux : seulement après 17 h et tant que le minimum du jour (2) n'est pas atteint
const weak = [it('w1', 'W1', 20, ''), it('w2', 'W2', 30, '')];
assert.equal(plan(weak, {}, { network: 'bluesky', liveSince, now: T('2026-12-01T17:00:00Z') }).now.length, 0, '12 h : article sans photo du flux : attend');
assert.ok(plan(weak, {}, { network: 'bluesky', liveSince, now }).now.length >= 1, '21 h, sous le minimum du jour : on complète');
assert.equal(plan(weak, sentToday(2), { network: 'bluesky', liveSince, now }).now.length, 0, 'minimum atteint : jamais de sans-photo');
// volume permanent : toujours réduit, longtemps après (plus de retour au volume de base)
const later = T('2027-03-16T17:00:00Z');
assert.equal(plan(day.map(x => ({ ...x, date: new Date(later - 3600e3) })), {}, { network: 'bluesky', liveSince, now: later }).limits.reduced, true, 'mars 2027 : toujours 3 par jour');
assert.equal(plan(day, {}, { network: 'bluesky', liveSince, now, schedule: false }).limits.reduced, undefined, 'schedule:false (tests) : base');

// ── hashtags : plafonds par réseau, X = 2 et Facebook = 1 (modules), jamais #PresseÉtudiante
const art = { id: 'a', source: 'Le Délit', author: 'A B', title: 'Hockey : les Stingers gagnent', bare: 'Hockey : les Stingers gagnent', link: 'https://www.delitfrancais.com/x/', desc: 'Hockey à McGill.', img: 'x' };
const acc = [{ handle: '@DelitFrancais', type: 'source', cle_flux: 'Le Délit' }];
const xt = buildXText(art, acc, { credit: 'Marie Tremblay' });
assert.ok(xlen(xt) <= 280 && /\n#RSEQ #Concordia$/.test(xt), xt);
assert.ok(!/#PresseÉtudiante/.test(JSON.stringify(POLICY)));
assert.deepEqual(POLICY.hashtags.maxByNetwork, { bluesky: 2, mastodon: 4, tumblr: 15, instagram: 5 });
assert.equal(POLICY.formats.une.prepared.instagram.enabled, true);
assert.equal(POLICY.automation.instagram_follow, false);
assert.equal(POLICY.automation.mastodon_post, true);
assert.equal(POLICY.automation.tumblr_post, true);
assert.equal(POLICY.automation.engage, true);
for (const f of ['social-mastodon.yml', 'social-tumblr.yml', 'social-engage.yml']) {
  const y = fs.readFileSync(new URL('../.github/workflows/' + f, import.meta.url), 'utf8');
  assert.doesNotMatch(y, /vars\.(MASTODON_LIVE|TUMBLR_LIVE|ENGAGE_LIVE)/, f);
  assert.match(y, /live-flag\.mjs/, f);
}

// ── X : au plus une mention par média et par jour
const accounts = [{ handle: '@DelitFrancais', type: 'source', cle_flux: 'Le Délit' }, { handle: '@Linknewspaper', type: 'source', cle_flux: 'The Link' }];
const ledger = mentionLedger({ sent: { a: { source: 'Le Délit', mention: ['@DelitFrancais'], dueAt: '2026-11-12T16:00:00Z' } }, queued: [{ text: 'x\n📰 The Link (@Linknewspaper) · A', dueAt: '2026-11-12T18:00:00Z' }, { text: 'sans mention', dueAt: '2026-11-12T19:00:00Z' }], accounts });
const d12 = torontoDay(T('2026-11-12T17:00:00Z'));
assert.ok(ledger.get(d12).has('@delitfrancais') && ledger.get(d12).has('@linknewspaper'));
const second = { ...art, id: 'b' };
assert.equal(accountsForPost(second, accounts, ledger, d12).some(a => a.handle === '@DelitFrancais'), false, '2e post du même média le même jour : sans @');
assert.equal(accountsForPost(second, accounts, ledger, '2026-11-13').some(a => a.handle === '@DelitFrancais'), true, 'le lendemain : @ permis');
assert.equal(accountsForPost({ ...art, source: 'Autre' }, accounts, ledger, d12).length, 2, 'autres médias : liste intacte');
const t2 = buildXText(second, accountsForPost(second, accounts, ledger, d12), { credit: '' });
assert.ok(!t2.includes('@DelitFrancais') && t2.includes('📰 Le Délit'), t2);
const l2 = new Map(); const t1 = buildXText(art, accountsForPost(art, accounts, l2, d12), { credit: '' });
assert.deepEqual(mentionedIn(t1, accounts), ['@DelitFrancais']); noteMention(l2, d12, '@DelitFrancais');
assert.equal(accountsForPost(second, accounts, l2, d12).some(a => a.handle === '@DelitFrancais'), false);
// mentionLedger n'est pas dupe d'un préfixe (@Link ≠ @Linknewspaper)
assert.equal(mentionLedger({ queued: [{ text: 'cc @Linknewspaper2', dueAt: '2026-11-12T18:00:00Z' }], accounts }).size, 0);

// ── solidité : sélection nocturne X, photo du flux d'abord
const pool = [it('p0', 'A', 10, ''), it('p1', 'B', 20), it('p2', 'C', 30)].map(x => ({ ...x, date: +x.date }));
const solid = selectDaily(pool, { slots: 3, minPhoto: 1, perSource: 1, now, maxAgeH: 72 });
assert.deepEqual(solid.map(x => x.id).sort(), ['p1', 'p2'], 'minPhoto : sans photo du flux écarté');

// ── automatisation : aucun abonnement X, Bluesky gelé
assert.equal(POLICY.automation.x_follow, false); assert.equal(POLICY.automation.facebook_follow, false);
assert.ok(POLICY.automation.bluesky_follow.max_total <= 88, 'abonnements Bluesky figés');
const files = []; const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(mjs|js|yml)$/.test(f.name)) files.push(p); } };
walk('scripts'); walk('.github/workflows'); walk('cloudflare');
const FOLLOW_X = /friendships\/create|create_follows|\/2\/users\/[^\s'"`]*following|users_id_follow|follow_user/;
const hits = files.filter(f => !f.endsWith('tests/social-policy.mjs') && FOLLOW_X.test(fs.readFileSync(f, 'utf8')));
assert.deepEqual(hits, [], `aucun code d'abonnement X dans le dépôt : ${hits}`);
const bf = fs.readFileSync('scripts/social/bluesky-follow.mjs', 'utf8'); assert.ok(/max_total/.test(bf) && /gelés/.test(bf), 'garde de gel Bluesky');
assert.equal(torontoHour(T('2026-11-10T14:00:00Z')), 9);
console.log('social-policy : OK');

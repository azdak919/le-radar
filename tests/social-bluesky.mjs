#!/usr/bin/env node
// Bot Bluesky : format, graphèmes ≤ 300, facettes (octets UTF-8), langue, créneaux, idempotence.
import assert from 'node:assert/strict';
import { buildBskyText, graphemes, facets, detectLang, dueItems, postRecord } from '../scripts/social/bluesky.mjs';
import { slotsDue } from '../cloudflare/news-trigger/src/lib.js';

const it = { id: 'a', source: 'Montréal Campus', author: 'Valentin Nucci', title: 'Quand la neurodiversité s’épanouit au travail', bare: 'Quand la neurodiversité s’épanouit au travail',
  link: 'https://montrealcampus.ca/2026/10/30/quand-la-neurodiversite/', desc: 'Fanny Groleau assure un poste d’assistante de cuisine au sein du Zera Café, une équipe composée exclusivement de personnes neurodivergentes qui travaillent dans la joie et la bonne humeur depuis des années déjà. '.repeat(3) };
const acc = [{ handle: '@montrealcampus.bsky.social', type: 'source', cle_flux: 'Montréal Campus' }];
const t = buildBskyText(it, acc, { credit: 'Éloïse 📷' });
assert(graphemes(t) <= 300 && graphemes(t) >= 280, `graphèmes : ${graphemes(t)}`);
assert(t.startsWith('Montréal Campus (@montrealcampus.bsky.social) • Valentin Nucci • Quand'), 'format nom (@) • auteur • titre');
assert(!t.startsWith('@'));
assert(t.includes('\n' + it.link + '\n📸 Éloïse 📷'), 'lien puis crédit');
assert.equal(graphemes('👩🏽‍🎓é'), 2, 'graphèmes, pas code points');

// facettes : octets UTF-8 exacts
const dids = new Map([['montrealcampus.bsky.social', 'did:plc:abc']]);
const f = facets(t, dids), b = Buffer.from(t, 'utf8');
const link = f.find(x => x.features[0].$type.endsWith('#link')), men = f.find(x => x.features[0].$type.endsWith('#mention'));
assert.equal(b.subarray(link.index.byteStart, link.index.byteEnd).toString(), it.link);
assert.equal(b.subarray(men.index.byteStart, men.index.byteEnd).toString(), '@montrealcampus.bsky.social');
assert.equal(men.features[0].did, 'did:plc:abc');
assert.equal(facets(t).filter(x => x.features[0].$type.endsWith('#mention')).length, 0, 'pas de @ non résolu');

// lien long : retiré du texte (la carte reste cliquable) si l'extrait y perd > 100 car.
const long = { ...it, link: 'https://ex.org/' + 'x'.repeat(150) };
assert(!buildBskyText(long, []).includes(long.link));

// langue
assert.equal(detectLang(it), 'fr');
assert.equal(detectLang({ title: 'Stingers lose in their home opener', desc: 'The team was beaten at home and the fans were in shock.' }), 'en');

// enregistrement
const rec = postRecord({ text: t, lang: 'fr', dids, card: { uri: it.link, title: it.title, thumb: { ref: 'x' } } });
assert.deepEqual(rec.langs, ['fr']); assert.equal(rec.embed.$type, 'app.bsky.embed.external'); assert.equal(rec.embed.external.uri, it.link);

// créneaux dus / en retard / déjà envoyés (idempotence)
const now = Date.parse('2026-11-01T17:10:00Z');
const xs = { a: { dueAt: '2026-11-01T17:00:00Z' }, b: { dueAt: '2026-11-01T12:30:00Z' }, c: { dueAt: '2026-11-01T18:00:00Z' }, d: { dueAt: '2026-11-01T16:00:00Z' }, e: { dueAt: '2026-11-01T17:00:00Z', shareNow: true } };
let r = dueItems(xs, {}, { now });
assert.deepEqual(r.due.map(x => x.id), ['d', 'a']); assert.deepEqual(r.late.map(x => x.id), ['b']);
r = dueItems(xs, { a: {}, d: {} }, { now });
assert.deepEqual(r.due, [], 'jamais deux fois');

// Worker : déclenche seulement dans les 35 min suivant un créneau (heure de Toronto, HNE/HAE)
assert.equal(slotsDue(Date.parse('2026-11-01T17:05:00Z')), true);   // 12 h 05 HNE
assert.equal(slotsDue(Date.parse('2026-11-01T16:35:00Z')), false);  // 11 h 35 HNE
assert.equal(slotsDue(Date.parse('2026-07-01T11:35:00Z')), true);   // 7 h 35 HAE
console.log('social-bluesky : OK');

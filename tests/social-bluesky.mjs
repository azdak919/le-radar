#!/usr/bin/env node
// Bot Bluesky : format, graphèmes ≤ 300, facettes (octets UTF-8), langue, créneaux, idempotence.
import assert from 'node:assert/strict';
import { siteLink, buildBskyText, graphemes, facets, detectLang, dueItems, postRecord } from '../scripts/social/bluesky.mjs';
import { slotsDue } from '../cloudflare/news-trigger/src/lib.js';

const it = { id: 'a', source: 'Montréal Campus', author: 'Valentin Nucci', title: 'Quand la neurodiversité s’épanouit au travail', bare: 'Quand la neurodiversité s’épanouit au travail',
  link: 'https://montrealcampus.ca/2026/10/30/quand-la-neurodiversite/', desc: 'Fanny Groleau assure un poste d’assistante de cuisine au sein du Zera Café, une équipe composée exclusivement de personnes neurodivergentes qui travaillent dans la joie et la bonne humeur depuis des années déjà. '.repeat(3) };
const acc = [{ handle: '@montrealcampus.bsky.social', type: 'source', cle_flux: 'Montréal Campus' }];
const t = buildBskyText(it, acc, { credit: 'Éloïse 📷' });
assert(graphemes(t) <= 300, `graphèmes : ${graphemes(t)}`);
assert(t.startsWith('Quand la neurodiversité s’épanouit au travail\n\nFanny Groleau'), 'titre puis extrait');
assert(t.includes('\n\nMontréal Campus (@montrealcampus.bsky.social) · Valentin Nucci\n' + siteLink(it) + '\n📸 Éloïse 📷'), 'Média (@) · Auteur, fiche, crédit');
assert.equal(graphemes('👩🏽‍🎓é'), 2, 'graphèmes, pas code points');

// facettes : octets UTF-8 exacts
const dids = new Map([['montrealcampus.bsky.social', 'did:plc:abc']]);
const f = facets(t, dids), b = Buffer.from(t, 'utf8');
const link = f.find(x => x.features[0].$type.endsWith('#link')), men = f.find(x => x.features[0].$type.endsWith('#mention'));
assert.equal(b.subarray(link.index.byteStart, link.index.byteEnd).toString(), siteLink(it));
assert.equal(b.subarray(men.index.byteStart, men.index.byteEnd).toString(), '@montrealcampus.bsky.social');
assert.equal(men.features[0].did, 'did:plc:abc');
assert.equal(facets(t).filter(x => x.features[0].$type.endsWith('#mention')).length, 0, 'pas de @ non résolu');

// lien long : retiré du texte (la carte reste cliquable) si l'extrait y perd > 100 car.
assert(!t.includes(it.link), 'jamais le lien du média');

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

// Créneaux X : seulement dans les 35 min suivant un créneau (heure de Toronto, HNE/HAE)
assert.equal(slotsDue(Date.parse('2026-11-01T17:35:00Z')), true);   // 12 h 35 HNE
assert.equal(slotsDue(Date.parse('2026-11-01T15:35:00Z')), false);  // 10 h 35 HNE
assert.equal(slotsDue(Date.parse('2026-07-01T12:35:00Z')), true);   // 8 h 35 HAE
console.log('social-bluesky : OK');

// Bogue « Québec: » : titre français avec deux-points collé → reste français (espace avant « : »)
import { buildText, isEnglish } from '../scripts/social/lib.mjs';
const qc = { id: 'q', source: 'The Concordian', author: 'Ilario', title: 'Le plan chaleur 2026 de Montréal, une mesure « pansement » face à la montée de l’itinérance au Québec: Paul St-Pierre Plamondon', bare: 'Le plan chaleur 2026 de Montréal, une mesure « pansement » face à la montée de l’itinérance au Québec', link: 'https://ex.org/a', desc: 'Paul St-Pierre Plamondon en a fait sa priorité dans les régions du Québec et la ville est sous pression depuis des mois.' };
assert.equal(detectLang(qc), 'fr'); assert.equal(isEnglish(qc.title), false);
assert(buildText(qc, []).startsWith(qc.bare + '\n\nPaul St-Pierre'), 'titre nu puis extrait sur sa propre ligne');
assert.equal(isEnglish('Carabins 4, Stingers 0: Stingers lose in their home opener'), true);
console.log('social-bluesky (langue) : OK');

// Listes Bluesky : handles uniques, did présents, sources = cle_flux
import fs2 from 'node:fs';
const fl = JSON.parse(fs2.readFileSync(new URL('../data/social/bluesky-follows.json', import.meta.url))).follows;
assert(fl.every(x => /^did:plc:/.test(x.did) && !x.handle.startsWith('@')) && new Set(fl.map(x => x.did)).size === fl.length, 'follows valides');
const ba = JSON.parse(fs2.readFileSync(new URL('../data/social/bluesky-accounts.json', import.meta.url))).accounts;
assert(ba.every(a => a.handle.startsWith('@') && a.type === 'source' && a.cle_flux), 'comptes valides');
console.log('social-bluesky (listes) : OK');
// auto-étiquette « bot » : conserve tous les champs et les autres étiquettes, idempotente
const { withBotLabel } = await import('../scripts/social/bluesky-label.mjs');
const prof = { $type: 'app.bsky.actor.profile', displayName: 'Le Radar', description: 'bio', avatar: { ref: 'a' }, banner: { ref: 'b' }, labels: { $type: 'com.atproto.label.defs#selfLabels', values: [{ val: '!no-unauthenticated' }] } };
const lab = withBotLabel(prof);
assert.deepEqual([lab.displayName, lab.description, lab.avatar, lab.banner], [prof.displayName, prof.description, prof.avatar, prof.banner]);
assert.deepEqual(lab.labels.values.map(v => v.val), ['!no-unauthenticated', 'bot']);
assert.equal(withBotLabel(lab), null); assert.deepEqual(withBotLabel({}).labels.values, [{ val: 'bot' }]);
console.log('social-bluesky (étiquette bot) : OK');

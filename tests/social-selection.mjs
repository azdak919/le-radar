// Sélection commune (scripts/social/selection.mjs) : note, lot d'un même média, places par la note, pas de doublon avec La une.
import assert from 'node:assert/strict';
import { scoreItem, scorer, recentUneKeys, seatByScore, bestFirst, bestSlotsFirst, articleKey, FRONT_TOP } from '../scripts/social/selection.mjs';
import { selectItems } from '../scripts/social/lib.mjs';
import { rankLikeX, plan } from '../scripts/social/rate-limit.mjs';

const now = Date.parse('2026-11-26T15:00:00Z'); // jeudi 10 h, heure de Montréal
const H = h => now - h * 3600e3;
const long = 'Un extrait assez long pour donner envie de lire la suite de cet article étudiant, avec des détails.';
const mk = (id, source, { h = 2, img = true, credit = 'Marie Tremblay', desc = long } = {}) => ({
  id: `https://le-radar.ca/article/${id}/`, link: `https://media.example/${id}`, title: `Titre ${id}`, bare: `Titre ${id}`,
  source, date: H(h), img: img ? `https://media.example/${id}.jpg` : '', credit, desc, author: 'A B',
});

// ── note : rang de la page d'accueil, photo, extrait, fraîcheur
const a = mk('a', 'Le Délit'), b = mk('b', 'Le Délit'), c = mk('c', 'Le Délit', { img: false, desc: 'court' }), old = mk('old', 'Le Délit', { h: 50 });
const ranks = new Map([[articleKey(a), 0], [articleKey(b), 20]]);
const s = scorer({ ranks, now });
assert.ok(s(a) > s(b), 'premier de la page d’accueil devant le 21e');
assert.ok(s(b) > s(mk('n', 'Le Délit')), 'classé devant non classé');
assert.equal(scoreItem(mk('z', 'X'), { ranks: new Map([[articleKey(mk('z', 'X')), FRONT_TOP + 5]]), now }), scoreItem(mk('z', 'X'), { now }), 'hors des 30 premiers : pas de bonus');
assert.ok(s(mk('p', 'Q')) > s(c), 'photo et extrait comptent');
assert.ok(s(mk('f', 'Q', { h: 2 })) > s(old), 'fraîcheur');
assert.ok(s(a) <= 19 && s(c) >= 0);

// ── lot : 6 articles d'un même média arrivent ensemble, plus 3 autres médias
const batch = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map((id, i) => mk(id, 'The McGill Daily', { h: 1 + i * 0.1 }));
const others = [mk('o1', 'Le Délit', { h: 5 }), mk('o2', 'Quartier Libre', { h: 6 }), mk('o3', 'Impact Campus', { h: 7, img: false })];
const r2 = new Map([[articleKey(batch[4]), 0], [articleKey(others[1]), 1], [articleKey(batch[2]), 3]]);
const sc = scorer({ ranks: r2, now });
const sel = selectItems([...batch, ...others], { slots: 5, now, score: sc });
const fromBatch = sel.filter(i => i.source === 'The McGill Daily');
assert.equal(fromBatch.length, 2, 'variété : au plus 2 du même média');
assert.deepEqual(fromBatch.map(i => i.title).sort(), ['Titre b3', 'Titre b5'], 'les 2 meilleurs du lot, pas les 2 plus récents');
assert.ok(sel.some(i => i.source === 'Quartier Libre') && sel.some(i => i.source === 'Le Délit'), 'les autres médias gardent leur place');
assert.deepEqual(rankLikeX([...batch, ...others], { score: sc }).slice(0, 2).map(i => i.title).sort(), ['Titre b5', 'Titre o2'], 'Bluesky/Mastodon : les meilleurs d’abord');

// ── places : meilleur article → heure de plus forte audience
const dues = ['2026-11-26T13:30:00Z', '2026-11-26T22:30:00Z', '2026-11-27T02:00:00Z']; // 8 h 30, 17 h 30, 21 h (X)
const best = bestFirst([others[2], batch[4], others[1]], sc);
assert.equal(best[0].title, 'Titre b5');
const slots = bestSlotsFirst(dues, 'x');
assert.equal(slots[0], '2026-11-26T22:30:00Z', 'X : 17 h 30 a le plus fort poids');
const seats = seatByScore([others[2], batch[4], others[1]], dues, { network: 'x', score: sc });
assert.equal(seats.find(x => x.dueAt === '2026-11-26T22:30:00Z').it.title, 'Titre b5', 'le meilleur prend la meilleure heure');
assert.deepEqual(seats.map(x => x.dueAt), [...dues].sort(), 'retour trié par heure');

// ── La une : pas de doublon sur le même réseau dans les 24 h
const une = {
  _doc: 'x',
  '2026-11-26:matin': { at: '2026-11-26T12:45:00Z', ids: [articleKey(batch[4])], nets: { x: {}, facebook: {} } },
  '2026-11-24:soir': { at: '2026-11-25T00:40:00Z', ids: [articleKey(others[0])], nets: { x: {} } },
};
assert.ok(recentUneKeys(une, 'x', { now }).has(articleKey(batch[4])), 'une du matin sur X');
assert.ok(!recentUneKeys(une, 'x', { now }).has(articleKey(others[0])), 'plus de 24 h : de nouveau permis');
assert.equal(recentUneKeys(une, 'threads', { now }).size, 0, 'Threads n’est pas dans La une');
const liveSince = '2026-11-01T00:00:00Z';
const pl = plan([...batch, ...others].map(i => ({ ...i, date: H(0.5) })), {}, { network: 'bluesky', liveSince, now, schedule: false, score: sc, excluded: it => recentUneKeys(une, 'bluesky', { now }).has(articleKey(it)) });
assert.ok(pl.now.length > 0);
const unex = plan([...batch].map(i => ({ ...i, date: H(0.5) })), {}, { network: 'bluesky', liveSince, now, schedule: false, score: sc, excluded: it => it.title === 'Titre b5' });
assert.ok(![...unex.now, ...unex.hold, ...unex.skip].some(i => i.title === 'Titre b5'), 'exclu : ni publié, ni écarté pour de bon (il reviendra après 24 h)');

console.log('social-selection : OK');

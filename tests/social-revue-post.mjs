// « La revue » sur les réseaux (scripts/social/revue-post.mjs) : créneaux, minimum, textes, Instagram.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as R from '../scripts/social/revue-post.mjs';

const model = JSON.parse(fs.readFileSync(new URL('../data/revue/reviews/2026-11-25-soir.json', import.meta.url), 'utf8'));
const at = (iso) => Date.parse(iso);

// Créneaux (heure de Montréal ; 26 nov. 2026 = heure normale, UTC−5) : matin 9 h – 11 h 30, soir 20 h 30 – 22 h 30, loin de La une.
assert.equal(R.slotAt(at('2026-11-26T14:15:00Z'))?.id, 'matin', '9 h 15');
assert.equal(R.slotAt(at('2026-11-26T12:45:00Z')), null, '7 h 45 (La une) : rien');
assert.equal(R.slotAt(at('2026-11-27T00:30:00Z')), null, '19 h 30 (La une) : rien');
assert.equal(R.slotAt(at('2026-11-27T01:45:00Z'))?.revueId, '2026-11-26-soir', '20 h 45 → revue du soir du jour');
assert.deepEqual(R.slotAt(at('2026-11-26T14:15:00Z')).networks, ['linkedin', 'facebook', 'instagram']);
assert.ok(!R.CFG.slots.soir.networks.includes('linkedin'), 'LinkedIn : le matin seulement');
// Instagram à partir du 29 nov. (rodage du compte).
assert.deepEqual(R.netsFor({ ...R.CFG.slots.matin, day: '2026-11-28' }), ['linkedin', 'facebook']);
assert.deepEqual(R.netsFor({ ...R.CFG.slots.matin, day: '2026-11-29' }), ['linkedin', 'facebook', 'instagram']);

// Minimum (comme La une) : revue publiée → oui ; sautée ou absente → non ; vide → non.
const slot = { id: 'soir', day: '2026-11-25', revueId: '2026-11-25-soir' };
assert.equal(R.revueFor(slot, { index: [{ id: '2026-11-25-soir' }], load: () => model }).ok, true);
assert.equal(R.revueFor(slot, { index: [], load: () => model }).ok, false, 'revue sautée : rien');
assert.equal(R.revueFor(slot, { index: [{ id: '2026-11-25-soir' }], load: () => ({ items: [], sports: {}, radio: [] }) }).ok, false, 'revue vide : rien');
const quiet = { ...model, items: [] };
assert.equal(R.revueFor(slot, { index: [{ id: '2026-11-25-soir' }], load: () => quiet }).ok, true, 'sans article mais avec sport et radio : publiée');

// Textes.
const t = R.revueTexts(['linkedin', 'facebook', 'instagram'], model);
for (const [n, v] of Object.entries(t)) assert.deepEqual(v.problems, [], `${n} : ${v.problems}`);
assert.match(t.facebook.text, /^🌙 La revue du soir · mercredi 25 novembre\n/);
assert.match(t.facebook.text, /8 articles des médias étudiants du Québec, choisis parmi les 14 de la revue/);
assert.match(t.facebook.text, /https:\/\/le-radar\.ca\/revues\/2026-11-25-soir\//);
assert.doesNotMatch(t.facebook.text, /- The McGill Daily — The McGill Daily/, 'média pas répété dans le titre');
assert.match(t.facebook.text, /🏀 Basketball \(F\) · Martlets \(McGill\) vs Stingers \(Concordia\)/);
assert.match(t.facebook.text, /CHYZ 94,3 FM/);
assert.equal((t.linkedin.text.match(/#[\p{L}_]+/gu) || []).length, 1);
assert.doesNotMatch(t.instagram.text, /https?:\/\//, 'Instagram : aucun lien cliquable');
assert.match(t.instagram.text, /lien en bio/);
assert.match(t.instagram.text, /📸 /, 'crédit photo');
const igTags = t.instagram.text.match(/#[\p{L}\p{N}_]+/gu) || [];
assert.ok(igTags.length >= 3 && igTags.length <= 5, `Instagram : 3 à 5 mots-clics (${igTags.length})`);
assert.match(R.revueText('facebook', quiet, { limit: 1500 }).text, /Pas de nouvel article/);
// Trop long : les dernières lignes d'articles tombent, le reste demeure.
const short = R.revueText('facebook', model, { limit: 700 });
assert.ok(short.len <= 700 && short.problems.length === 0 && /revues\/2026-11-25-soir/.test(short.text));

// État : un réseau publié ou abandonné après 3 essais compte comme fait.
assert.equal(R.slotDone({ nets: { facebook: { at: 'x' }, instagram: { attempts: 3, failed: true } } }, ['facebook', 'instagram']), true);
assert.equal(R.slotDone({ nets: { facebook: { at: 'x' } } }, ['facebook', 'instagram']), false);
assert.equal(R.gate({ now: at('2026-11-26T16:00:00Z'), state: {} }).due, true, '11 h : matin dû');
assert.equal(R.gate({ now: at('2026-11-26T18:00:00Z'), state: {} }).due, false, '13 h : hors fenêtre');
console.log('social-revue-post : OK');

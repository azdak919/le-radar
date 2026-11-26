// « La revue » sur les réseaux (scripts/social/revue-post.mjs) : créneaux, minimum, textes, Instagram.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as R from '../scripts/social/revue-post.mjs';

const model = JSON.parse(fs.readFileSync(new URL('../data/revue/reviews/2026-11-25-soir.json', import.meta.url), 'utf8'));
const at = (iso) => Date.parse(iso);

// Créneaux (heure de Montréal ; 26 nov. 2026 = heure normale, UTC−5) : matin 7 h – 13 h 30, soir 19 h – 22 h 30.
assert.equal(R.slotAt(at('2026-11-26T12:30:00Z'))?.id, 'matin', '7 h 30 : le matin peut déjà programmer');
assert.equal(R.slotAt(at('2026-11-26T18:45:00Z')), null, '13 h 45 : fenêtre fermée');
assert.equal(R.slotAt(at('2026-11-27T01:45:00Z'))?.revueId, '2026-11-26-soir', '20 h 45 → revue du soir du jour');
assert.equal(R.slotAt(at('2026-11-27T03:45:00Z')), null, '22 h 45 : fenêtre fermée');
// Une heure par réseau, dans l'ordre ; LinkedIn en semaine seulement ; Instagram à partir du 29 nov. (rodage).
const matin = (day) => ({ ...R.CFG.slots.matin, day, revueId: `${day}-matin` });
const soir = (day) => ({ ...R.CFG.slots.soir, day, revueId: `${day}-soir` });
assert.deepEqual(R.netsFor(matin('2026-11-27')), ['facebook', 'linkedin'], 'vendredi, avant Instagram');
assert.deepEqual(R.netsFor(matin('2026-11-30')), ['facebook', 'instagram', 'linkedin'], 'lundi : 11 h, 12 h, 12 h 15');
assert.deepEqual(R.netsFor(matin('2026-11-29')), ['facebook', 'instagram'], 'dimanche : pas de LinkedIn');
assert.deepEqual(R.netsFor(soir('2026-11-30')), ['facebook', 'instagram'], 'soir : jamais LinkedIn');
// Heure exacte : heure de Montréal → UTC, heure normale et heure avancée.
assert.equal(new Date(R.dueFor(matin('2026-11-30'), 'facebook')).toISOString(), '2026-11-30T16:00:00.000Z', '11 h HNE');
assert.equal(new Date(R.dueFor(soir('2026-11-30'), 'instagram')).toISOString(), '2026-12-01T02:15:00.000Z', '21 h 15 HNE');
assert.equal(new Date(R.dueFor({ ...R.CFG.slots.matin, day: '2027-06-01' }, 'linkedin')).toISOString(), '2027-06-01T16:15:00.000Z', '12 h 15 HAE');
// Passage tôt : programmé dans Buffer à l'heure du réseau ; passage tardif : tout de suite.
assert.deepEqual(R.whenFor(matin('2026-11-30'), 'facebook', at('2026-11-30T12:40:00Z')), { dueAt: '2026-11-30T16:00:00.000Z' });
assert.deepEqual(R.whenFor(matin('2026-11-30'), 'facebook', at('2026-11-30T16:20:00Z')), { now: true });
assert.deepEqual(R.whenFor(matin('2026-11-30'), 'facebook', at('2026-11-30T15:59:00Z')), { now: true }, 'moins de 2 min : tout de suite');

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
assert.equal(R.gate({ now: at('2026-11-26T12:40:00Z'), state: {} }).due, true, '7 h 40 : matin dû (programmation)');
assert.equal(R.gate({ now: at('2026-11-26T19:00:00Z'), state: {} }).due, false, '14 h : hors fenêtre');
// Buffer : programmée (customScheduled + dueAt) pour Instagram en carrousel ; sinon tout de suite (shareNow).
{
  const { deliverInstagram } = await import('../scripts/social/instagram.mjs');
  const run = async (dueAt) => {
    let sent;
    const fetchImpl = async (_u, o) => { const b = JSON.parse(o.body);
      if (/createPost/.test(b.query)) { sent = b.variables.i; return { ok: true, status: 200, json: async () => ({ data: { createPost: { post: { id: 'p9', status: 'scheduled' } } } }) }; }
      if (/organizations/.test(b.query)) return { ok: true, status: 200, json: async () => ({ data: { account: { organizations: [{ id: 'o' }] } } }) };
      if (/channels/.test(b.query)) return { ok: true, status: 200, json: async () => ({ data: { channels: [{ id: '6b012936ece6dfde5f3f554d', name: 'le.radar.ca', service: 'instagram' }] } }) };
      return { ok: true, status: 200, json: async () => ({ data: { posts: { edges: [] } } }) }; };
    const r = await deliverInstagram({ env: { BUFFER_INSTAGRAM_API_KEY: 'x' }, text: 'Légende', imageUrl: 'https://a/1.jpg', dueAt, images: [{ url: 'https://a/1.jpg', alt: 'a' }, { url: 'https://a/2.jpg', alt: 'b' }], fetchImpl });
    assert.equal(r.action, 'sent', r.reason);
    return sent;
  };
  const later = await run('2026-11-30T17:00:00.000Z');
  assert.equal(later.mode, 'customScheduled'); assert.equal(later.dueAt, '2026-11-30T17:00:00.000Z'); assert.equal(later.assets.length, 2);
  assert.equal((await run(undefined)).mode, 'shareNow');
}
console.log('social-revue-post : OK');

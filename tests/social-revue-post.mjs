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
// Une heure par réseau (plan du 26 nov.) : matin Facebook 12 h, LinkedIn 12 h 30 (semaine) ; soir Facebook 20 h, Instagram 21 h 15.
const matin = (day) => ({ ...R.CFG.slots.matin, id: 'matin', day, revueId: `${day}-matin` });
const soir = (day) => ({ ...R.CFG.slots.soir, id: 'soir', day, revueId: `${day}-soir` });
assert.deepEqual(R.netsFor(matin('2026-11-30')), ['facebook', 'x', 'mastodon', 'linkedin'], 'lundi matin : 12 h ×3, 12 h 30');
assert.deepEqual(R.netsFor(matin('2026-11-29')), ['facebook', 'x', 'mastodon'], 'dimanche : pas de LinkedIn');
assert.deepEqual(R.netsFor(soir('2026-11-30')), ['facebook', 'bluesky', 'instagram', 'threads'], 'soir : 20 h, 21 h, 21 h 15, 21 h 30 ; TikTok éteint');
assert.ok(!R.tiktokEnabled(), 'TikTok : éteint tant que le compte n’est pas connecté dans Buffer');
assert.deepEqual(R.netsFor(soir('2026-11-30'), { cfg: { ...R.CFG, tiktok: { enabled: true } } }), ['facebook', 'tiktok', 'bluesky', 'instagram', 'threads'], 'TikTok allumé : 20 h 30');
assert.ok(R.BUFFER_NETS.has('x') && R.BUFFER_NETS.has('threads') && !R.BUFFER_NETS.has('bluesky') && !R.BUFFER_NETS.has('mastodon'), 'Bluesky et Mastodon : API directes, pas de programmation');
// Textes courts : X ≤ 280, Bluesky ≤ 300 (marge), lien et mot-clic toujours là ; Threads sans mot-clic ; TikTok sans lien.
{
  const t = R.revueTexts(['x', 'bluesky', 'mastodon', 'threads', 'tiktok'], model);
  for (const [n, v] of Object.entries(t)) assert.deepEqual(v.problems, [], `${n} : ${v.problems}`);
  assert.ok(t.x.len <= 280 && /le-radar\.ca\/revues\/2026-11-25-soir\//.test(t.x.text) && /#MédiasÉtudiants/.test(t.x.text));
  assert.ok(t.bluesky.len <= 290 && /le-radar\.ca\/revues\//.test(t.bluesky.text));
  assert.ok(t.mastodon.len <= 500); assert.ok(t.threads.len <= 500 && !/#/.test(t.threads.text), 'Threads : sans mot-clic');
  assert.doesNotMatch(t.tiktok.text, /https?:\/\//, 'TikTok : aucun lien'); assert.match(t.tiktok.text, /lien en bio/);
}
assert.equal(new Date(R.dueFor(matin('2026-11-30'), 'facebook')).toISOString(), '2026-11-30T17:00:00.000Z', '12 h HNE');
assert.equal(new Date(R.dueFor(soir('2026-11-30'), 'instagram')).toISOString(), '2026-12-01T02:15:00.000Z', '21 h 15 HNE');
assert.equal(new Date(R.dueFor({ ...R.CFG.slots.matin, day: '2027-06-01' }, 'linkedin')).toISOString(), '2027-06-01T16:30:00.000Z', '12 h 30 HAE');
assert.deepEqual(R.whenFor(matin('2026-11-30'), 'facebook', at('2026-11-30T12:40:00Z')), { dueAt: '2026-11-30T17:00:00.000Z' }, 'tôt : programmée');
assert.deepEqual(R.whenFor(matin('2026-11-30'), 'facebook', at('2026-11-30T17:20:00Z')), { now: true }, 'en retard : tout de suite');
// Instagram suit la montée : pas de revue avant le jour 15 (6 déc.) ; ensuite plafond de 3, la une du soir garde sa place.
const sent = (day, keys) => ({ sent: Object.fromEntries(keys.map((k) => [k, { day, id: 'x' }])) });
assert.equal(R.instagramRevueAllowed({ slot: soir('2026-11-30'), igState: sent('2026-11-30', ['une:2026-11-30:matin']) }).ok, false, 'jour 9 : format revue hors phase');
assert.equal(R.instagramRevueAllowed({ slot: soir('2026-12-07'), igState: sent('2026-12-07', ['une:2026-12-07:matin']) }).ok, true, 'jour 16 : une du matin + revue + une du soir = 3');
assert.equal(R.instagramRevueAllowed({ slot: soir('2026-12-07'), igState: sent('2026-12-07', ['une:2026-12-07:matin', 'results:2026-12-07']) }).ok, false, 'avec les résultats du lundi : la une du soir garde sa place');
assert.equal(R.instagramRevueAllowed({ slot: soir('2026-12-07'), igState: sent('2026-12-07', ['une:2026-12-07:matin', 'revue:2026-12-07-soir']) }).ok, false, 'déjà publiée');

// La une : une heure par réseau Buffer (programmée), null = pas de une, LinkedIn en semaine seulement.
{
  const U = await import('../scripts/social/une-lib.mjs');
  const { CFG: UCFG } = await import('../scripts/social/une-run.mjs');
  const base = ['bluesky', 'mastodon', 'x', 'facebook', 'linkedin', 'threads'];
  const sl = (id, day) => ({ id, day, key: `${day}:${id}` });
  assert.deepEqual(U.uneNets(sl('matin', '2026-11-30'), base, UCFG), base, 'lundi matin : tous');
  assert.deepEqual(U.uneNets(sl('matin', '2026-11-29'), base, UCFG), base.filter((n) => n !== 'linkedin'), 'dimanche : pas de LinkedIn');
  assert.deepEqual(U.uneNets(sl('soir', '2026-11-30'), base, UCFG), ['bluesky', 'mastodon', 'x', 'threads'], 'soir : ni Facebook (la revue) ni LinkedIn');
  assert.deepEqual(U.uneNets({ id: 'matin', day: '2026-11-29', key: '2026-11-29:jourdematch' }, base, UCFG), base, 'Jour de match : tous');
  assert.equal(U.uneNetTime(sl('matin', '2026-11-30'), 'linkedin', UCFG), '08:30');
  assert.equal(U.uneNetTime(sl('matin', '2026-11-30'), 'facebook', UCFG), '09:00');
  assert.equal(U.uneNetTime(sl('matin', '2026-11-30'), 'threads', UCFG), '11:30');
  assert.equal(U.uneNetTime(sl('matin', '2026-11-30'), 'x', UCFG), '', 'X : à l’heure du créneau');
  assert.deepEqual(U.bufferWhen('2026-11-30', '08:30', at('2026-11-30T12:45:00Z')), { dueAt: '2026-11-30T13:30:00.000Z' }, 'une de 7 h 45 : LinkedIn programmée 8 h 30');
  assert.deepEqual(U.bufferWhen('2026-11-30', '', at('2026-11-30T12:45:00Z')), { now: true });
  assert.equal(new Date(U.montrealInstant('2027-07-01', '09:00')).toISOString(), '2027-07-01T13:00:00.000Z', 'heure avancée');
}

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

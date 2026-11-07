// Hashtags Bluesky (facettes #tag), étiquettes Tumblr, aucun hashtag X/pages, IA désactivée sans secret.
import assert from 'node:assert/strict';
import { bskyTags, tumblrTags, topicOf } from '../scripts/social/hashtags.mjs';
import { buildBskyText, facets, graphemes, BSKY_LIMIT, postRecord } from '../scripts/social/bluesky.mjs';
import { buildText, DAILY_SLOTS } from '../scripts/social/lib.mjs';
import { buildPageText } from '../scripts/social/buffer-pages.mjs';
import { aiEnabled, aiHook, validHook } from '../scripts/social/ai-hook.mjs';

const it = { id: 'a', link: 'https://lapige.atmjonquiere.com/2026/11/02/vote-obligatoire-idee-realisable/', source: 'La Pige', author: 'Jeanne Tremblay',
  title: 'Vote obligatoire, idée réalisable ?', bare: 'Vote obligatoire, idée réalisable ?', desc: 'Aux dernières élections provinciales, 2 électeurs sur 3 ont voté. ' .repeat(3) };
assert.deepEqual(bskyTags(it), ['#Québec', '#PresseÉtudiante', '#Politique']);
assert.deepEqual(bskyTags({ title: 'Rien de précis' }), ['#Québec', '#PresseÉtudiante']);
const t = buildBskyText(it, [], { credit: 'Jeanne Tremblay' });
assert.ok(t.startsWith('Vote obligatoire, idée réalisable ?'), 'accroche (titre) en tête');
assert.ok(t.endsWith('#Québec #PresseÉtudiante #Politique') && graphemes(t) <= BSKY_LIMIT, t);
const tags = facets(t).filter(f => f.features[0].$type.endsWith('#tag')).map(f => f.features[0].tag);
assert.deepEqual(tags, ['Québec', 'PresseÉtudiante', 'Politique']);
const f0 = facets(t).find(f => f.features[0].tag === 'PresseÉtudiante'); const by = new TextEncoder().encode(t);
assert.equal(new TextDecoder().decode(by.slice(f0.index.byteStart, f0.index.byteEnd)), '#PresseÉtudiante');
assert.deepEqual(postRecord({ text: t, lang: 'fr' }).langs, ['fr']);
const long = { ...it, title: 'x'.repeat(400), bare: 'y '.repeat(200) };
assert.ok(graphemes(buildBskyText(long)) <= BSKY_LIMIT);
assert.equal(topicOf({ title: 'Carabins 4, Stingers 0' }).tag, 'Sport');
// Tumblr : ≤ 8 étiquettes, lieu et sujet, sans # ni virgule
const tt = tumblrTags(it); assert.ok(tt.length >= 10 && tt.length <= 15 && tt.includes('saguenay') && tt.includes('cégep de jonquière') && tt.includes('politique'), tt.join('|'));
assert.ok(tt.every(x => x === x.toLowerCase()) && new Set(tt).size === tt.length);
{ // FR : larges + lieu d'abord, source après, forme sans accent, catégorie générique écartée, sujet IA prioritaire
  const fr = tumblrTags({ source: "L'Exemplaire", title: 'Le cancer au travail', desc: 'Des étudiants témoignent', categories: ['À la une'], aiTopic: 'Santé' }, 'fr');
  assert.deepEqual(fr.slice(0, 4), ['québec', 'quebec', 'actualités', 'presse étudiante']);
  assert.ok(fr.indexOf('santé') > -1 && !fr.includes('éducation') && !fr.includes('à la une'), fr.join('|'));
  assert.ok(fr.indexOf("l'exemplaire") > fr.indexOf('québec') && fr.includes('université laval') && fr.length >= 10 && fr.length <= 15);
  const m = tumblrTags({ source: 'Le Délit', title: 'x', categories: ['Uncategorized'] }, 'fr'); assert.ok(m.includes('montréal') && m.includes('montreal') && !m.includes('uncategorized'));
  assert.ok(!tumblrTags({ source: 'Le Délit', title: 'x', aiTopic: 'Inventé' }, 'fr').some(t => t === 'inventé'));
}
{ // EN : étiquettes anglaises, student press présent, aucune étiquette française générique
  const e = tumblrTags({ source: 'The McGill Daily', title: 'Tuition hike protest', categories: ['Campus Life'] }, 'en');
  assert.deepEqual(e.slice(0, 3), ['student journalism', 'student newspaper', 'news']);
  assert.ok(e.includes('montreal') && e.includes('canada') && e.includes('student press') && e.includes('education') && e.includes('campus life'), e.join('|'));
  assert.ok(!e.includes('actualités') && !e.includes('presse étudiante') && e.length >= 10 && e.length <= 15);
}
assert.ok(tt.every(x => !/[#,]/.test(x)));
// X et pages : média à la fin, lien à la fin, aucun hashtag
const x = buildText(it, [], 280, { credit: '' }); assert.ok(!/#\p{L}/u.test(x) && x.trim().endsWith('le-radar.ca/' + x.trim().split('le-radar.ca/')[1]));
const p = buildPageText(it, {}, { credit: 'Jeanne Tremblay' }); assert.ok(!/#\p{L}/u.test(p) && /https:\/\/le-radar\.ca\/\S+\n📸 Jeanne Tremblay$/.test(p), p);
// X : créneaux espacés d'au moins 60 min
const mins = DAILY_SLOTS.map(s => +s.slice(0, 2) * 60 + +s.slice(3)); for (let i = 1; i < mins.length; i++) assert.ok(mins[i] - mins[i - 1] >= 60);
// IA : désactivée sans secret, repli null ; garde-fou anti-invention
assert.equal(aiEnabled({}), false); assert.equal(await aiHook(it, { env: {} }), null);
assert.ok(validHook('Le vote obligatoire est-il réalisable au Québec ?', { ...it, desc: it.desc + ' Québec' }));
assert.ok(!validHook('Le vote obligatoire réduirait l’abstention de 40 % !', it), 'chiffre inventé');
assert.ok(!validHook('Selon Legault, le vote obligatoire est réalisable.', it), 'nom inventé');
assert.ok(!validHook('« Une idée réalisable », dit le ministre du coin', it), 'citation');
const env = { CLOUDFLARE_AI_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'acc' };
const ok = await aiHook(it, { env, fetchImpl: async () => ({ ok: true, json: async () => ({ result: { response: '{"hook":"Le vote obligatoire, une idée réalisable ?","topic":"Politique"}' } }) }) });
assert.deepEqual(ok, { hook: null, topic: 'Politique' }, 'accroche qui paraphrase le titre : omise (6 nov.)');
assert.equal(await aiHook(it, { env, fetchImpl: async () => ({ ok: false, status: 429 }) }), null, 'quota → repli');
assert.equal(await aiHook(it, { env, fetchImpl: async () => { throw new Error('net'); } }), null);
console.log('social-hashtags : OK');
import { formatOk } from '../scripts/social/lib.mjs';
assert.ok(formatOk(buildBskyText(it, [], { credit: 'Jeanne Tremblay' }), it, 'Jeanne Tremblay'), 'ligne de hashtags tolérée par formatOk');
console.log('social-hashtags (formatOk) : OK');

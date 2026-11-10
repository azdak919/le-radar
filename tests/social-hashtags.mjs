// Hashtags par réseau, étiquettes Tumblr, IA désactivée sans secret.
import assert from 'node:assert/strict';
import { bskyTags, tumblrTags, topicOf, articleTags, tagLine, PLACES } from '../scripts/social/hashtags.mjs';
import { buildBskyText, facets, graphemes, BSKY_LIMIT, postRecord } from '../scripts/social/bluesky.mjs';
import { buildText, buildXText, xlen, DAILY_SLOTS } from '../scripts/social/lib.mjs';
import { buildPageText } from '../scripts/social/buffer-pages.mjs';
import { aiEnabled, aiHook, validHook } from '../scripts/social/ai-hook.mjs';

const it = { id: 'a', link: 'https://lapige.atmjonquiere.com/2026/11/02/vote-obligatoire-idee-realisable/', source: 'La Pige', author: 'Jeanne Tremblay',
  title: 'Vote obligatoire, idée réalisable ?', bare: 'Vote obligatoire, idée réalisable ?', desc: 'Aux dernières élections provinciales, 2 électeurs sur 3 ont voté. ' .repeat(3) };
assert.deepEqual(bskyTags(it), ['#CégepDeJonquière', '#Saguenay'], 'Bluesky : 2 hashtags, institution puis ville (La Pige : #Saguenay, plus #Québec générique)');
assert.deepEqual(bskyTags({ title: 'Rien de précis' }), [], 'source inconnue : aucun hashtag inventé, jamais #PresseÉtudiante ni #Actualités');
assert.deepEqual(articleTags({ source: 'Le Délit', title: 'x' }), ['#McGill', '#Montréal'], 'source montréalaise : institution puis ville');
assert.deepEqual(articleTags({ source: 'Impact Campus', title: 'Les Carabins gagnent au football' }), ['#ULaval', '#Football', '#Québec']);
assert.deepEqual(articleTags({ source: 'The Link', title: 'Stingers women’s hockey' }, 2), ['#Concordia', '#Hockey'], 'X : 2 hashtags, les plus spécifiques');
assert.deepEqual(articleTags({ source: 'The Link', title: 'x' }, 0), [], 'max 0 : aucun');
assert.equal(tagLine(it, 'facebook'), '#CégepDeJonquière');
assert.equal(tagLine(it, 'x').split(' ').length, 2);
assert.equal(tagLine(it, 'linkedin').split(' ').length, 3);
assert.equal(tagLine(it, 'mastodon'), '#CégepDeJonquière #Saguenay #Politique');
assert.equal(tagLine(it, 'bluesky').split(' ').length, 2);
for (const s of Object.keys(PLACES)) for (const n of ['bluesky', 'mastodon', 'x', 'linkedin']) {
  const l = tagLine({ source: s, title: 'x' }, n);
  assert.ok(l && !/PresseÉtudiante|Actualités/.test(l) && /#(Québec|Montréal|Ottawa|Saguenay|Sherbrooke|TroisRivières|McGill|Concordia|UdeM|UQAM|ULaval|UQTR|CégepDeJonquière|DawsonCollege|UdeS|BishopsU|uOttawa)/.test(l), `${s} ${n} : ${l}`);
}
const t = buildBskyText(it, [], { credit: 'Jeanne Tremblay' });
assert.ok(t.startsWith('Vote obligatoire, idée réalisable ?'), 'accroche (titre) en tête');
assert.ok(t.endsWith('#CégepDeJonquière #Saguenay') && graphemes(t) <= BSKY_LIMIT, t);
const tags = facets(t).filter(f => f.features[0].$type.endsWith('#tag')).map(f => f.features[0].tag);
assert.deepEqual(tags, ['CégepDeJonquière', 'Saguenay']);
const f0 = facets(t).find(f => f.features[0].tag === 'CégepDeJonquière'); const by = new TextEncoder().encode(t);
assert.equal(new TextDecoder().decode(by.slice(f0.index.byteStart, f0.index.byteEnd)), '#CégepDeJonquière');
assert.deepEqual(postRecord({ text: t, lang: 'fr' }).langs, ['fr']);
const long = { ...it, title: 'x'.repeat(400), bare: 'y '.repeat(200) };
assert.ok(graphemes(buildBskyText(long)) <= BSKY_LIMIT);
assert.equal(topicOf({ title: 'Carabins 4, Stingers 0' }).tag, 'Sport');
// Institution citée dans le texte : prioritaire sur celle de la source
assert.deepEqual(articleTags({ source: 'La Pige', title: 'Les étudiants de l’UQAC en grève pour la rémunération des stages', desc: 'Mouvement dans plusieurs villes du Québec.' }, 4), ['#UQAC', '#Saguenay', '#Éducation']);
assert.ok(!articleTags({ source: 'La Pige', title: 'Les étudiants de l’UQAC en grève pour la rémunération des stages' }).includes('#CégepDeJonquière'));
// « saison » ne suffit plus à déclencher #Sport ; ville déjà dans le titre : pas de doublon
assert.equal(topicOf({ source: 'La Pige', title: 'Une 20e saison positive pour le quai des croisières de La Baie', desc: 'La Baie accueille une multitude de visiteurs.' }) , null);
assert.deepEqual(articleTags({ source: 'The McGill Daily', title: "Montreal’s Poetic Autumn", desc: "Recent awards affirm the vitality of this city’s literary scene." }), ['#McGill', '#Culture']);
assert.ok(!articleTags({ source: 'The McGill Daily', title: "Montreal’s Poetic Autumn", desc: "literary scene" }).includes('#Montréal'), 'Montreal déjà dans le titre : #Montréal omis');
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
// buildText seul : aucun hashtag ; X, LinkedIn et Facebook : ligne ajoutée par buildXText / buildPageText (cfg.service)
const x = buildText(it, [], 280, { credit: '' }); assert.ok(!/#\p{L}/u.test(x) && x.trim().endsWith('le-radar.ca/' + x.trim().split('le-radar.ca/')[1]));
const xt = buildXText(it, [], { credit: '' }); assert.ok(xt.endsWith('\n#CégepDeJonquière #Saguenay') && xlen(xt) <= 280, xt);
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

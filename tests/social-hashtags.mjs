// Hashtags par réseau, étiquettes Tumblr, IA désactivée sans secret.
import assert from 'node:assert/strict';
import { bskyTags, tumblrTags, topicOf, articleTags, tagLine, PLACES, xArticleTags, xThematicFlags, xInstitutionTag } from '../scripts/social/hashtags.mjs';
import { buildBskyText, facets, graphemes, BSKY_LIMIT, postRecord } from '../scripts/social/bluesky.mjs';
import { buildText, buildXText, xlen, DAILY_SLOTS, sentences, cutExcerpt, stripCreditParens } from '../scripts/social/lib.mjs';
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
assert.equal(tagLine(it, 'x'), '#polqc #CégepDeJonquière #Saguenay');
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
const xt = buildXText(it, [], { credit: '' }); assert.ok(xt.endsWith('\n#polqc #CégepDeJonquière #Saguenay') && xlen(xt) <= 280, xt);
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

// X : mots-clics thématiques (liste fixe, titre + résumé), au plus 3 ; les autres réseaux inchangés
const carney = { source: 'Le Collectif', title: 'Rencontre Carney-PSPP au Cambodge',
  desc: 'Québec, Montréal ou Ottawa ? C’est finalement au Cambodge que le premier ministre canadien et le premier ministre québécois se sont rencontrés.' };
assert.deepEqual(xArticleTags(carney), ['#polcan', '#UdeS', '#polqc']);
assert.equal(tagLine(carney, 'linkedin'), '#UdeS #Sherbrooke #Politique', 'LinkedIn inchangé');
assert.equal(tagLine(carney, 'facebook'), '#UdeS', 'Facebook inchangé');
assert.deepEqual(bskyTags(carney), ['#UdeS', '#Sherbrooke'], 'Bluesky inchangé');
assert.ok(!xArticleTags(carney).includes('#PaysQc'));
assert.ok(!xArticleTags(carney).includes('#cdnpoli'), 'article FR : #polcan, jamais #cdnpoli en plus');
assert.equal(xArticleTags(carney)[1], '#UdeS', 'établissement en 2e place');
const budget = { source: 'Le Collectif', lang: 'fr', title: 'Mark Carney dévoile ses ambitions économiques',
  desc: 'François-Philippe Champagne, ministre des Finances du Canada, a déposé le plus récent budget du gouvernement canadien.' };
assert.deepEqual(xArticleTags(budget), ['#polcan', '#UdeS', '#Sherbrooke']);
assert.ok(!xArticleTags(budget).includes('#cdnpoli'));
const loi = { source: 'Le Collectif', title: 'Un projet de loi déposé à l’Assemblée nationale', desc: 'Le salon Bleu examine le texte en commission parlementaire.' };
assert.deepEqual(xArticleTags(loi), ['#polqc', '#UdeS', '#assnat']);
const rseq = { source: 'The Concordian', title: 'Stingers clinch final playoff spot', desc: 'Concordia secured the fourth seed in the RSEQ conference.' };
assert.deepEqual(xArticleTags(rseq), ['#RSEQ', '#Concordia', '#USports']);
const vanier = { source: 'Impact Campus', title: 'Le Rouge et Or en finale de la Coupe Vanier', desc: 'Laval affrontera les Carabins pour la Vanier Cup.' };
assert.deepEqual(xArticleTags(vanier), ['#VanierCup', '#ULaval', '#USports']);
const cegep = { source: 'La Pige', title: 'Des étudiants du Cégep de Jonquière à la COP', desc: 'Trois étudiants du Cégep de Jonquière et leur enseignant se sont rendus à la conférence.' };
assert.deepEqual(xArticleTags(cegep), ['#cégep', '#CégepDeJonquière', '#Saguenay']);
const campus = { source: 'La Rotonde', title: 'Nouvelle expo sur le campus', desc: 'Les étudiants de l’Université d’Ottawa exposent leurs œuvres.' };
assert.ok(!xThematicFlags(campus).federal, 'campus à Ottawa : pas de #polcan');
assert.deepEqual(xArticleTags(campus), articleTags(campus, 3));
assert.ok(xArticleTags(carney).length <= 3);

// 1. Un seul tag fédéral, selon la langue
const avi = { source: 'The Concordian', lang: 'en',
  title: 'Avi Lewis calls Carney’s policies a “terrifying concentration of power” at byelection campaign event in Montreal',
  desc: 'At a rally in Montreal on Tuesday, NDP Leader Avi Lewis spoke about his worries concerning Carney’s recent policies.' };
assert.deepEqual(xArticleTags(avi), ['#cdnpoli', '#Concordia']);
assert.ok(!xArticleTags(avi).includes('#polcan'), 'article EN : #cdnpoli seulement');
assert.ok(!xArticleTags({ ...budget, lang: 'en' }).includes('#polcan'));
assert.deepEqual(xArticleTags({ ...budget, lang: 'en' }).filter(t => t === '#cdnpoli' || t === '#polcan'), ['#cdnpoli']);

// 2–3. Titre péquiste : #polqc seulement, même si l'extrait nomme Carney ; établissement en 2e
const pq = { source: 'Le Collectif', lang: 'fr',
  title: 'Analyse : la communication politique du Parti québécois',
  desc: 'Il y a 46 jours, en date du 20 novembre, le Parti québécois a été porté au pouvoir à la tête d’un gouvernement minoritaire. Depuis, plusieurs dossiers ont fait les manchettes : la prise de bec entre le premier ministre du Canada, Mark Carney, et le premier ministre du Québec.' };
assert.deepEqual(xArticleTags(pq), ['#polqc', '#UdeS', '#Sherbrooke']);
assert.ok(!xThematicFlags(pq).federal, 'titre PQ : un Carney dans l’extrait ne déclenche pas #polcan');
assert.equal(xArticleTags(carney)[0], '#polcan', 'titre Carney-PSPP : le premier nommé au titre mène');
assert.deepEqual(xArticleTags(carney), ['#polcan', '#UdeS', '#polqc']);

// 4. Surnom d'équipe : Vert & Or → #UdeS, pas l'adversaire (Stingers/Concordia) plus loin ; autres réseaux inchangés
const vert = { source: 'Le Collectif', lang: 'fr',
  title: 'Toujours pas de football éliminatoire à Sherbrooke cette année',
  desc: 'Pour une 3e saison consécutive, les joueurs du Vert & Or agiront à titre de spectateurs à l’occasion des séries éliminatoires du RSEQ. Sherbrooke est mathématiquement éliminé après cette défaite du 24 octobre dernier face aux Stingers de Concordia, où l’équipe s’est inclinée par 40-14.' };
assert.equal(xInstitutionTag(vert), '#UdeS');
assert.deepEqual(xArticleTags(vert), ['#RSEQ', '#UdeS', '#USports']);
assert.ok(!xArticleTags(vert).includes('#Concordia'));
assert.ok(articleTags(vert, 3).includes('#Concordia'), 'autres réseaux : l’ancien choix (adversaire dans l’extrait) reste, à corriger ailleurs');
assert.equal(tagLine(vert, 'facebook'), articleTags(vert, 1).join(' '));
assert.equal(xInstitutionTag({ source: 'The Campus', title: 'Gaiters Women’s Soccer: A Season to Remember', desc: 'Sunday, Oct. 25, 2026 saw the Gaiters win.' }), '#BishopsU');
assert.equal(xInstitutionTag({ source: 'The Link', title: 'Carabins 4, Stingers 0: Stingers lose in their home opener', desc: 'The Concordia University Stingers lost.' }), '#Concordia', 'plusieurs équipes au titre : l’école du média si elle y figure');

// 5. Abréviations : ne pas couper l'extrait X sur « Oct. »
const sting = { source: 'The Concordian', lang: 'en', link: 'https://theconcordian.com/2026/11/stingers-clinch-final-playoff-spot-despite-ongoing-coaching-search',
  title: 'Stingers clinch final playoff spot despite ongoing coaching search',
  bare: 'Stingers clinch final playoff spot despite ongoing coaching search',
  desc: 'After defeating Bishop’s on Oct. 31, Concordia secured the fourth seed in the RSEQ conference as well as the final playoff spot.' };
assert.deepEqual(sentences(sting.desc, { abbr: true }).length, 1, 'Oct. 31 n’est pas une fin de phrase');
assert.ok(sentences(sting.desc).length > 1, 'sans l’option X, l’ancien découpage reste (autres réseaux)');
const xtSting = buildXText(sting, [], { credit: '' });
assert.ok(!/on Oct\.\s*$/m.test(xtSting.split('\n#')[0].trim()), `pas de coupe sur Oct. : ${xtSting}`);
assert.ok(/Oct\. 31/.test(xtSting) || /…/.test(xtSting), xtSting);
// 6. Parentheses de crédit : retirées sur X seulement
const cop = { source: 'La Pige', lang: 'fr', link: 'https://lapige.atmjonquiere.com/x/',
  title: 'Des étudiants du Cégep de Jonquière à « la COP qui chie »',
  bare: 'Des étudiants du Cégep de Jonquière à « la COP qui chie »',
  desc: 'Mercredi, les étudiants du Cégep de Jonquière ont pu joindre la délégation pour une conférence sur les enjeux de la COP. (Facebook) Depuis dimanche, trois étudiants du Cégep de Jonquière et leur enseignant se sont rendus à Antalya.' };
assert.equal(stripCreditParens(cop.desc).includes('(Facebook)'), false);
assert.ok(!/\(Facebook\)/i.test(buildXText(cop, [], { credit: '' })), buildXText(cop, [], { credit: '' }));
assert.ok(/\(Facebook\)/i.test(buildText(cop, [], 280, { credit: '' })), 'buildText (autres réseaux) conserve (Facebook)');
const oss = { source: 'Le Collectif', title: 'Bruno Pelletier et l’OSS réunis pour un grand concert de Noël',
  desc: 'L’Orchestre symphonique de Sherbrooke (OSS) invite la population estrienne à célébrer le début du temps des Fêtes en musique.' };
assert.ok(/\(OSS\)/.test(buildXText(oss, [], { credit: '' })), 'sigle utile conservé');
assert.ok(/Ottawa \?/.test(buildXText(carney, [], { credit: '' })), 'espace fine/typographique avant ? conservée');
assert.equal(stripCreditParens('Québec, Montréal ou Ottawa ? C’est finalement au Cambodge.'), 'Québec, Montréal ou Ottawa ? C’est finalement au Cambodge.');

// 7. Casse exacte des formes les plus fréquentes
const FORMS = ['#polqc', '#polcan', '#cdnpoli', '#assnat', '#cégep', '#RSEQ', '#USports', '#VanierCup'];
for (const tags of [xArticleTags(carney), xArticleTags(budget), xArticleTags(avi), xArticleTags(pq), xArticleTags(loi), xArticleTags(rseq), xArticleTags(vanier), xArticleTags(cegep), xArticleTags(vert)]) {
  for (const tag of tags) {
    const canon = FORMS.find(f => f.toLocaleLowerCase('fr') === tag.toLocaleLowerCase('fr'));
    if (canon) assert.equal(tag, canon, `casse : ${tag}`);
  }
  assert.ok(!tags.some(t => t === '#cegep' || t === '#Cégep' || t === '#USPORTS' || t === '#PolQc' || t === '#PolCan' || t === '#Cdnpoli'));
}

console.log('social-hashtags (X thématiques) : OK');
import { formatOk } from '../scripts/social/lib.mjs';
assert.ok(formatOk(buildBskyText(it, [], { credit: 'Jeanne Tremblay' }), it, 'Jeanne Tremblay'), 'ligne de hashtags tolérée par formatOk');
console.log('social-hashtags (formatOk) : OK');

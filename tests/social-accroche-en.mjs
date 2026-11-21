// Accroche des articles anglophones (scripts/social/accroche-en.mjs) : éteinte par défaut, citation exacte,
// métadonnées hors IA, chiffres et dates vérifiés, limites X / Bluesky, formatOk, repli au format actuel.
import assert from 'node:assert/strict';
import {
  enAccrocheEnabled, findVerbatim, quoteReject, phraseReject, enAccrocheDetail, withEnAccroche, articleTextFromHtml,
  deInstitution, aiText, _resetForTests, EN_NETWORKS,
} from '../scripts/social/accroche-en.mjs';
import { buildXText, buildTagged, formatOk, siteLink, xlen, enAccrocheText, EN_MARK } from '../scripts/social/lib.mjs';
import { buildBskyText, graphemes } from '../scripts/social/bluesky.mjs';

const BODY = `Montreal's police response to the Nov. 13 student protest came under scrutiny at a city council meeting on Nov. 16, where opposition councillors and citizens questioned the use of force.

Montreal police said in an email that “the SPVM does not compile this type of data (injured protesters).”

Three students were arrested, according to witnesses.

Opposition councillors asked the administration to explain the tactics used by officers during the march, and several citizens described what they had seen near the downtown campus that evening, from kettling to the use of irritants against the crowd.`;
const it = { id: 'l1', source: 'The Link', author: 'Nicolas Tremblay', institution: 'Concordia University', lang: 'en',
  title: 'Will Montreal learn from New York about protest and police?', bare: 'Will Montreal learn from New York about protest and police?',
  link: 'https://thelinknewspaper.ca/article/will-montreal-learn', desc: 'Montreal’s police response to the Nov. 13 student protest came under scrutiny.' };
const src = { text: BODY, from: 'page' };
const env = { CLOUDFLARE_AI_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' };
const PHRASE = 'revient sur la répression policière lors de la manifestation du 13 novembre et sur la séance du conseil municipal du 16 novembre.';
const QUOTE = 'Montreal police said in an email that "the SPVM does not compile this type of data (injured protesters)."';
const reply = (obj, shape = 'openai') => async () => ({ ok: true, json: async () => (shape === 'openai'
  ? { result: { choices: [{ message: { content: '```json\n' + JSON.stringify(obj) + '\n```' } }], usage: { prompt_tokens: 900, completion_tokens: 80 } } }
  : { result: { response: JSON.stringify(obj) } }) });

// Interrupteur : éteint par défaut (policy.json), allumé seulement explicitement.
assert.equal(enAccrocheEnabled({}), false, 'éteint par défaut (policy.json)');
assert.equal(enAccrocheEnabled({}, { automation: {} }), false);
assert.equal(enAccrocheEnabled({}, { automation: { ai_en_accroche: true } }), true);
assert.equal(enAccrocheEnabled({ SOCIAL_AI_EN_ACCROCHE: 'off' }, { automation: { ai_en_accroche: true } }), false);
assert.equal(enAccrocheEnabled({ SOCIAL_AI_EN_ACCROCHE: 'on' }), true);
assert.ok(!EN_NETWORKS.has('mastodon'), 'jamais sur Mastodon');

// Citation : sous-chaîne ORIGINALE (guillemets typographiques de la source), mots entiers seulement.
assert.equal(findVerbatim(QUOTE, BODY), 'Montreal police said in an email that “the SPVM does not compile this type of data (injured protesters).”');
assert.equal(findVerbatim('Montreal police said in an email that the SPVM does not compile', BODY), null, 'guillemet retiré = pas identique');
assert.equal(findVerbatim('police said in an e-mail', BODY), null, 'mot changé');
assert.equal(findVerbatim('ontreal police said', BODY), null, 'coupé au milieu d’un mot');
assert.equal(findVerbatim('Three  students were\narrested', BODY), 'Three students were arrested', 'espaces seulement');
assert.match(quoteReject('Three students were', BODY).why, /car\./);
assert.match(quoteReject('the SPVM does not compile this type of data', BODY).why, /phrase entière/, 'fragment refusé');
assert.equal(quoteReject('Three students were arrested, according to witnesses.', BODY).why, null);
assert.equal(quoteReject('Police said the SPVM keeps detailed records of injured protesters.', BODY).why, 'citation introuvable telle quelle dans l’article');

// Phrase : chiffres, nombres écrits, mois, jours, noms propres présents dans la source.
const S = `${it.title}\n${BODY}\nThe Link Nicolas Tremblay Concordia University Université Concordia`;
assert.equal(phraseReject(PHRASE, S, it), null);
assert.match(phraseReject('revient sur la manifestation du 14 novembre et ses suites au conseil municipal.', S, it), /chiffre absent de la source \(14\)/);
assert.match(phraseReject('revient sur la manifestation de mars et ses suites au conseil municipal de la ville.', S, it), /mois absent/);
assert.match(phraseReject('revient sur les cinq étudiants arrêtés lors de la manifestation contre la police.', S, it), /nombre absent de la source \(cinq\)/);
assert.equal(phraseReject('revient sur les trois étudiants arrêtés lors de la manifestation contre la police.', S, it), null, '« trois » = « Three »');
assert.match(phraseReject('revient sur la manifestation de lundi et sur la réponse de la police de Montréal.', S, it), /jour absent/);
assert.match(phraseReject('revient sur la manifestation d’hier et sur la réponse de la police à Montréal.', S, it), /date relative/);
assert.match(phraseReject('revient sur la réponse de Valérie Plante à la manifestation étudiante en ville.', S, it), /nom absent de la source \(Valérie\)/);
assert.match(phraseReject('revient sur la manifestation et sur la séance où le SPVM a été critiqué par le GRC.', S, it), /nom absent de la source \(GRC\)/);
assert.match(phraseReject('Revient sur la manifestation étudiante et la réponse de la police de Montréal.', S, it), /minuscule/);
assert.match(phraseReject('looks back at the student protest and the police response in the city.', S, it), /verbe|français/);
assert.match(phraseReject('annonce un partenariat entre la police et le conseil municipal de la ville.', S, it), /verbe d'ouverture/, 'le média n’annonce rien');
assert.match(phraseReject('interroge les étudiants sur la manifestation et la réponse de la police.', S, it), /verbe d'ouverture/);
assert.match(phraseReject('revient sur la manifestation à Québec et la réponse de la police.', S, it), /nom absent de la source \(Québec\)/, 'lieu absent');
assert.equal(phraseReject('s’intéresse à la manifestation étudiante et à la réponse de la police.', S, it), null, '« s’intéresse à » accepté');
assert.equal(phraseReject('revient sur la manifestation à Montréal et la réponse de la police.', S, it), null, 'Montréal = Montreal');
assert.match(phraseReject('revient sur la manifestation couverte par The Link et la réponse de la police.', S, it), /répète/);

// Établissement en français (métadonnées, jamais l'IA).
assert.equal(deInstitution('Concordia University'), 'de l’Université Concordia');
assert.equal(deInstitution('Dawson College'), 'du Collège Dawson');
assert.equal(deInstitution("Bishop's University"), 'de l’Université Bishop’s');
assert.equal(aiText({ result: { response: 'x' } }), 'x');
assert.ok(enAccrocheText({ ...it, author: 'Olivia Epstein', enAccroche: { phrase: 'analyse la série.', institutionFr: '' } }, [], 300, { photo: false }).includes('sous la plume d’Olivia Epstein, analyse'), 'élision');

// Appel IA simulé : les deux formats de réponse Workers AI.
for (const shape of ['openai', 'response']) {
  const r = await enAccrocheDetail(it, { env, source: src, fetchImpl: reply({ citation: QUOTE, phrase: PHRASE }, shape) });
  assert.equal(r.reason, null, shape);
  assert.equal(r.quote, 'Montreal police said in an email that “the SPVM does not compile this type of data (injured protesters).”');
  assert.equal(r.institutionFr, 'de l’Université Concordia');
}
const multi = await enAccrocheDetail(it, { env, source: src, fetchImpl: reply({ citations: ['Police admitted everything.', QUOTE, 'Three students were arrested, according to witnesses.'], phrase: PHRASE }) });
assert.equal(multi.quote, 'Three students were arrested, according to witnesses.', 'la plus courte des citations exactes');
assert.match((await enAccrocheDetail(it, { env, source: { text: BODY, from: 'extrait' }, fetchImpl: reply({ citation: QUOTE, phrase: PHRASE }) })).reason, /illisible/, 'extrait seul : pas d’accroche');
const inv = await enAccrocheDetail(it, { env, source: src, fetchImpl: reply({ citation: 'Police admitted they used excessive force on Nov. 13.', phrase: PHRASE }) });
assert.equal(inv.reason, null); assert.equal(inv.quote, '', 'citation inventée → pas de citation');
const bad = await enAccrocheDetail(it, { env, source: src, fetchImpl: reply({ citation: QUOTE, phrase: 'revient sur les 40 blessés de la manifestation et la séance du conseil municipal.' }) });
assert.match(bad.reason, /garde-fou : chiffre absent de la source \(40\)/);
assert.match((await enAccrocheDetail(it, { env, source: src, fetchImpl: async () => ({ ok: false, status: 429 }) })).reason, /quota/);
assert.match((await enAccrocheDetail(it, { env, source: src, fetchImpl: async () => { throw new Error('x'); } })).reason, /échec/);
assert.equal((await enAccrocheDetail({ ...it, lang: 'fr' }, { env, source: src, fetchImpl: reply({}) })).reason, 'article pas en anglais');
assert.equal((await enAccrocheDetail(it, { env: {}, source: src })).reason, 'Workers AI non configuré');

// withEnAccroche : rien si éteint, sur Mastodon ou en français ; posé si tout passe.
_resetForTests();
const fx = reply({ citation: QUOTE, phrase: PHRASE });
let a = { ...it }; await withEnAccroche(a, 'x', { env, source: src, fetchImpl: fx }); assert.equal(a.enAccroche, undefined, 'éteint par défaut');
a = { ...it }; await withEnAccroche(a, 'mastodon', { env: { ...env, SOCIAL_AI_EN_ACCROCHE: 'on' }, source: src, fetchImpl: fx }); assert.equal(a.enAccroche, undefined);
a = { ...it, id: 'fr', lang: 'fr' }; await withEnAccroche(a, 'x', { env: { ...env, SOCIAL_AI_EN_ACCROCHE: 'on' }, source: src, fetchImpl: fx }); assert.equal(a.enAccroche, undefined);
a = { ...it }; await withEnAccroche(a, 'x', { env: { ...env, SOCIAL_AI_EN_ACCROCHE: 'on' }, source: src, fetchImpl: fx }); assert.ok(a.enAccroche?.phrase);

// Mise en forme : X 280 (xlen), Bluesky 300 graphèmes, formatOk, lien vers la fiche, « (En anglais) ».
const acc = [{ type: 'source', cle_flux: 'The Link', handle: '@Linknewspaper' }];
const short = { ...a, enAccroche: { ...a.enAccroche, quote: 'Three students were arrested, according to witnesses.', phrase: 'revient sur la répression policière lors de la manifestation du 13 novembre.' } };
const x = buildXText(short, acc, { credit: 'Cléo Clamen', photo: true, ai: true });
assert.ok(xlen(x) <= 280, `X ${xlen(x)}`);
assert.ok(x.startsWith('« Three students were arrested, according to witnesses. »'), x);
assert.ok(/The Link \(@Linknewspaper\), (média étudiant de l’Université Concordia, )?sous la plume de Nicolas Tremblay, revient sur/.test(x), 'établissement omis seulement s’il ne tient pas');
assert.ok(x.split('\n').includes(EN_MARK) && x.split('\n').includes(siteLink(it)) && !x.includes(it.link));
assert.ok(formatOk(x, short, 'Cléo Clamen'));
const b = buildBskyText(short, [], { credit: 'Cléo Clamen', photo: true });
assert.ok(graphemes(b) <= 300 && b.includes(EN_MARK) && formatOk(b, short, 'Cléo Clamen'), b);
assert.ok(b.startsWith('« Three students') && b.includes('The Link, média étudiant de l’Université Concordia, sous la plume de Nicolas Tremblay, revient sur'), b);
// Citation trop longue pour X : sans hashtags d'abord, puis sans citation, jamais coupée.
const xl = buildXText(a, acc, { credit: 'Cléo Clamen', photo: true, ai: true });
assert.ok(xlen(xl) <= 280 && xl.includes(EN_MARK) && formatOk(xl, a, 'Cléo Clamen'), xl);
assert.ok(!xl.includes('«') || xl.includes(`« ${a.enAccroche.quote} »`), 'citation entière ou absente');
// Rien ne tient (phrase énorme) : format actuel.
const huge = { ...a, enAccroche: { quote: '', phrase: 'revient sur ' + 'la manifestation '.repeat(30) + '.', institutionFr: 'de l’Université Concordia' } };
assert.equal(enAccrocheText(huge, acc, 280, { credit: '', photo: false }), '');
const fb = buildXText(huge, acc, { credit: '', photo: false, ai: true });
assert.ok(!fb.includes(EN_MARK) && fb.startsWith(it.bare), 'repli au format actuel');
// Sans `ai` (Mastodon, piaille.fr) : jamais l'accroche.
assert.ok(!buildTagged(short, [], 500, { credit: 'Cléo Clamen', photo: true, link: true, ai: false }, '#Montréal', '\n\n').includes(EN_MARK), 'ai: false (Mastodon) → format actuel');

// Corps de l'article : jamais les cartes « articles liés » placées avant le contenu.
const html = `<div class="cs-entry__inner cs-entry__content"><p>Another article teaser that must never be quoted in this post at all.</p><p>Second teaser paragraph from a related story, also excluded.</p></div>
<div class="entry-content"><p>Real first paragraph of the article, long enough to be kept as text.</p><p>Real second paragraph of the article, with a quote worth sharing.</p></div><form id="commentform"><p>Required fields are marked with an asterisk below.</p></form>`;
const t = articleTextFromHtml(html);
assert.ok(t.startsWith('Real first paragraph') && !t.includes('teaser') && !t.includes('Required'), t);
console.log('social-accroche-en : OK');

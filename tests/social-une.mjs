// « La une du matin / du soir » : créneaux (heure d'été et d'hiver), porte idempotente, sélection et anti-doublon, signatures, textes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as U from '../scripts/social/une-lib.mjs';
import { gate, pruneState, CFG } from '../scripts/social/une-run.mjs';
import { NET_SPEC } from '../scripts/social/formats.mjs';
import { POLICY } from '../scripts/social/policy.mjs';

// ── Créneaux : 7 h 45 et 19 h 30 heure de Montréal, été comme hiver ──
assert.equal(U.slotAt(Date.parse('2026-11-13T12:45:00Z'))?.id, 'matin');       // 7 h 45 HNE
assert.equal(U.slotAt(Date.parse('2026-07-13T11:45:00Z'))?.id, 'matin');       // 7 h 45 HAE
assert.equal(U.slotAt(Date.parse('2026-11-13T11:45:00Z')), null);              // 6 h 45 HNE : trop tôt
assert.equal(U.slotAt(Date.parse('2026-11-13T15:31:00Z')), null);              // 10 h 31 : fenêtre close
const soir = U.slotAt(Date.parse('2026-11-14T00:35:00Z'));                    // 19 h 35 HNE le 13
assert.equal(soir.id, 'soir'); assert.equal(soir.key, '2026-11-13:soir');
assert.equal(U.slotAt(Date.parse('2026-07-13T23:35:00Z'))?.id, 'soir');        // 19 h 35 HAE
assert.equal(U.slotAt(Date.parse('2026-11-14T03:31:00Z')), null);              // 22 h 31 : fenêtre close
assert.deepEqual(U.previousKeys(U.slotFor('matin', Date.parse('2026-11-13T12:45:00Z'))), ['2026-11-12:soir', '2026-11-12:matin']);
assert.deepEqual(U.previousKeys(soir), ['2026-11-13:matin', '2026-11-12:soir']);
// Réglages publiés : 6 réseaux, cibles 7 h 45 et 19 h 30.
assert.equal(CFG.publish, true);
assert.deepEqual([...CFG.networks].sort(), [...U.NETS].sort());
assert.equal(CFG.slots.matin.target, '07:45'); assert.equal(CFG.slots.soir.target, '19:30');

// ── Porte idempotente : une seule publication par réseau et par créneau ──
const t = Date.parse('2026-11-13T12:50:00Z');
assert.equal(gate({ now: t, state: {} }).due, true);
const done = Object.fromEntries(U.NETS.map(n => [n, { at: 'x', url: 'u' }]));
assert.equal(gate({ now: t, state: { '2026-11-13:matin': { nets: done } } }).due, false);
assert.equal(gate({ now: t, state: { '2026-11-13:matin': { nets: { ...done, x: { failed: true, attempts: 1 } } } } }).due, true, 'réseau en échec : réessai');
assert.equal(gate({ now: t, state: { '2026-11-13:matin': { nets: { ...done, x: { failed: true, attempts: 3 } } } } }).due, false, '3 échecs : abandon');
assert.equal(gate({ now: Date.parse('2026-11-13T17:00:00Z'), state: {} }).due, false, 'midi : hors créneau');
assert.equal(gate({ now: Date.parse('2026-11-13T17:00:00Z'), state: {}, forced: 'soir' }).due, true, 'manuel');
assert.equal(U.slotDone({ skipped: true }), true);
const pr = pruneState({ _doc: 'd', '2026-10-01:matin': {}, '2026-11-12:soir': {} }, Date.parse('2026-11-13T12:00:00Z'));
assert.deepEqual(Object.keys(pr), ['_doc', '2026-11-12:soir']);

// ── Signatures : tous les auteurs, sinon le média seul ──
assert.equal(U.byline({ author: 'Nathan Brisbois et Elora Veyron-Churlet', source: 'Quartier Libre' }), 'Nathan Brisbois et Elora Veyron-Churlet · Quartier Libre');
assert.equal(U.byline({ author: '', source: 'Impact Campus' }), 'Impact Campus');
assert.equal(U.byline({ author: 'Impact Campus', source: 'Impact Campus' }), 'Impact Campus');

// ── Sélection : une du jour, sport pro exclu, anti-doublon, le soir = nouveautés du jour ──
const T0 = Date.parse('2026-11-13T23:40:00Z'); // 18 h 40 le 13
const art = (n, iso, extra = {}) => ({ source: 'Quartier Libre', institution: 'Université de Montréal', title: `Article ${n} sur la vie étudiante`, link: `https://quartierlibre.ca/a-${n}/`, author: `Autrice ${n} Tremblay`, date: iso, image: `https://quartierlibre.ca/${n}.jpg`, ...extra });
const news = { updated: '2026-11-13T23:30:00Z', items: [
  art(1, '2026-11-13T22:00:00Z'), art(2, '2026-11-13T20:00:00Z'), art(3, '2026-11-13T13:00:00Z'),
  art(4, '2026-11-13T01:00:00Z'), // 12 nov. au soir, heure de Montréal
  art(5, '2026-11-13T21:00:00Z', { title: 'Les Alouettes gagnent la Coupe Grey' }),
] };
const idOf = n => U.selectUne({ updated: news.updated, items: [art(n, '2026-11-13T22:00:00Z')] }, U.slotFor('matin', T0), { now: T0 }).ids[0];
const m = U.selectUne(news, U.slotFor('matin', T0), { now: T0 });
assert.equal(m.skip, false); assert.ok(!m.items.some(x => /Alouettes/.test(x.title)), 'sport pro exclu');
assert.equal(m.items.length, 4); assert.equal(m.items[0].title, 'Article 1 sur la vie étudiante');
const sSlot = U.slotFor('soir', T0);
const s1 = U.selectUne(news, sSlot, { now: T0, state: { '2026-11-13:matin': { ids: [idOf(3), idOf(2)] } } });
assert.deepEqual(s1.ids, [idOf(1)], 'soir : seulement la nouveauté du jour (ni le matin, ni la veille)');
const s2 = U.selectUne(news, sSlot, { now: T0, state: { '2026-11-13:matin': { ids: [idOf(1), idOf(2), idOf(3)] } } });
assert.equal(s2.skip, true, 'rien de nouveau : on saute'); assert.match(s2.why, /sautée/);
const mNext = U.selectUne(news, U.slotFor('matin', Date.parse('2026-11-14T12:45:00Z')), { now: Date.parse('2026-11-14T12:45:00Z'), state: { '2026-11-13:soir': { ids: m.ids } } });
assert.ok(!mNext.ids.some(id => m.ids.includes(id)), 'le matin ne reprend pas la veille au soir');
assert.ok(U.selectUne({ ...news, updated: '2026-11-13T10:00:00Z' }, sSlot, { now: T0 }).doubts.length, 'news.json périmé : doute');
// Image : la une est le premier article AVEC photo.
const noImg = U.selectUne({ updated: news.updated, items: [art(7, '2026-11-13T22:30:00Z', { image: '' }), art(8, '2026-11-13T22:00:00Z')] }, sSlot, { now: T0 });
assert.equal(noImg.items[0].title, 'Article 8 sur la vie étudiante');

// ── Textes : limites, liens, auteurs, aucun @, jamais « week-end » ──
const real = JSON.parse(fs.readFileSync(new URL('../news.json', import.meta.url)));
const items = m.items.map((x, i) => ({ ...x, title: i === 0 ? 'Un titre très long '.repeat(12).trim() : x.title }));
for (const model of [{ slot: sSlot, items: m.items }, { slot: sSlot, items }, { slot: U.slotFor('matin', T0), items: m.items.slice(0, 1) }]) {
  const all = U.buildUneAll(model, POLICY.hashtags.maxByNetwork);
  for (const n of U.NETS) {
    const v = all[n];
    assert.ok(v.text, `${n} : texte`); assert.deepEqual(v.problems, [], `${n} : ${v.problems}`);
    assert.ok(NET_SPEC[n].len(v.text) <= NET_SPEC[n].limit, `${n} : limite`);
    assert.match(v.text, /https:\/\/le-radar\.ca\//); assert.doesNotMatch(v.text, /(^|\s)@\w/); assert.doesNotMatch(v.text, /week-?end/i);
    assert.match(v.text, /Tremblay/, `${n} : auteur`);
    assert.match(v.text, /^(☀️|🌙) La une du (matin|soir) du Radar · /);
    if (n !== 'tumblr') assert.ok(v.tags.length <= POLICY.hashtags.maxByNetwork[n]);
  }
  assert.equal(all.facebook.image, 'portrait'); assert.equal(all.x.image, 'portrait'); assert.equal(all.instagram.image, 'portrait + story');
  assert.match(all.mastodon.text, /https:\/\/le-radar\.ca\/article\/[0-9a-f]{16}\//, 'Mastodon : lien de la fiche');
  assert.ok(U.altText(model).length <= 1000);
}
assert.ok(U.checkUneText('🌙 La une du soir · Bonne fin de semaine ! https://le-radar.ca/ week-end', 'mastodon', { items: [{ title: 'La une du soir' }] }).some(p => /week-end/.test(p)));
assert.ok(U.checkUneText('🌙 La une du soir @quelquun https://le-radar.ca/', 'mastodon', { items: [{ title: 'La une du soir' }] }).some(p => /@/.test(p)));
assert.deepEqual(U.uneTags([{ tag: '#UdeM' }, { tag: '#McGill' }], 2), ['#MédiasÉtudiants', '#Québec']);
assert.deepEqual(U.uneTags([{ tag: '#UdeM' }], 4), ['#MédiasÉtudiants', '#UdeM', '#Québec']);
assert.ok(U.uneTumblrTags(m.items).length <= 15);
// Le vrai fil passe aussi les contrôles (pas de régression sur des données réelles).
const live = U.selectUne(real, U.slotFor('soir', Date.parse(real.updated)), { now: Date.parse(real.updated) });
if (!live.skip) for (const [n, v] of Object.entries(U.buildUneAll({ slot: U.slotFor('soir', Date.parse(real.updated)), items: live.items }, POLICY.hashtags.maxByNetwork))) assert.deepEqual(v.problems, [], `réel ${n}`);


// ── Français seulement : traduction par translate.js (injectée), exclusion si échec ──
const enItem = (id, title, extra = {}) => ({ id, title, hook: '', lang: 'en', byline: 'Jane Doe · The Link', source: 'The Link', ...extra });
const fakeTr = async t => ({ 'Stingers win the home opener this weekend': 'Les Stingers gagnent leur premier match à domicile ce week-end.', 'Students rally for housing': 'Les étudiants manifestent pour le logement' })[t] || '';
const fr = await U.frenchOnly([
  enItem('a', 'Stingers win the home opener this weekend'),
  enItem('b', 'Students rally for housing', { hook: 'The rally drew hundreds of students to the campus.' }),
  enItem('c', 'Untranslatable headline for the students'),
  { id: 'd', title: 'Un titre déjà en français pour la fin de semaine', lang: 'fr', byline: 'Impact Campus' },
], fakeTr);
assert.deepEqual(fr.kept.map(x => x.id), ['a', 'b', 'd']);
assert.equal(fr.kept[0].title, 'Les Stingers gagnent leur premier match à domicile cette fin de semaine', '« week-end » → « fin de semaine », point final retiré');
assert.equal(fr.kept[0].byline, 'Jane Doe · The Link', 'auteur et média inchangés');
assert.equal(fr.kept[1].hook, '', 'résumé non traduit : retiré, jamais publié en anglais');
assert.deepEqual(fr.excluded.map(x => x.id), ['c'], 'traduction impossible : article exclu');
const echo = await U.frenchOnly([enItem('e', 'Students rally for housing')], async t => t);
assert.equal(echo.kept.length, 0, 'écho de l’original : exclu');
const boom = await U.frenchOnly([enItem('f', 'Students rally for housing')], async () => { throw new Error('réseau'); });
assert.equal(boom.kept.length, 0, 'erreur réseau : exclu');
const stillEn = await U.frenchOnly([enItem('g', 'Students rally for housing')], async () => 'The students rally for the housing in the city');
assert.equal(stillEn.kept.length, 0, 'encore anglais : exclu');
assert.deepEqual(U.finalizeItems([{ id: 1 }, { id: 2, siteImage: 'x' }, { id: 3 }], 2).map(x => x.id), [2, 1]);
// Établissements en français, aucune étiquette anglaise ; émojis de sport étudiant.
assert.equal(U.institutionLabel({ institution: 'Concordia University' }), 'Université Concordia');
assert.equal(U.institutionLabel({ institution: "Bishop's University" }), "Université Bishop's");
assert.equal(U.institutionLabel({ institution: 'Cégep de Jonquière (ATM – journalisme)' }), 'Cégep de Jonquière');
assert.equal(U.institutionLabel({ institution: 'Some Unknown College' }), '');
assert.equal(U.sportEmoji({ title: 'Le Rouge et Or remporte la Coupe Vanier' }), '🏈');
assert.equal(U.sportEmoji({ title: 'Victoire des Carabins au hockey' }), '🏒');
assert.equal(U.sportEmoji({ title: 'Une pièce de théâtre' }), '');
const sportText = U.buildUneText({ slot: sSlot, items: [{ ...m.items[0], sport: '🏒' }] }, 'x');
assert.match(sportText, /🏒 /, 'émoji de sport dans le texte');

// ── Résultats sportifs étudiants (sports-masthead.json) : récents, dédoublonnés, rien d'inventé ──
const team = (o) => ({ sport: 'basketball', sportLabel: 'Basketball', sex: 'F', sector: 'universitaire', leagueLabel: 'Basketball universitaire féminin', results: [], nextGames: [], ...o });
const mh = { teams: {
  a: team({ id: 'a', nickname: 'Stingers', institutionLabel: 'Université Concordia', results: [{ gameId: 'g1', date: '2026-11-11', scoreFor: 55, scoreAgainst: 54, opponentNickname: 'Martlets', opponentFullName: 'Université McGill' }, { gameId: 'old', date: '2026-11-01', scoreFor: 1, scoreAgainst: 0, opponentNickname: 'X', opponentFullName: 'Université Laval' }] }),
  b: team({ id: 'b', nickname: 'Martlets', institutionLabel: 'Université McGill', results: [{ gameId: 'g1', date: '2026-11-11', scoreFor: 54, scoreAgainst: 55, opponentNickname: 'Stingers', opponentFullName: 'Université Concordia' }, { gameId: 'p', date: '2026-11-11', scoreFor: 3, scoreAgainst: 2, priorSeason: true, opponentNickname: 'Y', opponentFullName: 'UQAM' }] }),
  c: team({ id: 'c', sport: 'hockey', sportLabel: 'Hockey', sex: 'M', nickname: 'Carabins', institutionLabel: 'Université de Montréal', nextGames: [{ gameId: 'n1', date: '2026-11-12', time: '19:00', home: true, opponentNickname: 'Patriotes', opponentFullName: 'Université du Québec à Trois-Rivières' }] }),
} };
const sp = U.pickSports(mh, '2026-11-12');
assert.equal(sp.length, 1, 'une rencontre par gameId ; ancienne et saison précédente exclues');
assert.equal(U.sportsLine(sp[0]), '🏀 Basketball (F) · Stingers (Concordia) 55-54 Martlets (McGill) · Final · mer. 11 nov.', 'date absolue, (F)/(H), établissement entre parenthèses');
assert.doesNotMatch(JSON.stringify(sp), /aujourd|hier/);
const nx = U.pickSports({ teams: { c: mh.teams.c } }, '2026-11-12');
assert.equal(nx[0].kind, 'avenir', 'repli : rencontres du jour'); assert.equal(U.sportsLine(nx[0]), '🏒 Hockey (H) · Patriotes (UQTR) chez Carabins (Montréal) · jeu. 12 nov. · 19 h');
assert.equal(U.teamLabelFor('Couguars', 'Cégep de Chicoutimi — équipe Blanc').inst, 'Chicoutimi, équipe Blanc', 'deux équipes du même cégep distinguées');
// ── Radio étudiante : à venir, tirage reproductible, une par station ──
const rs = { stations: { a: { name: 'CHYZ 94,3', grid: [{ day: 5, start: '11:00', title: 'Punk-o-rama' }, { day: 5, start: '02:00', title: 'Nuit' }, { day: 4, start: '20:00', title: 'Jeudi soir' }] }, b: { name: 'CISM 89,3', grid: [{ day: 5, start: '15:00', title: 'Le Séismix' }, { day: 5, start: '16:00', title: 'Club classique (reprise)' }] } } };
const soirSlot = { id: 'soir', day: '2026-11-12', target: '19:30' }, matinSlot = { id: 'matin', day: '2026-11-12', target: '07:45' };
const rr = U.pickRadio(rs, soirSlot);
assert.deepEqual(rr.map(U.radioLine), ['📻 Punk-o-rama · CHYZ 94,3 · ven. 13 nov. · 11 h', '📻 Le Séismix · CISM 89,3 · ven. 13 nov. · 15 h'], 'soir : lendemain, sans nuit ni reprise');
assert.deepEqual(U.pickRadio(rs, soirSlot), rr, 'reproductible');
assert.deepEqual(U.pickRadio(rs, matinSlot).map(x => x.title), ['Jeudi soir'], 'matin : émissions du jour à venir');
assert.deepEqual(U.pickRadio(null, soirSlot), [], 'sans grille : rien');
assert.deepEqual(U.pickSports({ teams: {} }, '2026-11-12'), [], 'sans donnée récente : rien');
assert.deepEqual(U.pickSports(null, '2026-11-12'), []);
// ── Typographie française de l'image ──
assert.equal(U.frTypo("Les jeunes cyniques ? Plutôt idéalistes ! L'écho"), 'Les jeunes cyniques\u202F? Plutôt idéalistes\u202F! L’écho');
assert.equal(U.frTypo('Il a dit "oui"'), 'Il a dit «\u202Foui\u202F»');
// ── Formats par réseau : portrait 4:5 partout ; Instagram préparé (story 9:16), sans lien cliquable, désactivé ──
for (const n of [...U.NETS, 'instagram']) assert.equal(U.IMAGE_FOR[n], 'portrait', n);
assert.deepEqual(U.formatsFor(U.NETS), ['portrait']); assert.deepEqual(U.formatsFor(['instagram']), ['portrait', 'story']);
assert.ok(!U.NETS.includes('instagram'), 'Instagram hors des réseaux publiés');
const igModel = { slot: sSlot, items: m.items, sports: sp };
const ig = U.buildUneAll(igModel).instagram;
assert.deepEqual(ig.problems, []); assert.doesNotMatch(ig.text, /https?:\/\//); assert.match(ig.text, /lien en bio/); assert.match(ig.text, /🏀 Basketball \(F\) · Stingers/);
assert.doesNotMatch(U.buildUneAll(igModel).x.text, /Stingers \(Concordia\)/, 'réseaux courts : pas de bloc sport');
assert.equal(U.frShort('2026-11-13'), 'ven. 13 nov.'); assert.equal(U.frHour('19:30'), '19 h 30');

// ── Workflow : planifié, déclenchement manuel, DRY_RUN, fenêtres été/hiver, verrou partagé ──
const wf = fs.readFileSync(new URL('../.github/workflows/social-une.yml', import.meta.url), 'utf8');
assert.match(wf, /workflow_dispatch:/); assert.match(wf, /dry_run:/); assert.match(wf, /DRY_RUN:/);
assert.match(wf, /cron: '\d+ 11,12 \* \* \*'/, 'matin : 11 h et 12 h UTC (HAE et HNE)');
assert.match(wf, /cron: '\d+ 23 \* \* \*'/); assert.match(wf, /cron: '[\d,]+ 0 \* \* \*'/, 'soir : 23 h et 0 h UTC (HAE et HNE)');
assert.match(wf, /group: data-writers-social\n\s*cancel-in-progress: false\n\s*queue: max/);
assert.doesNotMatch(wf, /secrets\.[A-Z_]+ *}}[^\n]*echo|echo[^\n]*secrets\./, 'aucun secret affiché');
console.log('social-une ok');

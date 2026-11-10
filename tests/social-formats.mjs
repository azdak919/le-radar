#!/usr/bin/env node
// Formats natifs : fenêtre de la fin de semaine, dédoublonnage et cohérence des matchs, sélection, textes par réseau,
// @ vérifiés seulement, hashtags, « À écouter ce soir », contrôles et garde de publication.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { frenchRange, weekendWindow, collectGames, selectResults, weekendModel, publishedModel, buildResultsText, resultsTags, resultsTumblrTags, gameLine, listenModel, buildListenText, listenTags, checkText, NET_SPEC, frenchTime } from '../scripts/social/formats.mjs';
import { buildAll, inWindow, previewMarkdown } from '../scripts/social/formats-run.mjs';
import { POLICY } from '../scripts/social/policy.mjs';
const T = iso => Date.parse(iso);
const teamAcc = JSON.parse(fs.readFileSync('data/social/team-accounts.json', 'utf8'));

// ── fenêtre : dernière fin de semaine terminée (ven.-dim., Toronto)
assert.deepEqual(weekendWindow(T('2026-11-10T14:00:00Z')), { start: '2026-11-06', end: '2026-11-08', key: '2026-11-08', label: '6-8 nov.' }, 'mardi 10 nov.');
assert.equal(weekendWindow(T('2026-11-09T22:00:00Z')).key, '2026-11-08', 'lundi');
assert.equal(weekendWindow(T('2026-11-15T17:00:00Z')).key, '2026-11-08', 'dimanche : la fin de semaine précédente');
assert.equal(weekendWindow(T('2026-11-16T14:00:00Z')).key, '2026-11-15');
assert.equal(frenchRange('2026-10-30', '2026-11-01'), '30 oct.-1 nov.'); assert.equal(frenchRange('2026-11-06', '2026-11-08'), '6-8 nov.');
assert.equal(frenchTime('19:00'), '19 h'); assert.equal(frenchTime('18:30'), '18 h 30'); assert.equal(frenchTime('09:05'), '9 h 05');

// ── données synthétiques (même forme que sports.json décompressé)
const game = (o) => ({ date: '2026-11-07', home: true, result: 'W', priorSeason: false, url: 'https://diffusion.rseq.ca/x', opponentSector: 'universitaire', ...o });
const team = (o) => ({ sector: 'universitaire', usports: true, sex: 'M', priority: 3, division: null, results: [], ...o });
const teams = {
  a1: team({ id: 'a1', sport: 'football', registryId: 'ulaval', nickname: 'Rouge et Or', fullName: 'Université Laval', results: [game({ gameId: 'g1', sport: 'football', opponentRegistryId: 'concordia', opponentNickname: 'Stingers', opponentFullName: 'Université Concordia', scoreFor: 42, scoreAgainst: 4, result: 'W', competition: 'Football universitaire masculin' })] }),
  a2: team({ id: 'a2', sport: 'football', registryId: 'concordia', nickname: 'Stingers', fullName: 'Université Concordia', results: [game({ gameId: 'g1x', home: false, sport: 'football', opponentRegistryId: 'ulaval', opponentNickname: 'Rouge et Or', scoreFor: 4, scoreAgainst: 42, result: 'L' })] }),
  b1: team({ id: 'b1', sport: 'hockey', sex: 'F', registryId: 'udem', nickname: 'Carabins', fullName: 'Université de Montréal', results: [game({ gameId: 'h1', date: '2026-11-08', sport: 'hockey', opponentRegistryId: 'mcgill', opponentNickname: 'Martlets', scoreFor: 4, scoreAgainst: 0 })] }),
  b2: team({ id: 'b2', sport: 'hockey', sex: 'F', registryId: 'mcgill', nickname: 'Martlets', fullName: 'Université McGill', results: [game({ gameId: 'h1', date: '2026-11-08', home: false, sport: 'hockey', opponentRegistryId: 'udem', opponentNickname: 'Carabins', scoreFor: 0, scoreAgainst: 4, result: 'L' })] }),
  // incohérent : les deux fiches ne s'accordent pas → écarté
  c1: team({ id: 'c1', sport: 'basketball', registryId: 'bishops', nickname: 'Gaiters', results: [game({ gameId: 'k1', sport: 'basketball', opponentRegistryId: 'mcgill', opponentNickname: 'Redbirds', scoreFor: 80, scoreAgainst: 70 })] }),
  c2: team({ id: 'c2', sport: 'basketball', registryId: 'mcgill', nickname: 'Redbirds', results: [game({ gameId: 'k1', home: false, sport: 'basketball', opponentRegistryId: 'bishops', scoreFor: 70, scoreAgainst: 79, result: 'L' })] }),
  // hors fenêtre, saison passée, score absent
  d1: team({ id: 'd1', sport: 'soccer', registryId: 'udem', nickname: 'Carabins', results: [game({ gameId: 'o1', date: '2026-11-04', sport: 'soccer', opponentRegistryId: 'ulaval', opponentNickname: 'Rouge et Or', scoreFor: 1, scoreAgainst: 0 }), game({ gameId: 'o2', priorSeason: true, sport: 'soccer', opponentRegistryId: 'ulaval', opponentNickname: 'Rouge et Or', scoreFor: 1, scoreAgainst: 0 }), game({ gameId: 'o3', sport: 'soccer', opponentRegistryId: 'ulaval', opponentNickname: 'Rouge et Or', scoreFor: null, scoreAgainst: null })] }),
  // vu d'un seul côté (adversaire hors catalogue), défaite : l'adversaire passe en premier
  e1: team({ id: 'e1', sport: 'volleyball', sex: 'F', registryId: 'usherbrooke', nickname: 'Vert & Or', results: [game({ gameId: 'v1', sport: 'volleyball', opponentRegistryId: undefined, opponent: 'Carleton University', opponentNickname: 'Ravens', scoreFor: 1, scoreAgainst: 3, result: 'L' })] }),
  // même match, identifiants de match différents d'une source à l'autre : un seul match
  f1: team({ id: 'f1', sport: 'rugby', registryId: 'ets', nickname: 'Piranhas', results: [game({ gameId: 'r1', sport: 'rugby', opponentRegistryId: 'udem', opponentNickname: 'Carabins', scoreFor: 52, scoreAgainst: 8 })] }),
  f2: team({ id: 'f2', sport: 'rugby', registryId: 'udem', nickname: 'Carabins', results: [game({ gameId: 'r2', home: false, sport: 'rugby', opponentRegistryId: 'ets', opponentNickname: 'Piranhas', scoreFor: 8, scoreAgainst: 52, result: 'L' })] }),
  // collégial D1
  g1: team({ id: 'g1', sector: 'collegial', usports: false, sport: 'football', division: 'D1', registryId: 'vanier', name: 'Vanier College', fullName: 'Vanier College', results: [game({ gameId: 'c1', sport: 'football', opponentRegistryId: 'ahuntsic', opponentFullName: 'Collège Ahuntsic', opponent: 'Collège Ahuntsic', scoreFor: 24, scoreAgainst: 14 })] }),
  g2: team({ id: 'g2', sector: 'collegial', usports: false, sport: 'football', division: 'D1', registryId: 'ahuntsic', fullName: 'Collège Ahuntsic', results: [game({ gameId: 'c1b', home: false, sport: 'football', opponentRegistryId: 'vanier', opponentFullName: 'Vanier College', scoreFor: 14, scoreAgainst: 24, result: 'L' })] }),
};
const { games, rejected } = collectGames(teams, { start: '2026-11-06', end: '2026-11-08' });
const byKey = Object.fromEntries(games.filter(g => g.sector === 'universitaire').map(g => [g.sport + (g.sex === 'F' ? 'F' : ''), g]));
assert.equal(games.length, 5, 'football, hockey, volleyball, rugby, football collégial (basket écarté ; hors fenêtre, saison passée et sans score exclus)');
assert.equal(games.filter(g => g.sport === 'rugby').length, 1, 'même match vu deux fois = un seul');
assert.deepEqual(rejected.map(r => r.why).sort(), ['fiches incohérentes', 'score absent']);
assert.equal(byKey.football.A.name, 'Rouge et Or'); assert.equal(byKey.football.A.score, 42); assert.equal(byKey.football.B.score, 4); assert.equal(byKey.football.confirmed, true);
assert.equal(byKey.volleyballF.A.name, 'Ravens', 'défaite vue d\'un côté : le gagnant passe en premier'); assert.equal(byKey.volleyballF.confirmed, false);
const coll = games.find(g => g.sector === 'collegial'); assert.deepEqual([coll.A.name, coll.B.name], ['Vanier College', 'Ahuntsic'], 'noms de cégeps sans préfixe');
assert.ok(games.every(g => Number.isInteger(g.A.score) && Number.isInteger(g.B.score) && g.A.score >= g.B.score));

// ── sélection
const sel = selectResults(games, { uni: 4, coll: 2 });
assert.ok(sel.uni.length <= 4 && sel.coll.length === 1 && sel.uni.every(g => g.sector === 'universitaire'));
assert.equal(new Set([...sel.uni, ...sel.coll].map(g => g.key)).size, sel.uni.length + sel.coll.length, 'jamais deux fois le même match');
assert.equal(sel.uni[0].sport, 'football', 'le football passe d\'abord');
const sports = { fetchedAt: '2026-11-10T12:00:00Z', teams };
const now = T('2026-11-10T14:00:00Z');
const model = weekendModel(sports, now, POLICY.formats.weekend_results);
assert.equal(model.window.key, '2026-11-08'); assert.ok(model.doubts.some(d => /écarté/.test(d)), 'incohérence signalée'); assert.deepEqual(model.hardDoubt, [], 'écarté ≠ doute bloquant');
assert.ok(weekendModel({ ...sports, fetchedAt: '2026-11-07T00:00:00Z' }, now, POLICY.formats.weekend_results).hardDoubt.some(d => /anciennes/.test(d)), 'données périmées : doute bloquant');
assert.ok(weekendModel({ fetchedAt: sports.fetchedAt, teams: {} }, now, POLICY.formats.weekend_results).hardDoubt.some(d => /moins de deux/.test(d)), 'rien à publier : doute bloquant');
const pub = publishedModel(model, ['uni']); assert.equal(pub.coll.length, 0); assert.equal(pub.shown.length, pub.uni.length);

// ── textes par réseau : aucune mention @, hashtags dynamiques
for (const n of Object.keys(NET_SPEC)) {
  const spec = NET_SPEC[n], tags = n === 'tumblr' ? [] : resultsTags(pub, POLICY.formats.weekend_results.hashtags[n], teamAcc); // Tumblr : étiquettes natives, pas de # dans le texte
  const text = buildResultsText(pub, spec, { link: 'https://le-radar.ca/sports/', teamAcc, tags });
  assert.ok(text && spec.len(text) <= spec.limit, `${n} : tient dans la limite`);
  assert.deepEqual(checkText(text, spec, { model: pub, teamAcc }), [], `${n} : contrôles`);
  assert.ok(text.startsWith('🏆 Résultats de la fin de semaine (6-8 nov.)') && text.includes('https://le-radar.ca/sports/'));
  assert.ok(text.includes('Rouge et Or') && /42/.test(text) && !/undefined|NaN/.test(text));
  assert.equal(/@\w/.test(text), false, `${n} : aucune mention @`);
  assert.equal(/(^|\s)#\p{L}/u.test(text), tags.length > 0, `${n} : hashtags selon policy`);
  assert.ok(!/U SPORTS|@USPORTSca|@RSEQ1|@Carabins|@McGillAthletics/.test(text), `${n} : pas de ligne de ligues ni de @`);
}
const xText = buildResultsText(pub, NET_SPEC.x, { link: 'https://le-radar.ca/sports/', teamAcc, tags: resultsTags(pub, 8, teamAcc) });
assert.equal((xText.match(/@\w+/g) || []).length, 0, 'X : aucune mention');
assert.ok(xText.includes('Stingers') && !xText.includes('Stingers ('), 'noms d\'équipes en clair, sans @');
const tiny = { ...NET_SPEC.x, limit: 60 }; assert.equal(buildResultsText(pub, tiny, { link: 'https://le-radar.ca/sports/', teamAcc }), null, 'jamais de texte tronqué : null si le minimum ne tient pas');
assert.equal(gameLine(model.uni[0], s => (s.reg === 'ulaval' ? '@rougeetor' : '')).includes('(@rougeetor)'), true);
assert.deepEqual(resultsTags(pub, 4, teamAcc), ['#USports', '#RSEQ', '#FootballU', '#HockeyU']);
assert.deepEqual(resultsTags(pub, 2, teamAcc), ['#USports', '#RSEQ']);
assert.deepEqual(resultsTags(pub, 0, teamAcc), []);
assert.deepEqual(resultsTags(pub, 8, teamAcc), ['#USports', '#RSEQ', '#FootballU', '#HockeyU', '#VolleyU', '#RugbyU', '#SportÉtudiant', '#Québec']);
const tt = resultsTumblrTags(pub, teamAcc); assert.ok(tt.length >= 10 && tt.length <= 15 && tt.every(x => x === x.toLowerCase() && !/[#,]/.test(x)) && tt.includes('usports'), tt.join('|'));
// contrôles : mention @ interdite dans les résultats, ligne en double, score faux
const spec = NET_SPEC.mastodon;
assert.ok(checkText('🏆 x\n\ncc @inconnu', spec, { kind: 'weekend_results' }).some(p => /mention @ interdite/.test(p)));
assert.ok(checkText('🎧 À écouter\n19 h · CKUT (@inconnu) : Jazz', spec, { kind: 'listen_tonight' }).some(p => /@ non vérifié/.test(p)));
assert.ok(checkText('a\na', spec, {}).includes('ligne en double'));
assert.ok(checkText('🏆 Résultats\n🏈 Rouge et Or 41, Stingers 4', spec, { model: pub, teamAcc }).some(p => /sans match correspondant/.test(p)), 'score faux détecté');

// ── exemple approuvé (6-8 nov.) : texte X exact, hashtags selon équipes et sports
const approved = {
  window: { start: '2026-11-06', end: '2026-11-08', key: '2026-11-08', label: '6-8 nov.' },
  uni: [
    { sport: 'football', sex: 'M', sector: 'universitaire', priority: 3, A: { reg: 'udem', nick: 'Carabins', name: 'Carabins', score: 28 }, B: { reg: 'mcgill', nick: 'Redbirds', name: 'Redbirds', score: 21 } },
    { sport: 'football', sex: 'M', sector: 'universitaire', priority: 3, A: { reg: 'ulaval', nick: 'Rouge et Or', name: 'Rouge et Or', score: 42 }, B: { reg: 'concordia', nick: 'Stingers', name: 'Stingers', score: 4 } },
    { sport: 'hockey', sex: 'F', sector: 'universitaire', priority: 3, A: { reg: 'udem', nick: 'Carabins', name: 'Carabins', score: 4 }, B: { reg: 'mcgill', nick: 'Martlets', name: 'Martlets', score: 0 } },
    { sport: 'hockey', sex: 'F', sector: 'universitaire', priority: 3, A: { reg: 'bishops', nick: 'Gaiters', name: 'Gaiters', score: 5 }, B: { reg: 'ulaval', nick: 'Rouge et Or', name: 'Rouge et Or', score: 1 } },
  ],
  coll: [],
};
approved.shown = [...approved.uni];
const approvedTags = resultsTags(approved, 8, teamAcc);
assert.deepEqual(approvedTags, ['#USports', '#RSEQ', '#FootballU', '#HockeyU', '#Carabins', '#RougeEtOr', '#SportÉtudiant', '#Québec']);
const approvedText = buildResultsText(approved, NET_SPEC.x, { link: 'https://le-radar.ca/sports/', teamAcc, tags: approvedTags });
assert.equal(approvedText, [
  '🏆 Résultats de la fin de semaine (6-8 nov.)',
  '',
  '🏈 Carabins 28, Redbirds 21',
  '🏈 Rouge et Or 42, Stingers 4',
  '🏒 Carabins 4, Martlets 0 (F)',
  '🏒 Gaiters 5, Rouge et Or 1 (F)',
  '',
  'https://le-radar.ca/sports/',
  '#USports #RSEQ #FootballU #HockeyU #Carabins #RougeEtOr #SportÉtudiant #Québec',
].join('\n'));
assert.deepEqual(checkText(approvedText, NET_SPEC.x, { model: approved, teamAcc }), []);
assert.ok(NET_SPEC.x.len(approvedText) <= 280, 'exemple approuvé dans la limite X');
// trop long : on retire d'abord les hashtags d'équipes, les lignes de matchs restent
const tight = { ...NET_SPEC.x, limit: NET_SPEC.x.len(approvedText) - 16 };
const trimmed = buildResultsText(approved, tight, { link: 'https://le-radar.ca/sports/', teamAcc, tags: approvedTags });
assert.ok(trimmed && !/#Carabins|#RougeEtOr/.test(trimmed) && /#USports #RSEQ #FootballU #HockeyU/.test(trimmed) && trimmed.includes('Carabins 28, Redbirds 21') && !/@/.test(trimmed), trimmed);
const mastodonApproved = buildResultsText(approved, NET_SPEC.mastodon, { link: 'https://le-radar.ca/sports/', teamAcc, tags: approvedTags });
assert.ok(mastodonApproved.includes('Tous les résultats : https://le-radar.ca/sports/') && !/@/.test(mastodonApproved) && mastodonApproved.includes('#Carabins #RougeEtOr #SportÉtudiant #Québec'));

// ── buildAll + garde de publication
const built = buildAll('weekend_results', { sports, radio: {}, teamAcc, now });
assert.equal(built.hardDoubt.length, 0); assert.ok(Object.values(built.networks).every(v => v.text && v.problems.length === 0));
assert.ok(built.model.previewOnly.length === 1 && /RSEQ collégial/.test(built.previewColl), 'collégial : aperçu seulement');
assert.ok(previewMarkdown(built, { dry: true, willPublish: false, reason: 'essai' }).includes('Aperçu RSEQ collégial'));
const W = POLICY.formats.weekend_results;
assert.equal(W.publish, true); assert.equal(W.maxPerWeekendPerNetwork, 1); assert.deepEqual(W.sections, ['uni']);
assert.equal(W.maxMentionsX, 0); assert.equal(W.hashtags.x, 8); assert.equal(W.hashtags.mastodon, 8);
assert.equal(POLICY.formats.listen_tonight.publish, false, 'À écouter ce soir : jamais publié');
assert.equal(inWindow(W, T('2026-11-10T14:00:00Z')), true, 'mardi 9 h');
assert.equal(inWindow(W, T('2026-11-10T11:00:00Z')), false, 'mardi 6 h : trop tôt');
assert.equal(inWindow(W, T('2026-11-10T02:30:00Z')), false, 'lundi 21 h 30');
assert.equal(inWindow(W, T('2026-11-11T14:00:00Z')), false, 'mercredi : hors fenêtre');

// ── À écouter ce soir
const radio = { stations: {
  ckut: { name: 'CKUT 90,3', verifiedWeekOf: '2026-11-09', grid: [{ day: 2, start: '19:00', end: '20:00', title: 'Dykes on Mykes' }, { day: 2, start: '08:00', end: '09:00', title: 'Matin' }] },
  cjlo: { name: 'CJLO 1690AM', verifiedWeekOf: '2026-11-09', grid: [{ day: 2, start: '18:00', end: '19:00', title: 'Monday Mass' }, { day: 2, start: '20:00', end: '21:00', title: 'Rock du soir' }] },
  chyz: { name: 'CHYZ 94,3', verifiedWeekOf: '2026-11-02', grid: [{ day: 2, start: '19:00', end: '20:00', title: 'Grille périmée' }] },
  cism: { name: 'CISM 89,3', verifiedWeekOf: '2026-11-09', grid: [{ day: 2, start: '19:30', end: '21:00', title: 'Musique en rotation' }, { day: 2, start: '21:00', end: '22:00', title: 'Jazz' }] },
} };
const lm = listenModel(radio, T('2026-11-11T00:00:00Z'), POLICY.formats.listen_tonight); // mardi 10 nov. 19 h
assert.deepEqual(lm.shows.map(s => s.station), ['ckut', 'cjlo', 'cism'], 'une émission par station, triées par heure');
assert.ok(lm.shows.every(s => s.station !== 'chyz'), 'grille non vérifiée cette semaine : exclue');
assert.ok(lm.skipped.some(s => s.id === 'chyz' && /non vérifiée/.test(s.why)));
assert.equal(lm.shows.find(s => s.station === 'cism').title, 'Jazz', 'émission générique écartée');
for (const n of ['x', 'bluesky', 'mastodon']) {
  const t = buildListenText(lm, NET_SPEC[n], { link: 'https://le-radar.ca/horaires/', teamAcc, tags: listenTags(lm, POLICY.formats.listen_tonight.hashtags[n], teamAcc) });
  assert.ok(t.startsWith('🎧 À écouter ce soir') && NET_SPEC[n].len(t) <= NET_SPEC[n].limit && !/chyz/i.test(t), n);
  assert.deepEqual(checkText(t, NET_SPEC[n], { teamAcc, kind: 'listen_tonight' }), [], n);
}
assert.ok(buildListenText(lm, NET_SPEC.x, { link: 'l', teamAcc }).includes('(@ckut)'), 'X : @ vérifié CKUT');
assert.ok(buildListenText(lm, NET_SPEC.bluesky, { link: 'l', teamAcc }).includes('(@cism893.bsky.social)'), 'Bluesky : @ vérifié CISM');
const bl = buildAll('listen_tonight', { sports, radio, teamAcc, now: T('2026-11-11T00:00:00Z'), buffer: { sent: { z: { source: 'CKUT', mention: ['@ckut'], at: '2026-11-10T16:00:00Z' } } } });
assert.ok(!bl.networks.x.text.includes('@ckut') && bl.networks.x.text.includes('CKUT'), 'budget X : @ckut déjà mentionné aujourd\'hui');
assert.ok(listenModel({ stations: {} }, now).doubts.length === 1);
console.log('social-formats : OK');

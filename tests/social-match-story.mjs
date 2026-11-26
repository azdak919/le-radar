// « Story match du jour » : sélection des matchs du jour, ordre visiteur/hôte, logos optionnels, fenêtre et idempotence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as L from '../scripts/social/match-story-lib.mjs';
import { CFG, pendingNets } from '../scripts/social/match-story-run.mjs';
import { pageModel } from '../scripts/social/une-render.mjs';
import { IMAGE_SIZES } from '../scripts/social/une-lib.mjs';

const team = (id, nick, inst, sector, games) => ({ id, name: inst, fullName: inst, institutionLabel: inst, nickname: nick, registryId: id, sector, sport: 'basketball', sportLabel: 'Basketball', sex: 'F', results: [], nextGames: games });
const mh = { teams: {
  mcgill: team('mcgill', 'Martlets', 'Université McGill', 'universitaire', [{ date: '2026-11-26', time: '18:00', home: true, gameId: 'g1', opponent: 'Université Concordia', opponentFullName: 'Université Concordia', opponentNickname: 'Stingers', opponentRegistryId: 'concordia' }]),
  uqam: team('uqam', 'Citadins', 'UQAM', 'universitaire', [{ date: '2026-11-26', time: '20:00', home: false, gameId: 'g2', opponent: 'Bishop’s University', opponentFullName: 'Bishop’s University', opponentNickname: 'Gaiters', opponentRegistryId: 'bishops' }]),
  jonq: team('jonquiere', 'Gaillards', 'Cégep de Jonquière', 'collegial', [{ date: '2026-11-26', time: '13:00', home: true, gameId: 'g3', opponent: 'Cégep de Chicoutimi', opponentFullName: 'Cégep de Chicoutimi', opponentNickname: 'Couguars', opponentRegistryId: 'chicoutimi' }]),
  demain: team('laval', 'Rouge et Or', 'Université Laval', 'universitaire', [{ date: '2026-11-27', time: '18:00', home: true, gameId: 'g4', opponent: 'UdeM', opponentNickname: 'Carabins' }]),
} };

// Du jour seulement, universitaire d'abord puis par heure ; plafond.
const all = L.todaysMatches(mh, '2026-11-26');
assert.deepEqual(all.map((m) => m.gameId), ['g1', 'g2', 'g3']);
assert.equal(L.todaysMatches(mh, '2026-11-26', { max: 1 }).length, 1);
// Déjà commencé : écarté (14 h → le match de 13 h tombe).
assert.deepEqual(L.todaysMatches(mh, '2026-11-26', { notBefore: 14 * 60 }).map((m) => m.gameId), ['g1', 'g2']);
assert.equal(L.matchKey(all[0]), '2026-11-26:g1');

// Visiteur en haut, hôte en bas ; « Chez les … ».
const a = L.matchStoryModel(all[0], { index: 0, total: 3, root: os.tmpdir() }).match;
assert.equal(a.home.name, 'Martlets'); assert.equal(a.away.name, 'Stingers'); assert.equal(a.hour, '18 h');
assert.match(a.where, /^Chez les Martlets/);
const b = L.matchStoryModel(all[1], { root: os.tmpdir() }).match;
assert.equal(b.home.name, 'Gaiters', '« visite » : l’adversaire reçoit');
assert.ok(!/undefined|null/.test(L.matchStoryAlt(all[0])));

// Logos : seulement si un fichier est déposé (aucun téléchargement), sinon affiche typographique.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'logos-'));
assert.equal(L.teamLogo('mcgill', { root }), '');
fs.mkdirSync(path.join(root, L.TEAM_LOGO_DIR), { recursive: true });
fs.writeFileSync(path.join(root, L.TEAM_LOGO_DIR, 'mcgill.svg'), '<svg/>');
assert.equal(L.teamLogo('mcgill', { root }), '../assets/logos/teams/mcgill.svg');
assert.equal(L.teamLogo('../etc', { root }), '');
assert.equal(L.matchStoryModel(all[0], { root }).match.home.logo, '../assets/logos/teams/mcgill.svg');

// Fenêtre d'envoi (heure de Montréal) et état.
assert.equal(L.storyWindow(Date.parse('2026-11-26T15:30:00Z')).due, true);   // 10 h 30 HNE
assert.equal(L.storyWindow(Date.parse('2026-11-26T12:00:00Z')).due, false);  // 7 h HNE
assert.deepEqual(pendingNets({ nets: { facebook: { at: 'x' }, instagram: { failed: true, attempts: 3 } } }), []);
assert.deepEqual(pendingNets({ nets: { facebook: { failed: true, attempts: 1 } } }), ['facebook', 'instagram']);
const st = { '2026-11-01:g': {}, '2026-11-25:g': {} };
L.pruneMatchState(st, Date.parse('2026-11-26T15:00:00Z'));
assert.deepEqual(Object.keys(st), ['2026-11-25:g']);

// Libellés : féminin / masculin au lieu de (F) / (H) ; voile mixte.
assert.equal(L.sportLabelFr('Basketball (F)'), 'Basketball féminin');
assert.equal(L.sportLabelFr('Hockey (H)'), 'Hockey masculin');
assert.equal(L.sportLabelFr('Voile', 'sailing'), 'Voile mixte');
assert.equal(L.sportLabelFr('Badminton (mixte)'), 'Badminton mixte');
assert.equal(a.sport, 'Basketball féminin');

// Voile : une story par régate (classement par place), tous les clubs québécois inscrits, jamais de « VS ».
const sail = (id, inst) => ({ id, sport: 'sailing', sportLabel: 'Voile', sector: 'universitaire', leagueLabel: 'CICSA', name: inst, institutionLabel: inst, registryId: id, results: [],
  nextGames: [{ gameId: 'r-' + id, date: '2026-11-26', time: '', home: null, scoreKind: 'place', opponent: 'Championnat canadien de course en flotte', opponentEn: 'Fleet Race Nationals', opponentFullName: 'Fleet Race Nationals · Royal St. Lawrence YC' }] });
const withSail = { teams: { ...mh.teams, s1: sail('mcgill', 'Université McGill'), s2: sail('concordia', 'Université Concordia') } };
const reg = L.todaysRegattas(withSail, '2026-11-26');
assert.equal(reg.length, 1, 'une seule story pour la régate');
assert.deepEqual(reg[0].clubs.map((c) => c.name), ['McGill', 'Concordia']);
assert.equal(L.matchKey(reg[0]), '2026-11-26:regate-championnat-canadien-de-course-en-flotte');
assert.ok(!L.todaysMatches(withSail, '2026-11-26').some((m) => m.event), 'pas de régate parmi les face-à-face');
const stories = L.todaysStories(withSail, '2026-11-26', { notBefore: 14 * 60 });
assert.ok(stories.some((m) => m.kind === 'regatta'), 'régate : toute la journée, jamais écartée par l’heure');
const rm = L.matchStoryModel(reg[0], { root: os.tmpdir() }).match;
assert.equal(rm.kind, 'regatta'); assert.equal(rm.sport, 'Voile mixte'); assert.equal(rm.away, undefined);
// Nom du club de voile (sports-sailing.json), pas l'équipe d'excellence ; lieu de la feuille CICSA ; logo propre au club (<id>-voile).
assert.deepEqual(L.matchStoryModel(reg[0]).match.clubs.map((c) => c.name), ['McGill Sailing', 'Concordia Sailing']);
assert.equal(L.matchStoryModel(reg[0]).match.where, 'Lieu : Royal St. Lawrence YC');
assert.equal(rm.circuit, 'CICSA');
fs.copyFileSync('sports-sailing.json', path.join(root, 'sports-sailing.json'));
assert.equal(L.matchStoryModel(reg[0], { root }).match.clubs[0].logo, '', 'le logo des Redbirds ne sert pas au club de voile');
// U SPORTS pour l'universitaire, RSEQ collégial sinon ; salle RSEQ si connue.
assert.equal(a.circuit, 'U SPORTS');
assert.equal(L.matchStoryModel(all[2], { root: os.tmpdir() }).match.circuit, 'RSEQ collégial');
const withVenue = L.matchStoryModel({ ...all[0], venue: 'Love Competition Hall' }, { root: os.tmpdir() }).match;
assert.equal(withVenue.where, 'Chez les Martlets · McGill'); assert.equal(withVenue.venue, 'Love Competition Hall');
assert.equal(await L.rseqVenue('pas-un-uuid'), '');
assert.equal(await L.rseqVenue('91669338-645a-4ef0-8c47-d678db17ce23', { fetchImpl: async () => ({ ok: true, json: async () => ({ SportFacilityDescription: ' Love  Competition Hall ' }) }) }), 'Love Competition Hall');
assert.equal(await L.rseqVenue('91669338-645a-4ef0-8c47-d678db17ce23', { fetchImpl: async () => { throw new Error('réseau'); } }), '');
assert.match(L.matchStoryAlt(reg[0]), /classement par place/);

// Crédits : source des données (+ salle / lieu), titulaires des logos réellement affichés, autorisations.
const cm = L.matchStoryModel({ ...all[0], venue: 'Love Competition Hall' }).match;
assert.equal(cm.credits.data, 'Calendrier et salle : RSEQ');
assert.deepEqual(cm.credits.logos, ['U SPORTS', 'Concordia', 'McGill']);
assert.equal(L.matchStoryModel(all[2]).match.credits.data, 'Calendrier : RSEQ');
const cr = L.matchStoryModel(L.todaysRegattas({ teams: { s: sail('ulaval', 'Université Laval') } }, '2026-11-26')[0]).match.credits;
assert.equal(cr.data, 'Calendrier et lieu : CICSA');
assert.deepEqual(cr.logos, ['CICSA', 'ULaVoile']);
assert.match(cr.notes.join(' '), /autorisation du club/);
assert.deepEqual(L.matchStoryModel(all[0], { root: os.tmpdir() }).match.credits.logos, [], 'aucun logo affiché : aucun titulaire cité');

// Config et rendu.
assert.deepEqual(CFG.networks, ['facebook', 'instagram']);
assert.deepEqual(IMAGE_SIZES['match-story'], { width: 1080, height: 1920 });
assert.deepEqual(Object.keys(pageModel(L.matchStoryModel(all[0]))), ['match', 'slot']);
console.log('social-match-story : OK');

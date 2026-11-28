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
// Les deux ou aucun (27 nov. 2026) : un seul logo déposé → aucun des deux.
assert.equal(L.matchStoryModel(all[0], { root }).match.home.logo, '', 'un seul logo : aucun');
assert.equal(L.matchStoryModel(all[0], { root }).match.away.logo, '');
{
  const regs = all[0].teams.map((t) => t.reg).filter(Boolean);
  for (const r of regs) fs.writeFileSync(path.join(root, L.TEAM_LOGO_DIR, `${r}.svg`), '<svg/>');
  const both = L.matchStoryModel(all[0], { root }).match;
  if (regs.length === 2) { assert.ok(both.home.logo && both.away.logo, 'deux logos déposés : les deux'); }
}
// Vagues : heure de publication programmée dans Buffer (9 h, 15 h).
assert.deepEqual(L.WAVES.map((w) => w.post), ['09:00', '15:00']);

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
assert.deepEqual(cr.notes, [], 'pas de mention du fanion : « propriété de leurs titulaires » suffit');
assert.deepEqual(L.matchStoryModel(all[0], { root: os.tmpdir() }).match.credits.logos, [], 'aucun logo affiché : aucun titulaire cité');

// Résultats de régate : une story par épreuve terminée la veille ou le jour même, clubs classés, lieu en clair, rien d'inventé.
const res = (reg, inst, place, field, crew = '') => ({ id: reg, sport: 'sailing', sector: 'universitaire', name: inst, registryId: reg, nextGames: [],
  results: [{ date: '2026-10-11', eventStart: '2026-10-10', opponent: `Championnat régional du Québec${crew ? ` · équipage ${crew}` : ''}`, opponentEn: 'Quebec Regionals', opponentFullName: 'Quebec Regionals · PCYC', scoreKind: 'place', scoreFor: place, scoreAgainst: field }] });
const rr = L.regattaResults({ a: res('ulaval', 'ULaVoile', 9, 12), b: res('concordia', 'Concordia Sailing', 2, 12), c: { ...res('mcgill', 'McGill Sailing', null, 12) } }, '2026-10-12');
assert.equal(rr.length, 1); assert.equal(rr[0].venue, 'Pointe-Claire Yacht Club');
assert.deepEqual(rr[0].rows.map((r) => [r.reg, r.place]), [['concordia', 2], ['ulaval', 9]], 'place inconnue : pas de ligne');
assert.equal(L.regattaResults({ a: res('ulaval', 'ULaVoile', 9, 12) }, '2026-10-14').length, 0, 'trop ancien : pas de story');
const rmod = L.matchStoryModel(rr[0]).match;
assert.equal(rmod.rows[0].placeLabel, '2e'); assert.equal(rmod.rows[0].name, 'Concordia Sailing'); assert.equal(rmod.rows[0].podium, true);
assert.equal(rmod.rows[1].name, 'ULaVoile'); assert.equal(rmod.circuit, 'CICSA');
assert.equal(rmod.credits.data, 'Résultats et lieu : CICSA');
assert.equal(L.matchKey(rr[0]), '2026-10-11:resultats-championnat-regional-du-quebec');
assert.match(L.matchStoryAlt(rr[0]), /2e Concordia Sailing, 9e ULaVoile/);
assert.equal(L.venueLabel('wvyc'), 'West Vancouver Yacht Club'); assert.equal(L.venueLabel('Yale'), 'Yale');
assert.ok(L.todaysStories({ teams: {} }, '2026-10-12', { sailing: { a: res('ulaval', 'ULaVoile', 9, 12) } }).some((x) => x.kind === 'regatta-results'));

// Vagues : matin (avant 15 h, voile) et fin d'après-midi (soirée) ; plafond par vague ; « Aussi aujourd'hui » au-delà.
assert.equal(L.waveOf({ time: '13:00' }), 'matin'); assert.equal(L.waveOf({ time: '18:00' }), 'soir'); assert.equal(L.waveOf({ kind: 'regatta' }), 'matin');
assert.equal(L.waveAt(9 * 60 + 41).id, 'matin'); assert.equal(L.waveAt(15 * 60 + 23).id, 'soir'); assert.equal(L.waveAt(22 * 60), null);
const g = (i, uni, sport, time) => ({ kind: 'avenir', gameId: 'g' + i, date: '2026-11-28', uni, sport, sportKey: sport, time, verb: 'reçoit', emoji: '', teams: [{ name: 'A' + i }, { name: 'B' + i }] });
assert.deepEqual(L.planWave([]), [], 'aucun match : aucune story');
assert.equal(L.planWave([g(1, true, 'basketball', '18:00')]).length, 1, 'un match : une story, rien ajouté');
const five = [g(1, false, 'volleyball', '18:00'), g(2, true, 'basketball', '20:00'), g(3, true, 'basketball', '18:00'), g(4, true, 'hockey', '19:00'), g(5, false, 'volleyball', '19:00')];
assert.equal(L.planWave(five).length, 5, 'reste de 1 ou 2 : chacun son affiche');
assert.ok(L.planWave(five).every((m) => m.kind !== 'more'));
const many = Array.from({ length: 30 }, (_, i) => g(i, i < 3, ['volleyball', 'basketball', 'soccer'][i % 3], `${18 + (i % 3)}:00`));
const pw = L.planWave(many);
assert.equal(pw.length, 4); assert.equal(pw.at(-1).kind, 'more'); assert.equal(pw.at(-1).items.length, 27);
assert.ok(pw.slice(0, 3).every((m) => m.uni), 'universitaire d’abord');
assert.equal(new Set(pw.slice(0, 3).map((m) => m.sport)).size, 3, 'un sport différent avant de répéter');
const more = L.matchStoryModel(pw.at(-1)).match;
assert.equal(more.kind, 'more'); assert.equal(more.count, 27); assert.equal(more.items.length, 9); assert.equal(more.extra, 18);
assert.equal(L.matchKey(pw.at(-1)), '2026-11-28:aussi-soir');
assert.match(L.matchStoryAlt(pw.at(-1)), /Aussi aujourd’hui/);

// Popularité estimée : niveau, sport, derby, grande écoute ; voile toujours publiée, hors plafond.
const derby = { ...g(9, true, 'basketball', '18:00'), teams: [{ name: 'Martlets', reg: 'mcgill' }, { name: 'Stingers', reg: 'concordia' }] };
assert.equal(L.popularity(derby), 60 + 20 + 15 + 5);
assert.ok(L.popularity({ ...g(1, false, 'volleyball', '13:00'), division: 'D1' }) > L.popularity({ ...g(2, false, 'volleyball', '13:00'), division: 'D3' }));
assert.ok(L.popularity(derby) > L.popularity(g(3, true, 'basketball', '13:00')));
const sailStory = L.todaysRegattas(withSail, '2026-11-26')[0];
const busy = L.planWave([...many, sailStory]);
assert.ok(busy.some((m) => m.kind === 'regatta'), 'voile incluse même un jour chargé');
assert.equal(busy.filter((m) => m.kind !== 'more' && m.kind !== 'regatta').length, 3, 'la voile ne prend pas la place d’un match');
assert.ok(!busy.at(-1).items.some((m) => m.kind === 'regatta'), 'jamais reléguée dans « Aussi aujourd’hui »');

// « 🄯 » (U+1F12F) est absent des polices du rendu sans tête : rectangle vide dans les images publiées le 26 nov. 2026.
const tpl = fs.readFileSync('affiches/social-une.js', 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
assert.ok(!tpl.includes('\u{1F12F}'), 'copyleft dessiné en CSS (« © » retourné), jamais le caractère 🄯');

// Config et rendu.
assert.deepEqual(CFG.networks, ['facebook', 'instagram']);
assert.deepEqual(IMAGE_SIZES['match-story'], { width: 1080, height: 1920 });
assert.deepEqual(Object.keys(pageModel(L.matchStoryModel(all[0]))), ['match', 'slot']);
console.log('social-match-story : OK');

// Une rencontre = une story (27 nov. 2026 : Stingers–Carabins en 7 stories, vue de chaque équipe, avec et sans heure).
{
  const g = (a, b, verb, time, gameId = '') => ({ date: '2026-11-27', sportKey: 'hockey', sport: 'Hockey (F)', uni: true, kind: 'game', gameId, verb, time,
    teams: [{ name: a, reg: a.toLowerCase() }, { name: b, reg: b.toLowerCase() }] });
  const list = [g('Stingers', 'Carabins', 'visite', '19:00', 'x1'), g('Carabins', 'Stingers', 'reçoit', '19:00', 'x2'), g('Stingers', 'Carabins', 'visite', '19:00'),
    g('Carabins', 'Stingers', 'reçoit', ''), g('Stingers', 'Carabins', 'visite', ''), g('Martlets', 'Rouge', 'reçoit', '19:00'), g('Rouge', 'Martlets', 'visite', '19:00')];
  const out = L.dedupeMatches(list);
  assert.equal(out.length, 2, 'une entrée par rencontre');
  assert.ok(out.every((r) => r.verb === 'reçoit' && r.time === '19:00'), 'l’hôte, avec l’heure');
  assert.equal(L.dedupeMatches([g('A', 'B', 'reçoit', ''), g('B', 'A', 'visite', '')]).length, 1, 'sans heure nulle part : une seule');
  assert.equal(L.dedupeMatches([g('A', 'B', 'reçoit', '13:00'), g('A', 'B', 'reçoit', '19:00')]).length, 2, 'programme double : deux matchs');
  assert.equal(L.dedupeMatches([g('A', 'B', 'reçoit', '19:00'), { ...g('A', 'B', 'reçoit', '19:00'), sport: 'Hockey (M)' }]).length, 2, 'féminin et masculin distincts');
}
console.log('match-story dédoublonnage : ok');

// « Aussi aujourd'hui » : sigle de l'établissement entre parenthèses, renvoi vers le-radar.ca/sports (27 nov. 2026).
{
  const t = (name, inst) => ({ name, inst, reg: name.toLowerCase() });
  const items = Array.from({ length: 12 }, (_, i) => ({ date: '2026-11-27', kind: 'game', sport: 'Hockey (F)', sportKey: 'hockey', verb: 'reçoit', time: '19:00', teams: [t('Carabins', 'UdeM'), t('Géants' + i, 'Saint-Jean-sur-Richelieu')] }));
  const { match } = L.matchStoryModel({ kind: 'more', date: '2026-11-27', items }, { index: 0, total: 1 });
  assert.match(match.items[0].text, /^Carabins \(UdeM\) reçoit Géants0 \(Saint‑Jean‑sur‑Richelieu\)$/);
  assert.equal(match.extra, 3);
  const alt = L.matchStoryAlt({ kind: 'more', date: '2026-11-27', items });
  assert.match(alt, /\(Saint-Jean-sur-Richelieu\)/, 'alt : tirets ordinaires');
  assert.match(alt, /et 3 autres sur le-radar\.ca\/sports/);
}
console.log('match-story aussi aujourd’hui : ok');

// Logo d'équipe depuis Commons (scripts/social/team-logo-fetch.mjs) : identifiant et titre de fichier normalisés, image vérifiée.
{
  const T = await import('../scripts/social/team-logo-fetch.mjs');
  assert.equal(T.teamId(' UdeM '), 'udem');
  assert.equal(T.teamId('udem-voile'), 'udem-voile');
  assert.equal(T.fileTitle('Carabins logo.svg'), 'File:Carabins logo.svg');
  assert.equal(T.fileTitle('https://commons.wikimedia.org/wiki/File:Carabins_logo.svg'), 'File:Carabins logo.svg');
  assert.equal(T.fileTitle('Fichier:Carabins.png'), 'File:Carabins.png');
  assert.equal(T.fileTitle(''), '');
  assert.ok(T.isImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])));
  assert.ok(!T.isImage(Buffer.from('<!DOCTYPE html><html>')));
  const wf = fs.readFileSync(new URL('../.github/workflows/social-team-logo.yml', import.meta.url), 'utf8');
  assert.ok(!/run:[^\n]*\$\{\{ inputs\./.test(wf) && !/git commit[^\n]*\$\{\{/.test(wf), 'pas d’entrée injectée dans un script');
}
console.log('logo d’équipe Commons : ok');
{
  const T = await import('../scripts/social/team-logo-fetch.mjs');
  assert.equal(T.author('<span>Unknown author</span>Unknown author'), '');
  assert.equal(T.author('<a href="x">Jane Doe</a>'), 'Jane Doe');
}

// Logo depuis le site officiel (28 nov. 2026) : candidats d'une page, types d'image acceptés.
{
  const T = await import('../scripts/social/team-logo-fetch.mjs');
  const html = `<header><img class="site-logo" src="/img/udem.svg" alt="UdeM"></header>
    <div class="team-header"><img src="https://cdn.ex.org/carabins-logo.png" srcset="https://cdn.ex.org/carabins-logo@2x.png 2x" alt="Carabins"></div>
    <img src="/photos/joueur.jpg" alt="Un joueur"><meta property="og:image" content="https://ex.org/og.jpg">`;
  const urls = T.logoCandidates(html, 'https://carabins.umontreal.ca/football/').map((c) => c.url);
  assert.deepEqual(urls, ['https://carabins.umontreal.ca/img/udem.svg', 'https://cdn.ex.org/carabins-logo.png', 'https://cdn.ex.org/carabins-logo@2x.png', 'https://ex.org/og.jpg']);
  assert.equal(T.imageExt(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'png');
  assert.equal(T.imageExt(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')), 'svg');
  assert.equal(T.imageExt(Buffer.from('<svg onload="alert(1)"></svg>')), '', 'SVG avec script refusé');
  assert.equal(T.imageExt(Buffer.from('<html>non</html>')), '');
}
console.log('logo d’équipe site officiel : ok');

// Lot de logos (ÉTS et cégeps, 28 nov. 2026) et alias des deuxièmes équipes.
{
  const T = await import('../scripts/social/team-logo-fetch.mjs');
  assert.deepEqual(T.parseBatch('ets|ÉTS Piranhas logo; Dawson | Dawson College logo ;vide|;|x'), [{ id: 'ets', v: 'ÉTS Piranhas logo', owner: '' }, { id: 'dawson', v: 'Dawson College logo', owner: '' }]);
  assert.deepEqual(T.parseBatch('alma|File:Alma.png|Collège d’Alma'), [{ id: 'alma', v: 'File:Alma.png', owner: 'Collège d’Alma' }]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-'));
  fs.mkdirSync(path.join(tmp, 'assets/logos/teams'), { recursive: true }); fs.writeFileSync(path.join(tmp, 'assets/logos/teams/alma.png'), '');
  assert.equal(L.teamLogo('alma-2', { root: tmp }), '../assets/logos/teams/alma.png');
  assert.equal(L.teamLogo('jonquiere-2', { root: tmp }), '');
}
console.log('logos en lot et alias : ok');

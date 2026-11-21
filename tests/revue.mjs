// « La revue du matin / du soir » : éditions (heure d'été et d'hiver), période, sélection (tous les auteurs, sport pro exclu),
// garde-fou anti-hallucination (IA simulée), repli déterministe, validation des liens/auteurs/émissions/scores, JSON-LD,
// sitemap Google News, RSS, rendu, interrupteur `publish` (activé le 17 nov. 2026) et workflows.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as L from '../scripts/revue/revue-lib.mjs';
import { aiReview, itemsPrompt, chapeauPrompt } from '../scripts/revue/revue-ai.mjs';
import { generate, gate, writeOutputs, loadConfig, resolveEditionClock } from '../scripts/revue/revue-run.mjs';
import { resolveEditionId } from '../scripts/revue/revue-pdf-id.mjs';


const require = createRequire(import.meta.url);
const R = require('../scripts/revue/revue-render.js');
const feedLib = require('../scripts/generate-feed.js');
const cfg = L.mergeConfig(JSON.parse(fs.readFileSync('data/revue/config.json', 'utf8')));

// ── Interrupteur : publication activée (décision de Charles, 17 nov. 2026) ──
assert.equal(cfg.publish, true, 'data/revue/config.json : publish activé (décision de Charles, 17 nov. 2026)');
assert.equal(L.mergeConfig({ publish: 'true' }).publish, false, 'seul le booléen true active la publication');
const unpublished = L.mergeConfig({ publish: false });
assert.equal(gate({ now: Date.parse('2026-11-17T12:35:00Z'), cfg: unpublished }).due, false);
assert.match(gate({ now: Date.parse('2026-11-17T12:35:00Z'), cfg: unpublished }).why, /désactivée/);
assert.equal(cfg.editions.matin.target, '07:00', 'heure idéale du matin inchangée');
assert.equal(cfg.editions.soir.target, '19:15', 'heure idéale du soir : 19 h 15, avant La une');
assert.equal(R.loadPublished(process.cwd()).enabled, true);
const feedRevues = feedLib.revueFeedEntries(process.cwd());
const revueIndex = JSON.parse(fs.readFileSync('data/revue/index.json', 'utf8'));
const latestMatin = revueIndex.find((e) => e.edition === 'matin');
const latestSoir = revueIndex.find((e) => e.edition === 'soir');
assert.ok(latestMatin && latestSoir, 'index des revues : au moins une édition du matin et une du soir');
assert.ok(feedRevues.some((e) => e.xml.includes(`revue/${latestMatin.id}`)), `feed.xml : la dernière revue du matin (${latestMatin.id}) est dans les 3 dernières`);
assert.ok(feedRevues.some((e) => e.xml.includes(`revue/${latestSoir.id}`)), `feed.xml : la dernière revue du soir (${latestSoir.id}) est dans les 3 dernières`);
assert.ok(fs.readFileSync('robots.txt', 'utf8').includes('sitemap-news.xml'), 'robots.txt : sitemap Google News une fois publiée');
assert.ok(fs.existsSync('sitemap-news.xml') && fs.existsSync('revue/index.html'), 'pages et sitemap de revue commités une fois publiée');
assert.ok(fs.existsSync('revue/2026-11-17-matin/index.html'), 'édition du matin du 17 nov. 2026 présente');
assert.ok(fs.existsSync('revue/2026-11-17-soir/index.html'), 'édition du soir du 17 nov. 2026 présente');
assert.ok(fs.existsSync('revue/2026-11-18-matin/index.html'), 'édition du matin du 18 nov. 2026 présente');
assert.ok(fs.existsSync('revue/2026-11-18-soir/index.html'), 'édition du soir du 18 nov. 2026 présente');
assert.match(fs.readFileSync('revue/index.html', 'utf8'), /href="\.\/2026-11-18-matin\/"/, 'index des archives : lien relatif vers l’édition, pas vers la racine');


// ── Éditions : 7 h et 19 h 15 heure de Montréal, été comme hiver (docs/revue.md, « Heures de publication ») ──
const on = L.mergeConfig({ publish: true });
assert.equal(L.editionAt(Date.parse('2026-11-17T12:01:00Z'), on)?.id, 'matin');     // 7 h 01 HNE
assert.equal(L.editionAt(Date.parse('2026-07-17T11:01:00Z'), on)?.id, 'matin');     // 7 h 01 HAE
assert.equal(L.editionAt(Date.parse('2026-11-17T11:40:00Z'), on), null);            // 6 h 40 : trop tôt
assert.equal(L.editionAt(Date.parse('2026-11-18T00:16:00Z'), on)?.key, '2026-11-17-soir'); // 19 h 16 HNE le 17
assert.equal(L.editionAt(Date.parse('2026-11-17T23:59:00Z'), on), null);            // 18 h 59 HNE : trop tôt
assert.equal(L.editionAt(Date.parse('2026-07-17T23:16:00Z'), on)?.id, 'soir');      // 19 h 16 HAE
assert.equal(L.editionAt(Date.parse('2026-11-18T01:01:00Z'), on)?.key, '2026-11-17-soir'); // 20 h 01 HNE : encore dans la fenêtre
assert.equal(L.refreshAt(Date.parse('2026-11-18T04:35:00Z'), on)?.key, '2026-11-17-soir'); // 23 h 35
assert.equal(L.refreshAt(Date.parse('2026-11-18T03:35:00Z'), on), null);            // 22 h 35 : trop tôt
assert.equal(L.mtlInstant('2026-11-17', '07:30'), Date.parse('2026-11-17T12:30:00Z'));
assert.equal(L.mtlInstant('2026-07-17', '07:30'), Date.parse('2026-07-17T11:30:00Z'));
assert.equal(L.mtlInstant('2026-03-08', '07:30'), Date.parse('2026-03-08T11:30:00Z'), 'passage à l’heure d’été');
assert.equal(R.isoMtl(Date.parse('2026-11-17T00:15:00Z')), '2026-11-16T19:15:00-05:00');
assert.equal(R.isoMtl(Date.parse('2026-07-16T23:15:00Z')), '2026-07-16T19:15:00-04:00');
assert.equal(L.reviewPath('2026-11-17', 'matin'), 'revue/2026-11-17-matin/');

// Crons de revue.yml alignés sur les fenêtres, été comme hiver : matin dans les 5 min. après 7 h ;
// soir peu après l'ouverture (19 h), assez tôt pour précéder le cron de La une (19 h 23) ; plus la mise à jour tardive.
{
  const wf = fs.readFileSync('.github/workflows/revue.yml', 'utf8');
  const crons = [...wf.matchAll(/- cron: '(\S+) (\S+) \* \* \*'/g)].flatMap(([, mi, hr]) => mi.split(',').flatMap(m => hr.split(',').map(h => [+h, +m])));
  for (const day of ['2026-01-15', '2026-07-15']) {
    const locals = crons.map(([h, m]) => L.mtl(Date.parse(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`)).minutes);
    assert.ok(locals.some(x => x >= 7 * 60 && x <= 7 * 60 + 5), `cron matin à l'heure (${day})`);
    assert.ok(locals.some(x => x >= 19 * 60 && x <= 19 * 60 + 10 && x < 19 * 60 + 23), `cron soir avant La une (${day})`);
    assert.ok(locals.some(x => x >= 23 * 60 && x <= 23 * 60 + 59), `cron de mise à jour tardive (${day})`);
  }
  assert.equal(on.editions.matin.target, '07:00'); assert.equal(on.editions.soir.target, '19:15');
  const file = L.mergeConfig(JSON.parse(fs.readFileSync('data/revue/config.json', 'utf8')));
  assert.deepEqual([file.editions.matin.target, file.editions.soir.target, file.editions.matin.periodStart, file.editions.soir.periodStart], ['07:00', '19:15', '19:15', '07:00']);
}

// Porte (publication activée) : édition due, déjà publiée, sautée, rafraîchissement.
const tM = Date.parse('2026-11-17T12:35:00Z');
assert.equal(gate({ now: tM, cfg: on }).due, true);
assert.equal(gate({ now: tM, cfg: on }).edition, 'matin');
assert.equal(gate({ now: tM, cfg: on }).id, '2026-11-17-matin', 'la porte expose l’identifiant complet pour les PDF');
assert.equal(gate({ now: tM, cfg: on, index: [{ id: '2026-11-17-matin' }] }).due, false);
assert.equal(gate({ now: tM, cfg: on, state: { '2026-11-17-matin': { skipped: true, why: 'rien' } } }).due, false);
assert.equal(gate({ now: Date.parse('2026-11-18T04:35:00Z'), cfg: on, index: [{ id: '2026-11-17-soir' }] }).mode, 'rafraichir');
assert.equal(gate({ now: Date.parse('2026-11-18T04:35:00Z'), cfg: on, index: [{ id: '2026-11-17-soir' }] }).id, '2026-11-17-soir');
assert.equal(gate({ now: Date.parse('2026-11-18T04:35:00Z'), cfg: on }).due, false, 'rien à rafraîchir sans revue du soir');

// Rattrapage daté (--day) : hors fenêtre du jour, sans écraser une édition déjà là.
{
  const wall = Date.parse('2026-11-21T18:00:00Z');
  const matinAt = L.mtlInstant('2026-11-20', '07:00');
  const soirAt = L.mtlInstant('2026-11-20', '19:15');
  assert.equal(resolveEditionClock({ day: '2026-11-20', edition: 'matin', cfg: on, wall }).now, matinAt, 'sans --at, le matin est à 7 h');
  assert.equal(resolveEditionClock({ day: '2026-11-20', edition: 'soir', cfg: on, wall }).now, soirAt, 'sans --at, le soir est à 19 h 15');
  assert.equal(resolveEditionClock({ day: '2026-11-20', at: '10:15', edition: 'matin', cfg: on, wall }).now, L.mtlInstant('2026-11-20', '10:15'), '--at explicite l’emporte');
  assert.equal(resolveEditionClock({ day: '2026-11-21', edition: 'matin', cfg: on, wall }).pastDate, false, 'le jour même garde la météo du moment');
  assert.equal(resolveEditionClock({ day: '2026-11-21', edition: 'matin', cfg: on, wall }).nominal, true, '7 h déjà passée : fenêtre nominale');
  assert.equal(resolveEditionClock({ day: '2026-11-20', edition: 'soir', cfg: on, wall }).pastDate, true);
  assert.equal(resolveEditionClock({ day: '2026-11-21', at: '07:00', edition: 'matin', cfg: on, wall: Date.parse('2026-11-21T10:00:00Z') }).nominal, false, 'exemple lancé avant 7 h : pas encore un rattrapage');
  const g20 = gate({ now: matinAt, cfg: on, forced: 'matin', backfill: true, index: [], wall });
  assert.equal(g20.due, true);
  assert.equal(g20.id, '2026-11-20-matin');
  assert.equal(g20.edition, 'matin');
  assert.equal(g20.mode, 'publier');
  assert.match(g20.why, /rattrapage/);
  assert.equal(gate({ now: soirAt, cfg: on, forced: 'soir', backfill: true, index: [], wall }).id, '2026-11-20-soir');
  assert.equal(gate({ now: L.mtlInstant('2026-11-20', '12:00'), cfg: on, forced: 'matin', backfill: true, index: [], wall }).due, true, 'midi, hors fenêtre : le rattrapage passe');
  assert.equal(gate({ now: matinAt, cfg: on, forced: 'matin', backfill: true, index: [{ id: '2026-11-20-matin' }], wall }).due, false);
  assert.match(gate({ now: matinAt, cfg: on, forced: 'matin', backfill: true, index: [{ id: '2026-11-20-matin' }], wall }).why, /déjà publiée/);
  assert.equal(gate({ now: tM, cfg: on, forced: 'matin', index: [{ id: '2026-11-17-matin' }] }).due, true, 'sans date : le forçage manuel reste dû, même si l’édition existe');
  assert.equal(gate({ now: matinAt, cfg: on, forced: 'auto', backfill: true, wall }).due, false, 'une date sans matin ni soir ne publie pas');
  assert.equal(gate({ now: matinAt, cfg: on, forced: 'matin', backfill: true, state: { '2026-11-20-matin': { skipped: true } }, wall }).due, true, 'un saut noté n’empêche pas le rattrapage manuel');
  assert.equal(gate({ now: L.mtlInstant('2099-01-02', '07:00'), cfg: on, forced: 'matin', backfill: true, wall }).due, false, 'pas de date future');
  assert.equal(gate({ now: matinAt, cfg: unpublished, forced: 'matin', backfill: true, wall }).due, false, 'publish = false bloque aussi le rattrapage');
}

// ── Données simulées ──
const T = (iso) => new Date(Date.parse(iso)).toISOString();
const news = { updated: T('2026-11-17T12:20:00Z'), items: [
  { source: 'Le Collectif', institution: 'Université de Sherbrooke', lang: 'fr', title: 'Le conseil municipal de Sherbrooke adopte son budget', link: 'https://lecollectif.ca/budget-sherbrooke/', author: 'Aurélie Souka et Caroline Lizin', date: T('2026-11-17T02:00:00Z'), excerpt: 'Le conseil municipal de Sherbrooke a adopté son budget 2027 lundi soir. Les étudiants réclament plus de logements.', imageLocal: 'assets/news-images/abc.jpg', sourceImageCredit: 'Photo : Jane Roy' },
  { source: 'The Link', institution: 'Concordia University', lang: 'en', title: 'Stingers 55, Martlets 54: Concordia takes it at the final buzzer', link: 'https://thelinknewspaper.ca/stingers-55-martlets-54/', author: 'Oliver Richman', date: T('2026-11-17T04:00:00Z'), excerpt: 'The Concordia Stingers edged the McGill Martlets in a tight basketball game.' },
  { source: 'Le Délit', institution: 'McGill University', lang: 'fr', title: 'Les Canadiens de Montréal gagnent encore', link: 'https://ledelit.ca/canadiens/', author: 'X Y', date: T('2026-11-17T05:00:00Z'), excerpt: 'LNH.' },
  { source: 'Le Délit', institution: 'McGill University', lang: 'fr', title: 'AFC Toronto are Diana B. Matheson Cup champions', link: 'https://ledelit.ca/afc/', author: 'X Y', date: T('2026-11-17T05:10:00Z'), excerpt: 'Soccer pro.' },
  { source: 'Quartier Libre', institution: 'Université de Montréal', lang: 'fr', title: 'La génération Z et le retour des médias physiques', link: 'https://quartierlibre.ca/gen-z/', author: 'La rédaction', date: T('2026-11-17T11:00:00Z'), excerpt: 'Disques vinyles, journaux papier et cassettes reviennent à la mode chez les jeunes.' },
  { source: 'La Pige', institution: 'Cégep de Jonquière', lang: 'fr', title: 'Article trop vieux', link: 'https://lapige.ca/vieux/', author: 'A B', date: T('2026-11-16T20:00:00Z'), excerpt: 'Hors période.' },
] };
const team = (id, nickname, inst, results = [], nextGames = []) => ({ id, sport: 'basketball', sportLabel: 'Basketball', sex: 'F', sector: 'universitaire', nickname, institutionLabel: inst, leagueLabel: 'Basketball universitaire féminin', results, nextGames });
const masthead = { teams: {
  a: team('a', 'Stingers', 'Université Concordia', [{ gameId: 'g1', date: '2026-11-16', scoreFor: 55, scoreAgainst: 54, opponentNickname: 'Martlets', opponentFullName: 'Université McGill' }], [{ gameId: 'n1', date: '2026-11-19', time: '18:00', home: true, opponentNickname: 'Carabins', opponentFullName: 'Université de Montréal' }]),
  b: team('b', 'Martlets', 'Université McGill', [{ gameId: 'g1', date: '2026-11-16', scoreFor: 54, scoreAgainst: 55, opponentNickname: 'Stingers', opponentFullName: 'Université Concordia' }]),
} };
const schedules = { stations: { cism: { name: 'CISM 89,3', grid: [
  { day: 2, start: '08:00', end: '08:59', title: 'La collation', url: 'https://cism893.ca/emissions/la-collation' },
  { day: 2, start: '09:00', end: '10:00', title: 'La collation (reprise)' },
  { day: 2, start: '20:00', end: '22:00', title: 'Mono Fred', url: 'https://cism893.ca/emissions/mono-fred' },
] } } };

// ── Période et sélection ──
const ed = L.editionFor('matin', tM, on);
const period = L.periodOf(ed, tM, [], on);
assert.equal(period.start, Date.parse('2026-11-17T00:15:00Z'), 'matin : depuis 19 h 15 la veille');
assert.equal(L.periodOf(ed, tM, [{ id: '2026-11-16-matin', periodEnd: '2026-11-16T15:00:00Z' }], on).start, Date.parse('2026-11-16T15:00:00Z'), 'revue du soir sautée : la période recule jusqu’à la revue précédente');
const items = L.selectArticles(news, period, { max: 40 });
assert.deepEqual(items.map(x => x.source), ['Quartier Libre', 'The Link', 'Le Collectif'], 'période, plus récent d’abord, sport pro exclu (LNH, AFC Toronto), article hors période exclu');
const coll = items.find(x => x.source === 'Le Collectif');
assert.deepEqual(coll.authors, ['Aurélie Souka', 'Caroline Lizin'], 'tous les auteurs');
assert.equal(coll.institution, 'UdeS', 'sigle seul, comme dans La une (jamais « Nom complet (SIGLE) »)');
assert.equal(items.find(x => x.source === 'The Link').institution, 'Concordia');
assert.equal(coll.theme, 'Politique');
assert.equal(L.selectArticles(news, period, { coveredIds: new Set([coll.id]) }).some(x => x.id === coll.id), false, 'anti-doublon entre éditions');
// Dans un thème, un média ne revient qu'après les autres. Sous le plafond, rien n'est écarté. « À la une » reste le plus récent.
{
  const burst = { items: [
    { source: 'Quartier Libre', institution: 'Université de Montréal', lang: 'fr', title: 'Le conseil municipal vote le budget étudiant', link: 'https://quartierlibre.ca/budget-burst/', author: 'D E', date: T('2026-11-17T11:30:00Z'), excerpt: 'Le conseil municipal a voté.' },
    { source: 'The Concordian', institution: 'Concordia University', lang: 'en', title: 'Fall concert opens the season', link: 'https://theconcordian.com/concert-a/', author: 'A', date: T('2026-11-17T10:00:00Z'), excerpt: 'A concert downtown.' },
    { source: 'The Concordian', institution: 'Concordia University', lang: 'en', title: 'Second concert review of the night', link: 'https://theconcordian.com/concert-b/', author: 'B', date: T('2026-11-17T09:00:00Z'), excerpt: 'Another concert review.' },
    { source: 'The Link', institution: 'Concordia University', lang: 'en', title: 'A packed concert hall downtown', link: 'https://thelinknewspaper.ca/concert-c/', author: 'C', date: T('2026-11-17T08:00:00Z'), excerpt: 'A concert.' },
  ] };
  const all = L.selectArticles(burst, period, { max: 40 });
  assert.equal(all[0].source, 'Quartier Libre', 'la liste plate commence par le plus récent');
  assert.equal(all.length, 4, 'sous le plafond, la rafale reste dans le corps');
  const culture = L.groupByTheme(all).find(g => g.theme === 'Culture');
  assert.deepEqual(culture.items.map(x => x.title), [
    'Fall concert opens the season',
    'A packed concert hall downtown',
    'Second concert review of the night',
  ], 'dans le thème : un titre par média, puis la répétition');
  assert.equal(R.groupByTheme(all).find(g => g.theme === 'Culture').items[1].source, 'The Link', 'la page rend le même ordre');
  const capped = L.selectArticles(burst, period, { max: 3 });
  assert.equal(capped[0].source, 'Quartier Libre');
  assert.deepEqual(capped.map(x => x.source), ['Quartier Libre', 'The Concordian', 'The Link'], 'au plafond, on coupe la répétition avant le seul titre d’un autre média');
  const tight = L.selectArticles(burst, period, { max: 2 });
  assert.deepEqual(tight.map(x => x.link), ['https://quartierlibre.ca/budget-burst/', 'https://theconcordian.com/concert-a/'], 'si les premiers titres dépassent le plafond, on garde les plus récents');
}
assert.equal(L.authorsLine(['A', 'B', 'C']), 'Par A, B et C');
assert.ok(L.shortExcerpt('a '.repeat(300), 200).length <= 201);

// ── Sport et radio ──
const sp = L.periodSports(masthead, ed, { cfg: on });
assert.equal(sp.results.length, 1, 'une rencontre vue par les deux équipes n’apparaît qu’une fois');
assert.equal(sp.results[0].text, 'Stingers (Concordia) 55-54 Martlets (McGill)');
assert.equal(sp.results[0].sport, 'Basketball (F)');
assert.equal(sp.next.length, 1); assert.match(sp.next[0].text, /Stingers \(Concordia\) reçoit Carabins \(UdeM\)/);
assert.equal(L.periodSports(masthead, ed, { cfg: on, coveredKeys: new Set([sp.results[0].key]) }).results.length, 0, 'résultat déjà publié : pas repris');
assert.equal(L.periodSports(masthead, L.editionFor('soir', Date.parse('2026-11-17T23:59:00Z'), on), { cfg: on }).results.length, 0, 'soir : résultats du jour même seulement');
// Soir à 19 h 15 : les matchs du jour même qui commencent à 19 h 15 ou après sont annoncés, pas ceux déjà commencés.
const tonight = { teams: { c: team('c', 'Rouge et Or', 'Université Laval', [], [
  { gameId: 't1', date: '2026-11-17', time: '19:00', home: true, opponentNickname: 'Vert & Or', opponentFullName: 'Université de Sherbrooke' },
  { gameId: 't2', date: '2026-11-17', time: '21:00', home: false, opponentNickname: 'Carabins', opponentFullName: 'Université de Montréal' },
  { gameId: 't3', date: '2026-11-18', time: '18:00', home: true, opponentNickname: 'Gee-Gees', opponentFullName: 'Université d’Ottawa' }]) } };
const edSoir = L.editionFor('soir', Date.parse('2026-11-18T01:01:00Z'), on);
assert.deepEqual(L.periodSports(tonight, edSoir, { cfg: on, at: '19:15' }).next.map(r => r.time), ['21:00', '18:00'], 'soir : matchs à 19 h 15 ou après ce jour-là, puis du lendemain');
assert.deepEqual(L.periodSports(tonight, ed, { cfg: on }).next.map(r => r.time), ['19:00', '21:00', '18:00'], 'matin : tous les matchs du jour');
const radio = L.periodRadio(schedules, ed, on);
assert.deepEqual(radio.map(s => s.shows.map(x => `${x.when} ${x.title}`)), [['8 h à 9 h La collation']], 'matin : émissions originales du jour, sans reprise');
assert.deepEqual(L.periodRadio(schedules, { ...ed, id: 'soir' }, on)[0].shows.map(x => x.title), ['Mono Fred']);

// ── Garde-fou des textes d'IA ──
const src = L.itemSource(coll);
assert.equal(L.textReject('Le conseil municipal de Sherbrooke adopte son budget, et les étudiants réclament plus de logements.', src), null);
assert.match(L.textReject('Le conseil de Sherbrooke adopte un budget de 45 millions pour les étudiants du campus.', src), /chiffre absent/);
assert.match(L.textReject('Le maire Gagnon fait adopter le budget de Sherbrooke devant les étudiants du campus.', src), /nom absent/);
assert.match(L.textReject('Le conseil municipal de Sherbrooke adoptera demain son budget pour les étudiants.', src), /relative/);
assert.match(L.textReject('Le conseil municipal adopte son budget pendant le week-end, selon les étudiants.', src), /relative|week-end/);
assert.match(L.textReject('The Sherbrooke city council adopted its budget and students want more housing now.', src), /français/);
assert.match(L.textReject('Le conseil municipal « adopte » son budget, disent les étudiants de Sherbrooke.', src), /guillemet/);
assert.match(L.textReject('Court.', src), /longueur/);
assert.match(L.textReject('Le conseil municipal de Sherbrooke adopte trois budgets pour les étudiants du campus.', src), /nombre absent \(trois\)/);
assert.equal(L.textReject('Bishop’s offre désormais trois nouveaux programmes de maîtrise aux étudiants.', 'Bishop’s they now have three new master’s programs'), null);
// Fidélité au titre : pas de confusion de personnes, pas d'affirmation d'un titre interrogatif.
const carney = { title: 'Mark Carney dévoile ses ambitions économiques', lang: 'fr', source: 'Le Collectif', authors: [], excerpt: 'Le 5 novembre dernier, François-Philippe Champagne, ministre des Finances du Canada, a déposé le plus récent budget du gouvernement canadien.' };
assert.deepEqual(L.titleNames(carney.title), ['Mark Carney']);
assert.deepEqual(L.titleNames('Le Vert & Or triomphe sous les yeux des anciens'), []);
assert.deepEqual(L.titleNames('Le Québec s’unit afin de prévenir les violences conjugales'), []);
assert.match(L.itemReject('Le ministre des Finances du Canada dévoile ses ambitions économiques pour le budget.', carney), /nom du titre absent \(Mark Carney\)/);
assert.match(L.itemReject('Mark Carney dévoile ses ambitions économiques.', { ...carney, excerpt: carney.excerpt + ' Mark Carney dévoile ses ambitions économiques.' }), /répète le titre|longueur/);
assert.equal(L.itemReject('Mark Carney dévoile les ambitions économiques du gouvernement canadien dans le budget.', carney), null);
const ganesha = { title: 'Can Ganesha Help You Pass Your Midterms?', lang: 'en', source: 'The Link', authors: [], excerpt: 'The colour of the day at the Hindu Mission of Canada’s Montreal temple is a bright, almost neon orange.' };
assert.match(L.itemReject('La couleur orange peut aider les étudiants à passer leurs examens de mi-session.', ganesha), /interrogatif/);
assert.equal(L.itemReject('Ganesha peut-il aider les étudiants de Montreal à réussir leurs examens de mi-session?', ganesha), null);

// ── IA simulée : réponse valide, hallucination, panne, IA absente ──
const env = { CLOUDFLARE_AI_TOKEN: 'jeton-factice', CLOUDFLARE_ACCOUNT_ID: 'compte-factice' };
const reply = (obj) => async () => ({ ok: true, json: async () => ({ result: { response: JSON.stringify(obj) } }) });
let calls = 0;
const good = async (url, opts) => {
  calls++;
  assert.ok(!String(url).includes('jeton-factice'), 'le jeton ne passe jamais dans l’URL');
  const body = JSON.parse(opts.body).messages[0].content;
  if (body.includes('chapeau')) return reply({ chapeau: 'Le Collectif suit le budget du conseil municipal de Sherbrooke, tandis que The Link raconte la victoire des Stingers sur les Martlets au basketball.' })();
  return reply({ items: [
    { n: 1, resume: 'Disques vinyles, journaux papier et cassettes reviennent à la mode chez les jeunes.', theme: 'Culture' },
    { n: 2, resume: 'Les Stingers de Concordia battent de justesse les Martlets de McGill en basketball.', theme: 'Sport' },
    { n: 3, resume: 'Le maire Tremblay annonce 300 nouveaux logements pour les étudiants de Sherbrooke.', theme: 'Politique' },
  ] })();
};
const ai = await aiReview(items, { env, fetchImpl: good });
assert.equal(ai.items[items[0].id].resume.startsWith('Disques'), true);
assert.equal(ai.items[items[0].id].theme, 'Culture');
assert.equal(ai.items[items[1].id].resume.includes('Stingers'), true, 'résumé français d’un article anglais accepté (noms présents dans la source)');
assert.equal(ai.items[coll.id].resume, '', 'hallucination (maire Tremblay, 300) refusée : repli sur l’extrait');
assert.ok(ai.chapeau.startsWith('Le Collectif suit'));
assert.ok(ai.log.some(l => /repli \(extrait\)/.test(l)));
assert.ok(!JSON.stringify(ai.log).includes('jeton-factice'), 'aucun secret dans le journal');
const down = await aiReview(items, { env, fetchImpl: async () => ({ ok: false, status: 429 }) });
assert.deepEqual(Object.values(down.items).filter(x => x.resume), []); assert.equal(down.chapeau, '');
assert.ok(down.log.some(l => /quota/.test(l)));
const thrown = await aiReview(items, { env, fetchImpl: async () => { throw new Error('réseau'); } });
assert.equal(thrown.chapeau, '');
calls = 0; const off = await aiReview(items, { env: {}, fetchImpl: good });
assert.equal(calls, 0, 'sans secrets : aucun appel'); assert.match(off.log[0], /désactivée/);
assert.match(itemsPrompt(items), /FRANÇAIS/); assert.match(itemsPrompt(items), /week-end/);
// Amorce d'IA : formule creuse, aucun média, nom ou chiffre inventé → refus ; amorce déterministe naturelle.
assert.match(L.ledeReject('Les médias étudiants québécois abordent des sujets variés, de la politique municipale à la culture.', items), /générique/);
assert.match(L.ledeReject('Le budget du conseil municipal de Sherbrooke et le retour des médias physiques chez les jeunes retiennent l’attention.', items), /aucun média/);
assert.match(L.ledeReject('Le Collectif rapporte que le maire Gagnon fait adopter le budget de Sherbrooke devant les étudiants.', items), /nom absent/);
assert.equal(L.ledeReject('Le Collectif suit le budget du conseil municipal de Sherbrooke, tandis que The Link raconte la victoire des Stingers sur les Martlets.', items), null);
assert.match(L.ledeReject('Le Collectif suit le budget du conseil municipal de Sherbrooke, tandis que Le Link raconte la victoire des Stingers sur les Martlets.', items), /média altéré/, '« Le Link » pour The Link');
assert.match(L.ledeReject('Le Collectif suit le budget du conseil municipal de Sherbrooke, tandis que Le Collectif raconte la victoire des Stingers sur les Martlets.', items), /média répété/);
assert.match(L.ledeReject('Le Collectif suit le budget du conseil municipal de Sherbrooke, tandis que The Link raconte la partnership des Stingers et des Martlets.', items), /anglais/);
{ const it = (title, source) => ({ title, source, excerpt: '', lang: 'fr', authors: [] });
  const pool = [it('Grammys 2027 : vent de folie québécois et triomphe féminin', 'La Pige'), it('La génération Z et le retour des médias physiques', 'Quartier Libre')];
  assert.match(L.ledeReject('La Pige plonge dans la folie des Grammys 2027, et la génération Z redécouvre les médias physiques selon elle.', pool), /attribution douteuse \(La Pige : (generation|medias|physiques)\)/, 'sujet de Quartier Libre prêté à La Pige');
  assert.equal(L.ledeReject('La Pige raconte le vent de folie québécois aux Grammys 2027, tandis que Quartier Libre explore le retour des médias physiques chez la génération Z.', pool), null);
  assert.match(L.ledeReject('La Pige nous plonge dans la folie des Grammys 2027, tandis que Quartier Libre explore le retour des médias physiques.', pool), /générique/, '« nous » : ton de journal'); }
assert.match(chapeauPrompt(items, 'matin'), /La revue du matin/); assert.match(chapeauPrompt(items), /ne compte pas les articles/);

// ── Génération complète, validation et refus ──
const io = { cfg: on, index: [], reviews: {}, news, masthead, schedules, env, fetchImpl: good };
const r1 = await generate('matin', tM, io);
assert.equal(r1.status, 'publiée', JSON.stringify(r1.problems || r1.why));
const m = r1.model;
assert.equal(m.id, '2026-11-17-matin'); assert.equal(m.items.length, 3); assert.ok(m.generator.startsWith('ia:'));
assert.equal(m.items.find(x => x.id === coll.id).resume, '', 'résumé halluciné jamais publié');
assert.equal(m.image.url, 'https://le-radar.ca/assets/news-images/abc.jpg'); assert.equal(m.image.credit, 'Photo : Jane Roy');
assert.deepEqual(L.validateReview(m, { news, masthead, schedules }), []);
const noAi = await generate('matin', tM, { ...io, env: {} });
assert.equal(noAi.status, 'publiée'); assert.equal(noAi.model.generator, 'gabarit'); assert.equal(noAi.model.chapeau, '');
assert.ok(noAi.model.items.every(x => !x.resume && x.excerpt), 'gabarit : extraits d’origine');
// Amorce déterministe : phrases de rédaction, aucun décompte ni parenthèse de comptage.
assert.equal(noAi.model.intro, 'Pour ouvrir la journée, Le Collectif publie «\u00a0Le conseil municipal de Sherbrooke adopte son budget\u00a0», sous la plume d’Aurélie Souka et Caroline Lizin. À lire aussi : «\u00a0La génération Z et le retour des médias physiques\u00a0» dans Quartier Libre, et «\u00a0Stingers 55, Martlets 54: Concordia takes it at the final buzzer\u00a0» dans The Link. Sur les terrains, en basketball (F) : Stingers (Concordia) 55, Martlets (McGill) 54.');
assert.doesNotMatch(noAi.model.intro, /« | »/, 'guillemets tenus par des espaces insécables');
assert.doesNotMatch(noAi.model.intro + noAi.model.description, /\(\d+\)|\d+ articles?|\d+ médias?|réunit|Au sommaire/, 'aucun décompte mécanique');
assert.match(noAi.model.description, /^La revue du matin du mardi 17 novembre 2026\. Pour ouvrir la journée, Le Collectif publie/);
assert.equal(L.ledeSport({ sports: { results: [], next: [{ date: '2026-11-19', time: '18:00', text: 'Stingers (Concordia) reçoit Carabins (UdeM)' }] }, radio: [] }), 'Côté sport étudiant, prochain rendez-vous le jeudi 19 novembre à 18 h : Stingers (Concordia) reçoit Carabins (UdeM).');
assert.equal(L.ledeSport({ sports: { results: [], next: [] }, radio: [{ station: 'CISM 89,3', shows: [{ title: 'La collation', when: '8 h à 9 h' }] }] }), 'À l’antenne, CISM 89,3 propose «\u00a0La collation\u00a0», de 8 h à 9 h.');
{ const it = (title, source, o = {}) => ({ title, source, authors: [], lang: 'fr', ...o });
  const t = L.ledeNews({ edition: { id: 'matin' }, items: [it('Le revenu viable', 'La Pige', { image: 'x' }), it('Le Vert & Or triomphe', 'Le Collectif'), it('« Soutenons le journalisme » : Sherbrooke accueille la FPJQ', 'Le Collectif')] });
  assert.equal(t, 'Pour ouvrir la journée, La Pige publie «\u00a0Le revenu viable\u00a0». À lire aussi : «\u00a0Le Vert & Or triomphe\u00a0» et «\u00a0“Soutenons le journalisme” : Sherbrooke accueille la FPJQ\u00a0» dans Le Collectif.', 'même média regroupé ; guillemets internes de second niveau'); }
// Toute donnée modifiée est refusée.
const tamper = (f) => { const c = structuredClone(m); f(c); return L.validateReview(c, { news, masthead, schedules }); };
assert.ok(tamper(c => { c.items[0].link = 'https://exemple.com/invente'; }).some(p => /lien absent/.test(p)));
assert.ok(tamper(c => { c.items[2].authors = ['Aurélie Souka']; }).some(p => /auteurs différents/.test(p)), 'un auteur oublié = refus');
assert.ok(tamper(c => { c.items[0].title = 'Titre inventé'; }).some(p => /titre modifié/.test(p)));
assert.ok(tamper(c => { c.items[0].excerpt = 'Phrase inventée.'; }).some(p => /extrait absent/.test(p)));
assert.ok(tamper(c => { c.items[0].resume = 'Le ministre Dupont annonce 12 millions pour les jeunes du campus.'; }).some(p => /résumé refusé/.test(p)));
assert.ok(tamper(c => { c.sports.results[0].teams[0].score = 99; }).some(p => /résultat absent/.test(p)));
assert.ok(tamper(c => { c.radio[0].shows[0].title = 'Émission inventée'; }).some(p => /émission absente/.test(p)));
assert.ok(tamper(c => { c.items = []; }).some(p => /vide/.test(p)), 'revue vide refusée');
// Rien de neuf : édition sautée (comme La une du soir).
const skip = await generate('soir', Date.parse('2026-11-18T00:16:00Z'), { ...io, index: [{ id: m.id, periodEnd: new Date(m.period.end).toISOString(), datePublished: m.datePublished, articleIds: m.articleIds, sportKeys: m.sportKeys }] });
assert.equal(skip.status, 'sautée'); assert.match(skip.why, /aucun nouvel article/);
// news.json périmé : doute, rien ne sort.
const stale = await generate('matin', tM, { ...io, news: { ...news, updated: T('2026-11-16T12:00:00Z') } });
assert.equal(stale.status, 'refusée'); assert.ok(stale.problems.some(p => /DOUTE/.test(p)));
// Exemple « 7 h » lancé avant 7 h (aperçu de PR) : la collecte de la nuit est encore fraîche.
{
  const seven = Date.parse('2026-11-19T12:00:00Z');
  const wall = Date.parse('2026-11-19T05:45:00Z');
  const nightItem = { source: 'Le Collectif', institution: 'Université de Sherbrooke', lang: 'fr', title: 'Le conseil municipal de Sherbrooke adopte son budget', link: 'https://lecollectif.ca/budget-sherbrooke/', author: 'Aurélie Souka', date: T('2026-11-19T04:00:00Z'), excerpt: 'Le conseil municipal de Sherbrooke a adopté son budget 2027 lundi soir. Les étudiants réclament plus de logements.' };
  const night = { updated: T('2026-11-19T05:07:00Z'), items: [nightItem] };
  const preview = await generate('matin', seven, { ...io, news: night, wallClock: wall, env: {} });
  assert.equal(preview.status, 'publiée', 'collecte de la nuit : l’exemple de 7 h ne doit pas être refusé avant 7 h ' + JSON.stringify(preview.problems || preview.why));
  const atSeven = await generate('matin', seven, { ...io, news: night, wallClock: seven, env: {} });
  assert.equal(atSeven.status, 'refusée', 'à 7 h, une collecte de 00 h 07 est périmée');
  assert.ok((atSeven.problems || []).some((p) => /DOUTE/.test(p)));
}
assert.equal((await generate('matin', tM, { ...io, index: [{ id: m.id }] })).status, 'inchangée', 'une édition déjà publiée n’est pas refaite');
// Rattrapage du 20 nov. : fenêtre nominale, sport de cette date, météo omise, pas d’écrasement.
{
  const wall = Date.parse('2026-11-21T18:00:00Z');
  const matinAt = L.mtlInstant('2026-11-20', '07:00');
  const soirAt = L.mtlInstant('2026-11-20', '19:15');
  const night = { source: 'Le Collectif', institution: 'Université de Sherbrooke', lang: 'fr', title: 'Le conseil municipal de Sherbrooke adopte son budget', link: 'https://lecollectif.ca/nuit-20/', author: 'Aurélie Souka', date: T('2026-11-20T04:00:00Z'), excerpt: 'Le conseil municipal de Sherbrooke a adopté son budget 2027 lundi soir. Les étudiants réclament plus de logements.' };
  const dayItem = { ...night, title: 'Le conseil municipal de Sherbrooke présente son budget étudiant', link: 'https://lecollectif.ca/jour-20/', date: T('2026-11-20T18:00:00Z'), excerpt: 'Le conseil municipal de Sherbrooke a présenté son budget étudiant aux associations.' };
  const sports20 = { teams: { a: team('a', 'Stingers', 'Université Concordia', [
    { gameId: 'r19', date: '2026-11-19', scoreFor: 1, scoreAgainst: 0, opponentNickname: 'Rouge et Or', opponentFullName: 'Université Laval' },
    { gameId: 'r20', date: '2026-11-20', scoreFor: 3, scoreAgainst: 2, opponentNickname: 'Carabins', opponentFullName: 'Université de Montréal' },
    { gameId: 'r21', date: '2026-11-21', scoreFor: 9, scoreAgainst: 0, opponentNickname: 'Vert & Or', opponentFullName: 'Université de Sherbrooke' },
  ], [
    { gameId: 'n19h', date: '2026-11-20', time: '19:00', home: true, opponentNickname: 'Rouge et Or', opponentFullName: 'Université Laval' },
    { gameId: 'n21h', date: '2026-11-20', time: '21:00', home: false, opponentNickname: 'Carabins', opponentFullName: 'Université de Montréal' },
    { gameId: 'n22', date: '2026-11-22', time: '18:00', home: true, opponentNickname: 'Gee-Gees', opponentFullName: 'Université d’Ottawa' },
  ]) } };
  let weatherCalls = 0;
  const base20 = {
    cfg: on, index: [], reviews: {}, schedules, env: {}, masthead: sports20, wallClock: wall, nominal: true,
    fetchWeather: async () => { weatherCalls += 1; throw new Error('datamart'); },
  };
  const morningNews = { updated: T('2026-11-20T11:30:00Z'), items: [night, dayItem] };
  const am = await generate('matin', matinAt, { ...base20, news: morningNews });
  assert.equal(am.status, 'publiée', JSON.stringify(am.problems || am.why));
  assert.equal(am.model.id, '2026-11-20-matin');
  assert.equal(am.model.datePublished, new Date(matinAt).toISOString(), 'la date de publication est 7 h, pas l’horloge du rattrapage');
  assert.equal(am.model.period.start, L.mtlInstant('2026-11-19', '19:15'));
  assert.equal(am.model.period.end, matinAt);
  assert.deepEqual(am.model.items.map(x => x.link), ['https://lecollectif.ca/nuit-20/'], 'matin : la nuit seulement');
  assert.deepEqual([...new Set(am.model.sports.results.map(r => r.date))].sort(), ['2026-11-19', '2026-11-20'], 'sport du 19 et du 20, pas celui du 21');
  assert.equal(weatherCalls, 0, 'date passée : la météo n’est pas relue');
  assert.equal(am.model.weather, undefined, 'bloc météo omis');
  const again = await generate('matin', matinAt, { ...base20, news: morningNews, index: [{ id: '2026-11-20-matin' }] });
  assert.equal(again.status, 'inchangée', 'édition déjà là : pas d’écrasement sans --refresh');
  assert.equal(again.model, undefined);
  const prevEarly = { id: '2026-11-19-soir', periodEnd: '2026-11-19T17:00:00.000Z', datePublished: '2026-11-19T17:00:00.000Z', articleIds: [], sportKeys: [] };
  const eveningNews = { updated: T('2026-11-21T00:00:00Z'), items: [night, dayItem] };
  const pm = await generate('soir', soirAt, { ...base20, news: eveningNews, index: [prevEarly] });
  assert.equal(pm.status, 'publiée', JSON.stringify(pm.problems || pm.why));
  assert.equal(pm.model.id, '2026-11-20-soir');
  assert.equal(pm.model.datePublished, new Date(soirAt).toISOString());
  assert.equal(pm.model.period.start, L.mtlInstant('2026-11-20', '07:00'), 'le soir daté commence à 7 h');
  assert.deepEqual(pm.model.items.map(x => x.link), ['https://lecollectif.ca/jour-20/']);
  assert.deepEqual([...new Set(pm.model.sports.results.map(r => r.date))], ['2026-11-20']);
  assert.deepEqual(pm.model.sports.next.filter(r => r.date === '2026-11-20').map(r => r.time), ['21:00'], 'matchs du soir à partir de 19 h 15');
  assert.equal(pm.model.weather, undefined);
  const swallowed = await generate('soir', soirAt, { ...base20, nominal: false, news: eveningNews, index: [prevEarly] });
  assert.equal(swallowed.status, 'publiée', JSON.stringify(swallowed.problems || swallowed.why));
  assert.ok(swallowed.model.items.some(x => x.link.includes('nuit-20')), 'sans --day, le soir reprend une édition du matin sautée');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'revue-ordre-'));
  fs.writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  const order = [
    { id: '2026-11-21-matin', datePublished: '2026-11-21T12:00:00.000Z', periodEnd: '2026-11-21T12:00:00.000Z', edition: 'matin', day: '2026-11-21', path: 'revue/2026-11-21-matin/', url: 'https://le-radar.ca/revue/2026-11-21-matin/', headline: 'plus tard', articleIds: [], sportKeys: [] },
    { id: '2026-11-19-soir', datePublished: '2026-11-20T00:15:00.000Z', periodEnd: '2026-11-20T00:15:00.000Z', edition: 'soir', day: '2026-11-19', path: 'revue/2026-11-19-soir/', url: 'https://le-radar.ca/revue/2026-11-19-soir/', headline: 'plus tôt', articleIds: [], sportKeys: [] },
  ];
  writeOutputs(dir, { model: am.model, index: order, reviews: {}, publish: false, now: matinAt, cfg: on });
  writeOutputs(dir, { model: pm.model, index: order, reviews: {}, publish: false, now: soirAt, cfg: on });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'data/revue/index.json'), 'utf8')).map(r => r.id), ['2026-11-21-matin', '2026-11-20-soir', '2026-11-20-matin', '2026-11-19-soir'], 'index chronologique, pas l’ordre d’écriture');
  fs.rmSync(dir, { recursive: true, force: true });
}
// Mise à jour tardive : un nouveau résultat du jour avance dateModified, rien d'autre ne change.
const soirAt = Date.parse('2026-11-17T00:16:00Z');
const soir = (await generate('soir', soirAt, { ...io, news: { ...news, updated: T('2026-11-17T00:10:00Z') }, env: {} })).model;
assert.ok(soir); assert.equal(soir.sports.results.length, 1, 'soir du 16 : résultat du 16');
const late = structuredClone(masthead); late.teams.c = team('c', 'Carabins', 'Université de Montréal', [{ gameId: 'g9', date: '2026-11-16', scoreFor: 70, scoreAgainst: 60, opponentNickname: 'Rouge et Or', opponentFullName: 'Université Laval' }]);
const ref = await generate('soir', Date.parse('2026-11-17T03:50:00Z'), { ...io, masthead: late, refresh: true, index: [{ id: soir.id }], reviews: { [soir.id]: soir } });
assert.equal(ref.status, 'publiée'); assert.equal(ref.model.sports.results.length, 2); assert.equal(ref.model.items.length, soir.items.length);
assert.equal(ref.model.datePublished, soir.datePublished); assert.ok(Date.parse(ref.model.dateModified) > Date.parse(soir.dateModified));
assert.equal((await generate('soir', Date.parse('2026-11-17T03:50:00Z'), { ...io, refresh: true, index: [{ id: soir.id }], reviews: { [soir.id]: soir } })).status, 'inchangée');

// ── Rendu de la page ──
const html = R.renderReviewPage(m);
assert.match(html, /<link rel="canonical" href="https:\/\/le-radar\.ca\/revue\/2026-11-17-matin\/" \/>/);
assert.match(html, /<meta property="og:type" content="article" \/>/);
assert.match(html, /<meta property="og:image" content="https:\/\/le-radar\.ca\/assets\/news-images\/abc\.jpg" \/>/);
assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);
assert.match(html, /<meta name="twitter:title" content="La revue du matin du mardi 17 novembre 2026" \/>/);
assert.match(html, /<meta property="article:published_time" content="2026-11-17T07:3\d:00-05:00" \/>/);
assert.match(html, /<p class="revue-disclosure">Revue préparée automatiquement par Le Radar à partir des sources citées ; chaque texte, titre et photo appartient à son média et à ses auteurs\.<\/p>\s*<\/article>/, 'transparence : une phrase discrète en pied d’article');
assert.doesNotMatch(R.articleBody(m), /revue-note|🤖/, 'plus d’encadré « générée automatiquement » en ouverture');
assert.doesNotMatch(html, /revue-count|\(\d+\)<\/h[234]>/, 'aucun décompte entre parenthèses dans les intertitres');
assert.match(html, /<p class="seo-lead revue-lede">Le Collectif suit le budget[^<]*Martlets au basketball\. Sur les terrains, en basketball \(F\) : Stingers \(Concordia\) 55, Martlets \(McGill\) 54\.<\/p>/, 'amorce : IA vérifiée puis phrase sportive');
assert.match(html, /<link rel="stylesheet" href="\.\.\/\.\.\/revue\.css" \/>/);
assert.match(html, /<script src="\.\.\/\.\.\/seo-page-theme\.js"><\/script>/, 'modes clair et sombre du site');
for (const x of m.items) {
  assert.ok(html.includes(`href="${x.link}"`), `lien original : ${x.link}`);
  for (const a of x.authors) assert.ok(html.includes(a), `auteur crédité : ${a}`);
}
assert.ok(html.includes('Par <span class="notranslate" translate="no">Aurélie Souka et Caroline Lizin</span>'));
assert.ok(html.includes('Stingers (Concordia) 55-54 Martlets (McGill)'));
assert.ok(html.includes('<span class="revue-item__inst">UdeS</span>') && !/Université de Sherbrooke \(UdeS\)/.test(html), 'établissement : sigle seul');
assert.ok(R.articleBody({ ...m, items: m.items.map(x => ({ ...x, institution: 'Université de Sherbrooke (UdeS)' })) }).includes('<span class="revue-item__inst">UdeS</span>'), 'revue déjà générée « Nom (SIGLE) » : sigle seul au rendu');
assert.match(html, /<header class="revue-flag" aria-hidden="true">[\s\S]*assets\/icon\.svg[\s\S]*LE-RADAR\.ca[\s\S]*La revue du matin[\s\S]*<\/header>/, 'manchette imprimée : logo à gauche du mot-symbole, édition');
assert.match(html, /revue-flag__ears">[\s\S]*Revue de presse <em class="revue-flag__etudiante">étudiante<\/em>/, 'manchette : accent typographique sur « étudiante »');
{
  const colo = (html.match(/<aside class="revue-colophon"[\s\S]*?<\/aside>/) || [''])[0];
  assert.ok(colo, 'colophon imprimé en fin d’édition');
  assert.equal((html.match(/class="revue-colophon"/g) || []).length, 1, 'colophon une seule fois, pas répété');
  for (const t of ['Le Réseau Académique de Découverte et d’Agrégation de Ressources', 'indépendant et non officiel', 'azdak-qc@proton.me', 'GNU GPL v2', 'le-radar.ca/revue', 'Conçu avec ♡ par Azdak en 2026', 'Revue préparée automatiquement'])
    assert.ok(colo.replace(/'/g, '’').includes(t.replace(/'/g, '’')), `colophon : ${t}`);
  assert.match(html, /<a class="revue-top__qr" href="[^"]+" tabindex="-1"><svg[^>]*class="revue-top__qrcode"[\s\S]*?<path fill="#000" d="M[\s\S]*?<span>Lire en ligne<\/span><\/a>/, 'code QR à droite, sous le folio, au-dessus de « Dans cette édition »');
  assert.doesNotMatch(html, /revue-flag__qr/, 'plus de code QR dans le coin gauche du mât');
  assert.doesNotMatch(colo, /Installer|Android|revue-nav/i, 'colophon sans navigation ni campagne');
  assert.deepEqual([...colo.matchAll(/<a href="([^"]+)"/g)].map(x => x[1]), [m.url, 'https://le-radar.ca/revue/'], 'liens cliquables du colophon : l’édition et le-radar.ca/revue');
}
{
  const many = { ...m, items: [m.items[0], ...m.items.map((x, i) => ({ ...x, id: `ph${i}`, link: `${x.link}?p=${i}`, image: `assets/news-images/p${i}.jpg`, credit: 'Photo : Jane Roy' }))] };
  const body = R.articleBody(many);
  assert.match(body, /class="revue-item revue-item--photo"[\s\S]*?<figure class="revue-item__fig[^"]*"[^>]*><img src="[^"]*assets\/news-images\/p\d\.jpg" alt=""[^>]*><figcaption>Photo : Jane Roy<\/figcaption><\/figure>/, 'vignette d’article avec crédit discret');
  assert.ok(!R.articleBody({ ...m, items: m.items.map(x => ({ ...x, image: 'https://pirate.example/x.jpg' })) }).includes('pirate.example'), 'vignette : images du Radar seulement');
}
{
  // Titres cliquables (vrais <a href>, conservés dans le PDF) et nom du média en couleur d'établissement.
  assert.match(html, /<p class="revue-une__title"[^>]*><a href="https:\/\/[^"]+"/, 'titre de la une : lien vers l’article d’origine');
  const colored = R.articleBody({ ...m, items: m.items.map(x => ({ ...x, institution: 'UdeS' })) });
  assert.match(colored, /revue-item__media"><span class="notranslate revue-inst-c" translate="no" style="--inst:rgb\(\d+, \d+, \d+\)">Le Collectif<\/span> · <span class="revue-item__inst">UdeS<\/span>/, 'média en couleur d’établissement, sigle en couleur normale');
}
{
  // Météo ECCC : ligne de manchette (Québec et Montréal) et grand bloc (campus, Nunavik, Eeyou Istchee).
  const W = await import('../scripts/revue/revue-weather.mjs');
  assert.deepEqual(W.WEATHER_SITES.filter(x => x.group === 'campus').map(x => x.name), ['Québec', 'Montréal', 'Sherbrooke', 'Trois-Rivières', 'Rimouski', 'Saguenay', 'Gatineau', 'Rouyn-Noranda']);
  assert.equal(W.WEATHER_SITES.filter(x => x.group === 'nunavik').length, 14, '14 villages du Nunavik (citypages ECCC)');
  assert.deepEqual(W.WEATHER_SITES.filter(x => x.group === 'eeyou').map(x => x.name), ['Waskaganish']);
  assert.ok(!R.renderReviewPage(m).includes('revue-wx') && !R.articleBody(m).includes('revue-meteo'), 'sans données météo : pas de ligne ni de bloc');
  const xml = (code, pop = '') => `<siteData><location><name code="${code}">Québec</name></location><forecastGroup><dateTime name="forecastIssue" zone="UTC"><timeStamp>20261116204500</timeStamp></dateTime><forecast><period textForecastName="Ce soir et cette nuit">x</period><abbreviatedForecast><iconCode format="gif">31</iconCode>${pop}<textSummary>Quelques nuages</textSummary></abbreviatedForecast><temperatures><temperature class="low">-2</temperature></temperatures></forecast><forecast><period textForecastName="Mardi">m</period><abbreviatedForecast><pop units="%"></pop><textSummary>Neige</textSummary></abbreviatedForecast><temperatures><temperature class="high">6</temperature></temperatures></forecast></forecastGroup></siteData>`;
  const q = W.parseCitypage(xml('s0000620', '<pop units="%">30</pop>'), W.WEATHER_SITES[0]);
  assert.equal(q.group, 'campus');
  assert.deepEqual(q.periods.map(p => ({ name: p.name, kind: p.kind, temp: p.temp, pop: p.pop, icon: p.icon })), [
    { name: 'Ce soir et cette nuit', kind: 'low', temp: -2, pop: 30, icon: 31 },
    { name: 'Mardi', kind: 'high', temp: 6, pop: null, icon: null },
  ], 'citypage ECCC lu (deux périodes)');
  assert.equal(W.parseCitypage(xml('s0000999'), W.WEATHER_SITES[0]), null, 'code non vérifié : ignoré');
  assert.equal(await W.fetchWeather({ fetchImpl: async () => { throw new Error('hors ligne'); } }), null, 'Datamart injoignable : null');
  const page = R.renderReviewPage({ ...m, weather: { cities: [q] } });
  assert.match(page, /revue-flag__time">Publiée à [^<]*<span class="revue-wx revue-wx--flag"><span class="revue-wx__city"[^>]*><span class="revue-emoji"[^>]*>🌙<\/span>\s?−2°&#8239;Québec<\/span><\/span>/, 'ligne météo sous « Publiée à » dans la manchette');
  assert.match(page, /revue-wx--meta/, 'ligne météo aussi en ligne');
  const kuuj = W.WEATHER_SITES.find(x => x.code === 's0000719');
  const k = W.parseCitypage(xml('s0000719'), kuuj);
  const withW = R.articleBody({ ...m, weather: { source: 'Environnement et Changement climatique Canada', cities: [q, k] } });
  assert.match(withW, /revue-meteo[\s\S]*Villes universitaires[\s\S]*Québec[\s\S]*min −2°[\s\S]*Nunavik[\s\S]*Kuujjuaq[\s\S]*Environnement et Changement climatique Canada/, 'bloc météo imprimé');
  assert.doesNotMatch(withW, /revue-wx__city[^>]*>[^<]*Kuujjuaq/, 'Kuujjuaq dans le bloc, pas dans la petite ligne de manchette');
  // Jeux déterministes : même édition → mêmes grilles ; sudoku à solution unique ; mots tirés des titres.
  const G = require('../scripts/revue/revue-games.js');
  const g1 = G.gamesFor(m), g2 = G.gamesFor(m);
  assert.deepEqual(g1, g2, 'jeux déterministes');
  assert.equal(G.countSolutions(g1.sudoku.puzzle), 1, 'sudoku à solution unique');
  assert.ok(g1.sudoku.puzzle.every((v, i) => !v || v === g1.sudoku.solution[i]), 'indices cohérents avec la solution');
  const titles = m.items.map(x => x.title).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (g1.words) for (const w of g1.words.words) assert.ok(titles.includes(w), `mot caché tiré de l’édition : ${w}`);
  const body = R.articleBody(m);
  assert.match(body, /revue-jeux[\s\S]*Sudoku[\s\S]*revue-solutions[\s\S]*revue-colophon/, 'jeux, solutions à l’envers en pied, puis colophon');
}
{
  // Stations : nom en couleur d'établissement, fréquence et ville d'après radios.json ; sans fréquence, le nom seul.
  const radioM = { ...m, radio: [{ id: 'cfak', station: 'CFAK 88,3', page: 'https://le-radar.ca/radios/cfak/', shows: [{ start: '20:00', when: '20 h à 22 h', title: 'Le terrain sportif' }] }, { id: 'choq', station: 'CHOQ.ca', page: 'https://le-radar.ca/radios/choq/', shows: [{ start: '21:00', when: '21 h', title: 'X' }] }] };
  const rb = R.articleBody(radioM);
  assert.match(rb, /<h3 class="revue-station"><a [^>]*class="notranslate revue-inst-c"[^>]*style="--inst:rgb\([^)]+\)">CFAK 88,3 FM<\/a> <span class="revue-station__city">· Sherbrooke<\/span><\/h3>/, 'station : fréquence et ville en petit sur la même ligne');
  assert.match(rb, />CHOQ\.ca<\/a><\/h3>/, 'station sans fréquence : nom seul');
}
{
  const cov = JSON.parse(fs.readFileSync(new URL('../assets/revue/emoji-coverage.json', import.meta.url)));
  const have = new Set(cov.emojis || cov);
  for (const e of ['⛵', '📻', '📰', '🧩']) assert.ok(have.has(e), `police emoji imprimable : ${e}`);
}
assert.ok(html.includes('La collation'));
assert.ok(html.includes('lang="en"'), 'titre anglais balisé lang="en"');
assert.deepEqual(L.foreignLinks(R.articleBody(m), m), [], 'aucun lien hors données');
assert.deepEqual(L.foreignLinks('<a href="https://inventé.example/x">x</a>', m), ['https://inventé.example/x']);
const own = R.articleBody(m).replace(/<[^>]+>/g, ' ');
const ownText = m.items.reduce((t, x) => t.split(x.title).join(' ').split(x.excerpt).join(' '), own);
assert.doesNotMatch(ownText, /week-?end|\bdemain\b|aujourd['’]hui|\bhier\b/i, 'textes du Radar : dates absolues, « fin de semaine »');
assert.doesNotMatch(html, /logo[^"]*(udem|ulaval|mcgill|concordia|udes)/i, 'aucun logo d’université');
// JSON-LD NewsArticle
const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
assert.equal(ld['@type'], 'NewsArticle'); assert.equal(ld.headline, 'La revue du matin du mardi 17 novembre 2026'); assert.ok(ld.headline.length <= 110);
assert.equal(ld.author.name, 'Le Radar'); assert.equal(ld.publisher.name, 'Le Radar'); assert.equal(ld.publisher['@type'], 'NewsMediaOrganization');
assert.match(ld.datePublished, /^2026-11-17T07:3\d:00-05:00$/); assert.ok(ld.dateModified);
assert.equal(ld.mainEntityOfPage['@id'], m.url); assert.equal(ld.inLanguage, 'fr-CA');
assert.equal(ld.citation.length, 3); assert.deepEqual(ld.citation.find(c => c.url === coll.link).author.map(a => a.name), ['Aurélie Souka', 'Caroline Lizin']);
assert.equal(ld.citation.find(c => c.url === 'https://quartierlibre.ca/gen-z/').author.name, 'Quartier Libre', '« la rédaction » : le média est l’auteur');
assert.ok(!/<\/script/i.test(R.jsonForScript({ x: '</script><b>' })));

// ── Sitemap Google News (48 h), sitemap principal, RSS ──
const entry = { id: m.id, path: m.path, url: m.url, headline: m.headline, datePublished: m.datePublished, dateModified: m.dateModified, edition: 'matin', day: '2026-11-17', counts: { articles: 3, results: 1 } };
const old = { ...entry, id: '2026-11-14-matin', url: 'https://le-radar.ca/revue/2026-11-14-matin/', path: 'revue/2026-11-14-matin/', datePublished: T('2026-11-14T12:30:00Z'), day: '2026-11-14' };
const ns = R.newsSitemap([entry, old], { now: tM + 3600e3 });
assert.match(ns, /xmlns:news="http:\/\/www\.google\.com\/schemas\/sitemap-news\/0\.9"/);
assert.match(ns, /<news:name>Le Radar<\/news:name><news:language>fr<\/news:language>/);
assert.match(ns, /<news:publication_date>2026-11-17T07:3\d:00-05:00<\/news:publication_date>/);
assert.ok(ns.includes(m.url) && !ns.includes('2026-11-14-matin'), 'seulement les 48 dernières heures');
assert.equal((ns.match(/<url>/g) || []).length, 1);
assert.deepEqual(R.sitemapEntries([entry]).map(e => e.loc), ['/revue/', '/revue/2026-11-17-matin/']);
const item = R.feedItemXml({ ...m, image: { ...m.image, length: 12345 } });
assert.match(item, /<guid isPermaLink="true">https:\/\/le-radar\.ca\/revue\/2026-11-17-matin\/<\/guid>/);
assert.match(item, /<pubDate>Tue, 17 Nov 2026 12:3\d:00 \+0000<\/pubDate>/);
assert.match(item, /<enclosure url="https:\/\/le-radar\.ca\/assets\/news-images\/abc\.jpg" length="12345" type="image\/jpeg" \/>/);
assert.match(item, /<category>Revue de presse<\/category>/); assert.match(item, /<category>Sport étudiant<\/category>/);
assert.match(item, /<content:encoded><!\[CDATA\[[\s\S]*Aurélie Souka et Caroline Lizin[\s\S]*La collation[\s\S]*Stingers \(Concordia\) 55-54[\s\S]*\]\]><\/content:encoded>/, 'contenu complet');
assert.match(item, /<dc:creator>Le Radar<\/dc:creator>/);
const feed = R.revueFeedXml([m]);
assert.match(feed, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<rss version="2\.0"/);
assert.equal((feed.match(/<item>/g) || []).length, 1); assert.equal((feed.match(/<\/item>/g) || []).length, 1);
const merged = feedLib.buildFeedXml(news.items.slice(0, 2), { file: 'feed.xml', title: 'T', description: 'D', lang: 'fr-CA' }, {}, [{ date: m.datePublished, xml: item }]);
assert.equal((merged.match(/<item>/g) || []).length, 3, 'feed.xml : la revue s’intercale parmi les articles');
assert.ok(merged.indexOf('2026-11-17-matin') < merged.indexOf('thelinknewspaper'), 'triée par date');
assert.equal(R.robotsWithNewsSitemap('a\nSitemap: x\n', true), 'a\nSitemap: x\nSitemap: https://le-radar.ca/sitemap-news.xml\n');
assert.equal(R.robotsWithNewsSitemap('a\nSitemap: https://le-radar.ca/sitemap-news.xml\n', false), 'a\n');

// ── Écriture (dossier temporaire) : pages, index, flux, sitemap ; robots.txt seulement en publication réelle ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'revue-'));
fs.writeFileSync(path.join(tmp, 'robots.txt'), 'User-agent: *\nAllow: /\n');
const index = [];
writeOutputs(tmp, { model: m, index, reviews: {}, publish: false, now: tM, cfg: on });
for (const f of ['revue/2026-11-17-matin/index.html', 'revue/index.html', 'revue/feed.xml', 'sitemap-news.xml', 'data/revue/index.json', 'data/revue/reviews/2026-11-17-matin.json']) assert.ok(fs.existsSync(path.join(tmp, f)), f);
assert.equal(fs.readFileSync(path.join(tmp, 'robots.txt'), 'utf8'), 'User-agent: *\nAllow: /\n', 'exemple : robots.txt intact');
assert.match(fs.readFileSync(path.join(tmp, 'revue/index.html'), 'utf8'), /href="\.\/2026-11-17-matin\/"/);
writeOutputs(tmp, { model: m, index, reviews: {}, publish: true, now: tM, cfg: on });
assert.match(fs.readFileSync(path.join(tmp, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/le-radar\.ca\/sitemap-news\.xml/);
assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'data/revue/index.json'), 'utf8')).length, 1, 'idempotent : une entrée par revue');
fs.writeFileSync(path.join(tmp, 'data/revue/config.json'), '{"publish":true}');
assert.equal(R.loadPublished(tmp).enabled, true); assert.equal(R.loadPublished(tmp).models.length, 1);
assert.equal(feedLib.revueFeedEntries(tmp).length, 1, 'feed.xml reprend la revue une fois publish = true');
const evil = R.articleBody({ ...m, items: [{ ...m.items[0], title: '<a href="https://pirate.example/">x</a>', resume: '' }] });
assert.ok(!evil.includes('href="https://pirate.example/"'), 'titres échappés : aucun lien injecté');
assert.deepEqual(L.foreignLinks(evil, m), []);
fs.rmSync(tmp, { recursive: true, force: true });

// ── Workflows : porte sur l'interrupteur, secrets jamais affichés, groupe d'écriture partagé ──
const wf = fs.readFileSync('.github/workflows/revue.yml', 'utf8');
assert.match(wf, /revue-run\.mjs --gate/); assert.match(wf, /if: needs\.gate\.outputs\.due == 'true'/);
assert.match(wf, /cron: '2 11,12 \* \* \*'/);
assert.match(wf, /cron: '2,17,32,47 23,0 \* \* \*'/);
assert.match(wf, /cron: '35 3,4 \* \* \*'/);
assert.match(wf, /workflows: \['Update Student News'\]/, 'filet après la collecte');
assert.match(wf, /workflow_run:/);
assert.match(wf, /CLOUDFLARE_AI_TOKEN: \$\{\{ secrets\.CLOUDFLARE_AI_TOKEN \}\}/);
assert.doesNotMatch(wf, /echo[^\n]*secrets\./, 'aucun secret affiché');
assert.match(wf, /group: data-writers-site/);
{
  const sched = wf.slice(wf.indexOf('schedule:'), wf.indexOf('workflow_dispatch:'));
  assert.doesNotMatch(sched, /--day|inputs\.day/, 'cron et filet : pas de date forcée');
  assert.match(wf, /day:\n\s+description: 'Date AAAA-MM-JJ/);
  assert.match(wf, /type: string\n\s+default: ''/);
  assert.match(wf, /REVUE_DAY: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.day \|\| '' \}\}/);
  assert.match(wf, /node scripts\/revue\/revue-run\.mjs --gate --day "\$REVUE_DAY"/);
  assert.match(wf, /node scripts\/revue\/revue-run\.mjs --edition "\$REVUE_EDITION" --day "\$REVUE_DAY"/);
  assert.match(wf, /else\n\s+node scripts\/revue\/revue-run\.mjs --gate\n/);
  assert.match(wf, /else\n\s+node scripts\/revue\/revue-run\.mjs --edition "\$REVUE_EDITION"\n/);
  assert.match(wf, /node scripts\/generate-feed\.js --update/);
  assert.match(wf, /needs\.gate\.outputs\.id/);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'revue-gate-'));
  const gout = path.join(tmp, 'out');
  const run = (args) => {
    fs.writeFileSync(gout, '');
    const r = spawnSync(process.execPath, ['scripts/revue/revue-run.mjs', '--gate', ...args], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: gout, REVUE_EDITION: '', REVUE_AI: 'off' },
    });
    const kv = Object.fromEntries(fs.readFileSync(gout, 'utf8').split('\n').filter(Boolean).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }));
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, kv };
  };
  const exists = run(['--edition', 'matin', '--day', '2026-11-19']);
  assert.equal(exists.status, 0, exists.stderr + exists.stdout);
  assert.equal(exists.kv.due, 'false', 'édition déjà publiée : la porte ne la refait pas');
  assert.equal(exists.kv.id, '2026-11-19-matin');
  assert.match(exists.stdout, /déjà publiée/);
  const bad = run(['--edition', 'matin', '--day', '2026-11-31']);
  assert.equal(bad.status, 1);
  assert.match(`${bad.stderr}`, /AAAA-MM-JJ/);
  const auto = run(['--edition', 'auto', '--day', '2026-11-20']);
  assert.equal(auto.status, 0, auto.stderr);
  assert.equal(auto.kv.due, 'false');
  assert.match(auto.stdout, /matin ou soir/);
  fs.rmSync(tmp, { recursive: true, force: true });
}
const groups = JSON.parse(fs.readFileSync('scripts/data-writer-groups.json', 'utf8')).groups;
assert.ok(groups.site.includes('revue.yml'));
assert.match(fs.readFileSync('.github/workflows/pages-deploy.yml', 'utf8'), /- Revue — matin et soir/);
const pv = fs.readFileSync('.github/workflows/revue-preview.yml', 'utf8');
assert.match(pv, /contents: read/); assert.doesNotMatch(pv, /git push|bot-push/);
assert.equal(loadConfig().publish, true);
console.log('revue : OK');

// Régates (voile, classement par place, #441) : une seule équipe, sans pointage ; texte et clé stables.
{ const reg = { kind: 'classement', date: '2026-11-15', sport: 'Voile', event: 'Championnat canadien de course en flotte', place: '3e/11', teams: [{ name: 'Concordia', inst: '' }] };
  assert.equal(L.resultText(reg), 'Concordia : 3e sur 11, Championnat canadien de course en flotte');
  assert.equal(L.resultKey(reg), '2026-11-15|Voile|Championnat canadien de course en flotte|Concordia:3e/11');
  console.log('revue (régates) : OK'); }

// Couverture : une photo de banque ne devient pas la une (écran : vignette ou rien).
{
  const { siteImage, isStockOnlyImage } = await import('../scripts/social/une-lib.mjs');
  const stockOnly = { title: 'x', link: 'https://x.ca/a', stockImage: 'https://upload.wikimedia.org/wikipedia/commons/hall.jpg' };
  const real = { title: 'x', link: 'https://x.ca/b', image: 'https://theconcordian.com/pic.jpg', stockImage: 'https://upload.wikimedia.org/wikipedia/commons/hall.jpg' };
  assert.equal(siteImage(stockOnly, { allowStock: false }), '');
  assert.equal(isStockOnlyImage(stockOnly), true);
  assert.equal(isStockOnlyImage(real), false);
  assert.ok(siteImage(real, { allowStock: false }).includes('theconcordian.com'));
  const stockItem = { ...m.items[0], id: 'stock1', link: 'https://journal.example/stock', image: 'https://upload.wikimedia.org/wikipedia/commons/hall.jpg', imageStock: true };
  const realItem = { ...m.items[0], id: 'real1', link: 'https://journal.example/real', image: 'https://le-radar.ca/assets/news-images/abc.jpg', imageStock: false };
  const bodyStock = R.articleBody({ ...m, items: [stockItem], image: null });
  assert.doesNotMatch(bodyStock, /revue-cover/, 'pas de bandeau de une si seule une image de banque est dispo');
  const bodyReal = R.articleBody({ ...m, items: [realItem], image: { url: realItem.image, title: 'T', credit: '', source: 'S' } });
  assert.match(bodyReal, /revue-cover/);
  assert.doesNotMatch(bodyReal, /data-stock/, 'photo réelle : pas le marquage banque');
  const page = R.renderReviewPage(m);
  assert.match(page, /revue-web\.js/, 'script écran (PDF, banque, jeux) sur la page');
  const src = fs.readFileSync('scripts/revue/revue-render.js', 'utf8');
  assert.match(src, /id="meteo"/);
  assert.match(src, /id="jeux"/);
  const css = fs.readFileSync('revue.css', 'utf8');
  assert.match(css, /max-width:\s*70ch/);
  const screenCss = css.slice(0, css.indexOf('IMPRESSION : un vrai journal'));
  assert.match(screenCss, /\.revue-wire \{[\s\S]*?margin-inline:\s*auto/);
  assert.match(screenCss, /html\[data-wide-preview\] \.seo-wire\.revue-wire/);
  assert.match(screenCss, /\.revue-wire \.revue \{[\s\S]*?margin-inline:\s*0/);
  assert.match(screenCss, /\.revue-wire \.seo-crumbs[\s\S]*?margin-inline:\s*0/);
  assert.match(css, /max-height:\s*360px/);
  assert.match(css, /data-stock/);
  const printStart = css.indexOf('IMPRESSION : un vrai journal');
  assert.ok(printStart > 0);
  assert.match(css.slice(printStart), /max-height: 7\.8cm !important/);
  const wfRevue = fs.readFileSync('.github/workflows/revue.yml', 'utf8');
  assert.match(wfRevue, /revue-pdfs\.mjs/);
  assert.match(wfRevue, /needs\.gate\.outputs\.id/, 'le flux passe l’identifiant complet AAAA-MM-JJ-matin|soir aux PDF');
  assert.doesNotMatch(wfRevue, /revue-pdfs\.mjs --id "\$REVUE_EDITION"/, 'ne plus passer matin/soir seuls à --id (échec du 18 nov. 2026 avant le commit)');
  assert.match(wfRevue, /pages seront tout de même publiées/, 'un échec PDF ne doit plus bloquer la publication des pages');
  const tmpPdf = fs.mkdtempSync(path.join(os.tmpdir(), 'revue-pdf-id-'));
  fs.mkdirSync(path.join(tmpPdf, 'data/revue'), { recursive: true });
  for (const id of ['2026-11-18-matin', '2026-11-17-matin', '2026-11-17-soir']) {
    fs.mkdirSync(path.join(tmpPdf, 'revue', id), { recursive: true });
    fs.writeFileSync(path.join(tmpPdf, 'revue', id, 'index.html'), '<html></html>');
  }
  fs.writeFileSync(path.join(tmpPdf, 'data/revue/index.json'), JSON.stringify([
    { id: '2026-11-18-matin', edition: 'matin' },
    { id: '2026-11-17-soir', edition: 'soir' },
    { id: '2026-11-17-matin', edition: 'matin' },
  ]));
  assert.equal(resolveEditionId('2026-11-17-soir', tmpPdf), '2026-11-17-soir');
  assert.equal(resolveEditionId('soir', tmpPdf), '2026-11-17-soir', 'soir → édition déjà écrite la plus récente');
  assert.equal(resolveEditionId('matin', tmpPdf), '2026-11-18-matin', 'matin → première entrée de l’index encore présente sur le disque');
  fs.rmSync(tmpPdf, { recursive: true, force: true });
  const wfKit = fs.readFileSync('.github/workflows/update-kit-examples.yml', 'utf8');
  assert.match(wfKit, /Update Student News/);
  assert.match(src, /pdfDownloadName/);
  assert.match(src, /NEXT_LIMIT/);
  assert.match(page, /download="le-radar-revue-[^"]+-lettre\.pdf"/);
  assert.match(css.slice(printStart), /revue-top__qr/);
  assert.match(css.slice(printStart), /column-span:\s*all/);
  assert.match(css.slice(printStart), /revue-cover\[data-stock\]/);
  console.log('revue (écran : colonne, banque, PDF) : OK');

}

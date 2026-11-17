// « La revue du matin / du soir » : éditions (heure d'été et d'hiver), période, sélection (tous les auteurs, sport pro exclu),
// garde-fou anti-hallucination (IA simulée), repli déterministe, validation des liens/auteurs/émissions/scores, JSON-LD,
// sitemap Google News, RSS, rendu, interrupteur `publish` (désactivé par défaut) et workflows.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as L from '../scripts/revue/revue-lib.mjs';
import { aiReview, itemsPrompt } from '../scripts/revue/revue-ai.mjs';
import { generate, gate, writeOutputs, loadConfig } from '../scripts/revue/revue-run.mjs';

const require = createRequire(import.meta.url);
const R = require('../scripts/revue/revue-render.js');
const feedLib = require('../scripts/generate-feed.js');
const cfg = L.mergeConfig(JSON.parse(fs.readFileSync('data/revue/config.json', 'utf8')));

// ── Interrupteur : désactivé par défaut, rien de public ──
assert.equal(cfg.publish, false, 'data/revue/config.json : publish doit rester false tant que Charles n’a pas validé');
assert.equal(L.mergeConfig({ publish: 'true' }).publish, false, 'seul le booléen true active la publication');
assert.equal(gate({ now: Date.parse('2026-11-17T12:35:00Z'), cfg }).due, false);
assert.match(gate({ now: Date.parse('2026-11-17T12:35:00Z'), cfg }).why, /désactivée/);
assert.deepEqual(R.loadPublished(process.cwd()), { enabled: false, index: [], models: [] });
assert.deepEqual(feedLib.revueFeedEntries(process.cwd()), [], 'feed.xml : aucune revue tant que publish = false');
assert.ok(!fs.readFileSync('robots.txt', 'utf8').includes('sitemap-news.xml'), 'robots.txt : pas de sitemap Google News tant que publish = false');
assert.ok(!fs.existsSync('sitemap-news.xml') && !fs.existsSync('revue/index.html'), 'aucune page ni sitemap de revue commités tant que publish = false');

// ── Éditions : 7 h 30 et 19 h 15 heure de Montréal, été comme hiver ──
const on = L.mergeConfig({ publish: true });
assert.equal(L.editionAt(Date.parse('2026-11-17T12:31:00Z'), on)?.id, 'matin');     // 7 h 31 HNE
assert.equal(L.editionAt(Date.parse('2026-07-17T11:31:00Z'), on)?.id, 'matin');     // 7 h 31 HAE
assert.equal(L.editionAt(Date.parse('2026-11-17T12:05:00Z'), on), null);            // 7 h 05 : trop tôt
assert.equal(L.editionAt(Date.parse('2026-11-18T00:16:00Z'), on)?.key, '2026-11-17-soir'); // 19 h 16 HNE le 17
assert.equal(L.editionAt(Date.parse('2026-07-17T23:16:00Z'), on)?.id, 'soir');      // 19 h 16 HAE
assert.equal(L.refreshAt(Date.parse('2026-11-18T03:50:00Z'), on)?.key, '2026-11-17-soir'); // 22 h 50
assert.equal(L.mtlInstant('2026-11-17', '07:30'), Date.parse('2026-11-17T12:30:00Z'));
assert.equal(L.mtlInstant('2026-07-17', '07:30'), Date.parse('2026-07-17T11:30:00Z'));
assert.equal(L.mtlInstant('2026-03-08', '07:30'), Date.parse('2026-03-08T11:30:00Z'), 'passage à l’heure d’été');
assert.equal(R.isoMtl(Date.parse('2026-11-17T00:15:00Z')), '2026-11-16T19:15:00-05:00');
assert.equal(R.isoMtl(Date.parse('2026-07-16T23:15:00Z')), '2026-07-16T19:15:00-04:00');
assert.equal(L.reviewPath('2026-11-17', 'matin'), 'revue/2026-11-17-matin/');

// Porte (publication activée) : édition due, déjà publiée, sautée, rafraîchissement.
const tM = Date.parse('2026-11-17T12:35:00Z');
assert.equal(gate({ now: tM, cfg: on }).due, true);
assert.equal(gate({ now: tM, cfg: on, index: [{ id: '2026-11-17-matin' }] }).due, false);
assert.equal(gate({ now: tM, cfg: on, state: { '2026-11-17-matin': { skipped: true, why: 'rien' } } }).due, false);
assert.equal(gate({ now: Date.parse('2026-11-18T03:50:00Z'), cfg: on, index: [{ id: '2026-11-17-soir' }] }).mode, 'rafraichir');
assert.equal(gate({ now: Date.parse('2026-11-18T03:50:00Z'), cfg: on }).due, false, 'rien à rafraîchir sans revue du soir');

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
assert.equal(coll.institution, 'Université de Sherbrooke (UdeS)', 'établissement en français, sigle entre parenthèses');
assert.equal(items.find(x => x.source === 'The Link').institution, 'Université Concordia (Concordia)');
assert.equal(coll.theme, 'Politique');
assert.equal(L.selectArticles(news, period, { coveredIds: new Set([coll.id]) }).some(x => x.id === coll.id), false, 'anti-doublon entre éditions');
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
// Fidélité au titre : pas de confusion de personnes, pas d'affirmation d'un titre interrogatif.
const carney = { title: 'Mark Carney dévoile ses ambitions économiques', lang: 'fr', source: 'Le Collectif', authors: [], excerpt: 'Le 5 novembre dernier, François-Philippe Champagne, ministre des Finances du Canada, a déposé le plus récent budget du gouvernement canadien.' };
assert.deepEqual(L.titleNames(carney.title), ['Mark Carney']);
assert.deepEqual(L.titleNames('Le Vert & Or triomphe sous les yeux des anciens'), []);
assert.deepEqual(L.titleNames('Le Québec s’unit afin de prévenir les violences conjugales'), []);
assert.match(L.itemReject('Le ministre des Finances du Canada dévoile ses ambitions économiques pour le budget.', carney), /nom du titre absent \(Mark Carney\)/);
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
  if (body.includes('chapeau')) return reply({ chapeau: 'Le budget de Sherbrooke, une victoire des Stingers et le retour des médias physiques chez les jeunes dominent cette revue.' })();
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
assert.ok(ai.chapeau.startsWith('Le budget'));
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
assert.match(html, /Revue générée automatiquement<\/strong> à partir des sources citées/);
assert.match(html, /<link rel="stylesheet" href="\.\.\/\.\.\/revue\.css" \/>/);
assert.match(html, /<script src="\.\.\/\.\.\/seo-page-theme\.js"><\/script>/, 'modes clair et sombre du site');
for (const x of m.items) {
  assert.ok(html.includes(`href="${x.link}"`), `lien original : ${x.link}`);
  for (const a of x.authors) assert.ok(html.includes(a), `auteur crédité : ${a}`);
}
assert.ok(html.includes('Par <span class="notranslate" translate="no">Aurélie Souka et Caroline Lizin</span>'));
assert.ok(html.includes('Stingers (Concordia) 55-54 Martlets (McGill)'));
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
assert.match(fs.readFileSync(path.join(tmp, 'revue/index.html'), 'utf8'), /href="\.\.\/2026-11-17-matin\/"/);
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
assert.match(wf, /cron: '31 11,12 \* \* \*'/); assert.match(wf, /cron: '16,46 0 \* \* \*'/); assert.match(wf, /cron: '50 3 \* \* \*'/);
assert.match(wf, /CLOUDFLARE_AI_TOKEN: \$\{\{ secrets\.CLOUDFLARE_AI_TOKEN \}\}/);
assert.doesNotMatch(wf, /echo[^\n]*secrets\./, 'aucun secret affiché');
assert.match(wf, /group: data-writers-site/);
const groups = JSON.parse(fs.readFileSync('scripts/data-writer-groups.json', 'utf8')).groups;
assert.ok(groups.site.includes('revue.yml'));
assert.match(fs.readFileSync('.github/workflows/pages-deploy.yml', 'utf8'), /- Revue — matin et soir/);
const pv = fs.readFileSync('.github/workflows/revue-preview.yml', 'utf8');
assert.match(pv, /contents: read/); assert.doesNotMatch(pv, /git push|bot-push/);
assert.equal(loadConfig().publish, false);
console.log('revue : OK');

// Une + vedettes : même sélection que le fil d’accueil (vue standard),
// identifiants de fiche identiques à core.articleId.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { articleId } = require('../mobile/app/js/core.js');
const freshness = require('../scripts/session-freshness-lib.js');
const housekeeping = require('../scripts/news-housekeeping-lib.js');
const front = require('../scripts/magazine-front-page-lib.js');

assert.equal(front.FRONT_PAGE_COUNT, 5, '1 une + 4 vedettes (HERO_SPOTLIGHT_MAX)');

const item = {
  title: 'Étudier en histoire',
  source: 'Quartier Libre',
  link: 'https://quartierlibre.ca/etudier-en-histoire/?utm_source=x',
  date: '2026-10-28T14:00:00.000Z',
  leadExcerpt: 'Première phrase. Deuxième phrase. Troisième phrase.',
  imageLocal: 'assets/news-images/abc.jpg',
};
assert.equal(front.articleId(item.link), articleId(item.link));
assert.equal(front.articleId('https://quartierlibre.ca/etudier-en-histoire/'), articleId(item.link));
assert.equal(front.articlePageUrl(item.link), `https://le-radar.ca/article/${articleId(item.link)}/`);
assert.equal(front.hookOf(item, 220), 'Première phrase. Deuxième phrase.');
assert.equal(front.imageSrc(item, '..'), '../assets/news-images/abc.jpg');
assert.deepEqual(front.imageCandidates(item, '..'), [
  '../assets/news-images/abc.jpg',
  'https://le-radar.ca/assets/news-images/abc.jpg',
]);

/* Image distante seulement (imageRemoteOnly, pas de miroir) : l’origine, puis relais CORS
 * (Photon, wsrv.nl) pour le canevas des affiches — sans réhéberger le fichier. */
const remoteOnly = {
  title: 'Karmina, des vampires québécois !',
  source: 'Quartier Libre',
  image: 'https://quartierlibre.ca/wp-content/uploads/2026/11/16_critique-cine.jpeg',
  imageRemoteOnly: true,
};
const karminaUrl = remoteOnly.image;
assert.deepEqual(front.imageCandidates(remoteOnly, '..'), [
  karminaUrl,
  `https://i0.wp.com/quartierlibre.ca/wp-content/uploads/2026/11/16_critique-cine.jpeg?ssl=1`,
  `https://wsrv.nl/?url=${encodeURIComponent(karminaUrl)}&w=1400&we&output=jpg&q=82`,
]);
assert.equal(front.imageSrc(remoteOnly, '..'), karminaUrl);
assert.deepEqual(
  front.imageCandidates({ ...item, image: karminaUrl }, '..'),
  [
    '../assets/news-images/abc.jpg',
    'https://le-radar.ca/assets/news-images/abc.jpg',
    karminaUrl,
  ],
  'avec miroir local, pas de relais tiers',
);
assert.equal(front.frDate('2026-11-01T15:00:00Z'), '1er novembre 2026');

const news = JSON.parse(readFileSync(join(root, 'news.json'), 'utf8'));
const now = new Date(news.updated || Date.now());
const picked = front.selectFrontPage(news.items, now);
const fresh = freshness.filterFreshItems(news.items, now);
const normal = housekeeping.housekeepingNormalItems(fresh, now);
const expected = [...normal].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  .slice(0, 5);

assert.equal(picked.items.length, expected.length);
assert.deepEqual(
  picked.items.map((i) => i.link),
  expected.map((i) => i.link),
  'tranche des N plus frais du pool normal, comme pickHeroSpotlight',
);
assert.equal(picked.lead?.link, expected[0]?.link);
assert.equal(picked.features.length, Math.max(0, expected.length - 1));

for (const notice of housekeeping.housekeepingBriefItems(fresh, now)) {
  assert(
    !picked.items.some((i) => i.link === notice.link),
    `avis de ménage exclu de la une : ${notice.title}`,
  );
}

const cards = front.frontPageCards(news.items, now, '..');
assert.equal(cards.items.length, picked.items.length);
for (const card of cards.items) {
  assert.match(card.id, /^[0-9a-f]{16}$/);
  assert.equal(card.id, articleId(card.originUrl || card.pageUrl.replace(/\/article\/.*/, '')));
  assert.equal(card.pageUrl, `https://le-radar.ca/article/${card.id}/`);
  assert.ok(card.title);
  assert.ok(card.source);
}

// Recalcule l’id depuis le lien d’origine des articles du fil.
for (let i = 0; i < cards.items.length; i += 1) {
  assert.equal(cards.items[i].id, articleId(picked.items[i].link));
}

assert.equal(front.enDate('2026-11-01T15:00:00Z', { weekday: true }).includes('November'), true);

const laval = { slug: 'laval', line: 'Université Laval', label: 'Université Laval' };
const mcgill = { slug: 'mcgill', line: 'Université McGill', lineEn: 'McGill University', label: 'Université McGill' };
const udem = { slug: 'udem', line: 'Université de Montréal', label: 'Université de Montréal' };
assert.equal(front.itemMatchesCampus({ institution: 'Université Laval' }, laval), true);
assert.equal(front.itemMatchesCampus({ institution: 'Université de Montréal' }, laval), false);
assert.equal(front.itemMatchesCampus({ institution: 'McGill University' }, mcgill), true);
assert.equal(front.itemMatchesCampus({ institution: 'Université McGill' }, mcgill), true);
assert.equal(front.itemMatchesCampus({ institution: 'Université de Montréal' }, mcgill), false);

const lavalPick = front.selectFrontPage(news.items, now, laval);
assert.ok(lavalPick.items.length > 0, 'Laval a des articles frais');
assert.ok(lavalPick.items.length <= front.FRONT_PAGE_COUNT);
assert.ok(lavalPick.items.every((i) => i.institution === 'Université Laval'));
const lavalAll = (housekeeping.housekeepingNormalItems(fresh, now))
  .filter((i) => i.institution === 'Université Laval');
assert.ok(lavalPick.items.length <= lavalAll.length, 'pas d’articles inventés');
if (lavalAll.length >= 5) assert.equal(lavalPick.items.length, 5);
else assert.equal(lavalPick.items.length, lavalAll.length);

const mcgillPick = front.selectFrontPage(news.items, now, mcgill);
assert.ok(mcgillPick.items.length > 0);
assert.ok(mcgillPick.items.every((i) => i.institution === 'McGill University' || i.institution === 'Université McGill'));
assert.ok(!mcgillPick.items.some((i) => i.institution === 'Université de Montréal'));

const teluq = { slug: 'teluq', line: 'TÉLUQ', label: 'TÉLUQ' };
const teluqPick = front.selectFrontPage(news.items, now, teluq);
assert.equal(teluqPick.items.length, (housekeeping.housekeepingNormalItems(fresh, now)).filter((i) => front.itemMatchesCampus(i, teluq)).length);


const posterPick = front.selectFrontPage(news.items, now, null, front.POSTER_PAGE_COUNT);
assert.equal(posterPick.items.length, front.POSTER_PAGE_COUNT);
assert.equal(posterPick.features.length, front.POSTER_PAGE_COUNT - 1);
assert.equal(front.selectFrontPage(news.items, now).items.length, front.FRONT_PAGE_COUNT);

const lavalPoster = front.selectFrontPage(news.items, now, laval, front.POSTER_PAGE_COUNT + front.POSTER_BRIEF_COUNT);
assert.ok(lavalPoster.items.length <= front.POSTER_PAGE_COUNT + front.POSTER_BRIEF_COUNT);
assert.ok(lavalPoster.items.every((i) => i.institution === 'Université Laval'));
assert.ok(lavalPoster.items.length <= lavalAll.length, 'affiche : pas d’articles inventés');
if (lavalAll.length >= front.POSTER_PAGE_COUNT + front.POSTER_BRIEF_COUNT) {
  assert.equal(lavalPoster.items.length, front.POSTER_PAGE_COUNT + front.POSTER_BRIEF_COUNT);
}

const cardsLong = front.normalize(news.items[0], '..');
assert.ok(cardsLong.hookLong.length >= cardsLong.hook.length);

console.log(`magazine-front-page : OK (${cards.items.length} articles, une = ${cards.lead?.title} ; Laval ${lavalPick.items.length})`);


/* Périodes de l’affiche « une » */
{
  const ref = new Date('2026-11-13T00:06:40Z'); /* jeudi 12 nov., heure de Montréal */
  const w = front.periodWindow('semaine', ref);
  assert.equal(w.from, '2026-11-06');
  assert.equal(w.to, '2026-11-12');
  assert.match(w.fr, /^Dernière semaine, du 6 au 12 novembre 2026$/);
  const f = front.periodWindow('fds', ref);
  assert.equal(f.from, '2026-11-06');
  assert.equal(f.to, '2026-11-08');
  assert.match(f.fr, /^Fin de semaine du 6 au 8 novembre 2026$/);
  assert.ok(!/week-end/i.test(f.fr));
  assert.equal(front.periodWindow('mois', ref).from, '2026-10-14');
  assert.equal(front.periodWindow('inconnu', ref).id, 'jour');
  /* Libellé du haut selon la période : année sur les plages, date du lendemain pour « Demain ». */
  assert.match(front.periodWindow('mois', ref).fr, /^Dernier mois, du 14 octobre au 12 novembre 2026$/);
  const d = front.periodWindow('demain', ref);
  assert.equal(d.id, 'demain');
  assert.ok(d.live && front.periodWindow('jour', ref).live && !w.live, 'demain et jour : périodes en direct');
  assert.equal(d.target, '2026-11-13');
  assert.equal(d.fr, 'Vendredi 13 novembre 2026');
  assert.equal(front.periodWindow('demain', new Date('2026-12-31T17:00:00Z')).target, '2027-01-01', 'lendemain du 31 décembre');
  const mk = (d, i) => ({ title: `T${i}`, link: `https://ex.org/${i}`, source: 'S', institution: 'Université Laval', date: d, image: 'https://ex.org/i.jpg' });
  const items = [
    ...Array.from({ length: 20 }, (_, i) => mk(`2026-11-${String(12 - (i % 7)).padStart(2, '0')}T15:00:00Z`, i)),
    ...Array.from({ length: 10 }, (_, i) => mk(`2026-10-${String(15 + i).padStart(2, '0')}T15:00:00Z`, 100 + i)),
    mk('2026-09-01T15:00:00Z', 999),
  ];
  const week = front.selectFrontPage(items, ref, null, 8, 'semaine');
  assert.equal(week.items.length, 8);
  assert.ok(week.items.every((it) => front.mtlYmd(it.date) >= '2026-11-06'));
  const month = front.selectFrontPage(items, ref, null, 8, 'mois');
  assert.ok(month.items.some((it) => it.date.startsWith('2026-10')), 'le mois doit couvrir toute la fenêtre');
  assert.ok(month.items.every((it) => front.mtlYmd(it.date) >= '2026-10-14'));
  const few = front.selectFrontPage(items.slice(0, 3), ref, null, 8, 'semaine');
  assert.equal(few.items.length, 3, 'peu d’articles : on prend ce qui existe, sans inventer');
}
assert.ok(front.isProSportItem({ title: 'Les Alouettes s’envolent vers la Coupe Grey' }));
assert.ok(front.isProSportItem({ title: 'CF Montréal et COP 31 : reportages radio' }));
assert.ok(!front.isProSportItem({ title: 'Stingers 7, Gee-Gees 0: Pure Stingers domination' }));
assert.ok(!front.isProSportItem({ title: 'Le Rouge et Or remporte la Coupe Dunsmore' }));

/* Signatures (plusieurs auteurs, Impact Campus, rédaction, rôles) */
{
  const names = front.authorNames({ author: 'Arianne Dion, Étienne Dumas et Élise Paré', source: 'L’Exemplaire' });
  assert.deepEqual(names, ['Arianne Dion', 'Étienne Dumas', 'Élise Paré']);
  assert.equal(front.bylineOf(names, 'L’Exemplaire'), 'Par Arianne Dion, Étienne Dumas et Élise Paré · L’Exemplaire');
  assert.equal(front.bylineOf(names, 'L’Exemplaire', { maxNames: 2 }), 'Par Arianne Dion et al. · L’Exemplaire');
  assert.equal(front.bylineOf(front.authorNames({ author: 'Juliette Fournier et Félicitée Audet', source: 'Montréal Campus' }), 'Montréal Campus'),
    'Par Juliette Fournier et Félicitée Audet · Montréal Campus');
  assert.deepEqual(front.authorNames({ author: 'Archives Impact Campus & Léann Bonin', source: 'Impact Campus' }), ['Léann Bonin']);
  assert.deepEqual(front.authorNames({ author: 'Rosalie Fauchon, journaliste collaboratrice', source: 'Impact Campus' }), ['Rosalie Fauchon']);
  assert.deepEqual(front.authorNames({ author: 'The Link', source: 'The Link' }), []);
  assert.equal(front.bylineOf([], 'The Link'), 'The Link', 'auteur inconnu : le média seul');
  const card = front.normalize({ title: 'T', link: 'https://ex.org/a', source: 'Montréal Campus', author: 'Émile Brochu et Agathe Nogues', date: '2026-11-10T12:00:00Z' });
  assert.equal(card.byline, 'Par Émile Brochu et Agathe Nogues · Montréal Campus');
}

/* Sélection manuelle */
{
  const cards = [
    { id: 'a', date: '2026-11-12T10:00:00Z' }, { id: 'b', date: '2026-11-10T10:00:00Z' },
    { id: 'c', date: '2026-11-11T10:00:00Z' }, { id: 'd', date: '2026-11-09T10:00:00Z' },
  ];
  assert.deepEqual(front.manualSelection(cards, ['b', 'd', 'c']).map((c) => c.id), ['c', 'b', 'd']);
  assert.deepEqual(front.manualSelection(cards, ['b', 'd', 'c'], 'd').map((c) => c.id), ['d', 'c', 'b']);
  assert.deepEqual(front.manualSelection(cards, ['zz', 'a']).map((c) => c.id), ['a'], 'ids inconnus ignorés');
  assert.deepEqual(front.manualSelection(cards, []), []);
}

/* Bilan d’une période passée (résultats réels, filtrés, variés, dédoublonnés) */
{
  const win = front.periodWindow('semaine', new Date('2026-11-13T00:06:40Z'));
  const g = (date, sf, sa, opp, extra = {}) => ({ date, time: '19:00', scoreFor: sf, scoreAgainst: sa, opponent: opp, opponentNickname: opp, opponentRegistryId: opp.toLowerCase(), ...extra });
  const teams = [
    { name: 'ULaval', registryId: 'laval', institutionName: 'Université Laval', sector: 'universitaire', sport: 'hockey', sportLabel: 'Hockey', sex: 'F',
      results: [g('2026-11-08', 1, 5, 'Gaiters'), g('2026-11-01', 3, 2, 'Martlets'), g('2026-11-07', 2, 2, 'Stingers', { priorSeason: true })] },
    { name: 'ULaval', registryId: 'laval', institutionName: 'Université Laval', sector: 'universitaire', sport: 'volleyball', sportLabel: 'Volleyball', sex: 'F',
      results: [g('2026-11-08', 3, 1, 'Martlets'), g('2026-11-07', 3, 0, 'Carabins')] },
    { name: 'Concordia', registryId: 'concordia', institutionName: 'Université Concordia', sector: 'universitaire', sport: 'basketball', sportLabel: 'Basketball', sex: 'M',
      results: [g('2026-11-07', 89, 88, 'Gaiters')], nextGames: [{ date: '2026-11-20' }] },
  ];
  const laval = { slug: 'laval', line: 'Université Laval', label: 'Université Laval' };
  const r = front.periodResults(teams, win, laval, 4);
  assert.equal(r.played, 3, 'hors période et saison passée exclus');
  assert.equal(r.wins, 2);
  assert.equal(r.items.length, 3);
  assert.notEqual(r.items[0].kicker, r.items[1].kicker, 'sports variés en tête');
  assert.match(r.items[0].line, /^ULaval \d+–\d+ /);
  assert.ok(r.items.every((it) => it.date >= win.from && it.date <= win.to));
  assert.equal(front.periodResults(teams, win, { slug: 'udem', line: 'Université de Montréal', label: 'x' }, 4).items.length, 0, 'aucune donnée : bande retirée');
  assert.equal(front.periodResults(teams, front.periodWindow('jour'), laval, 4).items.length, 0);
  assert.ok(r.items.every((it) => front.SPORT_EMOJI_ALL.includes(it.emoji)), 'emoji de sport sur chaque résultat');
  assert.ok(r.items.some((it) => it.emoji === '🏐') && r.items.some((it) => it.emoji === '🏒'), 'emoji selon le sport de la donnée');
}

// Emojis de sport : selon le sport de la donnée, repli neutre, tous couverts par la police auto-hébergée.
{
  const cases = { Football: '🏈', 'Flag football': '🏈', Hockey: '🏒', Basketball: '🏀', Volleyball: '🏐', Soccer: '⚽',
    'Soccer intérieur': '⚽', Futsal: '⚽', Rugby: '🏉', Baseball: '⚾', Badminton: '🏸', Natation: '🏊', Athlétisme: '🏃',
    'Cross-country': '🏃', Golf: '⛳', Ultimate: '🥏', Voile: '⛵', Cheerleading: '📣', 'hockey-feminin': '🏒' };
  for (const [sport, emoji] of Object.entries(cases)) assert.equal(front.sportEmoji(sport), emoji, sport);
  assert.equal(front.sportEmoji('Escrime'), '🏅', 'sport inconnu : repli neutre');
  assert.equal(front.sportEmoji(''), '🏅');
  assert.equal(front.sportEmoji(undefined), '🏅');
  const cov = JSON.parse(readFileSync(new URL('../assets/kit/fonts/emoji/coverage.json', import.meta.url), 'utf8'));
  for (const e of front.SPORT_EMOJI_ALL) assert.ok(cov.emojis.includes(e), `glyphe ${e} absent de la police emoji`);
}

// Bandeau : dates insécables, coupure seulement après une virgule ; typographie française.
{
  const segs = front.mastheadSegments('Dernier mois, du 14 octobre au 12 novembre 2026');
  assert.deepEqual(segs, ['Dernier\u00A0mois,', 'du\u00A014\u00A0octobre\u00A0au\u00A012\u00A0novembre\u00A02026']);
  assert.ok(front.mastheadSegments('Vendredi 13 novembre 2026').every((x) => !/ /.test(x)), 'date du haut : aucune espace sécable');
  assert.equal(front.mastheadSegments('Vendredi 13 novembre 2026').length, 1);
  assert.equal(front.frTypo('NOUVELLE GARDE: Le temps'), 'NOUVELLE GARDE\u00A0: Le temps');
  assert.equal(front.frTypo('Pourquoi pas?'), 'Pourquoi pas\u202F?');
  assert.equal(front.frTypo('«Génère-moi»'), '«\u00A0Génère-moi\u00A0»');
  assert.equal(front.frTypo("L'autre"), 'L’autre');
  assert.equal(front.frTypo('Il est 18:00'), 'Il est 18:00', 'heures intactes');
  const card = front.normalize({ title: 'Titre: test', lang: 'fr', link: 'https://ex.org/a', source: 'S', date: '2026-11-12T15:00:00Z' });
  assert.equal(card.title, 'Titre\u00A0: test');
  assert.ok(!/ /.test(card.dateLabel), 'date de signature insécable');
  const en = front.normalize({ title: 'Title: test', lang: 'en', link: 'https://ex.org/b', source: 'S', date: '2026-11-12T15:00:00Z' });
  assert.equal(en.title, 'Title: test', 'titres anglais inchangés');
}

// Genre « (F) » / « (H) » d’après la donnée seulement ; noms d’équipes + établissement.
{
  assert.equal(front.genderMark('F'), '(F)');
  assert.equal(front.genderMark('M'), '(H)');
  assert.equal(front.genderMark(''), '', 'genre inconnu : rien');
  assert.equal(front.genderMark('X'), '', 'mixte : rien, pas de devinette');
  const laval = { slug: 'laval', line: 'Université Laval', label: 'Université Laval' };
  const team = { name: 'ULaval', nickname: 'Rouge et Or', institutionName: 'Université Laval', sex: 'F' };
  const g = { opponent: 'Concordia', opponentNickname: 'Stingers', opponentFullName: 'Université Concordia' };
  assert.deepEqual(front.gameSides(team, g, laval), { who: 'Rouge et Or', vs: 'Stingers (Concordia)' });
  const general = front.gameSides(team, g, null);
  assert.equal(general.who, 'Rouge et Or (ULaval)', 'affiche générale : établissement entre parenthèses');
  assert.equal(front.gameSides({ ...team, nickname: '' }, { opponent: "Bishop's", opponentFullName: "Bishop's University" }, laval).vs, 'Bishop’s', 'sans surnom : établissement seul');
  assert.equal(front.teamLabel('Gaiters', "Bishop's", false), 'Gaiters (Bishop’s)');
}

// Sélection manuelle : rôles d’articles (places libres complétées par l’auto) et sports choisis par id.
{
  const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id: id.repeat(16) }));
  const id = (c) => c.repeat(16);
  const r = front.assignRoles(pool, { une: id('d'), aussi: [id('f')], vedettes: [id('a')], bref: [id('g')], masquer: [id('b')] }, { side: 2, grid: 2, briefs: 2 });
  assert.equal(r.lead.id, id('d'), 'une choisie');
  assert.deepEqual(r.side.map((a) => a.id), [id('f'), id('c')], 'aussi à lire : choix puis auto');
  assert.deepEqual(r.grid.map((a) => a.id), [id('a'), id('e')]);
  assert.deepEqual(r.briefs.map((a) => a.id), [id('g')], 'masqué jamais repris');
  const auto = front.assignRoles(pool, {}, { side: 2, grid: 1, briefs: 0 });
  assert.deepEqual([auto.lead, ...auto.side, ...auto.grid].map((a) => a.id), [id('a'), id('b'), id('c'), id('d')], 'sans choix : ordre auto');

  const s1 = { date: '2026-10-25', kicker: 'Voile', line: 'ULaVoile\u00A0: 7e sur 11 · Championnat canadien par équipes' };
  const s2 = { date: '2026-11-13', kicker: 'Volleyball (F)', line: 'Rouge et Or reçoit Stingers (Concordia)' };
  s1.id = front.sportItemId(s1);
  s2.id = front.sportItemId(s2);
  assert.match(s1.id, /^[0-9a-f]{8}$/);
  assert.equal(front.sportItemId({ ...s1 }), s1.id, 'id stable');
  assert.notEqual(s1.id, s2.id);
  assert.deepEqual(front.applySportSelection([s1, s2], [s2], [], []), [s2], 'auto par défaut');
  assert.deepEqual(front.applySportSelection([s1, s2], [s2], [s1.id], []), [s1, s2], 'choix épinglé en tête, auto ensuite');
  assert.deepEqual(front.applySportSelection([s1, s2], [s2], [s1.id], [s2.id]), [s1], 'choix seul si le reste est masqué');
  assert.deepEqual(front.applySportSelection([s1, s2], [s2], [], [s2.id]), [], 'masqué');
  assert.equal(front.placeLabel(7, 11), '7e sur 11');
  assert.equal(front.placeLabel(1, 5), '1er sur 5');
  assert.equal(front.placeLabel(0, 5), '');

  // Résultat au classement (voile) : « 7e sur 11 », sans genre inventé, jamais un faux score.
  const team = { id: 'sailing:universitaire:ulaval', name: 'ULaVoile', sport: 'sailing', sportLabel: 'Voile', institutionName: 'Université Laval', sector: 'universitaire', sex: null,
    results: [{ date: '2026-10-25', scoreKind: 'place', scoreFor: 7, scoreAgainst: 11, result: 'L', opponent: 'Championnat canadien par équipes' }] };
  const res = front.periodResults([team], { from: '2026-10-14', to: '2026-11-12' }, { slug: 'laval', line: 'Université Laval', label: 'Université Laval' }, 5);
  const v = res.items.find((x) => /7e sur 11/.test(x.line));
  assert.ok(v, 'résultat de voile présent');
  assert.ok(!/7–11/.test(v.line));
  assert.equal(v.gender, '');
  assert.match(v.id, /^[0-9a-f]{8}$/);
}

// Phrase par défaut sous « Scanne-moi » : exactement « Le fil étudiant, en direct ».
{
  const src = readFileSync(join(root, 'affiches/poster-builder.js'), 'utf8');
  assert.match(src, /uneTagline: 'direct'/);
  assert.match(src, /direct: \{ label: 'Le fil étudiant, en direct', fr: 'Le fil étudiant, en direct'/);
  const html = readFileSync(join(root, 'affiches/index.html'), 'utf8');
  assert.match(html, /<option value="direct" selected>Le fil étudiant, en direct<\/option>/);
}

// Une en surimpression, en-tête givré adaptatif, verbes de rencontre atténués (focus-group 12 nov.).
{
  const src = readFileSync(join(root, 'affiches/poster-builder.js'), 'utf8');
  assert.match(src, /uneLeadPhoto: 'surimpression'/, 'photo de une pleine hauteur par défaut');
  assert.match(src, /uneMastGlass: 'givre'/, 'en-tête givré par défaut sur fond photo');
  assert.match(src, /\['bande', 'ratio', 'surimpression'\]\.includes\(photoUne\)/);
  assert.match(src, /reçoit\|visite\|chez\|vs\|à/, 'verbes atténués comme sur le site');
  const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (r) => 0.2126 * lin(r[0]) + 0.7152 * lin(r[1]) + 0.0722 * lin(r[2]);
  const cr = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05);
  const mix = (a, fg, bg) => fg.map((v, i) => a * v + (1 - a) * bg[i]);
  assert.ok(cr([197, 171, 196], [0x6c, 0x21, 0x63]) >= 4.5, 'verbe atténué de l’en-tête : AA');
  assert.ok(cr(mix(0.55, [245, 246, 248], [0x3b, 0x12, 0x36]), [0x3b, 0x12, 0x36]) >= 4.5, 'verbe atténué de la bande : AA');
  assert.ok(cr([255, 255, 255], mix(0.78, [20, 8, 20], [255, 255, 255])) >= 4.5, 'titre blanc sur dégradé, même sur pixel blanc : AA');
}

// t984u : émissions de radio originales, de jour ou de soir, étalées ; taille commune ; aucune rangée de langues.
{
  const F = require('../scripts/magazine-front-page-lib.js');
  const grid = [
    { day: 5, start: '01:00', title: 'Mix franco' }, { day: 5, start: '02:00', title: 'Club classique (reprise)' },
    { day: 5, start: '04:00', title: 'Le Séismix' }, { day: 5, start: '07:00', title: 'Quartier libre' },
    { day: 5, start: '08:00', title: 'La collation' }, { day: 5, start: '10:00', title: 'Accents ouverts' },
    { day: 5, start: '13:00', title: 'Le palmarès' }, { day: 5, start: '18:00', title: 'Mix électro' },
    { day: 5, start: '20:00', title: 'Le 120e parallèle (reprise)' }, { day: 5, start: '23:00', title: 'Rebelles soniques (reprise)' },
  ];
  const shows = F.pickRadioShows(grid, '2026-11-13', '00:30', 3);
  assert.deepEqual(shows.map((x) => `${x.start} ${x.title}`), ['07:00 Quartier libre', '10:00 Accents ouverts', '13:00 Le palmarès']);
  for (const x of F.pickRadioShows(grid, '2026-11-13', '00:30', 6)) {
    assert.ok(x.start >= '07:00' && x.start <= '22:00', `heure raisonnable : ${x.start}`);
    assert.doesNotMatch(x.title, /reprise|^mix/i);
  }
  const src = readFileSync(join(root, 'affiches/poster-builder.js'), 'utf8');
  assert.match(src, /Front\.pickRadioShows\(grid, startYmd, nowHm, limit\)/);
  assert.match(src, /const widest = \(\) => Math\.max\(\.\.\.extra\.lines\.map/, 'taille commune aux lignes radio');
  assert.doesNotMatch(src, /while \(z > Math\.round\(exLineS \* 0\.7\) && ctx\.measureText\(line\)/, 'plus de rétrécissement ligne par ligne');
  assert.match(src, /const showLangs = false;/, 'aucune rangée de langues');
  assert.doesNotMatch(readFileSync(join(root, 'affiches/index.html'), 'utf8'), /name="langs"/);
  // t985u : images attendues et décodées, image manquante signalée ; image verticale montrée entière.
  assert.match(src, /img\.decode\(\)\.then\(done, done\)/);
  assert.match(src, /document\.body\.dataset\.posterImages = missing\.length/);
  assert.match(src, /const tall = isw \/ ish < \(lw \/ phH\) \* 0\.62;/);
  // t987u : « En chiffres » avec un seul média (verdict focus-group : signatures, repli nom du média).
  assert.equal(F.numbersLine([{ source: 'Quartier Libre', authors: ['A'] }, { source: 'Impact Campus', authors: ['B'] }]), '2 articles · 2 médias');
  assert.equal(F.numbersLine([{ source: 'Quartier Libre', authors: ['Ana Roy'] }, { source: 'Quartier Libre', authors: ['Léo Côté', 'Ana Roy'] }]), '2 articles · 2 signatures');
  assert.equal(F.numbersLine([{ source: 'Quartier Libre', authors: [] }]), '1 article de Quartier Libre');
  assert.equal(F.numbersLine([{ source: 'Le Polyscope', authors: [] }], { suffix: 'en 7 jours' }), '1 article en 7 jours du Polyscope');
  assert.equal(F.numbersLine([{ source: 'Impact Campus', authors: [] }]), '1 article d’Impact Campus');
  assert.equal(F.numbersLine([{ source: 'Les Inspirés', authors: [] }]), '1 article des Inspirés');
  assert.doesNotMatch(F.numbersLine(Array(9).fill({ source: 'Quartier Libre', authors: ['X'] })), /1 média/);
}

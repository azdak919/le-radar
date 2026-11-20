/* Dédoublonnage du fil : lien canonique, ou source + titre + jour à Montréal.
 * Run: node tests/news-dedupe.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  foldKey,
  titleDayKey,
  dedupeArticles,
  dedupeArticlesList,
} = require('../scripts/news-dedupe-lib');
const { articleDedupeKey } = require('../scripts/live-link-health-lib');
const { dedupeNewsItems } = require('../scripts/dedupe-news-json');

assert.equal(foldKey("L'Exemplaire"), foldKey('L’Exemplaire'));
assert.equal(
  titleDayKey({
    source: "L'Exemplaire",
    title: 'Marcher pour mieux vieillir',
    date: '2026-10-13T02:12:44.000Z', // 12 oct. 22 h 12 à Montréal
  }),
  titleDayKey({
    source: "L'Exemplaire",
    title: 'Marcher pour mieux vieillir',
    date: '2026-10-13T02:12:44.000Z',
  }),
);
assert.match(
  titleDayKey({
    source: "L'Exemplaire",
    title: 'Marcher pour mieux vieillir',
    date: '2026-10-13T02:12:44.000Z',
  }),
  /\|2026-10-12$/,
);

// Variantes d'URL déjà couvertes (www, slash, utm) + /amp.
{
  const base = 'https://delitfrancais.com/2026/09/30/affaire';
  assert.equal(articleDedupeKey('https://www.delitfrancais.com/2026/09/30/affaire/amp/'), base);
  assert.equal(articleDedupeKey('https://delitfrancais.com/2026/09/30/affaire/amp'), base);
}

// L'Exemplaire : même article sous /a-la-une/ et /actualites/.
{
  const items = [
    {
      source: "L'Exemplaire",
      title: 'Cancer du sein : les milieux professionnels à risque sous la loupe',
      date: '2026-11-03T17:03:46.000Z',
      link: 'https://www.exemplaire.com.ulaval.ca/a-la-une/cancer-du-sein-les-milieux-professionnels-a-risque-sous-la-loupe/',
    },
    {
      source: "L'Exemplaire",
      title: 'Cancer du sein : les milieux professionnels à risque sous la loupe',
      date: '2026-11-03T17:03:46.000Z',
      link: 'https://www.exemplaire.com.ulaval.ca/actualites/cancer-du-sein-les-milieux-professionnels-a-risque-sous-la-loupe',
    },
  ];
  const out = dedupeArticles(items);
  assert.equal(out.removed, 1);
  assert.equal(out.items.length, 1);
  assert.match(out.items[0].link, /a-la-une/);
}

// The Tribune : www et chemin de rubrique plus long.
{
  const items = [
    {
      source: 'The Tribune',
      title: 'Belonging is not something we have to earn',
      date: '2026-09-08T10:03:00.000Z',
      link: 'https://thetribune.ca/opinion/op-off-the-board/belonging-is-not-something-we-have-to-earn-08092026/',
    },
    {
      source: 'The Tribune',
      title: 'Belonging is not something we have to earn',
      date: '2026-09-08T10:03:00.000Z',
      link: 'https://www.thetribune.ca/opinion/belonging-is-not-something-we-have-to-earn-08092026',
    },
  ];
  assert.equal(dedupeArticlesList(items).length, 1);
}

// Suffixe -2 (La Pige, Le Délit) le même jour : une seule entrée.
{
  const items = [
    {
      source: 'Le Délit',
      title: 'Manifestation anti-IA à Montréal',
      date: '2026-09-23T15:16:39.000Z',
      link: 'https://www.delitfrancais.com/2026/09/23/manifestation-anti-ia-a-montreal-2',
    },
    {
      source: 'Le Délit',
      title: 'Manifestation anti-IA à Montréal',
      date: '2026-09-23T07:00:00.000Z',
      link: 'https://www.delitfrancais.com/2026/09/23/manifestation-anti-ia-a-montreal',
    },
  ];
  const out = dedupeArticles(items);
  assert.equal(out.items.length, 1);
  assert.equal(out.removed, 1);
}

// Un -2 sans jumeau reste un vrai article.
{
  const items = [
    {
      source: 'Le Délit',
      title: 'Souriez, vous êtes filmés !',
      date: '2026-11-04T07:00:00.000Z',
      link: 'https://www.delitfrancais.com/2026/11/04/souriez-vous-etes-filmes-2/',
    },
  ];
  assert.equal(dedupeArticlesList(items).length, 1);
}

// Quartier Libre : « Cinq nouvelles de la semaine » à des jours distincts, toutes gardées.
{
  const items = [
    {
      source: 'Quartier Libre',
      title: 'Cinq nouvelles de la semaine',
      date: '2026-11-14T20:00:00.000Z',
      link: 'https://quartierlibre.ca/cinq-nouvelles-de-la-semaine-16/',
    },
    {
      source: 'Quartier Libre',
      title: 'Cinq nouvelles de la semaine',
      date: '2026-11-07T23:00:00.000Z',
      link: 'https://quartierlibre.ca/cinq-nouvelles-de-la-semaine-15/',
    },
    {
      source: 'Quartier Libre',
      title: 'Cinq nouvelles de la semaine',
      date: '2026-10-31T22:00:00.000Z',
      link: 'https://quartierlibre.ca/cinq-nouvelles-de-la-semaine-14',
    },
  ];
  assert.equal(dedupeArticlesList(items).length, 3, 'série QL conservée');
}

// Deux médias, même titre, même jour : deux articles distincts.
{
  const items = [
    { source: 'The Link', title: 'Orientation week', date: '2026-09-08T12:00:00.000Z', link: 'https://thelinknewspaper.ca/a' },
    { source: 'The Concordian', title: 'Orientation week', date: '2026-09-08T13:00:00.000Z', link: 'https://theconcordian.com/b' },
  ];
  assert.equal(dedupeArticlesList(items).length, 2);
}

// Image locale préférée (garde après rebase).
{
  const r = dedupeNewsItems([
    { title: 'X', source: 'Le Délit', date: '2026-09-30T12:00:00.000Z', link: 'https://www.delitfrancais.com/2026/09/30/affaire/' },
    { title: 'Y', source: 'Autre', date: '2026-09-30T12:00:00.000Z', link: 'https://ex.com/y' },
    {
      title: 'X',
      source: 'Le Délit',
      date: '2026-09-30T12:00:00.000Z',
      link: 'http://www.delitfrancais.com/2026/09/30/affaire/?utm_campaign=z',
      imageLocal: 'assets/news-images/a.jpg',
    },
  ]);
  assert.equal(r.removed, 1);
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].imageLocal, 'assets/news-images/a.jpg');
}

// fetch-news et le flux RSS doivent passer par la même bibliothèque.
{
  const fetchNews = readFileSync(new URL('../scripts/fetch-news.js', import.meta.url), 'utf8');
  const feed = readFileSync(new URL('../scripts/generate-feed.js', import.meta.url), 'utf8');
  assert.match(fetchNews, /dedupeArticlesList/);
  assert.match(feed, /dedupeArticlesList/);
  assert.doesNotMatch(
    feed,
    /même titre normalisé \(reprises multi-sources\)/,
    'le flux ne doit plus fusionner deux médias sur le seul titre',
  );
}

console.log('OK news-dedupe');

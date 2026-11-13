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

console.log(`magazine-front-page : OK (${cards.items.length} articles, une = ${cards.lead?.title})`);

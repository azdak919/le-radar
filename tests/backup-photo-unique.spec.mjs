import { expect, test } from '@playwright/test';

const FEED = {
  updated: '2026-09-21T16:00:00.000Z',
  items: [
    {
      source: 'Le Collectif',
      institution: 'Université de Sherbrooke',
      lang: 'fr',
      title: 'Le DSM-6 ?',
      link: 'https://lecollectif.ca/societe/le-dsm-6/',
      date: '2026-09-21T15:47:37.000Z',
      excerpt: 'Les manuels du DSM servent à classer les troubles de santé mentale.',
      image: 'https://lecollectif.ca/wp-content/uploads/2026/09/antidote-banniere-JLC.jpg',
    },
    {
      source: 'Le Collectif',
      institution: 'Université de Sherbrooke',
      lang: 'fr',
      title: 'Circonscriptions des personnes cheffes de parti',
      link: 'https://lecollectif.ca/societe/circonscriptions-des-personnes-cheffes-de-parti/',
      date: '2026-09-21T15:30:34.000Z',
      excerpt: 'Cet automne, 127 circonscriptions sont à surveiller.',
      image: 'https://lecollectif.ca/wp-content/uploads/2026/09/antidote-banniere-JLC.jpg',
    },
    {
      source: 'Le Collectif',
      institution: 'Université de Sherbrooke',
      lang: 'fr',
      title: 'Débat économique de TVA',
      link: 'https://lecollectif.ca/societe/debat-economique-de-tva/',
      date: '2026-09-21T15:23:30.000Z',
      excerpt: 'Le débat du 15 septembre concernait l’économie.',
      image: 'https://lecollectif.ca/wp-content/uploads/2026/09/antidote-banniere-JLC.jpg',
    },
  ],
};

test('backups campus UdeS : photos distinctes sur les cartes sans photo d’article', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.route('**/news.json*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(FEED),
  }));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.locator('#news-list').getAttribute('data-ready'), {
    timeout: 20_000,
  }).toBe('1');

  const cards = await page.evaluate(() => {
    return [...document.querySelectorAll('#news-list .article')].map((article) => {
      const item = article.__radarItem || {};
      return {
        title: item.title || '',
        provider: item.imageProvider || '',
        stock: item.stockImage || '',
      };
    });
  });

  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  expect(cards.length).toBe(3);
  for (const card of cards) {
    expect(card.provider, card.title).toBe('campus-bank');
    expect(card.stock, card.title).toMatch(/wikimedia|upload\.wikimedia/i);
  }
  const keys = cards.map((card) => {
    const url = new URL(card.stock);
    return `${url.hostname}${decodeURIComponent(url.pathname)}`.toLowerCase();
  });
  expect(new Set(keys).size, keys.join(' | ')).toBe(3);
});

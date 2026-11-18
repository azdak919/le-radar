import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const photo = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/card-photo.jpg'));

async function stubPhotos(page) {
  const fulfill = (route) => route.fulfill({
    contentType: 'image/jpeg',
    body: photo,
    headers: { 'Cache-Control': 'no-store' },
  });
  await page.route('**/assets/news-images/**', fulfill);
  await page.route('**/assets/stock-images/**', fulfill);
}

async function waitForNewsReady(page) {
  await expect.poll(async () => page.locator('#news-list').getAttribute('data-ready'), {
    timeout: 20_000,
  }).toBe('1');
  await expect(page.locator('#news-list .article').first()).toBeVisible();
}

async function cardImageStats(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('#news-list .article')];
    const rows = cards.map((el) => {
      const img = el.querySelector('.article-media img');
      const media = el.querySelector('.article-media');
      const cs = media ? getComputedStyle(media) : null;
      return {
        lead: el.classList.contains('article--lead'),
        hasImage: el.classList.contains('has-image'),
        loaded: !!(img && img.naturalWidth > 0),
        mediaDisplay: cs ? cs.display : null,
        loading: img ? img.loading : null,
      };
    });
    const others = rows.filter((r) => !r.lead);
    return {
      total: rows.length,
      leadLoaded: rows.some((r) => r.lead && r.loaded),
      others: others.length,
      othersLoaded: others.filter((r) => r.loaded && r.hasImage).length,
      othersHiddenMedia: others.filter((r) => r.mediaDisplay === 'none').length,
    };
  });
}

test('mobile : les photos des cartes, pas seulement la une, se chargent', async ({ page }) => {
  await stubPhotos(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForNewsReady(page);
  await expect.poll(async () => (await cardImageStats(page)).othersLoaded, {
    timeout: 15_000,
  }).toBeGreaterThanOrEqual(6);
  const stats = await cardImageStats(page);
  expect(stats.leadLoaded, 'la une a sa photo').toBe(true);
  expect(stats.othersHiddenMedia, 'des médias de cartes encore en display:none').toBe(0);
});

test('bureau : les photos des cartes, pas seulement la une, se chargent', async ({ page }) => {
  await stubPhotos(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForNewsReady(page);
  await expect.poll(async () => (await cardImageStats(page)).othersLoaded, {
    timeout: 15_000,
  }).toBeGreaterThanOrEqual(6);
});

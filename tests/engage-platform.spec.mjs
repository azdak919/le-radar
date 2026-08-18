import { expect, test } from '@playwright/test';

/**
 * Détection install : un bureau tactile (2-en-1 + écran externe) n’est pas
 * un téléphone. Régression Edge / Philips 1920 — consignes « écran d’accueil ».
 */

const EDGE_LINUX =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
const PIXEL_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

async function classify(page, input) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.RadarEngage?.classify === 'function');
  return page.evaluate((arg) => window.RadarEngage.classify(arg), input);
}

test('Edge Linux 1920 + tactile : bureau, pas écran d’accueil', async ({ page }) => {
  const plat = await classify(page, {
    ua: EDGE_LINUX,
    coarse: true,
    narrow: false,
    desktopWide: true,
    notAPhoneViewport: true,
    ontouchstart: true,
  });
  expect(plat.browser).toBe('edge');
  expect(plat.family).toBe('desktop');
  expect(plat.mobileLike).toBe(false);
  expect(plat.desktop).toBe(true);
});

test('téléphone Android reste Android même en largeur 1920', async ({ page }) => {
  const plat = await classify(page, {
    ua: PIXEL_ANDROID,
    coarse: true,
    narrow: false,
    desktopWide: true,
    notAPhoneViewport: true,
    ontouchstart: true,
  });
  expect(plat.family).toBe('android');
  expect(plat.mobileLike).toBe(true);
  expect(plat.desktop).toBe(false);
});

test('UA réduit + fenêtre étroite + tactile : mobile_other', async ({ page }) => {
  const plat = await classify(page, {
    ua: 'Mozilla/5.0 (Linux; x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
    coarse: true,
    narrow: true,
    desktopWide: false,
    notAPhoneViewport: false,
    ontouchstart: true,
  });
  expect(plat.family).toBe('mobile_other');
  expect(plat.mobileLike).toBe(true);
});

test('viewport 1920 : detectPlatform live = desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.RadarEngage?.platform === 'function');
  const plat = await page.evaluate(() => window.RadarEngage.platform());
  expect(plat.desktop).toBe(true);
  expect(plat.family).not.toBe('mobile_other');
});

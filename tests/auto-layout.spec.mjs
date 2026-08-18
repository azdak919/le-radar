import { expect, test } from '@playwright/test';

/**
 * Prod / main : tous les layouts suivent le viewport, sans ?wide=.
 */

function wideAttr(page) {
  return page.evaluate(() => document.documentElement.dataset.widePreview || '');
}

function maxwToken(page) {
  return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--maxw').trim());
}

async function openAt(page, path, width, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}

test('390 / 768 / 1280 : layouts compact-mid-bureau, pas de E', async ({ page }) => {
  await openAt(page, '/', 390, 844);
  expect(new URL(page.url()).search).toBe('');
  expect(await wideAttr(page)).toBe('');
  await expect(page.locator('.news-list')).toHaveCSS('display', 'block');

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect.poll(() => wideAttr(page)).toBe('');
  await expect(page.locator('.news-list')).toHaveCSS('display', 'grid');

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(() => wideAttr(page)).toBe('');
  expect(await maxwToken(page)).toMatch(/1180px/);
});

test('1920 Philips : E auto sans query, shell plus large que 1180', async ({ page }) => {
  await openAt(page, '/', 1920, 1080);
  expect(new URL(page.url()).search).toBe('');
  expect(await wideAttr(page)).toBe('e');
  const inner = await page.locator('.masthead-inner').evaluate((el) => Math.round(el.getBoundingClientRect().width));
  expect(inner, 'mât encore calé à ~1180').toBeGreaterThan(1400);
});

test('1920 Philips : 2 unes, En bref 1 col, une plus large que le rail', async ({ page }) => {
  await openAt(page, '/', 1920, 1080);
  await expect(page.locator('.news-list[data-ready]')).toBeVisible({ timeout: 12_000 });
  await expect(page.locator('.news-hero')).toHaveAttribute('data-leads', '2');

  const layout = await page.evaluate(() => {
    const hero = document.querySelector('.news-hero');
    const brief = document.querySelector('.brief-rail');
    const lead0 = hero?.querySelector('.article--lead');
    const lead1 = hero?.querySelectorAll('.article--lead')[1];
    const briefCols = getComputedStyle(brief).gridTemplateColumns.split(' ').filter(Boolean);
    const heroBox = hero.getBoundingClientRect();
    const briefBox = brief.getBoundingClientRect();
    const l0 = lead0.getBoundingClientRect();
    const l1 = lead1.getBoundingClientRect();
    return {
      briefCols: briefCols.length,
      heroW: Math.round(heroBox.width),
      briefW: Math.round(briefBox.width),
      leadW: Math.round(l0.width),
      leadsSideBySide: Math.abs(l0.top - l1.top) < 8 && l1.left > l0.right - 2,
      overlap: Math.round(l0.right - l1.left),
    };
  });

  expect(layout.briefCols, 'En bref doit rester 1 colonne à 1920').toBe(1);
  expect(layout.leadsSideBySide, 'les 2 unes doivent être côte à côte').toBe(true);
  expect(layout.overlap, `unes qui se chevauchent (${layout.overlap} px)`).toBeLessThanOrEqual(0);
  expect(layout.heroW, `une trop étroite (${layout.heroW} vs bref ${layout.briefW})`)
    .toBeGreaterThan(layout.briefW * 1.55);
  expect(layout.leadW, `chaque une trop étroite (${layout.leadW} px)`).toBeGreaterThanOrEqual(480);
});

test('?wide=off force l’ancien 1180 ; / tout seul active E à 1920', async ({ page }) => {
  await openAt(page, '/?wide=off', 1920, 1080);
  expect(await wideAttr(page)).toBe('');
  expect(await maxwToken(page)).toMatch(/1180px/);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(new URL(page.url()).search).toBe('');
  expect(await wideAttr(page)).toBe('e');
});

test('sports / médias / fiche radio : E auto sans query', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const path of ['/sports/', '/medias/', '/radios/ckut/']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(new URL(page.url()).search).toBe('');
    expect(await wideAttr(page), path).toBe('e');
    expect(
      await page.evaluate(() => !!document.querySelector('link[href*="wide-desktop-preview.css"]')),
      `${path} : CSS wide absent`,
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => wideAttr(page)).toBe('');
});

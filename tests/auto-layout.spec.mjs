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

async function measureMagazine(page) {
  await expect(page.locator('.news-list[data-ready]')).toBeVisible({ timeout: 12_000 });
  await expect(page.locator('.news-hero .article--lead').first()).toBeVisible();
  return page.evaluate(() => {
    const hero = document.querySelector('.news-hero');
    const brief = document.querySelector('.brief-rail');
    const leads = [...(hero?.querySelectorAll('.article--lead') || [])];
    /* Compter les pistes résolues (px), pas les tokens `minmax(0, 1fr)`. */
    const briefCols = (getComputedStyle(brief).gridTemplateColumns.match(/[\d.]+px/g) || []).length;
    const heroBox = hero.getBoundingClientRect();
    const briefBox = brief.getBoundingClientRect();
    const l0 = leads[0]?.getBoundingClientRect();
    const l1 = leads[1]?.getBoundingClientRect();
    const rowCount = (sel) => {
      const els = [...(hero?.querySelectorAll(sel) || [])];
      if (!els.length) return 0;
      const first = els[0].getBoundingClientRect().top;
      return els.filter((el) => Math.abs(el.getBoundingClientRect().top - first) < 8).length;
    };
    return {
      leadCount: leads.length,
      dataLeads: hero?.dataset.leads || '',
      leadCols: rowCount('.article--lead'),
      featCols: rowCount('.article--feature'),
      briefCols,
      heroW: Math.round(heroBox.width),
      briefW: Math.round(briefBox.width),
      leadW: l0 ? Math.round(l0.width) : 0,
      briefColW: briefCols ? Math.round(briefBox.width / briefCols) : 0,
      leadsSideBySide: !!(l0 && l1 && Math.abs(l0.top - l1.top) < 8 && l1.left > l0.right - 2),
      overlap: l0 && l1 ? Math.round(l0.right - l1.left) : 0,
    };
  });
}

test('1920 Philips : 2 unes, En bref 1 col, une plus large que le rail', async ({ page }) => {
  await openAt(page, '/', 1920, 1080);
  const layout = await measureMagazine(page);
  expect(layout.dataLeads).toBe('2');

  expect(layout.briefCols, 'En bref doit rester 1 colonne à 1920').toBe(1);
  expect(layout.leadsSideBySide, 'les 2 unes doivent être côte à côte').toBe(true);
  expect(layout.overlap, `unes qui se chevauchent (${layout.overlap} px)`).toBeLessThanOrEqual(0);
  expect(layout.heroW, `une trop étroite (${layout.heroW} vs bref ${layout.briefW})`)
    .toBeGreaterThan(layout.briefW * 1.55);
  expect(layout.leadW, `chaque une trop étroite (${layout.leadW} px)`).toBeGreaterThanOrEqual(480);
});

test('2560 : En bref 1 col un peu plus large, unes toujours lisibles', async ({ page }) => {
  await openAt(page, '/', 2560, 1440);
  const layout = await measureMagazine(page);
  expect(layout.dataLeads).toBe('2');

  expect(layout.briefCols, 'En bref reste 1 colonne à 2560').toBe(1);
  expect(layout.leadsSideBySide).toBe(true);
  expect(layout.overlap).toBeLessThanOrEqual(0);
  expect(layout.heroW).toBeGreaterThan(layout.briefW * 1.35);
  expect(layout.leadW, `2560 : chaque une trop étroite (${layout.leadW} px)`).toBeGreaterThanOrEqual(620);
  expect(layout.briefW, `2560 : En bref trop étroit (${layout.briefW} px)`).toBeGreaterThanOrEqual(620);
});

test('3840 : 3 unes, En bref 2 col sans être affamé', async ({ page }) => {
  await openAt(page, '/', 3840, 1600);
  const layout = await measureMagazine(page);
  expect(layout.dataLeads).toBe('3');
  expect(layout.leadCols, 'À la une en 3 colonnes à 3840').toBe(3);
  expect(layout.featCols, 'Vedettes en 3 colonnes à 3840').toBe(3);
  expect(layout.briefCols, 'En bref reste 2 colonnes à 3840').toBe(2);
  expect(layout.overlap).toBeLessThanOrEqual(0);
  expect(layout.heroW).toBeGreaterThan(layout.briefW);
  expect(layout.leadW, `3840 : chaque une trop étroite (${layout.leadW} px)`).toBeGreaterThanOrEqual(560);
  expect(layout.leadW, `3840 : chaque une trop large (${layout.leadW} px)`).toBeLessThan(820);
  expect(layout.briefColW, `3840 : carte En bref trop étroite (${layout.briefColW} px)`).toBeGreaterThanOrEqual(520);
});

test('3440 : 2 unes moins étirées, En bref 2 col plus large', async ({ page }) => {
  await openAt(page, '/', 3440, 1440);
  const layout = await measureMagazine(page);
  expect(layout.dataLeads).toBe('2');
  expect(layout.leadCols, 'À la une reste 2 colonnes à 3440').toBe(2);
  expect(layout.featCols, 'Vedettes restent 2 colonnes à 3440').toBe(2);
  expect(layout.briefCols, 'En bref passe à 2 colonnes à 3440').toBe(2);
  expect(layout.leadsSideBySide).toBe(true);
  expect(layout.overlap).toBeLessThanOrEqual(0);
  expect(layout.heroW).toBeGreaterThan(layout.briefW);
  expect(layout.leadW, `3440 : chaque une trop étroite (${layout.leadW} px)`).toBeGreaterThanOrEqual(640);
  expect(layout.leadW, `3440 : chaque une trop large (${layout.leadW} px)`).toBeLessThan(920);
  expect(layout.briefColW, `3440 : carte En bref trop étroite (${layout.briefColW} px)`).toBeGreaterThanOrEqual(480);
});

test('960 → 1920 : les 2 unes reviennent sans recharger', async ({ page }) => {
  test.setTimeout(45_000);
  await openAt(page, '/', 960, 1080);
  await expect(page.locator('.news-list[data-ready]')).toBeVisible({ timeout: 12_000 });
  await expect(page.locator('.news-hero .article--lead')).toHaveCount(1);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(() => wideAttr(page), { timeout: 8_000 }).toBe('e');
  await page.waitForFunction(() => {
    const hero = document.querySelector('.news-hero');
    return hero?.dataset.leads === '2'
      && hero.querySelectorAll('.article--lead').length >= 2;
  }, { timeout: 8_000 });
  const layout = await measureMagazine(page);
  expect(layout.leadsSideBySide, 'retour plein écran : unes toujours empilées').toBe(true);
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

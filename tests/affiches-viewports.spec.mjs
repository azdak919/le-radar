import { expect, test } from '@playwright/test';

/**
 * Page /affiches/ aux largeurs du labo Format (390 → 1920).
 * Détecte overflow, aperçu trop petit, erreurs JS, langues qui cassent le haut.
 */

const WIDTHS = [
  { w: 390, h: 844, name: '390' },
  { w: 430, h: 932, name: '430' },
  { w: 768, h: 1024, name: '768' },
  { w: 900, h: 700, name: '900' },
  { w: 1280, h: 720, name: '1280' },
  { w: 1440, h: 900, name: '1440' },
  { w: 1920, h: 1080, name: '1920' },
];

async function waitPreview(page) {
  const canvas = page.locator('#preview canvas');
  await expect(canvas).toBeVisible({ timeout: 20000 });
  await expect.poll(async () => {
    const box = await canvas.boundingBox();
    return box && box.height > 80 ? box.height : 0;
  }, { timeout: 15000 }).toBeGreaterThan(80);
  return canvas.boundingBox();
}

function reportOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollW: doc.scrollWidth,
      clientW: doc.clientWidth,
      overflowX: doc.scrollWidth - doc.clientWidth,
    };
  });
}

test.describe('affiches — largeurs labo', () => {
  test('barre Format du labo locale', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/affiches/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#local-lab-format-bar')).toBeVisible();
    await expect(page.locator('#local-lab-format-bar button[data-format-id="phone"]')).toHaveText('390');
    await expect(page.locator('#local-lab-format-bar button[data-format-id="wide1920"]')).toHaveText('1920');
  });

  for (const vp of WIDTHS) {
    test(`${vp.name} : aperçu portrait, pas d’overflow, pas d’erreur JS`, async ({ page }) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(String(err)));
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto('/affiches/', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('h1.seo-title')).toContainText('Imprimer une affiche');
      await expect(page.locator('.masthead')).toBeVisible();
      await expect(page.locator('.site-foot').first()).toBeVisible();
      await expect(page.locator('#lab-photo-link')).toHaveCount(0);
      const box = await waitPreview(page);
      expect(box, `${vp.name}: canvas présent`).toBeTruthy();
      expect(box.height, `${vp.name}: canvas trop petit (${box.height})`).toBeGreaterThan(120);
      expect(box.width, `${vp.name}: canvas trop étroit (${box.width})`).toBeGreaterThan(70);
      expect(box.height, `${vp.name}: aperçu pas portrait`).toBeGreaterThan(box.width * 1.05);
      const ov = await reportOverflow(page);
      expect(ov.overflowX, `${vp.name}: overflow horizontal ${ov.overflowX}px`).toBeLessThan(8);
      await expect(page.getByRole('button', { name: /JPEG 300 dpi/ }).first()).toBeVisible();
      expect(pageErrors, `${vp.name}: ${pageErrors.join(' | ')}`).toEqual([]);
    });
  }

  test('1280 : langues du site ne rapetissent pas l’aperçu', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/affiches/', { waitUntil: 'domcontentloaded' });
    const before = await waitPreview(page);
    await page.locator('label:has(input[name="langs"][value="oui"])').click();
    await page.waitForTimeout(400);
    const after = await page.locator('#preview canvas').boundingBox();
    expect(after.height).toBeGreaterThan(before.height * 0.92);
    expect(after.width).toBeGreaterThan(before.width * 0.92);
    expect(after.height).toBeGreaterThan(after.width);
  });

  test('390 : photo + cadrage restent utilisables', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/affiches/', { waitUntil: 'domcontentloaded' });
    await waitPreview(page);
    await page.locator('label:has(input[name="campus"][value="laval"])').click();
    await page.locator('#photo-more').click();
    const laval = page.locator('#photo-grid label').nth(1);
    await laval.click();
    await expect(page.locator('#crop-tools')).toBeVisible();
    const box = await page.locator('#preview canvas').boundingBox();
    expect(box.height).toBeGreaterThan(100);
    expect(box.width).toBeGreaterThan(60);
    const ov = await reportOverflow(page);
    expect(ov.overflowX).toBeLessThan(8);
  });

  test('1280 : cadrage à côté sans écraser l’aperçu', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/affiches/', { waitUntil: 'domcontentloaded' });
    await waitPreview(page);
    await page.locator('label:has(input[name="campus"][value="laval"])').click();
    await page.locator('#photo-grid label').nth(1).click();
    await expect(page.locator('#crop-tools')).toBeVisible();
    const pane = page.locator('#preview-pane');
    await expect(pane).toHaveClass(/has-crop/);
    const canvas = await page.locator('#preview canvas').boundingBox();
    const crop = await page.locator('#crop-tools').boundingBox();
    expect(canvas.height).toBeGreaterThan(280);
    expect(crop.x).toBeGreaterThan(canvas.x + canvas.width - 8);
  });
});

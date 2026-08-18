import { expect, test } from '@playwright/test';

/**
 * Crédits du mât : nom de l’auteur, sans son origine (« from Sydney »),
 * et lieu de la *photo* après le nom quand on le connaît.
 */
test('crédits mât : pas d’origine auteur + lieu de la photo', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const short = page.locator('.bg-photo-credit__short');
  await expect(short).toBeVisible({ timeout: 8000 });

  const seen = new Set();
  for (let i = 0; i < 10; i += 1) {
    const text = (await short.innerText()).replace(/\s+/g, ' ').trim();
    seen.add(text);
    expect(text, 'crédit vide').toBeTruthy();
    expect(text, `origine auteur encore visible : ${text}`).not.toMatch(
      /\bfrom\s+[A-ZÀ-Ÿ]/i,
    );
    expect(text, `Sydney dans le crédit : ${text}`).not.toMatch(/sydney/i);
    if (i < 9) {
      await page.evaluate(() => window.__lrShuffleMastheadPhoto?.());
      await page.waitForTimeout(80);
    }
  }

  const banks = await page.evaluate(async () => {
    const files = [
      './data/quebec-backgrounds.json',
      './data/quebec-favorites-backgrounds.json',
      './data/quebec-university-backgrounds.json',
    ];
    const packs = await Promise.all(files.map((u) => fetch(u).then((r) => r.json())));
    return packs.flatMap((b) =>
      (b.photos || []).map((p) => ({
        credit: p.credit || '',
        place: p.place || '',
        title: p.title || '',
      })),
    );
  });
  expect(banks.length).toBeGreaterThan(50);
  const andrea = banks.filter((p) => /andrea schaffer/i.test(p.credit));
  expect(andrea.length).toBeGreaterThan(0);
  for (const photo of andrea) {
    expect(photo.credit).toBe('Andrea Schaffer');
    expect(photo.place).toMatch(/Forillon|Percé/);
  }
  const soulanges = banks.find((p) => /soulanges/i.test(p.title));
  expect(soulanges?.place).toMatch(/Soulanges|Coteau-du-Lac|Hudson/);
  expect(banks.some((p) => /\bfrom\s+[A-Z]/i.test(p.credit))).toBe(false);

  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

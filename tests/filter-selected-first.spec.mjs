import { test, expect } from '@playwright/test';

// La source choisie se place juste après « Le Radar » ; les autres gardent
// leur ordre ; la source précédente retrouve sa place.
for (const width of [900, 1440]) {
  test(`${width} : source choisie à droite de Le Radar, la précédente reprend sa place @ci-critical`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/assets/news-images/**', (r) => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"/>' }));
    await page.route('https://**/*', (r) => r.abort());
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#news-filters-panel')).toHaveAttribute('data-ready', '1');
    const order = () => page.locator('#news-filters .filter-btn').evaluateAll((bs) => bs.map((b) => b.dataset.source));
    const initial = await order();
    expect(initial[0]).toBe('all');
    const pick = initial[initial.length - 1];
    await page.locator('.filters-toggle').click();
    const btn = page.locator(`#news-filters .filter-btn[data-source="${pick}"]`);
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await expect.poll(async () => (await order()).slice(0, 2)).toEqual(['all', pick]);
    const after = await order();
    expect(after.filter((s) => s !== pick)).toEqual(initial.filter((s) => s !== pick));
    await expect(btn).toHaveClass(/active/);
    // Une autre source : elle prend la place, la précédente retrouve la sienne.
    const pick2 = initial[initial.length - 2];
    await page.locator('.filters-toggle').click();
    const btn2 = page.locator(`#news-filters .filter-btn[data-source="${pick2}"]`);
    await btn2.scrollIntoViewIfNeeded();
    await btn2.click();
    await expect.poll(async () => (await order()).slice(0, 2)).toEqual(['all', pick2]);
    expect((await order()).filter((s) => s !== pick2)).toEqual(initial.filter((s) => s !== pick2));
  });
}

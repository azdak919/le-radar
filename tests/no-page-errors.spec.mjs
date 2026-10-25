import { test, expect } from '@playwright/test';

// Aucune erreur JS au chargement (ex. récursion infinie de
// showMastheadWeatherBoard : « Maximum call stack size exceeded », 2026-10-25).
const cases = [
  ['/', 390], ['/', 1440], ['/', 2200], ['/mobile/app/#/accueil', 390],
];
for (const [url, width] of cases) {
  test(`aucune erreur de page : ${url} @ ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    expect(errors).toEqual([]);
  });
}

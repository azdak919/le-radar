import { test, expect } from '@playwright/test';

// « Résultat à venir » : pastille jaune et encre noire (comme « Prochain »),
// pas le pourpre des dates passées. Clair et sombre.
for (const theme of ['dark', 'light']) {
  test(`${theme} : « Résultat à venir » jaune, lettres noires @ci-critical`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.addInitScript((t) => localStorage.setItem('radar-theme', t), theme);
    await page.route('https://**/*', (r) => r.abort());
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('.sports-chip__cta-tag') && typeof fillSportsCtaTagCopy === 'function');
    const c = await page.evaluate(() => {
      const tag = document.querySelector('.sports-chip__cta-tag');
      tag.dataset.ctaLamp = 'past';
      fillSportsCtaTagCopy(tag, SPORTS_CTA_TAG_PENDING);
      const cs = getComputedStyle(tag);
      const bg = cs.backgroundColor;
      const ink = cs.webkitTextFillColor;
      fillSportsCtaTagCopy(tag, 'Hier');
      return { bg, ink, after: tag.dataset.ctaPending };
    });
    expect(c.bg).toBe('rgb(245, 208, 0)');
    expect(c.ink).toBe('rgb(26, 21, 0)');
    expect(c.after).toBeUndefined();
  });
}

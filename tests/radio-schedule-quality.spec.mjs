import { test, expect } from '@playwright/test';

// Toronto 02:12 HNE: the build-time midnight Jazz Boulevard must not survive hydration.
test('radio hub hydrates the actual hour and discloses partial sources @ci-critical', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-07T07:12:00Z'));
  await page.goto('/horaires/', { waitUntil: 'domcontentloaded' });
  const cjlo = page.locator('.seo-radio-card[data-schedule-station="cjlo"]');
  await expect(cjlo.locator('.seo-radio-card__show')).toHaveText('CJLO Late Night');
  await expect(cjlo.locator('.seo-radio-card__when')).toContainText('00:00');
  for (const station of ['chyz', 'choq']) {
    await expect(page.locator(`.seo-radio-card[data-schedule-station="${station}"] [data-schedule-quality]`)).toContainText('Grille partielle');
  }
  await expect(page.locator('.seo-radio-card[data-schedule-station="cfak"] [data-schedule-quality]')).toContainText('Fins estimées');
  await page.screenshot({ path: 'test-results/radio-schedule-hub.png', fullPage: true });
});

test('CJLO grid contains no placeholder pile and stays truthful on mobile @ci-critical', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-11-07T07:12:00Z'));
  await page.goto('/radios/cjlo/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.seo-day')).toHaveCount(7);
  expect(await page.locator('[data-schedule-day="1"] li[data-schedule-start="00:00"][data-schedule-end="00:30"]').count()).toBeLessThan(3);
  await expect(page.locator('.seo-slot--live .seo-slot__title')).toHaveText('CJLO Late Night');
  await page.screenshot({ path: 'test-results/radio-schedule-cjlo-mobile.png', fullPage: true });
});

test('midnight overlap priority agrees between client hub and grid @ci-critical', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-08T06:30:00Z'));
  await page.goto('/radios/cjlo/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof pickHubAirFromGrid === 'function' && typeof syncSeoScheduleNow === 'function');
  const title = await page.evaluate(() => {
    const grid = [
      { day: 6, start: '23:00', end: '02:00', title: 'Old overnight' },
      { day: 0, start: '01:00', end: '03:00', title: 'New current' },
    ];
    const picked = pickHubAirFromGrid(grid, { day: 0, minute: 90 });
    const container = document.createElement('section');
    container.innerHTML = grid.map((slot) => `<div class="seo-day" data-schedule-day="${slot.day}"><li data-schedule-start="${slot.start}" data-schedule-end="${slot.end}">${slot.title}</li></div>`).join('');
    document.querySelectorAll('.seo-day').forEach((el) => el.remove());
    document.body.append(container);
    syncSeoScheduleNow();
    return { hub: picked.slot.title, grid: container.querySelector('.seo-slot--live')?.textContent };
  });
  expect(title).toEqual({ hub: 'New current', grid: 'New current' });
});

test('CFAK weekend has no invented end or false live badge @ci-critical', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-07T07:12:00Z'));
  await page.goto('/radios/cfak/', { waitUntil: 'domcontentloaded' });
  const weekend = page.locator('.seo-day[data-schedule-day="6"] li');
  await expect(weekend).toHaveCount(1);
  await expect(weekend).toHaveAttribute('data-schedule-end', '');
  await expect(weekend).toContainText('Fin non publiée');
  await expect(page.locator('.seo-slot--live')).toHaveCount(0);
  await expect(page.locator('[data-schedule-quality]')).toContainText('Grille partielle (71 %');
});

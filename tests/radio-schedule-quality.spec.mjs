import { test, expect } from '@playwright/test';

// Toronto 02:12 HNE: the build-time midnight Jazz Boulevard must not survive hydration.
test('radio hub hydrates the actual hour without repeated warning paragraphs @ci-critical', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-07T07:12:00Z'));
  await page.goto('/horaires/', { waitUntil: 'domcontentloaded' });
  const cjlo = page.locator('.seo-radio-card[data-schedule-station="cjlo"]');
  await expect(cjlo.locator('.seo-radio-card__show')).toHaveText('CJLO Late Night');
  await expect(cjlo.locator('.seo-radio-card__when')).toContainText('00:00');
  await expect(page.locator('.seo-radio-card [data-schedule-quality]')).toHaveCount(0);
  const details = page.locator('[data-schedule-details]');
  await expect(details).toHaveCount(1);
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').click();
  await expect(details).toContainText('Grille partielle (50 %');
  await expect(details).toContainText('Sources et mises à jour');
  await expect(details.locator('a')).toHaveCount(6);
  await details.locator('summary').click();
  await page.evaluate(() => scrollTo(0, 0));
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

test('CFAK weekend uses the exact published end, including the exclusive boundary @ci-critical', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-07T07:12:00Z'));
  await page.goto('/radios/cfak/', { waitUntil: 'domcontentloaded' });
  const weekend = page.locator('.seo-day[data-schedule-day="6"] li');
  await expect(weekend).toHaveCount(1);
  await expect(weekend).toHaveAttribute('data-schedule-end', '04:59');
  await expect(weekend).not.toContainText('Fin non publiée');
  await expect(page.locator('.seo-slot--live .seo-slot__title')).toHaveText('Les nuits CFAK');
  await page.clock.setFixedTime(new Date('2026-11-07T09:59:00Z'));
  await page.evaluate(() => syncSeoScheduleNow());
  await expect(page.locator('.seo-slot--live')).toHaveCount(0);
});

for (const path of ['/', '/horaires/']) {
  for (const width of [320, 390, 1024, 1280, 1440]) {
    test(`radio bar contains controls and long titles: ${path} ${width}px @ci-critical`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.clock.setFixedTime(new Date('2026-11-07T07:12:00Z'));
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#tuner.is-dial-ready') && window.RadarAir?._pure);
      const report = await page.evaluate(() => {
        document.getElementById('tuner-now-name').textContent = 'Université du Québec à Montréal — très long libellé institutionnel';
        const wrap = document.querySelector('#tuner-nowair-wide');
        if (wrap) {
          wrap.classList.remove('is-live-absent');
          for (const slot of wrap.querySelectorAll('.tuner-wide-slot')) {
            slot.hidden = false;
            slot.classList.remove('is-wide-absent');
            slot.querySelector('.tuner-wide-slot__title').textContent = 'Très longue émission avec accents — un titre intégral et SuperLongTitreSansEspacePourVérifierLeRetourÀLaLigne';
          }
        }
        const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }; };
        const bar = box(document.querySelector('#tuner'));
        const controls = [...document.querySelectorAll('.tuner-label,#tuner-prev,#tuner-next,#tuner-play,#tuner-select,#tuner-vol-btn,#tuner-cast,.tuner-wide-slot,.tuner-wide-slot__label')]
          .filter((el) => el.getBoundingClientRect().width && getComputedStyle(el).visibility !== 'hidden')
          .map((el) => ({ id: el.id || el.className, ...box(el) }));
        const titles = [...document.querySelectorAll('.tuner-wide-slot__title')]
          .filter((el) => el.getBoundingClientRect().width)
          .map((el) => ({ ...box(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
        return { bar, controls, titles, overflow: document.documentElement.scrollWidth - innerWidth };
      });
      expect(report.overflow, 'no horizontal page overflow').toBeLessThanOrEqual(1);
      for (const control of report.controls) {
        expect(control.left, `${control.id} left`).toBeGreaterThanOrEqual(-1);
        expect(control.right, `${control.id} right`).toBeLessThanOrEqual(width + 1);
        expect(control.top, `${control.id} top`).toBeGreaterThanOrEqual(report.bar.top - 1);
        expect(control.bottom, `${control.id} bottom`).toBeLessThanOrEqual(report.bar.bottom + 1);
      }
      for (const title of report.titles) {
        expect(title.scrollWidth, 'full title fits horizontally').toBeLessThanOrEqual(title.clientWidth + 1);
        expect(title.scrollHeight, 'full title fits vertically, no clamp').toBeLessThanOrEqual(title.clientHeight + 1);
      }
      if (path === '/horaires/' && [390, 1280, 1440].includes(width)) {
        await page.screenshot({ path: `test-results/radio-bar-long-${width}.png`, fullPage: true });
      }
    });
  }
}

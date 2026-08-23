import { expect, test } from '@playwright/test';

/**
 * Resize fenêtre : le synthé doit changer de coque sans refresh.
 *
 * Régression : au-delà de 1281 px le JS posait des wrappers wide + une largeur
 * inline sur le dial. En resserrant, le CSS wide partait mais le DOM restait
 * — barre cassée jusqu’au rechargement.
 */

async function waitDial(page) {
  await page.waitForFunction(
    () => document.getElementById('tuner')?.classList.contains('is-dial-ready'),
    null,
    { timeout: 15_000 },
  );
}

function health(page) {
  return page.evaluate(() => {
    const tuner = document.getElementById('tuner');
    const inner = document.querySelector('.tuner-inner');
    const dial = document.querySelector('.tuner-dial');
    const play = document.getElementById('tuner-play');
    const r = tuner?.getBoundingClientRect();
    return {
      ready: !!tuner?.classList.contains('is-dial-ready'),
      height: r ? Math.round(r.height) : 0,
      playH: play ? Math.round(play.getBoundingClientRect().height) : 0,
      wideLeft: !!document.querySelector('.tuner-wide-left'),
      dialWidth: dial?.style.width || '',
      overflow: inner ? inner.scrollWidth - inner.clientWidth : 0,
      name: (document.getElementById('tuner-now-name')?.textContent || '').trim(),
    };
  });
}

test('1920 → 1280 → 390 → 1920 : la barre radio reste entière', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitDial(page);

  const wide = await health(page);
  expect(wide.ready, 'wide : is-dial-ready').toBe(true);
  expect(wide.height, 'wide : barre trop basse').toBeGreaterThan(36);
  expect(wide.playH, 'wide : play invisible').toBeGreaterThan(20);
  expect(wide.wideLeft, 'wide : wrappers E absents').toBe(true);
  expect(wide.name.length, 'wide : carré vide').toBeGreaterThan(0);

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(() => page.evaluate(() => !!document.querySelector('.tuner-wide-left')), {
    timeout: 4000,
  }).toBe(false);
  const desk = await health(page);
  expect(desk.ready, '1280 : is-dial-ready').toBe(true);
  expect(desk.height, '1280 : barre trop basse').toBeGreaterThan(36);
  expect(desk.playH, '1280 : play invisible').toBeGreaterThan(20);
  expect(desk.dialWidth, '1280 : largeur inline du wide encore là').toBe('');
  expect(desk.overflow, `1280 : débordement ${desk.overflow}px`).toBeLessThanOrEqual(2);
  expect(desk.name.length, '1280 : carré vide').toBeGreaterThan(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => !!document.querySelector('.tuner-wide-left')), {
    timeout: 4000,
  }).toBe(false);
  const phone = await health(page);
  expect(phone.ready, '390 : is-dial-ready').toBe(true);
  expect(phone.height, '390 : barre trop basse').toBeGreaterThan(36);
  expect(phone.playH, '390 : play invisible').toBeGreaterThan(20);
  expect(phone.dialWidth, '390 : largeur inline du wide encore là').toBe('');
  expect(phone.overflow, `390 : débordement ${phone.overflow}px`).toBeLessThanOrEqual(2);
  expect(phone.name.length, '390 : carré vide').toBeGreaterThan(0);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(() => page.evaluate(() => !!document.querySelector('.tuner-wide-left')), {
    timeout: 4000,
  }).toBe(true);
  const back = await health(page);
  expect(back.ready, 'retour 1920 : is-dial-ready').toBe(true);
  expect(back.height, 'retour 1920 : barre trop basse').toBeGreaterThan(36);
  expect(back.playH, 'retour 1920 : play invisible').toBeGreaterThan(20);
  expect(back.name.length, 'retour 1920 : carré vide').toBeGreaterThan(0);
});

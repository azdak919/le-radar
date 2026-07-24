import { expect, test } from '@playwright/test';

test('le volume historique par défaut est ramené à 100 %', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('req-player-vol', '1');
    localStorage.removeItem('req-player-vol-version');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#tuner-volume')).toHaveValue('1');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('req-player-vol'))).toBe('1');
});

test('le panneau À l’antenne reste bleu lorsque le synthétiseur est arrêté', async ({ page }) => {
  await page.goto('/pomo/', { waitUntil: 'domcontentloaded' });
  const tuner = page.locator('#radar-embed').contentFrame();
  const colors = await tuner.locator('#tuner-nowair-title').evaluate((title) => {
    const radio = title.closest('.tuner');
    const panel = title.closest('.tuner-nowair');
    panel.classList.add('is-live');
    radio.classList.remove('is-playing');
    const idle = getComputedStyle(title).color;
    radio.classList.add('is-playing');
    const playing = getComputedStyle(title).color;
    return { idle, playing };
  });
  expect(colors.idle).not.toBe(colors.playing);
});

test('l’iframe alterne les postes affichés lorsque la radio est arrêtée', async ({ page }) => {
  await page.goto('/pomo/', { waitUntil: 'domcontentloaded' });
  const tuner = page.locator('#radar-embed').contentFrame();
  const title = tuner.locator('#tuner-nowair-title');
  await expect(title).not.toHaveText('');
  const first = await title.textContent();

  // L’iframe Pomodoro laisse chaque station lisible 14 secondes.
  await expect.poll(() => title.textContent(), { timeout: 18_000 })
    .not.toBe(first);
});

test('le bouton annule une connexion audio en attente', async ({ page }) => {
  await page.goto('/pomo/', { waitUntil: 'domcontentloaded' });
  const tuner = page.locator('#radar-embed').contentFrame();
  await tuner.locator('#tuner-select').selectOption({ index: 1 });
  await tuner.locator('html').evaluate(() => {
    const player = document.querySelector('#radar-player');
    player.dispatchEvent(new Event('waiting'));
  });

  const button = tuner.locator('#tuner-play');
  await expect(button).toHaveClass(/is-buffering/);
  await button.click();
  await expect(button).not.toHaveClass(/is-buffering/);
});

test('une page suiveuse n’affiche pas un buffering tardif après navigation', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('req-player-session-v1', JSON.stringify({
      stationId: 'ckut',
      playing: true,
      volume: 1,
      leaderId: 'page-hote-encore-active',
      updatedAt: Date.now(),
    }));
  });
  await page.goto('/pomo/', { waitUntil: 'domcontentloaded' });
  const tuner = page.locator('#radar-embed').contentFrame();
  await tuner.locator('html').evaluate(() => {
    document.querySelector('#radar-player').dispatchEvent(new Event('waiting'));
  });
  await expect(tuner.locator('#tuner-play')).not.toHaveClass(/is-buffering/);
});

test('une émission CHOQ terminée ne reste pas affichée comme à venir', async ({ page }) => {
  await page.addInitScript(() => {
    const RealDate = Date;
    class BoundaryDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : ['2026-07-23T20:01:00.000Z']));
      }
      static now() { return new RealDate('2026-07-23T20:01:00.000Z').valueOf(); }
    }
    window.Date = BoundaryDate;
  });
  await page.goto('/pomo/', { waitUntil: 'domcontentloaded' });
  const tuner = page.locator('#radar-embed').contentFrame();
  await tuner.locator('#tuner-select').selectOption('choq');
  await expect(tuner.locator('#tuner-nowair-title')).not.toHaveText('Palmarès CHOQ.ca');
});

test('Pomodoro garde son document hôte pendant une navigation avec lecture active', async ({ page }) => {
  await page.goto('/pomo/', { waitUntil: 'domcontentloaded' });
  const tuner = page.locator('#radar-embed').contentFrame();
  await expect(tuner.locator('#tuner-play')).toBeVisible();

  // Simule le signal posé par le lecteur après un play() réussi. Le test ne
  // dépend ainsi d'aucun flux radio externe ni des règles d'autoplay du CI.
  await tuner.locator('html').evaluate((html) => {
    html.dataset.radarPlaying = '1';
  });

  await page.locator('#solitaire-btn').click();
  await expect(page).toHaveURL(/\/solitaire\/?$/);
  await expect(page.locator('#pomo-container')).toBeAttached();

  const shell = page.locator('#radar-nav-frame');
  await expect(shell).toBeVisible();
  await expect(shell.contentFrame().locator('.page-layout')).toBeVisible();

  // Les liens de la page enfant repassent par l'hôte : une seule iframe,
  // l'URL correspond à la page visible et le lecteur hôte n'est pas recréé.
  await shell.contentFrame().locator('#radar-btn').evaluate((link) => link.click());
  await expect(page).toHaveURL(/\/$/);
  await expect(shell).toHaveCount(1);
  await expect(shell.contentFrame().locator('#tuner')).toBeVisible();

});

test('un seul leader radio est partagé entre deux pages', async ({ page, context }) => {
  const peer = await context.newPage();
  await Promise.all([
    page.goto('/', { waitUntil: 'domcontentloaded' }),
    peer.goto('/pomo/', { waitUntil: 'domcontentloaded' }),
  ]);

  const peerTuner = peer.locator('#radar-embed').contentFrame();
  await expect(peerTuner.locator('#tuner-play')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(window.RadarPlayerSync))).toBe(true);
  await expect.poll(() => peerTuner.locator('html').evaluate(() => Boolean(window.RadarPlayerSync))).toBe(true);

  const firstLeader = await page.evaluate(() => {
    window.RadarPlayerSync.claimPlay('chyz', 0.65);
    return window.RadarPlayerSync.getTabId();
  });

  await expect.poll(() => peerTuner.locator('html').evaluate(() =>
    window.RadarPlayerSync.readState())).toMatchObject({
    stationId: 'chyz',
    playing: true,
    volume: 0.65,
    leaderId: firstLeader,
  });

  const secondLeader = await peerTuner.locator('html').evaluate(() => {
    window.RadarPlayerSync.claimPlay('cism', 0.4);
    return window.RadarPlayerSync.getTabId();
  });
  expect(secondLeader).not.toBe(firstLeader);

  await expect.poll(() => page.evaluate(() =>
    window.RadarPlayerSync.readState())).toMatchObject({
    stationId: 'cism',
    playing: true,
    volume: 0.4,
    leaderId: secondLeader,
  });
});

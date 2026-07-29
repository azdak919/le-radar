import { expect, test } from '@playwright/test';

test('le volume historique par défaut est ramené à 100 %', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('radar-player-vol', '1');
    localStorage.removeItem('radar-player-vol-version');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#tuner-volume')).toHaveValue('1');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('radar-player-vol'))).toBe('1');
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

test('À l’antenne ouvre l’horaire dans un nouvel onglet sans quitter le lecteur', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('#tuner-select').selectOption('chyz');
  const [schedule] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('#tuner-nowair').click(),
  ]);
  // L'ancre #horaire ouvre la fiche directement sur la grille de la semaine,
  // sans faire défiler les faits de la station.
  await expect(schedule).toHaveURL(/\/radios\/chyz\/#horaire$/);
  await expect(page).toHaveURL(/\/$/);
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
  // Un autre contexte de test peut avoir publié une lecture juste avant
  // l'iframe. Repartir de l'état arrêté ici isole le scénario « attente »
  // plutôt que de lui faire tester une pause distante.
  const playButton = tuner.locator('#tuner-play');
  await playButton.evaluate((button) => {
    if (button.classList.contains('is-buffering') || /mettre en pause/i.test(button.getAttribute('aria-label') || '')) {
      button.click();
    }
  });
  // Cibler l'élément plutôt que <html> : l'iframe démarre sur about:blank et
  // pomo/js/app.js ne pose son src que dans un requestIdleCallback. Un locator
  // sur #radar-player attend le vrai document ; locator('html') se résout tout
  // de suite sur about:blank, où l'audio n'existe pas encore.
  await tuner.locator('#radar-player').evaluate((player) => {
    player.dispatchEvent(new Event('waiting'));
  });

  const button = playButton;
  await expect(button).toHaveClass(/is-buffering/);
  await button.click();
  await expect(button).not.toHaveClass(/is-buffering/);
});

test('une page suiveuse n’affiche pas un buffering tardif après navigation', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('radar-player-session-v1', JSON.stringify({
      stationId: 'ckut',
      playing: true,
      volume: 1,
      leaderId: 'page-hote-encore-active',
      updatedAt: Date.now(),
    }));
  });
  await page.goto('/pomo/', { waitUntil: 'domcontentloaded' });
  const tuner = page.locator('#radar-embed').contentFrame();
  await tuner.locator('#radar-player').evaluate((player) => {
    player.dispatchEvent(new Event('waiting'));
  });
  await expect(tuner.locator('#tuner-play')).not.toHaveClass(/is-buffering/);
});

test('un suiveur froid ne publie pas de pause globale sur une session active', async ({ page, context }) => {
  // Régression : le nettoyage « fantôme » écrivait playing:false dans localStorage
  // et coupait l’hôte (nav-shell / SEO) qui détenait encore le vrai <audio>.
  const host = page;
  const follower = await context.newPage();

  await host.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => host.evaluate(() => Boolean(window.RadarPlayerSync))).toBe(true);

  const leaderId = await host.evaluate(() => {
    window.RadarPlayerSync.claimPlay('chyz', 1);
    return window.RadarPlayerSync.getTabId();
  });

  await expect.poll(() => host.evaluate(() => window.RadarPlayerSync.readState())).toMatchObject({
    stationId: 'chyz',
    playing: true,
    leaderId,
  });

  await follower.goto('/radios/chyz/', { waitUntil: 'domcontentloaded' });
  // Laisser le timer de nettoyage local (800 ms) s’écouler largement.
  await follower.waitForTimeout(1200);

  await expect.poll(() => host.evaluate(() => window.RadarPlayerSync.readState())).toMatchObject({
    stationId: 'chyz',
    playing: true,
    leaderId,
  });

  // L’hôte doit rester leader — le suiveur n’a pas volé ni annulé la session.
  const followerSees = await follower.evaluate(() => window.RadarPlayerSync?.readState?.() || null);
  expect(followerSees?.playing).toBe(true);
  expect(followerSees?.leaderId).toBe(leaderId);
});

test('une session fantôme n’exige pas deux clics pour entendre le flux', async ({ page }) => {
  // Simule un onglet leader fermé la veille : localStorage dit encore « playing »
  // mais personne ne répond au hello. L’UI doit montrer ▶, et un seul geste
  // doit démarrer le flux — pas un premier clic « pause » qui ne fait que
  // effacer le fantôme.
  await page.addInitScript(() => {
    localStorage.setItem('radar-player-session-v1', JSON.stringify({
      stationId: 'chyz',
      playing: true,
      volume: 1,
      leaderId: 'dead-tab-from-yesterday',
      updatedAt: Date.now() - 3_600_000,
    }));
    localStorage.setItem('radar-player-vol', '1');
    localStorage.setItem('radar-player-vol-version', '2');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // Attendre que radios.json peuplé le <select> et que l’hydratation sync s’applique.
  await expect(page.locator('#tuner-select option[value="chyz"]')).toBeAttached();
  await expect(page.locator('#tuner-select')).toHaveValue('chyz', { timeout: 10_000 });
  // Avant confirmation d’un pair vivant : pas d’état « en lecture » fantôme.
  await expect(page.locator('#tuner')).not.toHaveClass(/is-playing/);
  await expect(page.locator('#tuner-play')).toHaveAttribute('aria-label', /écouter/i);

  await page.locator('#tuner-play').click();
  // Un seul clic : connexion ou lecture, jamais un retour immédiat à « Écouter »
  // après une fausse pause.
  await expect.poll(async () => {
    const aria = await page.locator('#tuner-play').getAttribute('aria-label');
    const classes = await page.locator('#tuner-play').getAttribute('class');
    const src = await page.locator('#radar-player').evaluate((a) => a.src || '');
    if (/pause/i.test(aria || '')) return 'playing';
    if (classes?.includes('is-buffering') || /connexion/i.test(aria || '')) return 'buffering';
    if (src.includes('chyz')) return 'has-src';
    return 'idle';
  }, { timeout: 8_000 }).not.toBe('idle');
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

  const peerEmbed = peer.locator('#radar-embed');
  // Le document Pomo charge l'iframe après sa première peinture. Attendre
  // son URL réelle évite d'interroger l'about:blank lorsque le runner est
  // chargé, sans imposer de délai arbitraire au produit.
  await expect(peerEmbed).toHaveAttribute('src', /tuner-embed\.html/, { timeout: 10_000 });
  const peerTuner = peerEmbed.contentFrame();
  await expect(peerTuner.locator('#tuner-play')).toBeVisible({ timeout: 10_000 });
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

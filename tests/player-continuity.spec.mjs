import { expect, test } from '@playwright/test';

// D9 : ces tests partagent localStorage / audio / sync multi-onglets.
// Série + nettoyage d’état entre cas, sans allonger les timeouts globaux.
test.describe.configure({ mode: 'serial' });

test.afterEach(async ({ page, context }) => {
  for (const p of context.pages()) {
    try {
      await p.evaluate(() => {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith('radar-player') || key.startsWith('radar-')) {
            localStorage.removeItem(key);
          }
        }
      });
    } catch {
      // Page déjà fermée ou contexte navigué hors origine.
    }
  }
});

test('le volume historique par défaut est ramené à 100 %', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('radar-player-vol', '1');
    localStorage.removeItem('radar-player-vol-version');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#tuner-volume')).toHaveValue('1');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('radar-player-vol'))).toBe('1');
});

test('le mute survit au rechargement de la page', async ({ page }) => {
  // 0.60 aligne le step 0.02 du curseur (0.65 peut être quantifié à 0.66).
  await page.addInitScript(() => {
    localStorage.setItem('radar-player-vol', '0.6');
    localStorage.setItem('radar-player-vol-version', '3');
    localStorage.setItem('radar-player-muted', '1');
    localStorage.removeItem('radar-player-session-v1');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#tuner-volume')).toHaveValue('0.6');
  await expect(page.locator('#tuner-volume')).toHaveAttribute('aria-valuetext', /muet/i);
  await expect.poll(() => page.evaluate(() => {
    const vol = document.getElementById('tuner-vol');
    const player = document.getElementById('radar-player');
    return {
      mutedUi: vol?.classList.contains('is-muted') || false,
      mutedAttr: localStorage.getItem('radar-player-muted'),
      audioMuted: !!player?.muted,
    };
  })).toMatchObject({
    mutedUi: true,
    mutedAttr: '1',
    audioMuted: true,
  });
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

test('iframe kiosque-v1 : À l’antenne ouvre l’horaire sur le-radar (URL absolue)', async ({ page, baseURL }) => {
  // Même bug que Kiosque cross-origin : un open() root-relatif via top
  // résolvait sur l’origine du parent. Ici on vérifie l’URL absolue
  // sur l’origine de l’iframe (le-radar).
  await page.goto('/tuner-embed.html?station=chyz&surface=kiosque-v1', {
    waitUntil: 'domcontentloaded',
  });
  await expect.poll(async () => page.locator('#tuner-select option').count(), { timeout: 15_000 })
    .toBeGreaterThan(1);
  await page.locator('#tuner-select').selectOption('chyz');
  const [schedule] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('#tuner-nowair').click(),
  ]);
  const origin = new URL(baseURL || page.url()).origin;
  await expect(schedule).toHaveURL(new RegExp(`^${origin.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}/radios/chyz/#horaire$`));
});

for (const path of ['/pomo/', '/solitaire/']) {
  test(`CHYZ dans l’iframe ${path} utilise le mount Centova actuel`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const tuner = page.locator('#radar-embed').contentFrame();
    await expect.poll(async () => tuner.locator('#tuner-select option').count(), { timeout: 15_000 })
      .toBeGreaterThan(1);
    await tuner.locator('#tuner-select').selectOption('chyz');
    // Changer de poste autoplay déjà ; un second clic mettrait en pause.
    const play = tuner.locator('#tuner-play');
    const aria = await play.getAttribute('aria-label');
    if (!/pause|connexion/i.test(aria || '')) {
      await play.click();
    }
    await expect.poll(async () => {
      return tuner.locator('#radar-player').evaluate((a) => ({
        src: a.currentSrc || a.src || '',
        err: a.error ? a.error.code : 0,
      }));
    }, { timeout: 10_000 }).toEqual({
      src: expect.stringContaining('/proxy/tech/stream'),
      err: 0,
    });
  });
}

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
  // État publié (aria + data-radar-buffering), pas seulement la classe CSS.
  await expect.poll(async () => button.getAttribute('aria-label'), { timeout: 5_000 })
    .toMatch(/connexion au flux/i);
  await expect.poll(async () => tuner.locator('html').getAttribute('data-radar-buffering'))
    .toBe('1');
  await button.click();
  await expect.poll(async () => button.getAttribute('aria-label'), { timeout: 5_000 })
    .not.toMatch(/connexion au flux/i);
  await expect.poll(async () => tuner.locator('html').getAttribute('data-radar-buffering'))
    .not.toBe('1');
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
  // Suiveur froid : un waiting tardif ne doit pas publier l’état buffering.
  await expect.poll(async () => tuner.locator('html').getAttribute('data-radar-buffering'), {
    timeout: 3_000,
  }).not.toBe('1');
  await expect(tuner.locator('#tuner-play')).not.toHaveAttribute('aria-label', /connexion au flux/i);
});

test('changer de poste sur un onglet suiveur bascule le flux du leader', async ({ page, context }) => {
  // Le lecteur principal (accueil) joue ; un second onglet SEO change de poste.
  // L’audio doit rester sur le leader, qui bascule vers le nouveau flux —
  // pas un vol de leadership qui coupe le son côté onglet principal.
  const host = page;
  const peer = await context.newPage();

  await host.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => host.evaluate(() => Boolean(window.RadarPlayerSync))).toBe(true);
  await expect.poll(async () => host.locator('#tuner-select option').count()).toBeGreaterThan(1);

  await host.locator('#tuner-select').selectOption('chyz');
  await expect.poll(async () => {
    return host.locator('#radar-player').evaluate((a) => !a.paused && /chyz/i.test(a.src || ''));
  }, { timeout: 12_000 }).toBe(true);

  const leaderId = await host.evaluate(() => window.RadarPlayerSync.getTabId());

  await peer.goto('/radios/cfak/', { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => peer.locator('#tuner-select option').count(), { timeout: 15_000 })
    .toBeGreaterThan(1);
  // Laisser le hello confirmer le leader distant.
  await expect.poll(() => peer.evaluate(() => {
    const s = window.RadarPlayerSync?.readState?.();
    return Boolean(s?.playing && s.leaderId);
  }), { timeout: 5_000 }).toBe(true);

  await peer.locator('#tuner-select').selectOption('ckut');

  await expect.poll(() => host.evaluate(() => window.RadarPlayerSync.readState()), { timeout: 8_000 })
    .toMatchObject({
      stationId: 'ckut',
      playing: true,
      leaderId,
    });

  await expect.poll(async () => {
    return host.locator('#radar-player').evaluate((a) => ({
      paused: a.paused,
      src: a.src || '',
    }));
  }, { timeout: 12_000 }).toMatchObject({
    paused: false,
    src: expect.stringMatching(/ckut|airtime/i),
  });

  // Le suiveur n’a pas volé le flux local.
  await expect.poll(async () => {
    return peer.locator('#radar-player').evaluate((a) => a.paused || !(a.src || ''));
  }).toBe(true);
});

test('le volume réglé sur un onglet suiveur s’applique au leader', async ({ page, context }) => {
  const host = page;
  const peer = await context.newPage();

  await host.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => host.evaluate(() => Boolean(window.RadarPlayerSync))).toBe(true);
  await expect.poll(async () => host.locator('#tuner-select option').count()).toBeGreaterThan(1);
  await host.locator('#tuner-select').selectOption('cism');
  await expect.poll(async () => {
    return host.locator('#radar-player').evaluate((a) => !a.paused && !!a.src);
  }, { timeout: 12_000 }).toBe(true);

  await peer.goto('/radios/cism/', { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => peer.locator('#tuner-volume').count(), { timeout: 15_000 }).toBe(1);
  await expect.poll(() => peer.evaluate(() => {
    const s = window.RadarPlayerSync?.readState?.();
    return Boolean(s?.playing && s.leaderId && s.leaderId !== window.RadarPlayerSync.getTabId());
  }), { timeout: 5_000 }).toBe(true);

  // Suiveur : volume à 40 % (sans boost).
  await peer.locator('#tuner-volume').evaluate((el) => {
    el.value = '0.4';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await expect.poll(() => host.evaluate(() => window.RadarPlayerSync.readState()?.volume), {
    timeout: 5_000,
  }).toBeCloseTo(0.4, 1);

  await expect.poll(() => host.evaluate(() => {
    const a = document.getElementById('radar-player');
    // Lecture native (≤ 100 %) : audio.volume suit le gain effectif.
    return {
      gain: Number(document.getElementById('tuner-volume')?.value),
      volume: a?.volume,
      muted: a?.muted,
    };
  }), { timeout: 5_000 }).toMatchObject({
    gain: expect.closeTo(0.4, 1),
    muted: false,
  });

  await expect.poll(() => host.evaluate(() => {
    const a = document.getElementById('radar-player');
    // Selon boost branché ou non, volume élément = 1 ou ≈ gain.
    return a.volume <= 1.001 && (Math.abs(a.volume - 0.4) < 0.08 || a.volume === 1);
  })).toBe(true);
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

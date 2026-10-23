import { expect, test } from '@playwright/test';

// Ctrl+Shift+R pendant l'écoute : sessionStorage (« armé ») et la session
// partagée « playing » survivent au rechargement. La page ne doit ni relancer
// play() toute seule ni afficher le spinner de connexion sans geste.
test('rechargement : aucune reprise auto ni spinner radio @ci-critical', async ({ page }) => {
  await page.addInitScript(() => {
    window.__plays = 0;
    // Flux lent / autoplay en attente : la promesse ne se résout jamais.
    HTMLMediaElement.prototype.play = function () { window.__plays += 1; return new Promise(() => {}); };
    sessionStorage.setItem('radar-player-armed', '1');
    localStorage.setItem('radar-player-session-v1', JSON.stringify({
      stationId: 'ckut', playing: true, volume: 1, muted: false,
      leaderId: 't-ghost-closed', updatedAt: Date.now(),
    }));
  });
  await page.goto('/', { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const st = await page.evaluate(() => ({
    plays: window.__plays,
    buf: document.documentElement.dataset.radarBuffering || '0',
    spinner: document.getElementById('tuner-play')?.classList.contains('is-buffering') || false,
  }));
  expect(st).toEqual({ plays: 0, buf: '0', spinner: false});
});

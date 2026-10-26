import { expect, test } from '@playwright/test';

// Fin de période du Pomo : notification via le service worker (Chrome Android
// refuse `new Notification()`), rattrapage au retour au premier plan,
// déclencheur programmé (TimestampTrigger) quand il existe.

async function setup(page, { triggers = false } = {}) {
  await page.clock.install();
  await page.addInitScript(({ triggers }) => {
    window.__notifs = [];
    class FakeNotification { constructor() { throw new TypeError("Failed to construct 'Notification': Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead."); } }
    FakeNotification.permission = 'granted';
    FakeNotification.requestPermission = () => Promise.resolve('granted');
    if (triggers) FakeNotification.prototype.showTrigger = null;
    Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true, writable: true });
    if (triggers) window.TimestampTrigger = function (ts) { this.timestamp = ts; };
    const reg = {
      showNotification: (title, opts) => { window.__notifs.push({ title, opts, trigger: opts.showTrigger ? opts.showTrigger.timestamp : null, at: Date.now() }); return Promise.resolve(); },
      getNotifications: () => Promise.resolve([]),
    };
    const sw = { getRegistration: () => Promise.resolve(reg), ready: Promise.resolve(reg), register: () => Promise.resolve(reg), addEventListener() {}, controller: null };
    Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
    window.__setHidden = (h) => {
      Object.defineProperty(document, 'hidden', { value: h, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    };
  }, { triggers });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/pomo/', { waitUntil: 'load' });
  await page.evaluate(() => {
    pomo.workMin = 1; pomo.totalSeconds = 60; pomo.phaseDuration = 60; pomo.pausedRemaining = 60;
    pomo.isBreak = false; pomo.isRunning = false;
  });
  return errors;
}

test('fin de période : showNotification appelé, rattrapage au retour visible @ci-critical', async ({ page }) => {
  const errors = await setup(page);
  await page.evaluate(() => startPomo());
  await page.evaluate(() => window.__setHidden(true));
  // Page gelée : on avance l'horloge sans exécuter les minuteries.
  await page.clock.setSystemTime(Date.now() + 0); // no-op pour garder la référence
  const t0 = await page.evaluate(() => Date.now());
  await page.clock.setFixedTime(t0 + 65_000);
  await page.evaluate(() => window.__setHidden(false));
  await expect.poll(() => page.evaluate(() => window.__notifs.length)).toBe(1);
  const n = (await page.evaluate(() => window.__notifs))[0];
  expect(n.opts.tag).toBe('le-radar-pomo');
  expect(n.opts.requireInteraction).toBe(true);
  expect(Array.isArray(n.opts.vibrate)).toBe(true);
  expect(n.opts.icon).toMatch(/icon-192\.png$/);
  expect(await page.evaluate(() => ({ running: pomo.isRunning, isBreak: pomo.isBreak, done: pomo.phaseJustCompleted })))
    .toEqual({ running: false, isBreak: true, done: true });
  expect(errors).toEqual([]);
});

test('TimestampTrigger : notification programmée au démarrage, sans doublon à la fin', async ({ page }) => {
  const errors = await setup(page, { triggers: true });
  const start = await page.evaluate(() => { startPomo(); return pomo.startedAt; });
  await expect.poll(() => page.evaluate(() => window.__notifs.length)).toBe(1);
  const n = (await page.evaluate(() => window.__notifs))[0];
  expect(n.trigger).toBe(start + 60_000);
  await page.clock.runFor(62_000);
  expect(await page.evaluate(() => pomo.isBreak)).toBe(true);
  expect(await page.evaluate(() => window.__notifs.length)).toBe(1);
  expect(errors).toEqual([]);
});

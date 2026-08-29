import { expect, test } from '@playwright/test';

/**
 * Les étapes des cartes d’invite portent du <strong> interne (noms de menus).
 * Régression : esc() global les affichait en clair (« <strong>When Edge starts</strong> »).
 */

const HOME_BROWSERS = ['chrome', 'edge', 'firefox', 'safari', 'opera', 'brave', 'other'];

const INSTALL_CASES = [
  { family: 'ios', browser: 'safari', ios: true },
  { family: 'ios', browser: 'chrome_ios', ios: true, iosNonSafari: true },
  { family: 'ios', browser: 'firefox', ios: true, iosNonSafari: true },
  { family: 'android', browser: 'samsung', android: true },
  { family: 'android', browser: 'firefox', android: true },
  { family: 'android', browser: 'brave', android: true },
  { family: 'android', browser: 'chrome', android: true },
  { family: 'android', browser: 'edge', android: true },
  { family: 'mobile_other', browser: 'chrome', mobileLike: true },
  { family: 'desktop', browser: 'edge', desktop: true, mobileLike: false },
  { family: 'desktop', browser: 'chrome', desktop: true, mobileLike: false },
  { family: 'desktop', browser: 'firefox', desktop: true, mobileLike: false },
];

async function ready(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.RadarEngage?.preview === 'function');
}

async function assertStepsRenderStrong(page, label) {
  const card = page.locator('.engage-prompt.is-visible');
  await expect(card, label).toHaveCount(1);
  const steps = card.locator('.engage-prompt__steps');
  await expect(steps, label).toBeVisible();
  const text = await steps.innerText();
  expect(text, `${label} : balise en clair`).not.toContain('<strong>');
  expect(text, `${label} : fermeture en clair`).not.toContain('</strong>');
  const strongs = steps.locator('li strong');
  await expect(strongs.first(), `${label} : gras rendu`).toBeVisible();
  const count = await strongs.count();
  expect(count, `${label} : au moins un <strong>`).toBeGreaterThan(0);
}

test('étapes accueil : <strong> rendu pour chaque navigateur', async ({ page }) => {
  test.setTimeout(90_000);
  await ready(page);
  for (const name of HOME_BROWSERS) {
    await page.evaluate((b) => window.RadarEngage.preview('home', { browser: b }), name);
    await assertStepsRenderStrong(page, `home/${name}`);
  }
});

test('étapes install manuel : <strong> rendu pour chaque profil', async ({ page }) => {
  test.setTimeout(90_000);
  await ready(page);
  for (const plat of INSTALL_CASES) {
    await page.evaluate((p) => window.RadarEngage.preview('install', p), plat);
    await assertStepsRenderStrong(page, `install/${plat.family}/${plat.browser}`);
  }
});

test('accueil EN (Edge) : pas de balises en clair', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    window.RadarTranslate = { getMode: () => 'en' };
    window.RadarEngage.preview('home', { browser: 'edge' });
  });
  const text = await page.locator('.engage-prompt__steps').innerText();
  expect(text).toContain('When Edge starts');
  expect(text).not.toContain('<strong>');
  await expect(page.locator('.engage-prompt__steps li strong').first()).toHaveText('Start, home, and new tabs');
});

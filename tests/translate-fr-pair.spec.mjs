import { expect, test } from '@playwright/test';

/**
 * EN → FR : MyMemory fr|fr renvoyait « PLEASE SELECT TWO DISTINCT LANGUAGES »
 * et ça se collait sur tout le chrome (météo, sports, titres).
 */

const POISON_EN = 'PLEASE SELECT TWO DISTINCT LANGUAGES';
const POISON_FR = 'VEUILLEZ SÉLECTIONNER DEUX LANGUES DISTINCTES';
const POISON_RE = /PLEASE SELECT TWO DISTINCT LANGUAGES|VEUILLEZ S[ÉE]LECTIONNER DEUX LANGUES DISTINCTES/i;

async function mockPoisonedMt(page) {
  await page.route('**/assets/news-images/**', (route) => route.abort());
  await page.route('**/assets/meteocons/**', (route) => route.abort());

  await page.route(/le-radar-translate\.azdak\.workers\.dev/, async (route) => {
    const u = new URL(route.request().url());
    const sl = u.searchParams.get('sl') || '';
    const tl = u.searchParams.get('tl') || '';
    const q = u.searchParams.get('q') || '';
    if (!tl || sl.toLowerCase() === tl.toLowerCase()) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ t: POISON_EN }),
      });
      return;
    }
    if (tl === 'en' || tl.startsWith('en')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ t: `EN ${q}` }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ t: q }),
    });
  });

  const fulfillGtx = async (route) => {
    const u = new URL(route.request().url());
    const sl = u.searchParams.get('sl') || '';
    const tl = u.searchParams.get('tl') || '';
    const q = u.searchParams.get('q') || '';
    const out = (sl !== tl && (tl === 'en' || tl.startsWith('en'))) ? `EN ${q}` : q;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([[[out, q]]]),
    });
  };
  await page.route(/translate\.googleapis\.com/, fulfillGtx);
  await page.route(/clients[45]\.google\.com/, async (route) => {
    const u = new URL(route.request().url());
    const sl = u.searchParams.get('sl') || '';
    const tl = u.searchParams.get('tl') || '';
    const q = u.searchParams.get('q') || '';
    const out = (sl !== tl && (tl === 'en' || tl.startsWith('en'))) ? `EN ${q}` : q;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([out]),
    });
  });

  await page.route(/mymemory\.translated\.net/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        responseStatus: '403',
        responseData: { translatedText: POISON_EN },
        responseDetails: POISON_EN,
      }),
    });
  });
}

async function openHome(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.RadarTranslate?.applyMode
      && window.RadarTranslate._ui?.isJunkMt
      && document.querySelectorAll('.article').length > 2,
    null,
    { timeout: 20_000 },
  );
}

test('poubelle MT : DISTINCT LANGUAGES + sl===tl', async ({ page }) => {
  await mockPoisonedMt(page);
  await openHome(page);
  const report = await page.evaluate(({ poisonEn, poisonFr }) => {
    const ui = window.RadarTranslate._ui;
    return {
      junkEn: ui.isJunkMt(poisonEn),
      junkFr: ui.isJunkMt(poisonFr),
      junkHello: ui.isJunkMt('Montréal'),
      sameFr: ui.sameMtLang('fr', 'fr'),
      sameEnFr: ui.sameMtLang('en', 'fr'),
      sameHe: ui.sameMtLang('iw', 'he'),
      payload403: ui.readMtPayload({
        responseStatus: '403',
        responseData: { translatedText: poisonEn },
      }),
      cache: ui.CACHE_KEY,
    };
  }, { poisonEn: POISON_EN, poisonFr: POISON_FR });
  expect(report.junkEn).toBe(true);
  expect(report.junkFr).toBe(true);
  expect(report.junkHello).toBe(false);
  expect(report.sameFr).toBe(true);
  expect(report.sameEnFr).toBe(false);
  expect(report.sameHe).toBe(true);
  expect(report.payload403).toBe('');
  expect(report.cache).toContain('v11');
});

test('translateText FR garde l’original malgré MyMemory fr|fr', async ({ page }) => {
  await mockPoisonedMt(page);
  await openHome(page);
  const out = await page.evaluate(() => window.RadarTranslate.translateText('Montréal', 'fr'));
  expect(out).toBe('Montréal');
  expect(out).not.toMatch(POISON_RE);
});

test('EN puis FR ne colle pas l’erreur MyMemory sur le chrome', async ({ page }) => {
  test.setTimeout(60_000);
  await mockPoisonedMt(page);
  await openHome(page);
  await page.evaluate(() => window.RadarTranslate.applyMode('en', {
    persist: false,
    fromUserClick: true,
  }));
  await page.evaluate(() => window.RadarTranslate.applyMode('fr', {
    persist: false,
    fromUserClick: true,
  }));
  await expect(page.locator('#translate-progress')).toBeHidden({ timeout: 15_000 });
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(POISON_RE);
  await expect(page.locator('#translate-label')).toHaveText(/FR/i);
  await expect(page.locator('.site-sections')).toContainText(/Accueil/);
});

import { expect, test } from '@playwright/test';
import { mockRadarTranslateApis } from './translate-mt-route.mjs';

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
  await mockRadarTranslateApis(page, ({ q, sl, tl, source }) => {
    if (source === 'mymemory') return POISON_EN;
    if (!tl || sl.toLowerCase() === tl.toLowerCase()) return q;
    if (tl === 'en' || tl.startsWith('en')) return `EN ${q}`;
    return q;
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

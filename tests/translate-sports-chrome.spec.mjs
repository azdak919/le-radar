import { expect, test } from '@playwright/test';

/**
 * D22 — pastille CTA et glossaire, sans réseau MT.
 * gtx est mocké pour renvoyer « correspondre » sur « match » : la pastille
 * ne doit jamais afficher ça.
 */

async function ready(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.RadarTranslate?._ui?.preferredUiPhrase);
  return page;
}

test('glossaire sports : match n’est pas correspondre', async ({ page }) => {
  await ready(page);
  const out = await page.evaluate(() => {
    const p = window.RadarTranslate._ui.preferredUiPhrase;
    return {
      nextEn: p('Prochains match', 'en'),
      nextEs: p('Prochains match', 'es'),
      matchEn: p('match', 'en'),
      matchFr: p('match', 'fr'),
      matchIu: p('match', 'iu'),
      liveEn: p('En cours', 'en'),
      hierEs: p('Hier', 'es'),
      recEn: p('reçoit', 'en'),
      chezEn: p('chez', 'en'),
      radioEn: p('EN ONDES', 'en'),
    };
  });
  expect(out.nextEn).toBe('Next games');
  expect(out.nextEs).toMatch(/partido/i);
  expect(out.matchEn.toLowerCase()).toBe('game');
  expect(out.matchFr.toLowerCase()).toBe('match');
  expect(out.matchIu.toLowerCase()).not.toContain('correspond');
  expect(out.liveEn).toBe('Live');
  expect(out.hierEs).toBe('Ayer');
  expect(out.recEn).toBe('hosts');
  expect(out.chezEn).toBe('at');
  expect(out.radioEn).toBe('LIVE');
  expect(JSON.stringify(out).toLowerCase()).not.toContain('correspondre');
});

test('quotas MT inchangés ; chrome-first exposé', async ({ page }) => {
  await ready(page);
  const meta = await page.evaluate(() => ({
    concurrency: window.RadarTranslate._ui.CONCURRENCY,
    maxChunk: window.RadarTranslate._ui.MAX_CHUNK,
    cacheKey: window.RadarTranslate._ui.CACHE_KEY,
    chrome: window.RadarTranslate._ui.CHROME_SELECTOR,
  }));
  expect(meta.concurrency).toBe(6);
  expect(meta.maxChunk).toBe(450);
  expect(meta.cacheKey).toContain('v9');
  expect(meta.chrome).toContain('masthead-sports-strip');
  expect(meta.chrome).toContain('#tuner');
});

test('gtx halluciné sur match n’atteint pas la pastille CTA', async ({ page }) => {
  let gtxMatchHits = 0;
  await page.route('https://translate.googleapis.com/**', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') || '';
    if (/^match$/i.test(q.trim())) gtxMatchHits += 1;
    const translated = /^match$/i.test(q.trim()) ? 'correspondre' : `X ${q}`;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([[[translated, q]]]),
    });
  });
  await page.route('https://api.mymemory.translated.net/**', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') || '';
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        responseStatus: 200,
        responseData: { translatedText: /^match$/i.test(q) ? 'correspondre' : `Y ${q}` },
      }),
    });
  });

  await ready(page);
  await page.waitForFunction(() => typeof fillSportsCtaTagCopy === 'function');
  await page.evaluate(() => {
    let strip = document.getElementById('masthead-sports-strip');
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'masthead-sports-strip';
      strip.className = 'masthead-sports-strip';
      document.body.append(strip);
    }
    strip.hidden = false;
    const chip = document.createElement('a');
    chip.className = 'sports-chip sports-chip--cta';
    chip.dataset.ctaState = 'next';
    const tag = document.createElement('span');
    tag.className = 'sports-chip__cta-tag';
    tag.dataset.ctaTag = 'Prochains match';
    chip.append(tag);
    strip.replaceChildren(chip);
    fillSportsCtaTagCopy(tag, 'Prochains match');
  });

  const tag = page.locator('#masthead-sports-strip .sports-chip__cta-tag').first();
  await expect(tag).toHaveClass(/notranslate/);
  await expect(tag).toHaveAttribute('translate', 'no');
  await expect(tag).toContainText(/prochains|next/i);
  await expect(tag).not.toContainText(/correspondre/i);

  await page.evaluate(() => window.RadarTranslate.applyMode('en', { persist: false, fromUserClick: true }));
  await expect(tag).toContainText(/next/i);
  await expect(tag).not.toContainText(/correspondre/i);
  await expect(tag).toHaveClass(/notranslate/);
  expect(gtxMatchHits).toBe(0);
});

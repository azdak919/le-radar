import { expect, test } from '@playwright/test';

test.describe('Embed sports IAB @ci-critical', () => {
  test('300×250 montre une carte LE-RADAR (match ou marque)', async ({ page }) => {
    const messages = [];
    page.on('pageerror', (error) => messages.push(error.message));
    await page.setViewportSize({ width: 400, height: 400 });
    await page.goto('/sports-ad-embed.html?fmt=300x250', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-embed', 'sports-ad');
    await expect(page.locator('html')).toHaveAttribute('data-fmt', '300x250');
    await expect.poll(() => page.locator('#ad-front').innerText(), { timeout: 15_000 })
      .toMatch(/LE-RADAR|–|reçoit|à|contre|Prochain|Aujourd|Sports étudiants|Journaux/i);
    const lockup = page.locator('.ad-lockup');
    await expect(lockup.locator('.ad-logo')).toBeVisible();
    await expect(lockup.locator('.ad-word')).toHaveText('LE-RADAR.ca');
    await expect(page.locator('#ad-tag img')).toHaveCount(0);
    expect(messages).toEqual([]);
    const href = await page.locator('#ad').getAttribute('href');
    expect(href).toMatch(/\/sports\//);
    expect(href).toMatch(/[?&]sport=/);
    expect(href).toMatch(/[?&]team=/);
  });

  test('tous les formats IAB portent « Sports étudiants »', async ({ page }) => {
    for (const fmt of ['300x250', '728x90', '320x50', '336x280', '300x600', '160x600']) {
      const [w, h] = fmt.split('x').map(Number);
      await page.setViewportSize({ width: w + 24, height: h + 24 });
      await page.goto(`/sports-ad-embed.html?fmt=${fmt}&still=1`, { waitUntil: 'domcontentloaded' });
      await expect.poll(() => page.locator('#ad-front').innerText(), { timeout: 15_000 })
        .toMatch(/Sports étudiants/i);
      const box = await page.locator('#ad').boundingBox();
      expect(box?.width, fmt).toBeGreaterThan(w * 0.9);
      expect(box?.height, fmt).toBeGreaterThan(h * 0.85);
    }
  });

  test('carte marque : lockup + nom complet', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 400 });
    await page.goto('/sports-ad-embed.html?fmt=300x250&face=brand', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#ad-front .ad-brand-lockup .ad-logo')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#ad-front .ad-brand-lockup .ad-word')).toHaveText('LE-RADAR.ca');
    await expect(page.locator('#ad-front')).toContainText('Le Réseau Académique de Découverte et d’Agrégation de Ressources');
    await expect(page.locator('#ad')).toHaveAttribute('href', /\/$|\.html$/);
  });

  test('clic match : /sports/ ouvre l’équipe et la ligne du match', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 400 });
    await page.goto('/sports-ad-embed.html?fmt=300x250', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.locator('#ad').getAttribute('href') || '', { timeout: 15_000 })
      .toMatch(/\/sports\//);
    const href = await page.locator('#ad').getAttribute('href');
    const target = new URL(href, 'http://127.0.0.1');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(target.pathname + target.search + target.hash, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.sports-panel.is-spotlight')).toBeVisible({ timeout: 15_000 });
    if (target.searchParams.get('game')) {
      await expect(page.locator('.sports-result.is-spotlight')).toBeVisible({ timeout: 10_000 });
    }
  });

  test('page iFrames : formats IAB + copie + thème, sans Flipper', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('/iframes/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toHaveText(/iFrames/);
    await expect(page.locator('body')).not.toContainText(/Flipper|phosphore|Sports SAT/i);
    await expect(page.locator('#snippet-radio')).toContainText('tuner-embed.html?surface=bar');

    const radio = page.locator('iframe[data-embed-kind="radio"]');
    const radioFrame = radio.contentFrame();
    await expect(radioFrame.locator('#tuner-play')).toBeVisible({ timeout: 15_000 });
    await expect(radioFrame.locator('#tuner-select')).toBeVisible();
    await expect(radioFrame.locator('html')).toHaveAttribute('data-surface', 'bar');
    await expect(page.locator('#snippet-300x250')).toContainText('sports-ad-embed.html?fmt=300x250');
    await expect(page.locator('iframe[data-embed-kind="sports-ad"]')).toHaveCount(6);

    const mpu = page.locator('#fmt-300x250 iframe');
    const frame = mpu.contentFrame();
    await expect(frame.locator('#ad-front')).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.waitForTimeout(400);
    await expect(radioFrame.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(radioFrame.locator('#tuner-play')).toBeVisible();
    const lightPre = await page.locator('.iframe-snippet pre').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.waitForTimeout(400);
    await expect(radioFrame.locator('html')).toHaveAttribute('data-theme', 'dark');
    const darkPre = await page.locator('.iframe-snippet pre').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(lightPre).not.toBe(darkPre);

    const copyBtn = page.getByRole('button', { name: /Copier le code radio|Copié/ });
    await copyBtn.click();
    await expect(copyBtn).toHaveText(/Copié/, { timeout: 5_000 });
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toMatch(/tuner-embed\.html/);
  });

  test('page /iframes/ : charge sans erreur, contenu visible, pas de débordement mobile, liens sports racine', async ({ page }) => {
    test.setTimeout(60_000);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/iframes/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toHaveText(/iFrames/i, { timeout: 15_000 });
    await expect(page.locator('iframe[data-embed-kind="radio"]')).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('iframe[data-embed-kind="sports-ad"]').first()).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('#snippet-radio')).toContainText('tuner-embed.html');
    await expect(page.locator('.iframe-block').first()).toBeVisible();

    // Strip masthead : chemins site-root, jamais /iframes/sports/
    await page.waitForFunction(() => {
      const links = [...document.querySelectorAll('#masthead-sports-strip a[href]')];
      return links.length > 0;
    }, { timeout: 20_000 });
    const hrefs = await page.$$eval('#masthead-sports-strip a[href]', (as) =>
      as.map((a) => a.getAttribute('href') || ''));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href, `lien sports invalide: ${href}`).toMatch(/^\/sports\//);
      expect(href).not.toMatch(/\/iframes\/sports/);
    }

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      return {
        clientW: doc.clientWidth,
        scrollW: Math.max(doc.scrollWidth, body.scrollWidth),
      };
    });
    expect(overflow.scrollW, `débordement horizontal: scrollW=${overflow.scrollW} clientW=${overflow.clientW}`)
      .toBeLessThanOrEqual(overflow.clientW + 1);

    const serious = pageErrors.filter((m) =>
      !/ResizeObserver|Loading CSS|favicon|net::ERR_/i.test(m));
    expect(serious, `pageerrors: ${serious.join(' | ')}`).toEqual([]);
  });

  test('page /iframes/ : feuilles chrome présentes, pas de 404, icônes SVG bornées', async ({ page }) => {
    test.setTimeout(60_000);
    const failed = [];
    page.on('response', (res) => {
      if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`);
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/iframes/', { waitUntil: 'networkidle' });

    const sheets = await page.evaluate(() =>
      [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href));
    for (const need of [
      'style-chrome.css',
      'style-masthead-chrome.css',
      'style-sports-strip.css',
      'style-tuner.css',
      'style-feed.css',
    ]) {
      expect(sheets.some((h) => h.includes(need)), `manque ${need}`).toBe(true);
    }

    // Laisser peindre chrome + footer
    await page.waitForSelector('.site-foot__contact svg', { timeout: 15_000 });
    await page.waitForTimeout(500);

    const oversized = await page.evaluate(() => {
      const sel = [
        'header svg',
        '.masthead svg',
        '.masthead-icon svg',
        '.site-foot svg',
        'footer svg',
        '.site-foot__contact svg',
      ].join(', ');
      return [...document.querySelectorAll(sel)]
        .map((svg) => {
          const r = svg.getBoundingClientRect();
          return {
            w: Math.round(r.width),
            h: Math.round(r.height),
            parent: svg.closest('a,button,p')?.className || svg.parentElement?.className || '',
          };
        })
        .filter((x) => x.w > 64 || x.h > 64);
    });
    expect(oversized, `SVG trop grands: ${JSON.stringify(oversized)}`).toEqual([]);

    // Ignorer bruit CDN tiers ; échouer sur sous-ressources du site
    const siteFail = failed.filter((line) => {
      try {
        const u = line.replace(/^\d+\s+/, '');
        const path = new URL(u).pathname;
        return !/^https?:\/\/(fonts\.|cloud\.umami|www\.gstatic)/i.test(u)
          && !path.includes('favicon');
      } catch { return true; }
    });
    expect(siteFail, `sous-ressources en erreur: ${siteFail.join(' | ')}`).toEqual([]);
  });
});

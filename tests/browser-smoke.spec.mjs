import { expect, test } from '@playwright/test';

const routes = [
  { path: '/', marker: '#news-list' },
  { path: '/feeds.html', marker: 'main' },
  { path: '/pomo/', marker: '#pomo-container', embed: true },
  { path: '/solitaire/', marker: '.page-layout', embed: true },
];

for (const viewport of [
  { name: 'bureau', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  for (const route of routes) {
    const critical = viewport.name === 'bureau' && route.path === '/'
      ? ' @ci-critical'
      : '';
    test(`${viewport.name} ${route.path}${critical}`, async ({ page }) => {
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator(route.marker).first()).toBeVisible();
      await expect(page).toHaveTitle(/Radar|Solitaire|Pomo|Flux/i);

      if (route.path === '/') {
        await expect(page.locator('.article').first()).toBeVisible();
      }
      if (route.embed) {
        const iframe = page.locator('#radar-embed');
        await expect(iframe).toBeVisible();
        await expect(iframe).toHaveAttribute('src', '../tuner-embed.html');
        await expect(iframe.contentFrame().locator('#tuner-play')).toBeVisible();
      }
      if (route.path === '/pomo/' || route.path === '/solitaire/') {
        await expect(page.locator('link[rel="icon"][sizes="32x32"]'))
          .toHaveAttribute('href', /favicon-32x32\.png\?v=3$/);
        await expect(page.locator('link[rel="icon"][sizes="96x96"]'))
          .toHaveAttribute('href', /favicon-96x96\.png\?v=3$/);
        const manifest = await page.locator('link[rel="manifest"]').getAttribute('href');
        const manifestText = await page.evaluate((url) => fetch(url).then((r) => r.text()), manifest);
        expect(manifestText).not.toContain('favicon.svg');
        expect(manifestText).toContain('icon-192.png');
      }

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(2);
      expect(pageErrors).toEqual([]);
    });
  }
}

test('maintenance : aperçu local, retour en ligne et easter egg persistant', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // Localement, la page reste ouverte afin de pouvoir la tester sans redirection.
  await page.goto('/offline.html?preview=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#reconnect')).toContainText('Aperçu local');
  await page.waitForTimeout(1300);
  await expect(page).toHaveURL(/offline\.html\?preview=1/);

  // En production, un shell principal disponible ramène bien vers l'accueil.
  await page.route(/\/index\.html\?_probe=/, (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><main id="bg-photo-layer">Le fil étudiant</main>',
  }));
  await page.goto('/offline.html?live=1', { waitUntil: 'domcontentloaded' });
  // Seule la redirection compte ici : attendre l'événement « load » de l'accueil
  // (défaut de waitForURL) dépend de tout le fil étudiant et de ses images.
  await page.waitForURL((url) => url.pathname === '/', {
    timeout: 4000,
    waitUntil: 'domcontentloaded',
  });
  await page.unroute(/\/index\.html\?_probe=/);

  // L'easter egg est volontairement persistant, même si l'accueil est disponible.
  await page.goto('/easter-egg.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#game')).toBeVisible();
  await expect(page).toHaveURL(/offline\.html\?easter-egg=1/);
  await page.waitForTimeout(1300);
  await expect(page).toHaveURL(/offline\.html\?easter-egg=1/);
  await expect(page.locator('#reconnect')).toContainText('Mode easter egg');
  expect(pageErrors).toEqual([]);
});

test('maintenance : le mode public ne redirige pas tant qu’il est actif', async ({ page }) => {
  await page.goto('/offline.html?maintenance=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#reconnect')).toContainText('Maintenance active');
  await page.waitForTimeout(1400);
  await expect(page).toHaveURL(/offline\.html\?maintenance=1/);
});

test('maintenance : un choix de langue manuel suspend la rotation', async ({ page }) => {
  await page.goto('/offline.html?maintenance=1', { waitUntil: 'domcontentloaded' });
  const german = page.locator('.lang-chip', { hasText: 'Deutsch' });
  await german.click();
  const phrase = page.locator('#phrase');
  await expect(phrase).toHaveText('Wartungsarbeiten laufen');
  // La cadence automatique est de 3,2 s : après un clic, elle ne doit pas
  // remplacer la phrase au prochain cycle.
  await page.waitForTimeout(3400);
  await expect(phrase).toHaveText('Wartungsarbeiten laufen');
});

for (const viewport of [
  { name: 'bureau', width: 1440, height: 900 },
  { name: 'mobile courant', width: 390, height: 844 },
  { name: 'mobile compact', width: 390, height: 740 },
]) {
  test(`maintenance : footer compact sans défilement — ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/offline.html?maintenance=1', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.site-foot--maintenance')).toBeVisible();
    await expect(page.locator('.site-foot__details')).not.toHaveAttribute('open', '');

    const overflow = await page.evaluate(() => ({
      vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(overflow.vertical, 'le footer fermé doit tenir dans le viewport').toBeLessThanOrEqual(1);
    expect(overflow.horizontal, 'aucun défilement latéral').toBeLessThanOrEqual(2);

    const details = page.locator('.site-foot__details');
    await details.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(details).toHaveAttribute('open', '');
    await expect(details.locator('.site-foot__legal')).toBeVisible();
  });
}

test('SEO : lecteur natif et bascule de thème', async ({ page }) => {
  await page.goto('/radios/chyz/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#tuner')).toBeVisible();
  await expect(page.locator('#radar-embed')).toHaveCount(0);
  const toggle = page.locator('#theme-toggle');
  await expect(toggle).toBeVisible();
  const before = await page.locator('html').getAttribute('data-theme');
  await toggle.click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', before || '');
  await expect(page.locator('#tuner-select')).toContainText('CHYZ');
  await expect(page.locator('.seo-day[data-current-day="true"]')).toHaveCount(1);
  await expect.poll(() => page.locator('.seo-slot--pulse').count()).toBe(1);
});

test('SEO : clic à l’antenne / à venir pulse le bon créneau', async ({ page }) => {
  await page.goto('/radios/chyz/#horaire', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.locator('.seo-slot--pulse').count()).toBe(1);
  const liveOnHoraire = await page.locator('.seo-slot--live').count();
  if (liveOnHoraire) {
    await expect(page.locator('.seo-slot--live.seo-slot--pulse')).toHaveCount(1);
    await expect(page.locator('.seo-slot--upcoming.seo-slot--pulse')).toHaveCount(0);
  }

  await page.goto('/radios/chyz/#horaire-avenir', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.locator('.seo-slot--pulse').count()).toBe(1);
  const upcomingOnAvenir = await page.locator('.seo-slot--upcoming').count();
  if (upcomingOnAvenir) {
    await expect(page.locator('.seo-slot--upcoming.seo-slot--pulse')).toHaveCount(1);
    await expect(page.locator('.seo-slot--live.seo-slot--pulse')).toHaveCount(0);
  }
});

test('RSS : lecteur natif, sans iframe', async ({ page }) => {
  await page.goto('/feeds.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#tuner')).toBeVisible();
  await expect(page.locator('#radar-embed')).toHaveCount(0);
  await expect(page.locator('#tuner-select')).toContainText('CHYZ');
});

test('RSS : l’heure locale est lisible', async ({ page }) => {
  await page.goto('/feeds.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#today-time')).toBeVisible();
  // FR : « 15 h 03 » ; EN : « 15:03 ».
  await expect(page.locator('#today-time')).toHaveText(/^\d{1,2}(?:\s*h\s*|:)\d{2}$/i);
});

test('mât : aucune couture au-dessus du synthétiseur', async ({ page }) => {
  await page.goto('/feeds.html', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.locator('.masthead').evaluate((el) => getComputedStyle(el).borderBottomWidth)).toBe('0px');
});

test('thème : le choix suit les pages natives et les mini-apps', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('radar-theme', 'dark'));
  for (const path of ['/', '/radios/chyz/', '/feeds.html', '/pomo/', '/solitaire/']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  }
});

test.describe('maintenance hors ligne', () => {
  test.use({ serviceWorkers: 'allow' });

  test('reste jouable après une coupure réseau', async ({ page, context }) => {
    await page.goto('/offline.html?preview=1', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.locator('#game')).toBeVisible();
    await expect(page.locator('#reconnect')).toContainText('Aperçu local');
  });
});

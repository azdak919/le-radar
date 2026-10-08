import { expect, test } from '@playwright/test';

test.describe('application mobile', () => {
  test('fil, favori et pas de défilement horizontal @ci-critical', async ({ page }) => {
    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 700 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(size);
      await page.goto('/mobile/app/#/accueil', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 1, name: 'Le fil étudiant' })).toBeVisible();
      await expect(page.locator('.card-title').first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow).toBe(false);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const title = (await page.locator('.card-title').first().innerText()).trim();
    await page.locator('.card').first().getByRole('button', { name: 'Enregistrer' }).click();
    await page.goto('/mobile/app/#/enregistres', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
    await page.getByRole('link', { name: 'Explorer' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Explorer' })).toBeVisible();
    await page.getByRole('link', { name: 'Recherche' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Recherche' })).toBeVisible();
  });

  test('fiche web noindex et lien vers la publication @ci-critical', async ({ page }) => {
    await page.goto('/mobile/app/#/accueil', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.card-title').first()).toBeVisible();
    const target = await page.evaluate(async () => {
      const news = await (await fetch('/news.json')).json();
      const item = news.items.find((entry) => entry && entry.title && entry.link && entry.source);
      return {
        id: window.RadarMobile.articleId(item.link),
        title: item.title.replace(/\s+/g, ' ').trim(),
        source: item.source,
      };
    });
    await page.goto(`/article/?id=${target.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByRole('heading', { level: 1, name: target.title })).toBeVisible();
    const read = page.getByRole('link', { name: `Lire chez ${target.source}` });
    await expect(read).toBeVisible();
    await expect(read).toHaveAttribute('href', /^https:\/\//);
    await expect(read).toHaveAttribute('target', '_blank');
  });

  test('barre radio persistante entre les onglets @ci-critical', async ({ page }) => {
    // Pas de vrai flux en CI : tout média reçoit 30 s de silence WAV.
    const rate = 8000;
    const samples = rate * 30;
    const wav = Buffer.alloc(44 + samples, 0x80);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + samples, 4); wav.write('WAVE', 8);
    wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34);
    wav.write('data', 36); wav.writeUInt32LE(samples, 40);
    await page.route((url) => !url.href.startsWith('http://127.0.0.1'), (route) => (
      route.request().resourceType() === 'media'
        ? route.fulfill({ status: 200, contentType: 'audio/wav', body: wav })
        : route.continue()
    ));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/mobile/app/#/explorer?section=radios', { waitUntil: 'domcontentloaded' });
    const bar = page.locator('#player');
    await expect(bar).toBeHidden();
    const listen = page.locator('[data-action="radio-toggle"]').first();
    await expect(listen).toBeVisible();
    const id = await listen.getAttribute('data-id');
    await page.goto(`/mobile/app/#/radio/${id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#screen audio')).toHaveCount(0);
    await page.getByRole('button', { name: 'Écouter en direct' }).click();
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute('data-state', 'playing');
    await expect(page.getByRole('button', { name: 'Mettre en pause' })).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => { document.getElementById('player-audio').dataset.marker = 'same'; });

    for (const tab of ['Accueil', 'Recherche', 'Réglages']) {
      await page.locator('#tabs').getByRole('link', { name: tab }).click();
      const heading = tab === 'Accueil' ? 'Le fil étudiant' : tab;
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(bar).toBeVisible();
      const audio = await page.evaluate(() => {
        const node = document.getElementById('player-audio');
        return { marker: node.dataset.marker, paused: node.paused, src: Boolean(node.getAttribute('src')) };
      });
      expect(audio).toEqual({ marker: 'same', paused: false, src: true });
    }

    // La barre est posée sur les onglets, sans les recouvrir ni déborder.
    const boxes = await page.evaluate(() => ({
      bar: document.getElementById('player').getBoundingClientRect().toJSON(),
      tabs: document.getElementById('tabs').getBoundingClientRect().toJSON(),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    expect(boxes.bar.bottom).toBeLessThanOrEqual(boxes.tabs.top);
    expect(boxes.overflow).toBe(false);

    await page.locator('#player-toggle').click();
    await expect(bar).toHaveAttribute('data-state', 'paused');
    expect(await page.evaluate(() => document.getElementById('player-audio').getAttribute('src'))).toBeNull();
    await page.locator('#player-toggle').click();
    await expect(bar).toHaveAttribute('data-state', 'playing');
    await page.getByRole('button', { name: 'Arrêter la radio' }).click();
    await expect(bar).toBeHidden();
  });

  test('slogan du site et anglais sans service de traduction @ci-critical', async ({ page }) => {
    const block = (route) => route.abort();
    await page.route('**://le-radar-translate.azdak.workers.dev/**', block);
    await page.route('**://translate.googleapis.com/**', block);
    await page.route('**://clients5.google.com/**', block);
    await page.route('**://clients4.google.com/**', block);
    await page.route('**://api.mymemory.translated.net/**', block);

    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 700 }]) {
      await page.setViewportSize(size);
      await page.goto('/mobile/app/#/accueil', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.tagline-lead')).toHaveText('Journaux, radios et sports étudiants du Québec,');
      await expect(page.locator('.tagline-tag')).toHaveText('réunis au même endroit');
      await expect(page.locator('.brand')).toContainText('LE-RADAR.ca');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow).toBe(false);
    }

    await expect(page.locator('#translate-menu [data-mode="en"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Original' }).click();
    await page.getByRole('option', { name: /English/ }).click();
    await expect(page.locator('.tagline-lead')).toHaveText('Québec student newspapers, campus radio and sports,');
    await expect(page.locator('.tagline-tag')).toHaveText('all in one place');
    await expect(page.locator('#tabs').getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Student wire' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Theme: system' })).toBeVisible();
  });
});

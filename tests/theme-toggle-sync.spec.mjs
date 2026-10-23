import { expect, test } from '@playwright/test';

// Thème clair dans la PWA : (1) feeds.html charge feeds-page.js ET
// radar-lifecycle.js — deux écouteurs sur #theme-toggle s'annulaient ;
// (2) pendant l'écoute, nav-shell affiche les pages dans un iframe : une
// bascule faite dedans doit aussi changer l'hôte (barre d'état, retour).
test.use({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });

test('feeds.html : un seul clic passe en clair @ci-critical', async ({ page }) => {
  await page.goto('/feeds.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('theme-toggle')?.dataset.themeBound === '1');
  await page.waitForTimeout(500);
  await page.click('#theme-toggle');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('accueil : bascule clair puis sombre @ci-critical', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('theme-toggle')?.dataset.themeBound === '1');
  await page.click('#theme-toggle');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.click('#theme-toggle');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('bascule dans un iframe (shell radio) synchronise l’hôte @ci-critical', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.evaluate(() => {
    const f = document.createElement('iframe');
    f.id = 'theme-sync-probe'; f.src = '/horaires/';
    document.body.appendChild(f);
  });
  const frame = page.frameLocator('#theme-sync-probe');
  await expect(frame.locator('#theme-toggle')).toBeVisible();
  await page.waitForTimeout(800);
  await frame.locator('#theme-toggle').click();
  await expect(frame.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#ffffff');
});

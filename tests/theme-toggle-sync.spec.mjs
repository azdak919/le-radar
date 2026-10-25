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

// Couleurs calculées des deux thèmes (fond/texte de body, mât, cartes,
// syntoniseur) + bascule par le bouton. La barre radio a exactement la même
// couleur en clair et en sombre (consigne : jamais de surcharge par thème).
function lum(rgb) {
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
const readTheme = () => {
  const cs = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const c = getComputedStyle(el);
    return { bg: c.backgroundColor, fg: c.color, bt: c.borderTopColor, bb: c.borderBottomColor };
  };
  return {
    theme: document.documentElement.dataset.theme,
    body: cs('body'),
    masthead: cs('.masthead'),
    card: cs('.article .article-title') || cs('.wire-title'),
    tuner: cs('#tuner'),
    tunerName: cs('#tuner-now-name'),
  };
};

test('thèmes clair et sombre : couleurs et syntoniseur identique @ci-critical', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('theme-toggle')?.dataset.themeBound === '1');
  const dark = await page.evaluate(readTheme);
  expect(dark.theme).toBe('dark');
  await page.click('#theme-toggle');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.waitForTimeout(400);
  const light = await page.evaluate(readTheme);

  // Body : fond sombre / clair distincts, texte lisible (AA) dans les deux.
  expect(dark.body.bg).not.toBe(light.body.bg);
  expect(lum(dark.body.bg)).toBeLessThan(0.05);
  expect(lum(light.body.bg)).toBeGreaterThan(0.8);
  expect(contrast(dark.body.bg, dark.body.fg)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(light.body.bg, light.body.fg)).toBeGreaterThanOrEqual(4.5);
  // Cartes : texte qui suit le thème.
  expect(dark.card.fg).not.toBe(light.card.fg);
  expect(contrast(dark.body.bg, dark.card.fg)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(light.body.bg, light.card.fg)).toBeGreaterThanOrEqual(4.5);
  expect(dark.masthead).not.toBeNull();
  expect(light.masthead).not.toBeNull();

  // Syntoniseur : même fond, mêmes filets, mêmes couleurs de texte.
  expect(light.tuner).toEqual(dark.tuner);
  expect(light.tunerName.fg).toBe(dark.tunerName.fg);
  expect(contrast(dark.tuner.bg, dark.tuner.fg)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(dark.tuner.bg, dark.tunerName.fg)).toBeGreaterThanOrEqual(4.5);
  // Distinct du fond sombre.
  expect(dark.tuner.bg).not.toBe(dark.body.bg);

  // Retour en sombre par le bouton.
  await page.click('#theme-toggle');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

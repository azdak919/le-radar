import { expect, test } from '@playwright/test';

/**
 * Pages d'entités (générées par scripts/seo-pages.js).
 *
 * L'intégrité statique vérifie déjà le balisage ; ici on vérifie ce qu'elle ne
 * peut pas voir : qu'une personne — ou un robot qui suit les liens — atteint
 * réellement ces pages depuis l'accueil, et qu'elles restent lisibles quand
 * JavaScript ne s'exécute pas.
 */

test('depuis l’accueil, on atteint l’annuaire puis une fiche de journal', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });

  await page.getByRole('link', { name: 'Tous les médias étudiants du Québec' }).click();
  await expect(page).toHaveURL(/\/medias\/$/);
  await expect(page.locator('h1')).toHaveText('Les médias étudiants du Québec');

  await page.getByRole('link', { name: /Quartier Libre/ }).first().click();
  await expect(page).toHaveURL(/\/journaux\/quartier-libre\/$/);
  await expect(page.locator('h1')).toContainText('Université de Montréal');
});

test('une fiche de radio expose ses faits et renvoie vers l’écoute', async ({ page }) => {
  await page.goto('/radios/chyz/', { waitUntil: 'load' });

  await expect(page.locator('h1')).toContainText('CHYZ');
  await expect(page.locator('.seo-facts')).toContainText('94,3 FM');
  await expect(page.locator('.seo-facts')).toContainText('Université Laval');
  await expect(page.getByRole('link', { name: /Écouter en direct/ })).toBeVisible();

  // Le lien vers l'établissement doit résoudre, pas juste exister.
  await page.getByRole('link', { name: 'Université Laval' }).first().click();
  await expect(page).toHaveURL(/\/etablissements\/universite-laval\/$/);
});

test('le volet anglais est atteignable et jamais imposé', async ({ page }) => {
  // Navigateur en espagnol : on ne doit PAS être redirigé vers /en/.
  await page.goto('/', { waitUntil: 'load' });
  await expect(page).toHaveURL(/\/$/);
  expect(new URL(page.url()).pathname).not.toContain('/en/');

  await page.getByRole('link', { name: 'English', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-CA');
});

test('les fiches restent lisibles sans JavaScript', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/journaux/le-delit/', { waitUntil: 'domcontentloaded' });

  const text = await page.locator('body').innerText();
  expect(text.length).toBeGreaterThan(400);
  expect(text).toContain('Le Délit');
  // Des manchettes réelles, avec leur lien vers la source d'origine.
  const external = await page.locator('.seo-headline a').count();
  expect(external).toBeGreaterThan(0);
  await ctx.close();
});

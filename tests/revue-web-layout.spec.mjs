import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/** Mise en page écran de la revue : colonne ~70ch, photo bornée, banque en vignette, météo et jeux, bouton PDF. */
const SHOT = process.env.CI ? null : (process.env.REVUE_WEB_SHOTS || '/workspace/radar-revue/web-avant-apres');

async function hideLab(page) {
  await page.evaluate(() => {
    document.querySelectorAll('#local-lab-format-bar, #midwidth-preview-bar, #wide-desktop-bar, #local-lab-shell, #toast, .local-lab-bar').forEach((el) => el.remove());
  });
}

test.describe('Revue écran', () => {
  for (const theme of ['light', 'dark']) {
    test(`1440 px ${theme} : colonne, photo, météo, PDF`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((t) => { try { localStorage.setItem('radar-theme', t); } catch {} }, theme === 'dark' ? 'dark' : 'light');
      await page.goto('/revue/2026-11-17-soir/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('article.revue');
      await hideLab(page);
      const cover = page.locator('.revue-cover');
      await expect(cover).toBeVisible();
      const box = await cover.boundingBox();
      expect(box.width, 'colonne ~70ch, pas toute la fenêtre').toBeLessThan(900);
      const imgBox = await cover.locator('img').boundingBox();
      expect(imgBox.height, 'hauteur bornée').toBeLessThanOrEqual(370);
      const stock = await cover.getAttribute('data-stock');
      if (stock === '1') expect(imgBox.height, 'banque en vignette').toBeLessThanOrEqual(120);
      await expect(page.locator('.revue-lede, .seo-lead.revue-lede')).toBeVisible();
      const lede = await page.locator('.revue-lede, .seo-lead.revue-lede').first().boundingBox();
      expect(lede.y, 'le texte n’est pas chassé hors de l’écran par la photo').toBeLessThan(900);
      await expect(page.locator('.revue-pdf__btn')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('#meteo, .revue-meteo')).toBeVisible();
      await expect(page.locator('#jeux, .revue-jeux')).toBeVisible();
      if (SHOT) {
        mkdirSync(SHOT, { recursive: true });
        const prefix = theme === 'dark' ? 'apres-sombre' : 'apres-clair';
        await page.locator('h1, .seo-title').first().scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(200);
        await page.screenshot({ path: `${SHOT}/${prefix}-haut.png` });
        await page.locator('.revue-meteo').scrollIntoViewIfNeeded();
        await page.waitForTimeout(150);
        await page.screenshot({ path: `${SHOT}/${prefix}-meteo.png` });
        await page.locator('.revue-jeux').scrollIntoViewIfNeeded();
        await page.waitForTimeout(150);
        await page.screenshot({ path: `${SHOT}/${prefix}-jeux.png` });
      }
    });
  }
});

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
      expect(lede.y, 'le texte suit la photo, sans bandeau démesuré').toBeLessThan(box.y + box.height + 48);
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

async function columnMetrics(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const el = document.querySelector('article.revue')
      || document.querySelector('.seo-title')
      || document.querySelector('.revue-wire');
    const r = el.getBoundingClientRect();
    const title = document.querySelector('.seo-title')?.getBoundingClientRect();
    const cover = document.querySelector('.revue-cover')?.getBoundingClientRect();
    const foot = document.querySelector('.site-foot')?.getBoundingClientRect();
    const ticker = document.querySelector('.masthead-sports-strip, .masthead')?.getBoundingClientRect();
    return {
      vw,
      left: r.left,
      right: vw - r.right,
      width: r.width,
      textAlign: getComputedStyle(document.querySelector('.seo-title') || el).textAlign,
      titleLeft: title?.left ?? null,
      coverLeft: cover?.left ?? null,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      footWidth: foot?.width ?? null,
      tickerWidth: ticker?.width ?? null,
      padLeft: parseFloat(getComputedStyle(document.querySelector('.revue-wire')).paddingLeft) || 0,
    };
  });
}

test.describe('Revue écran : colonne centrée', () => {
  const pages = [
    { name: 'édition', path: '/revue/2026-11-19-soir/' },
    { name: 'index', path: '/revue/' },
  ];
  const viewports = [
    { name: '390', width: 390, height: 844 },
    { name: '1024', width: 1024, height: 900 },
    { name: '1440', width: 1440, height: 900 },
    { name: '1920', width: 1920, height: 1080 },
  ];

  for (const loc of pages) {
    for (const vp of viewports) {
      test(`${loc.name} ${vp.name} px sombre : marges égales, pas de défilement horizontal`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.addInitScript(() => { try { localStorage.setItem('radar-theme', 'dark'); } catch {} });
        await page.goto(loc.path, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.seo-title');
        await hideLab(page);
        const m = await columnMetrics(page);
        expect(m.overflowX, `${loc.name} ${vp.name} : pas de défilement horizontal`).toBe(false);
        expect(Math.abs(m.left - m.right), `${loc.name} ${vp.name} : colonne centrée (L=${m.left.toFixed(1)} R=${m.right.toFixed(1)})`).toBeLessThanOrEqual(8);
        expect(m.width, 'colonne bornée, pas toute la fenêtre sur bureau').toBeLessThan(vp.width < 600 ? vp.width + 1 : 900);
        expect(['left', 'start']).toContain(m.textAlign);
        if (m.coverLeft != null && m.titleLeft != null) {
          expect(Math.abs(m.coverLeft - m.titleLeft), 'photo alignée sur le texte').toBeLessThanOrEqual(8);
        }
        if (vp.width >= 1024) {
          expect(m.tickerWidth, 'bandeau sports toujours pleine largeur').toBeGreaterThan(vp.width * 0.9);
        }
        if (vp.width === 390) {
          expect(m.padLeft, 'gouttière mobile conservée').toBeGreaterThanOrEqual(16);
        }
      });
    }
  }
});

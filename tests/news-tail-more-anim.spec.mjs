import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { mockRadarTranslateApis } from './translate-mt-route.mjs';

/**
 * « Charger plus d'articles » : clic explicite seulement, grande fenêtre
 * de progression (même carte que la traduction / les sports).
 * Captures locales dans /workspace/radar-more-anim/ (hors CI).
 */

const SHOT_DIR = process.env.CI ? null : (process.env.NEWS_TAIL_SHOTS || '/workspace/radar-more-anim');

async function shot(locator, name) {
  if (!SHOT_DIR) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  const page = locator.page();
  await page.evaluate(() => {
    document.querySelectorAll('#local-lab-format-bar, #midwidth-preview-bar, #wide-desktop-bar, #local-lab-shell, #toast, .local-lab-bar').forEach((el) => el.remove());
  });
  await locator.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await locator.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

async function hangNewsPages(page) {
  await page.route('**/news-page-*.json', () => {});
}

async function openHome(page, { theme, colorScheme, viewport } = {}) {
  await page.setViewportSize(viewport || { width: 1280, height: 900 });
  if (colorScheme) await page.emulateMedia({ colorScheme });
  if (theme) {
    await page.addInitScript((t) => {
      try { localStorage.setItem('radar-theme', t); } catch { /* ignore */ }
    }, theme);
  }
  await page.addInitScript(() => {
    const css = document.createElement('style');
    css.textContent = '#local-lab-format-bar,#midwidth-preview-bar,#wide-desktop-bar,#local-lab-shell,#toast,.local-lab-bar{display:none!important}';
    document.documentElement.appendChild(css);
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.querySelector('.news-tail')
      && (document.querySelector('.news-tail-toggle') || document.querySelector('.news-tail-more')),
    null,
    { timeout: 20_000 },
  );
}

async function revealMoreButton(page) {
  await page.evaluate(() => {
    document.querySelector('.news-tail-toggle:not(.news-tail-more)')?.click();
  });
  const more = page.locator('.news-tail-more');
  await expect(more).toBeVisible({ timeout: 10_000 });
  return more;
}

function newsOverlay(page) {
  return page.locator('#news-load.translate-progress--news');
}

test.describe('Charger plus : fenêtre de progression', () => {
  test('aucun chargement automatique au défilement', async ({ page }) => {
    let pageHits = 0;
    await page.route('**/news-page-*.json', async (route) => {
      pageHits += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[],"updated":"x"}' });
    });
    await openHome(page, { theme: 'light', colorScheme: 'light' });
    const more = await revealMoreButton(page);
    await more.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(800);
    expect(pageHits).toBe(0);
    await expect(more).not.toHaveAttribute('aria-busy', 'true');
    await expect(newsOverlay(page)).toBeHidden();
    await expect(page.locator('.news-tail-more__spin')).toHaveCount(0);
  });

  test('clic : grande fenêtre FR, pourcentage, clic bloqué', async ({ page }) => {
    let release;
    const gate = new Promise((r) => { release = r; });
    let hits = 0;
    await page.route('**/news-page-*.json', async (route) => {
      hits += 1;
      await gate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-length': '24' },
        body: '{"items":[],"updated":""}',
      });
    });
    await openHome(page, { theme: 'light', colorScheme: 'light' });
    const more = await revealMoreButton(page);
    await expect(more.locator('.news-tail-more__label')).toContainText("Charger plus d'articles");
    await more.click();
    await expect(more).toHaveAttribute('aria-busy', 'true');
    await expect(more).toHaveAttribute('aria-disabled', 'true');
    const overlay = newsOverlay(page);
    await expect(overlay).toBeVisible({ timeout: 10_000 });
    await expect(overlay.locator('#news-load-label')).toHaveText('Chargement des articles…');
    await expect(overlay.locator('.translate-progress__pct')).toBeVisible();
    await expect(overlay.locator('.translate-progress__bar')).toBeVisible();
    await expect(overlay.locator('.translate-progress__logo--article')).toBeVisible();
    const firstHits = hits;
    await more.click({ force: true });
    await page.waitForTimeout(200);
    expect(hits).toBe(firstHits);
    await shot(overlay.locator('.translate-progress__card'), 'fil-progress-fr');
    release();
    await expect(more).not.toHaveAttribute('aria-busy', 'true', { timeout: 15_000 });
    await expect(overlay).toBeHidden();
  });

  test('libellé EN et exclusivité avec la traduction', async ({ page }) => {
    await hangNewsPages(page);
    await mockRadarTranslateApis(page, ({ q }) => {
      if (q.includes("Charger plus d'articles")) return q.replace("Charger plus d'articles", 'Load more articles');
      if (q.includes('Chargement des articles')) return 'Loading articles…';
      return `EN ${q}`;
    });
    await openHome(page, { theme: 'light', colorScheme: 'light' });
    const more = await revealMoreButton(page);
    // Langue seule : évite le toast et le calque de traduction pendant la capture.
    await page.evaluate(() => {
      document.documentElement.dataset.translate = 'en';
      document.documentElement.lang = 'en';
    });
    await more.click();
    const overlay = newsOverlay(page);
    await expect(overlay).toBeVisible({ timeout: 10_000 });
    await expect(overlay.locator('#news-load-label')).toHaveText('Loading articles…');
    await shot(overlay.locator('.translate-progress__card'), 'fil-progress-en');

    await page.evaluate(() => {
      window.__RADAR_TRANSLATE_RELEASE = null;
      window.__RADAR_TRANSLATE_HOLD = new Promise((resolve) => {
        window.__RADAR_TRANSLATE_RELEASE = resolve;
      });
    });
    await page.evaluate(() => {
      window.__radarOverlayRun = window.RadarTranslate.applyMode('es', {
        persist: false,
        fromUserClick: true,
      });
    });
    const translateOv = page.locator('.translate-progress:not(.translate-progress--news):not(.translate-progress--sports)');
    await expect(translateOv).toBeVisible({ timeout: 20_000 });
    await expect(overlay).toBeHidden();
    const both = await page.evaluate(() => {
      const all = [...document.querySelectorAll('.translate-progress')].filter((el) => !el.hidden);
      return all.length;
    });
    expect(both).toBe(1);
    await page.evaluate(() => {
      if (typeof window.__RADAR_TRANSLATE_RELEASE === 'function') window.__RADAR_TRANSLATE_RELEASE();
      window.__RADAR_TRANSLATE_HOLD = null;
    });
    await page.evaluate(() => window.__radarOverlayRun).catch(() => {});
  });

  test('reduced-motion : pas d’animation d’anneau ; mobile + CPU limité', async ({ page, context }) => {
    let release;
    const gate = new Promise((r) => { release = r; });
    await page.route('**/news-page-*.json', async (route) => {
      await gate;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[],"updated":""}' });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openHome(page, {
      theme: 'light',
      colorScheme: 'light',
      viewport: { width: 390, height: 844 },
    });
    const more = await revealMoreButton(page);
    await more.click();
    const overlay = newsOverlay(page);
    await expect(overlay).toBeVisible({ timeout: 15_000 });
    const motion = await overlay.evaluate((el) => {
      const ring = el.querySelector('.translate-progress__ring');
      const wave = el.querySelector('.translate-progress__wave');
      return {
        ringAnim: ring ? getComputedStyle(ring).animationName : '',
        waveAnim: wave ? getComputedStyle(wave).animationName : '',
      };
    });
    expect(motion.ringAnim === 'none' || motion.ringAnim === '' || !overlay).toBeTruthy();
    expect(motion.waveAnim === 'none' || motion.waveAnim === '').toBeTruthy();
    await shot(overlay.locator('.translate-progress__card'), 'fil-progress-fr-reduced-motion');
    release();
    await expect(more).not.toHaveAttribute('aria-busy', 'true', { timeout: 20_000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  });
});

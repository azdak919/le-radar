import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { mockRadarTranslateApis } from './translate-mt-route.mjs';

/**
 * Animation « Charger plus d'articles » : même bague que l'overlay
 * traduction / chargement sports, sans interférer avec la traduction.
 * Captures locales dans /workspace/radar-more-anim/ (hors CI).
 */

const SHOT_DIR = process.env.CI ? null : (process.env.NEWS_TAIL_SHOTS || '/workspace/radar-more-anim');

async function shot(locator, name) {
  if (!SHOT_DIR) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await locator.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

/** Empêche un chargement auto de lever aria-busy pendant les captures. */
async function hangNewsPages(page) {
  await page.route('**/news-page-*.json', () => {});
}

async function openHome(page, { theme, colorScheme } = {}) {
  await page.setViewportSize({ width: 1280, height: 900 });
  if (colorScheme) await page.emulateMedia({ colorScheme });
  if (theme) {
    await page.addInitScript((t) => {
      try { localStorage.setItem('radar-theme', t); } catch { /* ignore */ }
    }, theme);
  }
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.querySelector('.news-tail')
      && (document.querySelector('.news-tail-toggle') || document.querySelector('.news-tail-more')),
    null,
    { timeout: 20_000 },
  );
}

/** Déplie la suite du fil et révèle le bouton, sans déclencher le chargement auto. */
async function revealMoreButton(page) {
  await page.evaluate(() => {
    const tail = document.querySelector('.news-tail');
    const toggle = tail?.querySelector('.news-tail-toggle:not(.news-tail-more)');
    toggle?.click();
  });
  const more = page.locator('.news-tail-more');
  await expect(more).toBeVisible({ timeout: 10_000 });
  // Couper l'observateur : les captures et le clic restent déterministes.
  await page.evaluate(() => {
    const more = document.querySelector('.news-tail-more');
    if (!more) return;
    // Recréé à chaque sync : on le remplace par un observateur inerte.
    const idle = new IntersectionObserver(() => {});
    // Déconnecter tous les observateurs natifs n'est pas exposé ; on éloigne
    // le bouton du seuil en le rendant hors écran le temps de poser l'état.
    more.dataset.shotHold = '1';
  });
  return more;
}

async function holdBusy(page) {
  await page.evaluate(() => {
    const more = document.querySelector('.news-tail-more');
    if (more) more.setAttribute('aria-busy', 'true');
  });
}

function spinBox(page) {
  return page.locator('.news-tail-more .news-tail-more__spin');
}

test.describe('Charger plus : animation de chargement', () => {
  test('bague visible seulement pendant aria-busy, FR clair et sombre', async ({ page }) => {
    await hangNewsPages(page);
    await openHome(page, { theme: 'light', colorScheme: 'light' });
    const more = await revealMoreButton(page);
    const spin = spinBox(page);

    await expect(more).not.toHaveAttribute('aria-busy', 'true');
    await expect(spin).toHaveCount(1);
    await expect(spin).toHaveAttribute('aria-hidden', 'true');
    await expect(spin).toHaveClass(/notranslate/);
    await expect(spin).toHaveAttribute('translate', 'no');
    await expect(spin).toBeHidden();
    await expect(more.locator('.news-tail-more__label')).toContainText("Charger plus d'articles");

    await holdBusy(page);
    await expect(spin).toBeVisible();
    const busyCss = await spin.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        display: s.display,
        animationName: s.animationName,
        animationDuration: s.animationDuration,
        width: s.width,
        color: getComputedStyle(el.parentElement).color,
        cursor: getComputedStyle(el.parentElement).cursor,
        zIndex: s.zIndex,
      };
    });
    expect(busyCss.display).toBe('block');
    expect(busyCss.animationName).toMatch(/translate-progress-spin/);
    expect(Number.parseFloat(busyCss.animationDuration)).toBeCloseTo(0.95, 2);
    expect(busyCss.cursor).toBe('progress');
    // Pas de z-index exotique : l'overlay traduction (60) reste au-dessus.
    expect(['auto', '0']).toContain(busyCss.zIndex);
    await shot(more, 'fr-light-busy');

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      try { localStorage.setItem('radar-theme', 'dark'); } catch { /* ignore */ }
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(spin).toBeVisible();
    await shot(more, 'fr-dark-busy');

    await page.evaluate(() => document.querySelector('.news-tail-more')?.removeAttribute('aria-busy'));
    await expect(spin).toBeHidden();
  });

  test('libellé traduit, bague non envoyée à la MT, overlay au-dessus', async ({ page }) => {
    await hangNewsPages(page);
    await mockRadarTranslateApis(page, ({ q }) => {
      if (q.includes("Charger plus d'articles")) return q.replace("Charger plus d'articles", 'Load more articles');
      return `EN ${q}`;
    });
    await openHome(page, { theme: 'light', colorScheme: 'light' });
    const more = await revealMoreButton(page);

    await page.evaluate(() => window.RadarTranslate.applyMode('en', { persist: false, fromUserClick: true }));
    await page.waitForFunction(
      () => document.documentElement.dataset.translate === 'en'
        && document.documentElement.getAttribute('data-translate-busy') !== 'true',
      null,
      { timeout: 25_000 },
    );

    const label = more.locator('.news-tail-more__label');
    await expect(label).toBeVisible();
    // Le libellé peut rester FR un instant si le cache n'a pas la phrase exacte
    // (compte inclus) : il ne doit juste pas être vidé, ni porter notranslate.
    await expect(label).not.toHaveClass(/notranslate/);
    const labelText = (await label.textContent()) || '';
    expect(labelText.length).toBeGreaterThan(4);
    expect(labelText).toMatch(/articles|Articles/i);

    const spin = spinBox(page);
    await expect(spin).toHaveClass(/notranslate/);
    await expect(spin).toHaveAttribute('aria-hidden', 'true');
    await expect(spin).toHaveAttribute('translate', 'no');

    await holdBusy(page);
    await expect(spin).toBeVisible();
    const afterBusy = (await label.textContent()) || '';
    expect(afterBusy).toBe(labelText);
    await shot(more, 'en-light-busy');

    // Overlay de traduction complète : verrou + z-index 60, pas d'empilement bizarre.
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
    const overlay = page.locator('.translate-progress');
    await expect(overlay).toBeVisible({ timeout: 20_000 });
    const stack = await page.evaluate(() => {
      const ov = document.querySelector('.translate-progress');
      const btn = document.querySelector('.news-tail-more');
      const spin = document.querySelector('.news-tail-more__spin');
      const main = document.querySelector('main.wire');
      return {
        overlayZ: ov ? getComputedStyle(ov).zIndex : null,
        overlayHidden: ov?.hasAttribute('hidden') ?? null,
        spinZ: spin ? getComputedStyle(spin).zIndex : null,
        mainLocked: main?.classList.contains('is-translate-locked') ?? false,
        mainBusy: main?.getAttribute('aria-busy') ?? null,
        btnPe: btn ? getComputedStyle(btn).pointerEvents : null,
        spinIsNotranslate: spin?.classList.contains('notranslate') ?? false,
        spinInOverlay: Boolean(spin?.closest('.translate-progress')),
        overlayInButton: Boolean(ov?.closest('.news-tail-more')),
      };
    });
    expect(Number(stack.overlayZ)).toBeGreaterThanOrEqual(60);
    expect(stack.spinIsNotranslate).toBe(true);
    expect(stack.spinInOverlay).toBe(false);
    expect(stack.overlayInButton).toBe(false);
    expect(['auto', '0']).toContain(stack.spinZ);
    // Pendant le verrou, le bouton du fil est inerte (tout sauf l'overlay).
    if (stack.mainLocked) {
      expect(stack.btnPe).toBe('none');
    }
    await shot(page.locator('.translate-progress__card'), 'en-overlay-card');
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/en-overlay-with-busy-button.png`, fullPage: false });

    await page.evaluate(() => {
      if (typeof window.__RADAR_TRANSLATE_RELEASE === 'function') {
        window.__RADAR_TRANSLATE_RELEASE();
      }
      window.__RADAR_TRANSLATE_HOLD = null;
    });
    await page.evaluate(() => window.__radarOverlayRun).catch(() => {});
  });

  test('défilement : même état aria-busy ; reduced-motion : anneau fixe', async ({ page }) => {
    let releasePages;
    const pagesGate = new Promise((r) => { releasePages = r; });
    await page.route('**/news-page-*.json', async (route) => {
      await pagesGate;
      await route.continue();
    });
    await openHome(page, { theme: 'light', colorScheme: 'light' });
    await page.evaluate(() => document.querySelector('.news-tail-toggle:not(.news-tail-more)')?.click());
    const more = page.locator('.news-tail-more');
    await expect(more).toBeVisible({ timeout: 10_000 });
    // L'observateur (marge 600 px) ou un clic : l'état busy doit apparaître.
    await more.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect(more).toHaveAttribute('aria-busy', 'true', { timeout: 5_000 });
    const spin = spinBox(page);
    await expect(spin).toBeVisible();
    await shot(more, 'fr-light-autoload-busy');
    releasePages();
    await expect(more).not.toHaveAttribute('aria-busy', 'true', { timeout: 15_000 });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await holdBusy(page);
    const reduced = await spin.evaluate((el) => {
      const s = getComputedStyle(el);
      return { display: s.display, animationName: s.animationName };
    });
    expect(reduced.display).toBe('block');
    expect(reduced.animationName === 'none' || reduced.animationName === '').toBeTruthy();
    await shot(more, 'fr-light-busy-reduced-motion');
  });
});

import { expect, test } from '@playwright/test';

/**
 * Overlay de progression : îlot radio + contenu articles inerte.
 * Largeurs : barre Format Base + Grand (LAB.md) et seuils du projet.
 */

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
  { name: '768', width: 768, height: 1024 },
  { name: '834', width: 834, height: 1194 },
  { name: '900', width: 900, height: 700 },
  { name: '1280', width: 1280, height: 720 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1600', width: 1600, height: 900 },
  { name: '1920', width: 1920, height: 1080 },
  { name: '2560', width: 2560, height: 1440 },
  { name: '3440', width: 3440, height: 1440 },
];

function rectsIntersect(a, b, gap = 0.5) {
  if (!a || !b) return false;
  return !(
    a.right <= b.left + gap
    || a.left >= b.right - gap
    || a.bottom <= b.top + gap
    || a.top >= b.bottom - gap
  );
}

async function mockTranslateInstant(page) {
  const fulfillGtx = async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') || '';
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([[[`ES ${q}`, q]]]),
    });
  };
  await page.route(/translate\.googleapis\.com/, fulfillGtx);
  await page.route(/mymemory\.translated\.net/, async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') || '';
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        responseStatus: 200,
        responseData: { translatedText: `ES ${q}` },
      }),
    });
  });
}

async function openHome(page, viewport) {
  if (viewport) await page.setViewportSize(viewport);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.RadarTranslate?.applyMode
      && document.querySelectorAll('.article').length > 2
      && document.getElementById('tuner'),
    null,
    { timeout: 20_000 },
  );
}

async function armHold(page) {
  await page.evaluate(() => {
    window.__RADAR_TRANSLATE_RELEASE = null;
    window.__RADAR_TRANSLATE_HOLD = new Promise((resolve) => {
      window.__RADAR_TRANSLATE_RELEASE = resolve;
    });
  });
}

async function releaseHold(page) {
  await page.evaluate(() => {
    if (typeof window.__RADAR_TRANSLATE_RELEASE === 'function') {
      window.__RADAR_TRANSLATE_RELEASE();
    }
    window.__RADAR_TRANSLATE_HOLD = null;
  });
}

async function startHeldTranslate(page) {
  await armHold(page);
  await page.evaluate(() => {
    window.__radarOverlayRun = window.RadarTranslate.applyMode('es', {
      persist: false,
      fromUserClick: true,
    });
  });
  await expect(page.locator('#translate-progress')).toBeVisible({ timeout: 20_000 });
}

async function finishHeldTranslate(page) {
  await releaseHold(page);
  await page.evaluate(() => window.__radarOverlayRun);
  await expect(page.locator('#translate-progress')).toBeHidden({ timeout: 15_000 });
}

async function overlaySnapshot(page) {
  return page.evaluate(() => {
    const overlay = document.getElementById('translate-progress');
    const tuner = document.getElementById('tuner');
    const play = document.getElementById('tuner-play');
    const prev = document.getElementById('tuner-prev');
    const next = document.getElementById('tuner-next');
    const volToggle = document.getElementById('tuner-vol-toggle');
    const select = document.getElementById('tuner-select');
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const bar = overlay?.querySelector('.translate-progress__pct');
    const fill = overlay?.querySelector('.translate-progress__fill');
    const stripes = fill
      ? getComputedStyle(fill, '::after').animationName
      : '';
    return {
      overlay: box(overlay),
      overlayHidden: !overlay || overlay.hidden,
      overlayParentIsWire: overlay?.parentElement?.matches?.('main.wire') || overlay?.closest('main.wire') === overlay.parentElement,
      overlayInTuner: !!overlay?.closest('#tuner'),
      tuner: box(tuner),
      play: box(play),
      playH: play ? play.getBoundingClientRect().height : 0,
      playPe: play ? getComputedStyle(play).pointerEvents : '',
      tunerInert: !!(tuner && tuner.inert),
      tunerAriaHidden: tuner?.getAttribute('aria-hidden'),
      playTabIndex: play?.tabIndex,
      prevPe: prev ? getComputedStyle(prev).pointerEvents : '',
      nextPe: next ? getComputedStyle(next).pointerEvents : '',
      volPe: volToggle ? getComputedStyle(volToggle).pointerEvents : '',
      selectPe: select ? getComputedStyle(select).pointerEvents : '',
      wireBusy: document.querySelector('main.wire')?.getAttribute('aria-busy'),
      wireInert: !!(document.querySelector('main.wire')?.inert),
      htmlLock: document.documentElement.classList.contains('translate-articles-lock'),
      bodyFixed: getComputedStyle(document.body).position === 'fixed',
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      audio: document.querySelectorAll('audio, video').length,
      media: [...document.querySelectorAll('audio, video')].map((el) => el.id),
      valuemax: bar?.getAttribute('aria-valuemax'),
      valuemin: bar?.getAttribute('aria-valuemin'),
      valuenow: bar?.getAttribute('aria-valuenow'),
      role: bar?.getAttribute('role'),
      label: document.getElementById('translate-progress-label')?.textContent || '',
      percentText: overlay?.querySelector('.translate-progress__pct')?.innerText || '',
      zTuner: tuner ? Number.parseInt(getComputedStyle(tuner).zIndex, 10) : 0,
      zOverlay: overlay ? Number.parseInt(getComputedStyle(overlay).zIndex, 10) : 0,
      wideLeft: !!document.querySelector('.tuner-wide-left'),
      stripes,
      skipVisible: overlay ? !overlay.querySelector('.translate-progress__skip')?.hidden : false,
      scrollY: window.scrollY,
      dialogs: document.querySelectorAll('dialog[open]').length,
    };
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('overlay traduction articles', () => {
  test('lock + tuner libre + % à chaque largeur labo', async ({ page }) => {
    test.setTimeout(90_000);
    await mockTranslateInstant(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await openHome(page);
    await startHeldTranslate(page);

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.evaluate(() => {
        window.dispatchEvent(new Event('resize'));
      });
      await page.waitForTimeout(80);
      const snap = await overlaySnapshot(page);
      expect(snap.overlayHidden, `${vp.name}: overlay visible`).toBe(false);
      expect(snap.overlayInTuner, `${vp.name}: overlay hors #tuner`).toBe(false);
      expect(snap.bodyFixed, `${vp.name}: body pas position:fixed`).toBe(false);
      expect(snap.htmlLock, `${vp.name}: html lock`).toBe(true);
      expect(snap.wireBusy, `${vp.name}: aria-busy`).toBe('true');
      expect(snap.wireInert, `${vp.name}: main.wire lui-même pas inert (skip + overlay)`).toBe(false);
      expect(snap.tunerInert, `${vp.name}: tuner pas inert`).toBe(false);
      expect(snap.tunerAriaHidden, `${vp.name}: tuner pas aria-hidden`).not.toBe('true');
      expect(snap.playPe, `${vp.name}: play cliquable`).not.toBe('none');
      expect(snap.volPe, `${vp.name}: bouton volume cliquable`).not.toBe('none');
      expect(snap.selectPe, `${vp.name}: station cliquable`).not.toBe('none');
      expect(snap.playH, `${vp.name}: play > 20 px`).toBeGreaterThan(20);
      expect(snap.audio, `${vp.name}: un seul media`).toBe(1);
      expect(snap.media).toEqual(['radar-player']);
      expect(snap.dialogs, `${vp.name}: pas de dialog modal`).toBe(0);
      expect(snap.role).toBe('progressbar');
      expect(snap.valuemin).toBe('0');
      expect(snap.valuemax).toBe('100');
      expect(Number(snap.valuenow), `${vp.name}: aria-valuenow`).toBeGreaterThanOrEqual(0);
      expect(Number(snap.valuenow), `${vp.name}: pas collé à 99`).toBeLessThan(99);
      expect(snap.percentText, `${vp.name}: chiffre %`).toMatch(/\d/);
      expect(snap.zOverlay, `${vp.name}: overlay sous tuner`).toBeLessThan(snap.zTuner);
      expect(snap.overflowX, `${vp.name}: overflow-x ${snap.overflowX}`).toBeLessThan(8);
      expect(
        rectsIntersect(snap.overlay, snap.tuner, 1),
        `${vp.name}: overlay ∩ tuner`,
      ).toBe(false);
      if (vp.width === 1280) {
        expect(snap.wideLeft, '1280 : pas de .tuner-wide-left').toBe(false);
      }
      if (vp.width <= 430) {
        expect(snap.prevPe === 'none' || snap.nextPe !== 'none', `${vp.name}: skips`).toBeTruthy();
      }
    }

    await page.locator('#tuner-play').click({ timeout: 3000 });
    await finishHeldTranslate(page);
    const after = await overlaySnapshot(page);
    expect(after.overlayHidden).toBe(true);
    expect(after.htmlLock).toBe(false);
    expect(after.tunerInert).toBe(false);
    expect(after.audio).toBe(1);
  });

  test('cache hit < 350 ms : pas d’overlay', async ({ page }) => {
    test.setTimeout(60_000);
    await mockTranslateInstant(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await openHome(page);
    await page.evaluate(() => window.RadarTranslate.applyMode('es', {
      persist: false,
      fromUserClick: true,
    }));
    await expect(page.locator('#translate-progress')).toBeHidden({ timeout: 20_000 });

    const seen = await page.evaluate(async () => {
      const el = document.getElementById('translate-progress');
      let shown = false;
      const obs = new MutationObserver(() => {
        if (el && !el.hidden) shown = true;
      });
      if (el) obs.observe(el, { attributes: true, attributeFilter: ['hidden', 'class'] });
      await window.RadarTranslate.applyMode('es', { persist: false, fromUserClick: true });
      obs.disconnect();
      return shown;
    });
    expect(seen, 'second passage cache : overlay absent').toBe(false);
    await expect(page.locator('#translate-progress')).toBeHidden();
  });

  test('prefers-reduced-motion : barre statique, pas de rayure', async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockTranslateInstant(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openHome(page);
    await startHeldTranslate(page);
    const motion = await page.evaluate(() => {
      const fill = document.querySelector('.translate-progress__fill');
      const ring = document.querySelector('.translate-progress__ring');
      const after = fill ? getComputedStyle(fill, '::after') : null;
      return {
        fillAnim: fill ? getComputedStyle(fill).animationName : '',
        afterAnim: after?.animationName || 'none',
        afterDisplay: after?.display || '',
        ringAnim: ring ? getComputedStyle(ring).animationName : '',
        percent: document.querySelector('.translate-progress__num')?.textContent || '',
      };
    });
    expect(motion.percent).toMatch(/\d/);
    expect(motion.afterDisplay === 'none' || motion.afterAnim === 'none' || !motion.afterAnim)
      .toBeTruthy();
    expect(motion.fillAnim === 'none' || !motion.fillAnim).toBeTruthy();
    await finishHeldTranslate(page);
  });

  test('unlock restaure scrollY ; skip lève le lock, radio intacte', async ({ page }) => {
    test.setTimeout(60_000);
    await mockTranslateInstant(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openHome(page);
    await page.waitForFunction(() => document.documentElement.scrollHeight > window.innerHeight + 200);
    await page.evaluate(() => window.scrollTo(0, 280));
    await page.waitForFunction(() => window.scrollY >= 120);
    const before = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => {
      window.RadarTranslate._ui.OVERLAY_TIMING.SKIP_AFTER_MS = 400;
    });
    await startHeldTranslate(page);
    const mid = await overlaySnapshot(page);
    expect(mid.htmlLock).toBe(true);
    expect(Math.abs(mid.scrollY - before)).toBeLessThan(80);
    await expect(page.locator('.translate-progress__skip')).toBeVisible({ timeout: 4000 });
    await page.locator('.translate-progress__skip').click();
    await expect(page.locator('#translate-progress')).toBeHidden({ timeout: 4000 });
    const skipped = await overlaySnapshot(page);
    expect(skipped.htmlLock).toBe(false);
    expect(skipped.tunerInert).toBe(false);
    expect(skipped.playPe).not.toBe('none');
    expect(skipped.audio).toBe(1);
    await page.locator('#tuner-play').click();
    await finishHeldTranslate(page);
    const endY = await page.evaluate(() => window.scrollY);
    expect(Math.abs(endY - before)).toBeLessThan(120);
  });

  test('pomo et solitaire : pas d’overlay articles', async ({ page }) => {
    await mockTranslateInstant(page);
    for (const path of ['/pomo/', '/solitaire/']) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#translate-progress')).toHaveCount(0);
      await expect(page.locator('#lang-btn')).toBeVisible();
    }
  });

  test('3840 → 390 → 1920 : pas de wrapper orphelin, scroll pas coincé', async ({ page }) => {
    test.setTimeout(60_000);
    await mockTranslateInstant(page);
    await page.setViewportSize({ width: 3840, height: 1440 });
    await openHome(page);
    await startHeldTranslate(page);
    for (const vp of [
      { width: 3840, height: 1440 },
      { width: 390, height: 844 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(vp);
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForTimeout(60);
      const snap = await overlaySnapshot(page);
      expect(snap.overlayHidden, `${vp.width}: overlay`).toBe(false);
      expect(snap.bodyFixed, `${vp.width}: body`).toBe(false);
      const orphans = await page.evaluate(() => ({
        wideLeft: !!document.querySelector('.tuner-wide-left'),
        overlayCount: document.querySelectorAll('#translate-progress').length,
        htmlOverflow: getComputedStyle(document.documentElement).overflow,
      }));
      expect(orphans.overlayCount).toBe(1);
      if (vp.width === 390) expect(orphans.wideLeft).toBe(false);
      expect(snap.overflowX).toBeLessThan(8);
      expect(rectsIntersect(snap.overlay, snap.tuner)).toBe(false);
      expect(snap.tunerInert).toBe(false);
    }
    await finishHeldTranslate(page);
    const unlocked = await overlaySnapshot(page);
    expect(unlocked.htmlLock).toBe(false);
    expect(unlocked.bodyFixed).toBe(false);
  });
});

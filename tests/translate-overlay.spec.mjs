import { expect, test } from '@playwright/test';
import { mockRadarTranslateApis } from './translate-mt-route.mjs';

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
  await page.route('**/assets/news-images/**', (route) => route.abort());
  await page.route('**/assets/meteocons/**', (route) => route.abort());
  await mockRadarTranslateApis(page, ({ q }) => `ES ${q}`);
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
    const card = overlay?.querySelector('.translate-progress__card');
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
      beat: overlay?.querySelector('.translate-progress__beat'),
      spark: overlay?.querySelector('.translate-progress__spark'),
      percentText: overlay?.querySelector('.translate-progress__pct')?.innerText || '',
      zTuner: tuner ? Number.parseInt(getComputedStyle(tuner).zIndex, 10) : 0,
      zOverlay: overlay ? Number.parseInt(getComputedStyle(overlay).zIndex, 10) : 0,
      zHead: (() => {
        const head = document.querySelector('.wire-head');
        const z = head ? Number.parseInt(getComputedStyle(head).zIndex, 10) : 0;
        return Number.isFinite(z) ? z : 0;
      })(),
      toastHidden: (() => {
        const t = document.getElementById('toast');
        if (!t) return true;
        if (t.classList.contains('hidden') || t.hidden) return true;
        const cs = getComputedStyle(t);
        return cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0';
      })(),
      toastText: document.getElementById('toast')?.textContent || '',
      zLangHost: (() => {
        const wire = document.querySelector('main.wire');
        const host = wire && [...wire.children].find((el) => el.querySelector?.('.translate-control'));
        const z = host ? Number.parseInt(getComputedStyle(host).zIndex, 10) : 0;
        return Number.isFinite(z) ? z : 0;
      })(),
      zControl: (() => {
        const el = document.querySelector('.translate-control');
        const z = el ? Number.parseInt(getComputedStyle(el).zIndex, 10) : 0;
        return Number.isFinite(z) ? z : 0;
      })(),
      zWave: overlay?.querySelector('.translate-progress__wave')
        ? Number.parseInt(getComputedStyle(overlay.querySelector('.translate-progress__wave')).zIndex, 10)
        : 0,
      zRing: overlay?.querySelector('.translate-progress__ring')
        ? Number.parseInt(getComputedStyle(overlay.querySelector('.translate-progress__ring')).zIndex, 10)
        : 0,
      wideLeft: !!document.querySelector('.tuner-wide-left'),
      stripes,
      skipVisible: overlay ? !overlay.querySelector('.translate-progress__skip')?.hidden : false,
      scrollY: window.scrollY,
      dialogs: document.querySelectorAll('dialog[open]').length,
      card: box(card),
      viewW: window.innerWidth,
      viewH: window.innerHeight,
      brief: box(document.querySelector('.brief-rail')),
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
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
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
      expect(snap.spark, `${vp.name}: pas d’étoile intercalaire`).toBeFalsy();
      expect(snap.beat, `${vp.name}: pas de ligne Excerpts`).toBeFalsy();
      expect(snap.label.length, `${vp.name}: étape officielle`).toBeGreaterThan(2);
      expect(snap.zOverlay, `${vp.name}: overlay sous tuner`).toBeLessThan(snap.zTuner);
      expect(snap.zLangHost, `${vp.name}: tête du fil sous overlay (pas le filet sur le logo)`).toBeLessThan(snap.zOverlay);
      expect(snap.zHead, `${vp.name}: .wire-head sous overlay`).toBeLessThan(snap.zOverlay);
      expect(snap.zControl, `${vp.name}: puce langue sous overlay`).toBeLessThan(snap.zOverlay);
      expect(snap.toastHidden, `${vp.name}: toast masqué (doublon overlay)`).toBe(true);
      expect(snap.zWave, `${vp.name}: ondes sous l’anneau`).toBeLessThan(snap.zRing);
      expect(snap.overflowX, `${vp.name}: overflow-x ${snap.overflowX}`).toBeLessThan(8);
      expect(
        rectsIntersect(snap.overlay, snap.tuner, 1),
        `${vp.name}: overlay ∩ tuner`,
      ).toBe(false);
      if (snap.card && snap.overlay && snap.viewW) {
        const midX = (snap.card.left + snap.card.right) / 2;
        const midY = (snap.card.top + snap.card.bottom) / 2;
        const overlayMidY = (snap.overlay.top + snap.overlay.bottom) / 2;
        expect(
          Math.abs(midX - snap.viewW / 2),
          `${vp.name}: carte centrée X (Δ${Math.round(Math.abs(midX - snap.viewW / 2))})`,
        ).toBeLessThan(snap.viewW * 0.18);
        expect(
          Math.abs(midY - overlayMidY),
          `${vp.name}: carte centrée dans l’overlay (Δ${Math.round(Math.abs(midY - overlayMidY))})`,
        ).toBeLessThan(Math.max(48, snap.overlay.height * 0.12));
      }
      if (
        snap.brief
        && snap.brief.height > 40
        && snap.brief.top < snap.viewH - 8
        && snap.brief.bottom > 8
      ) {
        expect(
          rectsIntersect(snap.overlay, snap.brief, 1),
          `${vp.name}: overlay couvre En bref`,
        ).toBe(true);
      }
      if (vp.width === 1280) {
        expect(snap.wideLeft, '1280 : pas de .tuner-wide-left').toBe(false);
      }
      if (vp.width <= 430) {
        expect(snap.prevPe === 'none' || snap.nextPe !== 'none', `${vp.name}: skips`).toBeTruthy();
      }
    }

    await expect(page.locator('#tuner-play')).toBeVisible();
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

  test('cache : purge un titre hors fil, garde l’article frais', async ({ page }) => {
    await mockTranslateInstant(page);
    await openHome(page, { width: 900, height: 700 });
    const report = await page.evaluate(async () => {
      const title = (document.querySelector('.article-title')?.textContent || 'Titre frais').trim();
      await window.RadarTranslate.translateText(title, 'es');
      await window.RadarTranslate.translateText('Ancien article disparu du fil', 'es');
      window.RadarTranslate.rememberNewsCorpus([
        { title, date: new Date().toISOString() },
      ]);
      const raw = JSON.parse(localStorage.getItem(window.RadarTranslate._ui.CACHE_KEY) || '{}');
      const keys = Object.keys(raw.entries || {});
      return {
        v: raw.v,
        hasStale: keys.some((k) => k.includes('Ancien article disparu du fil')),
        hasLive: keys.some((k) => k.includes(title)),
      };
    });
    expect(report.v).toBe(11);
    expect(report.hasStale, 'titre plus dans le fil : hors cache').toBe(false);
    expect(report.hasLive, 'titre encore au fil : conservé').toBe(true);
  });

  test('prefers-reduced-motion : barre statique, pas de reflet', async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockTranslateInstant(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openHome(page);
    await startHeldTranslate(page);
    const motion = await page.evaluate(() => {
      const fill = document.querySelector('.translate-progress__fill');
      const ring = document.querySelector('.translate-progress__ring');
      const wave = document.querySelector('.translate-progress__wave');
      const logo = document.querySelector('.translate-progress__logo');
      const after = fill ? getComputedStyle(fill, '::after') : null;
      return {
        fillAnim: fill ? getComputedStyle(fill).animationName : '',
        afterAnim: after?.animationName || 'none',
        afterDisplay: after?.display || '',
        ringAnim: ring ? getComputedStyle(ring).animationName : '',
        waveAnim: wave ? getComputedStyle(wave).animationName : '',
        logoSrc: logo?.getAttribute('src') || '',
        percent: document.querySelector('.translate-progress__num')?.textContent || '',
      };
    });
    expect(motion.percent).toMatch(/\d/);
    expect(motion.logoSrc).toMatch(/icon\.svg/);
    expect(motion.waveAnim === 'none' || !motion.waveAnim).toBeTruthy();
    expect(motion.afterDisplay === 'none' || motion.afterAnim === 'none' || !motion.afterAnim)
      .toBeTruthy();
    expect(motion.fillAnim === 'none' || !motion.fillAnim).toBeTruthy();
    await finishHeldTranslate(page);
  });

  test('sélecteur de langue sous l’overlay pendant la traduction', async ({ page }) => {
    test.setTimeout(60_000);
    await mockTranslateInstant(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openHome(page);
    await startHeldTranslate(page);
    const toggle = page.locator('#translate-toggle');
    await expect(toggle).toBeVisible();
    const hit = await page.evaluate(() => {
      const t = document.getElementById('translate-toggle');
      const r = t.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const cs = getComputedStyle(t);
      const control = t.closest('.translate-control');
      const z = control ? Number.parseInt(getComputedStyle(control).zIndex, 10) : 0;
      const zOverlay = Number.parseInt(getComputedStyle(document.getElementById('translate-progress')).zIndex, 10);
      return {
        overlayHit: !!el?.closest?.('#translate-progress'),
        menuHidden: !!document.getElementById('translate-menu')?.hidden,
        zControl: Number.isFinite(z) ? z : 0,
        zOverlay,
      };
    });
    expect(hit.overlayHit, 'clic sur la puce = overlay, pas le menu').toBe(true);
    expect(hit.menuHidden, 'menu langue fermé').toBe(true);
    expect(hit.zControl, 'puce sous overlay').toBeLessThan(hit.zOverlay);
    await expect(page.locator('#translate-menu')).toBeHidden();
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
    await expect(page.locator('.translate-progress__skip')).not.toHaveText(
      'Afficher les articles dans leur langue originale',
    );
    await page.locator('.translate-progress__skip').click();
    await expect(page.locator('#translate-progress')).toBeHidden({ timeout: 4000 });
    await expect.poll(() => page.evaluate(() => window.RadarTranslate.getMode())).toBe('original');
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
      { width: 2560, height: 1440 },
      { width: 3440, height: 1440 },
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

  test('persan : glossaire overlay + articles en écriture arabe', async ({ page }) => {
    await page.route('**/assets/news-images/**', (route) => route.abort());
    await page.route('**/assets/meteocons/**', (route) => route.abort());
    await mockRadarTranslateApis(page, ({ q }) => `ترجمه ${q}`);
    await openHome(page, { width: 900, height: 700 });
    const overlayFa = await page.evaluate(() => {
      const p = window.RadarTranslate._ui.preferredUiPhrase;
      return {
        prep: p('Préparation de la langue…', 'fa'),
        skip: p('Afficher les articles dans leur langue originale', 'fa'),
      };
    });
    expect(overlayFa.prep).toMatch(/[\u0600-\u06FF]/);
    expect(overlayFa.skip).toMatch(/[\u0600-\u06FF]/);
    await Promise.race([
      page.evaluate(() => window.RadarTranslate.applyMode('fa', {
        persist: false,
        fromUserClick: true,
      })),
      page.waitForTimeout(20000).then(() => { throw new Error('applyMode fa > 20s'); }),
    ]);
    const title = page.locator('.article-title').first();
    await expect(title).toContainText(/[\u0600-\u06FF]/);
    const dir = await page.evaluate(() => document.documentElement.dataset.scriptDir);
    expect(dir).toBe('rtl');
  });

  test('gtx en échec : applyMode persan se termine et pose lang=fa', async ({ page }) => {
    await page.route('**/assets/news-images/**', (route) => route.abort());
    await page.route('**/assets/meteocons/**', (route) => route.abort());
    await page.route(/translate\.googleapis\.com/, (route) => route.abort());
    await page.route(/clients[45]\.google\.com/, (route) => route.abort());
    await page.route(/le-radar-translate\.azdak\.workers\.dev/, (route) => route.abort());
    await page.route(/mymemory\.translated\.net/, (route) => route.abort());
    await openHome(page, { width: 900, height: 700 });
    await page.evaluate(() => window.RadarTranslate.applyMode('fa', {
      persist: false,
      fromUserClick: true,
    }));
    const lang = await page.evaluate(() => document.documentElement.lang);
    expect(lang).toBe('fa');
    const dir = await page.evaluate(() => document.documentElement.dataset.scriptDir);
    expect(dir).toBe('rtl');
  });

  test('toutes les langues du menu : alias gtx + overlay pas coincé en FR', async ({ page }) => {
    await page.route('**/assets/news-images/**', (route) => route.abort());
    await page.route('**/assets/meteocons/**', (route) => route.abort());
    await openHome(page, { width: 900, height: 700 });
    const report = await page.evaluate(() => {
      const ui = window.RadarTranslate._ui;
      const keys = [
        'Préparation de la langue…',
        'Traduction des articles…',
        'Mise en page…',
        'Prêt',
        'Afficher les articles dans leur langue originale',
      ];
      const modes = Object.entries(window.RadarTranslate.MODES)
        .filter(([, m]) => m && !m.unavailable && m.id !== 'original' && m.id !== 'fr')
        .map(([id]) => id);
      const stuckFr = [];
      for (const id of modes) {
        for (const k of keys) {
          const hit = window.RadarTranslate.preferredUiPhrase(k, id)
            || window.RadarTranslate.preferredUiPhrase(k, 'en');
          if (!hit || hit === k) stuckFr.push(`${id}:${k}`);
        }
      }
      return {
        modeCount: modes.length,
        stuckFr,
        fa: ui.gtxTargetCodes('fa'),
        he: ui.gtxTargetCodes('he'),
        zh: ui.gtxTargetCodes('zh'),
        tl: ui.gtxTargetCodes('tl'),
        iuLatn: ui.gtxTargetCodes('iu-latn'),
        mmIw: ui.mymemoryLang('iw'),
        mmFaIr: ui.mymemoryLang('fa-IR'),
      };
    });
    expect(report.modeCount, 'catalogue menu').toBeGreaterThan(30);
    expect(report.stuckFr, 'aucune langue sans overlay (glossaire ou EN)').toEqual([]);
    expect(report.fa).toEqual(['fa', 'fa-IR']);
    expect(report.he[0]).toBe('iw');
    expect(report.zh[0]).toBe('zh-CN');
    expect(report.tl).toEqual(['tl', 'fil']);
    expect(report.iuLatn[0]).toBe('iu-Latn');
    expect(report.iuLatn).toContain('ike-Latn');
    expect(report.mmIw).toBe('he');
    expect(report.mmFaIr).toBe('fa');
  });

  test('inuktitut : overlay et articles en syllabaires, pas l’anglais', async ({ page }) => {
    await page.route('**/assets/news-images/**', (route) => route.abort());
    await page.route('**/assets/meteocons/**', (route) => route.abort());
    await mockRadarTranslateApis(page, ({ q, sl }) => (
      sl === 'fr' ? q : `ᐃᓄᒃᑎᑐᑦ ${q}`
    ));
    await openHome(page, { width: 900, height: 700 });
    const seen = await page.evaluate(async () => {
      const labels = [];
      const obs = new MutationObserver(() => {
        const t = document.querySelector('#translate-progress-label')?.textContent || '';
        if (t) labels.push(t);
      });
      const host = document.querySelector('main.wire') || document.body;
      obs.observe(host, { subtree: true, childList: true, characterData: true });
      await window.RadarTranslate.applyMode('iu', { persist: false, fromUserClick: true });
      obs.disconnect();
      return labels;
    });
    const title = page.locator('.article-title').first();
    await expect(title).toContainText(/[\u1400-\u167F]/);
    expect(seen.join('\n'), 'overlay IU pas en anglais').not.toMatch(/Preparing the language/i);
    expect(seen.some((t) => /[\u1400-\u167F]/.test(t)), 'overlay en syllabaires').toBe(true);
  });

  test('gtx 429 + quota MyMemory : clients5 traduit encore', async ({ page }) => {
    await page.route('**/assets/news-images/**', (route) => route.abort());
    await page.route('**/assets/meteocons/**', (route) => route.abort());
    await page.route(/le-radar-translate\.azdak\.workers\.dev/, (route) => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: '{"error":"Not found"}',
    }));
    await page.route(/translate\.googleapis\.com/, (route) => route.fulfill({
      status: 429,
      contentType: 'text/html',
      body: '<html><title>Sorry...</title></html>',
    }));
    await page.route(/mymemory\.translated\.net/, (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        responseStatus: 200,
        responseData: {
          translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY',
        },
      }),
    }));
    await page.route(/clients5\.google\.com/, async (route) => {
      const q = new URL(route.request().url()).searchParams.get('q') || '';
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([`Hola ${q}`]),
      });
    });
    await openHome(page, { width: 900, height: 700 });
    await page.evaluate(() => window.RadarTranslate.applyMode('es', {
      persist: false,
      fromUserClick: true,
    }));
    const title = await page.locator('.article-title').first().textContent();
    expect(title, 'titre traduit via clients5').toMatch(/Hola /);
  });
});

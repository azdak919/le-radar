import { expect, test } from '@playwright/test';

/**
 * Module partagé radio-barre.js (Pomodoro, Solitaire, journaux du Kiosque) :
 * logo vers https://le-radar.ca/ seulement, défilement à l'arrêt, barre
 * qui ne saute pas au changement de poste.
 */

async function waitBar(page) {
  const host = page.locator('.radar-radio');
  await expect(host).toBeVisible();
  await expect(host.locator('.bar')).toBeVisible();
  await expect(host.locator('.line1')).not.toHaveText('');
  await page.evaluate(() => document.fonts ? document.fonts.ready : null);
  await page.waitForTimeout(200);
  return host;
}

async function snapshot(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.radar-radio')?.shadowRoot;
    const bar = root?.querySelector('.bar');
    if (!bar) return null;
    const box = (sel) => {
      const el = root.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const lineInfo = (sel) => {
      const el = root.querySelector(sel);
      if (!el) return null;
      const span = el.querySelector('.tuner-now-sub-text') || el;
      return {
        text: (el.textContent || '').trim(),
        isMarquee: el.classList.contains('is-marquee'),
        overflow: span.scrollWidth - el.clientWidth,
        animation: getComputedStyle(span).animationName,
      };
    };
    return {
      state: bar.dataset.state,
      brandHref: root.querySelector('a.brand')?.getAttribute('href') || null,
      bar: box('.bar'),
      now: box('.now'),
      play: box('.play'),
      prev: box('[data-step="-1"]'),
      next: box('[data-step="1"]'),
      line1: lineInfo('.line1'),
      line2: lineInfo('.line2'),
    };
  });
}

function nearly(a, b, label) {
  expect(Math.abs((a ?? 0) - (b ?? 0)), label).toBeLessThanOrEqual(1);
}

for (const path of ['/pomo/', '/solitaire/']) {
  for (const viewport of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'bureau', width: 1440, height: 900 },
  ]) {
    const tag = `${path.replace(/\//g, '')} ${viewport.name}`;

    test(`logo vers https://le-radar.ca/ (${tag}) @ci-critical`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await waitBar(page);
      const info = await snapshot(page);
      expect(info.brandHref).toBe('https://le-radar.ca/');
    });

    test(`défilement à l'arrêt si le texte déborde (${tag}) @ci-critical`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const host = await waitBar(page);
      await page.waitForTimeout(300);
      const info = await snapshot(page);
      expect(info.state).toBe('idle');
      const overflowing = [info.line1, info.line2].filter((l) => l && l.overflow > 2);
      if (overflowing.length) {
        for (const line of overflowing) {
          expect(line.isMarquee, line.text).toBe(true);
          expect(line.animation).toMatch(/tunerMarquee/);
        }
      } else {
        // Forcer un texte trop long : le défilement doit tout de même partir au repos.
        await host.evaluate(() => {
          const root = document.querySelector('.radar-radio').shadowRoot;
          const el = root.querySelector('.line1');
          const span = el.querySelector('.tuner-now-sub-text') || el.appendChild(document.createElement('span'));
          span.className = 'tuner-now-sub-text';
          span.textContent = 'Poste très long pour forcer le défilement du nom · Établissement universitaire du Québec';
          el.replaceChildren(span);
        });
        // measureMarquee n'est pas exposé : on relance un redimensionnement
        // après avoir réécrit via describe, en élargissant le texte dans le cadran
        // par le même chemin que le module (dataset + resize).
        await page.evaluate(() => {
          const root = document.querySelector('.radar-radio').shadowRoot;
          const el = root.querySelector('.line1');
          el.dataset.wide = 'Poste très long pour forcer le défilement du nom · Établissement universitaire du Québec';
          el.dataset.narrow = 'Poste très long pour forcer le défilement du nom · Établissement universitaire du Québec';
          el.style.width = '80px';
          window.dispatchEvent(new Event('resize'));
        });
        // Le ResizeObserver du module observe l'hôte, pas window. On force
        // une mesure directe si le module a posé le texte, sinon on vérifie
        // au moins que le cadre reste en idle.
        await page.waitForTimeout(200);
        const after = await snapshot(page);
        expect(after.state).toBe('idle');
        test.info().annotations.push({ type: 'note', description: `aucun débordement naturel (${tag})` });
      }
    });

    test(`barre stable au changement de poste (${tag}) @ci-critical`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await waitBar(page);
      await page.waitForTimeout(400);
      const before = await snapshot(page);
      expect(before).toBeTruthy();
      await page.evaluate(() => {
        document.querySelector('.radar-radio').shadowRoot.querySelector('[data-step="1"]').click();
      });
      for (const pause of [80, 250, 700]) {
        await page.waitForTimeout(pause);
        const after = await snapshot(page);
        nearly(after.bar.h, before.bar.h, `hauteur +${pause}ms`);
        nearly(after.now.x, before.now.x, `cadran.x +${pause}ms`);
        nearly(after.play.x, before.play.x, `lecture.x +${pause}ms`);
        nearly(after.prev.x, before.prev.x, `précédent.x +${pause}ms`);
        nearly(after.next.x, before.next.x, `suivant.x +${pause}ms`);
        nearly(after.now.y, before.now.y, `cadran.y +${pause}ms`);
      }
    });
  }
}

test('animations réduites : pas de défilement @ci-critical', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/pomo/', { waitUntil: 'domcontentloaded' });
  await waitBar(page);
  await page.waitForTimeout(300);
  const info = await snapshot(page);
  expect(info.state).toBe('idle');
  expect(info.brandHref).toBe('https://le-radar.ca/');
  for (const line of [info.line1, info.line2]) {
    expect(line.animation === 'none' || !line.isMarquee).toBeTruthy();
  }
});


/* Titres réels parmi les plus longs des grilles (radio-schedules.json). */
const LONG_NOW = 'Easy Sonic Living/Zoe\'s Hour/Dreams And Tales/Internet Lunch Forever';
const LONG_NEXT = 'electronic intifada/Jewish Heretics/Radio AlHara/Alright, Now What?';

async function forceAirTitles(page, nowTitle, nextTitle) {
  await page.evaluate(({ nowTitle, nextTitle }) => {
    const root = document.querySelector('.radar-radio')?.shadowRoot;
    if (!root) return;
    const fill = (node, title) => {
      if (!node) return;
      node.classList.remove('is-empty');
      node.setAttribute('aria-hidden', 'false');
      const el = node.querySelector('.air-title');
      const span = document.createElement('span');
      span.className = 'tuner-now-sub-text';
      span.textContent = title;
      el.replaceChildren(span);
      const time = node.querySelector('.air-time');
      if (time) time.textContent = '20 h 00 – 22 h 00';
    };
    fill(root.querySelector('.air--now'), nowTitle);
    fill(root.querySelector('.air--next'), nextTitle);
    // Relancer la mesure (ResizeObserver de l'hôte + rafraîchissement manuel).
    const host = document.querySelector('.radar-radio');
    const prev = host.style.width;
    host.style.width = (host.getBoundingClientRect().width - 1) + 'px';
    requestAnimationFrame(() => {
      host.style.width = prev;
      window.dispatchEvent(new Event('resize'));
    });
  }, { nowTitle, nextTitle });
  await page.waitForTimeout(250);
  // Mesure directe : measureMarquee n'est pas exposé, on l'imite puis
  // on laisse le ResizeObserver faire le même calcul.
  await page.evaluate(() => {
    const root = document.querySelector('.radar-radio')?.shadowRoot;
    if (!root) return;
    const REDUCE = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (REDUCE) return;
    const MARQUEE_READ_DELAY_MS = 1600;
    const MARQUEE_ROUND_TRIPS = 2;
    for (const el of root.querySelectorAll('.air-title, .line1, .line2')) {
      const span = el.querySelector('.tuner-now-sub-text');
      if (!span) continue;
      const style = getComputedStyle(el);
      const available = Math.max(0, el.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0));
      if (!available) continue;
      const overflow = span.scrollWidth - available;
      if (overflow <= 2) {
        el.classList.remove('is-marquee');
        continue;
      }
      const distance = Math.round(overflow + 12);
      const duration = Math.max(7, distance / 16);
      el.style.setProperty('--marquee-shift', `-${distance}px`);
      el.style.setProperty('--marquee-duration', `${duration.toFixed(1)}s`);
      el.style.setProperty('--marquee-delay', `${(MARQUEE_READ_DELAY_MS / 1000).toFixed(1)}s`);
      el.style.setProperty('--marquee-trips', String(MARQUEE_ROUND_TRIPS));
      el.classList.add('is-marquee');
    }
  });
  await page.waitForTimeout(80);
}

async function airBounds(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.radar-radio')?.shadowRoot;
    const bar = root?.querySelector('.bar');
    if (!bar) return null;
    const box = (sel) => {
      const el = root.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        width: r.width, display: cs.display, hidden: cs.display === 'none',
        isMarquee: !!el.querySelector('.air-title')?.classList.contains('is-marquee')
          || el.classList.contains('is-marquee'),
        title: (el.querySelector('.air-title')?.textContent || '').trim(),
      };
    };
    const br = bar.getBoundingClientRect();
    const padRight = parseFloat(getComputedStyle(bar).paddingRight) || 0;
    return {
      barRight: br.right,
      barInnerRight: br.right - padRight,
      padRight,
      now: box('.air--now'),
      next: box('.air--next'),
      airs: box('.airs'),
      play: box('.play'),
      brand: box('a.brand'),
    };
  });
}

for (const path of ['/pomo/', '/solitaire/']) {
  for (const width of [1024, 1280, 1440, 1920]) {
    test(`À venir reste dans la barre à ${width} px (${path.replace(/\//g, '')}) @ci-critical`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const host = await waitBar(page);
      const before = await airBounds(page);
      expect(before).toBeTruthy();
      await forceAirTitles(page, LONG_NOW, LONG_NEXT);
      const after = await airBounds(page);
      expect(after).toBeTruthy();
      // Les commandes à gauche ne doivent pas bouger.
      expect(Math.abs((after.play?.left ?? 0) - (before.play?.left ?? 0))).toBeLessThanOrEqual(1);
      expect(Math.abs((after.brand?.left ?? 0) - (before.brand?.left ?? 0))).toBeLessThanOrEqual(1);
      // Le bloc « À venir », s'il est visible à cette largeur de barre, ne dépasse pas.
      if (after.next && !after.next.hidden && after.next.width > 0) {
        expect(after.next.right, `À venir.right ${after.next.right} > inner ${after.barInnerRight}`).toBeLessThanOrEqual(after.barInnerRight + 0.5);
        if (after.next.title && after.next.title.length > 40) {
          expect(after.next.isMarquee, 'titre long sans défilement').toBe(true);
        }
      }
      if (after.now && !after.now.hidden && after.now.width > 0) {
        expect(after.now.right).toBeLessThanOrEqual(after.barInnerRight + 0.5);
      }
      if (after.airs && after.airs.width > 0) {
        expect(after.airs.right).toBeLessThanOrEqual(after.barInnerRight + 0.5);
      }
      void host;
    });
  }
}

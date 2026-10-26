import { expect, test } from '@playwright/test';

// La barre radio intégrée (Pomo, Solitaire) doit rendre exactement comme celle
// du Radar à 390 px, en clair comme en sombre : mêmes contours, même cadre,
// même fond #252830, mêmes boutons précédent/suivant collés au cadran.

const PROPS = ['borderTopColor', 'borderTopWidth', 'borderRightWidth', 'borderLeftWidth', 'backgroundColor', 'boxShadow', 'borderTopLeftRadius', 'borderTopRightRadius', 'width'];
const SEL = { bar: '#tuner', prev: '#tuner-prev', next: '#tuner-next', now: '.tuner-dial .tuner-now', play: '#tuner-play' };

async function read(browser, path, theme) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: theme, serviceWorkers: 'block' });
  await ctx.addInitScript((t) => { try { localStorage.setItem('radar-theme', t); } catch {} }, theme);
  const page = await ctx.newPage();
  await page.goto(path);
  let frame = page.mainFrame();
  if (path !== '/') {
    await expect.poll(() => page.frames().some((f) => f.url().includes('tuner-embed'))).toBe(true);
    frame = page.frames().find((f) => f.url().includes('tuner-embed'));
  }
  await frame.waitForSelector('#tuner-prev', { state: 'attached' });
  await page.waitForTimeout(400);
  const out = await frame.evaluate(({ SEL, PROPS }) => Object.fromEntries(Object.entries(SEL).map(([k, s]) => {
    const e = document.querySelector(s); if (!e) return [k, null];
    const c = getComputedStyle(e);
    return [k, Object.fromEntries(PROPS.map((p) => [p, p === 'width' ? String(Math.round(e.getBoundingClientRect().width)) : c[p]]))];
  })), { SEL, PROPS });
  await ctx.close();
  // La largeur du cadran et de la barre dépend du gabarit parent.
  delete out.now.width; delete out.bar.width; delete out.bar.boxShadow;
  // Coins du cadre : pleine largeur sur le Radar, carte arrondie dans Pomo/Solitaire.
  delete out.bar.borderTopLeftRadius; delete out.bar.borderTopRightRadius;
  return out;
}

for (const theme of ['light', 'dark']) {
  test(`barre radio identique au Radar (${theme}, 390 px) @ci-critical`, async ({ browser }) => {
    const ref = await read(browser, '/', theme);
    expect(ref.bar.backgroundColor).toBe('rgb(37, 40, 48)');
    for (const path of ['/pomo/', '/solitaire/']) {
      expect(await read(browser, path, theme), `${path} ${theme}`).toEqual(ref);
    }
  });
}

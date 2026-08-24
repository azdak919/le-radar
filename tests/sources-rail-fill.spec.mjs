import { expect, test } from '@playwright/test';

/**
 * Rail wide E — « Plus de sources » doit occuper l’espace jusqu’au bas
 * de la fenêtre. Régression : height:auto + max-height JS trop court
 * laissait un trou sous « Réduire ».
 */

async function expandSources(page) {
  const toggle = page.locator('#filters-toggle');
  await expect(toggle).toBeVisible({ timeout: 12_000 });
  await toggle.click();
  await expect(page.locator('#news-filters-panel')).toHaveClass(/is-expanded/);
  await expect(toggle).toContainText(/Réduire|Show less|Reducir|Reduzir/i);
}

function gapBelowToggle() {
  const toggle = document.getElementById('filters-toggle');
  if (!toggle || toggle.hidden) return Number.POSITIVE_INFINITY;
  return window.innerHeight - toggle.getBoundingClientRect().bottom;
}

test('wide E : Réduire s’aligne sur le bas de la fenêtre', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?wide=e', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#wide-rail-stack')).toBeVisible({ timeout: 12_000 });
  await expandSources(page);

  await expect.poll(async () => page.evaluate(gapBelowToggle), { timeout: 8_000 })
    .toBeLessThanOrEqual(36);

  const atTop = await page.evaluate(gapBelowToggle);
  expect(atTop, `trou sous Réduire en haut de page (${Math.round(atTop)} px)`).toBeLessThanOrEqual(36);

  await page.evaluate(() => window.scrollTo(0, 480));
  await expect.poll(async () => page.evaluate(gapBelowToggle), { timeout: 8_000 })
    .toBeLessThanOrEqual(96);

  const scrolled = await page.evaluate(gapBelowToggle);
  expect(scrolled, `trou sous Réduire après scroll (${Math.round(scrolled)} px)`).toBeLessThanOrEqual(96);
  await expect(page.locator('#filters-toggle')).toBeVisible();
});

test('wide E 1440 : le rail ouvert remplit aussi un laptop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?wide=e', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#wide-rail-stack')).toBeVisible({ timeout: 12_000 });
  await expandSources(page);

  await expect.poll(async () => page.evaluate(gapBelowToggle), { timeout: 8_000 })
    .toBeLessThanOrEqual(96);

  const gap = await page.evaluate(gapBelowToggle);
  expect(gap, `trou sous Réduire à 1440 (${Math.round(gap)} px)`).toBeLessThanOrEqual(96);
});

function filtersSnapshot() {
  const panel = document.getElementById('news-filters-panel');
  const list = document.getElementById('news-filters');
  const toggle = document.getElementById('filters-toggle');
  if (!panel || !list) {
    return { ready: false };
  }
  const listBox = list.getBoundingClientRect();
  const visible = [...list.querySelectorAll('.filter-btn')].filter((btn) => {
    const r = btn.getBoundingClientRect();
    return r.top < listBox.bottom - 4 && r.bottom > listBox.top + 4;
  }).length;
  return {
    ready: true,
    stack: !!document.getElementById('wide-rail-stack'),
    expanded: panel.classList.contains('is-expanded'),
    inlineH: panel.style.getPropertyValue('--filters-collapsed-h'),
    peek: panel.style.getPropertyValue('--filters-peek'),
    listH: Math.round(listBox.height),
    visible,
    total: list.querySelectorAll('.filter-btn').length,
    toggleHidden: !!toggle?.hidden,
    toggleInlineW: toggle?.style.width || '',
    toggleW: toggle ? Math.round(toggle.getBoundingClientRect().width) : 0,
    panelW: Math.round(panel.getBoundingClientRect().width),
    label: (toggle?.innerText || '').replace(/\s+/g, ' ').trim(),
  };
}

test('1920 → demi-écran : les sources se replient, la pilule n’est plus celle du rail', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#wide-rail-stack')).toBeVisible({ timeout: 12_000 });
  await expect(page.locator('#news-filters .filter-btn').nth(8)).toBeVisible();
  await expect(page.locator('#filters-toggle')).toBeVisible();

  await page.setViewportSize({ width: 960, height: 1080 });
  await expect.poll(async () => page.evaluate(() => !!document.getElementById('wide-rail-stack')), {
    timeout: 4_000,
  }).toBe(false);

  await expect.poll(async () => {
    const snap = await page.evaluate(filtersSnapshot);
    return snap.ready && !snap.stack && snap.inlineH === '' && snap.visible > 0 && snap.visible < snap.total;
  }, { timeout: 6_000 }).toBe(true);

  const after = await page.evaluate(filtersSnapshot);
  expect(after.inlineH, 'hauteur du rail E encore en inline').toBe('');
  expect(after.peek, 'peek du rail E encore en inline').toBe('');
  expect(after.expanded, 'reste ouvert comme le rail').toBe(false);
  expect(after.toggleHidden, 'Plus de sources disparu').toBe(false);
  expect(after.label).toMatch(/Plus de sources|More sources|Más fuentes|Mais fontes/i);
  expect(after.total, 'pastilles trop peu nombreuses pour le test').toBeGreaterThan(6);
  expect(after.visible, `toutes les sources encore visibles (${after.visible}/${after.total})`)
    .toBeLessThanOrEqual(6);
  expect(after.listH, `liste trop haute après repli (${after.listH} px)`).toBeLessThan(120);
  expect(after.toggleInlineW, 'largeur du rail encore sur la pilule').toBe('');
  expect(after.toggleW, `pilule trop étroite (${after.toggleW} / ${after.panelW})`)
    .toBeGreaterThan(after.panelW * 0.8);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(async () => page.evaluate(() => !!document.getElementById('wide-rail-stack')), {
    timeout: 4_000,
  }).toBe(true);
  await expect(page.locator('#filters-toggle')).toBeVisible();
});

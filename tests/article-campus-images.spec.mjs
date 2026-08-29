import { expect, test } from '@playwright/test';

async function waitForNewsReady(page) {
  await expect.poll(async () => page.locator('#news-list').getAttribute('data-ready'), {
    timeout: 20_000,
  }).toBe('1');
  await expect(page.locator('#news-list .article').first()).toBeVisible();
}

async function openSource(page, name) {
  const toggle = page.locator('#filters-toggle');
  if (await toggle.isVisible()) {
    const expanded = await toggle.getAttribute('aria-expanded');
    const label = (await toggle.textContent() || '');
    if (expanded !== 'true' && /Plus de sources|More sources/i.test(label)) {
      await toggle.click();
    }
  }
  const btn = page.locator('#news-filters [data-source]').filter({ hasText: name }).first();
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.click();
  await expect.poll(async () => {
    return page.locator('#news-list .article .article-source').first().textContent();
  }, { timeout: 10_000 }).toMatch(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

test('accueil hydrate le fil sans erreur JS', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForNewsReady(page);
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  await expect(page.locator('#news-list .article.has-image').first()).toBeVisible({ timeout: 15_000 });
});

test('Sans fin(s) : illustration d’article, pas le pavillon campus', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForNewsReady(page);

  const present = await page.evaluate(async () => {
    const res = await fetch('news.json', { cache: 'no-cache' });
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || []);
    return items.some((it) => /Sans fin/i.test(it.title || ''));
  });
  test.skip(!present, 'Sans fin(s) plus dans news.json');

  await openSource(page, "L'Exemplaire");
  await waitForNewsReady(page);
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);

  const card = page.locator('#news-list .article').filter({ hasText: /Sans fin/ }).first();
  await expect(card, 'carte Sans fin(s) absente').toBeVisible({ timeout: 15_000 });
  await expect(card).toHaveClass(/has-image/, { timeout: 20_000 });
  const src = (await card.locator('.article-media img').getAttribute('src')) || '';
  expect(src, 'src campus Wikimedia').not.toMatch(/wikimedia|upload\.wikimedia/i);
  expect(src, 'src illustration Exemplaire').toMatch(
    /Illustration-recadree|i0\.wp\.com|exemplaire\.com\.ulaval/i,
  );
  const credit = (await card.locator('.article-media').innerText()) || '';
  expect(credit, 'crédit Cephas campus').not.toMatch(/Cephas/i);
});

test('L\'Exemplaire : une + Skibidi ont une photo (source ou campus)', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForNewsReady(page);
  await openSource(page, "L'Exemplaire");
  await waitForNewsReady(page);
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);

  const lead = page.locator('#news-list .news-hero .article').first();
  await expect(lead).toHaveClass(/has-image/, { timeout: 15_000 });
  const leadW = await lead.locator('.article-media img').evaluate((el) => el.naturalWidth || 0);
  expect(leadW, 'une L’Exemplaire sans pixels').toBeGreaterThan(80);

  const skibidi = page.locator('#news-list .article').filter({ hasText: 'Skibidi' }).first();
  await expect(skibidi, 'carte Skibidi absente').toBeVisible();
  await expect(skibidi).toHaveClass(/has-image/, { timeout: 15_000 });
  const w = await skibidi.locator('.article-media img').evaluate((el) => el.naturalWidth || 0);
  expect(w, 'Skibidi sans photo campus/source').toBeGreaterThan(80);
});

test('Le Collectif : photos d’article, pas le campus UdeS', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForNewsReady(page);

  const present = await page.evaluate(async () => {
    const res = await fetch('news.json', { cache: 'no-cache' });
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || []);
    return items.filter((it) => it.source === 'Le Collectif' && /élections provinciales 2026/i.test(it.title || ''));
  });
  test.skip(present.length < 2, 'unes Collectif élections plus dans news.json');

  await openSource(page, 'Le Collectif');
  await waitForNewsReady(page);
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);

  for (const needle of [/Saint-François/, /choix du PQ/]) {
    const card = page.locator('#news-list .article').filter({ hasText: needle }).first();
    await expect(card, `carte ${needle} absente`).toBeVisible({ timeout: 15_000 });
    await expect(card).toHaveClass(/has-image/, { timeout: 20_000 });
    const src = (await card.locator('.article-media img').getAttribute('src')) || '';
    expect(src, 'src campus Wikimedia à la place de la photo d’article').not.toMatch(
      /wikimedia|upload\.wikimedia/i,
    );
    expect(src, 'src photo Le Collectif').toMatch(/lecollectif\.ca/i);
    const credit = (await card.locator('.article-media').innerText()) || '';
    expect(credit, 'crédit campus Uncivil Fire').not.toMatch(/Uncivil Fire|Wikimedia Commons/i);
  }
});

test('article sans photo source : campus de l’établissement', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForNewsReady(page);

  const sample = await page.evaluate(async () => {
    const res = await fetch('news.json', { cache: 'no-cache' });
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || []);
    const empty = items.find((it) => !String(it.image || '').trim() && it.institution && it.source);
    return empty
      ? { source: empty.source, institution: empty.institution, title: empty.title }
      : null;
  });

  test.skip(!sample, 'aucun article sans image source dans news.json');

  await openSource(page, sample.source);
  await waitForNewsReady(page);

  const needle = sample.title.slice(0, 28);
  const card = page.locator('#news-list .article').filter({ hasText: needle }).first();
  await expect(card, `carte introuvable pour « ${needle} »`).toBeVisible({ timeout: 15_000 });
  await expect(card).toHaveClass(/has-image/, { timeout: 15_000 });
  const w = await card.locator('.article-media img').evaluate((el) => el.naturalWidth || 0);
  expect(w, 'campus / stock trop étroit').toBeGreaterThan(80);
});

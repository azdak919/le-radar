import { expect, test } from '@playwright/test';

/* Les cartes de l’app reprennent l’ordre des blocs du site
   (scripts/article-card-lib.js) : une, vedettes, suite du fil. */
const SLOTS = ['article-eyebrow', 'article-meta', 'article-title', 'article-byline', 'article-media', 'article-brief'];

async function order(page, selector) {
  return page.$eval(selector, (node, slots) => [...node.children]
    .map((child) => slots.find((name) => child.classList.contains(name)))
    .filter(Boolean), SLOTS);
}

test('cartes app : même ordre des blocs que le site @ci-critical', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.article--lead').first()).toBeVisible({ timeout: 20000 });
  const site = {
    lead: await order(page, '.article--lead'),
    feature: await order(page, '.article--feature'),
  };
  const siteStandard = await page.$$eval('.article--standard', (nodes, slots) => nodes
    .map((node) => ({
      media: Boolean(node.querySelector(':scope > .article-media')),
      seq: [...node.children].map((c) => slots.find((n) => c.classList.contains(n))).filter(Boolean),
    })), SLOTS);

  await page.goto('/mobile/app/#/accueil', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.card-site .article--lead')).toBeVisible();
  const lead = await order(page, '.card-site .article--lead');
  const feature = await order(page, '.card-site .article--feature');
  const appStandard = await page.$$eval('.card-site .article--standard', (nodes, slots) => nodes
    .map((node) => ({
      media: Boolean(node.querySelector(':scope > .article-media')),
      seq: [...node.children].map((c) => slots.find((n) => c.classList.contains(n))).filter(Boolean),
    })), SLOTS);

  // La byline peut manquer (auteur inconnu) : on compare l’ordre relatif.
  const sameOrder = (app, ref) => expect(app).toEqual(ref.filter((slot) => app.includes(slot)));
  expect(lead[0]).toBe('article-eyebrow');
  sameOrder(lead, site.lead);
  sameOrder(feature, site.feature);
  const ref = siteStandard.find((entry) => entry.media) || siteStandard[0];
  const app = appStandard.find((entry) => entry.media === ref.media) || appStandard[0];
  sameOrder(app.seq, ref.seq);
  if (ref.media) expect(app.seq.indexOf('article-media')).toBeLessThan(app.seq.indexOf('article-title'));
  await expect(page.locator('.card-site .article--lead .article-more')).toContainText(/Lire la suite|Read more/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});

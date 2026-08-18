import { expect, test } from '@playwright/test';

/**
 * Magazine « mid » (rail En bref à droite) sur tablette et demi-écran.
 *
 * Le seuil était à 900 px, ce qui excluait presque tous les iPad en portrait :
 * 768 (mini / 9,7"), 820 (Air 11"), 834 (Pro 11") tombaient dans la mise en
 * page téléphone, et seul le Pro 12,9" (1024) voyait le rail. Aucun test ne
 * couvrait ces largeurs — la suite ne mesurait que 390 et 1440 px.
 */
const MID_WIDTHS = [
  { width: 768, height: 1024, label: 'iPad mini / 9,7" portrait' },
  { width: 820, height: 1180, label: 'iPad Air 11" portrait' },
  { width: 834, height: 1194, label: 'iPad Pro 11" portrait' },
  { width: 1024, height: 1366, label: 'iPad Pro 12,9" portrait' },
  { width: 960, height: 900, label: 'demi-écran laptop' },
];

for (const { width, height, label } of MID_WIDTHS) {
  test(`magazine mid : rail En bref à ${width} px (${label})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const list = page.locator('.news-list');
    await expect(list).toBeVisible();

    const layout = await list.evaluate((el) => {
      const cs = getComputedStyle(el);
      const cols = cs.gridTemplateColumns.split(' ').filter(Boolean);
      return { display: cs.display, colonnes: cols.length, pistes: cols };
    });
    expect(layout.display, 'la liste doit être une grille, pas un empilement').toBe('grid');
    expect(layout.colonnes, `deux pistes attendues (${layout.pistes.join(' ')})`).toBe(2);

    // Le rail garde une largeur lisible et la une n'est pas écrasée.
    const [heroBox, railBox] = await Promise.all([
      page.locator('.news-hero').boundingBox(),
      page.locator('.brief-rail').first().boundingBox(),
    ]);
    expect(railBox.width).toBeGreaterThanOrEqual(200);
    expect(heroBox.width).toBeGreaterThan(railBox.width * 1.2);

    // Rien ne sort du viewport : c'est le risque quand on descend un seuil.
    const overflow = await page.evaluate(
      () => document.scrollingElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, 'débordement horizontal').toBeLessThanOrEqual(1);
  });
}

test('magazine mid : le téléphone garde l’empilement une colonne', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const list = page.locator('.news-list');
  await expect(list).toBeVisible();
  await expect(list).toHaveCSS('display', 'block');
});

for (const { width, height, label } of [
  { width: 1440, height: 900, label: 'bureau auto E' },
  { width: 1920, height: 1080, label: 'wide auto E' },
]) {
  test(`magazine ${label} : fraîcheur + sources avant un 2ᵉ d’institution`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.news-hero .article').first()).toBeVisible({ timeout: 12_000 });
    await expect(page.locator('.brief-rail .article--compact').first()).toBeVisible();
    await page.waitForTimeout(400);

    const data = await page.evaluate(() => {
      const pack = (el) => {
        const it = el.__radarItem;
        if (it) {
          return {
            href: it.link || '',
            date: it.date || '',
            source: it.source || '',
            inst: it.institution || it.source || '',
          };
        }
        return {
          href: el.getAttribute('href') || '',
          date: el.querySelector('time')?.dateTime || '',
          source: el.querySelector('.article-source')?.textContent?.trim() || '',
          inst: el.querySelector('.article-inst')?.textContent?.trim() || '',
        };
      };
      return {
        hero: [...document.querySelectorAll('.news-hero .article')].map(pack),
        brief: [...document.querySelectorAll('.brief-rail .article--compact')].map(pack),
        tail: [...document.querySelectorAll('.news-tail .article')].map(pack),
      };
    });

    const hrefs = [...data.hero, ...data.brief, ...data.tail].map((a) => a.href).filter(Boolean);
    expect(new Set(hrefs).size, `${label} : pas de doublon une/bref/suite`).toBe(hrefs.length);

    const ts = (d) => new Date(d).getTime() || 0;
    for (let i = 1; i < data.hero.length; i += 1) {
      expect(ts(data.hero[i - 1].date), `${label} : une+vedettes date desc`)
        .toBeGreaterThanOrEqual(ts(data.hero[i].date));
    }
    const oldestHero = ts(data.hero.at(-1)?.date);
    for (const a of [...data.brief, ...data.tail]) {
      if (!a.date || !oldestHero) continue;
      expect(ts(a.date), `${label} : rien de plus frais que la dernière vedette`)
        .toBeLessThanOrEqual(oldestHero);
    }

    const magSources = new Set(
      [...data.hero, ...data.brief].map((a) => a.source).filter(Boolean),
    );
    const instCount = new Map();
    for (const a of [...data.hero, ...data.brief]) {
      const inst = a.inst || a.source;
      if (!inst) continue;
      instCount.set(inst, (instCount.get(inst) || 0) + 1);
    }
    const extras = data.brief.filter((a) => (instCount.get(a.inst || a.source) || 0) >= 2);
    for (const extra of extras) {
      const newerUncovered = data.tail.filter((t) => (
        t.source
        && !magSources.has(t.source)
        && ts(t.date) > ts(extra.date)
      ));
      expect(
        newerUncovered,
        `${label} : source absente plus fraîche que le 2ᵉ titre (${extra.inst})`,
      ).toEqual([]);
    }
  });
}

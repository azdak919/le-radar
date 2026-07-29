import { expect, test } from '@playwright/test';

/**
 * Pages d'entités (générées par scripts/seo-pages.js).
 *
 * L'intégrité statique vérifie déjà le balisage ; ici on vérifie ce qu'elle ne
 * peut pas voir : qu'une personne — ou un robot qui suit les liens — atteint
 * réellement ces pages depuis l'accueil, et qu'elles restent lisibles quand
 * JavaScript ne s'exécute pas.
 */

/*
 * `domcontentloaded` et non `load` sur l'accueil : `load` attend la photo
 * Wikimedia du mât (plusieurs Mo, hôte externe) et le script umami. Ces tests
 * ne cliquent que des liens du pied de page, déjà présents dans le HTML
 * prérendu — attendre des ressources externes ne prouvait rien et faisait
 * dépasser les 30 s sous un runner chargé. Les fiches statiques (/radios/…)
 * gardent `load` : elles ne chargent rien d'externe.
 */
test('depuis l’accueil, on atteint l’annuaire puis une fiche de journal', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await page.getByRole('link', { name: 'Tous les médias étudiants du Québec' }).click();
  await expect(page).toHaveURL(/\/medias\/$/);
  await expect(page.locator('h1')).toHaveText('Les médias étudiants du Québec');

  await page.getByRole('link', { name: /Quartier Libre/ }).first().click();
  await expect(page).toHaveURL(/\/journaux\/quartier-libre\/$/);
  await expect(page.locator('h1')).toHaveText('Quartier Libre');
  await expect(page.locator('.seo-facts')).toContainText('Université de Montréal');
});

test('une fiche de radio expose ses faits et renvoie vers les autres horaires', async ({ page }) => {
  await page.goto('/radios/chyz/', { waitUntil: 'load' });

  await expect(page.locator('h1')).toContainText('CHYZ');
  await expect(page.locator('.seo-facts')).toContainText('94,3 FM');
  await expect(page.locator('.seo-facts')).toContainText('Université Laval');
  await expect(page.getByRole('link', { name: 'Ville de Québec — site officiel' }))
    .toHaveAttribute('href', 'https://www.ville.quebec.qc.ca/?lang=fr');
  await expect(page.getByRole('link', { name: 'Tourisme Capitale-Nationale — site officiel' }))
    .toHaveAttribute('href', 'https://www.quebec-cite.com/fr');
  await expect(page.locator('.seo-slot--live.seo-slot--playing')).toHaveCount(0);
  const schedulesLink = page.getByRole('link', { name: 'Choisir une autre radio' });
  await expect(schedulesLink).toBeVisible();
  await expect(schedulesLink).toHaveAttribute('href', '../../horaires/');

  // Le lien vers l'établissement doit résoudre, pas juste exister.
  await page.getByRole('link', { name: 'Université Laval' }).first().click();
  await expect(page).toHaveURL(/\/etablissements\/universite-laval\/$/);
});

test('sur une fiche SEO, play démarre le flux (CSP media-src)', async ({ page }) => {
  const cspBlocks = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (/Content Security Policy|violates.*media|Loading media/i.test(text)) cspBlocks.push(text);
  });

  // CSP figée dans le HTML : sans media-src https:, default-src 'self' refuse
  // les Icecast distants → play silencieux sur les fiches SEO (repro 2026-07-29).
  await page.goto('/radios/chyz/', { waitUntil: 'domcontentloaded' });
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp || '').toMatch(/media-src[^;]*https:/);

  await expect.poll(async () => page.locator('#tuner-select option').count(), { timeout: 15_000 })
    .toBeGreaterThan(1);

  // Un seul geste utilisateur : le change du <select> autoplay déjà le flux.
  // Un second clic sur ▶ pendant le tamponnage l’annulerait (comportement voulu).
  await page.locator('#tuner-select').selectOption('cism');

  await expect.poll(async () => {
    return page.locator('#radar-player').evaluate((a) => ({
      src: a.src || '',
      paused: a.paused,
      ct: a.currentTime,
    }));
  }, { timeout: 12_000 }).toMatchObject({
    src: expect.stringMatching(/cism|ustream|stream/i),
  });

  const state = await page.locator('#radar-player').evaluate((a) => ({
    paused: a.paused,
    ct: a.currentTime,
    rs: a.readyState,
  }));
  expect(state.paused === false || state.rs > 0 || state.ct > 0).toBe(true);
  expect(cspBlocks.join('\n')).not.toMatch(/Loading media.*violates/i);
});

test('une fiche de journal garde byline, bref et fraîcheur factuelle', async ({ page }) => {
  await page.goto('/journaux/la-pige/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.seo-headlines__status')).toContainText('Dernier article :');
  await expect(page.locator('.seo-headline__by').first()).toHaveText(/^Par /);
  await expect(page.locator('.seo-headline time').first()).toContainText(/\d{4}-\d{2}-\d{2} · \d{1,2} h \d{2}/);
  await expect(page.locator('.seo-headline__brief').first()).not.toBeEmpty();
  expect(await page.locator('.seo-headline__brief').allTextContents()).not.toContainEqual(expect.stringMatching(/Crédit photo/i));
  await expect(page.getByRole('link', { name: 'Lire la suite →' }).first()).toHaveAttribute('href', /^https:\/\//);
  await expect(page.getByRole('link', { name: 'Voir tous les articles de La Pige' }))
    .toHaveAttribute('href', '../../?source=La%20Pige#news-list');
  await expect(page.locator('.seo-cta--source')).toHaveCSS('text-align', 'left');
  await expect(page.locator('.seo-cta--source')).toHaveCSS('margin-top', '22px');
  const rulesAlign = await page.evaluate(() => {
    const headline = document.querySelector('.seo-headlines > li:last-child');
    const footer = document.querySelector('.site-foot');
    const inset = parseFloat(getComputedStyle(footer, '::before').left);
    const headlineRect = headline.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    return {
      headlineLeft: headlineRect.left,
      headlineRight: headlineRect.right,
      footerRuleLeft: footerRect.left + inset,
      footerRuleRight: footerRect.right - inset,
    };
  });
  expect(rulesAlign.footerRuleLeft).toBeCloseTo(rulesAlign.headlineLeft, 1);
  expect(rulesAlign.footerRuleRight).toBeCloseTo(rulesAlign.headlineRight, 1);
});

test('un journal francophone garde son nom sans pseudo-slogan traduit', async ({ page }) => {
  await page.goto('/en/newspapers/quartier-libre/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toHaveText('Quartier Libre');
});

test('le retour d’une fiche journal active son filtre source sur l’accueil', async ({ page }) => {
  await page.goto('/?source=La%20Pige#news-list', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.filter-btn.active')).toHaveAttribute('data-source', 'La Pige');
  await expect(page.locator('#news-list .article')).not.toHaveCount(0);
  await expect(page.locator('#news-list .article').first()).toContainText('La Pige');
});

test('les cartes d’articles affichent aussi leur heure de publication', async ({ page }) => {
  await page.goto('/?source=La%20Pige', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#news-list .article-time').first()).toHaveText(/\d{1,2} h \d{2}/);
});

test('chaque filtre source expose tous ses articles, même hors de la fenêtre de fraîcheur', async ({ page }) => {
  const expectedBySource = await page.request.get('/news.json').then(async (response) => {
    const data = await response.json();
    return data.items.reduce((counts, item) => {
      counts[item.source] = (counts[item.source] || 0) + 1;
      return counts;
    }, {});
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  for (const [source, expected] of Object.entries(expectedBySource)) {
    // Le clic synthétique déclenche exactement le gestionnaire du filtre sans
    // attendre que les images externes déplacent la grille entre 14 sources.
    // Un autre test couvre déjà le clic Playwright de la navigation source.
    await page.locator(`.filter-btn[data-source=${JSON.stringify(source)}]`).evaluate((button) => button.click());
    await expect.poll(
      async () => page.locator('#news-list .article').count(),
      { message: `${source} doit garder tous ses articles` },
    ).toBe(expected);
  }
});

test('une vue source remplit En bref sans dépasser la colonne une et vedettes', async ({ page }) => {
  await page.setViewportSize({ width: 1206, height: 812 });
  await page.goto('/?source=La%20Pige', { waitUntil: 'domcontentloaded' });

  // Les images et les fontes peuvent se résoudre après la première passe de
  // rendu. Attendre l'état équilibré (et non une durée arbitraire) reproduit
  // la perception réelle : aucune colonne ne doit finir plus longue.
  const readBounds = () => page.evaluate(() => {
    const lastBottom = (selector) => {
      const cards = [...document.querySelectorAll(selector)];
      return cards.at(-1)?.getBoundingClientRect().bottom ?? 0;
    };
    return {
      hero: lastBottom('.news-hero > .article'),
      brief: lastBottom('.brief-rail > .article'),
      briefCount: document.querySelectorAll('.brief-rail .article').length,
      tailCount: document.querySelectorAll('.news-tail .article').length,
    };
  });

  await expect.poll(async () => {
    const bounds = await readBounds();
    return bounds.briefCount >= 2
      && bounds.briefCount + bounds.tailCount === 7
      && bounds.brief <= bounds.hero + 1;
  }, { timeout: 15_000 }).toBe(true);

  const bounds = await readBounds();
  expect(bounds.briefCount).toBeGreaterThanOrEqual(2);
  expect(bounds.briefCount + bounds.tailCount).toBe(7);
  expect(bounds.brief).toBeLessThanOrEqual(bounds.hero + 1);
  expect(bounds.hero - bounds.brief).toBeLessThanOrEqual(96);
});

test('depuis l’accueil, on atteint le hub des horaires puis une grille complète', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await page.getByRole('link', { name: 'Les horaires des radios étudiantes' }).click();
  await expect(page).toHaveURL(/\/horaires\/$/);
  await expect(page.locator('h1')).toHaveText('Les horaires des radios étudiantes du Québec');

  // Une carte par station, avec le volume réel de sa grille.
  await expect(page.locator('.seo-card')).not.toHaveCount(0);
  await page.getByRole('link', { name: /CKUT/ }).first().click();
  await expect(page).toHaveURL(/\/radios\/ckut\/#horaire$/);

  // La semaine entière, pas les 8 premiers créneaux d'un jour.
  await expect(page.locator('.seo-day')).toHaveCount(7);
  const slots = await page.locator('.seo-day li').count();
  expect(slots, 'grille CKUT tronquée').toBeGreaterThan(60);
  // Plage complète : une heure de début seule ne dit pas la durée.
  await expect(page.locator('.seo-slot__time').first()).toContainText('–');
});

test('le volet anglais est atteignable et jamais imposé', async ({ page }) => {
  // Navigateur en espagnol : on ne doit PAS être redirigé vers /en/.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/$/);
  expect(new URL(page.url()).pathname).not.toContain('/en/');

  await page.getByRole('link', { name: 'English', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-CA');
});

test('les fiches restent lisibles sans JavaScript', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/journaux/le-delit/', { waitUntil: 'domcontentloaded' });

  const text = await page.locator('body').innerText();
  expect(text.length).toBeGreaterThan(400);
  expect(text).toContain('Le Délit');
  // Des manchettes réelles, avec leur lien vers la source d'origine.
  const external = await page.locator('.seo-headline a').count();
  expect(external).toBeGreaterThan(0);
  await ctx.close();
});

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

  // Le libellé du menu de sections a été raccourci (« Tous les médias
  // étudiants du Québec » → « Médias »). On vise le menu de sections plutôt
  // que la page entière : chaque libellé existe aussi dans le pied de page.
  await page.locator('.site-sections').getByRole('link', { name: 'Médias', exact: true }).click();
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
  const scheduleMeta = page.locator('.seo-schedule-meta');
  await expect(scheduleMeta).toContainText('Semaine du');
  await expect(scheduleMeta).toContainText('MAJ le');
  await expect(scheduleMeta).not.toContainText('collecte réussie');

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
  await expect(page.getByRole('link', { name: 'Voir les articles les plus récents' }))
    .toHaveAttribute('href', '../../?source=La%20Pige#news-list');
  await expect(page.getByRole('link', { name: 'Voir les archives' }))
    .toHaveAttribute('href', '../../archives/la-pige/');
  await expect(page.locator('.seo-source-actions')).toBeVisible();
  await expect(page.locator('.seo-source-actions .seo-cta--source').first()).toHaveCSS('text-align', 'left');
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

  // 108 = AVG_BRIEF_CARD_H : granularité d’une fiche compacte.
  // Avec cartes grille ~200 px, retirer la dernière pour coller exact peut
  // laisser un trou > 108 sous la une ; l’équilibre source préfère alors un
  // léger dépassement En bref (< ½ carte) plutôt qu’un grand vide.
  const MAX_RESIDUAL_GAP = 108;
  const MAX_BRIEF_OVERSHOOT = 72;
  await expect.poll(async () => {
    const bounds = await readBounds();
    return bounds.briefCount >= 2
      && bounds.briefCount + bounds.tailCount === 7
      && bounds.brief <= bounds.hero + MAX_BRIEF_OVERSHOOT
      && (bounds.hero - bounds.brief) <= MAX_RESIDUAL_GAP;
  }, { timeout: 15_000 }).toBe(true);

  const bounds = await readBounds();
  expect(bounds.briefCount).toBeGreaterThanOrEqual(2);
  expect(bounds.briefCount + bounds.tailCount).toBe(7);
  expect(bounds.brief).toBeLessThanOrEqual(bounds.hero + MAX_BRIEF_OVERSHOOT);
  expect(bounds.hero - bounds.brief).toBeLessThanOrEqual(MAX_RESIDUAL_GAP);
});

test('wide E : Le Radar défile avec les sources ; En bref comble le vide', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?wide=e', { waitUntil: 'domcontentloaded' });

  const allBtn = page.locator('.filter-btn--all').first();
  await expect(allBtn).toBeVisible({ timeout: 10_000 });
  const pos = await allBtn.evaluate((el) => getComputedStyle(el).position);
  expect(pos).not.toBe('sticky');

  const toggle = page.locator('.filters-toggle');
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(page.locator('#news-filters-panel')).toHaveClass(/is-expanded/);
    const list = page.locator('#news-filters, .filters').first();
    const before = await allBtn.evaluate((el) => el.getBoundingClientRect().top);
    await list.evaluate((el) => { el.scrollTop = 80; });
    const after = await allBtn.evaluate((el) => el.getBoundingClientRect().top);
    expect(after).toBeLessThan(before - 20);
  }

  await page.goto('/?wide=e&source=Le%20Polyscope', { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.locator('.brief-rail .article--compact').count(), { timeout: 12_000 })
    .toBeGreaterThan(0);
  await page.waitForTimeout(400);
  const gap = await page.evaluate(() => {
    const last = (sel) => {
      const cards = [...document.querySelectorAll(sel)];
      return cards.at(-1)?.getBoundingClientRect().bottom ?? 0;
    };
    return last('.news-hero > .article') - last('.brief-rail > .article');
  });
  expect(gap, `vide sous En bref trop grand (${Math.round(gap)} px)`).toBeLessThan(220);
});

test('wide E : En bref ne dépasse pas la une (1920) et complète la rangée (3840)', async ({ page }) => {
  const measure = async (width) => {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto('/?wide=e', { waitUntil: 'domcontentloaded' });
    await expect.poll(async () => page.locator('.brief-rail .article--compact').count(), { timeout: 12_000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(500);
    return page.evaluate(() => {
      const last = (sel) => {
        const cards = [...document.querySelectorAll(sel)];
        return cards.at(-1)?.getBoundingClientRect().bottom ?? 0;
      };
      const cols = getComputedStyle(document.querySelector('.brief-rail'))
        .gridTemplateColumns.split(' ').filter(Boolean).length;
      const n = document.querySelectorAll('.brief-rail .article--compact').length;
      return {
        overshoot: last('.brief-rail > .article') - last('.news-hero > .article'),
        gap: last('.news-hero > .article') - last('.brief-rail > .article'),
        cols,
        n,
      };
    });
  };

  const at1920 = await measure(1920);
  expect(at1920.overshoot, `1920 : En bref trop bas (${Math.round(at1920.overshoot)} px)`).toBeLessThanOrEqual(28);
  if (at1920.cols >= 2) {
    expect(at1920.n % at1920.cols, '1920 : rangée En bref incomplète et trop haute').toBe(0);
  }

  const at3840 = await measure(3840);
  expect(at3840.overshoot, `3840 : En bref trop bas (${Math.round(at3840.overshoot)} px)`).toBeLessThanOrEqual(28);
  if (at3840.cols >= 2 && at3840.gap > 28) {
    expect(at3840.n % at3840.cols, '3840 : il manque des cartes pour finir la rangée').toBe(0);
  }
});

test('wide E 3840 : 3 unes, 6 vedettes en 3 col, En bref 2 col', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 1600 });
  await page.goto('/?wide=e', { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.locator('.news-hero .article--lead').count(), { timeout: 12_000 })
    .toBe(3);
  await expect(page.locator('.news-hero')).toHaveAttribute('data-leads', '3');
  await expect.poll(async () => page.locator('.news-hero .article--feature').count(), { timeout: 8_000 })
    .toBe(6);
  const { briefCols, featCols, leadCols } = await page.locator('.news-hero').evaluate((hero) => {
    const tops = (sel) => {
      const els = [...hero.querySelectorAll(sel)];
      if (!els.length) return 0;
      const first = els[0].getBoundingClientRect().top;
      return els.filter((el) => Math.abs(el.getBoundingClientRect().top - first) < 8).length;
    };
    const brief = document.querySelector('.brief-rail');
    return {
      leadCols: tops('.article--lead'),
      featCols: tops('.article--feature'),
      briefCols: brief
        ? getComputedStyle(brief).gridTemplateColumns.split(' ').filter(Boolean).length
        : 0,
    };
  });
  expect(leadCols, 'À la une doit rester 3 colonnes à 3840').toBe(3);
  expect(featCols, 'Vedettes doivent passer à 3 colonnes à 3840').toBe(3);
  expect(briefCols, 'En bref doit rester 2 colonnes à 3840').toBe(2);
});

test('depuis l’accueil, on atteint le hub des horaires puis une grille complète', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Idem : « Les horaires des radios étudiantes » → « Radios » dans le menu
  // de sections. Le libellé long ne survit que dans les fils d'Ariane.
  await page.locator('.site-sections').getByRole('link', { name: 'Radios', exact: true }).click();
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

test('wide E : faits packés et footer en colonnes, pas étalés', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto('/radios/ckut/?wide=e', { waitUntil: 'domcontentloaded' });

  const facts = page.locator('.seo-facts');
  await expect(facts).toBeVisible();
  const factsBox = await facts.boundingBox();
  const wireBox = await page.locator('.seo-wire').boundingBox();
  expect(factsBox, 'bandeau faits').toBeTruthy();
  expect(wireBox, 'colonne seo').toBeTruthy();
  expect(factsBox.width).toBeLessThan(wireBox.width * 0.72);

  const factWidths = await page.locator('.seo-fact').evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().width)),
  );
  expect(Math.max(...factWidths)).toBeLessThan(320);

  const foot = page.locator('.site-foot');
  await expect(foot).toBeVisible();
  const display = await foot.evaluate((el) => getComputedStyle(el).display);
  expect(display).toBe('grid');
  const cols = await foot.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);
  expect(cols).toBeGreaterThanOrEqual(2);
});

test('wide E : footer en 2 colonnes, liens en ligne, crédits à droite', async ({ page }) => {
  for (const path of ['/?wide=e', '/sports/?wide=e', '/medias/?wide=e', '/kit-media/?wide=e']) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const foot = page.locator('.site-foot').first();
    await expect(foot).toBeVisible();
    const layout = await foot.evaluate((el) => {
      const cs = getComputedStyle(el);
      const brand = el.querySelector('.site-foot__brand');
      const links = el.querySelector('.site-foot__links');
      const credit = el.querySelector('.site-foot__credit');
      const br = brand?.getBoundingClientRect();
      const lr = links?.getBoundingClientRect();
      const cr = credit?.getBoundingClientRect();
      const dir = links ? getComputedStyle(links).flexDirection : '';
      return {
        display: cs.display,
        cols: cs.gridTemplateColumns.split(' ').filter(Boolean).length,
        brandX: br ? Math.round(br.x) : null,
        linksX: lr ? Math.round(lr.x) : null,
        creditX: cr ? Math.round(cr.x) : null,
        flexDir: dir,
      };
    });
    expect(layout.display, `${path} : grille`).toBe('grid');
    expect(layout.cols, `${path} : 2 pistes`).toBe(2);
    expect(layout.flexDir, `${path} : liens en ligne`).toBe('row');
    expect(layout.creditX, `${path} : crédits à droite`).toBeGreaterThan(layout.brandX + 80);
    expect(Math.abs(layout.linksX - layout.brandX), `${path} : liens sous la marque`).toBeLessThan(40);
  }
});

test('wide E : horaires et sports gardent des cartes assez larges', async ({ page }) => {
  const minDay = async (width, minW, maxCols) => {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto(`/radios/chyz/?wide=e`, { waitUntil: 'domcontentloaded' });
    const days = page.locator('.seo-schedule .seo-day');
    await expect(days.first()).toBeVisible();
    const boxes = await days.evaluateAll((els) => els.map((el) => ({
      w: Math.round(el.getBoundingClientRect().width),
      x: Math.round(el.getBoundingClientRect().x),
    })));
    const firstRow = [];
    let lastX = -1;
    for (const b of boxes) {
      if (lastX >= 0 && b.x < lastX) break;
      firstRow.push(b);
      lastX = b.x;
    }
    expect(firstRow.length, `${width}px : trop de jours par rangée`).toBeLessThanOrEqual(maxCols);
    expect(Math.min(...firstRow.map((b) => b.w)), `${width}px : jour trop étroit`).toBeGreaterThanOrEqual(minW);
  };

  await minDay(1920, 320, 5);
  await minDay(2560, 320, 7);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/sports/?wide=e', { waitUntil: 'domcontentloaded' });
  const panels = page.locator('.sports-board .sports-panel:not([hidden])');
  await expect(panels.first()).toBeVisible({ timeout: 10_000 });
  const widths = await panels.evaluateAll((els) => {
    const row = [];
    let lastX = -1;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width < 8) continue;
      if (lastX >= 0 && r.x < lastX) break;
      row.push(Math.round(r.width));
      lastX = r.x;
    }
    return row;
  });
  expect(Math.min(...widths), `sports 1920 trop étroit: ${widths}`).toBeGreaterThanOrEqual(340);
});

import { expect, test } from '@playwright/test';

/**
 * Bandeau scores : cascade de fit comme la météo.
 * On retire des cartes score en rétrécissant jusqu’à ne garder que
 * la CTA « SPORTS ».
 */
test('sports strip : collapse progressif jusqu’à CTA SPORTS seule', async ({ page }) => {
  test.setTimeout(60000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const strip = page.locator('#masthead-sports-strip');
  // Attendre le fetch sports.json + premier paint (+ fit rAF).
  await expect(strip).toBeVisible({ timeout: 8000 });
  await expect
    .poll(async () => strip.locator('.sports-chip').count(), { timeout: 8000 })
    .toBeGreaterThan(0);

  const countAt = async (width) => {
    await page.setViewportSize({ width, height: 900 });
    // Debounce resize 40 ms + 2 rAF fit
    await page.waitForTimeout(120);
    await expect
      .poll(async () => strip.locator('.sports-chip').count(), { timeout: 4000 })
      .toBeGreaterThan(0);
    return strip.locator('.sports-chip').count();
  };

  const compact = await countAt(1280);
  expect(compact).toBeGreaterThanOrEqual(2);
  expect(compact).toBeLessThanOrEqual(4);
  await expect(strip.locator('.sports-chip').last()).toHaveClass(/sports-chip--cta/);
  const wide = await countAt(1440);
  expect(wide).toBeGreaterThanOrEqual(2);
  expect(wide).toBeLessThanOrEqual(9);
  expect(await strip.locator('.sports-chip--cta').count()).toBe(1);
  expect(await strip.locator('.sports-chip:not(.sports-chip--cta)').count()).toBe(wide - 1);
  await expect(strip).toHaveAttribute('data-cta-pinned', '1');

  const mid = await countAt(900);
  expect(mid).toBeLessThanOrEqual(wide);
  expect(mid).toBeGreaterThanOrEqual(1);
  if (mid >= 2) {
    await expect(strip.locator('.sports-chip').last()).toHaveClass(/sports-chip--cta/);
  }

  // Focus-group A : météo ⊥ sports — pas de plafond weatherN.
  // ~480–520 px : largeur seule réduit le nombre de puces (≤ mid, ≥ 1).
  const midNarrow = await countAt(480);
  expect(midNarrow).toBeLessThanOrEqual(mid);
  expect(midNarrow).toBeGreaterThanOrEqual(1);
  // Overflow restant : clip + marquee, jamais « … ».
  const matchChips = strip.locator('.sports-chip:not(.sports-chip--cta)');
  const matchCount = await matchChips.count();
  for (let i = 0; i < matchCount; i += 1) {
    const overflow = await matchChips.nth(i).locator('.sports-chip__line-inner').evaluate(
      (el) => getComputedStyle(el).textOverflow,
    );
    expect(overflow, 'puces scores : jamais ellipsis').toBe('clip');
  }

  const narrow = await countAt(520);
  expect(narrow).toBeLessThanOrEqual(Math.max(mid, midNarrow));
  expect(narrow).toBeGreaterThanOrEqual(1);

  // Tablette 768 / 900 : score à gauche, CTA à droite, même largeur.
  const pairRatioWhenTwo = async () => {
    const n = Number(await strip.getAttribute('data-count') || 0);
    if (n !== 2) return;
    const widths = await strip.locator('.sports-chip').evaluateAll((chips) =>
      chips.map((c) => Math.round(c.getBoundingClientRect().width)),
    );
    expect(widths).toHaveLength(2);
    const [scoreW, ctaW] = widths;
    expect(scoreW + ctaW).toBeGreaterThan(200);
    expect(
      Math.abs(scoreW - ctaW),
      `cartes égales, got ${scoreW}/${ctaW}`,
    ).toBeLessThanOrEqual(8);
  };
  const tab768 = await countAt(768);
  expect(tab768).toBeGreaterThanOrEqual(2);
  await expect(strip.locator('.sports-chip').last()).toHaveClass(/sports-chip--cta/);
  await expect(strip.locator('.sports-chip:not(.sports-chip--cta)').first()).toBeVisible();
  await pairRatioWhenTwo();
  const tab900 = await countAt(900);
  expect(tab900).toBeGreaterThanOrEqual(2);
  await pairRatioWhenTwo();

  // Téléphone / très étroit : il ne reste que l’ancre « SPORTS ».
  const phone = await countAt(360);
  expect(phone).toBe(1);
  await expect(strip.locator('.sports-chip')).toHaveCount(1);
  await expect(strip.locator('.sports-chip--cta')).toHaveCount(1);
  await expect(strip).toHaveAttribute('data-count', '1');
  await expect(strip).toHaveAttribute('data-cta-pinned', '0');
  // Pastille visible (pas coupée hors flux). Marque possible : repos, direct,
  // résultat civil ou prochain match.
  const tag = strip.locator('.sports-chip__cta-tag');
  await expect(tag).toContainText(/sports|en cours|hier|aujourd|demain|prochain|venir/i);
  await expect(strip.locator('.sports-chip__cta-chev')).toHaveCount(0);
  const tagBox = await tag.boundingBox();
  expect(tagBox).toBeTruthy();
  expect(tagBox.width).toBeGreaterThan(30);

  // En élargissant, on retrouve des scores + CTA (fit remesuré depuis zéro).
  const back = await countAt(1280);
  expect(back).toBeGreaterThanOrEqual(2);
  await expect(strip.locator('.sports-chip').last()).toHaveClass(/sports-chip--cta/);
  await expect(strip.locator('.sports-chip:not(.sports-chip--cta)').first()).toBeVisible();

  expect(pageErrors).toEqual([]);
});

/**
 * Date du mât : cascade d'ajustement, jamais sous les icônes.
 *
 * A capturé le chevauchement de « Thursday, August 6, 2026 » : la case,
 * dimensionnée au contenu par un `justify-self: start` hérité du bloc ≥360 px,
 * dépassait de 22 px et passait sous la rangée d'actions — sans jamais
 * déclencher l'ellipse, puisque `scrollWidth` valait `clientWidth`.
 */
test('mât : la date longue se compacte au lieu de passer sous les icônes', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const dateEl = page.locator('#today-date');
  const actions = page.locator('.masthead-actions');

  await page.setViewportSize({ width: 393, height: 800 });
  // `/en/` porte la date la plus longue du site sans dépendre du moteur de
  // traduction : « Thursday, August 6, 2026 » y est rendu par Intl.
  await page.goto('/en/', { waitUntil: 'domcontentloaded' });
  await expect(dateEl).not.toBeEmpty({ timeout: 15000 });
  // Chrome date toujours visible ; attendre webfonts puis forcer .loaded +
  // cascade (CI Linux sinon mesure system-font → format long → overflow).
  await page.evaluate(async () => {
    try { await document.fonts?.ready; } catch { /* ignore */ }
    document.querySelector('#bg-photo-layer')?.classList.add('loaded');
    if (typeof renderTodayDate === 'function') renderTodayDate();
  });

  // Une seule navigation : la page est lourde, et la cascade se rejoue au
  // redimensionnement — c'est justement ce qu'on veut vérifier.
  for (const width of [393, 360, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(async () => {
      try { await document.fonts?.ready; } catch { /* ignore */ }
      if (typeof renderTodayDate === 'function') renderTodayDate();
      // Double rAF : layout post-resize + reflow après textContent.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (typeof renderTodayDate === 'function') renderTodayDate();
    });
    await expect
      .poll(async () => {
        const [date, row] = await Promise.all([dateEl.boundingBox(), actions.boundingBox()]);
        if (!date || !row) return null;
        return Math.round(date.x + date.width - row.x);
      }, { timeout: 8000 })
      .toBeLessThanOrEqual(0);

    // Compactée, pas rognée : la cascade doit coller scrollWidth ≈ clientWidth.
    // Tolérance 2 px (webfonts CI) ; clientWidth < 4 = layout pas prêt → grand delta.
    await expect
      .poll(async () => dateEl.evaluate((el) => {
        if (el.clientWidth < 4) return 999;
        return el.scrollWidth - el.clientWidth;
      }), {
        timeout: 8000,
      })
      .toBeLessThanOrEqual(2);
  }

  expect(pageErrors).toEqual([]);
});

/**
 * Icônes mât (dernière) = même gouttière droite que crédit photo / météo / sports.
 * Régression : padding-right 36px (réserve shuffle) appliqué ≤1023 → trou à droite.
 */
test('mât : icônes alignées à droite comme crédits (390–1280)', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    document.querySelector('#bg-photo-layer')?.classList.add('loaded');
  });

  for (const width of [390, 430, 768, 900, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(120);
    const delta = await page.evaluate(() => {
      const icons = [...document.querySelectorAll('.masthead-actions .masthead-icon')]
        .filter((el) => el.offsetWidth > 0 && getComputedStyle(el).display !== 'none');
      const lastIcon = icons[icons.length - 1];
      const credit = document.querySelector('.bg-photo-credit');
      const weatherCities = [...document.querySelectorAll(
        '#masthead-weather .masthead-weather__city.is-active',
      )].filter((el) => el.offsetWidth > 0);
      const weather = weatherCities.sort(
        (a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right,
      )[0] || document.querySelector('#masthead-weather');
      // Chip sports la plus à droite (contenu, pas le padding du strip).
      const chips = [...document.querySelectorAll('#masthead-sports-strip .sports-chip')]
        .filter((el) => el.offsetWidth > 0);
      const lastChip = chips.sort(
        (a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right,
      )[0];
      // Bureau : shuffle flottant est le vrai bord droit (hors padding-right des actions).
      const floatShuffle = document.querySelector(
        '.masthead-shuffle-slot .masthead-bg-shuffle:not([hidden])',
      );
      const rightRef = floatShuffle && floatShuffle.offsetParent
        ? floatShuffle
        : lastIcon;
      if (!rightRef) return { ok: false, reason: 'no-icon' };
      const r = (el) => (el ? el.getBoundingClientRect().right : null);
      const iconR = r(rightRef);
      const creditR = r(credit);
      const weatherR = weather ? r(weather) : null;
      const chipR = lastChip ? r(lastChip) : null;
      const docked = !!document.querySelector('#masthead-weather.masthead-weather--docked');
      const tol = 3;
      const near = (a, b) => a != null && b != null && Math.abs(a - b) <= tol;
      return {
        ok: true,
        width: window.innerWidth,
        iconR,
        creditR,
        weatherR,
        chipR,
        docked,
        padActions: getComputedStyle(document.querySelector('.masthead-actions')).paddingRight,
        alignCredit: creditR == null || credit.getBoundingClientRect().width < 2
          ? true
          : near(iconR, creditR),
        // Météo dans le mât (bureau) : colonne centrale — pas le bord droit.
        alignWeather: !docked || weatherR == null || weatherR < 1
          ? true
          : near(iconR, weatherR),
        alignSports: chipR == null ? true : near(iconR, chipR),
      };
    });
    expect(delta.ok, `width ${width}: ${delta.reason || ''}`).toBe(true);
    expect(delta.alignCredit, `width ${width}: icône vs crédit (${delta.iconR} vs ${delta.creditR})`).toBe(true);
    expect(delta.alignWeather, `width ${width}: icône vs météo dockée (${delta.iconR} vs ${delta.weatherR})`).toBe(true);
    expect(delta.alignSports, `width ${width}: icône vs sports (${delta.iconR} vs ${delta.chipR})`).toBe(true);
    if (width <= 1023) {
      expect(delta.padActions === '0px' || parseFloat(delta.padActions) === 0).toBe(true);
    }
  }
});

/**
 * Mobile 390/430 (lab) : date + heure entières — pas d’année « 202 » ni d’heure « 14 ».
 * Stack ≤449 + cascade mastheadDateChipFits (chip + time, pas scrollWidth date seul).
 */
test('mât mobile 390/430 : date et heure non clipées', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // Date+heure visibles sans attendre la photo (.loaded) ; on force quand
  // même le rendu pour la mesure de largeur (stack ≤449).
  await page.evaluate(() => {
    if (typeof renderTodayDate === 'function') renderTodayDate();
  });

  for (const width of [390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => {
      if (typeof renderTodayDate === 'function') renderTodayDate();
    });
    await expect
      .poll(async () => page.evaluate(() => {
        const today = document.querySelector('#today-date');
        const time = document.querySelector('.masthead-time');
        const host = document.querySelector('.masthead-date');
        const actions = document.querySelector('.masthead-actions');
        if (!today || !time || !host || !actions) return null;
        const hb = host.getBoundingClientRect();
        const tb = time.getBoundingClientRect();
        const ab = actions.getBoundingClientRect();
        const dateOk = today.scrollWidth <= today.clientWidth + 0.5
          && /20\d{2}|\d{1,2}[./]\d{1,2}/.test((today.textContent || '').trim());
        // FR « 15 h 03 » ou EN « 15:03 »
        const timeOk = /^\d{1,2}(?:\s*h\s*|:)\d{2}$/i.test((time.textContent || '').trim())
          && tb.right <= hb.right + 1.5;
        const chipOk = hb.right <= ab.left + 1;
        // Visible dès qu’il y a #bg-photo-layer (plus d’attente .loaded)
        const visible = parseFloat(getComputedStyle(host).opacity || '1') > 0.5;
        return dateOk && timeOk && chipOk && visible;
      }), { timeout: 5000 })
      .toBe(true);
  }

  expect(pageErrors).toEqual([]);
});

/** Date visible avant .loaded sur #bg-photo-layer (retour mainteneur). */
test('mât : date visible avant chargement photo', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  // Bloquer les images mât pour que le code ne bascule pas en .loaded pendant l’assert.
  await page.route('**/*.{jpg,jpeg,png,webp,avif}', (route) => {
    const url = route.request().url();
    if (/background|wallpaper|wikimedia|commons|photo|bank/i.test(url)
      || /assets\/.*\.(jpg|jpeg|png|webp)/i.test(url)) {
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const layer = document.querySelector('#bg-photo-layer');
    if (layer) {
      layer.classList.remove('loaded');
      // Empêcher un add('loaded') asynchrone pendant la fenêtre d’assert.
      const freeze = new MutationObserver(() => {
        if (layer.classList.contains('loaded')) layer.classList.remove('loaded');
      });
      freeze.observe(layer, { attributes: true, attributeFilter: ['class'] });
      layer.dataset.testFreezeUnloaded = '1';
    }
    if (typeof renderTodayDate === 'function') renderTodayDate();
  });
  await expect
    .poll(async () => page.evaluate(() => {
      const host = document.querySelector('.masthead-date');
      const layer = document.querySelector('#bg-photo-layer');
      if (!host || !layer) return null;
      return {
        loaded: layer.classList.contains('loaded'),
        opacity: parseFloat(getComputedStyle(host).opacity || '0'),
        hasText: !!(document.querySelector('#today-date')?.textContent?.trim()),
      };
    }), { timeout: 5000 })
    .toMatchObject({ loaded: false, hasText: true });
  const opacity = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('.masthead-date')).opacity || '0'));
  expect(opacity).toBeGreaterThan(0.5);
});

/** Point médian : boîte symétrique entre date et heure (pas gap+margin asymétriques). */
test('mât : point médian centré entre date et heure', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    if (typeof renderTodayDate === 'function') renderTodayDate();
  });
  const geom = await page.evaluate(() => {
    const date = document.querySelector('#today-date');
    const time = document.querySelector('.masthead-time');
    if (!date || !time) return null;
    const db = date.getBoundingClientRect();
    const tb = time.getBoundingClientRect();
    // Mesurer le · via un range sur le pseudo : on approxime par le gap
    // entre fin date et début du contenu temps (chiffres).
    // Avec ::before en inline-flex width 1.1em, le centre du · ≈ milieu
    // entre db.right et le début des chiffres (tb.left + width/2 du before).
    const style = getComputedStyle(time, '::before');
    const beforeW = parseFloat(style.width) || 0;
    // Position du · : juste après date dans le flex (gap 0)
    const midCenter = db.right + beforeW / 2;
    const span = tb.left + beforeW - db.right; // total · box if time starts after before
    // Plus robuste : centre entre date.right et time content left
    // (time box includes ::before at start)
    const contentStart = tb.left + beforeW;
    const gapMid = (db.right + contentStart) / 2;
    const dotCenter = tb.left + beforeW / 2;
    return {
      beforeW,
      err: Math.abs(dotCenter - gapMid),
      leftGap: dotCenter - db.right,
      rightGap: contentStart - dotCenter,
    };
  });
  expect(geom).toBeTruthy();
  expect(geom.beforeW, '::before doit avoir une largeur fixe').toBeGreaterThan(4);
  // Espaces gauche/droite du · quasi égaux (tolérance subpixel + letter-spacing)
  expect(Math.abs(geom.leftGap - geom.rightGap)).toBeLessThanOrEqual(2.5);
  expect(geom.err).toBeLessThanOrEqual(2.5);
});

/**
 * CTA SPORTS téléphone : sous-ligne longue → marquee L→R (aller-retour),
 * pas de wrap 2 lignes, pas d’ellipse.
 */
test('CTA sports téléphone : sous-ligne trop longue défile L→R', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  const cta = strip.locator('.sports-chip--cta');
  await expect(cta).toBeVisible({ timeout: 8000 });

  const longSub = 'ven. 28 août, 20 h 30 · Soccer collégial masculin D2 · mis à jour à 21 h 56';
  const ready = await page.evaluate((sub) => {
    const chip = document.querySelector('.sports-chip--cta');
    const layer = chip?.querySelector('.sports-chip__cta-label.is-front')
      || chip?.querySelector('.sports-chip__cta-label');
    if (!chip || !layer) return { ok: false, reason: 'no-cta' };
    const text = layer.querySelector('.sports-chip__cta-text');
    let subView = layer.querySelector('.sports-chip__cta-sub');
    let subInner = layer.querySelector('.sports-chip__cta-sub-text');
    if (text) text.textContent = '⚽ Sherbrooke reçoit Granby';
    if (!subView) {
      subView = document.createElement('span');
      subView.className = 'sports-chip__cta-sub';
      layer.append(subView);
    }
    if (!subInner) {
      subView.replaceChildren();
      subInner = document.createElement('span');
      subInner.className = 'sports-chip__cta-sub-text';
      subView.append(subInner);
    }
    subInner.textContent = sub;
    if (typeof refreshSportsChipScroll === 'function') refreshSportsChipScroll(chip);
    const cs = getComputedStyle(subInner);
    return {
      ok: true,
      isSub: chip.classList.contains('is-sub-overflowing'),
      hasSubText: !!layer.querySelector('.sports-chip__cta-sub-text'),
      whiteSpace: cs.whiteSpace,
      textOverflow: cs.textOverflow,
      animationName: cs.animationName,
      text: (subInner.textContent || '').trim(),
    };
  }, longSub);
  expect(ready.ok, `préparation CTA : ${ready.reason || 'ok'}`).toBe(true);
  expect(ready.hasSubText, 'markup .sports-chip__cta-sub-text requis').toBe(true);
  expect(ready.isSub, 'refreshSportsChipScroll doit activer is-sub-overflowing').toBe(true);
  expect(ready.whiteSpace, 'sous-ligne une ligne').toBe('nowrap');
  expect(ready.textOverflow, 'pas d’ellipse').toBe('clip');
  expect(ready.animationName, 'sous-ligne doit animer').toMatch(/sports-cta-scroll-sub|sports-chip-scroll-sub/);
  expect(ready.text).toBe(longSub);

  expect(pageErrors).toEqual([]);
});

test('390 / 430 : pastille Prochain/Hier/Aujourd’hui à gauche de l’accroche', async ({ page }) => {
  for (const width of [390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const strip = page.locator('#masthead-sports-strip');
    await expect(strip.locator('.sports-chip--cta')).toBeVisible({ timeout: 8000 });
    const tag = strip.locator('.sports-chip--cta .sports-chip__cta-tag');
    await expect(tag).toContainText(/prochain|hier|aujourd|demain|venir|en cours|sports|août|avant-hier/i);
    const geo = await page.evaluate(() => {
      const chip = document.querySelector('.sports-chip--cta');
      const tagEl = chip?.querySelector('.sports-chip__cta-tag');
      const copy = chip?.querySelector('.sports-chip__line');
      if (!chip || !tagEl || !copy) return { ok: false };
      const tr = tagEl.getBoundingClientRect();
      const cr = copy.getBoundingClientRect();
      return { ok: true, tagLeftOfCopy: tr.right <= cr.left + 3 };
    });
    expect(geo.ok, `${width}: CTA présent`).toBe(true);
    expect(geo.tagLeftOfCopy, `${width}: pastille à gauche de l’accroche`).toBe(true);
  }
});

/**
 * CTA SPORTS : titre long (« Montmorency reçoit Bois-de-Boulogne ») → marquee,
 * **jamais** les trois points d’ellipsis. Règle dure le-radar : tout ce qui
 * déborde dans le bandeau sports défile L→R ; on n’accepte pas « … ».
 */
test('puce score : titre long défile L→R, jamais d’ellipsis …', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  const match = strip.locator('.sports-chip--match').first();
  await expect(match).toBeVisible({ timeout: 8000 });

  const longTitle = 'Notre-Dame Jaune reçoit Diablos (Cégep de Trois-Rivières)';
  const ready = await page.evaluate((title) => {
    const chip = document.querySelector('.sports-chip--match');
    const inner = chip?.querySelector('.sports-chip__line-inner');
    if (!chip || !inner) return { ok: false, reason: 'no-match' };
    chip.style.flex = '0 0 220px';
    chip.style.maxWidth = '220px';
    chip.style.width = '220px';
    inner.textContent = title;
    if (typeof refreshSportsChipScroll === 'function') refreshSportsChipScroll(chip);
    const cs = getComputedStyle(inner);
    return {
      ok: true,
      isOverflowing: chip.classList.contains('is-overflowing'),
      scroll: chip.style.getPropertyValue('--sports-scroll'),
      textOverflow: cs.textOverflow,
      animation: cs.animationName,
      label: (inner.textContent || '').trim(),
    };
  }, longTitle);

  expect(ready.ok, `préparation : ${ready.reason || 'ok'}`).toBe(true);
  expect(ready.label).toBe(longTitle);
  expect(ready.isOverflowing, 'titre long doit activer is-overflowing').toBe(true);
  expect(parseFloat(ready.scroll), 'décalage marquee titre').toBeGreaterThan(2);
  expect(ready.textOverflow, 'jamais text-overflow:ellipsis').toBe('clip');
  expect(ready.animation, 'titre doit animer sports-chip-scroll').toMatch(/sports-chip-scroll/);

  const titleEl = match.locator('.sports-chip__line-inner');
  // Delay 1,6 s + hold 24 % de 8 s ≈ 3,5 s avant le 1er pixel.
  const left0 = await titleEl.evaluate((el) => el.getBoundingClientRect().left);
  await page.waitForTimeout(5200);
  const left1 = await titleEl.evaluate((el) => el.getBoundingClientRect().left);
  expect(left1, 'le titre doit glisser (marquee L→R)').toBeLessThan(left0 - 1);

  expect(pageErrors).toEqual([]);
});

test('CTA sports : titre long défile, jamais d’ellipsis …', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  const cta = strip.locator('.sports-chip--cta');
  await expect(cta).toBeVisible({ timeout: 8000 });

  // Titre volontairement long + largeur CTA bornée (FG A : moins de scores
  // élargit la CTA — sans force flex, le libellé tenait parfois sans marquee).
  const longTitle = '⚽ Collège Montmorency reçoit Bois-de-Boulogne Collégial';
  const ready = await page.evaluate((title) => {
    const chip = document.querySelector('.sports-chip--cta');
    const layer = chip?.querySelector('.sports-chip__cta-label.is-front')
      || chip?.querySelector('.sports-chip__cta-label');
    const text = layer?.querySelector('.sports-chip__cta-text');
    if (!chip || !text) return { ok: false, reason: 'no-cta-text' };
    // Borne la fenêtre de titre pour forcer un overflow mesurable.
    chip.style.flex = '0 0 220px';
    chip.style.maxWidth = '220px';
    chip.style.width = '220px';
    text.textContent = title;
    if (typeof refreshSportsChipScroll !== 'function') {
      return { ok: false, reason: 'no-refresh' };
    }
    refreshSportsChipScroll(chip);
    const cs = getComputedStyle(text);
    return {
      ok: true,
      isOverflowing: chip.classList.contains('is-overflowing'),
      scroll: chip.style.getPropertyValue('--sports-scroll'),
      textOverflow: cs.textOverflow,
      animation: cs.animationName,
      label: text.textContent,
    };
  }, longTitle);

  expect(ready.ok, `préparation : ${ready.reason || 'ok'}`).toBe(true);
  expect(ready.label).toBe(longTitle);
  expect(ready.isOverflowing, 'titre long doit activer is-overflowing').toBe(true);
  expect(parseFloat(ready.scroll), 'décalage marquee titre').toBeGreaterThan(2);
  expect(ready.textOverflow, 'jamais text-overflow:ellipsis').toBe('clip');
  expect(ready.animation, 'titre doit animer sports-cta-scroll').toMatch(/sports-cta-scroll|sports-chip-scroll/);

  await expect(cta).toHaveClass(/is-overflowing/);
  const titleEl = cta.locator('.sports-chip__cta-text');
  // Le DOM conserve le libellé complet (pas de troncature JS « … »).
  await expect(titleEl).toHaveText(longTitle);
  const computedOverflow = await titleEl.evaluate((el) => getComputedStyle(el).textOverflow);
  expect(computedOverflow).toBe('clip');

  // Delay CTA 0,7 s + hold ~10 % de 5,5 s → mouvement après ~1,3 s.
  const left0 = await titleEl.evaluate((el) => el.getBoundingClientRect().left);
  await page.waitForTimeout(2200);
  const left1 = await titleEl.evaluate((el) => el.getBoundingClientRect().left);
  expect(left1, 'le titre doit glisser (marquee L→R)').toBeLessThan(left0 - 1);

  expect(pageErrors).toEqual([]);
});

test('CTA sports 1920 : pastille Prochain jaune + titre long défile', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  const cta = strip.locator('.sports-chip--cta').first();
  await expect(cta).toBeVisible({ timeout: 8000 });

  const longTitle = 'Champlain College Lennoxville reçoit Cégep François-Xavier-Garneau';
  const ready = await page.evaluate((title) => {
    const chip = document.querySelector('.sports-chip--cta');
    const tag = chip?.querySelector('.sports-chip__cta-tag');
    const layer = chip?.querySelector('.sports-chip__cta-label.is-front')
      || chip?.querySelector('.sports-chip__cta-label');
    const text = layer?.querySelector('.sports-chip__cta-text');
    if (!chip || !tag || !text) return { ok: false, reason: 'no-cta' };
    chip.dataset.ctaState = 'next';
    tag.dataset.ctaLamp = 'next';
    tag.dataset.ctaTag = 'Prochains match';
    tag.textContent = 'Prochains match';
    tag.classList.remove('sports-chip__cta-tag--brand');
    text.textContent = title;
    if (typeof refreshSportsChipScroll === 'function') refreshSportsChipScroll(chip);
    const tagCs = getComputedStyle(tag);
    const textCs = getComputedStyle(text);
    const rgb = tagCs.backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
    return {
      ok: true,
      lamp: tag.dataset.ctaLamp,
      isOverflowing: chip.classList.contains('is-overflowing'),
      animation: textCs.animationName,
      textOverflow: textCs.textOverflow,
      bg: tagCs.backgroundColor,
      yellow: rgb.length >= 3 && rgb[0] > 180 && rgb[1] > 150 && rgb[2] < 80,
    };
  }, longTitle);
  expect(ready.ok, ready.reason || 'ok').toBe(true);
  expect(ready.lamp).toBe('next');
  expect(ready.yellow, `pastille jaune, bg=${ready.bg}`).toBe(true);
  expect(ready.isOverflowing, 'titre long → marquee même en shell E 1920').toBe(true);
  expect(ready.animation).toMatch(/sports-cta-scroll|sports-chip-scroll/);
  expect(ready.textOverflow).toBe('clip');

  const titleEl = cta.locator('.sports-chip__cta-text');
  const left0 = await titleEl.evaluate((el) => el.getBoundingClientRect().left);
  await page.waitForTimeout(2200);
  const left1 = await titleEl.evaluate((el) => el.getBoundingClientRect().left);
  expect(left1, 'défilement L→R à 1920').toBeLessThan(left0 - 1);
});

test('wide E ≥3440 : 4 CTA sports distinctes', async ({ page }) => {
  await page.setViewportSize({ width: 3440, height: 1200 });
  await page.goto('/?wide=e', { waitUntil: 'domcontentloaded' });
  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  await expect.poll(async () => strip.locator('.sports-chip--cta').count(), { timeout: 8000 })
    .toBe(4);
  await expect(strip).toHaveAttribute('data-cta-count', '4');
  const weatherN = await page.locator('#masthead-weather .masthead-weather__city.is-active').count();
  const matchN = await strip.locator('.sports-chip--match').count();
  expect(weatherN, 'météo suit encore les scores (+ bonus 3440)').toBeGreaterThanOrEqual(2 + matchN);
});

async function assertSportsCascadeAt(page, { width, height = 900, wide = false, minChips = 2 }) {
  await page.setViewportSize({ width, height });
  await page.goto(wide ? '/?wide=e' : '/', { waitUntil: 'domcontentloaded' });
  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  await expect.poll(async () => strip.locator('.sports-chip').count(), { timeout: 8000 })
    .toBeGreaterThanOrEqual(minChips);

  const snapshot = () => strip.locator('.sports-chip').evaluateAll((chips) => chips.map((el) => ({
    cta: el.classList.contains('sports-chip--cta'),
    text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
  })));

  const start = await snapshot();
  const armed = await page.evaluate(() => {
    if (typeof scheduleSportsWave !== 'function') return false;
    scheduleSportsWave({ fromSlot: 0, firstWait: false });
    return true;
  });
  expect(armed, `scheduleSportsWave armée à ${width}`).toBe(true);

  await page.waitForTimeout(Math.min(2800, 560 * Math.max(2, start.length)));
  const now = await snapshot();
  expect(now.length).toBe(start.length);
  const flipped = now.filter((row, i) => row.text !== start[i]?.text).length;
  const liveCta = await strip.locator('.sports-chip--cta[data-cta-state="live"]').count();
  const onlyLiveCta = start.length === 1 && start[0].cta && liveCta > 0;
  const matchN = start.filter((row) => !row.cta).length;
  if (onlyLiveCta) {
    expect(flipped, `direct unique : la CTA En cours reste à ${width}`).toBe(0);
  } else if (matchN >= 3) {
    expect(flipped, `plusieurs cartes sports changent à ${width}`).toBeGreaterThan(1);
  } else {
    expect(flipped, `au moins une carte sports change à ${width}`).toBeGreaterThan(0);
  }
  expect(now.some((row) => row.cta), 'la vague conserve au moins une CTA').toBe(true);
}

test('pause sports : lecture ~9 s, marquee complète si overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  await expect.poll(async () => strip.locator('.sports-chip').count(), { timeout: 8000 })
    .toBeGreaterThan(0);
  const info = await page.evaluate(() => {
    const hold = typeof sportsBoardHoldMs === 'function' ? sportsBoardHoldMs() : null;
    const overflowing = [...document.querySelectorAll('#masthead-sports-strip .sports-chip')]
      .some((el) => el.classList.contains('is-overflowing') || el.classList.contains('is-sub-overflowing'));
    return { hold, overflowing };
  });
  expect(info.hold, 'sportsBoardHoldMs exposé').toEqual(expect.any(Number));
  expect(info.hold, `hold ${info.hold} ms trop court`).toBeGreaterThanOrEqual(9000);
  if (!info.overflowing) {
    expect(info.hold, `hold ${info.hold} ms trop long sans marquee`).toBeLessThanOrEqual(12000);
  } else {
    expect(info.hold, `hold ${info.hold} ms trop court pour un aller-retour`).toBeGreaterThanOrEqual(14000);
  }
});

test('wide E : sports + CTA changent en cascade puis se figent', async ({ page }) => {
  await assertSportsCascadeAt(page, { width: 1920, height: 1080, wide: true, minChips: 3 });
});

test('bureau 1280 : sports cascade puis pause', async ({ page }) => {
  await assertSportsCascadeAt(page, { width: 1280, minChips: 2 });
});

test('tablette 768 : sports cascade puis pause', async ({ page }) => {
  await assertSportsCascadeAt(page, { width: 768, minChips: 1 });
});

test('téléphone 390 : sports cascade puis pause', async ({ page }) => {
  await assertSportsCascadeAt(page, { width: 390, minChips: 1 });
});

test('390 : la CTA change comme les autres formats, sans puce score qui glisse', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const strip = page.locator('#masthead-sports-strip');
  await expect(strip.locator('.sports-chip--cta')).toBeVisible({ timeout: 8000 });
  const rest = await strip.evaluate((el) => {
    const badge = el.querySelector('.sports-chip--cta .sports-chip__badge');
    const cs = badge ? getComputedStyle(badge) : null;
    return {
      n: el.querySelectorAll('.sports-chip').length,
      match: el.querySelectorAll('.sports-chip--match').length,
      badgeVisible: !!(cs && cs.display !== 'none' && cs.visibility !== 'hidden'),
    };
  });
  expect(rest.match, '390 : pas de puce score à côté de la CTA').toBe(0);
  expect(rest.badgeVisible, '390 : pas de badge V/D/N dans la CTA').toBe(false);

  const swap = await page.evaluate(() => {
    if (typeof rotateSportsSlot !== 'function') return { ok: false };
    rotateSportsSlot(0);
    const el = document.querySelector('#masthead-sports-strip .sports-chip--cta');
    return {
      ok: true,
      n: document.querySelectorAll('#masthead-sports-strip .sports-chip').length,
      match: document.querySelectorAll('#masthead-sports-strip .sports-chip--match').length,
      cta: document.querySelectorAll('#masthead-sports-strip .sports-chip--cta').length,
      leaving: !!el?.classList.contains('is-leaving'),
      arriving: !!el?.classList.contains('is-arriving'),
      rolling: !!el?.querySelector('.is-rolling-in, .is-rolling-out'),
      leaveName: el ? getComputedStyle(el).animationName : '',
    };
  });
  expect(swap.ok, 'rotateSportsSlot joignable').toBe(true);
  expect(swap.n, 'toujours une seule carte').toBe(1);
  expect(swap.cta).toBe(1);
  expect(swap.match, 'la rotation ne fait pas apparaître une puce score').toBe(0);
  expect(swap.leaving, '390 : sortie carte entière comme les autres formats').toBe(true);
  expect(swap.rolling, 'pas de roulement interne du texte CTA').toBe(false);
  expect(swap.leaveName, 'CSS leave sur la carte CTA mobile').toMatch(/sports-chip-leave/);
});

test('CTA sports : renouvellement carte entière comme les scores', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  const cta = strip.locator('.sports-chip--cta').first();
  await expect(cta).toBeVisible({ timeout: 8000 });

  const leaveName = await cta.evaluate((el) => {
    el.classList.add('is-leaving');
    const name = getComputedStyle(el).animationName;
    el.classList.remove('is-leaving');
    return name;
  });
  expect(leaveName, 'CSS leave sur la carte CTA').toMatch(/sports-chip-leave/);

  const swap = await page.evaluate(() => {
    if (typeof rotateSportsSlot !== 'function') return { ok: false };
    const chips = document.querySelectorAll('#masthead-sports-strip .sports-chip');
    let slot = -1;
    chips.forEach((el, i) => {
      if (slot < 0 && el.classList.contains('sports-chip--cta')) slot = i;
    });
    if (slot < 0) return { ok: false };
    rotateSportsSlot(slot);
    const old = document.querySelectorAll('#masthead-sports-strip .sports-chip')[slot];
    return {
      ok: true,
      leaving: !!old?.classList.contains('is-leaving'),
      rolling: !!old?.querySelector('.is-rolling-in, .is-rolling-out'),
    };
  });
  expect(swap.ok, 'rotateSportsSlot joignable').toBe(true);
  expect(swap.leaving, 'la CTA sort en is-leaving (carte entière)').toBe(true);
  expect(swap.rolling, 'plus de roulement interne du texte CTA').toBe(false);

  const lamp = await page.evaluate(() => {
    const tag = document.querySelector('.sports-chip--cta .sports-chip__cta-tag');
    if (!tag) return { ok: false };
    const rest = getComputedStyle(tag, '::before');
    document.documentElement.setAttribute('data-radar-playing', '1');
    document.querySelector('.tuner')?.classList.add('is-playing');
    const playing = getComputedStyle(tag, '::before');
    return {
      ok: true,
      rest: String(rest.content || ''),
      playing: String(playing.content || ''),
      width: parseFloat(rest.width) || 0,
      color: String(rest.backgroundColor || ''),
    };
  });
  expect(lamp.ok, 'pastille CTA présente').toBe(true);
  expect(lamp.rest === 'none' || lamp.width === 0, 'pastille CTA : pas de voyant LED').toBe(true);
  expect(lamp.playing, 'radio : la pastille CTA ne gagne pas de voyant').toBe(lamp.rest);
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

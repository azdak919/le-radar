import { expect, test } from '@playwright/test';

/**
 * Bandeau scores : cascade de fit comme la météo.
 * On retire des cartes score en rétrécissant jusqu’à ne garder que
 * la CTA « SPORTS ».
 */
test('sports strip : collapse progressif jusqu’à CTA SPORTS seule', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 900 });
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

  const wide = await countAt(1440);
  // En desktop large la voie de gauche doit être PLEINE : 3 puces SCORE + CTA.
  // Un `>= 2` laissait passer une voie à court de matière — hors saison, avec un
  // seul résultat en banque, le bandeau tombait à 2 puces (score + CTA) trop larges.
  expect(wide).toBeGreaterThanOrEqual(3);
  expect(wide).toBeLessThanOrEqual(4);
  // Chaque slot non-CTA est bien rempli (pas de trou avalé par le flex).
  expect(await strip.locator('.sports-chip:not(.sports-chip--cta)').count()).toBe(wide - 1);
  // CTA toujours présente et en dernier quand ≥ 2 chips.
  await expect(strip.locator('.sports-chip').last()).toHaveClass(/sports-chip--cta/);
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
  // Puces scores : titre + sous-ligne entiers (pas de marquee is-overflowing).
  const matchChips = strip.locator('.sports-chip:not(.sports-chip--cta)');
  const matchCount = await matchChips.count();
  for (let i = 0; i < matchCount; i += 1) {
    const chip = matchChips.nth(i);
    await expect(chip).not.toHaveClass(/is-overflowing/);
    await expect(chip).not.toHaveClass(/is-sub-overflowing/);
  }

  const narrow = await countAt(520);
  expect(narrow).toBeLessThanOrEqual(Math.max(mid, midNarrow));
  expect(narrow).toBeGreaterThanOrEqual(1);

  // Tablette 768 / 900 : au moins 1 score à gauche de la CTA.
  // data-count=2 → ratio fixe ~42/58 (score / CTA) pour compenser le chrome
  // pastille SPORTS + PROCHAIN — pas 50/50 (air mort à gauche / marquee CTA)
  // ni flex dynamique par slide (tailles stables).
  const pairRatioWhenTwo = async () => {
    const n = Number(await strip.getAttribute('data-count') || 0);
    if (n !== 2) return;
    const widths = await strip.locator('.sports-chip').evaluateAll((chips) =>
      chips.map((c) => Math.round(c.getBoundingClientRect().width)),
    );
    expect(widths).toHaveLength(2);
    const [scoreW, ctaW] = widths;
    const total = scoreW + ctaW;
    expect(total).toBeGreaterThan(200);
    const scoreShare = scoreW / total;
    // 0.72 / (0.72+1) ≈ 0.419 — tolérance de rendu sub-pixel + gap.
    expect(
      scoreShare,
      `ratio score/CTA ~42/58 attendu, got ${scoreW}/${ctaW} (${(scoreShare * 100).toFixed(1)}%)`,
    ).toBeGreaterThanOrEqual(0.38);
    expect(scoreShare).toBeLessThanOrEqual(0.46);
    expect(ctaW, `CTA doit être plus large que le score, got ${widths}`).toBeGreaterThan(scoreW);
    const flexes = await strip.locator('.sports-chip').evaluateAll((chips) =>
      chips.map((c) => getComputedStyle(c).flexGrow),
    );
    expect(Number(flexes[0])).toBeCloseTo(0.72, 2);
    expect(Number(flexes[1])).toBeCloseTo(1, 2);
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
  // Pastille visible (pas coupée hors flux). Elle dit « Sports » au repos et
  // « En cours » pendant un match — le seul cas qui remplace la rubrique
  // (focus-group le-radar-cta-sports-badge, override mainteneur). Les deux sont
  // acceptés : un vrai match en cours pendant la CI ne doit pas faire rougir le test.
  const tag = strip.locator('.sports-chip__cta-tag');
  await expect(tag).toContainText(/sports|en cours/i);
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
 * CTA SPORTS : texte trop long → marquee L→R (aller-retour), pas d’ellipse figée.
 *
 * Cas réel signalé : titre court (« Sherbrooke reçoit Granby ») + sous-ligne
 * longue (date · compétition · mis à jour…) → l’ancienne règle nowrap sur
 * toute la .cta-label collapsait head+sub en une ligne « mis à j… » sans
 * jamais activer is-overflowing / is-sub-overflowing.
 */
test('CTA sports : sous-ligne longue défile au lieu d’une ellipse figée', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  const cta = strip.locator('.sports-chip--cta');
  await expect(cta).toBeVisible({ timeout: 8000 });

  // Forcer une sous-ligne qui déborde clairement, titre court (cas du bug).
  const ready = await page.evaluate(() => {
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
    subInner.textContent = 'ven. 28 août, 20 h 30 · Soccer collégial masculin D2 · mis à jour à 21 h 56';
    // Mesure via le chemin app (script global, non module).
    if (typeof refreshSportsChipScroll !== 'function') {
      return { ok: false, reason: 'no-refresh' };
    }
    refreshSportsChipScroll(chip);
    return {
      ok: true,
      isSub: chip.classList.contains('is-sub-overflowing'),
      scrollSub: chip.style.getPropertyValue('--sports-scroll-sub'),
      hasSubText: !!layer.querySelector('.sports-chip__cta-sub-text'),
    };
  });
  expect(ready.ok, `préparation CTA : ${ready.reason || 'ok'}`).toBe(true);
  expect(ready.hasSubText, 'markup .sports-chip__cta-sub-text requis').toBe(true);
  expect(ready.isSub, 'refreshSportsChipScroll doit activer is-sub-overflowing').toBe(true);
  expect(parseFloat(ready.scrollSub), 'décalage marquee sous-ligne').toBeGreaterThan(2);

  await expect(cta).toHaveClass(/is-sub-overflowing/);
  const subText = cta.locator('.sports-chip__cta-sub-text');
  await expect(subText).toBeVisible();

  const anim = await subText.evaluate((el) => getComputedStyle(el).animationName);
  expect(anim, 'sous-ligne doit animer sports-chip-scroll-sub').toMatch(/sports-chip-scroll-sub/);

  // Hold initial ~32 % de 5,5 s ≈ 1,8 s ; poll jusqu’au glissement (lab flaky si
  // on ne prend qu’un seul échantillon à 3,2 s).
  const left0 = await subText.evaluate((el) => el.getBoundingClientRect().left);
  await expect
    .poll(async () => {
      const left = await subText.evaluate((el) => el.getBoundingClientRect().left);
      return left0 - left;
    }, { timeout: 7000 })
    .toBeGreaterThan(1);

  // Pas d’ellipse figée sur le texte qui défile.
  const textOverflow = await subText.evaluate((el) => getComputedStyle(el).textOverflow);
  expect(textOverflow).toBe('clip');

  expect(pageErrors).toEqual([]);
});

/**
 * CTA SPORTS : titre long (« Montmorency reçoit Bois-de-Boulogne ») → marquee,
 * **jamais** les trois points d’ellipsis. Règle dure le-radar : tout ce qui
 * déborde dans le bandeau sports défile L→R ; on n’accepte pas « … ».
 */
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
  expect(ready.animation, 'titre doit animer sports-chip-scroll').toMatch(/sports-chip-scroll/);

  await expect(cta).toHaveClass(/is-overflowing/);
  const titleEl = cta.locator('.sports-chip__cta-text');
  // Le DOM conserve le libellé complet (pas de troncature JS « … »).
  await expect(titleEl).toHaveText(longTitle);
  const computedOverflow = await titleEl.evaluate((el) => getComputedStyle(el).textOverflow);
  expect(computedOverflow).toBe('clip');

  // Delay CSS 1.6 s + hold 18 % de 5,5 s ≈ 1 s → mouvement après ~2,6 s.
  // (Un wait 2,2 s tombait encore dans le hold : flocon ~0,7 px.)
  const left0 = await titleEl.evaluate((el) => el.getBoundingClientRect().left);
  await page.waitForTimeout(3400);
  const left1 = await titleEl.evaluate((el) => el.getBoundingClientRect().left);
  expect(left1, 'le titre doit glisser (marquee L→R)').toBeLessThan(left0 - 1);

  expect(pageErrors).toEqual([]);
});

test('wide E ≥3440 : 3 CTA sports distinctes', async ({ page }) => {
  await page.setViewportSize({ width: 3440, height: 1200 });
  await page.goto('/?wide=e', { waitUntil: 'domcontentloaded' });
  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  await expect.poll(async () => strip.locator('.sports-chip--cta').count(), { timeout: 8000 })
    .toBe(3);
  await expect(strip).toHaveAttribute('data-cta-count', '3');
  const weatherN = await page.locator('#masthead-weather .masthead-weather__city.is-active').count();
  const matchN = await strip.locator('.sports-chip--match').count();
  expect(weatherN, 'météo suit encore les scores (+ bonus 3440)').toBeGreaterThanOrEqual(2 + matchN);
});

test('wide E : sports + CTA changent en cascade puis se figent', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?wide=e', { waitUntil: 'domcontentloaded' });
  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  await expect.poll(async () => strip.locator('.sports-chip').count(), { timeout: 8000 })
    .toBeGreaterThan(2);

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
  expect(armed, 'scheduleSportsWave disponible').toBe(true);

  await page.waitForTimeout(Math.min(2600, 560 * Math.max(3, start.length)));
  const now = await snapshot();
  expect(now.length).toBe(start.length);
  const flipped = now.filter((row, i) => row.text !== start[i]?.text).length;
  expect(flipped, 'plusieurs cartes sports changent pendant la vague').toBeGreaterThan(1);
  expect(now.some((row) => row.cta), 'la vague inclut encore les cartes CTA').toBe(true);
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
  expect(lamp.rest, 'voyant persistant (content: "")').not.toBe('none');
  expect(lamp.playing, 'voyant inchangé quand la radio joue').toBe(lamp.rest);
  expect(lamp.width, 'voyant visible').toBeGreaterThan(4);
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

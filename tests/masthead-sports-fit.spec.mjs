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
  // seul résultat en banque, le bandeau tombait à 2 puces étirées à 50/50.
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

  // Parité météo : puces SCORE ≤ cartes météo (CTA hors plafond).
  // ~420–480 px : météo souvent à 2 cartes → max 2 scores + CTA = 3 chips.
  const parity = await countAt(480);
  const weatherActive = await page.locator('.masthead-weather__city.is-active').count();
  if (weatherActive > 0) {
    const scoreChips = await strip.locator('.sports-chip:not(.sports-chip--cta)').count();
    expect(scoreChips).toBeLessThanOrEqual(weatherActive);
    // total = scores + (CTA si ≥ 1)
    expect(parity).toBeLessThanOrEqual(weatherActive + 1);
  }

  const narrow = await countAt(520);
  expect(narrow).toBeLessThanOrEqual(Math.max(mid, parity));
  expect(narrow).toBeGreaterThanOrEqual(1);

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

  // Une seule navigation : la page est lourde, et la cascade se rejoue au
  // redimensionnement — c'est justement ce qu'on veut vérifier.
  for (const width of [393, 360, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await expect
      .poll(async () => {
        const [date, row] = await Promise.all([dateEl.boundingBox(), actions.boundingBox()]);
        if (!date || !row) return null;
        return Math.round(date.x + date.width - row.x);
      }, { timeout: 5000 })
      .toBeLessThanOrEqual(0);

    // Compactée, pas rognée : l'ellipse reste un filet, elle ne doit pas servir.
    const clipped = await dateEl.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(clipped, `${width}px : date tronquée par l'ellipse au lieu d'être compactée`).toBe(false);
  }

  expect(pageErrors).toEqual([]);
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

  // Le transform doit bouger (hold initial ~32 % de 8,5 s ≈ 2,7 s — on attend assez).
  const left0 = await subText.evaluate((el) => el.getBoundingClientRect().left);
  await page.waitForTimeout(3200);
  const left1 = await subText.evaluate((el) => el.getBoundingClientRect().left);
  expect(left1, 'le texte doit avoir glissé vers la gauche (L→R de lecture)').toBeLessThan(left0 - 1);

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

  const longTitle = '⚽ Montmorency reçoit Bois-de-Boulogne';
  const ready = await page.evaluate((title) => {
    const chip = document.querySelector('.sports-chip--cta');
    const layer = chip?.querySelector('.sports-chip__cta-label.is-front')
      || chip?.querySelector('.sports-chip__cta-label');
    const text = layer?.querySelector('.sports-chip__cta-text');
    if (!chip || !text) return { ok: false, reason: 'no-cta-text' };
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

  // Le transform doit bouger (hold initial ~18 % de 5,5 s ≈ 1 s).
  const left0 = await titleEl.evaluate((el) => el.getBoundingClientRect().left);
  await page.waitForTimeout(2200);
  const left1 = await titleEl.evaluate((el) => el.getBoundingClientRect().left);
  expect(left1, 'le titre doit glisser (marquee L→R)').toBeLessThan(left0 - 1);

  expect(pageErrors).toEqual([]);
});

import { expect, test } from '@playwright/test';

/**
 * Rythme du défilement — principe général du site.
 *
 * Quand un texte déborde de son conteneur, il défile plutôt que d'être tronqué
 * (`applyMarquee`). La règle qui va avec : **on ne le remplace jamais avant
 * qu'il ait fait son aller-retour complet.** L'animation est `alternate`, donc
 * un cycle vaut 2 × `--marquee-duration`.
 *
 * Régressions couvertes (2026-07-26) :
 *  - la contrainte n'était appliquée que sous 1100 px (`getTunerSubRotateDelayMs`
 *    l'enfermait dans une garde de media query), donc jamais en embed large ;
 *  - le panneau « À l'antenne » du bureau tournait à 8 s fixes sans regarder si
 *    son titre défilait encore.
 *
 * On vérifie le **contrat de durée** plutôt que d'observer une rotation réelle :
 * mesurer deux cycles à l'écran demandait plus de trois minutes, ce qui aurait
 * rendu la suite CI aussi lente que le problème qu'on venait d'y corriger.
 */

/** Fabrique un élément qui se déclare en défilement, avec la durée voulue. */
const INSTALL_FAKE = `(seconds) => {
  const host = document.createElement('div');
  host.className = 'is-marquee';
  host.style.setProperty('--marquee-duration', seconds + 's');
  const span = document.createElement('span');
  span.className = 'tuner-now-sub-text';
  span.textContent = 'x'.repeat(400);
  host.appendChild(span);
  document.body.appendChild(host);
  return host;
}`;

async function pure(page, width) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.RadarAir?._pure);
  return page;
}

for (const [label, width] of [['mobile 375 px', 375], ['tablette 900 px', 900], ['bureau 1280 px', 1280]]) {
  test(`la durée d’affichage couvre l’aller-retour — ${label}`, async ({ page }) => {
    await pure(page, width);

    const out = await page.evaluate(([install, seconds]) => {
      const P = window.RadarAir._pure;
      const host = new Function('return ' + install)()(seconds);
      const roundTrip = P.marqueeRoundTripMs(host);
      const result = {
        roundTrip,
        // Sans phase, et avec chaque type de phase : aucune ne doit couper.
        sansPhase: P.getTunerSubRotateDelayMs(host, null),
        live: P.getTunerSubRotateDelayMs(host, { kind: 'live', title: 'Une émission' }),
        upcoming: P.getTunerSubRotateDelayMs(host, { kind: 'upcoming', title: 'La suivante' }),
        track: P.getTunerSubRotateDelayMs(host, { kind: 'live', title: '♪ Artiste — Titre' }),
        // Un élément qui ne défile pas n'impose aucun plancher.
        sansDefilement: P.marqueeRoundTripMs(document.createElement('div')),
      };
      host.remove();
      return result;
    }, [INSTALL_FAKE, 12]);

    // 12 s d'aller simple → au moins 24 s pour l'aller-retour.
    expect(out.roundTrip, 'aller-retour = 2 × la durée d’un aller').toBeGreaterThanOrEqual(24000);
    expect(out.sansDefilement, 'pas de plancher sans défilement').toBe(0);

    for (const key of ['sansPhase', 'live', 'upcoming', 'track']) {
      expect(
        out[key],
        `${label} / ${key} : le texte serait remplacé après ${out[key]} ms `
        + `alors que l’aller-retour dure ${out.roundTrip} ms`,
      ).toBeGreaterThanOrEqual(out.roundTrip);
    }
  });
}

test('une ligne courte garde la cadence de base, sans plancher de défilement', async ({ page }) => {
  await pure(page, 1280);

  const out = await page.evaluate(() => {
    const P = window.RadarAir._pure;
    const plain = document.createElement('div');
    return {
      base: P.getTunerSubRotateDelayMs(plain, null),
      live: P.getTunerSubRotateDelayMs(plain, { kind: 'live', title: 'Une émission' }),
    };
  });

  expect(out.base, 'cadence de base attendue').toBeGreaterThan(0);
  // L'émission en ondes s'attarde même quand rien ne défile.
  expect(out.live, 'l’émission en ondes reste plus longtemps').toBeGreaterThan(out.base);
});

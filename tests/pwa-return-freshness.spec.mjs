import { expect, test } from '@playwright/test';

/**
 * Fraîcheur au retour dans l'app (PWA installée, onglet laissé ouvert).
 *
 * Une PWA n'est jamais « rechargée » au sens d'un onglet : on la quitte, on y
 * revient, et le même document reprend — des jours plus tard sur iOS. Sans
 * cette règle, le fil affiché reste celui de la dernière ouverture alors que
 * le bot publie sept fois par jour.
 *
 * Deux niveaux de vérification :
 *  - la **règle** (pure) : seuils et garde « radio en écoute » ;
 *  - le **câblage** : un retour réel déclenche bien le rafraîchissement, ce
 *    qu'une vérification arithmétique seule ne prouverait pas.
 */

const MINUTE = 60 * 1000;

async function app(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.RadarLifecycle?._pure);
  return page;
}

test('la règle de retour : rien, rafraîchir, ou recharger', async ({ page }) => {
  await app(page);

  const verdicts = await page.evaluate((minute) => {
    const { returnRefreshAction, CONTENT_REFRESH_AFTER_MS, HARD_RELOAD_AFTER_MS } =
      window.RadarLifecycle._pure;
    return {
      seuils: { refresh: CONTENT_REFRESH_AFTER_MS, reload: HARD_RELOAD_AFTER_MS },
      jamaisParti: returnRefreshAction(0),
      dixSecondes: returnRefreshAction(10 * 1000),
      justeAvantLeSeuil: returnRefreshAction(CONTENT_REFRESH_AFTER_MS - 1),
      auSeuil: returnRefreshAction(CONTENT_REFRESH_AFTER_MS),
      sixMinutes: returnRefreshAction(6 * minute),
      uneHeure: returnRefreshAction(HARD_RELOAD_AFTER_MS),
      uneHeureEnEcoute: returnRefreshAction(HARD_RELOAD_AFTER_MS, { playing: true }),
      unJourEnEcoute: returnRefreshAction(24 * 60 * minute, { playing: true }),
      negatif: returnRefreshAction(-5 * minute),
    };
  }, MINUTE);

  // Une absence brève est le cas de loin le plus fréquent : elle ne doit rien coûter.
  expect(verdicts.jamaisParti).toBe('none');
  expect(verdicts.dixSecondes).toBe('none');
  expect(verdicts.justeAvantLeSeuil).toBe('none');

  // Passé le seuil, le fil se recharge sur place — sans clignotement ni reload.
  expect(verdicts.auSeuil).toBe('refresh');
  expect(verdicts.sixMinutes).toBe('refresh');

  // Après une heure, tout le document est périmé : rechargement franc.
  expect(verdicts.uneHeure).toBe('reload');

  // …sauf pendant une écoute : couper la radio pour rafraîchir un fil serait
  // un pire défaut que celui qu'on corrige. Le fil se met quand même à jour.
  expect(verdicts.uneHeureEnEcoute).toBe('refresh');
  expect(verdicts.unJourEnEcoute).toBe('refresh');

  // Horloge qui recule (changement d'heure, réveil de veille) : ne rien faire
  // vaut mieux qu'un rechargement inexplicable.
  expect(verdicts.negatif).toBe('none');

  expect(verdicts.seuils.refresh).toBeLessThan(verdicts.seuils.reload);
});

test('un retour après une absence longue recharge le fil sans recharger la page', async ({ page }) => {
  await app(page);

  // Attendre le premier chargement du fil : c'est lui qu'on veut voir se
  // rejouer, pas la requête initiale.
  await page.waitForFunction(
    () => {
      const list = document.getElementById('news-list');
      return !!list && list.querySelectorAll('.article:not(.skeleton)').length > 0;
    },
    null,
    { timeout: 20_000 },
  );

  const report = await page.evaluate(async (minute) => {
    // Espionner news.json sans casser les autres requêtes de la page.
    const calls = [];
    const realFetch = window.fetch;
    window.fetch = (...args) => {
      const url = String(args[0]?.url || args[0] || '');
      if (url.includes('news.json')) calls.push(url);
      return realFetch.apply(window, args);
    };

    // Un départ, puis un retour six minutes plus tard. L'horloge est avancée
    // plutôt qu'attendue : le test resterait sinon bloqué six minutes.
    window.dispatchEvent(new Event('pagehide'));

    const realNow = Date.now;
    Date.now = () => realNow.call(Date) + 6 * minute;
    try {
      window.dispatchEvent(new Event('pageshow'));
      // Laisser la requête partir.
      await new Promise((r) => setTimeout(r, 1200));
    } finally {
      Date.now = realNow;
      window.fetch = realFetch;
    }

    return {
      newsRefetched: calls.length,
      // Le fil est resté affiché : un rafraîchissement de fond ne doit pas
      // remplacer une liste lisible par des squelettes.
      stillRendered: document
        .getElementById('news-list')
        .querySelectorAll('.article:not(.skeleton)').length > 0,
    };
  }, MINUTE);

  expect(report.newsRefetched, 'news.json doit être redemandé au retour').toBeGreaterThan(0);
  expect(report.stillRendered, 'le fil reste affiché pendant le rafraîchissement').toBe(true);
});

test('un aller-retour bref ne redemande rien', async ({ page }) => {
  await app(page);
  await page.waitForFunction(
    () => {
      const list = document.getElementById('news-list');
      return !!list && list.querySelectorAll('.article:not(.skeleton)').length > 0;
    },
    null,
    { timeout: 20_000 },
  );

  const calls = await page.evaluate(async () => {
    const seen = [];
    const realFetch = window.fetch;
    window.fetch = (...args) => {
      const url = String(args[0]?.url || args[0] || '');
      if (url.includes('news.json')) seen.push(url);
      return realFetch.apply(window, args);
    };
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pageshow'));
    await new Promise((r) => setTimeout(r, 800));
    window.fetch = realFetch;
    return seen.length;
  });

  expect(calls, 'basculer d’app deux secondes ne doit rien redemander').toBe(0);
});

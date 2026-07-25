import { expect, test } from '@playwright/test';

/**
 * Libellés d'établissements (translate.js).
 *
 * Au Québec, un cégep ou un collège n'est jamais une université : le module
 * localise le *type* et garde le toponyme. Ces cas sont de la logique pure, on
 * les évalue directement via `RadarTranslate._labels` — aucun appel au moteur
 * de traduction, donc aucun test instable.
 *
 * Régression couverte (2026-07-25) : `formatCollegeLabel()` ne retirait le
 * mot-type qu'en préfixe puis le rajoutait en suffixe, ce qui produisait
 * « Vanier College College » en allemand, italien et polonais. Trois
 * établissements de institutions.json sont concernés (Vanier, John Abbott,
 * Champlain Regional) ; Dawson passe par le glossaire.
 */

async function labels(page) {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.RadarTranslate?._labels);
  return page;
}

const CASES = [
  // [fonction, entrée, langue, attendu]
  ['formatCollegeLabel', 'Vanier College', 'de', 'Vanier College'],
  ['formatCollegeLabel', 'Vanier College', 'it', 'Vanier College'],
  ['formatCollegeLabel', 'Vanier College', 'pl', 'Vanier College'],
  ['formatCollegeLabel', 'John Abbott College', 'de', 'John Abbott College'],
  ['formatCollegeLabel', 'Champlain Regional College', 'de', 'Champlain Regional College'],
  ['formatCollegeLabel', 'Vanier College', 'es', 'Colegio de Vanier'],
  ['formatCollegeLabel', 'Vanier College', 'pt', 'Colégio de Vanier'],
  ['formatCollegeLabel', 'Collège de Maisonneuve', 'en', 'Maisonneuve College'],
  ['formatCollegeLabel', 'Dawson College', 'es', 'Colegio Dawson'],
  ['formatCegepLabel', 'Cégep du Vieux Montréal', 'en', 'Vieux Montréal College'],
  ['formatCegepLabel', 'Cégep du Vieux Montréal', 'fr', 'Cégep du Vieux Montréal'],
  ['formatCegepLabel', 'Cégep de Jonquière', 'es', 'Colegio de Jonquière'],
  // nl / ro / ca : les deux fonctions se contredisaient (« Vieux Montréal
  // College » d'un côté, « Collège Vieux Montréal » de l'autre).
  ['formatCegepLabel', 'Cégep du Vieux Montréal', 'nl', 'Vieux Montréal College'],
  ['formatCollegeLabel', 'Collège de Maisonneuve', 'nl', 'Maisonneuve College'],
  ['formatCollegeLabel', 'Vanier College', 'ca', 'Vanier College'],
];

test('les libellés de collèges ne dupliquent jamais le mot-type', async ({ page }) => {
  await labels(page);

  const results = await page.evaluate((cases) => cases.map(([fn, input, lang]) => ({
    fn, input, lang, out: window.RadarTranslate._labels[fn](input, lang),
  })), CASES);

  for (const [i, { fn, input, lang, out }] of results.entries()) {
    expect(out, `${fn}("${input}", "${lang}")`).toBe(CASES[i][3]);
    // Filet indépendant des valeurs attendues : jamais deux mots-type.
    expect(out, `${fn}("${input}", "${lang}") — doublon de type`)
      .not.toMatch(/\b(coll[eè]ge|college|colegio|col[eé]gio)\b.*\b(coll[eè]ge|college|colegio|col[eé]gio)\b/i);
  }
});

test('appliquer un libellé deux fois ne change rien (idempotence)', async ({ page }) => {
  await labels(page);

  const drift = await page.evaluate((cases) => cases
    .map(([fn, input, lang]) => {
      const once = window.RadarTranslate._labels[fn](input, lang);
      const twice = window.RadarTranslate._labels[fn](once, lang);
      return { fn, input, lang, once, twice };
    })
    .filter((r) => r.once !== r.twice), CASES);

  expect(drift, `libellés instables : ${JSON.stringify(drift)}`).toEqual([]);
});

test('un cégep ou un collège n’est jamais classé comme université', async ({ page }) => {
  await labels(page);

  const verdicts = await page.evaluate(() => {
    const L = window.RadarTranslate._labels;
    return [
      'Cégep du Vieux Montréal',
      'Cégep de Jonquière',
      'Dawson College',
      'Vanier College',
      'John Abbott College',
      'Collège de Maisonneuve',
    ].map((name) => ({
      name,
      college: L.isCegepOrCollegeInstitution(name),
      university: L.isUniversityInstitutionName(name),
    }));
  });

  for (const v of verdicts) {
    expect(v.college, `${v.name} devrait être reconnu comme cégep/collège`).toBe(true);
    expect(v.university, `${v.name} ne doit pas être une université`).toBe(false);
  }
});

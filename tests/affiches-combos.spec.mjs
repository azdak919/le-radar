import { expect, test } from '@playwright/test';

/**
 * /affiches/ : toutes les combinaisons du studio (refonte t991u).
 * - La une : chaque établissement (et « tous »), chacun de ses médias puis « tous les médias »,
 *   chaque période, avec/sans photo, chaque encart du haut, chaque format, bilingue autorisé/refusé.
 * - Cas vides : sans articles, sans sports, sans radio → l’affiche se compose quand même, sans inventer.
 * - Affiche campus : chaque établissement, avec/sans photo, bilingue seulement Concordia, McGill, Bishop’s.
 * - Mobile et ordinateur ; export PDF réel (en-tête %PDF).
 * Tout réseau externe est coupé : seules les données du dépôt servent.
 */

const UNIS = ['toutes', 'laval', 'mcgill', 'udem', 'uqam', 'concordia', 'sherbrooke', 'bishops', 'uqtr', 'uqac', 'uqar', 'uqo', 'uqat', 'teluq', 'ets', 'enap', 'inrs', 'poly', 'hec'];
const BILINGUES = new Set(['mcgill', 'concordia', 'bishops']);
const PERIODES = ['jour', 'demain', 'fds', 'semaine', 'mois', 'session'];
const ENTETES = ['radio', 'match', 'chiffre', 'combo', 'aucun'];
const FORMATS = { letter: 8.5 / 11, legal: 8.5 / 14, tabloid: 11 / 17, 'ecran-paysage': 16 / 9, 'ecran-portrait': 9 / 16 };

async function offline(page, errors) {
  await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
  page.on('pageerror', (e) => errors.push(e.message));
}

async function ready(page) {
  await expect(page.locator('#preview')).toHaveAttribute('data-state', /pret|erreur/, { timeout: 25000 });
  await expect(page.locator('#preview')).toHaveAttribute('data-state', 'pret', { timeout: 25000 });
}

/* Aperçu réellement peint : assez de pixels non uniformes, et au bon rapport. */
async function painted(page) {
  return page.locator('#preview canvas').evaluate((c) => {
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
    return { colors: seen.size, ratio: c.width / c.height };
  });
}

/* Aucune coupure « … » ni ligne perdue dans la une (règle sans troncature) : composeFrontPage note chaque coupure. */
async function noCuts(page, what) {
  const cuts = await page.evaluate(() => (window.__uneCuts || []).slice());
  expect(cuts, `texte coupé (${what})`).toEqual([]);
}

async function noDimText(page) {
  const dim = await page.evaluate(() => [...document.querySelectorAll('.dash p')]
    .filter((e) => e.offsetParent && getComputedStyle(e).color === 'rgb(68, 71, 77)').map((e) => e.id || e.className));
  expect(dim, 'indications lisibles (contraste AA sur le fond sombre du studio)').toEqual([]);
}

for (const uni of UNIS) {
  test(`la une : ${uni}, chaque média puis tous les médias @ci-critical`, async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    await offline(page, errors);
    await page.goto(`/affiches/?modele=une&uni=${uni}&periode=semaine`, { waitUntil: 'domcontentloaded' });
    await ready(page);
    const status = page.locator('#une-status');
    await expect(status).not.toContainText('Impossible');
    const opts = await page.$$eval('#une-media option', (o) => o.map((x) => ({ v: x.value, t: x.textContent })));
    expect(opts[0].v).toBe('tous');
    expect(opts[0].t).toBe(uni === 'toutes' ? 'Tous les médias' : 'Tous les médias de l’établissement');
    const bi = page.locator('label:has(input[name="lang"][value="bilingue"])');
    if (BILINGUES.has(uni)) await expect(bi).toBeVisible();
    else await expect(bi).toBeHidden();
    for (const o of opts.slice(1, 7)) {
      await page.selectOption('#une-media', o.v);
      await expect(page).toHaveURL(new RegExp(`media=${o.v}`));
      await ready(page);
      await expect(status).toContainText(new RegExp(`de ${o.t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|Aucun article`));
      const p = await painted(page);
      expect(p.colors, `aperçu peint (${uni} / ${o.v})`).toBeGreaterThan(6);
      await noCuts(page, `${uni} / ${o.v}`);
    }
    await page.selectOption('#une-media', 'tous');
    await ready(page);
    await expect(page).not.toHaveURL(/media=/);
    expect((await painted(page)).colors).toBeGreaterThan(6);
    expect(errors).toEqual([]);
  });
}

test('la une : chaque période, avec et sans photo, chaque encart du haut @ci-critical', async ({ page }) => {
  test.setTimeout(180000);
  const errors = [];
  await offline(page, errors);
  await page.goto('/affiches/?modele=une&uni=udem', { waitUntil: 'domcontentloaded' });
  await ready(page);
  for (const per of PERIODES) {
    await page.selectOption('#une-period', per);
    await ready(page);
    await expect(page.locator('#une-status')).not.toContainText('Impossible');
    expect((await painted(page)).colors, `période ${per}`).toBeGreaterThan(6);
    await noCuts(page, `période ${per}`);
  }
  for (const layout of ['classique', 'verre']) {
    await page.locator(`label:has(input[name="layout"][value="${layout}"])`).click();
    await ready(page);
    if (layout === 'verre') await expect(page.locator('#photo-box')).toBeVisible();
    else await expect(page.locator('#photo-box')).toBeHidden();
    for (const ent of ENTETES) {
      await page.selectOption('#une-entete', ent);
      await ready(page);
      expect(page.url()).toContain(ent === 'radio' ? 'modele=une' : `entete=${ent}`);
      expect((await painted(page)).colors, `${layout} / ${ent}`).toBeGreaterThan(6);
      await noCuts(page, `${layout} / ${ent}`);
    }
  }
  expect(errors).toEqual([]);
});

test('la une : chaque format au bon rapport, noms longs @ci-critical', async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  await offline(page, errors);
  await page.goto('/affiches/?modele=une&uni=uqat&periode=session', { waitUntil: 'domcontentloaded' });
  await ready(page);
  await expect(page.locator('#une-campus option:checked')).toHaveText('Université du Québec en Abitibi-Témiscamingue');
  for (const [fmt, r] of Object.entries(FORMATS)) {
    await page.locator(`label:has(input[name="format"][value="${fmt}"])`).click();
    await ready(page);
    const p = await painted(page);
    expect(Math.abs(p.ratio - r), `rapport ${fmt}`).toBeLessThan(0.02);
    await noCuts(page, `format ${fmt}`);
  }
  expect(errors).toEqual([]);
});

test('la une : bilingue refusé hors Concordia, McGill, Bishop’s, même forcé par l’URL @ci-critical', async ({ page }) => {
  const errors = [];
  await offline(page, errors);
  await page.goto('/affiches/?modele=une&uni=udem&lang=bilingue', { waitUntil: 'domcontentloaded' });
  await ready(page);
  await expect(page.locator('input[name="lang"][value="standard"]')).toBeChecked();
  await expect(page.locator('label:has(input[name="lang"][value="bilingue"])')).toBeHidden();
  await page.goto('/affiches/?modele=une&uni=toutes&lang=bilingue', { waitUntil: 'domcontentloaded' });
  await ready(page);
  await expect(page.locator('input[name="lang"][value="standard"]')).toBeChecked();
  await page.goto('/affiches/?modele=une&uni=concordia&lang=bilingue', { waitUntil: 'domcontentloaded' });
  await ready(page);
  await expect(page.locator('input[name="lang"][value="bilingue"]')).toBeChecked();
  expect(errors).toEqual([]);
});

for (const [what, file, body] of [
  ['sans articles', '**/news.json', { updated: '2026-11-13T12:00:00Z', items: [] }],
  ['sans sports', '**/sports-masthead.json', {}],
  ['sans radio', '**/radio-schedules.json', {}],
]) {
  test(`la une : ${what}, l’affiche se compose sans inventer @ci-critical`, async ({ page }) => {
    const errors = [];
    await offline(page, errors);
    await page.route(file, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }));
    if (what === 'sans sports') await page.route('**/sports.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.goto('/affiches/?modele=une&uni=laval&periode=semaine', { waitUntil: 'domcontentloaded' });
    await ready(page);
    if (what === 'sans articles') await expect(page.locator('#une-status')).toContainText('Aucun article');
    expect((await painted(page)).colors).toBeGreaterThan(4);
    expect(errors).toEqual([]);
  });
}

for (const slug of ['generique', ...UNIS.filter((u) => u !== 'toutes')]) {
  test(`affiche campus : ${slug}, avec et sans photo @ci-critical`, async ({ page }) => {
    test.setTimeout(60000);
    const errors = [];
    await offline(page, errors);
    await page.goto(`/affiches/?modele=campus&campus=${slug}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#preview canvas')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#preview')).toHaveAttribute('data-state', /pret|erreur/, { timeout: 25000 });
    expect((await painted(page)).colors).toBeGreaterThan(3);
    const bi = page.locator('label:has(input[name="lang"][value="bilingue"])');
    if (BILINGUES.has(slug)) await expect(bi).toBeVisible();
    else await expect(bi).toBeHidden();
    await expect(page.locator('input[name="langs"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

for (const [name, vp] of [['mobile', { width: 390, height: 844 }], ['ordinateur', { width: 1440, height: 900 }]]) {
  test(`studio lisible et sans débordement : ${name} @ci-critical`, async ({ page }) => {
    const errors = [];
    await offline(page, errors);
    await page.setViewportSize(vp);
    for (const url of ['/affiches/?modele=une&uni=concordia', '/affiches/?modele=campus&campus=laval']) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#preview canvas')).toBeVisible({ timeout: 20000 });
      await expect(page.locator('#preview')).toHaveAttribute('data-state', /pret|erreur/, { timeout: 25000 });
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(ov, `débordement ${url}`).toBeLessThanOrEqual(0);
      for (const sel of ['#dl', 'legend']) {
        const box = await page.locator(sel).first().boundingBox();
        expect(box.x, `marge ${sel}`).toBeGreaterThanOrEqual(8);
        expect(box.x + box.width, `droite ${sel}`).toBeLessThanOrEqual(vp.width);
      }
      await noDimText(page);
    }
    expect(errors).toEqual([]);
  });
}

test('export PDF réel : la une Lettre (300 dpi) et l’affiche campus @ci-critical', async ({ page }) => {
  test.setTimeout(150000);
  const errors = [];
  await offline(page, errors);
  for (const url of ['/affiches/?modele=une&uni=udem&format=letter', '/affiches/?modele=campus&campus=generique&format=letter']) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#preview')).toHaveAttribute('data-state', /pret|erreur/, { timeout: 25000 });
    await page.locator('label:has(input[name="dpi"][value="300"])').click();
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.locator('#dl').click()]);
    const stream = await dl.createReadStream();
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    const buf = Buffer.concat(chunks);
    expect(buf.subarray(0, 5).toString(), `PDF ${url}`).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(100000);
    expect(dl.suggestedFilename()).toMatch(/\.pdf$/);
  }
  expect(errors).toEqual([]);
});

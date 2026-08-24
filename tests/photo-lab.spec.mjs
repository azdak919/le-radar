import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test.describe.configure({ mode: 'serial' });
const PORT = Number(process.env.PHOTO_LAB_PORT || 8779);
const BASE = `http://127.0.0.1:${PORT}`;

let child;

test.beforeAll(async () => {
  child = spawn(process.execPath, [join(root, 'scripts/photo-lab-server.js')], {
    cwd: root,
    env: { ...process.env, PHOTO_LAB_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('labo photo: timeout démarrage')), 8000);
    const onData = (buf) => {
      if (String(buf).includes('Labo photo')) {
        clearTimeout(t);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
  });
});

test.afterAll(async () => {
  if (child && !child.killed) child.kill('SIGTERM');
});

test('tableau de bord local', async ({ page }) => {
  await page.goto(`${BASE}/dev/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toContainText('Labo');
  await expect(page.locator('a.card.featured')).toHaveAttribute('href', './photo-lab/');
  await expect(page.locator('a.card[href="../index.html"]').first()).toBeVisible();
  const sports = page.locator('a.card[href="./sports-strip-lab.html"]');
  await expect(sports).toBeVisible();
  await expect(sports.locator('strong')).toContainText('Cartes sports');
  const pageLab = page.locator('a.card[href="./sports-page-lab.html"]');
  await expect(pageLab).toBeVisible();
  await expect(pageLab.locator('strong')).toContainText('Cartes page Sports');
  const posters = page.locator('a.card[href="../affiches/"]');
  await expect(posters).toBeVisible();
  await expect(posters.locator('strong')).toContainText('Imprimer une affiche');
});

test('générateur d’affiches public', async ({ page }) => {
  await page.goto(`${BASE}/affiches/`, { waitUntil: 'networkidle' });
  await expect(page.locator('h1')).toContainText('Imprimer une affiche');
  await expect(page.locator('label:has(input[name="format"][value="letter"])')).toBeVisible();
  await expect(page.locator('label:has(input[name="format"][value="legal"])')).toBeVisible();
  await expect(page.getByRole('button', { name: /JPEG 300 dpi/ })).toBeVisible();
  await page.locator('#preview canvas').waitFor({ timeout: 20000 });
  await page.locator('label:has(input[name="format"][value="letter"])').click();
  await expect(page.locator('#status')).toContainText('Lettre', { timeout: 15000 });
  await expect(page.locator('#status')).toContainText('2550 × 3300');
  const n = await page.locator('#photo-grid label').count();
  expect(n).toBeGreaterThan(20);
  const bilingue = page.locator('label:has(input[name="lang"][value="bilingue"])');
  await expect(bilingue).toBeHidden();
  await page.locator('label:has(input[name="campus"][value="mcgill"])').click();
  await expect(bilingue).toBeVisible();
  await page.locator('label:has(input[name="campus"][value="udem"])').click();
  const udemTitles = (await page.locator('#photo-grid label').evaluateAll((els) => els.map((e) => e.getAttribute('title') || ''))).join(' ').toLowerCase();
  expect(udemTitles).not.toContain('uqam');
  expect(udemTitles).not.toContain('hall building');
  expect(udemTitles).not.toContain('mcgill');
  await page.locator('label:has(input[name="campus"][value="laval"])').click();
  await expect(bilingue).toBeHidden();
  await expect(page.locator('#greeting')).toContainText('Bonne rentrée');
  await expect(page.locator('label:has(input[name="langs"][value="oui"])')).toContainText('Langues du site');
  await expect(page.locator('.solid--radar')).toBeVisible();
  await page.locator('label:has(input[name="campus"][value="concordia"])').click();
  await page.locator('#photo-grid label').nth(1).click();
  await expect(page.locator('#status')).toContainText('300 dpi', { timeout: 20000 });
  await expect(page.locator('#status')).not.toContainText('qrSide');
  await page.selectOption('#greeting', 'relache');
  await expect(page.locator('#crop-tools')).toBeVisible();
  await page.locator('#photo-angle').fill('8');
  await expect(page.locator('#status')).not.toContainText('qrSide');
});

test('labo cartes sports : colonne mobile, une carte, marquee L→R', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/dev/sports-strip-lab.html`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#formats')).toHaveCount(0);
  await expect(page.locator('#preview')).toHaveCount(0);
  const col = page.locator('#col');
  await expect(col).toBeVisible();
  await expect.poll(async () => Math.round((await col.boundingBox()).width)).toBeLessThanOrEqual(390);

  await expect(page.locator('#cta-band .sports-chip--cta').first()).toBeVisible();
  await expect(page.locator('#cta-band .sports-chip--match')).toHaveCount(0);
  await expect(page.locator('#standard-chips .sports-chip--match').first()).toBeVisible();
  await expect(page.locator('#cta-band').getByText('il y a 5 h', { exact: false })).toBeVisible();
  await expect(page.locator('#cta-band').getByText('dans 3 h', { exact: false })).toBeVisible();
  await expect(page.getByText('avant-hier', { exact: false }).first()).toBeVisible();
  await expect(page.locator('#cta-band .sports-chip__cta-tag--brand')).toBeVisible();
  await expect(page.locator('#cta-band').getByText('LE-RADAR.ca').first()).toBeVisible();
  await expect(page.locator('#cta-band').getByText(/Réseau Académique/).first()).toBeVisible();
  await expect(page.locator('#cta-band').getByText('Scores collégiaux')).toHaveCount(0);
  await expect(page.locator('#cta-band .sports-chip__cta-tag', { hasText: /^Prochain$/ }).first()).toBeVisible();
  await expect(page.locator('#cta-band .sports-chip__cta-tag', { hasText: /^Avant-hier$/ })).toHaveCount(0);
  await expect(page.locator('.sports-chip__cta-tag', { hasText: /^Hier$/ }).first()).toBeVisible();
  await expect(page.locator('.sports-chip__cta-tag', { hasText: /^Aujourd’hui$/ }).first()).toBeVisible();
  const dotRgb = async (tag) => page.locator(`.sports-chip__cta-tag[data-cta-tag="${tag}"]`).first().evaluate((el) => {
    const m = (getComputedStyle(el, '::before').backgroundColor.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    return m;
  });
  const [pr, pg] = await dotRgb('Prochain');
  const [hr, hg] = await dotRgb('Hier');
  const [ar, ag] = await dotRgb('Aujourd’hui');
  expect(ar - ag, 'Aujourd’hui : voyant rouge').toBeGreaterThan(80);
  expect(pr - pg, 'Prochain : voyant ambre, pas rouge').toBeLessThan(80);
  expect(hg - hr, 'Hier : voyant vert').toBeGreaterThan(20);
  await expect(page.locator('.sports-chip__cta-eyebrow--head', { hasText: /^Prochain$/ })).toHaveCount(0);
  await expect(page.locator('#cta-band .sports-chip__badge', { hasText: /^V$/ }).first()).toBeVisible();
  await expect(page.locator('#cta-band .sports-chip__badge', { hasText: /^D$/ }).first()).toBeVisible();
  await expect(page.locator('#cta-band .sports-chip__badge', { hasText: /^N$/ }).first()).toBeVisible();
  const labCopy = await page.locator('body').innerText();
  expect(labCopy, 'pas d’abréviation univ. — le marquee porte le mot entier').not.toMatch(/\buniv\./);

  const overflowing = page.locator('.sports-chip--cta.is-overflowing').first();
  await expect(overflowing).toBeVisible({ timeout: 8000 });
  const title = overflowing.locator('.sports-chip__cta-text').first();
  await expect.poll(async () => title.evaluate((el) => {
    const s = getComputedStyle(el);
    return `${s.animationName}|${s.animationIterationCount}|${s.whiteSpace}`;
  })).toMatch(/sports-chip-scroll\|infinite\|nowrap/);
  await expect.poll(async () => title.evaluate((el) => {
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    const m = t.match(/matrix\(([^)]+)\)/);
    if (!m) return 0;
    return Math.abs(Number(m[1].split(',')[4]));
  }), { timeout: 6000 }).toBeGreaterThan(4);
});

test('labo cartes page sports : variantes V D N prochain creux', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/dev/sports-page-lab.html`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#lab-nav a')).toHaveCount(18);
  const firstBrand = page.locator('#fiches .sports-panel__brand').first();
  await expect(firstBrand).toBeVisible();
  const chromeBox = await page.locator('.lab-chrome').boundingBox();
  const brandBox = await firstBrand.boundingBox();
  expect(brandBox.y, 'entête de carte sous la barre, pas dessous').toBeGreaterThan(chromeBox.y + chromeBox.height - 1);
  const card = page.locator('#fiches .lab-case .sports-panel').first();
  await expect.poll(async () => Math.round((await card.boundingBox()).width)).toBeLessThanOrEqual(390);
  await expect(page.locator('#fiches .sports-result--W').first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result--L').first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result--D').first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result--next').first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result--live').first()).toBeVisible();
  const livePill = page.locator('#fiches .sports-panel__live').first();
  await expect(livePill).toBeVisible();
  await expect(livePill).toHaveText(/En cours/i);
  const liveFilter = page.locator('#lab-filters [data-filter-period="live"]');
  await expect(liveFilter).toBeVisible();
  await liveFilter.click();
  await expect(page.locator('#fiches .lab-case:not([hidden])')).toHaveCount(1);
  await expect(page.locator('#fiches .lab-case:not([hidden]) .sports-panel__live')).toBeVisible();
  await page.locator('#lab-filters [data-filter-period="all"]').click();
  await expect(page.locator('#fiches .sports-result__badge', { hasText: /^V$/ }).first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result__badge', { hasText: /^D$/ }).first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result__badge', { hasText: /^N$/ }).first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result__venue', { hasText: 'domicile' }).first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result__venue', { hasText: 'extérieur' }).first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result__vs', { hasText: 'régate' }).first()).toBeVisible();
  await expect(page.locator('#fiches .sports-panel__empty').first()).toBeVisible();
  await expect(page.locator('#fiches .sports-panel__empty--club').first()).toBeVisible();
  await expect(page.locator('#fiches .sports-panel--external').first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result--prior-season').first()).toBeVisible();
  await expect(page.locator('#fiches .is-spotlight').first()).toBeVisible();
  await expect(page.locator('#formats iframe')).toHaveCount(4);
  await page.locator('#lab-nav a', { hasText: 'Victoire (V, vert)' }).click();
  await expect(page.locator('#case-2')).toBeInViewport();
});

test('labo photo : grille puis fiche, suivant en barre', async ({ page }) => {
  await page.goto(`${BASE}/dev/photo-lab/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#grid .card').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('body')).toHaveClass(/mode-grid/);
  await page.locator('#grid .card').first().click();
  await expect(page.locator('body')).toHaveClass(/mode-detail/);
  await expect(page.locator('#panel-body')).toBeVisible();
  await expect(page.locator('#counter')).toContainText('/');
  await expect(page.locator('#next-btn')).toBeVisible();
  await expect(page.locator('#prev-btn')).toBeVisible();
  const firstSrc = await page.locator('#full-photo').getAttribute('src');
  await page.locator('#next-btn').click();
  await expect(page.locator('#counter')).toContainText('2 /');
  await expect(page.locator('#full-photo')).not.toHaveAttribute('src', firstSrc);
  await expect(page.locator('#band-desktop')).toBeVisible();
  await expect(page.locator('#band-mobile')).toBeVisible();
  await expect(page.locator('#grid-btn')).toBeVisible();
  await page.locator('#grid-btn').click();
  await expect(page.locator('#grid .card').first()).toBeVisible();
  await expect(page.locator('#save-meta-btn')).toContainText('Enregistrer tout');
  await expect(page.locator('#persist-hint')).toContainText('fichiers locaux');
});

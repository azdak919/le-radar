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
});

test('labo cartes sports : iframe formats + marquee L→R', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${BASE}/dev/sports-strip-lab.html`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#formats')).toBeVisible();
  await expect(page.locator('#formats button[data-w="390"]')).toHaveAttribute('aria-pressed', 'true');
  const iframe = page.locator('#preview');
  await expect(iframe).toBeVisible();
  await expect(iframe).toHaveAttribute('data-w', '390');

  const frame = page.frameLocator('#preview');
  await expect(frame.locator('.sports-chip--cta').first()).toBeVisible({ timeout: 10000 });
  await expect(frame.locator('#cta-band .sports-chip--match')).toHaveCount(0);
  await expect(frame.locator('#standard-chips .sports-chip--match').first()).toBeVisible();
  await expect(frame.getByText('avant-hier', { exact: false }).first()).toBeVisible();
  await expect(frame.getByText('mer. 19 août', { exact: false }).first()).toBeVisible();
  await expect(frame.locator('#cta-band .masthead-sports-strip').first()).toHaveAttribute('data-count', '1');
  await expect(frame.locator('#cta-band .sports-chip__cta-tag', { hasText: /^Prochain$/ }).first()).toBeVisible();
  await expect(frame.locator('.sports-chip__cta-tag', { hasText: /^Hier$/ }).first()).toBeVisible();
  await expect(frame.locator('.sports-chip__cta-tag', { hasText: /^Aujourd’hui$/ }).first()).toBeVisible();
  await expect(frame.locator('.sports-chip__cta-tag', { hasText: /^Avant-hier$/ }).first()).toBeVisible();
  await expect(frame.locator('.sports-chip__cta-eyebrow--rail', { hasText: /^Prochain$/ })).toHaveCount(0);
  await expect(frame.locator('.sports-chip__cta-eyebrow--head', { hasText: /^Prochain$/ })).toHaveCount(0);
  await expect(frame.locator('.sports-chip__cta-eyebrow', { hasText: /^Reprise$/ })).toHaveCount(0);
  await expect(frame.getByText('défaite', { exact: false }).first()).toBeVisible();
  await expect(frame.getByText('match nul', { exact: false }).first()).toBeVisible();
  const labCopy = await frame.locator('body').innerText();
  expect(labCopy, 'pas d’abréviation univ. — le marquee porte le mot entier').not.toMatch(/\buniv\./);
  const overflowing = frame.locator('.sports-chip--cta.is-overflowing').first();
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

  await page.locator('#formats button[data-w="768"]').click();
  await expect(iframe).toHaveAttribute('data-w', '768');
  await expect(frame.locator('.sports-chip--cta').first()).toBeVisible();
  await expect.poll(async () => frame.locator('.sports-chip--match').count()).toBeGreaterThan(0);
  await expect(frame.locator('.sports-chip__badge', { hasText: /^V$/ }).first()).toBeVisible();
  await expect(frame.locator('.sports-chip__badge', { hasText: /^D$/ }).first()).toBeVisible();
  await expect(frame.locator('.sports-chip__badge', { hasText: /^N$/ }).first()).toBeVisible();
  await expect(frame.locator('#cta-band .sports-chip__cta-tag').first()).toHaveText(/prochain/i);
  await expect(frame.locator('.sports-chip__cta-eyebrow--head', { hasText: /^Prochain$/ })).toHaveCount(0);
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

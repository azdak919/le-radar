import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
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
});

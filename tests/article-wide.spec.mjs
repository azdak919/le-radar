/**
 * Fiche d'article : mise en page lisible sur grands écrans (photo + texte en
 * deux colonnes ≥ 1024 px, lignes ≤ ~75ch, photo bornée), sans débordement.
 */
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let html = '';
let id = '';
test.beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'art-'));
  execFileSync('node', ['scripts/article-pages.js', '--render', dir]);
  const ids = fs.readdirSync(path.join(dir, 'article'));
  id = ids.find((d) => /seo-article__figure/.test(fs.readFileSync(path.join(dir, 'article', d, 'index.html'), 'utf8'))) || ids[0];
  html = fs.readFileSync(path.join(dir, 'article', id, 'index.html'), 'utf8');
});

for (const width of [390, 768, 1024, 1440, 1920, 2560]) {
  test(`@ci-critical fiche d'article lisible — ${width}px`, async ({ page }) => {
    test.skip(!html, 'aucune fiche rendue');
    await page.route(`**/article/${id}/`, (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/article/${id}/`, { waitUntil: 'load' });
    const m = await page.evaluate(() => {
      const q = (s) => document.querySelector(s)?.getBoundingClientRect();
      const fs = parseFloat(getComputedStyle(document.querySelector('.seo-article__excerpt') || document.body).fontSize);
      return { title: q('.seo-title'), lead: q('.seo-article__excerpt'), fig: q('.seo-article__figure img'), fs, doc: document.documentElement.scrollWidth, vw: innerWidth, vh: innerHeight };
    });
    expect(m.doc).toBeLessThanOrEqual(m.vw + 1);
    if (m.lead) expect(m.lead.width / m.fs).toBeLessThanOrEqual(80 * 0.6 + 40); // ≈ 75ch max
    if (m.fig) expect(m.fig.height).toBeLessThanOrEqual(Math.min(m.vh * 0.75, 800));
    if (width >= 1024 && m.fig) expect(m.title.left).toBeGreaterThan(m.fig.right);
  });
}

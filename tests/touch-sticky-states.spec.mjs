import { expect, test } from '@playwright/test';
import { gotoHomeReady } from './home-readiness.mjs';
import { writeFile } from 'node:fs/promises';

// États collants sur écran tactile : chaque bouton ou pastille visible, touché
// puis retouché (ou refermé), doit revenir exactement à son style de repos
// (couleur, bordure, fond). Seuls les éléments réellement sélectionnés au repos
// (onglet actif, aria-pressed/selected/current) sont exclus.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  // Keep action/source traces; explicit screenshots below avoid huge DOM snapshots.
  trace: { mode: 'retain-on-failure', snapshots: false, screenshots: false, sources: true }
});

const PAGES = ['/', '/sports/', '/horaires/'];
test.afterEach(async ({ page }, testInfo) => {
  if (!page.isClosed()) await page.screenshot({ path: testInfo.outputPath('touch-audit-final.png') });
});

const SEL = 'button, [role="button"], [aria-expanded], [aria-pressed], summary, .filter-btn';

for (const path of PAGES) {
  test(`états tactiles revenus au repos : ${path} @ci-critical`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => {
      window.__touchAuditDocument = crypto.randomUUID();
      HTMLMediaElement.prototype.play = () => Promise.resolve();
      // Install once per document, not once per audit/reset.
      document.addEventListener('click', (e) => {
        if (e.target.closest?.('a[href]')) e.preventDefault();
      }, true);
    });
    const documentToken = () => page.evaluate(() => window.__touchAuditDocument);
    if (path === '/') await gotoHomeReady(page);
    else await page.goto(path, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const mark = () => page.evaluate((sel) => {
      const out = [];
      document.querySelectorAll(sel).forEach((el, i) => {
        if (el.disabled || el.closest('[hidden],[inert],[id^="local-lab"]')) return;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        if (!r.width || !r.height || s.visibility === 'hidden' || r.bottom < 0 || r.top > innerHeight) return;
        if (el.closest('a[href]') && !el.matches('button')) return;
        if (el.matches('[aria-pressed="true"],[aria-selected="true"],[aria-current],.active,.is-active')) return;
        if (el.matches('[data-no-touch-audit]')) return;
        el.dataset.touchAudit = String(i);
        out.push(String(i));
      });
      return out;
    }, SEL);
    const ids = await mark();
    const reload = async () => {
      if (path === '/') await gotoHomeReady(page);
      else await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      await mark();
    };
    expect(ids.length).toBeGreaterThan(0);
    const restoreSelection = async () => {
      if (path === '/sports/') {
        const token = await documentToken();
        await page.locator('[data-sports-clear-filters]').click();
        expect(await documentToken()).toBe(token);
        await mark();
      } else {
        await reload();
      }
    };
    const evidence = [];
    const fails = [];
    let covered = 0;
    const skipped = [];
    try {
    for (const id of ids) {
      const el = page.locator(`[data-touch-audit="${id}"]`);
      if (!(await el.isVisible().catch(() => false))) { skipped.push(`${id}:invisible`); continue; }
      const look = () => el.evaluate((e) => {
        const s = getComputedStyle(e);
        return [s.color, s.borderTopColor, s.backgroundColor].join(' | ');
      });
      const rest = await look();
      const url = page.url();
      const token = await documentToken();
      const record = { id, urlBefore: url, started: Date.now(),
        attributes: await el.evaluate(e => Object.fromEntries([...e.attributes].map(a => [a.name, a.value]))) };
      evidence.push(record);
      try {
      await el.tap({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(250);
      record.urlAfter = page.url();
      record.documentReplaced = await documentToken() !== token;
      if (record.documentReplaced) { record.outcome = 'document-navigation'; skipped.push(`${id}:nav`); await reload(); continue; }
      if (await el.isVisible().catch(() => false)) await el.tap({ timeout: 3000, force: true }).catch(() => {});
      await page.waitForTimeout(250);
      if ((await el.getAttribute('aria-expanded').catch(() => null)) === 'true') {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
      }
      record.urlAfter = page.url();
      record.documentReplaced = await documentToken() !== token;
      if (record.documentReplaced) { record.outcome = 'document-navigation'; skipped.push(`${id}:nav`); await reload(); continue; }
      await page.waitForTimeout(400);
      // Sélection voulue (filtre à choix unique, onglet) : pas un état collant.
      if (await el.evaluate((e) => e.matches('[aria-pressed="true"],[aria-selected="true"],[aria-current],.active,.is-active')).catch(() => false)) {
        covered++;
        record.outcome = 'intentional-selection';
        record.queryChanged = page.url() !== url;
        await restoreSelection();
        continue;
      }
      const after = await look().catch(() => rest);
      covered++;
      record.outcome = 'rest-compared';
      if (after !== rest) {
        const name = await el.evaluate((e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${[...e.classList].join('.')}`);
        fails.push(`${name}\n    repos : ${rest}\n    après : ${after}`);
      }
      } finally { record.elapsedMs = Date.now() - record.started; }
    }
    }
    finally {
      const evidencePath = testInfo.outputPath('touch-audit-targets.json');
      await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
      await testInfo.attach('touch-audit-targets', { path: evidencePath, contentType: 'application/json' });
    }
    if (path === '/sports/') {
      // A query-only filter MUST be audited, never silently skipped as navigation.
      expect(evidence.some(e => e.attributes['data-filter-sport'] && e.queryChanged && e.outcome === 'intentional-selection')).toBe(true);
    }
    console.log(`${path} : ${covered} éléments couverts sur ${ids.length}`, skipped.join(' '));
    expect(fails, fails.join('\n')).toEqual([]);
  });
}

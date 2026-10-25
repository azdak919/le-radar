import { expect, test } from '@playwright/test';

// États collants sur écran tactile : chaque bouton ou pastille visible, touché
// puis retouché (ou refermé), doit revenir exactement à son style de repos
// (couleur, bordure, fond). Seuls les éléments réellement sélectionnés au repos
// (onglet actif, aria-pressed/selected/current) sont exclus.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const PAGES = ['/', '/sports/', '/horaires/'];
const SEL = 'button, [role="button"], [aria-expanded], [aria-pressed], summary, .filter-btn';

for (const path of PAGES) {
  test(`états tactiles revenus au repos : ${path} @ci-critical`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto(path, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const mark = () => page.evaluate((sel) => {
      HTMLMediaElement.prototype.play = () => Promise.resolve();
      // Liens : on audite l'état, on ne quitte pas la page.
      document.addEventListener('click', (e) => { if (e.target.closest?.('a[href]')) e.preventDefault(); }, true);
      const out = [];
      document.querySelectorAll(sel).forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        if (!r.width || !r.height || s.visibility === 'hidden' || r.bottom < 0 || r.top > innerHeight) return;
        if (el.closest('a[href]') && !el.matches('button')) return;
        if (el.disabled || el.closest('[hidden],[inert],[id^="local-lab"]')) return;
        if (el.matches('[aria-pressed="true"],[aria-selected="true"],[aria-current],.active,.is-active')) return;
        if (el.matches('[data-no-touch-audit]')) return;
        el.dataset.touchAudit = String(i);
        out.push(String(i));
      });
      return out;
    }, SEL);
    const ids = await mark();
    const reload = async () => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      await mark();
    };
    expect(ids.length).toBeGreaterThan(0);
    const fails = [];
    let covered = 0;
    const skipped = [];
    for (const id of ids) {
      const el = page.locator(`[data-touch-audit="${id}"]`);
      if (!(await el.isVisible().catch(() => false))) { skipped.push(`${id}:invisible`); continue; }
      const look = () => el.evaluate((e) => {
        const s = getComputedStyle(e);
        return [s.color, s.borderTopColor, s.backgroundColor].join(' | ');
      });
      const rest = await look();
      const url = page.url();
      await el.tap({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(250);
      if (page.url() !== url) { skipped.push(`${id}:nav`); await reload(); continue; }
      if (await el.isVisible().catch(() => false)) await el.tap({ timeout: 3000, force: true }).catch(() => {});
      await page.waitForTimeout(250);
      if ((await el.getAttribute('aria-expanded').catch(() => null)) === 'true') {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
      }
      if (page.url() !== url) { skipped.push(`${id}:nav`); await reload(); continue; }
      await page.waitForTimeout(400);
      // Sélection voulue (filtre à choix unique, onglet) : pas un état collant.
      if (await el.evaluate((e) => e.matches('[aria-pressed="true"],[aria-selected="true"],[aria-current],.active,.is-active')).catch(() => false)) {
        covered++;
        await reload();
        continue;
      }
      const after = await look().catch(() => rest);
      covered++;
      if (after !== rest) {
        const name = await el.evaluate((e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${[...e.classList].join('.')}`);
        fails.push(`${name}\n    repos : ${rest}\n    après : ${after}`);
      }
    }
    console.log(`${path} : ${covered} éléments couverts sur ${ids.length}`, skipped.join(' '));
    expect(fails, fails.join('\n')).toEqual([]);
  });
}

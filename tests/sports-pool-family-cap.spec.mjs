import { test, expect } from '@playwright/test';

// Plafond du bandeau sports partagé entre résultats (ouest) et rencontres à
// venir (est). Un dimanche soir, 78 résultats récents ne doivent pas laisser
// seulement 2 matchs à venir : l'est doit pouvoir tourner.
test('plafond partagé : moitié chacun, surplus à l’autre, ordre conservé @ci-critical', async ({ page }) => {
  await page.route('https://**/*', (r) => r.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof sportsCapPoolByFamily === 'function');
  const r = await page.evaluate(() => {
    const res = (i) => ({ key: `r${i}`, mode: 'result', game: {} });
    const nxt = (i) => ({ key: `n${i}`, mode: 'next', game: { date: '2099-01-01' } });
    const heavy = [...Array.from({ length: 90 }, (_, i) => res(i)), ...Array.from({ length: 30 }, (_, i) => nxt(i))];
    const capped = sportsCapPoolByFamily(heavy, 80);
    const fewNext = sportsCapPoolByFamily([...Array.from({ length: 90 }, (_, i) => res(i)), nxt(0), nxt(1)], 80);
    const small = sportsCapPoolByFamily([res(0), nxt(0)], 80);
    return {
      len: capped.length,
      next: capped.filter((s) => s.mode === 'next').length,
      ordered: capped.map((s) => s.key).join() === heavy.filter((s) => capped.includes(s)).map((s) => s.key).join(),
      fewNext: [fewNext.length, fewNext.filter((s) => s.mode === 'next').length],
      small: small.length,
    };
  });
  expect(r.len).toBe(80);
  expect(r.next).toBe(30);           // les 30 à venir gardés (≤ moitié)
  expect(r.ordered).toBe(true);
  expect(r.fewNext).toEqual([80, 2]); // 2 à venir : les 78 autres places aux résultats
  expect(r.small).toBe(2);
});

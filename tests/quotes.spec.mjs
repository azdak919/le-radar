import { expect, test } from '@playwright/test';

test('Pomo expose le catalogue enrichi et les sources vérifiées', async ({ page }) => {
  await page.goto('/pomo/', { waitUntil: 'domcontentloaded' });

  const catalog = await page.evaluate(() => ({
    total: QUOTES.length,
    indigenous: QUOTES.filter((quote) => quote.category === 'indigenous').length,
    verified: QUOTES.filter((quote) =>
      quote.category === 'indigenous' && quote.verificationStatus === 'verified'
    ).length,
  }));

  expect(catalog).toEqual({ total: 150, indigenous: 43, verified: 25 });

  await page.evaluate(() => {
    const quote = QUOTES.find((entry) => entry.id === 'src-hemlock-language-earth');
    document.getElementById('quote-author').textContent = quote.authorEn;
    window.AtaraxiaQuotes.syncQuoteSource(quote);
  });

  const author = page.locator('#quote-author');
  await expect(author).toHaveAttribute('href', /un\.org\/development\/desa/);
  await expect(author).toHaveAttribute('target', '_blank');
  await expect(author).toHaveAttribute('rel', 'noopener noreferrer');
});

test('Pomo garantit la diversité et évite les 26 dernières citations', async ({ page }) => {
  await page.goto('/pomo/', { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(() => {
    const recent = [];
    let nonIndigenousRun = 0;
    let longestRun = 0;
    let indigenous = 0;

    for (let draw = 0; draw < 400; draw += 1) {
      const index = window.AtaraxiaQuotes.getRandomQuoteIndex();
      if (recent.slice(-26).includes(index)) {
        return { duplicateAt: draw, longestRun, indigenous };
      }
      window.AtaraxiaQuotes.recordQuoteSeen(index);
      recent.push(index);

      if (QUOTES[index].category === 'indigenous') {
        indigenous += 1;
        nonIndigenousRun = 0;
      } else {
        nonIndigenousRun += 1;
        longestRun = Math.max(longestRun, nonIndigenousRun);
      }
    }

    return { duplicateAt: null, longestRun, indigenous };
  });

  expect(result.duplicateAt).toBeNull();
  expect(result.longestRun).toBeLessThanOrEqual(4);
  expect(result.indigenous).toBeGreaterThanOrEqual(88);
});

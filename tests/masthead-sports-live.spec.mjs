import { expect, test } from '@playwright/test';

/**
 * Carte CTA « En cours » — match live (Saint-Hyacinthe — Vanier, 23 août 2026).
 * Fuseau forcé Québec : sportsGameMs parse la date/heure en local navigateur.
 */
test.use({ timezoneId: 'America/Toronto' });

function torontoParts(ms = Date.now()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

function livePayload({ score, period } = {}) {
  const kick = torontoParts(Date.now() - 8 * 60 * 1000);
  const game = {
    date: kick.date,
    time: kick.time,
    opponent: 'Vanier',
    opponentCode: 'VAN',
    opponentFullName: 'Vanier College',
    home: true,
    sport: 'soccer',
    competition: 'Soccer collégial masculin D1',
    gameId: 'c4635a89-92f1-42b9-bb3a-b2604bbf36d6',
    url: 'https://diffusion.rseq.ca/Default.aspx?Type=Game&GameId=c4635a89-92f1-42b9-bb3a-b2604bbf36d6',
    live: true,
  };
  if (score) {
    game.scoreFor = score[0];
    game.scoreAgainst = score[1];
  }
  if (period) game.period = period;
  return {
    updated: new Date().toISOString(),
    source: 'test-live',
    teams: {
      'collegial:soccer:sth-live': {
        id: 'collegial:soccer:sth-live',
        name: 'Saint-Hyacinthe',
        fullName: 'Cégep de Saint-Hyacinthe',
        code: 'STH',
        sector: 'collegial',
        sport: 'soccer',
        sportLabel: 'Soccer',
        sex: 'M',
        division: 'D1',
        leagueLabel: 'Soccer collégial masculin D1',
        province: 'QC',
        lastGame: null,
        nextGame: game,
        nextGames: [game],
        results: [],
      },
    },
  };
}

async function openWithSports(page, payload) {
  await page.route('**/sports.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  const cta = strip.locator('.sports-chip--cta').last();
  await expect(cta).toBeVisible({ timeout: 8000 });
  return cta;
}

test('CTA live : En cours, équipes, pas « dans 15 min »', async ({ page }) => {
  const cta = await openWithSports(page, livePayload());
  await expect(cta).toHaveAttribute('data-cta-state', 'live');
  await expect(cta.locator('.sports-chip__cta-tag')).toHaveText('En cours');
  const text = await cta.locator('.sports-chip__cta-text').innerText();
  expect(text).toMatch(/Saint-Hyacinthe/);
  expect(text).toMatch(/Vanier/);
  expect(text).toMatch(/reçoit/);
  const vs = cta.locator('.sports-chip__vs');
  await expect(vs).toHaveText('reçoit');
  const pale = await cta.evaluate((root) => {
    const vsEl = root.querySelector('.sports-chip__vs');
    const nameEl = root.querySelector('.sports-chip__name');
    const vsCs = getComputedStyle(vsEl);
    const nameCs = getComputedStyle(nameEl);
    return {
      vsWeight: Number(vsCs.fontWeight),
      nameWeight: Number(nameCs.fontWeight),
      vsColor: vsCs.color,
      vsSize: Number.parseFloat(vsCs.fontSize),
      nameSize: Number.parseFloat(nameCs.fontSize),
    };
  });
  expect(pale.vsWeight, 'verbe Inter 500, pas le 700 des noms').toBe(500);
  expect(pale.nameWeight, 'noms plus gras que le verbe').toBeGreaterThanOrEqual(700);
  expect(pale.vsSize, 'verbe un peu plus petit que les noms').toBeLessThan(pale.nameSize);
  const sub = await cta.locator('.sports-chip__cta-sub-text').innerText();
  expect(sub).toMatch(/Soccer collégial masculin D1/);
  expect(sub.toLowerCase()).not.toMatch(/dans \d/);
  expect(sub.toLowerCase()).not.toMatch(/à l[’']instant/);
  expect(sub.toLowerCase()).not.toMatch(/il y a/);
});

test('CTA live : score et période dès qu’ils sont collés', async ({ page }) => {
  const cta = await openWithSports(page, livePayload({
    score: [1, 0],
    period: '1re mi-temps',
  }));
  await expect(cta).toHaveAttribute('data-cta-state', 'live');
  await expect(cta.locator('.sports-chip__cta-tag')).toHaveText('En cours');
  const text = await cta.locator('.sports-chip__cta-text').innerText();
  expect(text).toMatch(/Saint-Hyacinthe/);
  expect(text).toMatch(/1–0/);
  expect(text).toMatch(/Vanier/);
  expect(text).not.toMatch(/reçoit/);
  const sub = await cta.locator('.sports-chip__cta-sub-text').innerText();
  expect(sub).toMatch(/1re mi-temps/);
  expect(sub).toMatch(/Soccer collégial masculin D1/);
});

import { expect, test } from '@playwright/test';

/**
 * Voile — carte d’accueil compacte (retour 2026-10-26 : « ridiculement trop long »).
 * Régate en cours, résultat frais (priorité 24 h) et régate en attente (hors bandeau).
 * Aucune troncature ni débordement à 360 et 390 px.
 */
test.use({ timezoneId: 'America/Toronto' });

function ymd(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date(ms));
}
const DAY = 86400000;

function club(id, name) {
  return {
    id: `sailing:universitaire:${id}`, name, code: 'UCON', sector: 'universitaire', sport: 'sailing',
    sportLabel: 'Voile', sex: null, division: 'CICSA', leagueLabel: 'CICSA · association étudiante QC',
    province: 'QC', source: 'cicsa', registryId: id, fullName: 'Université Concordia',
    kind: 'association-etudiante', results: [], lastGame: null, nextGame: null, nextGames: [],
  };
}

export function sailingPayload(kind) {
  const now = Date.now();
  const team = club('concordia', 'Concordia Sailing');
  const base = {
    time: '', opponent: 'Championnat canadien par équipes', opponentEn: 'Team Race Nationals',
    opponentFullName: 'Team Race Nationals · PCYC', opponentCode: 'CICS', home: null, sport: 'sailing',
    scoreKind: 'place', competition: 'Voile universitaire · CICSA',
    opponentShort: 'Canadiens équipes', competitionShort: 'CICSA', url: 'https://cicsailing.ca/season-results',
  };
  if (kind === 'during' || kind === 'awaiting') {
    const start = kind === 'during' ? ymd(now - DAY) : ymd(now - 3 * DAY);
    const end = kind === 'during' ? ymd(now + DAY) : ymd(now - 2 * DAY);
    const g = { ...base, date: start, eventStart: start, eventEnd: end, gameId: `cicsa-next:${start}:t:concordia:1` };
    if (kind === 'awaiting') g.awaitingResults = true;
    team.nextGame = g; team.nextGames = [g];
  } else {
    const d = ymd(now - DAY);
    const g = { ...base, date: d, gameId: `cicsa:${d}:t:concordia:1`, scoreFor: 3, scoreAgainst: 14, result: 'W',
      resultsSeenAt: new Date(now - 3600 * 1000).toISOString() };
    team.lastGame = g; team.results = [g];
  }
  // Match de soccer témoin : le bandeau ne s’affiche pas sans contenu « match ».
  const filler = {
    id: 'collegial:soccer:sth', name: 'Saint-Hyacinthe', fullName: 'Cégep de Saint-Hyacinthe', code: 'STH',
    sector: 'collegial', sport: 'soccer', sportLabel: 'Soccer', sex: 'M', division: 'D1',
    leagueLabel: 'Soccer collégial masculin D1', province: 'QC', results: [], lastGame: null,
  };
  const fg = { date: ymd(now + 2 * DAY), time: '19:00', opponent: 'Vanier', opponentCode: 'VAN',
    opponentFullName: 'Vanier College', home: true, sport: 'soccer', competition: 'Soccer collégial masculin D1' };
  filler.nextGame = fg; filler.nextGames = [fg];
  return { updated: new Date().toISOString(), source: 'test-sailing', teams: { [team.id]: team, [filler.id]: filler } };
}

async function open(page, payload, width) {
  await page.route('https://s1.rseq.ca/**', (r) => r.abort());
  await page.route('**/sports-masthead.json', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(payload),
  }));
  await page.setViewportSize({ width, height: 800 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#masthead-sports-strip')).toBeVisible({ timeout: 8000 });
}

async function sailChip(page) {
  const chip = page.locator('#masthead-sports-strip .sports-chip[data-sports-sport="sailing"]').first();
  await expect(chip).toBeVisible({ timeout: 8000 });
  return chip;
}

async function assertNoOverflow(chip) {
  const m = await chip.evaluate((el) => {
    const pairs = [['.sports-chip__line', '.sports-chip__line-inner'], ['.sports-chip__sub', '.sports-chip__sub-text']];
    return pairs.map(([v, i]) => {
      const view = el.querySelector(v); const inner = el.querySelector(i);
      if (!view || !inner) return { over: 0, ell: false };
      const ell = [view, inner].some((n) => getComputedStyle(n).textOverflow === 'ellipsis' && n.scrollWidth > n.clientWidth + 1);
      return { over: inner.scrollWidth - view.clientWidth, ell, text: inner.innerText };
    });
  });
  for (const r of m) {
    expect(r.over, `déborde : ${r.text}`).toBeLessThanOrEqual(1);
    expect(r.ell).toBe(false);
    expect(r.text || '').not.toMatch(/…|Sailing|Championnat/);
  }
}

for (const width of [360, 390]) {
  test(`voile en cours : compacte à ${width} px`, async ({ page }) => {
    await open(page, sailingPayload('during'), width);
    const chip = await sailChip(page);
    await expect(chip.locator('.sports-chip__cta-tag')).toHaveText(/En\s*cours/i);
    await expect(chip.locator('.sports-chip__line-inner')).toHaveText(/Concordia\s*·\s*Canadiens équipes/);
    await expect(chip.locator('.sports-chip__sub-text')).toHaveText(/^\s*CICSA\s*$/);
    await assertNoOverflow(chip);
  });

  test(`voile résultat frais : rang réel, compacte à ${width} px`, async ({ page }) => {
    await open(page, sailingPayload('result'), width);
    const chip = await sailChip(page);
    await expect(chip.locator('.sports-chip__sub-text')).toHaveText(/3e\/14\s*·\s*CICSA/);
    await assertNoOverflow(chip);
  });
}

test('voile terminée sans résultats : pas choisie dans le bandeau', async ({ page }) => {
  await open(page, sailingPayload('awaiting'), 390);
  await page.waitForTimeout(1500);
  await expect(page.locator('#masthead-sports-strip .sports-chip[data-sports-sport="sailing"]')).toHaveCount(0);
});

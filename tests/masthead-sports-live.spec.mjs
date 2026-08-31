import { expect, test } from '@playwright/test';

/**
 * Carte CTA « En cours » — match live (Saint-Hyacinthe — Vanier, 23 août 2026).
 * Fuseau forcé Québec : sportsGameMs parse la date/heure en local navigateur.
 */
test.use({ timezoneId: 'America/Toronto' });

/** Offset encore aujourd’hui (Toronto). Null après ~23 h. */
function todayUpcomingOffsetMs(hours = [3, 2, 1.25, 0.75, 0.5]) {
  const now = Date.now();
  const today = torontoParts(now).date;
  return hours.map((h) => h * 3600 * 1000)
    .find((ms) => torontoParts(now + ms).date === today) || null;
}

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

function teamShell(id, { name, fullName, code, sport = 'soccer' }) {
  return {
    id,
    name,
    fullName,
    code,
    sector: 'collegial',
    sport,
    sportLabel: sport === 'hockey' ? 'Hockey' : 'Soccer',
    sex: 'M',
    division: 'D1',
    leagueLabel: sport === 'hockey' ? 'Hockey collégial masculin D1' : 'Soccer collégial masculin D1',
    province: 'QC',
    lastGame: null,
    nextGame: null,
    nextGames: [],
    results: [],
  };
}

function liveKickGame({
  opponent,
  opponentCode,
  opponentFullName,
  offsetMs = -8 * 60 * 1000,
  sport = 'soccer',
  extra = {},
} = {}) {
  const kick = torontoParts(Date.now() + offsetMs);
  return {
    date: kick.date,
    time: kick.time,
    opponent,
    opponentCode,
    opponentFullName,
    home: true,
    sport,
    competition: sport === 'hockey' ? 'Hockey collégial masculin D1' : 'Soccer collégial masculin D1',
    live: true,
    ...extra,
  };
}

function yesterdayResultGame() {
  const { date } = torontoParts();
  const noon = Date.parse(`${date}T12:00:00`);
  const y = torontoParts(noon - 86400000);
  return {
    date: y.date,
    time: '19:00',
    opponent: 'Concordia',
    opponentCode: 'CON',
    opponentFullName: 'Concordia',
    home: true,
    sport: 'soccer',
    competition: 'Soccer collégial masculin D1',
    scoreFor: 2,
    scoreAgainst: 1,
    final: true,
  };
}

function civilDaysAgoResultGame(daysBack, extra = {}) {
  const { date } = torontoParts();
  const noon = Date.parse(`${date}T12:00:00`);
  const past = torontoParts(noon - daysBack * 86400000);
  return {
    date: past.date,
    time: '17:00',
    opponent: 'Vanier',
    opponentCode: 'VAN',
    opponentFullName: 'Vanier College',
    home: true,
    sport: 'soccer',
    competition: 'Soccer collégial masculin D1',
    scoreFor: 3,
    scoreAgainst: 0,
    result: 'W',
    final: true,
    ...extra,
  };
}

function livePayload({ score, period, offsetMs = -8 * 60 * 1000 } = {}) {
  const game = liveKickGame({
    opponent: 'Vanier',
    opponentCode: 'VAN',
    opponentFullName: 'Vanier College',
    offsetMs,
    extra: {
      gameId: 'c4635a89-92f1-42b9-bb3a-b2604bbf36d6',
      url: 'https://diffusion.rseq.ca/Default.aspx?Type=Game&GameId=c4635a89-92f1-42b9-bb3a-b2604bbf36d6',
    },
  });
  if (score) {
    game.scoreFor = score[0];
    game.scoreAgainst = score[1];
  }
  if (period) game.period = period;
  const team = teamShell('collegial:soccer:sth-live', {
    name: 'Saint-Hyacinthe',
    fullName: 'Cégep de Saint-Hyacinthe',
    code: 'STH',
  });
  team.nextGame = game;
  team.nextGames = [game];
  return {
    updated: new Date().toISOString(),
    source: 'test-live',
    teams: { [team.id]: team },
  };
}

function livePlusYesterdayPayload() {
  const live = livePayload();
  const result = yesterdayResultGame();
  const other = teamShell('collegial:soccer:con-result', {
    name: 'Concordia',
    fullName: 'Concordia',
    code: 'CON',
  });
  other.lastGame = result;
  other.results = [result];
  return {
    ...live,
    teams: { ...live.teams, [other.id]: other },
  };
}

function twoLivePlusResultPayload() {
  const mixed = livePlusYesterdayPayload();
  const secondKick = liveKickGame({
    opponent: 'McGill',
    opponentCode: 'MCG',
    opponentFullName: 'McGill',
    offsetMs: -4 * 60 * 1000,
    sport: 'hockey',
  });
  const laval = teamShell('collegial:hockey:lav-live', {
    name: 'Laval',
    fullName: 'Cégep de Sainte-Foy',
    code: 'LAV',
    sport: 'hockey',
  });
  laval.nextGame = secondKick;
  laval.nextGames = [secondKick];
  return {
    ...mixed,
    teams: { ...mixed.teams, [laval.id]: laval },
  };
}

function yesterdayOnlyPayload() {
  const result = yesterdayResultGame();
  const team = teamShell('collegial:soccer:sth-result', {
    name: 'Saint-Hyacinthe',
    fullName: 'Cégep de Saint-Hyacinthe',
    code: 'STH',
  });
  team.lastGame = result;
  team.results = [result];
  return {
    updated: new Date().toISOString(),
    source: 'test-live',
    teams: { [team.id]: team },
  };
}

function upcomingTomorrowPayload() {
  const { date } = torontoParts();
  const noon = Date.parse(`${date}T12:00:00`);
  const t = torontoParts(noon + 86400000);
  const game = {
    date: t.date,
    time: '19:00',
    opponent: 'Vanier',
    opponentCode: 'VAN',
    opponentFullName: 'Vanier College',
    home: true,
    sport: 'soccer',
    competition: 'Soccer collégial masculin D1',
    live: false,
  };
  const team = teamShell('collegial:soccer:sth-tomorrow', {
    name: 'Saint-Hyacinthe',
    fullName: 'Cégep de Saint-Hyacinthe',
    code: 'STH',
  });
  team.nextGame = game;
  team.nextGames = [game];
  return {
    updated: new Date().toISOString(),
    source: 'test-live',
    teams: { [team.id]: team },
    _kick: { date: t.date, time: '19:00' },
  };
}

function upcomingTodayPayload(offsetMs = 3 * 3600 * 1000) {
  const kick = torontoParts(Date.now() + offsetMs);
  const game = liveKickGame({
    opponent: 'Vanier',
    opponentCode: 'VAN',
    opponentFullName: 'Vanier College',
    offsetMs,
    extra: { live: false },
  });
  const team = teamShell('collegial:soccer:sth-next', {
    name: 'Saint-Hyacinthe',
    fullName: 'Cégep de Saint-Hyacinthe',
    code: 'STH',
  });
  team.nextGame = game;
  team.nextGames = [game];
  return {
    updated: new Date().toISOString(),
    source: 'test-live',
    teams: { [team.id]: team },
    _kick: kick,
  };
}

async function openWithSports(page, payload, viewport = { width: 1280, height: 900 }) {
  await page.route('**/sports-masthead.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
  await page.setViewportSize(viewport);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  const cta = strip.locator('.sports-chip--cta').last();
  await expect(cta).toBeVisible({ timeout: 8000 });
  return cta;
}

function kickoffClockFromPayload(payload) {
  const game = Object.values(payload.teams || {})[0]?.nextGame;
  const t = String(game?.time || '');
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1]} h ${m[2]}` : '';
}

test('CTA live : En cours, scorebug et tampon, pas « dans 15 min »', async ({ page }) => {
  const payload = livePayload();
  const cta = await openWithSports(page, payload);
  await expect(cta).toHaveAttribute('data-cta-state', 'live');
  await expect(cta.locator('.sports-chip__cta-tag')).toHaveText(/En\s*direct/i);
  await expect(cta.locator('.sports-chip__cta-glyph')).toBeVisible();
  await expect(cta.locator('.sports-chip__score')).toHaveText('0–0');
  const text = await cta.locator('.sports-chip__cta-text').innerText();
  expect(text).toMatch(/Saint-Hyacinthe/);
  expect(text).toMatch(/Vanier/);
  expect(text).not.toMatch(/reçoit/);
  const sub = await cta.locator('.sports-chip__cta-sub-text').innerText();
  const kick = kickoffClockFromPayload(payload);
  expect(kick).toBeTruthy();
  expect(sub).toMatch(new RegExp(kick.replace(' ', '\\s+')));
  expect(sub).toMatch(/Soccer collégial masculin D1/);
  expect(sub).not.toMatch(new RegExp(`mis à jour à\\s+${kick.replace(' ', '\\s+')}`));
  expect(sub.toLowerCase()).not.toMatch(/dans \d/);
  expect(sub.toLowerCase()).not.toMatch(/à l[’']instant/);
  expect(sub.toLowerCase()).not.toMatch(/il y a/);
});

test('CTA live : pas « il y a 2 min » sous En cours', async ({ page }) => {
  const payload = livePayload({ offsetMs: -2 * 60 * 1000 });
  const cta = await openWithSports(page, payload);
  await expect(cta).toHaveAttribute('data-cta-state', 'live');
  await expect(cta.locator('.sports-chip__cta-tag')).toHaveText(/En\s*direct/i);
  await expect(cta.locator('.sports-chip__score')).toHaveText('0–0');
  const sub = await cta.locator('.sports-chip__cta-sub-text').innerText();
  const kick = kickoffClockFromPayload(payload);
  expect(sub).toMatch(new RegExp(kick.replace(' ', '\\s+')));
  expect(sub).toMatch(/Soccer collégial masculin D1/);
  expect(sub).not.toMatch(new RegExp(`mis à jour à\\s+${kick.replace(' ', '\\s+')}`));
  expect(sub.toLowerCase()).not.toMatch(/il y a/);
  expect(sub.toLowerCase()).not.toMatch(/à l[’']instant/);
  expect(sub.toLowerCase()).not.toMatch(/dans \d/);
});

test('CTA live : score et période dès qu’ils sont collés', async ({ page }) => {
  const cta = await openWithSports(page, livePayload({
    score: [1, 0],
    period: '1re mi-temps',
  }));
  await expect(cta).toHaveAttribute('data-cta-state', 'live');
  await expect(cta.locator('.sports-chip__cta-tag')).toHaveText(/En\s*direct/i);
  await expect(cta.locator('.sports-chip__cta-glyph')).toBeVisible();
  await expect(cta.locator('.sports-chip__score')).toHaveText('1–0');
  const text = await cta.locator('.sports-chip__cta-text').innerText();
  expect(text).toMatch(/Saint-Hyacinthe/);
  expect(text).toMatch(/Vanier/);
  expect(text).not.toMatch(/reçoit/);
  const sub = await cta.locator('.sports-chip__cta-sub-text').innerText();
  expect(sub).toMatch(/Soccer collégial masculin D1/);
  expect(sub).toMatch(/mis à jour à/);
  expect(sub).toMatch(/\d{1,2}\s*h\s*\d{2}/);
});

test('CTA live : un direct écarte résultats et prochains du cycle', async ({ page }) => {
  const cta = await openWithSports(page, livePlusYesterdayPayload());
  await expect(cta).toHaveAttribute('data-cta-state', 'live');
  await expect(cta.locator('.sports-chip__cta-tag')).toHaveText(/En\s*direct/i);
  const text = await cta.locator('.sports-chip__cta-text').innerText();
  expect(text).toMatch(/Saint-Hyacinthe/);
  expect(text).not.toMatch(/Concordia/);
  const pool = await page.evaluate(() => sportsCtaCandidateSlides().map((s) => ({
    live: sportsGameIsLive(s.game),
    name: s.team?.name || '',
    mode: s.mode,
  })));
  expect(pool[0].live, 'tête de liste B = le direct').toBe(true);
  expect(pool[0].name).toMatch(/Saint-Hyacinthe/);
  expect(pool.some((s) => /Concordia/i.test(s.name)), 'hier reste en reliquat').toBe(true);
  await page.evaluate(() => {
    scheduleSportsWave({ fromSlot: 0, firstWait: false });
  });
  await page.waitForTimeout(900);
  const still = page.locator('#masthead-sports-strip .sports-chip--cta').last();
  await expect(still).toHaveAttribute('data-cta-state', 'live');
  const after = await still.locator('.sports-chip__cta-text').innerText();
  expect(after).toMatch(/Saint-Hyacinthe/);
  expect(after).not.toMatch(/Concordia/);
});

test('CTA live : plusieurs directs — cycle entre eux, pas le reste', async ({ page }) => {
  const cta = await openWithSports(page, twoLivePlusResultPayload());
  await expect(cta).toHaveAttribute('data-cta-state', 'live');
  const pool = await page.evaluate(() => sportsCtaCandidateSlides().map((s) => ({
    live: sportsGameIsLive(s.game),
    name: s.team?.name || '',
  })));
  expect(pool.filter((s) => s.live).length, 'deux directs en tête').toBe(2);
  expect(pool[0].live).toBe(true);
  expect(pool[1].live).toBe(true);
  expect(pool.some((s) => /Saint-Hyacinthe/i.test(s.name))).toBe(true);
  expect(pool.some((s) => /Laval/i.test(s.name))).toBe(true);
  const firstNonLive = pool.findIndex((s) => !s.live);
  expect(firstNonLive, 'Concordia après les directs').toBeGreaterThanOrEqual(2);

  const first = (await cta.locator('.sports-chip__cta-text').innerText()).replace(/\s+/g, ' ');
  await page.evaluate(() => {
    rotateSportsSlot(sportsCtaSlotIndex());
  });
  await expect.poll(async () => {
    const chip = page.locator('#masthead-sports-strip .sports-chip--cta').last();
    const state = await chip.getAttribute('data-cta-state');
    const text = (await chip.locator('.sports-chip__cta-text').innerText()).replace(/\s+/g, ' ');
    return `${state}|${text}`;
  }, { timeout: 4000 }).not.toBe(`live|${first}`);
  const next = page.locator('#masthead-sports-strip .sports-chip--cta').last();
  await expect(next).toHaveAttribute('data-cta-state', 'live');
  const second = (await next.locator('.sports-chip__cta-text').innerText()).replace(/\s+/g, ' ');
  expect(second).not.toBe(first);
  expect(second).not.toMatch(/Concordia/);
  expect(second).toMatch(/Saint-Hyacinthe|Laval|Sainte-Foy/);
});

test('iPad tactile : la CTA participe à la cascade', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 820, height: 1180 },
    timezoneId: 'America/Toronto',
  });
  const page = await context.newPage();
  try {
    const cta = await openWithSports(
      page,
      twoLivePlusResultPayload(),
      { width: 820, height: 1180 },
    );
    const first = (await cta.locator('.sports-chip__cta-text').innerText())
      .replace(/\s+/g, ' ');
    expect(await page.evaluate(() => sportsCtaMayRotate())).toBe(true);
    await page.evaluate(() => scheduleSportsWave({ fromSlot: 0, firstWait: false }));
    await expect.poll(async () => {
      const chip = page.locator('#masthead-sports-strip .sports-chip--cta').last();
      return (await chip.locator('.sports-chip__cta-text').innerText()).replace(/\s+/g, ' ');
    }, { timeout: 4000 }).not.toBe(first);
  } finally {
    await context.close();
  }
});

test('téléphone avec CTA seule : le changement est une sortie/entrée de carte', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    timezoneId: 'America/Toronto',
  });
  const page = await context.newPage();
  try {
    await openWithSports(
      page,
      twoLivePlusResultPayload(),
      { width: 390, height: 844 },
    );
    await page.evaluate(() => {
      sportsFitCount = 1;
      renderSportsStrip();
      clearSportsSlotTimers();
    });
    const cta = page.locator('#masthead-sports-strip .sports-chip--cta');
    await expect(cta).toBeVisible();
    await expect(page.locator('#masthead-sports-strip .sports-chip')).toHaveCount(1);
    const first = (await cta.locator('.sports-chip__cta-text').innerText()).replace(/\s+/g, ' ');

    const swap = await page.evaluate(() => {
      rotateSportsSlot(0);
      const el = document.querySelector('#masthead-sports-strip .sports-chip--cta');
      return {
        leaving: !!el?.classList.contains('is-leaving'),
        rolling: !!el?.querySelector('.is-rolling-in, .is-rolling-out'),
        n: document.querySelectorAll('#masthead-sports-strip .sports-chip').length,
        leaveName: el ? getComputedStyle(el).animationName : '',
      };
    });
    expect(swap.n, 'toujours une seule carte').toBe(1);
    expect(swap.leaving, 'sortie carte entière').toBe(true);
    expect(swap.rolling, 'pas de roulement interne').toBe(false);
    expect(swap.leaveName).toMatch(/sports-chip-leave/);

    await expect.poll(async () => {
      const current = page.locator('#masthead-sports-strip .sports-chip--cta');
      return (await current.locator('.sports-chip__cta-text').innerText())
        .replace(/\s+/g, ' ');
    }, { timeout: 2000 }).not.toBe(first);
  } finally {
    await context.close();
  }
});

test('CTA : sans direct, le cycle reprend (résultat hier)', async ({ page }) => {
  const cta = await openWithSports(page, yesterdayOnlyPayload());
  await expect(cta).not.toHaveAttribute('data-cta-state', 'live');
  const tag = await cta.locator('.sports-chip__cta-tag').innerText();
  expect(tag).toMatch(/hier|aujourd/i);
  if (/hier/i.test(tag)) {
    const [r, g] = await cta.locator('.sports-chip__cta-tag').evaluate((el) => {
      const m = (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      return m;
    });
    expect(g, 'Hier : pastille pourpre, pas verte').toBeLessThan(70);
    expect(r - g, 'Hier : pastille pourpre (R>G)').toBeGreaterThan(40);
  }
  const text = await cta.locator('.sports-chip__cta-text').innerText();
  expect(text).toMatch(/Saint-Hyacinthe|Concordia/);
  const sub = await cta.locator('.sports-chip__cta-sub-text').innerText();
  expect(sub.toLowerCase()).not.toMatch(/il y a/);
  const pool = await page.evaluate(() => sportsCtaCandidateSlides().map((s) => ({
    live: sportsGameIsLive(s.game),
    mode: s.mode,
  })));
  expect(pool.length).toBeGreaterThanOrEqual(1);
  expect(pool.every((s) => !s.live)).toBe(true);
  expect(pool.some((s) => s.mode === 'result')).toBe(true);
});

test('CTA : sans live, à-venir d’aujourd’hui avant hier', async ({ page }) => {
  const offset = todayUpcomingOffsetMs();
  test.skip(!offset, 'trop tard : plus de coup d’envoi aujourd’hui');
  const y = yesterdayResultGame();
  const tY = teamShell('collegial:soccer:yest', {
    name: 'Concordia', fullName: 'Concordia', code: 'CON',
  });
  tY.lastGame = y;
  tY.results = [y];
  const later = upcomingTodayPayload(offset);
  const tNext = Object.values(later.teams)[0];
  await openWithSports(page, {
    updated: new Date().toISOString(),
    source: 'test-live',
    teams: { [tY.id]: tY, [tNext.id]: tNext },
  });
  const seq = await page.evaluate(() => sportsCtaCandidateSlides().map((s) => ({
    mode: s.mode,
    code: s.team?.code || '',
  })));
  expect(seq[0], 'B : ce soir avant hier').toMatchObject({ mode: 'next', code: 'STH' });
  expect(seq.some((s) => s.mode === 'result' && s.code === 'CON'), 'hier en reliquat').toBe(true);
  const cta = page.locator('#masthead-sports-strip .sports-chip--cta').last();
  await expect(cta.locator('.sports-chip__cta-tag')).toHaveText(/À\s*venir/i);
});

test('CTA : à venir dans l’heure passe devant hier', async ({ page }) => {
  const offset = todayUpcomingOffsetMs([0.75, 0.5, 0.35]);
  test.skip(!offset, 'trop tard : plus de coup d’envoi dans l’heure aujourd’hui');
  const y = yesterdayResultGame();
  const tY = teamShell('collegial:soccer:yest', {
    name: 'Concordia', fullName: 'Concordia', code: 'CON',
  });
  tY.lastGame = y;
  tY.results = [y];
  const soon = upcomingTodayPayload(offset);
  const tNext = Object.values(soon.teams)[0];
  await openWithSports(page, {
    updated: new Date().toISOString(),
    source: 'test-live',
    teams: { [tY.id]: tY, [tNext.id]: tNext },
  });
  const seq = await page.evaluate(() => sportsCtaCandidateSlides().map((s) => ({
    mode: s.mode,
    code: s.team?.code || '',
  })));
  expect(seq[0], 'dans l’heure avant hier').toMatchObject({ mode: 'next', code: 'STH' });
  expect(seq.some((s) => s.mode === 'result' && s.code === 'CON')).toBe(true);
  const cta = page.locator('#masthead-sports-strip .sports-chip--cta').last();
  await expect(cta).toHaveAttribute('data-cta-state', 'next');
  await expect(cta.locator('.sports-chip__cta-tag')).toHaveText(/À\s*venir/i);
});

test('CTA prochain du jour : heure de coup d’envoi, pas « dans 3 h »', async ({ page }) => {
  const now = Date.now();
  const today = torontoParts(now).date;
  // Même jour civil, hors de la fenêtre « dans X min » (dernière heure).
  const offsetMs = [3, 2, 1.25].map((h) => h * 3600 * 1000)
    .find((ms) => torontoParts(now + ms).date === today);
  test.skip(!offsetMs, 'trop tard : plus de coup d’envoi aujourd’hui hors de la dernière heure');
  const payload = upcomingTodayPayload(offsetMs);
  const cta = await openWithSports(page, payload);
  await expect(cta).toHaveAttribute('data-cta-state', 'next');
  await expect(cta.locator('.sports-chip__cta-tag')).toHaveText(/À\s*venir/i);
  await expect(cta.locator('.sports-chip__cta-tag-lines')).toHaveCount(0);
  await expect(cta.locator('.sports-chip__cta-glyph')).toBeVisible();
  await expect(cta).toHaveAttribute('data-cta-lamp', 'soon');
  const clock = payload._kick.time.replace(':', ' h ');
  const sub = await cta.locator('.sports-chip__cta-sub-text').innerText();
  expect(sub).toMatch(/Aujourd[’']hui/);
  expect(sub).toMatch(new RegExp(clock.replace(' ', '\\s+')));
  expect(sub.toLowerCase()).not.toMatch(/dans \d/);
  expect(sub.toLowerCase()).not.toMatch(/il y a/);
});

test('CTA À venir : cet AM le matin, ce PM l’après-midi', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const lines = await page.evaluate(() => ({
    am: sportsMeridiemLine({ time: '09:30' }, { today: true }),
    noon: sportsMeridiemLine({ time: '12:00' }, { today: true }),
    pm: sportsMeridiemLine({ time: '18:15' }, { today: true }),
    hierPm: sportsMeridiemLine({ time: '18:15' }, { today: false }),
    demainAm: sportsMeridiemLine({ time: '09:30' }, { today: false }),
    empty: sportsMeridiemLine({ time: '' }, { today: true }),
  }));
  expect(lines.am).toBe('cet AM');
  expect(lines.noon).toBe('ce PM');
  expect(lines.pm).toBe('ce PM');
  expect(lines.hierPm, 'hier : pas « ce PM »').toBe('PM');
  expect(lines.demainAm, 'demain : pas « cet AM »').toBe('AM');
  expect(lines.empty).toBe('');
});

test('CTA visiteur : chez l’adversaire, pas à', async ({ page }) => {
  const game = liveKickGame({
    opponent: 'Carabins',
    opponentCode: 'MTL',
    opponentFullName: 'Carabins',
    offsetMs: 3 * 3600 * 1000,
    extra: { live: false, home: false },
  });
  const team = teamShell('collegial:soccer:sth-away', {
    name: 'Rouge et Or',
    fullName: 'Université Laval',
    code: 'LAV',
  });
  team.nextGame = game;
  team.nextGames = [game];
  const cta = await openWithSports(page, {
    updated: new Date().toISOString(),
    source: 'test-live',
    teams: { [team.id]: team },
  });
  await expect(cta).toHaveAttribute('data-cta-state', 'next');
  const vs = cta.locator('.sports-chip__vs');
  await expect(vs).toHaveText('chez');
  const text = await cta.locator('.sports-chip__cta-text').innerText();
  expect(text).toMatch(/Carabins/);
  expect(text).not.toMatch(/\sà\s/);
});

test('CTA demain : pastille Demain, heure, pas Prochain match', async ({ page }) => {
  const payload = upcomingTomorrowPayload();
  const cta = await openWithSports(page, payload);
  await expect(cta).toHaveAttribute('data-cta-state', 'next');
  await expect(cta.locator('.sports-chip__cta-tag')).toHaveText(/^Demain$/i);
  await expect(cta.locator('.sports-chip__cta-tag-lines')).toHaveCount(0);
  await expect(cta.locator('.sports-chip__cta-glyph')).toBeVisible();
  const sub = await cta.locator('.sports-chip__cta-sub-text').innerText();
  expect(sub).toMatch(/19\s*h\s*00/);
  expect(sub.toLowerCase()).not.toMatch(/demain/);
});

test('CTA univ : acronymes UQAM / McGill, pas les noms longs', async ({ page }) => {
  const kick = torontoParts(Date.now() + 3 * 86400000);
  const game = {
    date: kick.date,
    time: '18:00',
    opponent: 'McGill',
    opponentCode: 'MCG',
    opponentFullName: 'McGill University',
    home: true,
    sport: 'soccer',
    competition: 'Soccer universitaire féminin',
    live: false,
  };
  const team = teamShell('universitaire:soccer:uqam-cta', {
    name: 'Citadins',
    fullName: 'Université du Québec à Montréal',
    code: 'UQAM',
    sport: 'soccer',
  });
  team.sector = 'universitaire';
  team.leagueLabel = 'Soccer universitaire féminin';
  team.nextGame = game;
  team.nextGames = [game];
  const cta = await openWithSports(page, {
    updated: new Date().toISOString(),
    source: 'test-live',
    teams: { [team.id]: team },
  });
  await expect(cta).toHaveAttribute('data-cta-state', 'next');
  const text = await cta.locator('.sports-chip__cta-text').innerText();
  expect(text).toMatch(/UQAM/);
  expect(text).toMatch(/McGill/);
  expect(text).not.toMatch(/Université du Québec/);
  expect(text).not.toMatch(/University/);
});

test('CTA : ADV n’est pas une institution (adversaire Spordle manquant)', async ({ page }) => {
  const kick = torontoParts(Date.now() + 2 * 86400000);
  const game = {
    date: kick.date,
    time: '19:00',
    opponent: 'ADV',
    opponentCode: 'ADV',
    home: true,
    sport: 'hockey',
    competition: 'Hockey universitaire féminin D1',
    live: false,
  };
  const team = teamShell('universitaire:hockey:con-adv', {
    name: 'Concordia',
    fullName: 'Concordia University',
    code: 'UCON',
    sport: 'hockey',
  });
  team.sector = 'universitaire';
  team.nextGame = game;
  team.nextGames = [game];
  const cta = await openWithSports(page, {
    updated: new Date().toISOString(),
    source: 'test-live',
    teams: { [team.id]: team },
  });
  const text = (await cta.innerText()).replace(/\s+/g, ' ');
  expect(text).not.toMatch(/\bADV\b/);
  await expect(cta).not.toHaveAttribute('data-cta-state', 'next');
});

test('liste B : ce soir → résultat du jour → hier → plus tard', async ({ page }) => {
  const now = Date.now();
  const today = torontoParts(now);
  const plus3 = torontoParts(now + 3 * 86400000);
  const plus10 = torontoParts(now + 10 * 86400000);
  const y = yesterdayResultGame();

  const soonOffset = todayUpcomingOffsetMs();
  test.skip(!soonOffset, 'trop tard : plus de coup d’envoi aujourd’hui');
  const soon = liveKickGame({
    opponent: 'Vanier',
    opponentCode: 'VAN',
    opponentFullName: 'Vanier College',
    offsetMs: soonOffset,
    extra: { live: false },
  });
  const todayRes = {
    date: today.date,
    time: '12:00',
    opponent: 'McGill',
    opponentCode: 'MCG',
    opponentFullName: 'McGill',
    home: true,
    sport: 'soccer',
    competition: 'Soccer collégial masculin D1',
    scoreFor: 1,
    scoreAgainst: 0,
    result: 'W',
    final: true,
    gameId: 'today-clg-result',
  };
  const mid = {
    date: plus3.date,
    time: '18:00',
    opponent: 'Carleton',
    opponentCode: 'CAR',
    opponentFullName: 'Carleton',
    home: true,
    sport: 'soccer',
    competition: 'Soccer collégial masculin D1',
    live: false,
  };
  const far = {
    date: plus10.date,
    time: '18:00',
    opponent: 'Ottawa',
    opponentCode: 'OTT',
    opponentFullName: 'uOttawa',
    home: true,
    sport: 'soccer',
    competition: 'Soccer collégial masculin D1',
    live: false,
  };

  const tSoon = teamShell('collegial:soccer:soon', { name: 'Saint-Hyacinthe', fullName: 'Cégep de Saint-Hyacinthe', code: 'STH' });
  tSoon.nextGame = soon;
  tSoon.nextGames = [soon];
  const tToday = teamShell('collegial:soccer:today-r', { name: 'Lionel-Groulx', fullName: 'Cégep Lionel-Groulx', code: 'CLG' });
  tToday.lastGame = todayRes;
  tToday.results = [todayRes];
  const tMid = teamShell('collegial:soccer:mid', { name: 'Montmorency', fullName: 'Collège Montmorency', code: 'MON' });
  tMid.nextGame = mid;
  tMid.nextGames = [mid];
  const tY = teamShell('collegial:soccer:yest', { name: 'Concordia', fullName: 'Concordia', code: 'CON' });
  tY.lastGame = y;
  tY.results = [y];
  const tFar = teamShell('collegial:soccer:far', { name: 'André-Laurendeau', fullName: 'Cégep André-Laurendeau', code: 'AND' });
  tFar.nextGame = far;
  tFar.nextGames = [far];

  await openWithSports(page, {
    updated: new Date().toISOString(),
    source: 'test-live',
    teams: {
      [tSoon.id]: tSoon,
      [tToday.id]: tToday,
      [tMid.id]: tMid,
      [tY.id]: tY,
      [tFar.id]: tFar,
    },
  });

  const seq = await page.evaluate(() => (typeof sportsCtaCandidateSlides === 'function'
    ? sportsCtaCandidateSlides().map((s) => `${s.mode}:${s.team?.code || ''}`)
    : []));
  expect(seq[0], 'ce soir d’abord').toMatch(/^next:STH$/);
  const iToday = seq.indexOf('result:CLG');
  const iYest = seq.indexOf('result:CON');
  expect(iYest, 'hier dans la liste').toBeGreaterThan(0);
  if (iToday >= 0) {
    expect(iToday, 'résultat du jour après ce soir').toBeGreaterThan(0);
    expect(iYest, 'hier après le jour').toBeGreaterThan(iToday);
  }
  const later = [seq.indexOf('next:MON'), seq.indexOf('next:AND')].filter((i) => i >= 0);
  if (later.length) {
    expect(Math.min(...later), 'calendrier lointain en queue').toBeGreaterThan(iYest);
  }
});

test('même match : une face reçoit ou chez, pas les deux', async ({ page }) => {
  const kick = torontoParts(Date.now() + 2 * 86400000);
  const shared = {
    date: kick.date,
    time: '18:00',
    sport: 'soccer',
    competition: 'Soccer universitaire féminin',
    gameId: 'mirror-uqam-mcgill',
    live: false,
  };
  const tA = teamShell('universitaire:soccer:uqam-m', {
    name: 'UQAM', fullName: 'Université du Québec à Montréal', code: 'UQAM',
  });
  tA.sector = 'universitaire';
  tA.nextGame = {
    ...shared,
    opponent: 'McGill',
    opponentCode: 'MCG',
    opponentFullName: 'McGill University',
    home: true,
  };
  tA.nextGames = [tA.nextGame];
  const tB = teamShell('universitaire:soccer:mcg-m', {
    name: 'McGill', fullName: 'McGill University', code: 'MCG',
  });
  tB.sector = 'universitaire';
  tB.nextGame = {
    ...shared,
    opponent: 'UQAM',
    opponentCode: 'UQAM',
    opponentFullName: 'Université du Québec à Montréal',
    home: false,
  };
  tB.nextGames = [tB.nextGame];
  await openWithSports(page, {
    updated: new Date().toISOString(),
    source: 'test-live',
    teams: { [tA.id]: tA, [tB.id]: tB },
  });
  const faces = await page.evaluate(() => (typeof sportsCtaCandidateSlides === 'function'
    ? sportsCtaCandidateSlides()
      .filter((s) => String(s.game?.gameId) === 'mirror-uqam-mcgill')
      .map((s) => {
        const verb = typeof sportsMatchVerb === 'function' ? sportsMatchVerb(s.game) : '';
        const label = typeof sportsCtaLabelFromSlide === 'function' ? sportsCtaLabelFromSlide(s) : '';
        return { code: s.team?.code, home: s.game?.home, verb, label };
      })
    : []));
  expect(faces, 'un seul miroir').toHaveLength(1);
  expect(['UQAM', 'MCG']).toContain(faces[0].code);
  expect(faces[0].label, 'pas le libellé reçoit/chez').not.toMatch(/reçoit\s*\/\s*chez/);
  expect(['reçoit', 'chez']).toContain(faces[0].verb);
  const hasRecoit = faces[0].label.includes('reçoit');
  const hasChez = faces[0].label.includes('chez');
  expect(hasRecoit !== hasChez, 'un verbe, pas les deux').toBe(true);
});

test('liste B : V et D du même match restent deux cartes', async ({ page }) => {
  const y = yesterdayResultGame();
  const win = {
    ...y,
    opponent: 'Vanier',
    opponentCode: 'VAN',
    opponentFullName: 'Vanier College',
    scoreFor: 3,
    scoreAgainst: 0,
    result: 'W',
    gameId: 'cta-winner-only',
    final: true,
  };
  const loss = {
    ...y,
    opponent: 'Saint-Hyacinthe',
    opponentCode: 'STH',
    opponentFullName: 'Cégep de Saint-Hyacinthe',
    scoreFor: 0,
    scoreAgainst: 3,
    result: 'L',
    gameId: 'cta-winner-only',
    final: true,
    home: false,
  };
  const tW = teamShell('collegial:soccer:sth-cta-w', {
    name: 'Saint-Hyacinthe', fullName: 'Cégep de Saint-Hyacinthe', code: 'STH',
  });
  tW.lastGame = win;
  tW.results = [win];
  const tL = teamShell('collegial:soccer:van-cta-l', {
    name: 'Vanier', fullName: 'Vanier College', code: 'VAN',
  });
  tL.lastGame = loss;
  tL.results = [loss];
  await openWithSports(page, {
    updated: new Date().toISOString(),
    source: 'test-live',
    teams: { [tW.id]: tW, [tL.id]: tL },
  });
  const faces = await page.evaluate(() => {
    const cta = typeof sportsCtaCandidateSlides === 'function' ? sportsCtaCandidateSlides() : [];
    const of = (gid) => cta.filter((s) => String(s.game?.gameId) === gid);
    return of('cta-winner-only').map((s) => {
      const label = typeof sportsCtaLabelFromSlide === 'function' ? sportsCtaLabelFromSlide(s) : '';
      return { code: s.team?.code, result: s.game?.result, label };
    });
  });
  expect(faces.map((f) => f.result).sort(), 'V et D dans la liste').toEqual(['L', 'W']);
  expect(faces.every((f) => !/reçoit|chez/.test(f.label))).toBe(true);
});

test('CTA Hier : score entre les noms, kicker 1 ligne, glyphe', async ({ page }) => {
  const y = yesterdayResultGame();
  const win = {
    ...y,
    opponent: 'Victoriaville',
    opponentCode: 'VIC',
    opponentFullName: 'Cégep de Victoriaville',
    scoreFor: 3,
    scoreAgainst: 1,
    result: 'W',
    gameId: 'cta-hier-vs',
    final: true,
    competition: 'Soccer collégial masculin D2',
  };
  const tW = teamShell('collegial:soccer:tr-cta-vs', {
    name: 'Trois-Rivières', fullName: 'Cégep de Trois-Rivières', code: 'TR',
  });
  tW.lastGame = win;
  tW.results = [win];
  const cta = await openWithSports(page, {
    updated: new Date().toISOString(),
    source: 'test-live',
    teams: { [tW.id]: tW },
  });
  await expect(cta).toHaveAttribute('data-cta-state', 'result');
  await expect(cta.locator('.sports-chip__cta-tag')).toHaveText(/^Hier$/i);
  await expect(cta.locator('.sports-chip__cta-glyph')).toBeVisible();
  await expect(cta.locator('.sports-chip__cta-text .sports-chip__score')).toHaveText('3–1');
  await expect(cta.locator('.sports-chip__cta-text .sports-chip__name').first()).toHaveText(/Trois-Rivières|Cégep/);
  await expect(cta.locator('.sports-chip__cta-text .sports-chip__opp')).toHaveText(/Victoriaville/);
});

test('puces scores : V d’un côté et D de l’autre, pas de dédup', async ({ page }) => {
  const y = yesterdayResultGame();
  const win = {
    ...y,
    opponent: 'Vanier',
    opponentCode: 'VAN',
    opponentFullName: 'Vanier College',
    scoreFor: 3,
    scoreAgainst: 0,
    result: 'W',
    gameId: 'vd-same-game',
    final: true,
  };
  const loss = {
    ...y,
    opponent: 'Saint-Hyacinthe',
    opponentCode: 'STH',
    opponentFullName: 'Cégep de Saint-Hyacinthe',
    scoreFor: 0,
    scoreAgainst: 3,
    result: 'L',
    gameId: 'vd-same-game',
    final: true,
    home: false,
  };
  const drawA = {
    ...y,
    opponent: 'Concordia',
    opponentCode: 'CON',
    opponentFullName: 'Concordia',
    scoreFor: 1,
    scoreAgainst: 1,
    result: 'D',
    gameId: 'draw-same-game',
    final: true,
  };
  const drawB = {
    ...y,
    opponent: 'McGill',
    opponentCode: 'MCG',
    opponentFullName: 'McGill University',
    scoreFor: 1,
    scoreAgainst: 1,
    result: 'D',
    gameId: 'draw-same-game',
    final: true,
    home: false,
  };
  const tW = teamShell('collegial:soccer:sth-w', {
    name: 'Saint-Hyacinthe', fullName: 'Cégep de Saint-Hyacinthe', code: 'STH',
  });
  tW.lastGame = win;
  tW.results = [win];
  const tL = teamShell('collegial:soccer:van-l', {
    name: 'Vanier', fullName: 'Vanier College', code: 'VAN',
  });
  tL.lastGame = loss;
  tL.results = [loss];
  const tDrawA = teamShell('universitaire:soccer:mcg-d', {
    name: 'McGill', fullName: 'McGill University', code: 'MCG',
  });
  tDrawA.sector = 'universitaire';
  tDrawA.lastGame = drawA;
  tDrawA.results = [drawA];
  const tDrawB = teamShell('universitaire:soccer:con-d', {
    name: 'Concordia', fullName: 'Concordia', code: 'CON',
  });
  tDrawB.sector = 'universitaire';
  tDrawB.lastGame = drawB;
  tDrawB.results = [drawB];
  await openWithSports(page, {
    updated: new Date().toISOString(),
    source: 'test-live',
    teams: { [tW.id]: tW, [tL.id]: tL, [tDrawA.id]: tDrawA, [tDrawB.id]: tDrawB },
  });
  const faces = await page.evaluate(() => {
    const lane = typeof sportsLeftLaneState === 'function' ? sportsLeftLaneState() : { pool: [] };
    const of = (gid) => (lane.pool || [])
      .filter((s) => s.mode === 'result' && String(s.game?.gameId) === gid);
    const occupy = (slide) => (typeof sportsSlideOccupyKeys === 'function'
      ? [...sportsSlideOccupyKeys(slide)]
      : []);
    const usedBy = (slide) => new Set(occupy(slide));
    const blocked = (slide, other) => (typeof sportsSlideIsUsed === 'function'
      ? sportsSlideIsUsed(slide, usedBy(other))
      : true);
    const badge = (game) => (typeof sportsResultBadgeSpec === 'function'
      ? sportsResultBadgeSpec(game)?.letter
      : '');
    const vd = of('vd-same-game');
    const nn = of('draw-same-game');
    return {
      vd: vd.map((s) => ({ code: s.team?.code, result: s.game?.result, badge: badge(s.game) })),
      nn: nn.map((s) => ({ code: s.team?.code, result: s.game?.result, badge: badge(s.game) })),
      vdBlocks: vd.length === 2 ? blocked(vd[0], vd[1]) || blocked(vd[1], vd[0]) : true,
      nnBlocks: nn.length === 2 ? blocked(nn[0], nn[1]) || blocked(nn[1], nn[0]) : true,
    };
  });
  expect(faces.vd.length, 'V et D tous les deux').toBe(2);
  expect(faces.vd.map((f) => f.result).sort()).toEqual(['L', 'W']);
  expect(faces.vd.map((f) => f.badge).sort()).toEqual(['D', 'V']);
  expect(faces.vdBlocks, 'V ne masque pas D').toBe(false);
  expect(faces.nn.length, 'N des deux côtés').toBe(2);
  expect(faces.nn.every((f) => f.result === 'D' && f.badge === 'N')).toBe(true);
  expect(faces.nnBlocks, 'N ne masque pas l’autre N').toBe(false);

  const visible = await page.evaluate(() => {
    sportsFitCount = 4;
    renderSportsStrip();
    return sportsVisible.map((slide) => ({
      mode: slide?.mode,
      gameId: String(slide?.game?.gameId || slide?.ctaFrom?.game?.gameId || ''),
    }));
  });
  for (let i = 1; i < visible.length; i += 1) {
    const left = visible[i - 1];
    const right = visible[i];
    if (left.mode !== 'result' || right.mode !== 'result') continue;
    expect(right.gameId, 'les deux faces du même résultat ne sont jamais côte à côte')
      .not.toBe(left.gameId);
  }
});

test('puces : reliquat 5 j après ce soir, même sport', async ({ page }) => {
  const offset = todayUpcomingOffsetMs([2, 1.25, 0.75]);
  test.skip(!offset, 'trop tard : plus de coup d’envoi aujourd’hui');
  const past = civilDaysAgoResultGame(5, { gameId: 'five-day-result' });
  const tonight = liveKickGame({
    opponent: 'McGill',
    opponentCode: 'MCG',
    opponentFullName: 'McGill',
    offsetMs: offset,
    extra: { live: false, gameId: 'tonight-next' },
  });
  const tR = teamShell('collegial:soccer:sth-r', {
    name: 'Saint-Hyacinthe', fullName: 'Cégep de Saint-Hyacinthe', code: 'STH',
  });
  tR.lastGame = past;
  tR.results = [past];
  const tN = teamShell('collegial:soccer:lav-n', {
    name: 'Laval', fullName: 'Université Laval', code: 'LAV',
  });
  tN.nextGame = tonight;
  tN.nextGames = [tonight];
  await openWithSports(page, {
    updated: new Date().toISOString(),
    source: 'test-live',
    teams: { [tR.id]: tR, [tN.id]: tN },
  });
  const info = await page.evaluate(() => {
    const lane = sportsLeftLaneState();
    const order = typeof sportsOpenOrderSlides === 'function' ? sportsOpenOrderSlides() : [];
    const first = order[0];
    return {
      kind: lane.kind,
      resultN: (lane.results || []).length,
      firstMode: first?.mode || '',
      firstId: String(first?.game?.gameId || ''),
    };
  });
  expect(info.kind, 'saison = des scores dans les 5 j civils').toBe('results');
  expect(info.resultN, 'le 3–0 d’il y a 5 j civils reste').toBeGreaterThanOrEqual(1);
  expect(info.firstMode, 'B : ce soir avant le reliquat 5 j').toBe('next');
  expect(info.firstId).toBe('tonight-next');
});

test('puces : un résultat à 6 j civils n’est plus dans les 5 j', async ({ page }) => {
  const stale = civilDaysAgoResultGame(6, { gameId: 'six-day-result' });
  const tonight = liveKickGame({
    opponent: 'McGill',
    opponentCode: 'MCG',
    opponentFullName: 'McGill',
    offsetMs: 2 * 3600 * 1000,
    extra: { live: false, gameId: 'tonight-next' },
  });
  const tR = teamShell('collegial:soccer:sth-old', {
    name: 'Saint-Hyacinthe', fullName: 'Cégep de Saint-Hyacinthe', code: 'STH',
  });
  tR.lastGame = stale;
  tR.results = [stale];
  const tN = teamShell('collegial:soccer:lav-n2', {
    name: 'Laval', fullName: 'Université Laval', code: 'LAV',
  });
  tN.nextGame = tonight;
  tN.nextGames = [tonight];
  await openWithSports(page, {
    updated: new Date().toISOString(),
    source: 'test-live',
    teams: { [tR.id]: tR, [tN.id]: tN },
  });
  const info = await page.evaluate(() => {
    const lane = sportsLeftLaneState();
    return {
      kind: lane.kind,
      resultN: (lane.results || []).length,
      poolHasOld: (lane.pool || []).some((s) => s.game?.gameId === 'six-day-result'),
    };
  });
  expect(info.kind, 'plus de score chaud → calendrier').toBe('offseason');
  expect(info.resultN).toBe(0);
  expect(info.poolHasOld, 'le 6e jour civil n’encombre pas les puces').toBe(false);
});

test('bandeau : nextGames entier, pas un seul match par équipe', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#masthead-sports-strip .sports-chip--cta')).toBeVisible({ timeout: 8000 });
  const n = await page.evaluate(() => {
    const nexts = (typeof sportsSlides !== 'undefined' ? sportsSlides : [])
      .filter((s) => s && s.mode === 'next');
    const teams = new Set(nexts.map((s) => s.team?.id).filter(Boolean));
    return { nexts: nexts.length, teams: teams.size };
  });
  expect(n.teams, 'plusieurs équipes à venir').toBeGreaterThan(10);
  expect(n.nexts, 'calendrier nextGames, pas seulement nextGame').toBeGreaterThan(n.teams);
});

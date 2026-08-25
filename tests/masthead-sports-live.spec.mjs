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

test('CTA live : pas « il y a 2 min » sous En cours', async ({ page }) => {
  const cta = await openWithSports(page, livePayload({ offsetMs: -2 * 60 * 1000 }));
  await expect(cta).toHaveAttribute('data-cta-state', 'live');
  await expect(cta.locator('.sports-chip__cta-tag')).toHaveText('En cours');
  const sub = await cta.locator('.sports-chip__cta-sub-text').innerText();
  expect(sub).toMatch(/Soccer collégial masculin D1/);
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

test('CTA live : un direct écarte résultats et prochains du cycle', async ({ page }) => {
  const cta = await openWithSports(page, livePlusYesterdayPayload());
  await expect(cta).toHaveAttribute('data-cta-state', 'live');
  await expect(cta.locator('.sports-chip__cta-tag')).toHaveText('En cours');
  const text = await cta.locator('.sports-chip__cta-text').innerText();
  expect(text).toMatch(/Saint-Hyacinthe/);
  expect(text).not.toMatch(/Concordia/);
  const pool = await page.evaluate(() => sportsCtaCandidateSlides().map((s) => ({
    live: sportsGameIsLive(s.game),
    name: s.team?.name || '',
    mode: s.mode,
  })));
  expect(pool.length, 'pool CTA = uniquement le direct').toBe(1);
  expect(pool[0].live).toBe(true);
  expect(pool[0].name).toMatch(/Saint-Hyacinthe/);
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
  expect(pool.length).toBe(2);
  expect(pool.every((s) => s.live), 'aucun résultat hors live dans le pool').toBe(true);
  expect(pool.some((s) => /Saint-Hyacinthe/i.test(s.name))).toBe(true);
  expect(pool.some((s) => /Laval/i.test(s.name))).toBe(true);
  expect(pool.some((s) => /Concordia/i.test(s.name))).toBe(false);

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

test('CTA : sans live, hier avant un à-venir dans 3 h', async ({ page }) => {
  const y = yesterdayResultGame();
  const tY = teamShell('collegial:soccer:yest', {
    name: 'Concordia', fullName: 'Concordia', code: 'CON',
  });
  tY.lastGame = y;
  tY.results = [y];
  const later = upcomingTodayPayload(3 * 3600 * 1000);
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
  expect(seq[0], 'le cycle commence par hier').toMatchObject({ mode: 'result', code: 'CON' });
  expect(seq.some((s) => s.mode === 'next' && s.code === 'STH'), 'à venir encore dans le pool').toBe(true);
  const cta = page.locator('#masthead-sports-strip .sports-chip--cta').last();
  await expect(cta.locator('.sports-chip__cta-tag')).toHaveText(/hier/i);
});

test('CTA : à venir dans l’heure passe devant hier', async ({ page }) => {
  const y = yesterdayResultGame();
  const tY = teamShell('collegial:soccer:yest', {
    name: 'Concordia', fullName: 'Concordia', code: 'CON',
  });
  tY.lastGame = y;
  tY.results = [y];
  const soon = upcomingTodayPayload(45 * 60 * 1000);
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
  await expect(cta).toHaveAttribute('data-cta-lamp', 'soon');
  const clock = payload._kick.time.replace(':', ' h ');
  const sub = await cta.locator('.sports-chip__cta-sub-text').innerText();
  expect(sub).toMatch(/Aujourd[’']hui/);
  expect(sub).toMatch(new RegExp(clock.replace(' ', '\\s+')));
  expect(sub.toLowerCase()).not.toMatch(/dans \d/);
  expect(sub.toLowerCase()).not.toMatch(/il y a/);
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
  const sub = await cta.locator('.sports-chip__cta-sub-text').innerText();
  expect(sub).toMatch(/19\s*h\s*00/);
  expect(sub.toLowerCase()).not.toMatch(/demain/);
});

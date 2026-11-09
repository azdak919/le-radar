import fs from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * go D : n=1 = ordre E ; n≥2 = gauche scores / droite à-venir,
 * live et aujourd’hui volent les bords.
 */

function slide(key, mode, date, time, extra = {}) {
  const sport = extra.sport || 'football';
  return {
    key,
    mode,
    game: {
      date,
      time,
      gameId: key,
      opponent: 'Diablos',
      opponentFullName: 'Diablos',
      opponentCode: 'DIA',
      final: mode === 'result',
      live: false,
      scoreFor: mode === 'result' ? 28 : undefined,
      scoreAgainst: mode === 'result' ? 14 : undefined,
      result: mode === 'result' ? 'W' : undefined,
      sport,
      ...extra,
    },
    team: {
      name: 'Vert et Or',
      fullName: 'Vert et Or',
      code: 'LAV',
      sport,
    },
  };
}

async function splitKeys(page, n, nowIso, pool) {
  return page.evaluate(({ n, nowIso, pool }) => {
    const now = new Date(nowIso).getTime();
    if (typeof sportsSplitVisible !== 'function') return { ok: false, reason: 'no-fn' };
    const out = sportsSplitVisible(n, now, pool);
    return {
      ok: true,
      keys: out.map((s) => s.key),
      sports: out.map((s) => String(s.team?.sport || s.game?.sport || '')),
      buckets: out.map((s) => sportsOpenOrderBucket(s, now)),
    };
  }, { n, nowIso, pool });
}

test('n=1 : préfixe E ; n=2 vendredi 17 h : ce soir puis score, jamais score froid en premier', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#masthead-sports-strip')).toBeVisible({ timeout: 8000 });

  const friday = '2026-09-04T17:00:00-04:00';
  const pool = [
    slide('yesterday', 'result', '2026-09-03', '15:00'),
    slide('tonight', 'next', '2026-09-04', '19:00'),
    slide('saturday-old', 'result', '2026-09-02', '14:00'),
  ];
  const one = await splitKeys(page, 1, friday, pool);
  expect(one.ok, one.reason || 'ok').toBe(true);
  expect(one.keys, 'n=1 = ce soir (E)').toEqual(['tonight']);

  const two = await splitKeys(page, 2, friday, pool);
  expect(two.keys, 'hier à gauche, aujourd’hui à droite').toEqual(['yesterday', 'tonight']);
});

test('lundi 10 h n=4 : gauche weekend, droite demain', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#masthead-sports-strip')).toBeVisible({ timeout: 8000 });

  const monday = '2026-09-07T10:00:00-04:00';
  const pool = [
    slide('thu-next', 'next', '2026-09-10', '19:00'),
    slide('sat', 'result', '2026-09-05', '15:00'),
    slide('sun', 'result', '2026-09-06', '14:00'),
    slide('tue', 'next', '2026-09-08', '19:00'),
  ];
  const one = await splitKeys(page, 1, monday, pool);
  expect(one.keys, 'n=1 lundi = hier').toEqual(['sun']);

  const four = await splitKeys(page, 4, monday, pool);
  expect(four.keys, 'moitié du jour vide : uniquement les résultats de la veille').toEqual(['sun']);
});

test('n=4 jeudi soir : football visible malgré une file de soccer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#masthead-sports-strip')).toBeVisible({ timeout: 8000 });

  const thursdayEve = '2026-09-03T21:00:00-04:00';
  const pool = [
    slide('live-soc', 'next', '2026-09-03', '20:15', { sport: 'soccer', live: true }),
    ...Array.from({ length: 8 }, (_, i) => slide(
      `soc-${i}`,
      'next',
      '2026-09-04',
      `18:${String(i).padStart(2, '0')}`,
      { sport: 'soccer' },
    )),
    slide('fb-1', 'next', '2026-09-04', '19:30', { sport: 'football' }),
    slide('rug-1', 'next', '2026-09-04', '20:00', { sport: 'rugby' }),
    slide('old-soc', 'result', '2026-08-30', '15:00', { sport: 'soccer' }),
    slide('old-fb', 'result', '2026-08-30', '13:00', { sport: 'football' }),
  ];
  const four = await splitKeys(page, 4, thursdayEve, pool);
  expect(four.ok, four.reason || 'ok').toBe(true);
  expect(four.keys, 'un seul live confirmé : une seule carte, pas de remplissage').toEqual(['live-soc']);
});

test('accueil 1280 : snapshot multi-sport sans direct, diversité conservée', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(new Date('2026-11-08T18:59:00-05:00'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  // Ne pas dépendre du nombre de directs de la collecte courante : un seul
  // direct doit justement rester seul. Ici on teste la diversité hors live.
  const pool = [
    slide('div-foot', 'result', '2026-11-08', '16:00', { sport: 'football' }),
    slide('div-basket', 'result', '2026-11-08', '15:00', { sport: 'basketball' }),
    slide('div-soccer', 'next', '2026-11-09', '19:00', { sport: 'soccer' }),
    slide('div-volley', 'next', '2026-11-09', '20:00', { sport: 'volleyball' }),
  ];
  pool.forEach(s => { s.team.code = s.key; s.team.name = s.key; });
  await page.evaluate(pool => { sportsSlides = pool; sportsFitCount = null; sportsFitDepth = 0; renderSportsStrip(); }, pool);
  await expect.poll(async () => strip.locator('.sports-chip').count(), { timeout: 8000 })
    .toBeGreaterThan(1);
  const info = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('#masthead-sports-strip .sports-chip')];
    const sports = chips
      .map((c) => (c.dataset.sportsSport || '').toLowerCase())
      .filter((s) => s && s !== 'board');
    const pool = typeof sportsStripPolicy === 'function' ? sportsStripPolicy().pool : [];
    const poolSports = [...new Set(pool.map((s) => String(
      s.team?.sport || s.game?.sport || '',
    ).toLowerCase()).filter(Boolean))];
    return { sports, unique: [...new Set(sports)], poolSports };
  });
  if (info.poolSports.length >= 2) {
    expect(
      info.unique.length,
      `puces=${info.sports.join(',')} pool=${info.poolSports.join(',')}`,
    ).toBeGreaterThan(1);
  }
});

test('samedi 20 h 44 : matchs déjà joués → scores, pas 4× Aujourd’hui', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#masthead-sports-strip')).toBeVisible({ timeout: 8000 });

  const evening = '2026-09-19T20:44:00-04:00';
  const staleToday = ['rugby-am', 'soc-16', 'hock-16', 'soc-17'];
  const pool = [
    slide('rugby-am', 'next', '2026-09-19', '09:00', { sport: 'rugby' }),
    slide('soc-16', 'next', '2026-09-19', '16:00', { sport: 'soccer' }),
    slide('hock-16', 'next', '2026-09-19', '16:00', { sport: 'hockey' }),
    slide('soc-17', 'next', '2026-09-19', '17:00', { sport: 'soccer' }),
    slide('y-fb', 'result', '2026-09-18', '19:00', { sport: 'football' }),
    slide('y-flag', 'result', '2026-09-18', '14:00', { sport: 'flag-football' }),
  ];
  const four = await splitKeys(page, 4, evening, pool);
  expect(four.ok, four.reason || 'ok').toBe(true);
  const modes = await page.evaluate(({ n, nowIso, pool }) => {
    const now = new Date(nowIso).getTime();
    return sportsSplitVisible(n, now, pool).map((s) => s.mode);
  }, { n: 4, nowIso: evening, pool });
  expect(modes.every((m) => m === 'result'), `modes=${modes.join(',')}`).toBe(true);
  expect([...four.keys].sort(), `keys=${four.keys.join(',')}`).toEqual(['y-fb', 'y-flag'].sort());
  expect(four.keys.filter((k) => staleToday.includes(k)), 'Aujourd’hui déjà joué resté à l’écran')
    .toEqual([]);

  const nextGate = await page.evaluate(() => {
    const now = new Date('2026-09-19T20:44:00-04:00').getTime();
    const team = { id: 'lav', name: 'Rouge et Or', code: 'LAV', sport: 'soccer' };
    const past = { date: '2026-09-19', time: '16:00', opponent: 'Carabins' };
    const scored = {
      ...past,
      scoreFor: 2,
      scoreAgainst: 1,
      final: true,
      live: false,
    };
    return {
      still: typeof sportsNextStillUpcoming === 'function'
        ? sportsNextStillUpcoming(past, now)
        : null,
      upcoming: sportsNextSlideFromGame(team, past, now),
      scoredNext: sportsNextSlideFromGame(team, scored, now),
      scoredResult: sportsResultSlideFromGame(team, scored, now)?.mode || null,
    };
  });
  expect(nextGate.still, '16 h n’est plus « à venir » à 20 h 44').toBe(false);
  expect(nextGate.upcoming, 'next périmé sans score').toBeNull();
  expect(nextGate.scoredNext, 'next périmé avec score').toBeNull();
  expect(nextGate.scoredResult, 'score → résultat').toBe('result');
});

test('390 : une puce, pas de split visuel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  // Ne pas dépendre du nombre de directs de la collecte courante : un seul
  // direct doit justement rester seul. Ici on teste la diversité hors live.
  const pool = [
    slide('div-foot', 'result', '2026-11-08', '16:00', { sport: 'football' }),
    slide('div-basket', 'result', '2026-11-08', '15:00', { sport: 'basketball' }),
    slide('div-soccer', 'next', '2026-11-09', '19:00', { sport: 'soccer' }),
    slide('div-volley', 'next', '2026-11-09', '20:00', { sport: 'volleyball' }),
  ];
  pool.forEach(s => { s.team.code = s.key; s.team.name = s.key; });
  await page.evaluate(pool => { sportsSlides = pool; sportsFitCount = null; sportsFitDepth = 0; renderSportsStrip(); }, pool);
  await expect.poll(async () => strip.locator('.sports-chip').count(), { timeout: 8000 })
    .toBeGreaterThan(0);
  const n = await strip.locator('.sports-chip').count();
  expect(n, '390 : une seule puce visible').toBe(1);
});


test('1/2/3/N directs : exclusivité, dédup miroir, rotation sans repli et resize @ci-critical', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-08T17:00:00-05:00'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const livePool = Array.from({length:7}, (_,i)=>slide(`live-${i}`, 'next', '2026-11-08', '16:30', {live:true, sport:i%2?'hockey':'soccer', scoreFor:0, scoreAgainst:0}));
  const cold = [slide('yesterday', 'result', '2026-11-07', '19:00'), slide('tonight','next','2026-11-08','19:00')];
  for (const nLive of [1,2,3,7]) {
    const pool = livePool.slice(0,nLive).concat(cold);
    const state = await page.evaluate(({pool,nLive})=>{
      const now=Date.now(); sportsSlides=pool;
      const first=sportsSplitVisible(4,now);
      const mirror={...pool[0],key:'mirror',team:{...pool[0].team,code:'DIA'},game:{...pool[0].game,opponentCode:'LAV'}};
      const dedup=sportsSplitVisible(4,now,pool.concat(mirror));
      const used=new Set(first.flatMap(s=>[...sportsSlideOccupyKeys(s)]));
      sportsVisible=first;
      const next=nextSportsSlide(used,{outgoing:first[0],boardN:first.length});
      return {keys:first.map(s=>s.key),dedup:dedup.map(s=>s.key),next:next?.key||'',small:sportsSplitVisible(1,now).map(s=>s.key),large:sportsSplitVisible(8,now).map(s=>s.key)};
    },{pool,nLive});
    expect(state.keys).toHaveLength(Math.min(4,nLive));expect(new Set(state.keys).size).toBe(state.keys.length);
    expect(state.keys.every(k=>k.startsWith('live-'))).toBe(true);
    expect(state.dedup).toHaveLength(Math.min(4,nLive));
    expect(state.next===''||state.next.startsWith('live-')).toBe(true);
    expect(state.small).toHaveLength(1);expect(state.large).toHaveLength(nLive);
  }
});

test('politique civile à minuit, final/update, horaire inconnu jamais live et moitié vide @ci-critical', async ({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  const pool=[slide('nov7','result','2026-11-07','19:00'),slide('nov8','next','2026-11-08','23:30'),slide('nov9','next','2026-11-09','19:00')];
  const before=await splitKeys(page,4,'2026-11-08T23:20:00-05:00',pool);
  expect(before.keys).toEqual(['nov7','nov8']);
  const after=await splitKeys(page,4,'2026-11-09T00:05:00-05:00',pool);
  expect(after.keys).toEqual(['nov9']);
  const state=await page.evaluate(pool=>{
    const now=Date.parse('2026-11-08T23:45:00-05:00');
    const unknown={...pool[1].game,live:undefined};
    const confirmed={...unknown,live:true};
    const final={...confirmed,live:false,final:true,scoreFor:2,scoreAgainst:1,result:'W'};
    return {unknown:sportsGameIsLive(unknown,now),live:sportsGameIsLive(confirmed,now),final:sportsGameIsLive(final,now),done:sportsSplitVisible(4,now,[pool[0],{...pool[1],mode:'result',game:final}]).map(s=>s.key)};
  },pool);
  expect(state.unknown).toBe(false);expect(state.live).toBe(true);expect(state.final).toBe(false);expect(state.done).toEqual(['nov7','nov8']);
});

test('peinture réelle live 1/2/3/N, resize, statut final et rotation sans froid @ci-critical', async({page},info)=>{
  await page.setViewportSize({width:1920,height:1000});
  await page.clock.setFixedTime(new Date('2026-11-08T17:00:00-05:00'));
  await page.route('https://**/*',r=>r.abort());
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#masthead-sports-strip')).toBeVisible();
  for(const n of [1,2,3,7]) {
    const pool=Array.from({length:n},(_,i)=>slide(`direct-${i}`,'next','2026-11-08','16:30',{live:true,scoreFor:i,scoreAgainst:0,opponent:'X',opponentCode:'X'})).concat(slide('cold','next','2026-11-08','19:00'));
    pool.forEach(s=>{s.team.code=s.key;s.team.name=s.key;});
    const expected=await page.evaluate(pool=>{sportsSlides=pool;sportsFitCount=4;sportsFitDepth=0;renderSportsStrip();scheduleSportsRotate();return Math.min(sportsBoardCount(),pool.length-1);},pool);
    const cards=page.locator('#masthead-sports-strip > a');
    await expect(cards).toHaveCount(expected);await expect(page.locator('#masthead-sports-strip > a[data-sports-live="1"]')).toHaveCount(expected);
    await page.evaluate(()=>rotateSportsSlot(0));await expect(page.locator('#masthead-sports-strip > a[data-sports-key="cold"]')).toHaveCount(0);
    if(n===3){await page.addStyleTag({content:'#local-lab-format-bar{display:none!important}'});await page.locator('#masthead-sports-strip').screenshot({path:info.outputPath('sports-live-only.png')});}
    // Voie de mise à jour réellement utilisée par les sondages de statut.
    await page.evaluate(()=>{const sig=sportsBoardLiveSig(),keys=sportsVisibleLiveKeys();const s=sportsSlides.find(s=>s.key==='direct-0');s.mode='result';s.game={...s.game,live:false,final:true,result:'W',scoreFor:3,scoreAgainst:1};sportsRerenderAfterLiveChange(sig,keys);});
    if(n>1){
      await expect(page.locator('#masthead-sports-strip > a[data-sports-key="direct-0"]')).toHaveCount(0);
      await page.setViewportSize({width:1024,height:900});
      await expect.poll(()=>cards.evaluateAll(cards=>cards.length>0&&cards.every(c=>c.dataset.sportsLive==='1')&&new Set(cards.map(c=>c.dataset.sportsKey)).size===cards.length)).toBe(true);
      expect(await cards.count()).toBeLessThanOrEqual(n-1);
      await page.setViewportSize({width:1920,height:1000});
      await expect.poll(()=>cards.evaluateAll(cards=>cards.length>0&&cards.every(c=>c.dataset.sportsLive==='1'))).toBe(true);
    }else{await expect(page.locator('#masthead-sports-strip > a[data-sports-live="1"]')).toHaveCount(0);}
  }
});


test('page maintenue après minuit : réallocation DOM même si compte et anciennes clés restent valides @ci-critical', async({page})=>{
  await page.setViewportSize({width:1920,height:1000});
  await page.clock.setFixedTime(new Date('2026-11-08T23:50:00-05:00'));
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#masthead-sports-strip')).toBeVisible();
  const pool=[...Array.from({length:6},(_,i)=>slide(`r${i}`,'result','2026-11-08','19:00',{opponent:'X',opponentCode:'X'})),...Array.from({length:6},(_,i)=>slide(`n${i}`,'next','2026-11-09','19:00',{opponent:'X',opponentCode:'X'}))];
  pool.forEach(s=>{s.team.code=s.key;s.team.name=s.key;});
  await page.evaluate(pool=>{sportsSlides=pool;sportsFitCount=4;sportsFitDepth=0;renderSportsStrip();},pool);
  const cards=page.locator('#masthead-sports-strip > a');await expect(cards).toHaveCount(4);
  expect(await cards.evaluateAll(cards=>cards.map(c=>c.dataset.sportsKey))).toEqual(['r0','r1','r2','r3']);
  await page.clock.setFixedTime(new Date('2026-11-09T00:05:00-05:00'));
  await page.evaluate(()=>rotateSportsSlot(0));
  expect(await cards.evaluateAll(cards=>cards.map(c=>c.dataset.sportsKey))).toEqual(['r0','r1','n0','n1']);
  await page.evaluate(()=>{for(let i=0;i<12;i++)rotateSportsSlot(i%4);});
  expect(await page.evaluate(()=>sportsVisible.map(s=>s.key[0]))).toEqual(['r','r','n','n']);
});

// Géométrie, et non seulement cardinalité : le pool direct réduit ne doit
// jamais dilater une carte au-delà de son slot physique. Cas réel signalé.
const rosemontGeometry = JSON.parse(fs.readFileSync(new URL('./fixtures/sports-strip-rosemont.json', import.meta.url), 'utf8'));
for (const width of [320, 390, 1024, 1440]) for (const lang of ['fr', 'en']) for (const theme of ['light', 'dark']) {
  test(`cartes restent des cartes ${width} ${lang} ${theme} @ci-critical`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.setFixedTime(new Date('2026-11-08T18:59:00-05:00'));
    await page.route('**/assets/news-images/**', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"/>' }));
    await page.route('https://**/*', r => r.abort());
    await page.addInitScript(({ theme, lang }) => {
      localStorage.setItem('radar-theme', theme);
      localStorage.setItem('radar-translate-mode', lang === 'en' ? 'en' : 'original');
    }, { theme, lang });
    // La route SEO /en/ n’embarque pas le traducteur. Tester ici le vrai
    // choix EN du bandeau public, via sa préférence native sur l’accueil.
    await page.goto('/?labFrame=1', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${lang}(?:-|$)`));
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect.poll(() => page.evaluate(() => window.RadarTranslate?.getMode())).toBe(lang === 'en' ? 'en' : 'original');
    await expect(page.locator('#masthead-sports-strip')).toBeVisible();
    const measurements = [];
    for (const n of [7, 1, 2, 3]) {
      const pool = Array.from({ length: n }, (_, i) => ({
        ...rosemontGeometry, key: `geometry-${i}`,
        team: { ...rosemontGeometry.team, id: `geometry-team-${i}`, code: `geometry-${i}` },
        game: { ...rosemontGeometry.game, gameId: `geometry-${i}` },
      }));
      await page.evaluate(pool => {
        sportsSlides = pool; sportsFitCount = null; sportsFitDepth = 0;
        renderSportsStrip(); scheduleSportsRotate();
      }, pool);
      await expect.poll(() => page.evaluate(() => {
        const strip = document.querySelector('#masthead-sports-strip');
        const cards = [...strip.querySelectorAll('.sports-chip--match')];
        return cards.length > 0 && cards.every(c => {
          const cap = parseFloat(getComputedStyle(c).maxWidth);
          return Number.isFinite(cap) && c.getBoundingClientRect().width <= cap + 1;
        });
      })).toBe(true);
      // Deux paints observés, sans délai arbitraire ni appel direct du fitter.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const geometry = await page.evaluate(() => {
        const strip = document.querySelector('#masthead-sports-strip');
        const cs = getComputedStyle(strip);
        const inner = strip.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return {
          inner, boardCapacity: sportsBoardCount(), slots: Math.min(sportsBoardCount(), sportsStripFitFloor()), gap: parseFloat(cs.columnGap),
          cards: [...strip.querySelectorAll('.sports-chip--match')].map(c => {
            const r = c.getBoundingClientRect();
            const line = c.querySelector('.sports-chip__line-inner');
            return { titleClipped: line.scrollWidth > line.parentElement.clientWidth + 2,
              marquee: c.classList.contains('is-overflowing'), animation: getComputedStyle(line).animationName,
              fullText: line.textContent, width: r.width, height: r.height, left: r.left, right: r.right,
              live: c.dataset.sportsLive, key: c.dataset.sportsKey,
              title: c.title, aria: c.getAttribute('aria-label'),
              text: c.textContent, ellipsis: getComputedStyle(c).textOverflow };
          }),
        };
      });
      measurements.push({ n, ...geometry });
      expect(geometry.cards.length).toBe(Math.min(n, geometry.slots));
      expect(new Set(geometry.cards.map(c => c.key)).size).toBe(geometry.cards.length);
      const slotWidth = (geometry.inner - geometry.gap * (geometry.slots - 1)) / geometry.slots;
      for (const card of geometry.cards) {
        expect(card.live).toBe('1');
        expect(card.text).toContain(lang === 'en' ? 'Live' : 'En cours');
        expect(card.height).toBeGreaterThanOrEqual(44);
        expect(card.width).toBeCloseTo(slotWidth, 0);
        expect(card.width).toBeLessThanOrEqual(geometry.inner + 1);
        // Nom long conservé intégralement pour l’accès clavier/lecteur d’écran.
        expect(card.title).toContain('Rosemont'); expect(card.aria).toContain('Bois-de-Boulogne');
        expect(card.ellipsis).not.toBe('ellipsis');
        expect(card.fullText).toContain('Rosemont'); expect(card.fullText).toContain('Bois-de-Boulogne');
        if (card.titleClipped) { expect(card.marquee).toBe(true); expect(card.animation).toContain('sports-chip-scroll'); }
      }
      if (width >= 1024) {
        expect(geometry.slots).toBeGreaterThanOrEqual(2);
        expect(geometry.cards[0].width).toBeLessThanOrEqual(geometry.inner / 2 + 1);
      }
      if (n === 1) {
        expect(geometry.cards[0].width).toBeCloseTo(measurements[0].cards[0].width, 0);
        await page.addStyleTag({ content: '#local-lab-format-bar{display:none!important}' });
        await page.locator('#masthead-sports-strip').screenshot({ path: info.outputPath('one-live-card.png') });
        // Rotation ne dilate pas la carte et ne fabrique aucun autre match.
        await page.evaluate(() => rotateSportsSlot(0));
        await expect(page.locator('#masthead-sports-strip .sports-chip--match')).toHaveCount(1);
      }
    }
    fs.writeFileSync(info.outputPath('card-geometry.json'), JSON.stringify(measurements, null, 2));
    await info.attach('card-geometry.json', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
  });
}

test('carte unique : refresh, vrai retour navigateur, resize et focus sans dilatation @ci-critical', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.setFixedTime(new Date('2026-11-08T18:59:00-05:00'));
  await page.route('https://**/*', r => r.abort());
  await page.route('**/assets/news-images/**', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"/>' }));
  const team = { ...rosemontGeometry.team, results: [], lastGame: null, nextGame: rosemontGeometry.game, nextGames: [rosemontGeometry.game] };
  await page.route('**/sports-masthead.json*', r => r.fulfill({ json: { fetchedAt: '2026-11-08T23:59:00Z', teams: { [team.id]: team } } }));
  await page.goto('/?labFrame=1', { waitUntil: 'domcontentloaded' });
  const card = page.locator('#masthead-sports-strip .sports-chip--match');
  const metrics = [];
  async function bounded(stage, singleSlot = false) {
    await expect(card).toHaveCount(1);
    await expect.poll(() => card.evaluate(c => {
      const strip = c.parentElement, cs = getComputedStyle(strip);
      const inner = strip.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const slots = Math.min(sportsBoardCount(), sportsStripFitFloor());
      const expected = (inner - parseFloat(cs.columnGap) * (slots - 1)) / slots;
      return Math.abs(c.getBoundingClientRect().width - expected) <= 1 && (inner < 520 || slots >= 2);
    })).toBe(true);
    const m = await card.evaluate(c => ({ width: c.getBoundingClientRect().width, height: c.getBoundingClientRect().height, slots: Math.min(sportsBoardCount(), sportsStripFitFloor()), title: c.title }));
    if (singleSlot) expect(m.slots).toBe(1); else expect(m.slots).toBeGreaterThanOrEqual(2);
    metrics.push({ stage, ...m });
  }
  await bounded('initial');
  await card.focus(); await expect(card).toBeFocused();
  await page.evaluate(() => rotateSportsSlot(0)); await expect(card).toBeFocused();
  await bounded('rotation-focus');
  await page.reload({ waitUntil: 'domcontentloaded' }); await bounded('refresh');
  await page.goto('/feeds.html?labFrame=1', { waitUntil: 'domcontentloaded' });
  await page.goBack({ waitUntil: 'domcontentloaded' }); await bounded('back-navigation');
  // Ce retour utilise le navigateur, mais l’horloge/interception du test n’est
  // pas une preuve BFCache (le test BFCache dédié reste séparé).
  await page.setViewportSize({ width: 390, height: 844 }); await bounded('mobile', true);
  await page.setViewportSize({ width: 1440, height: 1000 }); await bounded('desktop-restored');
  fs.writeFileSync(info.outputPath('lifecycle-geometry.json'), JSON.stringify(metrics, null, 2));
  await info.attach('lifecycle-geometry.json', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
});

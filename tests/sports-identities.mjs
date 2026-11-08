import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const Registry = require('../scripts/sports-teams-lib');
const Fresh = require('../scripts/sports-freshness-lib');
const Live = require('../scripts/sports-live-lib');
const SEO = require('../scripts/seo-pages');
const { T } = require('../scripts/seo-pages-lib');
const { migrateIdentities, invariantProjection } = require('../scripts/migrate-sports-identities');
const { unpackSportsPayload } = require('../scripts/sports-payload-lib');
const { syncSportsTeamsRegistry } = require('../scripts/discover-sports');
const { buildSportsMastheadPayload } = require('../scripts/sports-masthead-lib');
const { createSourceQueue } = require('../scripts/sports-source-queue');
const Collector = require('../scripts/fetch-sports');
const reg = Registry.loadSportsTeamsRegistry();
const proof = require('../data/sports-identities.sources.json');
const refs = require('../data/sports-match-identities.json').matches;
const raw = require('../sports.json');
const board = readFileSync(new URL('../sports-board.js', import.meta.url), 'utf8');

test('93 records have dated primary provenance; 853 observed formations, not 93 legal institutions', () => {
  assert.equal(reg.teams.length, 93);
  assert.equal(proof.records.length, 93);
  assert.equal(new Set(proof.records.map(r => r.registryId)).size, 93);
  assert.equal(proof.records.reduce((n, r) => n + r.rseqIdentityObservations.length, 0), 853);
  for (const t of reg.teams) {
    assert.ok(t.institutionName && t.institutionId);
    assert.equal(t.identityVerification.verifiedOn, '2026-11-07');
    assert.ok(t.identityVerification.sources.length);
    for (const url of t.identityVerification.sources) assert.match(url, /^https:\/\//);
    const row = proof.records.find(r => r.registryId === t.id);
    assert.ok(row);
    for (const observation of row.rseqIdentityObservations) assert.equal(reg.byRseqId.get(observation.TeamId)?.id, t.id);
  }
  assert.doesNotMatch(JSON.stringify(proof), /\/workspace\/|\/home\/box\//);
});

test('city alone never becomes UdeM, UdeS or another arbitrarily prioritized school', () => {
  for (const name of ['Montréal', 'Sherbrooke', 'Laval', 'Québec', 'Trois-Rivières', 'Ottawa']) {
    const hit = Registry.resolveSportsTeam(reg, { name, sector: 'universitaire' });
    assert.equal(hit.matched, false, name);
    assert.match(hit.shortName, /établissement non précisé/);
  }
  assert.equal(Registry.resolveSportsTeam(reg, { fullName: 'Université de Montréal' }).registryId, 'udem');
  assert.equal(Registry.resolveSportsTeam(reg, { fullName: 'Cégep de Sherbrooke' }).registryId, 'cegep-sherbrooke');
  const outside = Registry.resolveSportsTeam(reg, { fullName: 'Royal Military College of Canada', code: 'CMR', sector: 'universitaire' });
  assert.equal(outside.matched, false);
  assert.equal(outside.fullName, 'Royal Military College of Canada');
  assert.equal(Registry.resolveSportsTeam(reg, { fullName: 'Collège militaire royal de Saint-Jean' }).nickname, 'Remparts');
});

test('all three Champlain campuses and exact five-character Beauce codes stay distinct', () => {
  const campuses = reg.teams.filter(t => /champlain/i.test(t.fullName));
  assert.equal(campuses.length, 3);
  for (const t of campuses) assert.equal(Registry.resolveSportsTeam(reg, { fullName: t.fullName }).registryId, t.id);
  const sg = Registry.resolveSportsTeam(reg, { rseqTeamId: '1c5b3580-ffcf-48e5-8e22-813514e767ea', registryId: 'beauce-appalaches-sm', sport: 'volleyball', sex: 'F' });
  const sm = Registry.resolveSportsTeam(reg, { rseqTeamId: '0f79a19a-5f25-4c93-b92b-771c052d5299', sport: 'volleyball', sex: 'F' });
  assert.equal(sg.registryId, 'beauce-appalaches'); assert.equal(sg.code, 'BAPSG'); assert.match(sg.fullName, /Saint-Georges/);
  assert.equal(sm.registryId, 'beauce-appalaches-sm'); assert.equal(sm.code, 'BAPSM'); assert.match(sm.fullName, /Sainte-Marie/);
});

test('gender and sport names use evidence, not arbitrary feminine transformations or another team’s nickname', () => {
  assert.equal(Registry.resolveSportsTeam(reg, { name: 'McGill', sex: 'F', sport: 'hockey' }).nickname, 'Martlets');
  assert.equal(Registry.resolveSportsTeam(reg, { name: 'McGill', sex: 'M', sport: 'football' }).nickname, 'Redbirds');
  assert.equal(Registry.resolveSportsTeam(reg, { name: 'McGill', sex: 'X', sport: 'hockey' }).nickname, null);
  assert.equal(Registry.resolveSportsTeam(reg, { name: 'McGill', sex: 'F', sport: 'unverified-sport' }).nickname, null);
  assert.equal(Registry.nicknameForEntry(reg.byId.get('rosemont'), 'F', 'volleyball'), 'Gauloises');
  assert.equal(Registry.nicknameForEntry(reg.byId.get('rosemont'), 'F', 'unverified-sport'), null);
  assert.equal(Registry.nicknameForEntry(reg.byId.get('polytechnique'), 'M', 'basketball'), null);
  assert.equal(Registry.nicknameForEntry(reg.byId.get('ulaval'), 'F', 'sailing'), null);
});

test('identity migration is idempotent, preserving every score/schedule/GameId/URL and all 867 formation keys', () => {
  const before = unpackSportsPayload(structuredClone(raw));
  const after = migrateIdentities(raw, reg);
  assert.equal(Object.keys(after.teams).length, 867);
  assert.deepEqual(invariantProjection(after), invariantProjection(before));
  assert.deepEqual(migrateIdentities(after, reg), after);
  assert.equal(refs.length, 60);
  for (const game of refs) for (const [own, other] of [[game.HomeTeamId, game.VisitingTeamId], [game.VisitingTeamId, game.HomeTeamId]]) {
    const officialName = other === game.HomeTeamId ? game.HomeTeamName : game.VisitingTeamName;
    const fixture = { gameId: game.GameId, opponent: officialName, opponentRegistryId: 'beauce-appalaches-sm', opponentCode: 'BAPS', scoreFor: 0, scoreAgainst: 3 };
    Registry.applyRegistryToGameSide(fixture, reg, 'collegial', 'F', 'volleyball', own);
    assert.equal(fixture.opponentRseqTeamId, other);
    const expected = Registry.resolveSportsTeam(reg, { rseqTeamId: other, name: officialName, sport: 'volleyball', sex: 'F' });
    assert.equal(fixture.opponentRegistryId || null, expected.registryId);
    assert.equal(fixture.scoreFor, 0); assert.equal(fixture.scoreAgainst, 3);
  }
});

test('discovery does not remint verified source variants or reattach the SG TeamId to SM', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sports-identity-'));
  try {
    const registryPath = join(dir, 'registry.json'); const sportsPath = join(dir, 'sports.json');
    writeFileSync(registryPath, JSON.stringify({ teams: reg.teams }));
    writeFileSync(sportsPath, JSON.stringify(migrateIdentities(raw, reg)));
    const out = syncSportsTeamsRegistry({ schools: [], watchlist: [], cicsa: { clubs: [] } }, { registryPath, sportsPath });
    assert.equal(out.payload.teams.length, 93);
    assert.equal(out.teamsAdded, 0);
    assert.ok(!out.payload.teams.find(t => t.id === 'beauce-appalaches-sm').rseqTeamIds.includes('1c5b3580-ffcf-48e5-8e22-813514e767ea'));
    assert.equal(out.payload.teams.find(t => t.id === 'mcgill').nickname, null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Laval 15h is live at 15h24 Toronto, 19h is not; CI UTC and DST produce the same kickoff', () => {
  const now = Date.parse('2026-11-07T20:24:00Z');
  assert.equal(Fresh.zonedTimeToMs('2026-11-07', '15:00'), Date.parse('2026-11-07T20:00:00Z'));
  assert.equal(SEO.sportsNextIsLive({ date: '2026-11-07', time: '15:00' }, now), true);
  assert.equal(SEO.sportsNextIsLive({ date: '2026-11-07', time: '19:00', live: true }, now), false);
  assert.equal(Live.isLiveRaw({ date: '2026-11-07', time: '19:00', live: true }, Date.parse('2026-11-07T23:50:00Z')), false);
  assert.equal(SEO.sportsNextIsLive({ date: '2026-11-07', time: '' }, now), false);
  assert.equal(SEO.sportsNextIsLive({ date: '2026-11-07', time: '15:00', final: true }, now), false);
  const code = "console.log(require('./scripts/seo-pages').sportsNextGameTs({nextGame:{date:'2026-11-07',time:'15:00'}}))";
  for (const TZ of ['UTC', 'Asia/Tokyo', 'America/Toronto']) assert.equal(Number(execFileSync(process.execPath, ['-e', code], { cwd: new URL('..', import.meta.url), env: { ...process.env, TZ } }).toString()), Date.parse('2026-11-07T20:00:00Z'));
  assert.equal(Fresh.zonedTimeToMs('2026-10-31', '15:00'), Date.parse('2026-10-31T19:00:00Z'));
  assert.equal(Fresh.zonedTimeToMs('2026-11-01', '15:00'), Date.parse('2026-11-01T20:00:00Z'));
});

test('Today is a Toronto civil day across UTC midnight and DST, not the browser’s local day', () => {
  const block = board.slice(board.indexOf('  function ymdInToronto('), board.indexOf('  /** Dates de matchs'));
  const ctx = vm.createContext({ Intl, Date });
  vm.runInContext("const TZ = 'America/Toronto';" + block + ';globalThis.getRange = periodRange', ctx);
  for (const [instant, day] of [['2026-11-08T04:59:59Z', '2026-11-07'], ['2026-11-08T05:00:00Z', '2026-11-08'], ['2026-03-08T04:59:59Z', '2026-03-07'], ['2026-03-08T05:00:00Z', '2026-03-08'], ['2026-11-01T05:30:00Z', '2026-11-01'], ['2026-11-01T06:30:00Z', '2026-11-01']]) {
    const range = ctx.getRange('today', new Date(instant)); assert.equal(range.start, day); assert.equal(range.end, day);
  }
});

test('SSR contains every today game, bilingual Today, accessible institution control and live hydration', () => {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
  const html = SEO.sportsResultRows({ sport: 'volleyball', nextGame: { gameId: 'one', date: day, time: '19:00', opponent: 'Université Laval' }, nextGames: [{ gameId: 'one', date: day, time: '19:00', opponent: 'Université Laval' }, { gameId: 'two', date: day, time: '20:30', opponent: 'Cégep Garneau' }] }, T.fr, 'fr');
  assert.match(html, /data-game-id="one"/); assert.match(html, /data-game-id="two"/);
  for (const [lang, label] of [['fr', 'Aujourd’hui'], ['en', 'Today']]) {
    const page = readFileSync(new URL(lang === 'fr' ? '../sports/index.html' : '../en/sports/index.html', import.meta.url), 'utf8');
    assert.match(page, new RegExp(`data-filter-period="today"[^>]*>${label}`));
    assert.match(page, /id="sports-institution" type="search" list="sports-institutions"/);
    assert.match(page, /data-sports-status role="status" aria-live="polite"/);
  }
  assert.match(board, /radar:sports-updated/);
  assert.doesNotMatch(board, /effectiveSport = 'all';\s*effectiveSex = 'all'/);
  assert.match(board, /okPeriod && okSchool/);
});

test('missing score is not zero; actual 0–0 remains a valid source score', () => {
  for (const value of [null, undefined, '', ' ', -999]) assert.equal(Live.rseqHasScore({ scoreFor: value, scoreAgainst: value }), false);
  assert.equal(Live.rseqHasScore({ scoreFor: 0, scoreAgainst: 0 }), true);
});

test('the compact payload keeps every today fixture even above the historical fixed capacity', () => {
  const teams = {};
  for (let i = 0; i < 60; i++) teams[i] = { id: String(i), sport: 'football', nextGames: [{ gameId: String(i), date: '2026-11-07', time: i % 2 ? '9:00' : '15:00' }] };
  const out = buildSportsMastheadPayload({ teams }, { referenceDate: new Date('2026-11-07T20:24:00Z') });
  assert.equal(Object.keys(out.teams).length, 60);
});

test('queue bounds concurrency, coalesces identical work and keeps healthy work alive beside a slow source', async () => {
  const q = createSourceQueue({ concurrency: 2, attempts: 1, timeoutMs: 30 });
  let calls = 0; let aborted = false;
  const slow = q.run('slow', signal => new Promise(() => { signal.addEventListener('abort', () => { aborted = true; }); }));
  const good = q.run('good', async () => { calls++; return 7; });
  assert.strictEqual(q.run('good', async () => 8), good);
  assert.equal(await good, 7); assert.equal(calls, 1);
  await assert.rejects(slow, /timeout/); assert.equal(aborted, true);
  assert.equal(await q.run('after', async () => 9), 9);
  assert.ok(q.stats.peak <= 2); assert.equal(q.stats.coalesced, 1);
});

test('queue retries only transient failures with backoff; permanent 403 is not retried', async () => {
  const waits = []; let now = 0; let n = 0;
  const q = createSourceQueue({ now: () => now, random: () => 0, wait: async ms => { waits.push(ms); now += ms; } });
  assert.equal(await q.run('503', async () => { if (++n === 1) throw Object.assign(new Error('busy'), { status: 503 }); return 'ok'; }), 'ok');
  assert.deepEqual(waits, [500]); assert.equal(n, 2);
  let forbidden = 0;
  await assert.rejects(q.run('403', async () => { forbidden++; throw Object.assign(new Error('forbidden'), { status: 403 }); }), /forbidden/);
  assert.equal(forbidden, 1);
});

test('Retry-After is respected, no requests during source cooldown, a new harvest resets coalescence', async () => {
  let now = 0; let calls = 0;
  const q = createSourceQueue({ concurrency: 1, now: () => now, wait: async ms => { now += ms; } });
  await assert.rejects(q.run('limit', async () => { calls++; throw Object.assign(new Error('rate limited'), { status: 429, retryAfterMs: 60000 }); }), /rate limited/);
  await assert.rejects(q.run('second', async () => { calls++; }), /cooldown/);
  assert.equal(calls, 1);
  const reset = createSourceQueue(); assert.equal(await reset.run('limit', async () => 'new harvest'), 'new harvest');
});

test('finite queue deadline stops new attempts and queued work after backoff', async () => {
  let now = 0; let calls = 0;
  const q = createSourceQueue({ concurrency: 1, deadlineMs: 100, now: () => now, random: () => 0, wait: async ms => { now += ms; } });
  await assert.rejects(q.run('retry', async () => { calls++; throw Object.assign(new Error('busy'), { status: 503 }); }), /deadline/);
  await assert.rejects(q.run('later', async () => { calls++; }), /deadline/);
  assert.equal(calls, 1);
  assert.throws(() => createSourceQueue({ concurrency: 0 }), RangeError);
});

test('queue prioritizes known live leagues and remains FIFO within a priority', async () => {
  const q = createSourceQueue({ concurrency: 1 }); const order = []; let release;
  const first = q.run('first', () => new Promise(resolve => { release = resolve; }));
  const ordinary = q.run('ordinary', async () => order.push('ordinary'));
  const live1 = q.run('live1', async () => order.push('live1'), { priority: -1 });
  const live2 = q.run('live2', async () => order.push('live2'), { priority: -1 });
  release(); await Promise.all([first, ordinary, live1, live2]);
  assert.deepEqual(order, ['live1', 'live2', 'ordinary']);
});


test('postseason and championship sources are included; unknown kickoff is never estimated live', () => {
  const fixtures = Collector.allGames({ PreSeasonGames: [{ id: 1 }], RegularSeasonGames: [{ id: 2 }], PostSeasonGames: [{ id: 3 }], ChampionshipGames: [{ id: 4 }], ConferenceChampionshipGames: [{ id: 5 }] });
  assert.deepEqual(fixtures.map(g => g.id), [1, 2, 3, 4, 5]);
  assert.equal(Live.isLiveRaw({ date: '2026-11-07', time: '' }, Date.parse('2026-11-07T18:00:00Z')), false);
});

test('a failed hockey sector cannot overwrite the healthy sector or a fresh team in the same sector', () => {
  const previous = { old: { source: 'spordle-rseqhockey', sector: 'collegial', nextGame: { gameId: 'a', scoreFor: 0, scoreAgainst: 0 } }, good: { source: 'spordle-rseqhockey', sector: 'universitaire', marker: 'old' }, fresh: { source: 'spordle-rseqhockey', sector: 'collegial', marker: 'old' } };
  const current = { good: { source: 'spordle-rseqhockey', sector: 'universitaire', marker: 'fresh university' }, fresh: { source: 'spordle-rseqhockey', sector: 'collegial', marker: 'fresh college' } };
  assert.equal(Collector.restoreFailedHockeySectors(current, previous, [{ leagueId: 'spordle-collegial', error: 'timeout' }]), 1);
  assert.equal(current.good.marker, 'fresh university'); assert.equal(current.fresh.marker, 'fresh college');
  assert.equal(current.old.staleSource, true); assert.equal(current.old.nextGame.scoreFor, 0);
});

test('a live pass does not erase failures of unattempted sources, and a checked success clears its old error', () => {
  const previous = [{ leagueId: 'spordle-collegial', error: '403' }, { leagueId: 'checked-ok', error: 'old failure' }];
  const result = Collector.retainUnattemptedErrors(previous, [{ leagueId: 'checked-bad', error: 'timeout' }], ['checked-ok', 'checked-bad']);
  assert.deepEqual(result.map(e => e.leagueId), ['checked-bad', 'spordle-collegial']);
});


test('live feed refuses a tied Alma squad match instead of assigning the institutional name arbitrarily', () => {
  const Presto = require('../scripts/sports-presto-live-lib');
  const teams = {};
  for (const [i, registryId] of ['alma', 'alma-2'].entries()) teams[i] = { id: String(i), registryId, name: reg.byId.get(registryId).fullName, sector: 'collegial', sport: 'volleyball', sex: 'F', nextGame: { date: '2026-11-07', time: '15:00', gameId: `alma-squad-${i}`, home: true, opponent: 'Vanier', opponentRegistryId: 'vanier' } };
  const candidates = Presto.collectCandidates(teams, Date.parse('2026-11-07T20:24:00Z'));
  const event = { date: '2026-11-07', sport: 'volleyball', sex: 'F', home: { name: "Collège d’Alma", score: 0 }, away: { name: 'Collège Vanier', score: 0 } };
  assert.equal(Presto.matchEvent(event, 'collegial', candidates, Presto.buildRegistryIndex(reg)), null);
});


test('unexpected source-task rejection is isolated; retained S1 data lets healthy origins publish', async () => {
  const failed = await Collector.isolateSourceTask(Promise.reject(new Error('source crashed')), 'spordle-all', 'Hockey');
  assert.deepEqual(failed.teams, {}); assert.equal(failed.errors[0].error, 'source crashed');
  assert.equal(Collector.shouldAbortSourceFailures(112, 112, 800), false);
  assert.equal(Collector.shouldAbortSourceFailures(112, 112, 0), true);
  assert.equal(Collector.shouldAbortSourceFailures(1, 112, 0), false);
});


test('Kingston RMC never becomes Saint-Jean Remparts; university aliases cannot cross into collegiate feeds', () => {
 const Presto=require('../scripts/sports-presto-live-lib');const index=Presto.buildRegistryIndex(reg);
 assert.equal(Presto.registryIdsFor('RMC','universitaire',index).size,0);
 assert.equal(Presto.registryIdsFor('Montréal','collegial',index).size,0);
 assert.equal(Registry.resolveSportsTeam(reg,{name:'RMC',registryId:'college-militaire-royal'}).matched,false);
 assert.equal(Registry.resolveSportsTeam(reg,{name:'Collège militaire royal'}).matched,false);
});

test('Toronto DST transition mornings round-trip; repeated hour chooses first and missing hour stays unknown', () => {
  for (const [date,time,iso] of [
    ['2026-03-08','00:30','2026-03-08T05:30:00Z'],
    ['2026-03-08','01:30','2026-03-08T06:30:00Z'],
    ['2026-03-08','03:30','2026-03-08T07:30:00Z'],
    ['2026-11-01','00:30','2026-11-01T04:30:00Z'],
    ['2026-11-01','01:30','2026-11-01T05:30:00Z'],
    ['2026-11-01','02:30','2026-11-01T07:30:00Z'],
  ]) assert.equal(Fresh.zonedTimeToMs(date,time), Date.parse(iso), `${date} ${time}`);
  assert.ok(Number.isNaN(Fresh.zonedTimeToMs('2026-03-08','02:30')));
  assert.ok(Number.isNaN(Fresh.zonedTimeToMs('2026-11-07','15:00','Invalid/Timezone')));
});

test('hockey refuses suspended origins without edge proxy, browser impersonation or subprocess fallback', () => {
  const collector = readFileSync(new URL('../scripts/fetch-sports.js', import.meta.url),'utf8');
  const sidecar = readFileSync(new URL('../scripts/hockey-spordle.py', import.meta.url),'utf8');
  assert.doesNotMatch(collector,/HOCKEY_CACHE_URL|HOCKEY_PYTHON|execFileAsync/);
  assert.doesNotMatch(sidecar,/curl_cffi|impersonate=|fetch_worker|urllib\.request/);
  assert.match(sidecar,/access_refused_http_403/);
});

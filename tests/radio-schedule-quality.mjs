import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const lib = require('../scripts/radio-schedule-lib');
const { T, scheduleQualityText } = require('../scripts/seo-pages-lib');
const fixture = (name) => readFileSync(new URL(`fixtures/radio-schedules/${name}.txt`, import.meta.url), 'utf8');
const cjlo = lib.mergeGrids(lib.parseCjloGrid(fixture('cjlo')));
assert.equal(cjlo.length, 3, 'reject Drupal zero-hour placeholders, keep valid source slots');
assert.equal(cjlo.filter((s) => s.day === 0 && s.start === '13:00').length, 2, 'keep real alternances');
for (const range of ['Midnight - 0:30 AM', '0:00 AM - 1:00 AM', '13:00 PM - 2:00 PM', '12:99 AM - 1:00 AM']) {
  assert.equal(lib.parseCjloTimeRange(range), null, range);
}
assert.deepEqual(lib.parseCjloTimeRange('Midnight - 12:30 AM'), { start: '00:00', end: '00:30' });
assert.equal(lib.parseChyzGrid(fixture('chyz'))[0].start, '14:30', 'use source time, no timezone offset/hardcode');
assert.equal(lib.parseChyzGrid(fixture('chyz').replace('14:30 - 18:30', '15:15 - 19:15'))[0].start, '15:15');
const slot = { day: 1, start: '00:00', end: '00:30', title: 'A real programme' };
const pile = Array.from({ length: 256 }, (_, i) => ({ ...slot, title: `Placeholder ${i}` }));
assert.equal(lib.gridPlausibilityIssues(pile).length, 1);
assert.equal(lib.gridPlausibilityIssues([{ ...slot, title: 'Alternate one' }, { ...slot, title: 'Alternate two' }]).length, 0);
const now = '2026-11-07T07:00:00Z';
const old = { grid: pile, checkedAt: '2026-11-06T16:22:00Z', verifiedWeekOf: '2026-11-02' };
const args = { now, weekOf: '2026-11-02', floor: 95 };
const full = Array.from({ length: 7 }, (_, day) => ({ ...slot, day, start: '00:00', end: '00:00' }));
assert.equal(lib.selectScheduleGrid({ ...args, previous: old, grid: full }).grid, full, 'invalid old count cannot trap fixed grid');
const previous = { grid: full, sources: ['official'], checkedAt: '2026-11-01T06:00:00Z', verifiedWeekOf: '2026-10-26' };
for (const grid of [pile, [], [slot]]) {
  const retained = lib.selectScheduleGrid({ ...args, previous, grid });
  assert.equal(retained.checkedAt, previous.checkedAt, 'attempt is not verification');
  assert.equal(retained.verifiedWeekOf, previous.verifiedWeekOf);
  assert.equal(retained.attemptedAt, now);
  assert.equal(retained.unverified, true);
}
assert.throws(() => lib.selectScheduleGrid({ ...args, previous: old, grid: pile, force: true }), /No trustworthy/, 'force cannot publish implausible piles');
const singleCfak = lib.mergeGrids(lib.parseCfakGrid('<h2 class="uppercase">samedi</h2><p class="texteTitre">Les nuits CFAK</p><div class="texteTitre">00:00</div>'));
assert.equal(singleCfak.length, 1);
assert.equal(singleCfak[0].endUnknown, true);
assert.equal(singleCfak[0].end, undefined, 'never invent CFAK weekend 07:00');
assert.equal(lib.gridCoverage(singleCfak).weekPercent, 0);
assert.equal(lib.resolveCurrentSlot(singleCfak, new Date('2026-11-07T07:12:00Z')), null);
assert.match(scheduleQualityText({ grid: singleCfak, checkedAt: now }, T.fr, Date.parse(now)), /fins ne sont pas publiées/);
const cov = lib.gridCoverage([{ ...slot, day: 6, start: '23:00', end: '02:00' }]);
assert.equal(cov.perDay[6], 60);
assert.equal(cov.perDay[0], 120, 'count overnight spill on Sunday');
const overlap = [{ ...slot, day: 6, start: '23:00', end: '02:00' }, { ...slot, day: 0, start: '01:00', end: '03:00', title: 'Newer show' }];
assert.equal(lib.resolveCurrentSlot(overlap, new Date('2026-11-08T06:30:00Z')).title, 'Newer show');
assert.equal(lib.resolveNextSlot(overlap, new Date('2026-11-08T07:30:00Z')).day, 6);
for (const instant of ['2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z']) {
  assert.equal(lib.resolveCurrentSlot([{ ...slot, day: 0, start: '01:00', end: '02:00' }], new Date(instant))?.start, '01:00', 'both repeated Toronto DST hours');
}
assert.deepEqual(lib.zonedNow(new Date('2026-03-08T07:30:00Z')), { day: 0, minutes: 210 }, 'spring jump in Toronto');
assert.equal(lib.resolveCurrentSlot([slot], new Date('2026-11-09T05:30:00Z')), null, 'end is exclusive');
const notice = scheduleQualityText({ ...previous, unverified: true }, T.fr, Date.parse(now));
assert.match(notice, /non vérifiée/);
assert.match(scheduleQualityText({ grid: [slot], checkedAt: now }, T.fr, Date.parse(now)), /plages absentes.*hors ligne/);
assert.match(scheduleQualityText({ grid: [{ ...slot, endInferred: true }], checkedAt: now }, T.en, Date.parse(now)), /End times are estimated/);
// Nuxt endpoint can return HTML instead of JSON: retain working SSR fallback.
const payload = [{ Monday: 1, Tuesday: 1, Thursday: 1 }, [2], { slug: 3, title: 4, start: 5, end: 6 }, 'real-show', 'Real show', 1794056400, 1794060000];
const cism = await lib.fetchCismGrid({ url: 'https://example.test/grille/' }, { fetchImpl: async (url) => ({ ok: true, text: async () => url.endsWith('_payload.json') ? '<html>not JSON</html>' : `<script type="application/json">${JSON.stringify(payload)}</script>` }) });
assert.equal(cism.length, 3);
await assert.rejects(lib.fetchChoqGrid({}, { fetchImpl: async () => ({ ok: false, status: 503 }) }), /HTTP 503/, 'do not timestamp a partial failed week as verified');
let cismRequests = 0;
const cismSsr = await lib.fetchCismGrid({}, { fetchImpl: async () => {
  cismRequests += 1;
  return { ok: true, text: async () => `<script type="application/json">${JSON.stringify(payload)}</script>` };
} });
assert.equal(cismSsr.length, 3);
assert.equal(cismRequests, 1, 'use a complete public SSR fallback directly, no redundant request');
const choqDates = [];
const choq = await lib.fetchChoqGrid({}, { now: '2026-11-01T04:30:00Z', fetchImpl: async (url, options) => {
  choqDates.push(JSON.parse(options.body).variables.date);
  return { ok: true, json: async () => ({ data: { entries: [{
    timestamp_start: '2026-11-01T00:00:00-04:00', timestamp_end: '2026-11-01T02:00:00-05:00',
    parent: [{ title: 'Actual dated broadcast', slug: 'real-show' }],
  }] } }) };
} });
assert.deepEqual(choqDates[0], ['and', '>= 2026-10-26', '< 2026-10-27']);
assert.deepEqual(choqDates[6], ['and', '>= 2026-11-01', '< 2026-11-02']);
assert.equal(choq[0].start, '00:00');
assert.equal(choq[0].end, '02:00');
assert.equal(choq[0].url, 'https://www.choq.ca/balados/real-show');
const { shouldProbeSource } = require('../scripts/discover-schedule-sources');
const knownSource = { type: 'cjlo', url: 'https://www.cjlo.com/schedule/' };
const guessedSource = { type: 'cjlo', url: 'https://www.cjlo.com/horaire/' };
const knownLabels = new Set(['cjlo:https://www.cjlo.com/schedule/']);
assert.equal(shouldProbeSource(knownSource, knownLabels, 1), true, 'always revalidate each configured source');
assert.equal(shouldProbeSource(guessedSource, knownLabels, 1), false, 'do not scan unrelated paths while a known source works');
assert.equal(shouldProbeSource(guessedSource, knownLabels, 0), true, 'discover alternate public sources when every known source fails');
assert.equal(shouldProbeSource(guessedSource, knownLabels, 1, true), true, 'explicit full source audit remains available');
// CFAK's exact ends are in the publicly linked page data, not the visible starts.
const { parseNuxt2PageData } = require('../scripts/public-page-data-lib');
const published = fixture('cfak-page-data');
const decoded = parseNuxt2PageData(published);
const exactCfak = lib.mergeGrids(lib.cfakPageDataToGrid(decoded));
assert.equal(exactCfak.length, 36);
assert.equal(exactCfak.filter((s) => s.sourceEnd).length, 36);
assert.equal(lib.gridCoverage(exactCfak).weekPercent, 50, 'real scheduled duration, not stretched-to-next-start coverage');
assert.equal(exactCfak.find((s) => s.day === 6).end, '04:59');
assert.equal(exactCfak.find((s) => s.day === 6).sourceEnd, '04:59');
assert.equal(exactCfak.find((s) => s.day === 1 && s.start === '13:00').end, '13:59');
assert.equal(exactCfak.find((s) => s.day === 2 && s.start === '22:00').end, '23:59');
assert.equal(lib.resolveCurrentSlot(exactCfak, new Date('2026-11-07T09:58:00Z')).title, 'Les nuits CFAK');
assert.equal(lib.resolveCurrentSlot(exactCfak, new Date('2026-11-07T09:59:00Z')), null);
assert.equal(lib.resolveCurrentSlot(exactCfak, new Date('2026-11-09T04:59:00Z')), null, 'no invented Sunday evening filler');
for (const build of ['1793725584', 'next-build-123']) {
  const calls = [];
  const fresh = await lib.fetchCfakGrid({ url: 'https://www.cfak.ca/programmation/' }, {
    fetchImpl: async (url) => {
      calls.push(url);
      return { ok: true, text: async () => url.endsWith('payload.js') ? published : `<link rel="preload" href="/_nuxt/static/${build}/programmation/payload.js" as="script">` };
    },
  });
  assert.equal(fresh.length, 36);
  assert.equal(calls[1], `https://www.cfak.ca/_nuxt/static/${build}/programmation/payload.js`);
  assert.equal(fresh.sourceUrl, calls[1], 'trace the exact public asset actually read');
}
const exactPrevious = { ...previous, grid: exactCfak };
const retainedCfak = lib.selectScheduleGrid({ ...args, previous: exactPrevious, grid: singleCfak, floor: 0 });
assert.equal(retainedCfak.checkedAt, previous.checkedAt);
assert.equal(retainedCfak.retainedReason, 'source-missing-end-times');
await assert.rejects(lib.fetchCfakGrid({ url: 'https://www.cfak.ca/programmation/' }, {
  fetchImpl: async (url) => ({ ok: true, text: async () => url.endsWith('payload.js') ? 'broken' : '<script src="/_nuxt/static/changed/programmation/payload.js"></script>' }),
}), /Unsupported Nuxt/, 'a broken payload must not downgrade verified ends to guesses');
for (const unsafe of [
  published.replace('return ', 'return process.exit(1) || '),
  published.replace('"Les nuits CFAK")));', 'process.exit(1))));'),
  published.replace('"data":', '"__proto__":'),
  published.slice(0, -8),
  published + 'process.exit(1);',
]) assert.throws(() => parseNuxt2PageData(unsafe), undefined, 'never execute page JavaScript or accept malformed data');
assert.throws(() => parseNuxt2PageData('x'.repeat(2000001)), /too large/);
console.log('radio-schedule-quality: exact published CFAK page data, safe decoding, source changes/retention, fixtures, plausibility, freshness, midnight/DST, fallbacks OK');

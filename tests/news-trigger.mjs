import assert from 'node:assert/strict';
import { decide, newestFeedDate } from '../cloudflare/news-trigger/src/lib.js';
const now = Date.parse('2026-10-27T00:00:00Z');
const upd = now - 20 * 60000;
assert.equal(newestFeedDate('<item><pubDate>Mon, 26 Oct 2026 23:50:00 GMT</pubDate></item>'), Date.parse('2026-10-26T23:50:00Z'));
assert.equal(decide({ now, newsUpdated: upd, active: 1, feedDates: [now] }).dispatch, false);
assert.equal(decide({ now, newsUpdated: upd, active: 0, feedDates: [upd - 1] }).dispatch, false);
assert.equal(decide({ now, newsUpdated: upd, active: 0, feedDates: [now - 60000] }).dispatch, true);
assert.equal(decide({ now, newsUpdated: now - 61 * 60000, active: 0, feedDates: [] }).dispatch, true);
assert.equal(decide({ now, newsUpdated: upd, active: 0, feedDates: [now + 86400000] }).dispatch, false); // date future ignorée
console.log('news-trigger ok');

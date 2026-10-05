#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { WRITER_WORKFLOWS } from '../scripts/maintenance-window.mjs';

const require = createRequire(import.meta.url);
const {
  articleLinkKey,
  pageTitleFromHtml,
  classifyFetched,
  confirmedMissingUrlSet,
  omitMissingItems,
  applyLedger,
  emptyLedger,
  MISSING_TTL_MS,
} = require('../scripts/live-link-health-lib.js');

const MCGILL = 'https://www.mcgilldaily.com/2026/10/language-laws-meet-the-ballot-box/';
const MCGILL_TITLE = 'Language Laws Meet the Ballot Box';
const NOT_FOUND_HTML = `<!DOCTYPE html><html><head>
<title>Page Not Found - The McGill Daily</title>
<meta property="og:title" content="Page Not Found - The McGill Daily" />
</head><body>Page not found</body></html>`;

assert.equal(
  articleLinkKey(MCGILL),
  articleLinkKey('https://www.McGillDaily.com/2026/10/language-laws-meet-the-ballot-box'),
);

assert.equal(pageTitleFromHtml(NOT_FOUND_HTML), 'Page Not Found - The McGill Daily');

const gone = classifyFetched({
  originUrl: MCGILL,
  statusCode: 404,
  finalUrl: MCGILL,
  pageTitle: pageTitleFromHtml(NOT_FOUND_HTML),
  articleTitle: MCGILL_TITLE,
  body: NOT_FOUND_HTML,
});
assert.equal(gone.status, 'missing');
assert.equal(gone.reason, 'http_404');

const falseAlarm = classifyFetched({
  originUrl: MCGILL,
  statusCode: 404,
  finalUrl: MCGILL,
  pageTitle: `${MCGILL_TITLE} - The McGill Daily`,
  articleTitle: MCGILL_TITLE,
  body: '<title>Language Laws Meet the Ballot Box - The McGill Daily</title>',
});
assert.equal(falseAlarm.status, 'suspect', 'un 404 qui contient encore le titre reste au fil');

assert.equal(classifyFetched({
  originUrl: MCGILL,
  statusCode: 200,
  finalUrl: MCGILL,
  pageTitle: MCGILL_TITLE,
  articleTitle: MCGILL_TITLE,
  body: '',
}).status, 'available');

assert.equal(classifyFetched({
  originUrl: MCGILL,
  statusCode: 503,
  finalUrl: MCGILL,
  body: '',
}).status, 'unreachable');

assert.equal(classifyFetched({
  originUrl: MCGILL,
  statusCode: 403,
  finalUrl: MCGILL,
  body: '<title>Just a moment...</title><script src="https://challenges.cloudflare.com/turnstile"></script>',
}).status, 'unreachable');

assert.equal(classifyFetched({
  originUrl: MCGILL,
  statusCode: 302,
  finalUrl: 'https://www.mcgilldaily.com/',
  body: '',
}).status, 'missing');
assert.equal(classifyFetched({
  originUrl: MCGILL,
  statusCode: 302,
  finalUrl: 'https://www.mcgilldaily.com/',
  body: '',
}).reason, 'homepage_redirect');

const nowIso = '2026-10-05T05:05:03.000Z';
const now = Date.parse(nowIso);
const first = applyLedger(emptyLedger(), [{
  url: MCGILL,
  status: 'missing',
  statusCode: 404,
  reason: 'http_404',
  pageTitle: 'Page Not Found - The McGill Daily',
  articleTitle: MCGILL_TITLE,
  source: 'The McGill Daily',
}], nowIso);
assert.equal(first.changed, true);
assert.equal(confirmedMissingUrlSet(first.ledger, now).size, 1);

const sameDay = applyLedger(first.ledger, [{
  url: MCGILL,
  status: 'missing',
  statusCode: 404,
  reason: 'http_404',
  articleTitle: MCGILL_TITLE,
  source: 'The McGill Daily',
}], '2026-10-05T12:00:00.000Z');
assert.equal(sameDay.changed, false, 'une 404 déjà notée depuis moins de 24 h ne réécrit pas le registre');

const blip = applyLedger(first.ledger, [{
  url: MCGILL,
  status: 'unreachable',
  statusCode: 503,
  reason: 'http_503',
}], '2026-10-05T18:00:00.000Z');
assert.equal(blip.changed, false);
assert.equal(confirmedMissingUrlSet(blip.ledger, Date.parse('2026-10-05T18:00:00.000Z')).size, 1);

const back = applyLedger(first.ledger, [{
  url: MCGILL,
  status: 'available',
  statusCode: 200,
  reason: 'http_ok',
}], '2026-10-06T05:05:03.000Z');
assert.equal(back.changed, true);
assert.equal(confirmedMissingUrlSet(back.ledger, Date.parse('2026-10-06T05:05:03.000Z')).size, 0);

const items = [
  { title: MCGILL_TITLE, link: MCGILL, source: 'The McGill Daily' },
  { title: 'Autre', link: 'https://www.mcgilldaily.com/2026/10/autre-texte/', source: 'The McGill Daily' },
];
const omitted = omitMissingItems(items, first.ledger, now);
assert.equal(omitted.removed.length, 1);
assert.equal(omitted.items.length, 1);
assert.equal(omitted.items[0].title, 'Autre');

const expired = applyLedger(first.ledger, [], new Date(now + MISSING_TTL_MS + 1000).toISOString());
assert.equal(expired.changed, true);
assert.equal(Object.keys(expired.ledger.entries).length, 0);

const workflow = readFileSync(new URL('../.github/workflows/verify-live-links.yml', import.meta.url), 'utf8');
assert.match(workflow, /verify-live-links\.js --update/);
assert.match(workflow, /40 \*\/6 \* \* \*/);
assert.match(workflow, /git status --porcelain/);
assert.ok(WRITER_WORKFLOWS.includes('.github/workflows/verify-live-links.yml'));

const fetchNews = readFileSync(new URL('../scripts/fetch-news.js', import.meta.url), 'utf8');
assert.match(fetchNews, /omitMissingItems/);

console.log('OK live-link-health');

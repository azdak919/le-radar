#!/usr/bin/env node
/**
 * Contrôle les pages des articles encore au fil.
 *
 * Un 404 ou un 410 confirmé (titre de page ≠ titre de l'article), une
 * redirection vers l'accueil, ou une URL /404 retire l'article. Le registre
 * `data/live-link-health.json` empêche la récolte RSS de le ramener tant
 * que la page n'est pas revenue (200) ou que 14 jours se sont écoulés.
 *
 *   node scripts/verify-live-links.js
 *   node scripts/verify-live-links.js --update
 *   node scripts/verify-live-links.js --url=https://exemple.test/article/
 */
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { spawnSync } = require('child_process');
const { isAllowedFetchUrl } = require('./url-security-lib');
const {
  articleLinkKey,
  pageTitleFromHtml,
  classifyFetched,
  readLedger,
  writeLedger,
  omitMissingItems,
  applyLedger,
  confirmedMissingUrlSet,
} = require('./live-link-health-lib');

const ROOT = path.join(__dirname, '..');
const NEWS_PATH = path.join(ROOT, 'news.json');
const USER_AGENT = 'Mozilla/5.0 (compatible; LE-RADAR-NewsBot/1.0; +https://le-radar.ca/)';
const MAX_BODY = 80_000;
const POOL = 4;
const HOST_GAP_MS = 300;

const update = process.argv.includes('--update');
const urlArg = process.argv.find((arg) => arg.startsWith('--url='));
const onlyUrl = urlArg ? urlArg.slice(6).trim() : '';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestOnce(url, method) {
  if (!isAllowedFetchUrl(url)) {
    return Promise.resolve({ statusCode: null, location: '', finalUrl: url, body: '', error: 'blocked' });
  }
  const lib = url.startsWith('http:') ? http : https;
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    let req;
    try {
      req = lib.request(url, {
        method,
        timeout: 12_000,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
        },
      }, (res) => {
        const statusCode = res.statusCode || 0;
        const location = res.headers.location || '';
        if (method === 'HEAD' || (statusCode >= 300 && statusCode < 400)) {
          res.resume();
          return done({ statusCode, location, finalUrl: url, body: '' });
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          if (body.length < MAX_BODY) body += chunk;
          if (body.length >= MAX_BODY) {
            try { req.destroy(); } catch { /* plafond atteint */ }
            done({ statusCode, location: '', finalUrl: url, body });
          }
        });
        res.on('end', () => done({ statusCode, location: '', finalUrl: url, body }));
        res.on('error', () => done({ statusCode, location: '', finalUrl: url, body }));
      });
    } catch {
      return done({ statusCode: null, location: '', finalUrl: url, body: '', error: 'request' });
    }
    req.on('error', () => done({ statusCode: null, finalUrl: url, body: '', error: 'network' }));
    req.on('timeout', () => {
      try { req.destroy(); } catch { /* ignore */ }
      done({ statusCode: null, finalUrl: url, body: '', error: 'timeout' });
    });
    req.end();
  });
}

async function request(url, method, redirects = 4) {
  const first = await requestOnce(url, method);
  const code = first.statusCode || 0;
  if (code >= 300 && code < 400 && first.location && redirects > 0) {
    let next = '';
    try { next = new URL(first.location, url).toString(); } catch { return first; }
    if (!isAllowedFetchUrl(next)) return { ...first, error: 'blocked' };
    return request(next, method, redirects - 1);
  }
  return first;
}

function headLooksLive(originUrl, head) {
  const code = head.statusCode || 0;
  return code >= 200 && code < 300 && !isGoneTarget(originUrl, head.finalUrl);
}

function isGoneTarget(originUrl, finalUrl) {
  return classifyFetched({ originUrl, statusCode: 200, finalUrl, pageTitle: '', articleTitle: '', body: '' }).status === 'missing';
}

async function probeUrl(target) {
  const head = await request(target.url, 'HEAD');
  if (headLooksLive(target.url, head)) {
    return {
      ...target,
      status: 'available',
      statusCode: head.statusCode,
      reason: 'http_ok',
      finalUrl: head.finalUrl,
      pageTitle: '',
    };
  }
  const got = await request(target.url, 'GET');
  const pageTitle = pageTitleFromHtml(got.body);
  const classified = classifyFetched({
    originUrl: target.url,
    statusCode: got.statusCode,
    finalUrl: got.finalUrl,
    pageTitle,
    articleTitle: target.articleTitle,
    body: got.body,
  });
  return {
    ...target,
    ...classified,
    finalUrl: got.finalUrl,
    pageTitle,
  };
}

const hostNext = new Map();

async function probePolite(target) {
  let host = '';
  try { host = new URL(target.url).hostname; } catch { host = ''; }
  const wait = Math.max(0, (hostNext.get(host) || 0) - Date.now());
  hostNext.set(host, Date.now() + wait + HOST_GAP_MS);
  if (wait) await sleep(wait);
  return probeUrl(target);
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
    }
  }
  const width = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: width }, () => worker()));
  return out;
}

function readNews() {
  try {
    return JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
  } catch {
    return { items: [] };
  }
}

function targetsFromNews(news, ledger, now) {
  const byKey = new Map();
  for (const item of news.items || []) {
    const key = articleLinkKey(item.link);
    if (!key || !isAllowedFetchUrl(item.link)) continue;
    byKey.set(key, {
      url: item.link,
      articleTitle: item.title || '',
      source: item.source || '',
    });
  }
  for (const url of confirmedMissingUrlSet(ledger, now)) {
    if (byKey.has(url)) continue;
    const entry = ledger.entries?.[url] || {};
    byKey.set(url, {
      url,
      articleTitle: entry.articleTitle || '',
      source: entry.source || '',
    });
  }
  return [...byKey.values()];
}

function runGenerator(script) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script), '--update'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`${script} a échoué (${result.status})`);
  }
}

async function main() {
  const now = new Date();
  const nowIso = now.toISOString();
  const news = readNews();
  const ledger = readLedger();
  let targets = targetsFromNews(news, ledger, now.getTime());
  if (onlyUrl) {
    const key = articleLinkKey(onlyUrl);
    const known = targets.find((target) => articleLinkKey(target.url) === key);
    targets = [known || { url: onlyUrl, articleTitle: '', source: '' }];
  }
  console.log(`Liens du fil : ${targets.length} à contrôler${update ? '' : ' (dry-run)'}.`);
  const probes = targets.length ? await mapPool(targets, POOL, probePolite) : [];
  let available = 0;
  let missing = 0;
  let held = 0;
  for (const probe of probes) {
    if (probe.status === 'available') available += 1;
    else if (probe.status === 'missing') {
      missing += 1;
      console.log(`  ✗ ${probe.statusCode || ''} ${probe.source || ''} — ${probe.articleTitle || probe.url} (${probe.reason})`);
    } else {
      held += 1;
      console.log(`  · gardé ${probe.status} ${probe.reason || ''} — ${probe.articleTitle || probe.url}`);
    }
  }
  console.log(`Résultat : ${available} accessibles, ${missing} disparus, ${held} gardés (réseau ou doute).`);

  const applied = applyLedger(ledger, probes, nowIso);
  const { removed } = omitMissingItems(news.items || [], applied.ledger, now.getTime());
  if (removed.length) {
    console.log(`À retirer du fil : ${removed.length}`);
    for (const item of removed) console.log(`  - ${item.source}: ${item.title}`);
  } else {
    console.log('Rien à retirer du fil.');
  }
  if (!update) {
    console.log('Dry-run — utilisez --update pour enregistrer.');
    return;
  }
  if (removed.length) {
    const nextNews = {
      ...news,
      count: (news.items || []).length - removed.length,
      items: (news.items || []).filter((item) => !removed.includes(item)),
    };
    fs.writeFileSync(NEWS_PATH, `${JSON.stringify(nextNews, null, 2)}\n`);
    runGenerator('generate-feed.js');
    runGenerator('generate-seo.js');
    console.log(`Fil réécrit sans ${removed.length} article(s) disparu(s).`);
  }
  if (applied.changed) {
    writeLedger(applied.ledger);
    console.log(`Registre écrit : ${LEDGER_COUNT(applied.ledger)} disparition(s) en cours.`);
  } else if (!removed.length) {
    console.log('Registre inchangé.');
  }
}

function LEDGER_COUNT(ledger) {
  return Object.keys(ledger.entries || {}).length;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

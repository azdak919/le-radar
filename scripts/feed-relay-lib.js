'use strict';
/**
 * Repli relais pour flux de nouvelles PUBLICS qui refusent les IP de GitHub
 * Actions (blocage réseau/HTTP). Passe par le Worker le-radar-presto
 * (/v1/feed), qui n'accepte que les hôtes du registre publié et ne renvoie
 * que du RSS/Atom. N'est JAMAIS utilisé quand le direct a renvoyé une page
 * anti-robot : on ne contourne pas un captcha.
 */
const https = require('https');

const DEFAULT_RELAY = 'https://le-radar-presto.azdak.workers.dev';

function relayBase() {
  if (process.env.NEWS_FEED_RELAY === '0') return '';
  return (process.env.NEWS_FEED_RELAY_URL || DEFAULT_RELAY).replace(/\/+$/, '');
}

function relayUrlFor(feedUrl, base = relayBase()) {
  if (!base || !/^https:\/\//i.test(String(feedUrl || ''))) return '';
  return `${base}/v1/feed?url=${encodeURIComponent(feedUrl)}`;
}

function looksLikeFeed(body = '') {
  const head = String(body).slice(0, 2000);
  return /<rss[\s>]|<feed[\s>]|<rdf:RDF[\s>]/i.test(head);
}

/** Résout le corps du flux via le relais, ou '' si refusé / pas un flux. */
function fetchViaRelay(feedUrl, timeout = 20000) {
  const u = relayUrlFor(feedUrl);
  if (!u) return Promise.resolve('');
  return new Promise((resolve) => {
    let req;
    try {
      req = https.get(u, { headers: { 'User-Agent': 'LE-RADAR-NewsBot/1.0 (relay client)' }, timeout }, (res) => {
        if (res.statusCode !== 200) { res.resume(); return resolve(''); }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { data += c; if (data.length > 5e6) req.destroy(); });
        res.on('end', () => resolve(looksLikeFeed(data) ? data : ''));
        res.on('error', () => resolve(''));
      });
    } catch { return resolve(''); }
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

module.exports = { fetchViaRelay, relayUrlFor, looksLikeFeed, DEFAULT_RELAY };

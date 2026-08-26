#!/usr/bin/env node
/**
 * Contrôle doux des liens du catalogue historique.
 *
 * Pas de crawl : au plus 20 URL par défaut, une à la fois, sans contenu
 * sauvegardé. Les incidents réseau deviennent un statut honnête et non un
 * échec de workflow — ainsi le bot n’inonde pas la boîte courriel.
 */
const fs = require('fs');
const https = require('https');
const path = require('path');
const { isAllowedFetchUrl } = require('./url-security-lib');

const ARCHIVE = path.join(__dirname, '..', 'news-archive.json');
const update = process.argv.includes('--update');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Math.max(0, Math.min(100, Number(limitArg?.slice(8) || 20) || 20));
const sourceArg = process.argv.find((arg) => arg.startsWith('--source='));
const sourceFilter = String(sourceArg?.slice(9) || '').trim().toLocaleLowerCase('fr-CA');
const USER_AGENT = 'LE-RADAR-HistoryVerifier/1.0 (+https://le-radar.ca/)';

function request(url, method = 'HEAD', redirects = 3, origin = url) {
  if (!isAllowedFetchUrl(url)) return Promise.resolve({ status: 'unreachable', statusCode: null, resolvedUrl: null });
  return new Promise((resolve) => {
    const done = (value) => resolve(value);
    let req;
    try {
      req = https.request(url, { method, timeout: 12000, headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' } }, (response) => {
        const code = response.statusCode || 0;
        const location = response.headers.location;
        response.resume();
        if (code >= 300 && code < 400 && location && redirects > 0) {
          let next = '';
          try { next = new URL(location, url).toString(); } catch { /* invalid redirect */ }
          if (next) return done(request(next, method, redirects - 1, origin));
        }
        if ((code === 405 || code === 403) && method === 'HEAD') return done(request(url, 'GET', redirects, origin));
        if (code >= 200 && code < 300) return done({ status: url === origin ? 'available' : 'redirected', statusCode: code, resolvedUrl: url });
        if (code === 404 || code === 410) return done({ status: 'missing', statusCode: code, resolvedUrl: url });
        return done({ status: 'unreachable', statusCode: code || null, resolvedUrl: url });
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', () => done({ status: 'unreachable', statusCode: null, resolvedUrl: null }));
      req.end();
    } catch {
      done({ status: 'unreachable', statusCode: null, resolvedUrl: null });
    }
  });
}

function due(record) {
  const status = record?.link?.status;
  const checked = Date.parse(record?.link?.checkedAt || 0);
  return !['available', 'redirected'].includes(status) || !Number.isFinite(checked) || Date.now() - checked > 28 * 86400000;
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(ARCHIVE, 'utf8'));
  const dueRecords = (catalog.records || []).filter((record) => {
    if (!record?.originalUrl || !due(record)) return false;
    return !sourceFilter || String(record.source || '').toLocaleLowerCase('fr-CA') === sourceFilter;
  });
  const candidates = [];
  const seenSources = new Set();
  // Même logique que l’échantillon public : éviter qu’une seule publication
  // monopolise la passe hebdomadaire et retarde indéfiniment les autres.
  for (const record of dueRecords) {
    if (candidates.length >= limit || seenSources.has(record.source)) continue;
    seenSources.add(record.source);
    candidates.push(record);
  }
  for (const record of dueRecords) {
    if (candidates.length >= limit || candidates.includes(record)) continue;
    candidates.push(record);
  }
  let available = 0;
  let missing = 0;
  let unreachable = 0;
  for (const record of candidates) {
    const result = await request(record.originalUrl);
    const checkedAt = new Date().toISOString();
    record.link = { status: result.status, statusCode: result.statusCode, resolvedUrl: result.resolvedUrl, checkedAt };
    record.lastVerifiedAt = checkedAt;
    record.indexing = result.status === 'available' || result.status === 'redirected'
      ? { status: 'eligible', reason: 'verified_original_link' }
      : { status: 'excluded', reason: `original_link_${result.status}` };
    if (result.status === 'available' || result.status === 'redirected') available += 1;
    else if (result.status === 'missing') missing += 1;
    else unreachable += 1;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  catalog.updated = new Date().toISOString();
  console.log(`Liens historiques${sourceFilter ? ` (${sourceFilter})` : ''} : ${candidates.length} contrôlé(s); ${available} accessibles, ${missing} disparus, ${unreachable} injoignables.`);
  if (update) fs.writeFileSync(ARCHIVE, JSON.stringify(catalog) + '\n');
  else console.log('Dry-run — utilisez --update pour enregistrer les statuts.');
}

main().catch((error) => {
  // Un fichier mal formé mérite d’échouer; une URL individuellement en panne,
  // elle, est déjà convertie en statut dans request().
  console.error(error.message || error);
  process.exit(1);
});

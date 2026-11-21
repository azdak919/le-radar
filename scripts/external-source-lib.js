'use strict';

/**
 * Résilience des sources externes (RSEQ, radios, liens, rétro-crawl, récolte).
 *
 * Réessai à délai croissant : bibliothèque MIT `retry` 0.13.1
 * (Tim Koschützki, Felix Geisendörfer), vendue dans scripts/vendor/retry/.
 * Voir THIRD_PARTY_NOTICES.md. Pas de dépendance Apache-2.0.
 *
 * Une panne passagère réessaie, puis rend la dernière réponse valide en cache
 * ou restaure les fichiers déjà publiés. Elle ne fait pas échouer le processus.
 * Une erreur de notre code (pas un statut réseau) continue de remonter.
 */

const fs = require('fs');
const path = require('path');
const retry = require('./vendor/retry');

class SourceUnavailable extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = 'SourceUnavailable';
    this.code = 'SOURCE_UNAVAILABLE';
    Object.assign(this, extra);
  }
}

function isTransientError(err) {
  if (!err) return false;
  if (err.code === 'HUMAN_ACTION') return false;
  if (err.name === 'SourceUnavailable') return err.transient !== false;
  const status = Number(err.status || err.statusCode || 0);
  const text = `${err.code || ''} ${err.name || ''} ${err.message || ''}`;
  if (/rate limit/i.test(text)) return true;
  if (status === 408 || status === 429 || (status >= 500 && status <= 599)) return true;
  if (status === 401 || status === 403 || status === 404 || status === 410) return false;
  return /timed? ?out|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|EPIPE|socket hang up|AbortError|connection reset|network error|source attempt timeout|source response aborted|HTTP 5\d\d|HTTP 429|HTTP 408/i.test(text);
}

/** Délai croissant. `random` à 0 et `attempt` 0 → `base` (contrat de la file RSEQ). */
function backoffMs(attempt, { random = Math.random, base = 500, cap = 30000, jitter = 250 } = {}) {
  const n = Math.max(0, attempt | 0);
  return Math.min(cap, base * (2 ** n) + Math.floor(random() * jitter));
}

function retryAsync(fn, options = {}) {
  const retries = options.retries ?? 2;
  if (retries <= 0) return Promise.resolve().then(() => fn({ attempt: 1 }));
  const operation = retry.operation({
    retries,
    factor: 2,
    minTimeout: options.minTimeout ?? 200,
    maxTimeout: options.maxTimeout ?? 8000,
    randomize: options.randomize !== false,
  });
  return new Promise((resolve, reject) => {
    operation.attempt((current) => {
      Promise.resolve()
        .then(() => fn({ attempt: current }))
        .then(resolve, (err) => {
          if (isTransientError(err) && operation.retry(err)) return;
          reject(err);
        });
    });
  });
}

function readLastGood(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeLastGood(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${typeof data === 'string' ? data : JSON.stringify(data)}\n`);
}

function snapshotFiles(files) {
  return (files || []).map((file) => ({
    file,
    exists: fs.existsSync(file),
    buf: fs.existsSync(file) ? fs.readFileSync(file) : null,
  }));
}

function restoreFiles(snap) {
  for (const item of snap || []) {
    if (!item.exists) {
      try { fs.unlinkSync(item.file); } catch { /* déjà absent */ }
    } else {
      fs.mkdirSync(path.dirname(item.file), { recursive: true });
      fs.writeFileSync(item.file, item.buf);
    }
  }
}

/**
 * Entoure une récolte. Succès → ferme l’incident. Panne passagère ou refus
 * d’écraser (HUMAN_ACTION) → restaure les fichiers et ouvre une seule issue.
 * Une autre exception remonte : c’est un bug du dépôt, pas une source.
 */
async function runHarvest(id, work, { preserve = [], report } = {}) {
  const snap = snapshotFiles(preserve);
  const tell = async (state, body) => {
    if (typeof report !== 'function') return;
    try { await report({ id, state, body: body || '' }); } catch (err) {
      console.warn(`incident ${id} non publié : ${err.message}`);
    }
  };
  try {
    const result = await work();
    await tell('close');
    return result === undefined ? { degraded: false, id } : result;
  } catch (err) {
    const keep = err?.code === 'HUMAN_ACTION' || isTransientError(err);
    if (!keep) throw err;
    restoreFiles(snap);
    console.warn(`${id}: source indisponible, dernières données conservées — ${err.message}`);
    await tell('open', `${err.name || 'Error'}: ${err.message}`);
    return { degraded: true, id, error: err.message };
  }
}

async function fetchExternal(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 15000;
  const headers = options.headers || {};
  const expect = options.expect || 'text';
  if (typeof fetchImpl !== 'function') throw new Error('fetch indisponible');
  try {
    const body = await retryAsync(async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, {
          signal: ctrl.signal,
          redirect: options.redirect || 'follow',
          headers,
          method: options.method || 'GET',
          body: options.body,
        });
        const status = Number(res?.status || 0);
        if (res && res.ok === false) {
          const err = new Error(`HTTP ${status} ${url}`);
          err.status = status;
          throw err;
        }
        if (expect === 'response') return res;
        if (expect === 'json') {
          if (typeof res.json === 'function') return res.json();
          return JSON.parse(await res.text());
        }
        if (typeof res.text === 'function') return res.text();
        return res;
      } catch (err) {
        if (err?.name === 'AbortError') {
          throw Object.assign(new Error(`timeout ${url}`), { code: 'ETIMEDOUT' });
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }, options);
    if (options.cacheFile && expect !== 'response') {
      writeLastGood(options.cacheFile, expect === 'json' ? body : { text: body });
    }
    return body;
  } catch (err) {
    if (options.cacheFile) {
      const cached = readLastGood(options.cacheFile);
      if (cached != null) {
        if (expect === 'text' && cached && typeof cached.text === 'string') return cached.text;
        if (expect !== 'text') return cached;
      }
    }
    if (isTransientError(err)) {
      throw new SourceUnavailable(err.message, { status: err.status, url, cause: err });
    }
    throw err;
  }
}

function cliHarvest(id, work, preserve = []) {
  const { reportIncident } = require('./source-incident');
  return runHarvest(id, work, {
    preserve,
    report: (info) => reportIncident({
      key: `source ${info.id}`,
      state: info.state,
      body: info.body || `La source « ${info.id} » répond de nouveau. Dernières données inchangées jusqu’ici.`,
    }),
  }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = {
  SourceUnavailable,
  isTransientError,
  backoffMs,
  retryAsync,
  readLastGood,
  writeLastGood,
  snapshotFiles,
  restoreFiles,
  runHarvest,
  fetchExternal,
  cliHarvest,
};

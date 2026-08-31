#!/usr/bin/env node
/**
 * Worker translate-cache — cache-only, sans Google.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'workers/translate-cache/src/index.js'), 'utf8');
assert.match(src, /\/v1\/lookup/, 'lookup batch');
assert.match(src, /\/v1\/store/, 'store batch');
assert.match(src, /error:\s*'miss'/, 'GET miss = 404, pas un 503 Google');
assert.doesNotMatch(src, /clients5\.google\.com/, 'plus de proxy clients5');
assert.doesNotMatch(src, /translate\.googleapis\.com/, 'plus de proxy gtx');
assert.doesNotMatch(src, /mymemory\.translated\.net/, 'plus de proxy MyMemory');
assert.doesNotMatch(src, /\bif\s*\(\s*cached\s*\)\s*return\s+cached\s*;/, 'pas de return cached nu');
assert.match(src, /GET, POST, OPTIONS/, 'CORS POST');

const mem = new Map();
globalThis.caches = {
  default: {
    async match(req) {
      const url = typeof req === 'string' ? req : req.url;
      const body = mem.get(url);
      if (body == null) return undefined;
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    async put(req, res) {
      const url = typeof req === 'string' ? req : req.url;
      mem.set(url, await res.clone().text());
    },
  },
};

const {
  isJunkMt,
  readMtPayload,
  sameMtLang,
  isStoreableMt,
  default: worker,
} = await import('../workers/translate-cache/src/index.js');

assert.equal(isJunkMt('Hello'), false);
assert.equal(isJunkMt('MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS'), true);
assert.equal(isJunkMt('<html><title>Sorry...</title>'), true);
assert.equal(isJunkMt('PLEASE SELECT TWO DISTINCT LANGUAGES'), true);
assert.equal(isJunkMt('VEUILLEZ SÉLECTIONNER DEUX LANGUES DISTINCTES'), true);
assert.equal(isJunkMt('Veuillez selectionner deux langues distinctes'), true);
assert.equal(readMtPayload(['Hello world']), 'Hello world');
assert.equal(readMtPayload([[['Hola', 'Bonjour']]]), 'Hola');
assert.equal(readMtPayload({ t: 'Ciao' }), 'Ciao');
assert.equal(
  readMtPayload({
    responseStatus: '403',
    responseData: { translatedText: 'PLEASE SELECT TWO DISTINCT LANGUAGES' },
  }),
  '',
);
assert.equal(sameMtLang('fr', 'fr'), true);
assert.equal(sameMtLang('en', 'fr'), false);
assert.equal(sameMtLang('iw', 'he'), true);
assert.equal(isStoreableMt('Bonjour', 'Hello'), true);
assert.equal(isStoreableMt('Bonjour', 'Bonjour'), false, 'pas d’écho source');
assert.equal(isStoreableMt('Bonjour', 'PLEASE SELECT TWO DISTINCT LANGUAGES'), false);

const origin = { Origin: 'https://le-radar.ca' };

function req(url, init = {}) {
  return new Request(url, { ...init, headers: { ...origin, ...(init.headers || {}) } });
}

const miss = await worker.fetch(req('https://le-radar-translate.azdak.workers.dev/v1/translate?sl=fr&tl=en&q=Bonjour'));
assert.equal(miss.status, 404, 'GET MISS = 404');
assert.equal((await miss.json()).error, 'miss');

const stored = await worker.fetch(req('https://le-radar-translate.azdak.workers.dev/v1/store', {
  method: 'POST',
  headers: { ...origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tl: 'en',
    items: [
      { q: 'Bonjour', t: 'Hello' },
      { q: 'Merci', t: 'Merci' },
      { q: 'X', t: 'PLEASE SELECT TWO DISTINCT LANGUAGES' },
    ],
  }),
}));
assert.equal(stored.status, 200);
assert.equal((await stored.json()).stored, 1, 'identité + poubelle refusées');

const lookup = await worker.fetch(req('https://le-radar-translate.azdak.workers.dev/v1/lookup', {
  method: 'POST',
  headers: { ...origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tl: 'en', q: ['Bonjour', 'Merci', 'Au revoir'] }),
}));
assert.equal(lookup.status, 200);
const looked = await lookup.json();
assert.equal(looked.hits.Bonjour, 'Hello');
assert.deepEqual(looked.missed.sort(), ['Au revoir', 'Merci']);

const hit = await worker.fetch(req('https://le-radar-translate.azdak.workers.dev/v1/translate?sl=fr&tl=en&q=Bonjour'));
assert.equal(hit.status, 200);
assert.equal((await hit.json()).t, 'Hello');
assert.equal(hit.headers.get('X-LR-Cache'), 'HIT');

const page = readFileSync(join(root, 'translate.js'), 'utf8');
assert.match(page, /function isJunkMt/, 'page : même filtre');
assert.match(page, /\/v1\/lookup/, 'page : lookup batch');
assert.match(page, /\/v1\/store/, 'page : write-back');
assert.match(page, /clients5\.google\.com\/translate_a\/t\?client=dict-chrome-ex/, 'page : clients5 après MISS');
assert.match(page, /function hydrateFromWorkerCache/, 'page : hydrate avant la file CONCURRENCY');
assert.doesNotMatch(page, /\/v1\/translate\?sl=/, 'page : plus de GET Worker par chaîne');

console.log('OK translate-cache-worker');

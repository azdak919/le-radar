#!/usr/bin/env node
/**
 * Worker translate-cache — parse + poubelle, sans Cloudflare.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'workers/translate-cache/src/index.js'), 'utf8');
assert.match(src, /clients5\.google\.com/, 'clients5 en premier');
assert.match(src, /function isJunkMt/, 'filtre poubelle');
assert.doesNotMatch(src, /\bif\s*\(\s*cached\s*\)\s*return\s+cached\s*;/, 'pas de return cached nu');

const { isJunkMt, readMtPayload } = await import('../workers/translate-cache/src/index.js');

assert.equal(isJunkMt('Hello'), false);
assert.equal(isJunkMt('MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS'), true);
assert.equal(isJunkMt('<html><title>Sorry...</title>'), true);
assert.equal(readMtPayload(['Hello world']), 'Hello world');
assert.equal(readMtPayload([[['Hola', 'Bonjour']]]), 'Hola');
assert.equal(readMtPayload({ t: 'Ciao' }), 'Ciao');
assert.equal(
  isJunkMt(readMtPayload({
    responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE' },
  })),
  true,
);

const page = readFileSync(join(root, 'translate.js'), 'utf8');
assert.match(page, /function isJunkMt/, 'page : même filtre');
assert.match(page, /clients5\.google\.com/, 'page : repli clients5 si worker 404');

console.log('OK translate-cache-worker');

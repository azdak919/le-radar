#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const SKIP = new Set(['.git', 'node_modules', 'test-results', 'playwright-report', 'dev']);
const files = [];

function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (['.js', '.mjs'].includes(extname(entry.name)) && !full.endsWith('.spec.mjs')) {
      files.push(full);
    }
  }
}
collect(root);

const prod = files.filter((file) => !file.includes(`${root}tests/`));
for (const file of prod) {
  const source = readFileSync(file, 'utf8');
  const rel = relative(root, file);
  assert(!/\bdocument\.write\s*\(/.test(source), `${rel} : document.write interdit`);
  assert(!/(^|[^.\w])eval\s*\(/.test(source), `${rel} : eval interdit`);
  assert(!/\bnew Function\s*\(/.test(source), `${rel} : new Function interdit en prod`);
}

const pomoWeather = readFileSync(join(root, 'pomo/js/weather.js'), 'utf8');
assert(pomoWeather.includes('weather-cities-data.js'), 'pomo : catalogue météo depuis weather-cities-data.js');
assert(pomoWeather.includes('escapeText'), 'pomo : noms de ville échappés');

const cities = readFileSync(join(root, 'weather-cities-data.js'), 'utf8');
const count = [...cities.matchAll(/\{ id: '/g)].length;
assert(count >= 40, `weather-cities-data.js : catalogue trop court (${count})`);

console.log(`OK dom-sinks (${prod.length} fichiers prod)`);

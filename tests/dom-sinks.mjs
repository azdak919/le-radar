#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import vm from 'node:vm';

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

const utils = readFileSync(join(root, 'radar-utils.js'), 'utf8');
const ctx = { URL };
vm.runInNewContext(`${utils}\nthis.escapeHtml = escapeHtml;\nthis.safeHttpUrl = safeHttpUrl;`, ctx);

const xss = '<img src=x onerror=alert(1)>';
assert.equal(ctx.escapeHtml(xss), '&lt;img src=x onerror=alert(1)&gt;');
assert.equal(ctx.escapeHtml('"quoted" & \'q\''), '&quot;quoted&quot; &amp; \'q\'');
assert.equal(ctx.safeHttpUrl('javascript:alert(1)'), null);
assert.equal(ctx.safeHttpUrl('data:text/html;base64,PHNjcmlwdD4='), null);
assert.ok(ctx.safeHttpUrl('https://le-delit.ca/article'));

const news = readFileSync(join(root, 'radar-news.js'), 'utf8');
assert(news.includes('escapeHtml(cleanTitle(item.title))'), 'fil : titre d’article échappé');
assert(news.includes('escapeHtml(brief || \'\')'), 'fil : chapô échappé');
assert(news.includes('escapeHtml(src)'), 'fil : nom de source échappé');

const sports = readFileSync(join(root, 'radar-sports-cta.js'), 'utf8');
assert(sports.includes('escapeHtml(home)'), 'sports : noms d’équipes échappés');

const pomoWeather = readFileSync(join(root, 'pomo/js/weather.js'), 'utf8');
assert(pomoWeather.includes('weather-cities-data.js'), 'pomo : catalogue météo depuis weather-cities-data.js');
assert(pomoWeather.includes('escapeText'), 'pomo : noms de ville échappés');

const cities = readFileSync(join(root, 'weather-cities-data.js'), 'utf8');
const count = [...cities.matchAll(/\{ id: '/g)].length;
assert(count >= 40, `weather-cities-data.js : catalogue trop court (${count})`);

const engage = readFileSync(join(root, 'engage-prompt.js'), 'utf8');
assert(engage.includes('esc(title)') && engage.includes('esc(body)'), 'engage : copy échappée');
assert(
  engage.includes('escStep(s)')
    && engage.includes('/&lt;(\\/?strong)&gt;/gi'),
  'engage : étapes rendent <strong>, le reste échappé',
);

console.log(`OK dom-sinks (${prod.length} fichiers prod, XSS text fixtures)`);

#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const sheets = [
  'style-masthead.css',
  'style.css',
  'style-sports-strip.css',
  'style-masthead-chrome.css',
  'style-tuner.css',
  'style-feed.css',
  'style-chrome.css',
];

for (const file of sheets) {
  const css = readFileSync(join(root, file), 'utf8');
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '').trimStart();
  assert(
    !stripped.startsWith('@import') && !/\n@import/.test(stripped),
    `${file} : @import interdit (charger via <link>)`,
  );
}

const masthead = readFileSync(join(root, 'style-masthead.css'), 'utf8');
assert(
  !masthead.includes('@import depuis style.css'),
  'style-masthead.css : commentaire @import périmé',
);

const home = readFileSync(join(root, 'index.html'), 'utf8');
const hrefs = [...home.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
const radarSheets = hrefs.filter((href) => sheets.some((name) => href === name || href.endsWith(`/${name}`)));
assert.deepEqual(
  radarSheets,
  sheets,
  `index.html : ordre des feuilles Radar (${radarSheets.join(' → ')})`,
);

const last = readFileSync(join(root, 'style-chrome.css'), 'utf8');
assert(
  /prefers-reduced-motion:\s*reduce/.test(last),
  'style-chrome.css : reduced-motion global en dernière feuille',
);

console.log('OK css-cascade');

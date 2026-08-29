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

const overlayCss = readFileSync(join(root, 'style-translate-overlay.css'), 'utf8');
const overlayStripped = overlayCss.replace(/\/\*[\s\S]*?\*\//g, '').trimStart();
assert(
  !overlayStripped.startsWith('@import') && !/\n@import/.test(overlayStripped),
  'style-translate-overlay.css : @import interdit (charger via <link>)',
);
assert(
  hrefs.includes('style-translate-overlay.css'),
  'index.html : style-translate-overlay.css en <link>',
);
assert(
  hrefs.indexOf('style-translate-overlay.css') > hrefs.indexOf('translate-menu.css'),
  'index.html : overlay après translate-menu.css',
);
assert(
  /z-index:\s*60/.test(overlayCss) && /#tuner/.test(overlayCss),
  'overlay : z-index sous le tuner (100)',
);

function assertMastheadBeforeStyle(rel) {
  const html = readFileSync(join(root, rel), 'utf8');
  const hrefs = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
  const mast = hrefs.findIndex((h) => h.includes('style-masthead.css'));
  const base = hrefs.findIndex((h) => /(?:^|\/)style\.css$/.test(h));
  if (mast === -1 || base === -1) return;
  assert(mast < base, `${rel} : style-masthead.css avant style.css`);
}

assertMastheadBeforeStyle('index.html');
assertMastheadBeforeStyle('feeds.html');
assertMastheadBeforeStyle('tuner-embed.html');
assertMastheadBeforeStyle('dev/sports-strip-lab.html');
assertMastheadBeforeStyle('dev/cta-hier-color-lab.html');

console.log('OK css-cascade');

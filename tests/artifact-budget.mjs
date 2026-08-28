#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const MB = 1024 * 1024;

function fileSize(rel) {
  return statSync(join(root, rel)).size;
}
function dirSize(rel) {
  const dir = join(root, rel);
  let total = 0;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) total += dirSize(join(rel, name));
    else total += st.size;
  }
  return total;
}

const archive = fileSize('news-archive.json');
const sports = fileSize('sports.json');
const images = dirSize('assets/news-images');
const kit = dirSize('assets/kit');

assert(archive <= 16 * MB, `news-archive.json ${archive} > 16 Mo`);
assert(sports <= 5 * MB, `sports.json ${sports} > 5 Mo`);
assert(images <= 50 * MB, `assets/news-images ${images} > 50 Mo`);
assert(kit <= 100 * MB, `assets/kit ${kit} > 100 Mo (impressions 600 dpi, 7 campus)`);

console.log(
  `OK artifact-budget (archive ${(archive / MB).toFixed(1)} Mo, sports ${(sports / MB).toFixed(1)} Mo, images ${(images / MB).toFixed(1)} Mo, kit ${(kit / MB).toFixed(1)} Mo)`,
);

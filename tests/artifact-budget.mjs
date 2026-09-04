#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const MB = 1024 * 1024;

function fileSize(rel) {
  return statSync(join(root, rel)).size;
}
function trackedDirSize(rel) {
  const output = execFileSync('git', ['ls-files', '-z', '--', rel], {
    cwd: root,
    encoding: 'utf8',
  });
  return output.split('\0').filter(Boolean).reduce(
    (total, trackedPath) => total + statSync(join(root, trackedPath)).size,
    0,
  );
}

const archive = fileSize('news-archive.json');
const sports = fileSize('sports.json');
const images = trackedDirSize('assets/news-images');
const kit = trackedDirSize('assets/kit');

// Régression : les originaux d’impression produits localement sont gitignorés
// et ne font pas partie du site publié ni de son budget de dépôt.
const ignoredProbe = join(
  root,
  'assets/kit/affiches',
  `.artifact-budget-untracked-${process.pid}.jpg`,
);
try {
  writeFileSync(ignoredProbe, Buffer.alloc(1024 * 1024));
  assert.equal(
    trackedDirSize('assets/kit'),
    kit,
    'un fichier gitignoré dans assets/kit ne doit pas entrer dans le budget',
  );
} finally {
  unlinkSync(ignoredProbe);
}

assert(archive <= 16 * MB, `news-archive.json ${archive} > 16 Mo`);
assert(sports <= 5 * MB, `sports.json ${sports} > 5 Mo`);
assert(images <= 50 * MB, `assets/news-images ${images} > 50 Mo`);
assert(kit <= 100 * MB, `assets/kit ${kit} > 100 Mo (impressions 600 dpi, 7 campus)`);

console.log(
  `OK artifact-budget (archive ${(archive / MB).toFixed(1)} Mo, sports ${(sports / MB).toFixed(1)} Mo, images ${(images / MB).toFixed(1)} Mo, kit ${(kit / MB).toFixed(1)} Mo)`,
);

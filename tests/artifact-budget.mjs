#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
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
  // Fichiers encore listés par git mais déjà purgés du disque (miroir news
  // avant git add) : compter 0 plutôt que faire échouer toute la gate bot.
  return output.split('\0').filter(Boolean).reduce((total, trackedPath) => {
    try {
      return total + statSync(join(root, trackedPath)).size;
    } catch (err) {
      if (err && err.code === 'ENOENT') return total;
      throw err;
    }
  }, 0);
}

// Lot E : catalogue mensuel (repli sur l'ancien fichier pendant la transition).
const archive = existsSync(join(root, 'data/archives/index.json'))
  ? trackedDirSize('data/archives')
  : fileSize('news-archive.json');
const archiveMonthMax = existsSync(join(root, 'data/archives'))
  ? Math.max(0, ...readdirSync(join(root, 'data/archives')).map((f) => fileSize(`data/archives/${f}`)))
  : 0;
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

assert(archive <= 16 * MB, `catalogue historique ${archive} > 16 Mo`);
assert(archiveMonthMax <= 2 * MB, `un mois du catalogue dépasse 2 Mo (${archiveMonthMax})`);
// sports.json est « packed » (scripts/sports-payload-lib.js) : ~1,9 Mo début
// octobre, ~3 Mo projeté au pire en fin de saison RSEQ (avril). Le plafond
// 8 Mio laisse de la marge sans masquer un retour au format verbeux
// (déplié, il dépasserait 8 Mio vers la fin de la saison d’hiver).
assert(sports <= 8 * MB, `sports.json ${sports} > 8 Mio`);
assert(images <= 50 * MB, `assets/news-images ${images} > 50 Mo`);
assert(kit <= 100 * MB, `assets/kit ${kit} > 100 Mo (impressions 600 dpi, 7 campus)`);

console.log(
  `OK artifact-budget (archive ${(archive / MB).toFixed(1)} Mo, sports ${(sports / MB).toFixed(1)} Mo, images ${(images / MB).toFixed(1)} Mo, kit ${(kit / MB).toFixed(1)} Mo)`,
);

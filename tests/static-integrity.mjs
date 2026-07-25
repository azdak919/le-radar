#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';

const require = createRequire(import.meta.url);

const root = new URL('../', import.meta.url).pathname;
const htmlFiles = [];

function collectHtml(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) collectHtml(fullPath);
    else if (entry.name.endsWith('.html')) htmlFiles.push(fullPath);
  }
}

function isLocalReference(value) {
  return value
    && !value.startsWith('#')
    && !value.startsWith('//')
    && !value.includes('${')
    && !/^(?:https?:|mailto:|tel:|data:|blob:|javascript:|about:)/i.test(value);
}

collectHtml(root);

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  assert(/<html\b[^>]*\blang=/i.test(html), `${relative(root, file)}: attribut lang requis`);
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
    const raw = match[1].split(/[?#]/, 1)[0];
    if (!isLocalReference(raw) || raw === '/') continue;
    const target = resolve(dirname(file), raw);
    assert(existsSync(target), `${relative(root, file)}: ressource locale introuvable ${raw}`);
  }
}

function assertServiceWorkerAssets(file, arrayName) {
  const source = readFileSync(file, 'utf8');
  const array = source.match(new RegExp(`const ${arrayName} = \\[([\\s\\S]*?)\\n\\];`));
  assert(array, `${relative(root, file)}: tableau ${arrayName} introuvable`);
  for (const match of array[1].matchAll(/["'](\.\.?\/[^"']+)["']/g)) {
    const target = resolve(dirname(file), match[1]);
    assert(existsSync(target), `${relative(root, file)}: asset SW introuvable ${match[1]}`);
  }
}

assertServiceWorkerAssets(join(root, 'sw.js'), 'APP_SHELL');
assertServiceWorkerAssets(join(root, 'pomo/sw.js'), 'SHELL_ASSETS');
assertServiceWorkerAssets(join(root, 'solitaire/sw.js'), 'SHELL_ASSETS');

const rootSw = readFileSync(join(root, 'sw.js'), 'utf8');
const pomoSw = readFileSync(join(root, 'pomo/sw.js'), 'utf8');
const solitaireSw = readFileSync(join(root, 'solitaire/sw.js'), 'utf8');
assert(rootSw.includes('const CACHE_PREFIX = "radar-"'), 'préfixe cache racine isolé requis');
assert(pomoSw.includes("const CACHE_PREFIX = 'pomo-'"), 'préfixe cache Pomodoro isolé requis');
assert(solitaireSw.includes("const CACHE_PREFIX = 'solitaire-'"), 'préfixe cache Solitaire isolé requis');

const backgroundsData = readFileSync(join(root, 'pomo/js/backgrounds-data.js'), 'utf8');
for (const title of ['Palm Sunset', 'Tropical Beach', 'Tropical Waterfall', 'Tropical Paradise', 'Seaside Cliffs', 'Snowy Branch']) {
  assert(!backgroundsData.includes(`title: "${title}"`), `fond hors ligne éditoriale interdit: ${title}`);
}

// QC plein écran (pomo + solitaire) — macros / Snowy Branch hard-ban
const fsQc = readFileSync(join(root, 'fullscreen-wallpaper-qc.js'), 'utf8');
assert(fsQc.includes('FullscreenWallpaperQc'), 'module QC wallpapers plein écran requis');
assert(fsQc.includes('1457269449834-928af64c684d'), 'hard-ban Snowy Branch (Aaron Burden) requis');

// Fonds campus : Casault ULaval hard-ban + détection religieuse multi-tours
const bgBlacklist = require('../scripts/quebec-backgrounds-blacklist.js');
assert(
  bgBlacklist.matchHardBanned({ id: 'd80fc225abc1' })?.reason === 'reads_as_church_casault',
  'hard-ban Casault id d80fc225abc1 requis',
);
assert(
  bgBlacklist.allFragments().some((f) => /casault|Canada_3/i.test(f)),
  'fragments hard-ban Casault / Canada_3 requis',
);
const bgJsRelig = readFileSync(join(root, 'quebec-backgrounds.js'), 'utf8');
assert(bgJsRelig.includes('casault'), 'mât RELIGIOUS_SUBJECT_RE : casault');
assert(bgJsRelig.includes('solidStone'), 'détecteur visuel pierre grise (Casault)');
assert(bgJsRelig.includes('multiPeaks'), 'détecteur multi-tours / flèches');
const uniData = readFileSync(join(root, 'quebec-university-backgrounds-data.js'), 'utf8');
assert(!/Quebec_Canada_3\.jpg/i.test(uniData), 'banque universities sans Casault Canada_3');
assert(
  /Park_in_Universit|Ferdinand-Vandry/i.test(uniData),
  'banque universities : remplacement ULaval (parc ou Vandry)',
);
const solitaireHtml = readFileSync(join(root, 'solitaire/index.html'), 'utf8');
assert(!solitaireHtml.includes('title: "Snowy Branch"'), 'solitaire: Snowy Branch retiré du pool');
assert(solitaireHtml.includes('fullscreen-wallpaper-qc.js'), 'solitaire charge le QC plein écran');
const pomoHtml = readFileSync(join(root, 'pomo/index.html'), 'utf8');
assert(pomoHtml.includes('fullscreen-wallpaper-qc.js'), 'pomo charge le QC plein écran');
assert(pomoSw.includes('fullscreen-wallpaper-qc.js'), 'pomo SW pré-cache le QC plein écran');
assert(solitaireSw.includes('fullscreen-wallpaper-qc.js'), 'solitaire SW pré-cache le QC plein écran');

// Crédits Commons : pas de gabarit « machine-readable author » en banque
const commonsCredit = require('../scripts/commons-credit-lib.js');
assert(commonsCredit?.sanitizeCommonsCredit, 'commons-credit-lib requis');
assert(
  commonsCredit.sanitizeCommonsCredit(
    'No machine-readable author provided. Miguel Andrade assumed (based on copyright claims).'
  ) === 'Miguel Andrade',
  'sanitize Commons credit → nom court'
);
for (const rel of [
  'quebec-backgrounds-data.js',
  'quebec-nations-backgrounds-data.js',
  'quebec-university-backgrounds-data.js',
  'quebec-pomo-backgrounds-data.js',
]) {
  const txt = readFileSync(join(root, rel), 'utf8');
  assert(
    !/No machine-readable author provided/i.test(txt),
    `${rel}: crédit Commons machine-readable interdit`
  );
}
const bgJs = readFileSync(join(root, 'quebec-backgrounds.js'), 'utf8');
assert(bgJs.includes('sanitizeBgCredit'), 'mât : sanitize crédit runtime requis');

for (const app of ['pomo', 'solitaire']) {
  const html = readFileSync(join(root, app, 'index.html'), 'utf8');
  assert(/id=["']radar-embed["']/.test(html), `${app}: iframe Le Radar requis`);
  assert(/src=["']\.\.\/tuner-embed\.html["']/.test(html), `${app}: source iframe Le Radar invalide`);
  assert(/allow=["'][^"']*autoplay/.test(html), `${app}: permission autoplay iframe requise`);
}

const embedScript = readFileSync(join(root, 'embed.js'), 'utf8');
assert(embedScript.includes("type: 'radar-embed'"), 'contrat postMessage radar-embed requis');
assert(embedScript.includes("type: 'ataraxia-radar-embed'"), 'contrat postMessage historique requis');

console.log(`OK intégrité statique (${htmlFiles.length} pages HTML)`);

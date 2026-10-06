#!/usr/bin/env node
/**
 * Assemble le dossier servi par Capacitor (mobile/www).
 * Copie l’interface, les JSON publics du fil, et le mât mobile du site
 * (feuilles, banque photo, météo, bandeau sports). Pas sports.json.
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const www = join(root, 'mobile/www');

rmSync(www, { recursive: true, force: true });
cpSync(join(root, 'mobile/app'), www, { recursive: true });
mkdirSync(join(www, 'data'), { recursive: true });
mkdirSync(join(www, 'vendor'), { recursive: true });

for (const file of ['news.json', 'news-sources.json', 'radios.json', 'brand-colors.json', 'indigenous-mt.json']) {
  cpSync(join(root, file), join(www, 'data', file));
}

// Même module que le site. L’aperçu navigateur passe par un lien dans
// mobile/app. Recopié dans www, ce lien vise le fichier source : cpSync
// refuse alors (source et destination identiques). On retire le lien d’abord.
function copyRealFile(src, dest) {
  rmSync(dest, { force: true });
  cpSync(src, dest);
}
copyRealFile(join(root, 'translate.js'), join(www, 'js', 'translate.js'));
copyRealFile(join(root, 'translate-menu.css'), join(www, 'css', 'translate-menu.css'));
for (const file of [
  'style-masthead.css',
  'style-sports-strip.css',
  'style-masthead-chrome.css',
  'style-tuner.css',
  'style-feed.css',
  'style-chrome.css',
]) {
  copyRealFile(join(root, file), join(www, 'css', file));
}
const siteFiles = [
  'scripts/season-lib.js',
  'bg-rotation-lib.js',
  'photo-bank-data.js',
  'quebec-backgrounds-data.js',
  'quebec-university-backgrounds-data.js',
  'quebec-nations-backgrounds-data.js',
  'quebec-favorites-backgrounds-data.js',
  'quebec-backgrounds.js',
  'weather-cities-data.js',
  'radar-utils.js',
  'radar-state.js',
  'radar-weather.js',
  'scripts/sports-freshness-lib.js',
  'radar-sports-cta.js',
  'sports-masthead.json',
];
for (const file of siteFiles) {
  const dest = join(www, 'site', file);
  mkdirSync(dirname(dest), { recursive: true });
  copyRealFile(join(root, file), dest);
}
const assetsDest = join(www, 'assets');
rmSync(assetsDest, { recursive: true, force: true });
mkdirSync(assetsDest, { recursive: true });
cpSync(join(root, 'assets/emoji'), join(www, 'assets/emoji'), { recursive: true });
cpSync(join(root, 'assets/meteocons'), join(www, 'assets/meteocons'), { recursive: true });
mkdirSync(join(www, 'img'), { recursive: true });
copyRealFile(
  join(root, 'assets/masthead/polytechnique-lassonde-abdallahh.jpg'),
  join(www, 'img/masthead.jpg'),
);

cpSync(join(root, 'scripts/media-follow-store.js'), join(www, 'vendor/media-follow-store.js'));
console.log('mobile/www prêt');

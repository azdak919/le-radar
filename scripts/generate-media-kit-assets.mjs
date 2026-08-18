#!/usr/bin/env node

/**
 * Génère les visuels téléchargeables du kit média.
 *
 * Chaque SVG incorpore le pictogramme : un fichier téléchargé reste donc
 * complet une fois sorti de /assets/kit/ (où ../icon.svg n'existerait plus).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kitDir = join(root, 'assets', 'kit');
const iconDataUri = `data:image/svg+xml;base64,${readFileSync(join(root, 'assets', 'icon.svg')).toString('base64')}`;
const icon = (x, y, width, height) => `  <image href="${iconDataUri}" x="${x}" y="${y}" width="${width}" height="${height}"/>`;

const files = {
  'wordmark-on-dark.svg': [
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="240" viewBox="0 0 960 240" role="img" aria-label="LE-RADAR.ca">',
    '  <title>LE-RADAR.ca — mot-symbole sur fond sombre</title>',
    '  <rect width="960" height="240" fill="#0E0F12"/>',
    icon(36, 36, 168, 168),
    '  <text x="232" y="148" fill="#F1F2F4" font-family="Georgia, serif" font-size="72" font-weight="700" letter-spacing="-0.5">LE-RADAR.ca</text>',
    '</svg>',
  ].join('\n'),
  'wordmark-on-light.svg': [
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="240" viewBox="0 0 960 240" role="img" aria-label="LE-RADAR.ca">',
    '  <title>LE-RADAR.ca — mot-symbole sur fond clair</title>',
    '  <rect width="960" height="240" fill="#FFFFFF"/>',
    icon(36, 36, 168, 168),
    '  <text x="232" y="148" fill="#16181C" font-family="Georgia, serif" font-size="72" font-weight="700" letter-spacing="-0.5">LE-RADAR.ca</text>',
    '</svg>',
  ].join('\n'),
  'banner-web.svg': [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="500" viewBox="0 0 1500 500" role="img" aria-label="LE-RADAR.ca — bannière web">',
    '  <title>LE-RADAR.ca — bannière 1500×500</title>',
    '  <rect width="1500" height="500" fill="#0E0F12"/>',
    '  <rect width="12" height="500" fill="#6C2163"/>',
    icon(72, 150, 200, 200),
    '  <text x="308" y="248" fill="#F1F2F4" font-family="Georgia, serif" font-size="72" font-weight="700">LE-RADAR.ca</text>',
    '  <text x="308" y="302" fill="#C2C6CD" font-family="Arial, sans-serif" font-size="26">Journaux, radios et sports étudiants du Québec, réunis au même endroit</text>',
    '</svg>',
  ].join('\n'),
  'banner-square.svg': [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="LE-RADAR.ca — bannière carrée">',
    '  <title>LE-RADAR.ca — bannière 1080×1080</title>',
    '  <rect width="1080" height="1080" fill="#0E0F12"/>',
    icon(340, 220, 400, 400),
    '  <text x="540" y="720" text-anchor="middle" fill="#F1F2F4" font-family="Georgia, serif" font-size="64" font-weight="700">LE-RADAR.ca</text>',
    '  <text x="540" y="780" text-anchor="middle" fill="#C2C6CD" font-family="Arial, sans-serif" font-size="24">Journaux · radios · sports étudiants</text>',
    '</svg>',
  ].join('\n'),
  'affiche-11x17.svg': [
    '<svg xmlns="http://www.w3.org/2000/svg" width="792" height="1224" viewBox="0 0 792 1224" role="img" aria-label="LE-RADAR.ca — affiche 11×17">',
    '  <title>LE-RADAR.ca — affiche 11×17 po</title>',
    '  <rect width="792" height="1224" fill="#0E0F12"/>',
    '  <rect width="792" height="10" fill="#6C2163"/>',
    icon(246, 280, 300, 300),
    '  <text x="396" y="680" text-anchor="middle" fill="#F1F2F4" font-family="Georgia, serif" font-size="56" font-weight="700">LE-RADAR.ca</text>',
    '  <text x="396" y="740" text-anchor="middle" fill="#C2C6CD" font-family="Arial, sans-serif" font-size="20">Journaux, radios et sports étudiants</text>',
    '  <text x="396" y="772" text-anchor="middle" fill="#C2C6CD" font-family="Arial, sans-serif" font-size="20">du Québec, réunis au même endroit</text>',
    '  <text x="396" y="1120" text-anchor="middle" fill="#888D96" font-family="Arial, sans-serif" font-size="16">le-radar.ca</text>',
    '</svg>',
  ].join('\n'),
};

const check = process.argv.includes('--check');
let stale = false;
for (const [name, output] of Object.entries(files)) {
  const target = join(kitDir, name);
  const current = readFileSync(target, 'utf8');
  if (current === output) continue;
  stale = true;
  if (!check) writeFileSync(target, output);
  else console.error(`Kit média : ${name} n'est pas généré à jour.`);
}

if (stale && check) process.exit(1);
console.log(check ? 'OK kit média autonome' : 'Kit média généré');

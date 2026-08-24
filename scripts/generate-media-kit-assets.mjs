#!/usr/bin/env node

/**
 * Génère les visuels téléchargeables du kit média.
 *
 * Chaque SVG incorpore le pictogramme : un fichier téléchargé reste donc
 * complet une fois sorti de /assets/kit/ (où ../icon.svg n'existerait plus).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kitDir = join(root, 'assets', 'kit');
const iconDataUri = `data:image/svg+xml;base64,${readFileSync(join(root, 'assets', 'icon.svg')).toString('base64')}`;
const serifDataUri = `data:font/ttf;base64,${readFileSync(join(root, 'scripts/og-fonts/SourceSerif4Display-Bold.ttf')).toString('base64')}`;
const icon = (x, y, width, height) => `  <image href="${iconDataUri}" x="${x}" y="${y}" width="${width}" height="${height}"/>`;
const serifFace = [
  '  <defs>',
  '    <style><![CDATA[',
  `@font-face{font-family:'LR Serif';src:url('${serifDataUri}') format('truetype');font-weight:700;font-style:normal;}`,
  "    ]]></style>",
  '  </defs>',
].join('\n');
const wordmarkFont = "font-family=\"LR Serif, 'Source Serif 4', Georgia, serif\" font-weight=\"700\" letter-spacing=\"-1.4\"";

const files = {
  'wordmark-on-dark.svg': [
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="240" viewBox="0 0 960 240" role="img" aria-label="LE-RADAR.ca">',
    '  <title>LE-RADAR.ca — mot-symbole sur fond sombre</title>',
    serifFace,
    '  <rect width="960" height="240" fill="#0E0F12"/>',
    icon(36, 36, 168, 168),
    `  <text x="232" y="148" fill="#F1F2F4" font-size="72" ${wordmarkFont}>LE-RADAR.ca</text>`,
    '</svg>',
  ].join('\n'),
  'wordmark-on-light.svg': [
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="240" viewBox="0 0 960 240" role="img" aria-label="LE-RADAR.ca">',
    '  <title>LE-RADAR.ca — mot-symbole sur fond clair</title>',
    serifFace,
    '  <rect width="960" height="240" fill="#FFFFFF"/>',
    icon(36, 36, 168, 168),
    `  <text x="232" y="148" fill="#16181C" font-size="72" ${wordmarkFont}>LE-RADAR.ca</text>`,
    '</svg>',
  ].join('\n'),
  'banner-web.svg': [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="500" viewBox="0 0 1500 500" role="img" aria-label="LE-RADAR.ca — bannière web">',
    '  <title>LE-RADAR.ca — bannière 1500×500</title>',
    serifFace,
    '  <rect width="1500" height="500" fill="#0E0F12"/>',
    '  <rect width="12" height="500" fill="#6C2163"/>',
    icon(72, 150, 200, 200),
    `  <text x="308" y="248" fill="#F1F2F4" font-size="72" ${wordmarkFont}>LE-RADAR.ca</text>`,
    '  <text x="308" y="302" fill="#C2C6CD" font-family="Arial, sans-serif" font-size="26">Journaux, radios et sports étudiants du Québec, réunis au même endroit</text>',
    '</svg>',
  ].join('\n'),
  'banner-square.svg': [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="LE-RADAR.ca — bannière carrée">',
    '  <title>LE-RADAR.ca — bannière 1080×1080</title>',
    serifFace,
    '  <rect width="1080" height="1080" fill="#0E0F12"/>',
    icon(340, 220, 400, 400),
    `  <text x="540" y="720" text-anchor="middle" fill="#F1F2F4" font-size="64" ${wordmarkFont}>LE-RADAR.ca</text>`,
    '  <text x="540" y="780" text-anchor="middle" fill="#C2C6CD" font-family="Arial, sans-serif" font-size="24">Journaux · radios · sports étudiants</text>',
    '</svg>',
  ].join('\n'),
  'affiche-11x17.svg': [
    '<svg xmlns="http://www.w3.org/2000/svg" width="792" height="1224" viewBox="0 0 792 1224" role="img" aria-label="LE-RADAR.ca — affiche 11×17">',
    '  <title>LE-RADAR.ca — affiche 11×17 po</title>',
    serifFace,
    '  <rect width="792" height="1224" fill="#0E0F12"/>',
    '  <rect width="792" height="10" fill="#6C2163"/>',
    icon(246, 280, 300, 300),
    `  <text x="396" y="680" text-anchor="middle" fill="#F1F2F4" font-size="56" ${wordmarkFont}>LE-RADAR.ca</text>`,
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

const rasters = [
  { svg: join(kitDir, 'wordmark-on-dark.svg'), jpg: join(kitDir, 'wordmark-on-dark.jpg') },
  { svg: join(kitDir, 'wordmark-on-light.svg'), jpg: join(kitDir, 'wordmark-on-light.jpg') },
  { svg: join(kitDir, 'banner-web.svg'), jpg: join(kitDir, 'banner-web.jpg') },
  { svg: join(kitDir, 'banner-square.svg'), jpg: join(kitDir, 'banner-square.jpg') },
  { svg: join(kitDir, 'affiche-11x17.svg'), jpg: join(kitDir, 'affiche-11x17.jpg') },
];
const iconJpg = join(root, 'assets/icon-512.jpg');
const iconPng = join(root, 'assets/icon-512.png');

const SERIF = join(root, 'scripts/og-fonts/SourceSerif4Display-Bold.ttf');
const SANS = join(root, 'scripts/og-fonts/Inter-Regular.ttf');
const ICON_SVG = join(root, 'assets/icon.svg');

function magick(args) {
  const r = spawnSync('magick', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`magick: ${r.stderr || r.stdout || 'échec'}`);
  }
}

function rasterizePng(src, dest) {
  magick(['-density', '144', src, '-quality', '92', dest]);
}

function rasterWordmark(dest, { bg, fill, w, h, icon, ix, iy, tx, ty, point }) {
  magick([
    '-size', `${w}x${h}`, `xc:${bg}`,
    '(', '-background', 'none', ICON_SVG, '-resize', `${icon}x${icon}`, ')',
    '-geometry', `+${ix}+${iy}`, '-composite',
    '-font', SERIF, '-fill', fill, '-pointsize', String(point), '-kerning', '-1.4',
    '-annotate', `+${tx}+${ty}`, 'LE-RADAR.ca',
    '-quality', '92', dest,
  ]);
}

if (!check) {
  rasterWordmark(join(kitDir, 'wordmark-on-dark.jpg'), {
    bg: '#0E0F12', fill: '#F1F2F4', w: 960, h: 240, icon: 168, ix: 36, iy: 36, tx: 232, ty: 148, point: 72,
  });
  rasterWordmark(join(kitDir, 'wordmark-on-light.jpg'), {
    bg: '#FFFFFF', fill: '#16181C', w: 960, h: 240, icon: 168, ix: 36, iy: 36, tx: 232, ty: 148, point: 72,
  });
  magick([
    '-size', '1500x500', 'xc:#0E0F12',
    '-fill', '#6C2163', '-draw', 'rectangle 0,0 12,500',
    '(', '-background', 'none', ICON_SVG, '-resize', '200x200', ')',
    '-geometry', '+72+150', '-composite',
    '-font', SERIF, '-fill', '#F1F2F4', '-pointsize', '72', '-kerning', '-1.4',
    '-annotate', '+308+248', 'LE-RADAR.ca',
    '-font', SANS, '-fill', '#C2C6CD', '-pointsize', '26', '-kerning', '0',
    '-annotate', '+308+302', 'Journaux, radios et sports étudiants du Québec, réunis au même endroit',
    '-quality', '92', join(kitDir, 'banner-web.jpg'),
  ]);
  magick([
    '-size', '1080x1080', 'xc:#0E0F12',
    '(', '-background', 'none', ICON_SVG, '-resize', '400x400', ')',
    '-geometry', '+340+220', '-composite',
    '-font', SERIF, '-fill', '#F1F2F4', '-pointsize', '64', '-kerning', '-1.4',
    '-gravity', 'North', '-annotate', '+0+700', 'LE-RADAR.ca',
    '-font', SANS, '-fill', '#C2C6CD', '-pointsize', '24', '-kerning', '0',
    '-annotate', '+0+780', 'Journaux · radios · sports étudiants',
    '-quality', '92', join(kitDir, 'banner-square.jpg'),
  ]);
  rasterizePng(join(kitDir, 'affiche-11x17.svg'), join(kitDir, 'affiche-11x17.jpg'));
  rasterizePng(iconPng, iconJpg);
} else {
  for (const { jpg } of rasters) {
    if (!existsSync(jpg)) {
      console.error(`Kit média : ${jpg} manquant`);
      process.exit(1);
    }
  }
  if (!existsSync(iconJpg)) {
    console.error('Kit média : assets/icon-512.jpg manquant');
    process.exit(1);
  }
}

console.log(check ? 'OK kit média autonome' : 'Kit média généré');

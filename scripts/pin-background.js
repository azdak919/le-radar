#!/usr/bin/env node
/**
 * Épingle une photo dans la banque favorites (permanente, hors purge bots).
 *
 * Usage :
 *   node scripts/pin-background.js --url "https://upload.wikimedia.org/..." \
 *     --title "..." --credit "..." --license "CC BY-SA 4.0" \
 *     (license optionnelle — crédit suffit ; retrait via courriel footer) \
 *     --link "https://commons.wikimedia.org/wiki/File:..." \
 *     [--focalY 0.66] [--surfaces masthead,pomo] [--note "..."]
 *
 *   node scripts/pin-background.js --from-bank masthead --match "Percé"
 *     (copie depuis data/quebec-backgrounds.json si trouvé)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'quebec-favorites-backgrounds.json');
const JS_PATH = path.join(ROOT, 'quebec-favorites-backgrounds-data.js');

const args = process.argv.slice(2);

function argVal(name) {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
  return null;
}

function loadFavorites() {
  if (!fs.existsSync(JSON_PATH)) {
    return {
      version: 1,
      profile: 'favorites',
      description:
        'Photos favorites validées manuellement. Jamais purgées par maintain-quebec-backgrounds.',
      photos: [],
    };
  }
  return JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
}

function photoIdFromUrl(url = '') {
  return crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 12);
}

function writeJs(photos) {
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const body = photos
    .map((p) => {
      const lines = [
        `    url: "${esc(p.url)}"`,
        `    credit: "${esc(p.credit)}"`,
        `    link: "${esc(p.link)}"`,
        `    license: "${esc(p.license)}"`,
        `    title: "${esc(p.title)}"`,
      ];
      if (typeof p.focalY === 'number' && !Number.isNaN(p.focalY)) {
        lines.push(`    focalY: ${p.focalY}`);
      }
      if (typeof p.position === 'string' && p.position.trim()) {
        lines.push(`    position: "${esc(p.position.trim())}"`);
      }
      lines.push('    permanent: true');
      if (Array.isArray(p.surfaces) && p.surfaces.length) {
        lines.push(
          `    surfaces: [${p.surfaces.map((s) => `"${esc(s)}"`).join(', ')}]`
        );
      }
      return `  {\n${lines.join(',\n')},\n  }`;
    })
    .join(',\n');
  const header = `/* LE RADAR — banque favorites (permanente, manuelle)
 * Source de vérité : data/quebec-favorites-backgrounds.json
 * Ne pas écraser via maintain-quebec-backgrounds (ménage / purge).
 * Ajouts : signalement manuel ou node scripts/pin-background.js
 *
 * Consommateurs : mât (+ pomo / solitaire si surfaces les inclut)
 * permanent: true → immunisé contre la purge des bots
 */
`;
  fs.writeFileSync(
    JS_PATH,
    `${header}const QUEBEC_FAVORITES_BACKGROUNDS = [\n${body}\n];\n`,
    'utf8'
  );
}

function writeJson(bank) {
  fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true });
  bank.updated = new Date().toISOString();
  fs.writeFileSync(JSON_PATH, JSON.stringify(bank, null, 2) + '\n', 'utf8');
}

function findInBank(profile, match) {
  const map = {
    masthead: 'data/quebec-backgrounds.json',
    landscape: 'data/quebec-backgrounds.json',
    universities: 'data/quebec-university-backgrounds.json',
    pomo: 'data/quebec-pomo-backgrounds.json',
    nations: 'data/quebec-nations-backgrounds.json',
  };
  const rel = map[profile];
  if (!rel) throw new Error(`Profil inconnu: ${profile}`);
  const bank = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const m = String(match || '').toLowerCase();
  const hit = (bank.photos || []).find((p) =>
    `${p.title || ''} ${p.url || ''} ${p.credit || ''}`.toLowerCase().includes(m)
  );
  if (!hit) throw new Error(`Aucune photo « ${match} » dans ${rel}`);
  return hit;
}

function main() {
  const bank = loadFavorites();
  let entry = null;

  if (args.includes('--from-bank')) {
    const profile = argVal('from-bank') || 'masthead';
    const match = argVal('match');
    if (!match) {
      console.error('--from-bank nécessite --match "Percé"');
      process.exit(2);
    }
    const src = findInBank(profile, match);
    entry = {
      id: src.id || photoIdFromUrl(src.url),
      url: src.url,
      link: src.link,
      title: src.title,
      credit: src.credit,
      license: src.license,
      width: src.width,
      height: src.height,
      aspect: src.aspect,
      mime: src.mime,
      focalY: src.focalY,
      position: src.position,
    };
  } else {
    const url = argVal('url');
    if (!url) {
      console.error('Usage: --url … ou --from-bank masthead --match "Percé"');
      process.exit(2);
    }
    entry = {
      id: photoIdFromUrl(url),
      url,
      link: argVal('link') || url,
      title: argVal('title') || 'Favorite',
      credit: argVal('credit') || '',
      license: argVal('license') || '',
    };
  }

  // Overrides CLI (aussi avec --from-bank)
  const fy = argVal('focalY');
  if (fy != null && fy !== '') {
    const n = Number(fy);
    if (!Number.isNaN(n)) entry.focalY = n;
  }
  const pos = argVal('position');
  if (pos) entry.position = pos;

  const surfacesRaw = argVal('surfaces') || 'masthead,pomo';
  entry.surfaces = surfacesRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  entry.permanent = true;
  entry.pinnedAt = new Date().toISOString();
  if (argVal('note')) entry.note = argVal('note');

  const photos = bank.photos || [];
  const idx = photos.findIndex((p) => p.url === entry.url);
  if (idx >= 0) {
    photos[idx] = { ...photos[idx], ...entry, permanent: true };
    console.log('Mis à jour:', entry.title);
  } else {
    photos.push(entry);
    console.log('Ajouté:', entry.title);
  }
  bank.photos = photos;
  writeJson(bank);
  writeJs(photos);
  console.log(`Favorites: ${photos.length} → ${path.relative(ROOT, JSON_PATH)}`);
}

main();

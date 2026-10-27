'use strict';
/**
 * Mémoire des images mortes (404/410 non passagères) relevées par
 * check-news-images.js. ensure-lead-images.js ne réattribue plus une photo
 * de repli connue morte : sans ça, la même vignette Commons revenait à
 * chaque collecte et l'issue « Santé des sources » ne se fermait jamais.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'dead-images.json');
const MAX = 500;

function normalize(url = '') {
  // Vignette Commons → original : .../thumb/a/ab/F.jpg/500px-F.jpg → .../a/ab/F.jpg
  return String(url).replace(/\/thumb(\/[0-9a-f]\/[0-9a-f]{2}\/[^/]+)\/[^/]+$/i, '$1');
}

function load(file = FILE) {
  try { return new Set((JSON.parse(fs.readFileSync(file, 'utf8')).urls || []).map(normalize)); } catch { return new Set(); }
}

function isDead(url, set) { return !!url && set.has(normalize(url)); }

function remember(urls = [], file = FILE) {
  const set = load(file);
  const before = set.size;
  for (const u of urls) if (u) set.add(normalize(u));
  const list = [...set].slice(-MAX);
  if (list.length !== before) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ urls: list }, null, 2)}\n`);
  }
  return list.length - before;
}

module.exports = { normalize, load, isDead, remember, FILE };

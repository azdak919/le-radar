#!/usr/bin/env node
/**
 * D10 (tranche) — dérive les motifs de lieux collégiaux depuis institutions.json
 * et les injecte dans translate.js (pas de 5ᵉ table : le JSON reste la SoT).
 *
 *   node scripts/sync-college-places.js
 *   node scripts/sync-college-places.js --check
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INST_PATH = path.join(ROOT, 'institutions.json');
const TRANSLATE_PATH = path.join(ROOT, 'translate.js');
const BEGIN = '/* RADAR:QC_COLLEGE_PLACE_PARTS:BEGIN */';
const END = '/* RADAR:QC_COLLEGE_PLACE_PARTS:END */';

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripType(name) {
  return String(name)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:c[eé]gep|coll[eè]ge|college|collège)\b\s*(?:de\s+|du\s+|d'|of\s+)?/i, '')
    .replace(/\s*\(.*\)$/, '')
    .trim();
}

function placePattern(name) {
  const n = stripType(name);
  if (!n || n.length < 4) return null;
  if (/^(à distance|institution|institut|campus)$/i.test(n)) return null;
  const core = n.replace(/\s+college$/i, '').trim();
  if (!core || core.length < 3) return null;
  return escapeRe(core)
    .replace(/\\ /g, '[\\s-]?')
    .replace(/-/g, '[\\s-]?')
    .replace(/é/gi, '[eé]')
    .replace(/è/gi, '[eè]')
    .replace(/ê/gi, '[eê]')
    .replace(/à/gi, '[aà]');
}

function buildParts() {
  const raw = JSON.parse(fs.readFileSync(INST_PATH, 'utf8'));
  const list = raw.institutions || [];
  const parts = new Set();
  for (const inst of list.filter((i) => i.type === 'cegep')) {
    const p = placePattern(inst.name);
    if (p) parts.add(p);
  }
  for (const p of [
    'Dawson',
    'Vanier',
    'John\\s+Abbott',
    'Champlain',
    'Maisonneuve',
    'Vieux[\\s-]?Montr[eé]al',
    'Jonqui[eè]re',
  ]) {
    parts.add(p);
  }
  return [...parts].sort((a, b) => a.localeCompare(b, 'fr'));
}

function renderBlock(parts) {
  const lines = parts.map((p) => `      ${JSON.stringify(p)},`);
  return [
    BEGIN,
    '  // Dérivé de institutions.json (type=cegep) — `node scripts/sync-college-places.js`',
    '  const QC_COLLEGE_PLACE_PARTS = [',
    ...lines,
    '  ];',
    "  const QC_COLLEGE_PLACE_RE = new RegExp(QC_COLLEGE_PLACE_PARTS.join('|'), 'i');",
    END,
  ].join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const parts = buildParts();
  const block = renderBlock(parts);
  let src = fs.readFileSync(TRANSLATE_PATH, 'utf8');

  if (src.includes(BEGIN) && src.includes(END)) {
    const re = new RegExp(
      `${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    );
    src = src.replace(re, () => block);
  } else {
    // Première migration : remplacer l’ancien RegExp inline (join sur tableau).
    const oldRe =
      /  const QC_COLLEGE_PLACE_RE = new RegExp\(\n    \[[\s\S]*?\]\.join\('\|'\),\n    'i',\n  \);/;
    if (!oldRe.test(src)) {
      console.error('translate.js: marqueurs QC_COLLEGE_PLACE introuvables et ancien bloc non reconnu');
      process.exit(2);
    }
    src = src.replace(oldRe, () => block);
  }

  if (check) {
    const onDisk = fs.readFileSync(TRANSLATE_PATH, 'utf8');
    if (onDisk !== src) {
      console.error('QC_COLLEGE_PLACE_PARTS désynchronisé — lancer node scripts/sync-college-places.js');
      process.exit(1);
    }
    console.log(`OK college-places (${parts.length} motifs, sync)`);
    return;
  }

  fs.writeFileSync(TRANSLATE_PATH, src);
  console.log(`Écrit ${parts.length} motifs collégiaux dans translate.js`);
}

main();

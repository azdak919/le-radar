#!/usr/bin/env node
'use strict';
/**
 * Bascule hebdo : les pages SEO radio affichent « Semaine du <lundi> ».
 * Le lundi, avant que le bot horaires radio régénère, tout bot qui lance
 * static-integrity échouait. Ce script détecte l'étiquette périmée et,
 * avec --refresh, régénère les pages SEO (generate-seo --update).
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const { quebecWeekStartDate } = require('./seo-pages-lib.js');

const ROOT = join(__dirname, '..');

function currentWeekLabel(now = new Date()) {
  const week = quebecWeekStartDate(now);
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
  }).format(week);
}

function isWeekLabelStale(html, now = new Date()) {
  if (!/Semaine du /.test(html)) return false;
  return !html.includes(`Semaine du ${currentWeekLabel(now)}`);
}

function main() {
  const page = join(ROOT, 'radios/chyz/index.html');
  const html = readFileSync(page, 'utf8');
  if (!isWeekLabelStale(html)) {
    console.log(`seo-week-freshness: OK (Semaine du ${currentWeekLabel()})`);
    return;
  }
  console.log(`seo-week-freshness: étiquette périmée → Semaine du ${currentWeekLabel()}`);
  if (process.argv.includes('--refresh')) {
    execFileSync(process.execPath, [join(ROOT, 'scripts/generate-seo.js'), '--update'], { stdio: 'inherit', cwd: ROOT });
  } else {
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = { currentWeekLabel, isWeekLabelStale };

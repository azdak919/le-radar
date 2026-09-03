#!/usr/bin/env node
/**
 * LE-RADAR — CLI du gardien de fraîcheur.
 *
 *   node scripts/guard-harvest-freshness.js
 *   node scripts/guard-harvest-freshness.js --github-output
 *
 * Lit les payloads du dépôt (pas le réseau) : le workflow checkout main,
 * donc l’âge = dernière récolte poussée.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Harvest = require('./harvest-freshness-lib');

const ROOT = path.join(__dirname, '..');
const githubOutput = process.argv.includes('--github-output');

function readJson(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  } catch {
    return {};
  }
}

function readText(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
}

function main() {
  const news = readJson('news.json');
  const sports = readJson('sports.json');
  const radio = readJson('radio-nowplaying.json');
  const leagues = readJson('sports-leagues.json');
  const html = readText('sports/index.html');
  const report = Harvest.evaluateHarvest({
    now: Date.now(),
    newsUpdated: news.updated,
    sportsUpdated: sports.fetchedAt || sports.updated,
    radioUpdated: radio.updatedAt || radio.updated,
    leaguesGenerated: leagues.generated,
    sportsHtmlDatetime: Harvest.sportsHtmlStamp(html),
  });

  const flags = {
    sports: report.actions.includes('sports-full'),
    sports_html: report.actions.includes('sports-html'),
    radio: report.actions.includes('radio'),
    news: report.actions.includes('news'),
    leagues: report.actions.includes('leagues'),
  };

  console.log(JSON.stringify({ ...report, flags }, null, 2));

  if (githubOutput) {
    const dest = process.env.GITHUB_OUTPUT;
    if (dest) {
      const lines = Object.entries(flags).map(([k, v]) => `${k}=${v ? 'true' : 'false'}`);
      fs.appendFileSync(dest, `${lines.join('\n')}\n`);
    }
  }
}

main();

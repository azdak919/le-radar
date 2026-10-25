#!/usr/bin/env node
/**
 * Santé des sources : écrit data/source-health.md + met _dormantSince à jour
 * dans news-sources.json (--update). Sortie GITHUB_OUTPUT : problems=N.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const lib = require('./source-health-lib');

const ROOT = path.join(__dirname, '..');
const read = (p, fb) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return fb; } };

const registry = read('news-sources.json', { active: [] });
const archive = read('news-archive.json', { records: [] });
const news = read('news.json', { items: [] });
const imageStats = read('data/image-mirror-stats.json', null);

const yearAgo = Date.now() - 365 * 86400000;
const datesBySource = {};
const push = (name, d) => {
  if (!name || !d || Date.parse(d) < yearAgo) return;
  (datesBySource[name] ||= []).push(d);
};
for (const r of archive.records || []) push(r.source, r.publishedAt);
for (const i of news.items || []) push(i.source, i.date);

// Ignorer des stats d'images périmées (> 1 jour).
const stats = imageStats && Date.now() - Date.parse(imageStats.at || 0) < 86400000 ? imageStats : null;
const result = lib.evaluateHealth({ registry, datesBySource, imageStats: stats });
const body = lib.renderIssueBody(result);
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'source-health.md'), body);
console.log(body);
if (process.argv.includes('--update')) {
  fs.writeFileSync(path.join(ROOT, 'news-sources.json'), `${JSON.stringify(registry, null, 2)}\n`);
}
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `problems=${result.problems.length}\n`);
}

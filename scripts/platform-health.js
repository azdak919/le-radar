#!/usr/bin/env node
'use strict';
/** Lit les faits via l'API GitHub (gh), écrit data/platform-health.md, problems=N. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const lib = require('./platform-health-lib');

const repo = process.env.GITHUB_REPOSITORY || 'azdak919/le-radar';
const api = (p) => { try { return JSON.parse(execFileSync('gh', ['api', p], { encoding: 'utf8' })); } catch { return null; } };

const info = api(`repos/${repo}`) || {};
const pages = api(`repos/${repo}/pages`) || {};
const prs = (api(`repos/${repo}/pulls?state=open&per_page=100`) || [])
  .filter((p) => p.user && p.user.login === 'dependabot[bot]')
  .map((p) => ({ number: p.number, title: p.title, createdAt: p.created_at }));
const workflows = ((api(`repos/${repo}/actions/workflows?per_page=100`) || {}).workflows || [])
  .filter((w) => w.path.startsWith('.github/workflows/'))
  .map((w) => ({ name: w.name, state: w.state }));
// Annotations « deprecated » des derniers runs de main (Node d'actions en fin de vie, etc.).
const deprecations = new Set();
const runs = ((api(`repos/${repo}/actions/runs?branch=main&per_page=15`) || {}).workflow_runs || []);
for (const r of runs.filter((x) => !/^pages build/i.test(x.name))) {
  const suite = api(`repos/${repo}/check-suites/${r.check_suite_id}/check-runs`) || {};
  for (const cr of suite.check_runs || []) {
    for (const a of api(`repos/${repo}/check-runs/${cr.id}/annotations`) || []) {
      if (/deprecat|end of life|no longer supported/i.test(a.message || '')) deprecations.add(`${r.name} : ${String(a.message).slice(0, 200)}`);
    }
  }
}
let sailingAlert = '';
try { sailingAlert = (JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'sports-sailing.json'), 'utf8')).cicsa || {}).sheetAlert || ''; } catch { /* absent */ }
if (sailingAlert) deprecations.add(`Voile CICSA : ${sailingAlert}`);
const problems = lib.evaluate({ repoSizeMb: (info.size || 0) / 1024, pages, dependabotPrs: prs, workflows, deprecations: [...deprecations] });
const body = lib.renderBody(problems);
const out = path.join(__dirname, '..', 'data', 'platform-health.md');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, body);
console.log(body);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `problems=${problems.length}\n`);

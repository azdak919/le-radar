'use strict';

/**
 * Une seule issue GitHub par clé, mise à jour tant que le problème dure,
 * fermée au retour au vert. Le workflow reste vert : pas de courriel à
 * chaque passage. Sans jeton, on journalise et on n’échoue pas.
 *
 *   node scripts/source-incident.js --state open --key "contrôle Update Radio Schedules" --body "…"
 *   node scripts/source-incident.js --state close --key "contrôle Update Radio Schedules"
 */

const { execFileSync } = require('child_process');
const fs = require('fs');

function incidentTitle(key) {
  return `LE-RADAR : ${String(key || 'incident').replace(/\s+/g, ' ').trim()}`;
}

function defaultExec(file, args) {
  return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function reportIncident({ key, state = 'open', body = '', execFile = defaultExec, repo } = {}) {
  const title = incidentTitle(key);
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token && execFile === defaultExec) {
    console.log(`incident ${state} (sans jeton) : ${title}`);
    return { skipped: true, title, state };
  }
  const repoArgs = repo ? ['-R', repo] : [];
  let listed = '[]';
  try {
    listed = execFile('gh', [
      'issue', 'list', ...repoArgs, '--state', 'all', '--limit', '20',
      '--search', `in:title "${title}"`, '--json', 'number,title,state',
    ]);
  } catch (err) {
    console.warn(`incident non lu : ${err.message}`);
    return { skipped: true, title, state, error: err.message };
  }
  let rows = [];
  try { rows = JSON.parse(listed || '[]'); } catch { rows = []; }
  const hit = rows.find((row) => row.title === title);
  const text = body && body.length > 6000 ? `${body.slice(0, 6000)}\n…` : (body || title);
  try {
    if (state === 'close') {
      if (hit && String(hit.state).toUpperCase() !== 'CLOSED') {
        execFile('gh', ['issue', 'close', String(hit.number), ...repoArgs, '--comment', 'Réglé automatiquement : la passe suivante est verte.']);
      }
      return { title, state, number: hit ? hit.number : null };
    }
    if (hit && String(hit.state).toUpperCase() === 'OPEN') {
      execFile('gh', ['issue', 'edit', String(hit.number), ...repoArgs, '--body', text]);
      return { title, state, number: hit.number, updated: true };
    }
    if (hit) {
      execFile('gh', ['issue', 'reopen', String(hit.number), ...repoArgs]);
      execFile('gh', ['issue', 'edit', String(hit.number), ...repoArgs, '--body', text]);
      return { title, state, number: hit.number, reopened: true };
    }
    const created = execFile('gh', ['issue', 'create', ...repoArgs, '--title', title, '--body', text]);
    return { title, state, created: String(created || '').trim() };
  } catch (err) {
    console.warn(`incident non écrit : ${err.message}`);
    return { skipped: true, title, state, error: err.message };
  }
}

if (require.main === module) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : '';
  };
  const bodyFile = arg('--body-file');
  const body = bodyFile ? fs.readFileSync(bodyFile, 'utf8') : (arg('--body') || '');
  const result = reportIncident({
    key: arg('--key') || 'incident',
    state: arg('--state') || 'open',
    body,
  });
  console.log(JSON.stringify(result));
}

module.exports = { incidentTitle, reportIncident };

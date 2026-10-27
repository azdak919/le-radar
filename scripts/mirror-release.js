#!/usr/bin/env node
'use strict';
// node scripts/mirror-release.js restore [dir]   → télécharge les images de la Release absentes de dir
// node scripts/mirror-release.js sync [--dry-run] → téléverse les nouvelles, supprime les purgées (délai de grâce)
// Requiert gh et GH_TOKEN (contents: write pour sync). Dépôt : GITHUB_REPOSITORY.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { TAG, IMG, plan } = require('./mirror-release-lib');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'news-images');
const REPO = process.env.GITHUB_REPOSITORY || 'azdak919/le-radar';
const gh = (args, opts = {}) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 1 << 26, ...opts });

function remoteAssets() {
  const out = gh(['api', '--paginate', `repos/${REPO}/releases/tags/${TAG}`, '--jq', '.assets[] | [.id, .name, .created_at] | @tsv']);
  return out.split('\n').filter(Boolean).map((l) => { const [id, name, createdAt] = l.split('\t'); return { id, name, createdAt }; });
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'restore') {
  const dir = path.resolve(rest[0] || DIR);
  fs.mkdirSync(dir, { recursive: true });
  const before = fs.readdirSync(dir).length;
  try {
    gh(['release', 'download', TAG, '-R', REPO, '-D', dir, '--skip-existing', '-p', '*'], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    if (!/no assets/i.test(String(e.stderr || e.message))) throw e; // Release vide : rien à restaurer
  }
  console.log(`mirror-release restore : ${fs.readdirSync(dir).length - before} fichier(s) ajoutés dans ${path.relative(ROOT, dir) || dir}`);
} else if (mode === 'sync') {
  const dry = rest.includes('--dry-run');
  const local = fs.readdirSync(DIR).filter((n) => IMG.test(n));
  const tracked = execFileSync('git', ['ls-files', '--', 'assets/news-images'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean).map((p) => path.basename(p));
  const remote = remoteAssets();
  const p = plan({ local, tracked, remote });
  console.log(`mirror-release sync${dry ? ' (simulation)' : ''} : ${p.upload.length} à téléverser, ${p.delete.length} à supprimer, ${remote.length} dans la Release`);
  if (!dry) {
    for (let i = 0; i < p.upload.length; i += 20) {
      gh(['release', 'upload', TAG, '-R', REPO, '--clobber', ...p.upload.slice(i, i + 20).map((n) => path.join(DIR, n))]);
    }
    const byName = new Map(remote.map((r) => [r.name, r]));
    for (const n of p.delete) gh(['api', '-X', 'DELETE', `repos/${REPO}/releases/assets/${byName.get(n).id}`]);
  }
  console.log(JSON.stringify(p));
} else { console.error('usage: restore [dir] | sync [--dry-run]'); process.exit(2); }

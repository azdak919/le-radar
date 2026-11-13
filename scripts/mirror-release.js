#!/usr/bin/env node
'use strict';
// node scripts/mirror-release.js restore [dir]   → télécharge les images de la Release absentes de dir
// node scripts/mirror-release.js sync [--dry-run] → téléverse les nouvelles, supprime les purgées (délai de grâce)
// Requiert gh et GH_TOKEN (contents: write pour sync). Dépôt : GITHUB_REPOSITORY.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { TAG, IMG, plan, isTransient, keepNamesFromPages, keepNamesFromSocial } = require('./mirror-release-lib');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'news-images');
const REPO = process.env.GITHUB_REPOSITORY || 'azdak919/le-radar';
const gh = (args, opts = {}) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 1 << 26, ...opts });

function remoteAssets() {
  const out = gh(['api', '--paginate', `repos/${REPO}/releases/tags/${TAG}`, '--jq', '.assets[] | [.id, .name, .size, .created_at] | @tsv']);
  return out.split('\n').filter(Boolean).map((l) => {
    const [id, name, size, createdAt] = l.split('\t');
    return { id, name, size: Number(size), createdAt };
  });
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'restore') {
  const dir = path.resolve(rest[0] || DIR);
  fs.mkdirSync(dir, { recursive: true });
  const before = fs.readdirSync(dir).length;
  // --skip-existing : une reprise ne retélécharge que ce qui manque encore.
  const ATTEMPTS = 4;
  for (let attempt = 1; ; attempt++) {
    try {
      gh(['release', 'download', TAG, '-R', REPO, '-D', dir, '--skip-existing', '-p', '*'], { stdio: ['ignore', 'pipe', 'pipe'] });
      break;
    } catch (e) {
      const msg = String(e.stderr || e.message);
      if (/no assets/i.test(msg)) break; // Release vide : rien à restaurer
      if (!isTransient(msg) || attempt >= ATTEMPTS) throw e;
      console.warn(`mirror-release restore : erreur passagère (essai ${attempt}/${ATTEMPTS}) : ${msg.trim()} ; nouvel essai`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000 * attempt);
    }
  }
  console.log(`mirror-release restore : ${fs.readdirSync(dir).length - before} fichier(s) ajoutés dans ${path.relative(ROOT, dir) || dir}`);
} else if (mode === 'sync') {
  const dry = rest.includes('--dry-run');
  const local = fs.readdirSync(DIR).filter((n) => IMG.test(n));
  const sizes = {};
  for (const n of local) {
    try { sizes[n] = fs.statSync(path.join(DIR, n)).size; } catch { /* disparu entre la liste et la mesure */ }
  }
  const tracked = execFileSync('git', ['ls-files', '--', 'assets/news-images'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean).map((p) => path.basename(p));
  const remote = remoteAssets();
  let keep = [];
  try {
    keep = keepNamesFromPages(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/article-pages.json'), 'utf8')));
  } catch { /* registre absent : seule la grâce s'applique */ }
  // Images des publications Buffer en file ou récentes : gardées tant que la plateforme peut encore les télécharger.
  const social = ['data/buffer-sent.json', 'data/buffer-pages-sent.json'].map((f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return null; } });
  keep = [...new Set([...keep, ...keepNamesFromSocial(social)])];
  const p = plan({ local, tracked, remote, sizes, keep });
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

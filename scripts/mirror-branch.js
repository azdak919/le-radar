#!/usr/bin/env node
'use strict';
// Stockage durable des images miroir, hors index de main.
//
//   node scripts/mirror-branch.js restore [dir]
//   node scripts/mirror-branch.js sync [--dry-run]
//
// La branche orpheline `media-mirror` porte assets/news-images/<hash>.<ext>
// et mirror-born.json (date de première mise en ligne, pour le délai de
// grâce). pages-deploy.yml recopie ces fichiers dans l'artefact Pages :
// les URL publiques restent /assets/news-images/<hash>.<ext>.
//
// sync refuse un dossier local vide s'il existe déjà des images (évite
// d'effacer le miroir après un checkout sans restore). Une image retirée
// du disque reste sur la branche pendant le délai de grâce, et plus
// longtemps si une revue ou une publication sociale la cite encore.
//
// MIRROR_LOCAL=1  : met à jour refs/heads/<branche> sans pousser (tests).
// MIRROR_ROOT     : racine du dépôt (défaut : parent de ce script).
// MIRROR_NOW      : horloge ISO, pour les tests du délai de grâce.
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  IMG, plan, keepNamesFromPages, keepNamesFromSocial, keepNamesFromHtml,
} = require('./mirror-release-lib');

const ROOT = process.env.MIRROR_ROOT || path.join(__dirname, '..');
const BRANCH = process.env.MIRROR_BRANCH || 'media-mirror';
const REMOTE = process.env.MIRROR_REMOTE || 'origin';
const LOCAL_ONLY = process.env.MIRROR_LOCAL === '1';
const PREFIX = 'assets/news-images';
const BORN = 'mirror-born.json';

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  });
}

function tipRef() {
  return LOCAL_ONLY ? `refs/heads/${BRANCH}` : `refs/remotes/${REMOTE}/${BRANCH}`;
}

function hasTip() {
  try {
    git(['rev-parse', '--verify', '--quiet', tipRef()]);
    return true;
  } catch {
    return false;
  }
}

function ensureFetched() {
  if (LOCAL_ONLY) return hasTip();
  try {
    git(['fetch', '--depth=1', REMOTE, `+${BRANCH}:${tipRef()}`]);
    return true;
  } catch (e) {
    const msg = String(e.stderr || e.message || '');
    if (/couldn't find remote ref|remote ref .* not found|no such ref/i.test(msg)) return false;
    throw e;
  }
}

function listImages(rev) {
  let out = '';
  try { out = git(['ls-tree', '-r', '-l', rev, PREFIX]); } catch { return []; }
  return out.split('\n').filter(Boolean).map((line) => {
    const tab = line.indexOf('\t');
    const meta = line.slice(0, tab).trim().split(/\s+/);
    const rel = line.slice(tab + 1);
    return { sha: meta[2], size: Number(meta[3]), name: path.posix.basename(rel), path: rel };
  }).filter((e) => IMG.test(e.name) && Number.isFinite(e.size));
}

function readBorn(rev) {
  try { return JSON.parse(git(['show', `${rev}:${BORN}`])); } catch { return {}; }
}

function readKeep() {
  let keep = [];
  try {
    keep = keepNamesFromPages(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/article-pages.json'), 'utf8')));
  } catch { /* registre absent */ }
  const social = ['data/buffer-sent.json', 'data/buffer-pages-sent.json'].map((f) => {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return null; }
  });
  keep = [...keep, ...keepNamesFromSocial(social)];
  const revue = path.join(ROOT, 'revue');
  if (fs.existsSync(revue)) {
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (ent.name.endsWith('.html')) keep.push(...keepNamesFromHtml(fs.readFileSync(p, 'utf8')));
      }
    };
    walk(revue);
  }
  return [...new Set(keep)];
}

function nowDate() {
  const raw = process.env.MIRROR_NOW;
  const t = raw ? Date.parse(raw) : Date.now();
  return Number.isFinite(t) ? t : Date.now();
}

function identity() {
  if (process.env.GITHUB_ACTIONS === 'true') {
    return { name: 'LE-RADAR News Bot', email: 'actions@users.noreply.github.com' };
  }
  return { name: 'Azdak', email: 'azdak-qc@proton.me' };
}

function writeOutput(sha) {
  if (!process.env.GITHUB_OUTPUT || !sha) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `sha=${sha}\n`);
}

function localImages(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => IMG.test(n));
}

function decide(dir) {
  const local = localImages(dir);
  const sizes = {};
  for (const n of local) sizes[n] = fs.statSync(path.join(dir, n)).size;
  const present = ensureFetched();
  const parent = present ? git(['rev-parse', tipRef()]).trim() : null;
  const remoteEntries = parent ? listImages(parent) : [];
  const born = parent ? readBorn(parent) : {};
  const remote = remoteEntries.map((e) => ({
    name: e.name, size: e.size, sha: e.sha, createdAt: born[e.name] || '1970-01-01T00:00:00.000Z',
  }));
  if (local.length === 0 && remote.length > 0) {
    const err = new Error('mirror-branch: dossier local vide, sync refusé (restore d’abord)');
    err.code = 'EMPTY';
    throw err;
  }
  const now = nowDate();
  const keep = readKeep();
  const p = plan({ local, tracked: [], remote, sizes, keep, now });
  const drop = new Set(p.delete);
  const byName = new Map(remote.map((r) => [r.name, r]));
  const names = new Set(local);
  for (const r of remote) if (!drop.has(r.name)) names.add(r.name);
  const iso = new Date(now).toISOString();
  const nextBorn = {};
  for (const n of names) nextBorn[n] = born[n] || iso;
  return { local, sizes, parent, byName, names, nextBorn, upload: p.upload, delete: p.delete, dir };
}

function restore(dir) {
  const dest = path.resolve(dir || path.join(ROOT, PREFIX));
  if (!ensureFetched()) {
    console.error(`mirror-branch restore : branche ${BRANCH} absente`);
    process.exit(1);
  }
  const rev = git(['rev-parse', tipRef()]).trim();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'media-mirror-'));
  try {
    const archived = spawnSync('git', ['archive', rev, PREFIX], { cwd: ROOT, maxBuffer: 128 << 20 });
    if (archived.status !== 0) {
      throw new Error(String(archived.stderr || 'git archive a échoué'));
    }
    const unpacked = spawnSync('tar', ['-x', '-C', tmp], { input: archived.stdout });
    if (unpacked.status !== 0) throw new Error(String(unpacked.stderr || 'tar a échoué'));
    const src = path.join(tmp, PREFIX);
    fs.mkdirSync(dest, { recursive: true });
    let n = 0;
    if (fs.existsSync(src)) {
      for (const name of fs.readdirSync(src)) {
        if (!IMG.test(name)) continue;
        fs.copyFileSync(path.join(src, name), path.join(dest, name));
        n += 1;
      }
    }
    if (n === 0) {
      console.error('mirror-branch restore : aucune image sur la branche');
      process.exit(1);
    }
    console.log(`mirror-branch restore : ${n} image(s) depuis ${BRANCH}@${rev.slice(0, 12)} → ${dest}`);
    writeOutput(rev);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function buildCommit(state) {
  const index = path.join(os.tmpdir(), `media-mirror-index-${process.pid}`);
  try { fs.unlinkSync(index); } catch { /* absent */ }
  const env = { ...process.env, GIT_INDEX_FILE: index };
  const gi = (args, extra = {}) => execFileSync('git', args, {
    cwd: ROOT, encoding: 'utf8', env, maxBuffer: 1 << 26, stdio: ['pipe', 'pipe', 'pipe'], ...extra,
  });
  gi(['read-tree', '--empty']);
  const locals = new Set(state.local);
  for (const n of [...state.names].sort()) {
    const rel = `${PREFIX}/${n}`;
    const published = state.byName.get(n);
    // Fichier absent du disque mais encore dans le délai de grâce ou cité
    // par une revue : on réutilise le blob déjà sur la branche.
    const reuse = published && (!locals.has(n) || published.size === state.sizes[n]);
    const sha = reuse
      ? published.sha
      : git(['hash-object', '-w', path.join(state.dir, n)]).trim();
    gi(['update-index', '--add', '--cacheinfo', `100644,${sha},${rel}`]);
  }
  const bornSha = git(['hash-object', '-w', '--stdin'], {
    input: `${JSON.stringify(state.nextBorn, null, 2)}\n`,
  }).trim();
  gi(['update-index', '--add', '--cacheinfo', `100644,${bornSha},${BORN}`]);
  const tree = gi(['write-tree']).trim();
  const who = identity();
  const msg = [
    `mirror: ${state.upload.length} image(s) en plus, ${state.delete.length} en moins`,
    '',
    `Signed-off-by: ${who.name} <${who.email}>`,
    '',
  ].join('\n');
  const args = ['commit-tree', tree, '-m', msg];
  if (state.parent) args.push('-p', state.parent);
  const sha = git(args, {
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: who.name,
      GIT_AUTHOR_EMAIL: who.email,
      GIT_COMMITTER_NAME: who.name,
      GIT_COMMITTER_EMAIL: who.email,
    },
  }).trim();
  try { fs.unlinkSync(index); } catch { /* déjà retiré */ }
  return sha;
}

function publish(sha) {
  if (LOCAL_ONLY) {
    git(['update-ref', `refs/heads/${BRANCH}`, sha]);
    return;
  }
  try {
    git(['push', REMOTE, `${sha}:refs/heads/${BRANCH}`]);
  } catch (e) {
    const msg = String(e.stderr || e.message || '');
    if (/non-fast-forward|rejected|fetch first/i.test(msg)) {
      const err = new Error('media-mirror a avancé, nouvel essai');
      err.code = 'RETRY';
      throw err;
    }
    throw e;
  }
}

function sync({ dry = false } = {}) {
  const dir = path.join(ROOT, PREFIX);
  const state = decide(dir);
  if (dry) {
    console.log(JSON.stringify({
      upload: state.upload, delete: state.delete, count: state.names.size, parent: state.parent,
    }));
    return state;
  }
  if (state.parent && state.upload.length === 0 && state.delete.length === 0) {
    console.log(`mirror-branch sync : inchangé ${state.parent.slice(0, 12)}`);
    writeOutput(state.parent);
    return state;
  }
  const sha = buildCommit(state);
  publish(sha);
  console.log(`mirror-branch sync : ${sha.slice(0, 12)} (+${state.upload.length} -${state.delete.length})`);
  writeOutput(sha);
  return { ...state, sha };
}

function main() {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'restore') restore(rest.find((a) => !a.startsWith('--')));
  else if (mode === 'sync') {
    try { sync({ dry: rest.includes('--dry-run') }); }
    catch (e) {
      if (e.code !== 'RETRY') throw e;
      sync({ dry: rest.includes('--dry-run') });
    }
  } else {
    console.error('usage: restore [dir] | sync [--dry-run]');
    process.exit(2);
  }
}

if (require.main === module) {
  try { main(); }
  catch (err) {
    console.error(err.stderr ? String(err.stderr) : err.message || err);
    process.exit(1);
  }
}

module.exports = { decide, BRANCH, PREFIX, BORN };

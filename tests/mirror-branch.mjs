import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');
const script = path.join(repo, 'scripts/mirror-branch.js');

function run(root, args, extra = {}) {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: root,
    env: {
      ...process.env,
      MIRROR_ROOT: root,
      MIRROR_LOCAL: '1',
      MIRROR_BRANCH: 'media-mirror',
      GITHUB_ACTIONS: '',
      ...extra,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function initRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'mirror-branch-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'azdak-qc@proton.me'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Azdak'], { cwd: root });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: root });
  const dir = path.join(root, 'assets', 'news-images');
  mkdirSync(dir, { recursive: true });
  return { root, dir };
}

const jpeg = (n) => Buffer.from([0xff, 0xd8, 0xff, n, 0xd9]);
const { root, dir } = initRepo();
try {
  const oldName = 'aaaa1111bbbb2222.jpg';
  const newName = 'cccc3333dddd4444.jpg';
  writeFileSync(path.join(dir, oldName), jpeg(1));
  const first = run(root, ['sync']);
  assert.match(first, /Signed-off-by|mirror-branch sync/, first);
  assert.match(execFileSync('git', ['log', '-1', '--format=%B', 'media-mirror'], { cwd: root, encoding: 'utf8' }), /Signed-off-by: Azdak <azdak-qc@proton\.me>/);

  const site = path.join(root, '_site');
  run(root, ['restore', path.join(site, 'assets', 'news-images')]);
  assert.deepEqual(readFileSync(path.join(site, 'assets', 'news-images', oldName)), jpeg(1));

  writeFileSync(path.join(dir, newName), jpeg(2));
  run(root, ['sync']);
  const site2 = path.join(root, '_site2');
  run(root, ['restore', path.join(site2, 'assets', 'news-images')]);
  assert.deepEqual(readFileSync(path.join(site2, 'assets', 'news-images', oldName)), jpeg(1), 'image déjà publiée');
  assert.deepEqual(readFileSync(path.join(site2, 'assets', 'news-images', newName)), jpeg(2), 'image nouvelle');

  // Retirée du disque mais encore dans le délai de grâce : l’URL reste servie.
  rmSync(path.join(dir, oldName));
  run(root, ['sync']);
  const site3 = path.join(root, '_site3');
  run(root, ['restore', path.join(site3, 'assets', 'news-images')]);
  assert.ok(statSync(path.join(site3, 'assets', 'news-images', oldName)), 'grâce : fichier encore sur la branche');

  // Passé le délai, sans citation : le fichier quitte la branche.
  const later = new Date(Date.now() + 20 * 86400000).toISOString();
  run(root, ['sync'], { MIRROR_NOW: later });
  const site4 = path.join(root, '_site4');
  run(root, ['restore', path.join(site4, 'assets', 'news-images')]);
  assert.deepEqual(readdirSync(path.join(site4, 'assets', 'news-images')).sort(), [newName]);

  // Une revue publiée garde l’image même après le délai.
  const revueDir = path.join(root, 'revue', '2026-01-01-matin');
  mkdirSync(revueDir, { recursive: true });
  writeFileSync(path.join(revueDir, 'index.html'), `<img src="https://le-radar.ca/assets/news-images/${oldName}">`);
  writeFileSync(path.join(dir, oldName), jpeg(1));
  const past = new Date(Date.now() - 40 * 86400000).toISOString();
  run(root, ['sync'], { MIRROR_NOW: past });
  rmSync(path.join(dir, oldName));
  run(root, ['sync'], { MIRROR_NOW: later });
  const site5 = path.join(root, '_site5');
  run(root, ['restore', path.join(site5, 'assets', 'news-images')]);
  assert.ok(readdirSync(path.join(site5, 'assets', 'news-images')).includes(oldName), 'revue : URL conservée');

  // Dossier local vide : on ne vide pas la branche.
  for (const name of readdirSync(dir)) rmSync(path.join(dir, name));
  let refused = false;
  try { run(root, ['sync']); } catch (e) { refused = /vide/.test(String(e.stderr || e.message)); }
  assert.equal(refused, true, 'sync refusé si le disque est vide');

  await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(site2, rel);
      try {
        const body = readFileSync(file);
        res.writeHead(200, { 'content-type': 'image/jpeg' });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address();
      try {
        for (const [name, buf] of [[oldName, jpeg(1)], [newName, jpeg(2)]]) {
          const res = await fetch(`http://127.0.0.1:${port}/assets/news-images/${name}`);
          assert.equal(res.status, 200, name);
          assert.deepEqual(Buffer.from(await res.arrayBuffer()), buf, name);
        }
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
} finally {
  rmSync(root, { recursive: true, force: true });
}

// Un workflow qui recommence à indexer le miroir dans main fait échouer ce test.
const wfDir = path.join(repo, '.github', 'workflows');
for (const name of readdirSync(wfDir)) {
  if (!name.endsWith('.yml') && !name.endsWith('.yaml')) continue;
  const code = readFileSync(path.join(wfDir, name), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
  assert.doesNotMatch(code, /git\s+add\s+-f\b/, `${name} ne doit pas forcer git add`);
  for (const line of code.split('\n')) {
    if (!/\bgit add\b/.test(line) || !/assets\/news-images/.test(line)) continue;
    const refs = [...line.matchAll(/assets\/news-images(?:\/[A-Za-z0-9._-]+)?/g)].map((m) => m[0]);
    for (const ref of refs) {
      assert.equal(ref, 'assets/news-images/manifest.json', `${name} : ${line.trim()}`);
    }
  }
}
assert.match(readFileSync(path.join(wfDir, 'pages-deploy.yml'), 'utf8'), /mirror-branch\.js restore/);
assert.match(readFileSync(path.join(wfDir, 'pages-deploy.yml'), 'utf8'), /_site\/assets\/news-images/);
assert.match(readFileSync(path.join(wfDir, 'update-news.yml'), 'utf8'), /mirror-branch\.js sync/);
assert.match(readFileSync(path.join(wfDir, 'update-news.yml'), 'utf8'), /git rm -q --cached/);

const tracked = execFileSync('git', ['ls-files', '--', 'assets/news-images'], { cwd: repo, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
assert.deepEqual(tracked, ['assets/news-images/manifest.json'], 'seul le manifeste reste dans l’index de main');

console.log('mirror-branch ok');

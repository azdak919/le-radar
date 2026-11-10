import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { plan, TAG, isTransient } = createRequire(import.meta.url)('../scripts/mirror-release-lib.js');
const now = Date.parse('2026-10-27T12:00:00Z');
const old = '2026-10-20T00:00:00Z', fresh = '2026-10-27T11:00:00Z';
const p = plan({ now, local: ['a.jpg', 'b.png', 'old.jpg', 'manifest.json'], tracked: ['old.jpg'],
  remote: [{ name: 'b.png', createdAt: old }, { name: 'gone.jpg', createdAt: old }, { name: 'justgone.webp', createdAt: fresh }] });
assert.deepEqual(p.upload, ['a.jpg'], 'nouvelle image seulement (ni suivie par git, ni déjà publiée, ni manifest)');
assert.deepEqual(p.delete, ['gone.jpg'], 'purgée et plus vieille que le délai de grâce');
const rewritten = plan({
  now,
  local: ['dirty.jpg', 'same.jpg', 'tracked.jpg'],
  tracked: ['tracked.jpg'],
  remote: [
    { name: 'dirty.jpg', size: 82573, createdAt: old },
    { name: 'same.jpg', size: 100, createdAt: old },
    { name: 'tracked.jpg', size: 1, createdAt: old },
  ],
  sizes: { 'dirty.jpg': 81723, 'same.jpg': 100, 'tracked.jpg': 50 },
});
assert.deepEqual(rewritten.upload, ['dirty.jpg'], 'JPEG réécrit : même nom, taille différente, republier');
assert.deepEqual(rewritten.delete, []);
assert.match(readFileSync('scripts/mirror-release.js', 'utf8'), /\.size/);
assert.match(readFileSync('scripts/mirror-release.js', 'utf8'), /sizes/);
assert.ok(!TAG.startsWith('android-v'));
// Le déploiement Pages recopie la Release dans le site ; l'ignore empêche de recommitter les nouvelles.
assert.match(readFileSync('.github/workflows/pages-deploy.yml', 'utf8'), /mirror-release\.js restore _site\/assets\/news-images/);
const gi = readFileSync('.gitignore', 'utf8');
assert.match(gi, /^assets\/news-images\/\*$/m); assert.match(gi, /^!assets\/news-images\/manifest\.json$/m);
// Restauration : HTTP 500 passager réessayé, erreurs définitives non.
assert.ok(isTransient('HTTP 500 (https://api.github.com/repos/azdak919/le-radar/releases/assets/700334505)'));
assert.ok(isTransient('HTTP 502: Bad Gateway')); assert.ok(isTransient('read: connection reset by peer'));
assert.ok(!isTransient('HTTP 404: Not Found')); assert.ok(!isTransient('HTTP 403: Resource not accessible'));
assert.ok(!isTransient('no assets to download'));
assert.match(readFileSync('scripts/mirror-release.js', 'utf8'), /isTransient\(msg\)/);
// Déploiement Pages : un seul nouvel essai si le premier reste bloqué, sans masquer un double échec.
const wf = readFileSync('.github/workflows/pages-deploy.yml', 'utf8');
assert.match(wf, /id: d\n\s+uses: actions\/deploy-pages@v5\n\s+continue-on-error: true/);
assert.match(wf, /id: d2\n\s+if: steps\.d\.outcome == 'failure'\n\s+uses: actions\/deploy-pages@v5\n(?![\s\S]*continue-on-error[\s\S]*id: d2)/);
assert.equal((wf.match(/continue-on-error/g) || []).length, 1);
console.log('mirror-release ok');

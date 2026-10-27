import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { plan, TAG } = createRequire(import.meta.url)('../scripts/mirror-release-lib.js');
const now = Date.parse('2026-10-27T12:00:00Z');
const old = '2026-10-20T00:00:00Z', fresh = '2026-10-27T11:00:00Z';
const p = plan({ now, local: ['a.jpg', 'b.png', 'old.jpg', 'manifest.json'], tracked: ['old.jpg'],
  remote: [{ name: 'b.png', createdAt: old }, { name: 'gone.jpg', createdAt: old }, { name: 'justgone.webp', createdAt: fresh }] });
assert.deepEqual(p.upload, ['a.jpg'], 'nouvelle image seulement (ni suivie par git, ni déjà publiée, ni manifest)');
assert.deepEqual(p.delete, ['gone.jpg'], 'purgée et plus vieille que le délai de grâce');
assert.ok(!TAG.startsWith('android-v'));
// Le déploiement Pages recopie la Release dans le site ; l'ignore empêche de recommitter les nouvelles.
assert.match(readFileSync('.github/workflows/pages-deploy.yml', 'utf8'), /mirror-release\.js restore _site\/assets\/news-images/);
const gi = readFileSync('.gitignore', 'utf8');
assert.match(gi, /^assets\/news-images\/\*$/m); assert.match(gi, /^!assets\/news-images\/manifest\.json$/m);
console.log('mirror-release ok');

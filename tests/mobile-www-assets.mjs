#!/usr/bin/env node
// mobile/www (Capacitor) : vrais fichiers, pas de liens symboliques ;
// dépendances du mât chargées dans le bon ordre ; avis « hors ligne » de l'app.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const home = read('mobile/app/js/site-home.js');
const iS = home.indexOf("'scripts/session-freshness-lib.js'");
const iF = home.indexOf("'scripts/sports-freshness-lib.js'");
assert.ok(iS !== -1 && iS < iF, 'site-home.js doit charger session-freshness-lib avant sports-freshness-lib');

const app = read('mobile/app/js/app.js');
assert.ok(!/option\.className\s*=/.test(app), 'syncTuner : ajouter des classes, pas assigner className');
assert.match(app, /OFFLINE_NOTICE_MS\s*=\s*4000/);

execFileSync('node', ['mobile/scripts/prepare.mjs'], { cwd: root, stdio: 'ignore' });
const www = join(root, 'mobile/www');
const links = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) links.push(p);
    else if (st.isDirectory()) walk(p);
  }
})(www);
assert.deepEqual(links, [], `liens symboliques dans mobile/www : ${links.join(', ')}`);
assert.equal(readFileSync(join(www, 'js/article-card-lib.js'), 'utf8'), read('scripts/article-card-lib.js'));
for (const f of ['scripts/session-freshness-lib.js', 'scripts/sports-freshness-lib.js']) {
  assert.equal(readFileSync(join(www, 'site', f), 'utf8'), read(f), `${f} copié dans www/site`);
}
console.log('mobile-www-assets: ok');

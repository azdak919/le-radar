/**
 * Tests unitaires légers du miroir d’images (clés + hôtes fragiles).
 * Pas de réseau : pure logique.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);
const { imageUrlKey } = require('../scripts/article-photo-credit-lib.js');

// Reprise de mirrorKey (doit rester aligné avec scripts/mirror-news-images.js)
import crypto from 'node:crypto';
function mirrorKey(url = '') {
  try {
    const u = new URL(url);
    u.hash = '';
    const canon = `${u.hostname.toLowerCase()}${u.pathname}`;
    return crypto.createHash('sha1').update(canon).digest('hex').slice(0, 16);
  } catch {
    return crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 16);
  }
}

const u1 = 'https://www.exemplaire.com.ulaval.ca/wp-content/uploads/2026/05/foo.png';
const u2 = 'https://www.exemplaire.com.ulaval.ca/wp-content/uploads/2026/05/foo.png?utm=1';
assert.equal(mirrorKey(u1), mirrorKey(u2), 'query string ne doit pas changer la clé miroir');
assert.notEqual(
  mirrorKey(u1),
  mirrorKey('https://lecollectif.ca/wp-content/uploads/2026/05/foo.png'),
  'hôtes différents → clés différentes',
);

assert.ok(imageUrlKey(u1).includes('foo'), 'imageUrlKey extrait le basename');

const mirrorJs = readFileSync(path.join(root, 'scripts/mirror-news-images.js'), 'utf8');
assert.match(mirrorJs, /1_200_000/, 'miroir : plafond 1,2 Mo (PNG éditorial ~760 ko)');
assert.match(mirrorJs, /photonUrl/, 'miroir : Photon si l’origine est trop lourde / down');
assert.match(mirrorJs, /via: 'photon'/, 'miroir : via photon');

// Script chargeable (syntaxe)
const check = spawnSync(process.execPath, ['--check', path.join(root, 'scripts/mirror-news-images.js')], {
  encoding: 'utf8',
});
assert.equal(check.status, 0, check.stderr || 'mirror-news-images.js syntax');

console.log('OK news-image-mirror');

// Identité honnête du robot et Accept normal pour les pages et les images.
// Pas de signature navigateur, pas de repli Chrome. 0 réseau.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const H = require('../scripts/http-bot-headers');
const A = require('../scripts/article-image-lib');

assert.match(H.BOT_USER_AGENT, /^LE-RADAR-NewsBot\/1\.0 /);
assert.match(H.BOT_USER_AGENT, /https:\/\/le-radar\.ca/);
assert.match(H.BOT_USER_AGENT, /azdak-qc@proton\.me/);
assert.doesNotMatch(H.BOT_USER_AGENT, /Mozilla\/5\.0|Chrome\/|Safari\/|Firefox\/|AppleWebKit/);
assert.equal(A.BOT_USER_AGENT, H.BOT_USER_AGENT);

assert.ok(H.HTML_ACCEPT.startsWith('text/html,application/xhtml+xml'));
assert.doesNotMatch(H.HTML_ACCEPT, /^\s*application\/rss\+xml/);
assert.ok(H.IMAGE_ACCEPT.startsWith('image/'));

const html = H.htmlHeaders();
assert.equal(html['User-Agent'], H.BOT_USER_AGENT);
assert.equal(html.Accept, H.HTML_ACCEPT);
const img = H.imageHeaders();
assert.equal(img['User-Agent'], H.BOT_USER_AGENT);
assert.equal(img.Accept, H.IMAGE_ACCEPT);

const imageLib = readFileSync(new URL('../scripts/article-image-lib.js', import.meta.url), 'utf8');
assert.doesNotMatch(imageLib, /BROWSER_USER_AGENT|Chrome\/126|AppleWebKit\/537/);
assert.match(imageLib, /htmlHeaders\(\)/);
assert.match(imageLib, /imageHeaders\(\)/);
assert.match(imageLib, /vrai blocage n'est pas contourné/);

console.log('http-bot-headers: ok');

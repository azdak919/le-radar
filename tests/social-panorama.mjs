import assert from 'node:assert/strict';
import fs from 'node:fs';
import { panoramaPlan, selectPanorama, X_IMAGE_MAX } from '../scripts/social/panorama.mjs';

const cfgOff = { panorama: { enabled: false, instagram: false, x: false } };
assert.equal(selectPanorama(cfgOff, 3520, 1980, 'instagram'), null);
assert.equal(selectPanorama(cfgOff, 3520, 1980, 'x'), null);
assert.equal(selectPanorama({}, 4000, 2000, 'instagram'), null);

const on = { panorama: { enabled: true, instagram: true, x: true } };
const ig = selectPanorama(on, 3520, 1980, 'instagram');
assert.equal(ig.n, 3);
assert.equal(ig.panel.width, 1080);
assert.equal(ig.panel.height, 1440);
for (let i = 1; i < ig.slices.length; i++) assert.equal(ig.slices[i - 1].x + ig.slices[i - 1].w, ig.slices[i].x);

const x = selectPanorama(on, 3520, 1980, 'x');
assert.equal(x.n, 2);
assert.equal(x.cols, 2);
assert.equal(x.panel.width, 1080);
assert.equal(x.panel.height, 1080);
assert.ok(x.n <= X_IMAGE_MAX);
assert.equal(x.slices[0].x + x.slices[0].w, x.slices[1].x);

assert.equal(panoramaPlan(1200, 800, 'instagram'), null, 'photo trop petite : format normal');
assert.equal(panoramaPlan(800, 1200, 'x'), null);
assert.equal(selectPanorama({ panorama: { enabled: true, instagram: true, x: false } }, 3520, 1980, 'x'), null);

const une = fs.readFileSync(new URL('../scripts/social/une-run.mjs', import.meta.url), 'utf8');
const post = fs.readFileSync(new URL('../scripts/social/buffer-post.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(une, /panorama\.mjs/);
assert.doesNotMatch(post, /panorama\.mjs/);
const policy = JSON.parse(fs.readFileSync(new URL('../data/social/policy.json', import.meta.url), 'utf8'));
assert.equal(policy.formats.une.panorama.enabled, false);
assert.equal(policy.formats.une.panorama.instagram, false);
assert.equal(policy.formats.une.panorama.x, false);

console.log('social-panorama ok');

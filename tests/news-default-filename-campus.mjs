// « default » : rejeter les vrais génériques, garder les suffixes WP (-c-default@2x).
// Repli campus : chaque établissement reçoit SA photo (pas « UdeM Laval » pour ULaval).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { GLOBAL_IMAGE_REJECT_RE: R } = require('../scripts/article-image-lib.js');
const L = require('../scripts/campus-fallback-lib.js');
const P = require('../data/quebec-university-backgrounds.json').photos;

const ok = ['/2026/10/20132017/Partie-5_Visuel_HD-1200x0-c-default%402x.jpg', '/x/a-c-default.jpg', '/x/a-1200x0-c-default-1024x512.jpg'];
const bad = ['/x/default.jpg', '/x/default-image.png', '/x/default_thumb.jpg', '/t/images/default/x.png', '/x/no-image-default.png', '/x/default@2x.png', '/x/placeholder.png'];
for (const u of ok) assert.equal(R.test(u.toLowerCase()), false, `accepté : ${u}`);
for (const u of bad) assert.equal(R.test(u.toLowerCase()), true, `rejeté : ${u}`);

const hay = (p) => JSON.stringify([p.place, p.title, p.url, p.link]).toLowerCase();
const laval = L.filterUniversityPhotos(P, 'Université Laval');
assert.ok(laval.length >= 10);
for (const p of laval) assert.ok(!/udem|sanatorium|sant%c3%a9_mentale/.test(hay(p)), `pas ULaval : ${p.title}`);
for (const p of L.filterUniversityPhotos(P, "Bishop's University")) assert.ok(!/chichester/.test(hay(p)), p.title);
for (const p of L.filterUniversityPhotos(P, 'Université de Sherbrooke')) assert.ok(!/centre-ville/.test(hay(p)), p.title);
const pick = L.pickCampusFallback({ institution: 'Université Laval', link: 'https://impactcampus.ca/x/' }, { universityPhotos: P });
assert.ok(pick && !/udem/i.test(pick.title));
console.log('news-default-filename-campus: ok');

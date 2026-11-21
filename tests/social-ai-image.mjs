// Texte alternatif et contrôle d'image : l'IA ne rédige pas les légendes, et un échec ne bloque pas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { articleAlt, factualAlt, parseVerdict, decideImage, brokenImage, reviewSocialImage } from '../scripts/social/ai-image.mjs';
import { altText } from '../scripts/social/une-lib.mjs';

const it = { bare: 'La bibliothèque prolonge ses heures', title: 'La bibliothèque prolonge ses heures', source: 'Impact Campus', desc: 'Les étudiants pourront étudier plus tard.' };
const facts = `${it.bare} ${it.source} ${it.desc}`;
const env = { CLOUDFLARE_AI_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' };
const jpeg = Buffer.alloc(64, 0xff);

assert.equal(articleAlt(it, 'Marie Tremblay'), 'La bibliothèque prolonge ses heures, Impact Campus, Marie Tremblay');
assert.equal(factualAlt('La bibliothèque reste ouverte plus tard', facts), 'La bibliothèque reste ouverte plus tard');
assert.equal(factualAlt('The library stays open later tonight', facts), '', 'anglais refusé');
assert.equal(factualAlt('La bibliothèque accueille 300 étudiants', facts), '', 'chiffre inventé');
assert.equal(factualAlt('Selon Dupont, la bibliothèque reste ouverte', facts), '', 'nom inventé');
assert.equal(parseVerdict('```json\n{"kind":"affiche","sur":"haute","alt":"Affiche de une"}\n```').kind, 'affiche');
assert.equal(parseVerdict('pas de json'), null);

const poster = decideImage({ verdict: { kind: 'affiche', sur: 'haute', alt: 'Affiche de la bibliothèque' }, fallbackAlt: articleAlt(it), facts, allowReject: true });
assert.equal(poster.reject, false, 'une affiche n’est pas écartée');
assert.equal(poster.source, 'ia');
const unsure = decideImage({ verdict: { kind: 'pub', sur: 'basse', alt: '' }, fallbackAlt: articleAlt(it), facts, allowReject: true });
assert.equal(unsure.reject, false, 'pub incertaine : on publie');
assert.equal(unsure.source, 'deterministe');
const ad = decideImage({ verdict: { kind: 'pub', sur: 'haute', alt: 'Publicité Prime Video' }, fallbackAlt: articleAlt(it), facts, allowReject: true });
assert.equal(ad.reject, true);
assert.equal(ad.alt, articleAlt(it));
const own = decideImage({ verdict: { kind: 'logo', sur: 'haute', alt: '' }, fallbackAlt: 'Affiche du Radar', facts, allowReject: false });
assert.equal(own.reject, false, 'affiche générée : jamais écartée');
assert.equal(brokenImage({ bytes: 10, w: 8, h: 8 }), 'illisible');
assert.equal(brokenImage({ bytes: 5000, w: 40, h: 40 }), 'trop petite');
assert.equal(brokenImage({ bytes: 5000, w: 1080, h: 1440 }), '');

let called = 0;
const tiny = await reviewSocialImage({ buf: Buffer.alloc(8), width: 4, height: 4, fallbackAlt: articleAlt(it), allowReject: true, env, fetchImpl: async () => { called++; return { ok: true, json: async () => ({}) }; } });
assert.equal(tiny.reject, true);
assert.equal(called, 0, 'image cassée : pas d’appel IA');
const quota = await reviewSocialImage({ buf: jpeg, width: 1080, height: 1440, contentType: 'image/jpeg', facts, fallbackAlt: articleAlt(it), allowReject: true, env, fetchImpl: async () => ({ ok: false, status: 429 }) });
assert.equal(quota.reject, false);
assert.match(quota.reason, /quota/);
assert.equal(quota.alt, articleAlt(it));
const off = await reviewSocialImage({ buf: jpeg, width: 800, height: 800, fallbackAlt: articleAlt(it), env: {} });
assert.equal(off.reject, false);
assert.match(off.reason, /désactivée/);

const model = { slot: { label: 'La une du soir', day: '2026-11-22' }, items: [{ title: it.bare, byline: 'Jeanne · Impact Campus' }] };
const alt = altText(model);
assert.match(alt, new RegExp(it.bare));
assert.doesNotMatch(alt, /Affiche de la bibliothèque/, 'le repli ne reprend pas une phrase inventée');
assert.ok(!readFileSync(new URL('../scripts/social/une-lib.mjs', import.meta.url), 'utf8').includes('ai-image'), 'les légendes ne chargent pas le module image');
assert.ok(!readFileSync(new URL('../scripts/social/mastodon-post.mjs', import.meta.url), 'utf8').includes('ai-image'), 'Mastodon reste sans IA');
console.log('social-ai-image : OK');

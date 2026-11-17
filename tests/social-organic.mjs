// Portée organique : français d'abord, lien selon le réseau, cadence, journal, Instagram désactivé.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildXText, xReplyText, frenchPost, withEnglishSeat, isEnglishItem, DAILY_SLOTS, xlen } from '../scripts/social/lib.mjs';
import { buildBskyText } from '../scripts/social/bluesky.mjs';
import { buildMastoText } from '../scripts/social/mastodon-post.mjs';
import { buildPageText, pageComment } from '../scripts/social/buffer-pages.mjs';
import { threadMetadata } from '../scripts/social/channels/x-buffer.mjs';
import { createInstagram, imageRequests, instagramEnabled } from '../scripts/social/channels/instagram.mjs';
import { makeEntry, appendEntry, summarize, pullEntry } from '../scripts/social/reach-log.mjs';
import { POLICY, networkEnabled } from '../scripts/social/policy.mjs';
import { frenchUneItems, byline } from '../scripts/social/une-lib.mjs';

const fr = { id: 'fr1', source: 'Le Délit', author: 'Jeanne Roy', title: 'Grève au campus', bare: 'Grève au campus', link: 'https://www.delitfrancais.com/2026/11/01/greve/', desc: 'Les associations étudiantes votent une grève de deux jours pour le climat.', lang: 'fr' };
const en = { id: 'en1', source: 'The Link', author: 'Colin', title: 'Clear bags: a remedy for composting?', bare: 'Clear bags: a remedy for composting?', link: 'https://thelinknewspaper.ca/article/1', desc: 'The city is far behind its composting target and students want a fix.', lang: 'en' };

assert.equal(frenchPost(fr).lang, 'fr');
assert.equal(frenchPost(en).lang, 'en');
assert.match(frenchPost(en).it.bare, /^La question que pose The Link, en anglais : « Clear bags/);
assert.equal(frenchPost(en).it.desc, '');

const xt = buildXText(fr, [], { credit: '' });
const reply = xReplyText(fr);
assert.doesNotMatch(xt, /https?:\/\//, xt);
assert.match(reply, /^Lire sur le Radar : https:\/\/le-radar\.ca\/article\/[0-9a-f]{16}\/$/);
assert.ok(xt.split('\n').pop().split(' ').length <= 2 && /#\p{L}/u.test(xt), xt);
assert.ok(xlen(xt) <= 280 && xlen(reply) <= 280);
assert.match(xt, /Les associations étudiantes votent/);
assert.doesNotMatch(xt, /#(Québec\s+){2}|#\S+ #\S+ #\S+/);

const xe = buildXText(en, [], { credit: '' });
assert.match(xe, /^La question que pose The Link/);
assert.doesNotMatch(xe, /https?:\/\/|composting target/);
assert.match(xReplyText(en), /le-radar\.ca\/article\//);

const bsky = buildBskyText(en, [], { credit: '', tags: false });
assert.match(bsky, /https:\/\/le-radar\.ca\/article\//, 'Bluesky garde le lien');
assert.match(bsky, /La question que pose The Link/);

const masto = buildMastoText(fr, [], { credit: '' });
assert.match(masto, /https:\/\/le-radar\.ca\/article\//);
const tags = masto.split('\n').filter(l => /^#/.test(l)).join(' ').split(/\s+/).filter(Boolean);
assert.ok(tags.length >= 1 && tags.length <= 4, tags.join(' '));

const pages = JSON.parse(fs.readFileSync(new URL('../data/social/buffer-pages.json', import.meta.url)));
const fb = buildPageText(en, pages.facebook, { credit: '' });
assert.doesNotMatch(fb, /https?:\/\//);
assert.match(pageComment(en, pages.facebook), /le-radar\.ca\/article\//);
assert.equal(pageComment(en, pages.linkedin), '');
const li = buildPageText(fr, pages.linkedin, { credit: '' });
assert.match(li, /https:\/\/le-radar\.ca\/article\//);

const meta = threadMetadata({ text: xt, reply, image: 'https://le-radar.ca/a.jpg' });
assert.equal(meta.twitter.thread[0].text, xt);
assert.equal(meta.twitter.thread[1].text, reply);
assert.equal(meta.twitter.thread[0].assets[0].image.url, 'https://le-radar.ca/a.jpg');
assert.equal(threadMetadata({ text: 'x' }), undefined);

const mins = DAILY_SLOTS.map(s => +s.slice(0, 2) * 60 + +s.slice(3));
assert.equal(DAILY_SLOTS.length, 5);
for (let i = 1; i < mins.length; i++) assert.ok(mins[i] - mins[i - 1] >= 120);
for (const une of [7 * 60 + 45, 19 * 60 + 30]) for (const m of mins) assert.ok(Math.abs(m - une) >= 90);

const pool = [fr, { ...fr, id: 'fr2', source: 'Impact Campus' }, en];
const seated = withEnglishSeat([fr], pool, 2);
assert.ok(seated.some(isEnglishItem) && seated.length === 2, 'place libre : un article anglais entre');
const full = withEnglishSeat([fr, pool[1]], pool, 2);
assert.equal(full.length, 2); assert.ok(!full.some(isEnglishItem), 'sélection pleine : on ne retire personne');
const two = withEnglishSeat([en, { ...en, id: 'en2', link: 'https://thelinknewspaper.ca/article/2' }], [{ ...en, id: 'en3', link: 'https://thelinknewspaper.ca/article/3' }], 3, 2);
assert.equal(two.length, 2, 'X : jamais un 3e article de la même source');
assert.deepEqual(withEnglishSeat([fr], [fr], 2), [fr]);

const log = appendEntry({ posts: [] }, makeEntry({ id: 'p1', network: 'x', type: 'une', lang: 'fr', image: true, at: '2026-11-17T15:00:00Z' }));
assert.equal(appendEntry(log, makeEntry({ id: 'p1', network: 'x', type: 'une', lang: 'fr', image: true })).posts.length, 1);
const sum = summarize(log);
assert.equal(sum.by.x.posts, 1); assert.equal(sum.by.x.image, 1); assert.equal(sum.by.x.fr, 1);

const pulled = await pullEntry({ network: 'bluesky', postId: 'at://did/app.bsky.feed.post/abc', id: 'abc' }, { fetchImpl: async () => ({ ok: true, json: async () => ({ posts: [{ likeCount: 3, repostCount: 1, replyCount: 0 }] }) }) });
assert.equal(pulled.metrics.likes, 3); assert.equal(pulled.metrics.views, null);
const xPull = await pullEntry({ network: 'x', id: '1', postId: '1' }, { fetchImpl: async () => { throw new Error('ne pas appeler'); } });
assert.equal(xPull.metrics, null); assert.match(xPull.metricsNote, /aucun accès payant/);

assert.equal(networkEnabled('facebook'), false, 'Facebook en pause');
assert.equal(networkEnabled('instagram', POLICY), false);
assert.equal(instagramEnabled(POLICY), false);
assert.deepEqual(frenchUneItems([
  { id: 'a', lang: 'fr', title: 'Grève au campus' },
  { id: 'b', lang: 'en', title: 'Stingers win the opener' },
  { id: 'c', lang: 'fr', title: 'À lire en anglais : « Clear bags »' },
]).map(x => x.id), ['a'], 'La une : ni anglais, ni annonce d’un article anglais');
assert.match(byline({ author: 'Jeanne Roy et Paul Martin', source: 'Le Délit' }), /Jeanne Roy et Paul Martin · Le Délit/);
assert.throws(() => createInstagram({}), /désactivé/);
assert.throws(() => createInstagram({ token: 't', userId: '1', policy: POLICY }), /désactivé/);
const reqs = imageRequests('123', { imageUrl: 'https://le-radar.ca/a.jpg', caption: 'La une' });
assert.equal(reqs[0].url, 'https://graph.facebook.com/v21.0/123/media');
assert.equal(reqs[0].body.image_url, 'https://le-radar.ca/a.jpg');
assert.equal(reqs[1].body.creation_id, '$creation_id');
assert.ok(!/createInstagram/.test(fs.readFileSync(new URL('../.github/workflows/social-une.yml', import.meta.url), 'utf8')));

console.log('\n--- exemples (essai, rien n’est publié) ---');
console.log('\nAVANT X (article français)\n' + buildXText(fr, [], { organic: false, credit: '' }));
console.log('\nAPRÈS X\n' + xt + '\n— réponse : ' + reply);
console.log('\nAVANT X (article anglais)\n' + buildXText(en, [], { organic: false, credit: '' }));
console.log('\nAPRÈS X\n' + xe + '\n— réponse : ' + xReplyText(en));
console.log('\nAPRÈS Bluesky (lien gardé)\n' + bsky);
console.log('social-organic : OK');

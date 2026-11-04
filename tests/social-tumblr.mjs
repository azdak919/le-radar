#!/usr/bin/env node
// Bot Tumblr : format, NPF (texte + image + lien cliquable), étiquettes, OAuth 1.0a, plafond.
import assert from 'node:assert/strict';
import { siteLink } from '../scripts/social/lib.mjs';
import { buildTumblrText, npfBody, tagsFor, linksInPosts } from '../scripts/social/tumblr.mjs';
import { oauthHeader } from '../scripts/social/channels/tumblr.mjs';
import { NETWORKS } from '../scripts/social/rate-limit.mjs';

const it = { id: 'a', source: 'Montréal Campus', author: 'Valentin Nucci', title: 'Quand la neurodiversité s’épanouit', bare: 'Quand la neurodiversité s’épanouit',
  link: 'https://montrealcampus.ca/2026/10/30/x/', desc: 'Fanny Groleau assure un poste d’assistante de cuisine au sein du Zera Café, une équipe de personnes neurodivergentes.' };
const t = buildTumblrText(it, [], { credit: 'Éloïse' });
const url = siteLink(it);
assert.equal(t, 'Quand la neurodiversité s’épanouit\n\nFanny Groleau assure un poste d’assistante de cuisine au sein du Zera Café, une équipe de personnes neurodivergentes.\n\nMontréal Campus · Valentin Nucci\n' + url + '\n📸 Éloïse');
const b = npfBody(it, t, { image: { url: 'https://ex.org/p.jpg', width: 1200, height: 800 } });
assert.deepEqual(b.content.map(c => c.type), ['text', 'image', 'text', 'text', 'text', 'text', 'link']);
assert.equal(b.content[0].subtype, 'heading2', 'titre en intertitre');
assert.equal(b.content[4].formatting[0].url, url, 'lien cliquable vers la fiche');
assert.equal(b.content[4].formatting[0].end, url.length);
assert.equal(b.content[1].media[0].url, 'https://ex.org/p.jpg');
assert.equal(b.content[5].text, '📸 Éloïse');
assert.equal(b.content[6].url, url); assert.equal(b.source_url, url);
assert.equal(npfBody(it, t).content.filter(c => c.type === 'image').length, 0, 'sans photo : pas de bloc image');
assert.deepEqual(tagsFor(it), ['québec', 'quebec', 'actualités', 'presse étudiante', 'montréal', 'montreal', 'journalisme étudiant', 'uqam', 'montréal campus', 'actualites', 'université']);
assert.deepEqual(tagsFor({ source: 'The Link' }, 'en'), ['student journalism', 'student newspaper', 'news', 'montréal', 'montreal', 'canada', 'quebec', 'concordia', 'the link', 'student press', 'university']);
assert(linksInPosts([{ content: [{ type: 'link', url: it.link }] }]).has(it.link));
// OAuth 1.0a : vecteur connu (RFC 5849 §1.2, requête GET photos)
const h = oauthHeader('GET', 'http://photos.example.net/photos?file=vacation.jpg&size=original', { ck: 'dpf43f3p2l4k3l03', cs: 'kd94hf93k423kf44', tk: 'nnch734d00sl2jdk', ts: 'pfkkdhi9sl3r4s00' }, { nonce: 'kllo9940pd9333jh', time: 1191242096 });
assert(h.includes('oauth_signature="tR3%2BTy81lMeYAr%2FFid0kMTYa%2FWM%3D"'), h);
assert.deepEqual([NETWORKS.tumblr.perHour, NETWORKS.tumblr.perDay, NETWORKS.tumblr.perRun], [8, 120, 3]);
assert(NETWORKS.tumblr.perDay < 250 && NETWORKS.tumblr.perDay * 4 < 5000, 'sous les quotas officiels');
console.log('social-tumblr : OK');

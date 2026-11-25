#!/usr/bin/env node
// Bot Tumblr : format, NPF (texte + image + lien cliquable), étiquettes, OAuth 1.0a, plafond.
import assert from 'node:assert/strict';
import { siteLink } from '../scripts/social/lib.mjs';
import { buildTumblrText, npfBody, tagsFor, linksInPosts, plain } from '../scripts/social/tumblr.mjs';
import { oauthHeader, createTumblr, isHaltStatus } from '../scripts/social/channels/tumblr.mjs';
import { NETWORKS } from '../scripts/social/rate-limit.mjs';

const it = { id: 'a', source: 'Montréal Campus', author: 'Valentin Nucci', title: 'Quand la neurodiversité s’épanouit', bare: 'Quand la neurodiversité s’épanouit',
  link: 'https://montrealcampus.ca/2026/10/30/x/', desc: 'Fanny Groleau assure un poste d’assistante de cuisine au sein du Zera Café, une équipe de personnes neurodivergentes.' };
const t = buildTumblrText(it, [], { credit: 'Éloïse' });
const url = siteLink(it);
assert.equal(t, 'Quand la neurodiversité s’épanouit\n\nFanny Groleau assure un poste d’assistante de cuisine au sein du Zera Café, une équipe de personnes neurodivergentes.\n\n📰 Montréal Campus · Valentin Nucci\n' + url + '\n📸 Éloïse');
const b = npfBody(it, t, { image: { url: 'https://ex.org/p.jpg', width: 1200, height: 800 } });
assert.deepEqual(b.content.map(c => c.type), ['text', 'image', 'text', 'text', 'text', 'text', 'link']);
assert.equal(b.content[0].subtype, 'heading2', 'titre en intertitre');
assert.equal(b.content[4].formatting[0].url, url, 'lien cliquable vers la fiche');
assert.equal(b.content[4].formatting[0].end, url.length);
assert.equal(b.content[1].media[0].url, 'https://ex.org/p.jpg');
assert.equal(b.content[5].text, '📸 Éloïse');
assert.equal(b.content[6].url, url); assert.equal(b.source_url, url);
assert.equal(npfBody(it, t).content.filter(c => c.type === 'image').length, 0, 'sans photo : pas de bloc image');
assert.equal(b.state, 'queue', 'file native de Tumblr par défaut, jamais de publication immédiate');
assert.equal(npfBody(it, t, { state: 'published' }).state, 'published');
assert.equal(plain('<p>Un <b>titre</b> &amp; l&#8217;extrait&nbsp;!</p>'), 'Un titre & l’extrait\u00a0!');
const h1 = npfBody({ ...it, desc: '<p>Résumé <em>propre</em>.</p>' }, 'Titre <i>x</i>\n\n<p>Résumé</p>');
assert(h1.content.every(c => !/<[a-z/]/i.test(c.text || '') && !/<[a-z/]/i.test(c.description || '')), 'aucune balise HTML dans les blocs');
assert.equal(h1.content.at(-1).description, 'Résumé propre.');
assert(h1.content[0].type === 'text' && h1.content.at(-1).type === 'link', 'texte d’abord, bloc lien en dernier');
assert.deepEqual(tagsFor(it), ['québec', 'quebec', 'actualités', 'presse étudiante', 'montréal', 'montreal', 'journalisme étudiant', 'uqam', 'montréal campus', 'actualites', 'université']);
assert.deepEqual(tagsFor({ source: 'The Link' }, 'en'), ['student journalism', 'student newspaper', 'news', 'montréal', 'montreal', 'canada', 'quebec', 'concordia', 'the link', 'student press', 'university']);
assert(linksInPosts([{ content: [{ type: 'link', url: it.link }] }]).has(it.link));
assert(linksInPosts([{ source_url: url }]).has(url), 'post en file (format ancien) : source_url compte');
// Client : 201 seul = créé ; 429/401/403 = arrêt ; file lue pour l'idempotence ; délai entre appels.
const fake = (routes, log = []) => async (u, o) => { log.push(o.method + ' ' + new URL(u).pathname); const [status, body] = routes(new URL(u).pathname, o.method); return { ok: status < 300, status, json: async () => body }; };
const waits = [];
let c = createTumblr({ ck: 'k', cs: 's', tk: 't', ts: 'u', blog: 'b.tumblr.com', gapMs: 4000, sleep: async ms => { waits.push(ms); },
  fetchImpl: fake((p, m) => m === 'POST' ? [201, { response: { id_string: '9' } }] : p.endsWith('/queue') ? [200, { response: { posts: [{ content: [{ type: 'link', url: 'https://q/1' }] }] } }] : [200, { response: { posts: [] } }]) });
assert((await c.recentLinks()).has('https://q/1'), 'liens déjà en file reconnus');
const ok = await c.post({ content: [] }); assert.deepEqual([ok.id, ok.status, ok.created], ['9', 201, true]);
assert(waits.length === 2 && waits.every(w => w > 0 && w <= 4000), 'délai entre appels consécutifs');
c = createTumblr({ ck: 'k', cs: 's', tk: 't', ts: 'u', blog: 'b', fetchImpl: fake(() => [200, { response: { id: 5 } }]) });
assert.equal((await c.post({})).created, false, '200 sans 201 : pas noté');
for (const st of [429, 401, 403]) {
  c = createTumblr({ ck: 'k', cs: 's', tk: 't', ts: 'u', blog: 'b', fetchImpl: fake(() => [st, { meta: { status: st } }]) });
  await assert.rejects(c.post({}), e => e.status === st && isHaltStatus(e.status));
}
assert(!isHaltStatus(500));
c = createTumblr({ ck: 'k', cs: 's', tk: 't', ts: 'u', blog: 'b', fetchImpl: fake(p => p.endsWith('/queue') ? [400, {}] : [200, { response: { posts: [] } }]) });
assert.equal((await c.recentLinks()).size, 0, 'file illisible (400) : avertissement, pas d’arrêt');
// OAuth 1.0a : vecteur connu (RFC 5849 §1.2, requête GET photos)
const h = oauthHeader('GET', 'http://photos.example.net/photos?file=vacation.jpg&size=original', { ck: 'dpf43f3p2l4k3l03', cs: 'kd94hf93k423kf44', tk: 'nnch734d00sl2jdk', ts: 'pfkkdhi9sl3r4s00' }, { nonce: 'kllo9940pd9333jh', time: 1191242096 });
assert(h.includes('oauth_signature="tR3%2BTy81lMeYAr%2FFid0kMTYa%2FWM%3D"'), h);
assert.deepEqual([NETWORKS.tumblr.perHour, NETWORKS.tumblr.perDay, NETWORKS.tumblr.perRun], [8, 120, 3]);
assert(NETWORKS.tumblr.perDay < 250 && NETWORKS.tumblr.perDay * 4 < 5000, 'sous les quotas officiels');
console.log('social-tumblr : OK');

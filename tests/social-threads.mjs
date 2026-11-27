// Threads @le.radar.ca via Buffer (data/social/buffer-pages.json → threads) : format, sujet, métadonnées, interrupteur.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import privacyGuard from '../scripts/privacy-guard.js';
import { buildThreadsText, threadsLen, threadsTopic, postMetadata, THREADS_LIMIT, THREADS_DEFAULT_TOPIC, dayCap } from '../scripts/social/buffer-pages.mjs';
import { weightAt } from '../scripts/social/schedule.mjs';
import { matchChannel } from '../scripts/social/channels/x-buffer.mjs';

const CFG = JSON.parse(fs.readFileSync(new URL('../data/social/buffer-pages.json', import.meta.url)));
import { pageConfig } from '../scripts/social/networks/index.mjs';
const th = pageConfig('threads', CFG);

// Interrupteur : éteint, sur le compte Buffer d'Instagram, sans image, sans plafond de volume partagé.
assert.equal(th.enabled, true, 'Threads allumé (25 novembre 2026)');
assert.match(th.liveSince, /^2026-11-26T/, 'rodage depuis l’activation');
assert.equal(th.secret, 'BUFFER_INSTAGRAM_API_KEY');
assert.equal(th.service, 'threads');
assert.equal(th.image, false);
assert.ok(th.perDay <= 2, 'montée lente : 2 par jour au plus');
assert.ok(th.limit <= THREADS_LIMIT);
// Les Pages existantes ne changent pas.
assert.equal(CFG.facebook.enabled, undefined);
assert.equal(CFG.linkedin.enabled, undefined);
assert.deepEqual(postMetadata('facebook'), { facebook: { type: 'post' } });
assert.equal(postMetadata('linkedin'), undefined);

// Canal Buffer : service « threads », nom du compte.
assert.ok(matchChannel({ service: 'threads', name: 'le.radar.ca' }, 'threads', th.name));
assert.ok(!matchChannel({ service: 'instagram', name: 'le.radar.ca' }, 'threads', th.name), 'jamais le canal Instagram');

// Longueur : émoji = octets UTF-8 (Meta), lettre accentuée = 1.
assert.equal(threadsLen('é'), 1);
assert.equal(threadsLen('📰'), 4);
assert.equal(threadsLen('Allo 📰 é'), 11);

// Sujet : un seul, 1-50 caractères, sans « . » ni « & ».
assert.equal(threadsTopic({ title: 'Grève des professeurs à McGill', source: 'The McGill Daily' }), 'McGill');
assert.equal(threadsTopic({ title: 'Un titre sans établissement', source: 'Inconnu' }), THREADS_DEFAULT_TOPIC);
for (const it of [{ title: 'UdeM et HEC', source: 'Quartier Libre' }, { title: 'x', source: 'Le Délit' }]) {
  const t = threadsTopic(it);
  assert.ok(t.length >= 1 && t.length <= 50 && !/[.&]/.test(t), `sujet valide : ${t}`);
}
assert.deepEqual(postMetadata('threads', { title: 'Grève à McGill', source: 'The McGill Daily' }), { threads: { type: 'post', topic: 'McGill' } });

// Texte : ≤ 500, lien vers la fiche le-radar.ca, ni hashtag, ni @, ni crédit photo, même avec un long extrait.
const it = {
  id: 'abc', link: 'https://www.mcgilldaily.com/2026/11/greve/', source: 'The McGill Daily', author: 'Sonia Berman',
  title: 'L’Association des professeurs de la Faculté des arts de McGill confirme une grève',
  desc: 'Les membres ont voté à 87 % pour un mandat de grève. '.repeat(30) + ' @quelquun',
  pubDate: new Date().toUTCString(),
};
const text = buildThreadsText(it, th, { ai: false });
assert.ok(text, 'texte produit');
assert.ok(threadsLen(text) <= THREADS_LIMIT, `≤ 500 (${threadsLen(text)})`);
assert.match(text, /https:\/\/le-radar\.ca\/article\//, 'lien vers la fiche (carte d’aperçu)');
assert.equal((text.match(/https?:\/\//g) || []).length, 1, 'un seul lien : il devient la carte');
assert.doesNotMatch(text, /(^|\s)#\p{L}/u, 'aucun hashtag : le sujet passe par les métadonnées');
assert.doesNotMatch(text, /(^|[\s(])@\w/, 'aucun @');
assert.doesNotMatch(text, /📸/, 'aucun crédit photo : pas d’image jointe');
assert.ok(!privacyGuard.containsForbiddenName(text));

// Fenêtres : rien la nuit, pointe en soirée ; rodage depuis l’activation (liveSince nul = jour 0).
const T = s => Date.parse(s);
assert.equal(weightAt('threads', T('2026-11-26T08:00:00Z')), 0, 'jeudi 3 h : calme');
assert.equal(weightAt('threads', T('2026-11-27T00:30:00Z')), 1, 'jeudi 19 h 30 : pointe');
assert.ok(dayCap(th, 'threads', T('2026-11-26T22:00:00Z')) <= 1, 'premiers jours : au plus 1 par jour');
// Mécanisme de rodage vérifié à 2 par jour ; en vigueur (27 nov., Charles) : 0 article un à un, la une et la revue le remplacent.
assert.equal(dayCap({ ...th, perDay: 2 }, 'threads', T('2026-12-05T22:00:00Z')), 2, 'après le rodage : 2 par jour (mécanisme)');
assert.equal(dayCap(th, 'threads', T('2026-12-05T22:00:00Z')), 0, 'Threads : plus d’articles un à un');

console.log('social-threads : OK');

#!/usr/bin/env node
// Bot social (Buffer/X) : format, longueur, variété, mentions, dédoublonnage, image, auth.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseFeed, markImages, buildText, selectItems, xlen, mentionHead, unknownAccounts, stripUtm, slotsToday } from '../scripts/social/lib.mjs';
import { isAuthFailure } from '../scripts/social/channels/x-buffer.mjs';
import { BAD } from '../scripts/social/image-resolve.mjs';

const now = Date.parse('2026-11-01T05:00:00Z');
const iso = h => new Date(now - h * 3600e3).toUTCString();
const item = (src, i, h, extra = '') => `<item><title>${src} – Auteur ${i} : Titre ${i} de ${src}</title><link>https://ex.org/${encodeURIComponent(src)}/${i}?utm_source=x&amp;id=${i}</link>
<guid>g-${src}-${i}</guid><pubDate>${iso(h)}</pubDate><dc:creator>Auteur ${i}</dc:creator><source url="https://ex.org">${src}</source>
<description><![CDATA[<p>${'Un long extrait de l’article qui raconte beaucoup de choses intéressantes. '.repeat(8)} Pour lire la suite, cliquer ici.</p>]]></description>${extra}</item>`;
const srcs = ['The Link', 'Le Délit', 'The Campus', "L'Exemplaire", 'Le Polyscope'];
let xml = '<rss><channel>';
srcs.forEach((s, k) => { for (let i = 0; i < 5; i++) xml += item(s, i, k + i * 3, `<enclosure url="https://img.ex.org/${k}-${i}.jpg" type="image/jpeg"/>`); });
xml += item('Vieux', 0, 100);
xml += item('Quartier Libre', 1, 1, '<enclosure url="https://img.ex.org/cinq-nouvelles.jpg" type="image/jpeg"/>');
xml += item('The Link', 9, 2, '<enclosure url="https://live.staticflickr.com/1/2_ab.jpg" type="image/jpeg"/>');
xml += '</channel></rss>';
const items = parseFeed(xml);
const accounts = JSON.parse(fs.readFileSync(new URL('../data/social/x-accounts.json', import.meta.url))).accounts;

// utm retirés, paramètres utiles gardés
assert.equal(stripUtm('https://a.b/c?utm_source=x&id=3'), 'https://a.b/c?id=3');
assert(items.every(i => !/utm_/.test(i.link)));

// format + longueur + phrases parasites
for (const it of items) {
  const t = buildText(it, accounts);
  assert(xlen(t) <= 275, `trop long : ${xlen(t)}`);
  assert(t.endsWith('\n' + it.link), 'lien en fin');
  assert(!/cliquer ici|lire la suite/i.test(t), 'phrase parasite retirée');
  assert(/…\n/.test(t), 'extrait coupé avec …');
}
assert.equal(xlen('a https://x.org/' + 'z'.repeat(200)), 2 + 23);

// mentions exactes seulement
const link0 = items.find(i => i.source === 'The Link');
assert(mentionHead(link0, accounts).startsWith('@Linknewspaper – '));
assert(mentionHead(items.find(i => i.source === "L'Exemplaire"), accounts).startsWith('@lexemplaire – '));
assert(mentionHead(items.find(i => i.source === 'Le Polyscope'), accounts).startsWith('@Polyscope – '));
assert.equal(mentionHead({ ...link0, source: 'The Link Bis', title: 'The Link Bis – A : T' }, accounts), 'The Link Bis – A : T');
assert(mentionHead({ ...link0, author: 'Jo Doe', title: 'The Link – Jo Doe: T' }, [...accounts, { handle: '@jodoe', type: 'auteur', cle_flux: 'Jo Doe' }]).includes('– @jodoe:'));
for (const a of accounts) assert(/^@\w{1,15}$/.test(a.handle), `handle invalide ${a.handle}`);

// variété : ≤ 2 par source, 10 max, ≤ 72 h, file existante comptée
const sel = selectItems(items, { now });
assert.equal(sel.length, 10);
const c = s => s.reduce((m, i) => m.set(i.source, (m.get(i.source) || 0) + 1), new Map());
assert(Math.max(...c(sel).values()) <= 2);
assert(c(sel).size >= 5);
assert(!sel.some(i => i.source === 'Vieux'), '> 72 h exclu');
const sel2 = selectItems(items, { now, queuedSources: ['The Link', 'The Link'], slots: 3 });
assert(!sel2.some(i => i.source === 'The Link'), 'source déjà 2× en file');
assert.equal(sel2.length, 3);

// dédoublonnage
const sent = new Set(sel.map(i => i.id));
const again = selectItems(items, { now, sentIds: sent });
assert(!again.some(i => sent.has(i.id)));

// images
markImages(items);
assert.equal(items.find(i => i.source === 'Quartier Libre').imgDropped, 'récurrent');
assert.equal(items.find(i => /flickr/.test(i.img)).imgDropped, 'flickr');
assert.equal(items.find(i => i.img === 'https://img.ex.org/0-0.jpg').imgDropped, null);
assert(BAD.test('https://x.org/wp-content/uploads/logo.png') && !BAD.test('https://x.org/photo-campus.jpg'));

// auth Buffer
assert(isAuthFailure(401, null));
assert(isAuthFailure(200, { errors: [{ message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } }] }));
assert(!isAuthFailure(200, { data: {} }));
assert(!isAuthFailure(200, { errors: [{ message: 'no', extensions: { code: 'FORBIDDEN' } }] }), 'FORBIDDEN ≠ clé invalide');

// rapport comptes
const u = unknownAccounts(items, accounts);
assert(u.sources.includes('Vieux') && !u.sources.includes('The Link'));

// état versionné valide
assert.equal(typeof JSON.parse(fs.readFileSync(new URL('../data/buffer-sent.json', import.meta.url))).sent, 'object');
// créneaux du jour (1er nov. 2026 : fin de l'heure avancée à 2 h)
const dz = slotsToday(['00:30', '07:30', '21:30'], { now: Date.parse('2026-11-01T05:23:00Z') });
assert.deepEqual(dz, ['2026-11-01T12:30:00.000Z', '2026-11-02T02:30:00.000Z']);
console.log('social-buffer: ok');

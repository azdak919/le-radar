#!/usr/bin/env node
// Bot social (Buffer/X) : format, longueur, variété, mentions, dédoublonnage, image, auth.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseFeed, markImages, buildText, selectItems, xlen, mentionHead, unknownAccounts, stripUtm, slotsToday, selectDaily, freeSlots, quality, DAILY_SLOTS } from '../scripts/social/lib.mjs';
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
  assert.equal(t.split('\n').length, 2, 'titre : extrait, puis lien');
  assert(/^\S.* • Auteur \d • Titre \d de .+ : Un long/.test(t), '« Média • Auteur • Titre : extrait »');
}
assert.equal(xlen('a https://x.org/' + 'z'.repeat(200)), 2 + 23);

// mentions exactes seulement
const link0 = items.find(i => i.source === 'The Link');
assert(mentionHead(link0, accounts).startsWith('@Linknewspaper • Auteur '));
assert(mentionHead(items.find(i => i.source === "L'Exemplaire"), accounts).startsWith('@lexemplaire • '));
assert(mentionHead(items.find(i => i.source === 'Le Polyscope'), accounts).startsWith('@Polyscope • '));
assert.equal(mentionHead({ ...link0, source: 'The Link Bis', author: 'A', bare: 'T' }, accounts), 'The Link Bis • A • T');
assert.equal(mentionHead({ ...link0, author: '', bare: 'T' }, accounts), '@Linknewspaper • T', 'sans auteur');
assert.equal(mentionHead({ ...link0, author: 'The Link', bare: 'T' }, accounts), '@Linknewspaper • T', 'auteur = média');
assert(mentionHead({ ...link0, author: 'Jo Doe', bare: 'T' }, [...accounts, { handle: '@jodoe', type: 'auteur', cle_flux: 'Jo Doe' }]) === '@Linknewspaper • @jodoe • T');
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

// ── nocturne : veille Toronto, élargissement 72 h, classement, créneaux, DST ──
{
  const run = Date.parse('2026-11-01T08:07:00Z'); // 3 h 07 HNE le 1er nov.
  const mk = (src, i, isoDate, { img = true, ex = true } = {}) => `<item><title>${src} – A${i} : T${i}</title><link>https://ex.org/${src}/${i}</link><guid>d-${src}-${i}</guid>
<pubDate>${new Date(isoDate).toUTCString()}</pubDate><source url="https://ex.org">${src}</source><description><![CDATA[${ex ? 'Un extrait vraiment substantiel qui dépasse largement les quatre-vingts caractères demandés ici. ' : ''}]]></description>${img ? `<enclosure url="https://img.ex.org/${src}${i}.jpg" type="image/jpeg"/>` : ''}</item>`;
  let x = '<rss><channel>';
  // 31 oct. Toronto = 04:00Z 31 oct → 04:00Z 1er nov (HAE)
  for (const [k, s] of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].entries()) for (let i = 0; i < 3; i++) x += mk(s, i, Date.parse('2026-10-31T13:00:00Z') + (k * 2 + i) * 3600e3, { img: i !== 0, ex: true });
  x += mk('Tard', 0, '2026-11-01T03:30:00Z');   // 23 h 30 HAE le 31 → veille
  x += mk('Avant', 0, '2026-10-30T15:00:00Z');  // 30 oct → hors veille
  x += mk('Auj', 0, '2026-11-01T06:00:00Z');    // 1er nov → hors veille
  x += '</channel></rss>';
  const its = parseFeed(x); markImages(its);
  const d = selectDaily(its, { now: run, accounts });
  assert.equal(d.length, 10);
  assert(d.every(i => !['Avant', 'Auj'].includes(i.source)), 'veille seulement');
  assert(d.some(i => i.source === 'Tard'), '23 h 30 HAE = veille');
  assert(Math.max(...c(d).values()) <= 2);
  assert(d.filter(i => i.source !== 'Tard').every(i => i.img && quality(i) >= 6), 'photo réelle d’abord');
  assert.equal(c(d).size, 7, 'variété avant 2e article');
  // file existante : S1 déjà 2×, éléments envoyés exclus
  const d2 = selectDaily(its, { now: run, queuedSources: ['S1', 'S1'], sentIds: new Set(d.map(i => i.id)), slots: 4 });
  assert(!d2.some(i => i.source === 'S1' || d.includes(i)));
  // < slots candidats la veille → élargit à 72 h (inclut 30 oct.)
  const few = parseFeed('<rss>' + mk('S1', 0, '2026-10-31T15:00:00Z') + mk('Avant', 0, '2026-10-30T15:00:00Z') + mk('Vieux', 0, '2026-10-27T15:00:00Z') + '</rss>');
  const d3 = selectDaily(few, { now: run });
  assert.deepEqual(d3.map(i => i.source).sort(), ['Avant', 'S1']);
  // créneaux : 10 fixes en HNE le 1er nov., 07:30 HNE = 12:30Z ; pris → retirés
  const z = slotsToday(DAILY_SLOTS, { now: run });
  assert.equal(z.length, 10); assert.equal(z[0], '2026-11-01T12:30:00.000Z'); assert.equal(z[9], '2026-11-02T02:30:00.000Z');
  assert.deepEqual(freeSlots(z, ['2026-11-01T12:30:00.000Z', '2026-11-01T14:00:00Z']).length, 8);
  // été (HAE) : 07:30 = 11:30Z ; créneaux passés ignorés
  assert.equal(slotsToday(['07:30'], { now: Date.parse('2026-07-01T08:07:00Z') })[0], '2026-07-01T11:30:00.000Z');
  assert.equal(slotsToday(DAILY_SLOTS, { now: Date.parse('2026-11-01T18:00:00Z') }).length, 5);
  // veille correcte au passage à l'heure avancée (8 mars 2026)
  const sp = parseFeed('<rss>' + mk('P', 0, '2026-03-07T20:00:00Z') + mk('Q', 0, '2026-03-08T20:00:00Z') + '</rss>');
  assert.deepEqual(selectDaily(sp, { now: Date.parse('2026-03-09T08:07:00Z'), slots: 1 }).map(i => i.source), ['Q']);
}
// format titre/extrait
{
  const { joinHead, isEnglish, bulletHead } = await import('../scripts/social/lib.mjs');
  assert.equal(joinHead('Le Délit – A : Titre', 'Extrait'), 'Le Délit – A : Titre : Extrait');
  assert.equal(joinHead('The Link – A: Title', 'Excerpt'), 'The Link – A: Title: Excerpt');
  assert.equal(joinHead('X – A : Vraiment ?', 'Ex'), 'X – A : Vraiment ? Ex');
  assert.equal(joinHead('X – A: Wow!', 'Ex'), 'X – A: Wow! Ex');
  assert.equal(joinHead('X – A : Suite…', 'Ex'), 'X – A : Suite… Ex');
  assert(isEnglish('The Link – A: T') && !isEnglish('Le Délit – A : T'));
  assert.equal(bulletHead('@Linknewspaper – Sana Paracha: Cinema Politica'), '@Linknewspaper • Sana Paracha • Cinema Politica');
  assert.equal(bulletHead('@quartierlibre – S G : Jeu : un rêve'), '@quartierlibre • S G • Jeu : un rêve');
  assert.equal(joinHead('@Linknewspaper • Sana Paracha • Cinema Politica', 'Ex', true), '@Linknewspaper • Sana Paracha • Cinema Politica: Ex');
}
console.log('social-buffer: ok');

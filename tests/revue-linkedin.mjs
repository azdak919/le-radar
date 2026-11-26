// Carrousel LinkedIn d'une revue (scripts/revue/revue-linkedin.js) : pages, contenu, échappement.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { renderLinkedInCarousel, MAX_ARTICLES, W, H } = createRequire(import.meta.url)('../scripts/revue/revue-linkedin.js');

const model = JSON.parse(fs.readFileSync(new URL('../data/revue/reviews/2026-11-25-soir.json', import.meta.url), 'utf8'));
const html = renderLinkedInCarousel(model);
const pages = html.match(/<section class="li-page/g) || [];
assert.equal(pages.length, 1 + Math.min(MAX_ARTICLES, model.items.length) + 1, 'couverture + articles + page finale');
assert.match(html, new RegExp(`size: ${W}px ${H}px`), 'pages 4:5 1080 × 1350');
assert.equal(W / H, 0.8);
assert.match(html, /La revue du soir/); assert.match(html, /mercredi 25 novembre 2026/);
assert.match(html, /<p class="li-url">le-radar\.ca\/revue<\/p>/, 'page finale : lien vers la page des revues');
assert.doesNotMatch(html, /li-url">[^<]*2026-11-25/, 'pas le lien de l’édition');
// Crédits en pied sur chaque page, comme les images des réseaux (copyleft = « © » retourné, jamais 🄯).
assert.equal((html.match(/class="li-credits/g) || []).length, pages.length, 'crédits sur chaque page');
assert.match(html, /Articles et photos crédités à leurs auteurs et à leurs médias d’origine\./);
assert.match(html, /Mise en page <span class="li-cl"[^>]*>©<\/span>\u00A0Azdak CC BY 4\.0\./);
assert.doesNotMatch(html, /🄯/);
for (const it of model.items.slice(0, MAX_ARTICLES)) assert.ok(html.includes(it.source), `média ${it.source}`);
assert.doesNotMatch(html, /undefined|NaN|\[object/);
// Échappement : un titre avec < et & ne casse pas le HTML.
const evil = renderLinkedInCarousel({ ...model, items: [{ ...model.items[0], title: 'A <b>gras</b> & co' }] });
assert.ok(evil.includes('A &lt;b&gt;gras&lt;/b&gt; &amp; co'));
// Sans image : la page article passe en mise en page sans photo.
const noimg = renderLinkedInCarousel({ ...model, image: null, items: [{ ...model.items[0], image: '' }] });
assert.match(noimg, /li-article--noimg/);
// Une LinkedIn : carrousel du créneau s'il est en ligne, sinon rien (image habituelle).
{
  const { linkedinCarousel } = await import('../scripts/social/une-run.mjs');
  const ok = async () => ({ ok: true }), ko = async () => ({ ok: false });
  const d = await linkedinCarousel('2026-11-25:soir', { fetchImpl: ok });
  assert.equal(d.url, 'https://le-radar.ca/revue/2026-11-25-soir/le-radar-revue-2026-11-25-soir-linkedin.pdf');
  assert.equal(d.thumbnailUrl, 'https://le-radar.ca/revue/2026-11-25-soir/linkedin-cover.jpg');
  assert.match(d.title, /La revue du soir du Radar · mercredi 25 novembre/);
  assert.equal(await linkedinCarousel('2026-11-25:soir', { fetchImpl: ko }), null, 'PDF pas encore en ligne');
  assert.equal(await linkedinCarousel('n’importe quoi', { fetchImpl: ok }), null);
}
// Buffer : le document part comme DocumentAssetInput (url, title, thumbnailUrl), sans image.
{
  const { createXBuffer } = await import('../scripts/social/channels/x-buffer.mjs');
  let sent = null;
  const fetchImpl = async (_u, o) => {
    const b = JSON.parse(o.body);
    if (/createPost/.test(b.query)) { sent = b.variables.i; return { ok: true, status: 200, json: async () => ({ data: { createPost: { post: { id: 'p1', dueAt: null, status: 'sent' } } } }) }; }
    if (/organizations/.test(b.query)) return { ok: true, status: 200, json: async () => ({ data: { account: { organizations: [{ id: 'o1', name: 'LE-RADAR' }] } } }) };
    if (/channels/.test(b.query)) return { ok: true, status: 200, json: async () => ({ data: { channels: [{ id: 'chan', name: 'le-radar-ca', service: 'linkedin' }] } }) };
    return { ok: true, status: 200, json: async () => ({ data: {} }) };
  };
  const ch = createXBuffer({ key: 'k', fetchImpl, service: 'linkedin', channelName: 'le-radar-ca', fallbackId: 'chan' });
  await ch.add({ text: 't', now: true, image: 'https://img.jpg', document: { url: 'https://d.pdf', title: 'Titre', thumbnailUrl: 'https://t.jpg' } });
  assert.deepEqual(sent.assets, [{ document: { url: 'https://d.pdf', title: 'Titre', thumbnailUrl: 'https://t.jpg' } }], 'document seul, jamais avec l’image');
}
// Textes alternatifs : un par page, dans l'ordre (images du carrousel Facebook et Instagram).
{
  const { carouselAlts } = createRequire(import.meta.url)('../scripts/revue/revue-linkedin.js');
  const alts = carouselAlts(model);
  assert.equal(alts.length, pages.length, 'un texte alternatif par page');
  assert.match(alts[0], /^Couverture : La revue du soir du Radar, mercredi 25 novembre 2026\./);
  assert.ok(alts[1].includes(model.items[0].title));
  assert.match(alts.at(-1), /le-radar\.ca\/revue\.$/);
  for (const a of alts) assert.doesNotMatch(a, /undefined|NaN|\s{2}/);
}
// Carrousel Facebook / Instagram : carrousel.json + images en ligne, sinon rien (image habituelle).
{
  const { revueCarousel } = await import('../scripts/social/une-run.mjs');
  const manifest = { pages: [{ file: 'carrousel-1.jpg', alt: 'Couverture' }, { file: 'carrousel-2.jpg', alt: 'Article 1' }, { file: '../x.jpg', alt: 'piège' }] };
  const net = (missing = '') => async (u, o = {}) => (u.endsWith('carrousel.json') ? { ok: !missing.includes('json'), json: async () => manifest } : { ok: !(missing && u.endsWith(missing)) });
  const c = await revueCarousel('2026-11-25:soir', { fetchImpl: net() });
  assert.deepEqual(c, [
    { url: 'https://le-radar.ca/revue/2026-11-25-soir/carrousel-1.jpg', alt: 'Couverture' },
    { url: 'https://le-radar.ca/revue/2026-11-25-soir/carrousel-2.jpg', alt: 'Article 1' },
  ], 'fichiers hors gabarit ignorés');
  assert.equal(await revueCarousel('2026-11-25:soir', { fetchImpl: net('json') }), null, 'carrousel.json absent');
  assert.equal(await revueCarousel('2026-11-25:soir', { fetchImpl: net('carrousel-2.jpg') }), null, 'une image manquante');
  assert.equal(await revueCarousel('2026-11-25:jourdematch', { fetchImpl: net() }), null, 'Jour de match : pas de revue');
}
// Buffer : plusieurs images → une asset image par page, avec texte alternatif.
{
  const { createXBuffer } = await import('../scripts/social/channels/x-buffer.mjs');
  let sent = null;
  const fetchImpl = async (_u, o) => {
    const b = JSON.parse(o.body);
    if (/createPost/.test(b.query)) { sent = b.variables.i; return { ok: true, status: 200, json: async () => ({ data: { createPost: { post: { id: 'p2', dueAt: null, status: 'sent' } } } }) }; }
    if (/organizations/.test(b.query)) return { ok: true, status: 200, json: async () => ({ data: { account: { organizations: [{ id: 'o1', name: 'LE-RADAR' }] } } }) };
    if (/channels/.test(b.query)) return { ok: true, status: 200, json: async () => ({ data: { channels: [{ id: 'fb', name: 'LE-RADAR.ca', service: 'facebook' }] } }) };
    return { ok: true, status: 200, json: async () => ({ data: {} }) };
  };
  const ch = createXBuffer({ key: 'k', fetchImpl, service: 'facebook', channelName: 'LE-RADAR.ca', fallbackId: 'fb' });
  const imgs = Array.from({ length: 12 }, (_, i) => ({ url: `https://x/${i}.jpg`, alt: `p${i}` }));
  await ch.add({ text: 't', now: true, images: imgs });
  assert.equal(sent.assets.length, 10, '10 images au plus');
  assert.deepEqual(sent.assets[0], { image: { url: 'https://x/0.jpg', metadata: { altText: 'p0' } } });
}
console.log('revue-linkedin : OK');

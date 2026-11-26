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
assert.match(html, /<p class="li-url">le-radar\.ca\/revues<\/p>/, 'page finale : lien vers la page des revues');
assert.doesNotMatch(html, /li-url">[^<]*2026-11-25/, 'pas le lien de l’édition');
// Crédits en pied sur chaque page, comme les images des réseaux (copyleft = « © » retourné, jamais 🄯).
assert.equal((html.match(/class="li-credits/g) || []).length, pages.length, 'crédits sur chaque page');
assert.match(html, /Articles et photos crédités à leurs auteurs et à leurs médias d’origine\./);
assert.match(html, /Mise en page <span class="li-cl"[^>]*>©<\/span>\u00A0Azdak CC BY 4\.0\./);
assert.doesNotMatch(html, /🄯/);
for (const it of model.items.slice(0, MAX_ARTICLES)) assert.ok(html.includes(it.source), `média ${it.source}`);
assert.doesNotMatch(html, /undefined|NaN|\[object/);
// Marque : logo + nom en serif sur chaque page (couverture en grand, pages intérieures en petit), jamais en texte simple.
assert.equal((html.match(/class="li-brand(-sm)?"><img src="\/assets\/icon-512\.png"/g) || []).length, pages.length, 'logo sur chaque page');
assert.doesNotMatch(html, /<span class="li-brand-sm">LE-RADAR/, 'pas de marque en texte simple');
// Radios : « FM » après la fréquence, comme La une ; AM inchangé.
// Sport : sport et équipes, puis date, heure et lieu sur une 2e ligne ; sans salle connue : « Chez les … » (équipe locale).
{
  const g = { emoji: '🏀', sport: 'Basketball (F)', kind: 'avenir', verb: 'visite', when: 'jeu. 26 nov. · 18 h', teams: [{ name: 'Citadins', inst: 'UQAM' }, { name: 'Gaiters', inst: 'Bishop’s' }] };
  const h1 = renderLinkedInCarousel({ ...model, sports: { results: [], next: [g] } });
  assert.match(h1, /<span class="li-l1">🏀 Basketball \(F\) · Citadins \(UQAM\) vs Gaiters \(Bishop’s\)<\/span><span class="li-l2">jeu\. 26 nov\. · 18 h · Chez les Gaiters<\/span>/);
  assert.match(h1, /Calendrier : RSEQ\./);
  const h2 = renderLinkedInCarousel({ ...model, sports: { results: [], next: [{ ...g, venue: 'Centre sportif Bishop’s' }] } });
  assert.match(h2, /<span class="li-l2">jeu\. 26 nov\. · 18 h · Chez les Gaiters · Centre sportif Bishop’s<\/span>/);
  assert.match(h2, /Calendrier et salles : RSEQ\./);
  const { withVenues } = await import('../scripts/revue/revue-social-pick.mjs');
  const id = '91669338-645a-4ef0-8c47-d678db17ce23';
  const v = await withVenues({ sports: { results: [], next: [{ ...g, gameId: id }, { ...g }] } }, { fetchImpl: async (u) => ({ ok: true, json: async () => ({ SportFacilityDescription: u.includes(id) ? 'Gymnase  Bishop’s' : '' }) }) });
  assert.deepEqual(v.sports.next.map((x) => x.venue), ['Gymnase Bishop’s', undefined], 'salle RSEQ ; sans identifiant : pas d’appel');
  const off = await withVenues({ sports: { next: [{ ...g, gameId: id }] } }, { fetchImpl: async () => { throw new Error('hors ligne'); } });
  assert.equal(off.sports.next[0].venue, '', 'RSEQ injoignable : rien');
}
assert.match(html, /<b>CHYZ 94,3 FM<\/b>/); assert.match(html, /<b>CKUT 90,3 FM<\/b>/); assert.match(html, /<b>CJLO 1690AM<\/b>/);
{
  const { fmLabel } = await import('../scripts/social/une-lib.mjs');
  for (const n of ['CHYZ 94,3', 'CJLO 1690AM', 'CISM 89,3', 'Radio X']) assert.ok(html.includes(fmLabel(n)) || !html.includes(n), `même règle que La une : ${n}`);
}
// Échappement : un titre avec < et & ne casse pas le HTML.
const evil = renderLinkedInCarousel({ ...model, items: [{ ...model.items[0], title: 'A <b>gras</b> & co' }] });
assert.ok(evil.includes('A &lt;b&gt;gras&lt;/b&gt; &amp; co'));
// Sans image : la page article passe en mise en page sans photo.
const noimg = renderLinkedInCarousel({ ...model, image: null, items: [{ ...model.items[0], image: '' }] });
assert.match(noimg, /li-article--noimg/);
// Carrousel LinkedIn : PDF de l’édition s’il est en ligne, sinon rien.
{
  const { linkedinCarousel } = await import('../scripts/social/revue-carousel.mjs');
  const ok = async () => ({ ok: true }), ko = async () => ({ ok: false });
  const d = await linkedinCarousel('2026-11-25:soir', { fetchImpl: ok });
  assert.equal(d.url, 'https://le-radar.ca/revues/2026-11-25-soir/le-radar-revue-2026-11-25-soir-linkedin.pdf');
  assert.equal(d.thumbnailUrl, 'https://le-radar.ca/revues/2026-11-25-soir/linkedin-cover.jpg');
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
  assert.match(alts.at(-1), /le-radar\.ca\/revues\.$/);
  for (const a of alts) assert.doesNotMatch(a, /undefined|NaN|\s{2}/);
}
// Carrousel Facebook / Instagram : carrousel.json + images en ligne, sinon rien.
{
  const { revueCarousel } = await import('../scripts/social/revue-carousel.mjs');
  const manifest = { pages: [{ file: 'carrousel-1.jpg', alt: 'Couverture' }, { file: 'carrousel-2.jpg', alt: 'Article 1' }, { file: '../x.jpg', alt: 'piège' }] };
  const net = (missing = '') => async (u, o = {}) => (u.endsWith('carrousel.json') ? { ok: !missing.includes('json'), json: async () => manifest } : { ok: !(missing && u.endsWith(missing)) });
  const c = await revueCarousel('2026-11-25:soir', { fetchImpl: net() });
  assert.deepEqual(c, [
    { url: 'https://le-radar.ca/revues/2026-11-25-soir/carrousel-1.jpg', alt: 'Couverture' },
    { url: 'https://le-radar.ca/revues/2026-11-25-soir/carrousel-2.jpg', alt: 'Article 1' },
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
// Réseaux : les meilleurs articles selon la note sociale, au plus 8 (10 pages avec couverture et fin).
{
  const { pickSocialItems, socialModel, SOCIAL_MAX } = await import('../scripts/revue/revue-social-pick.mjs');
  assert.equal(SOCIAL_MAX, 8); assert.equal(MAX_ARTICLES, 8);
  const now = Date.parse('2026-11-26T00:00:00Z');
  const art = (id, o = {}) => ({ id, title: `T${id}`, link: `https://m.ca/${id}`, source: 'M', date: '2026-11-25T20:00:00Z', excerpt: '', image: '', credit: '', ...o });
  const long = 'x'.repeat(200);
  const items = [art('a'), art('b', { image: 'https://i/b.jpg', credit: 'Photo : Jeanne Tremblay', excerpt: long }), art('c', { image: 'https://i/c.jpg', imageStock: true }), art('d', { excerpt: long })];
  assert.deepEqual(pickSocialItems(items, { now }).map((x) => x.id), ['b', 'd', 'a', 'c'], 'vraie photo et extrait d’abord ; photo de banque sans bonus ; égalité : ordre de la revue');
  assert.equal(pickSocialItems(Array.from({ length: 20 }, (_, i) => art(String(i))), { now }).length, 8);
  const { articleKey } = await import('../scripts/social/selection.mjs');
  const ranks = new Map([[articleKey(items[0]), 0]]);
  assert.equal(pickSocialItems(items, { now, ranks })[0].id, 'a', 'en tête de l’accueil : premier');
  const sm = socialModel(model, { root: process.cwd() });
  assert.equal(sm.items.length, Math.min(8, model.items.length));
  assert.equal(model.items.length, 14, 'le modèle de la revue (site, impression) reste complet');
  assert.equal(sm.image.url, sm.items[0].image, 'couverture : photo de l’article en tête du carrousel');
  assert.match(renderLinkedInCarousel(sm), /8 articles choisis parmi les 14 de la revue/);
  assert.equal((renderLinkedInCarousel(sm).match(/<section class="li-page/g) || []).length, sm.items.length + 2, 'au plus 10 pages');
}
// Dernière page : sport et radio par popularité ; voile toujours montrée, en tête, hors plafond.
{
  const P = await import('../scripts/revue/revue-social-pick.mjs');
  const g = (o) => ({ emoji: '🏀', sport: 'Basketball (F)', sportKey: 'basketball', kind: 'avenir', verb: 'reçoit', date: '2026-11-26', time: '18:00', uni: false, league: 'Basketball collégial féminin D2', teams: [{ name: 'A', inst: 'X' }, { name: 'B', inst: 'Y' }], ...o });
  const coll = g({ text: 'coll' }), uni = g({ text: 'uni', uni: true, league: 'Basketball universitaire féminin' });
  const derby = g({ text: 'derby', uni: true, league: 'Basketball universitaire féminin', teams: [{ name: 'Martlets', inst: 'McGill' }, { name: 'Stingers', inst: 'Concordia' }] });
  const later = g({ text: 'later', uni: true, league: 'Basketball universitaire féminin', date: '2026-11-29', teams: [{ name: 'Martlets', inst: 'McGill' }, { name: 'Stingers', inst: 'Concordia' }] });
  const hockey = g({ text: 'hockey', sport: 'Hockey (F)', sportKey: 'hockey', uni: true, league: 'Hockey universitaire féminin D1' });
  assert.ok(P.sportScore(derby) > P.sportScore(uni), 'derby (même ville) au-dessus');
  assert.ok(P.sportScore(later, '2026-11-26') < P.sportScore(derby, '2026-11-26'), 'plus loin dans le temps : plus bas');
  assert.deepEqual(P.rankSports([coll, uni, derby, hockey]).map((x) => x.text), ['derby', 'hockey', 'uni', 'coll'], 'popularité, puis variété des sports');
  const sail = { emoji: '⛵', sport: 'Voile', sportKey: 'sailing', kind: 'avenir', date: '2026-11-28', event: 'Régate', text: 'voile', teams: [{ name: 'Rouge et Or', inst: 'ULaval' }] };
  const picked = P.pickSports({ sports: { results: [], next: [coll, uni, derby, hockey, sail] } });
  assert.equal(picked.next[0].text, 'voile', 'voile en tête malgré une note plus basse');
  const many = Array.from({ length: 8 }, (_, i) => g({ text: `m${i}` }));
  const html = renderLinkedInCarousel({ ...model, sports: { results: [], next: P.pickSports({ sports: { next: [...many, sail] } }).next } });
  assert.equal((html.match(/<span class="li-l1">/g) || []).length, 6, 'voile + 5 matchs (hors plafond)');
  assert.match(html, /<li data-keep="1"><span class="li-l1">⛵ Voile/, 'voile protégée de l’ajustement de la page');
  // Radio : FM > AM > web ; en ondes ou bientôt ; grande écoute ; une émission par station, stations par note.
  const at = (h) => h * 60;
  assert.ok(P.showScore('CHYZ 94,3', { start: '19:30', end: '21:30' }, at(19.5)) > P.showScore('CJLO 1690AM', { start: '19:30', end: '21:30' }, at(19.5)), 'FM avant AM');
  assert.ok(P.showScore('CJLO 1690AM', { start: '19:30', end: '21:30' }, at(19.5)) > P.showScore('CHOQ.ca', { start: '19:30', end: '21:30' }, at(19.5)), 'AM avant web');
  assert.ok(P.showScore('CKUT 90,3', { start: '20:00' }, at(19.75)) > P.showScore('CKUT 90,3', { start: '23:00' }, at(19.75)), 'bientôt avant plus tard');
  const radio = P.pickRadio({ datePublished: '2026-11-26T00:10:00Z', radio: [
    { station: 'CJLO 1690AM', shows: [{ title: 'Tard', start: '23:00', end: '00:00' }] },
    { station: 'CKUT 90,3', shows: [{ title: 'Tard', start: '23:00', end: '00:00' }, { title: 'Bientôt', start: '19:30', end: '21:00' }] },
  ] });
  assert.deepEqual(radio.map((r) => `${r.station}:${r.shows[0].title}`), ['CKUT 90,3:Bientôt', 'CJLO 1690AM:Tard']);
}
console.log('revue-linkedin : OK');

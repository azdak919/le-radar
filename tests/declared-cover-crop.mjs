// Couverture déclarée par la source (Polyscope « Génie Mathématique », 8 nov. 2026) :
// une illustration en hauteur choisie comme couverture du billet est recadrée en
// cover, point focal haut, sans bandes ; les signaux d'affiche/capture priment.
// Aucun crédit inventé. 0 réseau.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import https from 'node:https';
import { EventEmitter } from 'node:events';
const require = createRequire(import.meta.url);
const A = require('../scripts/article-image-lib');
const E = require('../scripts/ensure-lead-images');
const F = require('../scripts/article-pages');
const FB = require('../scripts/firebase-list-fetcher');

const link = 'https://www.polyscope.qc.ca/blog/post/H4n2WPpJ3xgzqANSFq4G';
const cover = 'https://firebasestorage.googleapis.com/v0/b/polyscope-6feba.appspot.com/o/blog-image%2FportraitGenieMath.png?alt=media&token=3113ab51-1f59-4142-8d92-a62179e5bbe3';
const W = 1668, H = 2388;

// 1) Provenance : seul le champ « cover » Firestore marque une couverture déclarée.
const src = { name: 'Le Polyscope', site: 'https://www.polyscope.qc.ca', firebase: { project: 'polyscope-6feba', collection: 'blog' } };
const doc = (fields) => ({ name: 'projects/p/databases/(default)/documents/blog/H4n2WPpJ3xgzqANSFq4G', fields: { title: { stringValue: 'Un nouveau programme de bac s’invite à Poly: Le Génie Mathématique' }, publishedDate: { integerValue: String(Date.parse('2026-11-07T12:00:00Z')) }, ...fields } });
const fromCover = FB.parseFirestoreDocument(doc({ cover: { stringValue: cover } }), src);
assert.equal(fromCover.image, cover); assert.equal(fromCover.imageDeclaredCover, cover);
assert.equal(fromCover.sourceImageCredit, undefined, 'pas de champ credits → aucun crédit inventé');
const fromImage = FB.parseFirestoreDocument(doc({ image: { stringValue: cover } }), src);
assert.equal(fromImage.image, cover); assert.equal(fromImage.imageDeclaredCover, undefined, 'champ image générique ≠ couverture déclarée');
assert.ok(A.isDeclaredCoverImage(fromCover, cover));
assert.equal(A.isDeclaredCoverImage(fromCover, cover.replace('portraitGenieMath', 'autre')), false, 'lié à l’URL actuelle seulement');

// 2) Règle générale : couverture déclarée en hauteur → recadrable.
const ctx = { declaredCover: true, url: cover, link };
assert.ok(A.isCropSafePortrait(W, H, ctx));
assert.equal(A.isCropSafePortrait(W, H, { url: cover, link }), false, 'sans déclaration : règle inchangée');
assert.equal(A.isCropSafePortrait(1080, 1920, ctx), false, 'story 9:16 : trop étroite');
assert.equal(A.isCropSafePortrait(600, 860, ctx), false, 'trop petite pour la une');
assert.equal(A.isCropSafePortrait(232, 309, ctx), false, 'La Griffe 232×309 : toujours trop petite');
for (const bad of [
  { ...ctx, campaignGraphic: true },
  { ...ctx, caption: 'Affiche du spectacle — billets en vente' },
  { ...ctx, alt: 'Poster for the fall show' },
  { ...ctx, url: 'https://example.org/wp-content/uploads/affiche-soiree-2026.png' },
  { ...ctx, url: 'https://example.org/wp-content/uploads/Screenshot-2026-11-07.png' },
]) assert.equal(A.isCropSafePortrait(W, H, bad), false, `signal affiche/capture prioritaire: ${JSON.stringify(bad).slice(0, 90)}`);

// 3) WordPress : image mise en avant = déclarée ; og:image seulement si elle la confirme.
const feat = 'https://journal.example/wp-content/uploads/2026/11/illustration.jpg';
const body = 'https://journal.example/wp-content/uploads/2026/11/photo-corps.jpg';
const filler = '<p>' + 'Texte de l’article. '.repeat(120) + '</p>';
const page = (og) => `<html><head>${og ? `<meta property="og:image" content="${og}">` : ''}</head><body><article><img class="attachment-post-thumbnail size-post-thumbnail wp-post-image" src="${feat}" width="900" height="1200">${filler}<figure><img src="${body}" width="900" height="1200"></figure>${filler}</article></body></html>`;
const cands = A.listArticleImageCandidates(page(feat), [], {}, 'https://journal.example/billet/');
const byUrl = (u) => cands.filter((c) => A.imageUrlsMatch(c.url, u));
assert.ok(byUrl(feat).length && byUrl(feat).every((c) => c.declaredCover), 'image mise en avant + og:image qui la confirme');
assert.ok(byUrl(body).every((c) => !c.declaredCover), 'image du corps : pas déclarée');
const ogOther = A.listArticleImageCandidates(page(body), [], {}, 'https://journal.example/billet/');
assert.ok(ogOther.filter((c) => A.imageUrlsMatch(c.url, body)).every((c) => !c.declaredCover), 'og:image seule ≠ couverture');

// 4) Chaîne complète : page SPA sans image + couverture déclarée sondée (en-tête PNG).
const png = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
png.writeUInt32BE(13, 8); png.write('IHDR', 12, 'ascii'); png.writeUInt32BE(W, 16); png.writeUInt32BE(H, 20);
const originalGet = https.get, originalTimeout = globalThis.setTimeout;
const item = { link, title: fromCover.title, source: 'Le Polyscope', image: cover, imageDeclaredCover: cover };
try {
  globalThis.setTimeout = (...args) => originalTimeout(...args).unref();
  https.get = (target, options, callback) => {
    const req = new EventEmitter(); req.destroy = () => {}; req.setTimeout = () => req; req.on = req.on.bind(req);
    queueMicrotask(() => {
      const res = new EventEmitter(); res.statusCode = 200; res.headers = String(target) === link ? { 'content-type': 'text/html' } : { 'content-type': 'image/png' };
      res.setEncoding = () => {}; res.resume = () => {}; res.destroy = () => {};
      callback(res);
      res.emit('data', String(target) === link ? `<html><head><title>Polyscope</title></head><body><div id="root"></div><!--${' '.repeat(2100)}--></body></html>` : png);
      res.emit('end');
    });
    return req;
  };
  const hit = await A.resolveLeadReadyPhoto(item);
  assert.ok(hit && A.imageUrlsMatch(hit.url, cover), 'la couverture déclarée est retenue');
  assert.equal(hit.cropSafe, true); assert.equal(hit.declaredCover, true); assert.equal(hit.cropFocalY, A.DECLARED_COVER_FOCAL_Y);
  const r = await E.replacePortraitLead(item, { probe: async () => ({ width: W, height: H }), resolve: async () => hit });
  assert.equal(r, 'cropped');
} finally { https.get = originalGet; globalThis.setTimeout = originalTimeout; }
assert.equal(item.image, cover); assert.equal(item.imageCropSafe, cover);
assert.equal(item.imageCropFocalY, 0.2); assert.equal(item.stockImage, undefined);
assert.equal(item.sourceImageCredit, undefined, 'aucun crédit illustrateur inventé');
assert.ok(E.hasCropSafeImage(item));
assert.equal(await E.replacePortraitLead(item, { probe: async () => { throw Error('déjà jugée'); } }), null, 'idempotent');

// 5) Le focal suit l'image ; une exception revue (pin Karmina) garde son focal.
const moved = { ...item }; E.assignSourceImage(moved, 'https://example.org/autre.jpg', true);
assert.equal(moved.imageCropFocalY, undefined); assert.equal(moved.imageCropSafe, undefined);
const karmina = { link: 'https://quartierlibre.ca/karmina-vampires-quebecois/', image: '' };
E.assignSourceImage(karmina, 'https://quartierlibre.ca/wp-content/uploads/2026/11/16_critique-cine.jpeg', true, true, 0.2);
assert.equal(karmina.imageCropFocalY, 0.5, 'pin revu prioritaire');

// 6) SSR : même cadrage que la carte.
const record = F.recordOf({ ...item, date: '2026-11-07T12:00:00Z', lang: 'fr' });
assert.equal(record.imageCropFocalY, 0.2);
assert.match(F.renderPage(F.loadTemplate(), record), /object-position:50% 20%;aspect-ratio:3\/2/);
const legacy = F.recordOf({ ...item, imageCropFocalY: undefined, date: '2026-11-07T12:00:00Z' });
assert.equal(legacy.imagePortraitCrop, true);
assert.match(F.renderPage(F.loadTemplate(), legacy), /object-position:50% 30%;aspect-ratio:3\/2/, 'portrait recadrable sans focal = tiers haut CSS');
assert.doesNotMatch(F.renderPage(F.loadTemplate(), F.recordOf({ link, title: 'x', image: 'https://example.org/paysage.jpg' })), /object-position/);

// Miroir local (assets/news-images) de la même image : focal conservé (fiche publique 9 nov.).
const mirrored = F.recordOf({ ...item, imageLocal: 'assets/news-images/72a7534c65b78c07.jpg', date: '2026-11-07T12:00:00Z' });
assert.match(mirrored.image, /\/assets\/news-images\/72a7534c65b78c07\.jpg$/); assert.equal(mirrored.imageCropFocalY, 0.2);
assert.match(F.renderPage(F.loadTemplate(), mirrored), /object-position:50% 20%;aspect-ratio:3\/2/);
const stockShown = F.recordOf({ link, title: 'x', image: '', imageCropSafe: '', stockImage: 'https://upload.wikimedia.org/x.jpg', imageCropFocalY: 0.2 });
assert.equal(stockShown.imageCropFocalY, undefined, 'jamais de focal sur une photo de banque');

// Registre des fiches : l'ancien crédit campus ne suit pas la nouvelle couverture.
const store = { articles: {} };
F.merge(store, [{ ...item, image: '', stockImage: 'https://upload.wikimedia.org/campus.jpg', imageCredit: 'Laurent Bélanger / CC BY-SA 4.0', imageProvider: 'campus-bank', imageCropSafe: undefined, imageCropFocalY: undefined, date: '2026-11-07T12:00:00Z' }]);
const sid = Object.keys(store.articles)[0];
assert.match(store.articles[sid].credit || '', /Bélanger/);
F.merge(store, [{ ...item, date: '2026-11-07T12:00:00Z' }]);
assert.equal(store.articles[sid].image, cover);
assert.doesNotMatch(store.articles[sid].credit || '', /Bélanger/, 'pas de crédit d’une autre image');
assert.equal(store.articles[sid].imageCropFocalY, 0.2);
F.merge(store, [{ ...item, image: '', imageCropSafe: undefined, date: '2026-11-07T12:00:00Z' }]);
assert.equal(store.articles[sid].image, cover, 'image vide du jour : on garde la précédente');

// 7) Garde navigateur : couverture approuvée acceptée en une, pas un portrait quelconque.
const client = readFileSync(new URL('../radar-news.js', import.meta.url), 'utf8');
const fn = client.match(/function isUsableArticleImage\([\s\S]*?\n}/)[0];
const box = { LEAD_IMAGE_MIN: { width: 640, height: 360, pixels: 320000 }, FEATURE_IMAGE_MIN: { width: 640, height: 360, pixels: 240000 }, THUMB_IMAGE_MIN: { width: 200, height: 150, pixels: 40000 } };
vm.createContext(box); vm.runInContext(fn, box);
assert.ok(box.isUsableArticleImage({ naturalWidth: W, naturalHeight: H }, 'lead', item));
assert.equal(box.isUsableArticleImage({ naturalWidth: W, naturalHeight: H }, 'lead', { image: cover }), false);
const css = readFileSync(new URL('../style-feed.css', import.meta.url), 'utf8');
assert.match(css, /\.article-media img\.is-portrait-crop\s*\{\s*object-position:\s*50% 30%/, 'SSR imagePortraitCrop = CSS carte');
console.log('declared-cover-crop: ok');

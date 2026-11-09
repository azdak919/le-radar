// Régression Karmina : approbation exacte, crop cover, provenance ≠ licence. 0 réseau.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import https from 'node:https';
import { EventEmitter } from 'node:events';
const require = createRequire(import.meta.url);
const A = require('../scripts/article-image-lib');
const P = require('../scripts/lead-image-pins-lib');
const E = require('../scripts/ensure-lead-images');
const F = require('../scripts/article-pages');
const { canMirrorSourceImage } = require('../scripts/mirror-news-images');
const link = 'https://quartierlibre.ca/karmina-vampires-quebecois/';
const url = 'https://quartierlibre.ca/wp-content/uploads/2026/11/16_critique-cine.jpeg';
const ctx = { link, url, caption: 'Affiche du film Karmina, réalisé par Gabriel Pelletier. Crédit: Éléphant Films' };
assert.ok(A.isCropSafePortrait(600, 779, ctx));
for (const bad of [{ ...ctx, link: 'https://quartierlibre.ca/autre/' }, { ...ctx, url: url.replace('cine', 'logo') }, { ...ctx, campaignGraphic: true }, { ...ctx, link: '' }]) {
  assert.equal(A.isCropSafePortrait(600, 779, bad), false, 'pas de permission générale affiches/logos/pub');
}
assert.equal(A.isCropSafePortrait(599, 779, ctx), false, 'dimensions changées : revue nécessaire');
assert.equal(A.isCropSafePortrait(600, 1000, ctx), false, 'autre cadrage : revue nécessaire');
assert.equal(A.isCropSafePortrait(800, 1000, { caption: 'Affiche du film Karmina. Crédit: Éléphant Films' }), false);
// Résolution complète sur une page source minimale, transport HTTPS simulé.
const fixture = `<html><head><meta property="og:image" content="${url}"><meta property="og:image:width" content="600"><meta property="og:image:height" content="779"></head><body><article><figure><img src="${url}" width="600" height="779"><figcaption>${ctx.caption}</figcaption></figure></article><!--${' '.repeat(2100)}--></body></html>`;
const originalGet = https.get, originalTimeout = globalThis.setTimeout;
try {
  globalThis.setTimeout = (...args) => originalTimeout(...args).unref();
  https.get = (target, options, callback) => {
    assert.equal(String(target), link, 'métadonnées suffisantes, pas de téléchargement image');
    const req = new EventEmitter(); req.destroy = () => {};
    queueMicrotask(() => {
      const res = new EventEmitter(); res.statusCode = 200; res.headers = {};
      res.setEncoding = () => {}; res.resume = () => {};
      callback(res); res.emit('data', fixture); res.emit('end');
    });
    return req;
  };
  const hit = await A.resolveLeadReadyPhoto({link});
  assert.equal(hit.url, url); assert.equal(hit.cropSafe, true); assert.equal(hit.leadReady, true);
} finally { https.get = originalGet; globalThis.setTimeout = originalTimeout; }

const item = { link, title: 'Karmina, des vampires québécois !', source: 'Quartier Libre', image: '', stockImage: 'campus', imageCredit: 'abdallahh / CC BY 2.0', imageLocal: 'assets/news-images/campus.jpg' };
P.applyLeadImagePins([item]);
assert.equal(item.image, url); assert.equal(item.imageCropFocalY, 0.5);
assert.equal(item.stockImage, undefined); assert.equal(item.imageCredit, undefined); assert.equal(item.imageLocal, undefined);
assert.equal(canMirrorSourceImage(item), false, 'pas de nouveau réhébergement sans licence');
assert.equal(canMirrorSourceImage({ image: url }), true, 'autres images : chemin existant inchangé');
assert.equal(P.applyLeadImagePins([item]), 0, 'idempotent');
assert.ok(E.fillsLeadWhenCropped(600, 779, { reviewed: true }));
assert.equal(E.fillsLeadWhenCropped(600, 779), false, 'seuil général inchangé');
assert.equal(await E.replacePortraitLead(item, { probe: async () => { throw Error('déjà revue'); } }), null);
E.assignSourceImage(item, url, true, true); assert.equal(item.imageCropFocalY, 0.5);
const record = F.recordOf(item); const html = F.renderPage(F.loadTemplate(), record);
assert.equal(record.image, url); assert.equal(record.credit, 'Éléphant Films');
assert.match(html, /object-position:50% 50%;aspect-ratio:3\/2/);
assert.match(html, /property="og:image" content="https:\/\/quartierlibre/);
assert.match(html, /"creditText":"Éléphant Films"/); assert.doesNotMatch(html, /abdallahh/);
const pinnedSnapshot = { ...item }; // fiche épinglée avant l'essai d'une autre image
E.assignSourceImage(item, 'https://example.org/autre.jpg', true);
assert.equal(item.imageCropFocalY, undefined); assert.equal(item.imageCropSafe, undefined);
assert.equal(F.recordOf(item).imageCropFocalY, undefined, 'pas de cadrage transféré');
// Le garde navigateur doit accepter le portrait revu en une, pas un portrait quelconque.
const client = readFileSync(new URL('../radar-news.js', import.meta.url), 'utf8');
const fn = client.match(/function isUsableArticleImage\([\s\S]*?\n}/)[0];
const box = { LEAD_IMAGE_MIN: {width:640,height:360,pixels:320000}, FEATURE_IMAGE_MIN: {width:640,height:360,pixels:240000}, THUMB_IMAGE_MIN: {width:200,height:150,pixels:40000} };
vm.createContext(box); vm.runInContext(fn, box);
const approved = { image: url, imageCropSafe: url, imageCropFocalY: 0.5 };
assert.ok(box.isUsableArticleImage({naturalWidth:600,naturalHeight:779}, 'lead', approved));
assert.equal(box.isUsableArticleImage({naturalWidth:600,naturalHeight:779}, 'lead'), false);
assert.equal(box.isUsableArticleImage({naturalWidth:600,naturalHeight:779}, 'lead', {...approved,image:'autre'}), false);
// Rendu publiable depuis une fiche figée (la une épinglée passe par le vrai code : épinglage, fiche, flux RSS).
// Ces vérifications ne dépendent d'aucune donnée du jour : elles échouent si le recadrage, le point focal, le crédit ou l'URL régressent.
const G = require('../scripts/generate-feed');
const published = { ...pinnedSnapshot, date: '2026-11-07T21:00:00.000Z', author: 'Mathilde Jobin', excerpt: 'Un film québécois de 1996 avec des vampires.' };
assert.equal(published.image, url); assert.equal(published.imageRemoteOnly, true); assert.equal(published.imageCropFocalY, 0.5); assert.equal(published.imageCropSafe, url);
assert.equal(F.creditOf(published), 'Éléphant Films');
const rssItem = G.buildItemXml(published);
assert.ok(rssItem.includes(url)); assert.match(rssItem, /Éléphant Films/); assert.doesNotMatch(rssItem, /abdallahh/);
// Données publiées (news.json, fiche archivée, flux, accueil) : si l'article y figure encore, elles doivent être identiques à la règle ;
// l'accueil et le flux tournent, donc l'absence de l'article n'est pas une erreur. Une présence incorrecte reste une erreur.
const readData = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const news = JSON.parse(readData('news.json')).items.find(i => i.link === link);
if (news) { assert.equal(news.image, url); assert.equal(news.imageCropFocalY, 0.5); assert.equal(news.imageRemoteOnly, true); assert.equal(F.creditOf(news), 'Éléphant Films'); }
const stored = JSON.parse(readData('data/article-pages.json')).articles['76bd8d7a1889e2e8'];
if (stored) { assert.equal(stored.image, url); assert.equal(stored.imageCropFocalY, 0.5); assert.equal(stored.credit, 'Éléphant Films'); }
const rssLive = (readData('feed.xml').match(/<item>[\s\S]*?<\/item>/g) || []).find(block => block.includes(`<link>${link}</link>`));
if (rssLive) { assert.ok(rssLive.includes(url)); assert.match(rssLive, /Éléphant Films/); assert.doesNotMatch(rssLive, /abdallahh/); }
const index = readData('index.html');
const list = [...index.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1])).find(j => j['@type'] === 'ItemList');
const listed = list && list.itemListElement.find(n => n.url === link);
if (listed) assert.equal(listed.item.image, url);
console.log('OK Karmina : crop revu, garde-fous, fil/fiche/OG/crédit, URL distante uniquement');

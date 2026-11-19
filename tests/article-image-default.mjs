// Règle du 19 nov. 2026 (Charles) : l'image de l'article est gardée par défaut,
// même une affiche ou un visuel avec du texte. Seuls les cas manifestement
// invalides sont écartés : image absente ou minuscule, logo, favicon, pixel
// de suivi, publicité. Un pin (data/lead-image-pins.json) corrige à la main.
// Régression : Le Collectif, « Rencontre Carney-PSPP au Cambodge » (512×640),
// remplacée par le pavillon Georges-Cabana de la banque campus. 0 réseau.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import https from 'node:https';
import { EventEmitter } from 'node:events';
const require = createRequire(import.meta.url);
const A = require('../scripts/article-image-lib');
const E = require('../scripts/ensure-lead-images');
const P = require('../scripts/lead-image-pins-lib');

const link = 'https://lecollectif.ca/a-la-une/rencontre-carney-pspp-au-cambodge/';
const url = 'https://lecollectif.ca/wp-content/uploads/2026/11/SOCIETE_Rencontre-Carney-PSPP-au-Cambodge_Page-Facebook-de-Mark-Carney.jpg';
const campus = 'https://upload.wikimedia.org/wikipedia/commons/8/81/Universit%C3%A9_de_Sherbrooke_-_Pavillon_Georges-Cabana_%28panorama%29.jpg';
const caption = '« Ensemble, nous pouvons y parvenir », affirme le premier ministre canadien.';
const filler = '<p>' + 'Québec, Montréal ou Ottawa ? C’est finalement au Cambodge. '.repeat(40) + '</p>';
const fixture = `<html><head><meta property="og:image" content="${url}"><meta property="og:image:width" content="512"><meta property="og:image:height" content="640"></head><body class="postid-1"><article><figure><img src="${url}" width="512" height="640" alt=""><figcaption>${caption}</figcaption></figure>${filler}</article></body></html>`;

// 1) Sélecteur : la photo de l'article est retenue (vignette, fiche), pas null.
const originalGet = https.get, originalTimeout = globalThis.setTimeout;
let hit;
try {
  globalThis.setTimeout = (...args) => originalTimeout(...args).unref();
  https.get = (target, options, callback) => {
    assert.equal(String(target), link, 'dimensions og:image suffisantes : aucune image téléchargée');
    const req = new EventEmitter(); req.destroy = () => {}; req.setTimeout = () => req;
    queueMicrotask(() => {
      const res = new EventEmitter(); res.statusCode = 200; res.headers = { 'content-type': 'text/html' };
      res.setEncoding = () => {}; res.resume = () => {}; res.destroy = () => {};
      callback(res); res.emit('data', fixture); res.emit('end');
    });
    return req;
  };
  hit = await A.resolveLeadReadyPhoto({ link, source: 'Le Collectif', image: '' });
} finally { https.get = originalGet; globalThis.setTimeout = originalTimeout; }
assert.ok(hit, 'Carney : la photo de l’article est trouvée');
assert.ok(A.imageUrlsMatch(hit.url, url));
assert.equal(hit.leadReady, true, '512 px : gardé partout, une comprise (cadre adapté)');
assert.equal(hit.articleThumb, true);
assert.equal(hit.cropSafe, true, 'portrait : cadrage tiers haut sur la fiche');

// 2) Passe portrait : l'image reste, la banque campus est retirée.
const item = { link, source: 'Le Collectif', image: url, stockImage: campus, imageProvider: 'campus-bank' };
const r = await E.replacePortraitLead(item, { probe: async () => ({ width: 512, height: 640 }), resolve: async () => hit });
assert.equal(r, 'kept');
assert.equal(item.image, url, 'vraie photo de l’article gardée');
assert.equal(item.leadImageReady, true);
assert.equal(item.stockImage, undefined, 'plus de photo de campus à la place de la vraie photo');
assert.ok(E.hasCropSafeImage(item));
assert.equal(await E.replacePortraitLead(item, { probe: async () => { throw Error('déjà jugée'); } }), null, 'idempotent');

// 3) Affiches et visuels à texte : gardés dès que la taille le permet.
assert.ok(A.isCropSafePortrait(1080, 1350, { url: 'https://lecollectif.ca/wp-content/uploads/2026/10/Affiche_FEUS_CreditFEUS.png', alt: 'Affiche du spectacle — billets en vente' }), 'affiche FEUS 1080×1350 : en une, recadrée');
assert.ok(A.isCropSafePortrait(800, 1000, { campaignGraphic: false, caption: 'Visuel de campagne' }), 'visuel de campagne : gardé');
assert.ok(A.meetsArticleThumbSize(1080, 1920), 'story 9:16 : gardée en vignette');
assert.ok(A.meetsArticleThumbSize(2560, 659), 'capture en bandeau : gardée en vignette');

// 4) Toujours écartés : minuscule, pixel de suivi, logo, favicon, publicité.
assert.equal(A.meetsArticleThumbSize(1, 1), false, 'pixel de suivi');
assert.equal(A.meetsArticleThumbSize(120, 90), false, 'image minuscule');
assert.equal(A.meetsArticleThumbSize(0, 0), false, 'dimensions inconnues ou image cassée');
for (const bad of [
  'https://lecollectif.ca/wp-content/uploads/2026/02/logo-le-collectif.png',
  'https://lecollectif.ca/favicon.ico',
  'https://example.org/wp-content/uploads/cropped-logo-512x512.png',
  'https://lecollectif.ca/wp-content/uploads/2026/10/pub_agenda.jpg',
  'https://example.org/wp-content/uploads/sponsor-banner.jpg',
  'https://secure.gravatar.com/avatar/abc.jpg',
]) assert.equal(A.isCandidateImageUrl(bad), false, `écarté : ${bad}`);
const tiny = { link: 'https://example.org/a', image: 'https://example.org/wp-content/uploads/a-180x240.jpg' };
assert.equal(await E.replacePortraitLead(tiny, { resolve: async () => null }), 'cleared', 'minuscule : retirée');

// 5) La correction à la main reste possible : rejet ou photo imposée par pin.
const pins = { reject: new Set([P.normUrl(url)]), pins: new Map() };
const pinned = { link, image: url, leadImageReady: true };
assert.equal(P.applyLeadImagePins([pinned], pins), 1, 'pin de rejet appliqué');
assert.equal(pinned.image, '');
// 6) Même nom de fichier, mois différents : deux photos distinctes, pas un
//    visuel générique (La Pige « Image-9.jpg », Le Délit « matteo.png »).
{
  const pige = (m) => ({ source: 'La Pige', link: `https://lapige.example/${m}`, date: `2026-${m}-09T12:00:00Z`, image: `https://lapige.atmjonquiere.com/wp-content/uploads/sites/3/2026/${m}/Image-9.jpg` });
  const items = [pige('10'), pige('11')];
  assert.equal(A.dropSharedSourceImages(items, 2), 0, 'dossiers différents : rien retiré');
  assert.ok(items.every((it) => it.image));
  assert.equal(A.keepNewestSharedImage(items), 0, 'pas de « photo en double » entre deux mois');
  const logo = 'https://lapige.atmjonquiere.com/wp-content/uploads/sites/3/2026/11/Image-9.jpg';
  const same = [{ ...pige('11'), link: 'a' }, { ...pige('11'), link: 'b', image: logo.replace('.jpg', '-1024x576.jpg') }];
  assert.equal(A.dropSharedSourceImages(same, 2), 2, 'même fichier (autre taille) : toujours retiré');
  assert.equal(A.sharedImageKey(`https://i0.wp.com/${logo.slice(8)}?ssl=1`), A.sharedImageKey(logo), 'Photon = origine');
}
// 7) Plus de préférence de format : l'image du billet passe avant une photo
//    du corps « mieux cadrée », et la une pose un petit portrait dans un cadre.
{
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const client = readFileSync(new URL('../radar-news.js', import.meta.url), 'utf8');
  const fn = client.match(/const LEAD_FIT_MIN_PORTRAIT_WIDTH[\s\S]*?\nfunction leadNeedsFitFrame\([\s\S]*?\n}/)[0];
  const box = {}; vm.createContext(box); vm.runInContext(`${fn}; this.f = leadNeedsFitFrame;`, box);
  const f = (w, h) => box.f({ naturalWidth: w, naturalHeight: h });
  assert.equal(f(512, 640), true, 'Carney 512×640 : cadre adapté en une');
  assert.equal(f(1080, 1920), true, 'story : cadre adapté');
  assert.equal(f(2560, 659), true, 'bandeau 3,9:1 : cadre adapté');
  assert.equal(f(1200, 800), false, 'photo 3:2 : plein cadre');
  assert.equal(f(900, 1200), false, 'portrait 900×1200 : recadré au tiers haut');
  const css = readFileSync(new URL('../style-feed.css', import.meta.url), 'utf8');
  assert.match(css, /\.article-media-fit__bg\s*\{[^}]*filter:\s*blur/, 'fond flouté de la même image');
  assert.match(css, /img\.is-fit\s*\{[^}]*object-fit:\s*contain/, 'image entière');
}
console.log('article-image-default: ok');

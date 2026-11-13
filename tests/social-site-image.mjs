// Les réseaux utilisent l'image de le-radar.ca pour l'article, jamais une image (ou pub) du site source.
import assert from 'node:assert/strict';
import { siteImage, resolveImage, AD, isPublicMedia, isMediaRefusal, SOCIAL_MEDIA_MAX_BYTES, publicMedia } from '../scripts/social/image-resolve.mjs';
import { articleId } from '../scripts/social/lib.mjs';
import { readFileSync } from 'node:fs';
const link='https://lecollectif.ca/edition-papier/lula-marque-lhistoire-flavio-bolsonaro-dans-leau-chaude/', id=articleId(link);
const pages={[id]:{image:'https://le-radar.ca/assets/news-images/8c16b479fbb19e57.jpg',credit:'LinkedIn de Luiz Inácio Lula da Silva'}};
const im=siteImage({link},{pages});
assert.equal(im.url,'https://le-radar.ca/assets/news-images/8c16b479fbb19e57.jpg'); assert.equal(im.origin,'le-radar.ca');
assert.equal(siteImage({link:'https://exemple.ca/inconnu/'},{pages}),null);
const news=[{link:'https://exemple.ca/a/',imageLocal:'assets/news-images/abc.jpg'},{link:'https://exemple.ca/b/',stockImage:'https://le-radar.ca/assets/bank/x.jpg'}];
assert.equal((await resolveImage({link:'https://exemple.ca/a/'},{pages,news,offline:true})).url,'https://le-radar.ca/assets/news-images/abc.jpg','repli : sélection du site');
assert.equal((await resolveImage({link:'https://exemple.ca/b/'},{pages,news,offline:true})).url,'https://le-radar.ca/assets/bank/x.jpg','repli : banque du site');
await assert.rejects(resolveImage({link:'https://exemple.ca/zzz/'},{pages,news,offline:true}),/introuvable/,'jamais sans image');
const r=await resolveImage({link,img:'https://m.media-amazon.com/images/prime-video-ad.jpg'},{pages,used:new Map(),repeated:new Map()});
assert.equal(r.url,pages[id].image,'l’image du flux/source est ignorée');
for(const u of ['https://lecollectif.ca/wp-content/uploads/2026/10/Prime-Video-Essayez-Prime.jpg','https://x.ca/ads/970x250.png','https://securepubads.g.doubleclick.net/a.jpg','https://x.ca/uploads/promo-etudiants.jpg','https://x.ca/sponsored/a.jpg','https://x.ca/img/728x90.gif'])
  assert.ok(AD.test(u),u);
for(const u of ['https://lecollectif.ca/wp-content/uploads/2026/11/SOCIETE_Lula-marque-lhistoire_Source-LinkedIn.jpeg','https://le-radar.ca/assets/news-images/8c16b479fbb19e57.jpg','https://montrealcampus.ca/wp-content/uploads/2026/10/ContratAmazon_Fanny.png','https://x.ca/uploads/adaptation-roman.jpg','https://x.ca/public/1200x800.jpg'])
  assert.ok(!AD.test(u),u);
assert.ok(siteImage({link},{pages}));
assert.equal(SOCIAL_MEDIA_MAX_BYTES, 5 * 1024 * 1024);
assert.ok(isPublicMedia({ status: 200, contentType: 'image/jpeg', bytes: 80_000, url: 'https://le-radar.ca/assets/news-images/x.jpg' }));
assert.ok(!isPublicMedia({ status: 404, contentType: 'text/html', bytes: 9379, url: 'https://le-radar.ca/assets/news-images/x.jpg' }), '404 HTML rejeté');
assert.ok(!isPublicMedia({ status: 200, contentType: 'image/jpeg', bytes: 41_500_000, url: 'https://upload.wikimedia.org/x.jpg' }), 'image > 5 Mo rejetée');
assert.ok(!isPublicMedia({ status: 200, contentType: 'text/html', bytes: 100, url: 'https://le-radar.ca/x.jpg' }), 'Content-Type non image rejeté');
assert.ok(isMediaRefusal(new Error('Invalid post: Image exceeds the 5.0MB file size limit (41.5MB).')));
assert.ok(isMediaRefusal(new Error('Please update the media URL to be publicly accessible before retrying the post.')));
assert.ok(!isMediaRefusal(new Error('Buffer API 500')));
const bufPost = readFileSync(new URL('../scripts/social/buffer-post.mjs', import.meta.url), 'utf8');
const bufPages = readFileSync(new URL('../scripts/social/buffer-pages-post.mjs', import.meta.url), 'utf8');
assert.match(bufPost, /mediaForNetwork\(im\.url, 'x'/); // vérifie l'URL publique, le poids et les pixels avant Buffer
assert.match(bufPost, /isMediaRefusal/);
assert.match(bufPages, /imageUrlForNetwork\(cfg\.service, im\.url\)/); assert.match(bufPages, /mediaForNetwork\(url, service/);
assert.match(bufPages, /isMediaRefusal/);
assert.equal(typeof publicMedia, 'function');
console.log('social-site-image OK');


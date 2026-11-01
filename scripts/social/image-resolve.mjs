// Résolution d’image des publications sociales : flux → (Flickr si dans la page) → page de l’article → banque campus du Radar.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const bank = require('../campus-photo-bank.js');
import { personCredit } from './lib.mjs';
const UA = {'user-agent':'Mozilla/5.0 (compatible; LeRadarBot/1.0; +https://le-radar.ca)'};
export const BAD = /logo|default|placeholder|favicon|avatar|icon|sprite|banner|header|cropped-|gravatar|blank|spacer|5-?infos|cinq-?infos|cinq-nouvelles|nouvelles-de-la-semaine|share-image|og-default|site-image/i;
const MINW = 600;
/** Attribution d'une photo de banque : nom de personne tel quel ; pseudo (ex. « abdallahh », seul nom publié
 * par l'auteur·e sur Flickr/Commons) complété par la source et la licence, comme l'exige CC BY. */
export function bankAttribution(e){
  const c=String(e?.creator||'').trim(); if(!c) return '';
  if(personCredit(c)) return c;
  const src=/wiki/i.test(`${e.url||''} ${e.sourceUrl||''}`)?'Wikimedia Commons':/flickr/i.test(`${e.url||''} ${e.sourceUrl||''}`)?'Flickr':'';
  const extra=[src,String(e.license||'').trim()].filter(Boolean).join(', ');
  return extra?`${c} (${extra})`:c; }
/** Auteur·e connu·e d'une photo de la banque du Radar (Wikimedia, etc.), sinon ''. */
let _credits=null;
export function bankCredit(url){
  if(!_credits){ _credits=new Map(); const add=e=>{ if(e?.url&&e.creator&&!/inconnu/i.test(e.creator)) _credits.set(key(e.url),bankAttribution(e)); };
    for(const l of Object.values(bank.BANK||{})) for(const e of l) add(e);
    try{ for(const l of bank.loadWallpaperCampusExtras().values()) for(const e of l) add(e); }catch{} }
  return _credits.get(key(url))||''; }
export function dims(b){ // JPEG/PNG/GIF/WebP
  if(b[0]===0x89&&b[1]===0x50) return {w:b.readUInt32BE(16),h:b.readUInt32BE(20)};
  if(b[0]===0x47&&b[1]===0x49) return {w:b.readUInt16LE(6),h:b.readUInt16LE(8)};
  if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'){ const t=b.toString('ascii',12,16);
    if(t==='VP8X') return {w:1+b.readUIntLE(24,3),h:1+b.readUIntLE(27,3)};
    if(t==='VP8 ') return {w:b.readUInt16LE(26)&0x3fff,h:b.readUInt16LE(28)&0x3fff};
    if(t==='VP8L'){const n=b.readUInt32LE(21);return {w:(n&0x3fff)+1,h:((n>>14)&0x3fff)+1};} }
  if(b[0]===0xff&&b[1]===0xd8){ let i=2; while(i<b.length-9){ if(b[i]!==0xff){i++;continue;} const m=b[i+1];
      if(m>=0xc0&&m<=0xcf&&![0xc4,0xc8,0xcc].includes(m)) return {h:b.readUInt16BE(i+5),w:b.readUInt16BE(i+7)};
      i+=2+b.readUInt16BE(i+2);} }
  return null; }
const cache=new Map();
export async function probe(url){ if(cache.has(url)) return cache.get(url);
  let r=null; try{ const res=await fetch(url,{headers:UA,redirect:'follow',signal:AbortSignal.timeout(20000)});
    const ct=res.headers.get('content-type')||''; if(res.ok&&/^image\//.test(ct)&&res.url.startsWith('https://')){
      const b=Buffer.from(await res.arrayBuffer()); r={...dims(b),finalUrl:res.url,ct,bytes:b.length}; } }catch{}
  cache.set(url,r); return r; }
const pages=new Map();
export async function page(url){ if(!pages.has(url)) pages.set(url, fetch(url,{headers:UA,signal:AbortSignal.timeout(20000)}).then(r=>r.ok?r.text():'').catch(()=>''));
  return pages.get(url); }
const abs=(u,base)=>{try{return new URL(u.replace(/&amp;/g,'&'),base).toString()}catch{return ''}};
const key=u=>{try{const x=new URL(u);return x.hostname+x.pathname.replace(/-\d+x\d+(?=\.\w+$)/,'').replace(/-scaled(?=\.\w+$)/,'')}catch{return u}};
export function candidates(html,base){ const out=[];
  for(const re of [/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)/gi,
                   /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/gi])
    for(const m of html.matchAll(re)) out.push({url:abs(m[1],base),how:'og/twitter'});
  const art=(html.match(/<article[\s\S]*?<\/article>/i)||html.match(/<main[\s\S]*?<\/main>/i)||[html])[0];
  for(const m of art.matchAll(/<img\b[^>]*>/gi)){ const t=m[0];
    const ss=(t.match(/srcset=["']([^"']+)/i)||[])[1]; let u=(t.match(/\b(?:data-src|src)=["']([^"']+)/i)||[])[1];
    if(ss){ const best=ss.split(',').map(s=>s.trim().split(/\s+/)).sort((a,b)=>parseInt(b[1])-parseInt(a[1]))[0]; if(best) u=best[0]; }
    if(u&&!u.startsWith('data:')) out.push({url:abs(u,base),how:'img article'}); }
  return out; }
export async function bodyImages(link){ const h=await page(link); return h?candidates(h,link):[]; }
/** used: Map(source -> Set(keys)) ; repeatedBySource: Map(source->Set(keys) vues dans ≥2 articles) */
export async function resolveImage(it,{used,repeated}){
  const u=used.get(it.source)||new Set(); used.set(it.source,u); const rep=repeated.get(it.source)||new Set();
  const ok=async(url)=>{ if(!url||!/^https?:/.test(url)||BAD.test(url)||u.has(key(url))||rep.has(key(url))) return null;
    const p=await probe(url); if(!p||!p.w||p.w<MINW||BAD.test(p.finalUrl)) return null; return p; };
  const take=(url,p,origin,note)=>{u.add(key(url));const credit=origin==='banque'?bankCredit(url):origin==='flux'?(it.credit||''):'';const f=new URL(p.finalUrl);[...f.searchParams.keys()].filter(k=>/^utm_/.test(k)).forEach(k=>f.searchParams.delete(k));return {url:f.toString().replace(/\?$/,''),origin,width:p.w,height:p.h,note,credit};};
  // 1. image du flux (non écartée)
  if(it.img && !it.imgDropped){ const p=await ok(it.img); if(p) return take(it.img,p,'flux'); }
  // 1b. Flickr écarté : gardé seulement si présent dans la page de l'article
  if(it.img && /flickr/.test(it.imgDropped||'')){ const h=await page(it.link); const id=(it.img.match(/\/(\d+)_[0-9a-f]+/)||[])[1];
    if(h && (h.includes(it.img)||(id&&h.includes(id)))){ const p=await ok(it.img); if(p) return take(it.img,p,'flux','Flickr confirmé dans la page de l’article'); } }
  // 2. page de l'article
  for(const c of await bodyImages(it.link)){ const p=await ok(c.url); if(p) return take(c.url,p,'page article',c.how); }
  // 3. banque du Radar (logique du site : pickCampusPhoto par établissement)
  for(const inst of [...(it.categories||[]),it.source]){ if(!bank.hasCampusBank(inst)) continue;
    for(let i=0;i<5;i++){ const pick=bank.pickCampusPhoto({institution:inst,link:it.link+(i?'#'+i:''),title:it.bare,excerpt:it.desc},{avoidUrls:[...u].map(k=>'https://'+k)});
      if(!pick) break; const p=await ok(pick.stockImage); if(p) return take(pick.stockImage,p,'banque',`campus-photo-bank (${inst}) · ${pick.imageCredit}`); u.add(key(pick.stockImage)); } }
  return null; }

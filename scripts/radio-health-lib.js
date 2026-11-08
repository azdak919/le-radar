'use strict';
// Aucun secret, service externe ni assouplissement TLS. Entrées/sorties testables hors réseau.
const https = require('https');
const dns = require('dns').promises;
const net = require('net');
const { spawnSync } = require('child_process');
const DAY = 86400000;
const AUDIO_TTL = 26 * 3600000;
const STALE_MS = 14 * 3600000;
function expiryBand(expiresAt, now = Date.now()) {
  const left = Date.parse(expiresAt) - now;
  if (!Number.isFinite(left)) return 'unknown';
  if (left <= 0) return 'expired';
  return left <= 2*DAY ? '2d' : left <= 7*DAY ? '7d' : left <= 14*DAY ? '14d' : 'ok';
}
function isPublicAddress(value) {
  const address=String(value).replace(/^\[|\]$/g,'');
  const family=net.isIP(address);
  if(family===4) {
    const [a,b,c]=address.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)
      ||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||(b===0&&c===0)||(b===0&&c===2)||(b===88&&c===99)))
      ||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
  }
  if(family===6) {
    const [a,b]=address.split(':').map(v=>parseInt(v||'0',16));
    return a>=0x2000&&a<=0x3fff&&a!==0x2002&&a!==0x3ffe&&!(a===0x2001&&(b<0x200||b===0xdb8))&&!(a===0x3fff&&b<0x1000);
  }
  return false;
}
function safeHttps(value) {
  try {
    const u=new URL(value),host=u.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'');
    if(u.protocol!=='https:'||u.username||u.password)return null;
    if(net.isIP(host))return isPublicAddress(host)?u.href:null;
    return host.includes('.')&&!/(?:^|\.)(?:localhost|local|internal|home|lan)$/.test(host)?u.href:null;
  } catch {return null;}
}
async function resolvePublicTarget(url,{resolver=dns.lookup,timeoutMs=6000}={}) {
  const host=new URL(url).hostname.replace(/^\[|\]$/g,'');
  if(net.isIP(host)) {
    if(!isPublicAddress(host))throw Object.assign(Error('non-public-address'),{code:'NON_PUBLIC_ADDRESS'});
    return {address:host,family:net.isIP(host)};
  }
  let timer;
  try {
    const addresses=await Promise.race([resolver(host,{all:true,verbatim:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('dns-timeout'),{code:'DNS_TIMEOUT'})),timeoutMs);})]);
    if(!Array.isArray(addresses)||!addresses.length||addresses.some(a=>!isPublicAddress(a.address)))throw Object.assign(Error('non-public-dns-answer'),{code:'NON_PUBLIC_ADDRESS'});
    return {address:addresses[0].address,family:net.isIP(addresses[0].address)};
  } finally {clearTimeout(timer);}
}

function isHtml(buffer) { return /^\s*(?:<!doctype|<html|<head|<body|<script)/i.test(Buffer.from(buffer || '').toString('utf8', 0, 512)); }
function acceptableMime(value='') { return /^(?:audio\/[\w.+-]+|application\/octet-stream)(?:;|$)/i.test(value); }
function decodeAudio(buffer, run = spawnSync) {
  const r = run('ffmpeg', ['-hide_banner','-loglevel','error','-i','pipe:0','-vn','-ac','1','-ar','8000','-t','2','-f','s16le','pipe:1'], {input:buffer,timeout:8000,maxBuffer:128*1024});
  if (r.error) return { decoded:false, state:'unknown', error:r.error.code === 'ENOENT' ? 'ffmpeg-missing' : 'decoder-timeout' };
  if (r.status !== 0 || !r.stdout || r.stdout.length < 3200) return { decoded:false, state:'broken', error:'audio-undecodable' };
  let sum=0, count=0;
  for(let i=0;i+1<r.stdout.length;i+=2){ const n=r.stdout.readInt16LE(i)/32768; sum+=n*n;count++; }
  const meanDb=sum ? Math.round(200*Math.log10(Math.sqrt(sum/count)))/10 : -100;
  return {decoded:true, meanDb, silent:meanDb < -60};
}
/** Une requête bornée ; validation TLS/SNI native obligatoire à CHAQUE redirection. */
async function requestSample(input, {maxBytes=128*1024,timeoutMs=6000,redirects=[],certificates=[],transport=https,resolver=dns.lookup}={}) {
  const url=safeHttps(input);
  if(!url) return Promise.resolve({ok:false,state:'broken',error:'https-required',redirects,certificates});
  if(redirects.length>=5 || redirects.includes(url)) return Promise.resolve({ok:false,state:'broken',error:'redirect-limit',redirects,certificates});
  const deadline=Date.now()+timeoutMs;
  let pin;try{pin=await resolvePublicTarget(url,{resolver,timeoutMs});}catch(e){return {ok:false,state:e.code==='NON_PUBLIC_ADDRESS'?'broken':'unknown',error:e.code||'dns-error',redirects:[...redirects,url],certificates};}
  const remaining=Math.max(1,deadline-Date.now());
  return new Promise(resolve=>{
    let settled=false, response, timer, sampleDone;
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve({...value,redirects:value.redirects||[...redirects,url],certificates:value.certificates||certificates});};
    const req=transport.get(url,{headers:{'User-Agent':'LE-RADAR-Health/1.0','Icy-MetaData':'0'},timeout:remaining,agent:false,lookup:(host,options,callback)=>{if(host!==new URL(url).hostname)return callback(Object.assign(Error('lookup-host-mismatch'),{code:'LOOKUP_HOST_MISMATCH'}));if(options?.all)callback(null,[pin]);else callback(null,pin.address,pin.family);}},res=>{
      response=res;
      const peer=res.socket.getPeerCertificate(true);
      if(!res.socket.authorized || !peer?.valid_to){res.destroy();return finish({ok:false,state:'unknown',error:'certificate-unverified'});}
      const expiry=Date.parse(peer.valid_to);
      if(!Number.isFinite(expiry)){res.destroy();return finish({ok:false,state:'unknown',error:'certificate-date-unknown'});}
      const cert={url,address:pin.address,expiresAt:new Date(expiry).toISOString()};
      certificates=[...certificates,cert];
      const seen=new Set([peer.fingerprint256]);let issuer=peer.issuerCertificate;
      while(issuer?.valid_to && !seen.has(issuer.fingerprint256) && seen.size<8) {
        seen.add(issuer.fingerprint256);
        const expires=Date.parse(issuer.valid_to);
        if(Number.isFinite(expires))certificates.push({url,expiresAt:new Date(expires).toISOString(),kind:'issuer'});
        issuer=issuer.issuerCertificate;
      }
      if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){
        let next;try{next=new URL(res.headers.location,url).href;}catch{res.destroy();return finish({ok:false,state:'broken',error:'invalid-redirect'});}
        clearTimeout(timer);res.destroy();
        if(!safeHttps(next))return finish({ok:false,state:'broken',error:'https-downgrade'});
        requestSample(next,{maxBytes,timeoutMs,redirects:[...redirects,url],certificates,transport,resolver}).then(finish);return;
      }
      const chunks=[];let bytes=0;
      res.on('data',chunk=>{chunks.push(chunk.subarray(0,Math.max(0,maxBytes-bytes)));bytes+=chunk.length;if(bytes>=maxBytes)res.destroy();});
      const done=()=>finish({ok:res.statusCode===200,status:res.statusCode,mime:res.headers['content-type']||'',icyName:res.headers['icy-name']||'',body:Buffer.concat(chunks),url,state:res.statusCode===200?'received':'unknown',error:res.statusCode===200?'':`http-${res.statusCode}`});
      sampleDone=done;
      res.on('end',done);res.on('close',done);res.on('error',()=>finish({ok:false,state:'unknown',error:'response-error'}));
    });
    req.on('error',e=>finish({ok:false,state:/CERT|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/.test(e.code||'')?'broken':'unknown',error:e.code||'network-error'}));
    req.on('timeout',()=>{req.destroy();finish({ok:false,state:'unknown',error:'network-timeout'});});
    timer=setTimeout(()=>{if(sampleDone)sampleDone();else finish({ok:false,state:'unknown',error:'sample-timeout'});response?.destroy();req.destroy();},remaining);
  });
}
function officialCandidates(text, source, radio={}) {
  if(!safeHttps(source)||!radio.id)return [];
  // Ne jamais considérer un lien générique, une publicité ou un script comme lecteur.
  const html=String(text).replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
  const stack=[],found=[];let audioIndex=0;
  const voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  const attrValue=v=>String(v).replace(/&amp;/g,'&').replace(/&#(?:x([a-f0-9]+)|(\d+));/gi,(_,hex,num)=>{const code=parseInt(hex||num,hex?16:10);return code<=0x10ffff?String.fromCodePoint(code):'�';});
  for(const token of html.matchAll(/<\/?([a-z][\w:-]*)\b[^>]*>/gi)) {
    const raw=token[0],tag=token[1].toLowerCase();
    if(raw.startsWith('</')){const i=stack.map(n=>n.tag).lastIndexOf(tag);if(i>=0)stack.length=i;continue;}
    const attrs={};for(const m of raw.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[m[1].toLowerCase()]=attrValue(m[2]??m[3]??m[4]);
    const node={tag,attrs,raw,index:tag==='audio'?++audioIndex:null};
    const ancestry=[...stack,node],audio=tag==='audio'?node:[...stack].reverse().find(n=>n.tag==='audio');
    if((tag==='audio'||tag==='source')&&audio&&(attrs.src||attrs['data-stream-api'])) {
      const explicit=ancestry.some(n=>(n.attrs['data-station']===radio.id||n.attrs['data-station-id']===radio.id)&&['true','1'].includes(n.attrs['data-live']));
      // Ancre CISM vérifiée sur son site officiel ; aucun sélecteur partenaire générique.
      const cism=radio.id==='cism'&&new URL(source).hostname.replace(/^www\./,'')==='cism893.ca'
        &&ancestry.some(n=>n.tag==='header')&&ancestry.some(n=>(n.attrs.class||'').split(/\s+/).includes('element-audio-player-live'));
      if(!explicit&&!cism)continue;
      const attribute=attrs['data-stream-api']?'data-stream-api':'src',value=attrs[attribute];
      let url;try{url=safeHttps(new URL(value,source).href);}catch{continue;}
      if(url)found.push({url,source,kind:attribute==='data-stream-api'?'official-api-reference':'official-player',evidence:{stationId:radio.id,selector:cism?'header .element-audio-player-live audio':'[data-station][data-live] audio',attribute,value,element:raw.slice(0,500),audioIndex:audio.index}});
    }
    if(!voids.has(tag)&&!raw.endsWith('/>'))stack.push(node);
  }
  // Plusieurs lecteurs live distincts = ambiguïté ; pas de substitution automatique.
  if(new Set(found.map(c=>c.evidence.audioIndex)).size>1)return [];
  return [...new Map(found.map(c=>[c.url,c])).values()].slice(0,4);
}

function needsAudio(previous, now=Date.now(), url='') { const at=Date.parse(previous?.audio?.checkedAt); return (!!url&&(safeHttps(previous?.url)!==safeHttps(url)||previous?.audio?.url!==safeHttps(url))) || previous?.state!=='working' || !previous?.audio?.decoded || !Number.isFinite(at) || now-at>=20*3600000; }
async function inspect(url, previous={}, {now=Date.now(),probe=requestSample,decode=decodeAudio,forceAudio=false}={}) {
  const audioDue=forceAudio||needsAudio(previous,now,url);
  const result=await probe(url,{maxBytes:audioDue?128*1024:2048});
  const base={url,checkedAt:new Date(now).toISOString(),redirects:result.redirects||[],certificates:result.certificates||[],mime:result.mime||'',icyName:result.icyName||'',status:result.status||null};
  if(!result.ok)return {...base,state:result.state||'unknown',error:result.error||'probe-failed'};
  if(!base.certificates.length)return {...base,state:'unknown',error:'certificate-unknown'};
  const bands=base.certificates.map(c=>expiryBand(c.expiresAt,now));
  if(bands.includes('expired'))return {...base,state:'broken',error:'certificate-expired',expiry:'expired'};
  if(bands.includes('unknown'))return {...base,state:'unknown',error:'certificate-date-unknown',expiry:'unknown'};
  base.expiry=['2d','7d','14d'].find(b=>bands.includes(b))||'ok';
  if(!acceptableMime(result.mime)||isHtml(result.body))return {...base,state:'broken',error:'not-audio'};
  if(!result.body?.length)return {...base,state:'unknown',error:'empty-sample'};
  const audio=audioDue ? {...decode(result.body),url:safeHttps(url),checkedAt:base.checkedAt} : previous.audio;
  if(!audio?.decoded)return {...base,audio,state:audio?.state||'unknown',error:audio?.error||'decode-unconfirmed'};
  return {...base,audio,state:'working',error:''};
}
function updateRecord(previous={}, observation, now=Date.now()) {
  const ok=observation.state==='working';
  const fingerprint=[observation.url||'',observation.state,observation.error||'',observation.expiry||'',observation.audio?.silent?'silent':''].join('|');
  const oldFingerprint=previous.fingerprint||'';
  const history=[...(previous.history||[])];
  if(fingerprint!==oldFingerprint)history.push({at:new Date(now).toISOString(),url:observation.url,fingerprint});
  const lastSuccessEvidence=ok?{url:observation.url,checkedAt:observation.checkedAt,certificates:observation.certificates,audio:observation.audio,provenance:observation.provenance}:previous.lastSuccessEvidence||null;
  const adoption=observation.adoption||(previous.adoption?.url===observation.url?previous.adoption:undefined);
  return {...observation,...(adoption?{adoption}:{}),fingerprint,lastSuccessEvidence,lastSuccess:ok?observation.checkedAt:previous.lastSuccess||null,failures:ok?0:(previous.failures||0)+1,history:history.slice(-12)};
}
function healthProblems(report, now=Date.now()) {
  const checked=Date.parse(report?.checkedAt);
  if(!Number.isFinite(checked) || now-checked>STALE_MS || checked>now+300000)return ['Surveillance radio périmée ou absente (seuil 14 h).'];
  const problems=[];
  if(!Object.keys(report.stations||{}).length || (report.total!=null && report.total!==Object.keys(report.stations||{}).length))problems.push('Surveillance radio incomplète.');
  for(const [id,r]of Object.entries(report.stations||{})) {
    if(r.state!=='working')problems.push(`Radio ${id} : ${r.state} (${r.error||'non confirmé'}).`);
    else if(r.expiry!=='ok')problems.push(`Radio ${id} : échéance TLS ≤ ${r.expiry} (certificat tiers, intervention station si nécessaire).`);
    if(r.audio?.silent)problems.push(`Radio ${id} : échantillon décodable mais silencieux.`);
  }
  return problems;
}
function verifiedAdoption(radio, record, now=Date.now()) {
  const proof=record?.adoption;
  if(!proof)return false;
  const sources=new Set([radio?.website,radio?.listenUrl].map(safeHttps).filter(Boolean));
  const at=Date.parse(proof.at),audioAge=at-Date.parse(proof.audio?.checkedAt);
  return !!(safeHttps(radio?.stream)&&proof.url===radio.stream&&proof.stationId===radio.id
    && Number.isFinite(at)&&at<=now+300000&&proof.provenance&&sources.has(safeHttps(proof.provenance.source))
    && ['official-player','official-playlist'].includes(proof.provenance.kind)
    && proof.provenance.evidence?.stationId===radio.id
    && JSON.stringify(radio._streamProvenance)===JSON.stringify(proof.provenance)
    && proof.audio?.decoded&&proof.audio.url===safeHttps(proof.url)&&Number.isFinite(audioAge)&&audioAge>=0&&audioAge<=AUDIO_TTL
    && proof.certificates?.length&&proof.certificates.every(c=>Date.parse(c.expiresAt)>at)
    && proof.redirects?.length&&proof.redirects[0]===safeHttps(proof.url)&&proof.redirects.every(safeHttps));
}

module.exports={isPublicAddress,resolvePublicTarget,verifiedAdoption,DAY,AUDIO_TTL,STALE_MS,expiryBand,safeHttps,isHtml,acceptableMime,decodeAudio,requestSample,officialCandidates,needsAudio,inspect,updateRecord,healthProblems};

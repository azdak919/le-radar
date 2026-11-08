'use strict';
// Aucun secret, service externe ni assouplissement TLS. Entrées/sorties testables hors réseau.
const https = require('https');
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
function safeHttps(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
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
function requestSample(input, {maxBytes=128*1024,timeoutMs=6000,redirects=[],certificates=[],transport=https}={}) {
  const url=safeHttps(input);
  if(!url) return Promise.resolve({ok:false,state:'broken',error:'https-required',redirects,certificates});
  if(redirects.length>=5 || redirects.includes(url)) return Promise.resolve({ok:false,state:'broken',error:'redirect-limit',redirects,certificates});
  return new Promise(resolve=>{
    let settled=false, response, timer, sampleDone;
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve({...value,redirects:value.redirects||[...redirects,url],certificates:value.certificates||certificates});};
    const req=transport.get(url,{headers:{'User-Agent':'LE-RADAR-Health/1.0','Icy-MetaData':'0'},timeout:timeoutMs},res=>{
      response=res;
      const peer=res.socket.getPeerCertificate(true);
      if(!res.socket.authorized || !peer?.valid_to){res.destroy();return finish({ok:false,state:'unknown',error:'certificate-unverified'});}
      const expiry=Date.parse(peer.valid_to);
      if(!Number.isFinite(expiry)){res.destroy();return finish({ok:false,state:'unknown',error:'certificate-date-unknown'});}
      const cert={url,expiresAt:new Date(expiry).toISOString()};
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
        requestSample(next,{maxBytes,timeoutMs,redirects:[...redirects,url],certificates,transport}).then(finish);return;
      }
      const chunks=[];let bytes=0;
      res.on('data',chunk=>{chunks.push(chunk.subarray(0,Math.max(0,maxBytes-bytes)));bytes+=chunk.length;if(bytes>=maxBytes)res.destroy();});
      const done=()=>finish({ok:res.statusCode===200,status:res.statusCode,mime:res.headers['content-type']||'',body:Buffer.concat(chunks),url,state:res.statusCode===200?'received':'unknown',error:res.statusCode===200?'':`http-${res.statusCode}`});
      sampleDone=done;
      res.on('end',done);res.on('close',done);res.on('error',()=>finish({ok:false,state:'unknown',error:'response-error'}));
    });
    req.on('error',e=>finish({ok:false,state:/CERT|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/.test(e.code||'')?'broken':'unknown',error:e.code||'network-error'}));
    req.on('timeout',()=>{req.destroy();finish({ok:false,state:'unknown',error:'network-timeout'});});
    timer=setTimeout(()=>{if(sampleDone)sampleDone();else finish({ok:false,state:'unknown',error:'sample-timeout'});response?.destroy();req.destroy();},timeoutMs);
  });
}
function officialCandidates(text, source) {
  if(!safeHttps(source))return [];
  const plain=String(text).replace(/\\u002[fF]/g,'/').replace(/\\\//g,'/').replace(/&amp;/g,'&');
  const urls=plain.match(/https:\/\/[^\s"'<>\\)\]]+/g)||[];
  const unique=[...new Set(urls.map(safeHttps).filter(Boolean))];
  return unique.filter(u=>/stream|listen|icecast|radiomast|radioca|\.m3u8?(?:\?|$)|\.pls(?:\?|$)/i.test(u)&&!/(?:doubleclick|google-analytics|facebook|youtube|\.js(?:\?|$)|\.css(?:\?|$))/i.test(u))
    .slice(0,8).map(url=>({url,source,kind:'official-page'}));
}
function needsAudio(previous, now=Date.now()) { const at=Date.parse(previous?.audio?.checkedAt); return previous?.state!=='working' || !previous?.audio?.decoded || !Number.isFinite(at) || now-at>AUDIO_TTL; }
async function inspect(url, previous={}, {now=Date.now(),probe=requestSample,decode=decodeAudio,forceAudio=false}={}) {
  const audioDue=forceAudio||needsAudio(previous,now);
  const result=await probe(url,{maxBytes:audioDue?128*1024:2048});
  const base={url,checkedAt:new Date(now).toISOString(),redirects:result.redirects||[],certificates:result.certificates||[],mime:result.mime||'',status:result.status||null};
  if(!result.ok)return {...base,state:result.state||'unknown',error:result.error||'probe-failed'};
  if(!base.certificates.length)return {...base,state:'unknown',error:'certificate-unknown'};
  const bands=base.certificates.map(c=>expiryBand(c.expiresAt,now));
  if(bands.includes('expired'))return {...base,state:'broken',error:'certificate-expired',expiry:'expired'};
  if(bands.includes('unknown'))return {...base,state:'unknown',error:'certificate-date-unknown',expiry:'unknown'};
  base.expiry=['2d','7d','14d'].find(b=>bands.includes(b))||'ok';
  if(!acceptableMime(result.mime)||isHtml(result.body))return {...base,state:'broken',error:'not-audio'};
  if(!result.body?.length)return {...base,state:'unknown',error:'empty-sample'};
  const audio=audioDue ? {...decode(result.body),checkedAt:base.checkedAt} : previous.audio;
  if(!audio?.decoded)return {...base,audio,state:audio?.state||'unknown',error:audio?.error||'decode-unconfirmed'};
  return {...base,audio,state:'working',error:''};
}
function updateRecord(previous={}, observation, now=Date.now()) {
  const ok=observation.state==='working';
  const fingerprint=[observation.state,observation.error||'',observation.expiry||'',observation.audio?.silent?'silent':''].join('|');
  const oldFingerprint=previous.fingerprint||'';
  const history=[...(previous.history||[])];
  if(fingerprint!==oldFingerprint)history.push({at:new Date(now).toISOString(),fingerprint});
  return {...observation,fingerprint,lastSuccess:ok?observation.checkedAt:previous.lastSuccess||null,failures:ok?0:(previous.failures||0)+1,history:history.slice(-12)};
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
module.exports={DAY,AUDIO_TTL,STALE_MS,expiryBand,safeHttps,isHtml,acceptableMime,decodeAudio,requestSample,officialCandidates,needsAudio,inspect,updateRecord,healthProblems};

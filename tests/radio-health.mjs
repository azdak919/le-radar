import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const lib=require('../scripts/radio-health-lib');
const checker=require('../scripts/check-radio-health');
const discover=require('../scripts/discover-streams');
const now=Date.parse('2026-11-08T17:00:00Z'),at=new Date(now).toISOString();
for(const [days,expected]of [[15,'ok'],[14,'14d'],[7,'7d'],[2,'2d'],[0,'expired'],[-1,'expired']])assert.equal(lib.expiryBand(new Date(now+days*lib.DAY).toISOString(),now),expected);
assert.equal(lib.expiryBand('?',now),'unknown');
assert.equal(lib.expiryBand(new Date(now+90*lib.DAY).toISOString(),now),'ok');
assert.equal(lib.safeHttps('http://example.org/'),null);assert.equal(lib.safeHttps('https://x:y@example.org/'),null);
const good={ok:true,status:200,url:'https://audio.example/live',mime:'audio/mpeg',body:Buffer.from('MP3 data'),redirects:['https://audio.example/live'],certificates:[{url:'https://audio.example/live',expiresAt:new Date(now+90*lib.DAY).toISOString()}]};
const inspect=(overrides={},decode=()=>({decoded:true,meanDb:-15,silent:false}),previous={})=>lib.inspect(good.url,previous,{now,probe:async()=>({...good,...overrides}),decode});
assert.equal((await inspect()).state,'working');
assert.equal((await inspect({mime:'text/html',body:Buffer.from('<html>200') })).state,'broken');
assert.equal((await inspect({mime:'audio/mpeg',body:Buffer.from('<!DOCTYPE html>error')})).state,'broken');
assert.equal((await inspect({body:Buffer.alloc(0)})).state,'unknown');
assert.equal((await inspect({ok:false,state:'unknown',error:'network-timeout'})).state,'unknown');
assert.equal((await inspect({certificates:[]})).state,'unknown');
assert.equal((await inspect({certificates:[{expiresAt:at}]})).error,'certificate-expired');
assert.equal((await inspect({},()=>({decoded:false,state:'broken',error:'audio-undecodable'}))).state,'broken');
assert.equal((await inspect({},()=>({decoded:false,state:'unknown',error:'ffmpeg-missing'}))).state,'unknown');
assert.equal((await inspect({},()=>({decoded:true,silent:true,meanDb:-100}))).state,'working');
assert.equal(lib.needsAudio({state:'working',audio:{decoded:true}},now),true);
const cached={url:good.url,state:'working',audio:{decoded:true,url:good.url,checkedAt:at}};
assert.equal(lib.needsAudio(cached,now),false);assert.equal(lib.needsAudio(cached,now+27*3600000),true);
await inspect({},()=>{throw Error('should reuse fresh decoded sample');},cached);
assert.equal((await lib.requestSample('http://audio.example/live')).error,'https-required');
const resolver=async()=>[{address:'93.184.216.34',family:4}];
function fakeTransport(location) {
  return {get(url,options,cb){const req=new EventEmitter();req.destroy=()=>{};queueMicrotask(()=>{
    const res=new EventEmitter();res.statusCode=302;res.headers={location};res.socket={authorized:true,getPeerCertificate:()=>({valid_to:new Date(now+90*lib.DAY).toUTCString()})};res.destroy=()=>{};cb(res);
  });return req;}};
}
assert.equal((await lib.requestSample(good.url,{resolver,transport:fakeTransport('http://unsafe.example/live')})).error,'https-downgrade');
assert.equal((await lib.requestSample(good.url,{resolver,transport:fakeTransport(good.url)})).error,'redirect-limit');
const candidates=lib.officialCandidates('<header><div class="element-audio-player-live"><audio src="https://stream.cism893.ca/"></audio></div></header>','https://cism893.ca/',{id:'cism'});
assert.equal(candidates.length,1);assert.equal(candidates[0].url,'https://stream.cism893.ca/');assert.equal(candidates[0].evidence.selector,'header .element-audio-player-live audio');
assert.deepEqual(lib.officialCandidates('<a href="https://other.example/stream">Partenaire</a><audio src="https://other.example/listen"></audio>','https://station.example/',{id:'a'}),[]);

const r={id:'a',name:'A',stream:'https://old.example/live',website:'https://station.example/'};
const failed={url:r.stream,state:'broken',error:'CERT_HAS_EXPIRED',checkedAt:at};
const valid={...good,url:'https://new.example/live',state:'working',expiry:'ok',checkedAt:at,redirects:['https://new.example/live'],audio:{decoded:true,url:'https://new.example/live',checkedAt:at,meanDb:-15}};
const no=await checker.checkRadio(r,{}, {now,inspect:async()=>failed,alternatives:async()=>[]});
assert.equal(no.entry.stream,r.stream);assert.equal(no.entry._streamStatus,'broken');
const guessed=await checker.checkRadio(r,{}, {now,inspect:async()=>failed,alternatives:async()=>[{url:valid.url}]});assert.equal(guessed.entry.stream,r.stream);
const repaired=await checker.checkRadio(r,{}, {now,inspect:async url=>url===r.stream?failed:valid,alternatives:async()=>[{url:valid.url,source:r.website,kind:'official-player',evidence:{stationId:r.id,selector:'[data-station][data-live] audio',attribute:'src',value:valid.url}}]});
assert.equal(repaired.entry.stream,valid.url);assert.equal(repaired.record.provenance.source,r.website);
const isolated=await checker.checkAll([r,{...r,id:'b',stream:valid.url}],{}, {now,inspect:async url=>{if(url===r.stream)throw Error('isolated');return valid;},alternatives:async()=>[]});
assert.equal(isolated.report.stations.a.state,'unknown');assert.equal(isolated.report.stations.b.state,'working');
assert.equal(discover.applyStreamToRadio(r,{stream:null,checked:at})._streamStatus,'unknown');
let previous=lib.updateRecord({},failed,now);const same=lib.updateRecord(previous,{...failed,checkedAt:new Date(now+1000).toISOString()},now+1000);
assert.equal(same.history.length,1);assert.equal(same.fingerprint,previous.fingerprint);
previous=lib.updateRecord(same,valid,now+2000);assert.equal(previous.history.length,2);assert.equal(previous.failures,0);assert.equal(previous.lastSuccess,at);
assert.equal(lib.healthProblems({checkedAt:at,stations:{a:previous}},now).length,0);
assert.match(lib.healthProblems({checkedAt:at,stations:{}},now+15*3600000)[0],/périmée/);
assert.match(lib.healthProblems({checkedAt:at,stations:{a:{...previous,expiry:'2d'}}},now)[0],/2d/);
for(let i=0;i<30;i++)previous=lib.updateRecord(previous,i%2?valid:failed,now+i);assert.equal(previous.history.length,12);
const player={PROXY_BASE:'',location:{protocol:'https:'}};vm.createContext(player);vm.runInContext(readFileSync(new URL('../radar-utils.js',import.meta.url),'utf8'),player);
assert.equal(vm.runInContext('getPlayableStream({stream:"https://x/live",_streamStatus:"broken"})',player),null);
assert.equal(vm.runInContext('getPlayableStream({stream:"https://x/live",_streamStatus:"working"})',player),'https://x/live');
const missing=lib.decodeAudio(Buffer.alloc(0),()=>({error:{code:'ENOENT'}}));assert.equal(missing.state,'unknown');
assert.equal(lib.decodeAudio(Buffer.from('HTML'),()=>({status:1,stdout:Buffer.alloc(0)})).state,'broken');
// Véritable décodage local si ffmpeg est installé ; sans lui : résultat inconnu, jamais working.
const pcm=Buffer.alloc(16000*2);for(let i=0;i<16000;i++)pcm.writeInt16LE(Math.round(5000*Math.sin(i*2*Math.PI*440/8000)),i*2);
const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(pcm.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(8000,24);header.writeUInt32LE(16000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
const real=lib.decodeAudio(Buffer.concat([header,pcm]));if(real.error==='ffmpeg-missing')console.log('radio-health: ffmpeg absent => unknown (test réel à exécuter sur runner radio)');else{assert.equal(real.decoded,true);assert.equal(real.silent,false);console.log('radio-health: vrai WAV décodé par ffmpeg');}
console.log('radio-health: OK');
assert.match(lib.healthProblems({checkedAt:'bad',stations:{}},now)[0],/périmée/);
assert.match(lib.healthProblems({checkedAt:at,stations:{}},now)[0],/incomplète/);
const falseSource=await checker.checkRadio(r,{}, {now,inspect:async()=>failed,alternatives:async()=>[{url:valid.url,source:'https://unofficial.example/'}]});assert.equal(falseSource.entry.stream,r.stream);
const p=require('../scripts/platform-health-lib');
const fingerprint=body=>body.match(/radar-health:[a-f0-9]+/)[0];
assert.equal(fingerprint(p.renderBody(['x'],'yesterday')),fingerprint(p.renderBody(['x'],'today')));
assert.notEqual(fingerprint(p.renderBody(['x'])),fingerprint(p.renderBody([])));
function partialTransport(empty=false) {return {get(url,opts,cb){assert.notEqual(opts.rejectUnauthorized,false);const req=new EventEmitter();req.destroy=()=>{};queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;res.headers={'content-type':'audio/mpeg'};res.socket={authorized:true,getPeerCertificate:()=>({valid_to:new Date(now+90*lib.DAY).toUTCString()})};res.destroy=()=>{};cb(res);if(!empty)res.emit('data',Buffer.from('partial audio'));});return req;}};}
const partial=await lib.requestSample(good.url,{resolver,transport:partialTransport(),timeoutMs:20});assert.equal(partial.ok,true);assert.equal(partial.body.toString(),'partial audio');
const empty=await lib.requestSample(good.url,{resolver,transport:partialTransport(true),timeoutMs:20});assert.equal(empty.body.length,0);
console.log('radio-health: budget sample, stale, source exacte, empreinte OK');
const migrated=repaired.entry;
assert.equal(lib.verifiedAdoption(migrated,repaired.record,now),true);
for(const brokenProof of [{...repaired.record.adoption,audio:{decoded:false}},{...repaired.record.adoption,certificates:[]},{...repaired.record.adoption,redirects:['http://bad.example/live']},{...repaired.record.adoption,provenance:{...repaired.record.provenance,source:'https://unofficial.example/'}}])assert.equal(lib.verifiedAdoption(migrated,{...repaired.record,adoption:brokenProof},now),false);

const junk=await checker.checkRadio(r,{}, {now,inspect:async url=>url===r.stream?failed:valid,alternatives:async()=>[{url:'https://ecoutez.chyz.ca/proxy/tech/stream',source:r.website,kind:'official-player',evidence:{stationId:r.id,selector:'[data-station][data-live] audio',attribute:'src',value:valid.url}}]});assert.equal(junk.entry.stream,r.stream);
console.log('radio-health: migration durable strictement prouvée, mount technique refusé');
assert.equal(fingerprint(p.renderBody(['PR ouverte depuis 31 j'])),fingerprint(p.renderBody(['PR ouverte depuis 32 j'])));
const oldWorking=lib.updateRecord({}, {...valid,url:'https://older.example/live'},now);
const newWorking=lib.updateRecord(oldWorking,valid,now+1000);assert.equal(newWorking.history.length,2);assert.equal(newWorking.history[1].url,valid.url);
const laterFailed=lib.updateRecord(newWorking,failed,now+2000);assert.equal(laterFailed.lastSuccessEvidence.url,valid.url);
console.log('radio-health: transitions URL, dernière preuve et anti-spam des âges OK');
// P1 : aucune connexion vers une adresse locale, privée, documentaire ou réservée.
for(const address of ['127.0.0.1','0.0.0.0','10.1.2.3','100.64.1.1','169.254.169.254','172.16.0.1','192.168.0.1','192.0.2.10','198.18.0.1','198.51.100.1','203.0.113.1','224.1.1.1','255.255.255.255','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::','3ffe::1','3fff::1'])assert.equal(lib.isPublicAddress(address),false,address);
for(const address of ['8.8.8.8','93.184.216.34','2606:4700:4700::1111','2001:4860:4860::8888'])assert.equal(lib.isPublicAddress(address),true,address);
for(const url of ['https://localhost/','https://foo.localhost/','https://127.0.0.1/','https://2130706433/','https://0x7f000001/','https://[::1]/','https://[::ffff:127.0.0.1]/'])assert.equal(lib.safeHttps(url),null,url);
let connections=0;
const neverConnect={get(){connections++;throw Error('private connection must not happen');}};
assert.equal((await lib.requestSample(good.url,{resolver:async()=>[{address:'127.0.0.1',family:4}],transport:neverConnect})).error,'NON_PUBLIC_ADDRESS');
assert.equal((await lib.requestSample(good.url,{resolver:async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}],transport:neverConnect})).error,'NON_PUBLIC_ADDRESS');assert.equal(connections,0);
let resolutions=0,pinned;
const rebindingResolver=async()=>++resolutions===1?[{address:'93.184.216.34',family:4}]:[{address:'127.0.0.1',family:4}];
const pinnedTransport={get(url,opts,cb){opts.lookup(new URL(url).hostname,{all:true},(err,addresses)=>{assert.ifError(err);pinned=addresses;});return partialTransport().get(url,opts,cb);}};
assert.equal((await lib.requestSample(good.url,{resolver:rebindingResolver,transport:pinnedTransport,timeoutMs:20})).ok,true);assert.equal(resolutions,1);assert.equal(pinned[0].address,'93.184.216.34');
let redirectConnections=0;
const privateRedirect={get(...args){redirectConnections++;return fakeTransport('https://private.example/live').get(...args);}};
const redir=await lib.requestSample(good.url,{resolver:async host=>[{address:host==='private.example'?'10.0.0.1':'93.184.216.34',family:4}],transport:privateRedirect});assert.equal(redir.error,'NON_PUBLIC_ADDRESS');assert.equal(redirectConnections,1);
// P2 : la présence d'un flux partenaire décodable ne lui donne pas l'identité de la station.
const partnerHtml='<h1>Station A</h1><aside><a href="https://partner.example/stream">Écouter partenaire</a><div data-station="partner" data-live="true"><audio src="https://partner.example/stream"></audio></div></aside>';
let partnerInspections=0;
const partnerCheck=await checker.checkRadio(r,{}, {now,inspect:async url=>{partnerInspections++;return url===r.stream?failed:valid;},probe:async()=>({ok:true,mime:'text/html',body:Buffer.from(partnerHtml)})});assert.equal(partnerCheck.entry.stream,r.stream);assert.equal(partnerInspections,1);
assert.deepEqual(lib.officialCandidates('<script>"<audio data-station=\"a\" data-live=\"true\" src=\"https://partner.example/stream\">"</script>',r.website,r),[]);
const identified=lib.officialCandidates('<div data-station="a" data-live="true"><audio src="https://new.example/live"></audio></div>',r.website,r);assert.equal(identified.length,1);assert.equal(identified[0].evidence.stationId,'a');
// P3 : octets invalides sur nouvel endpoint => nouveau décodage obligatoire.
let decodeCalls=0;
const changed=await lib.inspect('https://changed.example/live',cached,{now,probe:async()=>good,decode:()=>{decodeCalls++;return {decoded:false,state:'broken',error:'audio-undecodable'};}});assert.equal(decodeCalls,1);assert.equal(changed.state,'broken');
// P4 : adoption durable distincte de la disponibilité courante et de l'âge du rapport.
const failedAfterMigration=await checker.checkRadio(migrated,repaired.record,{now:now+3600000,inspect:async()=>({...failed,url:valid.url,checkedAt:new Date(now+3600000).toISOString()}),alternatives:async()=>[]});
assert.equal(failedAfterMigration.entry._streamStatus,'broken');assert.equal(lib.verifiedAdoption(failedAfterMigration.entry,failedAfterMigration.record,now+100*lib.DAY),true);
assert.equal(vm.runInContext(`getPlayableStream(${JSON.stringify(failedAfterMigration.entry)})`,player),null);
assert.match(lib.healthProblems({checkedAt:at,stations:{a:failedAfterMigration.record}},now+100*lib.DAY)[0],/périmée/);
const recovery=await checker.checkRadio(failedAfterMigration.entry,failedAfterMigration.record,{now:now+2*3600000,inspect:async()=>({...valid,checkedAt:new Date(now+2*3600000).toISOString()}),alternatives:async()=>[]});assert.equal(recovery.entry._streamStatus,'working');assert.equal(lib.verifiedAdoption(recovery.entry,recovery.record,now+2*3600000),true);
console.log('radio-health P1/P2/P3/P4 : DNS/IP épinglés, partenaire refusé, endpoint redécodé, adoption/panne/rétablissement OK');

// API/playlist : seul un lecteur principal identifié peut référencer la ressource.
const apiHtml='<audio data-station="a" data-live="true" data-stream-api="https://api.example/live"></audio>';
for(const stationId of ['partner','a']) {
 const alternatives=await checker.publishedAlternatives(r,{probe:async url=>url===r.website?{ok:true,mime:'text/html',body:Buffer.from(apiHtml)}:{ok:true,mime:'application/json',body:Buffer.from(JSON.stringify({stationId,audio_stream_uri:valid.url}))}});
 assert.equal(alternatives.length,stationId==='a'?1:0);if(alternatives.length)assert.equal(alternatives[0].evidence.apiStationId,'a');
}
const playlist=await checker.publishedAlternatives(r,{probe:async url=>url===r.website?{ok:true,mime:'text/html',body:Buffer.from('<audio data-station="a" data-live="true" src="https://station.example/live.pls"></audio>')}:{ok:true,mime:'audio/x-scpls',body:Buffer.from('[playlist]\nFile1='+valid.url+'\nFile2=http://downgrade.example/live')}});
assert.equal(playlist.length,1);assert.equal(playlist[0].kind,'official-playlist');assert.equal(playlist[0].evidence.playlistLine,2);
const exceptionAfterAdoption=await checker.checkAll([migrated],{stations:{a:repaired.record}},{now,inspect:async()=>{throw Error('station exception');}});
assert.equal(exceptionAfterAdoption.radios[0]._streamStatus,'unknown');assert.equal(lib.verifiedAdoption(exceptionAfterAdoption.radios[0],exceptionAfterAdoption.report.stations.a,now),true);
console.log('radio-health: API identité exacte, playlist principale et adoption durable après exception OK');

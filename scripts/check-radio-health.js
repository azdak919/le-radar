#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const lib=require('./radio-health-lib');
const silence=require('./stream-silence-lib');
const discovery=require('./discover-streams');
const ROOT=path.join(__dirname,'..');
async function publishedAlternatives(radio,{probe=lib.requestSample}={}) {
  const candidates=[];
  for(const source of [...new Set([radio.website,radio.listenUrl].filter(lib.safeHttps))].slice(0,2)) {
    const page=await probe(source,{maxBytes:256*1024});
    if(!page.ok || !/text\/html|application\/json/i.test(page.mime||''))continue;
    const text=page.body.toString('utf8');
    candidates.push(...lib.officialCandidates(text,source,radio));
  }
  const unique=[...new Map(candidates.map(c=>[c.url,c])).values()];
  const expanded=[];
  for(const candidate of unique.slice(0,4)) {
    if(candidate.kind==='official-api-reference') {
      const response=await probe(candidate.url,{maxBytes:32768});
      if(!response.ok||!/application\/json/i.test(response.mime||''))continue;
      let data;try{data=JSON.parse(response.body.toString('utf8'));}catch{continue;}
      const url=lib.safeHttps(data.audio_stream_uri);
      if(url&&data.stationId===radio.id)expanded.push({url,source:candidate.source,kind:'official-player',evidence:{...candidate.evidence,apiUrl:candidate.url,apiField:'audio_stream_uri',apiStationId:data.stationId}});
    } else if(/\.(?:m3u8?|pls)(?:\?|$)/i.test(candidate.url)) {
      const list=await probe(candidate.url,{maxBytes:32768});
      if(list.ok) {
        const text=list.body.toString('utf8');
        if(/#EXT-X-/i.test(text))continue;
        const lines=text.split(/\r?\n/);
        for(const [index,line]of lines.entries()) {
          const match=line.match(/^File\d+=(.+)$/i),value=match?match[1]:(!line.trim().startsWith('#')?line.trim():'');
          if(!value||(!match&&!/^https:\/\//i.test(value)))continue;
          let url;try{url=lib.safeHttps(new URL(value,candidate.url).href);}catch{continue;}
          if(url)expanded.push({url,source:candidate.source,playlist:candidate.url,kind:'official-playlist',evidence:{...candidate.evidence,playlistLine:index+1,playlistValue:value}});
        }
      }
    } else expanded.push(candidate);
  }
  return [...new Map(expanded.map(c=>[c.url,c])).values()].slice(0,4);
}
async function checkRadio(radio,previous={},deps={}) {
  const now=deps.now??Date.now(),inspect=deps.inspect||lib.inspect;
  let result=await inspect(radio.stream,previous,{...deps,now});
  const primary=result;
  if(result.state!=='working'||result.expiry==='2d') {
    // L'absence du décodeur est un incident du contrôle, pas une panne de station.
    if(result.error!=='ffmpeg-missing')for(const candidate of await (deps.alternatives||publishedAlternatives)(radio,deps)) {
      const sources=new Set([radio.website,radio.listenUrl].map(lib.safeHttps).filter(Boolean));
      if(candidate.url===radio.stream||!lib.safeHttps(candidate.url)||!sources.has(lib.safeHttps(candidate.source))||discovery.isJunkStreamUrl(candidate.url)||candidate.evidence?.stationId!==radio.id||!['official-player','official-playlist'].includes(candidate.kind))continue;
      const canonical=discovery.canonicalizeStreamUrl(candidate.url)||candidate.url;
      const alternative=await inspect(canonical,{}, {...deps,now,forceAudio:true});
      if(alternative.state==='working'&&alternative.audio?.decoded&&alternative.expiry!=='2d'&&!discovery.isJunkIcyName(alternative.icyName)) {
        result={...alternative,provenance:{...candidate,...(canonical!==candidate.url?{publishedUrl:candidate.url,canonicalizer:'existing-radio-cdn'}:{})},replacedUrl:radio.stream,primaryError:primary.error||'certificate-soon'};break;
      }
    }
  }
  if(!result.provenance&&previous.url===result.url&&previous.provenance)result.provenance=previous.provenance;
  if(result.provenance&&result.replacedUrl&&result.state==='working')result.adoption={stationId:radio.id,url:result.url,at:result.checkedAt,provenance:result.provenance,certificates:result.certificates,audio:result.audio,redirects:result.redirects};
  else if(previous.adoption?.url===result.url)result.adoption=previous.adoption;
  const record=lib.updateRecord(previous,result,now);
  let entry={...radio,_streamChecked:record.checkedAt,_streamStatus:record.state};
  if(record.state==='working') {
    entry.stream=record.url;
    if(record.provenance)entry._streamProvenance=record.provenance;
    if(record.audio?.checkedAt!==previous.audio?.checkedAt)entry=silence.applySilenceSample(entry,record.url===radio.stream?radio:{id:radio.id},{meanDb:record.audio.meanDb},record.checkedAt);
    else if(radio._streamStatus==='silent')entry._streamStatus='silent';
  }
  return {entry,record};
}
async function checkAll(radios,previous={},deps={}) {
  const now=deps.now??Date.now(),report={checkedAt:new Date(now).toISOString(),total:radios.length,stations:{}},updated=[];
  for(const radio of radios) {
    try {
      const result=await checkRadio(radio,previous.stations?.[radio.id]||{}, {...deps,now});
      updated.push(result.entry);report.stations[radio.id]=result.record;
    } catch {
      const record=lib.updateRecord(previous.stations?.[radio.id],{url:radio.stream,state:'unknown',error:'check-exception',checkedAt:report.checkedAt},now);
      report.stations[radio.id]=record;updated.push({...radio,_streamStatus:'unknown',_streamChecked:report.checkedAt});
    }
  }
  return {radios:updated,report};
}
async function checkCandidates(registry, radios, report, deps={}) {
  const now=deps.now??Date.now(),at=new Date(now).toISOString();
  const last=Date.parse(registry._lastHealthDiscovery);
  if(new Date(now).getUTCDay()!==1 || (Number.isFinite(last)&&now-last<6*lib.DAY))return registry;
  const {promoteCandidate,slugFromCandidate}=require('./discover-streams');
  const existing=new Set(radios.map(r=>r.id)),retained=[];
  // Budget explicite : au plus quatre candidatures officielles par semaine.
  const candidates=[...(registry.candidates||[])].sort((a,b)=>(Date.parse(a._lastChecked)||0)-(Date.parse(b._lastChecked)||0));
  for(const [i,candidate]of candidates.entries()) {
    if(i>=4){retained.push(candidate);continue;}
    const id=slugFromCandidate(candidate);
    try {
      const {record}=await checkRadio({id,name:candidate.name,website:candidate.website,stream:null},{},{...deps,now});
      if(record.state==='working'&&record.provenance&&!existing.has(id)&&deps.canPromote?.(id)) {
        radios.push({...promoteCandidate(candidate,{stream:record.url,status:'working',checked:at}),_streamProvenance:record.provenance});
        report.stations[id]=record;existing.add(id);
      } else retained.push({...candidate,_lastChecked:at,_failCount:(candidate._failCount||0)+1,_healthError:record.error||'catalogue-prerequisites-missing',...(record.state==='working'?{_verifiedStream:record.url,_streamProvenance:record.provenance}:{})});
    } catch {retained.push({...candidate,_lastChecked:at,_healthError:'check-exception'});}
  }
  return {...registry,candidates:retained,_lastHealthDiscovery:at};
}

async function main() {
  const args=process.argv.slice(2),radios=JSON.parse(fs.readFileSync(path.join(ROOT,'radios.json'),'utf8'));
  let previous={};try{previous=JSON.parse(fs.readFileSync(path.join(ROOT,'data/radio-health.json'),'utf8'));}catch{/* premier contrôle */}
  const result=await checkAll(radios,previous);
  let registry={candidates:[]};try{registry=JSON.parse(fs.readFileSync(path.join(ROOT,'radios-candidates.json'),'utf8'));}catch{/* aucune candidature */}
  let schedules={},playing={};
  try{schedules=JSON.parse(fs.readFileSync(path.join(ROOT,'radio-schedules.json'),'utf8')).stations||{};playing=JSON.parse(fs.readFileSync(path.join(ROOT,'radio-nowplaying.json'),'utf8')).stations||{};}catch{/* prérequis catalogue manquants */}
  registry=await checkCandidates(registry,result.radios,result.report,{canPromote:id=>!!schedules[id]&&!!playing[id]});
  result.report.total=result.radios.length;
  const problems=lib.healthProblems(result.report);
  console.log(JSON.stringify(result.report,null,2));
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Santé des flux radio\n${problems.length?problems.map(p=>`- ${p}`).join('\n'):'- TLS et audio vérifiés ; aucun problème.'}\n`);
  if(args.includes('--update')) {
    fs.mkdirSync(path.join(ROOT,'data'),{recursive:true});
    fs.writeFileSync(path.join(ROOT,'data/radio-health.json'),JSON.stringify(result.report,null,2)+'\n');
    fs.writeFileSync(path.join(ROOT,'radios.json'),JSON.stringify(result.radios,null,2)+'\n');
    fs.writeFileSync(path.join(ROOT,'radios-candidates.json'),JSON.stringify(registry,null,2)+'\n');
  }
}
module.exports={publishedAlternatives,checkRadio,checkAll,checkCandidates};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});

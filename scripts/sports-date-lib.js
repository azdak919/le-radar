/* Dates civiles publiées : format partagé SSR/client, sans heure inventée. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarSportsDate=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const DAY=86400000,TZ='America/Toronto';
 const civilFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'});
 function civilNow(now){const p=Object.fromEntries(civilFormatter.formatToParts(new Date(now)).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;}
 function dateValue(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))return null;const d=new Date(date+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===date?d:null;}
 function clockValue(value){const m=String(value||'').trim().match(/^(\d{1,2}):(\d{2})$/);if(!m||+m[1]>23||+m[2]>59)return null;return {hour:+m[1],minute:+m[2],minutes:+m[1]*60+(+m[2]),canonical:m[1].padStart(2,'0')+':'+m[2]};}
 function format(date,time,lang,now){const en=String(lang).startsWith('en'),d=dateValue(date);if(!d)return {day:'',year:'',clock:'',datetime:'',accessible:''};
  const today=civilNow(now),delta=(+d-(+dateValue(today)))/DAY,c=clockValue(time);
  const relative=en?{0:'Today',1:'Tomorrow','-1':'Yesterday'}:{0:'Aujourd’hui',1:'Demain','-1':'Hier'};
  const day=relative[delta]||new Intl.DateTimeFormat(en?'en-CA':'fr-CA',{timeZone:'UTC',day:'numeric',month:'short'}).format(d);
  const year=date.slice(0,4)!==today.slice(0,4)?date.slice(0,4):'';
  const clock=!c?'':en?`${c.hour%12||12}${c.minute?':'+String(c.minute).padStart(2,'0'):''} ${c.hour<12?'AM':'PM'}`:`${c.hour}h${c.minute?String(c.minute).padStart(2,'0'):''}`;
  const full=new Intl.DateTimeFormat(en?'en-CA':'fr-CA',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(d);
  return {day,year,clock,datetime:date+(c?'T'+c.canonical:''),accessible:full+(c?(en?`, ${clock}, Toronto time`:` à ${c.hour} h ${String(c.minute).padStart(2,'0')}, heure de Toronto`):''),canonicalTime:c?.canonical||''};
 }
 function compare(a,b,descending=false){const direction=descending?-1:1,day=String(a.date||'').localeCompare(String(b.date||''));if(day)return day*direction;const ac=clockValue(a.time),bc=clockValue(b.time);if(!ac||!bc)return ac?-1:bc?1:0;return (ac.minutes-bc.minutes)*direction;}
 return {format,compare,clockValue,civilNow};
});

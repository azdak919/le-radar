import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../scripts/seo-pages'),real=require('./fixtures/sports-dates-real.json');
const NOW=new Date('2026-11-08T06:00:00Z');
function html(lang,theme,now=NOW,teams=real.teams){
 const NativeDate=global.Date;global.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[+now]));}static now(){return +now;}};
 let panels;try{panels=Object.values(teams).map(t=>`<section class="sports-panel" data-team="${t.id}" data-sport="volleyball" data-sector="collegial" data-sex="f"><header class="sports-panel__head"><h3>${t.nickname||'Dates'}</h3></header>${S.sportsResultRows(t,{sportsUpcoming:lang==='en'?'Upcoming':'À venir'},lang)}</section>`).join('');}finally{global.Date=NativeDate;}
 return `<!doctype html><html lang="${lang}" data-theme="${theme}" data-wide-preview="e"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/style-feed.css"><link rel="stylesheet" href="/style-chrome.css"><link rel="stylesheet" href="/seo-pages.css"><link rel="stylesheet" href="/dev/midwidth-preview.css"><link rel="stylesheet" href="/dev/wide-desktop-preview.css"></head><body><main class="wire seo-wire seo-wire--sports" data-sports-board><details class="sports-sport-block" data-sport="volleyball" open><summary>Volleyball</summary><div class="sports-board" data-sports-schedule-sort>${panels}</div></details></main></body></html>`;
}
async function boot(page,markup){await page.route('https://**/*',r=>r.abort());await page.route('**/sports/**',r=>r.request().isNavigationRequest()?r.fulfill({body:markup,contentType:'text/html'}):r.continue());await page.goto('/sports/',{waitUntil:'domcontentloaded'});await page.evaluate(()=>document.fonts.ready);}
const snapshot=page=>page.locator('.sports-result').evaluateAll(rows=>rows.map(r=>({id:r.dataset.gameId,datetime:r.querySelector('time').getAttribute('datetime'),aria:r.querySelector('time').getAttribute('aria-label'),day:r.querySelector('.sports-result__day')?.textContent,year:r.querySelector('.sports-result__year')?.textContent||'',clock:r.querySelector('.sports-result__clock')?.textContent||'',score:r.querySelector('.sports-result__score').textContent})));
async function scripts(page){for(const file of ['scripts/session-freshness-lib.js','scripts/sports-freshness-lib.js','scripts/sports-date-lib.js','sports-board.js'])await page.addScriptTag({url:'/'+file});}
for(const lang of ['fr','en'])for(const width of [320,360,390,1280])test(`dates ${lang} ${width} : SSR hydratation refresh, clair/sombre @ci-critical`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await page.clock.install({time:NOW});
 await boot(page,html(lang,'light'));const before=await snapshot(page);expect(before).toHaveLength(5);
 await scripts(page);expect(await snapshot(page)).toEqual(before);
 for(let pass=0;pass<2;pass++){await page.evaluate(teams=>window.dispatchEvent(new CustomEvent('radar:sports-updated',{detail:{teams}})),real.teams);expect(await snapshot(page)).toEqual(before);}
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  const geometry=await page.locator('.sports-result__time').evaluateAll(times=>times.map(e=>({width:e.getBoundingClientRect().width,scroll:e.scrollWidth,parts:[...e.children].map(c=>({text:c.textContent,w:c.getBoundingClientRect().width,h:c.getBoundingClientRect().height,nowrap:getComputedStyle(c).whiteSpace}))})));
  for(const row of geometry){if(width===1280){expect(row.width).toBeGreaterThan(60);expect(row.width).toBeLessThan(100);}expect(row.scroll).toBeLessThanOrEqual(Math.ceil(row.width)+1);for(const part of row.parts)expect(part.nowrap).toBe('nowrap');}
  await info.attach(`geometry-${theme}`,{body:JSON.stringify(geometry),contentType:'application/json'});await page.locator('main').screenshot({path:info.outputPath(`dates-${lang}-${width}-${theme}.png`)});
 } await page.clock.fastForward(2*86400000);
 for(const day of await page.locator('.sports-result__day').allTextContents()){expect(day).not.toMatch(/2026-11-/);expect(day).toMatch(/7/);}
 for(const size of await page.locator('.sports-result__time').evaluateAll(es=>es.map(e=>({w:e.getBoundingClientRect().width,scroll:e.scrollWidth}))))expect(size.scroll).toBeLessThanOrEqual(Math.ceil(size.w)+1);
 await expect(page.locator('.sports-result')).toHaveCount(5);await page.locator('main').screenshot({path:info.outputPath(`dates-${lang}-${width}-month.png`)});
});
test('même page au minuit Toronto : année séparée, heure absente et histoire conservées @ci-critical',async({page})=>{
 const now=new Date('2027-01-01T04:55:00Z'),team={id:'years',sport:'volleyball',results:[{gameId:'old',date:'2025-11-07',time:'',result:'W',scoreFor:2,scoreAgainst:1,opponent:'Ancien'},{gameId:'yesterday',date:'2026-12-31',time:'9:00',result:'W',scoreFor:2,scoreAgainst:1,opponent:'Hier'}],nextGames:[{gameId:'newyear',date:'2027-01-01',time:'14:15',opponent:'Demain'}]};
 await page.clock.install({time:now});await boot(page,html('fr','light',now,{years:team}));await scripts(page);
 const next=page.locator('[data-game-id="newyear"]');await expect(next.locator('.sports-result__day')).toHaveText('Demain');await expect(next.locator('.sports-result__year')).toHaveText('2027');
 await page.clock.fastForward(10*60000);await expect(next.locator('.sports-result__day')).toHaveText('Aujourd’hui');await expect(next.locator('.sports-result__year')).toHaveCount(0);
 await expect(page.locator('[data-game-id="yesterday"] .sports-result__day')).toHaveText('Hier');await expect(page.locator('[data-game-id="yesterday"] .sports-result__year')).toHaveText('2026');
 const old=page.locator('[data-game-id="old"]');await expect(old.locator('time')).toHaveAttribute('datetime','2025-11-07');await expect(old.locator('.sports-result__clock')).toHaveCount(0);await expect(page.locator('.sports-result')).toHaveCount(3);
});

for (const lang of ['fr','en']) test(`mixed upcoming/history and numeric clocks stay identical through hydration and refresh ${lang} @ci-critical`, async ({page}) => {
 const team = {id:'mixed',sport:'volleyball',results:['9:00','14:00','09:00',''].map((time,i)=>({gameId:'r'+i,date:'2026-11-07',time,opponent:'Historique',result:'W',scoreFor:2,scoreAgainst:1})),nextGames:['14:00','9:00','09:00',''].map((time,i)=>({gameId:'n'+i,date:'2026-11-09',time,opponent:'À venir'}))};
 const teams={mixed:team}; await page.clock.install({time:NOW}); await boot(page,html(lang,'light',NOW,teams));
 const before=await snapshot(page); expect(before.map(r=>r.id)).toEqual(['n1','n2','n0','n3','r1','r0','r2','r3']);
 await scripts(page); expect(await snapshot(page)).toEqual(before);
 for(let pass=0;pass<2;pass++){await page.evaluate(teams=>window.dispatchEvent(new CustomEvent('radar:sports-updated',{detail:{teams}})),teams);expect(await snapshot(page)).toEqual(before);}
 for(const id of ['n3','r3'])await expect(page.locator(`[data-game-id="${id}"] .sports-result__clock`)).toHaveCount(0);
});

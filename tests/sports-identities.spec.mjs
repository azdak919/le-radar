import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {unpackSportsPayload}=require('../scripts/sports-payload-lib');
const source=unpackSportsPayload(require('../sports.json'));
const laval=Object.values(source.teams).find(t=>t.registryId==='ulaval'&&t.sport==='football');
const future=Object.values(source.teams).find(t=>t.registryId==='edouard-montpetit'&&t.sport==='football');
const publicRun=process.env.SPORTS_PUBLIC_TEST==='1';
async function contrast(locator){
 return locator.evaluate(e=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const c=canvas.getContext('2d',{willReadFrequently:true});
  const rgba=v=>{c.clearRect(0,0,1,1);c.fillStyle=v;c.fillRect(0,0,1,1);return [...c.getImageData(0,0,1,1).data].map((x,i)=>i===3?x/255:x)};
  const nodes=[];for(let n=e;n;n=n.parentElement)nodes.unshift(n);let bg=[255,255,255];
  for(const n of nodes){const b=rgba(getComputedStyle(n).backgroundColor);bg=bg.map((v,i)=>b[i]*b[3]+v*(1-b[3]));}
  const f=rgba(getComputedStyle(e).color);const fg=bg.map((v,i)=>f[i]*f[3]+v*(1-f[3]));
  const lum=a=>a.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);
  const a=lum(fg),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 });
}
async function fixture(page){
 await page.clock.install({time:new Date('2026-11-07T20:24:00Z')});
 const game={date:'2026-11-07',time:'15:00',gameId:'64003e15-91d7-4714-ba63-be18b75f27e6',opponent:'Université Concordia',opponentFullName:'Université Concordia',live:true};
 const payload={fetchedAt:'2026-11-07T20:24:00Z',teams:{[laval.id]:{...laval,results:[],lastGame:null,nextGame:game,nextGames:[game]}}};
 await page.route('**/sports-masthead.json*',route=>route.fulfill({json:payload}));
 await page.route('https://s1.rseq.ca/**',route=>route.abort());
 return payload;
}
async function open(page,width,theme,path='/sports/'){
 await page.setViewportSize({width,height:1100});
 if(!publicRun)await fixture(page);
 await page.goto(`${path}?labFrame=1`,{waitUntil:'domcontentloaded'});
 await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
 await expect(page.locator('#sports-institution')).toBeVisible();
}
for(const theme of ['light','dark'])for(const width of [320,390,1024,1440]){
 test(`sports identities filters and geometry ${theme} ${width} @ci-critical`,async({page},info)=>{
  await open(page,width,theme);
  await page.locator('[data-filter-sport="football"]').click();
  await page.locator('[data-filter-period="today"]').click();
  const institution=page.locator('#sports-institution');
  await institution.fill('Université Laval');
  await expect(page.locator('[data-sports-status]')).toHaveAttribute('role','status');
  const card=page.locator('.sports-panel[data-registry="ulaval"][data-sport="football"]');
  await expect(card).toBeVisible();
  const sexContrast=await contrast(card.locator('.sports-panel__sex'));
  const statusContrast=await contrast(card.locator('.sports-panel__live'));
  console.log(`WCAG ${theme} ${width}: category ${sexContrast.toFixed(2)}:1, live ${statusContrast.toFixed(2)}:1`);
  expect(sexContrast).toBeGreaterThanOrEqual(4.5);
  expect(statusContrast).toBeGreaterThanOrEqual(4.5);
  await expect(page.locator('[data-filter-sport="football"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-filter-period="today"]')).toHaveAttribute('aria-pressed','true');
  expect(new URL(page.url()).searchParams.get('institution')).toBe('ulaval');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await institution.focus();
  const focus=await institution.evaluate(e=>({width:parseFloat(getComputedStyle(e).outlineWidth),rect:e.getBoundingClientRect().width}));
  expect(focus.width).toBeGreaterThanOrEqual(2);expect(focus.rect).toBeLessThanOrEqual(width);
  await institution.fill('Établissement inexistant XQZ');
  await expect(page.locator('.sports-panel:not([hidden])')).toHaveCount(0);
  await page.locator('[data-sports-clear-filters]').click();
  await expect(institution).toHaveValue('');
  await expect(page.locator('[data-filter-period="all"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('[data-filter-sport="football"]').click();await institution.fill('Université Laval');
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({path:info.outputPath(`${publicRun?'public':'fixture'}-card-${theme}-${width}.png`)});
  await institution.scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath(`${publicRun?'public':'fixture'}-sports-${theme}-${width}.png`)});
 });
}
test('sports Today is bilingual @ci-critical',async({page})=>{
 await open(page,390,'light','/en/sports/');
 await expect(page.locator('[data-filter-period="today"]')).toHaveText('Today');
 await expect(page.getByLabel('Institution',{exact:true})).toBeVisible();
});
test('Laval is live, 19h is not; score/final status hydrate without navigation @ci-critical',async({page})=>{
 test.skip(publicRun,'Synthetic timeline/score is a fixture, never public evidence.');
 const payload=await fixture(page);await page.goto('/sports/?labFrame=1',{waitUntil:'domcontentloaded'});
 await page.locator('[data-filter-sport="football"]').click();
 await page.locator('[data-filter-period="live"]').click();
 const card=page.locator('.sports-panel[data-registry="ulaval"][data-sport="football"]');
 await expect(card).toBeVisible();
 if(future)await expect(page.locator(`.sports-panel[data-team="${future.id}"]`)).toBeHidden();
 const url=page.url();
 const game={...payload.teams[laval.id].nextGame,scoreFor:41,scoreAgainst:40,liveFeed:'test-fixture',liveVerifiedAt:'2026-11-07T20:24:00Z'};
 payload.teams[laval.id].nextGame=game;payload.teams[laval.id].nextGames=[game];
 await page.evaluate(data=>window.dispatchEvent(new CustomEvent('radar:sports-updated',{detail:data})),payload);
 await expect(card.locator('.sports-result__score').first()).toHaveText('41–40');
 const final={...game,live:false,final:true,result:'W'};
 payload.teams[laval.id].nextGame=null;payload.teams[laval.id].nextGames=[];payload.teams[laval.id].results=[final];payload.teams[laval.id].lastGame=final;
 await page.evaluate(data=>window.dispatchEvent(new CustomEvent('radar:sports-updated',{detail:data})),payload);
 await expect(card).toBeHidden();await page.locator('[data-filter-period="today"]').click();
 await expect(card).toBeVisible();await expect(card.locator('[data-result="W"]')).toBeVisible();
 expect(page.url().split('?')[0]).toBe(url.split('?')[0]);
});


test('published sports bank has completed the post-merge identity normalization',async({request})=>{
 test.skip(!publicRun,'Public deployment gate, never satisfied by local fixtures.');
 const response=await request.get('/sports.json');expect(response.ok()).toBeTruthy();
 const raw=await response.json();const payload=unpackSportsPayload(raw);
 const {migrateIdentities}=require('../scripts/migrate-sports-identities');
 const normalized=migrateIdentities(raw);
 const changed=Object.entries(payload.teams).filter(([id,team])=>JSON.stringify(team)!==JSON.stringify(normalized.teams[id])).map(([id])=>id);
 expect(changed,'Wait for the existing post-merge collector to normalize the live bank; do not publish stale names.').toEqual([]);
 for(const team of Object.values(payload.teams))expect(team.institutionId,team.id).toBeTruthy();
});

test('an initially empty formation gains its match and official link without navigation @ci-critical',async({page})=>{
 test.skip(publicRun,'Controlled empty-to-match fixture, not public evidence.');
 const payload=await fixture(page);
 await page.goto('/sports/?labFrame=1',{waitUntil:'domcontentloaded'});
 const card=page.locator('.sports-panel[data-registry="ulaval"][data-sport="football"]');
 await expect(card).toHaveCount(1);
 await card.evaluate(panel=>{
  panel.querySelectorAll('.sports-panel__list,.sports-panel__empty').forEach(e=>e.remove());
  const empty=document.createElement('p');empty.className='sports-panel__empty';empty.textContent='Fixture: no results';panel.appendChild(empty);
 });
 await expect(card.locator('.sports-panel__list')).toHaveCount(0);
 const game={...payload.teams[laval.id].nextGame,url:'https://fr.usports.ca/sports/fball/2026-27/schedule',scoreFor:7,scoreAgainst:0};
 payload.teams[laval.id].nextGame=game;payload.teams[laval.id].nextGames=[game];
 const before=page.url();
 await page.evaluate(data=>window.dispatchEvent(new CustomEvent('radar:sports-updated',{detail:data})),payload);
 await expect(card.locator('.sports-panel__empty')).toHaveCount(0);
 await expect(card.locator('.sports-panel__list')).toHaveCount(1);
 await expect(card.locator('.sports-result__score').first()).toHaveText('7–0');
 await expect(card.locator('.sports-result__title a').first()).toHaveAttribute('href',game.url);
 expect(page.url()).toBe(before);
});

test('campus match without GameId hydrates with a stable key and retains notice when no match exists @ci-critical',async({page})=>{
 test.skip(publicRun,'Controlled campus fixture, not public evidence.');
 const payload=await fixture(page);await page.goto('/sports/?labFrame=1',{waitUntil:'domcontentloaded'});
 const card=page.locator('.sports-panel[data-registry="ulaval"][data-sport="football"]');
 await card.evaluate(panel=>{panel.querySelectorAll('.sports-panel__list,.sports-panel__empty').forEach(e=>e.remove());const p=document.createElement('p');p.className='sports-panel__empty';p.textContent='Fixture source unavailable';panel.appendChild(p);});
 const empty={fetchedAt:payload.fetchedAt,teams:{[laval.id]:{...payload.teams[laval.id],nextGame:null,nextGames:[],results:[],lastGame:null}}};
 await page.evaluate(data=>window.dispatchEvent(new CustomEvent('radar:sports-updated',{detail:data})),empty);
 await expect(card.locator('.sports-panel__empty')).toHaveText('Fixture source unavailable');
 const game={...payload.teams[laval.id].nextGame,gameId:null,url:'https://www.concordia.ca/fr/stingers/hockey_f/resultats.html',scoreFor:1,scoreAgainst:2};
 payload.teams[laval.id].nextGame=game;payload.teams[laval.id].nextGames=[game];
 for(let i=0;i<2;i++)await page.evaluate(data=>window.dispatchEvent(new CustomEvent('radar:sports-updated',{detail:data})),payload);
 await expect(card.locator('.sports-result')).toHaveCount(1);
 await expect(card.locator('.sports-result__score')).toHaveText('1–2');
 await expect(card.locator('.sports-result__title a')).toHaveAttribute('href',game.url);
});

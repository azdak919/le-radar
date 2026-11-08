import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const {radioPalette}=require('../scripts/radio-palette-lib');
const ids=['cfak','choq','chyz','cism','cjlo','ckut'];
async function contrast(locator,background=null,property='color'){
 return locator.evaluate((e,{background,property})=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const c=canvas.getContext('2d',{willReadFrequently:true});
  const rgb=value=>{c.clearRect(0,0,1,1);c.fillStyle=value;c.fillRect(0,0,1,1);return [...c.getImageData(0,0,1,1).data].slice(0,3)};
  const luminance=v=>rgb(v).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
  const s=getComputedStyle(e);let node=e;let bg=background;
  while(!bg&&node){const b=getComputedStyle(node).backgroundColor;if(b!=='rgba(0, 0, 0, 0)'&&b!=='transparent')bg=b;node=node.parentElement;}
  const a=luminance(s[property]),b=luminance(bg||'#fff');return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 },{background,property});
}
async function open(page,width,theme='light',path='/horaires/'){
 await page.setViewportSize({width,height:1100});await page.clock.setFixedTime(new Date('2026-11-07T18:10:00Z'));
 await page.goto(`${path}?labFrame=1`,{waitUntil:'domcontentloaded'});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
}
// Capture document coordinates from the top, so fixed radio chrome cannot cover
// the heading when a tall section is auto-scrolled by locator.screenshot().
async function captureSection(page,selector,path){
 await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));
 const clip=await page.locator(selector).boundingBox();await page.screenshot({path,clip,fullPage:true});
}
for(const theme of ['light','dark'])for(const width of [320,390,1024,1440]){
 test(`institution palette contrasts and geometry ${theme} ${width}px @ci-critical`,async({page},info)=>{
  await open(page,width,theme);await expect(page.locator('[data-radio-day-view]')).toHaveAttribute('data-ready','true');
  await expect(page.getByRole('region',{name:'En ce moment à la radio'})).toBeVisible();
  await expect(page.locator('.seo-radio-card[data-radio-institution]')).toHaveCount(6);
  const ratios=[];
  for(const id of ids){
   const p=radioPalette(id);const card=page.locator(`.seo-radio-card[data-schedule-station="${id}"]`);const track=page.locator(`.radio-day-track[data-station="${id}"]`);
   expect(await card.evaluate(e=>e.style.getPropertyValue('--station-brand'))).toBe(p.primary);
   expect(await track.evaluate(e=>e.style.getPropertyValue('--station-brand'))).toBe(p.primary);
   for(const sel of ['.seo-radio-card__name','.seo-radio-card__place','.seo-radio-card__show','.seo-radio-card__when','.seo-radio-card__kicker']){const ratio=await contrast(card.locator(sel));ratios.push(ratio);expect(ratio,`${id} ${sel}`).toBeGreaterThanOrEqual(4.5);}
   const block=track.locator('.radio-day-block').first();if(await block.count())expect(await contrast(block)).toBeGreaterThanOrEqual(4.5);
  }
  const current=page.locator('.radio-day-block.is-current-time').first();await expect(current).toHaveAttribute('aria-current','time');await expect(current.locator('.radio-day-block__state')).toBeVisible();
  expect(await contrast(current.locator('.radio-day-block__state'))).toBeGreaterThanOrEqual(4.5);
  const focus=page.locator('.seo-radio-card a').first();await focus.focus();
  const focusRatio=await focus.evaluate(e=>{const s=getComputedStyle(e);return {outline:s.outlineColor,width:parseFloat(s.outlineWidth),ink:getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()}});
  const focusContrast=await contrast(focus,null,'outlineColor');expect(focusContrast).toBeGreaterThanOrEqual(3);expect(focusRatio.width).toBeGreaterThanOrEqual(2);expect(focusRatio.outline).not.toBe('rgba(0, 0, 0, 0)');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await current.focus();const currentFocus=await contrast(current,null,'outlineColor');expect(currentFocus).toBeGreaterThanOrEqual(3);expect(await current.evaluate(e=>parseFloat(getComputedStyle(e).outlineWidth))).toBeGreaterThanOrEqual(3);await current.blur();
  console.log(`WCAG ${theme} ${width}: min card text/badge ${Math.min(...ratios).toFixed(2)}:1; focus ${Math.min(focusContrast,currentFocus).toFixed(2)}:1`);
  await captureSection(page,'.seo-radio-now',info.outputPath(`hub-${theme}-${width}.png`));
  await captureSection(page,'[data-radio-day-view]',info.outputPath(`day-${theme}-${width}.png`));
 });
}
for(const theme of ['light','dark'])for(const id of ids){
 test(`weekly institution palette ${id} ${theme} @ci-critical`,async({page},info)=>{
  await open(page,390,theme,`/radios/${id}/`);const section=page.locator('#horaire[data-radio-institution]');await expect(section).toBeVisible();
  expect(await section.evaluate(e=>e.style.getPropertyValue('--station-brand'))).toBe(radioPalette(id).primary);
  expect(await contrast(section.locator('.seo-day h3').first())).toBeGreaterThanOrEqual(4.5);
  const badge=section.locator('.seo-slot__badge').first();await expect(badge).toBeVisible();expect(await contrast(badge)).toBeGreaterThanOrEqual(4.5);
  await expect(section.locator('li:not(.seo-slot--live):not(.seo-slot--upcoming) .seo-slot__badge')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  if(id==='chyz')await captureSection(page,'#horaire',info.outputPath(`week-${theme}.png`));
 });
}
test('honest bilingual hub hierarchy and next-day labels @ci-critical',async({page})=>{
 await open(page,1440);await expect(page.getByRole('heading',{name:'En ce moment à la radio',exact:true})).toBeVisible();
 const cfak=page.locator('.seo-radio-card[data-schedule-station="cfak"]');await expect(cfak.locator('.seo-radio-card__kicker')).toHaveText('Prochaine émission');await expect(cfak.locator('.seo-radio-card__when')).toContainText('dimanche');
 await expect(page.locator('.seo-radio-card[data-air-state="live"] .seo-radio-card__kicker').first()).toHaveText('À l’antenne');
 await open(page,390,'light','/en/schedules/');await expect(page.getByRole('heading',{name:'On the radio right now',exact:true})).toBeVisible();await expect(page.locator('.seo-radio-card[data-air-state="upcoming"] .seo-radio-card__kicker').first()).toHaveText('Next programme');
});
test('hub changes from next programme to on air without reloading @ci-critical',async({page})=>{
 // Official Saturday CHYZ grid: Radio Futura starts at 13:00 Toronto.
 const schedule=require('./fixtures/chyz-clock-transition.json');
 await page.route('**/radio-schedules.json*',route=>route.fulfill({json:schedule}));
 const before=new Date('2026-11-07T17:59:59Z');
 await page.clock.install({time:before});await page.clock.pauseAt(before);
 await page.goto('/horaires/?labFrame=1',{waitUntil:'domcontentloaded'});
 await expect(page.locator('[data-radio-day-view]')).toHaveAttribute('data-ready','true');
 const card=page.locator('.seo-radio-card[data-schedule-station="chyz"]');
 // Wait for this fetched fixture, not the build-time SSR programme.
 await expect(card.locator('.seo-radio-card__show')).toHaveText('Radio Futura');
 await expect(card).toHaveAttribute('data-air-state','upcoming');
 await expect(card.locator('.seo-radio-card__kicker')).toHaveText('Prochaine émission');
 // Cross the real 30-second lifecycle tick once, without manual sync or reload.
 await page.clock.runFor(31000);await expect(card).toHaveAttribute('data-air-state','live');await expect(card.locator('.seo-radio-card__kicker')).toHaveText('À l’antenne');await expect(card.locator('.seo-radio-card__show')).toHaveText('Radio Futura');
});
for(const width of [320,390,1024,1440]){
 test(`player hugs content without clipping, including absent states ${width}px @ci-critical`,async({page},info)=>{
  await open(page,width);await page.waitForFunction(()=>document.querySelector('#tuner.is-dial-ready')&&window.RadarAir?._pure);
  for(const state of ['short','long','current-only','next-only','none']){
   const result=await page.evaluate(state=>{
    const wrap=document.querySelector('#tuner-nowair-wide');
    if(!wrap){
      const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
      const copy=state==='long'?'Très longue émission — SuperLongTitreSansEspacePourVérifierLeRetourÀLaLigne':state==='next-only'?'Prochaine émission dimanche':state==='none'?'Choisir un poste':'Radio Futura';
      const ticker=document.querySelector('.tuner-now-sub-text');if(ticker)ticker.textContent=copy;
      const controls=[...document.querySelectorAll('#tuner-prev,#tuner-next,#tuner-play,#tuner-select,#tuner-vol-btn')].filter(e=>e.getBoundingClientRect().width).map(box);
      return {mode:'compact',controls,bar:box(document.querySelector('#tuner')),overflow:document.documentElement.scrollWidth-innerWidth};
    }
    const live=wrap.querySelector('.tuner-wide-slot--live'),next=wrap.querySelector('.tuner-wide-slot--next');
    live.hidden=['next-only','none'].includes(state);next.hidden=['current-only','none'].includes(state);live.classList.toggle('is-wide-absent',live.hidden);wrap.classList.toggle('is-live-absent',live.hidden);
    for(const [i,slot] of [live,next].entries())slot.querySelector('.tuner-wide-slot__title').textContent=state==='long'?'Une très longue émission — titre intégral et SuperLongTitreSansEspacePourVérifierLeRetourÀLaLigne':i?'Football du Rouge et Or':'Radio Futura';
    const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
    return {wrap:box(wrap),live:box(live),next:box(next),bar:box(document.querySelector('#tuner')),titles:[...wrap.querySelectorAll('.tuner-wide-slot__title')].filter(e=>e.getBoundingClientRect().width).map(e=>({scroll:e.scrollWidth,client:e.clientWidth,scrollH:e.scrollHeight,clientH:e.clientHeight})),overflow:document.documentElement.scrollWidth-innerWidth};
   },state);
   expect(result.overflow).toBeLessThanOrEqual(1);
   if(result.mode==='compact'){expect(result.controls.length).toBeGreaterThanOrEqual(3);for(const b of result.controls){expect(b.x).toBeGreaterThanOrEqual(-1);expect(b.right).toBeLessThanOrEqual(width+1);expect(b.bottom).toBeLessThanOrEqual(result.bar.bottom+1);}if(state==='short')await page.locator('#tuner').screenshot({path:info.outputPath(`player-short-${width}.png`)});continue;}
   for(const b of [result.live,result.next].filter(b=>b.width)){expect(b.x).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(width+1);expect(b.bottom).toBeLessThanOrEqual(result.bar.bottom+1);}
   for(const t of result.titles){expect(t.scroll).toBeLessThanOrEqual(t.client+1);expect(t.scrollH).toBeLessThanOrEqual(t.clientH+1);}
   if(state==='short'&&result.live.width&&result.next.width&&Math.abs(result.live.y-result.next.y)<2){expect(result.next.x-result.live.right).toBeLessThanOrEqual(20);expect(result.wrap.width-result.live.width-result.next.width).toBeLessThanOrEqual(20);}
   if(['current-only','next-only'].includes(state)&&result.wrap.width){const slot=state==='current-only'?result.live:result.next;expect(result.wrap.width-slot.width).toBeLessThanOrEqual(2);}
   if(state==='short')await page.locator('#tuner').screenshot({path:info.outputPath(`player-short-${width}.png`)});
  }
 });
}

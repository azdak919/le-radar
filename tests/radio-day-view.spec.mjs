import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/radio-day-view.json', import.meta.url)));
const fixed = new Date('2026-11-02T15:45:00Z'); // Monday 10:45 HNE
const data = { updatedAt: fixed.toISOString(), timezone:'America/Toronto', stations: Object.fromEntries(['cfak','choq','chyz','cism','cjlo','ckut'].map(id=>[id,{grid:fixture,verifiedWeekOf:'2026-11-02',sources:['https://example.org/schedule']}])) };
async function open(page, width=1440, mock=true, path='/horaires/') {
  await page.setViewportSize({width,height:1000});
  await page.clock.setFixedTime(fixed);
  if(mock) await page.route('**/radio-schedules.json', route=>route.fulfill({json:data}));
  await page.goto(path,{waitUntil:'domcontentloaded'});
  await expect(page.locator('[data-radio-day-view]')).toHaveAttribute('data-ready','true');
  await page.locator('#journee').scrollIntoViewIfNeeded();
}
test('day comparison retains published geometry, overlaps and full accessible short titles @ci-critical',async({page})=>{
  await open(page);
  await expect(page.locator('.radio-day-track')).toHaveCount(6);
  await expect(page.locator('.seo-radio-card')).toHaveCount(6);
  const track=page.locator('.radio-day-track').first();
  const hour=track.locator('[data-source-index="1"]');
  const two=track.locator('[data-source-index="2"]');
  const quarter=track.locator('[data-source-index="4"]');
  const boxes=await Promise.all([hour,two,quarter].map(x=>x.boundingBox()));
  expect(boxes[0].height).toBeCloseTo(96,0);expect(boxes[1].height).toBeCloseTo(192,0);expect(boxes[2].height).toBeCloseTo(24,0);
  expect((await track.locator('[data-source-index="5"]').boundingBox()).height).toBeCloseTo(1.6,1);
  expect(boxes[1].y-boxes[0].y).toBeCloseTo(96,0);
  const alt=await track.locator('[data-source-index="3"]').boundingBox();
  expect(alt.x).toBeGreaterThanOrEqual(boxes[1].x+boxes[1].width);
  await expect(track.locator('[data-source-index="6"],[data-source-index="7"],[data-source-index="8"]')).toHaveCount(0);
  await page.locator('.radio-day-list summary').click();
  const short=page.locator('.radio-day-list-entry').filter({hasText:'SuperLongTitreSansEspace'}).first();
  await short.click();
  await expect(page.locator('dialog')).toBeVisible();
  await expect(page.locator('#radio-day-detail-title')).toHaveText(fixture[5].title);
  await expect(page.locator('.radio-day-dialog')).toContainText('12:00–12:01');
  await page.keyboard.press('Escape');await expect(page.locator('dialog')).not.toBeVisible();
  await expect(short).toBeFocused();
});
test('Sunday-to-Monday continuation and Toronto current line use the selected civil date @ci-critical',async({page})=>{
  await open(page);
  await expect(page.locator('.radio-day-track').first().locator('[data-source-index="0"]')).toHaveAttribute('data-start','0');
  await expect(page.locator('.radio-day-current')).toHaveText('10:45');
  const top=await page.locator('.radio-day-current').evaluate(e=>parseFloat(e.style.top));expect(top).toBeCloseTo(645*1.6,0);
  await page.locator('#radio-day-select').selectOption('0');
  await expect(page.locator('.radio-day-current')).toBeHidden();
  const carry=page.locator('.radio-day-track').first().locator('[data-source-index="9"]');
  await expect(carry).toHaveAttribute('data-start','0');await expect(carry).toHaveAttribute('data-end','30');
  await page.getByRole('button',{name:'Aujourd’hui',exact:true}).click();
  await expect(page.locator('#radio-day-select')).toHaveValue('1');
  await expect(page.locator('.radio-day-current')).toBeVisible();
  await page.locator('#radio-day-select').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  await expect(page.locator('#radio-day-select')).toHaveValue('2');
});
test('details invoke the existing live player exactly once, never an archive replay @ci-critical',async({page})=>{
  await open(page);
  await page.evaluate(()=>{window.__dayCalls=[];window.selectStation=(...args)=>window.__dayCalls.push(args);});
  await page.locator('.radio-day-track').first().locator('[data-source-index="2"]').click();
  await expect(page.locator('.radio-day-dialog')).toContainText('pas une rediffusion');
  await page.locator('.radio-day-listen').click();
  expect(await page.evaluate(()=>window.__dayCalls)).toEqual([['cfak',{autoplay:true,openExternal:false}]]);
  expect(await page.locator('audio').count()).toBe(1);
});
for(const width of [320,390,1024,1440]) {
 test(`shared day is locally scrollable and unclipped at ${width}px @ci-critical`,async({page},testInfo)=>{
  await open(page,width,false);
  await expect(page.locator('.radio-day-heading')).toHaveCount(6);
  const report=await page.evaluate(()=>{
   const sc=document.querySelector('.radio-day-scroll');const board=document.querySelector('.radio-day-board');
   return {pageOverflow:document.documentElement.scrollWidth-innerWidth,scrollWidth:sc.scrollWidth,clientWidth:sc.clientWidth,trackWidths:[...document.querySelectorAll('.radio-day-track')].map(e=>e.getBoundingClientRect().width),boardWidth:board.getBoundingClientRect().width};
  });
  expect(report.pageOverflow).toBeLessThanOrEqual(1);expect(Math.min(...report.trackWidths)).toBeGreaterThanOrEqual(175);
  if(width<1024)expect(report.scrollWidth).toBeGreaterThan(report.clientWidth);
  const sc=page.locator('.radio-day-scroll');
  const axisBefore=await page.locator('.radio-day-axis').boundingBox();
  await sc.evaluate(e=>e.scrollLeft=e.scrollWidth);
  const axisAfter=await page.locator('.radio-day-axis').boundingBox();expect(axisAfter.x).toBeCloseTo(axisBefore.x,0);
  await sc.evaluate(e=>{e.scrollLeft=0;e.scrollTop=70+9*96;});
  const header=await page.locator('.radio-day-heading').first().boundingBox();const sb=await sc.boundingBox();expect(header.y).toBeCloseTo(sb.y+1,0);
  if (width < 1114) {
    await page.locator('#radio-day-station').selectOption('5');
    const maxScroll = await sc.evaluate(e => e.scrollWidth - e.clientWidth);
    await expect.poll(() => sc.evaluate(e => e.scrollLeft)).toBeCloseTo(maxScroll, 0);
    await expect(page.locator('.radio-day-heading').last()).toBeVisible();
    await page.locator('#radio-day-station').selectOption('0');
  }
  await page.screenshot({path:testInfo.outputPath(`radio-day-comparison-${width}.png`),fullPage:true});
 });
}
test('English hub has the same day view and preserves station week links @ci-critical',async({page})=>{
 await open(page,1440,false,'/en/schedules/');
 await expect(page.locator('#radio-day-title')).toHaveText('Compare a day, radio by radio');
 await expect(page.locator('.radio-day-heading a').first()).toHaveAttribute('href',/\/en\/radios\/cfak\/#horaire$/);
 await expect(page.getByRole('button',{name:'Today',exact:true})).toBeVisible();
});
test('a retained older week is not presented as today @ci-critical',async({page})=>{
 const old=structuredClone(data);for(const s of Object.values(old.stations))s.verifiedWeekOf='2026-10-26';
 await page.route('**/radio-schedules.json',r=>r.fulfill({json:old}));
 await open(page,1440,false);
 await expect(page.getByRole('button',{name:'Aujourd’hui',exact:true})).toBeDisabled();
 await expect(page.locator('.radio-day-current')).toBeHidden();
});

test('today uses Toronto through Saturday midnight, not the UTC weekday @ci-critical',async({page})=>{
 await open(page);
 await page.clock.setFixedTime(new Date('2026-11-08T04:30:00Z'));
 await page.getByRole('button',{name:'Aujourd’hui',exact:true}).click();
 await expect(page.locator('#radio-day-select')).toHaveValue('6');
 await expect(page.locator('.radio-day-current')).toHaveText('23:30');
 await page.clock.setFixedTime(new Date('2026-11-08T05:30:00Z'));
 await page.getByRole('button',{name:'Aujourd’hui',exact:true}).click();
 await expect(page.locator('#radio-day-select')).toHaveValue('0');
 await expect(page.locator('.radio-day-current')).toHaveText('00:30');
 await expect(page.locator('.radio-day-track').first().locator('[data-source-index="9"]')).not.toHaveClass(/is-current-time/);
});
test('source markup stays text and details remain readable in dark mode @ci-critical',async({page})=>{
 const malicious=structuredClone(data);
 malicious.stations.cfak.grid=[{day:1,start:'10:00',end:'12:00',title:'<img src=x onerror=alert(1)> un titre très long',url:'javascript:alert(1)'}];
 await page.route('**/radio-schedules.json',r=>r.fulfill({json:malicious}));
 await open(page,390,false);
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 await page.locator('.radio-day-track').first().locator('button').click();
 await expect(page.locator('#radio-day-detail-title')).toHaveText(malicious.stations.cfak.grid[0].title);
 await expect(page.locator('#radio-day-detail-title img')).toHaveCount(0);
 await expect(page.locator('.radio-day-links a[href^="javascript:"]')).toHaveCount(0);
 const colors=await page.locator('dialog').evaluate(e=>({color:getComputedStyle(e).color,ink:getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()}));
 expect(colors.color).toBe('rgb(241, 242, 244)');
 const box=await page.locator('dialog').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
});
for(const width of [390,1440]) {
 test(`actual weekly source visual comparison ${width}px @ci-critical`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:1000});
  await page.goto('/horaires/?labFrame=1#journee',{waitUntil:'domcontentloaded'});
  await expect(page.locator('[data-radio-day-view]')).toHaveAttribute('data-ready','true');
  await expect(page.locator('.radio-day-heading')).toHaveCount(6);
  await page.locator('#journee').evaluate(e => e.scrollIntoView({block:'start'}));
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('[data-radio-day-view]').screenshot({path:testInfo.outputPath(`radio-day-live-${width}.png`)});
 });
}

test('a mixed retained station preserves its source week and is not asserted live @ci-critical',async({page})=>{
 const mixed=structuredClone(data);mixed.stations.cfak.verifiedWeekOf='2026-10-26';mixed.stations.cfak.unverified=true;
 await page.route('**/radio-schedules.json',r=>r.fulfill({json:mixed}));await open(page,1440,false);
 await expect(page.locator('.radio-day-heading').first()).toContainText('Grille conservée du 26 oct.');
 await expect(page.locator('.radio-day-track').first().locator('.is-current-time')).toHaveCount(0);
 await page.locator('.radio-day-track').first().locator('[data-source-index="2"]').click();
 await expect(page.locator('dialog')).toContainText('lundi 26 octobre');
});

test('ongoing long programme labels remain visible after scrolling past their start @ci-critical',async({page})=>{
 await open(page);
 const block=page.locator('.radio-day-track').first().locator('[data-source-index="2"]');
 const initialBlock=await block.boundingBox();const initialCaption=await block.locator('.radio-day-block__content').boundingBox();
 expect(initialCaption.y-initialBlock.y).toBeGreaterThanOrEqual(0);
 expect(initialCaption.y-initialBlock.y).toBeLessThan(8);
 await page.locator('.radio-day-scroll').evaluate(e=>e.scrollTop=10.5*96);
 const head=await page.locator('.radio-day-heading').first().boundingBox();
 const title=await page.locator('.radio-day-track').first().locator('[data-source-index="2"] .radio-day-block__content').boundingBox();
 expect(title.y).toBeGreaterThanOrEqual(head.y+head.height-1);
 expect(title.y).toBeLessThan(head.y+head.height+12);
 await expect(page.locator('.radio-day-track').first().locator('[data-source-index="2"] .radio-day-block__title')).toHaveText('Deux heures — émission longue');
});

test('a direct day-view link settles at the comparison after async loading @ci-critical',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/horaires/?labFrame=1#journee',{waitUntil:'domcontentloaded'});
 const root=page.locator('[data-radio-day-view]');await expect(root).toHaveAttribute('data-ready','true');
 await expect.poll(async()=>Math.round((await root.boundingBox()).y)).toBeLessThan(160);
 expect((await root.boundingBox()).y).toBeGreaterThanOrEqual(0);
});

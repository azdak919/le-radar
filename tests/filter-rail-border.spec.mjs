import {test,expect} from '@playwright/test';
test.use({launchOptions:{args:['--disable-features=OverlayScrollbar']}});
async function open(page,width=1440){await page.setViewportSize({width,height:900});await page.route('https://**/*',r=>r.abort());await page.goto('/?wide=e',{waitUntil:'domcontentloaded'});await expect(page.locator('#news-filters-panel')).toHaveAttribute('data-ready','1');await page.evaluate(()=>document.fonts.ready);}
const metrics=page=>page.locator('#news-filters').evaluate(el=>{const a=el.querySelector('.filter-btn'),r=el.getBoundingClientRect(),b=a.getBoundingClientRect();return {client:el.clientWidth,outer:r.width,button:b.width,top:el.scrollTop,firstOffset:b.top-r.top,pageY:scrollY,gutter:getComputedStyle(el).scrollbarGutter};});
for(const width of [1440,1920])test(`rail ${width} : largeur stable et seul résidu 1 px normalisé à la réouverture @ci-critical`,async({page},info)=>{
 await open(page,width);const toggle=page.locator('.filters-toggle'),list=page.locator('#news-filters');
 const closed=await metrics(page);await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');const expanded=await metrics(page);
 const box=await list.boundingBox();await page.mouse.move(box.x+20,box.y+20);await page.mouse.wheel(0,1);await expect.poll(()=>list.evaluate(e=>e.scrollTop)).toBe(1);
 const residue=await metrics(page);await toggle.click();await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');await expect.poll(()=>list.evaluate(e=>e.scrollTop)).toBe(0);const reopened=await metrics(page);
 console.log('rail geometry',width,JSON.stringify({closed,expanded,residue,reopened}));
 await info.attach('rail-transitions',{body:JSON.stringify({closed,expanded,residue,reopened}),contentType:'application/json'});
 expect(closed.gutter).toBe('stable');expect(expanded.client).toBe(closed.client);expect(expanded.button).toBe(closed.button);expect(reopened.top).toBe(0);expect(reopened.firstOffset).toBeGreaterThanOrEqual(-0.1);expect(reopened.pageY).toBe(residue.pageY);
 for(const theme of ['light','dark']) {
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  const first=list.locator('.filter-btn').first();
  const appearance=()=>first.evaluate(async e=>{getComputedStyle(e).backgroundColor;await Promise.all(e.getAnimations().filter(a=>Number.isFinite(a.effect?.getTiming().iterations)).map(a=>a.finished.catch(()=>{})));const s=getComputedStyle(e);return [e.classList.contains('active'),s.borderTopColor,s.borderTopWidth,s.boxShadow,s.backgroundColor];});
  const before=await appearance();
  for(let cycle=0;cycle<2;cycle++){await toggle.click();await toggle.click();await expect.poll(()=>list.evaluate(e=>e.scrollTop)).toBe(0);expect(await appearance()).toEqual(before);}
  await list.screenshot({path:info.outputPath(`rail-${width}-${theme}-top.png`)});
 }
 await list.evaluate(e=>e.scrollTop=2);await toggle.click();await toggle.click();await expect.poll(()=>list.evaluate(e=>e.scrollTop)).toBe(2);
 await list.evaluate(e=>e.scrollTop=80);await toggle.click();await toggle.click();await expect.poll(()=>list.evaluate(e=>e.scrollTop)).toBe(80);
 const last=page.locator('#news-filters .filter-btn').last();await last.focus();await page.setViewportSize({width,height:760});await expect(last).toBeFocused();expect(await list.evaluate(e=>e.scrollTop)).toBeGreaterThan(1);
 await page.setViewportSize({width,height:900});await expect(last).toBeFocused();
 await list.screenshot({path:info.outputPath(`rail-${width}.png`)});
});

for(const width of [320,390])test(`mobile ${width} : filtres hors rail conservés @ci-critical`,async({page},info)=>{
 await open(page,width);const list=page.locator('#news-filters');expect((await metrics(page)).gutter).toBe('auto');
 const first=list.locator('.filter-btn').first();await expect(first).toBeVisible();await first.focus();await expect(first).toBeFocused();
 await page.screenshot({path:info.outputPath(`mobile-${width}.png`)});
});

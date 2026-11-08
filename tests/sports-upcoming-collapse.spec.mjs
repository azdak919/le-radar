import { test, expect, chromium } from '@playwright/test';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
const fixed = new Date('2026-11-08T17:00:00Z'); // midi HNE
const kickoff = (day, time='13:00') => Date.parse(`${day}T${time}:00-05:00`);
function row(id, date, { final=false, live=false, time='13:00' }={}) {
  return `<li class="sports-result ${final?'sports-result--W':live?'sports-result--live':'sports-result--next'}" data-game-id="${id}" data-hydration-key="${id}" data-kickoff-ts="${kickoff(date,time)}" data-live-excluded="${final?'1':'0'}"${final?' data-result="W"':''}><time class="sports-result__time" datetime="${date}">${date}<span class="sports-result__clock">${time}</span></time><span class="sports-result__score">${final?'2–1':live?'0–0':'À venir'}</span><span class="sports-result__title"><a href="https://example.org/game?GameId=${id}">Adversaire ${id}</a></span><span class="sports-result__badge">→</span></li>`;
}
function fixture(n=12, lang='fr') {
  const games = Array.from({length:n},(_,i)=>row(`g${i}`,i<2?'2026-11-08':`2026-11-${String(9+i).padStart(2,'0')}`,{time:i===1?'14:00':'13:00'})).join('');
  const panel = (id,league,body) => `<section class="sports-panel" data-team="${id}" data-league="${league}" data-sport="hockey" data-sector="universitaire" data-sex="m" data-search="Même équipe ${league}" data-results-source-url="https://example.org/${league}"><header class="sports-panel__head"><h3 class="sports-panel__name"><span class="sports-panel__name-text">Même équipe ${league}</span></h3></header><ul class="sports-panel__list">${body}</ul></section>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/seo-pages.css"></head><body><main class="wire seo-wire" data-sports-board><div>${['all','today','live','week'].map(p=>`<button type="button" data-filter-period="${p}" aria-pressed="${p==='all'}">${p}</button>`).join('')}</div><span data-sports-status></span><details class="sports-sport-block" data-sport="hockey" open><summary>Hockey</summary><div class="sports-board" data-sports-schedule-sort>${panel('alpha','A',games+row('past','2026-11-07',{final:true})+row('live','2026-11-08',{live:true,time:'11:00'}))}${panel('beta','B',row('b0','2026-11-10'))}</div></details></main><script src="/scripts/sports-freshness-lib.js"></script><script src="/scripts/sports-date-lib.js"></script><script src="/sports-board.js"></script></body></html>`;
}
async function open(page,{n=12,lang='fr',query='',width=390,html=null}={}) {
  await page.setViewportSize({width,height:900});
  await page.clock.setFixedTime(fixed);
  await page.route('**/sports/**',r=>r.request().isNavigationRequest()?r.fulfill({body:html||fixture(n,lang),contentType:'text/html'}):r.continue());
  await page.goto(`/sports/${query}`,{waitUntil:'domcontentloaded'});
}
const alpha = page=>page.locator('[data-team="alpha"]');
const futures = panel=>panel.locator('.sports-result--next:visible');
for (const n of [0,1,12]) test(`${n} futurs : premier admissible seul, DOM complet et résultats/live intacts @ci-critical`,async({page})=>{
  await open(page,{n}); const card=alpha(page);
  await expect(futures(card)).toHaveCount(Math.min(1,n));
  await expect(card.locator('.sports-result')).toHaveCount(n+2);
  await expect(card.locator('[data-result]')).toBeVisible();
  await expect(card.locator('[data-game-id="live"]')).toBeVisible();
  const button=card.locator('[data-upcoming-toggle]');
  if(n<=1) await expect(button).toHaveCount(0);
  else { await expect(button).toHaveText('Voir les autres matchs à venir (11)'); await expect(button).toHaveAttribute('aria-expanded','false'); const controls=await button.getAttribute('aria-controls'); await expect(card.locator(`ul[id="${controls}"]`)).toHaveCount(1); }
});
test('clavier mobile FR, compteur filtré, refresh/final et retour : état indépendant par ligue @ci-critical',async({page},info)=>{
  await open(page);const card=alpha(page),button=card.locator('[data-upcoming-toggle]');
  await button.focus();await page.keyboard.press('Enter');await expect(futures(card)).toHaveCount(12);await expect(button).toHaveText('Réduire');
  await expect(page.locator('[data-team="beta"] .sports-result--next:visible')).toHaveCount(1);
  await page.reload({waitUntil:'domcontentloaded'});await expect(futures(card)).toHaveCount(12);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('radar:sports-updated',{detail:{teams:{alpha:{id:'alpha',sport:'hockey',nextGames:[{gameId:'g2',date:'2026-11-11',time:'13:00',opponent:'Adversaire'}],results:[{gameId:'g0',date:'2026-11-08',time:'13:00',final:true,result:'W',scoreFor:3,scoreAgainst:1,opponent:'Adversaire'}]}}}})));
  await expect(card.locator('[data-game-id="g0"][data-result]')).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded','true');await expect(card.locator('.sports-result')).toHaveCount(14);
  await button.click();await expect(futures(card)).toHaveCount(1);
  await page.locator('[data-filter-period="today"]').click();await expect(button).toBeHidden();
  await page.locator('[data-filter-period="all"]').click();await expect(button).toHaveText('Voir les autres matchs à venir (10)');
  await page.addStyleTag({content:'#local-lab-format-bar{display:none!important}'});await card.screenshot({path:info.outputPath('sports-upcoming-mobile.png')});
});
test('EN desktop : bouton, filtres today/live/week et deep-link révèle avant scroll @ci-critical',async({page})=>{
  await open(page,{lang:'en',width:1440});const card=alpha(page),button=card.locator('[data-upcoming-toggle]');
  await expect(button).toHaveText('See other upcoming games (11)');
  await page.locator('[data-filter-period="today"]').click();await expect(button).toHaveText('See other upcoming games (1)');
  await page.locator('[data-filter-period="live"]').click();await expect(button).toBeHidden();await expect(card.locator('.sports-result:visible')).toHaveCount(1);
  await page.locator('[data-filter-period="week"]').click();await expect(button).toBeVisible();
  await page.goto('/sports/?team=alpha&game=g10',{waitUntil:'domcontentloaded'});
  await expect(card.locator('[data-game-id="g10"]')).toBeVisible();await expect(card.locator('[data-game-id="g10"]')).toHaveClass(/is-spotlight/);
  await expect(button).toHaveAttribute('aria-expanded','true');await button.click();await expect(card.locator('[data-game-id="g10"]')).toBeVisible();await expect(button).toHaveAttribute('aria-expanded','false');
});
test('sans JavaScript : tous les futurs restent accessibles @ci-critical',async({browser})=>{
  const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();
  await page.route('**/sports/**',r=>r.request().isNavigationRequest()?r.fulfill({body:fixture(),contentType:'text/html'}):r.continue());
  await page.goto('/sports/',{waitUntil:'domcontentloaded'});
  await expect(alpha(page).locator('.sports-result')).toHaveCount(14);
  await expect(alpha(page).locator('.sports-result--next:visible')).toHaveCount(12);
  await expect(page.locator('[data-upcoming-toggle]')).toHaveCount(0);await context.close();
});

test('même identifiant dans deux ligues : préférences séparées, masonry et défilement mesuré @ci-critical',async({page},info)=>{
  const both=fixture().replace('data-team="beta"','data-team="alpha"').replace(row('b0','2026-11-10'),Array.from({length:12},(_,i)=>row(`b${i}`,'2026-11-10')).join('')).replace('<main class="wire','<div style="height:1800px" aria-hidden="true"></div><main class="wire').replace('</main>','</main><div style="height:2000px" aria-hidden="true"></div>');
  await open(page,{html:both,width:1440});
  const cards=page.locator('.sports-panel'),a=cards.nth(0),b=cards.nth(1),button=a.locator('[data-upcoming-toggle]');
  await expect(page.locator('.sports-board')).toHaveClass(/is-masonry/);
  await expect(futures(a)).toHaveCount(1);await expect(futures(b)).toHaveCount(1);
  await button.scrollIntoViewIfNeeded();
  const before=await page.evaluate(()=>({y:scrollY,span:document.querySelector('.sports-panel').style.gridRowEnd,h:document.querySelector('.sports-panel').getBoundingClientRect().height}));
  await button.focus();await page.keyboard.press('Enter');await expect(futures(a)).toHaveCount(12);await expect(futures(b)).toHaveCount(1);
  await expect.poll(()=>a.evaluate(e=>e.style.gridRowEnd)).not.toBe(before.span);
  const expanded=await page.evaluate(()=>({y:scrollY,span:document.querySelector('.sports-panel').style.gridRowEnd,h:document.querySelector('.sports-panel').getBoundingClientRect().height}));
  expect(Math.abs(expanded.y-before.y)).toBeLessThanOrEqual(2);expect(expanded.h).toBeGreaterThan(before.h+300);
  await button.scrollIntoViewIfNeeded();const preCollapse=await page.evaluate(()=>scrollY);
  await page.keyboard.press('Space');await expect(futures(a)).toHaveCount(1);await expect(futures(b)).toHaveCount(1);
  await expect.poll(()=>a.evaluate(e=>e.style.gridRowEnd)).toBe(before.span);
  const collapsed=await page.evaluate(()=>({y:scrollY,rects:Array.from(document.querySelectorAll('.sports-panel')).map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})}));
  expect(collapsed.y).toBeGreaterThan(1000);expect(Math.abs(collapsed.y-preCollapse)).toBeLessThanOrEqual(expanded.h-before.h+2);
  const [r1,r2]=collapsed.rects;expect(Math.min(r1.x+r1.w,r2.x+r2.w)-Math.max(r1.x,r2.x)<=1||Math.min(r1.y+r1.h,r2.y+r2.h)-Math.max(r1.y,r2.y)<=1).toBe(true);
  await b.locator('[data-upcoming-toggle]').click();await expect(futures(a)).toHaveCount(1);await expect(futures(b)).toHaveCount(12);
  await page.reload({waitUntil:'domcontentloaded'});await expect(futures(a)).toHaveCount(1);await expect(futures(b)).toHaveCount(12);
  console.log('scroll/masonry',JSON.stringify({before,expanded,preCollapse,collapsed}));
  await info.attach('scroll-masonry-measurements',{body:JSON.stringify({before,expanded,preCollapse,collapsed},null,2),contentType:'application/json'});
});


test('vrai retour arrière BFCache : document et préférence conservés @ci-critical',async({},info)=>{
  const key=`.sports-back-${process.pid}-${Date.now()}`;
  const sportFile=new URL(`./fixtures/${key}.html`,import.meta.url),awayFile=new URL(`./fixtures/${key}-away.html`,import.meta.url);
  const instrument='<script>window.__documentId=Math.random();window.addEventListener("pageshow",e=>window.__cacheRestored=e.persisted)</script>';
  writeFileSync(sportFile,fixture()+instrument+`<a id="leave" href="/tests/fixtures/${key}-away.html">Autre page</a>`);
  writeFileSync(awayFile,'<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Autre page locale</title></head><body><p>Retour par le navigateur.</p></body></html>');
  const browser=await chromium.launch({channel:'chromium',ignoreDefaultArgs:['--disable-back-forward-cache']});
  try {
    const context=await browser.newContext({baseURL:`http://127.0.0.1:${process.env.PW_PORT||4173}`,viewport:{width:1440,height:1000}});
    // Pas de route/interception réseau ni horloge CDP : documents HTTP réels éligibles BFCache.
    await context.addInitScript(ms=>{const Native=Date;window.Date=class extends Native{constructor(...args){super(...(args.length?args:[ms]));}static now(){return ms;}};},fixed.getTime());
    const page=await context.newPage();const cdp=await context.newCDPSession(page);const misses=[];cdp.on('Page.backForwardCacheNotUsed',e=>misses.push(e));await cdp.send('Page.enable');await page.goto(`/tests/fixtures/${key}.html`,{waitUntil:'domcontentloaded'});
    const card=alpha(page);await card.locator('[data-upcoming-toggle]').click();await expect(futures(card)).toHaveCount(12);
    const id=await page.evaluate(()=>window.__documentId);
    await page.locator('#leave').click();await expect(page).toHaveTitle('Autre page locale');
    await page.goBack({waitUntil:'commit'});
    const restored=await page.evaluate(()=>({id:window.__documentId,persisted:window.__cacheRestored,navigation:performance.getEntriesByType('navigation')[0]?.type,reasons:performance.getEntriesByType('navigation')[0]?.notRestoredReasons?.toJSON?.()}));
    console.log('BFCache diagnostics',JSON.stringify({restored,misses}));
    await info.attach('real-back-cache',{body:JSON.stringify(restored,null,2),contentType:'application/json'});
    expect(restored.id).toBe(id);expect(restored.persisted).toBe(true);await expect(futures(card)).toHaveCount(12);await expect(card.locator('[data-upcoming-toggle]')).toHaveAttribute('aria-expanded','true');
    await context.close();
  } finally {if(existsSync(sportFile))unlinkSync(sportFile);if(existsSync(awayFile))unlinkSync(awayFile);await browser.close();}
});

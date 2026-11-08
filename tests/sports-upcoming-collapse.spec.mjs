import { test, expect } from '@playwright/test';
const fixed = new Date('2026-11-08T17:00:00Z'); // midi HNE
const kickoff = (day, time='13:00') => Date.parse(`${day}T${time}:00-05:00`);
function row(id, date, { final=false, live=false, time='13:00' }={}) {
  return `<li class="sports-result ${final?'sports-result--W':live?'sports-result--live':'sports-result--next'}" data-game-id="${id}" data-hydration-key="${id}" data-kickoff-ts="${kickoff(date,time)}" data-live-excluded="${final?'1':'0'}"${final?' data-result="W"':''}><time class="sports-result__time" datetime="${date}">${date}<span class="sports-result__clock">${time}</span></time><span class="sports-result__score">${final?'2–1':live?'0–0':'À venir'}</span><span class="sports-result__title"><a href="https://example.org/game?GameId=${id}">Adversaire ${id}</a></span><span class="sports-result__badge">→</span></li>`;
}
function fixture(n=12, lang='fr') {
  const games = Array.from({length:n},(_,i)=>row(`g${i}`,i<2?'2026-11-08':`2026-11-${String(9+i).padStart(2,'0')}`,{time:i===1?'14:00':'13:00'})).join('');
  const panel = (id,league,body) => `<section class="sports-panel" data-team="${id}" data-league="${league}" data-sport="hockey" data-sector="universitaire" data-sex="m" data-search="Même équipe ${league}" data-results-source-url="https://example.org/${league}"><header class="sports-panel__head"><h3 class="sports-panel__name"><span class="sports-panel__name-text">Même équipe ${league}</span></h3></header><ul class="sports-panel__list">${body}</ul></section>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/seo-pages.css"></head><body><main class="wire seo-wire" data-sports-board><div>${['all','today','live','week'].map(p=>`<button type="button" data-filter-period="${p}" aria-pressed="${p==='all'}">${p}</button>`).join('')}</div><span data-sports-status></span><details class="sports-sport-block" data-sport="hockey" open><summary>Hockey</summary><div class="sports-board" data-sports-schedule-sort>${panel('alpha','A',games+row('past','2026-11-07',{final:true})+row('live','2026-11-08',{live:true,time:'11:00'}))}${panel('beta','B',row('b0','2026-11-10'))}</div></details></main><script src="/scripts/sports-freshness-lib.js"></script><script src="/sports-board.js"></script></body></html>`;
}
async function open(page,{n=12,lang='fr',query='',width=390}={}) {
  await page.setViewportSize({width,height:900});
  await page.clock.setFixedTime(fixed);
  await page.route('**/sports/**',r=>r.request().isNavigationRequest()?r.fulfill({body:fixture(n,lang),contentType:'text/html'}):r.continue());
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

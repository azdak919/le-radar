import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pages = require('../scripts/article-pages');
const news = JSON.parse(readFileSync(new URL('../news.json', import.meta.url), 'utf8'));
const item = news.items.find(i => /karmina-vampires-quebecois/.test(i.link));
const placeholder = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="779"><rect width="600" height="779" fill="#241b1b"/><text x="80" y="500" fill="#e33" font-size="70">KARMINA</text></svg>');
for (const [name, viewport] of [['desktop', {width:1440,height:1000}], ['mobile', {width:390,height:844}]]) {
  test(`Karmina : fil et fiche en cover ${name}`, async ({page}, testInfo) => {
    await page.setViewportSize(viewport);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.href === item.image) return route.fulfill({body:process.env.KARMINA_IMAGE ? readFileSync(process.env.KARMINA_IMAGE) : placeholder, contentType:process.env.KARMINA_IMAGE ? 'image/jpeg' : 'image/svg+xml'});
      if (url.pathname === '/news.json') return route.fulfill({json:{...news,items:[item]}});
      if (url.pathname === '/article/76bd8d7a1889e2e8/') return route.fulfill({body:pages.renderPage(pages.loadTemplate(),pages.recordOf(item)),contentType:'text/html'});
      if (url.hostname !== '127.0.0.1') return route.abort();
      return route.continue();
    });
    await page.goto('/', {waitUntil:'domcontentloaded'});
    await page.addStyleTag({content:'#local-lab-format-bar { display:none!important; }'});
    const card = page.locator('#news-list .article').filter({hasText:'Karmina'}).first();
    await expect(card).toBeVisible();
    const img = card.locator('.article-media img');
    await expect(img).toHaveAttribute('src', item.image);
    await expect(img).toHaveCSS('object-fit','cover');
    await expect(img).toHaveCSS('object-position','50% 50%');
    await expect(card.locator('.article-media-credit')).toContainText('Éléphant Films');
    await expect(card.locator('.article-media')).not.toContainText('abdallahh');
    const dims = await img.evaluate(el=>({w:el.clientWidth,h:el.clientHeight,nw:el.naturalWidth,nh:el.naturalHeight}));
    expect(dims.nw).toBe(600); expect(dims.nh).toBe(779);
    expect(dims.w/dims.h).toBeCloseTo(1.5, 1);
    await card.screenshot({animations:'disabled',path:testInfo.outputPath(`karmina-feed-${name}.png`)});
    await page.goto('/article/76bd8d7a1889e2e8/',{waitUntil:'domcontentloaded'});
    await page.addStyleTag({content:'#local-lab-format-bar { display:none!important; }'});
    const figure = page.locator('.seo-article__figure');
    const photo = figure.locator('img');
    await expect(photo).toHaveAttribute('src',item.image);
    await expect(photo).toHaveCSS('object-fit','cover');
    await expect(photo).toHaveCSS('object-position','50% 50%');
    await expect(photo).toHaveCSS('aspect-ratio','3 / 2');
    await expect(figure).toContainText('Éléphant Films');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content',item.image);
    await figure.screenshot({animations:'disabled',path:testInfo.outputPath(`karmina-article-${name}.png`)});
  });
}

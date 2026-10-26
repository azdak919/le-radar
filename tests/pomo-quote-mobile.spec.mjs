import { expect, test } from '@playwright/test';

// Carte citation du Pomo sur téléphone : le chevron ne touche jamais le texte,
// les actions (icônes 44 px) restent au-dessus du pied de page en verre, les
// cartes ne se chevauchent pas et la page ne défile pas — y compris avec la
// barre d'adresse de Chrome (412×780) et la plus longue citation de la liste.
// Barre radio partagée : la 2e ligne de la station n'est jamais rognée au début.

const SIZES = [[360, 640], [390, 844], [412, 780], [412, 915]];
const hit = (a, b) => a && b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

for (const [width, height] of SIZES) {
  for (const len of ['courte', 'longue']) {
    test(`pomo citation ${len} ${width}×${height} : rien ne se chevauche @ci-critical`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      await page.goto('/pomo/', { waitUntil: 'load' });
      await page.waitForTimeout(1200);
      await page.evaluate((long) => {
        const t = document.getElementById('quote-text');
        const a = document.getElementById('quote-author');
        if (long) {
          const q = [...QUOTES].sort((x, y) => y.text.length - x.text.length)[0];
          t.textContent = q.text; a.textContent = q.authorEn || q.author;
        } else { t.textContent = 'Fais ce que dois.'; a.textContent = 'Sénèque'; }
        t.style.opacity = '1'; a.style.opacity = '1';
      }, len === 'longue');
      await page.waitForTimeout(900);
      const r = await page.evaluate(() => {
        const R = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.height ? { left: b.left, top: b.top, right: b.right, bottom: b.bottom, w: b.width, h: b.height } : null; };
        const textRange = document.createRange(); textRange.selectNodeContents(document.getElementById('quote-text'));
        const lines = [...textRange.getClientRects()].map((b) => ({ left: b.left, top: b.top, right: b.right, bottom: b.bottom }));
        return {
          chev: R('#quote-minimize-btn'), text: R('#quote-text'), author: R('#quote-author'), lines,
          acts: [R('#btn-new'), R('#btn-bg')], card: R('#quote-card'), pomo: R('#pomo-widget'), foot: R('.bottom-badges'),
          labels: [...document.querySelectorAll('.quote-action-btn')].map((b) => [b.getAttribute('aria-label'), b.title]),
          sh: document.documentElement.scrollHeight, vh: innerHeight,
        };
      });
      expect(r.sh, 'pas de défilement').toBeLessThanOrEqual(r.vh);
      for (const l of r.lines) expect(hit(l, r.chev), 'chevron sur le texte').toBe(false);
      expect(hit(r.author, r.chev), 'chevron sur l’attribution').toBe(false);
      for (const a of r.acts) {
        expect(a.w).toBeGreaterThanOrEqual(44); expect(a.h).toBeGreaterThanOrEqual(44);
        expect(hit(a, r.foot), 'action sous le pied de page').toBe(false);
        expect(hit(a, r.chev)).toBe(false);
        expect(hit(a, r.text)).toBe(false);
      }
      expect(r.card.bottom, 'carte sous le pied de page').toBeLessThanOrEqual(r.foot.top);
      expect(hit(r.pomo, r.card), 'cartes superposées').toBe(false);
      for (const [aria, title] of r.labels) { expect(aria).toBeTruthy(); expect(title).toBe(aria); }
      await ctx.close();
    });
  }
}

for (const app of ['pomo', 'solitaire', '']) {
  test(`barre radio ${app || 'radar'} : 2e ligne de station jamais rognée au début @ci-critical`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 780 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto(`/${app}${app ? '/' : ''}`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const frame = page.frames().find((f) => f.url().includes('tuner-embed')) || page.mainFrame();
    // Simule un défilement figé en plein milieu puis la mise en pause (arrière-plan).
    const res = await frame.evaluate(() => {
      const sub = document.querySelector('.tuner-now-sub');
      if (!sub) return null;
      let txt = sub.querySelector('.tuner-now-sub-text');
      if (!txt) { txt = document.createElement('span'); txt.className = 'tuner-now-sub-text'; sub.replaceChildren(txt); }
      txt.textContent = "À l'antenne · Le Lendemain de la veille — une très longue émission du matin";
      sub.classList.add('is-marquee');
      sub.style.setProperty('--marquee-shift', '-60px');
      sub.style.setProperty('--marquee-delay', '0s');
      sub.style.setProperty('--marquee-duration', '0.01s');
      sub.style.setProperty('--marquee-trips', '1');
      document.documentElement.classList.add('is-tuner-presentation-paused');
      return new Promise((ok) => setTimeout(() => {
        const a = sub.getBoundingClientRect(); const b = txt.getBoundingClientRect();
        ok({ boxLeft: a.left, textLeft: b.left, overflow: getComputedStyle(sub).textOverflow });
      }, 200));
    });
    if (!res) test.skip(true, 'pas de ligne de station');
    expect(res.textLeft, 'texte rogné au début').toBeGreaterThanOrEqual(res.boxLeft - 0.5);
    expect(res.overflow).toBe('ellipsis');
    await ctx.close();
  });
}

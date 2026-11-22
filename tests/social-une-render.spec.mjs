import { test, expect } from '@playwright/test';

// Une sociale (affiches/social-une.html) : cas limites rendus dans les 3 formats et les 2 thèmes.
// Rien ne déborde, aucun nom coupé, sport en deux colonnes (ou une seule pleine largeur),
// couleurs d'établissement lisibles (AA) avec repli sur l'accent, « Par » plus pâle que l'auteur.
const SIZES = { portrait: [1080, 1350], story: [1080, 1920], paysage: [1200, 675] };
const IMG = '/assets/kit/affiche-11x17.jpg';
const item = (n, o = {}) => ({ title: `Article numéro ${n} pour la une`, byline: `Autrice ${n} · Le Journal`, source: 'Le Journal', place: 'Concordia', placeColor: '#912338', hook: 'Une accroche en français.', credit: 'Photo : Équipe', images: [IMG], ...o });
const res = (n, o = {}) => ({ emoji: '🏀', sport: 'Basketball (H)', kind: 'resultat', when: 'Final · jeu. 12 nov.', teams: [{ name: `Stingers${n}`, inst: 'Concordia', color: '#912338', score: 68 }, { name: 'Redbirds', inst: 'McGill', color: '#ED1B2F', score: 44 }], tie: false, ...o });
const nxt = (n, o = {}) => ({ emoji: '🏐', sport: 'Volleyball (F)', kind: 'avenir', when: 'ven. 13 nov. · 18 h', verb: n % 2 ? 'reçoit' : 'visite', teams: [{ name: `Rouge et Or${n}`, inst: 'Laval', color: '#E30513' }, { name: 'Vert & Or', inst: 'Sherbrooke', color: '#00A759' }], ...o });
const radio = (n) => ({ emoji: '📻', title: `Émission ${n}`, station: `Station ${n}`, when: `ven. 13 nov. · ${8 + n} h` });
const base = () => ({ items: [item(1), item(2, { place: 'Cégep inconnu', placeColor: '' }), item(3)], sports: { results: [res(1), res(2), res(3)], next: [nxt(1), nxt(2), nxt(3)] }, radio: [radio(1), radio(2), radio(3), radio(4), radio(5)] });
const LONG = 'Patriotes de l’Université du Québec à Trois-Rivières';
const CASES = {
  complet: (m) => m,
  'sans résultats': (m) => { m.sports.results = []; return m; },
  'sans prochains matchs': (m) => { m.sports.next = []; return m; },
  'sans sport': (m) => { m.sports = { results: [], next: [] }; return m; },
  'sans radio': (m) => { m.radio = []; return m; },
  'sans photo': (m) => { m.items[0].images = []; return m; },
  'noms très longs': (m) => { m.sports.results[0].teams[0].name = LONG; m.sports.next[0].teams[1].name = LONG; m.items[0].title = 'Un titre très long '.repeat(8); return m; },
  'couleur inconnue': (m) => { m.items.forEach((i) => { i.placeColor = ''; }); m.sports.results.forEach((r) => r.teams.forEach((t) => { t.color = ''; })); return m; },
  'un seul article': (m) => { m.items = m.items.slice(0, 1); return m; },
};

for (const kind of ['matin', 'soir']) {
  for (const [format, [width, height]] of Object.entries(SIZES)) {
    for (const [name, patch] of Object.entries(CASES)) {
      test(`une sociale ${kind} ${format} : ${name} @ci-critical`, async ({ page }) => {
        await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
        await page.setViewportSize({ width, height });
        await page.goto('/affiches/social-une.html', { waitUntil: 'load' });
        const model = { slot: { label: `La une du ${kind}`, kind, dayLabel: 'Jeudi 12 novembre' }, ...patch(base()) };
        const info = await page.evaluate((a) => window.renderUne(a), { model, format });
        expect(info.overflow, 'aucun débordement').toBe(false);
        const out = await page.evaluate(() => {
          const L = (c) => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
          const R = (a, b) => { const [x, y] = [L(a), L(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
          const card = document.getElementById('card');
          const glassBg = getComputedStyle(card).getPropertyValue('--glass').trim();
          const bg = glassBg.startsWith('rgba') ? glassBg.replace(/,\s*[\d.]+\)$/, ')').replace('rgba', 'rgb') : glassBg;
          const toRgb = (c) => { const d = document.createElement('i'); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; };
          const B = toRgb(bg);
          const by = document.querySelector('.lead .by');
          return {
            cut: [...document.querySelectorAll('.ml, .mh, .show .st')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent),
            ellipsis: [...document.querySelectorAll('.ml')].some((e) => /…/.test(e.textContent)),
            cols: document.querySelector('.sports .grid')?.dataset.cols || '0',
            colTitles: [...document.querySelectorAll('.sports .scol h3')].map((e) => e.textContent),
            empty: [...document.querySelectorAll('.sports .scol')].filter((c) => !c.querySelector('.mt')).length,
            place: [...document.querySelectorAll('.kick .media, .kick .place, .ml .in')].map((e) => R(getComputedStyle(e).color, B)),
            by: by && by.querySelector('.lbl') ? [getComputedStyle(by.querySelector('.lbl')).color, getComputedStyle(by.querySelector('.who')).color, R(getComputedStyle(by.querySelector('.lbl')).color, B)] : null,
            kickers: [...document.querySelectorAll('.lead .kick, .item .kick')].map((k) => {
              const media = k.querySelector('.media'), place = k.querySelector('.place'), labs = k.querySelector('.labs');
              return {
                where: k.closest('.lead') ? 'lead' : 'item',
                kick: getComputedStyle(k).color,
                media: media && getComputedStyle(media).color,
                place: place && getComputedStyle(place).color,
                text: labs ? labs.textContent.replace(/\s+/g, ' ').trim() : '',
              };
            }),
          };
        });
        expect(out.cut, 'aucun nom coupé').toEqual([]);
        expect(out.ellipsis).toBe(false);
        expect(out.empty, 'pas de colonne vide').toBe(0);
        if (info.sports) {
          const two = out.colTitles.length === 2;
          expect(out.cols).toBe(two ? '2' : '1');
          if (name === 'sans résultats') expect(out.colTitles).toEqual(['Prochains matchs']);
          if (name === 'sans prochains matchs') expect(out.colTitles).toEqual(['Résultats']);
        }
        if (name === 'sans sport') expect(info.sports).toBe(0);
        if (name === 'sans radio') expect(info.radio).toBe(0);
        if (name === 'complet' && format !== 'paysage') expect(info.sports).toBeGreaterThanOrEqual(4);
        if (name === 'complet' && format === 'portrait') expect(info.radio).toBe(4);
        if (name === 'complet' && format === 'story') expect(info.radio).toBeGreaterThanOrEqual(3);
        if (name === 'complet') expect(await page.locator('.lead .hook').count(), 'résumé de la une présent').toBe(1);
        if (name === 'complet') {
          const branded = out.kickers.filter((k) => k.text.includes('Concordia'));
          const fallback = out.kickers.filter((k) => k.text.includes('Cégep inconnu'));
          expect(branded.length, 'kicker de la une et des cartes Aussi à la une').toBeGreaterThanOrEqual(1);
          for (const k of branded) {
            expect(k.place, `${k.where}: sigle en couleur normale du kicker`).toBe(k.kick);
            expect(k.media, `${k.where}: média dans la couleur d’établissement, pas celle du sigle`).not.toBe(k.place);
          }
          for (const k of fallback) {
            expect(k.place, `${k.where}: sigle en couleur normale`).toBe(k.kick);
            expect(k.media, `${k.where}: sans couleur d’établissement, le média reprend l’accent`).toBe(k.kick);
          }
        }
        if (name === 'complet' && format === 'portrait') {
          const kicks = await page.locator('.kick .labs').allTextContents();
          expect(kicks.map((t) => t.replace(/\s+/g, ' ').trim()), 'média · sigle, pas le nom complet').toEqual([
            'Le Journal · Concordia',
            'Le Journal · Cégep inconnu',
            'Le Journal · Concordia',
          ]);
          expect(await page.locator('.lead .by .src').textContent()).toMatch(/Le Journal/);
        }
        if (format === 'story') { const nb = await page.evaluate(() => { const c = document.getElementById('card').getBoundingClientRect(); return [...document.querySelectorAll('.slot, .title, .foot .full, .foot .ind')].filter((e) => { const r = e.getBoundingClientRect(); return r.top < c.top + 140 || r.bottom > c.bottom - 250; }).length; }); expect(nb, 'zones sûres Instagram/Facebook').toBe(0); }
        if (name === 'complet' && format === 'paysage') expect(info.sports).toBeGreaterThanOrEqual(3);
        for (const r of out.place) expect(r, 'couleur d’établissement AA').toBeGreaterThanOrEqual(4.5);
        if (out.by) { expect(out.by[0]).not.toBe(out.by[1]); expect(out.by[2]).toBeGreaterThanOrEqual(4.5); }
      });
    }
  }
}

for (const kind of ['matin', 'soir']) {
  test(`instagram 3:4 ${kind} : titre, auteurs, média et crédit dans le carré de la grille @ci-critical`, async ({ page }) => {
    await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
    await page.setViewportSize({ width: 1080, height: 1440 });
    await page.goto('/affiches/social-une.html', { waitUntil: 'load' });
    const model = { slot: { label: `La une du ${kind}`, kind, dayLabel: 'Dimanche 22 novembre' }, items: [item(1, { title: 'La bibliothèque prolonge ses heures', source: 'Impact Campus', byline: 'Autrice 1 et Autrice 2 · Impact Campus', credit: 'Thekidpossum, CC BY-SA 4.0, Wikimedia Commons' })] };
    const info = await page.evaluate((a) => window.renderUne(a), { model, format: 'grille' });
    expect(info.overflow).toBe(false);
    expect(info.shown).toBe(1);
    const zone = await page.evaluate(() => {
      const c = document.getElementById('card').getBoundingClientRect();
      const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top - c.top, bottom: r.bottom - c.top, text: e.textContent }; };
      const labels = [...document.querySelectorAll('.ig-kicker, .ig-edge span')].map((e) => e.textContent.trim()).filter(Boolean);
      return {
        title: box('.ig-title'), brand: box('.ig-brand'), credit: box('.ig-credit'), media: box('.ig-media'), by: box('.ig-by'),
        brandBg: getComputedStyle(document.querySelector('.ig-brand')).backgroundColor,
        size: parseFloat(getComputedStyle(document.querySelector('.ig-title')).fontSize),
        creditText: document.querySelector('.ig-credit').textContent,
        mediaText: document.querySelector('.ig-media').textContent,
        byText: document.querySelector('.ig-by')?.textContent,
        dateText: document.querySelector('.ig-kicker .date')?.textContent,
        kickerText: document.querySelector('.ig-kicker')?.textContent,
        qr: document.querySelector('.ig-qr'),
        photo: box('.ig-photo'),
        labels,
        w: c.width, h: c.height,
      };
    });
    expect(zone.w).toBe(1080); expect(zone.h).toBe(1440);
    expect(zone.size).toBeGreaterThanOrEqual(60);
    expect(zone.size).toBeLessThanOrEqual(80);
    expect(zone.mediaText).toBe('Impact Campus');
    expect(zone.byText).toBe('Par\u00A0Autrice 1 et Autrice 2');
    expect(zone.creditText).toBe('📸 Thekidpossum, CC BY-SA 4.0, Wikimedia Commons');
    expect(zone.labels.filter((t) => t.toLowerCase().includes(`la une du ${kind}`)).length, 'libellé du créneau une seule fois').toBe(1);
    expect(zone.dateText).toBe('Dimanche 22 novembre');
    expect(zone.kickerText.replace(/\s+/g, ' ').trim().toLowerCase()).toBe(`la une du ${kind} · dimanche 22 novembre`);
    expect(zone.qr, 'pas de QR sans pageUrl d’article').toBeNull();
    expect(zone.brandBg === 'rgba(0, 0, 0, 0)' || zone.brandBg === 'transparent', 'pas de capsule derrière la marque').toBeTruthy();
    expect(zone.photo.top).toBeLessThanOrEqual(0);
    expect(zone.photo.bottom).toBeGreaterThanOrEqual(1440);
    for (const b of [zone.title, zone.brand, zone.credit, zone.media, zone.by]) {
      expect(b, 'élément présent dans le carré').toBeTruthy();
      expect(b.top).toBeGreaterThanOrEqual(180);
      expect(b.bottom).toBeLessThanOrEqual(1260);
    }
  });

  test(`instagram 3:4 ${kind} : pas de « Par » si la signature n’est que le média @ci-critical`, async ({ page }) => {
    await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
    await page.setViewportSize({ width: 1080, height: 1440 });
    await page.goto('/affiches/social-une.html', { waitUntil: 'load' });
    const model = { slot: { label: `La une du ${kind}`, kind, dayLabel: 'Dimanche 22 novembre' }, items: [item(1, { source: 'Impact Campus', byline: 'Impact Campus', credit: 'Photo : Équipe' })] };
    await page.evaluate((a) => window.renderUne(a), { model, format: 'grille' });
    expect(await page.locator('.ig-by').count()).toBe(0);
    expect(await page.locator('.ig-media').textContent()).toBe('Impact Campus');
    expect(await page.locator('.ig-credit').textContent()).toBe('📸 Équipe');
  });
}


for (const kind of ['matin', 'soir']) {
  test(`instagram 3:4 ${kind} : QR vers la fiche Radar, dans le carré, décodable @ci-critical`, async ({ page }, testInfo) => {
    await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
    await page.setViewportSize({ width: 1080, height: 1440 });
    await page.goto('/affiches/social-une.html', { waitUntil: 'load' });
    const pageUrl = 'https://le-radar.ca/article/dac64fa8d6a7b3df/';
    const model = { slot: { label: `La une du ${kind}`, kind, dayLabel: 'Dimanche 22 novembre' }, items: [item(1, { title: 'La bibliothèque prolonge ses heures', source: 'Impact Campus', byline: 'Autrice 1 · Impact Campus', credit: 'Photo : Équipe', pageUrl })] };
    await page.evaluate((a) => window.renderUne(a), { model, format: 'grille' });
    const qr = page.locator('.ig-qr');
    await expect(qr).toHaveCount(1);
    await expect(qr).toHaveAttribute('data-url', pageUrl);
    const box = await page.evaluate(() => {
      const c = document.getElementById('card').getBoundingClientRect();
      const rel = (e) => { const r = e.getBoundingClientRect(); return { top: r.top - c.top, bottom: r.bottom - c.top, left: r.left - c.left, right: r.right - c.left, mid: (r.left + r.right) / 2 - c.left }; };
      const qr = rel(document.querySelector('.ig-qr'));
      const brand = rel(document.querySelector('.ig-brand'));
      const logo = document.querySelector('.ig-brand img');
      return {
        qr, brand,
        logo: logo.getBoundingClientRect().height,
        wm: parseFloat(getComputedStyle(document.querySelector('.ig-brand .wm')).fontSize),
      };
    });
    expect(box.qr.top).toBeGreaterThanOrEqual(180);
    expect(box.qr.bottom).toBeLessThanOrEqual(1260);
    expect(box.qr.mid, 'QR dans le quart supérieur droit').toBeGreaterThan(540);
    expect(box.brand.top).toBeGreaterThanOrEqual(180);
    expect(box.brand.bottom).toBeLessThanOrEqual(1260);
    expect(box.wm, 'corps du mot-symbole = hauteur de l’icône').toBe(box.logo);
    expect(box.wm).toBe(100);
    expect(box.brand.right, 'la signature ne chevauche pas le QR').toBeLessThanOrEqual(box.qr.left - 8);
    // Décode le JPEG rendu si zbarimg est disponible (aperçus v4 aussi vérifiés ainsi).
    const shot = await page.locator('#card').screenshot({ type: 'jpeg', quality: 92 });
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const tmp = testInfo.outputPath('ig-qr.jpg');
    fs.writeFileSync(tmp, shot);
    let decoded;
    try {
      decoded = execFileSync('zbarimg', ['-q', '--raw', tmp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\n/).filter(Boolean).pop();
    } catch (e) {
      if (e.code === 'ENOENT') decoded = undefined; // zbarimg optionnel en CI
      else throw e;
    }
    if (decoded !== undefined) expect(decoded).toBe(pageUrl);
  });

  test(`instagram 3:4 ${kind} : pas de QR si l’URL n’est pas une fiche Radar @ci-critical`, async ({ page }) => {
    await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
    await page.setViewportSize({ width: 1080, height: 1440 });
    await page.goto('/affiches/social-une.html', { waitUntil: 'load' });
    const model = { slot: { label: `La une du ${kind}`, kind, dayLabel: 'Dimanche 22 novembre' }, items: [item(1, { pageUrl: 'https://quartierlibre.ca/exemple/' })] };
    await page.evaluate((a) => window.renderUne(a), { model, format: 'grille' });
    expect(await page.locator('.ig-qr').count()).toBe(0);
  });
}

test('instagram 3:4 sport : trois résultats réels dans le carré @ci-critical', async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 1440 });
  await page.goto('/affiches/social-une.html', { waitUntil: 'load' });
  const model = {
    poster: 'sport',
    slot: { label: 'Résultats de la fin de semaine', dayLabel: '14-16 nov.' },
    media: 'U SPORTS · RSEQ',
    results: [
      { emoji: '🏈', sport: 'Football (H)', a: 'Rouge et Or', as: '24', b: 'Carabins', bs: '17' },
      { emoji: '🏒', sport: 'Hockey (F)', a: 'Stingers', as: '3', b: 'Martlets', bs: '1' },
      { emoji: '🏀', sport: 'Basketball (H)', a: 'Vert & Or', as: '78', b: 'Citadins', bs: '71' },
    ],
  };
  const info = await page.evaluate((a) => window.renderUne(a), { model, format: 'grille' });
  expect(info.overflow).toBe(false);
  expect(info.sports).toBe(3);
  const lines = await page.locator('.ig-line').allTextContents();
  expect(lines[0]).toContain('Rouge et Or');
  expect(lines[0]).toContain('24');
  const top = await page.locator('.ig-line').first().evaluate((e) => { const c = document.getElementById('card').getBoundingClientRect(); const r = e.getBoundingClientRect(); return { top: r.top - c.top, bottom: r.bottom - c.top }; });
  expect(top.top).toBeGreaterThanOrEqual(180);
  expect(top.bottom).toBeLessThanOrEqual(1260);
  expect(await page.locator('.ig-qr').count(), 'pas de QR sur un post qui n’est pas un article').toBe(0);
});

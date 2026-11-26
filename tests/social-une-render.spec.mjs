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
          // Deux colonnes très inégales : empilées (« stack ») sur toute la largeur.
          expect(two ? ['2', 'stack'] : ['1']).toContain(out.cols);
          if (name === 'sans résultats') expect(out.colTitles).toEqual(['Prochains matchs']);
          if (name === 'sans prochains matchs') expect(out.colTitles).toEqual(['Résultats']);
        }
        if (name === 'sans sport') expect(info.sports).toBe(0);
        if (name === 'sans radio') expect(info.radio).toBe(0);
        if (name === 'complet' && format !== 'paysage') expect(info.sports).toBeGreaterThanOrEqual(4);
        // Remplissage automatique : au moins 4 émissions, davantage si la place le permet (jamais de débordement, testé plus haut).
        if (name === 'complet' && format === 'portrait') expect(info.radio).toBeGreaterThanOrEqual(4);
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
  test(`instagram 3:4 ${kind} : couverture modèle B, pastille, date avec année @ci-critical`, async ({ page }) => {
    await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
    await page.setViewportSize({ width: 1080, height: 1440 });
    await page.goto('/affiches/social-une.html', { waitUntil: 'load' });
    const model = {
      slot: { label: `La une du ${kind}`, kind, dayLabel: 'Dimanche 22 novembre', dayLabelYear: 'Dimanche 22 novembre 2026' },
      items: [
        item(1, { title: 'La bibliothèque prolonge ses heures', source: 'Impact Campus', byline: 'Autrice 1 · Impact Campus', credit: 'Thekidpossum, CC BY-SA 4.0, Wikimedia Commons' }),
        item(2, { title: 'Deuxième titre à la une du jour', source: 'Quartier Libre', byline: 'Autrice 2 · Quartier Libre' }),
        item(3, { title: 'Troisième titre retenu pour la couverture', source: 'Le Collectif', byline: 'Autrice 3 · Le Collectif' }),
        item(4, { title: 'Quatrième titre seulement dans la légende', source: 'La Pige', byline: 'Autrice 4 · La Pige' }),
      ],
    };
    const info = await page.evaluate((a) => window.renderUne(a), { model, format: 'grille' });
    expect(info.overflow).toBe(false);
    expect(info.shown).toBe(3);
    const zone = await page.evaluate(() => {
      const card = document.getElementById('card');
      const c = card.getBoundingClientRect();
      const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top - c.top, bottom: r.bottom - c.top, left: r.left - c.left, text: e.textContent }; };
      const also = [...document.querySelectorAll('.ig-also-item h3')].map((e) => e.textContent.trim());
      return {
        className: card.className,
        x: c.x, y: c.y, w: c.width, h: c.height,
        margin: getComputedStyle(card).margin,
        title: box('.ig-title'), brand: box('.ig-brand'), credit: box('.ig-credit'), media: box('.ig-media'),
        by: box('.ig-by'), pill: box('.ig-pill'), date: box('.ig-date'),
        motto: box('.ig-motto'), mottoLead: box('.ig-motto .lead'), mottoTag: box('.ig-motto .tag'), wm: box('.ig-brand .wm'),
        titleFont: getComputedStyle(document.querySelector('.ig-title')).fontFamily,
        size: parseFloat(getComputedStyle(document.querySelector('.ig-title')).fontSize),
        creditText: document.querySelector('.ig-credit')?.textContent,
        mediaText: document.querySelector('.ig-media')?.textContent,
        byText: document.querySelector('.ig-by')?.textContent,
        edge: document.querySelector('.ig-edge'),
        qr: document.querySelector('.ig-qr'),
        also, alsoCount: also.length,
      };
    });
    expect(zone.w).toBe(1080); expect(zone.h).toBe(1440);
    expect(zone.x).toBe(0); expect(zone.y).toBe(0);
    expect(zone.margin).toBe('0px');
    expect(zone.className).toMatch(/une-b/);
    expect(zone.className).toMatch(/lead-photo/);
    expect(zone.className).not.toMatch(/(^| )photo( |$)/);
    expect(zone.edge, 'plus de barres noires de l’ancienne grille').toBeNull();
    expect(zone.qr, 'une Instagram : pas de QR (réservé à l’article)').toBeNull();
    expect(zone.pill.text.trim()).toBe(`La une du ${kind}`);
    expect(zone.date.text.trim()).toBe('Dimanche 22 novembre 2026');
    expect(zone.title.text.trim()).toBe('La bibliothèque prolonge ses heures');
    expect(zone.mediaText).toBe('Impact Campus');
    expect(zone.byText).toBe('Par\u00A0Autrice 1');
    expect(zone.creditText).toBe('📸 Thekidpossum, CC BY-SA 4.0, Wikimedia Commons');
    expect(zone.titleFont, 'titre en Source Serif 4').toMatch(/Source Serif 4/i);
    expect(zone.size).toBeGreaterThanOrEqual(44);
    expect(zone.mottoLead.text.trim()).toBe('Journaux, radios et sports étudiants du Québec,');
    expect(zone.mottoTag.text.trim()).toBe('réunis au même endroit');
    expect(zone.mottoTag.top, 'saut de ligne du slogan après « Québec, »').toBeGreaterThan(zone.mottoLead.bottom - 2);
    expect(Math.abs(zone.mottoLead.left - zone.wm.left), 'slogan aligné sur le mot-symbole').toBeLessThanOrEqual(2);
    expect(zone.alsoCount, 'jusqu’à 2 titres en Aussi à la une').toBe(2);
    expect(zone.also[0]).toMatch(/Deuxième titre/);
    expect(zone.also[1]).toMatch(/Troisième titre/);
    expect(zone.also.join(' ')).not.toMatch(/Quatrième titre/);
    const alsoLayout = await page.evaluate(() => {
      const c = document.getElementById('card').getBoundingClientRect();
      const pill = document.querySelector('.ig-pill').getBoundingClientRect();
      const rows = [...document.querySelectorAll('.ig-also-item')].map((row) => {
        const num = row.querySelector('.num').getBoundingClientRect();
        const h3 = row.querySelector('h3').getBoundingClientRect();
        const thumb = row.querySelector('.thumb').getBoundingClientRect();
        return {
          numLeft: num.left - c.left, numTop: num.top - c.top, numW: num.width,
          h3W: h3.width, h3Left: h3.left - c.left, h3Text: row.querySelector('h3').textContent,
          thumbLeft: thumb.left - c.left,
          pillTop: pill.top - c.top, pillBottom: pill.bottom - c.top,
        };
      });
      return rows;
    });
    for (const row of alsoLayout) {
      expect(row.numTop, 'numéro aussi dans la liste, pas sur la pastille').toBeGreaterThan(row.pillBottom + 20);
      expect(row.h3W, 'titre aussi assez large pour se lire').toBeGreaterThan(400);
      expect(row.h3Left).toBeGreaterThan(row.thumbLeft);
      expect(row.numW).toBeGreaterThanOrEqual(36);
    }
  });
}

for (const kind of ['matin', 'soir']) {
  test(`article 3:4 ${kind} : titre, auteurs, média et crédit dans le carré du post article @ci-critical`, async ({ page }) => {
    await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
    await page.setViewportSize({ width: 1080, height: 1440 });
    await page.goto('/affiches/social-une.html', { waitUntil: 'load' });
    const model = { slot: { label: `La une du ${kind}`, kind, dayLabel: 'Dimanche 22 novembre 2026' }, items: [item(1, { title: 'La bibliothèque prolonge ses heures', source: 'Impact Campus', byline: 'Autrice 1 et Autrice 2 · Impact Campus', credit: 'Thekidpossum, CC BY-SA 4.0, Wikimedia Commons' })] };
    const info = await page.evaluate((a) => window.renderUne(a), { model, format: 'article' });
    expect(info.overflow).toBe(false);
    expect(info.shown).toBe(1);
    const zone = await page.evaluate(() => {
      const c = document.getElementById('card').getBoundingClientRect();
      const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top - c.top, bottom: r.bottom - c.top, left: r.left - c.left, right: r.right - c.left, text: e.textContent }; };
      const labels = [...document.querySelectorAll('.ig-kicker, .ig-edge span')].map((e) => e.textContent.trim()).filter(Boolean);
      return {
        title: box('.ig-title'), brand: box('.ig-brand'), credit: box('.ig-credit'), media: box('.ig-media'), by: box('.ig-by'),
        motto: box('.ig-motto'), wm: box('.ig-brand .wm'),
        mottoLead: box('.ig-motto .lead'), mottoTag: box('.ig-motto .tag'),
        titleFont: getComputedStyle(document.querySelector('.ig-title')).fontFamily,
        brandBg: getComputedStyle(document.querySelector('.ig-brand')).backgroundColor,
        size: parseFloat(getComputedStyle(document.querySelector('.ig-title')).fontSize),
        wmSize: parseFloat(getComputedStyle(document.querySelector('.ig-brand .wm')).fontSize),
        logoH: document.querySelector('.ig-brand img')?.getBoundingClientRect().height,
        creditText: document.querySelector('.ig-credit').textContent,
        mediaText: document.querySelector('.ig-kicker .media')?.textContent,
        mediaColor: document.querySelector('.ig-kicker .media')?.style.color,
        mediaCount: document.querySelectorAll('.ig-media').length,
        byText: document.querySelector('.ig-by')?.textContent,
        dateText: document.querySelector('.ig-kicker .date')?.textContent,
        kickerText: document.querySelector('.ig-kicker')?.textContent,
        mottoText: document.querySelector('.ig-motto')?.textContent,
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
    expect(zone.mediaCount, 'le média n’est plus répété sous le titre').toBe(0);
    expect(zone.mediaColor, 'couleur d’établissement appliquée au nom du média').toBeTruthy();
    expect(zone.byText).toBe('Par\u00A0Autrice 1 et Autrice 2');
    expect(zone.creditText).toBe('📸 Thekidpossum, CC BY-SA 4.0, Wikimedia Commons');
    expect(zone.labels.filter((t) => t.toLowerCase().includes(`la une du ${kind}`)).length, 'pas de libellé de créneau de une').toBe(0);
    expect(zone.dateText).toBe('Dimanche 22 novembre 2026');
    expect(zone.kickerText.replace(/\s+/g, ' ').trim()).toBe('Impact Campus · Dimanche 22 novembre 2026');
    expect(zone.mottoText.replace(/\s+/g, ' ').trim()).toBe('Journaux, radios et sports étudiants du Québec, réunis au même endroit');
    expect(zone.wmSize, 'corps du mot-symbole = hauteur de l’icône').toBe(zone.logoH);
    expect(zone.wmSize).toBe(100);
    expect(zone.titleFont, 'titre en Source Serif 4').toMatch(/Source Serif 4/i);
    expect(zone.motto.left, 'slogan aligné à gauche sur le mot-symbole').toBeGreaterThanOrEqual(zone.wm.left - 2);
    expect(zone.motto.left).toBeLessThanOrEqual(zone.wm.left + 2);
    expect(zone.mottoLead, 'première ligne du slogan').toBeTruthy();
    expect(zone.mottoTag, 'deuxième ligne du slogan').toBeTruthy();
    expect(Math.abs(zone.mottoLead.left - zone.wm.left), '1re ligne du slogan = bord gauche du mot-symbole').toBeLessThanOrEqual(2);
    expect(Math.abs(zone.mottoTag.left - zone.wm.left), '2e ligne du slogan = bord gauche du mot-symbole').toBeLessThanOrEqual(2);
    expect(Math.abs(zone.mottoLead.left - zone.mottoTag.left), 'les deux lignes du slogan alignées entre elles').toBeLessThanOrEqual(2);
    expect(zone.qr, 'pas de QR sans pageUrl d’article').toBeNull();
    expect(zone.brandBg === 'rgba(0, 0, 0, 0)' || zone.brandBg === 'transparent', 'pas de capsule derrière la marque').toBeTruthy();
    expect(zone.photo.top).toBeLessThanOrEqual(0);
    expect(zone.photo.bottom).toBeGreaterThanOrEqual(1440);
    const kickerBox = await page.evaluate(() => {
      const c = document.getElementById('card').getBoundingClientRect();
      const e = document.querySelector('.ig-kicker');
      const r = e.getBoundingClientRect();
      return { top: r.top - c.top, bottom: r.bottom - c.top, left: r.left - c.left, right: r.right - c.left, text: e.textContent };
    });
    for (const b of [zone.title, zone.brand, zone.credit, kickerBox, zone.by, zone.motto, zone.wm]) {
      expect(b, 'élément présent dans le carré').toBeTruthy();
      expect(b.top).toBeGreaterThanOrEqual(180);
      expect(b.bottom).toBeLessThanOrEqual(1260);
    }
  });

  test(`article 3:4 ${kind} : pas de « Par » si la signature n’est que le média @ci-critical`, async ({ page }) => {
    await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
    await page.setViewportSize({ width: 1080, height: 1440 });
    await page.goto('/affiches/social-une.html', { waitUntil: 'load' });
    const model = { slot: { label: `La une du ${kind}`, kind, dayLabel: 'Dimanche 22 novembre 2026' }, items: [item(1, { source: 'Impact Campus', byline: 'Impact Campus', credit: 'Photo : Équipe' })] };
    await page.evaluate((a) => window.renderUne(a), { model, format: 'article' });
    expect(await page.locator('.ig-by').count()).toBe(0);
    expect(await page.locator('.ig-media').count()).toBe(0);
    expect(await page.locator('.ig-kicker .media').textContent()).toBe('Impact Campus');
    expect(await page.locator('.ig-credit').textContent()).toBe('📸 Équipe');
  });
}


for (const kind of ['matin', 'soir']) {
  test(`article 3:4 ${kind} : QR vers la fiche Radar, dans le carré, décodable @ci-critical`, async ({ page }, testInfo) => {
    await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
    await page.setViewportSize({ width: 1080, height: 1440 });
    await page.goto('/affiches/social-une.html', { waitUntil: 'load' });
    const pageUrl = 'https://le-radar.ca/article/dac64fa8d6a7b3df/';
    const model = { slot: { label: `La une du ${kind}`, kind, dayLabel: 'Dimanche 22 novembre 2026' }, items: [item(1, { title: 'La bibliothèque prolonge ses heures', source: 'Impact Campus', byline: 'Autrice 1 · Impact Campus', credit: 'Photo : Équipe', pageUrl })] };
    await page.evaluate((a) => window.renderUne(a), { model, format: 'article' });
    const qr = page.locator('.ig-qr');
    await expect(qr).toHaveCount(1);
    await expect(qr).toHaveAttribute('data-url', pageUrl);
    const box = await page.evaluate(() => {
      const c = document.getElementById('card').getBoundingClientRect();
      const rel = (e) => { const r = e.getBoundingClientRect(); return { top: r.top - c.top, bottom: r.bottom - c.top, left: r.left - c.left, right: r.right - c.left, mid: (r.left + r.right) / 2 - c.left }; };
      const qr = rel(document.querySelector('.ig-qr'));
      const brand = rel(document.querySelector('.ig-brand'));
      const motto = rel(document.querySelector('.ig-motto'));
      const logo = document.querySelector('.ig-brand img');
      return {
        qr, brand, motto,
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
    expect(box.motto.right, 'le slogan ne chevauche pas le QR').toBeLessThanOrEqual(box.qr.left - 8);
    expect(box.motto.bottom).toBeLessThanOrEqual(1260);

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

  test(`article 3:4 ${kind} : pas de QR si l’URL n’est pas une fiche Radar @ci-critical`, async ({ page }) => {
    await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
    await page.setViewportSize({ width: 1080, height: 1440 });
    await page.goto('/affiches/social-une.html', { waitUntil: 'load' });
    const model = { slot: { label: `La une du ${kind}`, kind, dayLabel: 'Dimanche 22 novembre 2026' }, items: [item(1, { pageUrl: 'https://quartierlibre.ca/exemple/' })] };
    await page.evaluate((a) => window.renderUne(a), { model, format: 'article' });
    expect(await page.locator('.ig-qr').count()).toBe(0);
  });
}


test('article 3:4 : titre serif long en trois lignes à 80 px @ci-critical', async ({ page }) => {
  await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
  await page.setViewportSize({ width: 1080, height: 1440 });
  await page.goto('/affiches/social-une.html', { waitUntil: 'load' });
  const model = {
    slot: { label: 'La une du soir', kind: 'soir', dayLabel: 'Samedi 21 novembre 2026' },
    items: [item(1, { title: 'En France, la colère lycéenne gagne tout le pays', source: 'Quartier Libre', byline: 'Elise Miara · Quartier Libre', credit: 'Clément Souchet' })],
  };
  const info = await page.evaluate((a) => window.renderUne(a), { model, format: 'article' });
  expect(info.overflow).toBe(false);
  const typo = await page.evaluate(() => {
    const n = document.querySelector('.ig-title');
    const cs = getComputedStyle(n);
    return {
      family: cs.fontFamily,
      size: parseFloat(cs.fontSize),
      height: n.getBoundingClientRect().height,
      lineHeight: parseFloat(cs.lineHeight),
      text: n.innerText,
    };
  });
  expect(typo.family).toMatch(/Source Serif 4/i);
  expect(typo.size, 'ne pas réduire un titre de trois lignes à 80 px').toBe(80);
  expect(typo.height / typo.lineHeight, 'trois lignes').toBeGreaterThan(2.5);
  expect(typo.height / typo.lineHeight).toBeLessThan(3.5);
  const lines = typo.text.split(/\n/).map((x) => x.trim()).filter(Boolean);
  expect(lines, 'coupures typographiques, sans veuve').toEqual([
    'En France, la colère',
    'lycéenne gagne',
    'tout le pays',
  ]);
});

test('article 3:4 : focalX recadre la photo, 50 % par défaut @ci-critical', async ({ page }) => {
  await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
  await page.setViewportSize({ width: 1080, height: 1440 });
  await page.goto('/affiches/social-une.html', { waitUntil: 'load' });
  const slot = { label: 'La une du soir', kind: 'soir', dayLabel: 'Samedi 21 novembre 2026' };
  await page.evaluate((a) => window.renderUne(a), { model: { slot, items: [item(1)] }, format: 'article' });
  const def = await page.locator('.ig-photo img').evaluate((e) => e.style.objectPosition);
  expect(def, 'sans focalX : 50 % horizontal, focalY par défaut 0,44').toBe('50% 44%');
  await page.evaluate((a) => window.renderUne(a), { model: { slot, items: [item(1, { focalX: 0.58, focalY: 0.50 })] }, format: 'article' });
  const applied = await page.locator('.ig-photo img').evaluate((e) => e.style.objectPosition);
  expect(applied, 'focalX 0,58 appliqué (aperçu lycéens)').toBe('58% 50%');
});
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


async function edgePixels(page) {
  const shot = await page.locator('#card').screenshot({ type: 'jpeg', quality: 92 });
  return page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/jpeg;base64,' + b64; });
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d', { alpha: false });
    g.drawImage(img, 0, 0);
    const px = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
    const light = ([r, g, b]) => r >= 240 && g >= 240 && b >= 240;
    const col = (x) => Array.from({ length: c.height }, (_, y) => px(x, y));
    const row = (y) => Array.from({ length: c.width }, (_, x) => px(x, y));
    const countLight = (list) => list.filter(light).length;
    return {
      w: c.width,
      h: c.height,
      left: countLight(col(0)),
      right: countLight(col(c.width - 1)),
      top: countLight(row(0)),
      bottom: countLight(row(c.height - 1)),
      corners: { tl: px(0, 0), tr: px(c.width - 1, 0), bl: px(0, c.height - 1), br: px(c.width - 1, c.height - 1) },
    };
  }, shot.toString('base64'));
}

function expectFullBleedEdges(edges) {
  expect(edges.w).toBe(1080);
  expect(edges.h).toBe(1440);
  expect(edges.left, 'bord gauche sans bande claire').toBe(0);
  expect(edges.right, 'bord droit sans bande claire').toBe(0);
  expect(edges.top, 'bord haut sans bande claire').toBe(0);
  expect(edges.bottom, 'bord bas sans bande claire').toBe(0);
}

for (const [kind, credit, leadClass] of [
  ['soir', 'Thekidpossum, CC BY-SA 4.0, Wikimedia Commons', 'lead-photo'],
  ['soir', 'Illustration : Mathilde Ségar', 'lead-illustration'],
]) {
  test(`instagram 3:4 ${leadClass} : JPEG 1080×1440 plein cadre, sans bande claire @ci-critical`, async ({ page }) => {
    await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
    await page.setViewportSize({ width: 1080, height: 1440 });
    await page.goto('/affiches/social-une.html', { waitUntil: 'load' });
    const model = {
      slot: { label: `La une du ${kind}`, kind, dayLabel: 'Samedi 21 novembre', dayLabelYear: 'Samedi 21 novembre 2026' },
      items: [
        item(1, { title: 'La bibliothèque prolonge ses heures', source: 'Impact Campus', byline: 'Autrice 1 · Impact Campus', credit }),
        item(2, { title: 'Deuxième titre à la une du jour', source: 'Quartier Libre', byline: 'Autrice 2 · Quartier Libre' }),
      ],
    };
    await page.evaluate((a) => window.renderUne(a), { model, format: 'grille' });
    const box = await page.evaluate(() => {
      const r = document.getElementById('card').getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, className: document.getElementById('card').className, margin: getComputedStyle(document.getElementById('card')).margin };
    });
    expect(box).toMatchObject({ x: 0, y: 0, w: 1080, h: 1440, margin: '0px' });
    expect(box.className).toContain('une-b');
    expect(box.className).toContain(leadClass);
    expectFullBleedEdges(await edgePixels(page));
  });
}

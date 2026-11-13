import { test, expect } from '@playwright/test';

// Une sociale (affiches/social-une.html) : cas limites rendus dans les 3 formats et les 2 thèmes.
// Rien ne déborde, aucun nom coupé, sport en deux colonnes (ou une seule pleine largeur),
// couleurs d'établissement lisibles (AA) avec repli sur l'accent, « Par » plus pâle que l'auteur.
const SIZES = { portrait: [1080, 1350], story: [1080, 1920], paysage: [1200, 675] };
const IMG = '/assets/kit/affiche-11x17.jpg';
const item = (n, o = {}) => ({ title: `Article numéro ${n} pour la une`, byline: `Autrice ${n} · Le Journal`, place: 'Université Concordia', placeColor: '#912338', hook: 'Une accroche en français.', credit: 'Photo : Équipe', images: [IMG], ...o });
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
            place: [...document.querySelectorAll('.kick .place, .ml .in')].map((e) => R(getComputedStyle(e).color, B)),
            by: by && by.querySelector('.lbl') ? [getComputedStyle(by.querySelector('.lbl')).color, getComputedStyle(by.querySelector('.who')).color, R(getComputedStyle(by.querySelector('.lbl')).color, B)] : null,
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
        if (format === 'story') { const nb = await page.evaluate(() => { const c = document.getElementById('card').getBoundingClientRect(); return [...document.querySelectorAll('.slot, .title, .foot .full, .foot .ind')].filter((e) => { const r = e.getBoundingClientRect(); return r.top < c.top + 140 || r.bottom > c.bottom - 250; }).length; }); expect(nb, 'zones sûres Instagram/Facebook').toBe(0); }
        if (name === 'complet' && format === 'paysage') expect(info.sports).toBeGreaterThanOrEqual(3);
        for (const r of out.place) expect(r, 'couleur d’établissement AA').toBeGreaterThanOrEqual(4.5);
        if (out.by) { expect(out.by[0]).not.toBe(out.by[1]); expect(out.by[2]).toBeGreaterThanOrEqual(4.5); }
      });
    }
  }
}

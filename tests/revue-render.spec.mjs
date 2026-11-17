import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

// « La revue du matin / du soir » : la page générée (scripts/revue/revue-render.js) dans la chrome du site, sur mobile et
// ordinateur, en mode clair et sombre : revue.css chargé, aucun débordement horizontal, titres lisibles (contraste AA),
// note « générée automatiquement » visible, sommaire et sections présents.
const require = createRequire(import.meta.url);
const R = require('../scripts/revue/revue-render.js');
const LONG = 'Patriotes de l’Université du Québec à Trois-Rivières';
const item = (n, o = {}) => ({ id: `id${n}`, title: `Un titre d’article étudiant numéro ${n} assez long pour passer à la ligne`, link: `https://journal.example/a${n}`, source: 'Le Collectif', authors: ['Aurélie Souka', 'Caroline Lizin', 'Émile Brochu'], date: '2026-11-17T02:00:00.000Z', lang: 'fr', institution: 'Université de Sherbrooke (UdeS)', sport: '', excerpt: 'Un court extrait de l’article, coupé à la phrase.', resume: n % 2 ? 'Un résumé d’une phrase rédigé en français à partir du titre et de l’extrait.' : '', theme: n % 3 ? 'Culture' : 'Politique', image: '', credit: '', ...o });
const model = (id) => ({
  id: `2026-11-17-${id}`, edition: { id, label: id === 'soir' ? 'La revue du soir' : 'La revue du matin', emoji: id === 'soir' ? '🌙' : '☀️', day: '2026-11-17' },
  path: `revue/2026-11-17-${id}/`, url: `https://le-radar.ca/revue/2026-11-17-${id}/`, period: { start: 0, end: 0 },
  datePublished: '2026-11-17T12:30:00.000Z', dateModified: '2026-11-17T12:30:00.000Z', headline: `La revue du ${id} du mardi 17 novembre 2026`,
  description: 'Revue de presse étudiante du Québec.', intro: 'La revue réunit 6 articles de 1 média étudiant.', chapeau: '', generator: 'gabarit', previous: null,
  categories: ['Revue de presse', 'Médias étudiants'], image: null,
  items: [1, 2, 3, 4, 5, 6].map((n) => item(n, n === 2 ? { lang: 'en', title: 'An English title from a student newspaper', source: 'The Link' } : {})),
  radio: [{ id: 'cism', station: 'CISM 89,3', page: 'https://le-radar.ca/radios/cism/', shows: [{ title: 'La collation', start: '08:00', when: '8 h à 9 h', url: 'https://cism893.ca/x' }] }],
  sports: {
    results: [{ emoji: '🏀', sport: 'Basketball (F)', uni: true, league: 'Basketball universitaire féminin', when: 'Final · lun. 16 nov.', date: '2026-11-16', text: `Stingers (Concordia) 55-54 ${LONG} (UQTR)` }],
    next: [{ emoji: '🏐', sport: 'Volleyball (H)', uni: false, league: 'Volleyball collégial masculin D2', date: '2026-11-19', time: '19:30', text: 'Lauréats (Saint-Hyacinthe) reçoit Diablos (Trois-Rivières)' }],
  },
});

for (const id of ['matin', 'soir']) {
  for (const [dev, width, height] of [['mobile', 390, 844], ['ordinateur', 1280, 900]]) {
    for (const scheme of ['light', 'dark']) {
      test(`revue ${id} ${dev} ${scheme}`, async ({ page }) => {
        await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
        await page.route(`**/revue/2026-11-17-${id}/`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: R.renderReviewPage(model(id)) }));
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height });
        await page.goto(`/revue/2026-11-17-${id}/`, { waitUntil: 'load' });
        await expect(page.locator('h1.seo-title')).toContainText(`La revue du ${id}`);
        await expect(page.locator('.revue-note')).toContainText('Revue générée automatiquement');
        for (const s of ['#presse', '#radio', '#sport', '#sources']) await expect(page.locator(s)).toHaveCount(1);
        await expect(page.locator('.revue-item')).toHaveCount(6);
        const out = await page.evaluate(() => {
          const L = (c) => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
          const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
          const bg = getComputedStyle(document.body).backgroundColor;
          const t = document.querySelector('.revue-item__title a');
          return {
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            noteBorder: getComputedStyle(document.querySelector('.revue-note')).borderLeftWidth,
            titleContrast: ratio(getComputedStyle(t).color, bg === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.documentElement).backgroundColor : bg),
            theme: document.documentElement.getAttribute('data-theme'),
          };
        });
        expect(out.overflow, 'aucun débordement horizontal').toBeLessThanOrEqual(1);
        expect(out.noteBorder, 'revue.css chargé').toBe('3px');
        expect(out.titleContrast, 'titre lisible (AA)').toBeGreaterThanOrEqual(4.5);
        expect(out.theme).toBe(scheme === 'dark' ? 'dark' : 'light');
      });
    }
  }
}

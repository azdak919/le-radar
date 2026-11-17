import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { WEATHER_SITES } from '../scripts/revue/revue-weather.mjs';

/** Données météo de contrôle (jamais servies au public) : une entrée par site ECCC, pour vérifier le bloc imprimé. */
const printWeather = () => ({
  source: 'Environnement et Changement climatique Canada',
  cities: WEATHER_SITES.map((site, i) => ({
    ...site,
    issued: '20261117120000',
    periods: [
      { name: 'Cet après-midi', sky: 'Quelques nuages', kind: 'high', temp: 2 - i, icon: 1, pop: null },
      { name: 'Cette nuit', sky: 'Dégagé', kind: 'low', temp: -6 - i, icon: 30, pop: 10 },
    ],
  })),
});

// Impression sur les formats de papier courants, en portrait : Letter, Legal, Tabloid, A4 et A3.
// Pages : accueil (cartes d'article du fil), fiche d'article statique /article/<id>/, fiche /article/?id=, revue du soir.
// Contrat : rien ne dépasse la zone imprimable, aucune image plus grande qu'une page, cartes jamais coupées, intertitres
// jamais seuls en bas de page, aucune page blanche, rien de perdu (titres de la revue présents dans le PDF), logo du Radar
// à gauche du mot-symbole. Feuilles : style-chrome.css (@page commun), mobile/app/css/app.css (fiche), revue.css.
const require = createRequire(import.meta.url);
const R = require('../scripts/revue/revue-render.js');
const AP = require('../scripts/article-pages.js');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const MM = 96 / 25.4, IN = 96;
export const FORMATS = { Letter: [8.5 * IN, 11 * IN], Legal: [8.5 * IN, 14 * IN], Tabloid: [11 * IN, 17 * IN], A4: [210 * MM, 297 * MM], A3: [297 * MM, 420 * MM] };
const SITE_MARGINS = { top: 12, side: 12, bottom: 14 };   // style-chrome.css @page
const FICHE_MARGINS = { top: 16, side: 16, bottom: 18 };  // mobile/app/css/app.css @page
const POSTER = 'https://le-radar.ca/assets/kit/affiche-11x17.jpg'; // image très haute : doit rester dans la page

const LONG = 'Patriotes de l’Université du Québec à Trois-Rivières';
const item = (n, o = {}) => ({ id: `id${n}`, title: `Titre d’article étudiant numéro ${n} : une enquête au long cours sur la vie de campus et ses enjeux`, link: `https://journal.example/a${n}`, source: ['Le Collectif', 'Quartier Libre', 'The Link', 'La Pige'][n % 4], authors: ['Aurélie Souka', 'Caroline Lizin'], date: '2026-11-17T20:00:00.000Z', lang: n % 4 === 2 ? 'en' : 'fr', institution: 'Université de Sherbrooke (UdeS)', sport: '', excerpt: 'Un court extrait de l’article, coupé à la phrase, qui montre le ton du texte original sans le réécrire.', resume: n % 2 ? 'Un résumé d’une phrase rédigé en français à partir du titre et de l’extrait de l’article.' : '', theme: ['Culture', 'Politique', 'Éducation', 'Société'][n % 4], image: '', credit: '', ...o });
const revueModel = () => ({
  id: '2026-11-17-soir', edition: { id: 'soir', label: 'La revue du soir', emoji: '🌙', day: '2026-11-17' }, path: 'revue/2026-11-17-soir/', url: 'https://le-radar.ca/revue/2026-11-17-soir/', period: { start: 0, end: 0 },
  datePublished: '2026-11-18T01:00:00.000Z', dateModified: '2026-11-18T01:00:00.000Z', headline: 'La revue du soir du mardi 17 novembre 2026', description: 'd',
  intro: 'En tête de cette revue du soir, Le Collectif publie « Le conseil municipal adopte son budget », sous la plume d’Aurélie Souka et Caroline Lizin. À lire aussi : « La génération Z et le retour des médias physiques » dans Quartier Libre. Sur les terrains, en basketball (F) : Stingers (Concordia) 55, Martlets (McGill) 54.',
  chapeau: '', generator: 'gabarit', previous: null, categories: ['Revue de presse'],
  image: { url: POSTER, credit: 'Photo : Jane Roy', source: 'Le Collectif', title: 'Titre de la une' }, weather: printWeather(),
  items: Array.from({ length: 14 }, (_, i) => item(i + 1)),
  radio: [{ id: 'cism', station: 'CISM 89,3', page: 'https://le-radar.ca/radios/cism/', shows: Array.from({ length: 4 }, (_, i) => ({ title: `Émission ${i + 1}`, start: `${20 + i}:00`, when: `${20 + i} h à ${21 + i} h`, url: '' })) }],
  sports: {
    results: Array.from({ length: 24 }, (_, i) => ({ emoji: '🏀', sport: i % 2 ? 'Basketball (F)' : 'Volleyball (H)', uni: i < 12, league: 'Ligue étudiante', when: 'Final · mar. 17 nov.', date: '2026-11-17', text: `Stingers (Concordia) ${50 + i}-48 ${LONG} (UQTR)` })),
    next: Array.from({ length: 8 }, (_, i) => ({ emoji: '🏐', sport: 'Volleyball (H)', uni: false, league: 'Volleyball collégial masculin D2', date: `2026-11-${18 + (i % 3)}`, time: '19:30', text: 'Lauréats (Saint-Hyacinthe) reçoit Diablos (Trois-Rivières)' })),
  },
});
const articleRecord = { id: 'print-fixture', title: 'Une chercheuse du Saguenay récompensée pour son excellence en médecine familiale et en recherche clinique', source: 'La Pige', institution: 'Cégep de Jonquière', author: 'Emmaëlle Lacave-Jonneaux', date: '2026-11-16T21:52:00.000Z', lang: 'fr', link: 'https://lapige.ca/x', excerpt: 'Marie-Eve Poitras, infirmière et professeure, reçoit le Prix de chercheur de l’année en médecine de famille 2026. Une belle reconnaissance pour la recherche régionale.', image: POSTER, credit: 'Poitraslab' };

const PAGES = {
  accueil: { url: '/', margins: SITE_MARGINS, ready: '#news-list[data-ready]' },
  'fiche statique': { url: '/article/print-fixture/', margins: SITE_MARGINS, html: () => AP.renderPage(AP.loadTemplate(), articleRecord), onePageFrom: 'Letter' },
  'fiche /article/?id=': { url: '/article/', margins: FICHE_MARGINS, fiche: true },
  revue: { url: '/revue/2026-11-17-soir/', margins: SITE_MARGINS, html: () => R.renderReviewPage(revueModel()), titles: revueModel().items.map(x => x.title) },
};

const hasPdftotext = (() => { try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
// -layout : lignes telles qu'imprimées (pied de page, dernière ligne de chaque feuille) ; -raw : ordre de lecture, colonne
// par colonne (la revue s'imprime sur 2 à 4 colonnes : un titre sur deux lignes y est entrecoupé par la colonne voisine en -layout).
const pdfPages = (pdf, mode = '-layout') => {
  const f = path.join(os.tmpdir(), `radar-print-${process.pid}-${Date.now()}-${mode.slice(1)}.pdf`);
  fs.writeFileSync(f, pdf);
  try { return execFileSync('pdftotext', [mode, f, '-'], { encoding: 'utf8' }).split('\f').slice(0, -1); } finally { fs.unlinkSync(f); }
};
const squeeze = (s) => String(s).normalize('NFC').replace(/[\s\u00a0\u202f\u2010\u2011\u00ad-]+/g, '').replace(/[’']/g, "'");

for (const [name, pg] of Object.entries(PAGES)) {
  for (const [format, [pw, ph]] of Object.entries(FORMATS)) {
    test(`impression ${format} portrait : ${name} @ci-critical`, async ({ page }, testInfo) => {
      test.setTimeout(60_000);
      await page.route((u) => !u.href.startsWith('http://127.0.0.1') && !u.href.startsWith('https://le-radar.ca/assets/'), (r) => r.abort());
      await page.route('https://le-radar.ca/assets/**', (r) => {
        const f = path.join(ROOT, new URL(r.request().url()).pathname);
        return fs.existsSync(f) ? r.fulfill({ path: f }) : r.abort();
      });
      if (pg.html) await page.route(`**${pg.url}`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: pg.html() }));
      const W = Math.floor(pw - 2 * pg.margins.side * MM), H = Math.floor(ph - (pg.margins.top + pg.margins.bottom) * MM);
      await page.emulateMedia({ media: 'print', colorScheme: 'light' });
      await page.setViewportSize({ width: W, height: H });
      let url = pg.url;
      if (pg.fiche) {
        await page.goto('/article/', { waitUntil: 'domcontentloaded' });
        const id = await page.evaluate(async () => { const d = await (await fetch('../news.json')).json(); return window.RadarMobile.articleId(d.items[0].link); });
        url = `/article/?id=${id}`;
      }
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      if (pg.ready) await page.locator(pg.ready).waitFor({ state: 'attached' });
      if (pg.fiche) await page.locator('article.fiche h1').waitFor();
      await page.evaluate(() => Promise.race([new Promise((r) => setTimeout(r, 8000)), Promise.all([...document.images].filter((i) => i.loading !== 'lazy').map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))]));
      await page.waitForTimeout(500);

      const report = await page.evaluate(({ W, H }) => {
        const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const label = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
        const overflow = [], bigImages = [], headings = [], cards = [], logo = [];
        for (const el of document.body.querySelectorAll('*')) {
          if (!vis(el) || el.closest('.sr-only, .visually-hidden')) continue;
          const r = el.getBoundingClientRect();
          if (r.right > W + 2 || r.left < -2) overflow.push(`${label(el)} ${Math.round(r.left)}→${Math.round(r.right)}`);
        }
        for (const img of document.querySelectorAll('img')) {
          if (!vis(img)) continue;
          const r = img.getBoundingClientRect();
          if (r.width > W + 1 || r.height > H * 0.8) bigImages.push(`${img.getAttribute('src')?.slice(-40)} ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
        for (const h of document.querySelectorAll('main h1, main h2, main h3, main h4, article h1, article h2, article h3, article h4, .brief-rail-title')) {
          if (!vis(h)) continue;
          if (!/avoid/.test(getComputedStyle(h).breakAfter)) headings.push(label(h));
        }
        for (const c of document.querySelectorAll('.article, .revue-item, figure, .print-promo, .revue-results li, .revue-next li')) {
          if (!vis(c)) continue;
          if (!/avoid/.test(getComputedStyle(c).breakInside)) cards.push(label(c));
        }
        const wm = document.querySelector('.wordmark-mark, .brand, .masthead .wordmark');
        if (wm && vis(wm)) { const img = wm.querySelector('img'); if (!img || !vis(img)) logo.push('mot-symbole sans logo'); }
        const heads = [...document.querySelectorAll('main h2, main h3, main h4, article h2, article h3, article h4')].filter(vis).map((h) => h.textContent.trim()).filter(Boolean);
        return { overflow: overflow.slice(0, 8), bigImages, headings: headings.slice(0, 8), cards: cards.slice(0, 8), logo, heads };
      }, { W, H });

      expect(report.overflow, 'éléments hors de la zone imprimable').toEqual([]);
      expect(report.bigImages, 'image plus large que la page ou plus haute que 80 % d’une page').toEqual([]);
      expect(report.headings, 'intertitres qui peuvent rester seuls en bas de page').toEqual([]);
      expect(report.cards, 'cartes ou lignes qui peuvent être coupées entre deux pages').toEqual([]);
      expect(report.logo, 'logo du Radar à gauche du mot-symbole').toEqual([]);

      if (process.env.PRINT_DEBUG) console.log(await page.evaluate(() => { const out = []; const walk = (el, d) => { for (const c of el.children) { const r = c.getBoundingClientRect(); const cs = getComputedStyle(c); if (cs.display === 'none' || !r.height) continue; out.push(`${'  '.repeat(d)}${c.tagName.toLowerCase()}.${[...c.classList].join('.')} h=${Math.round(r.height)} top=${Math.round(r.top + scrollY)} mt=${cs.marginTop} mb=${cs.marginBottom} bi=${cs.breakInside}`); if (d < 3) walk(c, d + 1); } }; walk(document.body, 0); return out.join('\n'); }));
      const pdf = await page.pdf({ format, printBackground: false });
      expect(pdf.byteLength).toBeGreaterThan(1000);
      fs.writeFileSync(testInfo.outputPath(`${name}-${format}.pdf`.replace(/[^\w.-]+/g, '-')), pdf); // conservé en cas d’échec
      if (process.env.PRINT_OUT) { fs.mkdirSync(process.env.PRINT_OUT, { recursive: true }); fs.writeFileSync(path.join(process.env.PRINT_OUT, `${name}-${format}.pdf`.replace(/[^\w.-]+/g, '-')), pdf); } // exemples à relire
      if (!hasPdftotext) { if (process.env.CI) throw new Error('pdftotext requis en CI (poppler-utils)'); return; } // local sans poppler : contrôles PDF sautés
      const pages = pdfPages(pdf);
      const footer = /^\s*LE\s*\S?RADAR\.ca\s+Page \d+ \/ \d+\s*$/;
      const bodies = pages.map((t) => t.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() && !footer.test(l)));
      bodies.forEach((lines, i) => expect(lines.length, `page ${i + 1}/${pages.length} blanche ou presque`).toBeGreaterThan(2));
      // Un intertitre n'est jamais la dernière ligne d'une page (sauf la dernière page).
      const heads = new Set(report.heads.map(squeeze));
      bodies.slice(0, -1).forEach((lines, i) => {
        const last = squeeze(lines.at(-1));
        expect([...heads].some((h) => h && (h === last || (last.length > 6 && h.startsWith(last)))), `page ${i + 1} se termine par un intertitre orphelin : ${lines.at(-1).trim()}`).toBe(false);
      });
      expect(pages.every((t) => t.split('\n').some((l) => footer.test(l))), 'pied de page (logo + LE-RADAR.ca, page x / y) sur chaque feuille').toBe(true);
      const all = squeeze(pdfPages(pdf, '-raw').join('\n'));
      for (const t of pg.titles || []) expect(all.includes(squeeze(t)), `titre perdu à l’impression : ${t}`).toBe(true);
      if (pg.onePageFrom) expect(pages.length, 'fiche d’article sur une seule feuille').toBe(1);
    });
  }
}

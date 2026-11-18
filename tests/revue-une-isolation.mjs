// La revue du matin / du soir n'entre jamais dans la sélection de « La une » (cartes, images, texte alternatif)
// ni dans les publications par article des bots sociaux (Bluesky, Mastodon, Tumblr, Buffer lisent feed.xml).
// Décision de Charles, 16 nov. 2026 : la revue n'est pas un item social. Ajustement du 17 nov. 2026 : le texte de
// La une peut porter, en 2e ligne seulement, un lien vers l'édition du jour si la page publique existe déjà.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as U from '../scripts/social/une-lib.mjs';
import { parseFeed, isRevueLink } from '../scripts/social/lib.mjs';

const require = createRequire(import.meta.url);
const R = require('../scripts/revue/revue-render.js');
const REVUE = /le-radar\.ca\/revue|\/revue\/|revue du (matin|soir)/i;

// ── Données : un fil normal dans lequel une revue se serait glissée (pire cas) ──
const T0 = Date.parse('2026-11-17T12:45:00Z'); // 7 h 45, créneau du matin de La une
const art = (n, iso, extra = {}) => ({ source: 'Quartier Libre', institution: 'Université de Montréal', lang: 'fr', title: `Article ${n} sur la vie étudiante`, link: `https://quartierlibre.ca/a-${n}/`, author: `Autrice ${n} Tremblay`, date: iso, image: `https://quartierlibre.ca/${n}.jpg`, ...extra });
const revueItem = { source: 'Le Radar', institution: '', lang: 'fr', title: 'La revue du matin du mardi 17 novembre 2026', link: 'https://le-radar.ca/revue/2026-11-17-matin/', author: 'Le Radar', date: '2026-11-17T12:02:00Z', image: 'https://le-radar.ca/assets/og-cover.png' };
const news = { updated: '2026-11-17T12:30:00Z', items: [revueItem, art(1, '2026-11-17T11:00:00Z'), art(2, '2026-11-17T10:00:00Z'), art(3, '2026-11-17T02:00:00Z')] };

assert.equal(isRevueLink('https://le-radar.ca/revue/2026-11-17-matin/'), true);
assert.equal(isRevueLink('https://www.le-radar.ca/revue/'), true);
assert.equal(isRevueLink('https://le-radar.ca/article/abc/'), false);
assert.equal(isRevueLink('https://quartierlibre.ca/revue-de-presse/'), false, 'un article de média étudiant sur une « revue » reste admissible');

for (const id of ['matin', 'soir']) {
  const now = id === 'matin' ? T0 : Date.parse('2026-11-18T00:35:00Z');
  const sel = U.selectUne(news, U.slotFor(id, now), { now, max: 8 });
  assert.ok(!sel.items.some(x => isRevueLink(x.link) || REVUE.test(x.title)), `La une du ${id} : aucune revue dans la sélection`);
  const model = { slot: U.slotFor(id, now), items: sel.items, sports: { results: [], next: [] }, radio: [] };
  for (const [net, t] of Object.entries(U.buildUneAll(model, {}, { revueExists: () => false }))) {
    assert.doesNotMatch(String(t.text || ''), REVUE, `La une du ${id} (${net}) : pas de revue si l’édition n’existe pas`);
  }
  const avec = U.buildUneAll(model, {}, { revueExists: () => true });
  const wanted = `Consultez notre revue du ${id}, à imprimer avec sudoku et mots cachés : https://le-radar.ca/revue/2026-11-17-${id}/`;
  for (const [net, t] of Object.entries(avec)) {
    const text = String(t.text || '');
    if (net === 'instagram') {
      assert.doesNotMatch(text, /https?:\/\/|Consultez notre revue/, `Instagram (${id}) : pas de lien revue`);
      continue;
    }
    if (text.includes('le-radar.ca/revue/')) {
      assert.equal(text.split('\n')[1], wanted, `La une du ${id} (${net}) : 2e ligne seulement`);
      assert.doesNotMatch(text.split('\n').slice(2).join('\n'), /Consultez notre revue/, `${net} : la revue n’apparaît qu’en 2e ligne`);
    }
  }
  assert.doesNotMatch(U.altText ? String(U.altText(model) || '') : '', REVUE, `texte alternatif de l’image du ${id}`);
}

assert.equal(U.revueEditionExists(U.slotFor('matin', T0)), true);
assert.equal(U.revueEditionExists(U.slotFor('soir', Date.parse('2026-11-18T00:35:00Z'))), true);

// ── Bots par article : une revue publiée dans feed.xml est ignorée par parseFeed ──
const reviewModel = {
  id: '2026-11-17-matin', edition: { id: 'matin', label: 'La revue du matin', emoji: '☀️', day: '2026-11-17' }, path: 'revue/2026-11-17-matin/', url: 'https://le-radar.ca/revue/2026-11-17-matin/',
  datePublished: '2026-11-17T12:02:00.000Z', dateModified: '2026-11-17T12:02:00.000Z', headline: 'La revue du matin du mardi 17 novembre 2026', description: 'd', intro: 'i', chapeau: '', generator: 'gabarit',
  categories: ['Revue de presse'], image: null, items: [], radio: [], sports: { results: [], next: [] }, previous: null,
};
const feed = `<rss><channel>${R.feedItemXml(reviewModel)}<item><title>Quartier Libre – A : Article 1</title><link>https://quartierlibre.ca/a-1/</link><guid>https://quartierlibre.ca/a-1/</guid><pubDate>Tue, 17 Nov 2026 11:00:00 GMT</pubDate><description>x</description></item></channel></rss>`;
const parsed = parseFeed(feed);
assert.deepEqual(parsed.map(x => x.link), ['https://quartierlibre.ca/a-1/'], 'la revue n’est jamais une publication sociale par article');

// ── Code et flux de travail : La une ne lit rien de la revue, la revue n'écrit rien que La une lit ──
for (const f of ['scripts/social/une-run.mjs', 'scripts/social/une-lib.mjs', 'affiches/social-une.js', 'affiches/social-une.html', '.github/workflows/social-une.yml']) {
  const src = fs.readFileSync(f, 'utf8');
  assert.doesNotMatch(src, /data\/revue|scripts\/revue|revue\/feed\.xml|sitemap-news/, `${f} : ne lit pas les générateurs ni les données internes de la revue`);
}
assert.doesNotMatch(fs.readFileSync('affiches/social-une.js', 'utf8'), /le-radar\.ca\/revue|revueEdition/, 'l’affiche de La une n’embarque pas la revue');
assert.doesNotMatch(fs.readFileSync('affiches/social-une.html', 'utf8'), /le-radar\.ca\/revue|revueEdition/, 'l’affiche de La une n’embarque pas la revue');
assert.match(fs.readFileSync('scripts/social/une-lib.mjs', 'utf8'), /revueEditionLine/, 'lien texte optionnel vers l’édition publiée');
const wf = fs.readFileSync('.github/workflows/revue.yml', 'utf8');
const added = (wf.match(/git add ([^\n]+)/) || [])[1] || '';
assert.deepEqual(added.trim().split(/\s+/), ['revue', 'data/revue', 'sitemap-news.xml', 'robots.txt', 'feed.xml'], 'la revue n’écrit que ses propres fichiers (+ feed.xml filtré, robots.txt)');
for (const f of ['news.json', 'sports-masthead.json', 'radio-schedules.json', 'data/social']) assert.ok(!added.split(/\s+/).includes(f), `la revue ne touche pas ${f} (sources de La une)`);
assert.doesNotMatch(fs.readFileSync('.github/workflows/social-une.yml', 'utf8'), /Revue — matin et soir/, 'La une ne se déclenche pas après la revue');

console.log('revue / La une : isolées');

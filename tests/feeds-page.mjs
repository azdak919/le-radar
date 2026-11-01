// Page des flux : la liste des campus vient de news-sources.json (sources réelles du fil).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const lib = require('../feeds-campuses-lib.js');
globalThis.window = {};
require('../institution-acronyms-data.js');
const table = globalThis.window.RadarInstitutionAcronyms || {};
const registry = JSON.parse(readFileSync(new URL('../news-sources.json', import.meta.url)));
const html = readFileSync(new URL('../feeds.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('../feeds-page.js', import.meta.url), 'utf8');

const news = JSON.parse(readFileSync(new URL('../news.json', import.meta.url)));
const model = lib.buildCampusModel(registry, table, news);
const published = new Set(news.items.map((a) => a.source));
const groups = [...model.universities, ...model.cegeps];

// Chaque source active apparaît une fois, et seulement elles.
const shown = groups.flatMap((g) => g.papers).sort();
const active = [...new Set(registry.active.filter((s) => s.name && s.institution && published.has(s.name)).map((s) => s.name))].sort();
assert.deepEqual(shown, active, 'campus affichés ≠ sources publiées');
// Chaque journal affiché a au moins un article dans le fil publié.
for (const name of shown) assert.ok(published.has(name), `affiché sans article publié : ${name}`);
// Une source sans article ne s'affiche pas (cas synthétique).
const fake = lib.buildCampusModel({ active: [{ name: 'A', institution: 'Université X' }, { name: 'B', institution: 'Collège Y', type: 'cegep' }], candidates: [] }, {}, { items: [{ source: 'A' }] });
assert.deepEqual(fake.cegeps, []); assert.equal(fake.pending, 1); assert.deepEqual(fake.waiting, ['B']);

// Les cégeps sont dans la section Cégeps.
for (const s of registry.active.filter((x) => x.type === 'cegep' && published.has(x.name))) {
  assert.ok(model.cegeps.some((g) => g.papers.includes(s.name)), `cégep mal classé : ${s.name}`);
}

// Compteur « en cours d’intégration » = candidats réels.
const n = (registry.candidates || []).length + model.waiting.length;
if (n) assert.ok(model.note.startsWith(`+ ${n} publication`), model.note);
else assert.equal(model.note, '');

// Noms d’établissement jamais tronqués.
for (const g of groups) assert.ok(!/…|\.\.\./.test(g.acronym), `nom tronqué : ${g.acronym}`);
assert.equal(lib.institutionAcronym('Collège Lionel-Groulx'), 'Lionel-Groulx');
assert.equal(lib.institutionAcronym('Collège de Maisonneuve'), 'Maisonneuve');
assert.equal(lib.institutionAcronym("Cégep de l'Outaouais"), 'Outaouais');

// La page charge la logique partagée, sans liste codée à la main.
assert.ok(html.indexOf('feeds-campuses-lib.js') > 0 && html.indexOf('feeds-campuses-lib.js') < html.indexOf('feeds-page.js'));
assert.ok(!/FEEDS_INSTITUTION_ORDER|function institutionAcronym/.test(page), 'logique dupliquée dans feeds-page.js');

// Liens de flux locaux qui existent, pas de nom réel.
for (const m of html.matchAll(/(?:href|data-feed)="([^"#:]+\.(?:xml|json))"/g)) {
  assert.ok(existsSync(new URL(`../${m[1]}`, import.meta.url)), `flux manquant : ${m[1]}`);
}
assert.ok(/<link rel="alternate" type="application\/rss\+xml"[^>]+href="feed\.xml"/.test(html));
assert.ok(!/tison/i.test(html + page), 'nom réel dans la page');
console.log(`feeds-page: ${groups.length} établissements, ${shown.length} journaux, ${n} en intégration OK`);

// Prochaine mise à jour : heure de Toronto, change d'heure inclus (HAE → HNE le 1er nov. 2026).
assert.equal(lib.updateStatus('2026-10-31T13:12:00Z', '2026-10-31T13:20:00Z'), 'Prochaine mise à jour prévue vers 10 h 00 (heure du Québec).'.replace('10 h 00', lib.torontoClock(new Date('2026-10-31T14:00:00Z'))));
assert.equal(lib.nextUpdateEstimate('2026-10-31T13:12:00Z').toISOString(), '2026-10-31T14:00:00.000Z');
assert.equal(lib.nextUpdateEstimate('2026-10-31T13:50:00Z').toISOString(), '2026-10-31T15:00:00.000Z');
assert.match(lib.torontoClock(new Date('2026-10-31T14:00:00Z')), /^10/, 'HAE : 14 h UTC = 10 h');
assert.match(lib.torontoClock(new Date('2026-11-02T14:00:00Z')), /^9/, 'HNE : 14 h UTC = 9 h');
assert.equal(lib.nextUpdateEstimate('pas une date'), null);
assert.match(page, /timeZone: 'America\/Toronto'/, 'date de mise à jour en heure de Toronto');
assert.doesNotMatch(page, /updatedSlot/, 'afficher l’heure réelle, pas le créneau théorique');
assert.equal(lib.updateStatus('2026-10-31T10:00:00Z', '2026-10-31T13:00:00Z'), 'Prochaine mise à jour imminente.');

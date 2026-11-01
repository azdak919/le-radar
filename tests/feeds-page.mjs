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

const model = lib.buildCampusModel(registry, table);
const groups = [...model.universities, ...model.cegeps];

// Chaque source active apparaît une fois, et seulement elles.
const shown = groups.flatMap((g) => g.papers).sort();
const active = [...new Set(registry.active.filter((s) => s.name && s.institution).map((s) => s.name))].sort();
assert.deepEqual(shown, active, 'campus affichés ≠ sources actives');

// Les cégeps sont dans la section Cégeps.
for (const s of registry.active.filter((x) => x.type === 'cegep')) {
  assert.ok(model.cegeps.some((g) => g.papers.includes(s.name)), `cégep mal classé : ${s.name}`);
}

// Compteur « en cours d’intégration » = candidats réels.
const n = (registry.candidates || []).length;
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

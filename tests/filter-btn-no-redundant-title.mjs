// Pastilles sources : pas d’infobulle qui répète le nom et l’établissement
// déjà affichés (la bulle native débordait au bord de l’écran).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const js = readFileSync(new URL('../radar-news.js', import.meta.url), 'utf8');
const fn = js.slice(js.indexOf('function renderNewsFilters'), js.indexOf('NEWS_FILTERS.appendChild(btn)'));
assert.ok(!/btn\.title = institution \?/.test(fn), 'infobulle redondante retirée');
assert.match(fn, /if \(institution && !instLabel\) btn\.title =/, 'infobulle seulement si l’établissement est caché');
console.log('filter-btn-no-redundant-title OK');

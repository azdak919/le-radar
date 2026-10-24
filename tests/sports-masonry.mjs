// Sports : toutes les rangées affichées (pas de « Voir plus ») + mosaïque sans trou.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const js = readFileSync(new URL('../sports-board.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../seo-pages.css', import.meta.url), 'utf8');
assert.ok(!/collapseLongLists|sports-panel__more|is-collapsed|LIST_KEEP/.test(js), 'aucune troncature des résultats');
assert.ok(!/sports-panel__more|is-collapsed/.test(css), 'aucun style de repli');
assert.match(js, /function layoutBoard\(board\)/);
assert.match(js, /Math\.ceil\(\(h \+ MS_GAP\) \/ MS_ROW\)/, 'span = hauteur réelle');
assert.match(js, /new ResizeObserver\(layoutMasonry\)/, 'recalcul au redimensionnement');
assert.match(js, /MutationObserver/, 'recalcul aux mises à jour en direct');
assert.match(css, /\.sports-board\.is-masonry \{ grid-auto-rows: 4px !important; row-gap: 0 !important; \}/);
// Borne de trou : span arrondi au-dessus → trou vertical ≤ MS_GAP + MS_ROW.
const gap = +js.match(/const MS_GAP = (\d+)/)[1]; const row = +js.match(/const MS_ROW = (\d+)/)[1];
assert.ok(gap + row <= 20, 'trou max ≤ 20 px');
console.log('sports-masonry OK');

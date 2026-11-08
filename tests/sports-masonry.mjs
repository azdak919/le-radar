// Sports : toutes les rangées affichées (pas de « Voir plus ») + mosaïque sans trou.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const js = readFileSync(new URL('../sports-board.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../seo-pages.css', import.meta.url), 'utf8');
assert.ok(!/collapseLongLists|sports-panel__more|is-collapsed|LIST_KEEP/.test(js), 'aucune troncature des résultats');
assert.ok(!/sports-panel__more|is-collapsed/.test(css), 'aucun style de repli');
assert.match(js, /function layoutBoards\(\)/);
assert.match(js, /Math\.ceil\(\(h \+ MS_GAP\) \/ MS_ROW\)/, 'span = hauteur réelle');
assert.match(js, /new ResizeObserver\(layoutMasonry\)/, 'recalcul au redimensionnement');
assert.match(js, /MutationObserver/, 'recalcul aux mises à jour en direct');
assert.match(css, /\.sports-board\.is-masonry \{ grid-auto-rows: 4px !important; row-gap: 0 !important; \}/);
// Borne de trou : span arrondi au-dessus → trou vertical ≤ MS_GAP + MS_ROW.
const gap = +js.match(/const MS_GAP = (\d+)/)[1]; const row = +js.match(/const MS_ROW = (\d+)/)[1];
assert.ok(gap + row <= 20, 'trou max ≤ 20 px');
// Exercise the actual function, not a duplicate implementation.
const layoutSource = js.match(/  function layoutBoards\(\) \{[\s\S]*?\n  \}\n  let msRaf/)[0].replace(/\n  let msRaf$/, '');
const events = [];
function card(id, height, top = '0px', bottom = '0px', initial = '', hidden = false) {
  let span = initial;
  return { id, hidden, top, bottom,
    getBoundingClientRect() { events.push(`measure:${id}`); return { height }; },
    style: {
      get gridRowEnd() { return span; },
      set gridRowEnd(value) { events.push(`span:${id}:${value}`); span = value; },
      removeProperty(name) { assert.equal(name, 'grid-row-end'); events.push(`clear:${id}`); span = ''; },
    },
  };
}
function board(id, columns, children, isConnected = true) {
  return { id, columns, children, isConnected,
    classList: { toggle(name, on) { assert.equal(name, 'is-masonry'); events.push(`class:${id}:${on}`); } },
  };
}
const a = card('a', 100, '2px', '4px');
const stable = card('stable', 50, '1px', '1px', 'span 17');
const hidden = card('hidden', 900, '0px', '0px', 'span 9', true);
const b = card('b', 80);
const single = card('single', 900, '0px', '0px', 'span 7');
const detached = card('detached', 900, '0px', '0px', 'span 8');
const fixtureBoards = [board('A', 2, [a, stable, hidden]), board('B', 3, [b]), board('single-grid', 1, [single]), board('detached-grid', 2, [detached], false)];
const context = { boards: fixtureBoards, MS_ROW: row, MS_GAP: gap,
  boardCols(grid) { events.push(`cols:${grid.id}`); return grid.columns; },
  getComputedStyle(el) { events.push(`style:${el.id}`); return { marginTop: el.top, marginBottom: el.bottom }; },
};
vm.runInNewContext(layoutSource + '\nlayoutBoards();', context);
assert.deepEqual(events.slice(0, 3), ['cols:A', 'cols:B', 'cols:single-grid'], 'all column reads precede all writes');
const firstMeasure = events.findIndex(e => e.startsWith('style:'));
assert.ok(firstMeasure > 0);
assert.ok(!events.slice(firstMeasure).some(e => /^(class|clear|cols):/.test(e)), 'no preparation write/column read after measurements start');
const firstSpan = events.findIndex(e => e.startsWith('span:'));
assert.ok(firstSpan > firstMeasure);
assert.ok(!events.slice(firstSpan).some(e => /^(measure|style):/.test(e)), 'all heights across both grids precede span writes');
assert.equal(a.style.gridRowEnd, 'span 30', 'height includes both margins');
assert.equal(stable.style.gridRowEnd, 'span 17');
assert.equal(b.style.gridRowEnd, 'span 24');
assert.equal(hidden.style.gridRowEnd, '');
assert.equal(single.style.gridRowEnd, '');
assert.equal(detached.style.gridRowEnd, 'span 8');
assert.ok(!events.some(e => /^(measure|style):(hidden|single|detached)$/.test(e)));
assert.ok(!events.some(e => e.startsWith('span:stable:')), 'unchanged span is not written');
events.length = 0;
vm.runInNewContext('layoutBoards();', context);
assert.ok(!events.some(e => /^(span|clear):/.test(e)), 'second unchanged pass avoids span writes and redundant clears');
console.log('sports-masonry OK');

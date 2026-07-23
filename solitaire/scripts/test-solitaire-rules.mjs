#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const require = createRequire(import.meta.url);
const R = require(join(root, 'js/solitaire-rules.js'));

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    failed++;
  }
}

function foundationsCount(st) {
  return st.foundations.reduce((n, f) => n + f.length, 0);
}

function fullStateWith(partial) {
  const used = new Set();
  function mark(c) { used.add(c.suit + c.value); }
  (partial.stock || []).forEach(mark);
  (partial.waste || []).forEach(mark);
  (partial.foundations || []).forEach((f) => f.forEach(mark));
  (partial.tableau || []).forEach((col) => col.forEach(mark));
  const st = {
    stock: [...(partial.stock || [])],
    waste: [...(partial.waste || [])],
    foundations: (partial.foundations || [[], [], [], []]).map((f) => f.map((c) => ({ ...c }))),
    tableau: (partial.tableau || Array.from({ length: 7 }, () => [])).map((col) => col.map((c) => ({ ...c }))),
  };
  while (st.tableau.length < 7) st.tableau.push([]);
  for (const c of R.createDeck()) {
    const k = c.suit + c.value;
    if (used.has(k)) continue;
    st.stock.push({ ...c, faceUp: false });
  }
  return st;
}

// Cas G — detection pure
{
  const st = fullStateWith({ waste: [{ suit: '♠', value: 'A', faceUp: true }] });
  const before = JSON.stringify(st);
  const idxs = R.legalFoundationIndexes(st.waste[0], st.foundations);
  assert(idxs.length === 4, 'Cas G: ace legal on empty foundations');
  assert(JSON.stringify(st) === before, 'Cas G: legalFoundationIndexes pure');
  R.canDropOnFoundation(st.waste[0], 0, st.foundations);
  assert(JSON.stringify(st) === before, 'Cas G: canDropOnFoundation pure');
}

// Cas B — draw
{
  let st = fullStateWith({
    stock: [
      { suit: '♥', value: 'A', faceUp: false },
      { suit: '♠', value: '9', faceUp: false },
    ],
  });
  // rebuild: fullStateWith already padded stock - need ace on top of stock
  st = fullStateWith({});
  st.stock.push({ suit: '♥', value: 'A', faceUp: false }); // wrong total
}
// rebuild cleanly for Cas B
{
  const deck = R.createDeck();
  let st = R.emptyState();
  let di = 0;
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      st.tableau[col].push({ ...deck[di++], faceUp: row === col });
    }
  }
  st.stock = deck.slice(di).map((c) => ({ ...c, faceUp: false }));
  // force ace on top of stock
  const aceIdx = st.stock.findIndex((c) => c.value === 'A');
  assert(aceIdx >= 0, 'deck has ace in stock or tableau');
  if (aceIdx >= 0) {
    const [ace] = st.stock.splice(aceIdx, 1);
    st.stock.push(ace);
  }
  R.assertInvariants(st);
  const f0 = foundationsCount(st);
  st = R.drawFromStock(st);
  R.assertInvariants(st);
  assert(st.waste.length === 1, 'Cas B: waste has one card');
  assert(foundationsCount(st) === f0, 'Cas B: foundations unchanged after draw');
}

// Cas A/D — flipExposed after uncovering (king moved to empty col, not foundation)
{
  let st = fullStateWith({
    tableau: [
      [
        { suit: '♠', value: 'A', faceUp: false },
        { suit: '♥', value: 'K', faceUp: true },
      ],
      [], [], [], [], [], [],
    ],
  });
  R.assertInvariants(st);
  const king = st.tableau[0].pop();
  st.tableau[1].push(king); // moved, not founded
  const f0 = foundationsCount(st);
  R.flipExposed(st.tableau);
  assert(st.tableau[0][0].value === 'A' && st.tableau[0][0].faceUp, 'Cas D: ace revealed in tableau');
  assert(foundationsCount(st) === f0, 'Cas D: no foundation after flip');
  R.assertInvariants(st);
}

// Cas C — move does not cascade
{
  let st = fullStateWith({
    tableau: [
      [
        { suit: '♠', value: 'A', faceUp: true },
        { suit: '♥', value: '6', faceUp: true },
      ],
      [{ suit: '♣', value: '7', faceUp: true }],
      [], [], [], [], [],
    ],
  });
  R.assertInvariants(st);
  const f0 = foundationsCount(st);
  const next = R.applyMove(st, { pile: 'tableau', col: 0, cardIdx: 1 }, { pile: 'tableau', col: 1 });
  assert(next, 'Cas C: legal move');
  assert(foundationsCount(next) === f0, 'Cas C: no auto foundation');
  assert(next.tableau[0].length === 1 && next.tableau[0][0].value === 'A', 'Cas C: ace remains');
  R.assertInvariants(next);
}

// Cas H — explicit foundation
{
  let st = fullStateWith({ waste: [{ suit: '♦', value: 'A', faceUp: true }] });
  R.assertInvariants(st);
  const next = R.applyMove(st, { pile: 'waste', col: null, cardIdx: 0 }, { pile: 'foundation', col: 2 });
  assert(next && next.foundations[2][0].value === 'A', 'Cas H: explicit foundation works');
  R.assertInvariants(next);
}

// Illegal move purity
{
  let st = fullStateWith({ waste: [{ suit: '♠', value: '5', faceUp: true }] });
  const snap = JSON.stringify(st);
  assert(R.applyMove(st, { pile: 'waste', col: null, cardIdx: 0 }, { pile: 'foundation', col: 0 }) === null, 'illegal rejected');
  assert(JSON.stringify(st) === snap, 'original untouched');
}

// Source scan index.html
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert(!html.includes('trySafeAutoFoundations'), 'no trySafeAutoFoundations');
  assert(!html.includes('isSafeAutoFoundation'), 'no isSafeAutoFoundation');
  const stockFn = html.slice(html.indexOf('function clickStock'), html.indexOf('function onCardClick'));
  assert(!/foundations\s*\[/.test(stockFn), 'clickStock does not write foundations');
  assert(!stockFn.includes('tryAutoFoundation'), 'clickStock no tryAutoFoundation');
  const flipFn = html.slice(html.indexOf('function flipExposed()'), html.indexOf('function executeMove'));
  assert(!flipFn.includes('foundations'), 'flipExposed pure of foundations');
  // executeMove only foundations.push when to.pile foundation
  assert(html.includes('function tryAutoPlace'), 'tryAutoPlace present');
  assert(html.includes('function tryAutoFoundation'), 'tryAutoFoundation present (explicit)');
  assert(html.includes('function autoComplete'), 'autoComplete present (user button)');
}

// SW
{
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  assert(/solitaire-shell-v\d+/.test(sw), 'versioned shell cache');
  assert(sw.includes('caches.delete'), 'old caches deleted on activate');
}

if (failed) {
  console.error('FAILED', failed);
  process.exit(1);
}
console.log('OK solitaire non-regression (' + (8) + ' groups)');
process.exit(0);

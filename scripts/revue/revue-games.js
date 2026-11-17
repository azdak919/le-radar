/**
 * Jeux de la revue imprimée : sudoku et mots cachés, générés de façon DÉTERMINISTE à partir de la date et de
 * l'édition (même édition → mêmes grilles), mots cachés tirés des titres de l'édition. Aucune dépendance.
 */
function seedOf(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
/** mulberry32 : petit générateur pseudo-aléatoire reproductible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* ---------- Sudoku ---------- */
function countSolutions(grid, limit = 2) {
  const g = grid.slice();
  let n = 0;
  const ok = (i, v) => {
    const r = Math.floor(i / 9), c = i % 9, br = r - r % 3, bc = c - c % 3;
    for (let k = 0; k < 9; k++) {
      if (g[r * 9 + k] === v || g[k * 9 + c] === v) return false;
      if (g[(br + Math.floor(k / 3)) * 9 + bc + k % 3] === v) return false;
    }
    return true;
  };
  const solve = () => {
    let best = -1, bestCands = null;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const cands = [];
      for (let v = 1; v <= 9; v++) if (ok(i, v)) cands.push(v);
      if (!cands.length) return;
      if (!bestCands || cands.length < bestCands.length) { best = i; bestCands = cands; if (cands.length === 1) break; }
    }
    if (best < 0) { n++; return; }
    for (const v of bestCands) { g[best] = v; solve(); if (n >= limit) break; }
    g[best] = 0;
  };
  solve();
  return n;
}
/** Grille complète par permutations d'un motif valide, puis on retire des cases tant que la solution reste unique. */
function sudoku(seedText, clues = 30) {
  const rand = rng(seedOf(`sudoku|${seedText}`));
  const bands = shuffle([0, 1, 2], rand), stacks = shuffle([0, 1, 2], rand);
  const rows = bands.flatMap(b => shuffle([0, 1, 2], rand).map(r => b * 3 + r));
  const cols = stacks.flatMap(s => shuffle([0, 1, 2], rand).map(c => s * 3 + c));
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rand);
  const solution = [];
  for (const r of rows) for (const c of cols) solution.push(digits[(r * 3 + Math.floor(r / 3) + c) % 9]);
  const puzzle = solution.slice();
  let filled = 81;
  for (const i of shuffle([...Array(81).keys()], rand)) {
    if (filled <= clues) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle) !== 1) puzzle[i] = keep; else filled--;
  }
  return { puzzle, solution };
}

/* ---------- Mots cachés ---------- */
const STOP = new Set('AVEC DANS POUR PLUS SONT CETTE COMME ENTRE APRES AVANT TOUT TOUS TOUTE TOUTES LEUR LEURS NOUS VOUS ELLE ELLES ILS QUAND MAIS DONC ENCORE THEIR THERE WHERE WHICH ABOUT AFTER BEFORE WHAT YOUR THIS THAT WITH FROM HAVE WILL BEING THESE THOSE INTO OVER UNDER SINCE WHILE'.split(' '));
const plain = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[œŒ]/g, 'OE').replace(/[æÆ]/g, 'AE').toUpperCase();
/** Mots de 5 à 10 lettres des titres de l'édition (sans accents, majuscules), dans l'ordre de l'édition. */
function editionWords(titles, max = 12) {
  const out = [];
  for (const t of titles) {
    for (const w of plain(t).split(/[^A-Z]+/)) {
      if (w.length < 5 || w.length > 10 || STOP.has(w) || out.includes(w)) continue;
      out.push(w);
    }
  }
  return out.slice(0, max * 2);
}
const DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [1, -1], [-1, -1]];
function wordSearch(seedText, titles, size = 12, max = 12) {
  const rand = rng(seedOf(`mots|${seedText}`));
  const grid = Array.from({ length: size }, () => Array(size).fill(''));
  const placed = [];
  for (const word of shuffle(editionWords(titles, max), rand).sort((a, b) => b.length - a.length)) {
    if (placed.length >= max) break;
    let done = false;
    for (let tries = 0; tries < 200 && !done; tries++) {
      const [dr, dc] = DIRS[Math.floor(rand() * (placed.length < 3 ? 2 : DIRS.length))];
      const r0 = Math.floor(rand() * size), c0 = Math.floor(rand() * size);
      const cells = [];
      for (let k = 0; k < word.length; k++) {
        const r = r0 + dr * k, c = c0 + dc * k;
        if (r < 0 || c < 0 || r >= size || c >= size || (grid[r][c] && grid[r][c] !== word[k])) { cells.length = 0; break; }
        cells.push([r, c]);
      }
      if (cells.length !== word.length) continue;
      cells.forEach(([r, c], k) => { grid[r][c] = word[k]; });
      placed.push({ word, cells });
      done = true;
    }
  }
  if (placed.length < 5) return null;
  const letters = 'EEEAAIIOOUNRSTLCDMP';
  const answer = grid.map(row => row.map(ch => ch || ''));
  const full = grid.map(row => row.map(ch => ch || letters[Math.floor(rand() * letters.length)]));
  return { grid: full, answer, words: placed.map(p => p.word).sort() };
}

/** Jeux d'une édition : la graine = date + édition (ex. « 2026-11-16|soir »). */
function gamesFor(model) {
  const seed = `${String(model.date || model.id || '').slice(0, 10)}|${model.edition?.id || ''}|${model.id || ''}`;
  const titles = (model.items || []).map(x => x.title);
  return { sudoku: sudoku(seed), words: wordSearch(seed, titles) };
}

module.exports = { gamesFor, sudoku, wordSearch, editionWords, countSolutions, seedOf };

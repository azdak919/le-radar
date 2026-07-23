/**
 * Pure Klondike helpers for Ataraxia Solitaire.
 * No DOM. Detection helpers never imply auto-foundation.
 * Safe to use in Node tests and (optionally) in the page.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SolitaireRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SUITS = ['♠', '♥', '♦', '♣'];
  const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  function numVal(v) {
    return VALUES.indexOf(v) + 1;
  }

  function isRed(suit) {
    return suit === '♥' || suit === '♦';
  }

  function cloneCard(c) {
    return { suit: c.suit, value: c.value, faceUp: !!c.faceUp };
  }

  function cloneState(st) {
    return {
      stock: (st.stock || []).map(cloneCard),
      waste: (st.waste || []).map(cloneCard),
      foundations: (st.foundations || [[], [], [], []]).map((f) => f.map(cloneCard)),
      tableau: (st.tableau || Array.from({ length: 7 }, () => [])).map((col) => col.map(cloneCard)),
    };
  }

  function emptyState() {
    return {
      stock: [],
      waste: [],
      foundations: [[], [], [], []],
      tableau: Array.from({ length: 7 }, () => []),
    };
  }

  function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (const value of VALUES) {
        deck.push({ suit, value, faceUp: false });
      }
    }
    return deck;
  }

  function canDropOnFoundation(card, fi, foundations) {
    if (!card) return false;
    const f = foundations[fi];
    if (!f || f.length === 0) return card.value === 'A';
    const top = f[f.length - 1];
    return top.suit === card.suit && numVal(card.value) === numVal(top.value) + 1;
  }

  function canDropOnTableau(card, col, tableau) {
    if (!card) return false;
    const pile = tableau[col];
    if (!pile || pile.length === 0) return card.value === 'K';
    const top = pile[pile.length - 1];
    if (!top.faceUp) return false;
    return isRed(top.suit) !== isRed(card.suit) && numVal(card.value) === numVal(top.value) - 1;
  }

  /** Only flips face-up — never moves cards between piles. */
  function flipExposed(tableau) {
    for (let col = 0; col < tableau.length; col++) {
      const pile = tableau[col];
      if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
        pile[pile.length - 1].faceUp = true;
      }
    }
  }

  function countCards(state) {
    let n = state.stock.length + state.waste.length;
    for (const f of state.foundations) n += f.length;
    for (const col of state.tableau) n += col.length;
    return n;
  }

  function assertInvariants(state) {
    const total = countCards(state);
    if (total !== 52) {
      throw new Error('invariant: expected 52 cards, got ' + total);
    }
    const keys = new Set();
    function visit(c, where) {
      const k = c.suit + c.value;
      if (keys.has(k)) throw new Error('invariant: duplicate card ' + k + ' at ' + where);
      keys.add(k);
    }
    state.stock.forEach((c) => visit(c, 'stock'));
    state.waste.forEach((c) => visit(c, 'waste'));
    state.foundations.forEach((f, i) => f.forEach((c) => visit(c, 'foundation' + i)));
    state.tableau.forEach((col, i) => col.forEach((c) => visit(c, 'tableau' + i)));
    if (keys.size !== 52) throw new Error('invariant: unique cards ' + keys.size);

    for (let fi = 0; fi < 4; fi++) {
      const f = state.foundations[fi];
      for (let i = 0; i < f.length; i++) {
        if (numVal(f[i].value) !== i + 1) {
          throw new Error('invariant: foundation order broken at ' + fi);
        }
        if (i > 0 && f[i].suit !== f[0].suit) {
          throw new Error('invariant: foundation suit broken at ' + fi);
        }
      }
    }
    return true;
  }

  /**
   * Pure draw: stock → waste. Does NOT move anything to foundations.
   */
  function drawFromStock(state) {
    const st = cloneState(state);
    if (st.stock.length > 0) {
      const c = st.stock.pop();
      c.faceUp = true;
      st.waste.push(c);
    } else if (st.waste.length > 0) {
      st.stock = st.waste.slice().reverse().map((c) => ({ ...c, faceUp: false }));
      st.waste = [];
    }
    return st;
  }

  /**
   * Pure move. Returns null if illegal. Never cascades other cards to foundations.
   */
  function applyMove(state, from, to) {
    const st = cloneState(state);
    let cards;
    if (from.pile === 'waste') {
      if (!st.waste.length) return null;
      cards = [st.waste[st.waste.length - 1]];
    } else if (from.pile === 'foundation') {
      const f = st.foundations[from.col];
      if (!f.length) return null;
      cards = [f[f.length - 1]];
    } else {
      const col = st.tableau[from.col];
      if (from.cardIdx >= col.length) return null;
      cards = col.slice(from.cardIdx);
    }
    if (!cards.length) return null;

    if (to.pile === 'foundation') {
      if (cards.length !== 1) return null;
      if (!canDropOnFoundation(cards[0], to.col, st.foundations)) return null;
    } else {
      if (!canDropOnTableau(cards[0], to.col, st.tableau)) return null;
    }

    if (from.pile === 'waste') st.waste.pop();
    else if (from.pile === 'foundation') st.foundations[from.col].pop();
    else st.tableau[from.col].splice(from.cardIdx);

    if (to.pile === 'foundation') st.foundations[to.col].push(...cards);
    else st.tableau[to.col].push(...cards);

    flipExposed(st.tableau);
    return st;
  }

  /**
   * Legal foundation targets for a card (detection only — no mutation).
   */
  function legalFoundationIndexes(card, foundations) {
    const out = [];
    if (!card) return out;
    for (let fi = 0; fi < 4; fi++) {
      if (canDropOnFoundation(card, fi, foundations)) out.push(fi);
    }
    return out;
  }

  return {
    SUITS,
    VALUES,
    numVal,
    isRed,
    cloneCard,
    cloneState,
    emptyState,
    createDeck,
    canDropOnFoundation,
    canDropOnTableau,
    flipExposed,
    countCards,
    assertInvariants,
    drawFromStock,
    applyMove,
    legalFoundationIndexes,
  };
});

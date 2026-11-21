// Barrière des résumés de la revue : longueur, nombre de phrases, similarité avec le titre.
// La similarité est le coefficient de Sørensen–Dice (scripts/vendor/dice-coefficient.js, MIT).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { diceCoefficient } = require('../vendor/dice-coefficient.js');

/** En dessous : le texte répète le titre. Au-dessus de 1, rien n’est trop proche. */
export const TITLE_SIMILARITY_MAX = 0.55;
export const RESUME_MIN_CHARS = 80;
export const RESUME_MAX_CHARS = 560;

/**
 * Neurones Workers AI pour @cf/meta/llama-3.3-70b-instruct-fp8-fast
 * (developers.cloudflare.com/workers-ai/platform/pricing/, novembre 2026).
 * 26 668 neurones / million de jetons en entrée, 204 805 / million en sortie.
 * Le forfait gratuit donne 10 000 neurones par jour, sans facturation.
 * Un passage de revue s’arrête à ce plafond, bien en dessous, pour laisser
 * la place aux accroches des réseaux (modèle 8B, autre budget).
 */
export const NEURONS_IN_PER_M = 26668;
export const NEURONS_OUT_PER_M = 204805;
export const NEURON_BUDGET_PER_RUN = 1800;

const fold = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Coefficient de Dice entre le résumé et le titre (0 à 1), après normalisation. */
export function titleSimilarity(text, title) {
  const a = fold(text);
  const b = fold(title);
  if (!a || !b) return 0;
  if (a === b) return 1;
  return diceCoefficient(a, b);
}

/** Nombre de phrases terminées par . ! ? ou … */
export function sentenceCount(text) {
  return (String(text || '').match(/[.!?…](?=\s|$)/g) || []).length;
}

/**
 * Coupe au dernier point complet (. ! ? …), au plus `maxSentences` phrases.
 * Une fin de phrase coupée par le plafond de jetons disparaît. Chaîne vide s’il n’y a aucune phrase finie.
 */
export function cutAtLastSentence(text, maxSentences = 3) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const ends = [];
  const re = /[.!?…](?=\s|$)/g;
  let m;
  while ((m = re.exec(s))) ends.push(m.index + 1);
  if (!ends.length) return '';
  return s.slice(0, ends[Math.min(ends.length, maxSentences) - 1]).trim();
}

const FACT_STOP = new Set('le la les un une des du de d l au aux et ou en dans sur pour par avec son sa ses ce cet cette ces qui que est sont the a an of to in on for and or with its at by from nov dec jan feb mar apr jun jul aug sep oct'.split(' '));

/** Chiffres et noms propres d’un texte (lieux, personnes, organismes). */
export function factTokens(text) {
  const s = String(text || '');
  const out = new Set();
  for (const m of s.matchAll(/\d+(?:[.,]\d+)?/g)) out.add(m[0].replace(',', '.'));
  for (const m of s.matchAll(/(?<![\p{L}])(\p{Lu}[\p{L}’'-]{2,})/gu)) {
    const w = m[1].toLowerCase().replace(/[’'].*$/, '');
    if (!FACT_STOP.has(w)) out.add(w);
  }
  return out;
}

/** Faits du chapô absents du titre. Tableau vide : rien à exiger. */
export function extraFacts(body, title) {
  const titleFacts = factTokens(title);
  const titleFold = fold(title);
  return [...factTokens(body)].filter(f => !titleFacts.has(f) && !titleFold.includes(f));
}

/** Équivalences courantes anglais ↔ français. La forme pliée (sans accent, sans trait d’union) suffit. */
export const NAME_EQUIV = [
  ['beaux arts', 'fine arts'],
  ['teheran', 'tehran'],
  ['irak', 'iraq'],
  ['persepolis', 'persepolis'],
  ['mollah', 'mollahs', 'mullah', 'mullahs'],
];

const loose = s => fold(s).replace(/-/g, ' ');
const wordsOf = s => loose(s).split(/\s+/).filter(Boolean);
const hasPhrase = (hay, phrase) => {
  const p = String(phrase || '').trim();
  if (!p) return false;
  return new RegExp(`(?:^|\\s)${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`).test(hay);
};
/** Flexion légère : étudiant / étudiants, municipalité / municipalités. Pas un mot au milieu d’un autre. */
const sameWord = (a, b) => {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 4 || !long.startsWith(short)) return false;
  return /^(?:e|s|es|x)$/.test(long.slice(short.length));
};

/** Chiffre ↔ mot, dans les deux sens. « 2 » n’est pas inventé si la source dit « two » ou « deux ». */
const DIGIT_WORDS = {
  2: ['deux', 'two'], 3: ['trois', 'three'], 4: ['quatre', 'four'], 5: ['cinq', 'five'],
  6: ['six'], 7: ['sept', 'seven'], 8: ['huit', 'eight'], 9: ['neuf', 'nine'], 10: ['dix', 'ten'],
  11: ['onze', 'eleven'], 12: ['douze', 'twelve'], 15: ['quinze', 'fifteen'], 20: ['vingt', 'twenty'],
  100: ['cent', 'hundred'], 1000: ['mille', 'thousand'],
};

/** 11 est dans « 11e » ou « 11th ». Un chiffre vraiment absent (« 2 » sans two ni deux) reste absent. */
export function sourceHasNumber(source, n) {
  const s = loose(source);
  if (new RegExp(`(?:^|\\D)${n}(?:e|er|ere|eme|th|st|nd|rd)?(?:\\D|$)`, 'i').test(s)) return true;
  return (DIGIT_WORDS[String(n)] || []).some(w => hasPhrase(s, w));
}

/** Nom propre présent dans la source : casse, accents, trait d’union, flexion légère, ou traduction listée. */
export function sourceHasName(source, name) {
  const srcWords = wordsOf(source);
  const srcPhrase = srcWords.join(' ');
  const nameWords = wordsOf(name);
  if (!nameWords.length) return true;
  if (nameWords.every(w => srcWords.some(s => sameWord(w, s)))) return true;
  const phrase = nameWords.join(' ');
  const bits = phrase.split(' ');
  for (const group of NAME_EQUIV) {
    const g = group.map(loose);
    // « Beaux » ou « Beaux-Arts » vaut « Fine Arts » dès que l’autre forme est dans la source.
    const mentioned = g.some(a => bits.every(w => a.split(' ').includes(w)));
    if (mentioned && g.some(a => hasPhrase(srcPhrase, a))) return true;
  }
  return false;
}

/** Le résumé reprend ce fait du chapô, y compris « 11 » dans « 11e » et une traduction listée. */
export function resumeCoversFact(resume, fact) {
  if (!fact) return false;
  if (/^\d+$/.test(String(fact))) return sourceHasNumber(resume, fact);
  if (sourceHasName(resume, fact)) return true;
  const r = loose(resume);
  const f = loose(fact);
  for (const group of NAME_EQUIV) {
    const g = group.map(loose);
    const inGroup = g.some(a => a === f || a.split(' ').includes(f));
    if (inGroup && g.some(a => hasPhrase(r, a))) return true;
  }
  return false;
}

/**
 * Préfixe fidèle du chapô : jusqu’à 3 phrases, sans réécrire un mot.
 * Si le chapô commence par le titre, on le saute : le résumé doit ajouter autre chose.
 */
export function chapoExtract(text, title = '', { maxSentences = 3 } = {}) {
  let s = String(text || '').replace(/\s+/g, ' ').trim();
  const bare = String(title || '').replace(/\s+/g, ' ').trim().replace(/[.!?…]+$/u, '');
  if (bare && s.toLowerCase().startsWith(bare.toLowerCase())) {
    s = s.slice(bare.length).replace(/^[\s.:;–—-]+/u, '');
  }
  if (!s) return '';
  let end = 0;
  let n = 0;
  const re = /[.!?…](?=\s|$)/g;
  let m;
  while ((m = re.exec(s))) {
    n += 1;
    end = m.index + 1;
    if (n >= maxSentences) break;
  }
  return (end ? s.slice(0, end) : s).trim();
}

/** Estimation haute : 1 jeton pour 3 caractères, et toute la sortie demandée. */
export function estimateNeurons(inputChars, outputTokens) {
  const inn = Math.ceil(Math.max(0, inputChars) / 3);
  const out = Math.max(0, outputTokens);
  return (inn / 1e6) * NEURONS_IN_PER_M + (out / 1e6) * NEURONS_OUT_PER_M;
}

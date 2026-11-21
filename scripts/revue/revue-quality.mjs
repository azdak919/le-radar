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

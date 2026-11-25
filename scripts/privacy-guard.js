'use strict';
/**
 * Garde de confidentialité : noms interdits et comptes internes, lus dans
 * l'environnement (secrets GitHub en CI, `.env` local). Rien en dur ici.
 *
 *   FORBIDDEN_NAMES            liste séparée par des virgules (insensible à la casse)
 *   INTERNAL_BLUESKY_ACCOUNTS  comptes Bluesky internes en plus de
 *                              data/social/internal-accounts.json
 *
 * Sans FORBIDDEN_NAMES, la garde ne bloque rien et le signale (::warning::)
 * une seule fois par processus. Les tests passent un repli fictif explicite.
 */

function splitList(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

let warned = false;

/** Noms interdits (minuscules). `fallback` sert aux tests seulement. */
function forbiddenNames(fallback = []) {
  const names = splitList(process.env.FORBIDDEN_NAMES);
  if (names.length) return names;
  if (fallback.length) return splitList(fallback.join(','));
  if (!warned && process.env.GITHUB_ACTIONS === 'true') {
    warned = true;
    console.log('::warning::FORBIDDEN_NAMES absent : garde de confidentialité inactive.');
  }
  return [];
}

/** true si le texte contient un nom interdit (sous-chaîne, insensible à la casse). */
function containsForbiddenName(text, fallback = []) {
  const hay = String(text || '').toLowerCase();
  return forbiddenNames(fallback).some((n) => hay.includes(n));
}

/** Comptes Bluesky internes venant de l'environnement. */
function envInternalBlueskyAccounts() {
  return splitList(process.env.INTERNAL_BLUESKY_ACCOUNTS);
}

/** Fusionne data/social/internal-accounts.json avec l'environnement. */
function mergeInternalAccounts(fileAccounts = {}) {
  const out = { ...fileAccounts };
  const extra = envInternalBlueskyAccounts();
  if (extra.length) {
    const base = Array.isArray(out.bluesky) ? out.bluesky : [];
    out.bluesky = [...new Set([...base, ...extra])];
  }
  return out;
}

exports.forbiddenNames = forbiddenNames;
exports.containsForbiddenName = containsForbiddenName;
exports.envInternalBlueskyAccounts = envInternalBlueskyAccounts;
exports.mergeInternalAccounts = mergeInternalAccounts;

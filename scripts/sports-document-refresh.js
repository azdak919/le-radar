/**
 * Décision de fraîcheur du HTML /sports/.
 *
 * Le tableau est prérendu. Le worker le met en cache pour le hors-ligne.
 * Un stale-while-revalidate sans condition réaffiche la dernière visite :
 * le 11 nov. 2026 à 14 h 19, l'écran montrait encore « 00 h 18 » alors que
 * le serveur était déjà à 13 h 47.
 *
 * Chargé par sports/sw.js (importScripts) et par le test unitaire.
 */
var SPORTS_SHELL_FRESH_MS = 20 * 60 * 1000;

function sportsRevisionToken(response) {
  if (!response || !response.headers || typeof response.headers.get !== 'function') return '';
  return response.headers.get('last-modified') || response.headers.get('etag') || '';
}

function sportsCacheAgeMs(response, now) {
  var lm = response && response.headers && typeof response.headers.get === 'function'
    ? response.headers.get('last-modified')
    : '';
  var t = lm ? Date.parse(lm) : NaN;
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, now - t);
}

function sportsDocumentChanged(previous, next) {
  return Boolean(previous) && Boolean(next) && previous !== next;
}

/**
 * @returns {'network'|'network-then-cache'|'cache-then-refresh'}
 * network : rien en cache.
 * network-then-cache : cache trop vieux pour qu'on affiche son tampon.
 * cache-then-refresh : cache récent, peinture immédiate, rechargement si le serveur a bougé.
 */
function sportsShellPlan(input) {
  var hasCache = Boolean(input && input.hasCache);
  var age = input && Number.isFinite(input.cacheAgeMs) ? input.cacheAgeMs : Number.POSITIVE_INFINITY;
  if (!hasCache) return 'network';
  if (!(age < SPORTS_SHELL_FRESH_MS)) return 'network-then-cache';
  return 'cache-then-refresh';
}

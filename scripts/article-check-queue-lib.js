/**
 * LE-RADAR.ca — File de vérification par article : le neuf d'abord, puis
 * l'arriéré, avec un lot fixe par passe.
 *
 * POURQUOI
 * Depuis que le fil garde toute la session en cours (PR 431, ~1 000 articles
 * au lieu de 188), les étapes qui revisitaient CHAQUE article à chaque passe
 * (auteurs, photo de une, sonde des vignettes, miroir, crédits photo)
 * dépassaient leur plafond et le job « Update Student News » était annulé à
 * 25 min : news.json n'était plus jamais republié.
 *
 * LA FILE
 *   1. Tête de file : articles neufs ou modifiés (jamais vérifiés, ou dont la
 *      donnée vérifiée — URL d'image, etc. — a changé), les plus récents
 *      d'abord.
 *   2. Arriéré : articles déjà vus mais à revérifier, le plus anciennement
 *      vérifié d'abord.
 * Chaque passe prend au plus `size` articles. Une réserve (`reserveBacklog`,
 * 25 % par défaut) est gardée pour l'arriéré, comme la réserve de fraîcheur
 * d'archive-priority-lib : une rafale de neufs ne bloque jamais la reprise
 * des anciens. Ce qui n'entre pas dans le lot attend la passe suivante —
 * aucun article n'est retiré du fil, il garde simplement son état précédent.
 *
 * Aucune E/S, aucun réseau : logique pure, testable — voir
 * tests/article-check-queue.mjs.
 */

const DEFAULT_RESERVE_BACKLOG = 0.25;

function ts(value) {
  const t = Date.parse(value || '');
  return Number.isFinite(t) ? t : 0;
}

/**
 * Ordonne la file et coupe le lot de la passe.
 *
 * @param {object}   o
 * @param {object[]} o.items           articles candidats
 * @param {Function} o.isNew           (item) => true si neuf / modifié (tête de file)
 * @param {Function} [o.isDue]         (item) => true si l'arriéré doit être revérifié
 *                                     (par défaut : tout ce qui n'est pas neuf)
 * @param {Function} [o.checkedAt]     (item) => horodatage de la dernière vérification
 * @param {number}   [o.size]          taille du lot ; par défaut, tout
 * @param {number}   [o.reserveBacklog] part du lot réservée à l'arriéré (0–1)
 * @returns {{ batch: object[], fresh: number, backlog: number, deferred: number }}
 */
function buildCheckQueue({
  items = [],
  isNew,
  isDue = () => true,
  checkedAt = () => '',
  size = null,
  reserveBacklog = DEFAULT_RESERVE_BACKLOG,
} = {}) {
  const fresh = [];
  const backlog = [];
  const seen = new Set();
  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    if (isNew(item)) fresh.push(item);
    else if (isDue(item)) backlog.push(item);
  }
  fresh.sort((a, b) => ts(b.date) - ts(a.date));
  backlog.sort((a, b) => (ts(checkedAt(a)) - ts(checkedAt(b))) || (ts(b.date) - ts(a.date)));

  const total = fresh.length + backlog.length;
  const cap = Number.isFinite(size) && size >= 0 ? Math.floor(size) : total;
  let backlogShare = Math.min(backlog.length, Math.floor(cap * Math.min(1, Math.max(0, reserveBacklog))));
  const freshShare = Math.min(fresh.length, cap - backlogShare);
  // Lot non rempli par le neuf : l'arriéré prend la place libre.
  backlogShare = Math.min(backlog.length, cap - freshShare);
  const batch = [...fresh.slice(0, freshShare), ...backlog.slice(0, backlogShare)];
  return { batch, fresh: fresh.length, backlog: backlog.length, deferred: total - batch.length };
}

/** Chronomètre de passe : `over()` vrai une fois le budget (ms) écoulé. */
function createDeadline(budgetMs, now = Date.now) {
  const start = now();
  return {
    over: () => now() - start >= budgetMs,
    left: () => Math.max(0, budgetMs - (now() - start)),
  };
}

function logQueue(label, q, log = console.log) {
  log(`File ${label} : ${q.batch.length} à traiter cette passe (${q.fresh} neuf(s) / modifié(s), ${q.backlog} en arriéré, ${q.deferred} reporté(s))`);
}

module.exports = { DEFAULT_RESERVE_BACKLOG, buildCheckQueue, createDeadline, logQueue };

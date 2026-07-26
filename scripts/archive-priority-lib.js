/**
 * LE-RADAR.ca — Ordre d'archivage : la fragilité d'abord.
 *
 * POURQUOI
 * Toutes les publications étudiantes ne courent pas le même risque. Mesuré le
 * 2026-07-26 (index CDX de la Wayback Machine, en pages) :
 *
 *     1  Exil ............... Cégep du Vieux Montréal
 *     3  The Plant .......... Dawson College
 *     4  The Campus ......... Bishop's University
 *     8  La Pige ............ Cégep de Jonquière
 *    …
 *   229  The McGill Daily ... McGill
 *
 * Soit un écart de 229×. Les plus menacés sont les journaux de cégep et de
 * petits collèges — le profil de rédaction qui s'éteint quand l'équipe finit
 * son DEC. Trier par date seule revient à passer les premières passes sur les
 * titres déjà couverts des centaines de fois pendant que les autres attendent.
 *
 * DEUX RISQUES, PAS UN
 * La fragilité de la source n'est pas le seul danger : un article tout juste
 * publié est vulnérable avant qu'un passage spontané de la Wayback Machine ne
 * l'attrape, même chez un journal bien archivé. D'où une réserve de fraîcheur.
 *
 * Aucune E/S, aucun réseau : logique pure, testable — voir
 * tests/archive-priority.mjs.
 */

/** Part du lot réservée aux articles les plus récents, toutes sources confondues. */
const DEFAULT_RESERVE_RECENT = 0.25;

/**
 * Score de fragilité d'une source. Plus il est bas, plus la source est menacée.
 *
 * Une source **non mesurée** est neutre, jamais prioritaire : sans cette règle,
 * une panne réseau ou un domaine nouvellement ajouté remonterait en tête de
 * file au détriment de fragilités réelles et connues. Le cas est arrivé en
 * conditions réelles avec montrealcampus.ca (délai dépassé, 36 pages en fait).
 */
function fragilityScore(sourceName, fragility = {}) {
  const rec = fragility[sourceName];
  const pages = rec && Number.isFinite(rec.pages) ? rec.pages : null;
  return pages === null ? Number.POSITIVE_INFINITY : pages;
}

function byDateDesc(a, b) {
  return new Date(b.date || 0) - new Date(a.date || 0);
}

/**
 * Ordonne les candidats à l'archivage.
 *
 * @param {object[]} items        { url, source, date }
 * @param {object}   fragility    { "<source>": { pages } }
 * @param {number}   reserveRecent part du lot réservée à la fraîcheur (0–1)
 * @param {number}   size         taille du lot visé ; par défaut, tout
 * @returns {object[]} liste ordonnée, sans doublon d'URL
 */
function orderCandidates({ items = [], fragility = {}, reserveRecent = DEFAULT_RESERVE_RECENT, size = null } = {}) {
  const pool = items.filter((it) => it && it.url);
  if (pool.length === 0) return [];

  const target = size && size > 0 ? Math.min(size, pool.length) : pool.length;
  const recentSlots = Math.min(
    Math.floor(target * Math.max(0, Math.min(1, reserveRecent))),
    pool.length,
  );

  // Réserve de fraîcheur : les plus récents, toutes sources confondues.
  const recent = pool.slice().sort(byDateDesc).slice(0, recentSlots);
  const reserved = new Set(recent.map((it) => it.url));

  // Le reste : les sources les plus fragiles d'abord, puis les plus récents.
  const rest = pool
    .filter((it) => !reserved.has(it.url))
    .sort((a, b) => {
      const fa = fragilityScore(a.source, fragility);
      const fb = fragilityScore(b.source, fragility);
      if (fa !== fb) return fa - fb;
      return byDateDesc(a, b);
    });

  // La réserve doit tenir DANS le lot, pas après lui. En production le vivier
  // (≈ 190 articles) dépasse largement la taille d'une passe (20) : concaténer
  // la réserve en fin de liste la rendrait inatteignable et la protection de
  // la fraîcheur serait purement décorative.
  const fragilitySlots = Math.max(0, target - recent.length);
  const ordered = [
    ...rest.slice(0, fragilitySlots),
    ...recent,
    ...rest.slice(fragilitySlots),
  ];

  const seen = new Set();
  return ordered.filter((it) => (seen.has(it.url) ? false : seen.add(it.url)));
}

/**
 * Classement lisible des sources, du plus menacé au mieux couvert.
 * Sert à l'affichage du dry-run : c'est ce tableau qui rend la décision
 * vérifiable par un humain plutôt qu'opaque.
 */
function fragilityRanking(fragility = {}) {
  return Object.entries(fragility)
    .map(([source, rec]) => ({
      source,
      host: rec?.host || '',
      pages: Number.isFinite(rec?.pages) ? rec.pages : null,
      checkedAt: rec?.checkedAt || null,
      stale: Boolean(rec?.stale),
    }))
    .sort((a, b) => {
      if (a.pages === null && b.pages === null) return a.source.localeCompare(b.source);
      if (a.pages === null) return 1;
      if (b.pages === null) return -1;
      return a.pages - b.pages;
    });
}

module.exports = {
  DEFAULT_RESERVE_RECENT,
  fragilityScore,
  orderCandidates,
  fragilityRanking,
};

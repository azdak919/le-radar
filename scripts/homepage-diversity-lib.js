/**
 * LE RADAR — sièges de l’accueil par source (horizon 14 jours).
 *
 * Le héros est un seul bloc. La largeur ne décide que du nombre d’unes
 * et de vedettes : le bloc est choisi ici, puis classé par date. Les
 * places les plus fraîches du bloc sont les unes.
 *
 * En bref garde l’ordre des passes (pas un reclassement global par date) :
 *  1) premier titre d’une source et d’un établissement encore absents
 *  2) journal sœur (nouvelle source, même établissement)
 *  3) deuxième titre, seulement quand chaque source de l’horizon a déjà
 *     un siège et que ce siège ne dépasse pas deux articles (héros + En bref)
 *
 * La première page du fil réserve le dernier article de chaque source
 * de l’horizon, puis complète avec les plus récents.
 *
 * UMD : require() Node ou window.RadarHomepageDiversity en navigateur.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RadarHomepageDiversity = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DIVERSITY_HORIZON_DAYS = 14;
  const DAY_MS = 86400000;

  function itemTime(item) {
    const t = new Date(item && item.date || 0).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  function sortByDateDesc(items) {
    return (items || []).slice().sort((a, b) => itemTime(b) - itemTime(a));
  }

  function sourceOf(item) {
    return item && item.source ? String(item.source) : '';
  }

  function institutionOf(item) {
    if (!item) return '';
    return item.institution || item.source || '';
  }

  function articleKey(item) {
    if (!item) return '';
    return item.link || `${item.source}::${item.date}::${item.title}`;
  }

  function referenceMs(referenceDate) {
    if (referenceDate instanceof Date && Number.isFinite(referenceDate.getTime())) {
      return referenceDate.getTime();
    }
    if (typeof referenceDate === 'string' || typeof referenceDate === 'number') {
      const t = new Date(referenceDate).getTime();
      if (Number.isFinite(t)) return t;
    }
    return Date.now();
  }

  function horizonCutoff(referenceDate, days) {
    const span = Number.isFinite(days) ? days : DIVERSITY_HORIZON_DAYS;
    return referenceMs(referenceDate) - span * DAY_MS;
  }

  function sourcesInHorizon(items, referenceDate, days) {
    const cut = horizonCutoff(referenceDate, days);
    const out = new Set();
    for (const item of items || []) {
      const src = sourceOf(item);
      if (src && itemTime(item) >= cut) out.add(src);
    }
    return out;
  }

  /** Dernier article de chaque source encore dans l’horizon, date desc. */
  function latestPerHorizonSource(items, referenceDate, days) {
    const cut = horizonCutoff(referenceDate, days);
    const seen = new Set();
    const out = [];
    for (const item of sortByDateDesc(items)) {
      const src = sourceOf(item);
      if (!src || seen.has(src)) continue;
      if (itemTime(item) < cut) continue;
      seen.add(src);
      out.push(item);
    }
    return out;
  }

  /**
   * Bloc héros. Les sources de l’horizon d’abord (leur article le plus
   * récent, du plus frais au plus ancien), puis la date s’il reste des
   * sièges. Le tableau revient en ordre de date : l’appelant coupe les
   * unes sur le début.
   */
  function pickHeroSeats(items, seats, referenceDate, days) {
    const n = Math.max(0, seats | 0);
    if (!n) return [];
    const sorted = sortByDateDesc(items);
    const picked = [];
    const keys = new Set();
    const take = (item) => {
      const key = articleKey(item);
      if (!key || keys.has(key)) return;
      picked.push(item);
      keys.add(key);
    };
    for (const item of latestPerHorizonSource(sorted, referenceDate, days)) {
      if (picked.length >= n) break;
      take(item);
    }
    if (picked.length < n) {
      for (const item of sorted) {
        if (picked.length >= n) break;
        take(item);
      }
    }
    return sortByDateDesc(picked);
  }

  /**
   * Vrai si une source de l’horizon n’est pas dans `usedSources` et qu’un
   * de ses articles est encore dans `pool`. `catalog` sert à connaître
   * l’horizon même quand la source est déjà assise hors du pool.
   */
  function hasUncoveredHorizonSource(catalog, pool, usedSources, referenceDate, days) {
    const horizon = sourcesInHorizon(catalog, referenceDate, days);
    const used = usedSources instanceof Set ? usedSources : new Set(usedSources || []);
    const poolSources = new Set();
    for (const item of pool || []) {
      const src = sourceOf(item);
      if (src) poolSources.add(src);
    }
    for (const src of horizon) {
      if (!used.has(src) && poolSources.has(src)) return true;
    }
    return false;
  }

  /**
   * En bref, dans l’ordre des passes. Pas de reclassement global par date.
   * Le troisième titre (et au-delà) n’est pas choisi ici.
   */
  function pickBriefSeats(allItems, heroItems, limit, referenceDate, days) {
    const heroList = heroItems || [];
    const heroKeys = new Set(heroList.map(articleKey));
    const remaining = sortByDateDesc(allItems).filter((item) => !heroKeys.has(articleKey(item)));
    const cap = Math.max(0, limit | 0);
    const picks = [];
    const pickedKeys = new Set();
    const heroSources = new Set(heroList.map(sourceOf).filter(Boolean));
    const heroInsts = new Set(heroList.map(institutionOf).filter(Boolean));
    const briefSources = new Set();
    const briefInsts = new Set();
    const horizon = sourcesInHorizon(allItems, referenceDate, days);

    const take = (item) => {
      picks.push(item);
      pickedKeys.add(articleKey(item));
      const src = sourceOf(item);
      const inst = institutionOf(item);
      if (src) briefSources.add(src);
      if (inst) briefInsts.add(inst);
    };

    for (const item of remaining) {
      if (picks.length >= cap) break;
      const src = sourceOf(item);
      const inst = institutionOf(item);
      if (!src || !horizon.has(src)) continue;
      if (heroSources.has(src) || briefSources.has(src)) continue;
      if (inst && (heroInsts.has(inst) || briefInsts.has(inst))) continue;
      take(item);
    }

    if (picks.length < cap) {
      for (const item of remaining) {
        if (picks.length >= cap) break;
        if (pickedKeys.has(articleKey(item))) continue;
        const src = sourceOf(item);
        if (!src || !horizon.has(src)) continue;
        if (heroSources.has(src) || briefSources.has(src)) continue;
        take(item);
      }
    }

    if (picks.length < cap) {
      const used = new Set([...heroSources, ...briefSources]);
      const uncovered = hasUncoveredHorizonSource(allItems, remaining, used, referenceDate, days);
      if (!uncovered) {
        const perSrc = new Map();
        for (const item of [...heroList, ...picks]) {
          const src = sourceOf(item);
          if (src) perSrc.set(src, (perSrc.get(src) || 0) + 1);
        }
        for (const item of remaining) {
          if (picks.length >= cap) break;
          if (pickedKeys.has(articleKey(item))) continue;
          const src = sourceOf(item);
          // Deuxième titre seulement : une source muette (0 siège) ne passe pas ici.
          if (!src || (perSrc.get(src) || 0) !== 1) continue;
          take(item);
          perSrc.set(src, (perSrc.get(src) || 0) + 1);
        }
      }
    }

    return picks;
  }

  /**
   * Première page : réserver le dernier article de chaque source de
   * l’horizon, puis compléter. La page est reclassée par date. Elle
   * grandit seulement si les sources réservées dépassent `firstSize`.
   */
  function reserveFirstPage(items, firstSize, referenceDate, days) {
    const sorted = sortByDateDesc(items);
    const size = Math.max(0, firstSize | 0);
    const reserved = latestPerHorizonSource(sorted, referenceDate, days);
    if (reserved.length >= size) return sortByDateDesc(reserved);
    const keys = new Set(reserved.map(articleKey));
    const page = reserved.slice();
    for (const item of sorted) {
      if (page.length >= size) break;
      const key = articleKey(item);
      if (!key || keys.has(key)) continue;
      page.push(item);
      keys.add(key);
    }
    return sortByDateDesc(page);
  }

  return {
    DIVERSITY_HORIZON_DAYS,
    DAY_MS,
    itemTime,
    sortByDateDesc,
    sourceOf,
    institutionOf,
    articleKey,
    sourcesInHorizon,
    latestPerHorizonSource,
    pickHeroSeats,
    pickBriefSeats,
    hasUncoveredHorizonSource,
    reserveFirstPage,
  };
}));

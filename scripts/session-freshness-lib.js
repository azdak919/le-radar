/**
 * LE RADAR — règle universelle de fraîcheur des articles (sessions universitaires QC).
 *
 * Règle (tous les articles, bots + UI) :
 *  1. Inclure la session en cours + les 2 précédentes
 *     → sur un cycle : automne + hiver + été
 *  2. L’été est toujours dans le cycle (session mai–août)
 *  3. Septembre = mois de grâce en début d’automne :
 *     on garde aussi l’automne d’avant tant que la nouvelle session
 *     n’a pas vraiment démarré (peu de publications encore)
 *
 * Calendrier des débuts de session :
 *  - Automne : 1er septembre
 *  - Hiver   : 1er janvier
 *  - Été     : 1er mai
 *
 * Utilisé par :
 *  - scripts/source-retention-lib.js (Node : fetch-news, workers, QC…)
 *  - app.js (navigateur : filtrage / vedettes / en bref)
 *
 * UMD : require() Node ou window.RadarSessionFreshness en navigateur.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RadarSessionFreshness = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 3 sessions = année universitaire typique (A+H+É ou H+É+A…). */
  const FRESHNESS_SESSION_COUNT = 3;
  /** Sessions « en arrière » en plus de la courante (2 → total 3). */
  const CONTINGENCY_MAX_SESSIONS_BACK = FRESHNESS_SESSION_COUNT - 1;
  /** Septembre (0-index) : mois de grâce pour l’automne précédent. */
  const SEPTEMBER_AUTUMN_GRACE_MONTH = 8;

  function getCurrentUniversitySessionStart(referenceDate = new Date()) {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    if (month >= 8) return new Date(year, 8, 1); // automne
    if (month >= 4) return new Date(year, 4, 1); // été
    return new Date(year, 0, 1); // hiver
  }

  function getPriorUniversitySessionStart(sessionStart) {
    const year = sessionStart.getFullYear();
    const month = sessionStart.getMonth();
    if (month === 8) return new Date(year, 4, 1); // automne → été
    if (month === 4) return new Date(year, 0, 1); // été → hiver
    return new Date(year - 1, 8, 1); // hiver → automne précédent
  }

  function getUniversitySessionStart(referenceDate = new Date(), sessionsBack = 0) {
    let start = getCurrentUniversitySessionStart(referenceDate);
    for (let i = 0; i < sessionsBack; i += 1) {
      start = getPriorUniversitySessionStart(start);
    }
    return start;
  }

  /**
   * Bande [start, end] d’une session.
   * sessionsBack 0 = session en cours (jusqu’à referenceDate).
   */
  function getUniversitySessionBand(referenceDate = new Date(), sessionsBack = 0) {
    const start = getUniversitySessionStart(referenceDate, sessionsBack);
    const end = sessionsBack === 0
      ? referenceDate
      : new Date(getUniversitySessionStart(referenceDate, sessionsBack - 1).getTime() - 1);
    return { start, end };
  }

  /** Septembre : grâce avant de retirer l’automne d’avant. */
  function isSeptemberAutumnGrace(referenceDate = new Date()) {
    return referenceDate.getMonth() === SEPTEMBER_AUTUMN_GRACE_MONTH;
  }

  /** Alias UI historique. */
  function isAutumnGracePeriod(referenceDate = new Date()) {
    return isSeptemberAutumnGrace(referenceDate);
  }

  /** Max sessionsBack inclus dans la fenêtre (2, ou 3 en septembre). */
  function freshnessMaxSessionsBack(referenceDate = new Date()) {
    let max = CONTINGENCY_MAX_SESSIONS_BACK;
    if (isSeptemberAutumnGrace(referenceDate)) max += 1;
    return max;
  }

  function isPublishedOnOrBefore(item, referenceDate = new Date()) {
    const published = new Date(item?.date || 0);
    return Number.isFinite(published.getTime()) && published.getTime() <= referenceDate.getTime();
  }

  function isWithinUniversitySessionBand(item, referenceDate = new Date(), sessionsBack = 0) {
    const published = new Date(item?.date || 0);
    if (!Number.isFinite(published.getTime())) return false;
    const { start, end } = getUniversitySessionBand(referenceDate, sessionsBack);
    const t = published.getTime();
    return t >= start.getTime() && t <= end.getTime();
  }

  /** True si l’article tombe dans la fenêtre universelle de fraîcheur. */
  function isWithinFreshnessWindow(item, referenceDate = new Date()) {
    if (!isPublishedOnOrBefore(item, referenceDate)) return false;
    const maxBack = freshnessMaxSessionsBack(referenceDate);
    for (let band = 0; band <= maxBack; band += 1) {
      if (isWithinUniversitySessionBand(item, referenceDate, band)) return true;
    }
    return false;
  }

  function filterFreshItems(items = [], referenceDate = new Date()) {
    return items.filter((item) => isWithinFreshnessWindow(item, referenceDate));
  }

  function pruneToFreshWindow(items = [], referenceDate = new Date()) {
    return filterFreshItems(items, referenceDate);
  }

  /** Début de la plus vieille session encore dans la fenêtre. */
  function freshnessWindowStart(referenceDate = new Date()) {
    return getUniversitySessionStart(referenceDate, freshnessMaxSessionsBack(referenceDate));
  }

  return {
    FRESHNESS_SESSION_COUNT,
    CONTINGENCY_MAX_SESSIONS_BACK,
    SEPTEMBER_AUTUMN_GRACE_MONTH,
    getCurrentUniversitySessionStart,
    getPriorUniversitySessionStart,
    getUniversitySessionStart,
    getUniversitySessionBand,
    isSeptemberAutumnGrace,
    isAutumnGracePeriod,
    freshnessMaxSessionsBack,
    isPublishedOnOrBefore,
    isWithinUniversitySessionBand,
    isWithinFreshnessWindow,
    filterFreshItems,
    pruneToFreshWindow,
    freshnessWindowStart,
  };
}));

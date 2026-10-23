/**
 * LE RADAR — règle universelle de fraîcheur des articles (sessions universitaires QC).
 *
 * Règle d’AFFICHAGE des articles (fil, une, En bref, pages SEO, flux) :
 *  - un article est montré s’il est publié pendant la session en cours
 *    OU depuis au plus NEWS_MAX_AGE_DAYS jours (chevauchement de début
 *    de session : début septembre, on voit encore la fin de l’été) ;
 *  - aucune exception par source : un journal muet depuis une session
 *    passée n’affiche rien (pas de « dernier article » de repli).
 *
 * Cycle de 3 sessions (en cours + 2 précédentes, grâce de septembre) :
 *  conservé SEULEMENT pour le cycle de vie des sources (ok/stale/dead,
 *  retrait du registre) et les résultats sportifs passés
 *  (isWithinSessionCycleWindow / sessionCycleWindowStart).
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
  /** Âge max d’un article hors session en cours (chevauchement de rentrée). */
  const NEWS_MAX_AGE_DAYS = 45;
  const DAY_MS = 86400000;

  function getCurrentUniversitySessionStart(referenceDate = new Date()) {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    if (month >= 8) return new Date(year, 8, 1); // automne
    if (month >= 4) return new Date(year, 4, 1); // été
    return new Date(year, 0, 1); // hiver
  }

  /**
   * Id de session univ. QC (data-uni-session). Le fond du syntoniseur
   * ne lit plus cet id (été #101816 toute l’année).
   * @returns {'automne'|'hiver'|'ete'}
   */
  function getCurrentUniversitySessionId(referenceDate = new Date()) {
    const month = referenceDate.getMonth();
    if (month >= 8) return 'automne';
    if (month >= 4) return 'ete';
    return 'hiver';
  }

  /**
   * Pose html[data-uni-session]. Calendrier : automne 1er sept ·
   * hiver 1er janv · été 1er mai. Le CSS du synthé n’en dépend plus.
   */
  function applyUniversitySessionTheme(referenceDate = new Date()) {
    const id = getCurrentUniversitySessionId(referenceDate);
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-uni-session', id);
    }
    return id;
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

  /** Cycle 3 sessions (+ grâce sept.) : sources et résultats sportifs. */
  function isWithinSessionCycleWindow(item, referenceDate = new Date()) {
    if (!isPublishedOnOrBefore(item, referenceDate)) return false;
    const maxBack = freshnessMaxSessionsBack(referenceDate);
    for (let band = 0; band <= maxBack; band += 1) {
      if (isWithinUniversitySessionBand(item, referenceDate, band)) return true;
    }
    return false;
  }

  /** Début de la plus vieille session du cycle (cycle de vie des sources). */
  function sessionCycleWindowStart(referenceDate = new Date()) {
    return getUniversitySessionStart(referenceDate, freshnessMaxSessionsBack(referenceDate));
  }

  /** Début de la fenêtre d’affichage : min(début de session, maintenant − 45 j). */
  function freshnessWindowStart(referenceDate = new Date()) {
    const sessionStart = getCurrentUniversitySessionStart(referenceDate).getTime();
    const ageStart = referenceDate.getTime() - NEWS_MAX_AGE_DAYS * DAY_MS;
    return new Date(Math.min(sessionStart, ageStart));
  }

  /** True si l’article est affichable (session en cours ou ≤ 45 jours). */
  function isWithinFreshnessWindow(item, referenceDate = new Date()) {
    if (!isPublishedOnOrBefore(item, referenceDate)) return false;
    const t = new Date(item?.date || 0).getTime();
    return t >= freshnessWindowStart(referenceDate).getTime();
  }

  function filterFreshItems(items = [], referenceDate = new Date()) {
    return items.filter((item) => isWithinFreshnessWindow(item, referenceDate));
  }

  function pruneToFreshWindow(items = [], referenceDate = new Date()) {
    return filterFreshItems(items, referenceDate);
  }

  const api = {
    FRESHNESS_SESSION_COUNT,
    CONTINGENCY_MAX_SESSIONS_BACK,
    SEPTEMBER_AUTUMN_GRACE_MONTH,
    NEWS_MAX_AGE_DAYS,
    isWithinSessionCycleWindow,
    sessionCycleWindowStart,
    getCurrentUniversitySessionStart,
    getCurrentUniversitySessionId,
    applyUniversitySessionTheme,
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

  // Navigateur : pose data-uni-session dès le chargement du script (defer).
  if (typeof document !== 'undefined' && document.documentElement) {
    try {
      applyUniversitySessionTheme();
    } catch (_) { /* ignore */ }
  }

  return api;
}));

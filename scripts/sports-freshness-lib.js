/**
 * LE-RADAR / LE-KIOSQUE — fraîcheur des scores (verdict focus-group B).
 *
 * Deux couches, volontairement distinctes :
 *
 * 1) Banque `/sports/` + `sports.json` (prune) :
 *    - passés = session-freshness-lib (session en cours + 2 précédentes, grâce sept.)
 *    - hors fenêtre : au plus 1 lastGame, flag priorSeason
 *    - à venir = ≥ aujourd’hui civil Toronto, session en cours + 1 suivante
 *
 * 2) Mât (affichage) — jours civils America/Toronto, pas de filet glissant h :
 *    - CTA : résultats d’aujourd’hui et d’hier
 *    - puces : résultats jusqu’à 5 j civils d’âge (0 = aujourd’hui, 5 = il y a 5 j)
 *      Un dimanche 17 h reste le vendredi soir (l’ancien 5×24 h le faisait tomber).
 *
 * UMD : require() Node ou window.RadarSportsFreshness en navigateur.
 * Dépend de session-freshness-lib (RadarSessionFreshness).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./session-freshness-lib'));
  } else {
    root.RadarSportsFreshness = factory(root.RadarSessionFreshness);
  }
}(typeof self !== 'undefined' ? self : this, function (SF) {
  'use strict';

  if (!SF) {
    throw new Error('sports-freshness-lib requires session-freshness-lib / RadarSessionFreshness');
  }

  function parseGameDay(gameOrDate) {
    const raw = typeof gameOrDate === 'string'
      ? gameOrDate
      : (gameOrDate && gameOrDate.date) || '';
    const day = String(raw).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const t = Date.parse(`${day}T12:00:00`);
    return Number.isFinite(t) ? new Date(t) : null;
  }

  function dayKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Mât — CTA : aujourd’hui (0) + hier (1).
   * Puces : jusqu’à 5 j civils d’âge. Pas 7×24 h (override FG 2026-08-11) ni 5×24 h.
   */
  const MASTHEAD_CTA_RESULT_MAX_DAYS_AGO = 1;
  const MASTHEAD_CHIP_RESULT_MAX_DAYS_AGO = 5;

  /** Jour civil America/Toronto (GitHub Actions = UTC). */
  function torontoDayKey(msOrDate = Date.now()) {
    const d = msOrDate instanceof Date ? msOrDate : new Date(msOrDate);
    if (!Number.isFinite(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    } catch {
      return dayKey(d);
    }
  }

  /** Début de la session universitaire suivante (A→H, H→É, É→A). */
  function getNextUniversitySessionStart(sessionStart) {
    const year = sessionStart.getFullYear();
    const month = sessionStart.getMonth();
    if (month === 0) return new Date(year, 4, 1); // hiver → été
    if (month === 4) return new Date(year, 8, 1); // été → automne
    return new Date(year + 1, 0, 1); // automne → hiver
  }

  /** Fin inclusive de « session courante + 1 suivante ». */
  function nextGameHorizonEnd(referenceDate = new Date()) {
    const currentStart = SF.getCurrentUniversitySessionStart(referenceDate);
    const nextStart = getNextUniversitySessionStart(currentStart);
    const afterNext = getNextUniversitySessionStart(nextStart);
    return new Date(afterNext.getTime() - 1);
  }

  /** YYYY-MM-DD du match tel que stocké (jour civil QC), pas un parse d’heure local. */
  function gameCivilDayKey(gameOrDate) {
    if (typeof gameOrDate === 'string') {
      const day = String(gameOrDate).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
    }
    const day = String((gameOrDate && gameOrDate.date) || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
  }

  /**
   * Écart en jours civils Toronto (0 = aujourd’hui, 1 = hier).
   * Négatif si le match est à venir. +∞ si la date est illisible.
   */
  function civilDaysAgo(game, referenceDate = new Date()) {
    const day = gameCivilDayKey(game);
    const today = torontoDayKey(referenceDate);
    if (!day || !today) return Number.POSITIVE_INFINITY;
    const a = Date.parse(`${day}T12:00:00Z`);
    const b = Date.parse(`${today}T12:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
    return Math.round((b - a) / 86400000);
  }

  function isMastheadCtaResult(game, referenceDate = new Date()) {
    const days = civilDaysAgo(game, referenceDate);
    return Number.isFinite(days) && days >= 0 && days <= MASTHEAD_CTA_RESULT_MAX_DAYS_AGO;
  }

  function isMastheadChipResult(game, referenceDate = new Date()) {
    const days = civilDaysAgo(game, referenceDate);
    return Number.isFinite(days) && days >= 0 && days <= MASTHEAD_CHIP_RESULT_MAX_DAYS_AGO;
  }

  function isPastGameFresh(game, referenceDate = new Date()) {
    const d = parseGameDay(game);
    if (!d) return false;
    return SF.isWithinFreshnessWindow({ date: dayKey(d) }, referenceDate);
  }

  function isPastGameKeepable(game, referenceDate = new Date()) {
    const d = parseGameDay(game);
    if (!d) return false;
    // Pas de résultat « futur » dans lastGame.
    if (d.getTime() > referenceDate.getTime()) return false;
    return true;
  }

  /**
   * nextGame admissible : ≥ aujourd’hui et ≤ fin de la session suivante.
   */
  function isNextGameInHorizon(game, referenceDate = new Date()) {
    const d = parseGameDay(game);
    if (!d) return false;
    const todayKey = torontoDayKey(referenceDate);
    const gameKey = String(game?.date || '').slice(0, 10) || dayKey(d);
    if (gameKey < todayKey) return false;
    const end = nextGameHorizonEnd(referenceDate);
    return d.getTime() <= end.getTime();
  }

  function sortPastDesc(a, b) {
    return String(b?.date || '').localeCompare(String(a?.date || ''));
  }

  /**
   * Filtre une liste de résultats passés.
   * @returns {{ games: object[], priorSeason: boolean }}
   */
  function prunePastGames(gamesList = [], referenceDate = new Date()) {
    const source = Array.isArray(gamesList) ? gamesList : [];
    const list = source
      .filter((g) => isPastGameKeepable(g, referenceDate))
      .slice()
      .sort(sortPastDesc);

    const fresh = list.filter((g) => isPastGameFresh(g, referenceDate));
    if (fresh.length) {
      return {
        games: fresh.map((g) => ({ ...g, priorSeason: false })),
        priorSeason: false,
      };
    }
    // Hors fenêtre : au plus 1 (le plus récent).
    if (list.length) {
      return {
        games: [{ ...list[0], priorSeason: true }],
        priorSeason: true,
      };
    }
    return { games: [], priorSeason: false };
  }

  function pruneNextGame(game, referenceDate = new Date()) {
    if (!game) return null;
    return isNextGameInHorizon(game, referenceDate) ? { ...game } : null;
  }

  function pruneNextGames(list = [], referenceDate = new Date()) {
    return (Array.isArray(list) ? list : [])
      .filter((g) => isNextGameInHorizon(g, referenceDate))
      .slice()
      .sort((a, b) => String(a?.date || '').localeCompare(String(b?.date || '')));
  }

  /**
   * Applique la règle B à une formation sports.json / payload kiosque.
   * Ne mute pas l’entrée d’origine.
   */
  function pruneSportsTeam(team, referenceDate = new Date()) {
    if (!team || typeof team !== 'object') return team;
    const out = { ...team };

    if (Array.isArray(team.results)) {
      const pruned = prunePastGames(team.results, referenceDate);
      out.results = pruned.games;
    }

    if (team.lastGame) {
      const pruned = prunePastGames([team.lastGame], referenceDate);
      out.lastGame = pruned.games[0] || null;
      if (out.lastGame) {
        out.lastGamePriorSeason = !!out.lastGame.priorSeason;
      } else {
        delete out.lastGamePriorSeason;
      }
    }

    if (team.nextGame) {
      out.nextGame = pruneNextGame(team.nextGame, referenceDate);
    }
    if (Array.isArray(team.nextGames)) {
      out.nextGames = pruneNextGames(team.nextGames, referenceDate);
    }

    // Équipe sans aucun signal après prune : on la garde (carte + empty),
    // le consommateur décide de l’afficher.
    return out;
  }

  /**
   * Prune d’un payload complet { teams: {}|[], results?, nextGame?, nextGames? }.
   */
  function pruneSportsPayload(data, referenceDate = new Date()) {
    if (!data || typeof data !== 'object') return data;
    const out = { ...data, sportsFreshness: { rule: 'B', referenceDate: referenceDate.toISOString() } };

    if (data.teams && typeof data.teams === 'object' && !Array.isArray(data.teams)) {
      const map = {};
      for (const [id, team] of Object.entries(data.teams)) {
        map[id] = pruneSportsTeam(team, referenceDate);
      }
      out.teams = map;
    } else if (Array.isArray(data.teams)) {
      out.teams = data.teams.map((t) => pruneSportsTeam(t, referenceDate));
    }

    if (Array.isArray(data.results)) {
      out.results = prunePastGames(data.results, referenceDate).games;
    }
    if (data.nextGame) {
      out.nextGame = pruneNextGame(data.nextGame, referenceDate);
    }
    if (Array.isArray(data.nextGames)) {
      out.nextGames = pruneNextGames(data.nextGames, referenceDate);
    }
    return out;
  }

  /**
   * Référence de prune pour une démo éditoriale (LE-KIOSQUE).
   * demoAsOf (ISO date) > now.
   */
  function resolveReferenceDate(opts = {}) {
    if (opts.demoAsOf) {
      const d = parseGameDay(opts.demoAsOf) || new Date(opts.demoAsOf);
      if (d && Number.isFinite(d.getTime())) return d;
    }
    if (opts.referenceDate instanceof Date && Number.isFinite(opts.referenceDate.getTime())) {
      return opts.referenceDate;
    }
    if (opts.referenceDate) {
      const d = new Date(opts.referenceDate);
      if (Number.isFinite(d.getTime())) return d;
    }
    return new Date();
  }

  return {
    MASTHEAD_CTA_RESULT_MAX_DAYS_AGO,
    MASTHEAD_CHIP_RESULT_MAX_DAYS_AGO,
    getNextUniversitySessionStart,
    nextGameHorizonEnd,
    parseGameDay,
    dayKey,
    torontoDayKey,
    gameCivilDayKey,
    civilDaysAgo,
    isMastheadCtaResult,
    isMastheadChipResult,
    isPastGameFresh,
    isPastGameKeepable,
    isNextGameInHorizon,
    prunePastGames,
    pruneNextGame,
    pruneNextGames,
    pruneSportsTeam,
    pruneSportsPayload,
    resolveReferenceDate,
  };
}));

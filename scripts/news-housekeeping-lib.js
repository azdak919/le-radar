/**
 * LE RADAR — avis de « ménage » des médias étudiants (fermeture estivale, etc.).
 *
 * En été (1er mai → ~25 août, America/Toronto) : ces avis restent visibles
 * uniquement dans « En bref » (pas à la une / Suite du fil).
 * Hors de cette fenêtre (sessions d’automne et d’hiver) : exclus du fil.
 *
 * UMD : require() Node ou window.RadarNewsHousekeeping en navigateur.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RadarNewsHousekeeping = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Début de la fenêtre d’affichage estivale (mois 1–12, jour). */
  const SUMMER_HOUSEKEEPING_START = Object.freeze({ month: 5, day: 1 });
  /**
   * Fin inclusive — rentrée typique cégeps/univ. QC (~fin août).
   * Configurable : changer day/month sans toucher le reste de la logique.
   */
  const SUMMER_HOUSEKEEPING_END = Object.freeze({ month: 8, day: 25 });

  /**
   * Signaux forts dans le titre (fermeture / pause / retour de publication).
   * Portée volontairement étroite — pas les appels à contribution ni le mot « été » seul.
   */
  const HOUSEKEEPING_TITLE_RES = Object.freeze([
    /\bferme\s+ses\s+portes\b/i,
    /\bfermeture\s+estivale\b/i,
    /\bfermeture\s+du\s+(?:journal|m[eé]dia|campus|site)\b/i,
    /\bpause\s+estivale\b/i,
    /\brel[aâ]che\s+estivale\b/i,
    /\bhiatus\b/i,
    /\bde\s+retour\s+en\s+septembre\b/i,
    /\bde\s+retour\s+[aà]\s+l['’]?automne\b/i,
    /\bclosed\s+for\s+(?:the\s+)?summer\b/i,
    /\bsummer\s+(?:hiatus|closure)\b/i,
    /\b(?:on|taking)\s+(?:a\s+)?summer\s+break\b/i,
    /\bback\s+in\s+september\b/i,
    /\bpublication\s+(?:pause|hiatus)\b/i,
  ]);

  /**
   * Titre ambigu (« saison estivale », « pour l’été ») + confirmation dans
   * le chapô : suspension / fermeture / retour en septembre.
   */
  const HOUSEKEEPING_SOFT_TITLE_RE =
    /\b(?:saison\s+estivale|pour\s+l['’]?[eé]t[eé]|until\s+(?:the\s+)?fall|for\s+the\s+summer)\b/i;
  const HOUSEKEEPING_EXCERPT_CONFIRM_RE =
    /\b(?:fermeture|ferme\s+ses\s+portes|activit[eé]s?\s+(?:seront\s+)?suspend|pause\s+estivale|rel[aâ]che|hiatus|de\s+retour\s+en\s+septembre|closed\s+for\s+(?:the\s+)?summer|summer\s+(?:hiatus|break)|back\s+in\s+september)\b/i;

  function torontoYmd(referenceDate = new Date()) {
    const d = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
    if (!Number.isFinite(d.getTime())) {
      return { year: 0, month: 0, day: 0 };
    }
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d);
      const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
      return { year: get('year'), month: get('month'), day: get('day') };
    } catch {
      return {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
      };
    }
  }

  /** Jour de l’année approximatif (mois/jour) pour comparer sans fuseau. */
  function monthDayKey(month, day) {
    return month * 100 + day;
  }

  /**
   * True du 1er mai au 25 août inclus (calendrier civil America/Toronto).
   */
  function isSummerHousekeepingWindow(referenceDate = new Date()) {
    const { month, day } = torontoYmd(referenceDate);
    if (!month || !day) return false;
    const key = monthDayKey(month, day);
    const start = monthDayKey(SUMMER_HOUSEKEEPING_START.month, SUMMER_HOUSEKEEPING_START.day);
    const end = monthDayKey(SUMMER_HOUSEKEEPING_END.month, SUMMER_HOUSEKEEPING_END.day);
    return key >= start && key <= end;
  }

  function itemText(item = {}) {
    return {
      title: String(item.title || ''),
      excerpt: String(item.excerpt || item.leadExcerpt || ''),
    };
  }

  /** True si l’article est un avis de fermeture / pause / retour de publication. */
  function isHousekeepingNotice(item = {}) {
    const { title, excerpt } = itemText(item);
    if (!title.trim()) return false;
    for (const re of HOUSEKEEPING_TITLE_RES) {
      if (re.test(title)) return true;
    }
    if (HOUSEKEEPING_SOFT_TITLE_RE.test(title) && HOUSEKEEPING_EXCERPT_CONFIRM_RE.test(excerpt)) {
      return true;
    }
    return false;
  }

  /**
   * @returns {'pass'|'brief'|'exclude'}
   *  - pass    : article normal
   *  - brief   : avis de ménage, fenêtre été → En bref seulement
   *  - exclude : avis de ménage hors fenêtre → retiré du fil
   */
  function housekeepingDisposition(item = {}, referenceDate = new Date()) {
    if (!isHousekeepingNotice(item)) return 'pass';
    return isSummerHousekeepingWindow(referenceDate) ? 'brief' : 'exclude';
  }

  /** Retire les avis exclus hors saison (conserve pass + brief). */
  function filterHousekeepingForDisplay(items = [], referenceDate = new Date()) {
    return items.filter((item) => housekeepingDisposition(item, referenceDate) !== 'exclude');
  }

  /** Avis à forcer dans En bref (jamais une / Suite du fil). */
  function housekeepingBriefItems(items = [], referenceDate = new Date()) {
    return items.filter((item) => housekeepingDisposition(item, referenceDate) === 'brief');
  }

  /** Pool « normal » (ni exclu, ni forcé En bref). */
  function housekeepingNormalItems(items = [], referenceDate = new Date()) {
    return items.filter((item) => housekeepingDisposition(item, referenceDate) === 'pass');
  }

  return {
    SUMMER_HOUSEKEEPING_START,
    SUMMER_HOUSEKEEPING_END,
    HOUSEKEEPING_TITLE_RES,
    isSummerHousekeepingWindow,
    isHousekeepingNotice,
    housekeepingDisposition,
    filterHousekeepingForDisplay,
    housekeepingBriefItems,
    housekeepingNormalItems,
    torontoYmd,
  };
}));

/**
 * LE RADAR — avis de « ménage » des médias étudiants (fermeture estivale, etc.).
 *
 * Ne vise QUE l’auto-annonce d’une pause de publication par le média lui-même
 * (ex. « Le Zone Campus ferme ses portes… »), pas une fermeture de café,
 * d’usine, de cégep ou d’un autre établissement rapportée par le journal.
 *
 * Conditions cumulatives :
 *  1. Source campus (type universite|cegep, ou équivalent)
 *  2. Motif de fermeture / pause / retour
 *  3. Auto-référence : nom du média dans titre/extrait, ou formulation
 *     à la 1ʳᵉ personne / « le journal » / « chers lecteurs »…
 *
 * En été (1er mai → ~25 août, America/Toronto) : visibles seulement en « En bref ».
 * Hors fenêtre : exclus du fil.
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

  const SUMMER_HOUSEKEEPING_START = Object.freeze({ month: 5, day: 1 });
  /** Fin inclusive — rentrée typique cégeps/univ. QC (~fin août). */
  const SUMMER_HOUSEKEEPING_END = Object.freeze({ month: 8, day: 25 });

  /** Types de sources médias étudiants dans news.json / news-sources.json. */
  const CAMPUS_MEDIA_TYPES = Object.freeze(new Set(['universite', 'cegep', 'college']));

  /**
   * Signaux de fermeture / pause / retour de publication (titre).
   * Insuffisants seuls — exigent aussi une auto-référence (voir ci-dessous).
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

  const HOUSEKEEPING_SOFT_TITLE_RE =
    /\b(?:saison\s+estivale|pour\s+l['’]?[eé]t[eé]|until\s+(?:the\s+)?fall|for\s+the\s+summer)\b/i;
  const HOUSEKEEPING_EXCERPT_CONFIRM_RE =
    /\b(?:fermeture|ferme\s+ses\s+portes|activit[eé]s?\s+(?:seront\s+)?suspend|pause\s+estivale|rel[aâ]che|hiatus|de\s+retour\s+en\s+septembre|closed\s+for\s+(?:the\s+)?summer|summer\s+(?:hiatus|break)|back\s+in\s+september)\b/i;

  /**
   * Formulations d’auto-annonce (le média parle de lui-même).
   * « le journal » / « our paper » collés à un motif de pause = auto-réf.
   */
  const SELF_REF_PHRASE_RE =
    /\b(?:chers?\s+lecteurs?(?:\s+et\s+lectrices)?|ch[eè]res?\s+lectrices|nos\s+lecteurs?(?:\s+et\s+lectrices)?|notre\s+(?:journal|m[eé]dia|équipe|r[eé]daction|publication)|le\s+journal|du\s+journal|notre\s+pause|nous\s+tenons\s+[aà]\s+vous\s+annoncer|nous\s+(?:serons|sommes)\s+(?:de\s+retour|absents)|dear\s+readers?|our\s+(?:newspaper|paper|team|staff|readers?)|this\s+(?:newspaper|paper|publication))\b/i;

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

  function monthDayKey(month, day) {
    return month * 100 + day;
  }

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

  /** Médias étudiants du registre (univ / cégep / collège). */
  function isCampusMediaSource(item = {}) {
    const type = String(item.type || '').toLowerCase().trim();
    if (CAMPUS_MEDIA_TYPES.has(type)) return true;
    // Fil home : les items ont toujours un type ; filet si métadonnée absente
    // mais source renseignée (tests / flux partiels).
    if (!type && String(item.source || '').trim()) return true;
    return false;
  }

  /** Variantes du nom de source pour détection dans titre/extrait. */
  function sourceNameAliases(source = '') {
    const raw = String(source || '').replace(/\s+/g, ' ').trim();
    if (!raw) return [];
    const aliases = new Set([raw]);
    const stripped = raw
      .replace(/^(?:le|la|les|l['’]|the|el|los|las)\s+/i, '')
      .replace(/^l['’]/i, '')
      .trim();
    if (stripped && stripped.toLowerCase() !== raw.toLowerCase()) {
      aliases.add(stripped);
      aliases.add(`Le ${stripped}`);
      aliases.add(`La ${stripped}`);
      aliases.add(`The ${stripped}`);
    }
    // « Zone Campus » ↔ « Le Zone Campus »
    if (!/^(?:le|la|the)\s+/i.test(raw) && stripped) {
      aliases.add(`Le ${stripped}`);
    }
    return [...aliases].filter((a) => a.length >= 3);
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** True si le texte cite le média source (nom / short name). */
  function textMentionsSource(text = '', source = '') {
    const hay = String(text || '');
    if (!hay.trim()) return false;
    for (const alias of sourceNameAliases(source)) {
      const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(alias)}(?=[^\\p{L}\\p{N}]|$)`, 'iu');
      if (re.test(hay)) return true;
    }
    return false;
  }

  function hasSelfReference(item = {}) {
    const { title, excerpt } = itemText(item);
    const blob = `${title}\n${excerpt}`;
    if (textMentionsSource(blob, item.source)) return true;
    if (SELF_REF_PHRASE_RE.test(blob)) return true;
    return false;
  }

  function hasClosurePattern(item = {}) {
    const { title, excerpt } = itemText(item);
    if (!title.trim()) return false;
    for (const re of HOUSEKEEPING_TITLE_RES) {
      if (re.test(title)) return true;
    }
    if (HOUSEKEEPING_SOFT_TITLE_RE.test(title) && HOUSEKEEPING_EXCERPT_CONFIRM_RE.test(excerpt)) {
      return true;
    }
    // Motif parfois seulement dans l’extrait (titre = nom du média).
    if (HOUSEKEEPING_EXCERPT_CONFIRM_RE.test(excerpt) && hasSelfReference(item)) {
      // évite double-comptage : l’appelant vérifie déjà self-ref ; ici on
      // n’utilise cette branche que si le titre est une auto-réf nue.
      if (textMentionsSource(title, item.source) || SELF_REF_PHRASE_RE.test(title)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Avis de pause de publication du média lui-même.
   * campus + motif de fermeture + auto-référence.
   */
  function isHousekeepingNotice(item = {}) {
    if (!isCampusMediaSource(item)) return false;
    if (!hasClosurePattern(item)) return false;
    if (!hasSelfReference(item)) return false;
    return true;
  }

  /**
   * @returns {'pass'|'brief'|'exclude'}
   */
  function housekeepingDisposition(item = {}, referenceDate = new Date()) {
    if (!isHousekeepingNotice(item)) return 'pass';
    return isSummerHousekeepingWindow(referenceDate) ? 'brief' : 'exclude';
  }

  function filterHousekeepingForDisplay(items = [], referenceDate = new Date()) {
    return items.filter((item) => housekeepingDisposition(item, referenceDate) !== 'exclude');
  }

  function housekeepingBriefItems(items = [], referenceDate = new Date()) {
    return items.filter((item) => housekeepingDisposition(item, referenceDate) === 'brief');
  }

  function housekeepingNormalItems(items = [], referenceDate = new Date()) {
    return items.filter((item) => housekeepingDisposition(item, referenceDate) === 'pass');
  }

  return {
    SUMMER_HOUSEKEEPING_START,
    SUMMER_HOUSEKEEPING_END,
    CAMPUS_MEDIA_TYPES,
    HOUSEKEEPING_TITLE_RES,
    isCampusMediaSource,
    sourceNameAliases,
    hasSelfReference,
    hasClosurePattern,
    isSummerHousekeepingWindow,
    isHousekeepingNotice,
    housekeepingDisposition,
    filterHousekeepingForDisplay,
    housekeepingBriefItems,
    housekeepingNormalItems,
    torontoYmd,
  };
}));

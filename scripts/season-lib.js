/**
 * LE RADAR — saisons pour rotation des fonds photo
 *
 * Deux calendriers :
 *  A) 4 saisons météo (Québec méridional) — paysages mât / pomo / campus
 *  B) 6 saisons (calendrier Inuit du Nunavik, usage éducatif courant) —
 *     banque Premières Nations & Inuit
 *
 * Champs photo (optionnels, inférés si absents) :
 *   season   : 'printemps' | 'ete' | 'automne' | 'hiver'
 *   season6  : 'ukiuq' | 'upingaksaaq' | 'upingaaq' | 'aujaq' | 'ukiaqsaaq' | 'ukiaq'
 *
 * UMD : require() Node ou window.RadarSeason en navigateur.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RadarSeason = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** @type {const} */
  const SEASON4 = ['printemps', 'ete', 'automne', 'hiver'];
  /** @type {const} */
  const SEASON6 = ['ukiuq', 'upingaksaaq', 'upingaaq', 'aujaq', 'ukiaqsaaq', 'ukiaq'];

  /**
   * 6 saisons Inuit (Nunavik) — mois approximatifs (calendrier éducatif).
   * Ordre cyclique : ukiuq → … → ukiaq → ukiuq.
   */
  const SEASON6_META = {
    ukiuq: {
      labelFr: 'Ukiuq (plein hiver)',
      months: [11, 0], // déc–jan (0-index : 11=déc, 0=jan)
    },
    upingaksaaq: {
      labelFr: 'Upingaksaaq (pré-printemps)',
      months: [1, 2], // fév–mar
    },
    upingaaq: {
      labelFr: 'Upingaaq (printemps)',
      months: [3, 4], // avr–mai
    },
    aujaq: {
      labelFr: 'Aujaq (été)',
      months: [5, 6], // jun–jul
    },
    ukiaqsaaq: {
      labelFr: 'Ukiaqsaaq (fin d’été / pré-automne)',
      months: [7, 8], // aoû–sep
    },
    ukiaq: {
      labelFr: 'Ukiaq (automne / engelure)',
      months: [9, 10], // oct–nov
    },
  };

  /** Mois 0–11 → saison 4 (météo). */
  function getCurrentSeason4(date = new Date()) {
    const m = date.getMonth();
    if (m >= 2 && m <= 4) return 'printemps'; // mar–mai
    if (m >= 5 && m <= 7) return 'ete'; // jun–aoû
    if (m >= 8 && m <= 10) return 'automne'; // sep–nov
    return 'hiver'; // déc–fév
  }

  /** Mois 0–11 → saison 6 (Nunavik éducatif). */
  function getCurrentSeason6(date = new Date()) {
    const m = date.getMonth();
    for (const id of SEASON6) {
      if (SEASON6_META[id].months.includes(m)) return id;
    }
    return 'aujaq';
  }

  function haystack(item) {
    if (!item) return '';
    if (typeof item === 'string') return item;
    return [
      item.title,
      item.description,
      item.categories,
      item.url,
      item.link,
      item.credit,
      item.season,
      item.season6,
    ]
      .filter(Boolean)
      .join(' ');
  }

  /**
   * Infère la saison visuelle 4 à partir du texte / méta.
   * @returns {string|null}
   */
  function inferSeason4(item) {
    const h = haystack(item);
    if (!h) return null;
    const t = h.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

    // Signaux forts hiver (neige / froid / arctique sans marqueur d’été)
    if (
      /\b(hiver|winter|neige|snow|snowy|glace|ice\b|frozen|givr|blizzard|ski\b|raquette)/i.test(t)
      || /\b(decembre|janvier|fevrier|december|january|february)\b/i.test(t)
      || (
        /\b(arctic|arctique|nunavik|kangiqsualujjuaq|kuujjuaq|kangirsuk|pingualuit|inuksuk)\b/i.test(t)
        && !/\b(ete|summer|aujaq|green|vert|berry|juillet|aout|june|july|august)\b/i.test(t)
      )
    ) {
      // « ice hotel » etc. already winter; « ice out » rare
      if (!/\b(iceout|debacle|break[\s-]?up)\b/i.test(t)) return 'hiver';
    }
    // Automne
    if (
      /\b(automne|autumn|fall\b|foliage|erables?|maple.*(red|orange|fall)|feuilles? (rouges?|d.automne)|indian summer)/i.test(t)
      || /\b(septembre|octobre|novembre|september|october|november)\b/i.test(t)
    ) {
      return 'automne';
    }
    // Printemps
    if (
      /\b(printemps|spring|degel|thaw|bourgeon|tulipe|pre[\s-]?printemps|avril|mars\b|may\b|mai\b)/i.test(t)
      && !/\b(mayday)\b/i.test(t)
    ) {
      return 'printemps';
    }
    // Été
    if (
      /\b(ete|summer|estival|canicule|plage|beach|feuillage vert|juillet|aout|june|july|august|juin)\b/i.test(t)
    ) {
      return 'ete';
    }

    // Date dans le nom de fichier Commons …-2022-09-22…
    const dm = t.match(/(?:^|[^\d])((?:19|20)\d{2})[-_./](0[1-9]|1[0-2])(?:[-_./](0[1-9]|[12]\d|3[01]))?/);
    if (dm) {
      const month = parseInt(dm[2], 10) - 1;
      return getCurrentSeason4(new Date(2000, month, 15));
    }
    // …20250104…
    const compact = t.match(/(?:^|[^\d])((?:19|20)\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
    if (compact) {
      const month = parseInt(compact[2], 10) - 1;
      return getCurrentSeason4(new Date(2000, month, 15));
    }
    return null;
  }

  /**
   * Infère saison 6 (nations / Inuit). Combine mots-clés arctiques + saison 4.
   */
  function inferSeason6(item) {
    const h = haystack(item);
    const t = (h || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

    if (/\b(ukiuq)\b/i.test(t)) return 'ukiuq';
    if (/\b(upingaksaaq|pre[\s-]?printemps arctique)\b/i.test(t)) return 'upingaksaaq';
    if (/\b(upingaaq)\b/i.test(t)) return 'upingaaq';
    if (/\b(aujaq)\b/i.test(t)) return 'aujaq';
    if (/\b(ukiaqsaaq)\b/i.test(t)) return 'ukiaqsaaq';
    if (/\b(ukiaq)\b/i.test(t) && !/\bukiaqsaaq\b/i.test(t)) return 'ukiaq';

    // Arctique / Nunavik / toundra : sans marqueur d’été → plein hiver (évite
    // « Arctic Sunset » neigeux en juillet). Été explicite → aujaq.
    if (/\b(tundra|nunavik|inuit|kangiqsualujjuaq|kuujjuaq|kangirsuk|pingualuit|arctic|arctique|inuksuk)\b/i.test(t)) {
      if (/\b(ete|summer|aujaq|green|vert|berry|airelle|juillet|aout|june|july|august)\b/i.test(t)) {
        return 'aujaq';
      }
      if (/\b(automne|autumn|fall foliage|ukiaq)\b/i.test(t)) return 'ukiaq';
      if (/\b(printemps|spring|degel|upingaaq)\b/i.test(t)) return 'upingaaq';
      // neige / coucher de soleil arctique / défaut froid
      return 'ukiuq';
    }

    const s4 = inferSeason4(item) || null;
    if (!s4) return null;
    // Projection 4 → 6 (approx. pour PN du sud + Inuit sans méta fine)
    const map = {
      hiver: 'ukiuq',
      printemps: 'upingaaq',
      ete: 'aujaq',
      automne: 'ukiaq',
    };
    // Affiner par mois de fichier si dispo
    const dm = t.match(/(?:^|[^\d])((?:19|20)\d{2})[-_./](0[1-9]|1[0-2])/);
    if (dm) {
      const month = parseInt(dm[2], 10) - 1;
      return getCurrentSeason6(new Date(2000, month, 15));
    }
    return map[s4] || null;
  }

  function isNationsItem(item) {
    if (!item) return false;
    if (item.bank === 'nations' || item.culture === 'quebec-nations') return true;
    if (item.nationId || item.nation) return true;
    return false;
  }

  function resolveItemSeason4(item) {
    const explicit = item && item.season;
    if (explicit && SEASON4.includes(String(explicit))) return String(explicit);
    return inferSeason4(item);
  }

  function resolveItemSeason6(item) {
    const explicit = item && item.season6;
    if (explicit && SEASON6.includes(String(explicit))) return String(explicit);
    return inferSeason6(item);
  }

  function adjacentSeason4(id) {
    const i = SEASON4.indexOf(id);
    if (i < 0) return SEASON4.slice();
    return [SEASON4[(i + 3) % 4], SEASON4[(i + 1) % 4]]; // prev, next
  }

  function adjacentSeason6(id) {
    const i = SEASON6.indexOf(id);
    if (i < 0) return SEASON6.slice();
    return [SEASON6[(i + 5) % 6], SEASON6[(i + 1) % 6]];
  }

  function oppositeSeason4(id) {
    const map = {
      hiver: 'ete',
      ete: 'hiver',
      printemps: 'automne',
      automne: 'printemps',
    };
    return map[id] || null;
  }

  /**
   * Filtre un pool pour la saison en cours.
   * Nations → calendrier 6 ; reste → 4.
   * Fallback : adjacent → non-opposé → tout (évite mât vide).
   *
   * @param {object[]} items
   * @param {{ date?: Date, minStrict?: number, minAdjacent?: number }} [opts]
   * @returns {{ items: object[], season4: string, season6: string, tier: string, stats: object }}
   */
  function filterPoolByCurrentSeason(items, opts = {}) {
    const date = opts.date || new Date();
    const minStrict = opts.minStrict ?? 2;
    const minAdjacent = opts.minAdjacent ?? 2;
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    const season4 = getCurrentSeason4(date);
    const season6 = getCurrentSeason6(date);
    const adj4 = new Set(adjacentSeason4(season4));
    const adj6 = new Set(adjacentSeason6(season6));
    const opp4 = oppositeSeason4(season4);

    const annotated = list.map((it) => {
      const nations = isNationsItem(it);
      const s4 = resolveItemSeason4(it);
      const s6 = resolveItemSeason6(it);
      return { it, nations, s4, s6 };
    });

    function pickTier(predicate) {
      return annotated.filter(predicate).map((a) => a.it);
    }

    // Strict : saison courante (ou unknown gardé en soft bonus? non — unknown en adjacent tier)
    const strict = pickTier((a) => {
      if (a.nations) return a.s6 === season6;
      return a.s4 === season4;
    });

    const adjacent = pickTier((a) => {
      if (a.nations) {
        if (a.s6 === season6) return false;
        return !a.s6 || adj6.has(a.s6);
      }
      if (a.s4 === season4) return false;
      return !a.s4 || adj4.has(a.s4);
    });

    // Évite l’opposé (neige en juillet) tant qu’il reste autre chose
    const soft = pickTier((a) => {
      if (a.nations) {
        // pour 6 saisons, « opposé » ≈ +3 dans le cycle
        if (!a.s6) return true;
        const i = SEASON6.indexOf(a.s6);
        const j = SEASON6.indexOf(season6);
        if (i < 0 || j < 0) return true;
        return (i + 3) % 6 !== j;
      }
      if (!a.s4) return true;
      return a.s4 !== opp4;
    });

    let tier = 'strict';
    let out = strict;
    if (out.length < minStrict) {
      out = strict.concat(adjacent);
      tier = 'adjacent';
    }
    if (out.length < minAdjacent) {
      out = soft.length ? soft : list.slice();
      tier = soft.length ? 'soft' : 'all';
    }
    if (!out.length) {
      out = list.slice();
      tier = 'all';
    }

    // Dédup URL
    const seen = new Set();
    out = out.filter((it) => {
      const u = it && it.url;
      if (!u || seen.has(u)) return false;
      seen.add(u);
      return true;
    });

    const stats = {
      total: list.length,
      strict: strict.length,
      adjacent: adjacent.length,
      soft: soft.length,
      chosen: out.length,
      unknown4: annotated.filter((a) => !a.nations && !a.s4).length,
      unknown6: annotated.filter((a) => a.nations && !a.s6).length,
    };

    return { items: out, season4, season6, tier, stats };
  }

  /**
   * Enrichit une entrée banque (mutation douce) avec season / season6 si manquants.
   */
  function enrichPhotoSeasons(photo, profile) {
    if (!photo || typeof photo !== 'object') return photo;
    const nations = profile === 'nations' || isNationsItem(photo);
    if (!photo.season) {
      const s4 = inferSeason4(photo);
      if (s4) photo.season = s4;
    }
    if (nations && !photo.season6) {
      const s6 = inferSeason6(photo);
      if (s6) photo.season6 = s6;
    } else if (!nations && photo.season && !photo.season6) {
      // optionnel : ne pas forcer season6 hors nations
    }
    return photo;
  }

  return {
    SEASON4,
    SEASON6,
    SEASON6_META,
    getCurrentSeason4,
    getCurrentSeason6,
    inferSeason4,
    inferSeason6,
    resolveItemSeason4,
    resolveItemSeason6,
    isNationsItem,
    filterPoolByCurrentSeason,
    enrichPhotoSeasons,
    adjacentSeason4,
    adjacentSeason6,
  };
});

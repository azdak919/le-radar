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
      labelFr: 'Ukiuq (hiver)',
      season4: 'hiver',
      months: [11, 0], // déc–jan (0-index : 11=déc, 0=jan)
    },
    upingaksaaq: {
      labelFr: 'Upingaksaaq (hiver / printemps)',
      season4: 'hiver / printemps',
      months: [1, 2], // fév–mar
    },
    upingaaq: {
      labelFr: 'Upingaaq (printemps)',
      season4: 'printemps',
      months: [3, 4], // avr–mai
    },
    aujaq: {
      labelFr: 'Aujaq (été)',
      season4: 'été',
      months: [5, 6], // jun–jul
    },
    ukiaqsaaq: {
      labelFr: 'Ukiaqsaaq (été / automne)',
      season4: 'été / automne',
      months: [7, 8], // aoû–sep
    },
    ukiaq: {
      labelFr: 'Ukiaq (automne)',
      season4: 'automne',
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
    // Ne pas relire item.season / season6 : un tag « hiver » (souvent visuel,
    // pierre grise) revaliderait alors le texte (kw_hiver) en boucle.
    return [
      item.title,
      item.description,
      item.categories,
      item.url,
      item.link,
      item.credit,
    ]
      .filter(Boolean)
      .join(' ');
  }

  /**
   * Mois 0–11 depuis « Jan 14 », « Jan_14 », « Jan%2014 », « 14 janv ».
   * Exige un jour 1–31 pour ne pas prendre « mars 2014 » pour le 20.
   */
  const MONTH_TOKEN_TO_INDEX = {
    january: 0,
    janvier: 0,
    janv: 0,
    jan: 0,
    february: 1,
    fevrier: 1,
    fevr: 1,
    feb: 1,
    fev: 1,
    march: 2,
    mars: 2,
    mar: 2,
    april: 3,
    avril: 3,
    apr: 3,
    avr: 3,
    may: 4,
    mai: 4,
    june: 5,
    juin: 5,
    jun: 5,
    july: 6,
    juillet: 6,
    juil: 6,
    jul: 6,
    august: 7,
    aout: 7,
    aug: 7,
    aou: 7,
    september: 8,
    septembre: 8,
    sept: 8,
    sep: 8,
    october: 9,
    octobre: 9,
    oct: 9,
    november: 10,
    novembre: 10,
    nov: 10,
    december: 11,
    decembre: 11,
    dec: 11,
  };
  const MONTH_TOKEN_RE = Object.keys(MONTH_TOKEN_TO_INDEX)
    .sort((a, b) => b.length - a.length)
    .join('|');
  const MONTH_THEN_DAY_RE = new RegExp(
    `(?:^|[^a-z0-9])(${MONTH_TOKEN_RE})\\.?(?:[\\s._-]|%20)+(0?[1-9]|[12]\\d|3[01])(?!\\d)`,
    'i'
  );
  const MONTH_THEN_YEAR_RE = new RegExp(
    `(?:^|[^a-z0-9])(${MONTH_TOKEN_RE})\\.?(?:[\\s._-]|%20)+((?:19|20)\\d{2})(?!\\d)`,
    'i'
  );
  const DAY_THEN_MONTH_RE = new RegExp(
    `(?:^|[^a-z0-9])(0?[1-9]|[12]\\d|3[01])(?:[\\s._-]|%20)+(${MONTH_TOKEN_RE})\\.?(?![a-z])`,
    'i'
  );

  function monthFromAbbrevHaystack(t) {
    if (!t) return null;
    const md = t.match(MONTH_THEN_DAY_RE);
    if (md) {
      const idx = MONTH_TOKEN_TO_INDEX[md[1].toLowerCase()];
      if (idx != null) return idx;
    }
    const my = t.match(MONTH_THEN_YEAR_RE);
    if (my) {
      const idx = MONTH_TOKEN_TO_INDEX[my[1].toLowerCase()];
      if (idx != null) return idx;
    }
    const dm = t.match(DAY_THEN_MONTH_RE);
    if (dm) {
      const idx = MONTH_TOKEN_TO_INDEX[dm[2].toLowerCase()];
      if (idx != null) return idx;
    }
    return null;
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
    // « pipok » (atikamekw) / « pipon » (innu-aimun) = hiver — titres Commons
    // du type « Notcimik e pipok » (paysage de neige).
    if (
      /\b(hiver|winter|neige|snow|snowy|glace|ice\b|frozen|givr|blizzard|ski\b|raquette|pipok|pipon)\b/i.test(t)
      || /\b(decembre|janvier|fevrier|december|january|february)\b/i.test(t)
      || (
        /\b(arctic|arctique|nunavik|kangiqsualujjuaq|kuujjuaq|kangirsuk|pingualuit|inuksuk)\b/i.test(t)
        && !/\b(ete|summer|aujaq|green|vert|berry|juillet|aout|june|july|august)\b/i.test(t)
      )
    ) {
      // « ice hotel » = hiver ; dégel / débâcle / ice breakup = printemps
      if (!/\b(iceout|debacles?|break[\s-]?ups?|degel|thaws?)\b/i.test(t)) return 'hiver';
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

    const abbrMonth = monthFromAbbrevHaystack(t);
    if (abbrMonth != null) {
      return getCurrentSeason4(new Date(2000, abbrMonth, 15));
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

    if (/\b(ukiuq|pipok|pipon)\b/i.test(t)) return 'ukiuq';
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

  /**
   * Étiquette saisonnière digne de confiance ?
   *
   * `sessionId-fallback` veut dire « jamais analysée » : la photo a hérité de la
   * saison de la session de moisson. Une scène de neige moissonnée en juillet
   * ressortait donc taguée « ete » avec 0,3 de confiance et entrait dans le tier
   * STRICT — exactement ce que le commentaire de filterPoolByCurrentSeason veut
   * éviter. Non fiable → traitée comme inconnue, donc tier `soft` seulement.
   */
  const SEASON_MIN_CONFIDENCE = 0.5;
  function seasonTagTrusted(item) {
    if (!item) return false;
    if (item.seasonSource === 'sessionId-fallback') return false;
    const c = item.seasonConfidence;
    if (typeof c === 'number' && c < SEASON_MIN_CONFIDENCE) return false;
    // Pierre / béton / rocher : un « hiver » visuel (ou un tag bot sans
    // preuve dans le titre) n’est pas de la neige. Revue humaine = fiable.
    // Le miroir JS n’exporte ni seasonSource ni catégories : un tag déjà
    // passé à la sync doit rester fiable côté client (sinon Montmorency
    // « Snow in Quebec » redevient inconnue et s’affiche en août).
    if (item.season === 'hiver' && item.seasonSource && item.seasonSource !== 'manual') {
      if (item.seasonSource === 'visual') return false;
      if (inferSeason4(item) !== 'hiver') return false;
    }
    return true;
  }

  function resolveItemSeason4(item) {
    const explicit = item && item.season;
    if (explicit && SEASON4.includes(String(explicit)) && seasonTagTrusted(item)) {
      return String(explicit);
    }
    return inferSeason4(item);
  }

  function resolveItemSeason6(item) {
    const explicit = item && item.season6;
    if (explicit && SEASON6.includes(String(explicit)) && seasonTagTrusted(item)) {
      return String(explicit);
    }
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

    // Strict : saison courante, plus les inconnues.
    // On ne retire une photo que si on est *sûr* qu’elle n’est pas de saison
    // (neige / mots-clés / date / manuel). Pierre grise sans neige = inconnue
    // → reste affichable. Une vraie neige a presque toujours un mot-clé
    // (neige, pipok, winter…) donc inferSeason4 la classe encore hiver.
    const strict = pickTier((a) => {
      if (a.nations) return !a.s6 || a.s6 === season6;
      return !a.s4 || a.s4 === season4;
    });

    const adjacent = pickTier((a) => {
      if (a.nations) {
        if (a.s6 === season6) return false;
        // Saison 6 connue et adjacente seulement — pas d’unknown.
        return !!a.s6 && adj6.has(a.s6);
      }
      if (a.s4 === season4) return false;
      return !!a.s4 && adj4.has(a.s4);
    });

    // Évite l’opposé *certain* (neige en juillet) tant qu’il reste autre chose.
    // Un tag non fiable ne compte pas comme opposé.
    // Calendrier 6 : ukiuq (déc–jan) n’est pas à +3 de ukiaqsaaq (août–sep),
    // mais c’est bien de l’hiver météo — l’exclure aussi via season4.
    const soft = pickTier((a) => {
      if (a.nations) {
        if (!a.s6) return true;
        if (season6ToSeason4(a.s6) === opp4) return false;
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

  function season4ToSeason6(s4) {
    const map = {
      hiver: 'ukiuq',
      printemps: 'upingaaq',
      ete: 'aujaq',
      automne: 'ukiaq',
    };
    return map[s4] || null;
  }

  function season6ToSeason4(s6) {
    const map = {
      ukiuq: 'hiver',
      upingaksaaq: 'printemps',
      upingaaq: 'printemps',
      aujaq: 'ete',
      ukiaqsaaq: 'ete',
      ukiaq: 'automne',
    };
    return map[s6] || null;
  }

  /**
   * Détection textuelle détaillée (bot detect-photo-seasons).
   * @returns {{
   *   season: string|null,
   *   season6: string|null,
   *   confidence: number,
   *   source: 'text'|'date'|'topo'|'none',
   *   reasons: string[]
   * }}
   */
  function detectFromText(item) {
    const h = haystack(item);
    const t = (h || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    const reasons = [];
    let season = null;
    let confidence = 0;
    let source = 'none';

    if (!t.trim()) {
      return { season: null, season6: null, confidence: 0, source, reasons };
    }

    // Dates fichier (signal moyen)
    const dm = t.match(/(?:^|[^\d])((?:19|20)\d{2})[-_./](0[1-9]|1[0-2])(?:[-_./](0[1-9]|[12]\d|3[01]))?/);
    const compact = t.match(/(?:^|[^\d])((?:19|20)\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
    let dateSeason = null;
    if (dm) {
      dateSeason = getCurrentSeason4(new Date(2000, parseInt(dm[2], 10) - 1, 15));
      reasons.push(`date_filename:${dm[2]}`);
    } else if (compact) {
      dateSeason = getCurrentSeason4(new Date(2000, parseInt(compact[2], 10) - 1, 15));
      reasons.push(`date_compact:${compact[2]}`);
    } else {
      const abbrMonth = monthFromAbbrevHaystack(t);
      if (abbrMonth != null) {
        dateSeason = getCurrentSeason4(new Date(2000, abbrMonth, 15));
        reasons.push(`date_abbrev:${String(abbrMonth + 1).padStart(2, '0')}`);
      }
    }

    // Mots-clés (signaux forts)
    if (/\b(iceout|debacles?|break[\s-]?ups?|degel|thaws?)\b/i.test(t)) {
      season = 'printemps';
      confidence = 0.86;
      source = 'text';
      reasons.push('kw_degel');
    } else if (
      /\b(hiver|winter|neige|snow|snowy|glace|ice\b|frozen|givr|blizzard|ski\b|raquette)/i.test(t)
      || /\b(decembre|janvier|fevrier|december|january|february)\b/i.test(t)
    ) {
      season = 'hiver';
      confidence = 0.9;
      source = 'text';
      reasons.push('kw_hiver');
    } else if (
      /\b(automne|autumn|fall\b|foliage|erables?|maple.*(red|orange|fall)|feuilles? (rouges?|d.automne)|indian summer)/i.test(t)
      || /\b(septembre|octobre|novembre|september|october|november)\b/i.test(t)
    ) {
      season = 'automne';
      confidence = 0.88;
      source = 'text';
      reasons.push('kw_automne');
    } else if (
      /\b(printemps|spring|degel|thaw|bourgeon|tulipe|pre[\s-]?printemps|avril)\b/i.test(t)
      || (/\b(mars|march)\b/i.test(t) && !/\b(martial)\b/i.test(t))
    ) {
      season = 'printemps';
      confidence = 0.82;
      source = 'text';
      reasons.push('kw_printemps');
    } else if (
      /\b(ete|summer|estival|canicule|plage|beach|feuillage vert|juillet|aout|june|july|august|juin)\b/i.test(t)
    ) {
      season = 'ete';
      confidence = 0.85;
      source = 'text';
      reasons.push('kw_ete');
    }

    // Toponyme arctique sans été
    if (
      !season
      && /\b(arctic|arctique|nunavik|kangiqsualujjuaq|kuujjuaq|kangirsuk|pingualuit|inuksuk|tundra)\b/i.test(t)
      && !/\b(ete|summer|aujaq|green|vert|berry|juillet|aout|june|july|august)\b/i.test(t)
    ) {
      season = 'hiver';
      confidence = 0.78;
      source = 'topo';
      reasons.push('topo_arctique');
    }

    // Date si pas de mot-clé fort
    if (!season && dateSeason) {
      season = dateSeason;
      confidence = 0.62;
      source = 'date';
      reasons.push('date_only');
    } else if (season && dateSeason && season === dateSeason) {
      confidence = Math.min(0.98, confidence + 0.08);
      reasons.push('date_agrees');
    } else if (season && dateSeason && season !== dateSeason) {
      confidence = Math.max(0.45, confidence - 0.12);
      reasons.push('date_disagrees');
    }

    // season6
    let season6 = null;
    if (/\b(ukiuq)\b/i.test(t)) {
      season6 = 'ukiuq';
      reasons.push('kw6_ukiuq');
    } else if (/\b(upingaksaaq)\b/i.test(t)) season6 = 'upingaksaaq';
    else if (/\b(upingaaq)\b/i.test(t)) season6 = 'upingaaq';
    else if (/\b(aujaq)\b/i.test(t)) season6 = 'aujaq';
    else if (/\b(ukiaqsaaq)\b/i.test(t)) season6 = 'ukiaqsaaq';
    else if (/\b(ukiaq)\b/i.test(t) && !/\bukiaqsaaq\b/i.test(t)) season6 = 'ukiaq';
    else if (source === 'topo' || (season === 'hiver' && /\b(arctic|nunavik|tundra|kangiqsualujjuaq)\b/i.test(t))) {
      season6 = 'ukiuq';
    } else if (season) {
      season6 = season4ToSeason6(season);
      // mois précis pour 6 saisons
      if (dm || compact) {
        const mon = dm
          ? parseInt(dm[2], 10) - 1
          : parseInt(compact[2], 10) - 1;
        season6 = getCurrentSeason6(new Date(2000, mon, 15));
      }
    }

    return {
      season,
      season6,
      confidence,
      source: season ? source : 'none',
      reasons,
    };
  }

  /**
   * Fusionne détection texte + signal visuel optionnel.
   * @param {object} item
   * @param {{ season?: string, season6?: string, confidence?: number, source?: string }|null} visual
   */
  function mergeDetections(item, visual) {
    const text = detectFromText(item);
    // L’heuristique couleur prend la pierre / le béton / le rocher pour de la
    // neige. Un hiver visuel ne compte que s’il confirme un signal texte.
    if (visual && visual.season === 'hiver' && text.season !== 'hiver') {
      visual = null;
    }
    if (!visual || !visual.season) return text;

    const vConf = Number(visual.confidence) || 0.55;
    if (!text.season) {
      return {
        season: visual.season,
        season6: visual.season6 || season4ToSeason6(visual.season),
        confidence: vConf,
        source: 'visual',
        reasons: [...(text.reasons || []), 'visual_only'],
      };
    }
    if (text.season === visual.season) {
      return {
        season: text.season,
        season6: text.season6 || visual.season6 || season4ToSeason6(text.season),
        confidence: Math.min(0.99, Math.max(text.confidence, vConf) + 0.1),
        source: 'text+visual',
        reasons: [...text.reasons, 'visual_agrees'],
      };
    }
    // Désaccord : privilégier le plus confiant
    if (vConf > text.confidence + 0.08) {
      return {
        season: visual.season,
        season6: visual.season6 || season4ToSeason6(visual.season),
        confidence: vConf,
        source: 'visual',
        reasons: [...text.reasons, 'visual_overrides_text'],
      };
    }
    return {
      ...text,
      reasons: [...text.reasons, 'visual_disagrees_kept_text'],
    };
  }

  return {
    SEASON4,
    SEASON6,
    SEASON6_META,
    SEASON_MIN_CONFIDENCE,
    seasonTagTrusted,
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
    season4ToSeason6,
    season6ToSeason4,
    detectFromText,
    mergeDetections,
  };
});

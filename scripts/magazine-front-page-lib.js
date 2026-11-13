/**
 * Une + vedettes du fil d’accueil (vue standard, pas l’écran large).
 *
 * Même règles que radar-news.js :
 *  - news.json, filtré par RadarSessionFreshness.filterFreshItems
 *  - avis de ménage exclus (RadarNewsHousekeeping.housekeepingNormalItems)
 *  - les N plus frais, tranche contiguë (pickHeroSpotlight / HERO_SPOTLIGHT_MAX = 5)
 *    → 1 une + 4 vedettes.
 *
 * Identifiant de fiche : même articleId que mobile/app/js/core.js
 * (FNV-1a 64 bits sur l’URL canonique) → https://le-radar.ca/article/<id>/
 *
 * UMD : require() Node ou window.RadarMagazineFrontPage en navigateur.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./session-freshness-lib.js'),
      require('./news-housekeeping-lib.js'),
    );
  } else {
    root.RadarMagazineFrontPage = factory(
      root.RadarSessionFreshness,
      root.RadarNewsHousekeeping,
    );
  }
}(typeof self !== 'undefined' ? self : this, function (freshness, housekeeping) {
  'use strict';

  /* Aligné sur radar-news.js : HERO_SPOTLIGHT_MAX (1 une + 4 vedettes, vue standard). */
  const FRONT_PAGE_COUNT = 5;
  /* Affiche « Une du Radar » : 1 une + jusqu’à 8 vedettes, plus des brèves en pied. */
  const POSTER_PAGE_COUNT = 9;
  const POSTER_BRIEF_COUNT = 6;
  const SITE = 'https://le-radar.ca';
  const PORTRAIT_CROP_FOCAL_Y = 0.3; /* = style-feed.css .is-portrait-crop */
  const MONTHS = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ];
  const WEEKDAYS = [
    'dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi',
  ];

  function safeHttpUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== 'https:') return '';
      return parsed.href;
    } catch {
      return '';
    }
  }

  /* Identique à canonicalArticleUrl (mobile/app/js/core.js). */
  function canonicalArticleUrl(link) {
    const safe = safeHttpUrl(link);
    if (!safe) return '';
    const url = new URL(safe);
    const drop = [];
    for (const key of url.searchParams.keys()) {
      if (/^(utm_|fbclid$|gclid$|mc_|igshid$)/i.test(key)) drop.push(key);
    }
    for (const key of drop) url.searchParams.delete(key);
    const entries = [...url.searchParams.entries()].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    url.search = '';
    for (const [key, value] of entries) url.searchParams.append(key, value);
    url.hash = '';
    const path = url.pathname.replace(/\/+$/, '') || '/';
    url.pathname = path;
    return url.href;
  }

  /* Identique à articleId (mobile/app/js/core.js). */
  function articleId(link) {
    const canonical = canonicalArticleUrl(link);
    if (!canonical) return '';
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    const mask = 0xffffffffffffffffn;
    for (let i = 0; i < canonical.length; i += 1) {
      hash ^= BigInt(canonical.charCodeAt(i));
      hash = (hash * prime) & mask;
    }
    return hash.toString(16).padStart(16, '0');
  }

  function articlePageUrl(link) {
    const id = articleId(link);
    return id ? `${SITE}/article/${id}/` : '';
  }

  function sortByDateDesc(items) {
    return [...items].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }

  function foldName(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /**
   * Noms d’établissement acceptés pour un campus du studio (line, lineEn, label
   * et formes jumelles déjà utilisées dans news.json / institution-labels-lib).
   * On ne se sert pas des « places » (pavillons) : ce ne sont pas des institutions.
   */
  const CAMPUS_INSTITUTION_ALIASES = {
    laval: ['Université Laval', 'ULaval'],
    mcgill: ['Université McGill', 'McGill University', 'McGill'],
    udem: ['Université de Montréal', 'UdeM'],
    uqam: ['UQAM', 'Université du Québec à Montréal'],
    concordia: ['Université Concordia', 'Concordia University', 'Concordia'],
    sherbrooke: ['Université de Sherbrooke', 'UdeS'],
    bishops: ["Université Bishop's", "Université Bishop’s", "Bishop's University", "Bishop’s University", "Bishop's"],
    uqtr: ['UQTR', 'Université du Québec à Trois-Rivières'],
    uqac: ['UQAC', 'Université du Québec à Chicoutimi'],
    uqar: ['UQAR', 'Université du Québec à Rimouski'],
    uqo: ['UQO', 'Université du Québec en Outaouais'],
    uqat: ['UQAT', 'Université du Québec en Abitibi-Témiscamingue'],
    teluq: ['TÉLUQ', 'TELUQ', 'Université TÉLUQ'],
    ets: ['ÉTS', 'ETS', 'École de technologie supérieure', 'École de technologie supérieure (ÉTS)'],
    enap: ['ENAP', 'École nationale d’administration publique'],
    inrs: ['INRS'],
    poly: ['Polytechnique Montréal', 'Polytechnique', 'École Polytechnique de Montréal'],
    hec: ['HEC', 'HEC Montréal'],
  };

  function campusInstitutionNames(campus) {
    if (!campus || typeof campus === 'string') return [];
    const names = [
      campus.line,
      campus.lineEn,
      campus.label,
      ...(CAMPUS_INSTITUTION_ALIASES[campus.slug] || []),
    ];
    return [...new Set(names.filter(Boolean).map(foldName).filter(Boolean))];
  }

  function itemMatchesCampus(item, campus) {
    if (!campus || !campus.slug || campus.slug === 'generique' || campus.slug === 'toutes') return true;
    const accepted = new Set(campusInstitutionNames(campus));
    if (!accepted.size) return false;
    const inst = foldName(item.institution || '');
    return !!(inst && accepted.has(inst));
  }

  /* Périodes de l’affiche « une » (jours civils, heure de Montréal). */
  const POSTER_PERIODS = ['jour', 'fds', 'semaine', 'mois', 'session'];
  const SESSION_LABELS = { hiver: ['Session d’hiver', 'Winter term'], ete: ['Session d’été', 'Summer term'], automne: ['Session d’automne', 'Fall term'] };

  function mtlYmd(dateLike) {
    const t = new Date(dateLike).getTime();
    if (!Number.isFinite(t)) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(t);
  }

  function ymdShift(ymd, days) {
    const d = new Date(`${ymd}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function frShort(ymd) {
    const [, m, d] = ymd.split('-').map(Number);
    return `${d === 1 ? '1er' : d} ${MONTHS[m - 1]}`;
  }

  function enShort(ymd) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' })
      .format(new Date(`${ymd}T12:00:00Z`));
  }

  function frRange(a, b) {
    const [, ma] = a.split('-').map(Number);
    const [, mb, db] = b.split('-').map(Number);
    if (ma === mb) {
      const da = Number(a.slice(8));
      return `du ${da === 1 ? '1er' : da} au ${db === 1 ? '1er' : db} ${MONTHS[mb - 1]}`;
    }
    return `du ${frShort(a)} au ${frShort(b)}`;
  }

  /**
   * Fenêtre d’une période : { from, to } en AAAA-MM-JJ (inclusifs), libellés FR/EN.
   * « jour » garde le comportement d’origine (les plus frais de la session).
   */
  function periodWindow(period = 'jour', referenceDate = new Date()) {
    const today = mtlYmd(referenceDate) || new Date().toISOString().slice(0, 10);
    const id = POSTER_PERIODS.includes(period) ? period : 'jour';
    if (id === 'semaine') {
      const from = ymdShift(today, -6);
      return { id, from, to: today, fr: `Dernière semaine, ${frRange(from, today)}`, en: `Past week, ${enShort(from)} to ${enShort(today)}` };
    }
    if (id === 'mois') {
      const from = ymdShift(today, -29);
      return { id, from, to: today, fr: `Dernier mois, ${frRange(from, today)}`, en: `Past month, ${enShort(from)} to ${enShort(today)}` };
    }
    if (id === 'fds') {
      const wd = new Date(`${today}T12:00:00Z`).getUTCDay(); /* 0 = dimanche */
      const back = wd === 5 ? 0 : wd === 6 ? 1 : wd === 0 ? 2 : wd + 2;
      const from = ymdShift(today, -back);
      const to = ymdShift(from, 2) > today ? today : ymdShift(from, 2);
      return { id, from, to, fr: `Fin de semaine ${frRange(from, ymdShift(from, 2))}`, en: `Weekend, ${enShort(from)} to ${enShort(ymdShift(from, 2))}` };
    }
    if (id === 'session') {
      const start = freshness && typeof freshness.getCurrentUniversitySessionStart === 'function'
        ? mtlYmd(freshness.getCurrentUniversitySessionStart(referenceDate))
        : ymdShift(today, -120);
      const sid = freshness && typeof freshness.getCurrentUniversitySessionId === 'function'
        ? freshness.getCurrentUniversitySessionId(referenceDate) : '';
      const year = today.slice(0, 4);
      const [fr, en] = SESSION_LABELS[sid] || ['Cette session', 'This term'];
      return { id, from: start, to: today, fr: `${fr} ${year}`, en: `${en} ${year}` };
    }
    return { id: 'jour', from: null, to: today, fr: 'Aujourd’hui', en: 'Today' };
  }

  /* Le Radar couvre le sport étudiant : titres sur le sport professionnel exclus de l’affiche. */
  const PRO_SPORT_RE = new RegExp([
    'alouettes', 'canadiens? de montr[ée]al', '\\bhabs\\b', 'cf montr[ée]al', 'impact de montr[ée]al',
    'rocket de laval', 'victoire de montr[ée]al', 'alliance de montr[ée]al', 'roquettes? de montr[ée]al', '\\bexpos\\b',
    'coupe grey', 'grey cup', 'coupe stanley', 'stanley cup', 'super bowl', 's[ée]rie mondiale', 'world series',
    '\\b(lnh|nhl|lcf|cfl|mls|nfl|nba|wnba|mlb|lpbf|pwhl)\\b', 'maple leafs', 'raptors', 'blue jays',
    'grand prix du canada', 'formule 1', 'formula 1',
  ].join('|'), 'i');

  function isProSportItem(item) {
    return PRO_SPORT_RE.test(String((item && item.title) || ''));
  }

  function hasImage(item) {
    return Boolean(item && !item._feedNoImage && (item.imageLocal || item.image || item.stockImage));
  }

  /**
   * Choix réparti sur la période : on garde des articles de toute la fenêtre
   * (échantillon régulier dans l’ordre chronologique), la une étant le plus
   * récent qui a une image. Peu d’articles : on prend tout, sans inventer.
   */
  function spreadPick(sorted, cap) {
    if (sorted.length <= cap) return sorted.slice();
    const picked = [];
    const used = new Set();
    for (let k = 0; k < cap; k += 1) {
      let idx = Math.round((k * (sorted.length - 1)) / Math.max(1, cap - 1));
      while (used.has(idx) && idx < sorted.length - 1) idx += 1;
      used.add(idx);
      picked.push(sorted[idx]);
    }
    return sortByDateDesc(picked);
  }

  function selectFrontPage(items = [], referenceDate = new Date(), campus = null, limit = FRONT_PAGE_COUNT, period = 'jour') {
    const win = periodWindow(period, referenceDate);
    const fresh = win.id === 'jour' && freshness && typeof freshness.filterFreshItems === 'function'
      ? freshness.filterFreshItems(items, referenceDate)
      : items.slice();
    const normal = housekeeping && typeof housekeeping.housekeepingNormalItems === 'function'
      ? housekeeping.housekeepingNormalItems(fresh, referenceDate)
      : fresh;
    const refT = new Date(referenceDate).getTime();
    const inWindow = win.id === 'jour'
      ? normal
      : normal.filter((item) => {
        const t = new Date(item.date || 0).getTime();
        if (!Number.isFinite(t) || t > refT) return false;
        const ymd = mtlYmd(item.date);
        return ymd >= win.from && ymd <= win.to;
      });
    const scoped = inWindow.filter((item) => !isProSportItem(item));
    const pool = campus ? scoped.filter((item) => itemMatchesCampus(item, campus)) : scoped;
    const sorted = sortByDateDesc(pool);
    const cap = Math.max(0, Number(limit) || FRONT_PAGE_COUNT);
    let picked = win.id === 'jour' ? sorted.slice(0, Math.min(cap, sorted.length)) : spreadPick(sorted, cap);
    if (win.id !== 'jour') {
      const li = picked.findIndex(hasImage);
      if (li > 0) picked = [picked[li], ...picked.slice(0, li), ...picked.slice(li + 1)];
    }
    return {
      lead: picked[0] || null,
      features: picked.slice(1),
      items: picked,
      period: win,
      available: sorted.length,
    };
  }

  /** Extrait court : 2 phrases au plus, comme scripts/article-pages.js. */
  function shortExcerpt(text = '', max = 220) {
    const s = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    const parts = s.split(/(?<=[.!?…])\s+(?=[«"“A-ZÀ-ÝŒ0-9])/);
    let out = '';
    const maxSentences = max >= 360 ? 5 : 2;
    for (const part of parts.slice(0, maxSentences)) {
      const next = `${out} ${part}`.trim();
      if (next.length > max) break;
      out = next;
    }
    if (!out) {
      if (s.length <= max) return s;
      const cut = s.slice(0, max);
      const space = cut.lastIndexOf(' ');
      return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
    }
    return out;
  }

  function hookOf(item, max = 220) {
    return shortExcerpt(item.leadExcerpt || item.excerpt || '', max);
  }

  /**
   * Images à dessiner, en ordre : miroir local du fil, même fichier sur le-radar.ca
   * (CORS ouvert, utile hors déploiement), puis l’URL https déjà retenue par la
   * collecte (affiches-texte exclues en amont).
   */
  function imageCandidates(item, base = '..') {
    if (item && item._feedNoImage) return [];
    const out = [];
    const local = String(item.imageLocal || '').trim();
    if (/^assets\/news-images\//i.test(local)) {
      const prefix = String(base || '.').replace(/\/+$/, '');
      out.push(`${prefix}/${local}`);
      out.push(`${SITE}/${local}`);
    }
    const url = String(item.image || item.stockImage || '').trim();
    if (/^https:\/\//i.test(url) && !out.includes(url)) out.push(url);
    return out;
  }

  function imageSrc(item, base = '..') {
    return imageCandidates(item, base)[0] || '';
  }

  function cropFocalY(item) {
    if (Number.isFinite(item.imageCropFocalY) && item.imageCropFocalY >= 0 && item.imageCropFocalY <= 1) {
      return item.imageCropFocalY;
    }
    if (item.imagePortraitCrop) return PORTRAIT_CROP_FOCAL_Y;
    if (item.imageCropSafe && item.image && item.imageCropSafe === item.image) {
      return PORTRAIT_CROP_FOCAL_Y;
    }
    return 0.5;
  }

  function photoCredit(item) {
    const raw = String(item.sourceImageCredit || '').replace(/\s+/g, ' ').trim();
    return raw;
  }

  function frDate(iso, { weekday = false } = {}) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
      }).formatToParts(t).map((x) => [x.type, x.value]),
    );
    const day = Number(parts.day);
    const dayLabel = day === 1 ? '1er' : String(day);
    const month = MONTHS[Number(parts.month) - 1] || '';
    const date = `${dayLabel} ${month} ${parts.year}`;
    if (!weekday) return date;
    const weekMap = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const wd = WEEKDAYS[weekMap[parts.weekday]] || '';
    return wd ? `${wd} ${date}` : date;
  }

  function enDate(iso, { weekday = false } = {}) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    const opts = {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    if (weekday) opts.weekday = 'long';
    return new Intl.DateTimeFormat('en-CA', opts).format(t);
  }

  function normalize(item, base = '..') {
    if (!item || !item.title) return null;
    const id = articleId(item.link);
    const pageUrl = id ? `${SITE}/article/${id}/` : '';
    return {
      key: item.link || `${item.source}::${item.date}::${item.title}`,
      id,
      title: String(item.title || '').replace(/\s+/g, ' ').trim(),
      source: String(item.source || '').trim(),
      author: String(item.author || '').trim(),
      date: item.date || '',
      dateLabel: frDate(item.date || ''),
      hook: hookOf(item, 220),
      hookShort: hookOf(item, 140),
      hookLong: hookOf(item, 420),
      institution: String(item.institution || '').trim(),
      image: imageSrc(item, base),
      images: imageCandidates(item, base),
      focalY: cropFocalY(item),
      credit: photoCredit(item),
      pageUrl,
      originUrl: safeHttpUrl(item.link) || String(item.link || '').trim(),
    };
  }

  function frontPageCards(items = [], referenceDate = new Date(), base = '..', campus = null, limit = FRONT_PAGE_COUNT, period = 'jour') {
    const picked = selectFrontPage(items, referenceDate, campus, limit, period);
    const cards = picked.items.map((item) => normalize(item, base)).filter(Boolean);
    return {
      lead: cards[0] || null,
      features: cards.slice(1),
      items: cards,
      period: picked.period,
      available: picked.available,
    };
  }

  return {
    POSTER_PERIODS,
    isProSportItem,
    periodWindow,
    FRONT_PAGE_COUNT,
    POSTER_PAGE_COUNT,
    POSTER_BRIEF_COUNT,
    SITE,
    PORTRAIT_CROP_FOCAL_Y,
    canonicalArticleUrl,
    articleId,
    articlePageUrl,
    foldName,
    campusInstitutionNames,
    itemMatchesCampus,
    selectFrontPage,
    mtlYmd,
    shortExcerpt,
    hookOf,
    imageSrc,
    imageCandidates,
    cropFocalY,
    photoCredit,
    frDate,
    enDate,
    normalize,
    frontPageCards,
  };
}));

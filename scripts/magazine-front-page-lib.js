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

  function selectFrontPage(items = [], referenceDate = new Date(), campus = null) {
    const fresh = freshness && typeof freshness.filterFreshItems === 'function'
      ? freshness.filterFreshItems(items, referenceDate)
      : items.slice();
    const normal = housekeeping && typeof housekeeping.housekeepingNormalItems === 'function'
      ? housekeeping.housekeepingNormalItems(fresh, referenceDate)
      : fresh;
    const pool = campus ? normal.filter((item) => itemMatchesCampus(item, campus)) : normal;
    const sorted = sortByDateDesc(pool);
    const picked = sorted.slice(0, Math.min(FRONT_PAGE_COUNT, sorted.length));
    return {
      lead: picked[0] || null,
      features: picked.slice(1),
      items: picked,
    };
  }

  /** Extrait court : 2 phrases au plus, comme scripts/article-pages.js. */
  function shortExcerpt(text = '', max = 220) {
    const s = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    const parts = s.split(/(?<=[.!?…])\s+(?=[«"“A-ZÀ-ÝŒ0-9])/);
    let out = '';
    for (const part of parts.slice(0, 2)) {
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
      image: imageSrc(item, base),
      images: imageCandidates(item, base),
      focalY: cropFocalY(item),
      credit: photoCredit(item),
      pageUrl,
      originUrl: safeHttpUrl(item.link) || String(item.link || '').trim(),
    };
  }

  function frontPageCards(items = [], referenceDate = new Date(), base = '..', campus = null) {
    const picked = selectFrontPage(items, referenceDate, campus);
    const cards = picked.items.map((item) => normalize(item, base)).filter(Boolean);
    return {
      lead: cards[0] || null,
      features: cards.slice(1),
      items: cards,
    };
  }

  return {
    FRONT_PAGE_COUNT,
    SITE,
    PORTRAIT_CROP_FOCAL_Y,
    canonicalArticleUrl,
    articleId,
    articlePageUrl,
    foldName,
    campusInstitutionNames,
    itemMatchesCampus,
    selectFrontPage,
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

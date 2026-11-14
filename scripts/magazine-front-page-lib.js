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
  const POSTER_PERIODS = ['jour', 'demain', 'fds', 'semaine', 'mois', 'session'];
  /* Périodes « en direct » : articles les plus frais, matchs à venir, date du jour visé. */
  const LIVE_PERIODS = ['jour', 'demain'];
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
    /* L’année ferme la plage : le bandeau n’affiche plus la date du jour sur une période passée. */
    const year = b.slice(0, 4);
    if (ma === mb) {
      const da = Number(a.slice(8));
      return `du ${da === 1 ? '1er' : da} au ${db === 1 ? '1er' : db} ${MONTHS[mb - 1]} ${year}`;
    }
    return `du ${frShort(a)}${a.slice(0, 4) !== year ? ` ${a.slice(0, 4)}` : ''} au ${frShort(b)} ${year}`;
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
      return { id, from, to: today, fr: `Dernière semaine, ${frRange(from, today)}`, en: `Past week, ${enShort(from)} to ${enShort(today)}, ${today.slice(0, 4)}` };
    }
    if (id === 'mois') {
      const from = ymdShift(today, -29);
      return { id, from, to: today, fr: `Dernier mois, ${frRange(from, today)}`, en: `Past month, ${enShort(from)} to ${enShort(today)}, ${today.slice(0, 4)}` };
    }
    if (id === 'fds') {
      const wd = new Date(`${today}T12:00:00Z`).getUTCDay(); /* 0 = dimanche */
      const back = wd === 5 ? 0 : wd === 6 ? 1 : wd === 0 ? 2 : wd + 2;
      const from = ymdShift(today, -back);
      const to = ymdShift(from, 2) > today ? today : ymdShift(from, 2);
      return { id, from, to, fr: `Fin de semaine ${frRange(from, ymdShift(from, 2))}`, en: `Weekend, ${enShort(from)} to ${enShort(ymdShift(from, 2))}, ${from.slice(0, 4)}` };
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
    if (id === 'demain') {
      const target = ymdShift(today, 1);
      const fr = frDate(`${target}T12:00:00`, { weekday: true });
      const en = enDate(`${target}T12:00:00`, { weekday: true });
      return { id, live: true, from: null, to: today, target, fr: fr.charAt(0).toUpperCase() + fr.slice(1), en };
    }
    return { id: 'jour', live: true, from: null, to: today, target: today, fr: 'Aujourd’hui', en: 'Today' };
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

  /* Signatures : même source que les fiches (item.author, vide si = média),
   * même correctif Impact Campus (compte « Archives Impact Campus » écarté, PR363). */
  const AUTHOR_ROLE_RE = /^(?:journaliste|collaborat|rédact|redact|chef|managing|editor|éditeur|staff|contributor|writer|reporter|photographe|photographer|columnist|chroniqueu)/i;
  function authorKey(s) {
    return foldName(s);
  }
  function authorNames(item) {
    const raw = String((item && item.author) || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/^(?:Par|By)\s+/i, '');
    if (!raw || authorKey(raw) === authorKey(item.source || '')) return [];
    if (/^(?:the\s+)?editorial\s+(?:team|staff|board)$|^(?:la\s+|l['’])?\s*rédaction$/i.test(raw)) return ['la rédaction'];
    const parts = raw.split(/\s*,\s*|\s+et\s+|\s+and\s+|\s+&\s+/i)
      .map((p) => p.trim())
      .filter(Boolean)
      .filter((p) => !AUTHOR_ROLE_RE.test(p))
      .filter((p) => !(authorKey(item.source) === authorKey('Impact Campus') && authorKey(p) === authorKey('Archives Impact Campus')))
      .filter((p) => authorKey(p) !== authorKey(item.source || ''));
    const seen = new Set();
    return parts.filter((p) => { const k = authorKey(p); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  /** « Par A, B et C · Média » ; maxNames → « Par A et al. · Média » ; sans auteur → « Média ». */
  function bylineOf(names = [], source = '', { maxNames = Infinity, en = false } = {}) {
    const list = (names || []).filter(Boolean);
    const src = String(source || '').trim();
    if (!list.length) return src;
    let who;
    if (list.length > maxNames) who = `${list[0]} et al.`;
    else if (list.length === 1) who = list[0];
    else who = `${list.slice(0, -1).join(', ')} ${en ? 'and' : 'et'} ${list[list.length - 1]}`;
    return [`Par ${who}`, src].filter(Boolean).join(' · ');
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
    const fresh = win.live && freshness && typeof freshness.filterFreshItems === 'function'
      ? freshness.filterFreshItems(items, referenceDate)
      : items.slice();
    const normal = housekeeping && typeof housekeeping.housekeepingNormalItems === 'function'
      ? housekeeping.housekeepingNormalItems(fresh, referenceDate)
      : fresh;
    const refT = new Date(referenceDate).getTime();
    const inWindow = win.live
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
    if (limit === Infinity) return { lead: sorted[0] || null, features: sorted.slice(1), items: sorted, period: win, available: sorted.length };
    const cap = Math.max(0, Number(limit) || FRONT_PAGE_COUNT);
    let picked = win.live ? sorted.slice(0, Math.min(cap, sorted.length)) : spreadPick(sorted, cap);
    if (!win.live) {
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
   * Relais CORS publics (Photon, puis wsrv.nl) pour peindre une image distante
   * sur un canevas (affiche) quand l’origine n’envoie pas ACAO et qu’aucun
   * miroir local n’est retenu — cas typique de imageRemoteOnly (licence non
   * libre, ex. Karmina / Éléphant Films). Ces relais ne réhébergent pas le
   * fichier dans assets/news-images/.
   */
  function photonUrl(url = '') {
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:') return '';
      const host = u.hostname.toLowerCase();
      if (host === 'i0.wp.com' || host.endsWith('.wp.com')) return url;
      if (host === 'wsrv.nl' || host === 'images.weserv.nl') return url;
      if (host === 'le-radar.ca' || host.endsWith('.le-radar.ca')) return '';
      if (host === 'upload.wikimedia.org' || host.endsWith('.wikimedia.org')) return '';
      return `https://i0.wp.com/${host}${u.pathname}${u.search ? `${u.search}&ssl=1` : '?ssl=1'}`;
    } catch {
      return '';
    }
  }
  function corsRelayUrls(url = '') {
    const out = [];
    const photon = photonUrl(url);
    if (photon && photon !== url) out.push(photon);
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      if (u.protocol === 'https:' && host !== 'wsrv.nl' && host !== 'images.weserv.nl') {
        out.push(`https://wsrv.nl/?url=${encodeURIComponent(url)}&w=1400&we&output=jpg&q=82`);
      }
    } catch { /* URL invalide */ }
    return out;
  }

  /**
   * Images à dessiner, en ordre : miroir local du fil, même fichier sur le-radar.ca
   * (CORS ouvert, utile hors déploiement), puis l’URL https déjà retenue par la
   * collecte (affiches-texte exclues en amont). Sans miroir local, Photon et
   * wsrv.nl suivent l’origine pour le canevas de l’affiche (ACAO).
   */
  function imageCandidates(item, base = '..') {
    if (item && item._feedNoImage) return [];
    const out = [];
    const local = String(item.imageLocal || '').trim();
    const hasLocal = /^assets\/news-images\//i.test(local);
    if (hasLocal) {
      const prefix = String(base || '.').replace(/\/+$/, '');
      out.push(`${prefix}/${local}`);
      out.push(`${SITE}/${local}`);
    }
    const url = String(item.image || item.stockImage || '').trim();
    if (/^https:\/\//i.test(url) && !out.includes(url)) out.push(url);
    if (!hasLocal && /^https:\/\//i.test(url)) {
      for (const relay of corsRelayUrls(url)) {
        if (!out.includes(relay)) out.push(relay);
      }
    }
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

  /* Typographie française (titres et chapeaux en français seulement) : apostrophe courbe,
   * fine insécable avant ; ! ?, insécable avant : et à l’intérieur des guillemets. */
  function frTypo(text) {
    return String(text || '')
      .replace(/(\p{L})'(?=\p{L})/gu, '$1’')
      .replace(/(\S)[ \u00A0]?([;!?])(?=\s|$|[»)"’])/gu, (m, a, p) => (a === '\u202F' ? m : `${a}\u202F${p}`))
      .replace(/(\S)[ \u00A0]?:(?=\s|$)/gu, (m, a) => (/[\u00A0\u202F]/.test(a) ? m : `${a}\u00A0:`))
      .replace(/«[ \u00A0\u202F]*/g, '«\u00A0')
      .replace(/[ \u00A0\u202F]*»/g, '\u00A0»');
  }

  function normalize(item, base = '..') {
    if (!item || !item.title) return null;
    const id = articleId(item.link);
    const pageUrl = id ? `${SITE}/article/${id}/` : '';
    return {
      key: item.link || `${item.source}::${item.date}::${item.title}`,
      id,
      title: (item.lang === 'fr' ? frTypo : String)(String(item.title || '').replace(/\s+/g, ' ').trim()),
      source: String(item.source || '').trim(),
      author: String(item.author || '').trim(),
      authors: authorNames(item),
      byline: bylineOf(authorNames(item), String(item.source || '').trim()),
      date: item.date || '',
      /* Date insécable : « 12 novembre 2026 » ne se coupe jamais. */
      dateLabel: frDate(item.date || '').replace(/ /g, '\u00A0'),
      hook: (item.lang === 'fr' ? frTypo : String)(hookOf(item, 220)),
      hookShort: (item.lang === 'fr' ? frTypo : String)(hookOf(item, 140)),
      hookLong: (item.lang === 'fr' ? frTypo : String)(hookOf(item, 420)),
      institution: String(item.institution || '').trim(),
      image: imageSrc(item, base),
      images: imageCandidates(item, base),
      focalY: cropFocalY(item),
      credit: photoCredit(item),
      pageUrl,
      originUrl: safeHttpUrl(item.link) || String(item.link || '').trim(),
    };
  }

  /**
   * Sélection manuelle : seulement les cartes cochées (ids d’articles), la une
   * choisie en tête, le reste du plus récent au plus ancien. Ids inconnus ignorés.
   */
  function manualSelection(cards = [], ids = [], leadId = '') {
    const want = new Set((ids || []).filter(Boolean));
    if (leadId) want.add(leadId);
    const picked = sortByDateDesc(cards.filter((c) => c && want.has(c.id)));
    const li = leadId ? picked.findIndex((c) => c.id === leadId) : -1;
    return li > 0 ? [picked[li], ...picked.slice(0, li), ...picked.slice(li + 1)] : picked;
  }

  const SEX_LABEL = { F: 'féminin', M: 'masculin', X: 'mixte' };
  /* « (F) » ou « (H) » d’après la donnée (F/M, W, women/men…) ; inconnu ou mixte : rien. */
  function genderMark(sex) {
    const k = String(sex || '').trim().toLowerCase();
    if (['f', 'w', 'women', 'woman', 'femmes', 'féminin', 'feminin', 'female'].includes(k)) return '(F)';
    if (['m', 'h', 'men', 'man', 'hommes', 'masculin', 'male'].includes(k)) return '(H)';
    return '';
  }
  /**
   * Bilan d’une période passée : résultats réels (sports.json dépaqueté),
   * filtrés par établissement, variés (un par sport et sexe à tour de rôle,
   * universitaire d’abord), plus récents en premier. Rien n’est inventé.
   */
  /* Table des sigles : en navigateur, institution-acronyms-data.js (déjà chargé) ;
   * en Node, la même SoT via institution-labels-lib.js. */
  function acronymMap() {
    if (typeof window !== 'undefined' && window.RadarInstitutionAcronyms) return window.RadarInstitutionAcronyms;
    try { return require('./institution-labels-lib.js').buildAcronymMap(); } catch { return {}; }
  }
  let _acr = null;
  let _acrFold = null;
  function acronyms() {
    if (_acr) return { map: _acr, fold: _acrFold };
    _acr = acronymMap();
    _acrFold = Object.fromEntries(Object.entries(_acr).map(([k, v]) => [foldName(k), v]));
    return { map: _acr, fold: _acrFold };
  }
  /** Sigle officiel (UdeM, ULaval, UNB…) issu de la table partagée. */
  function institutionSigle(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    const { map, fold } = acronyms();
    return map[raw] || fold[foldName(raw)] || '';
  }
  /**
   * Forme courte pour les parenthèses : le sigle, sans le campus ni la ville
   * (« UNB — Fredericton », « University of New Brunswick — campus Fredericton » → « UNB »).
   * On ne conserve un suffixe après le tiret que s’il qualifie l’équipe (« équipe Blanc »).
   */
  function shortInstLabel(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    const rawSub = ((raw.match(/\s+[—–-]\s+(.*)$/) || [])[1] || '').trim();
    const sub = /équipe|team/i.test(rawSub) ? rawSub.replace(/^campus\s+/i, '') : '';
    const base = raw.replace(/\s+[—–-]\s+.*$/, '').trim();
    const short = institutionSigle(base) || institutionSigle(raw) || base;
    return sub ? `${short}, ${sub}` : short;
  }
  /* Nom d’équipe (registre des formations) + établissement entre parenthèses ;
   * l’équipe de l’établissement de l’affiche s’affiche seule. Sans surnom : l’établissement seul. */
  function teamLabel(nickname, shortName, own = false) {
    const nick = frTypo(String(nickname || '').trim());
    const inst = frTypo(shortInstLabel(shortName));
    if (!nick) return inst;
    if (own || !inst || inst === nick) return nick;
    return `${nick} (${inst})`;
  }
  function gameSides(team, g, campus) {
    const ownInst = team.institutionName || team.institutionLabel || team.fullName || '';
    const own = Boolean(campus) && itemMatchesCampus({ institution: ownInst }, campus);
    const oppOwn = Boolean(campus) && itemMatchesCampus({ institution: g.opponentFullName || g.opponent || '' }, campus);
    return {
      who: teamLabel(team.nickname, team.shortName || team.name || team.fullName, own),
      vs: teamLabel(g.opponentNickname, g.opponent || g.opponentFullName, oppOwn),
    };
  }
  /** Épreuve (régate, championnat) plutôt qu’un match à domicile ou à l’extérieur. */
  function isEventGame(team, g) {
    const sport = String((team && (team.sport || team.sportLabel)) || (g && g.sport) || '').toLowerCase();
    const folded = sport.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return (g && g.scoreKind === 'place') || folded === 'sailing' || folded === 'voile';
  }
  /** Nom d’épreuve en français (déjà traduit dans le payload CICSA) ; jamais le sigle de lieu anglais. */
  function eventLabel(g) {
    const looksEn = /nationals|championships?|regatta|invitational|\binvite\b|fleet race|team race|match race|\bWVYC\b/i;
    const opp = String((g && g.opponent) || '').trim();
    const full = String((g && g.opponentFullName) || '').trim();
    const first = (s) => String(s || '').split(/\s*·\s*/)[0].trim();
    if (opp && !looksEn.test(opp)) return frTypo(opp);
    if (full && !looksEn.test(first(full))) return frTypo(first(full));
    try {
      const { sailingNameFr } = require('./cicsa-sailing-lib.js');
      const src = first((g && (g.opponentEn || g.opponent || g.opponentFullName)) || '');
      const tr = sailingNameFr(src);
      if (tr) return frTypo(tr);
    } catch { /* navigateur : pas de module CICSA ; on s’appuie sur le nom déjà français */ }
    return frTypo(opp && !looksEn.test(opp) ? opp : first(opp) || first(full));
  }
  /** Sigle de l’établissement pour une épreuve : « ULaval », jamais « ULaVoile » ni « McGill Sailing ». */
  function eventInstLabel(team) {
    const inst = (team && (team.institutionName || team.institutionLabel || team.fullName)) || '';
    return frTypo(shortInstLabel(inst) || shortInstLabel((team && team.name) || ''));
  }
  /**
   * Ligne d’un match ou d’une régate pour l’affiche (en-tête et slogan).
   * Régate : « ULaval · Championnat canadien de course en flotte », sans « visite ».
   */
  function posterUpcomingLine(team, g, campus) {
    if (isEventGame(team, g)) {
      const inst = eventInstLabel(team);
      const event = eventLabel(g);
      return { event: true, who: inst, vs: event, verb: '', line: [inst, event].filter(Boolean).join(' · ') };
    }
    const sides = gameSides(team, g, campus);
    const verb = g && g.home ? 'reçoit' : 'visite';
    return { event: false, who: sides.who, vs: sides.vs, verb, line: `${sides.who} ${verb} ${sides.vs}` };
  }

  /* Identifiant court et stable d’un match ou d’un résultat (paramètres d’URL de la sélection manuelle). */
  function sportItemId(item) {
    const key = [item && item.date, item && item.kicker, item && item.line].map((x) => String(x || '')).join('|');
    let h = 0x811c9dc5;
    for (let i = 0; i < key.length; i += 1) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }
  /* Résultat au classement (voile, cross-country…) : « 7e sur 11 », jamais un faux score. */
  function placeLabel(place, of) {
    const n = Number(place);
    if (!Number.isFinite(n) || n < 1) return '';
    const ord = n === 1 ? '1er' : `${n}e`;
    return Number.isFinite(Number(of)) && Number(of) > 0 ? `${ord} sur ${Number(of)}` : ord;
  }
  /* Sélection manuelle des sports : ids choisis (dans l’ordre, en tête), ids masqués ; le reste vient de l’auto. */
  function applySportSelection(candidates = [], auto = [], chosenIds = [], hiddenIds = []) {
    const byId = new Map(candidates.map((c) => [c.id || sportItemId(c), c]));
    const hidden = new Set(hiddenIds || []);
    const pinned = (chosenIds || []).map((id) => byId.get(id)).filter(Boolean).filter((c) => !hidden.has(c.id));
    const used = new Set(pinned.map((c) => c.id));
    /* Choix épinglés en tête, places restantes complétées par l’auto : jamais de trou. */
    return pinned.concat((auto || []).filter((c) => { const k = c.id || sportItemId(c); return !hidden.has(k) && !used.has(k); }));
  }
  /* Rôles manuels des articles : une, aussi à lire, vedettes, en bref ; les places libres gardent l’auto. */
  function assignRoles(pool = [], roles = {}, slots = {}) {
    const byId = new Map(pool.map((a) => [a.id, a]));
    const used = new Set();
    const take = (ids, n) => (ids || []).map((id) => byId.get(id)).filter((a) => a && !used.has(a.id) && used.add(a.id)).slice(0, n);
    const lead = take(roles.une ? [roles.une] : [], 1)[0] || null;
    const side = take(roles.aussi, slots.side ?? Infinity);
    const grid = take(roles.vedettes, slots.grid ?? Infinity);
    const briefs = take(roles.bref, slots.briefs ?? Infinity);
    const rest = pool.filter((a) => !used.has(a.id) && !(roles.masquer || []).includes(a.id));
    const fill = (arr, n) => { while (arr.length < n && rest.length) { const a = rest.shift(); used.add(a.id); arr.push(a); } return arr; };
    const out = { lead: lead || (rest.length ? (used.add(rest[0].id), rest.shift()) : null) };
    out.side = fill(side, slots.side ?? 0);
    out.grid = fill(grid, slots.grid ?? 0);
    out.briefs = fill(briefs, slots.briefs ?? 0);
    return out;
  }

  function periodResults(teams = [], win = null, campus = null, limit = 4) {
    if (!win || !win.from) return { items: [], played: 0, wins: 0 };
    const seen = new Set();
    const games = [];
    (Array.isArray(teams) ? teams : Object.values(teams || {})).forEach((team) => {
      if (!team) return;
      const inst = team.institutionName || team.institutionLabel || '';
      if (campus && !itemMatchesCampus({ institution: inst }, campus)) return;
      (team.results || []).forEach((g) => {
        if (!g || g.priorSeason || g.scoreFor == null || g.scoreAgainst == null || !g.date) return;
        if (g.date < win.from || g.date > win.to) return;
        const pair = [team.registryId || team.name, g.opponentRegistryId || g.opponent].sort().join('~');
        const id = g.gameId || `${g.date}|${g.time || ''}|${pair}|${team.sport}|${team.sex || ''}`;
        if (seen.has(id)) return;
        seen.add(id);
        games.push({ team, g });
      });
    });
    const groups = new Map();
    games.sort((a, b) => {
      const ua = a.team.sector === 'universitaire' ? 0 : 1;
      const ub = b.team.sector === 'universitaire' ? 0 : 1;
      if (ua !== ub) return ua - ub;
      return String(b.g.date + (b.g.time || '')).localeCompare(String(a.g.date + (a.g.time || '')));
    });
    games.forEach((x) => {
      const k = `${x.team.sector}|${x.team.sport}|${x.team.sex || ''}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(x);
    });
    const lanes = [...groups.values()];
    const out = [];
    for (let r = 0; out.length < limit && lanes.some((l) => l.length > r); r += 1) {
      for (const lane of lanes) {
        if (out.length >= limit) break;
        if (lane[r]) out.push(lane[r]);
      }
    }
    const items = out.map(({ team, g }) => {
      const { who, vs } = gameSides(team, g, campus);
      const sport = [team.sportLabel || team.sport || '', genderMark(team.sex)].filter(Boolean).join(' ');
      return {
        kicker: sport,
        gender: genderMark(team.sex),
        emoji: sportEmoji(team.sportLabel || team.sport),
        line: (g.scoreKind === 'place' || isEventGame(team, g))
          ? `${eventInstLabel(team)}\u00A0: ${placeLabel(g.scoreFor, g.scoreAgainst)} · ${eventLabel(g)}`.trim()
          : `${who} ${g.scoreFor}–${g.scoreAgainst} ${vs}`.trim(),
        meta: frDate(`${g.date}T12:00:00`).replace(/\s\d{4}$/, ''),
        date: g.date,
        result: g.result || (g.scoreFor > g.scoreAgainst ? 'W' : g.scoreFor < g.scoreAgainst ? 'L' : 'T'),
      };
    });
    items.forEach((it) => { it.id = sportItemId(it); });
    const played = games.length;
    const wins = campus ? games.filter(({ g }) => (g.result || (g.scoreFor > g.scoreAgainst ? 'W' : '')) === 'W').length : 0;
    return { items, played, wins };
  }

  /* Bandeau : un libellé de période ou une date se coupe seulement après une virgule ;
   * à l’intérieur d’un segment, espaces insécables (le jour reste avec son mois). */
  function mastheadSegments(label) {
    return String(label || '').split(/,\s+/).map((seg, i, all) => `${seg.trim()}${i < all.length - 1 ? ',' : ''}`
      .replace(/[ \u202F]+/g, '\u00A0')).filter((seg) => seg.replace(/[,\u00A0]/g, ''));
  }

  /* Emoji de sport devant un match ou un résultat. Toute clé ajoutée ici doit avoir son glyphe
   * dans la police auto-hébergée (assets/kit/fonts/emoji/, scripts/subset-poster-emoji-font.py). */
  const SPORT_EMOJI_FALLBACK = '🏅';
  const SPORT_EMOJI = [
    [/flag[- ]?football|football/, '🏈'],
    [/hockey/, '🏒'],
    [/basket/, '🏀'],
    [/volley/, '🏐'],
    [/futsal|soccer/, '⚽'],
    [/rugby/, '🏉'],
    [/baseball|softball/, '⚾'],
    [/badminton/, '🏸'],
    [/tennis/, '🎾'],
    [/golf/, '⛳'],
    [/natation|swim/, '🏊'],
    [/cross[- ]?country|athletisme|athletics|track/, '🏃'],
    [/ultimate|frisbee/, '🥏'],
    [/voile|sailing/, '⛵'],
    [/cheer/, '📣'],
    [/curling/, '🥌'],
    [/\bski|snowboard/, '⛷️'],
  ];
  function sportEmoji(sport) {
    const k = String(sport || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!k) return SPORT_EMOJI_FALLBACK;
    const hit = SPORT_EMOJI.find(([re]) => re.test(k));
    return hit ? hit[1] : SPORT_EMOJI_FALLBACK;
  }
  const SPORT_EMOJI_ALL = [...new Set(SPORT_EMOJI.map(([, e]) => e).concat(SPORT_EMOJI_FALLBACK))];

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

  /* Émissions de radio pour une affiche (t984u) : originales, de jour ou de soir (7 h à 22 h, heure de Montréal),
   * jamais de reprise ni de rotation musicale automatique (« Mix … »), étalées dans la journée (≥ 3 h d'écart au
   * premier passage), puis complétées dans l'ordre. Données réelles de radio-schedules.json seulement. */
  const RADIO_SHOW_MIN = '07:00';
  const RADIO_SHOW_MAX = '22:00';
  const RADIO_NOT_ORIGINAL = /\b(reprise|rediffusion|rediff|rattrapage|replay|best of|encore)\b|\(r\)|^\s*mix\b|\bmix (franco|anglo|électro|electro|nuit)\b|\bplaylist\b|\bautomat/i;
  function radioShowOk(g) {
    const t = String((g && g.title) || '').trim();
    const st = String((g && g.start) || '');
    return !!t && st >= RADIO_SHOW_MIN && st <= RADIO_SHOW_MAX && !RADIO_NOT_ORIGINAL.test(t) && !isProSportItem({ title: t });
  }
  function pickRadioShows(grid, startYmd, nowHm, limit = 3, days = 7) {
    const toMin = (hm) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hm || '')); return m ? (+m[1]) * 60 + (+m[2]) : 0; };
    const slots = [];
    for (let d = 0; d < days; d += 1) {
      const day = new Date(`${startYmd}T12:00:00Z`);
      day.setUTCDate(day.getUTCDate() + d);
      const ymd = day.toISOString().slice(0, 10);
      (grid || []).filter((g) => g && g.day === day.getUTCDay() && radioShowOk(g) && (d > 0 || String(g.start) >= String(nowHm || '00:00')))
        .sort((a, b) => String(a.start).localeCompare(String(b.start)))
        .forEach((g) => slots.push({ ymd, start: String(g.start), title: String(g.title).trim(), d }));
    }
    const out = [];
    const seen = new Set();
    const take = (x) => { out.push(x); seen.add(x.title.toLowerCase()); };
    for (const x of slots) {
      if (out.length >= limit) break;
      if (seen.has(x.title.toLowerCase())) continue;
      const prev = out[out.length - 1];
      if (prev && prev.ymd === x.ymd && toMin(x.start) - toMin(prev.start) < 180) continue;
      take(x);
    }
    for (const x of slots) {
      if (out.length >= limit) break;
      if (!seen.has(x.title.toLowerCase())) take(x);
    }
    return out.sort((a, b) => (a.ymd + a.start).localeCompare(b.ymd + b.start));
  }

  /* Ligne « En chiffres » (t987u, libellé mis à jour t1002u). Plusieurs médias : « 9 articles · 3 médias »
   * (inchangé). Un seul média : nombre d’auteurs distincts si au moins 2 ; sinon repli B (nom du média).
   * En mode bilingue, « auteurs » est suivi de l’équivalent anglais « authors » / « author ». */
  function numbersLine(pool, opts = {}) {
    const list = (pool || []).filter(Boolean);
    if (!list.length) return '';
    const n = list.length;
    const arts = `${n} article${n > 1 ? 's' : ''}`;
    const suffix = opts.suffix ? ` ${opts.suffix}` : '';
    const medias = [...new Set(list.map((a) => a.source).filter(Boolean))];
    if (medias.length !== 1) return `${arts}${suffix} · ${medias.length} média${medias.length > 1 ? 's' : ''}`;
    const people = new Set();
    list.forEach((a) => (a.authors || []).forEach((x) => { const k = foldName(String(x || '')); if (k) people.add(k); }));
    if (people.size >= 2) {
      const fr = people.size > 1 ? 'auteurs' : 'auteur';
      const en = people.size > 1 ? 'authors' : 'author';
      const peopleWord = opts.bilingual ? `${fr} / ${en}` : fr;
      return `${arts}${suffix} · ${people.size} ${peopleWord}`;
    }
    return `${arts}${suffix} ${deMedia(medias[0])}`;
  }
  /* Kicker du bloc « En chiffres » : nom du média (et son établissement, pour la couleur) s’il n’y en
   * a qu’un dans le bassin ; « Journaux étudiants » dès que plusieurs médias sont inclus. */
  function pressKicker(pool) {
    const list = (pool || []).filter((a) => a && a.source);
    const sources = [...new Set(list.map((a) => a.source))];
    if (sources.length === 1) {
      const inst = (list.find((a) => a.institution) || {}).institution || '';
      return { kicker: sources[0], institution: inst };
    }
    return { kicker: 'Journaux étudiants', institution: '' };
  }
  /* Signature d’un article sur l’affiche Une : tous les auteurs, le média, et la date
   * absolue s’il y en a une. Jamais de « et al. », jamais de repli qui omet un auteur. */
  function signatureOf(art, { withDate = true, en = false } = {}) {
    const by = bylineOf((art && art.authors) || [], (art && art.source) || '', { en });
    if (withDate && art && art.dateLabel) return [by, art.dateLabel].filter(Boolean).join(' · ');
    return by || '';
  }
  /* « de Le Polyscope » → « du Polyscope », « de Les… » → « des… », élision devant voyelle. */
  function deMedia(name) {
    const n = String(name || '').trim();
    if (/^Le\s/.test(n)) return `du ${n.slice(3)}`;
    if (/^Les\s/.test(n)) return `des ${n.slice(4)}`;
    if (/^[AEIOUYÀÂÉÈÊËÎÏÔÛÙ]/i.test(n)) return `d’${n}`;
    return `de ${n}`;
  }

  return {
    POSTER_PERIODS,
    authorNames,
    bylineOf,
    manualSelection,
    periodResults,
    sportItemId,
    placeLabel,
    applySportSelection,
    assignRoles,
    teamLabel,
    gameSides,
    institutionSigle,
    shortInstLabel,
    isEventGame,
    eventLabel,
    eventInstLabel,
    posterUpcomingLine,
    genderMark,
    frTypo,
    mastheadSegments,
    sportEmoji,
    SPORT_EMOJI_ALL,
    isProSportItem,
    radioShowOk,
    numbersLine,
    pressKicker,
    signatureOf,
    pickRadioShows,
    periodWindow,
    LIVE_PERIODS,
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
    photonUrl,
    corsRelayUrls,
    cropFocalY,
    photoCredit,
    frDate,
    enDate,
    normalize,
    frontPageCards,
  };
}));

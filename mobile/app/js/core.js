/**
 * LE-RADAR mobile — logique partagée, sans DOM.
 * Même contrat de données que news.json / news-sources.json.
 * Aucun corps d’article : titre, source, extrait, lien original.
 */
'use strict';

(function initRadarMobile(global) {
  const ORIGIN = 'https://le-radar.ca';
  const APP_VERSION = '1.0.0';
  const LIBRARY_KEY = 'radar-mobile-library-v1';
  const PREFS_KEY = 'radar-mobile-prefs-v1';
  const SNAPSHOT_KEY = 'radar-mobile-snapshot-v1';
  const LIMITS = { favorites: 200, history: 80, keywords: 24, excerpt: 280, snapshot: 200 };
  const NOTIFICATION_KEYS = ['enabled', 'follows', 'digest', 'newMedia'];

  function slugify(value = '') {
    return String(value)
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/['’]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function fold(value = '') {
    return String(value)
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase();
  }

  function escapeHtml(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

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

  function clip(text, max = LIMITS.excerpt) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    if (value.length <= max) return value;
    const cut = value.slice(0, max);
    const space = cut.lastIndexOf(' ');
    const base = (space > max * 0.6 ? cut.slice(0, space) : cut).trim();
    return `${base}…`;
  }

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

  function articleMeta(item) {
    if (!item || typeof item !== 'object') return null;
    const link = canonicalArticleUrl(item.link);
    if (!link) return null;
    const title = String(item.title || '').replace(/\s+/g, ' ').trim();
    if (!title) return null;
    return {
      id: articleId(link),
      title,
      source: String(item.source || '').trim(),
      sourceId: slugify(item.source || ''),
      link,
      date: typeof item.date === 'string' ? item.date : '',
      excerpt: clip(item.leadExcerpt || item.excerpt || ''),
      image: safeHttpUrl(item.image),
      institution: String(item.institution || '').trim(),
      author: String(item.author || '').trim(),
      region: String(item.region || '').trim(),
      lang: String(item.lang || '').trim(),
    };
  }

  function emptyLibrary() {
    return { v: 1, favorites: [], history: [] };
  }

  function defaultNotifications() {
    return { enabled: false, follows: false, digest: false, newMedia: false };
  }

  function emptyPrefs() {
    return {
      v: 1,
      theme: 'system',
      hidden: [],
      regions: [],
      keywords: [],
      seenAt: '',
      notifications: defaultNotifications(),
    };
  }

  function uniqueSlugs(values) {
    const out = [];
    const seen = new Set();
    for (const value of values || []) {
      const id = slugify(value);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  function normalizeLibrary(library) {
    const source = library && typeof library === 'object' ? library : {};
    const mapList = (list, stamp) => {
      const out = [];
      const seen = new Set();
      for (const item of list || []) {
        const meta = articleMeta(item);
        if (!meta || seen.has(meta.id)) continue;
        seen.add(meta.id);
        const when = item && typeof item[stamp] === 'number' ? item[stamp] : Date.now();
        out.push({ ...meta, [stamp]: when });
      }
      return out;
    };
    return {
      v: 1,
      favorites: mapList(source.favorites, 'savedAt').slice(0, LIMITS.favorites),
      history: mapList(source.history, 'viewedAt').slice(0, LIMITS.history),
    };
  }

  function normalizeKeyword(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizePrefs(prefs) {
    const source = prefs && typeof prefs === 'object' ? prefs : {};
    const theme = source.theme === 'light' || source.theme === 'dark' ? source.theme : 'system';
    const keywords = [];
    const seenWords = new Set();
    for (const value of source.keywords || []) {
      const word = normalizeKeyword(value);
      const key = fold(word);
      if (key.length < 2 || key.length > 40 || seenWords.has(key)) continue;
      seenWords.add(key);
      keywords.push(word);
      if (keywords.length >= LIMITS.keywords) break;
    }
    const notes = defaultNotifications();
    const incoming = source.notifications && typeof source.notifications === 'object' ? source.notifications : {};
    for (const key of NOTIFICATION_KEYS) notes[key] = Boolean(incoming[key]);
    const seenAt = typeof source.seenAt === 'string' && !Number.isNaN(Date.parse(source.seenAt))
      ? new Date(source.seenAt).toISOString()
      : '';
    return {
      v: 1,
      theme,
      hidden: uniqueSlugs(source.hidden),
      regions: uniqueSlugs(source.regions),
      keywords,
      seenAt,
      notifications: notes,
    };
  }

  function addFavorite(library, article, now = Date.now()) {
    const current = normalizeLibrary(library);
    const meta = articleMeta(article);
    if (!meta) return current;
    const rest = current.favorites.filter((item) => item.id !== meta.id);
    return normalizeLibrary({
      ...current,
      favorites: [{ ...meta, savedAt: now }, ...rest],
    });
  }

  function removeFavorite(library, id) {
    const current = normalizeLibrary(library);
    return {
      ...current,
      favorites: current.favorites.filter((item) => item.id !== id),
    };
  }

  function isFavorite(library, id) {
    return normalizeLibrary(library).favorites.some((item) => item.id === id);
  }

  function clearFavorites(library) {
    const current = normalizeLibrary(library);
    return { ...current, favorites: [] };
  }

  function recordView(library, article, now = Date.now()) {
    const current = normalizeLibrary(library);
    const meta = articleMeta(article);
    if (!meta) return current;
    const rest = current.history.filter((item) => item.id !== meta.id);
    return normalizeLibrary({
      ...current,
      history: [{ ...meta, viewedAt: now }, ...rest],
    });
  }

  function clearHistory(library) {
    const current = normalizeLibrary(library);
    return { ...current, history: [] };
  }

  function clearLibrary() {
    return emptyLibrary();
  }

  function setHidden(prefs, id, hidden) {
    const current = normalizePrefs(prefs);
    const slug = slugify(id);
    if (!slug) return current;
    const has = current.hidden.includes(slug);
    if (hidden && !has) return normalizePrefs({ ...current, hidden: [...current.hidden, slug] });
    if (!hidden && has) return normalizePrefs({ ...current, hidden: current.hidden.filter((item) => item !== slug) });
    return current;
  }

  function isHidden(prefs, id) {
    const slug = slugify(id);
    return Boolean(slug) && normalizePrefs(prefs).hidden.includes(slug);
  }

  function setRegionFollow(prefs, region, followed) {
    const current = normalizePrefs(prefs);
    const slug = slugify(region);
    if (!slug) return current;
    const has = current.regions.includes(slug);
    if (followed && !has) return normalizePrefs({ ...current, regions: [...current.regions, slug] });
    if (!followed && has) return normalizePrefs({ ...current, regions: current.regions.filter((item) => item !== slug) });
    return current;
  }

  function addKeyword(prefs, raw) {
    const current = normalizePrefs(prefs);
    const word = normalizeKeyword(raw);
    const key = fold(word);
    if (key.length < 2 || key.length > 40) return current;
    if (current.keywords.some((item) => fold(item) === key)) return current;
    return normalizePrefs({ ...current, keywords: [...current.keywords, word] });
  }

  function removeKeyword(prefs, raw) {
    const current = normalizePrefs(prefs);
    const key = fold(raw);
    return normalizePrefs({
      ...current,
      keywords: current.keywords.filter((item) => fold(item) !== key),
    });
  }

  function updateNotifications(prefs, patch) {
    const current = normalizePrefs(prefs);
    const next = { ...current.notifications };
    for (const key of NOTIFICATION_KEYS) {
      if (patch && Object.prototype.hasOwnProperty.call(patch, key)) next[key] = Boolean(patch[key]);
    }
    return normalizePrefs({ ...current, notifications: next });
  }

  /** v1 : aucun canal système. Les préférences restent locales pour un service futur. */
  function systemNotificationsActive() {
    return false;
  }

  function markSeen(prefs, iso) {
    const when = typeof iso === 'string' && !Number.isNaN(Date.parse(iso))
      ? new Date(iso).toISOString()
      : new Date().toISOString();
    return normalizePrefs({ ...normalizePrefs(prefs), seenAt: when });
  }

  function setTheme(prefs, theme) {
    return normalizePrefs({ ...normalizePrefs(prefs), theme });
  }

  function matchesKeyword(item, keywords) {
    if (!keywords || !keywords.length) return false;
    const hay = fold([
      item && item.title,
      item && item.excerpt,
      item && item.leadExcerpt,
      item && item.source,
      item && item.institution,
      item && item.author,
    ].filter(Boolean).join(' '));
    return keywords.some((word) => hay.includes(fold(word)));
  }

  function filterFeed(items, options = {}) {
    const follows = new Set((options.follows || []).map(slugify).filter(Boolean));
    const hidden = new Set((options.hidden || []).map(slugify).filter(Boolean));
    const regions = new Set((options.regions || []).map(slugify).filter(Boolean));
    const keywords = (options.keywords || []).map(normalizeKeyword).filter((word) => fold(word).length >= 2);
    const mode = options.mode || 'all';
    const out = [];
    for (const item of items || []) {
      if (!item) continue;
      const sourceId = slugify(item.sourceId || item.source);
      if (!sourceId || hidden.has(sourceId)) continue;
      if (mode === 'follows' && !follows.has(sourceId)) continue;
      if (mode === 'regions' && !regions.has(slugify(item.region))) continue;
      if (mode === 'keywords' && !matchesKeyword(item, keywords)) continue;
      out.push(item);
    }
    return out;
  }

  function countFreshFollows(items, follows, sinceIso) {
    const ids = new Set((follows || []).map(slugify).filter(Boolean));
    const since = Date.parse(sinceIso || '');
    if (!ids.size || Number.isNaN(since)) return 0;
    let count = 0;
    for (const item of items || []) {
      if (!ids.has(slugify(item && (item.sourceId || item.source)))) continue;
      const when = Date.parse(item && item.date);
      if (!Number.isNaN(when) && when > since) count += 1;
    }
    return count;
  }

  function searchFeed(items, query, hidden = []) {
    const needle = fold(query).trim();
    const blocked = new Set(hidden.map(slugify).filter(Boolean));
    if (needle.length < 2) return [];
    return (items || []).filter((item) => {
      if (!item || blocked.has(slugify(item.sourceId || item.source))) return false;
      return matchesKeyword(item, [needle]);
    });
  }

  function findById(items, id) {
    const wanted = String(id || '').toLowerCase();
    if (!/^[0-9a-f]{16}$/.test(wanted)) return null;
    for (const item of items || []) {
      const meta = articleMeta(item);
      if (meta && meta.id === wanted) return meta;
    }
    return null;
  }

  function decodePart(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  function parseHashRoute(hash) {
    const raw = String(hash || '').replace(/^#\/?/, '');
    const [path, query = ''] = raw.split('?');
    const parts = path.split('/').filter(Boolean).map(decodePart);
    const params = new URLSearchParams(query);
    if (!parts.length || parts[0] === 'accueil') {
      return { kind: 'home', filter: params.get('filtre') || '' };
    }
    if (parts[0] === 'explorer') {
      if (parts[1] === 'source' && parts[2]) return { kind: 'journal', slug: slugify(parts[2]) };
      return {
        kind: 'explorer',
        institution: slugify(params.get('etablissement') || ''),
        section: params.get('section') || '',
      };
    }
    if (parts[0] === 'recherche') return { kind: 'search', q: params.get('q') || '' };
    if (parts[0] === 'enregistres') return { kind: 'saved', tab: params.get('onglet') || 'favoris' };
    if (parts[0] === 'reglages') return { kind: 'settings' };
    if (parts[0] === 'article' && parts[1] && /^[0-9a-f]{16}$/.test(parts[1])) {
      return { kind: 'article', id: parts[1] };
    }
    if (parts[0] === 'radio' && parts[1]) return { kind: 'radio', slug: slugify(parts[1]) };
    return { kind: 'home', filter: '' };
  }

  function parseDeepLink(input) {
    if (!input) return { kind: 'home', filter: '' };
    let url;
    try {
      url = new URL(String(input), ORIGIN);
    } catch {
      return { kind: 'home', filter: '' };
    }
    const host = url.hostname.replace(/^www\./, '');
    const local = host === 'localhost' || host === '127.0.0.1' || host === '';
    const ours = host === 'le-radar.ca' || local;
    if (!ours) return { kind: 'external', url: safeHttpUrl(url.href) || '' };
    const parts = url.pathname.split('/').filter(Boolean).map(decodePart);
    if (parts[0] === 'article') {
      const id = (url.searchParams.get('id') || parts[1] || '').toLowerCase();
      if (/^[0-9a-f]{16}$/.test(id)) return { kind: 'article', id };
      return { kind: 'home', filter: '' };
    }
    if (parts[0] === 'journaux' && parts[1]) return { kind: 'journal', slug: slugify(parts[1]) };
    if (parts[0] === 'radios' && parts[1]) return { kind: 'radio', slug: slugify(parts[1]) };
    if (parts[0] === 'etablissements' && parts[1]) return { kind: 'institution', slug: slugify(parts[1]) };
    if (parts[0] === 'en' && parts[1] === 'journaux' && parts[2]) return { kind: 'journal', slug: slugify(parts[2]) };
    if (url.hash) return parseHashRoute(url.hash);
    return { kind: 'home', filter: '' };
  }

  function hashForRoute(route) {
    const kind = route && route.kind;
    if (kind === 'article' && route.id) return `#/article/${route.id}`;
    if (kind === 'journal' && route.slug) return `#/explorer/source/${route.slug}`;
    if (kind === 'radio' && route.slug) return `#/radio/${route.slug}`;
    if (kind === 'institution' && route.slug) return `#/explorer?etablissement=${route.slug}`;
    if (kind === 'explorer') {
      return route.institution ? `#/explorer?etablissement=${route.institution}` : '#/explorer';
    }
    if (kind === 'search') {
      return route.q ? `#/recherche?q=${encodeURIComponent(route.q)}` : '#/recherche';
    }
    if (kind === 'saved') return '#/enregistres';
    if (kind === 'settings') return '#/reglages';
    if (route && route.filter) return `#/accueil?filtre=${encodeURIComponent(route.filter)}`;
    return '#/accueil';
  }

  function shareOriginal(article) {
    const meta = articleMeta(article);
    if (!meta) return null;
    const text = meta.source ? `${meta.title} — ${meta.source}` : meta.title;
    return {
      title: meta.title,
      text,
      url: meta.link,
      dialogTitle: 'Partager l’article original',
    };
  }

  function shareDiscovery(article, origin = ORIGIN) {
    const meta = articleMeta(article);
    if (!meta) return null;
    const base = String(origin || ORIGIN).replace(/\/$/, '');
    return {
      title: meta.title,
      text: meta.source ? `Fiche LE-RADAR — ${meta.source}` : 'Fiche LE-RADAR',
      url: `${base}/article/?id=${meta.id}`,
      dialogTitle: 'Partager la fiche LE-RADAR',
    };
  }

  function publisherAction(article) {
    const meta = articleMeta(article);
    if (!meta) return null;
    return {
      url: meta.link,
      label: meta.source ? `Lire chez ${meta.source}` : 'Lire l’article original',
      source: meta.source,
    };
  }

  function pickFeed({ online, networkItems, snapshotItems, bundledItems } = {}) {
    if (online && Array.isArray(networkItems) && networkItems.length) {
      return { items: networkItems, origin: 'network' };
    }
    if (Array.isArray(snapshotItems) && snapshotItems.length) {
      return { items: snapshotItems, origin: 'snapshot' };
    }
    if (Array.isArray(bundledItems) && bundledItems.length) {
      return { items: bundledItems, origin: 'bundle' };
    }
    return { items: [], origin: 'empty' };
  }

  function buildSnapshot(feed, savedAt) {
    const items = Array.isArray(feed) ? feed : (feed && feed.items) || [];
    return {
      v: 1,
      savedAt: savedAt || new Date().toISOString(),
      updated: feed && !Array.isArray(feed) ? (feed.updated || '') : '',
      items: items.map(articleMeta).filter(Boolean).slice(0, LIMITS.snapshot),
    };
  }

  function sourceRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name || '').trim();
    const id = slugify(name);
    if (!id || !name) return null;
    const site = safeHttpUrl(raw.site || '');
    return {
      id,
      name,
      institution: String(raw.institution || '').trim(),
      institutionId: slugify(raw.institution || ''),
      region: String(raw.region || '').trim(),
      regionId: slugify(raw.region || ''),
      lang: String(raw.lang || '').trim(),
      type: String(raw.type || '').trim(),
      site,
    };
  }

  function sourceCatalog(rawSources, items) {
    const list = [];
    const seen = new Set();
    const active = Array.isArray(rawSources) ? rawSources : (rawSources && rawSources.active) || [];
    const push = (record) => {
      if (!record || seen.has(record.id)) return;
      seen.add(record.id);
      list.push(record);
    };
    for (const raw of active) push(sourceRecord(raw));
    for (const item of items || []) {
      push(sourceRecord({
        name: item.source,
        institution: item.institution,
        region: item.region,
        lang: item.lang,
        type: item.type,
      }));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  function radioCatalog(radios) {
    return (Array.isArray(radios) ? radios : []).map((radio) => {
      const name = String((radio && (radio.name || radio.fullName)) || '').trim();
      const id = slugify((radio && radio.id) || name);
      if (!id || !name) return null;
      return {
        id,
        name,
        institution: String(radio.institution || '').trim(),
        region: String(radio.region || '').trim(),
        frequency: String(radio.frequency || '').trim(),
        website: safeHttpUrl(radio.website),
        stream: safeHttpUrl(radio.stream),
        slogan: String(radio.slogan || '').trim(),
      };
    }).filter(Boolean);
  }

  function institutionColor(brand, institution) {
    const table = brand && brand.institutions;
    if (!table || !institution) return '';
    const entry = table[institution];
    const color = entry && typeof entry === 'object' ? entry.color : entry;
    if (typeof color !== 'string') return '';
    return /^#[0-9a-fA-F]{6}$/.test(color.trim()) ? color.trim() : '';
  }

  function homeMode(filter, follows) {
    if (filter === 'tout' || filter === 'suivis' || filter === 'mots' || filter === 'regions') return filter;
    return follows && follows.length ? 'suivis' : 'tout';
  }

  const api = {
    ORIGIN,
    APP_VERSION,
    LIBRARY_KEY,
    PREFS_KEY,
    SNAPSHOT_KEY,
    LIMITS,
    slugify,
    fold,
    escapeHtml,
    safeHttpUrl,
    clip,
    canonicalArticleUrl,
    articleId,
    articleMeta,
    emptyLibrary,
    emptyPrefs,
    normalizeLibrary,
    normalizePrefs,
    addFavorite,
    removeFavorite,
    isFavorite,
    clearFavorites,
    recordView,
    clearHistory,
    clearLibrary,
    setHidden,
    isHidden,
    setRegionFollow,
    addKeyword,
    removeKeyword,
    updateNotifications,
    systemNotificationsActive,
    markSeen,
    setTheme,
    filterFeed,
    countFreshFollows,
    searchFeed,
    findById,
    parseDeepLink,
    parseHashRoute,
    hashForRoute,
    shareOriginal,
    shareDiscovery,
    publisherAction,
    pickFeed,
    buildSnapshot,
    sourceRecord,
    sourceCatalog,
    radioCatalog,
    institutionColor,
    homeMode,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (global) global.RadarMobile = api;
}(typeof globalThis === 'object' ? globalThis : this));

/**
 * Canaux de distribution d’un média étudiant.
 *
 * MediaSource = une entrée de news-sources.json (journal) ou radios.json
 * (radio). DistributionChannel = un moyen de le lire ou de le suivre
 * ailleurs (site, RSS, Google Actualités, Instagram…).
 *
 * Les URL viennent du registre éditorial, éventuellement enrichies par
 * social-feed.json (récolte). Une URL récoltée n’est jamais affichée
 * comme vérifiée. Google Actualités n’est jamais inventé ni scrapé.
 *
 * Utilisé par le générateur SEO (Node) et, en navigateur, par le store
 * de suivi (slug). Voir docs/media-channels.md.
 */
'use strict';

(function initMediaChannels(global) {
const CHANNEL_TYPES = [
  'website',
  'google-news',
  'rss',
  'instagram',
  'youtube',
  'podcast',
  'facebook',
  'x',
  'tiktok',
];

const CHANNEL_STATUSES = ['unknown', 'detected', 'verified', 'unavailable'];

const GOOGLE_NEWS_HOSTS = new Set(['news.google.com', 'news.google.ca']);

const JUNK_SOCIAL_HANDLES = new Set([
  'wordpresscom',
  'wordpress.com',
  'profile.php',
  'share',
  'sharer',
  'dialog',
  'explore',
  'accounts',
  'reel',
  'reels',
  'pages',
  'groups',
  'intent',
  'hashtag',
  'login',
  'signup',
]);

const LABELS = {
  fr: {
    website: 'Site officiel',
    'google-news': 'Google Actualités',
    rss: 'RSS',
    instagram: 'Instagram',
    youtube: 'YouTube',
    podcast: 'Balado',
    facebook: 'Facebook',
    x: 'X',
    tiktok: 'TikTok',
  },
  en: {
    website: 'Official website',
    'google-news': 'Google News',
    rss: 'RSS',
    instagram: 'Instagram',
    youtube: 'YouTube',
    podcast: 'Podcast',
    facebook: 'Facebook',
    x: 'X',
    tiktok: 'TikTok',
  },
};

function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function mediaIdFromName(name = '') {
  return slugify(name);
}

function safeHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.href;
  } catch {
    return '';
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function looksLikeRssUrl(url) {
  const href = safeHttpUrl(url);
  if (!href) return false;
  try {
    const parsed = new URL(href);
    const path = parsed.pathname.toLowerCase();
    if (/\/(feed|rss|atom)(\.xml)?\/?$/.test(path)) return true;
    if (path.includes('/feed/') || path.includes('/rss/')) return true;
    if (/\.(xml|rss|atom)$/.test(path)) return true;
    if (parsed.searchParams.has('feed')) return true;
    return false;
  } catch {
    return false;
  }
}

function isRssIngest(source = {}) {
  const mode = String(source.fetchMode || 'rss').toLowerCase();
  return mode === 'rss' || mode === '';
}

/**
 * Page d’accueil du média. `site` du registre d’abord ; sinon origine d’un
 * flux RSS classique (`/feed/`). On ne devine pas à partir d’une catégorie
 * institutionnelle ou d’un CMS headless.
 */
function deriveWebsite(source = {}) {
  const site = safeHttpUrl(source.site || source.website);
  if (site) return site;
  if (String(source.fetchMode || '').toLowerCase() === 'firebase') {
    return safeHttpUrl(source.url);
  }
  const feed = safeHttpUrl(source.url);
  if (!feed || !looksLikeRssUrl(feed)) return '';
  try {
    const parsed = new URL(feed);
    const path = parsed.pathname.replace(/\/+$/, '').toLowerCase();
    if (/\/(feed|rss|atom)(\.xml)?$/.test(path) && path.split('/').filter(Boolean).length <= 2) {
      return `${parsed.protocol}//${parsed.host}/`;
    }
  } catch {
    /* ignore */
  }
  return '';
}

function isGoogleNewsPublicationUrl(url) {
  const href = safeHttpUrl(url);
  if (!href) return false;
  try {
    const parsed = new URL(href);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    if (!GOOGLE_NEWS_HOSTS.has(host)) return false;
    if (!/^\/publications\/[^/]+/i.test(parsed.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

function normalizeStatus(value, fallback = 'unknown') {
  const status = String(value || '').toLowerCase();
  return CHANNEL_STATUSES.includes(status) ? status : fallback;
}

function googleNewsFromSource(source = {}) {
  const raw = source.googleNews;
  if (!raw) return null;
  if (typeof raw === 'string') {
    if (!isGoogleNewsPublicationUrl(raw)) return null;
    return { url: safeHttpUrl(raw), status: 'verified', origin: 'registry' };
  }
  if (typeof raw !== 'object') return null;
  const status = normalizeStatus(raw.status, raw.verified === true ? 'verified' : 'unknown');
  if (status === 'unavailable') {
    return { url: '', status: 'unavailable', origin: 'registry' };
  }
  const url = safeHttpUrl(raw.url);
  if (!url || !isGoogleNewsPublicationUrl(url)) return null;
  return { url, status, origin: 'registry' };
}

/**
 * Découverte future : lire le site du média (schema.org, sameAs, badge
 * Publisher Center). Ne contacte jamais Google. Ne fabrique jamais d’URL.
 */
function discoverGoogleNewsChannel(/* source */) {
  return null;
}

function googleNewsStatus(source = {}) {
  const channel = googleNewsFromSource(source) || discoverGoogleNewsChannel(source);
  if (!channel) return 'unknown';
  return channel.status || 'unknown';
}

function socialHandle(url, type) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (type === 'youtube' && parts[0] === 'channel') return parts[1] || '';
    if (type === 'facebook' && parts[0] === 'p') return parts[1] || '';
    if (type === 'tiktok') return String(parts[0] || '').replace(/^@/, '');
    return String(parts[0] || '').replace(/^@/, '');
  } catch {
    return '';
  }
}

function foldKey(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function nameTokens(value = '') {
  return foldKey(value)
    .split(' ')
    .map((token) => token.replace(/^(le|la|les|the|l|d|de|du|des)$/i, ''))
    .filter((token) => token.length >= 4);
}

function handleMatchesMedia(handle, sourceName) {
  const foldedHandle = foldKey(handle).replace(/\s+/g, '');
  if (!foldedHandle || foldedHandle.length < 3) return false;
  const foldedName = foldKey(sourceName).replace(/\s+/g, '');
  if (foldedName && (foldedHandle.includes(foldedName) || foldedName.includes(foldedHandle))) {
    return true;
  }
  return nameTokens(sourceName).some((token) => foldedHandle.includes(token));
}

function isLikelySocialProfile(type, url, sourceName = '') {
  const href = safeHttpUrl(url);
  if (!href) return false;
  let parsed;
  try {
    parsed = new URL(href);
  } catch {
    return false;
  }
  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  const handle = socialHandle(href, type);
  const handleKey = foldKey(handle).replace(/\s+/g, '');

  if (JUNK_SOCIAL_HANDLES.has(handleKey)) return false;

  if (type === 'instagram') {
    if (!/(^|\.)instagram\.com$/.test(host)) return false;
    if (/^\/(explore|accounts|p|reel|reels)\//i.test(parsed.pathname)) return false;
  } else if (type === 'facebook') {
    if (!/(^|\.)facebook\.com$/.test(host)) return false;
    if (/^\/profile\.php$/i.test(parsed.pathname.replace(/\/+$/, ''))) return false;
    if (/^\d+$/.test(handle) && handle.length <= 6) return false;
  } else if (type === 'x') {
    if (!/(^|\.)(x|twitter)\.com$/.test(host)) return false;
    if (/^\/intent\//i.test(parsed.pathname)) return false;
  } else if (type === 'youtube') {
    if (!/(^|\.)youtube\.com$/.test(host) && !/(^|\.)youtu\.be$/.test(host)) return false;
    if (/^UC[\w-]{20,}$/.test(handle) && !handleMatchesMedia(handle, sourceName)) return false;
  } else if (type === 'tiktok') {
    if (!/(^|\.)tiktok\.com$/.test(host)) return false;
  } else if (type === 'podcast') {
    if (!href) return false;
  } else {
    return false;
  }

  if (sourceName && !handleMatchesMedia(handle, sourceName)) return false;
  return true;
}

function registrySocialUrl(source, type) {
  if (type === 'x') return source.x || source.twitter || '';
  if (type === 'podcast') return source.podcast || source.podcastUrl || '';
  return source[type] || '';
}

function channel(type, url, status, origin) {
  const href = safeHttpUrl(url);
  if (!href && status !== 'unavailable') return null;
  return {
    type,
    url: href,
    status: normalizeStatus(status, origin === 'registry' ? 'verified' : 'detected'),
    origin: origin || 'registry',
  };
}

function listChannels(source = {}, { socialNetworks = [], kind = 'journal' } = {}) {
  const channels = [];
  const name = source.name || source.fullName || '';
  const seen = new Set();

  const push = (entry) => {
    if (!entry || !entry.type) return;
    if (entry.status === 'unavailable') {
      if (!seen.has(entry.type)) {
        channels.push(entry);
        seen.add(entry.type);
      }
      return;
    }
    if (!entry.url || seen.has(entry.type)) return;
    channels.push(entry);
    seen.add(entry.type);
  };

  const website = deriveWebsite(source);
  if (website) push(channel('website', website, 'verified', 'registry'));

  const googleNews = googleNewsFromSource(source);
  if (googleNews) push(channel('google-news', googleNews.url, googleNews.status, 'registry'));

  if (kind !== 'radio' && isRssIngest(source) && looksLikeRssUrl(source.url)) {
    push(channel('rss', source.url, 'verified', 'registry'));
  }

  for (const type of ['instagram', 'youtube', 'podcast', 'facebook', 'x', 'tiktok']) {
    const url = registrySocialUrl(source, type);
    if (!url) continue;
    if (type !== 'podcast' && !isLikelySocialProfile(type, url, name) && type !== 'youtube') {
      // Preset éditorial : on fait confiance au registre même si le nom
      // ne matche pas parfaitement (ex. polyscope_aep).
      if (!safeHttpUrl(url)) continue;
    }
    if (type !== 'podcast' && type !== 'youtube' && !safeHttpUrl(url)) continue;
    if ((type === 'instagram' || type === 'facebook' || type === 'x' || type === 'tiktok' || type === 'youtube')
      && !safeHttpUrl(url)) continue;
    push(channel(type, url, 'verified', 'registry'));
  }

  for (const network of Array.isArray(socialNetworks) ? socialNetworks : []) {
    const type = network.type === 'twitter' ? 'x' : network.type;
    if (!CHANNEL_TYPES.includes(type)) continue;
    if (type === 'website' || type === 'rss' || type === 'google-news') continue;
    const url = network.url;
    if (!isLikelySocialProfile(type, url, name)) continue;
    push(channel(type, url, 'detected', 'social-feed'));
  }

  return CHANNEL_TYPES
    .map((type) => channels.find((entry) => entry.type === type))
    .filter(Boolean);
}

function listVisibleChannels(source, opts) {
  return listChannels(source, opts).filter((entry) => entry.status !== 'unavailable' && entry.url);
}

function channelLabel(type, lang = 'fr') {
  const table = lang === 'en' ? LABELS.en : LABELS.fr;
  return table[type] || type;
}

function channelHint(type, lang = 'fr') {
  if (type !== 'rss') return '';
  return lang === 'en'
    ? 'Article feed — open it in a news reader'
    : 'Flux d’articles, à ouvrir dans un lecteur de nouvelles';
}

function sameAsUrls(source, opts) {
  return listVisibleChannels(source, opts)
    .filter((entry) => entry.type !== 'rss')
    .map((entry) => entry.url);
}

function indexSocialFeed(socialFeed) {
  const map = new Map();
  const items = Array.isArray(socialFeed)
    ? socialFeed
    : (socialFeed && socialFeed.items) || [];
  for (const item of items) {
    if (item && item.name) map.set(item.name, item.networks || []);
  }
  return map;
}

function channelCoverage(sources = [], { socialByName, kind = 'journal' } = {}) {
  const counts = { total: sources.length };
  for (const type of CHANNEL_TYPES) counts[type] = 0;
  for (const source of sources) {
    const networks = socialByName && typeof socialByName.get === 'function'
      ? (socialByName.get(source.name) || [])
      : [];
    const seen = new Set(
      listVisibleChannels(source, { socialNetworks: networks, kind }).map((entry) => entry.type),
    );
    for (const type of seen) counts[type] += 1;
  }
  return counts;
}

const api = {
  CHANNEL_TYPES,
  CHANNEL_STATUSES,
  slugify,
  mediaIdFromName,
  safeHttpUrl,
  looksLikeRssUrl,
  isRssIngest,
  deriveWebsite,
  isGoogleNewsPublicationUrl,
  googleNewsFromSource,
  googleNewsStatus,
  discoverGoogleNewsChannel,
  isLikelySocialProfile,
  listChannels,
  listVisibleChannels,
  channelLabel,
  channelHint,
  sameAsUrls,
  indexSocialFeed,
  channelCoverage,
};

if (typeof module === 'object' && module.exports) {
  module.exports = api;
}
if (global) global.MediaChannels = api;
}(typeof globalThis === 'object' ? globalThis : this));

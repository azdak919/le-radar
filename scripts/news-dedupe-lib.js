/**
 * Dédoublonnage des articles du fil (news.json) et des flux RSS.
 *
 * Deux articles sont la même pièce s’ils ont :
 *  - le même lien canonique (http/https, www, slash final, /amp, utm_*, #ancre) ;
 *  - ou la même source, le même titre normalisé et le même jour civil
 *    à Montréal (variantes d’URL : L’Exemplaire /a-la-une/ et /actualites/,
 *    chemins The Tribune, suffixe -2 de La Pige ou du Délit).
 *
 * On ne fusionne pas une série récurrente publiée à des jours différents
 * (Quartier Libre, « Cinq nouvelles de la semaine »).
 * On ne fusionne jamais deux médias distincts.
 */
const { articleDedupeKey } = require('./live-link-health-lib');
const { zonedYmd } = require('./session-freshness-lib');

function foldKey(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’'`]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim();
}

function titleDayKey(item) {
  const source = foldKey(item && item.source);
  const title = foldKey(item && item.title);
  const published = Date.parse((item && item.date) || '');
  if (!source || !title || !Number.isFinite(published)) return '';
  const day = zonedYmd(new Date(published));
  if (!day) return '';
  return `${source}|${title}|${day}`;
}

function isBetterCopy(candidate, current) {
  if (candidate && candidate.imageLocal && !(current && current.imageLocal)) return true;
  return false;
}

/**
 * Garde une entrée par article. L’ordre est préservé ; entre deux copies,
 * on préfère celle qui a une image locale.
 * @returns {{ items: object[], removed: number }}
 */
function dedupeArticles(items = []) {
  const kept = [];
  const urlIndex = new Map();
  const titleDayIndex = new Map();
  let removed = 0;

  function remember(item, at) {
    const url = articleDedupeKey(item && item.link);
    const day = titleDayKey(item);
    if (url) urlIndex.set(url, at);
    if (day) titleDayIndex.set(day, at);
  }

  function indexOf(item) {
    const url = articleDedupeKey(item && item.link);
    if (url && urlIndex.has(url)) return urlIndex.get(url);
    const day = titleDayKey(item);
    if (day && titleDayIndex.has(day)) return titleDayIndex.get(day);
    return -1;
  }

  for (const item of items) {
    const at = indexOf(item);
    if (at < 0) {
      remember(item, kept.length);
      kept.push(item);
      continue;
    }
    removed += 1;
    if (isBetterCopy(item, kept[at])) kept[at] = item;
    remember(item, at);
    remember(kept[at], at);
  }

  return { items: kept, removed };
}

function dedupeArticlesList(items = []) {
  return dedupeArticles(items).items;
}

module.exports = {
  foldKey,
  titleDayKey,
  dedupeArticles,
  dedupeArticlesList,
};

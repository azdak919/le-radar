// LE-RADAR — météo du mât
// Script classique (pas type=module). Les liaisons partagées vivent dans
// radar-state.js (var) ; les function declarations sont globales.

// ─── Météo des principaux campus (desktop / tablette) ────────────────────────
const WEATHER_CACHE_KEY = 'le_radar_masthead_weather_v2';
const WEATHER_CACHE_MS = 15 * 60 * 1000;
// Repli si le Worker ne répond pas : mieux vaut des températures d'il y a
// quelques heures qu'un mât sans météo (il fallait rafraîchir à la main).
const WEATHER_STALE_MS = 3 * 60 * 60 * 1000;
// Un essai unique de 4,5 s échouait sur un MISS du Worker (Open-Meteo puis
// met.no) ou un réseau lent au premier chargement : délais croissants.
const WEATHER_FETCH_TIMEOUTS_MS = [6000, 10000, 15000];
const WEATHER_RETRY_DELAY_MS = 2000;
// Catalogue : weather-cities-data.js (var WEATHER_CITIES)
// Radar principal : variante remplie et animée. Le Pomo pointe explicitement
// vers /assets/meteocons/ pour rester statique et discret.
const METEOCONS_BASE = '/assets/meteocons/animated/';
function weatherIcon(code, isDay = 1) {
  const day = !!isDay;
  let name = day ? 'overcast-day' : 'overcast-night';
  if (code === 0) name = day ? 'clear-day' : 'clear-night';
  else if ([1, 2].includes(code)) name = day ? 'partly-cloudy-day' : 'partly-cloudy-night';
  else if ([45, 48].includes(code)) name = day ? 'fog-day' : 'fog-night';
  else if ([51, 53, 55, 56, 57].includes(code)) name = 'drizzle';
  else if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) name = 'rain';
  else if ([71, 73, 75, 77, 85, 86].includes(code)) name = 'snow';
  else if ([95, 96, 99].includes(code)) name = day ? 'thunderstorms-day' : 'thunderstorms-night';
  return `<img class="weather-icon-meteocon" src="${METEOCONS_BASE}${name}.svg" alt="" aria-hidden="true">`;
}

function weatherTone(code) {
  if (code === 0 || [1, 2].includes(code)) return 'sun';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'storm';
  return 'cloud';
}

function weatherUiEn() {
  try {
    if (typeof RadarTranslate !== 'undefined' && RadarTranslate?.getMode?.() === 'en') return true;
  } catch { /* ignore */ }
  return document.documentElement.lang.startsWith('en');
}

/** Jour i des prévisions quotidiennes (0 = aujourd’hui, 1 = demain). */
function weatherDayPart(daily, index) {
  if (!daily) return null;
  const max = Number(daily.temperature_2m_max?.[index]);
  const min = Number(daily.temperature_2m_min?.[index]);
  if (!Number.isFinite(max) || !Number.isFinite(min)) return null;
  const code = Number(daily.weather_code?.[index]);
  return {
    max: Math.round(max),
    min: Math.round(min),
    code: Number.isFinite(code) ? code : 3,
  };
}

/**
 * both = max, min et demain rentrent dans le vide.
 * today = seulement le jour. off = la puce reste ville + degré.
 */
function weatherExtraMode(slack, todayW, bothW) {
  const pad = 4;
  if (bothW > 0 && slack >= bothW + pad) return 'both';
  if (todayW > 0 && slack >= todayW + pad) return 'today';
  return 'off';
}

function weatherExtraLabelText(en) {
  return { max: 'Max ', min: 'Min ', next: en ? 'Tomorrow' : 'Demain' };
}

function syncWeatherCityAria(el) {
  const base = el.dataset.weatherAria;
  if (!base) return;
  const en = weatherUiEn();
  const max = el.dataset.wxMax;
  const min = el.dataset.wxMin;
  const next = el.dataset.wxNext;
  let label = base;
  if (max && min) {
    label += en
      ? `, high ${max}°, low ${min}°`
      : `, max ${max}°, min ${min}°`;
    if (next) label += en ? `, tomorrow ${next}°` : `, demain ${next}°`;
  }
  el.setAttribute('aria-label', label);
  const titleBase = el.dataset.weatherTitle;
  if (!titleBase) return;
  el.title = max && min
    ? `${titleBase} · ${max}° / ${min}°${next ? ` · ${en ? 'tomorrow' : 'demain'} ${next}°` : ''}`
    : titleBase;
}

function syncWeatherExtraLanguage() {
  if (!MASTHEAD_WEATHER) return;
  const labels = weatherExtraLabelText(weatherUiEn());
  MASTHEAD_WEATHER.querySelectorAll('.masthead-weather__extra').forEach((extra) => {
    const max = extra.querySelector('[data-wx-label="max"]');
    const min = extra.querySelector('[data-wx-label="min"]');
    const next = extra.querySelector('[data-wx-label="next"]');
    if (max) max.textContent = labels.max;
    if (min) min.textContent = labels.min;
    if (next) next.textContent = labels.next;
  });
  MASTHEAD_WEATHER.querySelectorAll('.masthead-weather__city').forEach((el) => {
    syncWeatherCityAria(el);
  });
}

function weatherExtraSpan(className, text) {
  const node = document.createElement('span');
  node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Max / min du jour, puis demain (icône + max). Après le degré, comme le Kiosque.
 *  Hors flux tant que la puce n’a pas de vide. */
function paintWeatherExtra(el, entry) {
  const today = weatherDayPart(entry?.daily, 0);
  const tomorrow = weatherDayPart(entry?.daily, 1);
  let extra = el.querySelector('.masthead-weather__extra');
  if (!today) {
    extra?.remove();
    delete el.dataset.wxMax;
    delete el.dataset.wxMin;
    delete el.dataset.wxNext;
    el.classList.remove('has-room');
    el.dataset.weatherExtra = 'off';
    syncWeatherCityAria(el);
    return;
  }
  if (!extra) {
    extra = document.createElement('span');
    extra.className = 'masthead-weather__extra';
    extra.setAttribute('aria-hidden', 'true');
  }
  const temp = el.querySelector('.masthead-weather__temp');
  if (temp) temp.after(extra);
  else el.append(extra);
  const labels = weatherExtraLabelText(weatherUiEn());
  extra.replaceChildren();
  const todayEl = weatherExtraSpan('masthead-weather__today');
  const max = weatherExtraSpan('masthead-weather__hl');
  const maxLabel = weatherExtraSpan('masthead-weather__label', labels.max);
  maxLabel.dataset.wxLabel = 'max';
  max.append(maxLabel, document.createTextNode(`${today.max}°`));
  const min = weatherExtraSpan('masthead-weather__hl');
  const minLabel = weatherExtraSpan('masthead-weather__label', labels.min);
  minLabel.dataset.wxLabel = 'min';
  min.append(minLabel, document.createTextNode(`${today.min}°`));
  todayEl.append(max, min);
  extra.append(todayEl);
  if (tomorrow) {
    const next = weatherExtraSpan('masthead-weather__tomorrow');
    const nextLabel = weatherExtraSpan('masthead-weather__label', labels.next);
    nextLabel.dataset.wxLabel = 'next';
    const icon = document.createElement('span');
    icon.className = 'masthead-weather__tomorrow-icon';
    icon.innerHTML = weatherIcon(tomorrow.code, 1);
    next.append(nextLabel, icon, weatherExtraSpan('masthead-weather__tomorrow-temp', `${tomorrow.max}°`));
    extra.append(next);
  }
  el.dataset.wxMax = String(today.max);
  el.dataset.wxMin = String(today.min);
  if (tomorrow) el.dataset.wxNext = String(tomorrow.max);
  else delete el.dataset.wxNext;
  syncWeatherCityAria(el);
}

function measureWeatherExtraWidth(extra, mode) {
  extra.dataset.measure = mode;
  extra.classList.add('is-measuring');
  const width = extra.scrollWidth || 0;
  extra.classList.remove('is-measuring');
  extra.removeAttribute('data-measure');
  return width;
}

/** Vide utile une fois l’icône, le toponyme, le degré et les 3 gouttières posés. */
function weatherChipSlack(el, textW) {
  const cs = getComputedStyle(el);
  const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const gap = parseFloat(cs.columnGap || cs.gap) || 0;
  const name = el.querySelector('.masthead-weather__name');
  const nameCs = name ? getComputedStyle(name) : null;
  const namePad = nameCs
    ? (parseFloat(nameCs.paddingLeft) || 0) + (parseFloat(nameCs.paddingRight) || 0)
    : 0;
  const iconW = el.querySelector('.masthead-weather__icon')?.getBoundingClientRect().width || 0;
  const temp = el.querySelector('.masthead-weather__temp');
  const tempW = temp?.getBoundingClientRect().width || 0;
  const tempCs = temp ? getComputedStyle(temp) : null;
  const tempMargin = tempCs
    ? (parseFloat(tempCs.marginLeft) || 0) + (parseFloat(tempCs.marginRight) || 0)
    : 0;
  return el.clientWidth - pad - iconW - namePad - textW - tempW - tempMargin - gap * 3;
}

/** MTL et QC sont en colonne max-content (≥1440) : le max/min les élargit.
 *  Entre 1280 et 1439 les colonnes sont à parts égales et le fit retire une
 *  ville si la puce grossit — là, le max/min ne s’affiche que s’il reste du vide. */
function weatherPrimaryGrowsForToday(el) {
  if (mastheadWeatherDocked || !isWideDesktopComfort()) return false;
  const id = el.dataset.weatherCity;
  if (id !== 'montreal' && id !== 'quebec') return false;
  return !!el.closest('.masthead-weather__board')?.hasAttribute('data-weather-dual-primary');
}

/** Téléphone : max/min seulement pour MTL/QC (pas la place pour « Demain »). */
const WEATHER_PHONE_MQ = window.matchMedia('(max-width: 599.98px)');

/**
 * Décision du 22 nov. 2026 : Montréal et Québec affichent toujours leurs
 * extras — max/min + « Demain » (bureau, tablette), max/min seuls au
 * téléphone. Les villes régionales n'affichent jamais « Demain ».
 * Retourne le mode imposé, ou null pour une ville régionale.
 */
function weatherPrimaryForcedMode(el) {
  const id = el?.dataset?.weatherCity;
  if (!MASTHEAD_WEATHER_PRIMARY_IDS.has(id)) return null;
  if (!WEATHER_PHONE_MQ.matches && el.dataset.wxNext) return 'both';
  return 'today';
}

function commitWeatherExtra(el, extra, mode, before, need = null) {
  if (mode === 'off') {
    el.classList.remove('has-room');
    el.dataset.weatherExtra = 'off';
    return;
  }
  el.classList.add('has-room');
  el.dataset.weatherExtra = mode;
  const grew = el.clientWidth > before + 1;
  // La puce elle-même peut déborder (colonne étroite) sans que l'extra le voie :
  // dans ce cas on redescend both → today → off plutôt que de rogner.
  // Ou l'extra est comprimé (flex) sous sa largeur mesurée — 1024 : une seule case.
  const needW = need ? need[mode] : 0;
  const clipped = extra.scrollWidth > extra.clientWidth + 1
    || (weatherPrimaryForcedMode(el) !== null && el.scrollWidth > el.clientWidth + 1)
    || (needW > 0 && extra.getBoundingClientRect().width + 2 < needW);
  const primaryToday = mode === 'today' && weatherPrimaryGrowsForToday(el);
  // MTL/QC : la puce peut grandir (le fit du bandeau retire une ville régionale).
  const forced = weatherPrimaryForcedMode(el) === mode;
  if (!clipped && (!grew || primaryToday || forced)) return;
  commitWeatherExtra(el, extra, mode === 'both' ? 'today' : 'off', before, need);
}

/**
 * Pose max/min (et demain s’il reste assez de vide) sans élargir la puce.
 * Une puce déjà pleine — nom qui défile, ou colonne au contenu — reste inchangée.
 */
function applyWeatherExtraFit(el, textW) {
  const extra = el.querySelector('.masthead-weather__extra');
  el.classList.remove('has-room');
  el.dataset.weatherExtra = 'off';
  if (!extra || !el.dataset.wxMax || el.clientWidth < 48 || textW < 1) return;
  const todayW = measureWeatherExtraWidth(extra, 'today');
  const forced = weatherPrimaryForcedMode(el);
  // Villes régionales : jamais « Demain » (réservé à MTL/QC).
  const bothW = (forced && el.dataset.wxNext) ? measureWeatherExtraWidth(extra, 'both') : 0;
  const slack = weatherChipSlack(el, textW);
  let mode = forced || weatherExtraMode(slack, todayW, bothW);
  if (mode === 'off' && weatherPrimaryGrowsForToday(el) && todayW > 0) mode = 'today';
  commitWeatherExtra(el, extra, mode, el.clientWidth, forced ? { both: bothW, today: todayW } : null);
}

let mastheadWeatherTimer = null;
/** Vrai seulement pendant la pause entre deux vagues (pas pendant le pas 440 ms). */
let mastheadWeatherHolding = false;
const mastheadWeatherDecks = { campus: [], nation: [] };
let mastheadWeatherSlots = [];
let mastheadWeatherNextSlot = 0;
// La carte principale reste exclusivement réservée à Montréal et Québec.
const MASTHEAD_WEATHER_PRIMARY_SEQUENCE = ["montreal", "quebec"];
const MASTHEAD_WEATHER_PRIMARY_IDS = new Set(MASTHEAD_WEATHER_PRIMARY_SEQUENCE);
// Les cartes régionales suivent l’importance démographique universitaire.
const MASTHEAD_WEATHER_REGIONAL_PRIORITY = [
  "sherbrooke", "trois-rivieres", "gatineau", "saguenay",
  "rimouski", "rouyn-noranda",
];
const MASTHEAD_WEATHER_REGIONAL_RANK = new Map(
  MASTHEAD_WEATHER_REGIONAL_PRIORITY.map((id, index) => [id, index]),
);
let mastheadWeatherPrimaryIndex = 0;
let mastheadWeatherCompactSecondaryIndex = 0;
let mastheadWeatherNationSlot = 1;
let mastheadWeatherQueueIndex = 0;
let mastheadWeatherLastBoardCount = 0;
let mastheadWeatherFitCount = null;
let weatherOverlapFitDepth = 0;
let weatherAvailTrim = 0;
let mastheadWeatherTooNarrow = false;
let mastheadWeatherResizeFrame = 0;
let mastheadWeatherDocked = false;
// Emplacement d'origine (masthead) : mémorisé pour pouvoir ramener le
// bandeau à sa place quand la largeur redevient suffisante.
let mastheadWeatherHomeParent = MASTHEAD_WEATHER?.parentNode || null;
let mastheadWeatherHomeNextSibling = MASTHEAD_WEATHER?.nextSibling || null;
// Tablette + mobile (≤1023) : météo sous le syntoniseur — libère le mât pour
// date + icônes (lab 768 / 900). Bureau ≥1024 : météo dans le mât.
const MASTHEAD_WEATHER_PHONE_MQ = window.matchMedia('(max-width: 1023.98px)');

function syncMastheadShuffleButton() {
  if (!MASTHEAD_BG_SHUFFLE || !MASTHEAD_BG_SHUFFLE_HOME) return;
  const showInMobileMenu = mastheadWeatherDocked && !MASTHEAD_WEATHER?.classList.contains('hidden');
  if (showInMobileMenu && MASTHEAD_ACTIONS) {
    MASTHEAD_ACTIONS.append(MASTHEAD_BG_SHUFFLE);
  } else if (!mastheadWeatherDocked) {
    MASTHEAD_BG_SHUFFLE_HOME.append(MASTHEAD_BG_SHUFFLE);
  }
  MASTHEAD_BG_SHUFFLE.hidden = mastheadWeatherDocked && !showInMobileMenu;
}

/**
 * Sur mobile, quand le masthead n'a plus de place pour la météo, on la
 * déplace sous la barre du syntoniseur (même carte que sur bureau, pas le
 * style Pomo) plutôt que de la faire disparaître.
 */
function setMastheadWeatherDocked(docked) {
  if (!MASTHEAD_WEATHER || !MASTHEAD_WEATHER_DOCK || docked === mastheadWeatherDocked) return;
  mastheadWeatherDocked = docked;
  MASTHEAD_WEATHER.classList.toggle('masthead-weather--docked', docked);
  if (docked) {
    MASTHEAD_WEATHER_DOCK.append(MASTHEAD_WEATHER);
  } else if (mastheadWeatherHomeParent) {
    mastheadWeatherHomeParent.insertBefore(MASTHEAD_WEATHER, mastheadWeatherHomeNextSibling);
  }
  // Le contexte a changé de largeur : tout réévaluer depuis zéro.
  mastheadWeatherFitCount = null;
  mastheadWeatherTooNarrow = false;
  mastheadWeatherLastBoardCount = 0;
  MASTHEAD_WEATHER.classList.remove('is-too-narrow');
  syncMastheadShuffleButton();
  // La colonne date change de largeur (3 → 2 pistes) : rejouer la cascade.
  renderTodayDate();
}

function weatherLocationSlug(city) {
  return String(city.weatherSlug || city.name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019\u0027`]/g, "")
    .replace(/[–—]/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .split("-").filter(Boolean).join("-");
}

function weatherForecastUrl(city) {
  if (city.weatherUrl) return city.weatherUrl;
  return "https://www.meteomedia.com/fr/ville/ca/quebec/" + weatherLocationSlug(city) + "/actuelle";
}

function weatherForecastProvider() {
  return "MétéoMédia";
}

function refreshMastheadWeatherLinks() {
  if (!MASTHEAD_WEATHER) return;
  WEATHER_CITIES.forEach((city) => {
    const el = MASTHEAD_WEATHER.querySelector(`[data-weather-city="${city.id}"]`);
    if (el) el.href = weatherForecastUrl(city);
  });
  syncWeatherExtraLanguage();
}

function buildMastheadWeatherBoard() {
  const board = MASTHEAD_WEATHER?.querySelector('.masthead-weather__board');
  if (!board || board.children.length) return;
  const fragment = document.createDocumentFragment();
  const twin = document.createElement('span');
  twin.className = 'masthead-weather__twin';
  const nodes = new Map();
  WEATHER_CITIES.forEach((city) => {
    const el = document.createElement('a');
    el.className = 'masthead-weather__city';
    el.dataset.weatherCity = city.id;
    el.dataset.weatherGroup = city.nation ? 'nation' : 'campus';
    el.setAttribute('aria-hidden', 'true');
    const context = city.nation ? `${city.name} — ${city.nation}` : city.name;
    el.href = weatherForecastUrl(city);
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    const provider = weatherForecastProvider(city);
    el.dataset.weatherTitle = `Prévisions de ${provider} — ${context}`;
    el.dataset.weatherAria = `Prévisions de ${provider} pour ${context}`;
    el.title = el.dataset.weatherTitle;
    el.setAttribute("aria-label", el.dataset.weatherAria);
    // Trusted static skeleton; city names are assigned with textContent.
    el.innerHTML = '<span class="masthead-weather__icon" aria-hidden="true">·</span><span class="masthead-weather__name"><span class="masthead-weather__name-text"><span class="masthead-weather__name-full"></span><span class="masthead-weather__name-compact" aria-hidden="true"></span></span></span><span class="masthead-weather__temp">—</span>';
    el.querySelector('.masthead-weather__name-full').textContent = city.name;
    el.querySelector('.masthead-weather__name-compact').textContent = city.compactName || city.name;
    nodes.set(city.id, el);
  });
  MASTHEAD_WEATHER_PRIMARY_SEQUENCE.forEach((id) => {
    const el = nodes.get(id);
    if (el) twin.append(el);
  });
  WEATHER_CITIES.forEach((city) => {
    if (MASTHEAD_WEATHER_PRIMARY_IDS.has(city.id)) return;
    fragment.append(nodes.get(city.id));
  });
  board.append(twin, fragment);
}

/** Largeur utile du ruban météo (place restante, pas le contenu qui déborde). */
function weatherBoardAvailWidth() {
  const slack = 20;
  if (!mastheadWeatherDocked) {
    const top = document.querySelector('.masthead-top');
    const date = document.querySelector('.masthead-date');
    const actions = document.querySelector('.masthead-actions');
    const cell = MASTHEAD_WEATHER?.clientWidth || 0;
    let leftover = 0;
    if (top && date && actions) {
      const cs = getComputedStyle(top);
      const gap = parseFloat(cs.columnGap || cs.gap) || 8;
      leftover = top.clientWidth
        - date.getBoundingClientRect().width
        - actions.getBoundingClientRect().width
        - gap * 2
        - slack;
    }
    // Case 1fr déjà contrainte ≈ reliquat. Après un dock 390→1920 le ruban
    // shrink-wrap sur 2 cartes (cellule trop étroite) : prendre le reliquat
    // pour re-autoriser les secondaires.
    const trim = Math.max(0, weatherAvailTrim);
    if (cell >= 40 && leftover >= 40) {
      if (leftover > cell + 80) return Math.max(40, leftover - trim);
      return Math.max(40, Math.min(cell, leftover) - trim);
    }
    if (leftover >= 40) return Math.max(40, leftover - trim);
    if (cell >= 40) return Math.max(40, cell - slack - trim);
  }
  let width = MASTHEAD_WEATHER?.clientWidth || 0;
  if (width < 40) {
    width = MASTHEAD_WEATHER?.querySelector('.masthead-weather__board')?.clientWidth || 0;
  }
  if (width < 40) {
    width = MASTHEAD_WEATHER_DOCK?.clientWidth || 0;
  }
  if (width < 40 && mastheadWeatherDocked) {
    width = document.documentElement.clientWidth || 0;
  }
  return width > slack ? width - slack : width;
}

function weatherActiveCount() {
  return MASTHEAD_WEATHER?.querySelectorAll('.masthead-weather__city.is-active').length || 0;
}

/** True si une carte météo (ou la date) passe sous les icônes du mât. */
function weatherRibbonOverlapsChrome() {
  if (!MASTHEAD_WEATHER || mastheadWeatherDocked) return false;
  const actions = document.querySelector('.masthead-actions');
  if (!actions) return false;
  const limit = actions.getBoundingClientRect().left;
  const date = document.querySelector('.masthead-date');
  if (date && date.getBoundingClientRect().right > limit + 0.5) return true;
  return [...MASTHEAD_WEATHER.querySelectorAll('.masthead-weather__city.is-active')]
    .some((el) => el.getBoundingClientRect().right > limit + 0.5);
}

/** Docké (≤1023) : les cartes ne doivent pas sortir du dock. */
function weatherRibbonOverflowsDock() {
  if (!MASTHEAD_WEATHER || !mastheadWeatherDocked) return false;
  const host = MASTHEAD_WEATHER_DOCK || MASTHEAD_WEATHER;
  const box = host.getBoundingClientRect();
  if (box.width < 8) return false;
  return [...MASTHEAD_WEATHER.querySelectorAll('.masthead-weather__city.is-active')]
    .some((el) => {
      const card = el.getBoundingClientRect();
      return card.right > box.right + 1 || card.left < box.left - 1;
    });
}

function weatherRibbonNeedsDrop() {
  return weatherRibbonOverlapsChrome() || weatherRibbonOverflowsDock();
}

function weatherRibbonOverflowPx() {
  if (!MASTHEAD_WEATHER || mastheadWeatherDocked) return 0;
  const actions = document.querySelector('.masthead-actions');
  if (!actions) return 0;
  const limit = actions.getBoundingClientRect().left;
  let overflow = 0;
  const date = document.querySelector('.masthead-date');
  if (date) overflow = Math.max(overflow, date.getBoundingClientRect().right - limit);
  for (const el of MASTHEAD_WEATHER.querySelectorAll('.masthead-weather__city.is-active')) {
    overflow = Math.max(overflow, el.getBoundingClientRect().right - limit);
  }
  return overflow;
}

/** Rétrécit les slots plutôt que de tout remplir un reliquat surestimé. */
function shrinkWeatherSlotsToClearChrome() {
  const overflow = weatherRibbonOverflowPx();
  if (overflow <= 1) return false;
  weatherAvailTrim = Math.max(weatherAvailTrim, Math.ceil(overflow) + 8);
  const actives = [...(MASTHEAD_WEATHER?.querySelectorAll('.masthead-weather__city.is-active') || [])];
  if (!actives.length) return false;
  const each = Math.max(1, Math.ceil((overflow + 6) / actives.length));
  let changed = false;
  actives.forEach((el) => {
    const cur = Math.floor(el.getBoundingClientRect().width);
    const next = Math.max(72, cur - each);
    if (next >= cur) return;
    el.style.setProperty('flex', `0 0 ${next}px`, 'important');
    el.style.setProperty('width', `${next}px`, 'important');
    el.style.setProperty('min-width', `${next}px`, 'important');
    el.style.setProperty('max-width', `${next}px`, 'important');
    changed = true;
  });
  return changed;
}

function clearWeatherSlotInlineStyles() {
  const board = MASTHEAD_WEATHER?.querySelector('.masthead-weather__board');
  board?.style.removeProperty('--weather-secondary-w');
  board?.style.removeProperty('--weather-primary-w');
  board?.style.removeProperty('--weather-slot-w');
  MASTHEAD_WEATHER?.querySelectorAll('.masthead-weather__city').forEach((el) => {
    el.style.removeProperty('flex');
    el.style.removeProperty('width');
    el.style.removeProperty('min-width');
    el.style.removeProperty('max-width');
  });
}

function dropWeatherCardForFit() {
  const painted = weatherActiveCount();
  const floor = mastheadWeatherDocked ? 1 : (weatherWideDualPrimary() ? 2 : 1);
  if (painted <= floor || weatherOverlapFitDepth > 10) return false;
  weatherOverlapFitDepth += 1;
  mastheadWeatherFitCount = painted - 1;
  mastheadWeatherLastBoardCount = 0;
  mastheadWeatherSlots = [];
  try {
    showMastheadWeatherBoard();
  } finally {
    weatherOverlapFitDepth = Math.max(0, weatherOverlapFitDepth - 1);
  }
  return true;
}

/**
 * Grand écran (wide / super-wide) — défaut prod dès 1280 px :
 * - pas de marquee
 * - pas de clip / nom compact : les conteneurs s’ajustent ; si ça ne rentre
 *   pas, on retire une carte (fit), on n’ampute pas le texte.
 * ⛔ Inactif ≤1280 (téléphone, mid, bureau compact 1280).
 *    `?wide=off` / data-wide-preview=off = témoin lab de l’ancien shell.
 * Voir data-wide-preview.
 */
function isWideNoMarqueeMode() {
  try {
    const id = document.documentElement.dataset.widePreview;
    if (id === 'off' || id === 'a') return false;
    return window.matchMedia('(min-width: 1280px)').matches;
  } catch {
    return false;
  }
}

/** Wide E + bureau confortable (≥1440) : noms complets, −1 carte plutôt que troncature. */
function isWideDesktopComfort() {
  try {
    return isWideNoMarqueeMode() && window.matchMedia('(min-width: 1440px)').matches;
  } catch {
    return false;
  }
}

/**
 * Parité scores : 2 ancres (MTL+QC) + 1 carte par puce sports.
 * ≥2560 : +1 ; ≥3440 : +2 (3 CTA sports, plus d’air météo).
 */
function weatherSportsParityBonus() {
  try {
    if (!isWideNoMarqueeMode()) return 0;
    const w = document.documentElement.clientWidth || window.innerWidth || 0;
    if (w >= 3440) return 2;
    if (w >= 2560) return 1;
    return 0;
  } catch {
    return 0;
  }
}

function weatherSportsParityCount() {
  const extras = sportsMatchChipCount();
  if (extras < 1) return 0;
  return 2 + extras + weatherSportsParityBonus();
}

/** Alias sémantique : layout synthé grand écran (E). */
function isWideTunerLayout() {
  return isWideNoMarqueeMode();
}

/** Clé de coque du synthé — un resize qui la change doit tout repeindre. */
function tunerShellLayoutKey() {
  if (isWideTunerLayout()) return 'wide';
  if (isDialCompactLayout()) return isTunerDialMidLayout() ? 'mid' : 'compact';
  return 'desktop';
}

/** Bureau : titre « À l'antenne » sur deux lignes, pas de marquee. */
function isNowAirTwoLineMode() {
  try {
    return window.matchMedia('(min-width: 1100px)').matches;
  } catch {
    return false;
  }
}

/** Offset sticky du rail sources = hauteur réelle du synthé (+ petit entrefer). */
function syncWideStickyTop() {
  try {
    if (!isWideTunerLayout()) {
      document.documentElement.style.removeProperty('--wide-sticky-top');
      return;
    }
    const tuner = document.getElementById('tuner');
    const h = tuner ? Math.ceil(tuner.getBoundingClientRect().height) : 0;
    // 8 px d’air entre le bas du synthé et « Le Radar »
    const top = Math.max(64, h + 8);
    document.documentElement.style.setProperty('--wide-sticky-top', `${top}px`);
  } catch { /* ignore */ }
}


/** Institution en toutes lettres pour le dial wide (pas d’acronyme forcé). */
function tunerFullInstitutionLabel(radio) {
  if (!radio) return '';
  const full = String(radio.institution || '').trim();
  if (full) return full;
  return tunerDialInstitutionLabel(radio) || '';
}

/** Ligne institution au-dessus du nom de poste (créée une fois). */
function ensureWideDialInstEl() {
  const box = document.querySelector('.tuner-now');
  if (!box) return null;
  let el = document.getElementById('tuner-now-inst');
  if (!el) {
    el = document.createElement('span');
    el.id = 'tuner-now-inst';
    el.className = 'tuner-now-inst';
    el.hidden = true;
    const name = document.getElementById('tuner-now-name');
    if (name) box.insertBefore(el, name);
    else box.prepend(el);
  }
  return el;
}

/** Largeur fixe du carré dial (max de tous les postes). Ne change pas à chaque flip. */
let wideDialFixedPx = 0;

function measureWideDialNeedPx() {
  const name = document.getElementById('tuner-now-name');
  const sub = document.getElementById('tuner-now-sub');
  const padX = 11 + 22 + 6;
  const nameCs = name ? getComputedStyle(name) : null;
  const subNode = sub?.querySelector?.('.tuner-now-sub-text') || sub;
  const subCs = subNode ? getComputedStyle(subNode) : null;
  if (!measureWideDialNeedPx._ctx) {
    measureWideDialNeedPx._ctx = document.createElement('canvas').getContext('2d');
  }
  const ctx = measureWideDialNeedPx._ctx;
  const lineW = (text, cs) => {
    if (!text || !cs) return 0;
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const ls = parseFloat(cs.letterSpacing) || 0;
    const t = String(text);
    return Math.ceil(ctx.measureText(t).width + ls * Math.max(0, t.length - 1) + 4);
  };
  let maxLine = 160;
  const list = Array.isArray(radios) ? radios : [];
  for (const radio of list) {
    const inst = tunerFullInstitutionLabel(radio) || '';
    const station = stationDisplayName(radio) || String(radio.name || '').trim() || '';
    const slogan = radioSlogan(radio) || String(radio.frequency || '').trim() || '';
    const line2 = [station, slogan].filter(Boolean).join(' · ');
    maxLine = Math.max(
      maxLine,
      lineW(inst || station, nameCs),
      lineW(line2, subCs),
    );
  }
  return Math.ceil(maxLine + padX);
}

/**
 * Pose une fois la largeur du carré = plus longue L1/L2 de tous les postes.
 * Recalcule seulement si `force` (resize / 1er paint).
 */
function clearWideDialInlineSize() {
  wideDialFixedPx = 0;
  const dial = document.querySelector('.tuner-dial');
  const now = document.querySelector('.tuner-now');
  if (dial) {
    dial.style.minWidth = '';
    dial.style.width = '';
  }
  if (now) now.style.width = '';
}

function fitWideDialWidth({ force = false } = {}) {
  if (!isWideTunerLayout()) {
    clearWideDialInlineSize();
    return;
  }
  const dial = document.querySelector('.tuner-dial');
  const now = document.querySelector('.tuner-now');
  if (!dial || !now) return;

  if (!force && wideDialFixedPx > 0) {
    dial.style.minWidth = `${wideDialFixedPx}px`;
    dial.style.width = `${wideDialFixedPx}px`;
    now.style.width = '100%';
    return;
  }

  const need = measureWideDialNeedPx();
  const w = Math.max(280, need + 24);
  wideDialFixedPx = w;
  dial.style.minWidth = `${w}px`;
  dial.style.width = `${w}px`;
  now.style.width = '100%';
}

/**
 * Dial wide : **2 lignes seulement** (même épaisseur barre que prod).
 * L1 = institution au complet
 * L2 = poste + slogan complet (espace horizontal, pas de 3e ligne)
 * Plus de « Syntoniser un poste » tant qu’un poste existe.
 * @returns {boolean} true si le rendu wide a été appliqué
 */
function paintWideDial(radio) {
  const instEl = ensureWideDialInstEl();
  // Jamais de 3e ligne dans le carré (épaissit la barre).
  if (instEl) {
    instEl.hidden = true;
    instEl.textContent = '';
  }
  if (!isWideTunerLayout()) {
    clearWideDialInlineSize();
    return false;
  }
  if (!radio) {
    setTunerNameText('Radios étudiantes');
    setTunerSubText('Choisissez un poste pour écouter');
    requestAnimationFrame(() => fitWideDialWidth({ force: wideDialFixedPx === 0 }));
    // Sans ça le CSS `.tuner:not(.is-dial-ready)` laisse L1/L2 à opacity: 0.
    markTunerDialReady();
    return true;
  }
  const inst = tunerFullInstitutionLabel(radio);
  const station = stationDisplayName(radio) || String(radio.name || '').trim() || '';
  const slogan = radioSlogan(radio) || String(radio.frequency || '').trim() || '';
  // L1 institution ; L2 « CHOQ.ca · slogan… » — largeur mesurée après paint.
  setTunerNameText(inst || station || 'Radios étudiantes');
  const line2 = [station, slogan].filter(Boolean).join(' · ');
  setTunerSubText(line2 || slogan || station);
  requestAnimationFrame(() => {
    fitWideDialWidth({ force: wideDialFixedPx === 0 });
  });
  markTunerDialReady();
  return true;
}

/**
 * Wide : EQ (4 barres) sous le wordmark — axe du trio play · EQ · mute.
 * Gauche = dial + play ; droite = volume + antenne.
 */
function unwrapWideTunerBalance() {
  const controls = document.querySelector('.tuner-controls');
  if (!controls) return;
  const left = controls.querySelector('.tuner-wide-left');
  const right = controls.querySelector('.tuner-wide-right');
  const actions = document.querySelector('.tuner-actions');
  const play = document.getElementById('tuner-play');
  const eq = document.getElementById('tuner-eq');
  const cast = document.getElementById('tuner-cast');
  const castMob = document.getElementById('tuner-cast-mob');
  if (left) {
    while (left.firstChild) controls.insertBefore(left.firstChild, left);
    left.remove();
  }
  if (actions) {
    const restore = [play, cast, castMob, eq].filter(Boolean);
    restore.forEach((el) => {
      if (el.parentElement !== actions) actions.insertBefore(el, actions.firstChild);
    });
    // Reposer l’ordre DOM d’origine : play → cast → cast-mob → eq → vol
    if (play) actions.insertBefore(play, actions.firstChild);
    if (cast && play) actions.insertBefore(cast, play.nextSibling);
    if (castMob && (cast || play)) {
      actions.insertBefore(castMob, (cast || play).nextSibling);
    }
    if (eq) {
      const vol = document.getElementById('tuner-vol');
      actions.insertBefore(eq, vol || null);
    }
  }
  if (right) {
    const nowair = document.getElementById('tuner-nowair-wide');
    const inner = controls.parentElement;
    if (nowair && inner) inner.insertBefore(nowair, controls.nextSibling);
    while (right.firstChild) controls.appendChild(right.firstChild);
    right.remove();
  }
}

function ensureWideTunerBalance() {
  const controls = document.querySelector('.tuner-controls');
  const inner = document.querySelector('.tuner-inner');
  const actions = document.querySelector('.tuner-actions');
  const eq = document.getElementById('tuner-eq');
  if (!controls || !inner || !actions || !eq) return;
  if (!isWideTunerLayout()) {
    unwrapWideTunerBalance();
    return;
  }
  let left = controls.querySelector('.tuner-wide-left');
  if (!left) {
    left = document.createElement('div');
    left.className = 'tuner-wide-left';
    while (controls.firstElementChild && controls.firstElementChild !== actions) {
      left.appendChild(controls.firstElementChild);
    }
    controls.insertBefore(left, actions);
  }
  // Play + Cast restent à gauche de l’EQ (l’EQ est l’axe, pas le play).
  if (eq.parentElement === actions) {
    while (actions.firstElementChild && actions.firstElementChild !== eq) {
      left.appendChild(actions.firstElementChild);
    }
    controls.insertBefore(eq, actions);
  } else if (eq.parentElement !== controls) {
    controls.insertBefore(eq, actions);
  }
  let right = controls.querySelector('.tuner-wide-right');
  if (!right) {
    right = document.createElement('div');
    right.className = 'tuner-wide-right';
    controls.appendChild(right);
    right.appendChild(actions);
  }
  const nowair = document.getElementById('tuner-nowair-wide');
  if (nowair && nowair.parentElement !== right) right.appendChild(nowair);
}

/**
 * Paire « À l'antenne » | « À venir » (wide E).
 * Classes `tuner-wide-slot` (pas `.tuner-nowair`) : le CSS critique index.html
 * force display/grid-column sur tout `.tuner-nowair` et doublait le panneau.
 */
function ensureWideNowAirPair() {
  const host = TUNER_NOWAIR?.parentElement;
  if (!host || !TUNER_NOWAIR) return null;

  // Nettoyer d’anciens doublons (bug précédent)
  const extras = host.querySelectorAll('#tuner-nowair-wide');
  if (extras.length > 1) {
    extras.forEach((el, i) => { if (i > 0) el.remove(); });
  }

  let wrap = document.getElementById('tuner-nowair-wide');
  if (!isWideTunerLayout()) {
    if (wrap) wrap.hidden = true;
    unwrapWideTunerBalance();
    TUNER_NOWAIR.classList.remove('tuner-nowair--legacy-slot');
    TUNER_NOWAIR.hidden = false;
    TUNER_NOWAIR.removeAttribute('aria-hidden');
    return null;
  }

  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'tuner-nowair-wide';
    wrap.className = 'tuner-nowair-wide';
    wrap.setAttribute('aria-label', 'Antenne et à venir');
    // Trusted static markup (labels + empty slots). Titles filled via textContent.
    wrap.innerHTML = [
      '<div class="tuner-wide-slot tuner-wide-slot--live" aria-live="polite">',
      '  <span class="tuner-wide-slot__label">À l\'antenne</span>',
      '  <div class="tuner-wide-slot__body">',
      '    <p class="tuner-wide-slot__title" data-wide-live-title></p>',
      '    <p class="tuner-wide-slot__sub" data-wide-live-sub></p>',
      '  </div>',
      '</div>',
      '<div class="tuner-wide-slot tuner-wide-slot--next" aria-live="polite">',
      '  <span class="tuner-wide-slot__label">À venir</span>',
      '  <div class="tuner-wide-slot__body">',
      '    <p class="tuner-wide-slot__title" data-wide-next-title></p>',
      '    <p class="tuner-wide-slot__sub" data-wide-next-sub></p>',
      '  </div>',
      '</div>',
    ].join('');
    host.insertBefore(wrap, TUNER_NOWAIR.nextSibling);
    wrap.addEventListener('click', openNowAirSchedule);
    wrap.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const slot = event.target?.closest?.('.tuner-wide-slot');
      if (!slot) return;
      event.preventDefault();
      openNowAirSchedule(event);
    });
    wrap.querySelectorAll('.tuner-wide-slot').forEach((slot) => {
      slot.setAttribute('role', 'link');
      slot.setAttribute('tabindex', '0');
    });
  }

  wrap.hidden = false;
  ensureWideTunerBalance();
  // Masquer le panneau single (legacy) — classes + attributs (CSS critique).
  TUNER_NOWAIR.classList.add('tuner-nowair--legacy-slot');
  TUNER_NOWAIR.hidden = true;
  TUNER_NOWAIR.setAttribute('aria-hidden', 'true');
  return wrap;
}

/**
 * Remplit live + upcoming à partir des phases d’un poste.
 * Largeur des slots = contenu (CSS flex packé). Si le texte change : fade out
 * → swap → fade in pour que le resserrement/élargissement se fasse hors vue.
 * @returns {boolean} true si la paire wide a été peinte
 */
/**
 * Émission en cours si elle existe, piste en sous-ligne.
 * Sans émission (CHOQ hors grille, etc.) : la piste seule suffit.
 * @param {{ title?: string, sub?: string, kind?: string }[]} phases
 */
function liveCopyFromPhases(phases = []) {
  const list = Array.isArray(phases) ? phases : [];
  const show = list.find((p) => p.kind === 'live' && !String(p.title).startsWith('♪')) || null;
  const track = list.find((p) => p.kind === 'live' && String(p.title).startsWith('♪')) || null;
  if (show && track) {
    return { liveTitle: show.title, liveSub: track.title };
  }
  if (show) {
    return { liveTitle: show.title, liveSub: show.sub || '' };
  }
  if (track) {
    return { liveTitle: String(track.title).replace(/^♪\s*/, ''), liveSub: '' };
  }
  return { liveTitle: '', liveSub: '' };
}

/**
 * CHOQ hors grille : la piste arrive en « Artiste — Titre » (tiret cadratin).
 * On remplace ce trait par un vrai saut de ligne (titre + sous-ligne) pour
 * que le slot « À l'antenne » n'empiète plus sur « À venir ».
 */
function splitChoqSongLines(track) {
  const raw = String(track || '').replace(/^♪\s*/, '').trim();
  if (!raw) return { title: '', sub: '' };
  const parts = raw.split(/\s+[—–]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { title: parts[0], sub: parts.slice(1).join(' — ') };
  }
  return { title: raw, sub: '' };
}

function applyChoqLiveSongLines(radio, liveTitle, liveSub, phases = []) {
  const title = String(liveTitle || '');
  const sub = String(liveSub || '');
  if (radio?.id !== 'choq') {
    return { liveTitle: title, liveSub: sub, songSplit: false };
  }
  const list = Array.isArray(phases) ? phases : [];
  const hasShow = list.some((p) => p.kind === 'live' && !String(p.title || '').startsWith('♪'));
  const hasTrack = list.some((p) => p.kind === 'live' && String(p.title || '').startsWith('♪'));
  if (!hasTrack || hasShow) {
    return { liveTitle: title, liveSub: sub, songSplit: false };
  }
  const split = splitChoqSongLines(title);
  if (!split.sub) {
    return { liveTitle: split.title || title, liveSub: sub, songSplit: false };
  }
  return { liveTitle: split.title, liveSub: split.sub, songSplit: true };
}

/**
 * Phases affichables : une seule phase live (émission + piste), puis à venir.
 * On ne remplace plus l’émission par le titre de piste en rotation.
 */
function composedAirPhases(radio, { withSlogan = false } = {}) {
  const raw = airRotationPhases(radio, { withSlogan });
  const copy = liveCopyFromPhases(raw);
  const { liveTitle, liveSub } = applyChoqLiveSongLines(
    radio, copy.liveTitle, copy.liveSub, raw,
  );
  const out = [];
  if (liveTitle) out.push({ title: liveTitle, sub: liveSub, kind: 'live' });
  const upcoming = raw.find((p) => p.kind === 'upcoming');
  if (upcoming) out.push(upcoming);
  for (const p of raw) {
    if (p.kind === 'idle') out.push(p);
  }
  return out.length ? out : raw;
}

/**
 * Lignes du slot « À l'antenne » (wide) : émission si elle existe,
 * piste en sous-ligne ; sinon la piste seule (ex. CHOQ hors grille).
 */
function wideNowAirLiveCopy(radio) {
  const phases = radio ? airRotationPhases(radio, { withSlogan: false }) : [];
  const raw = liveCopyFromPhases(phases);
  const { liveTitle, liveSub, songSplit } = applyChoqLiveSongLines(
    radio, raw.liveTitle, raw.liveSub, phases,
  );
  const upcoming = phases.find((p) => p.kind === 'upcoming') || null;
  const hasLive = !!liveTitle;
  return {
    liveTitle: hasLive ? liveTitle : '',
    liveSub: hasLive ? liveSub : '',
    songSplit: !!songSplit && hasLive,
    hideLive: !hasLive,
    nextTitle: upcoming?.title || (radio ? 'Rien de programmé pour aujourd\'hui' : '—'),
    nextSub: upcoming?.sub || '',
    hasUpcoming: !!upcoming,
  };
}

function paintWideNowAirPair(radio) {
  const wrap = ensureWideNowAirPair();
  if (!wrap || !isWideTunerLayout()) return false;

  const liveTitle = wrap.querySelector('[data-wide-live-title]');
  const liveSub = wrap.querySelector('[data-wide-live-sub]');
  const nextTitle = wrap.querySelector('[data-wide-next-title]');
  const nextSub = wrap.querySelector('[data-wide-next-sub]');
  const liveSlot = wrap.querySelector('.tuner-wide-slot--live');
  const nextSlot = wrap.querySelector('.tuner-wide-slot--next');

  const applyEmpty = () => {
    if (liveSlot) {
      liveSlot.hidden = false;
      liveSlot.classList.remove('is-wide-absent');
    }
    wrap.classList.remove('is-live-absent');
    if (liveTitle) liveTitle.textContent = 'Choisissez un poste';
    if (liveSub) {
      liveSub.textContent = 'Les radios étudiantes jouent en direct, 24/7';
      liveSub.hidden = false;
    }
    if (nextTitle) nextTitle.textContent = '—';
    if (nextSub) {
      nextSub.textContent = '';
      nextSub.hidden = true;
    }
    liveSlot?.classList.add('is-empty-slot');
    liveSlot?.classList.remove('tuner-wide-slot--song-split');
    nextSlot?.classList.add('is-empty-slot');
  };

  const applyRadio = () => {
    const copy = wideNowAirLiveCopy(radio);
    const hideLive = !!copy.hideLive;

    if (liveSlot) {
      liveSlot.hidden = hideLive;
      liveSlot.classList.toggle('is-wide-absent', hideLive);
    }
    wrap.classList.toggle('is-live-absent', hideLive);

    if (liveTitle) liveTitle.textContent = hideLive ? '' : (copy.liveTitle || '');
    if (liveSub) {
      liveSub.textContent = hideLive ? '' : (copy.liveSub || '');
      liveSub.hidden = hideLive || !copy.liveSub;
    }
    liveSlot?.classList.toggle('is-empty-slot', hideLive);
    liveSlot?.classList.toggle('tuner-wide-slot--song-split', !!copy.songSplit && !hideLive);

    if (nextTitle) nextTitle.textContent = copy.nextTitle;
    if (nextSub) {
      nextSub.textContent = copy.nextSub || '';
      nextSub.hidden = !copy.nextSub;
    }
    nextSlot?.classList.toggle('is-empty-slot', !copy.hasUpcoming);
  };

  // Texte cible (pour détecter un vrai changement)
  let nextLiveT = 'Choisissez un poste';
  let nextNextT = '—';
  let nextHideLive = false;
  if (radio) {
    const copy = wideNowAirLiveCopy(radio);
    nextHideLive = !!copy.hideLive;
    nextLiveT = nextHideLive ? '' : (copy.liveTitle || '');
    nextNextT = copy.nextTitle;
  }
  const changing = (liveTitle?.textContent || '') !== nextLiveT
    || (nextTitle?.textContent || '') !== nextNextT
    || (!!liveSlot?.hidden) !== nextHideLive;

  const paint = () => {
    if (!radio) applyEmpty();
    else applyRadio();
  };

  // Fade out → swap (largeur se recalcule hors vue) → fade in
  if (
    changing
    && wrap.isConnected
    && !PREFERS_REDUCED_MOTION?.matches
    && (liveTitle?.textContent || nextTitle?.textContent)
  ) {
    liveSlot?.classList.add('is-wide-fading');
    nextSlot?.classList.add('is-wide-fading');
    window.setTimeout(() => {
      paint();
      liveSlot?.classList.remove('is-wide-fading');
      nextSlot?.classList.remove('is-wide-fading');
    }, 150);
  } else {
    paint();
  }

  markUiReady(wrap);
  return true;
}

/**
 * Wide / super-wide : MTL et QC sont deux ancres **indépendantes et persistantes**
 * (pas d’alternance sur un seul slot). Les autres cartes tournent à côté.
 */
function weatherWideDualPrimary() {
  return typeof isWideNoMarqueeMode === 'function' && isWideNoMarqueeMode();
}

function weatherPrimaryCityById(id) {
  return WEATHER_CITIES.find((city) => city.id === id) || null;
}

function weatherBoardCount() {
  const width = weatherBoardAvailWidth();
  let count = 1;
  // Lab wide E : plus de slots quand le ruban grossit (largeur réelle masthead).
  // ≥1440 : noms complets, largeur secondaire = plus long toponyme → moins de cartes.
  // <1440 : slots CSS à parts égales (ellipsis si besoin).
  if (weatherWideDualPrimary()) {
    // Plancher 2 = MTL + QC toujours visibles ; au-delà = secondaires rotatives.
    if (isWideDesktopComfort()) {
      // MTL+QC portent le max/min (~230 px chacune). Le reliquat
      // laisse un nom court montrer le sien, pas une carte de plus trop étroite.
      // MTL+QC portent max/min + « Demain » (~320 px chacune, 22 nov. 2026).
      const nSec = Math.max(1, Math.floor((width - 640) / 240));
      count = Math.max(3, Math.min(12, 2 + nSec));
    } else {
      // 1280–1439 : MTL+QC en colonnes au contenu (max/min + demain) ;
      // le reliquat se partage entre secondaires d'au moins ~150 px.
      const nSec = Math.max(0, Math.floor((width - 640) / 150));
      count = Math.max(2, Math.min(8, 2 + nSec));
    }
  } else {
    // Modèle : 1 ancre MTL/QC + secondaires. Bureau 1280 board ~650 px → 3 cartes
    // (4 serraient les secondaires → marquee). 4 seulement si board vraiment large.
    if (width >= 780) count = 4;
    else if (width >= 400) count = 3;
    else if (width >= 240) count = 2;
  }
  // Docké (768/900) : même plafond 3 pour lisibilité.
  if (mastheadWeatherDocked && count > 3) count = 3;
  // Wide dual : ne jamais descendre sous MTL+QC (fit inclus).
  // Un panneau latéral (Firefox, Chrome, Edge, Arc…) doit pouvoir retirer
  // des cartes via le plafond mesuré, pas rester coincé à un ancien compte.
  if (weatherWideDualPrimary()) {
    const floor = 2;
    if (mastheadWeatherFitCount === null) return Math.max(floor, count);
    return Math.max(floor, Math.min(count, mastheadWeatherFitCount));
  }
  return mastheadWeatherFitCount === null ? count : Math.min(count, mastheadWeatherFitCount);
}

function nextWeatherCity(group, usedIds) {
  const eligible = WEATHER_CITIES.filter((city) => {
    if (usedIds.has(city.id)) return false;
    if (group === 'nation') return !!city.nation;
    return !city.nation && !MASTHEAD_WEATHER_PRIMARY_IDS.has(city.id);
  });
  if (!eligible.length) return null;
  let deck = mastheadWeatherDecks[group];
  deck = deck.filter((city) => eligible.some((candidate) => candidate.id === city.id));
  if (!deck.length) {
    if (group === 'nation') {
      deck = shuffleWeatherCities(eligible);
    } else {
      const priority = eligible.filter((city) => MASTHEAD_WEATHER_REGIONAL_RANK.has(city.id));
      const remaining = eligible.filter((city) => !MASTHEAD_WEATHER_REGIONAL_RANK.has(city.id));
      // Les six pôles régionaux (Gatineau compris) passent tous devant le
      // reste : brassés entre eux pour éviter une séquence figée, mais sans
      // jamais être noyés dans le grand bassin des petites municipalités.
      deck = [...shuffleWeatherCities(priority), ...shuffleWeatherCities(remaining)];
    }
  }
  const city = deck.shift();
  mastheadWeatherDecks[group] = deck;
  return city;
}

/** File secondaire wide : pôles, autres campus, nations — ordre stable. */
function weatherWideSecondaryPool() {
  const campuses = WEATHER_CITIES.filter((city) => (
    !city.nation && !MASTHEAD_WEATHER_PRIMARY_IDS.has(city.id)
  ));
  const nations = WEATHER_CITIES.filter((city) => city.nation);
  const priority = campuses
    .filter((city) => MASTHEAD_WEATHER_REGIONAL_RANK.has(city.id))
    .sort((a, b) => MASTHEAD_WEATHER_REGIONAL_RANK.get(a.id) - MASTHEAD_WEATHER_REGIONAL_RANK.get(b.id));
  const rest = campuses.filter((city) => !MASTHEAD_WEATHER_REGIONAL_RANK.has(city.id));
  return [...priority, ...rest, ...nations];
}

function nextWideSecondaryCity(usedIds) {
  const pool = weatherWideSecondaryPool();
  if (!pool.length) return null;
  const n = pool.length;
  const start = ((mastheadWeatherQueueIndex % n) + n) % n;
  for (let i = 0; i < n; i += 1) {
    const city = pool[(start + i) % n];
    if (usedIds.has(city.id)) continue;
    mastheadWeatherQueueIndex = (start + i + 1) % n;
    return city;
  }
  return null;
}

function advanceWideWeatherSlot(slot, n) {
  if (n <= 2) return 2;
  const next = slot + 1;
  return next >= n ? 2 : next;
}

function shuffleWeatherCities(cities) {
  const shuffled = [...cities];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

function weatherSecondaryGroup(slot, count) {
  // Wide dual : slots 0–1 = MTL/QC fixes ; nation parmi les secondaires (2+).
  if (weatherWideDualPrimary() && count > 2) {
    const nationSlot = mastheadWeatherNationSlot < 2
      ? 2
      : mastheadWeatherNationSlot;
    return slot === nationSlot ? 'nation' : 'campus';
  }
  if (count > 2) return slot === mastheadWeatherNationSlot ? 'nation' : 'campus';
  if (slot !== 1) return 'campus';
  return mastheadWeatherCompactSecondaryIndex % 3 === 2 ? 'nation' : 'campus';
}

function showMastheadWeatherBoard() {
  if (!MASTHEAD_WEATHER) return;
  if (MASTHEAD_WEATHER_PHONE_MQ.matches) {
    if (!mastheadWeatherDocked) {
      setMastheadWeatherDocked(true);
      // Après move DOM → attendre le layout pour mesurer le board (sinon count=1).
      window.requestAnimationFrame(() => {
        mastheadWeatherFitCount = null;
        showMastheadWeatherBoard();
      });
      return;
    }
  } else if (mastheadWeatherDocked) {
    setMastheadWeatherDocked(false);
    window.requestAnimationFrame(() => {
      mastheadWeatherFitCount = null;
      showMastheadWeatherBoard();
    });
    return;
  }
  if (mastheadWeatherTooNarrow) {
    MASTHEAD_WEATHER.classList.add('is-too-narrow');
    return;
  }
  MASTHEAD_WEATHER.classList.remove('is-too-narrow');
  const cities = [...MASTHEAD_WEATHER.querySelectorAll('.masthead-weather__city')];
  if (!cities.length) return;
  const count = Math.min(weatherBoardCount(), cities.length);
  const dualPrimary = weatherWideDualPrimary() && count >= 2;
  if (count !== mastheadWeatherLastBoardCount) {
    // Nation slot parmi les secondaires uniquement en dual (pas sur MTL/QC).
    if (dualPrimary && count > 2) {
      mastheadWeatherNationSlot = 2 + Math.floor(Math.random() * (count - 2));
    } else {
      mastheadWeatherNationSlot = count > 2 ? 1 + Math.floor(Math.random() * (count - 1)) : 1;
    }
    // Largeur change : garder les ancres, regénérer les secondaires, vague à gauche.
    mastheadWeatherSlots = mastheadWeatherSlots.slice(0, dualPrimary ? 2 : 1);
    mastheadWeatherLastBoardCount = count;
    if (dualPrimary) {
      mastheadWeatherNextSlot = 2;
      mastheadWeatherQueueIndex = 0;
    }
  }
  MASTHEAD_WEATHER.querySelector('.masthead-weather__board')?.setAttribute('data-weather-count', String(count));
  if (dualPrimary) {
    MASTHEAD_WEATHER.querySelector('.masthead-weather__board')?.setAttribute('data-weather-dual-primary', '1');
  } else {
    MASTHEAD_WEATHER.querySelector('.masthead-weather__board')?.removeAttribute('data-weather-dual-primary');
  }
  if (dualPrimary) {
    // Deux ancres persistantes en tête : Montréal + Québec (jamais rotées).
    const mtl = weatherPrimaryCityById('montreal');
    const qc = weatherPrimaryCityById('quebec');
    const secondaries = mastheadWeatherSlots
      .filter((c) => c && !MASTHEAD_WEATHER_PRIMARY_IDS.has(c.id));
    mastheadWeatherSlots = [mtl, qc].filter(Boolean).concat(secondaries).slice(0, count);
  } else {
    // Prod : slot 0 = ancre unique MTL ↔ QC (rotation).
    mastheadWeatherSlots = mastheadWeatherSlots.slice(0, count);
    const anchor = WEATHER_CITIES.find(
      (city) => city.id === MASTHEAD_WEATHER_PRIMARY_SEQUENCE[mastheadWeatherPrimaryIndex],
    );
    if (anchor && mastheadWeatherSlots[0]?.id !== anchor.id) mastheadWeatherSlots[0] = anchor;
  }

  const usedIds = new Set(
    mastheadWeatherSlots.filter(Boolean).map((city) => city.id),
  );
  // Dual : primaires toujours réservées
  if (dualPrimary) {
    usedIds.add('montreal');
    usedIds.add('quebec');
  }
  while (mastheadWeatherSlots.length < count) {
    const slot = mastheadWeatherSlots.length;
    let city = null;
    if (dualPrimary) {
      if (slot === 0) city = weatherPrimaryCityById('montreal');
      else if (slot === 1) city = weatherPrimaryCityById('quebec');
      else city = nextWideSecondaryCity(usedIds);
    } else {
      city = slot === 0
        ? WEATHER_CITIES.find(
          (c) => c.id === MASTHEAD_WEATHER_PRIMARY_SEQUENCE[mastheadWeatherPrimaryIndex],
        )
        : nextWeatherCity(weatherSecondaryGroup(slot, count), usedIds);
    }
    if (!city) break;
    usedIds.add(city.id);
    mastheadWeatherSlots.push(city);
  }
  // Filet dual : forcer MTL/QC même si le while a mal rempli
  if (dualPrimary) {
    const mtl = weatherPrimaryCityById('montreal');
    const qc = weatherPrimaryCityById('quebec');
    if (mtl) mastheadWeatherSlots[0] = mtl;
    if (qc) mastheadWeatherSlots[1] = qc;
  }
  cities.forEach((city) => {
    city.classList.remove('is-active', 'is-leaving', 'is-arriving', 'has-room');
    city.dataset.weatherExtra = 'off';
    city.setAttribute('aria-hidden', 'true');
    city.style.pointerEvents = '';
  });
  mastheadWeatherSlots.forEach((selectedCity, slot) => {
    const city = MASTHEAD_WEATHER.querySelector(`[data-weather-city="${selectedCity.id}"]`);
    city?.classList.add('is-active');
    if (city) city.style.order = String(slot);
    city?.setAttribute('aria-hidden', 'false');
  });
  // Sports indépendants (FG weather-fit A) — pas de resync parité ici.
  if (refreshWeatherNameScroll()) return;
  if (isWideDesktopComfort()) {
    // Grille CSS : MTL/QC au contenu, reliquat en 1fr. Pas de drop ni width inline.
    return;
  }
  if (weatherRibbonOverflowPx() > 1) {
    shrinkWeatherSlotsToClearChrome();
    if (weatherRibbonNeedsDrop() && dropWeatherCardForFit()) return;
  } else if (weatherRibbonNeedsDrop() && dropWeatherCardForFit()) return;
  window.requestAnimationFrame(() => {
    if (weatherRibbonOverflowPx() > 1) shrinkWeatherSlotsToClearChrome();
  });
  const primary = MASTHEAD_WEATHER.querySelector('.masthead-weather__city.is-active[data-weather-city="montreal"], .masthead-weather__city.is-active[data-weather-city="quebec"]');
  const primaryViewport = primary?.querySelector('.masthead-weather__name');
  const primaryText = primary?.querySelector('.masthead-weather__name-text');
  if (!primary || !primaryViewport || !primaryText
    || primary.clientWidth < 1 || primaryViewport.clientWidth < 1) return;
  // Mesurer le TEXTE, pas la fenêtre : `.masthead-weather__name-text` porte
  // `max-width: 100%`, donc le scrollWidth du parent peut déjà être borné et
  // masquer le débordement (même source de vérité que refreshWeatherNameScroll).
  const primaryOverflowing = () => primaryText.scrollWidth > primaryViewport.clientWidth + 0.5;
  // Ancre MTL/QC : nom complet d’abord. On ampute les secondaires avant compact.
  primary.classList.remove('is-compact');
  let primaryOverflows = primaryOverflowing();
  if (primaryOverflows && count > 1) {
    // Hors wide : ne pas descendre sous 3 cartes si la colonne a de la place
    // (le shrink-wrap du board faisait faussement déborder MONTRÉAL).
    const avail = weatherBoardAvailWidth();
    // Wide dual : weatherBoardCount() ne descend jamais sous MTL+QC (2).
    const floor = weatherWideDualPrimary() ? 2 : (avail >= 400 ? 3 : 1);
    if (count > floor) {
      const previousFit = mastheadWeatherFitCount;
      mastheadWeatherFitCount = count - 1;
      // Ne relancer que si le compte baisse VRAIMENT : sinon récursion
      // infinie (« Maximum call stack size exceeded », 2026-10-25).
      if (Math.min(weatherBoardCount(), cities.length) < count) {
        mastheadWeatherLastBoardCount = 0;
        mastheadWeatherSlots = [];
        showMastheadWeatherBoard();
        return;
      }
      mastheadWeatherFitCount = previousFit;
    }
  }
  if (primaryOverflows) {
    primary.classList.add('is-compact');
    primaryOverflows = primaryOverflowing();
  }
  if (!primaryOverflows) return;
  // Seule en MTL/QC et trop étroit dans le mât → dock sous le syntoniseur.
  if (!mastheadWeatherDocked) {
    setMastheadWeatherDocked(true);
    showMastheadWeatherBoard();
    return;
  }
  mastheadWeatherTooNarrow = true;
  MASTHEAD_WEATHER.classList.add('is-too-narrow');
}

/** Synchro style-masthead.css `weather-name-scroll` (5.5s × alternate × 2). */
const WEATHER_SCROLL_ONE_WAY_MS = 5500;
/** Pause lecture avant le 1er pixel (CSS animation-delay 0.8s). */
const WEATHER_SCROLL_READ_DELAY_MS = 800;
/** Rotation météo sans défilement — assez pour lire ville + °. */
const WEATHER_ROTATE_BASE_MS = 7000;
/**
 * Pause au repos **après** le retour du marquee, avant de changer de carte.
 * Plus courte que MARQUEE_REST_MS (dial/sports) : le bandeau météo n’a qu’un
 * toponyme à relire ; 2 s laissait un « trou » trop long (feedback 2026-08-11).
 */
const WEATHER_SCROLL_POST_PAUSE_MS = 700;
/** Synchro style-masthead.css `weather-tile-arrive` / `weather-tile-leave`. */
const WEATHER_ARRIVE_MS = 460;
const WEATHER_LEAVE_MS = 280;
/**
 * Vague L→R des cartes qui tournent, puis pause lecture, puis une
 * nouvelle vague. Pas un flip isolé (bandeau « vide »).
 * Step ≈ leave + début d’arrive — assez lent pour suivre la cascade.
 * Tous les écrans : mêmes timings ; seuls les slots rotatifs changent
 * (wide = secondaires ; ailleurs = ancre MTL/QC + secondaires).
 */
const WEATHER_CASCADE_STEP_MS = 440;
const WEATHER_BOARD_HOLD_MS = 10000;

function weatherMotionOk() {
  return !(sportsReducedMotion || PREFERS_REDUCED_MOTION?.matches);
}

/**
 * Entrée gare météo : rejoue l’anim (reflow) et ne retire `is-arriving` qu’à la fin.
 * Bug historique : un rAF retirait la classe à ~16 ms → anim invisible sur tous formats.
 */
function playWeatherCityArrive(el) {
  if (!el || !weatherMotionOk()) return;
  el.classList.remove('is-arriving', 'is-leaving');
  void el.offsetWidth;
  el.classList.add('is-arriving');
  const clear = () => {
    el.classList.remove('is-arriving');
    el.removeEventListener('animationend', onEnd);
  };
  const onEnd = (event) => {
    const name = String(event.animationName || '');
    if (name && !name.includes('weather-tile-arrive')) return;
    clear();
  };
  el.addEventListener('animationend', onEnd);
  window.setTimeout(clear, WEATHER_ARRIVE_MS + 80);
}

function weatherShellKey() {
  return [
    isWideNoMarqueeMode() ? 'w' : 'n',
    MASTHEAD_WEATHER_PHONE_MQ.matches ? 'd' : 'u',
    isWideDesktopComfort() ? 'c' : 'x',
  ].join('');
}

/* Max/min n’était décidé qu’à l’arrivée d’une ville : si la puce s’élargit
   ensuite (une ville retirée du bandeau, fontes, colonnes), le vide restait
   sans max/min. On refait l’ajustement quand une puce change de largeur. */
const weatherChipWidths = new WeakMap();
let weatherChipRefitFrame = 0;
const weatherChipRO = typeof ResizeObserver === 'function'
  ? new ResizeObserver((entries) => {
    let changed = false;
    for (const entry of entries) {
      const el = entry.target;
      const w = el.clientWidth;
      const prev = weatherChipWidths.get(el);
      weatherChipWidths.set(el, w);
      if (prev !== undefined && Math.abs(w - prev) >= 2) changed = true;
    }
    if (!changed || weatherChipRefitFrame) return;
    weatherChipRefitFrame = window.requestAnimationFrame(() => {
      weatherChipRefitFrame = 0;
      measureWeatherNameOverflows();
    });
  })
  : null;

function measureWeatherNameOverflows() {
  MASTHEAD_WEATHER?.querySelectorAll('.masthead-weather__city.is-active').forEach((el) => {
    if (weatherChipRO && !weatherChipWidths.has(el)) {
      weatherChipWidths.set(el, el.clientWidth);
      weatherChipRO.observe(el);
    }
    const viewport = el.querySelector('.masthead-weather__name');
    const name = el.querySelector('.masthead-weather__name-text');
    const full = el.querySelector('.masthead-weather__name-full');
    if (!viewport || !name) return;

    const prevMax = name.style.maxWidth;
    const prevOv = name.style.overflow;
    name.style.maxWidth = 'none';
    name.style.overflow = 'visible';
    const textW = Math.max(name.scrollWidth || 0, full?.scrollWidth || 0);
    name.style.maxWidth = prevMax;
    name.style.overflow = prevOv;
    applyWeatherExtraFit(el, textW);
    const viewW = viewport.clientWidth || 0;
    const overflow = viewW > 0 ? Math.max(0, textW - viewW) : 0;
    const needs = overflow > 2;
    const had = el.classList.contains('is-overflowing');
    const prev = (el.style.getPropertyValue('--weather-scroll') || '').trim();
    const next = `${overflow}px`;
    if (!needs) {
      if (had) {
        el.classList.remove('is-overflowing');
        el.style.removeProperty('--weather-scroll');
        el.style.removeProperty('--weather-scroll-trips');
      }
      return;
    }
    const trips = marqueeAlternateCount(WEATHER_SCROLL_ONE_WAY_MS, WEATHER_ROTATE_BASE_MS);
    el.style.setProperty('--weather-scroll-trips', String(trips));
    el.style.setProperty('--weather-scroll', next);
    const prevN = parseFloat(prev) || 0;
    if (had && Math.abs(prevN - overflow) < 6) return;
    el.classList.remove('is-overflowing');
    void name.offsetWidth;
    el.classList.add('is-overflowing');
  });
}

function refreshWeatherNameScroll() {
  if (isWideDesktopComfort() && MASTHEAD_WEATHER) {
    window.requestAnimationFrame(() => measureWeatherNameOverflows());
    return false;
  }
  if (isWideNoMarqueeMode() && !isWideDesktopComfort() && MASTHEAD_WEATHER) {
    window.requestAnimationFrame(() => measureWeatherNameOverflows());
    return false;
  }
  measureWeatherNameOverflows();
  return false;
}

/** Dwell météo : lire → 1 aller-retour si overflow → repos → changer. */
function weatherBoardDwellMs() {
  const base = isWideNoMarqueeMode()
    ? Math.max(WEATHER_ROTATE_BASE_MS, 9000)
    : WEATHER_ROTATE_BASE_MS;
  if (sportsReducedMotion || PREFERS_REDUCED_MOTION?.matches) return base;
  const anyOverflow = !!MASTHEAD_WEATHER?.querySelector(
    '.masthead-weather__city.is-active.is-overflowing',
  );
  if (!anyOverflow) return base;
  const trips = parseFloat(
    MASTHEAD_WEATHER.querySelector('.masthead-weather__city.is-active.is-overflowing')
      ?.style.getPropertyValue('--weather-scroll-trips'),
  ) || MARQUEE_ROUND_TRIPS;
  const n = trips >= 2 ? trips : MARQUEE_ROUND_TRIPS;
  return Math.max(
    base,
    WEATHER_SCROLL_READ_DELAY_MS + WEATHER_SCROLL_ONE_WAY_MS * n + WEATHER_SCROLL_POST_PAUSE_MS,
  );
}

function weatherCardDwellMs(el) {
  const base = isWideNoMarqueeMode() ? 9000 : WEATHER_ROTATE_BASE_MS;
  if (!el || sportsReducedMotion || PREFERS_REDUCED_MOTION?.matches) return base;
  if (!el.classList.contains('is-overflowing')) return base;
  const trips = parseFloat(el.style.getPropertyValue('--weather-scroll-trips')) || MARQUEE_ROUND_TRIPS;
  return Math.max(
    base,
    WEATHER_SCROLL_READ_DELAY_MS
      + WEATHER_SCROLL_ONE_WAY_MS * trips
      + WEATHER_SCROLL_POST_PAUSE_MS
      + 160,
  );
}

function clearMastheadWeatherTimer() {
  mastheadWeatherHolding = false;
  if (!mastheadWeatherTimer) return;
  clearTimeout(mastheadWeatherTimer);
  clearInterval(mastheadWeatherTimer);
  mastheadWeatherTimer = null;
}

/**
 * Slots qui tournent dans la vague.
 * Wide dual : 0–1 = MTL/QC persistants ; 2+ = secondaires.
 * Ailleurs : toutes les cartes (slot 0 = ancre MTL ↔ QC).
 */
function weatherCascadeSlots() {
  const n = mastheadWeatherSlots.length;
  if (n < 1) return [];
  if (weatherWideDualPrimary()) {
    if (n <= 2) return [];
    const slots = [];
    for (let i = 2; i < n; i += 1) slots.push(i);
    return slots;
  }
  const slots = [];
  for (let i = 0; i < n; i += 1) slots.push(i);
  return slots;
}

/**
 * Pause lecture après une vague.
 * Un nom qui déborde finit son aller L→R et son retour à l’origine
 * avant la vague suivante — wide compris (sinon la carte part à ~10 s,
 * le texte encore décalé).
 */
function weatherBoardHoldMs() {
  measureWeatherNameOverflows();
  const n = Math.max(1, weatherCascadeSlots().length);
  let hold = Math.max(WEATHER_BOARD_HOLD_MS, 1200 * n);
  const anyOverflow = !!MASTHEAD_WEATHER?.querySelector(
    '.masthead-weather__city.is-active.is-overflowing',
  );
  if (anyOverflow && weatherMotionOk()) {
    hold = Math.max(hold, weatherBoardDwellMs());
  } else {
    hold = Math.min(14000, hold);
  }
  return hold;
}

/**
 * Cascade L→R des cartes rotatives, puis pause, puis une nouvelle vague.
 * Particularités conservées dans rotateOneMastheadWeatherCard (ancres
 * duales, MTL↔QC, index compact campus/nation).
 */
function scheduleWeatherCascade({ firstHold = true } = {}) {
  clearMastheadWeatherTimer();
  if (!MASTHEAD_WEATHER || MASTHEAD_WEATHER.classList.contains('hidden')) return;
  const slots = weatherCascadeSlots();
  if (!slots.length) return;

  const stepMs = (sportsReducedMotion || PREFERS_REDUCED_MOTION?.matches)
    ? 80
    : WEATHER_CASCADE_STEP_MS;

  const step = (index) => {
    const live = weatherCascadeSlots();
    if (!live.length) return;
    if (index >= live.length) {
      mastheadWeatherHolding = true;
      mastheadWeatherTimer = window.setTimeout(() => {
        mastheadWeatherTimer = null;
        mastheadWeatherHolding = false;
        scheduleWeatherCascade({ firstHold: false });
      }, weatherBoardHoldMs());
      return;
    }
    rotateOneMastheadWeatherCard(live[index]);
    mastheadWeatherTimer = window.setTimeout(() => {
      mastheadWeatherTimer = null;
      step(index + 1);
    }, stepMs);
  };

  if (firstHold) {
    mastheadWeatherHolding = true;
    mastheadWeatherTimer = window.setTimeout(() => {
      mastheadWeatherTimer = null;
      mastheadWeatherHolding = false;
      step(0);
    }, weatherBoardHoldMs());
    return;
  }
  step(0);
}

function scheduleMastheadWeatherRotate() {
  clearMastheadWeatherTimer();
  if (!MASTHEAD_WEATHER || MASTHEAD_WEATHER.classList.contains('hidden')) return;
  // Tous les écrans : vague + pause. Rien à faire si seules les ancres tiennent.
  if (!weatherCascadeSlots().length) return;
  scheduleWeatherCascade({ firstHold: true });
}

function rotateOneMastheadWeatherCard(forcedSlot) {
  if (!mastheadWeatherSlots.length || !MASTHEAD_WEATHER) return;
  const n = mastheadWeatherSlots.length;
  const dualPrimary = weatherWideDualPrimary() && n >= 2;
  // Wide dual : ne jamais tourner les slots 0–1 (MTL + QC persistants).
  if (dualPrimary && n <= 2) return;
  let slot = Number.isInteger(forcedSlot) ? forcedSlot : (mastheadWeatherNextSlot % n);
  if (dualPrimary) {
    if (slot < 2) slot = 2;
    if (slot >= n) slot = 2;
  }
  const previous = mastheadWeatherSlots[slot];
  const usedIds = new Set(
    mastheadWeatherSlots.filter((_, index) => index !== slot).map((city) => city.id),
  );
  // Primaires toujours « utilisées » pour ne pas les réinjecter en secondaire
  if (dualPrimary) {
    usedIds.add('montreal');
    usedIds.add('quebec');
  }
  let replacement;
  if (!dualPrimary && slot === 0) {
    // Prod : carte spéciale alterne exclusivement Montréal ↔ Québec.
    mastheadWeatherPrimaryIndex = (mastheadWeatherPrimaryIndex + 1)
      % MASTHEAD_WEATHER_PRIMARY_SEQUENCE.length;
    replacement = WEATHER_CITIES.find(
      (city) => city.id === MASTHEAD_WEATHER_PRIMARY_SEQUENCE[mastheadWeatherPrimaryIndex],
    );
  } else {
    if (!dualPrimary && slot === 1 && n <= 2) {
      mastheadWeatherCompactSecondaryIndex = (mastheadWeatherCompactSecondaryIndex + 1) % 3;
    }
    replacement = dualPrimary
      ? nextWideSecondaryCity(usedIds)
      : nextWeatherCity(
        weatherSecondaryGroup(slot, n),
        usedIds,
      );
  }
  if (!replacement) return;
  // Même ville (deck vide / un seul candidat) : avancer le curseur sans anim fantôme.
  if (previous?.id === replacement.id) {
    mastheadWeatherNextSlot = dualPrimary ? advanceWideWeatherSlot(slot, n) : (slot + 1) % n;
    if (dualPrimary && mastheadWeatherNextSlot < 2) mastheadWeatherNextSlot = 2;
    return;
  }

  const applyBoardWithArrive = () => {
    mastheadWeatherSlots[slot] = replacement;
    mastheadWeatherNextSlot = dualPrimary
      ? advanceWideWeatherSlot(slot, mastheadWeatherSlots.length)
      : (slot + 1) % mastheadWeatherSlots.length;
    if (dualPrimary && mastheadWeatherNextSlot < 2) mastheadWeatherNextSlot = 2;
    showMastheadWeatherBoard();
    const arriving = MASTHEAD_WEATHER.querySelector(
      `.masthead-weather__city.is-active[data-weather-city="${replacement.id}"]`,
    );
    if (!arriving) return;
    arriving.classList.remove('is-overflowing');
    playWeatherCityArrive(arriving);
    // Mesure marquee après paint (double rAF : grille + fontes).
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => refreshWeatherNameScroll());
    });
  };

  const oldEl = previous
    ? MASTHEAD_WEATHER.querySelector(
      `.masthead-weather__city.is-active[data-weather-city="${previous.id}"]`,
    )
    : null;

  // Sortie → entrée (tous formats : mât bureau + dock 390–900).
  if (oldEl && weatherMotionOk()) {
    if (oldEl._weatherLeaveTimer) {
      clearTimeout(oldEl._weatherLeaveTimer);
      oldEl._weatherLeaveTimer = null;
    }
    oldEl.classList.remove('is-arriving');
    oldEl.classList.add('is-leaving');
    oldEl.style.pointerEvents = 'none';
    oldEl._weatherLeaveTimer = window.setTimeout(() => {
      oldEl._weatherLeaveTimer = null;
      oldEl.classList.remove('is-leaving');
      oldEl.style.pointerEvents = '';
      applyBoardWithArrive();
    }, WEATHER_LEAVE_MS);
    return;
  }

  applyBoardWithArrive();
}

function scheduleMastheadWeatherLayout(source = 'resize') {
  // Un RO du mât ne doit pas annuler un resize/mq : sinon 1920→2560 garde
  // l’ancien nombre de cartes (le RO no-op et le rAF resize n’a jamais lieu).
  if (source === 'ro' && scheduleMastheadWeatherLayout._busy) return;
  if (source === 'ro' && isWideDesktopComfort()) return;
  window.cancelAnimationFrame(mastheadWeatherResizeFrame);
  scheduleMastheadWeatherLayout._busy = true;
  mastheadWeatherResizeFrame = window.requestAnimationFrame(() => {
    const nowW = document.documentElement.clientWidth || 0;
    const prevW = scheduleMastheadWeatherLayout._w;
    scheduleMastheadWeatherLayout._w = nowW;
    const layoutKey = weatherShellKey();
    const prevKey = scheduleMastheadWeatherLayout._key;
    scheduleMastheadWeatherLayout._key = layoutKey;
    const keyChanged = prevKey != null && prevKey !== layoutKey;
    const viewportChanged = prevW != null && Math.abs(nowW - prevW) > 8;
    if (keyChanged || viewportChanged) {
      mastheadWeatherFitCount = null;
      weatherAvailTrim = 0;
      clearWeatherSlotInlineStyles();
    }
    mastheadWeatherTooNarrow = false;
    weatherOverlapFitDepth = 0;
    MASTHEAD_WEATHER?.classList.remove('is-too-narrow');
    if (keyChanged || source !== 'ro') clearWeatherSlotInlineStyles();
    mastheadWeatherResizeFrame = window.requestAnimationFrame(() => {
      scheduleMastheadWeatherLayout._busy = false;
      showMastheadWeatherBoard();
    });
  });
}

function bindMastheadWeatherLayoutWatchers() {
  if (bindMastheadWeatherLayoutWatchers._bound) return;
  bindMastheadWeatherLayoutWatchers._bound = true;
  window.addEventListener('resize', () => scheduleMastheadWeatherLayout('resize'), { passive: true });
  try {
    window.visualViewport?.addEventListener('resize', () => scheduleMastheadWeatherLayout('resize'), { passive: true });
  } catch { /* ignore */ }
  [
    MASTHEAD_WEATHER_PHONE_MQ,
    window.matchMedia('(min-width: 1280px)'),
    window.matchMedia('(min-width: 1440px)'),
    window.matchMedia(typeof RADAR_HD_MQ === 'string' ? RADAR_HD_MQ : '(min-width: 1880px)'),
    window.matchMedia('(min-width: 2560px)'),
    window.matchMedia('(min-width: 3440px)'),
  ].forEach((mq) => onMediaQueryChange(mq, () => scheduleMastheadWeatherLayout('mq')));
  if (typeof ResizeObserver === 'undefined') return;
  const watch = (el) => {
    if (!el) return;
    let lastW = el.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (Math.abs(w - lastW) < 2) return;
      lastW = w;
      scheduleMastheadWeatherLayout('ro');
    });
    ro.observe(el);
  };
  watch(document.querySelector('.masthead-top'));
  watch(MASTHEAD_WEATHER_DOCK);
}

function startMastheadWeatherBoard() {
  if (!MASTHEAD_WEATHER) return;
  showMastheadWeatherBoard();
  // Fontes : retoggle marquee seulement. Interdit de relancer le layout
  // (une 2e passe élargissait MTL/QC : 184 → 199 px).
  const fonts = document.fonts;
  if (fonts?.ready && typeof fonts.ready.then === 'function') {
    fonts.ready.then(() => {
      if (!MASTHEAD_WEATHER?.isConnected) return;
      const before = !!MASTHEAD_WEATHER.querySelector(
        '.masthead-weather__city.is-active.is-overflowing',
      );
      measureWeatherNameOverflows();
      const after = !!MASTHEAD_WEATHER.querySelector(
        '.masthead-weather__city.is-active.is-overflowing',
      );
      // Le premier hold a pu être calculé avant les fontes. On ne relance
      // que si un débordement apparaît pendant la pause, pas au milieu d’une vague.
      if (after && !before && mastheadWeatherHolding) scheduleMastheadWeatherRotate();
    }).catch(() => { /* ignore */ });
  }
  // Chaîne setTimeout (pas interval fixe) : le dwell suit le marquee réel.
  if (!mastheadWeatherTimer) scheduleMastheadWeatherRotate();
  bindMastheadWeatherLayoutWatchers();
}

function renderMastheadWeather(entries) {
  if (!MASTHEAD_WEATHER || !Array.isArray(entries)) return;
  buildMastheadWeatherBoard();
  WEATHER_CITIES.forEach((city, index) => {
    const current = entries[index]?.current;
    const el = MASTHEAD_WEATHER.querySelector(`[data-weather-city="${city.id}"]`);
    if (!el || !current || !Number.isFinite(current.temperature_2m)) return;
    el.querySelector('.masthead-weather__icon').innerHTML = weatherIcon(current.weather_code, current.is_day);
    el.querySelector('.masthead-weather__temp').textContent = `${Math.round(current.temperature_2m)}°`;
    el.dataset.weatherTone = weatherTone(current.weather_code);
    paintWeatherExtra(el, entries[index]);
  });
  MASTHEAD_WEATHER.classList.remove('hidden');
  syncMastheadShuffleButton();
  startMastheadWeatherBoard();
  window.requestAnimationFrame(() => {
    if (MASTHEAD_WEATHER?.querySelector('.masthead-weather__city.is-active')) {
      markUiReady(MASTHEAD_WEATHER);
    }
  });
}

window.addEventListener('radar:translate-mode', refreshMastheadWeatherLinks);

// Changer de langue redimensionne le mât : la colonne date est en max-content
// (style-masthead.css) et « Thursday, August 6, 2026 » est plus large que
// « jeudi 6 août 2026 ». La cellule météo perd donc ~40 px sans que personne
// ne le recalcule — la carte primaire débordait jusqu'au prochain tick de
// rotation, qui retirait une ville. On replanifie la mise en page comme on le
// fait déjà au resize, pour la même raison : la largeur disponible a changé.
window.addEventListener('radar:translate-mode', scheduleMastheadWeatherLayout);

function readWeatherCache(maxAgeMs = WEATHER_CACHE_MS) {
  try {
    const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || 'null');
    if (cached?.at && Date.now() - cached.at < maxAgeMs && Array.isArray(cached.entries)
        && cached.entries.length === WEATHER_CITIES.length) return cached.entries;
  } catch { /* cache absent ou invalide */ }
  return null;
}

/** Lab local (python http.server / vite) — pas de météo en prod sans API. */
function isLocalWeatherLabHost() {
  try {
    // App Android (Capacitor) : servie depuis https://localhost, mais ce
    // n'est pas un lab — jamais de fausses températures.
    if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) return false;
    const h = String(location.hostname || '');
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Repli lab : temps plausibles QC pour juger layout / parité sports sans
 * dépendre du Worker (CORS non déployé, offline, timeout). Jamais en prod.
 */
function weatherLabFixtureEntries() {
  const hour = new Date().getHours();
  const isDay = hour >= 6 && hour < 21 ? 1 : 0;
  return WEATHER_CITIES.map((city, i) => {
    // Légère variation nord/sud + index pour que la rotation change de ton.
    const base = 16 + ((i * 3) % 11);
    const latNudge = Number.isFinite(city.lat) ? (48 - city.lat) * 0.35 : 0;
    const temperature = Math.round((base - latNudge) * 10) / 10;
    const code = [0, 1, 2, 3, 61, 0, 1, 80][i % 8];
    return {
      current: {
        temperature_2m: temperature,
        weather_code: code,
        is_day: isDay,
      },
      daily: {
        weather_code: [code, 1],
        temperature_2m_max: [temperature + 2, temperature + 1],
        temperature_2m_min: [temperature - 5, temperature - 4],
      },
    };
  });
}

/**
 * Accueil seulement dans le HTML historique : les fiches SEO / hub n'avaient
 * pas les coquilles. On les pose dès qu'un mât existe (pas pomo / solitaire /
 * maintenance) pour que météo et scores soient les mêmes partout.
 */
function ensureMastheadBoards() {
  const top = document.querySelector('.masthead-top');
  if (!top) return;

  const en = document.documentElement.lang.startsWith('en');
  if (!MASTHEAD_WEATHER) {
    const weather = document.createElement('div');
    weather.id = 'masthead-weather';
    weather.className = 'masthead-weather hidden';
    weather.setAttribute('aria-label', en ? 'Québec weather' : 'Météo du Québec');
    weather.setAttribute('aria-live', 'polite');
    weather.innerHTML = `<span class="masthead-weather__board" aria-label="${en ? 'Current conditions' : 'Conditions actuelles'}"></span>`;
    const date = top.querySelector('.masthead-date');
    const actions = top.querySelector('.masthead-actions');
    if (date?.nextSibling) top.insertBefore(weather, date.nextSibling);
    else if (actions) top.insertBefore(weather, actions);
    else top.appendChild(weather);
    MASTHEAD_WEATHER = weather;
  }

  if (!MASTHEAD_WEATHER_DOCK) {
    const dock = document.createElement('div');
    dock.id = 'masthead-weather-dock';
    dock.className = 'masthead-weather-dock';
    MASTHEAD_WEATHER_DOCK = dock;
  }

  if (!MASTHEAD_SPORTS_STRIP) {
    const strip = document.createElement('div');
    strip.id = 'masthead-sports-strip';
    strip.className = 'masthead-sports-strip';
    strip.hidden = true;
    strip.setAttribute('aria-label', en
      ? 'Québec student sports scores'
      : 'Résultats sportifs étudiants du Québec');
    strip.setAttribute('aria-live', 'polite');
    MASTHEAD_SPORTS_STRIP = strip;
  }

  const main = document.querySelector('main');
  const tuner = document.getElementById('tuner');
  const mountParent = main?.parentNode || tuner?.parentNode || document.body;
  const beforeMain = main || null;
  if (!MASTHEAD_WEATHER_DOCK.parentNode) {
    mountParent.insertBefore(MASTHEAD_WEATHER_DOCK, beforeMain);
  }
  if (!MASTHEAD_SPORTS_STRIP.parentNode) {
    if (MASTHEAD_WEATHER_DOCK.nextSibling) {
      mountParent.insertBefore(MASTHEAD_SPORTS_STRIP, MASTHEAD_WEATHER_DOCK.nextSibling);
    } else {
      mountParent.insertBefore(MASTHEAD_SPORTS_STRIP, beforeMain);
    }
  }

  mastheadWeatherHomeParent = MASTHEAD_WEATHER.parentNode;
  mastheadWeatherHomeNextSibling = MASTHEAD_WEATHER.nextSibling;
}

function weatherForecastUrl() {
  const params = new URLSearchParams({
    latitude: WEATHER_CITIES.map((city) => city.lat).join(','),
    longitude: WEATHER_CITIES.map((city) => city.lon).join(','),
    current: 'temperature_2m,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    forecast_days: '2',
    temperature_unit: 'celsius',
    timezone: 'America/Toronto',
  });
  // Passe par le cache partagé (workers/weather-cache) plutôt qu'Open-Meteo
  // directement : à l'échelle, chaque visiteur qui appelle l'API anonyme
  // épuisait son quota gratuit et coupait la météo pour tout le monde.
  return `${WEATHER_API_BASE}/v1/forecast?${params}`;
}

async function fetchWeatherOnce(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`weather ${response.status}`);
    const data = await response.json();
    const entries = Array.isArray(data) ? data : [data];
    if (entries.length !== WEATHER_CITIES.length) throw new Error('weather length');
    return entries;
  } finally {
    clearTimeout(timer);
  }
}

let mastheadWeatherLoading = false;
let mastheadWeatherRecoveryBound = false;

/** Après échec total : réessayer au retour du réseau ou de l'onglet. */
function bindMastheadWeatherRecovery() {
  if (mastheadWeatherRecoveryBound) return;
  mastheadWeatherRecoveryBound = true;
  const retry = () => {
    if (MASTHEAD_WEATHER?.dataset.ready === '1' && readWeatherCache()) return;
    void initMastheadWeather();
  };
  window.addEventListener('online', retry);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') retry();
  });
}

async function initMastheadWeather() {
  // Sous le seuil du masthead, la météo se déplace sous le syntoniseur
  // (setMastheadWeatherDocked) plutôt que d'être masquée : la charger
  // reste utile à toutes les largeurs.
  if (!MASTHEAD_WEATHER || mastheadWeatherLoading) return;
  mastheadWeatherLoading = true;
  try {
    const fresh = readWeatherCache();
    // Cache périmé (< 3 h) affiché tout de suite : le réseau le remplace.
    const cached = fresh || readWeatherCache(WEATHER_STALE_MS);
    if (cached) renderMastheadWeather(cached);
    const url = weatherForecastUrl();
    for (let attempt = 0; attempt < WEATHER_FETCH_TIMEOUTS_MS.length; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, WEATHER_RETRY_DELAY_MS * attempt));
      }
      try {
        const entries = await fetchWeatherOnce(url, WEATHER_FETCH_TIMEOUTS_MS[attempt]);
        try { localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ at: Date.now(), entries })); } catch { /* quota */ }
        renderMastheadWeather(entries);
        return;
      } catch {
        // Lab local : afficher un bandeau même si le Worker refuse localhost
        // (CORS) ou est offline — nécessaire pour juger météo ∥ sports.
        // Dès le premier échec ; les essais suivants le remplacent au besoin.
        if (attempt === 0 && !cached && isLocalWeatherLabHost()) {
          renderMastheadWeather(weatherLabFixtureEntries());
        }
      }
    }
    if (isLocalWeatherLabHost()) return;
    /* prod : module discret — absent si la météo est indisponible ;
       on réessaie quand le réseau ou l'onglet revient. */
    bindMastheadWeatherRecovery();
  } finally {
    mastheadWeatherLoading = false;
  }
}


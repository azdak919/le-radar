/**
 * LE RADAR — Weather cache + fallback
 *
 * Every visitor's browser used to call Open-Meteo directly for the masthead
 * and Pomo weather ribbons. At real traffic volumes that exhausts Open-Meteo's
 * shared anonymous daily quota (HTTP 429 "Daily API request limit exceeded"),
 * and the whole ribbon goes dark for everyone at once.
 *
 * This Worker sits in front of it: one shared edge cache (~15 min, matching
 * the client's own localStorage cache) means the origin API is called once
 * per cache window for the whole site, not once per visitor. If Open-Meteo
 * still fails, it falls back to MET Norway (api.met.no), which is free,
 * keyless, and has no comparable global quota.
 */

const ALLOWED_ORIGINS = new Set([
  'https://le-radar.ca',
  'https://www.le-radar.ca',
  'https://azdak919.github.io',
]);
const CACHE_MAX_AGE = 900; // 15 min — aligné sur WEATHER_CACHE_MS (app.js / pomo)
const MET_NORWAY_USER_AGENT = 'le-radar.ca weather-cache/1.0 (https://le-radar.ca)';

/**
 * Lab local (python http.server / vite / playwright) : le **port change**
 * souvent (8765, 8766, 5173, 3000…). On parse l’Origin plutôt qu’un regex
 * figé — hostname loopback seulement, n’importe quel port.
 */
function isLabDevOrigin(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    // Port libre (8765, 5173…). Hostname only — URL API may keep [::1] brackets.
    const h = String(u.hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1';
  } catch {
    return false;
  }
}

/**
 * CORS — parité nowplaying-cache / bg-rotation :
 * prod le-radar.ca + pages GH + lab local (port variable).
 * Sans lab, le bandeau météo reste `hidden` en preview locale
 * (fetch CORS bloqué → impossible de juger météo ∥ sports).
 *
 * Toujours renvoyer l’Origin **de la requête** (pas une valeur en cache) :
 * un hit lab d’un autre port ne doit jamais empoisonner prod ni un autre port.
 */
function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  let allow = 'https://le-radar.ca';
  if (ALLOWED_ORIGINS.has(origin)) allow = origin;
  else if (isLabDevOrigin(origin)) allow = origin;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(value, request, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(request),
      ...extraHeaders,
    },
  });
}

function parseCoordList(value) {
  return String(value || '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n));
}

async function fetchOpenMeteo(url) {
  const upstream = await fetch(url, { cf: { cacheTtl: 0, cacheEverything: false } });
  if (!upstream.ok) throw new Error(`open-meteo ${upstream.status}`);
  const data = await upstream.json();
  const entries = Array.isArray(data) ? data : [data];
  if (!entries.every((entry) => Number.isFinite(entry?.current?.temperature_2m))) {
    throw new Error('open-meteo: réponse incomplète');
  }
  return entries;
}

// Correspondance approximative symbol_code (MET Norway) → code WMO utilisé
// par weatherIcon()/weatherTone() côté client. Best-effort : ce chemin ne
// sert qu'en repli, quand Open-Meteo est indisponible.
function metSymbolToWmoCode(symbol = '') {
  const s = symbol.toLowerCase();
  if (s.includes('thunder')) return 95;
  if (s.includes('snow') || s.includes('sleet')) return 71;
  if (s.includes('rain') || s.includes('shower')) return 61;
  if (s.includes('fog')) return 45;
  if (s.includes('cloudy') && !s.includes('partlycloudy') && !s.includes('fair')) return 3;
  if (s.includes('partlycloudy') || s.includes('fair')) return 1;
  if (s.includes('clearsky')) return 0;
  return 2;
}

function metSymbolIsDay(symbol = '', lat, lon) {
  if (symbol.includes('_day')) return 1;
  if (symbol.includes('_night')) return 0;
  // Beaucoup de codes (pluie, neige, orage…) n'ont pas de variante jour/nuit —
  // estimation grossière de l'heure locale à partir de la longitude.
  const utcHour = new Date().getUTCHours();
  const localHour = (utcHour + Math.round(lon / 15) + 24) % 24;
  return localHour >= 6 && localHour < 20 ? 1 : 0;
}

async function fetchMetNorwayOne(lat, lon) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
  const response = await fetch(url, { headers: { 'User-Agent': MET_NORWAY_USER_AGENT } });
  if (!response.ok) throw new Error(`met.no ${response.status}`);
  const data = await response.json();
  const first = data?.properties?.timeseries?.[0];
  const details = first?.data?.instant?.details;
  const temperature = Number(details?.air_temperature);
  const symbol = first?.data?.next_1_hours?.summary?.symbol_code
    || first?.data?.next_6_hours?.summary?.symbol_code
    || 'cloudy';
  if (!Number.isFinite(temperature)) throw new Error('met.no: pas de température');
  return {
    current: {
      temperature_2m: temperature,
      weather_code: metSymbolToWmoCode(symbol),
      is_day: metSymbolIsDay(symbol, lat, lon),
    },
  };
}

async function fetchMetNorwayFallback(lats, lons) {
  return Promise.all(lats.map((lat, index) => fetchMetNorwayOne(lat, lons[index])));
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, request, 405);

    const url = new URL(request.url);
    if (url.pathname !== '/v1/forecast') return json({ error: 'Not found' }, request, 404);

    const lats = parseCoordList(url.searchParams.get('latitude'));
    const lons = parseCoordList(url.searchParams.get('longitude'));
    if (!lats.length || lats.length !== lons.length) {
      return json({ error: 'latitude/longitude invalides' }, request, 400);
    }

    // Cache API key = path+query only (no Origin). CORS is re-applied on every
    // response. Returning a cached Response as-is poisoned prod: a lab hit from
    // http://127.0.0.1:PORT stored Access-Control-Allow-Origin for localhost,
    // then browsers on https://le-radar.ca got that header → CORS block →
    // #masthead-weather stayed .hidden for everyone until TTL expired.
    const cache = caches.default;
    const cacheKey = new Request(`https://weather-cache.internal/v1/forecast?${url.searchParams}`, {
      method: 'GET',
    });
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      Object.entries(corsHeaders(request)).forEach(([k, v]) => headers.set(k, v));
      headers.set('X-LR-Cache', 'HIT');
      // Do not let a shared CDN re-cache an origin-specific CORS response.
      headers.set('CDN-Cache-Control', 'no-store');
      return new Response(cached.body, { status: cached.status, headers });
    }

    const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?${url.searchParams}`;
    let entries;
    try {
      entries = await fetchOpenMeteo(openMeteoUrl);
    } catch {
      try {
        entries = await fetchMetNorwayFallback(lats, lons);
      } catch {
        return json({ error: 'Météo indisponible' }, request, 503);
      }
    }

    // Store body without origin-bound CORS; apply CORS only on the way out.
    const body = JSON.stringify(entries);
    const storeHeaders = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
    };
    const toStore = new Response(body, { status: 200, headers: storeHeaders });
    ctx.waitUntil(cache.put(cacheKey, toStore.clone()));

    return new Response(body, {
      status: 200,
      headers: {
        ...storeHeaders,
        ...corsHeaders(request),
        'X-LR-Cache': 'MISS',
        'CDN-Cache-Control': 'no-store',
      },
    });
  },
};

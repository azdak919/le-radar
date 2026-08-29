/**
 * LE-RADAR — cache + repli MT (parité weather-cache).
 *
 * Le navigateur tapait gtx + MyMemory tout seul : 429 Google et quota
 * MyMemory → plus aucune traduction en prod. Un cache partagé : une chaîne
 * chrome n’est traduite qu’une fois pour tout le site.
 */

const ALLOWED_ORIGINS = new Set([
  'https://le-radar.ca',
  'https://www.le-radar.ca',
  'https://azdak919.github.io',
]);
const CACHE_MAX_AGE = 6 * 60 * 60; // 6 h — chrome + titres stables
const FETCH_MS = 6000;
const MAX_Q = 450;
const UA = 'le-radar.ca translate-cache/1.0 (https://le-radar.ca)';

function isLabDevOrigin(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const h = String(u.hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1';
  } catch {
    return false;
  }
}

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

export function isJunkMt(text) {
  const t = String(text || '');
  if (!t.trim()) return true;
  if (/<html[\s>]/i.test(t) || /<title>\s*Sorry/i.test(t)) return true;
  if (/MYMEMORY WARNING/i.test(t) || /YOU USED ALL AVAILABLE/i.test(t)) return true;
  if (/NEXT AVAILABLE IN/i.test(t) && /TRANSLATE MORE/i.test(t)) return true;
  return false;
}

export function readMtPayload(data) {
  if (data == null) return '';
  if (typeof data === 'string') return data.trim();
  if (typeof data.t === 'string') return String(data.t).trim();
  if (Array.isArray(data) && typeof data[0] === 'string') {
    return data.filter((s) => typeof s === 'string').join('').trim();
  }
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0].map((s) => (Array.isArray(s) ? s[0] : '')).filter(Boolean).join('').trim();
  }
  if (data.responseData?.translatedText) {
    return String(data.responseData.translatedText).trim();
  }
  return '';
}

function sameMtText(a = '', b = '') {
  return String(a).replace(/\s+/g, ' ').trim() === String(b).replace(/\s+/g, ' ').trim();
}

function usable(text, core) {
  const t = String(text || '').trim();
  if (!t || isJunkMt(t) || sameMtText(t, core) || t === core.toUpperCase()) return '';
  return t;
}

async function fetchJson(url, ms = FETCH_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!resp.ok) return null;
    const ctype = resp.headers.get('content-type') || '';
    if (ctype.includes('text/html')) return null;
    return await resp.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function translateUpstream(core, sl, tl) {
  const q = encodeURIComponent(core);
  const dict = await fetchJson(
    `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&q=${q}`,
  );
  let hit = usable(readMtPayload(dict), core);
  if (hit) return hit;

  const gtx = await fetchJson(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${q}`,
  );
  hit = usable(readMtPayload(gtx), core);
  if (hit) return hit;

  const mm = await fetchJson(
    `https://api.mymemory.translated.net/get?q=${q}&langpair=${encodeURIComponent(sl)}|${encodeURIComponent(tl)}`,
  );
  return usable(readMtPayload(mm), core) || '';
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, request, 405);

    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true }, request);

    if (url.pathname !== '/v1/translate') return json({ error: 'Not found' }, request, 404);

    const q = String(url.searchParams.get('q') || '');
    const sl = String(url.searchParams.get('sl') || 'fr').slice(0, 16);
    const tl = String(url.searchParams.get('tl') || '').slice(0, 16);
    if (!q || !tl || q.length > MAX_Q) {
      return json({ error: 'q/tl invalides' }, request, 400);
    }

    const cache = caches.default;
    const cacheKey = new Request(
      `https://translate-cache.internal/v1/translate?sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(q)}`,
      { method: 'GET' },
    );
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      Object.entries(corsHeaders(request)).forEach(([k, v]) => headers.set(k, v));
      headers.set('X-LR-Cache', 'HIT');
      headers.set('CDN-Cache-Control', 'no-store');
      return new Response(cached.body, { status: cached.status, headers });
    }

    const translated = await translateUpstream(q, sl, tl);
    if (!translated) return json({ error: 'Traduction indisponible' }, request, 503);

    const body = JSON.stringify({ t: translated });
    const storeHeaders = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
    };
    const toStore = new Response(body, { status: 200, headers: storeHeaders });
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(cache.put(cacheKey, toStore.clone()));
    } else {
      try { await cache.put(cacheKey, toStore.clone()); } catch { /* Cache API */ }
    }

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

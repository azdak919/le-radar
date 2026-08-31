/**
 * LE-RADAR — cache partagé de traductions (plus de proxy Google).
 *
 * Les IP Cloudflare sont souvent 403/429 sur clients5/gtx. Le navigateur
 * traduit (IP résidentielle) ; ce Worker ne fait que lookup + store.
 *
 * GET  /v1/translate?tl=&q=  → HIT 200 {t} / MISS 404 {error:"miss"}
 * POST /v1/lookup            → { hits, missed }  body { tl, q: string[] }
 * POST /v1/store             → { ok, stored }    body { tl, items: [{q,t}] }
 */

const ALLOWED_ORIGINS = new Set([
  'https://le-radar.ca',
  'https://www.le-radar.ca',
  'https://azdak919.github.io',
]);
const CACHE_MAX_AGE = 7 * 24 * 60 * 60; // 7 j — une paire (texte, langue) est stable
const MAX_Q = 450;
const MAX_BATCH = 80;

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
  if (/PLEASE SELECT TWO DISTINCT LANGUAGES/i.test(t)) return true;
  if (/VEUILLEZ S[ÉE]LECTIONNER DEUX LANGUES DISTINCTES/i.test(t)) return true;
  if (/INVALID LANGUAGE PAIR/i.test(t) || /NO QUERY SPECIFIED/i.test(t)) return true;
  if (/QUERY LENGTH LIMIT/i.test(t)) return true;
  return false;
}

export function sameMtLang(a, b) {
  const canon = (c) => {
    let x = String(c || '').trim();
    if (!x) return '';
    if (x === 'iw') x = 'he';
    if (x === 'fa-IR' || x === 'fa-ir') x = 'fa';
    if (x === 'iu-Latn' || x === 'iu-latn') x = 'iu';
    if (x === 'zh-CN' || x === 'zh-cn') x = 'zh';
    if (x === 'fil') x = 'tl';
    return x.toLowerCase();
  };
  const na = canon(a);
  const nb = canon(b);
  return !!na && !!nb && na === nb;
}

export function readMtPayload(data) {
  if (data == null) return '';
  if (typeof data === 'object' && !Array.isArray(data) && data.responseStatus != null
      && Number(data.responseStatus) !== 200) {
    return '';
  }
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

/** Traduction réelle seulement — pas d’écho (identité) ni de poubelle. */
export function isStoreableMt(q, t) {
  const core = String(q || '').trim();
  const out = String(t || '').trim();
  if (!core || !out) return false;
  if (core.length > MAX_Q) return false;
  if (isJunkMt(out)) return false;
  if (sameMtText(out, core) || out === core.toUpperCase()) return false;
  return true;
}

function cacheRequest(tl, q) {
  return new Request(
    `https://translate-cache.internal/v2/translate?tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(q)}`,
    { method: 'GET' },
  );
}

async function readHit(cache, tl, q) {
  const cached = await cache.match(cacheRequest(tl, q));
  if (!cached) return null;
  try {
    const payload = await cached.json();
    const hit = String(payload?.t || '').trim();
    if (!isStoreableMt(q, hit)) return null;
    return hit;
  } catch {
    return null;
  }
}

async function writeHit(cache, ctx, tl, q, t) {
  if (!isStoreableMt(q, t)) return false;
  const body = JSON.stringify({ t: String(t).trim() });
  const toStore = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
    },
  });
  const key = cacheRequest(tl, q);
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(cache.put(key, toStore));
  } else {
    try { await cache.put(key, toStore); } catch { /* Cache API */ }
  }
  return true;
}

function clipTl(raw) {
  return String(raw || '').slice(0, 16);
}

async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true }, request);

    const cache = caches.default;

    if (url.pathname === '/v1/lookup' && request.method === 'POST') {
      const body = await parseJsonBody(request);
      const tl = clipTl(body?.tl);
      const list = Array.isArray(body?.q) ? body.q : [];
      if (!tl || list.length === 0) return json({ error: 'tl/q invalides' }, request, 400);
      if (list.length > MAX_BATCH) return json({ error: 'batch trop grand' }, request, 400);

      const hits = {};
      const missed = [];
      for (const raw of list) {
        const q = String(raw || '');
        if (!q || q.length > MAX_Q) {
          missed.push(q);
          continue;
        }
        const hit = await readHit(cache, tl, q);
        if (hit) hits[q] = hit;
        else missed.push(q);
      }
      return json({ hits, missed }, request, 200, { 'X-LR-Cache': 'LOOKUP' });
    }

    if (url.pathname === '/v1/store' && request.method === 'POST') {
      const body = await parseJsonBody(request);
      const tl = clipTl(body?.tl);
      const items = Array.isArray(body?.items) ? body.items : [];
      if (!tl) return json({ error: 'tl invalide' }, request, 400);
      if (items.length > MAX_BATCH) return json({ error: 'batch trop grand' }, request, 400);

      let stored = 0;
      for (const item of items) {
        const q = String(item?.q || '');
        const t = String(item?.t || '');
        if (await writeHit(cache, ctx, tl, q, t)) stored += 1;
      }
      return json({ ok: true, stored }, request);
    }

    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, request, 405);

    if (url.pathname !== '/v1/translate') return json({ error: 'Not found' }, request, 404);

    const q = String(url.searchParams.get('q') || '');
    const sl = clipTl(url.searchParams.get('sl') || 'fr');
    const tl = clipTl(url.searchParams.get('tl') || '');
    if (!q || !tl || q.length > MAX_Q) {
      return json({ error: 'q/tl invalides' }, request, 400);
    }
    if (sameMtLang(sl, tl)) {
      return json({ error: 'same language' }, request, 404, { 'X-LR-Cache': 'SKIP' });
    }

    const hit = await readHit(cache, tl, q);
    if (hit) {
      return json({ t: hit }, request, 200, {
        'X-LR-Cache': 'HIT',
        'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
        'CDN-Cache-Control': 'no-store',
      });
    }
    // MISS : 404 (pas 503). L’ancien client coupe alors le Worker et passe à clients5.
    return json({ error: 'miss' }, request, 404, {
      'X-LR-Cache': 'MISS',
      'CDN-Cache-Control': 'no-store',
    });
  },
};

/**
 * LE RADAR — Background rotation entropy (Cloudflare Worker, free tier)
 *
 * Cloudflare edge : crypto.getRandomValues (qualité production) +
 * métadonnées colo. Aucun KV / D1 requis → 0 maintenance d’état.
 *
 * Endpoints :
 *   GET /v1/entropy?surface=masthead|pomo
 *   GET /health
 *
 * Free Workers ≈ 100k req/jour — largement suffisant pour le-radar.
 * Le client mélange cette entropie au CSPRNG local (bg-rotation-lib.js).
 */

const ALLOWED_ORIGINS = new Set([
  'https://le-radar.ca',
  'https://www.le-radar.ca',
  'https://azdak919.github.io',
]);

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  // Dev local : autoriser file/localhost pour tests
  let allow = 'https://le-radar.ca';
  if (ALLOWED_ORIGINS.has(origin)) allow = origin;
  else if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    allow = origin;
  }
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(value, request, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request),
      ...extra,
    },
  });
}

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/**
 * Pick index [0, n) from CSPRNG without modulo bias (same as client lib).
 */
function randInt(n) {
  if (n <= 1) return 0;
  const buf = new Uint32Array(1);
  const max = 0x100000000;
  const limit = max - (max % n);
  let x;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % n;
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method !== 'GET') {
      return json({ error: 'method_not_allowed' }, request, 405);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/health' || path === '/') {
      return json(
        {
          ok: true,
          service: 'le-radar-bg-rotation',
          freeTier: true,
          stateful: false,
        },
        request
      );
    }

    if (path === '/v1/entropy') {
      const surface = String(url.searchParams.get('surface') || 'any').slice(0, 32);
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const day = new Date().toISOString().slice(0, 10);
      // Cloudflare request metadata (colo = data center) — unique edge entropy signal
      const cf = request.cf || {};
      return json(
        {
          surface,
          day,
          ts: Date.now(),
          entropy: bytesToBase64(bytes),
          colo: cf.colo || null,
          country: cf.country || null,
          // Petit entier aléatoire prêt à l’emploi côté client
          sample: randInt(1_000_000_007),
        },
        request
      );
    }

    // Pick serveur parmi une liste d’ids fournie par le client (pas de catalogue hébergé).
    // GET /v1/pick?ids=a,b,c&recent=a
    if (path === '/v1/pick') {
      const ids = String(url.searchParams.get('ids') || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 200);
      const recent = new Set(
        String(url.searchParams.get('recent') || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 80)
      );
      if (ids.length < 1) {
        return json({ error: 'ids_required' }, request, 400);
      }
      let pool = ids.filter((id) => !recent.has(id));
      if (!pool.length) pool = ids.slice();
      const chosen = pool[randInt(pool.length)];
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return json(
        {
          id: chosen,
          poolSize: pool.length,
          total: ids.length,
          entropy: bytesToBase64(bytes),
          colo: request.cf?.colo || null,
        },
        request
      );
    }

    return json({ error: 'not_found' }, request, 404);
  },
};

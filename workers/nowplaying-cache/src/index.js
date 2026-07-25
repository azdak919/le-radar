/**
 * LE RADAR — Now-playing metadata cache (Cloudflare Worker, free tier)
 *
 * Proxies **tiny** station now-playing APIs (JSON/XML) with shared edge cache
 * and browser CORS. NOT an audio stream proxy — only metadata endpoints.
 *
 * Why:
 *   - Some station APIs (e.g. Triton Now Playing XML) are flaky or CORS-blocked
 *     from the browser; every visitor hammering them wastes quota.
 *   - One edge cache (~60 s) → one origin fetch per mount per minute for all users.
 *
 * Endpoints:
 *   GET /v1/fetch?url=<https encoded metadata URL>
 *   GET /health
 */

const ALLOWED_ORIGINS = new Set([
  'https://le-radar.ca',
  'https://www.le-radar.ca',
  'https://azdak919.github.io',
]);

/** Hosts allowed for upstream now-playing metadata (not streams). */
const ALLOWED_HOST_SUFFIXES = [
  'tritondigital.com',
  'streamtheworld.com',
  'radiojar.com',
  'radioking.com',
  'radio.co',
  'airtime.pro',
  'libretime.org',
  'cism.org',
  'cismradio.org',
  'choq.ca',
  'ckut.ca',
  'cjlo.com',
  'chyz.ca',
  'cfak.ca',
  'cfou.ca',
  'cjep.ca',
  'cremradio.ca',
  'radiorad.io',
  'azuracast.com',
  'centova.com',
  'shoutcast.com',
];

const CACHE_TTL_SECONDS = 60;
const MAX_BODY_BYTES = 256 * 1024; // 256 KiB — metadata only
const FETCH_TIMEOUT_MS = 8000;
const UA = 'le-radar.ca nowplaying-cache/1.0 (https://le-radar.ca; metadata only, not audio)';

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
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

function isPrivateHost(hostname = '') {
  const host = String(hostname).toLowerCase();
  if (!host || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === 'localhost') return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  if (/^169\.254\.\d+\.\d+$/.test(host)) return true;
  if (host === '[::1]' || host.startsWith('[::ffff:')) return true;
  return false;
}

function hostAllowed(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || isPrivateHost(host)) return false;
  return ALLOWED_HOST_SUFFIXES.some(
    (suf) => host === suf || host.endsWith(`.${suf}`)
  );
}

/**
 * Reject audio/stream paths and binary mounts — metadata endpoints only.
 */
function pathLooksLikeMetadata(pathname = '', search = '') {
  const p = `${pathname}${search}`.toLowerCase();
  // Explicit stream/audio patterns
  if (
    /\.(mp3|aac|ogg|m3u8?|pls|xspf)(\?|$)/i.test(p) ||
    /\/stream|\/listen|\/proxy|\/icecast|\/shoutcast|\/mounts?\//i.test(p)
  ) {
    // Triton nowplaying is ok even if "mount" appears in query
    if (/nowplaying|live-info|np\.|metadata|current|playing|status|api\//i.test(p)) {
      return true;
    }
    return false;
  }
  return true;
}

function parseTargetUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    return { error: 'invalid_url' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { error: 'protocol' };
  }
  // Prefer HTTPS upstream
  if (u.protocol === 'http:') {
    u.protocol = 'https:';
  }
  if (!hostAllowed(u.hostname)) {
    return { error: 'host_not_allowed', host: u.hostname };
  }
  if (!pathLooksLikeMetadata(u.pathname, u.search)) {
    return { error: 'not_metadata_endpoint' };
  }
  return { url: u };
}

export default {
  async fetch(request, env, ctx) {
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
          service: 'le-radar-nowplaying',
          freeTier: true,
          cacheTtlSec: CACHE_TTL_SECONDS,
          maxBodyBytes: MAX_BODY_BYTES,
          note: 'Metadata only — not an audio stream proxy',
        },
        request
      );
    }

    if (path !== '/v1/fetch') {
      return json({ error: 'not_found' }, request, 404);
    }

    const targetRaw = url.searchParams.get('url') || '';
    const parsed = parseTargetUrl(targetRaw);
    if (parsed.error) {
      return json({ error: parsed.error, host: parsed.host || null }, request, 400);
    }
    const target = parsed.url;

    // Shared edge cache key = target URL
    const cache = caches.default;
    const cacheKey = new Request(`https://nowplaying-cache.internal/v1?u=${encodeURIComponent(target.href)}`, {
      method: 'GET',
    });

    let cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      Object.entries(corsHeaders(request)).forEach(([k, v]) => headers.set(k, v));
      headers.set('X-LR-Cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let upstream;
    try {
      upstream = await fetch(target.href, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          Accept: 'application/json, application/xml, text/xml, text/plain, */*',
          'User-Agent': UA,
        },
      });
    } catch (e) {
      clearTimeout(timer);
      return json(
        {
          error: 'upstream_fetch_failed',
          message: String(e && e.message ? e.message : e),
        },
        request,
        502
      );
    }
    clearTimeout(timer);

    if (!upstream.ok) {
      return json(
        { error: 'upstream_http', status: upstream.status },
        request,
        502
      );
    }

    const ctype = (upstream.headers.get('Content-Type') || '').toLowerCase();
    // Block obvious audio responses
    if (
      ctype.includes('audio/') ||
      ctype.includes('mpegurl') ||
      ctype.includes('x-mpegurl')
    ) {
      return json({ error: 'audio_not_allowed', contentType: ctype }, request, 415);
    }

    let buf;
    try {
      buf = await upstream.arrayBuffer();
    } catch (e) {
      return json(
        {
          error: 'upstream_body_failed',
          message: String(e && e.message ? e.message : e),
        },
        request,
        502
      );
    }
    if (buf.byteLength > MAX_BODY_BYTES) {
      return json(
        { error: 'body_too_large', bytes: buf.byteLength, max: MAX_BODY_BYTES },
        request,
        413
      );
    }

    const outHeaders = new Headers({
      'Content-Type': ctype || 'text/plain; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
      'X-LR-Cache': 'MISS',
      'X-LR-Upstream-Host': target.hostname,
    });
    Object.entries(corsHeaders(request)).forEach(([k, v]) => outHeaders.set(k, v));

    const response = new Response(buf, { status: 200, headers: outHeaders });

    // Store in Cache API (best-effort)
    try {
      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      }
    } catch (_) {
      /* cache optional */
    }

    return response;
  },
};

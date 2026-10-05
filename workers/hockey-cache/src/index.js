/**
 * LE RADAR — cache HTML Spordle hockey (Cloudflare Worker).
 *
 * Fetch rseqhockey.com depuis les IP edge CF (souvent sans challenge
 * managed). Le bot Node/Python lit /v1/html?site=.
 *
 * Pas un proxy ouvert : seulement deux hôtes hockey RSEQ.
 */

const SITES = {
  collegial: 'https://collegial.rseqhockey.com/fr',
  universitaire: 'https://universitaire.rseqhockey.com/fr',
};

const CACHE_TTL_SECONDS = 120;
const FETCH_TIMEOUT_MS = 12000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function challenged(html = '') {
  const t = String(html);
  if (t.includes('__NEXT_DATA__')) return false;
  return /just a moment/i.test(t) || /challenges\.cloudflare\.com/i.test(t);
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/health' || path === '/') {
      return json({
        ok: true,
        service: 'le-radar-hockey',
        sites: Object.keys(SITES),
        cacheTtlSec: CACHE_TTL_SECONDS,
      });
    }

    if (path !== '/v1/html') return json({ error: 'not_found' }, 404);

    const site = String(url.searchParams.get('site') || '').toLowerCase();
    const target = SITES[site];
    if (!target) return json({ error: 'unknown_site', site }, 400);

    const cache = caches.default;
    const cacheKey = new Request(`https://hockey-cache.internal/v1?s=${site}`, { method: 'GET' });
    const hit = await cache.match(cacheKey);
    if (hit) {
      const headers = new Headers(hit.headers);
      headers.set('X-LR-Cache', 'HIT');
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(hit.body, { status: hit.status, headers });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let upstream;
    try {
      upstream = await fetch(target, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8',
          'User-Agent': UA,
        },
      });
    } catch (e) {
      clearTimeout(timer);
      return json({ ok: false, error: 'upstream_fetch_failed', message: String(e && e.message ? e.message : e) }, 502);
    }
    clearTimeout(timer);

    const html = await upstream.text();
    if (challenged(html) || upstream.status === 403) {
      return json({
        ok: false,
        error: 'cloudflare_challenge',
        status: upstream.status,
        site,
      }, 502);
    }
    if (!upstream.ok) {
      return json({ ok: false, error: 'upstream_http', status: upstream.status, site }, 502);
    }

    const payload = JSON.stringify({
      ok: true,
      site,
      url: target,
      html,
    });
    const response = new Response(payload, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'Access-Control-Allow-Origin': '*',
        'X-LR-Cache': 'MISS',
      },
    });
    await cache.put(cacheKey, response.clone());
    return response;
  },
};

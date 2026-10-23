/**
 * LE RADAR — relais PrestoSports (U SPORTS / RSEQ Direct) depuis l’edge
 * Cloudflare. Le WAF CloudFront d’en.usports.ca renvoie un captcha (HTTP 405)
 * aux IP GitHub Actions. Pas un proxy ouvert : seulement /composite?d=.
 */
const HOSTS = { usports: 'https://en.usports.ca', rseqdirect: 'https://rseqdirect.ca' };
const CACHE_TTL_SECONDS = 60;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/' || path === '/health') return json({ ok: true, service: 'le-radar-presto', sites: Object.keys(HOSTS) });
    if (path !== '/v1/presto') return json({ error: 'not_found' }, 404);
    const d = String(url.searchParams.get('d') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return json({ error: 'bad_date' }, 400);
    const site = String(url.searchParams.get('site') || 'usports');
    const base = HOSTS[site];
    if (!base) return json({ error: 'unknown_site' }, 400);
    const bucket = Math.floor(Date.now() / (CACHE_TTL_SECONDS * 1000));
    const cache = caches.default;
    const key = new Request(`https://presto-cache.internal/${site}/${d}/${bucket}`);
    const hit = await cache.match(key);
    if (hit) return hit;
    let up;
    try {
      up = await fetch(`${base}/composite?d=${d}&_=${bucket}`, {
        headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-CA,en;q=0.9', 'User-Agent': UA },
        signal: AbortSignal.timeout(12000),
      });
    } catch (e) {
      return json({ ok: false, error: 'upstream_fetch_failed', message: String((e && e.message) || e) }, 502);
    }
    const html = await up.text();
    const waf = up.headers.get('x-amzn-waf-action') || '';
    if (!up.ok || waf) return json({ ok: false, error: 'upstream_http', status: up.status, waf, site }, 502);
    const res = json({ ok: true, site, date: d, html }, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` });
    await cache.put(key, res.clone());
    return res;
  },
};

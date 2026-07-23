/**
 * LE RADAR — Solitaire shared high scores
 *
 * Cloudflare Worker + D1. The game is deliberately an honour-system
 * leaderboard: scores are client supplied, but the API validates all input,
 * limits repeated submissions and never stores a visitor's raw IP address.
 */

const ALLOWED_ORIGINS = new Set([
  'https://le-radar.ca',
  'https://www.le-radar.ca',
  'https://azdak919.github.io',
]);
const MAX_SCORES = 10;
const MIN_TIME_MS = 10_000;
const MAX_TIME_MS = 8 * 60 * 60 * 1000;
const MIN_MOVES = 1;
const MAX_MOVES = 10_000;
const RATE_LIMIT_MS = 30_000;

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://le-radar.ca';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function hasAllowedBrowserOrigin(request) {
  return ALLOWED_ORIGINS.has(request.headers.get('Origin'));
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

function normaliseScore(value) {
  const name = String(value?.name || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  const timeMs = Number(value?.timeMs);
  const moves = Number(value?.moves);
  if (name.length !== 3 || !Number.isInteger(timeMs) || !Number.isInteger(moves)) return null;
  if (timeMs < MIN_TIME_MS || timeMs > MAX_TIME_MS || moves < MIN_MOVES || moves > MAX_MOVES) return null;
  return { name, timeMs, moves };
}

async function clientKey(request, salt) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const payload = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function leaders(db) {
  const { results } = await db.prepare(
    'SELECT name, time_ms AS timeMs, moves, created_at AS at FROM scores ORDER BY time_ms ASC, moves ASC, created_at ASC LIMIT ?'
  ).bind(MAX_SCORES).all();
  return results || [];
}

async function isRateLimited(db, request, salt) {
  const key = await clientKey(request, salt);
  const now = Date.now();
  const row = await db.prepare('SELECT submitted_at FROM score_rate_limits WHERE client_key = ?').bind(key).first();
  if (row && now - Number(row.submitted_at) < RATE_LIMIT_MS) return true;
  await db.prepare(
    'INSERT INTO score_rate_limits (client_key, submitted_at) VALUES (?, ?) ON CONFLICT(client_key) DO UPDATE SET submitted_at = excluded.submitted_at'
  ).bind(key, now).run();
  // Keep only a short-lived anti-spam fingerprint. This is probabilistic to
  // avoid an extra write for every valid score submission.
  if (Math.random() < 0.02) {
    await db.prepare('DELETE FROM score_rate_limits WHERE submitted_at < ?').bind(now - 7 * 24 * 60 * 60 * 1000).run();
  }
  return false;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });

    const url = new URL(request.url);
    if (url.pathname !== '/v1/scores') return json({ error: 'Not found' }, request, 404);

    if (request.method === 'GET') {
      try {
        return json(await leaders(env.DB), request, 200, { 'Cache-Control': 'public, max-age=30' });
      } catch {
        return json({ error: 'Leaderboard unavailable' }, request, 503);
      }
    }

    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, request, 405);
    if (!hasAllowedBrowserOrigin(request)) return json({ error: 'Origin not allowed' }, request, 403);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, request, 400);
    }
    const score = normaliseScore(body);
    if (!score) return json({ error: 'Invalid score' }, request, 422);

    try {
      if (await isRateLimited(env.DB, request, env.RATE_LIMIT_SALT || 'le-radar-score-limit')) {
        return json({ error: 'Please wait before submitting another score' }, request, 429);
      }
      await env.DB.prepare(
        'INSERT OR IGNORE INTO scores (name, time_ms, moves, created_at) VALUES (?, ?, ?, ?)'
      ).bind(score.name, score.timeMs, score.moves, Date.now()).run();
      return json(await leaders(env.DB), request, 201, { 'Cache-Control': 'no-store' });
    } catch {
      return json({ error: 'Leaderboard unavailable' }, request, 503);
    }
  },
};

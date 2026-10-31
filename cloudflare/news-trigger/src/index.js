// le-radar-news-trigger : lance update-news.yml (workflow_dispatch) seulement
// s'il y a du nouveau dans les flux, ou si la dernière collecte publiée date
// de plus de MAX_AGE_MIN. Jamais si une collecte est déjà en cours ou en file.
import { decide, newestFeedDate } from './lib.js';

const UA = 'LE-RADAR-NewsTrigger/1.0 (+https://le-radar.ca/)';

async function gh(env, path, init = {}) {
  return fetch(`https://api.github.com/repos/${env.REPO}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env.GH_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': UA, 'x-github-api-version': '2022-11-28', ...(init.headers || {}) },
  });
}

async function activeRuns(env) {
  let n = 0;
  for (const status of ['in_progress', 'queued', 'pending', 'waiting']) {
    const r = await gh(env, `/actions/workflows/${env.WORKFLOW}/runs?status=${status}&per_page=1`);
    if (r.ok) n += (await r.json()).total_count || 0;
  }
  return n;
}

async function feedDates(env) {
  const reg = await (await fetch(`${env.SITE}/news-sources.json`, { headers: { 'user-agent': UA } })).json();
  const feeds = (reg.active || []).map((s) => s.url).filter((u) => /^https?:/.test(u || '')).slice(0, 25);
  const out = await Promise.all(feeds.map(async (u) => {
    try {
      const r = await fetch(u, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      const head = (await r.text()).slice(0, 20000);
      return newestFeedDate(head, r.headers.get('last-modified'));
    } catch { return null; }
  }));
  return out.filter(Boolean);
}

export async function run(env, now = Date.now()) {
  const news = await (await fetch(`${env.SITE}/news.json?t=${now}`, { headers: { 'user-agent': UA } })).json();
  const active = await activeRuns(env);
  const dates = active ? [] : await feedDates(env);
  const d = decide({ now, newsUpdated: Date.parse(news.updated || 0) || 0, active, feedDates: dates, maxAgeMin: Number(env.MAX_AGE_MIN) || 60 });
  if (d.dispatch) {
    const r = await gh(env, `/actions/workflows/${env.WORKFLOW}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
    d.status = r.status;
  }
  console.log(JSON.stringify(d));
  return d;
}

// Filet sports + radio : GitHub saute aussi le cron horaire de
// guard-harvest-freshness.yml (observé : 1 passe sur 4 à 6 h). On le relance
// ici si sa dernière passe date de plus de GUARD_MAX_AGE_MIN et qu'aucune
// n'est en cours. Le garde décide lui-même s'il y a du rattrapage à faire.
export async function runGuard(env, now = Date.now()) {
  const wf = env.GUARD_WORKFLOW;
  if (!wf) return { guard: 'off' };
  const r = await gh(env, `/actions/workflows/${wf}/runs?per_page=1`);
  if (!r.ok) return { guard: 'api', status: r.status };
  const last = (await r.json()).workflow_runs?.[0];
  if (last && last.status !== 'completed') return { guard: 'busy' };
  const age = last ? (now - Date.parse(last.created_at)) / 60000 : Infinity;
  if (age < (Number(env.GUARD_MAX_AGE_MIN) || 55)) return { guard: 'fresh', age: Math.round(age) };
  const d = await gh(env, `/actions/workflows/${wf}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
  return { guard: 'dispatch', age: Math.round(age), status: d.status };
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(run(env).catch((e) => console.log('news', String(e))));
    ctx.waitUntil(runGuard(env).then((g) => console.log(JSON.stringify(g)), (e) => console.log('guard', String(e))));
  },
};

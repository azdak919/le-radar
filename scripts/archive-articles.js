#!/usr/bin/env node
/**
 * LE-RADAR.ca — Archivage des articles étudiants dans la Wayback Machine.
 *
 * POURQUOI
 * Les publications étudiantes disparaissent. Un journal de cégep tenu sur un
 * blogue gratuit s'éteint quand l'équipe finit son DEC et que personne ne
 * renouvelle l'hébergement.
 *
 * Couverture mesurée le 2026-07-26 (pages d'index CDX) : Exil 1, The Plant 3,
 * The Campus 4, La Pige 8 — contre The McGill Daily 229. Un écart de 229×, et
 * les plus menacés sont les cégeps et petits collèges. D'où l'ordre de passage
 * piloté par la fragilité (voir archive-priority-lib.js) et non par la date.
 *
 * Le Radar connaît l'URL de chaque article publié. Les soumettre à Save Page
 * Now coûte une requête et rend le travail de ces rédactions consultable
 * au-delà de la vie de leur site — et au-delà de la nôtre.
 *
 * CE QUE ÇA N'EST PAS
 * Ce n'est pas du référencement : les liens web.archive.org ne transmettent
 * aucune autorité et ne comptent pas comme signal de classement. Ce n'est pas
 * non plus ce qui alimente les corpus d'entraînement des modèles — c'est
 * Common Crawl, un organisme distinct, déjà autorisé dans robots.txt.
 *
 * CONTRAINTE MESURÉE
 * Une capture prend ~18 s et l'API est fortement limitée en débit. D'où un
 * plafond par passe, une pause entre les requêtes, et un arrêt net au premier
 * 429. On préfère archiver lentement pour toujours que vite une seule fois.
 *
 *   node scripts/archive-articles.js                    # dry-run
 *   node scripts/archive-articles.js --update           # soumet et écrit l'état
 *   node scripts/archive-articles.js --update --limit 5
 *   node scripts/archive-articles.js --update --self    # pages du site seulement
 *   node scripts/archive-articles.js --measure 14       # amorçage : mesure toutes
 *                                                       # les sources d'un coup
 */

const fs = require('fs');
const path = require('path');
const { orderCandidates, fragilityRanking } = require('./archive-priority-lib');

const ROOT = path.join(__dirname, '..');
const NEWS_PATH = path.join(ROOT, 'news.json');
const STATE_PATH = path.join(ROOT, 'archive-status.json');
const SITE_BASE = (process.env.RADAR_SITE_URL || 'https://le-radar.ca').replace(/\/$/, '');

const SAVE_ENDPOINT = 'https://web.archive.org/save/';
const CDX_ENDPOINT = 'https://web.archive.org/cdx/search/cdx';
const UA = 'le-radar-archive-bot/1.0 (+https://le-radar.ca; preservation of student journalism)';

/** Plafond par passe. Une capture prend ~18 s : 20 tient dans ~8 min. */
const DEFAULT_LIMIT = 20;
/** Pause entre deux soumissions — l'API est partagée, on reste courtois. */
const PAUSE_MS = 4000;
/** Une URL déjà capturée depuis moins de N jours n'est pas resoumise. */
const RECAPTURE_AFTER_DAYS = 180;
const REQUEST_TIMEOUT_MS = 90_000;

/** Fraîcheur de la mesure de fragilité par source, et débit de rafraîchissement. */
const FRAGILITY_TTL_DAYS = 7;
const FRAGILITY_PER_RUN = 3;
const FRAGILITY_TIMEOUT_MS = 25_000;

// ═══════════════════════════════════════════════════════════════════════════
//  Utilitaires
// ═══════════════════════════════════════════════════════════════════════════

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** URL propre et déduplicable : pas de fragment, pas de traqueurs. */
function normalizeUrl(raw = '') {
  try {
    const u = new URL(String(raw).trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_cid|mc_eid)/i.test(p)) u.searchParams.delete(p);
    }
    return u.toString();
  } catch {
    return null;
  }
}

async function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`délai dépassé (${label})`)), ms);
  });
  try {
    return await Promise.race([promise, guard]);
  } finally {
    clearTimeout(timer);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Wayback Machine
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dernière capture connue, via l'index CDX. Évite de resoumettre ce qui vient
 * d'être archivé — par nous ou par quelqu'un d'autre.
 * Renvoie la date (Date) ou null.
 */
async function lastCapture(url) {
  const q = `${CDX_ENDPOINT}?url=${encodeURIComponent(url)}&output=json&limit=-1&fl=timestamp&filter=statuscode:200`;
  try {
    const res = await withTimeout(fetch(q, { headers: { 'User-Agent': UA } }), 20_000, 'cdx');
    if (!res.ok) return null;
    const rows = await res.json();
    // [["timestamp"], ["20260726001544"]] — première ligne = en-têtes
    const ts = rows?.[1]?.[0];
    if (!ts || ts.length < 8) return null;
    const iso = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10) || '00'}:${ts.slice(10, 12) || '00'}:${ts.slice(12, 14) || '00'}Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Soumet une URL à Save Page Now.
 *
 * En cas de succès, l'API répond 302 avec un Location de la forme
 * `/web/<timestamp>/<url>`. On ne suit pas la redirection : l'en-tête suffit
 * et éviter de télécharger la page archivée économise du temps et du réseau.
 */
async function savePage(url) {
  const res = await withTimeout(
    fetch(SAVE_ENDPOINT + url, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': UA },
    }),
    REQUEST_TIMEOUT_MS,
    'save',
  );

  if (res.status === 429) return { ok: false, rateLimited: true, status: 429 };

  const location = res.headers.get('location') || '';
  const m = location.match(/\/web\/(\d{14})\//);
  if (m) return { ok: true, timestamp: m[1], snapshot: `https://web.archive.org/web/${m[1]}/${url}` };

  // 200 sans redirection : la capture est parfois lancée en tâche de fond.
  if (res.status === 200) return { ok: true, timestamp: null, snapshot: null, pending: true };

  return { ok: false, status: res.status };
}

/**
 * Ampleur de la couverture d'un domaine dans la Wayback Machine, en pages
 * d'index CDX. Sert de mesure de fragilité : peu de pages = publication peu
 * archivée, donc la plus menacée de disparaître sans trace.
 *
 * Renvoie `null` si la mesure échoue — jamais 0. La distinction est capitale :
 * un délai réseau dépassé ferait autrement passer un journal solide pour
 * menacé. C'est arrivé en conditions réelles avec montrealcampus.ca, qui a
 * d'abord renvoyé une erreur alors qu'il compte 36 pages.
 */
async function cdxPageCount(host) {
  const q = `${CDX_ENDPOINT}?url=${encodeURIComponent(`${host}*`)}&output=json&showNumPages=true`;
  try {
    const res = await withTimeout(fetch(q, { headers: { 'User-Agent': UA } }), FRAGILITY_TIMEOUT_MS, 'cdx-pages');
    if (!res.ok) return null;
    const m = (await res.text()).match(/\[\s*"(\d+)"\s*\]/);
    return m ? parseInt(m[1], 10) : null;
  } catch {
    return null;
  }
}

/** Domaine réellement porté par les liens d'articles, par source.
 *  Pas le site déclaré au registre : Exil déclare exilecvm.ca alors que ses
 *  articles pointent encore vers exilecvm.wordpress.com — et c'est ce dernier,
 *  le moins archivé, qu'il faut mesurer. */
function articleHostsBySource(items) {
  const hosts = {};
  for (const it of items) {
    if (!it?.source || !it?.link) continue;
    try { hosts[it.source] ||= new URL(it.link).host; } catch { /* lien invalide */ }
  }
  return hosts;
}

/**
 * Rafraîchit la fragilité d'au plus quelques sources par passe, les plus
 * périmées d'abord. Une mesure en échec **conserve** la valeur connue et se
 * marque `stale` : on ne dégrade jamais une information acquise.
 */
async function refreshFragility(state, items, { quiet = false, budget = FRAGILITY_PER_RUN } = {}) {
  state.sources = state.sources || {};
  const hosts = articleHostsBySource(items);
  const now = Date.now();

  const due = Object.entries(hosts)
    .map(([source, host]) => {
      const rec = state.sources[source];
      const age = rec?.checkedAt ? (now - new Date(rec.checkedAt).getTime()) / 86_400_000 : Infinity;
      return { source, host, age, known: Number.isFinite(rec?.pages) };
    })
    .filter((s) => s.age >= FRAGILITY_TTL_DAYS)
    // Les sources jamais mesurées d'abord : sans mesure, elles restent neutres
    // et ne peuvent pas être priorisées même si elles sont fragiles.
    .sort((a, b) => (a.known === b.known ? b.age - a.age : (a.known ? 1 : -1)))
    .slice(0, budget);

  for (const { source, host } of due) {
    const pages = await cdxPageCount(host);
    const prev = state.sources[source] || {};
    if (pages === null) {
      state.sources[source] = { ...prev, host, stale: true };
      if (!quiet) console.log(`   ⚠ mesure indisponible pour ${source} — valeur connue conservée`);
    } else {
      state.sources[source] = { host, pages, checkedAt: new Date().toISOString() };
      if (!quiet) console.log(`   · fragilité ${source} : ${pages} page(s) d'index`);
    }
    await sleep(700);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Sélection des URL
// ═══════════════════════════════════════════════════════════════════════════

/** Pages propres au site : l'accueil, l'annuaire et les flux. */
function ownPages() {
  return [
    `${SITE_BASE}/`,
    `${SITE_BASE}/medias/`,
    `${SITE_BASE}/en/`,
    `${SITE_BASE}/en/media/`,
    `${SITE_BASE}/feeds.html`,
    `${SITE_BASE}/feed.xml`,
    `${SITE_BASE}/llms.txt`,
  ];
}

/**
 * Articles à archiver, du plus récent au plus ancien.
 *
 * Les plus récents d'abord : ce sont ceux qui risquent le plus de disparaître
 * avant d'avoir été capturés par un passage spontané de la Wayback Machine.
 */
function articleUrls(state) {
  const news = readJson(NEWS_PATH, { items: [] });
  const items = Array.isArray(news) ? news : (news.items || []);
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const url = normalizeUrl(it?.link);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, source: it.source || '', date: it.date || '' });
  }
  out.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return out.filter(({ url }) => needsCapture(url, state));
}

function needsCapture(url, state) {
  const rec = state.archived?.[url];
  if (!rec?.at) return true;
  const age = (Date.now() - new Date(rec.at).getTime()) / 86_400_000;
  return !(age < RECAPTURE_AFTER_DAYS);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const doUpdate = process.argv.includes('--update');
  const selfOnly = process.argv.includes('--self');
  const limit = Math.max(1, parseInt(arg('--limit', String(DEFAULT_LIMIT)), 10) || DEFAULT_LIMIT);

  const state = readJson(STATE_PATH, { updated: null, archived: {}, sources: {}, stats: {} });
  state.archived = state.archived || {};
  state.sources = state.sources || {};

  console.log('LE-RADAR.ca — archivage Wayback Machine');
  console.log('=========================================\n');

  const news = readJson(NEWS_PATH, { items: [] });
  const newsItems = Array.isArray(news) ? news : (news.items || []);

  // Mesure de fragilité : quelques sources par passe, jamais destructive.
  // --measure N : amorçage. Sans lui, il faut 5 passes avant que les sources
  // les plus fragiles soient seulement mesurées — donc 5 passes pendant
  // lesquelles la priorisation ne sert à rien.
  const measureBudget = Math.max(1, parseInt(arg('--measure', String(FRAGILITY_PER_RUN)), 10) || FRAGILITY_PER_RUN);
  if (!selfOnly) await refreshFragility(state, newsItems, { budget: measureBudget });

  const ranking = fragilityRanking(state.sources);
  if (ranking.length) {
    console.log('\nFragilité des sources (pages d’index CDX — moins = plus menacé)');
    for (const r of ranking) {
      const val = r.pages === null ? '  ?' : String(r.pages).padStart(3);
      console.log(`   ${val}  ${r.source}${r.stale ? '  (mesure périmée)' : ''}`);
    }
    console.log('');
  }

  // Les pages du site passent devant : elles sont peu nombreuses et c'est le
  // point d'entrée vers tout le reste.
  const own = ownPages()
    .filter((url) => needsCapture(url, state))
    .map((url) => ({ url, source: 'LE-RADAR.ca', date: new Date().toISOString() }));

  const articles = selfOnly ? [] : orderCandidates({
    items: articleUrls(state),
    fragility: state.sources,
    size: Math.max(1, limit - own.length),
  });

  const candidates = [...own, ...articles];
  const batch = candidates.slice(0, limit);

  console.log(`Déjà archivées : ${Object.keys(state.archived).length}`);
  console.log(`Candidates     : ${candidates.length} (plafond ${limit} cette passe)\n`);

  if (!doUpdate) {
    batch.forEach((c) => console.log(`   [dry-run] ${c.source ? `${c.source} — ` : ''}${c.url}`));
    console.log('\nDry-run. Utilisez --update pour soumettre.');
    return;
  }

  let saved = 0;
  let skipped = 0;
  let failed = 0;
  let stoppedEarly = false;

  for (const [i, { url, source }] of batch.entries()) {
    // Quelqu'un d'autre l'a peut-être capturée entre-temps.
    const last = await lastCapture(url);
    if (last && (Date.now() - last.getTime()) / 86_400_000 < RECAPTURE_AFTER_DAYS) {
      state.archived[url] = { at: last.toISOString(), via: 'existant', source };
      skipped += 1;
      console.log(`   ↷ déjà archivé (${last.toISOString().slice(0, 10)}) ${url}`);
      continue;
    }

    let res;
    try {
      res = await savePage(url);
    } catch (e) {
      res = { ok: false, error: String(e.message || e) };
    }

    if (res.rateLimited) {
      console.log('\n⏳ Limite de débit atteinte — arrêt propre, la suite au prochain passage.');
      stoppedEarly = true;
      break;
    }

    if (res.ok) {
      state.archived[url] = {
        at: new Date().toISOString(),
        via: 'save-page-now',
        source,
        ...(res.timestamp ? { snapshot: res.snapshot } : { pending: true }),
      };
      saved += 1;
      console.log(`   ✅ ${res.timestamp || 'en cours'} ${url}`);
    } else {
      failed += 1;
      console.log(`   ✗ ${res.status || res.error || 'échec'} ${url}`);
    }

    if (i < batch.length - 1) await sleep(PAUSE_MS);
  }

  state.updated = new Date().toISOString();
  state.stats = {
    total: Object.keys(state.archived).length,
    lastRun: { saved, skipped, failed, stoppedEarly },
  };

  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  console.log(`\n✅ ${saved} capture(s), ${skipped} déjà archivée(s), ${failed} échec(s).`);
  console.log(`   Total suivi : ${state.stats.total} URL — archive-status.json`);
}

main().catch((e) => {
  console.error('archivage interrompu :', e.message || e);
  process.exitCode = 1;
});

#!/usr/bin/env node
/**
 * LE-RADAR.ca — Archivage des articles étudiants dans la Wayback Machine.
 *
 * POURQUOI
 * Les publications étudiantes disparaissent. Un journal de cégep tenu sur un
 * blogue gratuit s'éteint quand l'équipe finit son DEC et que personne ne
 * renouvelle l'hébergement. Mesuré le 2026-07-25 : Quartier Libre et Le
 * Collectif dépassent 20 000 captures dans la Wayback Machine, mais Exil
 * (Cégep du Vieux Montréal) n'en a que 985.
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
 *   node scripts/archive-articles.js              # dry-run
 *   node scripts/archive-articles.js --update     # soumet et écrit l'état
 *   node scripts/archive-articles.js --update --limit 5
 *   node scripts/archive-articles.js --update --self   # pages du site seulement
 */

const fs = require('fs');
const path = require('path');

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

  const state = readJson(STATE_PATH, { updated: null, archived: {}, stats: {} });
  state.archived = state.archived || {};

  const candidates = selfOnly
    ? ownPages().filter((url) => needsCapture(url, state)).map((url) => ({ url, source: 'LE-RADAR.ca' }))
    : [
      ...ownPages().filter((url) => needsCapture(url, state)).map((url) => ({ url, source: 'LE-RADAR.ca' })),
      ...articleUrls(state),
    ];

  const batch = candidates.slice(0, limit);

  console.log('LE-RADAR.ca — archivage Wayback Machine');
  console.log('=========================================\n');
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

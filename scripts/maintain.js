#!/usr/bin/env node
/**
 * LE RADAR Maintenance Orchestrator
 *
 * Single entry point for long-term automated upkeep. Runs the bot pipeline in
 * order, writes bot-status.json (health dashboard), and exits non-zero if
 * critical alerts need human eyes.
 *
 * Designed for GitHub Actions (weekly) but works locally:
 *   node scripts/maintain.js
 *   node scripts/maintain.js --update
 *   node scripts/maintain.js --update --skip-institutions
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const STATUS_PATH = path.join(ROOT, 'bot-status.json');

const args = process.argv.slice(2);
const doUpdate = args.includes('--update');
const skipInstitutions = args.includes('--skip-institutions');

function readJson(rel, fallback = null) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fallback; }
}

function runStep(label, cmd) {
  console.log(`\n${'─'.repeat(60)}\n▸ ${label}\n`);
  const start = Date.now();
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, CI: 'true' } });
    return { ok: true, ms: Date.now() - start };
  } catch (e) {
    return { ok: false, ms: Date.now() - start, error: e.message };
  }
}

function norm(s = '') {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function instKeys(name) {
  const keys = [norm(name).replace(/\(.*?\)/g, '').trim()];
  const acro = name.match(/\(([^)]+)\)/);
  if (acro) keys.push(norm(acro[1]));
  return keys.filter(Boolean);
}

function buildStatus(steps) {
  const institutions = readJson('institutions.json', { institutions: [] });
  const newsSources = readJson('news-sources.json', { active: [], candidates: [] });
  const news = readJson('news.json', { items: [] });
  const radios = readJson('radios.json', []);
  const radioCandidates = readJson('radios-candidates.json', { candidates: [] });

  const activeNews = (newsSources.active || []).filter((s) => s._status !== 'dead');
  const deadNews = (newsSources.active || []).filter((s) => s._status === 'dead');
  const staleNews = (newsSources.active || []).filter((s) => s._status === 'stale');

  const radiosWithStream = radios.filter((r) => r.stream && r._streamStatus === 'working');
  const insts = institutions.institutions || [];

  const coveredNews = new Set(
    activeNews.map((s) => norm(s.institution || ''))
  );

  const isNewsCovered = (inst) =>
    instKeys(inst.name).some((k) => [...coveredNews].some((c) => c.includes(k) || k.includes(c)));

  const isRadioCovered = (inst) =>
    radios.some((r) =>
      instKeys(inst.name).some((k) => norm(r.institution || '').includes(k) || k.includes(norm(r.institution || '')))
    );

  const gapsNews = insts.filter((i) => i.type === 'universite' && !isNewsCovered(i)).map((i) => i.name);
  const gapsRadios = insts.filter((i) => !isRadioCovered(i)).map((i) => i.name);

  const items = news.items || news;
  const staleCacheSources = Object.entries(news.sources || {})
    .filter(([, meta]) => meta && meta.stale)
    .map(([name]) => name);

  const alerts = [];

  for (const s of deadNews) {
    alerts.push({
      level: 'warn',
      code: 'dead_news_feed',
      message: `Flux mort : ${s.name} (${s.institution})`,
    });
  }
  for (const s of staleNews) {
    alerts.push({
      level: 'info',
      code: 'stale_news_feed',
      message: `Flux inactif : ${s.name} — dernier article ${(s._lastItemDate || '?').slice(0, 10)}`,
    });
  }
  for (const name of staleCacheSources) {
    alerts.push({
      level: 'warn',
      code: 'stale_news_cache',
      message: `Cache conservé : ${name} — flux indisponible, articles frais du run précédent`,
    });
  }

  const failedSteps = steps.filter((s) => !s.ok);
  for (const s of failedSteps) {
    alerts.push({ level: 'error', code: 'step_failed', message: `Étape échouée : ${s.label}` });
  }

  if (gapsNews.length > 8) {
    alerts.push({
      level: 'info',
      code: 'news_coverage_gap',
      message: `${gapsNews.length} universités sans journal étudiant répertorié`,
    });
  }

  const withAuthor = items.filter((i) => i.author && String(i.author).trim()).length;
  const withExcerpt = items.filter((i) => i.excerpt && String(i.excerpt).trim().length > 20).length;
  const authorQc = readJson('author-qc.json', {});
  const leadQc = readJson('lead-image-qc.json', {});
  const photoCreditQc = readJson('photo-credit-qc.json', {});
  const bgBank = readJson('data/quebec-backgrounds.json', { photos: [], maxBank: 50 });
  const uniBgBank = readJson('data/quebec-university-backgrounds.json', {
    photos: [],
    maxBank: 50,
  });
  const pomoBgBank = readJson('data/quebec-pomo-backgrounds.json', {
    photos: [],
    maxBank: 50,
  });
  const nationsBgBank = readJson('data/quebec-nations-backgrounds.json', {
    photos: [],
    maxBank: 50,
  });

  if (authorQc.ok === false && (authorQc.mismatches || 0) > 0) {
    alerts.push({
      level: 'warn',
      code: 'author_mismatch',
      message: `${authorQc.mismatches} article(s) avec auteur RSS ≠ extrait « Par … »`,
    });
  }

  if (photoCreditQc.ok === false && (photoCreditQc.missingHero || 0) > 0) {
    alerts.push({
      level: 'warn',
      code: 'photo_credit_gap',
      message: `${photoCreditQc.missingHero} article(s) vedette sans crédit photo`,
    });
  }

  if (leadQc.mainPageLeadReady === false) {
    alerts.push({
      level: 'error',
      code: 'lead_image_gap',
      message: `Photos vedette insuffisantes : ${leadQc.leadReadyPhotos ?? '?'}/${leadQc.total ?? '?'} articles`,
    });
  }
  if ((leadQc.gaps || []).length > 0) {
    alerts.push({
      level: 'info',
      code: 'lead_stock_gap',
      message: `${leadQc.gaps.length}+ articles sans photo vedette (banques libres consultées)`,
    });
  }

  // Horaires : la grille publiée décrit-elle encore ce que les stations
  // diffusent ? Le hors-programmation est déjà rattrapé à l'antenne par
  // l'adaptateur `schedule-live` ; ces alertes le rendent simplement visible,
  // et distinguent la spéciale d'un soir d'une grille refaite à la rentrée.
  const drift = readJson('radio-schedule-drift.json', {});
  const driftSummary = drift.summary || {};
  const driftDetail = (ids) => (ids || [])
    .map((id) => {
      const st = (drift.stations || []).find((s) => s.id === id);
      return st ? `${id} (+${st.added.length} −${st.removed.length})` : id;
    })
    .join(', ');

  if ((driftSummary.drift || []).length) {
    alerts.push({
      level: 'info',
      code: 'schedule_drift',
      message: `Hors programmation : ${driftDetail(driftSummary.drift)}`,
    });
  }
  if ((driftSummary.overhaul || []).length) {
    alerts.push({
      level: 'warn',
      code: 'schedule_overhaul',
      message: `Grille refaite : ${driftDetail(driftSummary.overhaul)}`
        + ' — relancer fetch-radio-schedules.js --update',
    });
  }
  if ((driftSummary.unreachable || []).length) {
    alerts.push({
      level: 'warn',
      code: 'schedule_source_down',
      message: `Source horaire muette : ${(driftSummary.unreachable || []).join(', ')}`,
    });
  }

  const healthy = failedSteps.length === 0 && deadNews.length < (newsSources.active || []).length;

  return {
    updated: new Date().toISOString(),
    healthy,
    needsHuman: alerts.some((a) => a.level === 'error') || deadNews.length > 2,
    pipeline: steps.map((s) => ({ step: s.label, ok: s.ok, ms: s.ms })),
    summary: {
      institutions: insts.length,
      news: {
        active: activeNews.length,
        dead: deadNews.length,
        stale: staleNews.length,
        candidates: (newsSources.candidates || []).length,
        articles: items.length,
        withAuthor,
        withExcerpt,
        authorQc: {
          ok: authorQc.ok ?? null,
          mismatches: authorQc.mismatches ?? null,
        },
        leadImageQc: {
          fullyCovered: leadQc.fullyCovered ?? null,
          withPhoto: leadQc.withPhoto ?? null,
          withStock: leadQc.withStock ?? null,
          leadReadyPhotos: leadQc.leadReadyPhotos ?? null,
          pageScraped: leadQc.pageScraped ?? null,
          mainPageLeadReady: leadQc.mainPageLeadReady ?? null,
        },
        photoCreditQc: {
          ok: photoCreditQc.ok ?? null,
          withCredit: photoCreditQc.withCredit ?? null,
          cited: photoCreditQc.cited ?? null,
          pending: photoCreditQc.pending ?? null,
          missingHero: photoCreditQc.missingHero ?? null,
        },
      },
      backgrounds: {
        masthead: {
          count: (bgBank.photos || []).length,
          maxBank: bgBank.maxBank || 50,
          lastSessionCleanup: bgBank.lastSessionCleanup || null,
          lastSessionId: bgBank.lastSessionId || null,
        },
        universities: {
          count: (uniBgBank.photos || []).length,
          maxBank: uniBgBank.maxBank || 50,
          lastSessionCleanup: uniBgBank.lastSessionCleanup || null,
          lastSessionId: uniBgBank.lastSessionId || null,
        },
        pomo: {
          count: (pomoBgBank.photos || []).length,
          maxBank: pomoBgBank.maxBank || 50,
          lastSessionCleanup: pomoBgBank.lastSessionCleanup || null,
          lastSessionId: pomoBgBank.lastSessionId || null,
        },
        nations: {
          count: (nationsBgBank.photos || []).length,
          maxBank: nationsBgBank.maxBank || 50,
          lastSessionCleanup: nationsBgBank.lastSessionCleanup || null,
          lastSessionId: nationsBgBank.lastSessionId || null,
        },
        // rétrocompat résumé plat = paysages mât
        count: (bgBank.photos || []).length,
        maxBank: bgBank.maxBank || 50,
        lastSessionCleanup: bgBank.lastSessionCleanup || null,
        lastSessionId: bgBank.lastSessionId || null,
      },
      radios: {
        listed: radios.length,
        withStream: radiosWithStream.length,
        candidates: (radioCandidates.candidates || []).length,
      },
      coverage: {
        universitiesWithNews: insts.filter((i) => i.type === 'universite' && isNewsCovered(i)).length,
        universitiesTotal: insts.filter((i) => i.type === 'universite').length,
        institutionsWithRadio: insts.filter((i) => isRadioCovered(i)).length,
      },
    },
    gaps: {
      newsUniversities: gapsNews.slice(0, 15),
      newsUniversitiesRemaining: Math.max(0, gapsNews.length - 15),
      radios: gapsRadios.length,
    },
    alerts,
  };
}

async function main() {
  console.log('LE RADAR Maintenance Orchestrator');
  console.log('================================\n');
  console.log(`Mode: ${doUpdate ? 'UPDATE' : 'dry-run'}${skipInstitutions ? ' (skip institutions)' : ''}`);

  const flag = doUpdate ? '--update' : '';
  const steps = [];

  const pipeline = [
    ...(skipInstitutions ? [] : [['Institutions catalogue', `node scripts/update-institutions.js ${flag}`.trim()]]),
    ['Media scanner (gaps)', `node scripts/scan-media.js ${flag}`.trim()],
    ['News source maintainer', `node scripts/discover-news-sources.js ${flag}`.trim()],
    ['Stream tracker + radio promotion', `node scripts/discover-streams.js ${flag}`.trim()],
    ['Radio now-playing metadata', `node scripts/fetch-radio-nowplaying.js ${flag}`.trim()],
    ['RSEQ sports league catalog', `node scripts/discover-sports.js ${flag}`.trim()],
    ['RSEQ sports results', `node scripts/fetch-sports.js ${flag}`.trim()],
    // Après le now-playing : le rapport de dérive est lu par buildStatus() plus
    // bas, il doit donc être écrit dans la même passe.
    ['Radio schedule drift', `node scripts/detect-schedule-drift.js ${flag}`.trim()],
    ['News sources verify', 'node scripts/verify-news-sources.js'],
    ['News aggregator', `node scripts/fetch-news.js ${flag}`.trim()],
    ['Author QC', `node scripts/verify-authors.js ${flag}`.trim()],
    ['Lead excerpt enrichment', `node scripts/enrich-lead-excerpts.js ${flag}`.trim()],
    ['Lead image QC', `node scripts/ensure-lead-images.js ${flag}`.trim()],
    ['Photo credit QC', `node scripts/verify-photo-credits.js ${flag}`.trim()],
    // Wallpaper compartimenté + nations partagée (mât + pomo)
    ['Quebec masthead landscape bank', `node scripts/maintain-quebec-backgrounds.js --profile masthead ${flag}`.trim()],
    ['Quebec masthead university bank', `node scripts/maintain-quebec-backgrounds.js --profile universities ${flag}`.trim()],
    ['Quebec pomo landscape bank', `node scripts/maintain-quebec-backgrounds.js --profile pomo ${flag}`.trim()],
    ['Quebec nations/Inuit bank (shared)', `node scripts/maintain-quebec-backgrounds.js --profile nations ${flag}`.trim()],
    // Audit pixel des banques — le seul contrôle qui REGARDE les images.
    // Les étapes ci-dessus ne filtrent que sur le titre, la résolution et le
    // ratio : une église intitulée « Vieux-Québec en hiver » leur échappe.
    // Rapport seulement (jamais bloquant) : les seuils sur-déclenchent encore
    // (54 à 79 % de rejets sur des banques curées, mesuré le 2026-07-26), donc
    // on publie le constat sans purger automatiquement. Voir docs/maintenance.md.
    // ~3 min pour 127 vignettes de 900 px — acceptable en hebdomadaire, pas par push.
    ['Quebec photo bank pixel audit (report)', 'python3 scripts/audit-quebec-backgrounds.py --width 900 --delay 0.5 || true'],
    ['Social feed', `node scripts/fetch-social.js ${flag}`.trim()],
    ['RSS export', `node scripts/generate-feed.js ${flag}`.trim()],
  ];

  for (const [label, cmd] of pipeline) {
    const result = runStep(label, cmd);
    steps.push({ label, ...result });
    // Non-fatal: keep going so one flaky network doesn't block the rest
  }

  const status = buildStatus(steps);

  console.log(`\n${'═'.repeat(60)}`);
  console.log('BOT STATUS SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Healthy: ${status.healthy ? '✓' : '✗'}`);
  console.log(`News: ${status.summary.news.active} active feeds, ${status.summary.news.articles} articles`);
  console.log(`Radios: ${status.summary.radios.withStream}/${status.summary.radios.listed} with direct stream`);
  console.log(`Coverage: ${status.summary.coverage.universitiesWithNews}/${status.summary.coverage.universitiesTotal} universities with news`);
  if (status.alerts.length) {
    console.log(`\nAlerts (${status.alerts.length}):`);
    status.alerts.forEach((a) => console.log(`  [${a.level}] ${a.message}`));
  }

  if (doUpdate) {
    fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2) + '\n');
    console.log(`\n✅ Wrote ${STATUS_PATH}`);
  }

  if (status.needsHuman) process.exit(2);
  if (!status.healthy) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
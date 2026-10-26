/**
 * Surveillance automatique des sources news (update-news.yml).
 *
 * Trois signaux, une seule issue bot permanente :
 *  a) flux en échec plusieurs collectes de suite (_failCount ≥ FAIL_STREAK) ;
 *  b) source active muette bien au-delà de son rythme habituel — les jours
 *     de congé (été, Fêtes, semaines de lecture) ne comptent pas ;
 *  c) taux d'échecs anormal du miroir d'images.
 *
 * Une source muette depuis plus de DORMANT_DAYS (calendrier) passe « en
 * sommeil » (_dormantSince) : plus d'alerte, mais fetch-news continue de la
 * sonder et applyFetchRegistryUpdate la réveille dès un article plus récent.
 */
'use strict';

const DAY_MS = 86400000;
const FAIL_STREAK = 3;
const DORMANT_DAYS = 120;
const MIN_SILENT_SCHOOL_DAYS = 21;
const MAX_SILENT_SCHOOL_DAYS = 60;
const CADENCE_FACTOR = 4;
const IMAGE_FAIL_RATE = 0.1;
const IMAGE_FAIL_MIN = 5;

/** Congés scolaires québécois (mois 1–12, bornes incluses). */
const BREAKS = [
  [[5, 1], [9, 7]],     // été
  [[12, 15], [12, 31]], // Fêtes
  [[1, 1], [1, 15]],
  [[2, 23], [3, 8]],    // semaine de lecture hiver
  [[10, 13], [10, 31]], // semaine de lecture / mi-session automne
];

function isBreakDay(d) {
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const v = m * 100 + day;
  return BREAKS.some(([[m1, d1], [m2, d2]]) => v >= m1 * 100 + d1 && v <= m2 * 100 + d2);
}

/** Jours de classe (hors congés) écoulés entre fromMs et toMs. */
function schoolDaysBetween(fromMs, toMs) {
  if (!Number.isFinite(fromMs) || toMs <= fromMs) return 0;
  let n = 0;
  for (let t = fromMs + DAY_MS; t <= toMs; t += DAY_MS) {
    if (!isBreakDay(new Date(t))) n += 1;
  }
  return n;
}

/** Écart médian (en jours de classe) entre articles d'une source. */
function medianSchoolGap(dates = []) {
  const ms = [...new Set(dates.map((d) => Date.parse(d)).filter(Number.isFinite))].sort((a, b) => a - b);
  if (ms.length < 4) return null;
  const gaps = [];
  for (let i = 1; i < ms.length; i += 1) gaps.push(schoolDaysBetween(ms[i - 1], ms[i]));
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

function silenceThreshold(medianGap) {
  const base = medianGap == null ? MIN_SILENT_SCHOOL_DAYS : medianGap * CADENCE_FACTOR;
  return Math.min(MAX_SILENT_SCHOOL_DAYS, Math.max(MIN_SILENT_SCHOOL_DAYS, base));
}

/**
 * Évalue le registre. Mute `registry` (champ _dormantSince) et retourne
 * { problems: [...], dormant: [...] }.
 */
function evaluateHealth({ registry, datesBySource = {}, imageStats = null, imageHealth = null, now = new Date() }) {
  const nowMs = now.getTime();
  const problems = [];
  const dormant = [];
  for (const src of registry.active || []) {
    if (!src || !src.name || !src.url) continue;
    const fails = src._failCount || 0;
    if (fails >= FAIL_STREAK) {
      problems.push({ kind: 'feed', source: src.name, detail: `${fails} collectes de suite en échec (${src.url})` });
    }
    const lastMs = Date.parse(src._lastItemDate || '');
    if (!Number.isFinite(lastMs)) continue;
    const ageDays = (nowMs - lastMs) / DAY_MS;
    if (ageDays > DORMANT_DAYS) {
      if (!src._dormantSince) src._dormantSince = now.toISOString();
      dormant.push({ source: src.name, lastItemDate: src._lastItemDate });
      continue;
    }
    if (src._dormantSince) delete src._dormantSince;
    const silent = schoolDaysBetween(lastMs, nowMs);
    const limit = silenceThreshold(medianSchoolGap(datesBySource[src.name] || []));
    if (fails < FAIL_STREAK && silent > limit) {
      problems.push({
        kind: 'silent',
        source: src.name,
        detail: `aucun article depuis ${src._lastItemDate.slice(0, 10)} (${silent} jours de classe, seuil ${limit})`,
      });
    }
  }
  if (imageStats && imageStats.targets > 0) {
    const rate = imageStats.failed / imageStats.targets;
    if (imageStats.failed >= IMAGE_FAIL_MIN && rate > IMAGE_FAIL_RATE) {
      const reasons = Object.entries(imageStats.failReasons || {}).map(([k, v]) => `${k} ×${v}`).join(', ');
      problems.push({
        kind: 'images',
        source: 'miroir d’images',
        detail: `${imageStats.failed}/${imageStats.targets} échecs (${Math.round(rate * 100)} %)${reasons ? ` — ${reasons}` : ''}`,
      });
    }
  }
  // Balayage des images des cartes (check-news-images.js) : toute image
  // encore cassée après réparation automatique (hors 429/5xx passagers).
  if (imageHealth && Array.isArray(imageHealth.items)) {
    const persistent = imageHealth.items.filter((i) => !i.transient && i.field !== 'stockImage-mirror');
    if (persistent.length) {
      problems.push({
        kind: 'images-cartes',
        source: 'images des cartes',
        detail: `${persistent.length} image(s) cassée(s) : ${persistent.slice(0, 5).map((i) => `${i.source} [${i.status}] ${i.url}`).join(' ; ')}`,
      });
    }
  }
  return { problems, dormant };
}

const ISSUE_TITLE = 'Santé des sources news (bot)';

function renderIssueBody({ problems, dormant }, now = new Date()) {
  const lines = [
    `Mis à jour automatiquement par update-news.yml — ${now.toISOString()}.`,
    'Cette issue se ferme seule quand tout est réglé.',
    '',
    '## Problèmes',
    ...problems.map((p) => `- **${p.source}** (${p.kind}) : ${p.detail}`),
  ];
  if (dormant.length) {
    lines.push('', '## En sommeil (sondées à chaque collecte, réactivées automatiquement)');
    for (const d of dormant) lines.push(`- ${d.source} — dernier article ${String(d.lastItemDate).slice(0, 10)}`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Réveil : appelé après chaque collecte réussie. Un article de moins de
 * DORMANT_DAYS retire _dormantSince ; sinon la source reste « stale ».
 */
function wakeIfRepublished(src, now = new Date()) {
  if (!src || !src._dormantSince) return false;
  const last = Date.parse(src._lastItemDate || '');
  if (Number.isFinite(last) && (now.getTime() - last) / DAY_MS <= DORMANT_DAYS) {
    delete src._dormantSince;
    return true;
  }
  return false;
}

module.exports = {
  FAIL_STREAK,
  DORMANT_DAYS,
  ISSUE_TITLE,
  isBreakDay,
  schoolDaysBetween,
  medianSchoolGap,
  silenceThreshold,
  evaluateHealth,
  renderIssueBody,
  wakeIfRepublished,
};

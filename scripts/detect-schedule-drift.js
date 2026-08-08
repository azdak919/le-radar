#!/usr/bin/env node
/**
 * Bot dérive des horaires — la grille publiée décrit-elle encore l'antenne ?
 *
 * Pour chaque poste du seed, re-collige la grille depuis ses sources et la
 * compare à `radio-schedules.json`. Un écart de quelques créneaux = une
 * émission spéciale / hors programmation (le cas CHYZ un soir de match) ; un
 * écart massif = une grille refaite (rentrée).
 *
 * Ce bot **ne corrige rien** — l'affichage est déjà rattrapé aux 30 min par
 * l'adaptateur `schedule-live` de fetch-radio-nowplaying.js. Il rend le
 * phénomène visible : sans lui, une station qui sort de sa grille sans qu'on
 * la voie reste un angle mort, et c'est exactement ainsi que le bug CHYZ a été
 * découvert — sur une capture d'écran d'un humain.
 *
 *   node scripts/detect-schedule-drift.js            # dry-run
 *   node scripts/detect-schedule-drift.js --update   # écrit radio-schedule-drift.json
 */

const fs = require('fs');
const path = require('path');
const { collateStationGrid, DEFAULT_TZ } = require('./radio-schedule-lib');
const { classifyDrift, summarizeDrift, OVERHAUL_RATIO } = require('./schedule-drift-lib');

const ROOT = path.join(__dirname, '..');
const RADIOS_PATH = path.join(ROOT, 'radios.json');
const SEED_PATH = path.join(ROOT, 'radio-schedules.seed.json');
const SCHEDULES_PATH = path.join(ROOT, 'radio-schedules.json');
const OUT_PATH = path.join(ROOT, 'radio-schedule-drift.json');
const doUpdate = process.argv.includes('--update');

/** Créneaux listés dans le rapport avant de basculer en « … et N autres ». */
const MAX_LISTED = 6;

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

const ICONS = { stable: '·', drift: '⚑', overhaul: '⚠', unreachable: '?' };

function trim(list) {
  if (list.length <= MAX_LISTED) return list;
  return [...list.slice(0, MAX_LISTED), `… et ${list.length - MAX_LISTED} autre(s)`];
}

async function main() {
  const radios = readJson(RADIOS_PATH, []);
  const seed = readJson(SEED_PATH, { stations: {} });
  const published = readJson(SCHEDULES_PATH, { stations: {} });
  const timezone = seed.timezone || published.timezone || DEFAULT_TZ;

  const stations = [];
  console.log('Dérive des grilles horaires — grille publiée vs page relue à l’instant\n');

  for (const radio of radios) {
    const cfg = seed.stations?.[radio.id];
    // Sans source, rien à relire : une grille manuelle ne dérive pas toute seule.
    if (!cfg || !Array.isArray(cfg.sources) || !cfg.sources.length) continue;

    let fresh = [];
    try {
      ({ grid: fresh } = await collateStationGrid(cfg, {
        onError: (src, err) => console.warn(`  ! ${radio.id} source ${src.type}: ${err.message}`),
      }));
    } catch (err) {
      console.warn(`  ! ${radio.id}: ${err.message}`);
      fresh = [];
    }

    const entry = classifyDrift(radio.id, published.stations?.[radio.id]?.grid || [], fresh);
    stations.push(entry);

    console.log(
      `  ${ICONS[entry.status]} ${radio.id.padEnd(6)} ${entry.status.padEnd(11)}`
      + ` publié=${String(entry.published).padStart(3)} frais=${String(entry.fresh).padStart(3)}`
      + `${entry.changed ? ` (+${entry.added.length} −${entry.removed.length})` : ''}`,
    );
    for (const line of trim(entry.added)) console.log(`      + ${line}`);
    for (const line of trim(entry.removed)) console.log(`      − ${line}`);
  }

  const summary = summarizeDrift(stations);
  const out = {
    checkedAt: new Date().toISOString(),
    timezone,
    overhaulRatio: OVERHAUL_RATIO,
    summary,
    stations,
  };

  console.log(
    `\n${summary.checked} poste(s) vérifié(s) — ${summary.stable} stable(s),`
    + ` ${summary.drift.length} hors grille, ${summary.overhaul.length} refonte(s),`
    + ` ${summary.unreachable.length} injoignable(s).`,
  );
  if (summary.drift.length) {
    console.log(
      `⚑ Hors programmation : ${summary.drift.join(', ')}`
      + ' — rattrapé à l’antenne par schedule-live, rien à faire.',
    );
  }
  if (summary.overhaul.length) {
    console.log(
      `⚠ Grille(s) refaite(s) : ${summary.overhaul.join(', ')}`
      + ' — relancer « node scripts/fetch-radio-schedules.js --update ».',
    );
  }

  if (doUpdate) {
    fs.writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`Écrit ${OUT_PATH}`);
  } else {
    console.log('Dry-run — utilisez --update pour écrire radio-schedule-drift.json');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

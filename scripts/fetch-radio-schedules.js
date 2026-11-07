#!/usr/bin/env node
/**
 * Bot horaires — collige la grille hebdomadaire de chaque poste depuis
 * plusieurs sources (Airtime/LibreTime + grilles manuelles du seed) et écrit
 * radio-schedules.json. Le site y lit l'émission en cours selon l'heure.
 *
 * CHOQ publie des épisodes datés en cours de semaine : le workflow tourne
 * chaque jour (no-op s’il n’y a rien de nouveau).
 *
 *   node scripts/fetch-radio-schedules.js            # dry-run
 *   node scripts/fetch-radio-schedules.js --update   # écrit radio-schedules.json
 */

const fs = require('fs');
const path = require('path');
const {
  collateStationGrid,
  gridCoverage,
  COVERAGE_FLOOR,
  stripTransientFlags,
  selectScheduleGrid,
  DEFAULT_TZ,
} = require('./radio-schedule-lib');

const ROOT = path.join(__dirname, '..');
const RADIOS_PATH = path.join(ROOT, 'radios.json');
const SEED_PATH = path.join(ROOT, 'radio-schedules.seed.json');
const OUT_PATH = path.join(ROOT, 'radio-schedules.json');
const doUpdate = process.argv.includes('--update');
/** Passe outre le garde-fou d'effondrement (refonte de grille légitime). */
const doForce = process.argv.includes('--force');

/**
 * En deçà de cette proportion de l'ancienne grille, on refuse la nouvelle.
 *
 * Le risque n'est pas qu'une source tombe — ce cas est déjà couvert — mais
 * qu'elle réponde 200 avec une page refondue que le parseur ne comprend plus :
 * on écraserait alors 102 créneaux justes par 3. Une vraie refonte de grille
 * (rentrée) se passe avec `--force`.
 */
// Le seuil 0.6 est appliqué par selectScheduleGrid, sauf ancienne grille invraisemblable.

function belowCoverageFloor(id, nextGrid, prevGrid) {
  const floor = COVERAGE_FLOOR[id];
  if (!floor) return false;
  const next = gridCoverage(nextGrid).weekPercent;
  const prev = gridCoverage(prevGrid).weekPercent;
  return next < floor && prev >= floor;
}

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Lundi de la semaine Québec associée à une collecte effectivement réussie. */
function weekStartIso(value, timeZone) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type) => Number(parts.find((entry) => entry.type === type)?.value);
  const local = new Date(Date.UTC(part('year'), part('month') - 1, part('day'), 12));
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  return local.toISOString().slice(0, 10);
}

async function main() {
  const radios = readJson(RADIOS_PATH, []);
  const seed = readJson(SEED_PATH, { stations: {} });
  const prev = readJson(OUT_PATH, { stations: {} });
  const timezone = seed.timezone || DEFAULT_TZ;
  const now = new Date().toISOString();

  const stations = {};
  const coverage = [];
  let totalSlots = 0;

  for (const radio of radios) {
    const cfg = seed.stations?.[radio.id];
    if (!cfg) continue; // pas de config horaire pour ce poste

    const { grid, sources } = await collateStationGrid(cfg, {
      onError: (src, err) =>
        console.warn(`  ! ${radio.id} source ${src.type}: ${err.message}`),
    });

    const previous = prev.stations?.[radio.id];
    if (!grid.length && !previous?.grid?.length) {
      if (!cfg._nowPlayingOnly) console.warn(`  ! ${radio.id}: aucune grille vérifiable`);
      continue;
    }
    if (belowCoverageFloor(radio.id, grid, previous?.grid)) {
      console.warn(`  ⚠ ${radio.id}: couverture sous le plancher connu`);
    }
    const selected = selectScheduleGrid({
      grid, sources, previous, now, weekOf: weekStartIso(now, timezone),
      floor: COVERAGE_FLOOR[radio.id], force: doForce,
    });
    const finalGrid = selected.grid;
    const finalSources = selected.sources || [];
    const carried = Boolean(selected.unverified);
    if (carried) console.warn(`  ⚠ ${radio.id}: ${selected.retainedReason} — grille non vérifiée conservée`);
    stations[radio.id] = {
      ...selected,
      id: radio.id,
      name: radio.name,
      verifiedWeekOf: selected.verifiedWeekOf || weekStartIso(selected.checkedAt, timezone),
      coveragePercent: gridCoverage(finalGrid).weekPercent,
      grid: stripTransientFlags(finalGrid),
    };
    totalSlots += finalGrid.length;
    const cov = gridCoverage(finalGrid);
    console.log(
      `  ✓ ${radio.id}: ${finalGrid.length} plages, ${cov.weekPercent} % de la semaine`
      + ` [${finalSources.join(', ') || '—'}]${carried ? ' (conservé)' : ''}`,
    );
    coverage.push({ id: radio.id, ...cov });
  }

  const out = { updatedAt: now, timezone, stations };

  console.log(
    `\n${Object.keys(stations).length} postes avec horaire, ${totalSlots} plages au total.`,
  );

  const playable = radios.filter((r) => r.stream);
  const uncovered = [];
  console.log('\n── Couverture postes natifs ──');
  for (const radio of playable) {
    const cfg = seed.stations?.[radio.id];
    if (!cfg) {
      uncovered.push(radio.id);
      console.log(`  ? ${radio.id}: absent du seed — non mis à jour par ce bot`);
    } else if (cfg._nowPlayingOnly) {
      console.log(`  ○ ${radio.id}: now-playing seulement (fetch-radio-nowplaying.js)`);
    } else if (!stations[radio.id] && !(cfg.grid || []).length && !(cfg.sources || []).length) {
      uncovered.push(radio.id);
      console.log(`  ! ${radio.id}: seed sans source ni grille manuelle`);
    }
  }
  if (uncovered.length) {
    console.warn(`\n⚠ ${uncovered.length} poste(s) natif(s) sans horaire : ${uncovered.join(', ')}`);
  }

  // Couverture : une grille peut être « à jour » et pourtant ne décrire qu'un
  // huitième de la semaine. C'est le cas de CHOQ et CHYZ, dont les sites ne
  // publient que les émissions parlées — le repli est la grille manuelle du
  // seed, qui est fusionnée sans jamais être écrasée par les sources.
  if (coverage.length) {
    const DAYS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
    console.log('\n── Couverture des grilles ──');
    for (const c of coverage.sort((a, b) => a.weekPercent - b.weekPercent)) {
      const thin = c.perDay
        .map((min, day) => ({ day, pct: Math.round((min / 1440) * 100) }))
        .filter((d) => d.pct < 50)
        .map((d) => `${DAYS[d.day]} ${d.pct}%`);
      const flag = c.weekPercent < 50 ? '⚠' : ' ';
      console.log(
        `  ${flag} ${c.id.padEnd(6)} ${String(c.weekPercent).padStart(3)} % de la semaine`
        + `${thin.length ? ` — jours creux : ${thin.join(', ')}` : ''}`,
      );
    }
  }

  if (doUpdate) {
    fs.writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`Écrit ${OUT_PATH}`);
  } else {
    console.log('Dry-run — utilisez --update pour écrire radio-schedules.json');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

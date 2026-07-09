#!/usr/bin/env node
/**
 * Bot « à l'antenne » / « à venir » — pour chaque poste natif (radios.json).
 *
 * Sources (par poste, via radio-nowplaying-lib) :
 *   1. API live déclarées (_nowPlayingSources / _nowPlayingApi) ou auto (Airtime)
 *   2. Grille hebdo colligée (radio-schedules.json) → current + next
 *   3. Métadonnées ICY du flux
 *
 * Sortie : radio-nowplaying.json
 *   stations[id].current  { title, host?, start?, end?, source }
 *   stations[id].next     { title, host?, start?, end?, source }
 *   stations[id].track    piste ICY (sous-titre) si distincte
 *   + showTitle / host / source (rétrocompat)
 *
 * Tourne aux 30 min (workflow update-radio-nowplaying.yml).
 * Les grilles brutes sont rafraîchies aux 2 semaines (fetch-radio-schedules.js).
 *
 *   node scripts/fetch-radio-nowplaying.js
 *   node scripts/fetch-radio-nowplaying.js --update
 */

const fs = require('fs');
const path = require('path');
const {
  probeStationOnAir,
  inferNowPlayingSources,
  DEFAULT_TZ,
} = require('./radio-nowplaying-lib');

const ROOT = path.join(__dirname, '..');
const RADIOS_PATH = path.join(ROOT, 'radios.json');
const SCHEDULES_PATH = path.join(ROOT, 'radio-schedules.json');
const OUT_PATH = path.join(ROOT, 'radio-nowplaying.json');
const doUpdate = process.argv.includes('--update');

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatShow(show) {
  if (!show?.title) return '—';
  const range = show.start && show.end ? ` ${show.start}–${show.end}` : (show.start ? ` ${show.start}` : '');
  return `${show.title}${range} [${show.source || '?'}]`;
}

async function main() {
  const radios = readJson(RADIOS_PATH, []);
  const schedules = readJson(SCHEDULES_PATH, { stations: {}, timezone: DEFAULT_TZ });
  const timeZone = schedules.timezone || DEFAULT_TZ;
  const playable = radios.filter((r) => r.stream);
  const stations = {};
  let withCurrent = 0;
  let withNext = 0;

  console.log(`Sondage de ${playable.length} postes (fuseau ${timeZone})…\n`);

  for (const radio of playable) {
    const inferred = inferNowPlayingSources(radio)
      .map((s) => s.type + (s.base || s.url ? `:${s.base || s.url}` : ''))
      .join(', ');
    const hit = await probeStationOnAir(radio, { schedules, timeZone });

    stations[radio.id] = {
      id: hit.id,
      name: hit.name,
      current: hit.current,
      next: hit.next,
      track: hit.track || '',
      showTitle: hit.showTitle || '',
      host: hit.host || '',
      source: hit.source,
      sources: hit.sources || [],
      clientPoll: hit.clientPoll || null,
      checkedAt: hit.checkedAt,
    };

    if (hit.current?.title) withCurrent += 1;
    if (hit.next?.title) withNext += 1;

    const curLine = formatShow(hit.current);
    const nextLine = formatShow(hit.next);
    const trackBit = hit.track ? `  ♪ ${hit.track}` : '';
    console.log(`  ${hit.current ? '✓' : '·'} ${radio.id}`);
    console.log(`      sources: ${inferred || '(aucune)'}`);
    console.log(`      now:  ${curLine}${trackBit}`);
    console.log(`      next: ${nextLine}`);

    await sleep(350);
  }

  const out = {
    updatedAt: new Date().toISOString(),
    timezone: timeZone,
    stations,
  };

  console.log(`\n${withCurrent}/${playable.length} en cours · ${withNext}/${playable.length} à venir.`);

  if (doUpdate) {
    fs.writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`Écrit ${OUT_PATH}`);
  } else {
    console.log('Dry-run — utilisez --update pour écrire radio-nowplaying.json');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

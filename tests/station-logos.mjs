#!/usr/bin/env node
// Chaque station de radios.json doit avoir un logo OFFICIEL adapté, documenté dans
// data/station-logos-sources.json (URL source + date), présent en 512, 192 et en drawable Android.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const json = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const has = (p) => existsSync(new URL(p, root));
const radios = json('radios.json');
const sources = new Map(json('data/station-logos-sources.json').stations.map((s) => [s.id, s]));

for (const radio of radios) {
  const src = sources.get(radio.id);
  assert.ok(src, `${radio.id} : absent de data/station-logos-sources.json`);
  assert.match(src.sourceUrl, /^https:\/\//, `${radio.id} : sourceUrl manquante`);
  assert.match(src.retrieved, /^\d{4}-\d{2}-\d{2}$/, `${radio.id} : date de récupération manquante`);
  assert.ok(has(src.original), `${radio.id} : original ${src.original} introuvable`);
  assert.equal(radio.logo, `assets/logos/stations/${radio.id}-512.png`, `${radio.id} : radios.json doit pointer vers le logo officiel`);
  for (const p of [`assets/logos/stations/${radio.id}-512.png`, `assets/logos/stations/${radio.id}-192.png`,
    `android/app/src/main/res/drawable-nodpi/station_${radio.id}.png`]) {
    assert.ok(has(p), `${radio.id} : ${p} manquant`);
  }
}
// Plus aucun logo généré (anciens *-logo.jpg).
const leftovers = readdirSync(new URL('assets/logos/', root)).filter((f) => /\.jpe?g$/i.test(f));
assert.deepEqual(leftovers, [], `logos générés restants : ${leftovers.join(', ')}`);
console.log(`station-logos: ${radios.length} stations avec logo officiel documenté`);

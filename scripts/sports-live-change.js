#!/usr/bin/env node
/**
 * Boucle « Update Student Sports (live) » : faut-il pousser cette passe ?
 *
 * Compare les fichiers sports du dernier commit (HEAD) à la copie de travail
 * et répond sur stdout :
 *   urgent — un pointage, un résultat ou un état (En cours / Final / en
 *            attente de résultats) a changé : pousser tout de suite ;
 *   data   — autre vrai changement (calendrier, fenêtre live, équipes) :
 *            pousser au plus une fois toutes les 15 min ;
 *   none   — seuls des horodatages ont bougé : ne pas pousser.
 *
 * Avant le 26 oct. 2026, chaque passe (3 min) poussait le tampon `updated`
 * même sans changement : ~60 commits/jour, autant de pages-build.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const SportsPayload = require('./sports-payload-lib');

const ROOT = path.join(__dirname, '..');
const FILES = ['sports.json', 'sports-masthead.json', 'sports-live-window.json'];
// Clés purement horodatées : leur changement seul ne justifie pas un push.
const VOLATILE = /^(updated|fetchedAt|generatedAt|checkedAt|referenceDate|lastChecked|liveCheckedAt|at)$/;
// Clés qui portent un pointage ou un état visible tout de suite.
const URGENT = /score|result|status|live|final|awaiting|notScored|period|clock|inProgress|state/i;

function load(text) {
  try {
    const raw = JSON.parse(text);
    return (SportsPayload.unpackSportsPayload && SportsPayload.unpackSportsPayload(raw)) || raw;
  } catch { return null; }
}

function diff(a, b, keyPath, out) {
  if (a === b) return;
  const ta = Array.isArray(a) ? 'array' : typeof a;
  const tb = Array.isArray(b) ? 'array' : typeof b;
  if (ta !== tb || ta !== 'object' && ta !== 'array' || a === null || b === null) {
    out.push(keyPath);
    return;
  }
  if (ta === 'array') {
    // Les matchs ont un id : on compare par id pour ignorer un simple ré-ordre.
    const byId = (arr) => (arr.every((x) => x && typeof x === 'object' && x.id != null) ? new Map(arr.map((x) => [String(x.id), x])) : null);
    const ma = byId(a); const mb = byId(b);
    if (ma && mb) {
      for (const k of new Set([...ma.keys(), ...mb.keys()])) diff(ma.get(k), mb.get(k), [...keyPath, `#${k}`], out);
      return;
    }
    if (a.length !== b.length) { out.push(keyPath); return; }
    a.forEach((x, i) => diff(x, b[i], [...keyPath, String(i)], out));
    return;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (VOLATILE.test(k)) continue;
    diff(a[k], b[k], [...keyPath, k], out);
  }
}

function classify(pairs) {
  const changed = [];
  for (const [before, after] of pairs) diff(before, after, [], changed);
  if (!changed.length) return { kind: 'none', changed };
  const urgent = changed.some((p) => p.some((k) => URGENT.test(k)) || p.length === 0);
  return { kind: urgent ? 'urgent' : 'data', changed };
}

function headText(file) {
  try { return execFileSync('git', ['show', `HEAD:${file}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }); } catch { return ''; }
}

if (require.main === module) {
  const pairs = FILES.map((f) => {
    let now = '';
    try { now = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch {}
    return [load(headText(f)), load(now)];
  });
  const { kind, changed } = classify(pairs);
  if (process.argv.includes('--verbose')) console.error(changed.slice(0, 10).map((p) => p.join('.')).join('\n'));
  process.stdout.write(`${kind}\n`);
}

module.exports = { classify };
